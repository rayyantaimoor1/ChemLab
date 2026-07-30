/**
 * bench.js — draws the containers on the bench, accepts a reagent dropped
 * from the shelf, a container dragged onto another to pour, tool dips, and
 * the burner controls; hands off to effects.js whenever something visible
 * should happen.
 *
 * This module reads container state exactly as UI.md section 1 shapes it and
 * dispatches addChemical(containerId, chemicalId, amountMl) and
 * pour(fromId, toId, amountMl) - the fixed names and argument order from
 * that section. It never works out what adding a chemical or pouring does;
 * that answer comes back through getState() and each dispatch call's own
 * result after the engine has already decided it. Reading engine.getChemical
 * to find a reaction product's curated colour (precipitateColorFor below) is
 * the same read-only access shelf.js already uses to list reagents - not a
 * chemistry decision, just looking up an answer src/core/ already worked out.
 *
 * WHY THE DOM IS BUILT ONCE, NOT REBUILT EVERY RENDER
 * The Phase 3 placeholder rebuilt every container's markup from scratch on
 * every state change (root.innerHTML = ''). That is fine for plain text, but
 * an animation needs a stable element to animate FROM its old appearance TO
 * its new one - a torn-down-and-recreated element has no "old appearance" to
 * animate from, only the new one, so the interpolation effects.js is meant
 * to play would never be visible. Each container's markup is now built once
 * (ensureContainerRefs) and every later render only updates the pieces that
 * changed, in place.
 */

import { engine } from '../core/engine.js';
import {
  crossfadeColor,
  riseLiquidLevel,
  playBubbles,
  playGasEvolution,
  playPrecipitate,
  playPourStream,
  tickNumber,
  setFlameLevel,
} from './effects.js';

const HEAT_LEVELS = [0, 1, 2, 3];

export function mountBench({ root, getState, dispatch, subscribe }) {
  /** @type {Map<string, object>} containerId -> the DOM refs built for it */
  const containerEls = new Map();

  const containersWrapper = document.createElement('div');
  containersWrapper.className = 'containers';

  const heading = document.createElement('h2');
  heading.textContent = 'Bench';

  root.appendChild(heading);
  root.appendChild(containersWrapper);
  // The tool tray has no animation to preserve across renders, so it is
  // simple to rebuild wholesale each time - see renderToolTray.
  const toolTrayHost = document.createElement('div');
  root.appendChild(toolTrayHost);

  function render() {
    const state = getState();

    for (const container of state.containers) {
      const refs = ensureContainerRefs(container);
      updateContainer(refs, container, state);
    }

    toolTrayHost.innerHTML = '';
    toolTrayHost.appendChild(renderToolTray(state));
  }

  /* ------------------------------------------------------------------ *
   * Building each container's markup once
   * ------------------------------------------------------------------ */

  function ensureContainerRefs(container) {
    const existing = containerEls.get(container.id);
    if (existing) return existing;

    const el = document.createElement('div');
    el.className = 'container';
    el.dataset.containerId = container.id;
    el.draggable = true; // a container can itself be dragged onto another one, to pour

    const title = document.createElement('h3');
    title.textContent = `${container.type.replace('_', ' ')} — ${container.id}`;
    el.appendChild(title);

    // The vessel: a bounded box holding the liquid crossfade layers and the
    // particle layers effects.js draws into. Purely visual - nothing here
    // is read back as state.
    const vessel = document.createElement('div');
    vessel.className = 'vessel';

    const liquidBase = document.createElement('div');
    liquidBase.className = 'vessel__liquid vessel__liquid--base';
    const liquidIncoming = document.createElement('div');
    liquidIncoming.className = 'vessel__liquid vessel__liquid--incoming';
    const precipitateLayer = document.createElement('div');
    precipitateLayer.className = 'vessel__layer vessel__precipitate';
    const bubbleLayer = document.createElement('div');
    bubbleLayer.className = 'vessel__layer vessel__bubbles';
    const gasLayer = document.createElement('div');
    gasLayer.className = 'vessel__layer vessel__gas';
    const pourMouth = document.createElement('div');
    pourMouth.className = 'vessel__layer vessel__mouth';

    vessel.append(liquidBase, liquidIncoming, precipitateLayer, bubbleLayer, gasLayer, pourMouth);
    el.appendChild(vessel);

    const contentsList = document.createElement('ul');
    contentsList.className = 'container__contents';
    el.appendChild(contentsList);

    // Separate spans for the three numbers, per UI.md section 5: colour (and
    // here, values) is always paired with visible text, and tickNumber needs
    // an element of its own to animate rather than a shared text node.
    const readout = document.createElement('p');
    readout.className = 'container__readout';
    const volumeEl = document.createElement('span');
    const tempEl = document.createElement('span');
    const phEl = document.createElement('span');
    readout.append('Volume: ', volumeEl, ' mL · Temp: ', tempEl, ' °C · pH: ', phEl);
    el.appendChild(readout);

    const colorLabel = document.createElement('p');
    colorLabel.className = 'container__colour-label';
    el.appendChild(colorLabel);

    // Burner: a flame indicator plus the level control. setHeat is dispatched
    // straight from here; there was previously no UI path to it at all.
    const heatSection = document.createElement('div');
    heatSection.className = 'container__heat';
    const flame = document.createElement('span');
    flame.className = 'fx-flame';
    heatSection.appendChild(flame);
    const heatButtons = HEAT_LEVELS.map((level) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'heat-level';
      button.dataset.level = String(level);
      button.textContent = level === 0 ? 'Off' : String(level);
      button.addEventListener('click', () => {
        withEffects(container.id, () => dispatch.setHeat(container.id, level));
      });
      heatSection.appendChild(button);
      return button;
    });
    el.appendChild(heatSection);

    const dip = document.createElement('button');
    dip.type = 'button';
    dip.className = 'container__dip';
    dip.textContent = 'Dip';
    dip.addEventListener('click', () => {
      const state = getState();
      if (!state.selectedToolId) return;
      dispatch.dipTool(state.selectedToolId, container.id);
    });
    el.appendChild(dip);

    // Appears only once a reaction with a scripted animation has actually
    // happened in THIS vessel - see lastAnimatedReactionId in app.js.
    const molecularView = document.createElement('button');
    molecularView.type = 'button';
    molecularView.className = 'container__molecular';
    molecularView.textContent = 'Molecular view';
    molecularView.hidden = true;
    molecularView.addEventListener('click', () => {
      const reactionId = molecularView.dataset.reactionId;
      if (reactionId) dispatch.viewReactionAnimation(reactionId);
    });
    el.appendChild(molecularView);

    wireDragAndDrop(el, container.id);

    const refs = {
      el, liquidBase, liquidIncoming, precipitateLayer, bubbleLayer, gasLayer, pourMouth,
      contentsList, volumeEl, tempEl, phEl, colorLabel, flame, heatButtons, dip, molecularView,
      lastCapacityMl: container.capacityMl,
    };
    containerEls.set(container.id, refs);
    containersWrapper.appendChild(el);
    return refs;
  }

  /* ------------------------------------------------------------------ *
   * Updating a container's existing markup to match the latest state.
   * This never plays an animation itself - effects only ever play from
   * withEffects(), right where an action was dispatched, using the exact
   * before/after values and the engine's own account of what happened.
   * ------------------------------------------------------------------ */

  function updateContainer(refs, container, state) {
    refs.contentsList.innerHTML = '';
    if (container.contents.length === 0) {
      const li = document.createElement('li');
      li.textContent = '(empty)';
      refs.contentsList.appendChild(li);
    } else {
      for (const item of container.contents) {
        const li = document.createElement('li');
        li.textContent = `${item.chemicalId}: ${item.amount === null ? 'present (amount not tracked)' : item.amount}`;
        refs.contentsList.appendChild(li);
      }
    }

    refs.volumeEl.textContent = container.volumeMl;
    refs.tempEl.textContent = container.temperatureC;
    refs.phEl.textContent = container.pH === null ? 'unknown' : container.pH;

    // Colour is never shown without its name (UI.md section 5) - this is the
    // plain-text pairing; crossfadeColor (in withEffects) is the swatch.
    refs.colorLabel.textContent = container.appearance.colorName
      ? `Colour: ${container.appearance.colorName}`
      : 'Colour: not known for this mixture';

    if (!refs.liquidBase.style.background) {
      // First paint: nothing to crossfade from, so the colour and level are
      // just set directly rather than animated in.
      refs.liquidBase.style.background = container.appearance.colorHex;
      refs.liquidIncoming.style.background = container.appearance.colorHex;
      const fraction = container.capacityMl > 0 ? container.volumeMl / container.capacityMl : 0;
      refs.liquidBase.style.height = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
      refs.liquidIncoming.style.height = refs.liquidBase.style.height;
    }

    for (const button of refs.heatButtons) {
      const active = Number(button.dataset.level) === container.heatLevel;
      button.classList.toggle('heat-level--active', active);
    }
    setFlameLevel(refs.flame, container.heatLevel);

    refs.dip.disabled = !state.selectedToolId;
    refs.dip.title = state.selectedToolId ? 'Dip the tool you are holding' : 'Pick up a tool first';

    const animatedReactionId = container.lastAnimatedReactionId;
    refs.molecularView.hidden = !animatedReactionId;
    if (animatedReactionId) refs.molecularView.dataset.reactionId = animatedReactionId;
  }

  /* ------------------------------------------------------------------ *
   * Effects: played once, right at the point an action was dispatched, from
   * the exact before/after container state and the engine's own account of
   * which reaction(s) fired. Never inferred later from a diff against
   * whatever render() happens to be showing.
   * ------------------------------------------------------------------ */

  function withEffects(containerId, runAction) {
    const before = getState().containers.find((c) => c.id === containerId);
    const result = runAction();
    const after = getState().containers.find((c) => c.id === containerId);
    playContainerEffects(containerId, before, after, result && result.engineResult);
    return result;
  }

  /**
   * A pour touches two vessels, and actions.js's pour() puts its engineResult
   * on the RECEIVING one only - "Only the vessel that just received something
   * new can have a fresh reaction start" (see actions.js). So this captures
   * before/after for both sides around one dispatch call, and routes the
   * engineResult to the target only; the source only ever gets a level fall,
   * never a bubbling/gas/precipitate effect it did not earn.
   */
  function pourBetween(fromContainerId, toContainerId) {
    const stateBefore = getState();
    const sourceBefore = stateBefore.containers.find((c) => c.id === fromContainerId);
    const targetBefore = stateBefore.containers.find((c) => c.id === toContainerId);
    if (!sourceBefore || !targetBefore) return;

    const targetRefs = containerEls.get(toContainerId);
    if (targetRefs) playPourStream(targetRefs.pourMouth);

    const result = dispatch.pour(fromContainerId, toContainerId, sourceBefore.volumeMl);

    const stateAfter = getState();
    const sourceAfter = stateAfter.containers.find((c) => c.id === fromContainerId);
    const targetAfter = stateAfter.containers.find((c) => c.id === toContainerId);

    playContainerEffects(fromContainerId, sourceBefore, sourceAfter, null);
    playContainerEffects(toContainerId, targetBefore, targetAfter, result && result.engineResult);
  }

  function playContainerEffects(containerId, before, after, engineResult) {
    const refs = containerEls.get(containerId);
    if (!refs || !before || !after) return;

    if (before.appearance.colorHex !== after.appearance.colorHex) {
      crossfadeColor(refs.liquidBase, refs.liquidIncoming, after.appearance.colorHex);
    }

    const beforeFraction = before.capacityMl > 0 ? before.volumeMl / before.capacityMl : 0;
    const afterFraction = after.capacityMl > 0 ? after.volumeMl / after.capacityMl : 0;
    if (beforeFraction !== afterFraction) {
      riseLiquidLevel(refs.liquidBase, beforeFraction, afterFraction);
      refs.liquidIncoming.style.height = refs.liquidBase.style.height;
    }

    if (before.temperatureC !== after.temperatureC) {
      tickNumber(refs.tempEl, before.temperatureC, after.temperatureC, { decimals: 0 });
    }

    if (after.contents.length === 0) {
      // The vessel was emptied - any settled precipitate is gone with it.
      refs.precipitateLayer.innerHTML = '';
    }

    for (const step of (engineResult && engineResult.steps) || []) {
      const effects = step.reaction && step.reaction.effects;
      if (!effects) continue;
      if (effects.bubbles) playBubbles(refs.bubbleLayer);
      if (effects.gas) playGasEvolution(refs.gasLayer);
      if (effects.precipitate) {
        playPrecipitate(refs.precipitateLayer, precipitateColorFor(step.reaction));
      }
    }
  }

  /** The curated colour of whichever product actually is the solid, not a guess. */
  function precipitateColorFor(reaction) {
    for (const productId of reaction.products || []) {
      const chemical = engine.getChemical(productId);
      if (chemical && chemical.state === 'solid') return chemical.colorHex;
    }
    return (reaction.effects && reaction.effects.colorToHex) || '#9AA0A6';
  }

  /* ------------------------------------------------------------------ *
   * Drag and drop: a reagent from the shelf (text/plain: chemicalId), or
   * another container being poured (a dedicated mime type, so a drop
   * handler can tell the two apart).
   * ------------------------------------------------------------------ */

  const CONTAINER_DRAG_TYPE = 'application/x-chemlab-container-id';

  function wireDragAndDrop(el, containerId) {
    el.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData(CONTAINER_DRAG_TYPE, containerId);
      event.dataTransfer.effectAllowed = 'copy';
    });

    el.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      el.classList.add('container--drag-over');
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('container--drag-over');
    });

    el.addEventListener('drop', (event) => {
      event.preventDefault();
      el.classList.remove('container--drag-over');

      const fromContainerId = event.dataTransfer.getData(CONTAINER_DRAG_TYPE);
      if (fromContainerId) {
        if (fromContainerId === containerId) return; // cannot pour into itself
        pourBetween(fromContainerId, containerId);
        return;
      }

      const chemicalId = event.dataTransfer.getData('text/plain');
      if (!chemicalId) return;

      // No volume-picker widget yet, so a plain browser prompt stands in for
      // one. Cancelling, or entering anything that is not a positive number,
      // adds nothing.
      const amountText = window.prompt('How much to add (mL, or g for a solid)?', '10');
      if (amountText === null) return;

      const amount = Number(amountText);
      if (!Number.isFinite(amount) || amount <= 0) return;

      withEffects(containerId, () => dispatch.addChemical(containerId, chemicalId, amount));
    });
  }

  /* ------------------------------------------------------------------ *
   * The tool tray from UI.md section 3's layout. Picking a tool up and then
   * dipping it is two clicks rather than a drag, which keeps it usable from
   * the keyboard - UI.md section 8 requires full keyboard operation, and drag
   * and drop cannot give that.
   * ------------------------------------------------------------------ */

  function renderToolTray(state) {
    const tray = document.createElement('section');
    tray.className = 'tool-tray';

    const heading = document.createElement('h3');
    heading.textContent = 'Tool tray';
    tray.appendChild(heading);

    for (const tool of state.tools) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tool';
      button.dataset.toolId = tool.id;
      button.textContent = tool.name;

      const held = state.selectedToolId === tool.id;
      button.classList.toggle('tool--selected', held);
      button.setAttribute('aria-pressed', String(held));

      button.addEventListener('click', () => dispatch.selectTool(tool.id));
      tray.appendChild(button);
    }

    const hint = document.createElement('p');
    hint.className = 'tool-tray__hint';
    hint.textContent = state.selectedToolId
      ? 'Now press Dip on a container.'
      : 'Pick up a tool, then press Dip on a container.';
    tray.appendChild(hint);

    return tray;
  }

  subscribe(render);
  render();

  return { render };
}

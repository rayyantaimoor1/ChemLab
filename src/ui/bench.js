/**
 * bench.js — the bench top: a canvas of real objects a student moves about.
 *
 * WHAT THE BENCH IS
 * Not a list of cards. Every vessel and every piece of furniture sits at its
 * own x/y on the bench and is dragged with the pointer, exactly the way you
 * would move real glassware. What you do with a thing is decided by where
 * you put it down:
 *
 *   drop a vessel onto another vessel  → pour from one into the other
 *   drop a vessel onto a burner/ice/rack → stand it on that furniture
 *   drop a burette onto a vessel        → clamp it above, ready to titrate
 *   drop a reagent from the shelf       → add it to that vessel
 *
 * That is why a free-standing vessel has NO heat control: there is nothing
 * under it to supply heat. Heat appears once it is standing on a burner, and
 * it is the burner's own knob - which is how a bench actually works.
 *
 * ONE CONTROL STRIP, NOT ONE PER VESSEL
 * A single strip along the foot of the bench shows the controls for whatever
 * is currently selected. Seven vessels each carrying their own full button
 * set would bury the glassware under its own instrumentation.
 *
 * WHERE THE BOUNDARY IS
 * This module reads container state exactly as app.js shapes it and calls
 * the dispatch names UI.md section 1 fixes - addChemical, pour, setHeat and
 * the rest. It decides where things ARE; it never decides what happens when
 * they meet. That answer always comes back from the engine.
 *
 * WHY THE DOM IS BUILT ONCE, NOT REBUILT EVERY RENDER
 * An animation needs a stable element to animate FROM its old appearance TO
 * its new one - a torn-down-and-recreated element has no "old appearance" to
 * animate from. Each object's markup is built once (ensureVesselRefs /
 * ensureEquipmentRefs) and every later render only updates what changed.
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

// Which vessel types have a pouring lip - the mockup's VESSEL_TYPES table
// (spout:true), matching real glassware: the two beakers and the measuring
// cylinder have one, nothing else does.
const SPOUTED_VESSEL_TYPES = new Set(['beaker', 'beaker_small', 'cylinder']);

// Which types carry graduation marks, and how tall that type's glass is.
const GRADUATED_VESSEL_HEIGHT = { cylinder: 152, burette: 200 };
const GRADUATION_COUNT = 8;

// A vessel reads "nearly full" at this fraction of its capacity.
const NEARLY_FULL_FRACTION = 0.9;

/* ------------------------------------------------------------------ *
 * How opaque a liquid is drawn.
 *
 * Curated colours are the colour of the SUBSTANCE, not of a block of
 * paint. 156 of the reagents are "colourless" at #EEF3F5, and filling a
 * beaker with that flat gives a slab of white emulsion - the one thing
 * water in glass never looks like. So a colour is drawn with an alpha
 * taken from how pale and how washed-out it is: a colourless liquid is
 * mostly transparent and reads as liquid through its meniscus and edges,
 * while copper sulfate stays a solid blue.
 *
 * This changes nothing about WHICH colour is used - that is still the
 * curated hex, and the colour's NAME still comes from the data beside it
 * (UI.md section 5). It only decides how see-through to paint it.
 * ------------------------------------------------------------------ */

function parseHex(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function liquidFillFor(colorHex) {
  const rgb = parseHex(colorHex);
  if (!rgb) return colorHex;

  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const lightness = (max + min) / 2 / 255;
  const chroma = (max - min) / 255;

  let alpha = 1;
  if (lightness > 0.88 && chroma < 0.09) {
    // Colourless: water, dilute acids, most solutions.
    alpha = 0.26;
  } else if (lightness > 0.80 && chroma < 0.16) {
    // Very faintly tinted - a hint of colour, still mostly clear.
    alpha = 0.48;
  } else if (lightness > 0.72 && chroma < 0.24) {
    alpha = 0.72;
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

// How far outside a piece of furniture a dragged vessel still counts as
// being dropped onto it. Generous above (a tall vessel is grabbed near its
// top, well above the tripod it is aimed at) and tight below.
const EQUIPMENT_HIT_PAD = { x: 30, top: 90, bottom: 24 };

// The control strip along the foot of the bench, and a little breathing
// room under the lowest object.
const CONTROL_STRIP_H = 62;

// One drop from a burette really is about 0.05 mL, which is why a titration
// can be taken right up to the drop that changes the colour.
const BURETTE_DROP_ML = 0.05;
const BURETTE_TAP_ML = 0.25;
const BURETTE_TAP_INTERVAL_MS = 260;

export function mountBench({ root, getState, dispatch, subscribe }) {
  /** @type {Map<string, object>} containerId -> the DOM refs built for it */
  const vesselEls = new Map();
  /** @type {Map<string, object>} equipmentId -> the DOM refs built for it */
  const equipmentEls = new Map();

  const heading = document.createElement('h2');
  heading.textContent = 'Bench';
  root.appendChild(heading);

  // The bench top itself. Everything on it is absolutely positioned, so
  // this is the coordinate space every x/y in app.js is measured in.
  const canvas = document.createElement('div');
  canvas.className = 'bench-canvas';
  root.appendChild(canvas);

  // Clicking the bare bench puts down whatever was selected.
  canvas.addEventListener('pointerdown', (event) => {
    if (event.target === canvas) {
      dispatch.selectVessel(null);
    }
  });

  // The single control strip for whatever is selected.
  const controlStrip = document.createElement('div');
  controlStrip.className = 'bench-controls';
  canvas.appendChild(controlStrip);

  const controlTitle = document.createElement('div');
  controlTitle.className = 'bench-controls__title';
  const controlSub = document.createElement('div');
  controlSub.className = 'bench-controls__sub';
  const controlText = document.createElement('div');
  controlText.className = 'bench-controls__text';
  controlText.append(controlTitle, controlSub);
  const controlButtons = document.createElement('div');
  controlButtons.className = 'bench-controls__buttons';
  controlStrip.append(controlText, controlButtons);

  // Floating panels (amount to add, amount to pour) live over the canvas
  // at the point of the drop, rather than as centred modals.
  const floatHost = document.createElement('div');
  floatHost.className = 'bench-float';
  floatHost.hidden = true;
  canvas.appendChild(floatHost);

  const toolTrayHost = document.createElement('div');
  root.appendChild(toolTrayHost);

  const readingsHost = document.createElement('aside');
  readingsHost.className = 'readings-panel';
  root.appendChild(readingsHost);

  const traceStrip = document.createElement('div');
  traceStrip.className = 'trace-strip';
  traceStrip.hidden = true;
  const traceLabel = document.createElement('span');
  traceLabel.className = 'trace-strip__label';
  traceLabel.textContent = 'dispatch →';
  const traceValue = document.createElement('span');
  traceValue.className = 'trace-strip__value';
  traceStrip.append(traceLabel, traceValue);
  root.appendChild(traceStrip);

  // The drag in progress, or null. Held outside render() because a drag
  // spans many pointermove events and several renders.
  let drag = null;
  let tapTimer = null;

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */

  function render() {
    const state = getState();

    // Tell app.js how big the bench is, so a newly-added vessel lands
    // somewhere sensible. Only when it has actually been laid out.
    if (canvas.clientWidth > 0) {
      dispatch.setBenchSize(canvas.clientWidth, canvas.clientHeight);
    }

    const seenEquipment = new Set();
    for (const item of state.equipment) {
      seenEquipment.add(item.id);
      updateEquipment(ensureEquipmentRefs(item), item, state);
    }
    for (const [id, refs] of equipmentEls) {
      if (!seenEquipment.has(id)) {
        refs.el.remove();
        equipmentEls.delete(id);
      }
    }

    const seenVessels = new Set();
    for (const container of state.containers) {
      seenVessels.add(container.id);
      updateVessel(ensureVesselRefs(container), container, state);
    }
    for (const [id, refs] of vesselEls) {
      if (!seenVessels.has(id)) {
        refs.el.remove();
        vesselEls.delete(id);
      }
    }

    renderControlStrip(state);
    renderReadings(state);
    traceStrip.hidden = !state.traceEnabled;
    traceValue.textContent = state.traceLine;

    toolTrayHost.innerHTML = '';
    toolTrayHost.appendChild(renderToolTray(state));
  }

  /* ------------------------------------------------------------------ *
   * Dragging. One pointer gesture, three possible outcomes on release:
   * pour, stand on furniture, or simply put down somewhere new. A gesture
   * that never moved more than a few pixels is a click, and just selects.
   * ------------------------------------------------------------------ */

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** Which OTHER vessel the pointer is currently over, if any. */
  function hitVessel(event, exceptId) {
    for (const [id, refs] of vesselEls) {
      if (id === exceptId) continue;
      const rect = refs.glass.getBoundingClientRect();
      if (
        event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom
      ) {
        return id;
      }
    }
    return null;
  }

  /** Which piece of furniture the pointer is over, generously padded. */
  function hitEquipment(event) {
    for (const [id, refs] of equipmentEls) {
      const rect = refs.art.getBoundingClientRect();
      if (
        event.clientX >= rect.left - EQUIPMENT_HIT_PAD.x &&
        event.clientX <= rect.right + EQUIPMENT_HIT_PAD.x &&
        event.clientY >= rect.top - EQUIPMENT_HIT_PAD.top &&
        event.clientY <= rect.bottom + EQUIPMENT_HIT_PAD.bottom
      ) {
        return id;
      }
    }
    return null;
  }

  function beginDrag(kind, id, event, element) {
    // A click that lands on a button is that button's, not a drag.
    if (event.target.closest && event.target.closest('button')) return;
    event.preventDefault();

    const state = getState();
    const object = kind === 'vessel'
      ? state.containers.find((c) => c.id === id)
      : state.equipment.find((q) => q.id === id);
    if (!object) return;

    const point = canvasPoint(event);
    drag = {
      kind,
      id,
      el: element,
      glass: kind === 'vessel' ? vesselEls.get(id)?.glass : null,
      offsetX: point.x - object.position.x,
      offsetY: point.y - object.position.y,
      x: object.position.x,
      y: object.position.y,
      startX: object.position.x,
      startY: object.position.y,
      width: object.width,
      height: object.height,
      type: kind === 'vessel' ? object.type : null,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };

    if (kind === 'vessel') dispatch.selectVessel(id);
    else dispatch.selectEquipment(id);

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(event) {
    if (!drag) return;
    event.preventDefault();

    if (Math.abs(event.clientX - drag.startClientX) > 3 || Math.abs(event.clientY - drag.startClientY) > 3) {
      drag.moved = true;
    }

    const point = canvasPoint(event);
    const maxX = canvas.clientWidth - drag.width;
    const maxY = canvas.clientHeight - CONTROL_STRIP_H - drag.height;
    drag.x = Math.max(6, Math.min(maxX, point.x - drag.offsetX));
    drag.y = Math.max(6, Math.min(maxY, point.y - drag.offsetY));
    drag.el.style.transform = `translate3d(${drag.x}px, ${drag.y}px, 0)`;

    if (drag.kind !== 'vessel') return;

    // Tip the glass while it is over another vessel: the promise that
    // letting go will pour, made before anything is committed.
    const over = hitVessel(event, drag.id);
    if (drag.glass) drag.glass.style.transform = over ? 'rotate(-24deg)' : '';

    const overEquipment = over ? null : hitEquipment(event);
    for (const [id, refs] of vesselEls) refs.el.classList.toggle('is-drop-target', id === over);
    for (const [id, refs] of equipmentEls) refs.el.classList.toggle('is-drop-target', id === overEquipment);
  }

  function onPointerUp(event) {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    const finished = drag;
    drag = null;
    if (!finished) return;

    for (const [, refs] of vesselEls) refs.el.classList.remove('is-drop-target');
    for (const [, refs] of equipmentEls) refs.el.classList.remove('is-drop-target');

    if (finished.kind === 'equip') {
      if (finished.moved) dispatch.moveEquipment(finished.id, finished.x, finished.y);
      else render();
      return;
    }

    if (finished.glass) finished.glass.style.transform = '';

    const pourTarget = hitVessel(event, finished.id);
    const standTarget = pourTarget ? null : hitEquipment(event);

    // A burette dropped over a vessel is clamped above it, not poured.
    if (pourTarget && finished.type === 'burette') {
      dispatch.clampOver(finished.id, pourTarget);
      return;
    }

    if (pourTarget) {
      // Snap back to where it was picked up: you tip a beaker over another
      // and then set it down again, you do not leave it hanging there.
      finished.el.style.transform = `translate3d(${finished.startX}px, ${finished.startY}px, 0)`;
      const source = getState().containers.find((c) => c.id === finished.id);
      if (!source || source.contents.length === 0) {
        render();
        return;
      }
      const state = getState();
      if (state.dispenseMode === 'quick') {
        executePour(finished.id, pourTarget, Math.min(state.quickAmount, source.volumeMl));
      } else {
        openPourPanel(finished.id, pourTarget);
      }
      return;
    }

    if (standTarget) {
      dispatch.standOn(finished.id, standTarget);
      return;
    }

    if (finished.moved) dispatch.moveVessel(finished.id, finished.x, finished.y);
    else render();
  }

  /* ------------------------------------------------------------------ *
   * Equipment: the burner, ice bath and rack, each drawn as its own
   * silhouette rather than a labelled card.
   * ------------------------------------------------------------------ */

  function buildEquipmentArt(kind) {
    const art = document.createElement('div');
    art.className = 'equipment__art';

    const part = (className, style = {}) => {
      const span = document.createElement('span');
      span.className = `equipment__part equipment__part--${className}`;
      Object.assign(span.style, style);
      art.appendChild(span);
      return span;
    };

    if (kind === 'burner') {
      part('burner-ring');
      part('burner-leg', {}).classList.add('equipment__part--burner-leg-left');
      part('burner-leg', {}).classList.add('equipment__part--burner-leg-right');
      part('burner-foot');
      part('burner-barrel');
      part('burner-collar');
      // Deliberately NOT given the .fx-flame class: that one is the tiny
      // inline heat indicator, drawn as a teardrop tilted 45° to sit in a
      // line of text. On a burner it has to stand upright over the barrel.
      const cone = document.createElement('span');
      cone.className = 'equipment__part--flame-cone';
      const inner = document.createElement('span');
      inner.className = 'equipment__part--flame-inner';
      cone.appendChild(inner);
      art.appendChild(cone);
    } else if (kind === 'ice_bath') {
      part('ice-basin');
      part('ice-cube').classList.add('equipment__part--ice-cube-1');
      part('ice-cube').classList.add('equipment__part--ice-cube-2');
      part('ice-cube').classList.add('equipment__part--ice-cube-3');
    } else if (kind === 'rack') {
      part('rack-rail').classList.add('equipment__part--rack-rail-top');
      part('rack-rail').classList.add('equipment__part--rack-rail-bottom');
      part('rack-leg').classList.add('equipment__part--rack-leg-left');
      part('rack-leg').classList.add('equipment__part--rack-leg-right');
      for (let k = 0; k < 3; k += 1) part('rack-slot', { left: `${26 + k * 26}px` });
    }

    return art;
  }

  function equipmentLevelText(item) {
    if (item.kind === 'burner') return item.level === 0 ? 'gas off' : `level ${item.level}`;
    if (item.kind === 'ice_bath') return 'melting ice, about 2 °C';
    return 'holds tubes upright';
  }

  function ensureEquipmentRefs(item) {
    const existing = equipmentEls.get(item.id);
    if (existing) return existing;

    const el = document.createElement('div');
    el.className = `bench-object equipment equipment--${item.kind}`;
    el.dataset.equipmentId = item.id;

    const art = buildEquipmentArt(item.kind);
    el.appendChild(art);

    const chip = document.createElement('div');
    chip.className = 'object-chip';
    const label = document.createElement('span');
    label.className = 'object-chip__label';
    label.textContent = item.label;
    const status = document.createElement('span');
    status.className = 'object-chip__status';
    chip.append(label, status);
    el.appendChild(chip);

    el.addEventListener('pointerdown', (event) => beginDrag('equip', item.id, event, el));

    canvas.appendChild(el);
    const refs = { el, art, status };
    equipmentEls.set(item.id, refs);
    return refs;
  }

  function updateEquipment(refs, item, state) {
    refs.el.style.transform = `translate3d(${item.position.x}px, ${item.position.y}px, 0)`;
    refs.el.classList.toggle('is-selected', state.selectedEquipmentId === item.id);
    refs.status.textContent = equipmentLevelText(item);
    refs.art.classList.toggle('equipment__art--lit', item.kind === 'burner' && item.level > 0);
    if (item.kind === 'burner') refs.art.style.setProperty('--burner-level', String(item.level));
  }

  /* ------------------------------------------------------------------ *
   * Vessels
   * ------------------------------------------------------------------ */

  function ensureVesselRefs(container) {
    const existing = vesselEls.get(container.id);
    if (existing) return existing;

    const el = document.createElement('div');
    el.className = 'bench-object vessel-object';
    el.dataset.containerId = container.id;

    const vessel = document.createElement('div');
    vessel.className = `vessel vessel--${container.type}`;

    const vesselShadow = document.createElement('div');
    vesselShadow.className = 'vessel__shadow';
    vessel.appendChild(vesselShadow);

    const vesselRim = document.createElement('div');
    vesselRim.className = 'vessel__rim';
    vessel.appendChild(vesselRim);
    if (SPOUTED_VESSEL_TYPES.has(container.type)) {
      const spout = document.createElement('div');
      spout.className = 'vessel__spout';
      vessel.appendChild(spout);
    }

    const graduatedHeight = GRADUATED_VESSEL_HEIGHT[container.type];
    if (graduatedHeight) {
      for (let k = 0; k < GRADUATION_COUNT; k += 1) {
        const tick = document.createElement('span');
        tick.className = 'vessel__tick';
        tick.style.top = `${8 + k * ((graduatedHeight - 20) / (GRADUATION_COUNT - 1))}px`;
        tick.style.width = k % 2 === 0 ? '12px' : '7px';
        vessel.appendChild(tick);
      }
    }

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

    // Two electrodes, drawn the same dark grey because in a real cell they
    // usually are two identical carbon rods - it is the + and - signs, not
    // the colour, that say which is which (UI.md section 5).
    const electrodeLayer = document.createElement('div');
    electrodeLayer.className = 'vessel__layer vessel__electrodes';
    electrodeLayer.hidden = true;
    const cathodeRod = document.createElement('div');
    cathodeRod.className = 'electrode electrode--cathode';
    cathodeRod.innerHTML = '<span class="electrode__sign">&minus;</span>';
    const anodeRod = document.createElement('div');
    anodeRod.className = 'electrode electrode--anode';
    anodeRod.innerHTML = '<span class="electrode__sign">+</span>';
    const ionLayer = document.createElement('div');
    ionLayer.className = 'vessel__layer vessel__ions';
    electrodeLayer.append(cathodeRod, anodeRod, ionLayer);

    const glass = document.createElement('div');
    glass.className = 'vessel__glass';
    glass.append(liquidBase, liquidIncoming, precipitateLayer, bubbleLayer, gasLayer, electrodeLayer, pourMouth);
    vessel.appendChild(glass);
    el.appendChild(vessel);

    // The floating label beside the glass: name, live readout, colour, and
    // whatever else is worth saying about this vessel right now.
    const chip = document.createElement('div');
    chip.className = 'object-chip vessel-chip';

    const nameRow = document.createElement('span');
    nameRow.className = 'object-chip__label';
    const nameText = document.createElement('span');
    nameText.textContent = container.name;
    const idText = document.createElement('span');
    idText.className = 'object-chip__id';
    idText.textContent = container.id;
    nameRow.append(nameText, ' ', idText);

    const readout = document.createElement('span');
    readout.className = 'object-chip__readout';
    const volumeEl = document.createElement('span');
    const tempEl = document.createElement('span');
    const phEl = document.createElement('span');
    readout.append(volumeEl, ' mL · ', tempEl, ' °C · pH ', phEl);

    const colourRow = document.createElement('span');
    colourRow.className = 'object-chip__colour';
    const colorSwatch = document.createElement('span');
    colorSwatch.className = 'object-chip__swatch';
    const colorText = document.createElement('span');
    colourRow.append(colorSwatch, colorText);

    const precipitateLabel = document.createElement('span');
    precipitateLabel.className = 'object-chip__precipitate';
    precipitateLabel.hidden = true;

    const capacityChip = document.createElement('span');
    capacityChip.className = 'object-chip__capacity';
    capacityChip.hidden = true;

    const standNote = document.createElement('span');
    standNote.className = 'object-chip__stand';
    standNote.hidden = true;

    // The last reading this vessel gave, sitting on the bench beside the
    // glass. The swatch is the tool's own curated colour (tools.js always
    // returns colorHex WITH colorName), never a colour worked out here.
    const readingRow = document.createElement('span');
    readingRow.className = 'object-chip__reading';
    readingRow.hidden = true;
    const readingSwatch = document.createElement('span');
    readingSwatch.className = 'object-chip__reading-swatch';
    const readingText = document.createElement('span');
    readingRow.append(readingSwatch, readingText);

    // What the current is doing, while it is on - the engine's own words,
    // so a cell that correctly does nothing says so instead of looking
    // broken. See powerNoteByContainer in app.js.
    const powerNote = document.createElement('span');
    powerNote.className = 'object-chip__power';
    powerNote.hidden = true;

    chip.append(nameRow, readout, colourRow, precipitateLabel, capacityChip, standNote, readingRow, powerNote);
    el.appendChild(chip);

    // The flame indicator lives with the burner now, so a vessel only
    // carries this to drive setFlameLevel's shared bookkeeping.
    const flame = document.createElement('span');
    flame.className = 'fx-flame';
    flame.hidden = true;
    el.appendChild(flame);

    el.addEventListener('pointerdown', (event) => beginDrag('vessel', container.id, event, el));
    wireReagentDrop(el, container.id);

    const refs = {
      el, vessel, glass, liquidBase, liquidIncoming, precipitateLayer, bubbleLayer, gasLayer, pourMouth,
      volumeEl, tempEl, phEl, colorSwatch, colorText, colourRow, precipitateLabel, capacityChip,
      standNote, vesselShadow, flame, electrodeLayer, ionLayer,
      readingRow, readingSwatch, readingText, powerNote,
      dipEl: null, dipTool: null,
    };
    vesselEls.set(container.id, refs);
    canvas.appendChild(el);
    return refs;
  }

  /**
   * The instrument that goes into the liquid, drawn as itself: a paper
   * strip for the two papers, a stemmed thermometer with a bulb, a pair of
   * probe rods for the conductivity tester, a wire loop for the flame test.
   *
   * It is drawn UNREACTED - a pH strip goes in cream and the colour is
   * reported afterwards, because the reading is the end of the gesture and
   * showing the answer on the way down would be showing it before the
   * instrument has read anything.
   */
  function buildDipInstrument(toolId) {
    const wrap = document.createElement('div');
    wrap.className = `vessel__dip vessel__dip--${toolId}`;

    if (toolId === 'ph_paper' || toolId === 'litmus') {
      const body = document.createElement('span');
      body.className = 'vessel__dip-strip-body';
      const tip = document.createElement('span');
      tip.className = 'vessel__dip-strip-tip';
      wrap.append(body, tip);
    } else if (toolId === 'thermometer') {
      const stem = document.createElement('span');
      stem.className = 'vessel__dip-therm-stem';
      const bulb = document.createElement('span');
      bulb.className = 'vessel__dip-therm-bulb';
      wrap.append(stem, bulb);
    } else if (toolId === 'flame_test') {
      const wire = document.createElement('span');
      wire.className = 'vessel__dip-wire';
      const loop = document.createElement('span');
      loop.className = 'vessel__dip-wire-loop';
      wrap.append(wire, loop);
    } else {
      // Conductivity tester: two rods and a lamp between them.
      const left = document.createElement('span');
      left.className = 'vessel__dip-rod vessel__dip-rod--left';
      const right = document.createElement('span');
      right.className = 'vessel__dip-rod vessel__dip-rod--right';
      const lamp = document.createElement('span');
      lamp.className = 'vessel__dip-lamp';
      wrap.append(left, right, lamp);
    }

    return wrap;
  }

  function updateDip(refs, container) {
    if (container.dipping) {
      // Rebuilt only when the tool changes, so the descend animation is
      // never restarted by an unrelated re-render mid-dip.
      if (refs.dipTool !== container.dipping) {
        if (refs.dipEl) refs.dipEl.remove();
        refs.dipEl = buildDipInstrument(container.dipping);
        refs.dipTool = container.dipping;
        refs.vessel.appendChild(refs.dipEl);
      }
      return;
    }
    if (refs.dipEl) {
      refs.dipEl.remove();
      refs.dipEl = null;
      refs.dipTool = null;
    }
  }

  function updateVessel(refs, container, state) {
    // Never fight a drag in progress - the pointer owns the transform then.
    if (!drag || drag.id !== container.id) {
      refs.el.style.transform = `translate3d(${container.position.x}px, ${container.position.y}px, 0)`;
    }
    refs.el.classList.toggle('is-selected', state.selectedVesselId === container.id);

    refs.volumeEl.textContent = container.volumeMl;
    refs.tempEl.textContent = container.temperatureC.toFixed(1);
    refs.phEl.textContent = container.pH === null ? '—' : container.pH;

    const isEmpty = container.contents.length === 0;
    refs.colorSwatch.style.background = container.appearance.colorHex;
    refs.colorSwatch.hidden = isEmpty;
    refs.colorText.textContent = isEmpty
      ? 'empty'
      : container.appearance.colorName || 'colour not known for this mixture';
    refs.colourRow.classList.toggle('is-empty', isEmpty);

    const fraction = container.capacityMl > 0 ? container.volumeMl / container.capacityMl : 0;
    if (fraction >= 1) {
      refs.capacityChip.hidden = false;
      refs.capacityChip.textContent = `full — ${container.volumeMl} of ${container.capacityMl} mL`;
      refs.capacityChip.classList.add('is-full');
    } else if (fraction >= NEARLY_FULL_FRACTION) {
      refs.capacityChip.hidden = false;
      refs.capacityChip.textContent = `nearly full — ${container.volumeMl} of ${container.capacityMl} mL`;
      refs.capacityChip.classList.remove('is-full');
    } else {
      refs.capacityChip.hidden = true;
    }

    const standingItem = container.standOn
      ? state.equipment.find((item) => item.id === container.standOn)
      : null;
    const clampedTarget = container.clampedOver
      ? state.containers.find((c) => c.id === container.clampedOver)
      : null;
    if (clampedTarget) {
      refs.standNote.hidden = false;
      refs.standNote.textContent = `clamped above the ${clampedTarget.name.toLowerCase()}`;
    } else if (standingItem) {
      refs.standNote.hidden = false;
      refs.standNote.textContent = `on the ${standingItem.label.toLowerCase()}`;
    } else {
      refs.standNote.hidden = true;
    }

    // The shadow reads as contact with the bench, so it goes once the
    // vessel is resting on something else instead.
    refs.vesselShadow.hidden = !!container.standOn || !!container.clampedOver;

    // Keep the drawn liquid in step with what is actually in the vessel.
    //
    // Normally the level and colour are animated by playContainerEffects,
    // which is the only thing allowed to touch them WHILE it is animating.
    // But any change that does not go through an effect - emptying a
    // vessel, say - would otherwise leave the old liquid painted in the
    // glass forever. So whenever nothing is animating, the drawn state is
    // reconciled against the real state here.
    const targetFill = liquidFillFor(container.appearance.colorHex);
    const targetHeight = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    const settling = refs.liquidBase.getAnimations().length > 0
      || refs.liquidIncoming.getAnimations().length > 0;

    if (!settling) {
      if (refs.liquidBase.style.background !== targetFill) {
        refs.liquidBase.style.background = targetFill;
        refs.liquidIncoming.style.background = targetFill;
        refs.liquidIncoming.style.opacity = '0';
      }
      if (refs.liquidBase.style.height !== targetHeight) {
        refs.liquidBase.style.height = targetHeight;
        refs.liquidIncoming.style.height = targetHeight;
      }
      // riseLiquidLevel fades the layer out when a vessel empties; refilling
      // it later has to bring it back.
      refs.liquidBase.style.opacity = fraction > 0 ? '1' : '0';
    }

    // The last reading, on the bench beside the glass. Colour and its name
    // both come from the tool's own curated result (UI.md section 5: a
    // colour is never shown without the word for it).
    const strip = container.strip;
    if (strip) {
      refs.readingRow.hidden = false;
      refs.readingSwatch.hidden = !strip.colorHex;
      if (strip.colorHex) refs.readingSwatch.style.background = strip.colorHex;

      // Colour name and value, but never the same word twice - litmus
      // reports a colour AS its value ("red"), so joining the two blindly
      // gives "red · red".
      const value = strip.hasReading && strip.value !== null && strip.value !== undefined
        ? `${strip.value}${strip.unit || ''}`
        : null;
      const parts = [];
      if (strip.colorName) parts.push(strip.colorName);
      if (value && value.toLowerCase() !== String(strip.colorName || '').toLowerCase()) {
        parts.push(value);
      }
      refs.readingText.textContent = parts.join(' · ') || 'no reading';
      refs.readingRow.title = strip.text;
    } else {
      refs.readingRow.hidden = true;
    }

    // While the current is on: if ions are drifting the cell speaks for
    // itself, so only say something when nothing is visibly happening -
    // that is the case a student cannot otherwise tell from a broken app.
    const ionsMoving = (container.electrolysisIons || []).length > 0;
    if (container.electrified && !ionsMoving && container.powerNote) {
      refs.powerNote.hidden = false;
      refs.powerNote.textContent = `current on — ${container.powerNote.replace(/^\s*/, '').toLowerCase()}`;
      refs.powerNote.title = container.powerNote;
    } else if (container.electrified && !ionsMoving) {
      refs.powerNote.hidden = false;
      refs.powerNote.textContent = 'current on — nothing is being electrolysed';
      refs.powerNote.title = '';
    } else {
      refs.powerNote.hidden = true;
    }

    updateDip(refs, container);
    setFlameLevel(refs.flame, container.heatLevel);
    updateElectrolysis(refs, container);
  }

  /* ------------------------------------------------------------------ *
   * The control strip: whatever is selected, and nothing else.
   * ------------------------------------------------------------------ */

  function controlButton(label, onClick, options = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `bench-control ${options.className || ''}`.trim();
    button.textContent = label;
    button.title = options.title || label;
    button.disabled = !!options.disabled;
    if (options.active) button.classList.add('is-active');
    button.addEventListener('click', onClick);
    controlButtons.appendChild(button);
    return button;
  }

  function renderControlStrip(state) {
    controlButtons.innerHTML = '';

    const vessel = state.selectedVesselId
      ? state.containers.find((c) => c.id === state.selectedVesselId)
      : null;
    const equip = state.selectedEquipmentId
      ? state.equipment.find((q) => q.id === state.selectedEquipmentId)
      : null;

    if (!vessel && !equip) {
      controlTitle.textContent = 'Nothing selected';
      controlSub.textContent = state.containers.length || state.equipment.length
        ? 'Click a vessel or a piece of apparatus to work with it.'
        : 'Take apparatus from the tray on the left to set the bench up.';
      return;
    }

    if (vessel) {
      const standing = vessel.standOn ? state.equipment.find((q) => q.id === vessel.standOn) : null;
      const clamped = vessel.clampedOver
        ? state.containers.find((c) => c.id === vessel.clampedOver)
        : null;
      controlTitle.textContent = `${vessel.name} · ${vessel.id}`;
      controlSub.textContent = clamped
        ? `clamped above the ${clamped.name.toLowerCase()}`
        : standing
          ? `standing on the ${standing.label.toLowerCase()}`
          : 'on the bench — drag it onto a burner to heat it';

      // Heat exists only when something under the vessel supplies it.
      if (standing && standing.kind === 'burner') {
        for (const level of [0, 1, 2, 3]) {
          controlButton(level === 0 ? 'Gas off' : `Heat ${level}`, () => {
            dispatch.setEquipmentLevel(standing.id, level);
          }, { active: standing.level === level, className: 'bench-control--heat' });
        }
      }

      if (vessel.type === 'burette') {
        const armed = !!vessel.clampedOver && vessel.volumeMl > 0;
        const tapOpen = tapTimer !== null && tapTimer.buretteId === vessel.id;
        controlButton('1 drop', () => deliver(vessel.id, BURETTE_DROP_ML), {
          disabled: !armed, title: 'Deliver a single 0.05 mL drop', className: 'bench-control--accent',
        });
        controlButton('0.5 mL', () => deliver(vessel.id, 0.5), { disabled: !armed });
        controlButton('5 mL', () => deliver(vessel.id, 5), { disabled: !armed });
        controlButton(tapOpen ? 'Close tap' : 'Open tap', () => {
          if (tapOpen) closeTap();
          else openTap(vessel.id);
        }, { disabled: !armed, active: tapOpen, className: tapOpen ? 'bench-control--tap-open' : '' });
        if (vessel.clampedOver) {
          controlButton('Unclamp', () => dispatch.unclamp(vessel.id));
        }
      }

      controlButton('Stir', () => withEffects(vessel.id, () => dispatch.stir(vessel.id)));

      const heldTool = state.selectedToolId
        ? state.tools.find((t) => t.id === state.selectedToolId)
        : null;
      const dipping = !!vessel.dipping;
      controlButton(dipping ? 'Dipping…' : heldTool ? `Dip ${heldTool.name}` : 'Dip a tool', () => {
        dispatch.beginDip(state.selectedToolId, vessel.id);
      }, {
        disabled: !state.selectedToolId || dipping,
        title: state.selectedToolId ? 'Dip the tool you are holding' : 'Pick up a tool from the tray first',
        className: state.selectedToolId && !dipping ? 'bench-control--accent' : '',
      });

      controlButton(vessel.electrified ? 'Current on' : 'Current off', () => {
        withEffects(vessel.id, () => dispatch.setPower(vessel.id, !vessel.electrified));
      }, { active: vessel.electrified, className: 'bench-control--power' });

      // Through withEffects so the level actually falls and the colour
      // fades out, rather than the glass simply being redrawn empty.
      controlButton('Empty', () => withEffects(vessel.id, () => dispatch.emptyVessel(vessel.id)), {
        title: 'Empty and rinse this vessel, leaving it on the bench',
      });

      if (vessel.lastAnimatedReactionId) {
        controlButton('Molecular view', () => {
          dispatch.viewReactionAnimation(vessel.lastAnimatedReactionId);
        }, { className: 'bench-control--accent' });
      }

      controlButton('Put away', () => dispatch.removeVessel(vessel.id));
      return;
    }

    const standingVessel = equip.standingVesselId
      ? state.containers.find((c) => c.id === equip.standingVesselId)
      : null;
    controlTitle.textContent = equip.label;
    controlSub.textContent = standingVessel
      ? `${standingVessel.name.toLowerCase()} standing on it`
      : 'nothing standing on it — drag a vessel onto it';

    if (equip.canSetLevel) {
      for (const level of [0, 1, 2, 3]) {
        controlButton(level === 0 ? 'Gas off' : `Heat ${level}`, () => {
          dispatch.setEquipmentLevel(equip.id, level);
        }, { active: equip.level === level, className: 'bench-control--heat' });
      }
    }
    controlButton('Put away', () => dispatch.removeEquipment(equip.id));
  }

  /* ------------------------------------------------------------------ *
   * The burette's tap
   * ------------------------------------------------------------------ */

  function deliver(buretteId, volumeMl) {
    const burette = getState().containers.find((c) => c.id === buretteId);
    if (!burette || !burette.clampedOver || burette.volumeMl <= 0) {
      closeTap();
      return;
    }
    executePour(buretteId, burette.clampedOver, Math.min(volumeMl, burette.volumeMl));
  }

  function openTap(buretteId) {
    if (tapTimer) return;
    tapTimer = { buretteId, handle: setInterval(() => deliver(buretteId, BURETTE_TAP_ML), BURETTE_TAP_INTERVAL_MS) };
    render();
  }

  function closeTap() {
    if (!tapTimer) return;
    clearInterval(tapTimer.handle);
    tapTimer = null;
    render();
  }

  /* ------------------------------------------------------------------ *
   * Electrolysis
   * ------------------------------------------------------------------ */

  function updateElectrolysis(refs, container) {
    const on = container.electrified === true;
    refs.electrodeLayer.hidden = !on;

    const signature = on ? (container.electrolysisIons || []).map((ion) => ion.label + ion.toward).join('|') : '';
    if (refs.lastIonSignature === signature) return;
    refs.lastIonSignature = signature;

    refs.ionLayer.innerHTML = '';
    if (!on) return;

    const slots = [[46, 24], [52, 60], [44, 42], [40, 76]];
    for (const [index, ion] of (container.electrolysisIons || []).entries()) {
      const span = document.createElement('span');
      span.className = `ion ion--${ion.toward}`;
      span.textContent = ion.label;
      const slot = slots[index % slots.length];
      span.style.left = `${slot[0]}%`;
      span.style.top = `${slot[1]}%`;
      span.style.animationDelay = `${(ion.toward === 'anode' ? 350 : 0) + Math.floor(index / 2) * 700}ms`;
      refs.ionLayer.appendChild(span);
    }
  }

  /* ------------------------------------------------------------------ *
   * Effects
   * ------------------------------------------------------------------ */

  function withEffects(containerId, runAction) {
    const before = getState().containers.find((c) => c.id === containerId);
    const result = runAction();
    const after = getState().containers.find((c) => c.id === containerId);
    playContainerEffects(containerId, before, after, result && result.engineResult);
    return result;
  }

  function executePour(fromId, toId, amountMl) {
    const stateBefore = getState();
    const sourceBefore = stateBefore.containers.find((c) => c.id === fromId);
    const targetBefore = stateBefore.containers.find((c) => c.id === toId);
    if (!sourceBefore || !targetBefore) return;

    const targetRefs = vesselEls.get(toId);
    if (targetRefs) playPourStream(targetRefs.pourMouth);

    const result = dispatch.pour(fromId, toId, amountMl);

    const stateAfter = getState();
    playContainerEffects(fromId, sourceBefore, stateAfter.containers.find((c) => c.id === fromId), null);
    playContainerEffects(toId, targetBefore, stateAfter.containers.find((c) => c.id === toId), result && result.engineResult);
  }

  function playContainerEffects(containerId, before, after, engineResult) {
    const refs = vesselEls.get(containerId);
    if (!refs || !before || !after) return;

    if (before.appearance.colorHex !== after.appearance.colorHex) {
      crossfadeColor(refs.liquidBase, refs.liquidIncoming, liquidFillFor(after.appearance.colorHex));
    }

    const beforeFraction = before.capacityMl > 0 ? before.volumeMl / before.capacityMl : 0;
    const afterFraction = after.capacityMl > 0 ? after.volumeMl / after.capacityMl : 0;
    if (beforeFraction !== afterFraction) {
      riseLiquidLevel(refs.liquidBase, beforeFraction, afterFraction);
      refs.liquidIncoming.style.height = refs.liquidBase.style.height;
    }

    if (before.temperatureC !== after.temperatureC) {
      tickNumber(refs.tempEl, before.temperatureC, after.temperatureC, { decimals: 1 });
    }

    if (after.contents.length === 0) {
      refs.precipitateLayer.innerHTML = '';
      refs.precipitateLabel.hidden = true;
    }

    for (const step of (engineResult && engineResult.steps) || []) {
      const effects = step.reaction && step.reaction.effects;
      if (!effects) continue;
      if (effects.bubbles) playBubbles(refs.bubbleLayer);
      if (effects.gas) playGasEvolution(refs.gasLayer);
      if (effects.precipitate) {
        const info = precipitateInfoFor(step.reaction);
        playPrecipitate(refs.precipitateLayer, info.colorHex);
        refs.precipitateLabel.hidden = !info.colorName;
        if (info.colorName) refs.precipitateLabel.textContent = `${info.colorName} solid — ${info.name}`;
      }
    }
  }

  /** The curated colour, name and colour-name of whichever product actually
   *  is the solid - looked up, never guessed. */
  function precipitateInfoFor(reaction) {
    for (const productId of reaction.products || []) {
      const chemical = engine.getChemical(productId);
      if (chemical && chemical.state === 'solid') {
        return { colorHex: chemical.colorHex, colorName: chemical.colorName, name: chemical.name };
      }
    }
    return {
      colorHex: (reaction.effects && reaction.effects.colorToHex) || '#9AA0A6',
      colorName: null,
      name: null,
    };
  }

  /* ------------------------------------------------------------------ *
   * A reagent dropped from the shelf. Still native HTML5 drag-and-drop,
   * because the shelf is a scrolling list rather than part of this canvas
   * and a pointer drag out of a scroller fights the scroll.
   * ------------------------------------------------------------------ */

  function wireReagentDrop(el, containerId) {
    el.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      el.classList.add('is-drop-target');
    });

    el.addEventListener('dragleave', () => el.classList.remove('is-drop-target'));

    el.addEventListener('drop', (event) => {
      event.preventDefault();
      el.classList.remove('is-drop-target');

      const chemicalId = event.dataTransfer.getData('text/plain');
      if (!chemicalId) return;

      dispatch.selectVessel(containerId);
      const chemical = engine.getChemical(chemicalId);
      const isSolid = chemical && chemical.state === 'solid';
      if (getState().dispenseMode === 'quick' && !isSolid) {
        withEffects(containerId, () => dispatch.addChemical(containerId, chemicalId, getState().quickAmount));
      } else {
        openAmountPanel(containerId, chemicalId);
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * The floating amount panels - shown at the point of the drop rather
   * than as a centred modal over the whole window.
   * ------------------------------------------------------------------ */

  const AMOUNT_PRESETS_ML = [5, 10, 25, 50];
  const AMOUNT_STEP = 5;
  const AMOUNT_FLOOR = 1;

  function closeFloat() {
    floatHost.hidden = true;
    floatHost.innerHTML = '';
    document.removeEventListener('keydown', onFloatKeyDown, true);
  }

  function onFloatKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeFloat();
    }
  }

  /** Positions a floating panel beside a vessel, clamped inside the bench. */
  function placeFloat(nearContainerId) {
    const container = getState().containers.find((c) => c.id === nearContainerId);
    const x = container ? Math.min(container.position.x + 132, canvas.clientWidth - 240) : 20;
    const y = container ? Math.max(6, container.position.y - 20) : 20;
    floatHost.style.transform = `translate3d(${Math.max(6, x)}px, ${y}px, 0)`;
  }

  /**
   * Builds the shared stepper + presets + overflow warning body used by both
   * the "add a reagent" and "pour between vessels" panels.
   */
  function buildAmountBody({ startAmount, unit, maxAmount, headroom, withPresets, onConfirm, confirmLabel }) {
    let amount = startAmount;

    const form = document.createElement('form');
    form.className = 'amount-panel__form';

    const stepperRow = document.createElement('div');
    stepperRow.className = 'amount-panel__stepper';
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'amount-panel__step';
    minus.textContent = '−';
    minus.setAttribute('aria-label', 'Decrease amount');
    const display = document.createElement('span');
    display.className = 'amount-panel__value';
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'amount-panel__step';
    plus.textContent = '+';
    plus.setAttribute('aria-label', 'Increase amount');
    stepperRow.append(minus, display, plus);
    form.appendChild(stepperRow);

    let presetButtons = [];
    if (withPresets) {
      const presetRow = document.createElement('div');
      presetRow.className = 'amount-panel__presets';
      presetButtons = AMOUNT_PRESETS_ML.map((value) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'amount-panel__preset';
        button.textContent = String(value);
        button.addEventListener('click', () => setAmount(value));
        presetRow.appendChild(button);
        return button;
      });
      form.appendChild(presetRow);
    }

    // Only ever a warning, never a block: overfilling is a real, teachable
    // overflow, and container.js already caps what actually goes in and
    // reports what spilled.
    const overflow = document.createElement('p');
    overflow.className = 'amount-panel__overflow';
    overflow.hidden = true;
    overflow.textContent = 'That is more than the vessel holds — the excess will run over the brim and be lost.';
    form.appendChild(overflow);

    function setAmount(value) {
      const capped = maxAmount === null ? value : Math.min(maxAmount, value);
      amount = Math.max(AMOUNT_FLOOR, Math.round(capped * 100) / 100);
      display.textContent = `${amount} ${unit}`;
      for (const button of presetButtons) {
        button.classList.toggle('amount-panel__preset--active', Number(button.textContent) === amount);
      }
      overflow.hidden = headroom === null || amount <= headroom;
    }
    setAmount(amount);

    minus.addEventListener('click', () => setAmount(amount - AMOUNT_STEP));
    plus.addEventListener('click', () => setAmount(amount + AMOUNT_STEP));

    const buttons = document.createElement('div');
    buttons.className = 'amount-panel__buttons';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', closeFloat);
    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.className = 'amount-panel__dispense';
    confirm.textContent = confirmLabel;
    buttons.append(cancel, confirm);
    form.appendChild(buttons);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!Number.isFinite(amount) || amount <= 0) return;
      closeFloat();
      onConfirm(amount);
    });

    return { form, confirm };
  }

  function openAmountPanel(containerId, chemicalId) {
    const chemical = engine.getChemical(chemicalId);
    const container = getState().containers.find((c) => c.id === containerId);
    const isSolid = chemical && chemical.state === 'solid';
    const unit = isSolid ? 'g' : 'mL';
    const headroom = container ? Math.max(0, container.capacityMl - container.volumeMl) : null;

    floatHost.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'amount-panel';

    const title = document.createElement('h2');
    title.className = 'amount-panel__title';
    title.textContent = chemical ? chemical.name : chemicalId;
    panel.appendChild(title);

    const destination = document.createElement('p');
    destination.className = 'amount-panel__destination';
    destination.textContent = container
      ? `into ${container.id} · ${Math.round(headroom * 10) / 10} mL will still fit`
      : `into ${containerId}`;
    panel.appendChild(destination);

    const { form, confirm } = buildAmountBody({
      startAmount: isSolid ? 5 : 10,
      unit,
      maxAmount: null,
      headroom,
      withPresets: true,
      confirmLabel: 'Dispense',
      onConfirm: (amount) => {
        withEffects(containerId, () => dispatch.addChemical(containerId, chemicalId, amount));
      },
    });
    panel.appendChild(form);
    floatHost.appendChild(panel);

    placeFloat(containerId);
    floatHost.hidden = false;
    confirm.focus();
    document.addEventListener('keydown', onFloatKeyDown, true);
  }

  function openPourPanel(fromId, toId) {
    const state = getState();
    const source = state.containers.find((c) => c.id === fromId);
    const target = state.containers.find((c) => c.id === toId);
    if (!source || !target) return;
    const headroom = Math.max(0, target.capacityMl - target.volumeMl);

    floatHost.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'amount-panel';

    const title = document.createElement('h2');
    title.className = 'amount-panel__title';
    title.textContent = `Pour from the ${source.name.toLowerCase()}`;
    panel.appendChild(title);

    const destination = document.createElement('p');
    destination.className = 'amount-panel__destination';
    destination.textContent = `into ${target.id} · ${Math.round(headroom * 10) / 10} mL will still fit`;
    panel.appendChild(destination);

    const { form, confirm } = buildAmountBody({
      startAmount: Math.round(source.volumeMl * 10) / 10,
      unit: 'mL',
      maxAmount: source.volumeMl,
      headroom,
      withPresets: false,
      confirmLabel: 'Pour',
      onConfirm: (amount) => executePour(fromId, toId, amount),
    });
    panel.appendChild(form);
    floatHost.appendChild(panel);

    placeFloat(toId);
    floatHost.hidden = false;
    confirm.focus();
    document.addEventListener('keydown', onFloatKeyDown, true);
  }

  /* ------------------------------------------------------------------ *
   * Readings, the tool tray, and the indicator chart
   * ------------------------------------------------------------------ */

  function renderReadings(state) {
    readingsHost.innerHTML = '';
    const title = document.createElement('h3');
    title.textContent = 'Readings';
    readingsHost.appendChild(title);

    if (state.readings.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'readings-panel__empty';
      empty.textContent = 'Dip a tool to see its reading here.';
      readingsHost.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    for (const reading of state.readings) {
      const item = document.createElement('li');
      item.className = 'readings-panel__item';
      item.textContent = reading.text;
      list.appendChild(item);
    }
    readingsHost.appendChild(list);
  }

  // Seven curated bands: a pH range paired with the colour universal
  // indicator actually turns in it. A wall chart to check a reading
  // against, not a reading of any particular vessel.
  const INDICATOR_BANDS = [
    { hex: '#C0392B', label: '0–3 red' },
    { hex: '#E67E22', label: '3–5 orange' },
    { hex: '#F1C40F', label: '5–6.5 yellow' },
    { hex: '#27AE60', label: '7 green' },
    { hex: '#16A085', label: '7.5–9 blue-green' },
    { hex: '#2471A3', label: '9–11 blue' },
    { hex: '#7D3C98', label: '11–14 purple' },
  ];

  function buildIndicatorChart() {
    const wrap = document.createElement('div');
    wrap.className = 'indicator-chart';

    const title = document.createElement('h3');
    title.textContent = 'Universal indicator chart';
    wrap.appendChild(title);

    const bar = document.createElement('div');
    bar.className = 'indicator-chart__bar';
    const labels = document.createElement('div');
    labels.className = 'indicator-chart__labels';
    for (const band of INDICATOR_BANDS) {
      const segment = document.createElement('span');
      segment.className = 'indicator-chart__segment';
      segment.style.background = band.hex;
      bar.appendChild(segment);

      const label = document.createElement('span');
      label.className = 'indicator-chart__label';
      label.textContent = band.label;
      labels.appendChild(label);
    }
    wrap.append(bar, labels);
    return wrap;
  }

  function renderToolTray(state) {
    const section = document.createElement('section');
    section.className = 'tool-tray-section';

    const tray = document.createElement('div');
    tray.className = 'tool-tray';

    const title = document.createElement('h3');
    title.textContent = 'Tool tray';
    tray.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'tool-tray__grid';
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
      grid.appendChild(button);
    }
    tray.appendChild(grid);

    const hint = document.createElement('p');
    hint.className = 'tool-tray__hint';
    hint.textContent = state.selectedToolId
      ? 'Select a vessel and press Dip — the reading appears in Readings.'
      : 'Pick up a tool, then select a vessel and press Dip.';
    tray.appendChild(hint);

    section.append(tray, buildIndicatorChart());
    return section;
  }

  subscribe(render);
  render();

  return { render };
}

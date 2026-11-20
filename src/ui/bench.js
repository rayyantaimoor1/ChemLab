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
  playFumes,
  playGasEvolution,
  playPrecipitate,
  playPourStream,
  tickNumber,
  setFlameLevel,
  shrinkAway,
  spreadColour,
  shakeLayers,
  prefersReducedMotion,
  particlesFor,
  getEffectsTier,
} from './effects.js';
// How a pour looks: lip, tilt, stream, splash (BUILD_UI.md UI.6.2).
import { pourPath, POUR } from './pour-path.js';
// One drop, and swirl or stir (BUILD_UI.md UI.6.3).
import { DROP_ML, mixVerbFor } from './dropwise.js';
// Reading the meniscus at eye level, and parallax (BUILD_UI.md UI.7.2).
import { readingFor, readingNote, lensSvg } from './meniscus.js';
// The lab's sounds, when they are switched on (UI.9).
import { playSound, setBoiling } from './sound.js';
// A solid from the shelf drawn as what it is - ribbon, granules, chips -
// from its curated form (BUILD_UI.md UI.3.3).
import { solidSvg, solidBox, shelfSolidLabel } from './solid-shapes.js';
// A reaction's solid drawn by its curated texture, where its kind puts it
// (BUILD_UI.md UI.3.4).
import { settledSvg, settledBox, smokeSvg, hazeOpacity, formingStyle, textureOf } from './precipitate-shapes.js';
// A thermometer standing in the liquid, read against its scale (UI.4.3).
import { thermometerSvg, thermometerGeometry, columnFraction, offScale, SCALE_MAX_C, SCALE_MIN_C } from './thermometer.js';
import { solidLabel } from './appearance.js';
// Where gas bubbles form, and how fast (BUILD_UI.md UI.5.2).
import { paceFor, bubbleSourceFor } from './gas-bubbles.js';
// Coloured gases above the liquid, and where smoke forms (BUILD_UI.md UI.5.3).
import { gasNoteText, fumesNoteText, smokeFormsInside, GAS_TINT } from './gas-look.js';
// The retort stand's clamp and base (BUILD_UI.md UI.6.1).
import { STAND } from './stand.js';
// The shape of each vessel, its printed scale, and how high a volume of
// liquid comes inside it (BUILD_UI.md UI.2) - all in glassware.js.
import { glassGeometry, frontSvg, backSvg, liquidFraction, liquidPathPx } from './glassware.js';
import { liquidFill } from './liquid-colour.js';

// A vessel reads "nearly full" at this fraction of its capacity.
const NEARLY_FULL_FRACTION = 0.9;

/* How a liquid is painted - its clarity, and how deep its colour looks
   through this particular glass - is decided in liquid-colour.js
   (BUILD_UI.md UI.3.2). It never changes WHICH colour: that is the curated
   one, named in the label beside the glass (UI.md section 5). */

// How far outside a piece of furniture a dragged vessel still counts as
// being dropped onto it. Generous above (a tall vessel is grabbed near its
// top, well above the tripod it is aimed at) and tight below.
const EQUIPMENT_HIT_PAD = { x: 30, top: 90, bottom: 24 };
// How far above a vessel's mouth a held glass still pours into it (UI.6.2).
const POUR_REACH_PX = 160;

// The control strip along the foot of the bench, and a little breathing
// room under the lowest object.
const CONTROL_STRIP_H = 62;

// One drop from a burette really is about 0.05 mL, which is why a titration
// can be taken right up to the drop that changes the colour.
const BURETTE_DROP_ML = DROP_ML;
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
        refs.front?.remove();
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

    resolveLabelOverlaps();
    renderCloseLook(state);

    renderControlStrip(state);
    renderReadings(state);
    // The boil sounds while anything on the bench is boiling (UI.9).
    setBoiling(state.containers.some((c) => c.appearance?.heat?.stage === 'boiling'));
    traceStrip.hidden = !state.traceEnabled;
    traceValue.textContent = state.traceLine;

    toolTrayHost.innerHTML = '';
    toolTrayHost.appendChild(renderToolTray(state));
  }

  /* ------------------------------------------------------------------ *
   * Labels that never overlap (BUILD_UI.md UI.1.4)
   *
   * Every object carries its label card beside it, and on a bench 680 px
   * wide with up to eleven objects the cards inevitably meet. The selected
   * object always keeps its full card, on top. Every other card tries, in
   * order: full; compact (name and colour only - the colour name always
   * stays, UI.md section 5); compact on the other side of its object;
   * compact lifted above it. It takes the first that covers no other card
   * and no other object's glass. Measured from the real layout, so it
   * works for any vessel size and any label length.
   * ------------------------------------------------------------------ */

  const LABEL_TRIES = [
    { compact: false, side: 'right', lift: 0 },
    { compact: true, side: 'right', lift: 0 },
    { compact: true, side: 'left', lift: 0 },
    { compact: true, side: 'right', lift: 1 },
    { compact: true, side: 'left', lift: 1 },
  ];

  const FULL_TRIES = [
    { compact: false, side: 'right', lift: 0 },
    { compact: false, side: 'left', lift: 0 },
    { compact: false, side: 'right', lift: 1 },
    { compact: false, side: 'left', lift: 1 },
  ];

  function resolveLabelOverlaps() {
    const objects = [
      ...[...vesselEls.entries()].map(([id, refs]) => ({ id, el: refs.el, body: refs.vessel })),
      ...[...equipmentEls.entries()].map(([id, refs]) => ({ id, el: refs.el, body: refs.el.firstElementChild })),
    ].filter((o) => o.el.querySelector(':scope > .object-chip'));
    if (objects.length === 0) return;

    for (const o of objects) {
      o.chip = o.el.querySelector(':scope > .object-chip');
      applyLabelTry(o, LABEL_TRIES[0]);
    }

    const bounds = canvas.getBoundingClientRect();
    const bodies = objects.map((o) => ({ id: o.id, rect: o.body.getBoundingClientRect() }));
    const placed = [];
    const isFixed = (o) => o.el.classList.contains('is-selected') || (drag && drag.id === o.id);

    // The selected (or dragged) object first, then left to right.
    const ordered = [...objects].sort((a, b) => (isFixed(b) - isFixed(a))
      || (a.el.getBoundingClientRect().left - b.el.getBoundingClientRect().left));

    for (const o of ordered) {
      // The first try that is clear wins. If none is, the one that covers
      // least: another card counts most, then another object's glass, then
      // running off the bench. The selected (or dragged) object only tries
      // its FULL card - on either side, or lifted - so picking a vessel
      // never shrinks what it says, but it does stop it hiding a neighbour.
      let best = null;
      for (const attempt of isFixed(o) ? FULL_TRIES : LABEL_TRIES) {
        applyLabelTry(o, attempt);
        const rect = o.chip.getBoundingClientRect();
        const cost = 4 * placed.reduce((sum, p) => sum + overlapArea(rect, p), 0)
          + bodies.reduce((sum, b) => sum + (b.id === o.id ? 0 : overlapArea(rect, b.rect)), 0)
          + outsideArea(rect, bounds);
        if (!best || cost < best.cost) best = { attempt, cost };
        if (cost === 0) break;
      }
      applyLabelTry(o, best.attempt);
      placed.push(o.chip.getBoundingClientRect());
    }
  }

  function overlapArea(a, b) {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 1 && h > 1 ? w * h : 0;
  }

  function outsideArea(rect, bounds) {
    const w = rect.right - rect.left;
    const h = rect.bottom - rect.top;
    const offX = Math.max(0, bounds.left - rect.left) + Math.max(0, rect.right - bounds.right);
    const offY = Math.max(0, bounds.top - rect.top);
    return offX * h + offY * w;
  }

  function applyLabelTry(o, attempt) {
    o.chip.classList.toggle('is-compact', attempt.compact);
    o.el.classList.toggle('label-left', attempt.side === 'left');
    o.chip.style.transform = attempt.lift
      ? `translateY(-${Math.round(o.body.getBoundingClientRect().height + 6)}px)`
      : '';
  }

  function overlaps(a, b) {
    return a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
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
  function hitVessel(event, exceptId, { above = 0 } = {}) {
    for (const [id, refs] of vesselEls) {
      if (id === exceptId) continue;
      const rect = refs.glass.getBoundingClientRect();
      if (
        event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top - above && event.clientY <= rect.bottom
      ) {
        return id;
      }
    }
    return null;
  }

  /**
   * Which vessel a held glass would pour into: one it is over, or - when it
   * is over no furniture either - one whose mouth it is held above, so a
   * pour can be made from a height (UI.6.2; too high and it splashes).
   */
  function pourTargetAt(event, exceptId) {
    return hitVessel(event, exceptId)
      || (hitEquipment(event) ? null : hitVessel(event, exceptId, { above: POUR_REACH_PX }));
  }

  /** Which piece of furniture the pointer is over, generously padded. */
  function hitEquipment(event, excludeId = null) {
    for (const [id, refs] of equipmentEls) {
      if (id === excludeId) continue;
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
    // A glass that is being poured from is in the student's hand already.
    if (kind === 'vessel' && vesselEls.get(id)?.pouring) return;
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
      // What tips while it is held over another vessel: the whole drawing,
      // so the walls, rim and spout tip with the liquid inside them.
      glass: kind === 'vessel' ? vesselEls.get(id)?.vessel : null,
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
    const over = pourTargetAt(event, drag.id);
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
      // A white tile dropped on a retort stand lies on its base (UI.6.1).
      const item = getState().equipment.find((q) => q.id === finished.id);
      const onto = item?.kind === 'tile' ? hitEquipment(event, finished.id) : null;
      const stand = onto ? getState().equipment.find((q) => q.id === onto && q.kind === 'stand') : null;
      if (stand) {
        dispatch.placeTileOnStand(finished.id, stand.id);
        return;
      }
      if (finished.moved) dispatch.moveEquipment(finished.id, finished.x, finished.y);
      else render();
      return;
    }

    if (finished.glass) finished.glass.style.transform = '';

    const pourTarget = pourTargetAt(event, finished.id);
    const standTarget = pourTarget ? null : hitEquipment(event);

    // A burette dropped over a vessel is clamped above it, not poured.
    if (pourTarget && finished.type === 'burette') {
      dispatch.clampOver(finished.id, pourTarget);
      playSound('clink');
      return;
    }

    if (pourTarget) {
      const source = getState().containers.find((c) => c.id === finished.id);
      // Where it was let go: a pour starts from there, and from that height
      // (UI.6.2) - too high and it splashes.
      const release = { x: finished.x, y: finished.y };
      if (!source || source.contents.length === 0) {
        finished.el.style.transform = `translate3d(${finished.startX}px, ${finished.startY}px, 0)`;
        render();
        return;
      }
      const state = getState();
      if (state.dispenseMode === 'quick') {
        executePour(finished.id, pourTarget, Math.min(state.quickAmount, source.volumeMl), release);
      } else {
        // Set down again while the amount is chosen; the pour then starts
        // from where it stands, at the height it was let go.
        finished.el.style.transform = `translate3d(${finished.startX}px, ${finished.startY}px, 0)`;
        openPourPanel(finished.id, pourTarget, { ...release, fromHome: true });
      }
      return;
    }

    if (standTarget) {
      dispatch.standOn(finished.id, standTarget);
      playSound('clink');
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
      // The gauze on the tripod, which spreads the flame under a beaker.
      part('burner-gauze');
      part('burner-leg', {}).classList.add('equipment__part--burner-leg-left');
      part('burner-leg', {}).classList.add('equipment__part--burner-leg-right');
      part('burner-foot');
      part('burner-barrel');
      // The air hole in the barrel, which the collar is turned to cover or
      // uncover (BUILD_UI.md UI.4.1).
      part('burner-airhole');
      part('burner-collar');
      part('burner-hose');
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
      // The back of the basin, and the water and ice behind the vessel. The
      // water and ice in FRONT of it are the bath's front (bathFront below).
      part('ice-basin');
      part('bath-water-back');
      part('ice-cube').classList.add('equipment__part--ice-cube-1');
      part('ice-cube').classList.add('equipment__part--ice-cube-2');
      part('ice-cube').classList.add('equipment__part--ice-cube-3');
    } else if (kind === 'water_bath') {
      // A glass trough of water on an electric hotplate (UI.4.5). Glass, so
      // what happens in the vessel stays in sight.
      part('hotplate');
      part('hotplate-light');
      part('hotplate-knob');
      part('bath-trough');
      part('bath-water-back');
    } else if (kind === 'stand') {
      // A retort stand: base plate, rod, and a boss carrying the clamp,
      // whose height follows whatever it grips (--grip-y, stand.js).
      part('stand-base');
      part('stand-tile');
      part('stand-rod');
      part('stand-boss');
      part('stand-arm');
      part('stand-jaw').classList.add('equipment__part--stand-jaw-near');
      part('stand-jaw').classList.add('equipment__part--stand-jaw-far');
    } else if (kind === 'tile') {
      part('tile');
    } else if (kind === 'fume_cupboard') {
      // A fume cupboard (UI.8.3): the cabinet, its lit back panel and white
      // worktop, the extraction duct on top and its airflow light. The
      // sash in front of the vessel is the cupboard's front (below).
      part('hood-duct');
      part('hood-cabinet');
      part('hood-back');
      part('hood-worktop');
      part('hood-light');
      const air = part('hood-air');
      for (let k = 0; k < 3; k += 1) {
        const streak = document.createElement('span');
        streak.style.left = `${22 + k * 28}%`;
        streak.style.animationDelay = `${k * 700}ms`;
        air.appendChild(streak);
      }
    } else if (kind === 'rack') {
      part('rack-rail').classList.add('equipment__part--rack-rail-top');
      part('rack-rail').classList.add('equipment__part--rack-rail-bottom');
      part('rack-leg').classList.add('equipment__part--rack-leg-left');
      part('rack-leg').classList.add('equipment__part--rack-leg-right');
      for (let k = 0; k < 3; k += 1) part('rack-slot', { left: `${26 + k * 26}px` });
    }

    return art;
  }

  /**
   * The front of a bath: the water and ice standing in front of the vessel,
   * so a vessel stood in a bath is IN it - water round its lower half, ice
   * floating in front (BUILD_UI.md UI.4.5). Its own element on the canvas,
   * stacked above the vessel, and never in the way of a click.
   */
  function bathFront(kind) {
    const front = document.createElement('div');
    front.className = `equipment-front equipment-front--${kind}`;
    if (kind === 'fume_cupboard') {
      // The glass sash, raised to leave a working opening below it, and the
      // gas, fumes or smoke from the vessel inside rising into the duct.
      const sash = document.createElement('span');
      sash.className = 'equipment-front__sash';
      const draw = document.createElement('span');
      draw.className = 'equipment-front__extract';
      for (let k = 0; k < 5; k += 1) {
        const wisp = document.createElement('span');
        wisp.style.left = `${38 + (k % 3) * 9}%`;
        wisp.style.animationDelay = `${k * 420}ms`;
        draw.appendChild(wisp);
      }
      front.append(draw, sash);
      return front;
    }
    const span = (className) => {
      const s = document.createElement('span');
      s.className = className;
      front.appendChild(s);
      return s;
    };
    span('equipment-front__water');
    span('equipment-front__surface');
    if (kind === 'ice_bath') {
      for (let k = 1; k <= 4; k += 1) span(`equipment-front__ice equipment-front__ice--${k}`);
    } else {
      // Bubbles for a boiling water bath, wisps of steam for a hot one.
      const bubbles = span('equipment-front__bubbles');
      for (let k = 0; k < 6; k += 1) {
        const b = document.createElement('span');
        b.style.left = `${8 + k * 16}%`;
        b.style.animationDelay = `${(k * 230) % 900}ms`;
        bubbles.appendChild(b);
      }
      const steam = span('equipment-front__steam');
      for (let k = 0; k < 3; k += 1) {
        const w = document.createElement('span');
        w.style.left = `${18 + k * 28}%`;
        w.style.animationDelay = `${k * 700}ms`;
        steam.appendChild(w);
      }
    }
    span('equipment-front__wall');
    return front;
  }

  function equipmentLevelText(item) {
    if (item.kind === 'burner') {
      const air = item.airHole === 'closed' ? 'air hole closed' : 'air hole open';
      return item.level === 0 ? `gas off · ${air}` : `level ${item.level} · ${air}`;
    }
    if (item.kind === 'ice_bath') return 'melting ice, about 2 °C';
    if (item.kind === 'stand') return item.tile ? 'clamp · white tile on the base' : 'clamp · drop a white tile on the base';
    if (item.kind === 'tile') return 'drop it on a retort stand, or stand a flask on it';
    if (item.kind === 'fume_cupboard') return 'airflow on · stand a vessel inside';
    if (item.kind === 'water_bath') {
      if (item.level === 0) return 'off · water at room temperature';
      return item.bathC >= 100 ? 'boiling water, 100 °C' : `water at ${item.bathC} °C`;
    }
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
    if (item.kind === 'ice_bath' || item.kind === 'water_bath' || item.kind === 'fume_cupboard') {
      refs.front = bathFront(item.kind);
      canvas.appendChild(refs.front);
    }
    equipmentEls.set(item.id, refs);
    return refs;
  }

  function updateEquipment(refs, item, state) {
    refs.el.style.transform = `translate3d(${item.position.x}px, ${item.position.y}px, 0)`;
    refs.el.classList.toggle('is-selected', state.selectedEquipmentId === item.id);
    refs.status.textContent = equipmentLevelText(item);
    refs.art.classList.toggle('equipment__art--lit', item.kind === 'burner' && item.level > 0);
    if (refs.front) refs.front.style.transform = refs.el.style.transform;
    if (item.kind === 'fume_cupboard') {
      // Drawn away (UI.8.3): while the vessel inside holds a gas, fumes or
      // smoke, wisps rise from it into the duct - in the gas's own colour
      // when it has one.
      const inside = state.containers.find((c) => c.standOn === item.id);
      const a = inside?.appearance;
      const hasGas = !!inside && (inside.contents || []).some((c) => engine.getChemical(c.id)?.state === 'gas');
      const extracting = !!a && (hasGas || (a.fumes || []).length > 0 || a.precipitate?.kind === 'smoke' || (a.gases || []).length > 0);
      const colour = a?.gases?.[0]?.colorHex || a?.fumes?.[0]?.colorHex || (a?.precipitate?.kind === 'smoke' ? a.precipitate.colorHex : null) || '#E6EBEC';
      refs.front.classList.toggle('is-extracting', extracting);
      refs.front.style.setProperty('--extract-colour', colour);
    }
    if (item.kind === 'stand') {
      // The clamp grips at the height stand.js chose, with its jaws either
      // side of what it holds; with nothing in it, it waits at mid-height.
      const held = state.containers.find((c) => c.standOn === item.id && c.standRole === 'clamp');
      const heldW = held ? (glassGeometry(held.type, held.capacityMl)?.w ?? 20) : 20;
      refs.art.style.setProperty('--grip-y', `${item.gripY ?? 150}px`);
      refs.art.style.setProperty('--jaw-gap', `${Math.round(heldW / 2)}px`);
      refs.art.style.setProperty('--clamp-x', `${STAND.clampX}px`);
      refs.art.classList.toggle('equipment__art--tiled', !!item.tile);
    }
    if (item.kind === 'water_bath') {
      refs.art.classList.toggle('equipment__art--on', item.level > 0);
      refs.front.classList.toggle('is-hot', item.bathC >= 60);
      refs.front.classList.toggle('is-boiling', item.bathC >= 100);
    }
    if (item.kind === 'burner') {
      refs.art.style.setProperty('--burner-level', String(item.level));
      refs.art.classList.toggle('equipment__art--luminous', item.airHole === 'closed');
      // A vessel on the tripod stops the flame: it spreads under the base
      // rather than reaching up through the glass.
      refs.el.classList.toggle('has-vessel', !!item.standingVesselId);
    }
  }

  /* ------------------------------------------------------------------ *
   * Vessels
   * ------------------------------------------------------------------ */

  function ensureVesselRefs(container) {
    const existing = vesselEls.get(container.id);
    if (existing) return existing;
    const refs = buildVesselRefs(container, { interactive: true });
    vesselEls.set(container.id, refs);
    canvas.appendChild(refs.el);
    return refs;
  }

  /**
   * Builds one drawing of a vessel. The bench has one per vessel; the close
   * look (UI.7.1) builds a second for the vessel it shows, painted by the
   * very same updateVessel, so the two can never disagree. Only the bench's
   * can be dragged.
   */
  function buildVesselRefs(container, { interactive }) {
    const el = document.createElement('div');
    el.className = 'bench-object vessel-object';
    el.dataset.containerId = container.id;

    const vessel = document.createElement('div');
    vessel.className = `vessel vessel--${container.type}`;

    // The glass itself, drawn once in SVG to the vessel's real proportions:
    // the back of the glass behind the liquid, then the liquid, then the
    // walls, rim, highlight and printed scale in front of it.
    const geometry = glassGeometry(container.type, container.capacityMl);
    if (geometry) {
      vessel.style.width = `${geometry.w}px`;
      vessel.style.height = `${geometry.h}px`;
      // How far the inside floor sits above the bottom of the drawing, for
      // the settled solid and the bubbles that start from it.
      vessel.style.setProperty('--vessel-base', `${geometry.h - geometry.floorY}px`);
    }

    const vesselShadow = document.createElement('div');
    vesselShadow.className = 'vessel__shadow';
    if (geometry) {
      const shadowW = Math.round(geometry.w * 1.25);
      vesselShadow.style.width = `${shadowW}px`;
      vesselShadow.style.marginLeft = `${-shadowW / 2}px`;
    }
    vessel.appendChild(vesselShadow);
    vessel.insertAdjacentHTML('beforeend', backSvg(container.type, container.capacityMl));

    const liquidBase = document.createElement('div');
    liquidBase.className = 'vessel__liquid vessel__liquid--base';
    const liquidIncoming = document.createElement('div');
    liquidIncoming.className = 'vessel__liquid vessel__liquid--incoming';
    // The plume of a newly added colour, before it has mixed (UI.3.5).
    const plume = document.createElement('div');
    plume.className = 'vessel__plume';
    // Liquids that do not mix: the upper layers, drawn over the bottom one
    // (the base liquid), and the emulsion a shake turns them into (UI.3.6).
    const layerBox = document.createElement('div');
    layerBox.className = 'vessel__layer vessel__layers';
    // What heat does that you can see (BUILD_UI.md UI.4.2): convection
    // currents, bubbles forming then a rolling boil, droplets condensing on
    // the cool glass above, and steam at the mouth.
    const convection = document.createElement('div');
    convection.className = 'vessel__convection';
    for (let k = 0; k < 3; k += 1) convection.appendChild(document.createElement('span'));
    const boil = document.createElement('div');
    boil.className = 'vessel__boil';
    for (let k = 0; k < 12; k += 1) {
      const bubble = document.createElement('span');
      bubble.style.left = `${8 + ((k * 37) % 84)}%`;
      bubble.style.animationDelay = `${(k * 173) % 1100}ms`;
      boil.appendChild(bubble);
    }
    const condensation = document.createElement('div');
    condensation.className = 'vessel__condensation';
    // A very hot dry solid glowing (UI.4.4): a static overlay, faded in.
    const glow = document.createElement('div');
    glow.className = 'vessel__glow';
    const steam = document.createElement('div');
    steam.className = 'vessel__steam';
    for (let k = 0; k < 4; k += 1) {
      const puff = document.createElement('span');
      puff.style.left = `${20 + k * 18}%`;
      puff.style.animationDelay = `${k * 450}ms`;
      steam.appendChild(puff);
    }
    const emulsion = document.createElement('div');
    emulsion.className = 'vessel__emulsion';
    const precipitateLayer = document.createElement('div');
    precipitateLayer.className = 'vessel__layer vessel__precipitate';
    // The solid that stays once the grains have fallen (BUILD_UI.md UI.1.3).
    // Drawn from appearance.precipitate on every render, so it is always
    // what is really in the vessel - not left over from an animation.
    const sediment = document.createElement('div');
    sediment.className = 'vessel__sediment';
    // A fine precipitate still hanging in the liquid it formed in.
    const haze = document.createElement('div');
    haze.className = 'vessel__haze';
    // A wooden test-tube holder, gripping a tube held over a flame (UI.6.1).
    const holder = document.createElement('div');
    holder.className = 'vessel__holder';
    holder.innerHTML = '<span class="vessel__holder-clip"></span><span class="vessel__holder-handle"></span>';
    // Smoke hangs in the air above the mouth, outside the glass.
    const smoke = document.createElement('div');
    smoke.className = 'vessel__smoke';
    // Coloured gas gathered in the space above the liquid (UI.5.3).
    const headspace = document.createElement('div');
    headspace.className = 'vessel__headspace';
    // A cloud of smoke or vapour leaving the mouth (UI.5.3).
    const fumes = document.createElement('div');
    fumes.className = 'vessel__fumes';
    // A fuming liquid's mist or vapour, rising from the mouth while it is
    // in the vessel (UI.5.3).
    const fuming = document.createElement('div');
    fuming.className = 'vessel__fuming';
    for (let k = 0; k < 3; k += 1) {
      const wisp = document.createElement('span');
      wisp.style.left = `${25 + k * 22}%`;
      wisp.style.animationDelay = `${k * 900}ms`;
      fuming.appendChild(wisp);
    }
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
    // Gas streaming off each rod while the current is on (UI.5.2).
    const streamLayer = document.createElement('div');
    streamLayer.className = 'vessel__layer vessel__streams';
    electrodeLayer.append(cathodeRod, anodeRod, streamLayer, ionLayer);

    const glass = document.createElement('div');
    glass.className = 'vessel__glass';
    // Everything inside is cut to the INSIDE of the glass, so liquid runs up
    // the curve of a test tube and into the cone of a flask (UI.2.4).
    if (geometry) glass.style.clipPath = `path('${geometry.innerPath}')`;
    // Shelf solids sit on the floor BEHIND the liquid, so a clear solution
    // shows them, a coloured one tints them and a milky one hides them -
    // as it would in real glass.
    const solidLayer = document.createElement('div');
    solidLayer.className = 'vessel__layer vessel__shelf-solids';
    glass.append(solidLayer, liquidBase, liquidIncoming, plume, layerBox, emulsion, convection, boil, condensation, glow, haze, headspace, sediment, precipitateLayer, bubbleLayer, gasLayer, electrodeLayer, pourMouth);
    vessel.appendChild(glass);
    vessel.insertAdjacentHTML('beforeend', frontSvg(container.type, container.capacityMl));
    vessel.appendChild(smoke);
    vessel.appendChild(holder);
    vessel.appendChild(fumes);
    vessel.appendChild(fuming);
    vessel.appendChild(steam);
    // Soot from a luminous flame, on the outside of the glass (UI.4.1).
    const soot = document.createElement('div');
    soot.className = 'vessel__soot';
    vessel.appendChild(soot);
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

    // The shelf solids in the vessel, named with their colour (UI.md §5).
    const shelfSolidNote = document.createElement('span');
    shelfSolidNote.className = 'object-chip__precipitate object-chip__shelf-solid';
    shelfSolidNote.hidden = true;

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

    // What heat is visibly doing, in words too (UI.md section 8: nothing is
    // shown by animation alone).
    const heatNote = document.createElement('span');
    heatNote.className = 'object-chip__power object-chip__heat';
    heatNote.hidden = true;
    // A coloured gas, always named (UI.5.3).
    const gasNote = document.createElement('span');
    gasNote.className = 'object-chip__power object-chip__gas';
    gasNote.hidden = true;

    chip.append(nameRow, readout, colourRow, shelfSolidNote, precipitateLabel, heatNote, gasNote, capacityChip, standNote, readingRow, powerNote);
    el.appendChild(chip);

    // The flame indicator lives with the burner now, so a vessel only
    // carries this to drive setFlameLevel's shared bookkeeping.
    const flame = document.createElement('span');
    flame.className = 'fx-flame';
    flame.hidden = true;
    el.appendChild(flame);

    if (interactive) {
      el.addEventListener('pointerdown', (event) => beginDrag('vessel', container.id, event, el));
      // Lift it up and look closely (UI.7.1).
      el.addEventListener('dblclick', () => openCloseLook(container.id));
    }
    wireReagentDrop(el, container.id);

    const refs = {
      el, vessel, glass, liquidBase, liquidIncoming, sediment, precipitateLayer, bubbleLayer, gasLayer, pourMouth,
      volumeEl, tempEl, phEl, colorSwatch, colorText, colourRow, precipitateLabel, capacityChip,
      standNote, vesselShadow, flame, electrodeLayer, ionLayer, streamLayer,
      readingRow, readingSwatch, readingText, powerNote,
      solidLayer, shelfSolidNote, solidEls: new Map(), haze, smoke, headspace, fumes, fuming, gasNote, holder, cathodeRod,
      plume, mixing: null, layerBox, emulsion, shaking: false, soot,
      convection, boil, condensation, steam, heatNote, glow,
      thermometer: null, thermometerColumn: null,
      dipEl: null, dipTool: null,
    };
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

  /**
   * The liquid's surface is drawn as an ellipse exactly as wide as the
   * inside of the glass at that height, so its ends meet the walls the way
   * a real meniscus does - wide across a beaker, narrow in a flask's neck.
   */
  function setSurfaceWidth(refs, container) {
    const geometry = glassGeometry(container.type, container.capacityMl);
    const y = geometry && geometry.surfaceY(container.volumeMl);
    if (y === null || y === undefined) return;
    const width = `${(2 * geometry.innerHalfAt(y)).toFixed(1)}px`;
    refs.liquidBase.style.setProperty('--surface-w', width);
    refs.liquidIncoming.style.setProperty('--surface-w', width);
  }

  /** The paint for a vessel's liquid: its curated colour and clarity, seen
   *  through as much liquid as this glass holds across (liquid-colour.js). */
  function paintFor(container) {
    // Two liquids that do not mix: the base liquid is the bottom layer, and
    // updateLayers draws the ones above it.
    const layers = container.appearance.layers;
    const look = layers ? layers[layers.length - 1] : container.appearance;
    return liquidFill(look.colorHex, {
      clarity: look.clarity,
      pathPx: liquidPathPx(container.type, container.capacityMl, container.volumeMl),
    });
  }

  /**
   * Draws the upper layers of liquids that do not mix, each as deep as its
   * own volume in this glass's real shape (glassware.js), lightest on top.
   * A missing amount counts as an equal share.
   */
  function updateLayers(refs, container) {
    const layers = container.appearance.layers;
    const geometry = glassGeometry(container.type, container.capacityMl);
    if (!layers || !geometry || !(container.volumeMl > 0)) {
      refs.layerBox.hidden = true;
      refs.layerBox.innerHTML = '';
      return;
    }
    refs.layerBox.hidden = false;
    const total = container.volumeMl;
    const given = layers.map((layer) => layer.volumeMl);
    const known = given.filter((v) => v > 0).reduce((sum, v) => sum + v, 0);
    const volumes = given.map((v) => (v > 0 && known > 0 ? (v / known) * total : total / layers.length));

    // The top of each layer, from the bottom up.
    const tops = new Array(layers.length);
    let below = 0;
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      below += volumes[i];
      tops[i] = geometry.surfaceY(below);
    }
    const signature = layers.map((l, i) => `${l.liquid}:${l.colorHex}:${Math.round(tops[i])}`).join('|');
    if (refs.layerBox.dataset.signature === signature) return;
    refs.layerBox.dataset.signature = signature;
    refs.layerBox.innerHTML = '';
    const path = liquidPathPx(container.type, container.capacityMl, container.volumeMl);
    for (let i = 0; i < layers.length - 1; i += 1) {
      const el = document.createElement('div');
      el.className = 'liquid-layer';
      el.style.top = `${Math.round(tops[i])}px`;
      el.style.height = `${Math.max(2, Math.round(tops[i + 1] - tops[i]))}px`;
      el.style.background = liquidFill(layers[i].colorHex, { clarity: layers[i].clarity, pathPx: path });
      refs.layerBox.appendChild(el);
    }
    // A shake turns the whole liquid into a cloudy emulsion of droplets.
    refs.emulsion.style.top = `${Math.round(tops[0])}px`;
    refs.emulsion.style.height = `${Math.round(geometry.floorY - tops[0])}px`;
    refs.emulsion.style.background = liquidFill(layers[0].colorHex, { clarity: 'cloudy', pathPx: path });
  }

  /**
   * Draws each shelf solid on the vessel floor, side by side, each as wide as
   * its share of the floor. A solid that has gone while the vessel still has
   * something in it was used up by a reaction, so it shrinks away; one that
   * went because the vessel was emptied just goes.
   */
  function updateShelfSolids(refs, container) {
    const solids = container.appearance.shelfSolids || [];
    refs.shelfSolidNote.hidden = solids.length === 0;
    refs.shelfSolidNote.textContent = solids.map(shelfSolidLabel).join('; ');

    const geometry = glassGeometry(container.type, container.capacityMl);
    if (!geometry) return;
    const floor = Math.max(10, 2 * geometry.innerHalfAt(geometry.floorY - 5) - 4);
    const share = floor / Math.max(1, solids.length);
    const keep = new Set();

    solids.forEach((solid, index) => {
      keep.add(solid.id);
      const box = solidBox(share, solid.amount, solid.form);
      const left = geometry.cx - floor / 2 + index * share + (share - box.w) / 2;
      const signature = `${solid.form}:${box.w}x${box.h}:${solid.colorHex}`;
      let el = refs.solidEls.get(solid.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'shelf-solid';
        refs.solidLayer.appendChild(el);
        refs.solidEls.set(solid.id, el);
      }
      if (el.dataset.signature !== signature) {
        el.innerHTML = solidSvg(solid, box);
        el.dataset.signature = signature;
      }
      el.style.left = `${Math.round(left)}px`;
      el.style.bottom = `${Math.round(geometry.h - geometry.floorY)}px`;
    });

    for (const [id, el] of refs.solidEls) {
      if (keep.has(id)) continue;
      refs.solidEls.delete(id);
      if (container.contents.length > 0) shrinkAway(el);
      else el.remove();
    }
  }

  /**
   * Places a reaction's solid. Smoke hangs above the mouth; a metal deposit
   * coats the cathode while the current is on; anything else rests on the
   * floor, except a gelatinous floc, which hangs in the lower liquid. A fine
   * precipitate also leaves the liquid hazy, because fine particles take
   * a long time to settle.
   */
  function updatePrecipitate(refs, container, solid) {
    const geometry = glassGeometry(container.type, container.capacityMl);
    const onCathode = !!solid && solid.kind === 'deposit' && container.electrified === true;
    const isSmoke = !!solid && solid.kind === 'smoke';
    const onFloor = !!solid && !onCathode && !isSmoke;
    // Smoke from two gases meeting fills the vessel instead (updateGases).
    if (!isSmoke) refs.smokeInside = false;

    // The cathode wears the metal it is collecting.
    refs.cathodeRod.style.background = onCathode
      ? `linear-gradient(90deg, ${solid.colorHex}, ${solid.colorHex} 60%, rgba(255, 255, 255, 0.35))`
      : '';

    // Smoke above the mouth.
    const smokeKey = isSmoke ? `${solid.id || solid.description}:${solid.colorHex}` : '';
    if (refs.smoke.dataset.key !== smokeKey) {
      refs.smoke.innerHTML = isSmoke && geometry ? smokeSvg(solid, geometry.bodyW * 1.3) : '';
      refs.smoke.dataset.key = smokeKey;
    }
    refs.smoke.classList.toggle('is-visible', isSmoke && !refs.smokeInside);
    updateGases(refs, container, isSmoke && refs.smokeInside ? solid : null);

    // The settled solid, or the hanging floc.
    refs.sediment.classList.toggle('is-visible', onFloor);
    if (onFloor && geometry) {
      const surface = geometry.surfaceY(container.volumeMl);
      const liquidHeight = surface === null ? 0 : geometry.floorY - surface;
      const floorWidth = 2 * geometry.innerHalfAt(geometry.floorY - 4) - 2;
      const box = settledBox(solid, floorWidth, liquidHeight);
      const key = `${solid.id || solid.description}:${solid.kind}:${textureOf(solid)}:${box.w}x${box.h}:${solid.colorHex}`;
      if (refs.sediment.dataset.key !== key) {
        refs.sediment.innerHTML = settledSvg(solid, box);
        refs.sediment.dataset.key = key;
      }
      refs.sediment.style.left = `${Math.round(geometry.cx - box.w / 2)}px`;
      // A little below the floor line, so a round-bottomed tube is filled
      // into its curve; the glass's clip-path trims the rest.
      refs.sediment.style.bottom = `${Math.round(geometry.h - geometry.floorY - 2)}px`;
    }

    // The haze of a fine precipitate, over the whole liquid.
    const haze = onFloor ? hazeOpacity(solid) : 0;
    refs.haze.style.background = haze > 0 ? solid.colorHex : 'transparent';
    refs.haze.style.height = `${liquidFraction(container.type, container.capacityMl, container.volumeMl) * 100}%`;
    refs.haze.style.opacity = String(haze);
  }

  /** The plume runs from the liquid's surface down through it, a third as
   *  wide as the glass, under where a reagent is poured in. */
  function placePlume(refs, container) {
    const geometry = glassGeometry(container.type, container.capacityMl);
    const surface = geometry && geometry.surfaceY(container.volumeMl);
    if (surface === null || surface === undefined) return;
    refs.plume.style.top = `${Math.round(surface)}px`;
    refs.plume.style.height = `${Math.round(geometry.floorY - surface)}px`;
  }

  /**
   * A thermometer standing in the vessel near its right wall, bulb in the
   * liquid, stem rising above the rim. The red column rises by transform
   * (scaleY from the bulb), so a changing temperature never re-lays out.
   */
  function updateThermometer(refs, container) {
    if (!container.thermometerIn) {
      if (refs.thermometer) {
        refs.thermometer.remove();
        refs.thermometer = null;
        refs.thermometerColumn = null;
      }
      return;
    }
    const geometry = glassGeometry(container.type, container.capacityMl);
    if (!geometry) return;
    if (!refs.thermometer) {
      const height = geometry.h + 34;
      const t = thermometerGeometry(height);
      const el = document.createElement('div');
      el.className = 'vessel__thermometer';
      el.innerHTML = thermometerSvg(height);
      const column = document.createElement('span');
      column.className = 'thermometer__column';
      // The column runs from the bulb up to the 110 mark; it is scaled
      // down from that full height to the temperature.
      column.style.left = `${t.stemX + t.stemW / 2 - 1.5}px`;
      column.style.top = `${t.scaleTop}px`;
      column.style.height = `${t.bulbCy - t.scaleTop}px`;
      el.appendChild(column);
      // Bulb near the floor, beside the wall; stem out above the rim.
      const inner = geometry.innerHalfAt(geometry.floorY - 8);
      el.style.left = `${Math.round(geometry.cx + Math.max(0, inner - 12))}px`;
      el.style.top = `${Math.round(geometry.floorY - 4 - (height - 2))}px`;
      refs.vessel.appendChild(el);
      refs.thermometer = el;
      refs.thermometerColumn = column;
      refs.thermometerGeometry = t;
    }
    const t = refs.thermometerGeometry;
    // Fraction of the column (bulb to the 110 mark) that is filled.
    const scaleSpan = t.scaleBottom - t.scaleTop;
    const full = t.bulbCy - t.scaleTop;
    const filled = (t.bulbCy - t.scaleBottom) + columnFraction(container.temperatureC) * scaleSpan;
    refs.thermometerColumn.style.transform = `scaleY(${(filled / full).toFixed(3)})`;
    refs.thermometer.classList.toggle('is-off-scale', offScale(container.temperatureC));
    refs.thermometer.title = offScale(container.temperatureC)
      ? (container.temperatureC > SCALE_MAX_C
        ? `Above ${SCALE_MAX_C} °C - beyond this thermometer. A real glass thermometer would break.`
        : `Below ${SCALE_MIN_C} °C - beyond this thermometer.`)
      : `Thermometer: ${container.temperatureC.toFixed(1)} °C`;
  }

  /** The words for what heat is doing, beside the glass. */
  function heatNoteText(heat) {
    const lines = [];
    if (heat.stage === 'nucleating') lines.push('small bubbles forming on the glass');
    if (heat.stage === 'boiling') lines.push(`boiling (${heat.boilingPointC} °C)`);
    if (heat.stage === 'evaporating') lines.push('giving off vapour');
    if (heat.glow) lines.push(`the solid is ${heat.glow.name}`);
    if (heat.condensation) {
      const colour = heat.condensation.colorName && heat.condensation.colorName !== 'colourless'
        ? `${heat.condensation.colorName.split(',')[0]} ` : '';
      lines.push(`${colour}droplets of ${heat.condensation.name.toLowerCase()} on the cool glass above`);
    }
    // Hot glass looks exactly like cold glass - said in words, because
    // nothing on the glass would show it (UI.4.4).
    if (heat.hotGlass) lines.push('hot - hot glass looks just like cold glass');
    return lines.join('; ');
  }

  /**
   * Convection, bubbles, a rolling boil, steam and condensation, from
   * heat-look.js. All drawn with transform and opacity only; static when
   * animation is reduced, so the state still shows.
   */
  /**
   * Coloured gas gathered above the liquid - densest just over the surface,
   * as these heavy gases are - in its curated colour, and named on the
   * label (BUILD_UI.md UI.5.3). A smoke made by two gases meeting fills the
   * same space as a white cloud.
   */
  function updateGases(refs, container, insideSmoke = null) {
    const geometry = glassGeometry(container.type, container.capacityMl);
    const gases = container.appearance.gases || [];
    const hasLiquid = container.volumeMl > 0;
    const layers = gases.map((g) => g.colorHex);
    if (insideSmoke) layers.push(insideSmoke.colorHex || '#F4F4F2');

    if (geometry) {
      const surface = hasLiquid ? geometry.surfaceY(container.volumeMl) : geometry.floorY;
      refs.headspace.style.height = `${Math.max(0, Math.round(surface ?? geometry.floorY))}px`;
    }
    const alpha = Math.round(GAS_TINT * 255).toString(16).padStart(2, '0');
    const key = layers.join('|');
    if (refs.headspace.dataset.key !== key) {
      refs.headspace.style.background = layers
        .map((hex) => `linear-gradient(to top, ${hex}${insideSmoke && hex === layers[layers.length - 1] ? 'E0' : alpha}, ${hex}22 85%, rgba(0, 0, 0, 0))`)
        .join(', ');
      refs.headspace.dataset.key = key;
    }
    refs.headspace.classList.toggle('is-visible', layers.length > 0);

    // What fumes at the mouth, in white or in its own colour.
    const fuming = container.appearance.fumes || [];
    if (fuming.length) refs.fuming.style.setProperty('--fume-colour', fuming[0].colorHex);
    refs.fuming.classList.toggle('is-visible', fuming.length > 0);

    const note = [gasNoteText(gases, hasLiquid), fumesNoteText(fuming)].filter(Boolean).join('; ');
    refs.gasNote.hidden = !note;
    refs.gasNote.textContent = note;
  }

  function updateHeat(refs, container) {
    const heat = container.appearance.heat || { stage: 'still', steam: false, condensation: null };
    const geometry = glassGeometry(container.type, container.capacityMl);
    const height = `${liquidFraction(container.type, container.capacityMl, container.volumeMl) * 100}%`;
    const moving = heat.stage === 'warming' || heat.stage === 'nucleating' || heat.stage === 'boiling';

    refs.convection.style.height = height;
    refs.convection.classList.toggle('is-on', moving && heat.stage !== 'boiling');
    refs.boil.style.height = height;
    // A boiling bubble rises the whole depth of the liquid and bursts at the top.
    const surfaceY = geometry ? geometry.surfaceY(container.volumeMl) : null;
    if (geometry && surfaceY !== null) {
      refs.boil.style.setProperty('--boil-rise', `${Math.max(8, Math.round(geometry.floorY - surfaceY - 4))}px`);
    }
    refs.boil.classList.toggle('is-nucleating', heat.stage === 'nucleating');
    refs.boil.classList.toggle('is-boiling', heat.stage === 'boiling');
    refs.liquidBase.classList.toggle('is-boiling', heat.stage === 'boiling');
    refs.steam.classList.toggle('is-on', !!heat.steam);
    refs.steam.classList.toggle('is-faint', heat.stage === 'evaporating');

    // Droplets on the glass above the liquid - only where there is glass
    // above it to settle on.
    const c = heat.condensation;
    let showDroplets = false;
    if (c && geometry) {
      const surface = geometry.surfaceY(container.volumeMl) ?? geometry.floorY;
      const room = surface - 8;
      if (room > 16) {
        showDroplets = true;
        const key = `${c.id}:${Math.round(room)}`;
        if (refs.condensation.dataset.key !== key) {
          refs.condensation.dataset.key = key;
          refs.condensation.style.top = '6px';
          refs.condensation.style.height = `${Math.round(Math.min(room, geometry.h * 0.5))}px`;
          refs.condensation.innerHTML = dropletsSvg(c, geometry.w, Math.min(room, geometry.h * 0.5));
        }
      }
    }
    refs.condensation.classList.toggle('is-visible', showDroplets);

    // The glow of a very hot dry solid, over the floor where solids lie.
    if (heat.glow) {
      refs.glow.style.background = `radial-gradient(70% 90% at 50% 100%, ${heat.glow.colorHex}, rgba(0, 0, 0, 0) 75%)`;
      refs.glow.style.opacity = String(heat.glow.strength);
    } else {
      refs.glow.style.opacity = '0';
    }

    let note = heatNoteText(heat);
    if (container.thermometerIn && offScale(container.temperatureC)) {
      const beyond = container.temperatureC > SCALE_MAX_C
        ? `above ${SCALE_MAX_C} °C: off the thermometer's scale`
        : `below ${SCALE_MIN_C} °C: off the thermometer's scale`;
      note = note ? `${note}; ${beyond}` : beyond;
    }
    refs.heatNote.hidden = !note;
    refs.heatNote.textContent = note;
  }

  /** Small droplets on the inside of the glass, in the condensing liquid's colour. */
  function dropletsSvg(liquid, w, h) {
    const fill = liquid.colorHex || '#EEF3F5';
    let seed = 0;
    for (const ch of liquid.id) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const parts = [];
    const n = Math.max(6, Math.round((w * h) / 140));
    for (let i = 0; i < n; i += 1) {
      // Mostly near the walls, where the glass is coolest and drops gather.
      const side = rand() < 0.5 ? rand() * 0.22 : 0.78 + rand() * 0.22;
      const x = (rand() < 0.75 ? side : rand()) * w;
      const y = rand() * h;
      const r = 0.8 + rand() * 1.6;
      parts.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 1.25).toFixed(1)}" fill="${fill}" fill-opacity="0.75" stroke="rgba(255,255,255,0.7)" stroke-width="0.4"/>`);
    }
    return `<svg width="${w}" height="${Math.round(h)}" viewBox="0 0 ${w} ${Math.round(h)}" aria-hidden="true">${parts.join('')}</svg>`;
  }

  function updateVessel(refs, container, state) {
    // Never fight a drag in progress - the pointer owns the transform then.
    if ((!drag || drag.id !== container.id) && !refs.pouring && !refs.closeLook) {
      refs.el.style.transform = `translate3d(${container.position.x}px, ${container.position.y}px, 0)`;
    }
    refs.el.classList.toggle('is-selected', state.selectedVesselId === container.id);
    const under = container.standOn ? state.equipment.find((q) => q.id === container.standOn) : null;
    refs.el.classList.toggle('is-in-bath', !!under && (under.kind === 'ice_bath' || under.kind === 'water_bath'));
    refs.el.classList.toggle('is-in-fume-cupboard', under?.kind === 'fume_cupboard');
    // A tube over a burner is held in a test-tube holder, not stood on the
    // gauze (UI.6.1).
    const tube = container.type === 'test_tube' || container.type === 'boiling_tube';
    refs.holder.classList.toggle('is-visible', tube && under?.kind === 'burner');

    refs.volumeEl.textContent = container.volumeMl;
    refs.tempEl.textContent = container.temperatureC.toFixed(1);
    refs.phEl.textContent = container.pH === null ? '—' : container.pH;

    const isEmpty = container.contents.length === 0;
    refs.colorSwatch.style.background = container.appearance.colorHex;
    refs.colorSwatch.hidden = isEmpty;
    const layers = container.appearance.layers;
    if (layers && !isEmpty) refs.colorSwatch.style.background = layers[0].colorHex;
    refs.colorText.textContent = isEmpty
      ? 'empty'
      : layers
        ? `two layers: ${layers.map((l) => `${l.name} (${l.colorName})`).join(' above ')}`
        : container.appearance.colorName || 'colour not known for this mixture';
    refs.colourRow.classList.toggle('is-empty', isEmpty);

    // The solid a reaction left, with its name (UI.md section 5), drawn by
    // its texture where its kind puts it (precipitate-shapes.js).
    const solid = container.appearance.precipitate;
    refs.precipitateLabel.hidden = !solid;
    if (solid) refs.precipitateLabel.textContent = solidLabel(solid);
    updatePrecipitate(refs, container, solid);

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
      refs.standNote.textContent = standingText(container, standingItem).replace(/^standing /, '');
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
    const targetFill = paintFor(container);
    const targetHeight = `${liquidFraction(container.type, container.capacityMl, container.volumeMl) * 100}%`;
    setSurfaceWidth(refs, container);
    // While a new colour is still spreading (UI.3.5) the drawing is between
    // states on purpose, so it is left alone until the mix is finished.
    const settling = !!refs.mixing
      || !!refs.pouring
      || refs.liquidBase.getAnimations().length > 0
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

    updateShelfSolids(refs, container);
    updateLayers(refs, container);
    updateHeat(refs, container);
    updateThermometer(refs, container);
    refs.soot.classList.toggle('is-visible', container.sooty === true);
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

  const isBath = (item) => item.kind === 'ice_bath' || item.kind === 'water_bath';

  /** "standing in the ice bath", "held in the retort stand's clamp"... */
  function standingText(vessel, item) {
    if (item.kind === 'fume_cupboard') return 'standing in the fume cupboard';
    if (item.kind === 'stand') {
      return vessel.standRole === 'clamp' ? "held in the retort stand's clamp" : 'standing on the base of the retort stand';
    }
    return `standing ${isBath(item) ? 'in' : 'on'} the ${item.label.toLowerCase()}`;
  }

  /** The water bath's dial: off, 40, 60, 80 °C and boiling (UI.4.5). */
  function bathDialButtons(bath) {
    bath.dial.forEach((tempC, setting) => {
      const label = setting === 0 ? 'Bath off' : tempC >= 100 ? 'Boiling' : `${tempC} °C`;
      controlButton(label, () => dispatch.setEquipmentLevel(bath.id, setting), {
        active: bath.level === setting,
        className: 'bench-control--heat',
        title: setting === 0 ? 'Switch the hotplate off' : `Hold the water at ${tempC} °C`,
      });
    });
  }

  /** The burner's collar: one button that opens or closes the air hole. */
  function airHoleButton(burner) {
    const open = burner.airHole !== 'closed';
    controlButton(open ? 'Air hole open' : 'Air hole closed', () => dispatch.setAirHole(burner.id, !open), {
      active: !open,
      title: open
        ? 'Close the air hole: a cooler, luminous yellow flame'
        : 'Open the air hole: the hot blue flame for heating',
    });
  }

  /** Which flame to use, and why - the teaching note (BUILD_UI.md UI.4.1). */
  function airHoleNote(burner) {
    if (burner.level === 0) return 'Gas off. Light it with the air hole closed, then open it to heat.';
    return burner.airHole === 'closed'
      ? 'Yellow, luminous flame: easy to see, so it is the safety flame - but it is cooler and leaves soot. Open the air hole to heat.'
      : 'Blue, roaring flame: hot and clean, with no soot - the one to heat with.';
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
          ? standingText(vessel, standing)
          : 'on the bench — drag it onto a burner to heat it';

      // Heat exists only when something under the vessel supplies it.
      if (standing && standing.kind === 'burner') {
        for (const level of [0, 1, 2, 3]) {
          controlButton(level === 0 ? 'Gas off' : `Heat ${level}`, () => {
            dispatch.setEquipmentLevel(standing.id, level);
          }, { active: standing.level === level, className: 'bench-control--heat' });
        }
        airHoleButton(standing);
      }
      if (standing && standing.kind === 'water_bath') bathDialButtons(standing);

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

      // A conical flask is swirled; anything else is stirred with a glass rod.
      // Either way the engine mixes it the same (UI.6.3).
      const mixVerb = mixVerbFor(vessel.type);
      controlButton(mixVerb, () => withEffects(vessel.id, () => dispatch.stir(vessel.id), {
        stirring: true, swirling: mixVerb === 'Swirl',
      }), { title: mixVerb === 'Swirl' ? 'Swirl the flask to mix it' : 'Stir with a glass rod' });
      controlButton(vessel.thermometerIn ? 'Take thermometer out' : 'Stand a thermometer in', () => {
        dispatch.setThermometer(vessel.id, !vessel.thermometerIn);
      }, { active: !!vessel.thermometerIn });

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

      controlButton('Look closely', () => openCloseLook(vessel.id), {
        title: 'Open it large beside the bench, against a white tile (or double-click it)',
        active: closeLook.id === vessel.id,
      });
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
      airHoleButton(equip);
      controlSub.textContent = airHoleNote(equip);
    }
    if (equip.kind === 'water_bath') {
      bathDialButtons(equip);
      controlSub.textContent = 'Warms gently and evenly, and never past its own temperature - the safe way to heat anything that catches fire.';
    }
    if (equip.kind === 'ice_bath') {
      controlSub.textContent = 'Melting ice holds a vessel a little above 0 °C - for reactions that warmth would spoil.';
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
    updateElectrodeStreams(refs, container, on);

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

  /**
   * Gas rising off each electrode while the current is on - from the rod
   * where the gas forms, in the share its half-equation fixes, at the
   * rule's curated pace (BUILD_UI.md UI.5.2). Hydrogen's stream is twice
   * oxygen's when water is split. Rebuilt only when something changes.
   */
  function updateElectrodeStreams(refs, container, on) {
    const bubbles = on ? container.electrolysisBubbles : null;
    const geometry = glassGeometry(container.type, container.capacityMl);
    const surface = geometry ? geometry.surfaceY(container.volumeMl) : null;
    // The rods reach down to just above the floor, so they dip into
    // whatever liquid there is - as real electrodes do - and the gas starts
    // from the part of the rod under the surface.
    const footFromBottom = geometry ? Math.round(geometry.h - geometry.floorY + 6) : 0;
    if (geometry) refs.electrodeLayer.style.setProperty('--rod-foot', `${footFromBottom}px`);
    const rodFoot = geometry ? geometry.h - footFromBottom : 0;
    const rise = surface === null ? 0 : Math.max(6, Math.round(rodFoot - surface - 4));
    const signature = bubbles && geometry
      ? `${bubbles.gasRate}:${rise}:${getEffectsTier()}:${bubbles.streams.map((s) => s.side + s.share).join('|')}`
      : '';
    if (refs.lastStreamSignature === signature) return;
    refs.lastStreamSignature = signature;
    refs.streamLayer.innerHTML = '';
    if (!signature) return;
    if (!refs.closeLook) playSound('fizz', { gasRate: bubbles.gasRate, seconds: 1.4 });

    const pace = paceFor(bubbles.gasRate);
    for (const stream of bubbles.streams) {
      const n = particlesFor(Math.max(1, Math.round(pace.stream * stream.share)));
      for (let k = 0; k < n; k += 1) {
        const span = document.createElement('span');
        span.className = `electrode-bubble electrode-bubble--${stream.side}`;
        // Either side of the rod, a little way up it.
        span.style.setProperty('--offset', `${k % 2 ? 11 : -4}px`);
        span.style.setProperty('--lift', `${(k * 7) % 18}px`);
        span.style.setProperty('--rise', `${Math.max(4, rise - ((k * 7) % 18))}px`);
        const duration = pace.riseMs[0] + ((k * 137) % (pace.riseMs[1] - pace.riseMs[0] + 1));
        span.style.animationDuration = `${duration}ms`;
        span.style.animationDelay = `${Math.round((k * duration) / n)}ms`;
        span.title = `${stream.gasName} at the ${stream.side}`;
        refs.streamLayer.appendChild(span);
      }
    }
  }

  /**
   * One reaction's burst of bubbles, from where its gas forms - the metal,
   * the chips, the catalyst, or the liquid itself - at its curated pace
   * (UI.5.2). Only where there is liquid to rise through; electrolysis
   * streams from its rods instead (updateElectrodeStreams).
   */
  function playReactionBubbles(refs, reaction, before, after) {
    if (reaction.electrodes) return;
    const volumeMl = Math.max(after.volumeMl || 0, before.volumeMl || 0);
    const geometry = glassGeometry(after.type, after.capacityMl);
    if (!(volumeMl > 0) || !geometry) return;

    const pace = paceFor(reaction.effects?.gasRate);
    const floorBottom = geometry.h - geometry.floorY;
    const surface = geometry.surfaceY(after.volumeMl > 0 ? after.volumeMl : volumeMl);
    const liquidHeight = surface === null ? 30 : Math.max(8, geometry.floorY - surface);

    const solids = (before.appearance.shelfSolids || []).map((s) => s.id);
    const source = bubbleSourceFor(reaction, solids);
    const el = source.at === 'solid' ? refs.solidEls.get(source.solidId) : null;
    let xPx;
    let bottomPx;
    if (el) {
      const left = parseFloat(el.style.left) || 0;
      xPx = [left + 1, left + Math.max(2, el.offsetWidth - 3)];
      bottomPx = [floorBottom + 1, floorBottom + Math.max(2, Math.min(el.offsetHeight, liquidHeight) * 0.8)];
    } else {
      const half = Math.max(5, geometry.innerHalfAt(geometry.floorY - 5) - 4);
      xPx = [geometry.cx - half, geometry.cx + half];
      bottomPx = [floorBottom + 1, floorBottom + 4];
    }
    playBubbles(refs.bubbleLayer, {
      count: pace.count, burstMs: pace.burstMs, riseMs: pace.riseMs, sizePx: pace.sizePx,
      xPx, bottomPx, risePx: liquidHeight - 2,
    });
    if (!refs.closeLook) playSound('fizz', { gasRate: reaction.effects?.gasRate, seconds: pace.burstMs / 1000 });
  }

  /* ------------------------------------------------------------------ *
   * The close look (BUILD_UI.md UI.7.1)
   *
   * At bench scale a precipitate's texture or a meniscus is a few pixels.
   * In a real lab you lift the tube and look closely against a white
   * background. Double-click a vessel (or "Look closely") and a second
   * drawing of it opens large beside the bench, on a white tile, with every
   * colour named beneath it. It is the bench's own drawing at a larger
   * scale, painted by the same updateVessel, so it shows exactly what the
   * bench and the notebook say - only bigger.
   * ------------------------------------------------------------------ */

  const closeLook = { id: null, refs: null, panel: null, tile: null, details: null, title: null, reading: null, eye: 'level' };

  function openCloseLook(containerId) {
    if (closeLook.id === containerId) return;
    closeCloseLook();
    const container = getState().containers.find((c) => c.id === containerId);
    if (!container) return;

    const panel = document.createElement('section');
    panel.className = 'close-look';
    panel.setAttribute('aria-label', 'Close look');
    const head = document.createElement('div');
    head.className = 'close-look__head';
    const title = document.createElement('h2');
    title.className = 'close-look__title';
    const shut = document.createElement('button');
    shut.type = 'button';
    shut.className = 'close-look__close';
    shut.textContent = '×';
    shut.title = 'Put it back down (Esc)';
    shut.addEventListener('click', () => closeCloseLook());
    head.append(title, shut);
    const tile = document.createElement('div');
    tile.className = 'close-look__tile';
    // Reading the scale at eye level (UI.7.2): where your eye is, a
    // magnified strip of the scale around the meniscus, and what you read.
    const reading = document.createElement('div');
    reading.className = 'close-look__reading';
    const eyes = document.createElement('div');
    eyes.className = 'close-look__eyes';
    for (const [eye, label] of [['above', 'Eye above'], ['level', 'Eye level'], ['below', 'Eye below']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.eye = eye;
      button.textContent = label;
      button.addEventListener('click', () => {
        closeLook.eye = eye;
        render();
      });
      eyes.appendChild(button);
    }
    const lens = document.createElement('div');
    lens.className = 'close-look__lens';
    const value = document.createElement('p');
    value.className = 'close-look__value';
    const note = document.createElement('p');
    note.className = 'close-look__note';
    reading.append(eyes, lens, value, note);
    const details = document.createElement('dl');
    details.className = 'close-look__details';
    panel.append(head, tile, reading, details);
    canvas.appendChild(panel);

    const refs = buildVesselRefs(container, { interactive: false });
    refs.closeLook = true;
    refs.el.classList.add('close-look__vessel');
    tile.appendChild(refs.el);

    Object.assign(closeLook, { id: containerId, refs, panel, tile, details, title, reading, eye: 'level' });
    document.addEventListener('keydown', onCloseLookKey);
    render();
  }

  function closeCloseLook() {
    if (!closeLook.panel) return;
    closeLook.panel.remove();
    Object.assign(closeLook, { id: null, refs: null, panel: null, tile: null, details: null, title: null, reading: null });
    document.removeEventListener('keydown', onCloseLookKey);
  }

  function onCloseLookKey(event) {
    if (event.key === 'Escape' && closeLook.panel && floatHost.hidden) {
      closeCloseLook();
      render();
    }
  }

  function renderCloseLook(state) {
    if (!closeLook.id) return;
    const container = state.containers.find((c) => c.id === closeLook.id);
    if (!container) {
      closeCloseLook();
      return;
    }
    updateVessel(closeLook.refs, container, state);
    closeLook.title.textContent = container.name;

    // Every colour named: what the bench draws, in words.
    const a = container.appearance;
    const rows = [];
    if (container.contents.length === 0) rows.push(['Contents', 'empty']);
    else if (a.layers && a.layers.length) {
      rows.push(['Layers', a.layers.map((l) => `${l.colorName || 'colour not known'} ${l.name ? l.name.toLowerCase() : ''}`.trim()).join(' over ')]);
    } else if (container.volumeMl > 0) {
      rows.push(['Liquid', [a.colorName || 'colour not known', a.clarity && a.clarity !== 'clear' ? a.clarity : null].filter(Boolean).join(', ')]);
    }
    if (a.precipitate) rows.push(['Solid formed', solidLabel(a.precipitate)]);
    for (const solid of a.shelfSolids || []) rows.push(['In the vessel', shelfSolidLabel(solid)]);
    const gasLine = [gasNoteText(a.gases, container.volumeMl > 0), fumesNoteText(a.fumes)].filter(Boolean).join('; ');
    if (gasLine) rows.push(['Above it', gasLine]);
    const heatLine = closeLook.refs.heatNote.hidden ? '' : closeLook.refs.heatNote.textContent;
    if (heatLine) rows.push(['Heat', heatLine]);
    rows.push(['Contents', `${container.volumeMl} mL · ${container.temperatureC.toFixed(1)} °C · pH ${container.pH === null ? '—' : container.pH}`]);
    renderReadingLens(container);
    const html = rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeText(v)}</dd>`).join('');
    if (closeLook.details.dataset.html !== html) {
      closeLook.details.innerHTML = html;
      closeLook.details.dataset.html = html;
    }

    // As large as the tile allows, up to three times bench size, centred.
    const geometry = glassGeometry(container.type, container.capacityMl);
    if (geometry) {
      const room = { w: closeLook.tile.clientWidth - 40, h: closeLook.tile.clientHeight - 48 };
      const k = Math.max(1, Math.min(3, room.w / geometry.w, room.h / geometry.h));
      const left = Math.round((closeLook.tile.clientWidth - geometry.w * k) / 2);
      const top = Math.round(closeLook.tile.clientHeight - 24 - geometry.h * k);
      closeLook.refs.el.style.transform = `translate(${left}px, ${top}px) scale(${k.toFixed(3)})`;
    }

  }

  /** The meniscus read against the scale, from where the eye is (UI.7.2). */
  function renderReadingLens(container) {
    const geometry = glassGeometry(container.type, container.capacityMl);
    const eye = closeLook.eye;
    const reading = geometry ? readingFor(container.type, geometry, container.capacityMl, container.volumeMl, eye) : null;
    closeLook.reading.hidden = !reading;
    if (!reading) return;
    for (const button of closeLook.reading.querySelectorAll('.close-look__eyes button')) {
      button.classList.toggle('is-active', button.dataset.eye === eye);
    }
    const lens = closeLook.reading.querySelector('.close-look__lens');
    const key = `${container.type}:${container.volumeMl}:${eye}:${container.appearance.colorHex}`;
    if (lens.dataset.key !== key) {
      lens.innerHTML = lensSvg({
        type: container.type, geometry, capacityMl: container.capacityMl, volumeMl: container.volumeMl,
        eye, colorHex: container.appearance.colorHex, width: 256, height: 96,
      });
      lens.dataset.key = key;
    }
    const what = reading.runOut ? 'run out' : 'in it';
    closeLook.reading.querySelector('.close-look__value').textContent = eye === 'level'
      ? `You read ${reading.text} ${what} (to ±${reading.readTo} mL)${reading.approximate ? ' - approximate: not for measuring' : ''}`
      : `You read ${reading.text} ${what} - at eye level it is ${reading.trueText}`;
    closeLook.reading.querySelector('.close-look__note').textContent = readingNote(container.type, eye);
  }

  function escapeText(text) {
    return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  }

  /* ------------------------------------------------------------------ *
   * Effects
   * ------------------------------------------------------------------ */

  /**
   * Runs an action and plays what it changed. `how` says what kind of
   * action it was: { entering: true } when a reagent went in (so a new
   * colour spreads from where it entered), { stirring: true } for the stir
   * button (which finishes any mixing still going on).
   */
  function withEffects(containerId, runAction, how = {}) {
    const before = getState().containers.find((c) => c.id === containerId);
    const result = runAction();
    const after = getState().containers.find((c) => c.id === containerId);
    playContainerEffects(containerId, before, after, result && result.engineResult, how);
    return result;
  }

  function executePour(fromId, toId, amountMl, release = null) {
    if (pourWithHands(fromId, toId, amountMl, release)) return;
    const stateBefore = getState();
    const sourceBefore = stateBefore.containers.find((c) => c.id === fromId);
    const targetBefore = stateBefore.containers.find((c) => c.id === toId);
    if (!sourceBefore || !targetBefore) return;

    const targetRefs = vesselEls.get(toId);
    // A burette releases drops from its tip (UI.6.3); anything else that
    // gets here pours its old short stream.
    if (sourceBefore.type === 'burette') playBuretteDrop(sourceBefore, targetBefore);
    else if (targetRefs) playPourStream(targetRefs.pourMouth);

    const result = dispatch.pour(fromId, toId, amountMl);

    const stateAfter = getState();
    playContainerEffects(fromId, sourceBefore, stateAfter.containers.find((c) => c.id === fromId), null);
    playContainerEffects(toId, targetBefore, stateAfter.containers.find((c) => c.id === toId), result && result.engineResult, { entering: true });
  }

  /**
   * A pour that looks like one (BUILD_UI.md UI.6.2). The glass travels from
   * where it was let go to the other vessel, holds its lip just over the
   * mouth and tips - further the emptier it is - while its liquid stays
   * level. A stream arcs from the lip onto the liquid below; the level falls
   * in one and rises in the other; from too high it splashes. Then a last
   * drip, and the glass tips back and goes home. Where everything goes is
   * pour-path.js. Only transform and opacity move, and the stream's dash.
   *
   * A burette delivers from its tap instead, and with reduced motion the
   * plain pour is used. Returns false when it did not take the pour.
   */
  function pourWithHands(fromId, toId, amountMl, release) {
    const sRefs = vesselEls.get(fromId);
    const tRefs = vesselEls.get(toId);
    const stateBefore = getState();
    const source = stateBefore.containers.find((c) => c.id === fromId);
    const target = stateBefore.containers.find((c) => c.id === toId);
    if (!sRefs || !tRefs || !source || !target || sRefs.pouring) return false;
    if (source.type === 'burette' || prefersReducedMotion()) return false;
    const sGeo = glassGeometry(source.type, source.capacityMl);
    const tGeo = glassGeometry(target.type, target.capacityMl);
    if (!sGeo || !tGeo) return false;

    const vOff = { x: sRefs.vessel.offsetLeft, y: sRefs.vessel.offsetTop };
    const tOff = { x: tRefs.vessel.offsetLeft, y: tRefs.vessel.offsetTop };
    const home = { x: source.position.x, y: source.position.y };
    const from = release && !release.fromHome ? release : home;
    const targetBox = { x: target.position.x + tOff.x, y: target.position.y + tOff.y, w: tGeo.w, h: tGeo.h };
    const surface = target.volumeMl > 0 ? tGeo.surfaceY(target.volumeMl) : tGeo.floorY;
    const fractionBefore = liquidFraction(source.type, source.capacityMl, source.volumeMl);
    const p = pourPath({
      source: { x: from.x + vOff.x, y: from.y + vOff.y, w: sGeo.w, h: sGeo.h },
      target: targetBox,
      targetSurfaceY: targetBox.y + (surface ?? tGeo.floorY),
      mouthHalfW: tGeo.innerHalfAt(6),
      releaseLipY: release ? release.y + vOff.y : null,
      fraction: fractionBefore,
    });
    const at = { x: p.sourceAt.x - vOff.x, y: p.sourceAt.y - vOff.y };
    const place = (pos) => ({ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` });

    // Hand the glass over to the pour: no drag, no re-render moves it.
    sRefs.pouring = true;
    sRefs.el.style.zIndex = '6';
    sRefs.vessel.style.transition = 'none';
    sRefs.vessel.style.transformOrigin = p.origin;
    for (const el of [sRefs.liquidIncoming, sRefs.layerBox, sRefs.plume]) if (el) el.style.opacity = '0';

    // The liquid turns against the glass about the point where its surface
    // meets the axis, so the surface stays level; the glass's own clip still
    // cuts it to the inside of the glass.
    const liquid = sRefs.liquidBase;
    const surfaceIn = sGeo.surfaceY(source.volumeMl) ?? sGeo.floorY;
    Object.assign(liquid.style, {
      top: `${surfaceIn}px`, bottom: `${-sGeo.h}px`, left: `${-sGeo.w}px`, right: `${-sGeo.w}px`,
      height: 'auto', transformOrigin: '50% 0',
    });

    const tilt = { duration: POUR.tiltMs, easing: 'ease-out', fill: 'forwards' };
    sRefs.el.animate([place(from), place(at)], tilt);
    sRefs.vessel.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${p.angle}deg)` }], tilt);
    liquid.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${-p.angle}deg)` }], tilt);

    setTimeout(() => {
      const targetBefore = getState().containers.find((c) => c.id === toId);
      const result = dispatch.pour(fromId, toId, amountMl);
      playSound('pour', { amountMl });
      const stateAfter = getState();
      const sourceAfter = stateAfter.containers.find((c) => c.id === fromId);
      const targetAfter = stateAfter.containers.find((c) => c.id === toId);
      playContainerEffects(toId, targetBefore, targetAfter, result && result.engineResult, { entering: true });

      // The source's level falls along its axis as the liquid leaves.
      const fractionAfter = sourceAfter ? liquidFraction(sourceAfter.type, sourceAfter.capacityMl, sourceAfter.volumeMl) : 0;
      const drop = Math.max(0, (fractionBefore - fractionAfter) * sGeo.h);
      liquid.animate(
        [{ transform: `translateY(0) rotate(${-p.angle}deg)` }, { transform: `translateY(${drop}px) rotate(${-p.angle}deg)` }],
        { duration: POUR.pourMs, easing: 'ease-in-out', fill: 'forwards' }
      );

      playPourArc(p, source.appearance.colorHex);
      if (p.splash) setTimeout(() => playSplash(p.landing, source.appearance.colorHex), 200);

      setTimeout(() => {
        playDrip(p, source.appearance.colorHex);
        setTimeout(() => {
          const back = { duration: POUR.returnMs, easing: 'ease-in', fill: 'forwards' };
          sRefs.el.animate([place(at), place(home)], back);
          sRefs.vessel.animate([{ transform: `rotate(${p.angle}deg)` }, { transform: 'rotate(0deg)' }], back);
          const settle = liquid.animate(
            [{ transform: `translateY(${drop}px) rotate(${-p.angle}deg)` }, { transform: `translateY(${drop}px) rotate(0deg)` }],
            back
          );
          settle.onfinish = () => {
            for (const el of [sRefs.el, sRefs.vessel, liquid]) el.getAnimations().forEach((a) => a.cancel());
            Object.assign(liquid.style, { top: '', bottom: '', left: '', right: '', transform: '', transformOrigin: '' });
            for (const el of [sRefs.liquidIncoming, sRefs.layerBox, sRefs.plume]) if (el) el.style.opacity = '';
            sRefs.vessel.style.transition = '';
            sRefs.vessel.style.transformOrigin = '';
            sRefs.el.style.zIndex = '';
            sRefs.pouring = false;
            render();
          };
        }, POUR.dripMs * 0.6);
      }, POUR.pourMs);
    }, POUR.tiltMs);
    return true;
  }

  /** The stream: an arc from the lip onto the liquid below, in the liquid's colour. */
  function playPourArc(p, colorHex) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'fx-pour-arc');
    svg.setAttribute('width', String(canvas.clientWidth));
    svg.setAttribute('height', String(canvas.clientHeight));
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', p.path);
    path.setAttribute('stroke', colorHex || '#EEF3F5');
    svg.appendChild(path);
    canvas.appendChild(svg);
    const length = Math.max(1, path.getTotalLength());
    path.style.strokeDasharray = `${length}`;
    path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    const fade = svg.animate([{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: POUR.pourMs, fill: 'forwards' });
    fade.onfinish = () => svg.remove();
  }

  /** The last drip, falling from the lip as the glass comes back. */
  function playDrip(p, colorHex) {
    const drip = document.createElement('span');
    drip.className = 'fx-drip';
    drip.style.left = `${p.lip.x - 2}px`;
    drip.style.top = `${p.lip.y}px`;
    drip.style.background = colorHex || '#EEF3F5';
    canvas.appendChild(drip);
    const fall = Math.max(4, p.landing.y - p.lip.y);
    const anim = drip.animate(
      [{ transform: 'translateY(0) scale(0.6)', opacity: 0.95 }, { transform: `translateY(${fall}px) scale(1)`, opacity: 0.6 }],
      { duration: POUR.dripMs, easing: 'ease-in', fill: 'forwards' }
    );
    anim.onfinish = () => drip.remove();
  }

  /**
   * One drop from a dropping pipette (UI.6.3): the pipette comes over the
   * mouth, its bulb is squeezed, a single drop falls into the liquid, and
   * then - as the drop lands - the engine gets its 0.05 mL.
   */
  function addOneDrop(containerId, chemicalId) {
    const refs = vesselEls.get(containerId);
    const target = getState().containers.find((c) => c.id === containerId);
    const chemical = engine.getChemical(chemicalId);
    const geometry = target && glassGeometry(target.type, target.capacityMl);
    const add = () => withEffects(containerId, () => dispatch.addChemical(containerId, chemicalId, DROP_ML), { entering: true });
    if (!refs || !geometry || prefersReducedMotion()) {
      add();
      return;
    }
    const left = target.position.x + refs.vessel.offsetLeft + geometry.cx;
    const top = target.position.y + refs.vessel.offsetTop;
    const surface = target.volumeMl > 0 ? geometry.surfaceY(target.volumeMl) : geometry.floorY;

    const dropper = document.createElement('div');
    dropper.className = 'fx-dropper';
    dropper.innerHTML = '<span class="fx-dropper__bulb"></span><span class="fx-dropper__tube"></span>';
    dropper.style.left = `${Math.round(left - 6)}px`;
    dropper.style.top = `${Math.round(top - 58)}px`;
    dropper.style.setProperty('--drop-colour', chemical?.colorHex || '#EEF3F5');
    canvas.appendChild(dropper);
    dropper.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, fill: 'forwards' });
    dropper.querySelector('.fx-dropper__bulb').animate(
      [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0.7)', offset: 0.5 }, { transform: 'scaleX(1)' }],
      { duration: 360, delay: 200 }
    );
    const tip = { x: Math.round(left), y: Math.round(top - 4) };
    setTimeout(() => playDrip({ lip: tip, landing: { x: tip.x, y: Math.round(top + (surface ?? geometry.floorY)) } }, chemical?.colorHex), 380);
    setTimeout(add, 380 + POUR.dripMs * 0.9);
    const out = dropper.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, delay: 380 + POUR.dripMs, fill: 'forwards' });
    out.onfinish = () => dropper.remove();
  }

  /** A single drop from a burette's tip into the vessel under it (UI.6.3). */
  function playBuretteDrop(burette, target) {
    const bRefs = vesselEls.get(burette.id);
    const tRefs = vesselEls.get(target.id);
    const bGeo = glassGeometry(burette.type, burette.capacityMl);
    const tGeo = glassGeometry(target.type, target.capacityMl);
    if (!bRefs || !tRefs || !bGeo || !tGeo) return;
    const tip = {
      x: Math.round(burette.position.x + bRefs.vessel.offsetLeft + bGeo.cx),
      y: Math.round(burette.position.y + bRefs.vessel.offsetTop + bGeo.h),
    };
    const surface = target.volumeMl > 0 ? tGeo.surfaceY(target.volumeMl) : tGeo.floorY;
    const landing = { x: tip.x, y: Math.round(target.position.y + tRefs.vessel.offsetTop + (surface ?? tGeo.floorY)) };
    playDrip({ lip: tip, landing }, burette.appearance.colorHex);
  }

  /** Swirling a conical flask: it rocks on its base, and the liquid goes round with it. */
  function playSwirl(refs) {
    // The low tier mixes the flask without the rocking (UI.10.1).
    if (prefersReducedMotion() || getEffectsTier() === 'low') return;
    const vessel = refs.vessel;
    vessel.style.transition = 'none';
    vessel.style.transformOrigin = '50% 100%';
    const swirl = vessel.animate(
      [
        { transform: 'rotate(0deg)' }, { transform: 'rotate(-5deg)' }, { transform: 'rotate(4deg)' },
        { transform: 'rotate(-4deg)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(-1.5deg)' },
        { transform: 'rotate(0deg)' },
      ],
      { duration: 1100, easing: 'ease-in-out' }
    );
    swirl.onfinish = () => {
      vessel.style.transition = '';
      vessel.style.transformOrigin = '';
    };
  }

  /** Stirring with a glass rod: the rod dips in and works back and forth. */
  function playGlassRod(refs, container) {
    if (prefersReducedMotion() || container.volumeMl <= 0) return;
    const geometry = glassGeometry(container.type, container.capacityMl);
    if (!geometry) return;
    const rod = document.createElement('span');
    rod.className = 'fx-glass-rod';
    rod.style.height = `${Math.round(geometry.h * 0.95)}px`;
    rod.style.left = `${Math.round(geometry.cx - 2)}px`;
    refs.vessel.appendChild(rod);
    const reach = Math.max(3, geometry.bodyW * 0.22);
    const anim = rod.animate(
      [
        { transform: 'translateX(0) rotate(10deg)', opacity: 0 },
        { transform: `translateX(${-reach}px) rotate(10deg)`, opacity: 1, offset: 0.15 },
        { transform: `translateX(${reach}px) rotate(-6deg)`, offset: 0.35 },
        { transform: `translateX(${-reach}px) rotate(10deg)`, offset: 0.55 },
        { transform: `translateX(${reach}px) rotate(-6deg)`, offset: 0.75 },
        { transform: 'translateX(0) rotate(4deg)', opacity: 1, offset: 0.9 },
        { transform: 'translateX(0) translateY(-12px) rotate(4deg)', opacity: 0 },
      ],
      { duration: 1300, easing: 'ease-in-out', fill: 'forwards' }
    );
    anim.onfinish = () => rod.remove();
  }

  /** From too high: droplets thrown up and out where the stream lands. */
  function playSplash(landing, colorHex) {
    for (let k = 0; k < 6; k += 1) {
      const drop = document.createElement('span');
      drop.className = 'fx-splash';
      drop.style.left = `${landing.x - 2}px`;
      drop.style.top = `${landing.y - 2}px`;
      drop.style.background = colorHex || '#EEF3F5';
      canvas.appendChild(drop);
      const dx = (k - 2.5) * 6;
      const up = 8 + (k % 3) * 5;
      const anim = drop.animate(
        [
          { transform: 'translate(0, 0)', opacity: 0.9 },
          { transform: `translate(${dx * 0.6}px, ${-up}px)`, opacity: 0.9, offset: 0.45 },
          { transform: `translate(${dx}px, 4px)`, opacity: 0 },
        ],
        { duration: 480, easing: 'ease-out', fill: 'forwards' }
      );
      anim.onfinish = () => drop.remove();
    }
  }

  function playContainerEffects(containerId, before, after, engineResult, how = {}) {
    // The close look plays everything the bench does, at its own size.
    if (closeLook.refs && closeLook.id === containerId) {
      playEffectsOn(closeLook.refs, before, after, engineResult, how);
    }
    playEffectsOn(vesselEls.get(containerId), before, after, engineResult, how);
  }

  function playEffectsOn(refs, before, after, engineResult, how = {}) {
    if (!refs || !before || !after) return;

    // Stirring finishes a mix still spreading, visibly; anything else new
    // happening to the vessel completes it at once and starts from there.
    if (refs.mixing) {
      if (how.stirring) refs.mixing.finish();
      else refs.mixing.now();
    }

    // What the student did to mix it, made visible (UI.6.3).
    if (how.swirling) playSwirl(refs);
    else if (how.stirring) playGlassRod(refs, after);

    // Shaking liquids that do not mix: an emulsion that separates again.
    if (how.stirring && after.appearance.layers && !refs.shaking) {
      refs.shaking = true;
      shakeLayers(refs.layerBox, refs.emulsion, { onDone: () => { refs.shaking = false; } });
    }

    const colourChanged = before.appearance.colorHex !== after.appearance.colorHex
      || before.appearance.clarity !== after.appearance.clarity;
    const fades = ((engineResult && engineResult.steps) || []).some((step) => step.reaction?.effects?.colourFades);
    if (colourChanged && fades) {
      // A curated colour fade - bromine water losing its orange, the blue
      // leaving copper sulfate - drains slowly instead of snapping.
      crossfadeColor(refs.liquidBase, refs.liquidIncoming, paintFor(after), { duration: 2800 });
    } else if (colourChanged && how.entering && before.volumeMl > 0 && after.volumeMl > 0) {
      // A reagent poured into liquid already there spreads from where it
      // entered. (Into an empty vessel there is nothing to mix with.)
      placePlume(refs, after);
      refs.mixing = spreadColour(refs.liquidBase, refs.liquidIncoming, refs.plume, paintFor(after), {
        onSettled: () => { refs.mixing = null; },
      });
    } else if (colourChanged) {
      crossfadeColor(refs.liquidBase, refs.liquidIncoming, paintFor(after));
    }

    // Heights, not volumes: in a flask the same 10 mL raises the level far
    // more near the neck than across the wide base (glassware.js).
    const beforeFraction = liquidFraction(before.type, before.capacityMl, before.volumeMl);
    const afterFraction = liquidFraction(after.type, after.capacityMl, after.volumeMl);
    setSurfaceWidth(refs, after);
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
      if (effects.bubbles) playReactionBubbles(refs, step.reaction, before, after);
      // Smoke from gases meeting forms inside; any other cloud of smoke or
      // vapour leaves by the mouth (UI.5.3).
      if (effects.solidKind === 'smoke' && smokeFormsInside(step.reaction, engine)) {
        refs.smokeInside = true;
        updatePrecipitate(refs, after, after.appearance.precipitate);
      } else if (effects.smoke) {
        playFumes(refs.fumes);
      }
      if (effects.gas) playGasEvolution(refs.gasLayer);
      if (effects.precipitate) {
        const solid = after.appearance.precipitate;
        // Grains form and fall only for a solid coming out of the liquid.
        // A deposit grows on the metal, smoke rises, a molten metal pools:
        // none of those rain down through the liquid.
        const kind = effects.solidKind || 'precipitate';
        if (kind === 'precipitate' || kind === 'solid' || kind === 'coating') {
          const style = formingStyle(solid || {});
          playPrecipitate(
            refs.precipitateLayer,
            solid ? solid.colorHex : precipitateInfoFor(step.reaction).colorHex,
            { count: style.count, duration: style.duration, fall: style.fall }
          );
        }
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
        withEffects(containerId, () => dispatch.addChemical(containerId, chemicalId, getState().quickAmount), { entering: true });
      } else if (getState().dispenseMode === 'drop' && !isSolid) {
        addOneDrop(containerId, chemicalId);
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
        withEffects(containerId, () => dispatch.addChemical(containerId, chemicalId, amount), { entering: true });
      },
    });
    panel.appendChild(form);
    floatHost.appendChild(panel);

    placeFloat(containerId);
    floatHost.hidden = false;
    confirm.focus();
    document.addEventListener('keydown', onFloatKeyDown, true);
  }

  function openPourPanel(fromId, toId, release = null) {
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
      onConfirm: (amount) => executePour(fromId, toId, amount, release),
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

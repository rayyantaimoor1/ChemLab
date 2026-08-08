/**
 * app.js — the renderer's entry point. Loaded by index.html.
 *
 * WHY THIS FILE EXISTS
 * Something has to create the containers, wire actions.js and notebook.js
 * together, and turn that into the exact read-only shape UI.md section 1
 * defines - then hand it to the zone modules (shelf.js, bench.js, panels.js)
 * so THEY never have to touch src/core/ directly. This file is that
 * something. It is not named in CLAUDE.md section 4's file tree; it exists
 * because nothing else does this job, and every zone needs the same state
 * and the same dispatch functions rather than each wiring its own copy.
 *
 * THE BOUNDARY RULE, APPLIED HERE
 * Everything below either reads state out of src/core/ (container snapshots,
 * engine.getChemical) or calls a dispatch function already built in
 * src/core/ (actions.js, notebook.js). It never decides what a reaction does,
 * what a colour means, or whether something is safe. If a future change to
 * this file needs to know chemistry, that chemistry belongs in src/core/, not
 * here - see UI.md section 1's "test of the boundary".
 */

import { engine, ROOM_TEMPERATURE_C, OUTCOME } from '../core/engine.js';
import { createContainer } from '../core/container.js';
import { createActions } from '../core/actions.js';
import { createNotebook } from '../core/notebook.js';
import { createTools } from '../core/tools.js';
import { createExperimentRunner, STATUS as EXPERIMENT_STATUS } from '../core/experiments.js';
import { mountShelf } from './shelf.js';
import { mountBench } from './bench.js';
import { mountPanels, mountHazardAlert, mountPropertiesCard } from './panels.js';
import { mountMolecularView } from './molecular.js';
import { mountMolecular3DView } from './molecular3d.js';
import { mountGuidedBar, mountGuidedStepCard, mountGuidedSummary } from './guided.js';
import { setReduceAnimation } from './effects.js';

/* ------------------------------------------------------------------ *
 * The bench. Free Lab mode has no experiment telling it what apparatus
 * to lay out (experiments.js is still an empty placeholder - guided mode
 * is Phase 7), so this is just a reasonable fixed starting bench: one
 * beaker, one test tube.
 * ------------------------------------------------------------------ */

/**
 * The vessel types the apparatus tray offers, and the equipment a vessel
 * can be stood on. Both are UI-only presets over the same createContainer
 * factory src/core/container.js already exports - adding a type here never
 * touches src/core/, it only decides what name/capacity is passed in.
 *
 * EQUIPMENT AND WHY IT DRIVES HEAT
 * Standing a vessel on a piece of furniture is what actually turns its
 * burner on or drops it in ice - dispatch.setHeat(containerId, level) is the
 * exact same action the vessel's own heat buttons already call, so nothing
 * new had to be added to actions.js/container.js for this. `heats` says what
 * a kind of furniture does to whatever is standing on it: a burner supplies
 * whatever level its own knob is set to, an ice bath is always -1, and a
 * rack does not heat at all (0) - it exists only as a tidy resting place for
 * test tubes, the way it would on a real bench.
 */
const VESSEL_TYPES = {
  beaker: { label: 'Beaker 250 mL', name: 'Beaker', capacityMl: 250, w: 110, h: 118 },
  beaker_small: { label: 'Beaker 100 mL', name: 'Small beaker', capacityMl: 100, w: 82, h: 92 },
  test_tube: { label: 'Test tube', name: 'Test tube', capacityMl: 50, w: 42, h: 150 },
  boiling_tube: { label: 'Boiling tube', name: 'Boiling tube', capacityMl: 120, w: 56, h: 166 },
  flask: { label: 'Conical flask', name: 'Conical flask', capacityMl: 250, w: 116, h: 130 },
  flask_small: { label: 'Small conical flask', name: 'Small flask', capacityMl: 100, w: 88, h: 104 },
  cylinder: { label: 'Measuring cylinder', name: 'Measuring cylinder', capacityMl: 100, w: 50, h: 152 },
  burette: { label: 'Burette 50 mL', name: 'Burette', capacityMl: 50, w: 30, h: 200 },
  dish: { label: 'Evaporating dish', name: 'Evaporating dish', capacityMl: 60, w: 96, h: 44 },
};

// topY is how far below the furniture's own top edge a vessel's BASE sits
// when it is stood on it - a burner's tripod ring is near its top, an ice
// bath's rim is 16px down, and so on. Standing a vessel is pure geometry
// from these three numbers; see standOn below.
const EQUIPMENT_TYPES = {
  burner: { label: 'Bunsen burner + tripod', name: 'Bunsen burner', heats: 1, w: 78, h: 104, topY: 6 },
  ice_bath: { label: 'Ice bath', name: 'Ice bath', heats: -1, w: 136, h: 54, topY: 16 },
  rack: { label: 'Test-tube rack', name: 'Test-tube rack', heats: 0, w: 122, h: 66, topY: 14 },
};

const MAX_VESSELS = 7;
const MAX_EQUIPMENT = 4;

/* The bench starts with nothing on it, in Free Lab and in guided mode
   alike - the mockup's own initial state is containers: [], and Reset
   returns to that same empty bench. Everything on it, glassware included,
   comes from the apparatus tray (addVessel below) or, for a guided
   experiment, is laid out automatically from that experiment's own
   curated apparatus list - see startExperiment's dispatch entry. */
const BASE_CONTAINER_DEFS = [];

function buildContainer(def) {
  return createContainer({ ...def, getChemical: engine.getChemical });
}

const containers = BASE_CONTAINER_DEFS.map(buildContainer);
const containersById = new Map(containers.map((container) => [container.id, container]));

// Bench furniture: burner, ice bath, rack. Purely UI-layer state - the
// mockup's own header comment calls containers/hazard/notebook/mode/guided
// "UI.md section 1 verbatim"; this is additional presentational state
// layered on top of that contract, the same way selectedToolId and
// viewingChemicalId already are below.
const equipment = [];
let nextVesselNumber = {};
let nextEquipmentNumber = {};

/* ------------------------------------------------------------------ *
 * The bench is a canvas, not a list.
 *
 * Every vessel and every piece of furniture has its own x/y on the bench
 * top, and a student moves it by dragging it - onto another vessel to
 * pour, onto a burner to heat it. That is the whole interaction model, so
 * position is real state rather than a layout detail, and it lives here
 * with everything else rather than being invented by the renderer.
 *
 * bench.js reports the canvas's own size through setBenchSize, because
 * where a new vessel can be put down depends on how big the bench is and
 * this file is not allowed to touch the DOM to find out.
 * ------------------------------------------------------------------ */

const positionByContainer = new Map();
let benchSize = { width: 710, height: 530 };

// Which equipment (if any) each vessel is standing on, containerId ->
// equipmentId. A vessel not in this map is free-standing on the bench, and
// a free-standing vessel has NO heat control at all - there is nothing
// under it to supply heat, exactly as at a real bench.
const standOnByContainer = new Map();

// Which vessel or piece of furniture is currently selected. Only one of
// the two is ever set - selecting a vessel clears the equipment selection
// and vice versa - because the control strip at the foot of the bench
// shows the controls for exactly one thing at a time.
let selectedVesselId = null;
let selectedEquipmentId = null;

// Which vessel a burette is currently clamped above, buretteId -> targetId.
const clampedOverByContainer = new Map();

/* ------------------------------------------------------------------ *
 * Dipping a tool is a gesture, not a button press.
 *
 * The instrument goes into the liquid, sits there, and comes out again
 * before it reports anything - the reading is the END of the gesture. So
 * dipTool is not dispatched the instant the button is clicked: the vessel
 * is marked as being dipped (which is what bench.js draws), and the real
 * read happens when the instrument comes back out.
 *
 * The last reading then STAYS on the vessel, so the answer is visible on
 * the bench beside the glass rather than only as a line in the notebook.
 * ------------------------------------------------------------------ */

const DIP_DURATION_MS = 1250;

// containerId -> the toolId currently in it, while the dip is running.
const dippingByContainer = new Map();
// containerId -> the last reading taken from it, shown beside the vessel.
const stripByContainer = new Map();

/**
 * What the current is doing in each electrified vessel, containerId ->
 * the engine's own sentence about it.
 *
 * Switching the power on in something that cannot be electrolysed is a
 * real, correct outcome - the engine says "No observable change." or, for
 * a combination with no rule at all, that it is not in this version of the
 * lab yet. But with no ions to draw, the bench showed nothing whatsoever,
 * so a student could not tell a working cell from a broken app. This puts
 * the engine's OWN words on the vessel; nothing here is invented.
 */
const powerNoteByContainer = new Map();

function beginDip(toolId, containerId) {
  if (!toolId || !containersById.has(containerId)) return;
  if (dippingByContainer.has(containerId)) return;

  dippingByContainer.set(containerId, toolId);
  notify();

  setTimeout(() => {
    dippingByContainer.delete(containerId);
    // The vessel may have been put away mid-dip.
    if (!containersById.has(containerId)) {
      notify();
      return;
    }
    // The real read, through the ordinary dispatch: it logs to the
    // notebook, feeds the readings strip and lets guided mode judge the
    // step, exactly as it always did - only later.
    const result = dispatch.dipTool(toolId, containerId);
    if (result && result.reading) stripByContainer.set(containerId, result.reading);
    notify();
  }, DIP_DURATION_MS);
}

/** Where a newly-placed object's base sits: on the bench top, clear of the
 *  control strip along the bottom. */
function benchFloorY(h) {
  return Math.max(8, benchSize.height - 62 - 14 - h);
}

/** A free-ish spot along the bench for the nth object, wrapping when it
 *  runs out of width rather than marching off the edge. */
function freeX(w, index) {
  const width = benchSize.width - 116;
  return Math.max(8, Math.min(width - w, 16 + ((index * 134) % Math.max(140, width - w - 16))));
}

function addVessel(type) {
  const def = VESSEL_TYPES[type];
  if (!def || containers.length >= MAX_VESSELS) return null;
  const n = (nextVesselNumber[type] = (nextVesselNumber[type] || 0) + 1);
  const id = `${type === 'test_tube' ? 'tube' : type}_${n}`;
  const container = buildContainer({ id, name: def.name, type, capacityMl: def.capacityMl });
  containers.push(container);
  containersById.set(id, container);
  positionByContainer.set(id, {
    x: freeX(def.w, containers.length + equipment.length - 1),
    y: benchFloorY(def.h),
  });
  selectedVesselId = id;
  selectedEquipmentId = null;
  notebook.logAction({
    text: `A ${def.name.toLowerCase()} was taken from the apparatus tray and put on the bench.`,
    containerId: id,
    action: 'addVessel',
  });
  notify();
  return id;
}

function addEquipment(kind) {
  const def = EQUIPMENT_TYPES[kind];
  if (!def || equipment.length >= MAX_EQUIPMENT) return null;
  const n = (nextEquipmentNumber[kind] = (nextEquipmentNumber[kind] || 0) + 1);
  const id = `${kind}_${n}`;
  equipment.push({
    id,
    kind,
    level: 0,
    x: freeX(def.w, containers.length + equipment.length),
    y: benchFloorY(def.h),
  });
  selectedEquipmentId = id;
  selectedVesselId = null;
  notebook.logAction({
    text: `A ${def.name.toLowerCase()} was set up on the bench.`,
    containerId: null,
    action: 'addEquipment',
  });
  notify();
  return id;
}

/**
 * Stands a vessel on a piece of equipment, or takes it off (equipmentId
 * null). This is the one place that turns "furniture" into "temperature":
 * it calls the exact same dispatch.setHeat the burner's own knob calls, so
 * container.js never has to know equipment exists at all.
 *
 * It also snaps the vessel physically onto the furniture, centred on it and
 * sitting at its topY - a beaker on a tripod is actually resting on the
 * tripod, not merely flagged as associated with it.
 */
function standOn(containerId, equipmentId) {
  const container = containersById.get(containerId);
  if (!container) return;

  if (!equipmentId) {
    if (!standOnByContainer.has(containerId)) return;
    standOnByContainer.delete(containerId);
    dispatch.setHeat(containerId, 0);
    notebook.logAction({
      text: `${container.name} was lifted off the bench furniture.`,
      containerId,
      action: 'standOn',
    });
    return;
  }

  const item = equipment.find((eq) => eq.id === equipmentId);
  const def = item && EQUIPMENT_TYPES[item.kind];
  const vesselDef = VESSEL_TYPES[container.type];
  if (!item || !def || !vesselDef) return;

  standOnByContainer.set(containerId, equipmentId);
  positionByContainer.set(containerId, {
    x: Math.round(item.x + (def.w - vesselDef.w) / 2),
    y: Math.round(item.y + def.topY - vesselDef.h),
  });
  clampedOverByContainer.delete(containerId);
  selectedVesselId = containerId;
  selectedEquipmentId = null;

  const level = def.heats === 1 ? item.level : def.heats;
  dispatch.setHeat(containerId, level);
  notebook.logAction({
    text: `${container.name} was stood on the ${def.name.toLowerCase()}.`,
    containerId,
    action: 'standOn',
  });
}

/** Moves a vessel to a new spot, which by definition lifts it off whatever
 *  it was standing on - you cannot carry a beaker away and have it still be
 *  on the tripod. */
function moveVessel(containerId, x, y) {
  if (!containersById.has(containerId)) return;
  positionByContainer.set(containerId, { x, y });
  if (standOnByContainer.has(containerId)) {
    standOnByContainer.delete(containerId);
    dispatch.setHeat(containerId, 0);
  }
  clampedOverByContainer.delete(containerId);
  notify();
}

/** Moves a piece of furniture, carrying anything standing on it along with
 *  it - picking up a tripod does not leave the beaker hanging in mid-air. */
function moveEquipment(equipmentId, x, y) {
  const item = equipment.find((eq) => eq.id === equipmentId);
  if (!item) return;
  const dx = x - item.x;
  const dy = y - item.y;
  item.x = x;
  item.y = y;
  for (const [containerId, standingOn] of standOnByContainer) {
    if (standingOn !== equipmentId) continue;
    const at = positionByContainer.get(containerId);
    if (at) positionByContainer.set(containerId, { x: at.x + dx, y: at.y + dy });
  }
  notify();
}

/** Clamps a burette above another vessel, so its tap delivers into it. */
function clampOver(buretteId, targetId) {
  const burette = containersById.get(buretteId);
  const target = containersById.get(targetId);
  const buretteDef = burette && VESSEL_TYPES[burette.type];
  const targetDef = target && VESSEL_TYPES[target.type];
  const targetAt = positionByContainer.get(targetId);
  if (!burette || !target || !targetAt) return;

  positionByContainer.set(buretteId, {
    x: Math.round(targetAt.x + (targetDef.w - buretteDef.w) / 2),
    y: Math.max(4, Math.round(targetAt.y - buretteDef.h - 26)),
  });
  clampedOverByContainer.set(buretteId, targetId);
  standOnByContainer.delete(buretteId);
  selectedVesselId = buretteId;
  selectedEquipmentId = null;
  notebook.logAction({
    text: `The burette was clamped above the ${target.name.toLowerCase()}.`,
    containerId: buretteId,
    action: 'clampOver',
  });
  notify();
}

function unclamp(buretteId) {
  clampedOverByContainer.delete(buretteId);
  notify();
}

function selectVessel(containerId) {
  selectedVesselId = containerId;
  selectedEquipmentId = null;
  notify();
}

function selectEquipment(equipmentId) {
  selectedEquipmentId = equipmentId;
  selectedVesselId = null;
  notify();
}

/**
 * Turns a burner's own knob, and immediately re-applies that level to
 * every vessel currently standing on it - the whole point of the burner
 * being separate furniture rather than a button on each vessel's own card.
 */
function setEquipmentLevel(equipmentId, level) {
  const item = equipment.find((eq) => eq.id === equipmentId);
  if (!item || EQUIPMENT_TYPES[item.kind].heats !== 1) return;
  item.level = level;
  for (const [containerId, standingOn] of standOnByContainer) {
    if (standingOn === equipmentId) dispatch.setHeat(containerId, level);
  }
  notify();
}

function removeEquipment(equipmentId) {
  const index = equipment.findIndex((eq) => eq.id === equipmentId);
  if (index === -1) return;
  // Nothing should keep reporting a temperature from furniture that no
  // longer exists, so every vessel standing on it comes off first.
  for (const [containerId, standingOn] of [...standOnByContainer]) {
    if (standingOn === equipmentId) standOn(containerId, null);
  }
  equipment.splice(index, 1);
  if (selectedEquipmentId === equipmentId) selectedEquipmentId = null;
  notify();
}

/** Puts a vessel back in the tray, with whatever was in it. */
function removeVessel(containerId) {
  const index = containers.findIndex((c) => c.id === containerId);
  if (index === -1) return;
  const name = containers[index].name;
  containers.splice(index, 1);
  containersById.delete(containerId);
  positionByContainer.delete(containerId);
  standOnByContainer.delete(containerId);
  clampedOverByContainer.delete(containerId);
  for (const [buretteId, over] of [...clampedOverByContainer]) {
    if (over === containerId) clampedOverByContainer.delete(buretteId);
  }
  if (selectedVesselId === containerId) selectedVesselId = null;
  notebook.logAction({
    text: `The ${name.toLowerCase()} was put away.`,
    containerId: null,
    action: 'removeVessel',
  });
  notify();
}

/**
 * Empties and rinses a vessel, leaving it on the bench.
 *
 * Rebuilt rather than emptied in place, for the same reason resetBench
 * rebuilds the whole bench: a freshly created container is already empty,
 * at room temperature, unheated and unelectrified, so this needs no new
 * "clear yourself" method on container.js.
 */
function emptyVessel(containerId) {
  const index = containers.findIndex((c) => c.id === containerId);
  const old = containers[index];
  if (!old) return;
  const def = VESSEL_TYPES[old.type];
  const fresh = buildContainer({
    id: old.id,
    name: old.name,
    type: old.type,
    capacityMl: def ? def.capacityMl : old.capacityMl,
  });
  containers[index] = fresh;
  containersById.set(containerId, fresh);
  lastAnimatedReactionByContainer.delete(containerId);
  lastElectrolysisByContainer.delete(containerId);
  // A rinsed vessel's old reading no longer describes what is in it, and
  // a fresh container is not electrified, so its power note goes too.
  stripByContainer.delete(containerId);
  powerNoteByContainer.delete(containerId);
  // Still standing on whatever it was standing on, so put the heat back.
  const standingOn = standOnByContainer.get(containerId);
  const item = standingOn ? equipment.find((eq) => eq.id === standingOn) : null;
  if (item) {
    const equipDef = EQUIPMENT_TYPES[item.kind];
    dispatch.setHeat(containerId, equipDef.heats === 1 ? item.level : equipDef.heats);
  }
  notebook.logAction({
    text: `The ${old.name.toLowerCase()} was emptied and rinsed.`,
    containerId,
    action: 'emptyVessel',
  });
  notify();
}

const notebook = createNotebook();
const tools = createTools({ getChemical: engine.getChemical, getFlameTest: engine.getFlameTest });
const actions = createActions({
  getContainer: (id) => containersById.get(id),
  engine,
  tools,
  onNotebookEntry: notebook.logAction,
});

// Phase 7's guided-mode state machine. It never touches the bench itself -
// see experiments.js's file header - so it only needs a way to look up a
// container's type (for steps written against "the beaker" rather than a
// fixed id) and the same notebook logAction() actions.js already uses, so
// a guided milestone lands in the same notebook as everything else.
const experimentRunner = createExperimentRunner({
  getContainer: (id) => containersById.get(id),
  onNotebookEntry: notebook.logAction,
});

// Which tool the student has picked up, if any. This is pure interface state -
// which button is highlighted - so it lives here rather than in src/core/.
let selectedToolId = null;

// UI.md section 6's in-app "Reduce animation" toggle. Starts off: unchecked
// does not mean "force motion on" - the OS's own prefers-reduced-motion, if
// set, still wins regardless of this. This is only the extra override for a
// shared machine where nobody has touched the OS setting, or a teacher who
// wants the projector still without changing Windows settings on a PC that
// is not theirs. Deliberately not reset by resetBench(): it is a display
// preference, not lab state.
let reduceAnimationEnabled = false;

// The shelf's DISPENSE strip: 'ask' opens the amount panel every time (the
// long-standing default, and the only way to add a solid's exact grams);
// 'quick' skips straight to adding quickAmount mL of whatever was dropped,
// for a student who is adding the same 10 mL of the same acid over and
// over and does not want to confirm it each time. Purely an interface
// convenience - it never changes what gets added, only how many clicks
// getting there takes - so it lives here rather than in src/core/.
let dispenseMode = 'ask';
let quickAmount = 10;

// Which chemical's properties card is open, if any - UI.md section 3's
// properties card overlay. Only the id is kept here; panels.js looks the
// full record up itself through engine.getChemical, the same read-only
// access shelf.js already uses to list reagents.
let viewingChemicalId = null;

// The hazard currently being warned about, rendered by the alert overlay in
// panels.js. The whole hazard object from reactions.json is kept, not just
// the four fields UI.md section 1's example lists - CLAUDE.md section 5's
// schema also carries whatToDoInstead, and that is the half that makes the
// warning teach rather than only frighten.
let activeHazard = null;

/**
 * Records a hazard when a reaction carries one.
 *
 * This only ever SETS. It deliberately does not clear the hazard when a
 * later, harmless reaction happens: UI.md section 6 says a hazard alert
 * holds its written warning, and a warning that quietly disappeared the
 * moment the student did something else would not be held at all. It is
 * cleared only by acknowledging it, or by resetting the bench.
 */
function trackHazard(engineResult) {
  const hazardStep = engineResult?.steps?.find((step) => step.reaction?.hazard);
  if (hazardStep) activeHazard = hazardStep.reaction.hazard;
}

// The most recent reaction in each vessel that has a molecular animation, so
// the "Molecular view" button appears on the vessel where it actually
// happened rather than somewhere general. Keyed by container id.
const lastAnimatedReactionByContainer = new Map();

// The most recent electrolysis in each vessel, so the bench can keep showing
// ions drifting to the electrodes while the current is still flowing.
//
// It has to be remembered rather than recomputed, because the moment the
// electrolysis runs its reactant is used up - the vessel then holds only
// products, which match no electrolysis rule, and the ions would vanish the
// instant they became relevant. A real cell goes on electrolysing for as
// long as the power is on, so remembering the reaction is also the more
// truthful of the two.
const lastElectrolysisByContainer = new Map();

/* ------------------------------------------------------------------ *
 * Notebook entry tags - the mockup colour-codes every log line by what
 * kind of thing it is (warning / action / reaction / observation /
 * measurement / estimate / milestone). None of that is chemistry, so it
 * does not belong in notebook.js: it is worked out here, once, from data
 * actions.js and experiments.js already hand back on every dispatch
 * (engineResult.outcome, a hazard on one of the steps, the action name
 * itself) - never guessed later by pattern-matching the entry's text.
 * Kept in a side table keyed by notebook entry id, since notebook.js's own
 * entry shape (UI.md section 1) has no field for it.
 * ------------------------------------------------------------------ */
const notebookEntryTags = new Map();

function tagAutoEntry(entryId, engineResult) {
  const hasHazard = engineResult?.steps?.some((step) => step.reaction?.hazard);
  if (hasHazard) {
    notebookEntryTags.set(entryId, 'warning');
  } else if (engineResult?.outcome === OUTCOME.REACTION) {
    notebookEntryTags.set(entryId, 'reaction');
  }
}

// The three guided-mode milestones (experiments.js's own action names),
// plus dipTool, are recognisable from the entry alone with no side table.
const MILESTONE_ACTIONS = new Set(['experimentStart', 'experimentStep', 'experimentComplete']);

function notebookTagFor(entry) {
  if (entry.type === 'observation') return entry.quantity != null ? 'estimate' : 'observation';
  if (entry.action === 'dipTool') return 'measurement';
  if (MILESTONE_ACTIONS.has(entry.action)) return 'milestone';
  return notebookEntryTags.get(entry.id) || 'action';
}

// The last few tool readings, for the bench's own READINGS strip - a
// separate, purely presentational echo of what dipTool already wrote to
// the notebook, not a second source of truth. Newest first, capped at 4
// the way the mockup's own panel is.
const READINGS_LIMIT = 4;
let readings = [];

function recordReading(result) {
  if (!result || result.action !== 'dipTool' || !result.reading) return;
  readings = [
    {
      toolId: result.toolId,
      containerId: result.containerId,
      text: result.reading.text,
      hasReading: result.reading.hasReading,
    },
    ...readings,
  ].slice(0, READINGS_LIMIT);
}

// "Contract trace" - the mockup's own developer-facing strip showing which
// dispatch call just fired, off by default. Not a chemistry feature; kept
// as plain interface state the same way reduceAnimationEnabled is.
let traceEnabled = false;
let traceLine = '';

function formatTraceArg(value) {
  if (typeof value === 'string') return `'${value}'`;
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'object') return '{…}';
  return String(value);
}

function recordTrace(actionName, args) {
  if (!actionName) return;
  traceLine = `${actionName}(${args.map(formatTraceArg).join(', ')})`;
}

// Which reaction's animation is open, if any.
let viewingReactionId = null;

// Which chemical's 3D ball-and-stick view is open, if any - reachable from
// the properties card for either a reagent or a formed product, the same
// way its 2D structure already is.
let viewing3DChemicalId = null;

// How the most recent action was judged against the current guided step,
// or null before anything has been judged yet. Cleared whenever guided
// mode is entered or left, so a stale "wrong action" message from a
// previous attempt never lingers into a fresh one.
let guidedFeedback = null;

// The completion summary is shown automatically the moment an experiment
// finishes (see mountGuidedSummary in guided.js). This only tracks whether
// the student has since closed it - reset to false every time a run starts,
// the same "which overlay is open" pattern viewingChemicalId etc. use above.
let guidedSummaryDismissed = false;

/**
 * Notes which vessel just ran a reaction worth animating.
 *
 * The last matching step wins, not the first: a cascade ends on whatever
 * happened most recently, and that is what a student just watched.
 */
function trackAnimatedReaction(result) {
  // addChemical/setHeat/stir report containerId; pour reports the vessel it
  // poured INTO as toId, which is the only one actions.js runs the engine on.
  const containerId = result.containerId ?? result.toId;
  const steps = result.engineResult?.steps;
  if (!containerId || !steps) return;

  const animated = [...steps].reverse().find((step) => step.reaction?.molecularAnimation);
  if (animated) lastAnimatedReactionByContainer.set(containerId, animated.reaction.id);

  const electrolysis = [...steps].reverse().find((step) => step.reaction?.electrodes);
  if (electrolysis) lastElectrolysisByContainer.set(containerId, electrolysis.reaction.id);
}

/* ------------------------------------------------------------------ *
 * A tiny pub/sub so every zone can re-render itself after any dispatch,
 * without app.js having to know which zones care about which actions.
 * ------------------------------------------------------------------ */

const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

// The six dispatch names a guided experiment's requiredAction can name (see
// experiments.json / experiments.js). Only these are ever handed to the
// runner - things like selectTool or viewProperties are interface state
// with nothing for a step to validate.
const GUIDED_ACTION_NAMES = new Set(['addChemical', 'pour', 'setHeat', 'setPower', 'stir', 'dipTool', 'recordObservation']);

/**
 * Rebuilds the { action, ... } shape experiments.js expects, straight from
 * the arguments a dispatch call was made with. This is possible only
 * because UI.md section 1 fixes each of these signatures exactly - the
 * argument order here is that contract, not a guess.
 */
function guidedPayload(actionName, args) {
  switch (actionName) {
    case 'addChemical':
      return { action: 'addChemical', containerId: args[0], chemicalId: args[1], amountMl: args[2] };
    case 'pour':
      return { action: 'pour', fromId: args[0], toId: args[1], amountMl: args[2] };
    case 'setHeat':
      return { action: 'setHeat', containerId: args[0], level: args[1] };
    case 'setPower':
      return { action: 'setPower', containerId: args[0], on: args[1] };
    case 'stir':
      return { action: 'stir', containerId: args[0] };
    case 'dipTool':
      return { action: 'dipTool', toolId: args[0], containerId: args[1] };
    case 'recordObservation':
      return { action: 'recordObservation', text: args[0] };
    default:
      return null;
  }
}

/**
 * Wraps a dispatch function so every call updates the hazard and molecular
 * animation tracking (if the result carries an engineResult), tells the
 * guided-mode runner what just happened (if one of the six action names is
 * given and a run is in progress), and then notifies every subscribed zone.
 *
 * Guided-mode judging happens AFTER fn(...args) has already run, never
 * instead of it - see experiments.js's file header on why guided mode is
 * not allowed to block the action it is watching.
 *
 * @param {Function} fn
 * @param {string}   [actionName] one of GUIDED_ACTION_NAMES, or left out for
 *   dispatch functions guided mode has no opinion about.
 * @param {string}   [traceName] what "Contract trace" prints for this call -
 *   defaults to actionName, but every dispatch entry needs one of its own
 *   even where actionName is left out (resetBench, selectTool, and the
 *   rest guided mode has no opinion about are still worth tracing).
 */
function wrap(fn, actionName = null, traceName = actionName) {
  return (...args) => {
    const result = fn(...args);
    if (result && result.engineResult) {
      trackHazard(result.engineResult);
      trackAnimatedReaction(result);
    }
    if (result && result.notebookEntry) {
      // actions.js's emitNotebookEntry returns the plain object it built
      // for onNotebookEntry, not notebook.logAction's own public entry - it
      // has no `id` field. Every wrapped call here logs at most one entry
      // synchronously, so the notebook's own last entry (fetched fresh
      // right now) is reliably the one this call just wrote - reading it
      // back from the notebook instance rather than reaching into
      // src/core/ to change what emitNotebookEntry returns.
      const entries = notebook.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) tagAutoEntry(lastEntry.id, result.engineResult);
    }
    if (result && result.action === 'dipTool') {
      recordReading(result);
    }
    // Keep each electrified vessel's "what the current is doing" note in
    // step with whatever the engine last said about that vessel, so adding
    // a reagent to a live cell updates it rather than leaving stale words.
    if (result && result.engineResult) {
      const noteFor = result.containerId ?? result.toId;
      if (noteFor) {
        const container = containersById.get(noteFor);
        if (result.action === 'setPower' && !result.on) {
          powerNoteByContainer.delete(noteFor);
        } else if (container && container.snapshot().electrified) {
          powerNoteByContainer.set(noteFor, result.engineResult.message || null);
        }
      }
    }
    if (actionName && GUIDED_ACTION_NAMES.has(actionName) && experimentRunner.isRunning()) {
      const payload = guidedPayload(actionName, args);
      const judged = experimentRunner.recordAction(payload);
      guidedFeedback = { judgement: judged.judgement, message: judged.message, hint: judged.hint };
    }
    recordTrace(traceName, args);
    notify();
    return result;
  };
}

/* ------------------------------------------------------------------ *
 * appearance is required by UI.md section 1's contract on every container,
 * but this turn's placeholder only renders contents/volume/temperature/pH
 * as plain text - nothing reads appearance yet. It is still built correctly
 * here rather than left out, because the state shape should be right even
 * before there is a UI that uses all of it.
 * ------------------------------------------------------------------ */

function appearanceFor(snapshot) {
  const empty = { colorHex: '#EEF3F5', colorName: 'colourless', precipitate: null, bubbling: false, smoking: false, glowing: false };
  if (snapshot.speciesIds.length === 0) return empty;

  if (snapshot.speciesIds.length === 1) {
    const chemical = engine.getChemical(snapshot.speciesIds[0]);
    if (chemical) {
      return { ...empty, colorHex: chemical.colorHex, colorName: chemical.colorName };
    }
  }

  // A mixture, or a reaction product with no chemicals.json entry (the known
  // reagent/species id gap flagged in earlier reviews). reactions.json's
  // effects only carry colorToHex, never a paired colorName, so section 5's
  // "every colour is always paired with its name" rule cannot be fully
  // honoured here yet. colorName is left null rather than invented; nothing
  // renders this yet, so nothing shows a name-less colour to a student today.
  return { ...empty, colorHex: '#C9D6DA', colorName: null };
}

/**
 * Turns experimentRunner's own state into UI.md section 1's guided shape
 * (experimentId, stepIndex, instruction, hint), plus what a step card and
 * completion summary need beyond that fixed set - the same "keep the fixed
 * fields and add clearly-marked extras" pattern the rest of this file's
 * getState() already follows for containers, tools and the modal-overlay ids.
 */
function guidedStateFor() {
  const runnerState = experimentRunner.getState();
  if (runnerState.status === EXPERIMENT_STATUS.NOT_STARTED) return null;

  return {
    experimentId: runnerState.experimentId,
    stepIndex: runnerState.stepIndex,
    instruction: runnerState.instruction,
    hint: runnerState.hint,
    title: runnerState.title,
    totalSteps: runnerState.totalSteps,
    objective: runnerState.objective,
    status: runnerState.status,
    expectedResult: runnerState.expectedResult,
    feedback: guidedFeedback,
    summaryVisible: runnerState.status === EXPERIMENT_STATUS.COMPLETE && !guidedSummaryDismissed,
  };
}

/**
 * The ions a vessel would show drifting to each electrode, if the current
 * were switched on.
 *
 * This asks the engine what electrolysis rule the vessel's contents match,
 * and then reads that rule's own `electrodes` block. Which ion goes to which
 * electrode is curated chemistry sitting in reactions.json - nothing here
 * works it out, exactly as nothing here works out what a reaction produces.
 * Returns an empty list for anything with no electrolysis rule, which is how
 * a cell full of a non-electrolyte correctly ends up showing no movement.
 */
function electrolysisIonsFor(snapshot) {
  if (!snapshot.electrified) return [];

  // What is in the vessel right now, if it matches an electrolysis rule...
  const match = engine.resolve(snapshot.speciesIds, {
    tempC: snapshot.temperatureC,
    heating: snapshot.heatLevel > 0,
    electrified: true,
    log: false,
  });

  // ...otherwise the electrolysis that has already run here, which is the
  // usual case: the reactant is consumed the instant the power goes on.
  const ran = lastElectrolysisByContainer.get(snapshot.id);
  const reaction = match.reaction?.electrodes ? match.reaction : (ran ? engine.getReaction(ran) : null);

  const electrodes = reaction?.electrodes;
  if (!electrodes) return [];

  const ions = [];
  for (const side of ['cathode', 'anode']) {
    const label = electrodes[side]?.attracts;
    if (!label) continue;
    // Two of each, so the drift reads as a crowd of ions rather than one
    // token particle heading each way.
    ions.push({ label, toward: side }, { label, toward: side });
  }
  return ions;
}

function getState() {
  const guided = guidedStateFor();
  return {
    containers: containers.map((container, index) => {
      const snapshot = container.snapshot();
      return {
        id: snapshot.id,
        name: snapshot.name,
        type: container.type,
        // Where this vessel actually sits on the bench top. The bench is a
        // canvas a student drags things around, so this is real state.
        position: positionByContainer.get(snapshot.id) || { x: 16, y: 16 },
        width: VESSEL_TYPES[container.type]?.w ?? 110,
        height: VESSEL_TYPES[container.type]?.h ?? 118,
        contents: snapshot.contents.map((item) => ({ chemicalId: item.id, amount: item.amount })),
        volumeMl: snapshot.volumeMl,
        // Not in UI.md section 1's example, but needed to draw a liquid
        // level: volumeMl alone cannot say how full a vessel looks without
        // knowing what full means for it.
        capacityMl: snapshot.capacityMl,
        temperatureC: snapshot.temperatureC,
        heatLevel: snapshot.heatLevel,
        electrified: snapshot.electrified,
        pH: snapshot.pH,
        appearance: appearanceFor(snapshot),
        // Which ions are drifting to which electrode, for bench.js to draw.
        // Read straight out of the reaction's curated `electrodes` block -
        // app.js does not decide any of this, it only looks it up.
        electrolysisIons: electrolysisIonsFor(snapshot),
        // The most recent reaction in THIS vessel that has a molecular
        // animation, so bench.js can offer to replay it right there. Null
        // until something animatable has actually happened in it.
        lastAnimatedReactionId: lastAnimatedReactionByContainer.get(snapshot.id) || null,
        // Which piece of bench furniture (if any) this vessel is standing
        // on - null means it is free-standing on the bench, with nothing
        // under it to heat it and so no heat control at all.
        standOn: standOnByContainer.get(snapshot.id) || null,
        // Which vessel a burette is clamped above, if it is.
        clampedOver: clampedOverByContainer.get(snapshot.id) || null,
        // Which tool is in the liquid right now, mid-gesture, and the last
        // reading this vessel gave - both drawn on the bench by bench.js.
        dipping: dippingByContainer.get(snapshot.id) || null,
        strip: stripByContainer.get(snapshot.id) || null,
        // The engine's own account of what the current is doing here.
        powerNote: powerNoteByContainer.get(snapshot.id) || null,
      };
    }),
    // Bench furniture from the apparatus tray, each at its own spot on the
    // bench top. canSetLevel lets bench.js draw the burner's knob without
    // recomputing EQUIPMENT_TYPES itself - that table is this file's.
    equipment: equipment.map((item) => ({
      id: item.id,
      kind: item.kind,
      label: EQUIPMENT_TYPES[item.kind].name,
      level: item.level,
      canSetLevel: EQUIPMENT_TYPES[item.kind].heats === 1,
      position: { x: item.x, y: item.y },
      width: EQUIPMENT_TYPES[item.kind].w,
      height: EQUIPMENT_TYPES[item.kind].h,
      // Which vessel (if any) is currently standing on this one.
      standingVesselId: [...standOnByContainer].find(([, on]) => on === item.id)?.[0] || null,
    })),
    selectedVesselId,
    selectedEquipmentId,
    vesselTypes: Object.entries(VESSEL_TYPES).map(([type, def]) => ({ type, label: def.label })),
    equipmentTypes: Object.entries(EQUIPMENT_TYPES).map(([kind, def]) => ({ kind, label: def.label })),
    vesselLimitReached: containers.length >= MAX_VESSELS,
    equipmentLimitReached: equipment.length >= MAX_EQUIPMENT,
    activeHazard,
    notebook: notebook.getEntries().map((entry) => ({ ...entry, tag: notebookTagFor(entry) })),
    readings,
    dispenseMode,
    quickAmount,
    traceEnabled,
    traceLine,
    mode: guided ? 'guided' : 'free',
    guided,
    // The catalogue for the topbar's Experiment picker (UI.md section 3).
    // Read-only, the same way tools.listTools() below lists what the tool
    // tray can offer without the UI inventing the list itself.
    experiments: experimentRunner.listExperiments(),
    // Beyond UI.md section 1's shape: the tool tray needs to know what tools
    // exist and which one is currently picked up. Kept separate from the
    // section 1 fields above so the contract stays recognisable.
    tools: tools.listTools(),
    selectedToolId,
    reduceAnimationEnabled,
    viewingChemicalId,
    viewingReactionId,
    viewing3DChemicalId,
  };
}

/**
 * What the instrument would say right now, used as the true value when a
 * student records an estimate. This reads through tools.js rather than
 * reaching into the container directly, so an estimate is always compared
 * against exactly what the tool would have shown - including its precision.
 */
function currentReadingFor(containerId, toolId) {
  const container = containersById.get(containerId);
  if (!container) return null;
  return tools.dip(toolId, container.snapshot());
}

/**
 * The actual work of clearing the bench, pulled out of the resetBench
 * dispatch entry below so startExperiment can reuse it without calling one
 * wrapped dispatch function from inside another (which would notify twice
 * for a single student action).
 */
function resetBenchState() {
  // Rebuilt from scratch rather than emptied in place: a freshly created
  // container is already empty, at room temperature, unheated and
  // unelectrified, so this is simpler than resetting each field by hand AND
  // it is what "anything taken from the apparatus tray goes back to the
  // tray" actually means - the original beaker and test tube are the only
  // two that always come back, by id, so a guided experiment step written
  // against "the beaker" still finds it.
  containers.length = 0;
  containers.push(...BASE_CONTAINER_DEFS.map(buildContainer));
  containersById.clear();
  for (const container of containers) containersById.set(container.id, container);
  equipment.length = 0;
  standOnByContainer.clear();
  positionByContainer.clear();
  clampedOverByContainer.clear();
  dippingByContainer.clear();
  stripByContainer.clear();
  powerNoteByContainer.clear();
  selectedVesselId = null;
  selectedEquipmentId = null;
  nextVesselNumber = {};
  nextEquipmentNumber = {};
  notebook.clear();
  notebookEntryTags.clear();
  readings = [];
  traceLine = '';
  activeHazard = null;
  selectedToolId = null;
  viewingChemicalId = null;
  viewingReactionId = null;
  viewing3DChemicalId = null;
  // A fresh bench has had no reactions in it, so no vessel should still be
  // offering to replay one from the last session.
  lastAnimatedReactionByContainer.clear();
  lastElectrolysisByContainer.clear();
}

/* ------------------------------------------------------------------ *
 * The fixed dispatch names from UI.md section 1, plus two additions:
 * selectTool (pure interface state - which tool is picked up) and
 * recordEstimate (the numeric half of compare-with-reference; see the
 * note above recordEstimate in notebook.js for why section 1's
 * recordObservation(text) could not carry it).
 * ------------------------------------------------------------------ */

const dispatch = {
  addChemical: wrap(actions.addChemical, 'addChemical'),
  pour: wrap(actions.pour, 'pour'),
  setHeat: wrap(actions.setHeat, 'setHeat'),
  // Electrolysis, added with the requiresElectricity condition in engine.js.
  // Not one of UI.md section 1's original names - that list predates
  // electrolysis being modelled - but it behaves exactly like setHeat.
  setPower: wrap(actions.setPower, 'setPower'),
  // Called by the burner tick below, not by a control the student clicks.
  // Deliberately not in GUIDED_ACTION_NAMES: a step should never be
  // satisfied by the burner ticking a degree, only by something the
  // student actually did.
  warmTo: wrap(actions.warmTo, null, 'warmTo'),
  stir: wrap(actions.stir, 'stir'),
  dipTool: wrap(actions.dipTool, 'dipTool'),
  recordObservation: wrap(notebook.recordObservation, 'recordObservation'),
  revealReference: wrap(notebook.revealReference, null, 'revealReference'),

  selectTool: wrap((toolId) => {
    // Clicking the tool you are already holding puts it back down.
    selectedToolId = selectedToolId === toolId ? null : toolId;
  }, null, 'selectTool'),

  // Not one of UI.md section 1's dispatch names. Section 1 has no action for
  // clearing activeHazard, but section 6 requires the warning to be held on
  // screen rather than timed out, so something has to end that hold - this
  // is the student saying they have read it.
  dismissHazard: wrap(() => {
    activeHazard = null;
  }, null, 'dismissHazard'),

  // Also not a section 1 name: the in-app "Reduce animation" toggle section
  // 6 asks for. setReduceAnimation (effects.js) is called directly here
  // rather than through a container/notebook action, because there is
  // nothing for the engine to decide - it only ever affects how a change is
  // shown, never what happened.
  setReduceAnimation: wrap((enabled) => {
    reduceAnimationEnabled = Boolean(enabled);
    setReduceAnimation(reduceAnimationEnabled);
  }, null, 'setReduceAnimation'),

  // The DISPENSE strip and the "Contract trace" checkbox - both purely
  // interface state, following the same pattern as setReduceAnimation
  // above: nothing here is a chemistry decision.
  setDispenseMode: wrap((mode) => {
    dispenseMode = mode === 'quick' ? 'quick' : 'ask';
  }, null, 'setDispenseMode'),
  setQuickAmount: wrap((amount) => {
    quickAmount = Math.max(1, Number(amount) || quickAmount);
  }, null, 'setQuickAmount'),
  setTraceEnabled: wrap((enabled) => {
    traceEnabled = Boolean(enabled);
  }, null, 'setTraceEnabled'),

  // Also not a section 1 name: UI.md section 3 lists the properties card as
  // a modal overlay, and something has to open and close it. Opening does
  // not check the id is real - engine.getChemical already returns null for
  // an unknown one, and panels.js shows that honestly instead of guessing.
  viewProperties: wrap((chemicalId) => {
    viewingChemicalId = chemicalId;
  }, null, 'viewProperties'),
  closeProperties: wrap(() => {
    viewingChemicalId = null;
  }, null, 'closeProperties'),

  // The molecular view, CLAUDE.md section 8's Phase 6 deliverable. Like
  // viewProperties, this does not check the id resolves - molecular.js says
  // so honestly if there is no animation, rather than opening a blank stage.
  viewReactionAnimation: wrap((reactionId) => {
    viewingReactionId = reactionId;
  }, null, 'viewReactionAnimation'),
  closeReactionAnimation: wrap(() => {
    viewingReactionId = null;
  }, null, 'closeReactionAnimation'),

  // The 3D ball-and-stick view. Same honesty as viewReactionAnimation: does
  // not check the id resolves or that 3D data exists for it - molecular3d.js
  // says so plainly rather than opening an empty stage.
  view3DStructure: wrap((chemicalId) => {
    viewing3DChemicalId = chemicalId;
  }, null, 'view3DStructure'),
  close3DStructure: wrap(() => {
    viewing3DChemicalId = null;
  }, null, 'close3DStructure'),

  /**
   * Records a student's estimate, capturing what the instrument actually says
   * right now as the hidden true value. The comparison itself happens in
   * notebook.js; this only supplies the two numbers and the tool's precision.
   */
  recordEstimate: wrap(({ containerId, toolId, value }) => {
    const reading = currentReadingFor(containerId, toolId);
    const container = containersById.get(containerId);
    return notebook.recordEstimate({
      value,
      // hasReading is false for a mixture with no curated pH. Passing null
      // through means the student is told "no reference available" rather
      // than being marked wrong against a value that does not exist.
      expected: reading && reading.hasReading ? reading.value : null,
      quantity: reading ? reading.quantity : null,
      unit: reading ? reading.unit : null,
      tolerance: reading ? reading.tolerance : null,
      containerId,
      containerName: container ? container.name : null,
    });
  }, null, 'recordEstimate'),
  resetBench: wrap(() => {
    resetBenchState();
    // Resetting mid-experiment restarts that experiment at step 1 rather
    // than silently leaving guided mode. Without this the step card would
    // go on asking for "step 4: dip the thermometer" over a bench that
    // Reset just emptied - a confusion this file has no business creating
    // when experiments.js already goes to such lengths to explain itself
    // honestly (see its file header).
    if (experimentRunner.getState().status !== EXPERIMENT_STATUS.NOT_STARTED) {
      experimentRunner.start(experimentRunner.getState().experimentId);
    }
    guidedFeedback = null;
    guidedSummaryDismissed = false;
  }, null, 'resetBench'),

  // Not one of UI.md section 1's fixed names - Phase 7's guided mode
  // (CLAUDE.md section 8) needs a way to start and leave a run, and to
  // dismiss the completion summary. All three follow the same
  // "does not validate, the thing underneath reports honestly" pattern as
  // viewProperties/viewReactionAnimation/view3DStructure above.
  startExperiment: wrap((experimentId) => {
    // A guided run begins from a clean, empty bench, the same way a real
    // experiment does - leftover chemicals or glassware from Free Lab or
    // an earlier attempt would make the very first step's instruction
    // either already satisfied by accident or flatly wrong.
    resetBenchState();
    // The bench itself starts with nothing on it (see BASE_CONTAINER_DEFS),
    // so a guided run has to put out whatever glassware it actually needs -
    // read straight from that experiment's own curated apparatus list in
    // experiments.json, the same list CLAUDE.md section 5's schema already
    // defines. Anything in that list that is not a bench object (pH paper,
    // a thermometer, a stirring rod - the tool tray and the Stir button
    // already cover those) is silently skipped rather than guessed at.
    const experiment = experimentRunner.getExperiment(experimentId);
    for (const item of experiment?.apparatus || []) {
      if (VESSEL_TYPES[item]) addVessel(item);
      else if (EQUIPMENT_TYPES[item]) addEquipment(item);
    }
    experimentRunner.start(experimentId);
    guidedFeedback = null;
    guidedSummaryDismissed = false;
  }, null, 'startExperiment'),

  // Leaves the bench exactly as it is. Leaving guided mode is "let me
  // carry on freely from here", not "start over" - Reset stays the
  // separate, deliberate way to clear the bench.
  stopExperiment: wrap(() => {
    experimentRunner.stop();
    guidedFeedback = null;
  }, null, 'stopExperiment'),

  dismissGuidedSummary: wrap(() => {
    guidedSummaryDismissed = true;
  }, null, 'dismissGuidedSummary'),

  // The apparatus tray, UI.md section 7's inventory of shelf controls. None
  // of these four are one of section 1's fixed names - that list predates
  // there being more than a fixed pair of vessels - so each follows the
  // same pattern as viewProperties/startExperiment above: pure interface
  // state, plain function, not validated against anything the engine knows.
  // addVessel/addEquipment already call notify() themselves (see above);
  // standOn and setEquipmentLevel notify by way of the dispatch.setHeat
  // they call internally, which is the same action every vessel's own heat
  // buttons already use.
  addVessel,
  addEquipment,
  standOn,
  setEquipmentLevel,
  removeEquipment,

  // The bench canvas: moving things about, picking one to work with, and
  // the burette's clamp. All pure interface state - none of it decides any
  // chemistry, it only decides where things are and which one is selected.
  // The dip gesture. dipTool above is still the real read and is what
  // guided mode judges; this is what a student's click actually starts.
  beginDip,

  moveVessel,
  moveEquipment,
  removeVessel,
  emptyVessel,
  selectVessel,
  selectEquipment,
  clampOver,
  unclamp,
  setBenchSize: (width, height) => {
    benchSize = { width, height };
  },
};

/* ------------------------------------------------------------------ *
 * Mount the zones and do the first paint.
 * ------------------------------------------------------------------ */

mountGuidedBar({ root: document.getElementById('guided-bar'), getState, dispatch, subscribe });
mountGuidedStepCard({ root: document.getElementById('guided-stepcard'), getState, dispatch, subscribe });
mountGuidedSummary({ root: document.getElementById('guided-summary'), getState, dispatch, subscribe });
// getState/subscribe are new here - the apparatus tray at the bottom of the
// shelf needs to grey out "+ Beaker" once the bench is full, which the
// static reagent list above it never needed to know about.
mountShelf({ root: document.getElementById('shelf'), getState, dispatch, subscribe });
mountBench({ root: document.getElementById('bench'), getState, dispatch, subscribe });
mountPanels({ root: document.getElementById('notebook'), getState, dispatch, subscribe });
mountHazardAlert({
  root: document.getElementById('hazard-alert'),
  getState,
  dispatch,
  subscribe,
  edgeEl: document.getElementById('hazard-edge'),
  // The bench is what shakes, not the whole window - see shakeElement in
  // effects.js for why the warning text is deliberately left still.
  shakeEl: document.getElementById('bench'),
});
mountPropertiesCard({
  root: document.getElementById('properties-card'),
  getState,
  dispatch,
  subscribe,
});
mountMolecularView({
  root: document.getElementById('molecular-view'),
  getState,
  dispatch,
  subscribe,
  // The same read-only engine access every other zone gets. molecular.js
  // needs the reaction to find its molecularAnimation id and its equation.
  getReaction: engine.getReaction,
});
mountMolecular3DView({
  root: document.getElementById('molecular-3d-view'),
  getState,
  dispatch,
  subscribe,
  getChemical: engine.getChemical,
});

/* ------------------------------------------------------------------ *
 * The burner tick.
 *
 * container.js records which position the burner knob is at but never
 * raises the temperature itself, and says so: turning "the burner is on"
 * into an actual temperature rise over time belongs outside it, the way it
 * does at a real bench. This is that clock.
 *
 * Without it every minTempC rule in reactions.json was unreachable - a
 * student could turn the burner to maximum and still be told the mixture
 * "needs to reach about 100 °C". Boiling temporary hardness out of hard
 * water and reacting magnesium with steam are both ordinary school
 * experiments that simply could not be performed.
 *
 * WHY THE NUMBERS ARE WHAT THEY ARE
 * A liquid on a burner climbs to its boiling point and then stays there,
 * however hard you heat it - the extra energy boils it away instead of
 * making it hotter. So anything holding liquid stops at 100 °C no matter
 * which position the knob is at. A dry tube has no such limit and a
 * roaring flame takes it several hundred degrees higher.
 *
 * That is also why an 801 °C melt and a 1500 °C lightning strike stay out
 * of reach, and should: those are a Down's cell and a thunderstorm, not a
 * Bunsen burner. The app already explains what is missing in those cases
 * rather than pretending.
 * ------------------------------------------------------------------ */

// A dry tube in a roaring blue flame genuinely reaches several hundred
// degrees - glass does not soften until about 700 °C. 250 was too timid and
// put magnesium carbonate's decomposition at 350 °C out of reach, which is
// an ordinary school experiment. Limestone at 900 °C stays unreachable, and
// should: that is a lime kiln, not a Bunsen burner.
const BURNER_TARGET_C = [ROOM_TEMPERATURE_C, 50, 80, 500];
const BURNER_RATE_C = [0, 2, 4, 8];
const COOLING_RATE_C = 3;
const BOILING_POINT_C = 100;
const BURNER_TICK_MS = 400;

// An ice bath. Not 0 °C: a beaker of melting ice and water sitting in a warm
// room settles a little above freezing, and a flask standing in it a little
// above that again. 2 °C is honest and still comfortably inside the window
// diazotisation needs.
//
// The rate is deliberately slower than the burner's. Ice cools by conduction
// through glass with no flame driving it, so a student who dips the flask in
// and immediately adds the reagent will find it has not got there yet - which
// is exactly the mistake the real procedure warns about.
const ICE_BATH_C = 2;
const ICE_RATE_C = 2.5;

let burnerTimer = null;

function burnerTick() {
  let stillBusy = false;

  for (const container of containers) {
    const level = container.getHeatLevel();
    const now = container.getTemperatureC();
    const holdsLiquid = container.getVolumeMl() > 0;

    // Ice bath: driven down towards the bath. Off: the glass simply gives its
    // heat back to the room. Burner: driven up, capped at boiling if there is
    // liquid in the way.
    let target;
    if (level < 0) target = ICE_BATH_C;
    else if (level === 0) target = ROOM_TEMPERATURE_C;
    else target = holdsLiquid ? Math.min(BURNER_TARGET_C[level], BOILING_POINT_C) : BURNER_TARGET_C[level];

    const rate = level < 0 ? ICE_RATE_C : level === 0 ? COOLING_RATE_C : BURNER_RATE_C[level];
    if (Math.abs(target - now) < 0.5) continue;

    const next = target > now ? Math.min(target, now + rate) : Math.max(target, now - rate);
    dispatch.warmTo(container.id, Math.round(next * 10) / 10);
    stillBusy = true;
  }

  // Nothing left to warm or cool: stop the clock rather than leave a timer
  // running behind an idle bench (CLAUDE.md section 9's performance budget).
  if (!stillBusy) {
    clearInterval(burnerTimer);
    burnerTimer = null;
  }
}

function ensureBurnerTicking() {
  if (burnerTimer !== null) return;
  burnerTimer = setInterval(burnerTick, BURNER_TICK_MS);
}

// Any state change might have turned a burner on, stood a vessel in ice,
// or emptied a hot vessel that now needs to cool, so the clock is
// (re)started after every dispatch.
//
// The test is "level is not zero", NOT "level is above zero". An ice bath
// is level -1, so testing for > 0 meant standing a vessel in ice never
// started the clock at all and the temperature simply sat there - unless a
// burner happened to have run first and left it away from room
// temperature, which is what made this look intermittent rather than
// broken.
subscribe(() => {
  const needsClock = containers.some(
    (container) => container.getHeatLevel() !== 0
      || Math.abs(container.getTemperatureC() - ROOM_TEMPERATURE_C) >= 0.5
  );
  if (needsClock) ensureBurnerTicking();
});

document.getElementById('reset-bench').addEventListener('click', () => dispatch.resetBench());

const reduceAnimationCheckbox = document.getElementById('reduce-animation');
reduceAnimationCheckbox.addEventListener('change', (event) => {
  dispatch.setReduceAnimation(event.target.checked);
});
// Kept in sync on every render rather than only set once, the same way
// bench.js and panels.js re-read getState() rather than trusting their own
// last-known value - this is the one piece of topbar chrome that reflects
// state rather than being fire-and-forget like Reset.
subscribe(() => {
  reduceAnimationCheckbox.checked = getState().reduceAnimationEnabled;
});

const traceCheckbox = document.getElementById('contract-trace');
traceCheckbox.addEventListener('change', (event) => {
  dispatch.setTraceEnabled(event.target.checked);
});
subscribe(() => {
  traceCheckbox.checked = getState().traceEnabled;
});

notify();

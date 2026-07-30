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

import { engine, ROOM_TEMPERATURE_C } from '../core/engine.js';
import { createContainer } from '../core/container.js';
import { createActions } from '../core/actions.js';
import { createNotebook } from '../core/notebook.js';
import { createTools } from '../core/tools.js';
import { mountShelf } from './shelf.js';
import { mountBench } from './bench.js';
import { mountPanels, mountHazardAlert, mountPropertiesCard } from './panels.js';
import { setReduceAnimation } from './effects.js';

/* ------------------------------------------------------------------ *
 * The bench. Free Lab mode has no experiment telling it what apparatus
 * to lay out (experiments.js is still an empty placeholder - guided mode
 * is Phase 7), so this is just a reasonable fixed starting bench: one
 * beaker, one test tube.
 * ------------------------------------------------------------------ */

const containers = [
  createContainer({
    id: 'beaker_1',
    name: 'Beaker',
    type: 'beaker',
    capacityMl: 250,
    getChemical: engine.getChemical,
  }),
  createContainer({
    id: 'tube_1',
    name: 'Test tube',
    type: 'test_tube',
    capacityMl: 50,
    getChemical: engine.getChemical,
  }),
];
const containersById = new Map(containers.map((container) => [container.id, container]));

const notebook = createNotebook();
const tools = createTools({ getChemical: engine.getChemical });
const actions = createActions({
  getContainer: (id) => containersById.get(id),
  engine,
  tools,
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

/**
 * Wraps a dispatch function so every call updates the hazard tracking (if the
 * result carries an engineResult) and then notifies every subscribed zone.
 */
function wrap(fn) {
  return (...args) => {
    const result = fn(...args);
    if (result && result.engineResult) trackHazard(result.engineResult);
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

function getState() {
  return {
    containers: containers.map((container, index) => {
      const snapshot = container.snapshot();
      return {
        id: snapshot.id,
        type: container.type,
        position: { slot: index },
        contents: snapshot.contents.map((item) => ({ chemicalId: item.id, amount: item.amount })),
        volumeMl: snapshot.volumeMl,
        // Not in UI.md section 1's example, but needed to draw a liquid
        // level: volumeMl alone cannot say how full a vessel looks without
        // knowing what full means for it.
        capacityMl: snapshot.capacityMl,
        temperatureC: snapshot.temperatureC,
        heatLevel: snapshot.heatLevel,
        pH: snapshot.pH,
        appearance: appearanceFor(snapshot),
      };
    }),
    activeHazard,
    notebook: notebook.getEntries(),
    mode: 'free',
    guided: null,
    // Beyond UI.md section 1's shape: the tool tray needs to know what tools
    // exist and which one is currently picked up. Kept separate from the
    // section 1 fields above so the contract stays recognisable.
    tools: tools.listTools(),
    selectedToolId,
    reduceAnimationEnabled,
    viewingChemicalId,
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

/* ------------------------------------------------------------------ *
 * The fixed dispatch names from UI.md section 1, plus two additions:
 * selectTool (pure interface state - which tool is picked up) and
 * recordEstimate (the numeric half of compare-with-reference; see the
 * note above recordEstimate in notebook.js for why section 1's
 * recordObservation(text) could not carry it).
 * ------------------------------------------------------------------ */

const dispatch = {
  addChemical: wrap(actions.addChemical),
  pour: wrap(actions.pour),
  setHeat: wrap(actions.setHeat),
  stir: wrap(actions.stir),
  dipTool: wrap(actions.dipTool),
  recordObservation: wrap(notebook.recordObservation),
  revealReference: wrap(notebook.revealReference),

  selectTool: wrap((toolId) => {
    // Clicking the tool you are already holding puts it back down.
    selectedToolId = selectedToolId === toolId ? null : toolId;
  }),

  // Not one of UI.md section 1's dispatch names. Section 1 has no action for
  // clearing activeHazard, but section 6 requires the warning to be held on
  // screen rather than timed out, so something has to end that hold - this
  // is the student saying they have read it.
  dismissHazard: wrap(() => {
    activeHazard = null;
  }),

  // Also not a section 1 name: the in-app "Reduce animation" toggle section
  // 6 asks for. setReduceAnimation (effects.js) is called directly here
  // rather than through a container/notebook action, because there is
  // nothing for the engine to decide - it only ever affects how a change is
  // shown, never what happened.
  setReduceAnimation: wrap((enabled) => {
    reduceAnimationEnabled = Boolean(enabled);
    setReduceAnimation(reduceAnimationEnabled);
  }),

  // Also not a section 1 name: UI.md section 3 lists the properties card as
  // a modal overlay, and something has to open and close it. Opening does
  // not check the id is real - engine.getChemical already returns null for
  // an unknown one, and panels.js shows that honestly instead of guessing.
  viewProperties: wrap((chemicalId) => {
    viewingChemicalId = chemicalId;
  }),
  closeProperties: wrap(() => {
    viewingChemicalId = null;
  }),

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
  }),
  resetBench: wrap(() => {
    // container.empty() deliberately leaves temperature and the burner alone
    // (see its comment in container.js: "the glassware leaves the glassware
    // warm", correct for tipping a vessel out mid-session). Resetting the
    // whole bench for a new session is a different intent, so those are put
    // back to their starting values here too, explicitly.
    for (const container of containers) {
      container.empty();
      container.setTemperatureC(ROOM_TEMPERATURE_C);
      container.setHeatLevel(0);
    }
    notebook.clear();
    activeHazard = null;
    selectedToolId = null;
    viewingChemicalId = null;
  }),
};

/* ------------------------------------------------------------------ *
 * Mount the zones and do the first paint.
 * ------------------------------------------------------------------ */

mountShelf({ root: document.getElementById('shelf'), dispatch });
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

notify();

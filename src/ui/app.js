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
import { mountShelf } from './shelf.js';
import { mountBench } from './bench.js';
import { mountPanels } from './panels.js';

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
const actions = createActions({
  getContainer: (id) => containersById.get(id),
  engine,
  onNotebookEntry: notebook.logAction,
});

// The most recent hazard, if the last reaction anywhere on the bench carried
// one. There is no hazard modal built yet (that is Phase 5's effects layer),
// so this is read by nothing yet - it exists so the state shape is already
// correct and complete for when that modal is built.
let activeHazard = null;

function trackHazard(engineResult) {
  const hazardStep = engineResult?.steps?.find((step) => step.reaction?.hazard);
  activeHazard = hazardStep ? hazardStep.reaction.hazard : null;
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
        temperatureC: snapshot.temperatureC,
        pH: snapshot.pH,
        appearance: appearanceFor(snapshot),
      };
    }),
    activeHazard,
    notebook: notebook.getEntries(),
    mode: 'free',
    guided: null,
  };
}

/* ------------------------------------------------------------------ *
 * The fixed dispatch names from UI.md section 1. dipTool is left out
 * rather than faked - tools.js (Phase 4) does not exist yet.
 * ------------------------------------------------------------------ */

const dispatch = {
  addChemical: wrap(actions.addChemical),
  pour: wrap(actions.pour),
  setHeat: wrap(actions.setHeat),
  stir: wrap(actions.stir),
  recordObservation: wrap(notebook.recordObservation),
  revealReference: wrap(notebook.revealReference),
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
  }),
};

/* ------------------------------------------------------------------ *
 * Mount the zones and do the first paint.
 * ------------------------------------------------------------------ */

mountShelf({ root: document.getElementById('shelf') });
mountBench({ root: document.getElementById('bench'), getState, dispatch, subscribe });
mountPanels({ root: document.getElementById('notebook'), getState, dispatch, subscribe });

document.getElementById('reset-bench').addEventListener('click', () => dispatch.resetBench());

notify();

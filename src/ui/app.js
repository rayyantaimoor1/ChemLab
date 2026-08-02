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
 */
function wrap(fn, actionName = null) {
  return (...args) => {
    const result = fn(...args);
    if (result && result.engineResult) {
      trackHazard(result.engineResult);
      trackAnimatedReaction(result);
    }
    if (actionName && GUIDED_ACTION_NAMES.has(actionName) && experimentRunner.isRunning()) {
      const payload = guidedPayload(actionName, args);
      const judged = experimentRunner.recordAction(payload);
      guidedFeedback = { judgement: judged.judgement, message: judged.message, hint: judged.hint };
    }
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
      };
    }),
    activeHazard,
    notebook: notebook.getEntries(),
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
  // container.empty() deliberately leaves temperature and the burner alone
  // (see its comment in container.js: "the glassware leaves the glassware
  // warm", correct for tipping a vessel out mid-session). Resetting the
  // whole bench for a new session is a different intent, so those are put
  // back to their starting values here too, explicitly.
  for (const container of containers) {
    container.empty();
    container.setTemperatureC(ROOM_TEMPERATURE_C);
    container.setHeatLevel(0);
    container.setElectrified(false);
  }
  notebook.clear();
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
  warmTo: wrap(actions.warmTo),
  stir: wrap(actions.stir, 'stir'),
  dipTool: wrap(actions.dipTool, 'dipTool'),
  recordObservation: wrap(notebook.recordObservation, 'recordObservation'),
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

  // The molecular view, CLAUDE.md section 8's Phase 6 deliverable. Like
  // viewProperties, this does not check the id resolves - molecular.js says
  // so honestly if there is no animation, rather than opening a blank stage.
  viewReactionAnimation: wrap((reactionId) => {
    viewingReactionId = reactionId;
  }),
  closeReactionAnimation: wrap(() => {
    viewingReactionId = null;
  }),

  // The 3D ball-and-stick view. Same honesty as viewReactionAnimation: does
  // not check the id resolves or that 3D data exists for it - molecular3d.js
  // says so plainly rather than opening an empty stage.
  view3DStructure: wrap((chemicalId) => {
    viewing3DChemicalId = chemicalId;
  }),
  close3DStructure: wrap(() => {
    viewing3DChemicalId = null;
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
  }),

  // Not one of UI.md section 1's fixed names - Phase 7's guided mode
  // (CLAUDE.md section 8) needs a way to start and leave a run, and to
  // dismiss the completion summary. All three follow the same
  // "does not validate, the thing underneath reports honestly" pattern as
  // viewProperties/viewReactionAnimation/view3DStructure above.
  startExperiment: wrap((experimentId) => {
    // A guided run begins from a clean bench, the same way a real
    // experiment does - leftover chemicals from Free Lab or an earlier
    // attempt would make the very first step's instruction either already
    // satisfied by accident or flatly wrong.
    resetBenchState();
    experimentRunner.start(experimentId);
    guidedFeedback = null;
    guidedSummaryDismissed = false;
  }),

  // Leaves the bench exactly as it is. Leaving guided mode is "let me
  // carry on freely from here", not "start over" - Reset stays the
  // separate, deliberate way to clear the bench.
  stopExperiment: wrap(() => {
    experimentRunner.stop();
    guidedFeedback = null;
  }),

  dismissGuidedSummary: wrap(() => {
    guidedSummaryDismissed = true;
  }),
};

/* ------------------------------------------------------------------ *
 * Mount the zones and do the first paint.
 * ------------------------------------------------------------------ */

mountGuidedBar({ root: document.getElementById('guided-bar'), getState, dispatch, subscribe });
mountGuidedStepCard({ root: document.getElementById('guided-stepcard'), getState, dispatch, subscribe });
mountGuidedSummary({ root: document.getElementById('guided-summary'), getState, dispatch, subscribe });
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

// Any state change might have turned a burner on, or emptied a hot vessel
// that now needs to cool, so the clock is (re)started after every dispatch.
subscribe(() => {
  const needsClock = containers.some(
    (container) => container.getHeatLevel() > 0
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

notify();

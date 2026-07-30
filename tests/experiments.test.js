/**
 * experiments.test.js — proves guided mode judges each action against the
 * current step, explains a wrong action instead of failing silently, and
 * never blocks the bench (CLAUDE.md section 8's Phase 7).
 *
 * Also checks the real experiments.json content: every id it names must
 * resolve, and both experiments must actually be completable by performing
 * their own steps against the real engine. An experiment that cannot be
 * finished is the guided-mode version of inventing chemistry.
 *
 * Run them with:  npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createExperimentRunner, STATUS, JUDGEMENT } from '../src/core/experiments.js';
import { createActions } from '../src/core/actions.js';
import { createContainer } from '../src/core/container.js';
import { createTools, TOOL } from '../src/core/tools.js';
import { engine } from '../src/core/engine.js';
import experimentData from '../src/data/experiments.json' with { type: 'json' };

/* ------------------------------------------------------------------ *
 * A small made-up experiment, so the state machine can be tested
 * without depending on the wording of the real content.
 * ------------------------------------------------------------------ */

const FAKE = [
  {
    id: 'exp_fake',
    title: 'Fake experiment',
    level: 'matric',
    objective: 'Prove the state machine works.',
    steps: [
      {
        n: 1,
        instruction: 'Add the acid to the beaker.',
        requiredAction: {
          type: 'addChemical',
          containerType: 'beaker',
          chemicalId: 'hcl_1m',
          minAmountMl: 10,
          maxAmountMl: 30,
        },
        hint: 'The acid goes in first.',
        onWrongAction: 'Put hydrochloric acid in the beaker to begin.',
      },
      {
        n: 2,
        instruction: 'Dip the pH paper.',
        requiredAction: { type: 'dipTool', toolId: 'ph_paper', containerType: 'beaker' },
        hint: 'Pick up the pH paper first.',
        onWrongAction: 'Dip the pH paper into the beaker.',
      },
      {
        n: 3,
        instruction: 'Stir it.',
        requiredAction: { type: 'stir', containerType: 'beaker' },
        hint: 'Press Stir.',
        onWrongAction: 'Stir the beaker.',
      },
    ],
    expectedResult: { endpointPH: 1.0 },
  },
];

/** A bench with one beaker and one test tube, matching app.js's real bench. */
function bench() {
  const containers = new Map([
    ['beaker_1', createContainer({ id: 'beaker_1', name: 'Beaker', type: 'beaker', capacityMl: 250, getChemical: engine.getChemical })],
    ['tube_1', createContainer({ id: 'tube_1', name: 'Test tube', type: 'test_tube', capacityMl: 50, getChemical: engine.getChemical })],
  ]);
  return { containers, getContainer: (id) => containers.get(id) };
}

function fakeRunner(extra = {}) {
  return createExperimentRunner({ experiments: FAKE, getContainer: bench().getContainer, ...extra });
}

const ADD_ACID = { action: 'addChemical', containerId: 'beaker_1', chemicalId: 'hcl_1m', amountMl: 25 };
const DIP_PH = { action: 'dipTool', toolId: 'ph_paper', containerId: 'beaker_1' };
const STIR = { action: 'stir', containerId: 'beaker_1' };

/* ------------------------------------------------------------------ *
 * Starting and stopping
 * ------------------------------------------------------------------ */

test('a fresh runner is not running any experiment', () => {
  const runner = fakeRunner();
  const state = runner.getState();
  assert.equal(state.status, STATUS.NOT_STARTED);
  assert.equal(state.experimentId, null);
  assert.equal(runner.isRunning(), false);
});

test('starting an experiment presents its first step', () => {
  const runner = fakeRunner();
  const state = runner.start('exp_fake');
  assert.equal(state.status, STATUS.IN_PROGRESS);
  assert.equal(state.experimentId, 'exp_fake');
  assert.equal(state.stepIndex, 0);
  assert.equal(state.totalSteps, 3);
  assert.equal(state.instruction, 'Add the acid to the beaker.');
  assert.equal(state.hint, 'The acid goes in first.');
});

test('starting an experiment that does not exist fails loudly', () => {
  const runner = fakeRunner();
  assert.throws(() => runner.start('exp_nope'), /no experiment found/);
});

test('the state exposes exactly the four field names UI.md section 1 fixes', () => {
  const runner = fakeRunner();
  const state = runner.start('exp_fake');
  for (const field of ['experimentId', 'stepIndex', 'instruction', 'hint']) {
    assert.ok(field in state, `state is missing ${field}`);
  }
});

test('stopping goes back to Free Lab', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');
  const state = runner.stop();
  assert.equal(state.status, STATUS.NOT_STARTED);
  assert.equal(state.experimentId, null);
});

test('the catalogue lists every experiment for the picker', () => {
  const runner = fakeRunner();
  const list = runner.listExperiments();
  assert.equal(list.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), ['id', 'level', 'objective', 'title']);
});

/* ------------------------------------------------------------------ *
 * Advancing on a correct action
 * ------------------------------------------------------------------ */

test('the right action advances to the next step', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');

  const result = runner.recordAction(ADD_ACID);
  assert.equal(result.judgement, JUDGEMENT.CORRECT);
  assert.equal(result.correct, true);
  assert.equal(result.advanced, true);
  assert.equal(runner.getState().stepIndex, 1);
  assert.equal(runner.getState().instruction, 'Dip the pH paper.');
});

test('a correct action names the next instruction so the student is never left guessing', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');
  const result = runner.recordAction(ADD_ACID);
  assert.match(result.message, /Dip the pH paper/);
});

test('working through every step completes the experiment', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');
  runner.recordAction(ADD_ACID);
  runner.recordAction(DIP_PH);
  const last = runner.recordAction(STIR);

  assert.equal(last.completed, true);
  assert.equal(runner.getState().status, STATUS.COMPLETE);
  assert.equal(runner.isRunning(), false);
});

test('the expected result is hidden until the experiment is finished', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');
  assert.equal(runner.getState().expectedResult, null, 'must not be readable as an answer key mid-run');

  runner.recordAction(ADD_ACID);
  runner.recordAction(DIP_PH);
  runner.recordAction(STIR);
  assert.deepEqual(runner.getState().expectedResult, { endpointPH: 1.0 });
});

test('actions after the experiment finishes are accepted, not treated as errors', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');
  runner.recordAction(ADD_ACID);
  runner.recordAction(DIP_PH);
  runner.recordAction(STIR);

  const after = runner.recordAction(ADD_ACID);
  assert.equal(after.judgement, JUDGEMENT.NOT_RUNNING);
  assert.equal(after.correct, false);
});

test('an action recorded in Free Lab is simply ignored', () => {
  const runner = fakeRunner();
  const result = runner.recordAction(ADD_ACID);
  assert.equal(result.judgement, JUDGEMENT.NOT_RUNNING);
  assert.equal(result.message, null);
});

/* ------------------------------------------------------------------ *
 * A wrong action explains itself (the point of this whole file)
 * ------------------------------------------------------------------ */

// setHeat appears nowhere in the fake experiment, so it is genuinely wrong
// rather than a step performed out of order - those are tested separately.
const WRONG_ACTION = { action: 'setHeat', containerId: 'beaker_1', level: 2 };

test('a wrong action does not advance the step', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');

  const result = runner.recordAction(WRONG_ACTION);
  assert.equal(result.judgement, JUDGEMENT.WRONG);
  assert.equal(result.advanced, false);
  assert.equal(runner.getState().stepIndex, 0, 'still on step 1');
});

test('a wrong action gives back the authored explanation, never a bare failure', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');

  const result = runner.recordAction({ action: 'addChemical', containerId: 'beaker_1', chemicalId: 'naoh_1m', amountMl: 25 });
  assert.equal(result.judgement, JUDGEMENT.WRONG);
  assert.match(result.message, /hydrochloric acid/i, 'the onWrongAction text must be surfaced');
  assert.ok(result.message.length > 20, 'a wrong action must explain itself');
});

test('a wrong action also hands back the step hint', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');
  const result = runner.recordAction(WRONG_ACTION);
  assert.equal(result.judgement, JUDGEMENT.WRONG);
  assert.equal(result.hint, 'The acid goes in first.');
});

test('the right reagent in the wrong vessel says so specifically', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');

  const result = runner.recordAction({ action: 'addChemical', containerId: 'tube_1', chemicalId: 'hcl_1m', amountMl: 25 });
  assert.equal(result.judgement, JUDGEMENT.WRONG);
  assert.match(result.detail, /beaker/);
  assert.match(result.detail, /test tube/, 'should name what they actually used');
});

test('the wrong tool is distinguished from the wrong kind of action', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');
  runner.recordAction(ADD_ACID); // now on step 2, "dip the pH paper"

  const result = runner.recordAction({ action: 'dipTool', toolId: 'thermometer', containerId: 'beaker_1' });
  assert.equal(result.judgement, JUDGEMENT.WRONG);
  assert.match(result.detail, /different tool/);
});

test('too little of the right reagent explains the amount rather than just refusing', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');

  const result = runner.recordAction({ ...ADD_ACID, amountMl: 2 });
  assert.equal(result.judgement, JUDGEMENT.WRONG);
  assert.match(result.detail, /less than/);
  assert.match(result.detail, /10/, 'should quote the range the step wants');
});

test('too much of the right reagent is explained the same way', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');
  const result = runner.recordAction({ ...ADD_ACID, amountMl: 200 });
  assert.match(result.detail, /more than/);
});

test('an amount inside the range is accepted anywhere in it', () => {
  for (const amount of [10, 18, 30]) {
    const runner = fakeRunner();
    runner.start('exp_fake');
    const result = runner.recordAction({ ...ADD_ACID, amountMl: amount });
    assert.equal(result.correct, true, `${amount} mL should be accepted`);
  }
});

/* ------------------------------------------------------------------ *
 * Guiding without blocking curiosity
 * ------------------------------------------------------------------ */

test('repeating a finished step is harmless, not an error', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');
  runner.recordAction(ADD_ACID);
  runner.recordAction(DIP_PH); // now on step 3

  const result = runner.recordAction(DIP_PH); // dip again, out of curiosity
  assert.equal(result.judgement, JUDGEMENT.REPEAT);
  assert.match(result.message, /no harm done/);
  assert.equal(runner.getState().stepIndex, 2, 'must not lose their place');
});

test('jumping ahead says which step still needs doing', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');

  const result = runner.recordAction(STIR); // that is step 3, they are on step 1
  assert.equal(result.judgement, JUDGEMENT.AHEAD);
  assert.match(result.message, /step 3/);
  assert.match(result.message, /Add the acid/, 'must restate what to do now');
  assert.equal(runner.getState().stepIndex, 0);
});

test('a wrong action never changes the bench - guided mode only observes', () => {
  const { containers, getContainer } = bench();
  const runner = createExperimentRunner({ experiments: FAKE, getContainer });
  runner.start('exp_fake');

  runner.recordAction({ action: 'addChemical', containerId: 'beaker_1', chemicalId: 'naoh_1m', amountMl: 25 });

  // The runner was only told about the action; it must not have touched anything.
  assert.equal(containers.get('beaker_1').isEmpty(), true);
});

test('recordAction refuses anything that is not an action object', () => {
  const runner = fakeRunner();
  runner.start('exp_fake');
  assert.throws(() => runner.recordAction(null), /needs the action/);
});

/* ------------------------------------------------------------------ *
 * Notebook entries (CLAUDE.md section 7)
 * ------------------------------------------------------------------ */

test('starting and finishing an experiment are both recorded in the notebook', () => {
  const entries = [];
  const runner = createExperimentRunner({
    experiments: FAKE,
    getContainer: bench().getContainer,
    onNotebookEntry: (entry) => entries.push(entry),
  });

  runner.start('exp_fake');
  runner.recordAction(ADD_ACID);
  runner.recordAction(DIP_PH);
  runner.recordAction(STIR);

  const kinds = entries.map((entry) => entry.action);
  assert.ok(kinds.includes('experimentStart'));
  assert.equal(kinds.filter((k) => k === 'experimentStep').length, 3);
  assert.ok(kinds.includes('experimentComplete'));
  for (const entry of entries) {
    assert.equal(typeof entry.text, 'string');
    assert.ok(entry.text.length > 0, 'every entry needs plain-English text');
  }
});

test('a wrong action is not written to the notebook as a step', () => {
  const entries = [];
  const runner = createExperimentRunner({
    experiments: FAKE,
    getContainer: bench().getContainer,
    onNotebookEntry: (entry) => entries.push(entry),
  });
  runner.start('exp_fake');
  runner.recordAction(STIR);

  assert.equal(entries.filter((entry) => entry.action === 'experimentStep').length, 0);
});

/* ------------------------------------------------------------------ *
 * Only the fields a step actually specifies are enforced
 * ------------------------------------------------------------------ */

test('a step that names no vessel accepts any vessel', () => {
  const loose = [{
    id: 'exp_loose',
    title: 'Loose',
    objective: 'x',
    steps: [{ n: 1, instruction: 'Stir something.', requiredAction: { type: 'stir' }, hint: 'h', onWrongAction: 'w' }],
  }];
  const runner = createExperimentRunner({ experiments: loose, getContainer: bench().getContainer });
  runner.start('exp_loose');
  assert.equal(runner.recordAction({ action: 'stir', containerId: 'tube_1' }).correct, true);
});

test('a step that names no amount accepts any amount', () => {
  const loose = [{
    id: 'exp_loose',
    title: 'Loose',
    objective: 'x',
    steps: [{ n: 1, instruction: 'Add acid.', requiredAction: { type: 'addChemical', chemicalId: 'hcl_1m' }, hint: 'h', onWrongAction: 'w' }],
  }];
  const runner = createExperimentRunner({ experiments: loose, getContainer: bench().getContainer });
  runner.start('exp_loose');
  assert.equal(runner.recordAction({ action: 'addChemical', containerId: 'tube_1', chemicalId: 'hcl_1m', amountMl: 999 }).correct, true);
});

test('pouring is judged on the vessel the liquid ended up in', () => {
  const pouring = [{
    id: 'exp_pour',
    title: 'Pour',
    objective: 'x',
    steps: [{ n: 1, instruction: 'Pour into the beaker.', requiredAction: { type: 'pour', containerType: 'beaker' }, hint: 'h', onWrongAction: 'w' }],
  }];
  const runner = createExperimentRunner({ experiments: pouring, getContainer: bench().getContainer });
  runner.start('exp_pour');

  assert.equal(runner.recordAction({ action: 'pour', fromId: 'tube_1', toId: 'beaker_1', amountMl: 10 }).correct, true);
});

test('a runner with no container lookup does not accuse the student of a vessel mistake it cannot see', () => {
  const runner = createExperimentRunner({ experiments: FAKE }); // no getContainer
  runner.start('exp_fake');
  // Vessel cannot be checked, but the reagent and amount still can.
  assert.equal(runner.recordAction(ADD_ACID).correct, true);
  const wrong = createExperimentRunner({ experiments: FAKE });
  wrong.start('exp_fake');
  assert.equal(wrong.recordAction({ ...ADD_ACID, chemicalId: 'naoh_1m' }).correct, false);
});

/* ------------------------------------------------------------------ *
 * The real content in experiments.json
 * ------------------------------------------------------------------ */

test('the real data file holds the two Phase 7 experiments', () => {
  const ids = experimentData.map((experiment) => experiment.id);
  assert.ok(ids.includes('exp_acid_base_titration'));
  assert.ok(ids.includes('exp_precipitation_lead_iodide'));
});

test('every experiment carries the fields CLAUDE.md section 5 requires', () => {
  for (const experiment of experimentData) {
    for (const field of ['id', 'title', 'level', 'objective', 'apparatus', 'reagents', 'steps', 'expectedResult', 'theory']) {
      assert.ok(experiment[field], `${experiment.id} is missing ${field}`);
    }
    // Section 6.4's rule, applied to experiments as well as reactions.
    assert.equal(typeof experiment.source, 'string', `${experiment.id} has no source`);
    assert.ok(experiment.source.length > 10);
  }
});

test('every step is numbered in order and carries an instruction, hint and wrong-action message', () => {
  for (const experiment of experimentData) {
    assert.ok(experiment.steps.length > 0);
    experiment.steps.forEach((step, index) => {
      assert.equal(step.n, index + 1, `${experiment.id} step numbering is out of order`);
      for (const field of ['instruction', 'hint', 'onWrongAction', 'requiredAction']) {
        assert.ok(step[field], `${experiment.id} step ${step.n} is missing ${field}`);
      }
      assert.ok(step.requiredAction.type, `${experiment.id} step ${step.n} has no action type`);
    });
  }
});

test('every id the real experiments name actually resolves', () => {
  const toolIds = new Set(Object.values(TOOL));
  const knownActions = new Set(['addChemical', 'pour', 'setHeat', 'stir', 'dipTool', 'recordObservation']);
  const knownTypes = new Set(['beaker', 'test_tube', 'conical_flask']);

  for (const experiment of experimentData) {
    for (const reagentId of experiment.reagents) {
      assert.ok(engine.getChemical(reagentId), `${experiment.id} names unknown reagent ${reagentId}`);
    }
    for (const step of experiment.steps) {
      const required = step.requiredAction;
      assert.ok(knownActions.has(required.type), `${experiment.id} step ${step.n} uses unknown action ${required.type}`);
      if (required.chemicalId) {
        assert.ok(engine.getChemical(required.chemicalId), `unknown chemical ${required.chemicalId}`);
      }
      if (required.toolId) assert.ok(toolIds.has(required.toolId), `unknown tool ${required.toolId}`);
      if (required.containerType) assert.ok(knownTypes.has(required.containerType), `unknown vessel type ${required.containerType}`);
    }
  }
});

test('every reagent a step uses is declared in the experiment reagents list', () => {
  for (const experiment of experimentData) {
    const declared = new Set(experiment.reagents);
    for (const step of experiment.steps) {
      const chemicalId = step.requiredAction.chemicalId;
      if (chemicalId) {
        assert.ok(declared.has(chemicalId), `${experiment.id} step ${step.n} uses undeclared reagent ${chemicalId}`);
      }
    }
  }
});

/* ------------------------------------------------------------------ *
 * The real experiments must actually be completable
 * ------------------------------------------------------------------ */

/**
 * Performs an experiment by reading its own steps and doing exactly what each
 * one asks, against the real engine and the real bench. If an experiment
 * cannot be finished this way, its content is broken.
 */
function performExperiment(experimentId) {
  const { containers, getContainer } = bench();
  const tools = createTools({ getChemical: engine.getChemical });
  const actions = createActions({ getContainer, engine, tools });
  const runner = createExperimentRunner({ experiments: experimentData, getContainer });

  runner.start(experimentId);

  const vesselFor = (required) => {
    if (required.containerId) return required.containerId;
    for (const [id, container] of containers) {
      if (container.type === required.containerType) return id;
    }
    throw new Error(`no vessel of type ${required.containerType} on the bench`);
  };

  const judgements = [];
  let guard = 0;

  while (runner.isRunning()) {
    if (guard++ > 50) throw new Error('experiment did not finish');
    const step = runner.getCurrentStep();
    const required = step.requiredAction;
    const amount = required.minAmountMl ?? 10;
    let performed;

    switch (required.type) {
      case 'addChemical': {
        const containerId = vesselFor(required);
        actions.addChemical(containerId, required.chemicalId, amount);
        performed = { action: 'addChemical', containerId, chemicalId: required.chemicalId, amountMl: amount };
        break;
      }
      case 'stir': {
        const containerId = vesselFor(required);
        actions.stir(containerId);
        performed = { action: 'stir', containerId };
        break;
      }
      case 'dipTool': {
        const containerId = vesselFor(required);
        actions.dipTool(required.toolId, containerId);
        performed = { action: 'dipTool', toolId: required.toolId, containerId };
        break;
      }
      case 'recordObservation':
        // Not an actions.js action - the student types this into the notebook.
        performed = { action: 'recordObservation', text: 'It changed.' };
        break;
      default:
        throw new Error(`test cannot perform action type ${required.type}`);
    }

    const result = runner.recordAction(performed);
    judgements.push(result.judgement);
  }

  return { runner, containers, judgements };
}

test('the titration can be completed by following its own steps', () => {
  const { runner, containers, judgements } = performExperiment('exp_acid_base_titration');

  assert.ok(judgements.every((judgement) => judgement === JUDGEMENT.CORRECT), `unexpected judgements: ${judgements}`);
  assert.equal(runner.getState().status, STATUS.COMPLETE);

  // And the bench really ends up where expectedResult says it does.
  const beaker = containers.get('beaker_1');
  assert.equal(beaker.getPH(), runner.getState().expectedResult.endpointPH);
});

test('the titration really does warm up by the amount it claims', () => {
  const { containers, runner } = performExperiment('exp_acid_base_titration');
  const rise = containers.get('beaker_1').getTemperatureC() - 25;
  assert.equal(rise, runner.getState().expectedResult.temperatureRiseC);
});

test('the precipitation can be completed by following its own steps', () => {
  const { runner, containers, judgements } = performExperiment('exp_precipitation_lead_iodide');

  assert.ok(judgements.every((judgement) => judgement === JUDGEMENT.CORRECT), `unexpected judgements: ${judgements}`);
  assert.equal(runner.getState().status, STATUS.COMPLETE);

  const tube = containers.get('tube_1');
  assert.ok(tube.has('pbi2_s'), 'the yellow precipitate should have formed');
  assert.equal(tube.getPH(), runner.getState().expectedResult.endpointPH);
});

test('the precipitation leaves spectator ions that still conduct, as its last step teaches', () => {
  const { containers } = performExperiment('exp_precipitation_lead_iodide');
  const tube = containers.get('tube_1');
  assert.ok(tube.has('kno3_aq'), 'potassium nitrate should remain dissolved');

  const tools = createTools({ getChemical: engine.getChemical });
  const reading = tools.dip(TOOL.CONDUCTIVITY, tube.snapshot());
  assert.match(reading.text, /lit brightly|conducts/);
});

test('the real experiments never leave a step unreachable because of a wrong reagent id', () => {
  // Performing each experiment already proves the happy path; this checks the
  // unhappy one, that a deliberately wrong action is explained rather than
  // silently swallowed, using the real authored content.
  const { getContainer } = bench();
  const runner = createExperimentRunner({ experiments: experimentData, getContainer });
  runner.start('exp_precipitation_lead_iodide');

  const result = runner.recordAction({ action: 'addChemical', containerId: 'tube_1', chemicalId: 'ki_0_1m', amountMl: 10 });
  assert.equal(result.judgement, JUDGEMENT.AHEAD, 'adding the iodide first is step 3, not step 1');
  assert.match(result.message, /lead\(II\) nitrate/i);
});

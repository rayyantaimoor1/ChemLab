/**
 * actions.test.js — proves the four dispatched actions from UI.md section 1
 * update the right container and always run a fresh engine check.
 *
 * Run them with:  npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createActions } from '../src/core/actions.js';
import { createContainer } from '../src/core/container.js';
import { createEngine, OUTCOME } from '../src/core/engine.js';

/* ------------------------------------------------------------------ *
 * A small made-up world, so these tests do not depend on real chemistry
 * content and cannot break when chemicals.json or reactions.json change.
 * ------------------------------------------------------------------ */

const chemicals = [
  { id: 'acid', name: 'Test acid', state: 'aqueous', pH: 1.0 },
  { id: 'alkali', name: 'Test alkali', state: 'aqueous', pH: 13.0 },
  { id: 'salt_solution', name: 'Test salt solution', state: 'aqueous', pH: 7.0 },
  { id: 'water', name: 'Test water', state: 'liquid', pH: 7.0 },
  { id: 'metal', name: 'Test metal', state: 'solid', pH: null },
  { id: 'hot_only_a', name: 'Hot reagent A', state: 'aqueous', pH: 7.0 },
  { id: 'hot_only_b', name: 'Hot reagent B', state: 'aqueous', pH: 7.0 },
  { id: 'hot_product', name: 'Hot product', state: 'aqueous', pH: 7.0 },
];

const neutralisation = {
  id: 'rxn_test_neutralisation',
  reactants: ['acid', 'alkali'],
  conditions: { requiresHeat: false, minTempC: null, catalyst: null },
  products: ['salt_solution', 'water'],
  equation: 'Acid + Alkali → Salt + Water',
  effects: {
    colorToHex: '#EEF3F5',
    precipitate: null,
    gas: null,
    bubbles: false,
    smoke: false,
    tempDeltaC: 7,
    resultPH: 7.0,
  },
  explanation: 'Test neutralisation.',
  levels: ['matric'],
  source: 'fixture',
};

const needsHeat = {
  id: 'rxn_test_needs_heat',
  reactants: ['hot_only_a', 'hot_only_b'],
  conditions: { requiresHeat: true, minTempC: null, catalyst: null },
  products: ['hot_product'],
  equation: 'A + B → Product',
  effects: {
    colorToHex: '#EEF3F5',
    precipitate: null,
    gas: 'steam',
    bubbles: true,
    smoke: false,
    tempDeltaC: 0,
    resultPH: 7.0,
  },
  explanation: 'Only happens once heated.',
  levels: ['matric'],
  source: 'fixture',
};

function makeWorld() {
  const engine = createEngine({ chemicals, reactions: [neutralisation, needsHeat] });
  const containers = new Map();

  const getContainer = (id) => containers.get(id);
  const register = (container) => {
    containers.set(container.id, container);
    return container;
  };

  const notebookEntries = [];
  const actions = createActions({
    getContainer,
    engine,
    onNotebookEntry: (entry) => notebookEntries.push(entry),
  });

  return { engine, containers, register, actions, notebookEntries };
}

const chemicalsById = new Map(chemicals.map((chemical) => [chemical.id, chemical]));
const getFixtureChemical = (id) => chemicalsById.get(id) || null;

function beaker(id, options = {}) {
  return createContainer({
    id,
    name: `Beaker ${id}`,
    capacityMl: 250,
    getChemical: getFixtureChemical,
    ...options,
  });
}

/* ------------------------------------------------------------------ *
 * Setup and wiring
 * ------------------------------------------------------------------ */

test('createActions refuses to be built without a way to find containers', () => {
  assert.throws(() => createActions({}), TypeError);
});

test('the returned action set has exactly the four names from UI.md section 1', () => {
  const { actions } = makeWorld();

  assert.equal(typeof actions.addChemical, 'function');
  assert.equal(typeof actions.pour, 'function');
  assert.equal(typeof actions.setHeat, 'function');
  assert.equal(typeof actions.stir, 'function');
});

test('every action throws a clear error for an id nobody registered', () => {
  const { actions } = makeWorld();

  assert.throws(() => actions.addChemical('nope', 'acid', 10), /no container found with id 'nope'/);
  assert.throws(() => actions.pour('nope', 'alsoNope', 10), /no container found/);
  assert.throws(() => actions.setHeat('nope', 1), /no container found/);
  assert.throws(() => actions.stir('nope'), /no container found/);
});

/* ------------------------------------------------------------------ *
 * addChemical(containerId, chemicalId, amountMl)
 * ------------------------------------------------------------------ */

test('addChemical puts the chemical in the named container', () => {
  const { register, actions, getContainer: _unused } = makeWorld();
  const b1 = register(beaker('b1'));

  const result = actions.addChemical('b1', 'acid', 25);

  assert.equal(result.action, 'addChemical');
  assert.equal(b1.getAmountOf('acid'), 25);
  assert.equal(result.added, 25);
  assert.equal(result.unit, 'mL');
});

test('addChemical refuses a chemical id that is not in the data', () => {
  const { register, actions } = makeWorld();
  register(beaker('b1'));

  assert.throws(() => actions.addChemical('b1', 'unobtainium', 10), /not a known chemical/);
});

test('addChemical triggers an engine check and applies a reaction that becomes possible', () => {
  const { register, actions } = makeWorld();
  const b1 = register(beaker('b1'));

  actions.addChemical('b1', 'acid', 25);
  const result = actions.addChemical('b1', 'alkali', 25);

  assert.equal(result.engineResult.outcome, OUTCOME.REACTION);
  assert.deepEqual(b1.getSpeciesIds(), ['salt_solution', 'water']);
  assert.equal(b1.getTemperatureC(), 32); // 25 + curated 7
  assert.equal(b1.getPH(), 7.0);
});

test('addChemical reports an overflow and still checks the container', () => {
  const { register, actions } = makeWorld();
  register(beaker('b1', { capacityMl: 20 }));

  const result = actions.addChemical('b1', 'acid', 50);

  assert.equal(result.overflowed, true);
  assert.equal(result.spilled, 30);
  assert.equal(result.engineResult.outcome, OUTCOME.NO_REACTION);
});

test('addChemical writes a plain-English notebook sentence naming the chemical', () => {
  const { register, actions } = makeWorld();
  register(beaker('b1'));

  const result = actions.addChemical('b1', 'acid', 25);

  assert.match(result.notebookText, /Added 25 mL of Test acid to Beaker b1/);
});

test('addChemical hands the notebook entry to the injected callback', () => {
  const { register, actions, notebookEntries } = makeWorld();
  register(beaker('b1'));

  actions.addChemical('b1', 'acid', 25);

  assert.equal(notebookEntries.length, 1);
  assert.equal(notebookEntries[0].action, 'addChemical');
  assert.equal(notebookEntries[0].containerId, 'b1');
  assert.equal(typeof notebookEntries[0].timestamp, 'number');
});

/* ------------------------------------------------------------------ *
 * pour(fromId, toId, amountMl)
 * ------------------------------------------------------------------ */

test('pour moves liquid from one registered container to another', () => {
  const { register, actions } = makeWorld();
  const b1 = register(beaker('b1'));
  const b2 = register(beaker('b2'));
  b1.add('acid', 40);

  const result = actions.pour('b1', 'b2', 25);

  assert.equal(result.poured, 25);
  assert.equal(b1.getVolumeMl(), 15);
  assert.equal(b2.getVolumeMl(), 25);
});

test('pour triggers an engine check on the RECEIVING container', () => {
  const { register, actions } = makeWorld();
  const b1 = register(beaker('b1'));
  const b2 = register(beaker('b2'));
  b1.add('acid', 40);
  b2.add('alkali', 40);

  const result = actions.pour('b1', 'b2', 25);

  assert.equal(result.engineResult.outcome, OUTCOME.REACTION);
  assert.deepEqual(b2.getSpeciesIds(), ['salt_solution', 'water']);
});

test('pouring out of an empty container is reported, not thrown', () => {
  const { register, actions } = makeWorld();
  register(beaker('b1'));
  register(beaker('b2'));

  const result = actions.pour('b1', 'b2', 25);

  assert.equal(result.poured, 0);
  assert.match(result.notebookText, /was empty/);
});

test('pour into a too-small container reports the spill', () => {
  const { register, actions } = makeWorld();
  const b1 = register(beaker('b1'));
  const b2 = register(beaker('b2', { capacityMl: 10 }));
  b1.add('acid', 40);

  const result = actions.pour('b1', 'b2', 40);

  assert.ok(result.spilled > 0);
  assert.match(result.notebookText, /overflowed/);
});

/* ------------------------------------------------------------------ *
 * setHeat(containerId, level)
 * ------------------------------------------------------------------ */

test('setHeat sets the burner level on the named container', () => {
  const { register, actions } = makeWorld();
  const b1 = register(beaker('b1'));

  actions.setHeat('b1', 2);

  assert.equal(b1.getHeatLevel(), 2);
  assert.equal(b1.isHeating(), true);
});

test('setHeat to 0 turns the burner off', () => {
  const { register, actions } = makeWorld();
  const b1 = register(beaker('b1'));
  b1.setHeatLevel(3);

  actions.setHeat('b1', 0);

  assert.equal(b1.getHeatLevel(), 0);
  assert.equal(b1.isHeating(), false);
});

test('setHeat only accepts whole numbers from -1 to 3', () => {
  const { register, actions } = makeWorld();
  register(beaker('b1'));

  // -1 is the ice bath and is a real setting; -2 and 4 are not.
  assert.doesNotThrow(() => actions.setHeat('b1', -1));
  assert.throws(() => actions.setHeat('b1', 4));
  assert.throws(() => actions.setHeat('b1', -2));
  assert.throws(() => actions.setHeat('b1', 1.5));
});

test('turning the heat on unlocks a reaction that needed heat', () => {
  const { register, actions } = makeWorld();
  const b1 = register(beaker('b1'));
  b1.add('hot_only_a', 20);
  b1.add('hot_only_b', 20);

  const cold = actions.stir('b1');
  assert.equal(cold.engineResult.outcome, OUTCOME.NO_REACTION);

  const result = actions.setHeat('b1', 2);

  assert.equal(result.engineResult.outcome, OUTCOME.REACTION);
  assert.deepEqual(b1.getSpeciesIds(), ['hot_product']);
});

test('turning the heat back off is itself noted and rechecked', () => {
  const { register, actions } = makeWorld();
  const b1 = register(beaker('b1'));

  const result = actions.setHeat('b1', 0);

  assert.match(result.notebookText, /turned off/);
  assert.equal(result.engineResult.outcome, OUTCOME.NO_REACTION);
});

/* ------------------------------------------------------------------ *
 * stir(containerId)
 * ------------------------------------------------------------------ */

test('stir does not add, remove or change any amount', () => {
  const { register, actions } = makeWorld();
  const b1 = register(beaker('b1'));
  b1.add('acid', 25);
  b1.add('metal', 5);

  actions.stir('b1');

  assert.equal(b1.getAmountOf('acid'), 25);
  assert.equal(b1.getAmountOf('metal'), 5);
  assert.equal(b1.getVolumeMl(), 25);
});

test('stir still triggers a fresh engine check', () => {
  const { register, actions } = makeWorld();
  const b1 = register(beaker('b1'));
  b1.add('acid', 25);
  b1.add('alkali', 25);

  const result = actions.stir('b1');

  assert.equal(result.engineResult.outcome, OUTCOME.REACTION);
  assert.deepEqual(b1.getSpeciesIds(), ['salt_solution', 'water']);
});

test('stir on an empty vessel is harmless', () => {
  const { register, actions } = makeWorld();
  register(beaker('b1'));

  const result = actions.stir('b1');

  assert.equal(result.engineResult.outcome, OUTCOME.NO_REACTION);
});

/* ------------------------------------------------------------------ *
 * dipTool(toolId, containerId) — a read, never a change
 * ------------------------------------------------------------------ */

test('dipTool returns a reading and logs it to the notebook', async () => {
  const { createTools, TOOL } = await import('../src/core/tools.js');
  const { register, actions: _ignored, engine, containers } = makeWorld();
  const b1 = register(beaker('b1'));
  b1.add('acid', 25);

  const notebookEntries = [];
  const actions = createActions({
    getContainer: (id) => containers.get(id),
    engine,
    tools: createTools({ getChemical: engine.getChemical }),
    onNotebookEntry: (entry) => notebookEntries.push(entry),
  });

  const result = actions.dipTool(TOOL.PH_PAPER, 'b1');

  assert.equal(result.action, 'dipTool');
  assert.equal(result.reading.value, 1.0);
  assert.equal(notebookEntries.length, 1);
  assert.equal(notebookEntries[0].action, 'dipTool');
  assert.match(notebookEntries[0].text, /pH paper/);
});

test('dipTool does not change the container or trigger a reaction', async () => {
  const { createTools, TOOL } = await import('../src/core/tools.js');
  const { register, engine, containers } = makeWorld();
  const b1 = register(beaker('b1'));
  // Both halves of a reaction present, but dipping must not set it off.
  b1.add('acid', 25);
  b1.add('alkali', 25);
  const before = b1.snapshot();

  const actions = createActions({
    getContainer: (id) => containers.get(id),
    engine,
    tools: createTools({ getChemical: engine.getChemical }),
  });

  const result = actions.dipTool(TOOL.THERMOMETER, 'b1');

  assert.equal(result.engineResult, undefined); // no engine check at all
  assert.deepEqual(b1.getSpeciesIds(), before.speciesIds);
  assert.equal(b1.getTemperatureC(), before.temperatureC);
});

test('dipTool without a tools set fails loudly rather than quietly', () => {
  const { register, actions } = makeWorld();
  register(beaker('b1'));

  assert.throws(() => actions.dipTool('ph_paper', 'b1'), /not given a tools set/);
});

/* ------------------------------------------------------------------ *
 * Each action really does produce a notebook entry (CLAUDE.md section 7)
 * ------------------------------------------------------------------ */

test('all four actions call the notebook hook exactly once each', () => {
  const { register, actions, notebookEntries } = makeWorld();
  const b1 = register(beaker('b1'));
  const b2 = register(beaker('b2'));
  b1.add('acid', 20);

  actions.addChemical('b1', 'alkali', 20);
  actions.pour('b1', 'b2', 10);
  actions.setHeat('b2', 1);
  actions.stir('b2');

  assert.deepEqual(
    notebookEntries.map((entry) => entry.action),
    ['addChemical', 'pour', 'setHeat', 'stir']
  );
  for (const entry of notebookEntries) {
    assert.equal(typeof entry.text, 'string');
    assert.ok(entry.text.length > 0);
  }
});

/* ------------------------------------------------------------------ *
 * Working with the real engine and real content
 * ------------------------------------------------------------------ */

test('a real bench: HCl added to a flask already holding NaOH neutralises', async () => {
  const { engine } = await import('../src/core/engine.js');
  const containers = new Map();
  const getContainer = (id) => containers.get(id);
  const actions = createActions({ getContainer, engine });

  const flask = createContainer({
    id: 'flask',
    name: 'Conical flask',
    capacityMl: 250,
    getChemical: engine.getChemical,
  });
  containers.set('flask', flask);

  actions.addChemical('flask', 'naoh_1m', 25);
  const result = actions.addChemical('flask', 'hcl_1m', 25);

  assert.equal(result.engineResult.outcome, OUTCOME.REACTION);
  assert.match(result.notebookText, /warmed/);

  // The products of a reaction are now real, described substances rather
  // than bare ids nothing could look up. This assertion used to pin the
  // opposite - that getChemical('nacl_aq') returned null - as a known gap.
  assert.deepEqual(flask.getSpeciesIds(), ['nacl_aq', 'water']);
  assert.ok(engine.getChemical('nacl_aq'), 'the salt formed should be a known substance');
  assert.equal(engine.getChemical('nacl_aq').name, 'Sodium chloride solution');
  assert.equal(flask.getPH(), 7.0);
});

/* ------------------------------------------------------------------ *
 * warmTo - what makes the burner actually do something.
 *
 * setHeat only records the knob position. Before warmTo existed, every
 * rule gated on minTempC was unreachable: a student could turn the burner
 * to maximum and still be told the mixture "needs to reach about 100 °C".
 * ------------------------------------------------------------------ */

test('warmTo puts the vessel at the temperature it is given', () => {
  const { register, actions } = makeWorld();
  const vessel = register(beaker('b1'));

  actions.addChemical('b1', 'water', 50);
  actions.warmTo('b1', 72);

  assert.equal(vessel.getTemperatureC(), 72);
});

test('warmTo unlocks a rule that was waiting on a temperature', () => {
  const boilsAt100 = {
    id: 'rxn_test_boils',
    reactants: ['water'],
    conditions: { requiresHeat: true, minTempC: 100, catalyst: null },
    products: ['hot_product'],
    equation: 'Water → Product',
    effects: {
      colorToHex: '#EEF3F5',
      precipitate: null,
      gas: 'steam',
      bubbles: true,
      smoke: false,
      tempDeltaC: 0,
      resultPH: 7.0,
    },
    explanation: 'Only once it actually boils.',
    levels: ['matric'],
    source: 'fixture',
  };

  const engine = createEngine({ chemicals, reactions: [boilsAt100] });
  const containers = new Map();
  const actions = createActions({ getContainer: (id) => containers.get(id), engine });
  containers.set('b1', beaker('b1'));

  actions.addChemical('b1', 'water', 50);
  actions.setHeat('b1', 3);

  // Turning the knob to maximum is not enough on its own - that was the bug.
  assert.match(actions.stir('b1').engineResult.message, /needs to reach about 100 °C/);

  // Part-way up it still refuses.
  assert.equal(actions.warmTo('b1', 80).engineResult.outcome, OUTCOME.NO_REACTION);

  // At the temperature the rule actually asks for, it runs.
  assert.equal(actions.warmTo('b1', 100).engineResult.outcome, OUTCOME.REACTION);
});

test('warmTo only writes a notebook line when something actually happened', () => {
  const { register, actions, notebookEntries } = makeWorld();
  register(beaker('b1'));

  actions.addChemical('b1', 'water', 50);
  const before = notebookEntries.length;

  // A burner ticking a couple of degrees at a time must not bury the log.
  for (let temp = 30; temp <= 90; temp += 5) actions.warmTo('b1', temp);

  assert.equal(notebookEntries.length, before, 'silent warming should add no entries');
  assert.equal(actions.warmTo('b1', 95).notebookText, null);
});

test('warmTo refuses anything that is not a temperature', () => {
  const { register, actions } = makeWorld();
  register(beaker('b1'));

  assert.throws(() => actions.warmTo('b1', 'hot'), /needs a temperature/);
});

test('a real bench: an unknown combination is reported honestly, not guessed', async () => {
  const { engine } = await import('../src/core/engine.js');
  const containers = new Map();
  const getContainer = (id) => containers.get(id);
  const actions = createActions({ getContainer, engine });

  const beakerReal = createContainer({
    id: 'beaker',
    name: 'Beaker',
    capacityMl: 250,
    getChemical: engine.getChemical,
  });
  containers.set('beaker', beakerReal);

  actions.addChemical('beaker', 'cuso4_0_5m', 20);
  const result = actions.addChemical('beaker', 'phenolphthalein_1pct', 5);

  assert.equal(result.engineResult.outcome, OUTCOME.UNKNOWN);
  assert.match(result.notebookText, /isn't available in this version/);
});

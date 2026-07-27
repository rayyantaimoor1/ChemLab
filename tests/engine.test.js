/**
 * engine.test.js — proves the engine obeys CLAUDE.md sections 6 and 7.
 *
 * WHY THESE TESTS EXIST
 * The engine is the part of the app that must never guess. These tests are the
 * safety net for that promise. If someone later "improves" the engine so that it
 * quietly invents a plausible-looking result, these tests should go red.
 *
 * Most tests run against made-up chemicals (a, b, c...) rather than real ones.
 * That is deliberate: it means adding or correcting real chemistry content can
 * never break the engine's test suite, and the tests stay readable. A smaller
 * group at the bottom runs against the real data files to catch content problems.
 *
 * Run them with:  npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEngine,
  normaliseSpecies,
  speciesKey,
  OUTCOME,
  MESSAGES,
  DEFAULT_MAX_CASCADE,
} from '../src/core/engine.js';

/* ------------------------------------------------------------------ *
 * Made-up test data
 * ------------------------------------------------------------------ */

const fixtureChemicals = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Gamma' },
  { id: 'd', name: 'Delta' },
];

const effectsOf = (overrides = {}) => ({
  colorToHex: '#EEF3F5',
  precipitate: null,
  gas: null,
  bubbles: false,
  smoke: false,
  tempDeltaC: 0,
  resultPH: 7.0,
  ...overrides,
});

const fixtureReactions = [
  // Plain reaction: a + b make c.
  {
    id: 'rxn_ab',
    reactants: ['a', 'b'],
    conditions: { requiresHeat: false, minTempC: null, catalyst: null },
    products: ['c'],
    equation: 'A + B → C',
    type: 'test',
    effects: effectsOf({ tempDeltaC: 5 }),
    hazard: null,
    explanation: 'Test reaction.',
    levels: ['matric'],
    source: 'fixture',
  },

  // Follow-on reaction, so a + b + d can cascade: c + d make e.
  {
    id: 'rxn_cd',
    reactants: ['c', 'd'],
    conditions: { requiresHeat: false, minTempC: null, catalyst: null },
    products: ['e'],
    equation: 'C + D → E',
    type: 'test',
    effects: effectsOf({ tempDeltaC: 3 }),
    hazard: null,
    explanation: 'Test cascade step.',
    levels: ['matric'],
    source: 'fixture',
  },

  // An explicit "these genuinely do nothing" rule.
  {
    id: 'rxn_none_xy',
    reactants: ['x', 'y'],
    noReaction: true,
    explanation: 'Both stay dissolved. Nothing insoluble can form.',
    levels: ['matric'],
    source: 'fixture',
  },

  // Needs the student to be actively heating.
  {
    id: 'rxn_needs_heat',
    reactants: ['h1', 'h2'],
    conditions: { requiresHeat: true, minTempC: null, catalyst: null },
    products: ['hp'],
    equation: 'H1 + H2 → HP',
    type: 'test',
    effects: effectsOf(),
    hazard: null,
    explanation: 'Only happens when heated.',
    levels: ['matric'],
    source: 'fixture',
  },

  // Needs a specific temperature.
  {
    id: 'rxn_needs_60c',
    reactants: ['t1', 't2'],
    conditions: { requiresHeat: true, minTempC: 60, catalyst: null },
    products: ['tp'],
    equation: 'T1 + T2 → TP',
    type: 'test',
    effects: effectsOf(),
    hazard: null,
    explanation: 'Only happens above 60 C.',
    levels: ['matric'],
    source: 'fixture',
  },

  // Needs a catalyst present.
  {
    id: 'rxn_needs_catalyst',
    reactants: ['k1', 'k2'],
    conditions: { requiresHeat: false, minTempC: null, catalyst: 'cat' },
    products: ['kp'],
    equation: 'K1 + K2 → KP',
    type: 'test',
    effects: effectsOf(),
    hazard: null,
    explanation: 'Needs a catalyst.',
    levels: ['matric'],
    source: 'fixture',
  },

  // A deliberately badly written pair that would loop forever without the cap.
  {
    id: 'rxn_loop_forward',
    reactants: ['p', 'q'],
    conditions: { requiresHeat: false, minTempC: null, catalyst: null },
    products: ['r', 's'],
    equation: 'P + Q → R + S',
    type: 'test',
    effects: effectsOf(),
    hazard: null,
    explanation: 'Loops.',
    levels: ['matric'],
    source: 'fixture',
  },
  {
    id: 'rxn_loop_back',
    reactants: ['r', 's'],
    conditions: { requiresHeat: false, minTempC: null, catalyst: null },
    products: ['p', 'q'],
    equation: 'R + S → P + Q',
    type: 'test',
    effects: effectsOf(),
    hazard: null,
    explanation: 'Loops back.',
    levels: ['matric'],
    source: 'fixture',
  },

  // Two rules that both match [m, n, o]; the more specific one should win.
  {
    id: 'rxn_general_mn',
    reactants: ['m', 'n'],
    conditions: { requiresHeat: false, minTempC: null, catalyst: null },
    products: ['general_product'],
    equation: 'M + N → General',
    type: 'test',
    effects: effectsOf(),
    hazard: null,
    explanation: 'General case.',
    levels: ['matric'],
    source: 'fixture',
  },
  {
    id: 'rxn_specific_mno',
    reactants: ['m', 'n', 'o'],
    conditions: { requiresHeat: false, minTempC: null, catalyst: null },
    products: ['specific_product'],
    equation: 'M + N + O → Specific',
    type: 'test',
    effects: effectsOf(),
    hazard: null,
    explanation: 'Specific case.',
    levels: ['matric'],
    source: 'fixture',
  },

  // A single-reactant rule, e.g. something decomposing when heated.
  {
    id: 'rxn_decompose',
    reactants: ['solo'],
    conditions: { requiresHeat: true, minTempC: null, catalyst: null },
    products: ['solo_a', 'solo_b'],
    equation: 'Solo → A + B',
    type: 'test',
    effects: effectsOf({ gas: 'carbon dioxide', bubbles: true }),
    hazard: null,
    explanation: 'Breaks down on heating.',
    levels: ['matric'],
    source: 'fixture',
  },
];

function makeEngine(overrides = {}) {
  return createEngine({
    chemicals: fixtureChemicals,
    reactions: fixtureReactions,
    ...overrides,
  });
}

/* ------------------------------------------------------------------ *
 * Order independence (CLAUDE.md section 7)
 * ------------------------------------------------------------------ */

test('normaliseSpecies sorts, and removes duplicates and blanks', () => {
  assert.deepEqual(normaliseSpecies(['b', 'a']), ['a', 'b']);
  assert.deepEqual(normaliseSpecies(['a', 'a', 'b']), ['a', 'b']);
  assert.deepEqual(normaliseSpecies(['b', '', null, undefined, 'a']), ['a', 'b']);
  assert.deepEqual(normaliseSpecies([]), []);
});

test('speciesKey is the same whichever order the chemicals are given in', () => {
  assert.equal(speciesKey(['b', 'a']), speciesKey(['a', 'b']));
  assert.equal(speciesKey(['c', 'a', 'b']), speciesKey(['b', 'c', 'a']));
});

test('resolve gives the identical result whichever way round the chemicals go in', () => {
  const engine = makeEngine();
  const forwards = engine.resolve(['a', 'b']);
  const backwards = engine.resolve(['b', 'a']);

  assert.equal(forwards.outcome, backwards.outcome);
  assert.equal(forwards.message, backwards.message);
  assert.equal(forwards.reaction.id, backwards.reaction.id);
  assert.deepEqual(forwards.species, backwards.species);
});

test('order independence holds for three chemicals and for repeats', () => {
  const engine = makeEngine();
  const orderings = [
    ['m', 'n', 'o'],
    ['o', 'n', 'm'],
    ['n', 'o', 'm'],
    ['m', 'm', 'n', 'o'],
  ];

  const results = orderings.map((order) => engine.react(order));
  for (const result of results) {
    assert.equal(result.outcome, results[0].outcome);
    assert.deepEqual(result.species, results[0].species);
    assert.equal(result.message, results[0].message);
  }
});

/* ------------------------------------------------------------------ *
 * The three outcomes, never blurred (CLAUDE.md section 6.2)
 * ------------------------------------------------------------------ */

test('outcome 1 of 3: a matching rule runs and reports what is observed', () => {
  const engine = makeEngine();
  const result = engine.resolve(['a', 'b']);

  assert.equal(result.outcome, OUTCOME.REACTION);
  assert.equal(result.reaction.id, 'rxn_ab');
  assert.deepEqual(result.species, ['c']);
  assert.equal(result.effects.tempDeltaC, 5);
  assert.match(result.message, /warmed by about 5/);
});

test('outcome 2 of 3: an explicit noReaction rule says so, and is not an unknown', () => {
  const engine = makeEngine();
  const result = engine.resolve(['x', 'y']);

  assert.equal(result.outcome, OUTCOME.NO_REACTION);
  assert.equal(result.message, MESSAGES.NO_REACTION);
  assert.equal(result.reaction.id, 'rxn_none_xy');
  // The contents are untouched.
  assert.deepEqual(result.species, ['x', 'y']);
  // A known "nothing happens" is data we have, so it is not a content gap.
  assert.equal(engine.getUnknownCombinations().length, 0);
});

test('outcome 3 of 3: no rule at all refuses to guess', () => {
  const engine = makeEngine();
  const result = engine.resolve(['a', 'd']);

  assert.equal(result.outcome, OUTCOME.UNKNOWN);
  assert.equal(result.message, MESSAGES.UNKNOWN);
  assert.equal(result.reaction, null);
  assert.equal(result.effects, null);
  // Nothing was invented: the contents are unchanged.
  assert.deepEqual(result.species, ['a', 'd']);
});

test('the three outcomes use three distinct values', () => {
  const values = new Set([OUTCOME.REACTION, OUTCOME.NO_REACTION, OUTCOME.UNKNOWN]);
  assert.equal(values.size, 3);
});

test('the student-facing wording matches CLAUDE.md section 6.2 exactly', () => {
  assert.equal(MESSAGES.NO_REACTION, 'No observable change.');
  assert.equal(
    MESSAGES.UNKNOWN,
    "This combination isn't available in this version of the lab yet."
  );
});

/* ------------------------------------------------------------------ *
 * Logging unknown combinations (CLAUDE.md section 6.3)
 * ------------------------------------------------------------------ */

test('unknown combinations are written down as the content roadmap', () => {
  const engine = makeEngine();
  engine.resolve(['a', 'd']);

  const unknowns = engine.getUnknownCombinations();
  assert.equal(unknowns.length, 1);
  assert.deepEqual(unknowns[0].species, ['a', 'd']);
  assert.equal(unknowns[0].count, 1);
});

test('the same unknown combination is counted, not duplicated, and ignores order', () => {
  const engine = makeEngine();
  engine.resolve(['a', 'd']);
  engine.resolve(['d', 'a']);
  engine.resolve(['a', 'd']);

  const unknowns = engine.getUnknownCombinations();
  assert.equal(unknowns.length, 1);
  assert.equal(unknowns[0].count, 3);
});

test('a caller can be told about unknowns so it can save them to a file', () => {
  const seen = [];
  const engine = makeEngine({ onUnknownCombination: (entry) => seen.push(entry.key) });

  engine.resolve(['a', 'd']);
  engine.resolve(['a', 'd']); // already known, should not fire again

  assert.deepEqual(seen, ['a+d']);
});

test('one lone substance is not recorded as a missing combination', () => {
  const engine = makeEngine();
  const result = engine.resolve(['a']);

  assert.equal(result.outcome, OUTCOME.NO_REACTION);
  assert.equal(engine.getUnknownCombinations().length, 0);
});

test('an empty vessel does nothing', () => {
  const engine = makeEngine();
  const result = engine.resolve([]);

  assert.equal(result.outcome, OUTCOME.NO_REACTION);
  assert.deepEqual(result.species, []);
});

/* ------------------------------------------------------------------ *
 * Conditions gate reactions (CLAUDE.md section 7)
 * ------------------------------------------------------------------ */

test('a rule needing heat does not fire at room temperature', () => {
  const engine = makeEngine();
  const result = engine.resolve(['h1', 'h2']);

  assert.equal(result.outcome, OUTCOME.NO_REACTION);
  assert.equal(result.blockedBy, 'needs to be heated');
  assert.match(result.message, /needs to be heated/);
});

test('the same rule fires once the container is being heated', () => {
  const engine = makeEngine();
  const result = engine.resolve(['h1', 'h2'], { heating: true });

  assert.equal(result.outcome, OUTCOME.REACTION);
  assert.equal(result.reaction.id, 'rxn_needs_heat');
  assert.deepEqual(result.species, ['hp']);
});

test('a minimum temperature is respected', () => {
  const engine = makeEngine();

  const cold = engine.resolve(['t1', 't2'], { tempC: 25 });
  assert.equal(cold.outcome, OUTCOME.NO_REACTION);
  assert.match(cold.message, /60 °C/);

  const justUnder = engine.resolve(['t1', 't2'], { tempC: 59 });
  assert.equal(justUnder.outcome, OUTCOME.NO_REACTION);

  const hot = engine.resolve(['t1', 't2'], { tempC: 60 });
  assert.equal(hot.outcome, OUTCOME.REACTION);
  assert.deepEqual(hot.species, ['tp']);
});

test('a rule needing a catalyst waits until the catalyst is there', () => {
  const engine = makeEngine();

  const without = engine.resolve(['k1', 'k2']);
  assert.equal(without.outcome, OUTCOME.NO_REACTION);
  assert.match(without.message, /catalyst/);

  const viaOption = engine.resolve(['k1', 'k2'], { catalysts: ['cat'] });
  assert.equal(viaOption.outcome, OUTCOME.REACTION);

  const viaContents = engine.resolve(['k1', 'k2', 'cat']);
  assert.equal(viaContents.outcome, OUTCOME.REACTION);
});

test('a blocked reaction is NOT recorded as a missing combination', () => {
  const engine = makeEngine();
  engine.resolve(['h1', 'h2']);
  engine.resolve(['t1', 't2']);
  engine.resolve(['k1', 'k2']);

  // We have data for all three; they are just waiting on a condition.
  assert.equal(engine.getUnknownCombinations().length, 0);
});

test('a single-reactant rule such as a decomposition still obeys its conditions', () => {
  const engine = makeEngine();

  const cold = engine.resolve(['solo']);
  assert.equal(cold.outcome, OUTCOME.NO_REACTION);

  const heated = engine.resolve(['solo'], { heating: true });
  assert.equal(heated.outcome, OUTCOME.REACTION);
  assert.deepEqual(heated.species, ['solo_a', 'solo_b']);
  assert.match(heated.message, /Bubbles of carbon dioxide/);
});

/* ------------------------------------------------------------------ *
 * Cascading reactions and the loop cap (CLAUDE.md section 7)
 * ------------------------------------------------------------------ */

test('after a reaction runs, the new contents are checked again', () => {
  const engine = makeEngine();
  const result = engine.react(['a', 'b', 'd']);

  assert.equal(result.outcome, OUTCOME.REACTION);
  assert.equal(result.steps.length, 2);
  assert.deepEqual(
    result.steps.map((step) => step.reaction.id),
    ['rxn_ab', 'rxn_cd']
  );
  assert.deepEqual(result.species, ['e']);
  assert.equal(result.capReached, false);
});

test('curated temperature changes add up across a cascade', () => {
  const engine = makeEngine();
  const result = engine.react(['a', 'b', 'd'], { tempC: 25 });

  // 25 to start, +5 from the first step, +3 from the second.
  assert.equal(result.tempC, 33);
});

test('a cascade can unlock a reaction that needed heat', () => {
  const warmingReactions = [
    {
      id: 'rxn_warm_up',
      reactants: ['w1', 'w2'],
      conditions: { requiresHeat: false, minTempC: null, catalyst: null },
      products: ['w3'],
      equation: 'W1 + W2 → W3',
      effects: effectsOf({ tempDeltaC: 40 }),
      explanation: 'Releases a lot of heat.',
      levels: ['matric'],
      source: 'fixture',
    },
    {
      id: 'rxn_then_hot',
      reactants: ['w3', 'w4'],
      conditions: { requiresHeat: true, minTempC: 60, catalyst: null },
      products: ['w5'],
      equation: 'W3 + W4 → W5',
      effects: effectsOf(),
      explanation: 'Needs 60 C.',
      levels: ['matric'],
      source: 'fixture',
    },
  ];

  const engine = createEngine({ chemicals: [], reactions: warmingReactions });

  // On its own, the second reaction is too cold to run.
  assert.equal(engine.resolve(['w3', 'w4'], { tempC: 25 }).outcome, OUTCOME.NO_REACTION);

  // But the first reaction heats the mixture from 25 to 65, which unlocks it.
  const result = engine.react(['w1', 'w2', 'w4'], { tempC: 25 });
  assert.equal(result.steps.length, 2);
  assert.deepEqual(result.species, ['w5']);
  assert.equal(result.tempC, 65);
});

test('two rules that feed each other cannot hang the app', () => {
  const engine = makeEngine();
  const result = engine.react(['p', 'q']);

  assert.equal(result.capReached, true);
  assert.equal(result.steps.length, DEFAULT_MAX_CASCADE);
});

test('the loop cap can be tightened, and stops at exactly that many steps', () => {
  const engine = makeEngine();
  const result = engine.react(['p', 'q'], { maxCascade: 3 });

  assert.equal(result.capReached, true);
  assert.equal(result.steps.length, 3);
});

test('a normal cascade that finishes on its own does not report hitting the cap', () => {
  const engine = makeEngine();
  const result = engine.react(['a', 'b']);

  assert.equal(result.capReached, false);
  assert.equal(result.steps.length, 1);
});

test('the more specific rule wins when two rules both match', () => {
  const engine = makeEngine();
  const result = engine.resolve(['m', 'n', 'o']);

  assert.equal(result.reaction.id, 'rxn_specific_mno');
  assert.deepEqual(result.species, ['specific_product']);
});

test('react passes through the three outcomes unchanged when nothing cascades', () => {
  const engine = makeEngine();

  assert.equal(engine.react(['x', 'y']).outcome, OUTCOME.NO_REACTION);
  assert.equal(engine.react(['a', 'd']).outcome, OUTCOME.UNKNOWN);
  assert.equal(engine.react(['a', 'b']).outcome, OUTCOME.REACTION);
});

test('a cascade running out of steam is not logged as a missing combination', () => {
  const engine = makeEngine();
  engine.react(['a', 'b']); // makes 'c', which then reacts with nothing

  assert.equal(engine.getUnknownCombinations().length, 0);
});

/* ------------------------------------------------------------------ *
 * The engine must not invent or mutate anything (CLAUDE.md section 6.1)
 * ------------------------------------------------------------------ */

test('effects are handed back exactly as written in the data file', () => {
  const engine = makeEngine();
  const result = engine.resolve(['a', 'b']);
  const source = fixtureReactions.find((reaction) => reaction.id === 'rxn_ab');

  assert.deepEqual(result.effects, source.effects);
});

test('the engine does not quietly edit the loaded data', () => {
  const engine = makeEngine();
  const reaction = engine.getReaction('rxn_ab');

  assert.throws(() => {
    'use strict';
    reaction.equation = 'tampered';
  });
  assert.equal(engine.getReaction('rxn_ab').equation, 'A + B → C');
});

test('looking up something that does not exist returns null instead of throwing', () => {
  const engine = makeEngine();

  assert.equal(engine.getChemical('not_a_real_chemical'), null);
  assert.equal(engine.getReaction('not_a_real_reaction'), null);
});

/* ------------------------------------------------------------------ *
 * Checks against the real data files
 * ------------------------------------------------------------------ */

test('the real data files load and are not empty', async () => {
  const { engine } = await import('../src/core/engine.js');

  assert.ok(engine.getAllChemicals().length >= 10);
  assert.ok(engine.getAllReactions().length >= 5);
});

test('every real reaction carries a source, as section 6.4 requires', async () => {
  const { engine } = await import('../src/core/engine.js');

  for (const reaction of engine.getAllReactions()) {
    assert.ok(
      typeof reaction.source === 'string' && reaction.source.trim().length > 0,
      `reaction ${reaction.id} is missing a source`
    );
  }
});

test('every real chemical carries a source too', async () => {
  const { engine } = await import('../src/core/engine.js');

  for (const chemical of engine.getAllChemicals()) {
    assert.ok(
      typeof chemical.source === 'string' && chemical.source.trim().length > 0,
      `chemical ${chemical.id} is missing a source`
    );
  }
});

test('no two real reactions claim the same set of reactants', async () => {
  const { engine } = await import('../src/core/engine.js');

  const keys = engine.getAllReactions().map((reaction) => speciesKey(reaction.reactants));
  assert.equal(new Set(keys).size, keys.length, 'two reactions would match the same mixture');
});

test('every substance a reaction names actually exists in chemicals.json', async () => {
  const { engine } = await import('../src/core/engine.js');
  const known = new Set(engine.getAllChemicals().map((chemical) => chemical.id));

  for (const reaction of engine.getAllReactions()) {
    for (const id of reaction.reactants || []) {
      assert.ok(known.has(id), `reaction ${reaction.id} needs unknown reactant '${id}'`);
    }
    // Products used to dangle: reactions named things like 'pbi2_s' that
    // nothing could look up, so a vessel could not tell a precipitate from a
    // liquid and no tool could read it. This is the guard against that
    // coming back.
    for (const id of reaction.products || []) {
      assert.ok(known.has(id), `reaction ${reaction.id} produces unknown substance '${id}'`);
    }
  }
});

test('every real chemical says whether it belongs on the shelf', async () => {
  const { engine } = await import('../src/core/engine.js');

  for (const chemical of engine.getAllChemicals()) {
    assert.equal(
      typeof chemical.onShelf,
      'boolean',
      `chemical ${chemical.id} is missing an onShelf flag`
    );
  }
});

test('the shelf offers reagents only, never something you can only make', async () => {
  const { engine } = await import('../src/core/engine.js');
  const shelf = engine.getShelfChemicals();
  const shelfIds = new Set(shelf.map((chemical) => chemical.id));

  assert.ok(shelf.length > 0);
  assert.ok(shelf.length < engine.getAllChemicals().length, 'products should be held back');

  // A precipitate and a gas are things a student makes, not things they pick
  // off a bottle rack.
  assert.equal(shelfIds.has('pbi2_s'), false);
  assert.equal(shelfIds.has('h2_g'), false);
  assert.equal(shelfIds.has('hcl_1m'), true);
});

test('acid and alkali neutralise, whichever way round they are added', async () => {
  const { engine } = await import('../src/core/engine.js');

  const forwards = engine.react(['hcl_1m', 'naoh_1m']);
  const backwards = engine.react(['naoh_1m', 'hcl_1m']);

  assert.equal(forwards.outcome, OUTCOME.REACTION);
  assert.equal(forwards.steps[0].reaction.id, 'rxn_neutralisation_hcl_naoh');
  assert.equal(forwards.message, backwards.message);
  assert.deepEqual(forwards.species, backwards.species);
});

test('lead nitrate and potassium iodide give the yellow precipitate', async () => {
  const { engine } = await import('../src/core/engine.js');
  const result = engine.react(['pbno3_0_1m', 'ki_0_1m']);

  assert.equal(result.outcome, OUTCOME.REACTION);
  assert.match(result.message, /precipitate formed/i);
  assert.equal(result.steps[0].effects.precipitate, 'bright yellow lead(II) iodide');
});

test('zinc and acid give bubbles of hydrogen', async () => {
  const { engine } = await import('../src/core/engine.js');
  const result = engine.react(['zn_metal', 'hcl_1m']);

  assert.equal(result.outcome, OUTCOME.REACTION);
  assert.equal(result.steps[0].effects.gas, 'hydrogen');
  assert.equal(result.steps[0].effects.bubbles, true);
  assert.match(result.message, /Bubbles of hydrogen/);
});

test('salt and potassium iodide are a real, taught "nothing happens"', async () => {
  const { engine } = await import('../src/core/engine.js');
  const result = engine.react(['nacl_1m', 'ki_0_1m']);

  assert.equal(result.outcome, OUTCOME.NO_REACTION);
  assert.equal(result.finalStep.reaction.id, 'rxn_none_nacl_ki');
});

test('a real combination we have no data for is refused, not guessed', async () => {
  const { createEngine: create } = await import('../src/core/engine.js');
  const engine = create();

  // Nothing in reactions.json covers copper sulfate with phenolphthalein.
  const result = engine.react(['cuso4_0_5m', 'phenolphthalein_1pct']);

  assert.equal(result.outcome, OUTCOME.UNKNOWN);
  assert.equal(result.message, MESSAGES.UNKNOWN);
  assert.equal(engine.getUnknownCombinations().length, 1);
});

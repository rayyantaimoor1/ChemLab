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
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createEngine,
  normaliseSpecies,
  speciesKey,
  OUTCOME,
  MESSAGES,
  DEFAULT_MAX_CASCADE,
} from '../src/core/engine.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');

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

test('every hazard carries both the danger and the correct response', async () => {
  const { engine } = await import('../src/core/engine.js');

  for (const reaction of engine.getAllReactions()) {
    const hazard = reaction.hazard;
    if (!hazard) continue;

    // The alert overlay renders each of these. A hazard missing one would
    // still open an alert, just a quieter or emptier one, which is the kind
    // of failure nobody notices until a student is looking at it.
    for (const field of ['severity', 'type', 'title', 'warning']) {
      assert.ok(
        typeof hazard[field] === 'string' && hazard[field].trim().length > 0,
        `hazard on ${reaction.id} is missing ${field}`
      );
    }

    // CLAUDE.md section 5: hazard entries "present the danger and the
    // correct response". Without whatToDoInstead the panel only frightens -
    // it never tells the student what they should have done instead.
    assert.ok(
      typeof hazard.whatToDoInstead === 'string' && hazard.whatToDoInstead.trim().length > 0,
      `hazard on ${reaction.id} says what is dangerous but not what to do instead`
    );

    assert.ok(
      ['low', 'moderate', 'high'].includes(hazard.severity),
      `hazard on ${reaction.id} has an unrecognised severity '${hazard.severity}'`
    );
  }
});

test('every molecularAnimation a reaction names actually exists', async () => {
  const { engine } = await import('../src/core/engine.js');
  const { default: animations } = await import('../src/data/animations.json', {
    with: { type: 'json' },
  });

  for (const reaction of engine.getAllReactions()) {
    if (!reaction.molecularAnimation) continue;
    assert.ok(
      animations[reaction.molecularAnimation],
      `reaction ${reaction.id} names animation '${reaction.molecularAnimation}', which does not exist`
    );
  }
});

test('every animation script is internally consistent', async () => {
  const { default: animations } = await import('../src/data/animations.json', {
    with: { type: 'json' },
  });

  for (const [id, animation] of Object.entries(animations)) {
    assert.ok(Array.isArray(animation.steps) && animation.steps.length > 0, `${id} has no steps`);
    assert.equal(animation.viewBox?.length, 4, `${id} needs a four-number viewBox`);

    const known = new Set(animation.particles.map((particle) => particle.id));

    for (const [index, step] of animation.steps.entries()) {
      const where = `${id} step ${index + 1}`;

      // Every step carries the sentence the panel shows. Without it a
      // student on reduced motion, who gets the captions INSTEAD of the
      // animation, would be handed a blank line.
      assert.ok(
        typeof step.caption === 'string' && step.caption.trim().length > 0,
        `${where} has no caption`
      );

      // Every particle needs a position in every step - the player tweens
      // between consecutive steps, so a gap would make something jump to
      // the top-left corner rather than move.
      for (const particleId of known) {
        assert.ok(step.positions?.[particleId], `${where} has no position for '${particleId}'`);
      }

      for (const particleId of Object.keys(step.positions || {})) {
        assert.ok(known.has(particleId), `${where} positions unknown particle '${particleId}'`);
      }
      for (const particleId of step.hidden || []) {
        assert.ok(known.has(particleId), `${where} hides unknown particle '${particleId}'`);
      }
      for (const particleId of Object.keys(step.charges || {})) {
        assert.ok(known.has(particleId), `${where} charges unknown particle '${particleId}'`);
      }
      for (const bond of step.bonds || []) {
        assert.ok(known.has(bond.from), `${where} bonds from unknown particle '${bond.from}'`);
        assert.ok(known.has(bond.to), `${where} bonds to unknown particle '${bond.to}'`);
      }
    }
  }
});

test('every 3D molecule entry is internally consistent', async () => {
  const { default: molecules3d } = await import('../src/data/molecules3d.json', {
    with: { type: 'json' },
  });

  for (const [id, molecule] of Object.entries(molecules3d)) {
    assert.ok(
      Array.isArray(molecule.atoms) && molecule.atoms.length > 0,
      `${id} has no atoms`
    );

    const known = new Set(molecule.atoms.map((atom) => atom.id));
    assert.equal(known.size, molecule.atoms.length, `${id} has a duplicate atom id`);

    for (const atom of molecule.atoms) {
      assert.ok(typeof atom.element === 'string' && atom.element.length > 0, `${id} atom '${atom.id}' has no element`);
      for (const axis of ['x', 'y', 'z']) {
        assert.equal(typeof atom[axis], 'number', `${id} atom '${atom.id}' is missing coordinate '${axis}'`);
      }
    }

    for (const bond of molecule.bonds || []) {
      assert.ok(known.has(bond.from), `${id} bonds from unknown atom '${bond.from}'`);
      assert.ok(known.has(bond.to), `${id} bonds to unknown atom '${bond.to}'`);
    }
  }
});

test('every real chemical has a 3D structure entry that resolves', async () => {
  const { engine } = await import('../src/core/engine.js');
  const { default: molecules3d } = await import('../src/data/molecules3d.json', {
    with: { type: 'json' },
  });

  for (const chemical of engine.getAllChemicals()) {
    assert.ok(molecules3d[chemical.id], `chemical ${chemical.id} has no 3D structure entry`);
  }
});

test('every real chemical points its structure field at an image that actually exists', async () => {
  const { engine } = await import('../src/core/engine.js');

  for (const chemical of engine.getAllChemicals()) {
    assert.ok(
      typeof chemical.structure === 'string' && chemical.structure.length > 0,
      `chemical ${chemical.id} has no structure field`
    );

    // The properties card serves this straight to an <img>, so a typo here
    // is a broken image in the app, not a loud test failure - this is that
    // loud failure instead.
    const resolved = path.join(DATA_DIR, chemical.structure);
    assert.ok(
      existsSync(resolved),
      `chemical ${chemical.id}'s structure file is missing: ${chemical.structure}`
    );
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

/* ------------------------------------------------------------------ *
 * What is left in the vessel after a reaction has finished.
 *
 * Stirring after a reaction used to re-check the products, find no rule
 * for them, and announce "This combination isn't available in this
 * version of the lab yet" - telling the student our data was missing
 * something it had in fact already fully described.
 * ------------------------------------------------------------------ */

test('stirring after a reaction says nothing happens, not that data is missing', async () => {
  const { createEngine: create } = await import('../src/core/engine.js');
  const engine = create();

  // Exactly what Zn + HCl leaves behind.
  const result = engine.react(['zncl2_aq', 'h2_g']);

  assert.equal(result.outcome, OUTCOME.NO_REACTION);
  assert.equal(result.message, MESSAGES.NO_REACTION);
});

test('the aftermath of a reaction is not written into the content roadmap', async () => {
  const { createEngine: create } = await import('../src/core/engine.js');
  const engine = create();

  engine.react(['zncl2_aq', 'h2_g']);

  // Section 6.3's log is for combinations students TRIED that we cannot
  // handle. The app put these two here itself, so it is not a gap.
  assert.deepEqual(engine.getUnknownCombinations(), []);
});

test('every real reaction leaves behind something the engine can account for', async () => {
  const { createEngine: create } = await import('../src/core/engine.js');
  const engine = create();

  // The regression guard for the whole class of bug: pick up every rule's
  // own product list and check that stirring the vessel afterwards never
  // reports an honest-gap message. The catalyst is included where there is
  // one, because it is still in the vessel when the reaction finishes.
  for (const reaction of engine.getAllReactions()) {
    if (reaction.noReaction || !Array.isArray(reaction.products) || reaction.products.length === 0) {
      continue;
    }

    const catalyst = reaction.conditions?.catalyst;
    const leftovers = catalyst ? [...reaction.products, catalyst] : reaction.products;
    if (leftovers.length < 2) continue;

    const after = create().resolve(leftovers);
    assert.notEqual(
      after.outcome,
      OUTCOME.UNKNOWN,
      `stirring after ${reaction.id} claims its own leftovers are an unsupported combination`
    );
  }
});

/* ------------------------------------------------------------------ *
 * Electrolysis - the requiresElectricity condition.
 * ------------------------------------------------------------------ */

test('a rule needing a current does not fire with the power off', async () => {
  const { createEngine: create } = await import('../src/core/engine.js');
  const engine = create();

  const off = engine.resolve(['water_distilled']);
  assert.equal(off.outcome, OUTCOME.NO_REACTION);
  assert.match(off.message, /needs an electric current/);
});

test('the same rule fires once the current is switched on', async () => {
  const { createEngine: create } = await import('../src/core/engine.js');
  const engine = create();

  const on = engine.resolve(['water_distilled'], { electrified: true });
  assert.equal(on.outcome, OUTCOME.REACTION);
  assert.equal(on.reaction.id, 'rxn_electrolysis_water');
});

test('molten salt needs the heat first and the current second', async () => {
  const { createEngine: create } = await import('../src/core/engine.js');
  const engine = create();

  // Cold, no power: the temperature is the thing to fix first.
  assert.match(engine.resolve(['nacl_s']).message, /801 °C/);

  // Cold WITH power: still the temperature, because solid salt cannot
  // conduct at all - its ions are locked in the lattice.
  assert.match(engine.resolve(['nacl_s'], { electrified: true }).message, /801 °C/);

  // Molten but no power: now the current is what is missing.
  const molten = engine.resolve(['nacl_s'], { tempC: 850, heating: true });
  assert.match(molten.message, /needs an electric current/);

  // Both: it runs.
  const both = engine.resolve(['nacl_s'], { tempC: 850, heating: true, electrified: true });
  assert.equal(both.outcome, OUTCOME.REACTION);
  assert.equal(both.reaction.id, 'rxn_electrolysis_molten_nacl');
});

test('a blocked rule is only blamed when it explains the whole vessel', async () => {
  const { createEngine: create } = await import('../src/core/engine.js');
  const engine = create();

  // Copper sulfate alone has an electrolysis rule, so with the power off
  // the honest answer is "switch the current on".
  assert.match(engine.resolve(['cuso4_0_5m']).message, /needs an electric current/);

  // Add something that rule says nothing about and the honest answer
  // changes: we do not know what phenolphthalein does with copper sulfate,
  // and blaming the missing current would imply that we do.
  const withExtra = engine.resolve(['cuso4_0_5m', 'phenolphthalein_1pct']);
  assert.equal(withExtra.outcome, OUTCOME.UNKNOWN);
});

test('every electrolysis rule names what happens at each electrode', async () => {
  const { engine } = await import('../src/core/engine.js');

  for (const reaction of engine.getAllReactions()) {
    if (reaction.conditions?.requiresElectricity !== true) continue;

    const electrodes = reaction.electrodes;
    assert.ok(electrodes, `${reaction.id} is an electrolysis but names no electrodes`);

    for (const side of ['cathode', 'anode']) {
      const entry = electrodes[side];
      assert.ok(entry, `${reaction.id} has no ${side}`);
      for (const field of ['sign', 'attracts', 'halfEquation', 'product', 'observation']) {
        assert.ok(
          typeof entry[field] === 'string' && entry[field].trim().length > 0,
          `${reaction.id}'s ${side} is missing ${field}`
        );
      }
      // The product named at an electrode must be one the rule actually makes.
      assert.ok(
        reaction.products.includes(entry.product),
        `${reaction.id}'s ${side} claims to produce '${entry.product}', which the rule does not make`
      );
    }

    assert.equal(electrodes.cathode.sign, 'negative');
    assert.equal(electrodes.anode.sign, 'positive');
  }
});

test('every electrolysis rule has an animation showing the ions moving', async () => {
  const { engine } = await import('../src/core/engine.js');
  const { default: animations } = await import('../src/data/animations.json', {
    with: { type: 'json' },
  });

  for (const reaction of engine.getAllReactions()) {
    if (reaction.conditions?.requiresElectricity !== true) continue;

    const animation = animations[reaction.molecularAnimation];
    assert.ok(animation, `${reaction.id} has no molecular animation`);

    // Both electrodes have to be on the stage, or the ions have nothing to
    // be seen moving towards.
    const ids = new Set(animation.particles.map((particle) => particle.id));
    assert.ok(ids.has('cathode'), `${reaction.molecularAnimation} draws no cathode`);
    assert.ok(ids.has('anode'), `${reaction.molecularAnimation} draws no anode`);
  }
});

/* ------------------------------------------------------------------ *
 * Catalysts. The condition has existed since Phase 1 but no real
 * content used it until the FSc industrial processes.
 * ------------------------------------------------------------------ */

test('a missing catalyst is named, so the student knows what to reach for', async () => {
  const { engine } = await import('../src/core/engine.js');

  // Hydrogen peroxide sits there for months without one.
  const without = engine.resolve(['h2o2_aq']);
  assert.equal(without.outcome, OUTCOME.NO_REACTION);
  assert.match(without.message, /as a catalyst/);
  assert.match(without.message, /Manganese\(IV\) oxide/, 'the catalyst should be named, not just implied');
  // The reason has to read as a sentence, not as a label stuck on the end.
  assert.match(
    without.message,
    /This mixture needs Manganese\(IV\) oxide present as a catalyst before anything happens\./
  );

  // Add it and the reaction runs.
  const withIt = engine.resolve(['h2o2_aq', 'mno2_s']);
  assert.equal(withIt.outcome, OUTCOME.REACTION);
  assert.equal(withIt.reaction.id, 'rxn_catalysis_h2o2_mno2');
});

test('a catalyst is not used up by the reaction it speeds up', async () => {
  const { engine } = await import('../src/core/engine.js');

  const result = engine.react(['h2o2_aq', 'mno2_s']);
  assert.equal(result.outcome, OUTCOME.REACTION);
  assert.ok(
    result.species.includes('mno2_s'),
    'the catalyst must still be there afterwards - that is what makes it a catalyst'
  );
});

test('a catalyst already in the vessel is not mistaken for an unexplained extra', async () => {
  const { engine } = await import('../src/core/engine.js');

  // Potassium chlorate needs BOTH its catalyst and 200 degC. With the
  // catalyst added but the tube still cold, the honest answer is the
  // temperature - not "this combination is not available", which is what
  // came back before the catalyst was counted as accounted for.
  const cold = engine.resolve(['kclo3_s', 'mno2_s']);
  assert.equal(cold.outcome, OUTCOME.NO_REACTION);
  assert.match(cold.message, /200 °C/);

  const hot = engine.resolve(['kclo3_s', 'mno2_s'], { tempC: 220, heating: true });
  assert.equal(hot.outcome, OUTCOME.REACTION);
});

test('a settled outcome still gives way to a real follow-on reaction', async () => {
  const { createEngine: create } = await import('../src/core/engine.js');

  // A made-up pair where B + C is BOTH the product of rule one and the
  // reactant set of rule two. The real rule must win over "settled".
  const engine = create({
    chemicals: [
      { id: 'a', name: 'A' }, { id: 'b', name: 'B' },
      { id: 'c', name: 'C' }, { id: 'd', name: 'D' },
    ],
    reactions: [
      { id: 'r1', reactants: ['a'], products: ['b', 'c'], equation: 'A -> B + C', effects: {} },
      { id: 'r2', reactants: ['b', 'c'], products: ['d'], equation: 'B + C -> D', effects: {} },
    ],
  });

  const result = engine.resolve(['b', 'c']);
  assert.equal(result.outcome, OUTCOME.REACTION);
  assert.equal(result.reaction.id, 'r2');
});

test('a single-product outcome is not treated as a settled pair', async () => {
  const { createEngine: create } = await import('../src/core/engine.js');
  const engine = create({
    chemicals: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'x', name: 'X' }],
    reactions: [{ id: 'r1', reactants: ['a', 'b'], products: ['x'], equation: 'A + B -> X', effects: {} }],
  });

  // X alone is one substance, already covered by the lone-substance rule.
  // Pairing it with something unrelated is still a genuine gap.
  const result = engine.resolve(['x', 'a']);
  assert.equal(result.outcome, OUTCOME.UNKNOWN);
});

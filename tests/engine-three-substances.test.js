/**
 * engine-three-substances.test.js — a "nothing happens" rule must not hide
 * a real reaction (Phase 10.3 review, docs/PROJECT_REVIEW.md 1.1).
 *
 * WHY THIS EXISTS
 * Most tests check one rule at a time: two reagents, one result. The bug
 * this guards against only shows with three. Sodium chloride and potassium
 * iodide have a rule saying they do nothing together. Add lead(II) nitrate
 * to the same beaker and the engine used to pick that "nothing happens" rule
 * - its id sorts first alphabetically - and wrote "No observable change"
 * while yellow lead(II) iodide should have been precipitating. 206 mixtures
 * were wrong that way.
 *
 * The rule now: a "nothing happens" rule only decides the result when it
 * accounts for everything in the vessel.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, engine, OUTCOME } from '../src/core/engine.js';
import reactions from '../src/data/reactions.json' with { type: 'json' };

const plain = (rule) => {
  const c = rule.conditions || {};
  return !c.requiresHeat && !c.requiresElectricity && c.minTempC == null && c.maxTempC == null && !c.catalyst;
};

test('lead(II) nitrate added to salt and potassium iodide still precipitates lead(II) iodide', () => {
  const result = engine.react(['nacl_1m', 'ki_0_1m', 'pbno3_0_1m']);
  assert.equal(result.outcome, OUTCOME.REACTION);
  assert.match(result.message, /A precipitate formed: bright yellow lead\(II\) iodide/);
});

test('a "nothing happens" rule that covers the whole vessel still says so', () => {
  const result = engine.resolve(['nacl_1m', 'ki_0_1m']);
  assert.equal(result.outcome, OUTCOME.NO_REACTION);
  assert.equal(result.reaction?.id, 'rxn_none_nacl_ki');
});

test('no "nothing happens" pair hides a real reaction in any three-substance vessel', () => {
  // Every pair of plain rules - one "nothing happens", one real - that share
  // exactly one reagent, unless a rule written for all three decides it.
  const two = reactions.filter((rule) => rule.reactants.length === 2 && plain(rule));
  const nothing = two.filter((rule) => rule.noReaction);
  const real = two.filter((rule) => !rule.noReaction);
  const hidden = [];
  let checked = 0;
  for (const n of nothing) {
    for (const r of real) {
      const mixture = [...new Set([...n.reactants, ...r.reactants])];
      if (mixture.length !== 3) continue;
      if (reactions.some((rule) => rule.reactants.length >= 3 && mixture.every((id) => rule.reactants.includes(id)))) continue;
      checked += 1;
      if (engine.react(mixture).outcome !== OUTCOME.REACTION) hidden.push(`${mixture.join(' + ')} (${r.id})`);
    }
  }
  assert.ok(checked > 100, `the sweep should cover the real data, covered ${checked}`);
  assert.deepEqual(hidden, [], `real reactions hidden by a "nothing happens" rule:\n${hidden.join('\n')}`);
});

// A small made-up set, so these hold whatever the real data becomes.
const chemicals = ['a', 'b', 'c', 'x'].map((id) => ({ id, name: id.toUpperCase(), state: 'aqueous' }));
const nothingAB = { id: 'rxn_aaa_none', reactants: ['a', 'b'], noReaction: true, explanation: 'A and B do nothing.' };
const realBC = {
  id: 'rxn_zzz_real', reactants: ['b', 'c'], products: ['x'], equation: 'B + C → X',
  conditions: { requiresHeat: false, minTempC: null, catalyst: null },
  effects: { precipitate: null, gas: null, bubbles: false, smoke: false, tempDeltaC: 0 },
};

test('the real reaction runs even when the "nothing happens" rule sorts first', () => {
  const lab = createEngine({ chemicals, reactions: [nothingAB, realBC] });
  const result = lab.react(['a', 'b', 'c']);
  assert.equal(result.outcome, OUTCOME.REACTION);
  assert.equal(result.steps[0].reaction.id, 'rxn_zzz_real');
});

test('a "nothing happens" pair with an unexplained third substance is an honest gap, and is logged', () => {
  const logged = [];
  const lab = createEngine({ chemicals, reactions: [nothingAB], onUnknownCombination: (entry) => logged.push(entry.key) });
  const result = lab.react(['a', 'b', 'x']);
  assert.equal(result.outcome, OUTCOME.UNKNOWN);
  assert.equal(logged.length, 1);
});

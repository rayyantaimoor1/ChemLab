/**
 * amounts.test.js — the arithmetic of stage 2.2 (src/core/amounts.js),
 * with made-up chemicals so the sums can be checked by hand.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { molesFor, reactionAmounts, scaledTempDelta, strongExcessPH } from '../src/core/amounts.js';

const close = (actual, expected, places = 9) =>
  assert.ok(Math.abs(actual - expected) < 10 ** -places, `${actual} is not ${expected}`);

const chemicals = {
  acid: { id: 'acid', state: 'aqueous', concentrationM: 1, acidBase: { kind: 'strong_acid', perFormula: 1 } },
  acid2: { id: 'acid2', state: 'aqueous', concentrationM: 0.5, acidBase: { kind: 'strong_acid', perFormula: 1 } },
  alkali: { id: 'alkali', state: 'aqueous', concentrationM: 1, acidBase: { kind: 'strong_base', perFormula: 1 } },
  dilute: { id: 'dilute', state: 'aqueous', concentration: 'dilute' },
  marble: { id: 'marble', state: 'solid', molarMass: 100.09 },
  ethanol: { id: 'ethanol', state: 'liquid', density: 0.789, molarMass: 46.07 },
  gas: { id: 'gas', state: 'gas', molarMass: 44.01 },
  salt: { id: 'salt', state: 'aqueous', pH: 7 },
};
const getChemical = (id) => chemicals[id] || null;

test('moles come from curated fields, or are "not known"', () => {
  close(molesFor(chemicals.acid, 25, 'mL'), 0.025);
  close(molesFor(chemicals.marble, 1, 'g'), 1 / 100.09);
  close(molesFor(chemicals.ethanol, 10, 'mL'), (10 * 0.789) / 46.07);
  assert.equal(molesFor(chemicals.dilute, 10, 'mL'), null, 'no concentrationM: not known');
  assert.equal(molesFor(chemicals.gas, 1, 'g'), null, 'a gas from the shelf is plenty');
});

const carbonate = {
  reactants: ['marble', 'acid'],
  products: ['chloride', 'co2'],
  coefficients: { marble: 1, acid: 2, chloride: 1, co2: 1 },
};

test('the limiting reagent decides how far a reaction goes', () => {
  const moles = { marble: 0.00999, acid: 0.010 };
  const a = reactionAmounts(carbonate, (id) => moles[id] ?? null);
  close(a.extent, 0.005);
  assert.deepEqual(a.limiting, ['acid']);
  close(a.consumed.marble, 0.005);
  close(a.consumed.acid, 0.010);
  close(a.made.co2, 0.005);
});

test('a reactant whose amount is not known is plenty: never limiting, never used up', () => {
  const a = reactionAmounts(carbonate, (id) => (id === 'marble' ? 0.002 : null));
  close(a.extent, 0.002);
  assert.deepEqual(a.limiting, ['marble']);
  assert.equal('acid' in a.consumed, false);
});

test('the old way when nothing can be counted', () => {
  assert.equal(reactionAmounts(carbonate, () => null), null, 'nothing of known amount');
  assert.equal(reactionAmounts({ ...carbonate, coefficients: undefined }, () => 0.01), null, 'no coefficients');
  assert.equal(reactionAmounts({ ...carbonate, coefficients: { marble: 1 } }, () => 0.01), null, 'a reactant has none');
});

test('two reactants running out together are both limiting: an end point', () => {
  const rule = { reactants: ['acid', 'alkali'], products: ['salt'], coefficients: { acid: 1, alkali: 1, salt: 1 } };
  const a = reactionAmounts(rule, () => 0.025);
  assert.deepEqual(a.limiting, ['acid', 'alkali']);
});

test('the temperature change scales from the two-solution basis', () => {
  const rule = {
    reactants: ['acid', 'alkali'], products: ['salt'],
    coefficients: { acid: 1, alkali: 1, salt: 1 }, effects: { tempDeltaC: 7 },
  };
  // Equal volumes as labelled is the basis itself: the curated 7 °C.
  close(scaledTempDelta(rule, 0.025, 50, getChemical), 7, 6);
  // One drop's worth in 25 mL warms it by almost nothing.
  close(scaledTempDelta(rule, 0.00005, 25.05, getChemical), 0.03, 2);
  // A basis section 5 leaves open keeps the curated number.
  const solidRule = { ...carbonate, effects: { tempDeltaC: 1 } };
  assert.equal(scaledTempDelta(solidRule, 0.005, 10, getChemical), 1);
});

test('the pH of a strong excess, from its moles', () => {
  // 10 mmol of hydroxide in 40 mL: 0.25 M, pH 13.4.
  assert.equal(strongExcessPH([{ id: 'alkali', mol: 0.010 }, { id: 'salt', mol: 0.015 }], 40, getChemical), 13.4);
  // Two strong acids add up: 5 + 5 mmol in 100 mL is 0.1 M, pH 1.0.
  assert.equal(strongExcessPH([{ id: 'acid', mol: 0.005 }, { id: 'acid2', mol: 0.005 }], 100, getChemical), 1);
  // Water's own ions count: 0.001 mmol in 10 L is 1e-7 M, which reads 6.8
  // (water and acid together), not the 7.0 the acid alone would suggest.
  assert.equal(strongExcessPH([{ id: 'acid', mol: 1e-6 }], 10000, getChemical), 6.8);
  // Below 0.001 mmol it counts as gone, and the curated pH stands.
  assert.equal(strongExcessPH([{ id: 'acid', mol: 1e-9 }], 50, getChemical), null);
});

test('no pH is worked out when it would be a guess', () => {
  assert.equal(strongExcessPH([{ id: 'salt', mol: 0.01 }], 40, getChemical), null, 'nothing strong');
  assert.equal(strongExcessPH([{ id: 'acid', mol: null }], 40, getChemical), null, 'amount not known');
  assert.equal(strongExcessPH([{ id: 'acid', mol: 0.01 }, { id: 'alkali', mol: 0.01 }], 40, getChemical), null, 'acid beside base');
  assert.equal(strongExcessPH([{ id: 'acid', mol: 0.01 }], 0, getChemical), null, 'no liquid');
});

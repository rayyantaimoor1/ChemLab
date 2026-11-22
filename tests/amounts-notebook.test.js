/**
 * amounts-notebook.test.js — stage 2.2.4: the notebook says which reagent
 * ran out and what was left over, and the close look lists each
 * substance's amount and millimoles.
 *
 * Uses the shipped data: the rules here got their coefficients in stage
 * 2.2.3, so this is what a student actually reads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engine } from '../src/core/engine.js';
import { createContainer } from '../src/core/container.js';
import { createActions } from '../src/core/actions.js';
import { roundForReading, amountsSummary, describeAmounts } from '../src/core/amounts-notebook.js';
import { amountRows, limitingText } from '../src/ui/amounts-look.js';

function bench() {
  const beaker = createContainer({ id: 'b', name: 'Beaker', capacityMl: 250, getChemical: engine.getChemical });
  const actions = createActions({ getContainer: () => beaker, engine });
  return { beaker, add: (id, amount) => actions.addChemical('b', id, amount) };
}

test('numbers are read to three significant figures, with no trailing zeros', () => {
  assert.equal(roundForReading(8.5), '8.5');
  assert.equal(roundForReading(0.25), '0.25');
  assert.equal(roundForReading(10), '10');
  assert.equal(roundForReading(0.49955), '0.5');
  assert.equal(roundForReading(1110.4), '1110');
});

test('the reagent in excess is named, with how much is left', () => {
  const { add } = bench();
  add('pbno3_0_1m', 5); // 0.5 mmol
  const text = add('ki_0_1m', 5).notebookText; // 0.5 mmol of iodide, 2 per lead
  assert.match(text, /Potassium iodide solution was used up \(the limiting reagent\); lead\(II\) nitrate solution was in excess, and 0\.25 mmol of it is left\./);
});

test('a solid left over is given in grams', () => {
  const { add } = bench();
  add('caco3_s', 1.0);
  const text = add('hcl_1m', 10).notebookText;
  assert.match(text, /Hydrochloric acid was used up \(the limiting reagent\); calcium carbonate \(marble chips\) was in excess, and 0\.5 g of it is left\./);
});

test('a cascade is summed up once: both nitrates used up, the acid left over', () => {
  const result = engine.react(['agno3_0_1m', 'hcl_1m', 'pbno3_0_1m'], {
    moles: { agno3_0_1m: 0.0005, pbno3_0_1m: 0.0005, hcl_1m: 0.010 },
    volumeMl: 20,
  });
  assert.equal(result.steps.length, 2);
  assert.deepEqual([...result.amounts.usedUp].sort(), ['agno3_0_1m', 'pbno3_0_1m']);
  assert.equal(result.amounts.leftOver.length, 1);
  assert.match(result.message, /Lead\(II\) nitrate solution and silver nitrate solution were used up|Silver nitrate solution and lead\(II\) nitrate solution were used up/);
  assert.match(result.message, /hydrochloric acid was in excess, and 8\.5 mmol of it is left\.$/);
  // Said once, at the end, not after each step.
  assert.equal(result.message.match(/in excess/g).length, 1);
});

test('nothing is said when nothing of known amount is left over', () => {
  // Exactly 2 iodide per lead: both used up.
  const { add } = bench();
  add('pbno3_0_1m', 5);
  const text = add('ki_0_1m', 10).notebookText;
  assert.doesNotMatch(text, /limiting|excess/);
  assert.match(text, /bright yellow lead\(II\) iodide/);
});

test('a rule without coefficients says nothing about amounts', () => {
  // Iron rusting stays on the old path (batch.md §20).
  const { add } = bench();
  add('fe_metal', 1.0);
  add('water_distilled', 10);
  const result = add('o2_g', 1);
  assert.equal(result.engineResult.amounts, null);
  assert.doesNotMatch(result.notebookText, /limiting|excess/);
});

test('describeAmounts is silent without a summary or without a leftover', () => {
  assert.equal(describeAmounts(null, engine.getChemical), '');
  assert.equal(describeAmounts({ usedUp: ['hcl_1m'], leftOver: [] }, engine.getChemical), '');
  assert.equal(amountsSummary([], [], {}), null);
});

test('the close look lists each substance in mL or g, and in mmol', () => {
  const { beaker, add } = bench();
  add('pbno3_0_1m', 5);
  add('ki_0_1m', 5);
  const contents = beaker.getContents().map((c) => ({ chemicalId: c.id, amount: c.amount, unit: c.unit, mol: c.mol }));
  const rows = Object.fromEntries(amountRows(contents, engine.getChemical));
  assert.match(rows['Lead(II) nitrate solution'], /^2\.5 mL · 0\.25 mmol$/);
  assert.match(rows['Lead(II) iodide'], /^0\.115 g · 0\.25 mmol$/);
});

test('the close look says what the last reaction used up and left over', () => {
  const { add } = bench();
  add('pbno3_0_1m', 5);
  const result = add('ki_0_1m', 5);
  assert.equal(
    limitingText(result.engineResult.amounts, engine.getChemical),
    'Potassium iodide solution ran out first (the limiting reagent); left over in excess: Lead(II) nitrate solution (0.25 mmol).',
  );
  assert.equal(limitingText(null, engine.getChemical), null);
});

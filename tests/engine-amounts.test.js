/**
 * engine-amounts.test.js — stage 2.2.2: the limiting reagent, the excess
 * left behind, and the cascade re-checking what remains, done the way a
 * student does it (addChemical, one portion at a time).
 *
 * These use the REAL chemicals and rules, with the stage 2.2 fields added
 * here in the test (concentrationM, acidBase, coefficients) exactly as the
 * schema in docs/STAGE_2_2_SCHEMA.md writes them. The shipped data gets
 * them in stage 2.2.3, batch by batch, each with its sources; until then
 * the app behaves exactly as before, which the last test checks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, engine as shippedEngine, OUTCOME } from '../src/core/engine.js';
import { createContainer, PH_SOURCE } from '../src/core/container.js';
import { createActions } from '../src/core/actions.js';
import chemicalData from '../src/data/chemicals.json' with { type: 'json' };
import reactionData from '../src/data/reactions.json' with { type: 'json' };

const CONCENTRATION = { hcl_1m: 1, naoh_1m: 1, agno3_0_1m: 0.1, pbno3_0_1m: 0.1, ki_0_1m: 0.1 };
const ACID_BASE = {
  hcl_1m: { kind: 'strong_acid', perFormula: 1 },
  hno3_aq: { kind: 'strong_acid', perFormula: 1 },
  naoh_1m: { kind: 'strong_base', perFormula: 1 },
};
const COEFFICIENTS = {
  rxn_qa_group1_silver: { agno3_0_1m: 1, hcl_1m: 1, agcl_s: 1, hno3_aq: 1 },
  rxn_qa_group1_lead: { pbno3_0_1m: 1, hcl_1m: 2, pbcl2_s: 1, hno3_aq: 2 },
  rxn_carbonate_caco3_hcl: { caco3_s: 1, hcl_1m: 2, cacl2_aq: 1, co2_g: 1, water: 1 },
  rxn_neutralisation_hcl_naoh: { hcl_1m: 1, naoh_1m: 1, nacl_aq: 1, water: 1 },
  rxn_precipitation_pbno3_ki: { pbno3_0_1m: 1, ki_0_1m: 2, pbi2_s: 1, kno3_aq: 2 },
};

function labWithAmounts() {
  const chemicals = structuredClone(chemicalData).map((c) => ({
    ...c,
    ...(c.id in CONCENTRATION ? { concentrationM: CONCENTRATION[c.id] } : {}),
    ...(c.id in ACID_BASE ? { acidBase: ACID_BASE[c.id] } : {}),
  }));
  const reactions = structuredClone(reactionData).map((r) => (r.id in COEFFICIENTS ? { ...r, coefficients: COEFFICIENTS[r.id] } : r));
  return createEngine({ chemicals, reactions });
}

function bench(engine = labWithAmounts()) {
  const beaker = createContainer({ id: 'b', name: 'Beaker', capacityMl: 250, getChemical: engine.getChemical });
  const notebook = [];
  const actions = createActions({ getContainer: () => beaker, engine, onNotebookEntry: (e) => notebook.push(e.text) });
  return { beaker, notebook, actions, add: (id, amount) => actions.addChemical('b', id, amount) };
}

const mmol = (beaker, id) => beaker.getMolesOf(id) * 1000;
const near = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ${expected}`);

test('excess acid precipitates BOTH silver and lead chloride (batch.md §7)', () => {
  const engine = labWithAmounts();
  // Straight to the engine: both nitrates and plenty of acid in one vessel.
  const result = engine.react(['agno3_0_1m', 'hcl_1m', 'pbno3_0_1m'], {
    moles: { agno3_0_1m: 0.0005, pbno3_0_1m: 0.0005, hcl_1m: 0.010 },
    volumeMl: 20,
  });
  assert.equal(result.outcome, OUTCOME.REACTION);
  assert.deepEqual(result.steps.map((s) => s.reaction.id).sort(), ['rxn_qa_group1_lead', 'rxn_qa_group1_silver']);
  assert.ok(result.species.includes('agcl_s') && result.species.includes('pbcl2_s'), result.species.join(', '));
  assert.ok(result.species.includes('hcl_1m'), 'the excess acid is still there');

  // Before amounts, the first rule used up all the acid and only one formed.
  const old = shippedEngine.react(['agno3_0_1m', 'hcl_1m', 'pbno3_0_1m']);
  assert.equal(old.steps.length, 1);
});

test('silver, then lead, into excess acid on the bench: both precipitate, and the acid is counted', () => {
  const { beaker, notebook, add, actions } = bench();
  add('hcl_1m', 10); // 10 mmol
  add('agno3_0_1m', 5); // 0.5 mmol Ag⁺
  add('pbno3_0_1m', 5); // 0.5 mmol Pb²⁺, needing 1 mmol Cl⁻
  assert.ok(beaker.has('agcl_s') && beaker.has('pbcl2_s'));
  near(mmol(beaker, 'hcl_1m'), 10 - 0.5 - 1.0);
  // Every H⁺ is still there, as HCl or as the nitric acid the rules made:
  // 10 mmol in 20 mL is 0.5 M, pH 0.3.
  assert.equal(beaker.getPH(), 0.3);
  assert.equal(beaker.getPHSource(), PH_SOURCE.CALCULATED);
  // Stirring the finished mixture is "nothing more happens", not a gap.
  actions.stir('b');
  assert.match(notebook.at(-1), /No observable change/);
});

test('acid added to marble chips in portions fizzes until the marble is gone, then stops', () => {
  const { beaker, notebook, add } = bench();
  add('caco3_s', 1.0); // 9.99 mmol

  add('hcl_1m', 10); // 10 mmol: acid limiting
  assert.match(notebook.at(-1), /carbon dioxide/i);
  near(mmol(beaker, 'caco3_s'), 1000 / 100.09 - 5, 1e-6);
  assert.equal(beaker.has('hcl_1m'), false, 'all of the first portion was used');
  near(beaker.getAmountOf('caco3_s'), 1.0 - 0.005 * 100.09, 1e-6);

  add('hcl_1m', 10); // marble limiting now
  assert.match(notebook.at(-1), /carbon dioxide/i);
  assert.equal(beaker.has('caco3_s'), false, 'the marble has all reacted');
  near(mmol(beaker, 'hcl_1m'), 20 - 2 * (1000 / 100.09), 1e-6);

  add('hcl_1m', 10); // nothing left to react with
  assert.doesNotMatch(notebook.at(-1), /carbon dioxide/i);
  assert.match(notebook.at(-1), /No observable change/);
});

test('a precipitate is weighed, and the reagent in excess is left to react again', () => {
  const { beaker, add } = bench();
  add('pbno3_0_1m', 5); // 0.5 mmol
  add('ki_0_1m', 5); // 0.5 mmol: iodide limiting, 2 per lead
  near(mmol(beaker, 'pbi2_s'), 0.25);
  near(beaker.getAmountOf('pbi2_s'), 0.25e-3 * 461.01);
  near(mmol(beaker, 'pbno3_0_1m'), 0.25);

  add('ki_0_1m', 5); // more iodide: more precipitate, and now the lead is gone
  near(mmol(beaker, 'pbi2_s'), 0.5);
  assert.equal(beaker.has('pbno3_0_1m'), false);
});

test('uneven acid and alkali: the excess sets the pH, and the end point is the curated 7', () => {
  const { beaker, add } = bench();
  add('naoh_1m', 25);
  add('hcl_1m', 15);
  assert.equal(beaker.getPH(), 13.4, '10 mmol of hydroxide left in 40 mL');
  assert.equal(beaker.getPHSource(), PH_SOURCE.CALCULATED);

  add('hcl_1m', 10); // exactly to the end point
  assert.equal(beaker.has('naoh_1m'), false);
  assert.equal(beaker.has('hcl_1m'), false);
  assert.equal(beaker.getPH(), 7);
  assert.equal(beaker.getPHSource(), PH_SOURCE.REACTION);

  add('hcl_1m', 5); // past it: 5 mmol of acid in 55 mL
  assert.equal(beaker.getPH(), 1);
  assert.equal(beaker.getPHSource(), PH_SOURCE.CALCULATED);
});

test('the warming scales with how much reacted', () => {
  const { beaker, add } = bench();
  add('naoh_1m', 25);
  add('hcl_1m', 25); // equal volumes as labelled: the rule's basis
  near(beaker.getTemperatureC() - 25, 7, 0.01);

  const small = bench();
  small.add('naoh_1m', 25);
  small.add('hcl_1m', 1); // a twenty-fifth of the acid, in 26 mL
  assert.ok(small.beaker.getTemperatureC() - 25 < 1, `warmed ${small.beaker.getTemperatureC() - 25} °C`);
});

test('pouring carries the moles across, so a product made in one vessel is still counted in the next', () => {
  const engine = labWithAmounts();
  const vessels = {
    a: createContainer({ id: 'a', name: 'Beaker A', capacityMl: 250, getChemical: engine.getChemical }),
    b: createContainer({ id: 'b', name: 'Beaker B', capacityMl: 250, getChemical: engine.getChemical }),
  };
  const actions = createActions({ getContainer: (id) => vessels[id], engine });
  actions.addChemical('a', 'naoh_1m', 25);
  actions.addChemical('a', 'hcl_1m', 15); // 10 mmol NaOH left, 15 mmol NaCl made, in 40 mL
  actions.pour('a', 'b', 20); // half of it
  near(vessels.b.getMolesOf('naoh_1m') * 1000, 5);
  near(vessels.b.getMolesOf('nacl_aq') * 1000, 7.5);
  near(vessels.a.getMolesOf('naoh_1m') * 1000, 5);
});

test('a rule the shipped data has not converted yet still works the old way', () => {
  // Iron rusting is left without coefficients on purpose (batch.md §20):
  // its oxygen is a gas bubbled in, so it stays the old, everything-used way.
  assert.equal('coefficients' in reactionData.find((r) => r.id === 'rxn_corrosion_iron_rusting'), false);
  const { beaker, add } = bench(shippedEngine);
  add('fe_metal', 1.0);
  add('water_distilled', 10);
  add('o2_g', 1);
  assert.equal(beaker.has('fe_metal'), false, 'the old way: all the iron is used at once');
});

test('the shipped data now counts amounts for its converted rules (stage 2.2.3 batch 1)', () => {
  const { beaker, add } = bench(shippedEngine);
  add('caco3_s', 1.0);
  add('hcl_1m', 10);
  assert.ok(beaker.has('caco3_s'), 'half the marble is left after the first 10 mL of acid');
});

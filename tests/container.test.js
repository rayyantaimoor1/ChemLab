/**
 * container.test.js — proves a vessel holds its state the way CLAUDE.md
 * section 7 describes, and stays honest about pH.
 *
 * The most important tests here are the pH ones. Section 6.6 says pH is curated,
 * never computed, so the vessel must be willing to answer "I do not know" rather
 * than make a number up. If someone later adds pH averaging to make the meter
 * look busier, these tests should go red.
 *
 * Run them with:  npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createContainer, UNIT, PH_SOURCE } from '../src/core/container.js';

/* ------------------------------------------------------------------ *
 * Made-up chemicals, so these tests never break when real content changes
 * ------------------------------------------------------------------ */

const testChemicals = {
  acid: { id: 'acid', name: 'Test acid', state: 'aqueous', pH: 1.0 },
  alkali: { id: 'alkali', name: 'Test alkali', state: 'aqueous', pH: 13.0 },
  water: { id: 'water', name: 'Test water', state: 'liquid', pH: 7.0 },
  salt_solution: { id: 'salt_solution', name: 'Test salt solution', state: 'aqueous', pH: 7.0 },
  metal: { id: 'metal', name: 'Test metal', state: 'solid', pH: null },
  powder: { id: 'powder', name: 'Test powder', state: 'solid', pH: null },
};

const getChemical = (id) => testChemicals[id] || null;

const makeContainer = (options = {}) =>
  createContainer({ capacityMl: 100, getChemical, ...options });

/* ------------------------------------------------------------------ *
 * Holding several substances at once (CLAUDE.md section 7)
 * ------------------------------------------------------------------ */

test('a new vessel is empty and at room temperature', () => {
  const beaker = makeContainer();

  assert.equal(beaker.isEmpty(), true);
  assert.deepEqual(beaker.getSpeciesIds(), []);
  assert.equal(beaker.getVolumeMl(), 0);
  assert.equal(beaker.getTemperatureC(), 25);
  assert.equal(beaker.getPH(), null);
});

test('a vessel holds several substances at once, not one merged liquid', () => {
  const beaker = makeContainer();
  beaker.add('acid', 25);
  beaker.add('salt_solution', 25);
  beaker.add('metal', 5);

  assert.deepEqual(beaker.getSpeciesIds(), ['acid', 'metal', 'salt_solution']);
  assert.equal(beaker.getAmountOf('acid'), 25);
  assert.equal(beaker.getAmountOf('metal'), 5);
});

test('adding the same substance twice adds the amounts up', () => {
  const beaker = makeContainer();
  beaker.add('acid', 10);
  beaker.add('acid', 15);

  assert.equal(beaker.getAmountOf('acid'), 25);
  assert.deepEqual(beaker.getSpeciesIds(), ['acid']);
});

test('liquids are measured in millilitres and solids in grams', () => {
  const beaker = makeContainer();
  beaker.add('acid', 20);
  beaker.add('metal', 3);

  const contents = beaker.getContents();
  assert.equal(contents.find((entry) => entry.id === 'acid').unit, UNIT.ML);
  assert.equal(contents.find((entry) => entry.id === 'metal').unit, UNIT.GRAM);
});

test('solids do not count towards how full the vessel is', () => {
  const beaker = makeContainer();
  beaker.add('acid', 30);
  beaker.add('metal', 50);

  assert.equal(beaker.getVolumeMl(), 30);
});

test('removing takes part or all of a substance out', () => {
  const beaker = makeContainer();
  beaker.add('acid', 40);

  assert.equal(beaker.remove('acid', 15), 15);
  assert.equal(beaker.getAmountOf('acid'), 25);

  assert.equal(beaker.remove('acid'), 25);
  assert.equal(beaker.has('acid'), false);
});

test('removing something that is not there is harmless', () => {
  const beaker = makeContainer();
  assert.equal(beaker.remove('acid'), 0);
});

test('emptying the vessel leaves the glassware warm', () => {
  const beaker = makeContainer();
  beaker.add('acid', 20);
  beaker.setTemperatureC(60);
  beaker.empty();

  assert.equal(beaker.isEmpty(), true);
  assert.equal(beaker.getTemperatureC(), 60);
  assert.equal(beaker.getPH(), null);
});

test('add rejects nonsense amounts rather than storing them', () => {
  const beaker = makeContainer();

  assert.throws(() => beaker.add('acid', -5), TypeError);
  assert.throws(() => beaker.add('acid', Number.NaN), TypeError);
  assert.throws(() => beaker.add('', 5), TypeError);
});

/* ------------------------------------------------------------------ *
 * Volume and capacity
 * ------------------------------------------------------------------ */

test('a vessel reports how much room is left', () => {
  const beaker = makeContainer({ capacityMl: 100 });
  beaker.add('acid', 30);

  assert.equal(beaker.getFreeSpaceMl(), 70);
});

test('overfilling a vessel spills the excess and says so', () => {
  const beaker = makeContainer({ capacityMl: 50 });
  const result = beaker.add('acid', 80);

  assert.equal(result.added, 50);
  assert.equal(result.spilled, 30);
  assert.equal(result.overflowed, true);
  assert.equal(beaker.getVolumeMl(), 50);
});

test('a solid can still be dropped into a full vessel', () => {
  const beaker = makeContainer({ capacityMl: 50 });
  beaker.add('acid', 50);
  const result = beaker.add('metal', 5);

  assert.equal(result.overflowed, false);
  assert.equal(beaker.getAmountOf('metal'), 5);
});

/* ------------------------------------------------------------------ *
 * Temperature
 * ------------------------------------------------------------------ */

test('a vessel can be warmed and cooled', () => {
  const beaker = makeContainer();

  beaker.changeTemperatureC(15);
  assert.equal(beaker.getTemperatureC(), 40);

  beaker.changeTemperatureC(-20);
  assert.equal(beaker.getTemperatureC(), 20);

  beaker.setTemperatureC(100);
  assert.equal(beaker.getTemperatureC(), 100);
});

test('a vessel can be started at a chosen temperature', () => {
  const beaker = makeContainer({ tempC: 5 });
  assert.equal(beaker.getTemperatureC(), 5);
});

/* ------------------------------------------------------------------ *
 * pH is curated, never computed (CLAUDE.md section 6.6)
 * ------------------------------------------------------------------ */

test('one solution on its own shows that chemical curated pH', () => {
  const beaker = makeContainer();
  beaker.add('acid', 25);

  assert.equal(beaker.getPH(), 1.0);
  assert.equal(beaker.getPHSource(), PH_SOURCE.CHEMICAL);
});

test('a mixture with no curated value reports pH as unknown, NOT an average', () => {
  const beaker = makeContainer();
  beaker.add('acid', 25); // pH 1
  beaker.add('alkali', 25); // pH 13

  // The tempting wrong answer here is 7. There is no rule saying so, so the
  // honest answer is that we do not know.
  assert.equal(beaker.getPH(), null);
  assert.equal(beaker.getPHSource(), PH_SOURCE.NONE);
});

test('dropping a solid into acid does not wipe out the acid pH', () => {
  const beaker = makeContainer();
  beaker.add('acid', 25);
  beaker.add('metal', 5);

  assert.equal(beaker.getPH(), 1.0);
});

test('an empty vessel has no pH', () => {
  const beaker = makeContainer();
  assert.equal(beaker.getPH(), null);

  beaker.add('acid', 10);
  beaker.remove('acid');
  assert.equal(beaker.getPH(), null);
});

test('a vessel with only solids in it has no pH', () => {
  const beaker = makeContainer();
  beaker.add('metal', 5);
  beaker.add('powder', 5);

  assert.equal(beaker.getPH(), null);
});

test('without a chemical lookup the vessel admits it cannot report pH', () => {
  const beaker = createContainer({ capacityMl: 100 });
  beaker.add('acid', 25);

  assert.equal(beaker.getPH(), null);
});

/* ------------------------------------------------------------------ *
 * Applying a reaction the engine has already resolved
 * ------------------------------------------------------------------ */

const neutralisation = {
  id: 'rxn_test_neutralisation',
  reactants: ['acid', 'alkali'],
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
};

const precipitation = {
  id: 'rxn_test_precipitation',
  reactants: ['acid', 'salt_solution'],
  products: ['water', 'powder'],
  equation: 'Acid + Salt → Water + Precipitate',
  effects: {
    colorToHex: '#F2CC0C',
    precipitate: 'yellow test precipitate',
    gas: null,
    bubbles: false,
    smoke: false,
    tempDeltaC: 0,
    resultPH: 5.0,
  },
};

test('applying a reaction uses up the reactants and makes the products', () => {
  const beaker = makeContainer();
  beaker.add('acid', 25);
  beaker.add('alkali', 25);

  beaker.applyReaction(neutralisation);

  assert.equal(beaker.has('acid'), false);
  assert.equal(beaker.has('alkali'), false);
  assert.deepEqual(beaker.getSpeciesIds(), ['salt_solution', 'water']);
});

test('the liquid volume is carried across a reaction rather than recalculated', () => {
  const beaker = makeContainer();
  beaker.add('acid', 25);
  beaker.add('alkali', 25);
  assert.equal(beaker.getVolumeMl(), 50);

  beaker.applyReaction(neutralisation);

  assert.equal(beaker.getVolumeMl(), 50);
});

test('anything not taking part in the reaction is left alone', () => {
  const beaker = makeContainer();
  beaker.add('acid', 25);
  beaker.add('alkali', 25);
  beaker.add('metal', 5);

  beaker.applyReaction(neutralisation);

  assert.equal(beaker.getAmountOf('metal'), 5);
  assert.deepEqual(beaker.getSpeciesIds(), ['metal', 'salt_solution', 'water']);
});

test('the curated temperature change from the rule is applied', () => {
  const beaker = makeContainer();
  beaker.add('acid', 25);
  beaker.add('alkali', 25);

  beaker.applyReaction(neutralisation);

  assert.equal(beaker.getTemperatureC(), 32); // 25 + 7
});

test('the curated resultPH from the rule wins over anything worked out locally', () => {
  const beaker = makeContainer();
  beaker.add('acid', 25);
  beaker.add('alkali', 25);

  beaker.applyReaction(neutralisation);

  assert.equal(beaker.getPH(), 7.0);
  assert.equal(beaker.getPHSource(), PH_SOURCE.REACTION);
});

test('a precipitate is recorded as present but deliberately not weighed', () => {
  const beaker = makeContainer();
  beaker.add('acid', 20);
  beaker.add('salt_solution', 20);

  beaker.applyReaction(precipitation);

  assert.equal(beaker.has('powder'), true);
  const solid = beaker.getContents().find((entry) => entry.id === 'powder');
  // null means "some formed, we do not model how much" — not zero, not a guess.
  assert.equal(solid.amount, null);
  assert.equal(solid.unit, UNIT.GRAM);
});

test('an explicit noReaction rule changes nothing at all', () => {
  const beaker = makeContainer();
  beaker.add('acid', 25);
  beaker.add('salt_solution', 25);
  const before = beaker.snapshot();

  beaker.applyReaction({ id: 'rxn_none', reactants: ['acid', 'salt_solution'], noReaction: true });

  assert.deepEqual(beaker.getSpeciesIds(), before.speciesIds);
  assert.equal(beaker.getTemperatureC(), before.temperatureC);
  assert.equal(beaker.getVolumeMl(), before.volumeMl);
});

test('applyReaction refuses anything that is not a reaction rule', () => {
  const beaker = makeContainer();

  assert.throws(() => beaker.applyReaction(null), TypeError);
  assert.throws(() => beaker.applyReaction({}), TypeError);
});

/* ------------------------------------------------------------------ *
 * Pouring between vessels
 * ------------------------------------------------------------------ */

test('pouring moves liquid from one vessel to another', () => {
  const source = makeContainer({ id: 'source' });
  const target = makeContainer({ id: 'target' });
  source.add('acid', 60);

  const result = source.pourInto(target, 25);

  assert.equal(result.poured, 25);
  assert.equal(source.getVolumeMl(), 35);
  assert.equal(target.getVolumeMl(), 25);
});

test('pouring with no amount given tips everything across', () => {
  const source = makeContainer({ id: 'source' });
  const target = makeContainer({ id: 'target' });
  source.add('acid', 40);

  source.pourInto(target);

  assert.equal(source.getVolumeMl(), 0);
  assert.equal(target.getAmountOf('acid'), 40);
});

test('pouring half a mixture moves half of everything dissolved in it', () => {
  const source = makeContainer({ id: 'source' });
  const target = makeContainer({ id: 'target' });
  source.add('acid', 30);
  source.add('salt_solution', 10);

  source.pourInto(target, 20); // half of the 40 mL present

  assert.equal(target.getAmountOf('acid'), 15);
  assert.equal(target.getAmountOf('salt_solution'), 5);
  assert.equal(source.getAmountOf('acid'), 15);
  assert.equal(source.getAmountOf('salt_solution'), 5);
});

test('solids stay behind when liquid is decanted off', () => {
  const source = makeContainer({ id: 'source' });
  const target = makeContainer({ id: 'target' });
  source.add('acid', 40);
  source.add('metal', 5);

  source.pourInto(target);

  assert.equal(source.getAmountOf('metal'), 5);
  assert.equal(target.has('metal'), false);
});

test('pouring into a vessel too small for it spills the excess', () => {
  const source = makeContainer({ id: 'source', capacityMl: 200 });
  const target = makeContainer({ id: 'target', capacityMl: 20 });
  source.add('acid', 100);

  const result = source.pourInto(target);

  assert.equal(target.getVolumeMl(), 20);
  assert.ok(result.spilled > 0);
});

test('pouring from an empty vessel does nothing', () => {
  const source = makeContainer({ id: 'source' });
  const target = makeContainer({ id: 'target' });

  assert.deepEqual(source.pourInto(target), { poured: 0, spilled: 0 });
});

test('a vessel cannot be poured into itself', () => {
  const beaker = makeContainer();
  beaker.add('acid', 20);

  assert.throws(() => beaker.pourInto(beaker), /itself/);
});

test('asking to pour more than the source actually holds just pours what is there', () => {
  const source = makeContainer({ id: 'source' });
  const target = makeContainer({ id: 'target' });
  source.add('acid', 15);

  const result = source.pourInto(target, 100); // asked for 100, only 15 exists

  assert.equal(result.poured, 15);
  assert.equal(source.getVolumeMl(), 0);
  assert.equal(target.getVolumeMl(), 15);
});

test('pouring an exact fraction still leaves the right amount of everything on both sides', () => {
  const source = makeContainer({ id: 'source' });
  const target = makeContainer({ id: 'target' });
  source.add('acid', 30);
  source.add('salt_solution', 30); // 60 mL total, two substances in equal parts

  source.pourInto(target, 15); // a quarter of what is there

  assert.equal(source.getAmountOf('acid'), 22.5);
  assert.equal(source.getAmountOf('salt_solution'), 22.5);
  assert.equal(target.getAmountOf('acid'), 7.5);
  assert.equal(target.getAmountOf('salt_solution'), 7.5);
});

/* ------------------------------------------------------------------ *
 * The burner (CLAUDE.md section 7: temperature is a property of the
 * container; a rule requiring heat must not fire at room temperature)
 * ------------------------------------------------------------------ */

test('a new vessel has its burner off', () => {
  const beaker = makeContainer();
  assert.equal(beaker.getHeatLevel(), 0);
  assert.equal(beaker.isHeating(), false);
});

test('setHeatLevel sets the burner position', () => {
  const beaker = makeContainer();
  beaker.setHeatLevel(2);

  assert.equal(beaker.getHeatLevel(), 2);
  assert.equal(beaker.isHeating(), true);
});

test('setHeatLevel(0) means the burner is off', () => {
  const beaker = makeContainer();
  beaker.setHeatLevel(3);
  beaker.setHeatLevel(0);

  assert.equal(beaker.getHeatLevel(), 0);
  assert.equal(beaker.isHeating(), false);
});

test('setHeatLevel only accepts whole numbers from 0 to 3', () => {
  const beaker = makeContainer();

  assert.throws(() => beaker.setHeatLevel(4), RangeError);
  assert.throws(() => beaker.setHeatLevel(-1), RangeError);
  assert.throws(() => beaker.setHeatLevel(1.5), RangeError);
  assert.throws(() => beaker.setHeatLevel('2'), RangeError);
});

test('turning the burner on does not, by itself, change the temperature', () => {
  const beaker = makeContainer();
  const before = beaker.getTemperatureC();

  beaker.setHeatLevel(3);

  // This file only remembers the knob position. Something outside it (a
  // future tick loop) is what would actually raise the temperature over
  // time - see the comment above the heatLevel variable in container.js.
  assert.equal(beaker.getTemperatureC(), before);
});

test('emptying the vessel does not turn the burner off', () => {
  const beaker = makeContainer();
  beaker.add('acid', 20);
  beaker.setHeatLevel(2);

  beaker.empty();

  assert.equal(beaker.getHeatLevel(), 2);
});

test('the burner position appears in a snapshot', () => {
  const beaker = makeContainer();
  beaker.setHeatLevel(1);

  assert.equal(beaker.snapshot().heatLevel, 1);
});

/* ------------------------------------------------------------------ *
 * Tools read state, they never change it (CLAUDE.md section 7)
 * ------------------------------------------------------------------ */

test('a snapshot cannot be used to change the vessel', () => {
  const beaker = makeContainer();
  beaker.add('acid', 25);
  const reading = beaker.snapshot();

  assert.throws(() => {
    'use strict';
    reading.temperatureC = 999;
  });
  assert.throws(() => {
    'use strict';
    reading.contents.push({ id: 'sneaky', amount: 1, unit: UNIT.ML });
  });

  assert.equal(beaker.getTemperatureC(), 25);
  assert.equal(beaker.getSpeciesIds().length, 1);
});

test('a snapshot reports everything a measuring tool needs', () => {
  const beaker = makeContainer({ id: 'beaker_1', name: 'Beaker', type: 'beaker' });
  beaker.add('acid', 25);
  beaker.setTemperatureC(30);

  const reading = beaker.snapshot();

  assert.equal(reading.id, 'beaker_1');
  assert.equal(reading.name, 'Beaker');
  assert.equal(reading.type, 'beaker');
  assert.equal(reading.volumeMl, 25);
  assert.equal(reading.temperatureC, 30);
  assert.equal(reading.pH, 1.0);
  assert.equal(reading.pHSource, PH_SOURCE.CHEMICAL);
  assert.deepEqual(reading.speciesIds, ['acid']);
});

test('changing the vessel after taking a snapshot does not alter that snapshot', () => {
  const beaker = makeContainer();
  beaker.add('acid', 25);
  const reading = beaker.snapshot();

  beaker.add('alkali', 25);

  assert.deepEqual(reading.speciesIds, ['acid']);
  assert.equal(reading.volumeMl, 25);
});

/* ------------------------------------------------------------------ *
 * Working together with the real engine
 * ------------------------------------------------------------------ */

test('a real vessel and the real engine agree on a neutralisation', async () => {
  const { engine } = await import('../src/core/engine.js');

  const beaker = createContainer({ capacityMl: 250, getChemical: engine.getChemical });
  beaker.add('hcl_1m', 25);
  beaker.add('naoh_1m', 25);

  assert.equal(beaker.getVolumeMl(), 50);
  assert.equal(beaker.getPH(), null); // a mixture, nothing curated yet

  const result = engine.resolve(beaker.getSpeciesIds(), { tempC: beaker.getTemperatureC() });
  assert.equal(result.outcome, 'reaction');

  beaker.applyReaction(result.reaction);

  assert.equal(beaker.getTemperatureC(), 32); // 25 + the curated 7
  assert.equal(beaker.getPH(), 7.0);
  assert.equal(beaker.getPHSource(), PH_SOURCE.REACTION);
  assert.equal(beaker.getVolumeMl(), 50);
});

test('a real precipitate settles as a solid and does not inflate the volume', async () => {
  const { engine } = await import('../src/core/engine.js');

  const beaker = createContainer({ capacityMl: 250, getChemical: engine.getChemical });
  beaker.add('pbno3_0_1m', 25);
  beaker.add('ki_0_1m', 25);
  assert.equal(beaker.getVolumeMl(), 50);

  const result = engine.react(beaker.getSpeciesIds(), { tempC: beaker.getTemperatureC() });
  for (const step of result.steps) beaker.applyReaction(step.reaction);

  const solid = beaker.getContents().find((entry) => entry.id === 'pbi2_s');
  // Lead(II) iodide is a solid. Before its chemicals.json entry existed the
  // vessel had no way to know that, so it was filed as a liquid and handed
  // half the volume - 25 mL of "liquid precipitate" that does not exist.
  assert.equal(solid.unit, UNIT.GRAM);
  assert.equal(solid.amount, null);

  // All the liquid is the potassium nitrate solution left behind.
  const liquid = beaker.getContents().find((entry) => entry.id === 'kno3_aq');
  assert.equal(liquid.unit, UNIT.ML);
  assert.equal(beaker.getVolumeMl(), 50);
});

test('zinc dropped into real acid keeps the acid pH showing', async () => {
  const { engine } = await import('../src/core/engine.js');

  const flask = createContainer({ capacityMl: 100, getChemical: engine.getChemical });
  flask.add('hcl_1m', 30);
  flask.add('zn_metal', 4);

  // The metal is a solid, so it neither takes up liquid volume nor hides the pH.
  assert.equal(flask.getVolumeMl(), 30);
  assert.equal(flask.getPH(), 0.0);
});

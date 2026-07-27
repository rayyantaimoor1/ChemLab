/**
 * tools.test.js — proves the measuring tools read state without changing it
 * (CLAUDE.md section 7) and always pair a colour with its name (UI.md
 * section 5).
 *
 * Run them with:  npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createTools, TOOL, QUANTITY, TOLERANCE } from '../src/core/tools.js';
import { createContainer } from '../src/core/container.js';

/* ------------------------------------------------------------------ *
 * Made-up chemicals, so these tests do not break when real content changes
 * ------------------------------------------------------------------ */

const testChemicals = {
  strong_acid: { id: 'strong_acid', name: 'Test acid', state: 'aqueous', pH: 1.0, conductivity: 'strong' },
  weak_acid: { id: 'weak_acid', name: 'Weak test acid', state: 'aqueous', pH: 5.0, conductivity: 'weak' },
  neutral: { id: 'neutral', name: 'Test neutral', state: 'aqueous', pH: 7.0, conductivity: 'strong' },
  alkali: { id: 'alkali', name: 'Test alkali', state: 'aqueous', pH: 13.0, conductivity: 'strong' },
  pure_liquid: { id: 'pure_liquid', name: 'Test pure liquid', state: 'liquid', pH: 7.0, conductivity: 'none' },
  metal: { id: 'metal', name: 'Test metal', state: 'solid', pH: null, conductivity: 'metallic' },
  uncharted: { id: 'uncharted', name: 'Uncharted substance', state: 'aqueous', pH: 3.0 },
};

const getChemical = (id) => testChemicals[id] || null;

const makeTools = () => createTools({ getChemical });

function vessel(options = {}) {
  return createContainer({ id: 'beaker_1', name: 'Beaker', capacityMl: 250, getChemical, ...options });
}

/* ------------------------------------------------------------------ *
 * The tool set itself
 * ------------------------------------------------------------------ */

test('all four tools from UI.md section 7 are present', () => {
  const ids = makeTools().listTools().map((tool) => tool.id);

  assert.deepEqual(ids.sort(), [TOOL.CONDUCTIVITY, TOOL.LITMUS, TOOL.PH_PAPER, TOOL.THERMOMETER].sort());
});

test('dipping an unknown tool fails loudly', () => {
  const tools = makeTools();
  assert.throws(() => tools.dip('spectrometer', vessel().snapshot()), /not a known tool/);
});

test('dipping without a container snapshot fails loudly', () => {
  const tools = makeTools();
  assert.throws(() => tools.dip(TOOL.PH_PAPER, null), TypeError);
});

/* ------------------------------------------------------------------ *
 * Tools read state, never modify it (CLAUDE.md section 7)
 * ------------------------------------------------------------------ */

test('dipping a tool changes nothing about the vessel', () => {
  const beaker = vessel();
  beaker.add('strong_acid', 25);
  const before = beaker.snapshot();

  for (const tool of makeTools().listTools()) {
    makeTools().dip(tool.id, beaker.snapshot());
  }

  const after = beaker.snapshot();
  assert.deepEqual(after.contents, before.contents);
  assert.equal(after.volumeMl, before.volumeMl);
  assert.equal(after.temperatureC, before.temperatureC);
  assert.equal(after.pH, before.pH);
});

test('a reading cannot be edited after the fact', () => {
  const beaker = vessel();
  beaker.add('strong_acid', 25);
  const reading = makeTools().dip(TOOL.PH_PAPER, beaker.snapshot());

  assert.throws(() => {
    'use strict';
    reading.value = 99;
  });
});

/* ------------------------------------------------------------------ *
 * pH paper: a colour AND its name, always (UI.md section 5)
 * ------------------------------------------------------------------ */

test('pH paper reports the pH from the vessel', () => {
  const beaker = vessel();
  beaker.add('strong_acid', 25);

  const reading = makeTools().dip(TOOL.PH_PAPER, beaker.snapshot());

  assert.equal(reading.quantity, QUANTITY.PH);
  assert.equal(reading.value, 1.0);
  assert.equal(reading.hasReading, true);
});

test('pH paper never gives a colour without its name', () => {
  const cases = [
    ['strong_acid', 'red'],
    ['weak_acid', 'yellow'],
    ['neutral', 'green'],
    ['alkali', 'purple'],
  ];

  for (const [chemicalId, expectedName] of cases) {
    const beaker = vessel();
    beaker.add(chemicalId, 25);
    const reading = makeTools().dip(TOOL.PH_PAPER, beaker.snapshot());

    assert.equal(reading.colorName, expectedName, `${chemicalId} should read ${expectedName}`);
    assert.match(reading.colorHex, /^#[0-9A-F]{6}$/i);
    // The name must be in the sentence too, not only in a field the UI might
    // forget to render - that is the actual requirement in UI.md section 5.
    assert.ok(
      reading.text.includes(expectedName),
      `the reading text should name the colour: ${reading.text}`
    );
  }
});

test('pH 7 sits in the green band, the way a real chart reads', () => {
  const beaker = vessel();
  beaker.add('neutral', 25);

  assert.equal(makeTools().dip(TOOL.PH_PAPER, beaker.snapshot()).colorName, 'green');
});

test('pH paper avoids the hazard red reserved by UI.md section 4', () => {
  const beaker = vessel();
  beaker.add('strong_acid', 25);
  const reading = makeTools().dip(TOOL.PH_PAPER, beaker.snapshot());

  assert.notEqual(reading.colorHex.toUpperCase(), '#D0342C');
});

test('pH paper refuses to guess when the vessel has no curated pH', () => {
  const beaker = vessel();
  beaker.add('strong_acid', 25);
  beaker.add('alkali', 25); // a mixture: container.js reports pH as unknown

  const reading = makeTools().dip(TOOL.PH_PAPER, beaker.snapshot());

  assert.equal(reading.hasReading, false);
  assert.equal(reading.value, null);
  assert.equal(reading.colorHex, null);
  assert.equal(reading.colorName, null);
  assert.match(reading.text, /no reading available/);
  assert.match(reading.note, /no checked pH value/);
});

test('pH paper dipped into an empty vessel says the vessel is empty', () => {
  const reading = makeTools().dip(TOOL.PH_PAPER, vessel().snapshot());

  assert.equal(reading.hasReading, false);
  assert.match(reading.note, /empty/);
});

/* ------------------------------------------------------------------ *
 * Thermometer
 * ------------------------------------------------------------------ */

test('the thermometer reads the vessel temperature', () => {
  const beaker = vessel();
  beaker.add('strong_acid', 25);
  beaker.setTemperatureC(42);

  const reading = makeTools().dip(TOOL.THERMOMETER, beaker.snapshot());

  assert.equal(reading.quantity, QUANTITY.TEMPERATURE);
  assert.equal(reading.value, 42);
  assert.equal(reading.unit, '°C');
  assert.match(reading.text, /42 °C/);
});

test('the thermometer still reads an empty vessel - the glass has a temperature', () => {
  const reading = makeTools().dip(TOOL.THERMOMETER, vessel().snapshot());

  assert.equal(reading.hasReading, true);
  assert.equal(reading.value, 25);
});

/* ------------------------------------------------------------------ *
 * Litmus paper
 * ------------------------------------------------------------------ */

test('litmus turns red in acid, blue in alkali, purple near neutral', () => {
  const cases = [
    ['strong_acid', 'red', /acidic/],
    ['neutral', 'purple', /neutral/],
    ['alkali', 'blue', /alkaline/],
  ];

  for (const [chemicalId, expectedColor, verdictPattern] of cases) {
    const beaker = vessel();
    beaker.add(chemicalId, 25);
    const reading = makeTools().dip(TOOL.LITMUS, beaker.snapshot());

    assert.equal(reading.colorName, expectedColor);
    assert.ok(reading.text.includes(expectedColor));
    assert.match(reading.text, verdictPattern);
  }
});

test('litmus cannot tell a weak acid from a strong one, which is the point', () => {
  const strong = vessel();
  strong.add('strong_acid', 25); // pH 1
  const weak = vessel();
  weak.add('weak_acid', 25); // pH 5, above litmus's 4.5 turning point

  assert.equal(makeTools().dip(TOOL.LITMUS, strong.snapshot()).colorName, 'red');
  // pH 5 is inside litmus's transition range, so it reads purple rather than
  // red - litmus only tells you acid from alkali, not how strong.
  assert.equal(makeTools().dip(TOOL.LITMUS, weak.snapshot()).colorName, 'purple');
});

test('litmus refuses to guess when there is no curated pH', () => {
  const beaker = vessel();
  beaker.add('strong_acid', 25);
  beaker.add('alkali', 25);

  const reading = makeTools().dip(TOOL.LITMUS, beaker.snapshot());

  assert.equal(reading.hasReading, false);
  assert.equal(reading.colorName, null);
});

/* ------------------------------------------------------------------ *
 * Conductivity tester — reads curated data, never infers
 * ------------------------------------------------------------------ */

test('a strong electrolyte lights the bulb', () => {
  const beaker = vessel();
  beaker.add('strong_acid', 25);

  const reading = makeTools().dip(TOOL.CONDUCTIVITY, beaker.snapshot());

  assert.equal(reading.quantity, QUANTITY.CONDUCTIVITY);
  assert.equal(reading.value, 'strong');
  assert.match(reading.text, /lit brightly/);
});

test('a non-electrolyte does not light the bulb', () => {
  const beaker = vessel();
  beaker.add('pure_liquid', 25);

  const reading = makeTools().dip(TOOL.CONDUCTIVITY, beaker.snapshot());

  assert.equal(reading.value, 'none');
  assert.match(reading.text, /did not light/);
});

test('a weak electrolyte only glows dimly', () => {
  const beaker = vessel();
  beaker.add('weak_acid', 25);

  assert.equal(makeTools().dip(TOOL.CONDUCTIVITY, beaker.snapshot()).value, 'weak');
});

test('a metal conducts, and the reading explains it is a different mechanism', () => {
  const beaker = vessel();
  beaker.add('metal', 5);

  const reading = makeTools().dip(TOOL.CONDUCTIVITY, beaker.snapshot());

  assert.equal(reading.value, 'metallic');
  assert.match(reading.text, /free electrons/);
});

test('a mixture reports its best conductor', () => {
  const beaker = vessel();
  beaker.add('pure_liquid', 25); // none
  beaker.add('strong_acid', 25); // strong

  assert.equal(makeTools().dip(TOOL.CONDUCTIVITY, beaker.snapshot()).value, 'strong');
});

test('the tester refuses to infer conductivity for a substance with no curated value', () => {
  const beaker = vessel();
  beaker.add('uncharted', 25); // deliberately has no conductivity field

  const reading = makeTools().dip(TOOL.CONDUCTIVITY, beaker.snapshot());

  assert.equal(reading.hasReading, false);
  assert.match(reading.note, /checked conductivity value/);
});

test('a partly-uncharted mixture reports what it knows and admits the gap', () => {
  const beaker = vessel();
  beaker.add('strong_acid', 25);
  beaker.add('uncharted', 25);

  const reading = makeTools().dip(TOOL.CONDUCTIVITY, beaker.snapshot());

  assert.equal(reading.value, 'strong');
  assert.match(reading.text, /covers only what is known/);
});

test('the tester says nothing useful about an empty vessel', () => {
  const reading = makeTools().dip(TOOL.CONDUCTIVITY, vessel().snapshot());

  assert.equal(reading.hasReading, false);
  assert.match(reading.note, /empty/);
});

test('without a chemical lookup the tester admits it has no data', () => {
  const beaker = vessel();
  beaker.add('strong_acid', 25);

  const reading = createTools().dip(TOOL.CONDUCTIVITY, beaker.snapshot());

  assert.equal(reading.hasReading, false);
});

/* ------------------------------------------------------------------ *
 * Tolerances are instrument precision, used by compare-with-reference
 * ------------------------------------------------------------------ */

test('pH paper and the thermometer each carry their own precision', () => {
  const beaker = vessel();
  beaker.add('neutral', 25);
  const tools = makeTools();

  assert.deepEqual(tools.dip(TOOL.PH_PAPER, beaker.snapshot()).tolerance, TOLERANCE[QUANTITY.PH]);
  assert.deepEqual(
    tools.dip(TOOL.THERMOMETER, beaker.snapshot()).tolerance,
    TOLERANCE[QUANTITY.TEMPERATURE]
  );
});

/* ------------------------------------------------------------------ *
 * Against the real data files
 * ------------------------------------------------------------------ */

test('every real chemical has a curated conductivity value', async () => {
  const { engine } = await import('../src/core/engine.js');

  for (const chemical of engine.getAllChemicals()) {
    assert.ok(
      typeof chemical.conductivity === 'string' && chemical.conductivity.length > 0,
      `chemical ${chemical.id} is missing a conductivity value`
    );
  }
});

test('real hydrochloric acid reads red on pH paper and lights the bulb', async () => {
  const { engine } = await import('../src/core/engine.js');
  const tools = createTools({ getChemical: engine.getChemical });
  const beaker = createContainer({
    id: 'beaker_1',
    name: 'Beaker',
    capacityMl: 250,
    getChemical: engine.getChemical,
  });
  beaker.add('hcl_1m', 25);

  const ph = tools.dip(TOOL.PH_PAPER, beaker.snapshot());
  assert.equal(ph.value, 0.0);
  assert.equal(ph.colorName, 'red');

  const conductivity = tools.dip(TOOL.CONDUCTIVITY, beaker.snapshot());
  assert.equal(conductivity.value, 'strong');
});

test('the tools can read a vessel after a real precipitation', async () => {
  const { engine } = await import('../src/core/engine.js');
  const tools = createTools({ getChemical: engine.getChemical });
  const beaker = createContainer({
    id: 'beaker_1',
    name: 'Beaker',
    capacityMl: 250,
    getChemical: engine.getChemical,
  });
  beaker.add('pbno3_0_1m', 25);
  beaker.add('ki_0_1m', 25);

  const result = engine.react(beaker.getSpeciesIds(), { tempC: beaker.getTemperatureC() });
  for (const step of result.steps) beaker.applyReaction(step.reaction);

  // While the products had no chemicals.json entries, this vessel was
  // unreadable: the tester had nothing to look up and reported no reading.
  const conductivity = tools.dip(TOOL.CONDUCTIVITY, beaker.snapshot());
  assert.equal(conductivity.hasReading, true);
  assert.equal(conductivity.value, 'strong'); // the potassium nitrate left in solution
  assert.doesNotMatch(conductivity.text, /covers only what is known/);

  const ph = tools.dip(TOOL.PH_PAPER, beaker.snapshot());
  assert.equal(ph.hasReading, true);
  assert.ok(ph.colorName);
});

test('the precipitate itself is a named colour, ready for the UI to show', async () => {
  const { engine } = await import('../src/core/engine.js');

  // UI.md section 5: a colour is never allowed on screen without its name.
  for (const id of ['pbi2_s', 'agcl_s']) {
    const solid = engine.getChemical(id);
    assert.ok(solid, `${id} should exist`);
    assert.match(solid.colorHex, /^#[0-9A-F]{6}$/i);
    assert.ok(solid.colorName && solid.colorName.length > 0, `${id} needs a colour name`);
    assert.equal(solid.state, 'solid');
  }
});

test('real distilled water is neutral on litmus and does not conduct', async () => {
  const { engine } = await import('../src/core/engine.js');
  const tools = createTools({ getChemical: engine.getChemical });
  const beaker = createContainer({
    id: 'beaker_1',
    name: 'Beaker',
    capacityMl: 250,
    getChemical: engine.getChemical,
  });
  beaker.add('water_distilled', 50);

  assert.equal(tools.dip(TOOL.LITMUS, beaker.snapshot()).colorName, 'purple');
  assert.equal(tools.dip(TOOL.CONDUCTIVITY, beaker.snapshot()).value, 'none');
});

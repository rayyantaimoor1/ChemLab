/**
 * gas-look.test.js — coloured gases and where smoke forms (BUILD_UI.md UI.5.3).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/core/engine.js';
import { colouredGasesFor, gasNoteText, smokeFormsInside } from '../src/ui/gas-look.js';

const engine = createEngine();
const holding = (...ids) => ({ speciesIds: ids });

test('only coloured gases are shown, in their curated colour', () => {
  const gases = colouredGasesFor(holding('nacl_aq', 'no_g', 'no2_g', 'water'), engine);
  assert.deepEqual(gases.map((g) => g.id), ['no2_g']);
  assert.equal(gases[0].colorName, 'reddish brown');
  assert.deepEqual(colouredGasesFor(holding('h2_g', 'co2_g', 'naoh_aq'), engine), []);
});

test('chlorine from brine is pale yellow-green; hydrogen beside it is not drawn', () => {
  const gases = colouredGasesFor(holding('cl2_g', 'h2_g', 'naoh_aq'), engine);
  assert.deepEqual(gases.map((g) => [g.id, g.colorName]), [['cl2_g', 'pale yellow-green']]);
});

test('a coloured gas is always named on the label', () => {
  const gases = colouredGasesFor(holding('no2_g'), engine);
  assert.equal(gasNoteText(gases), 'reddish brown nitrogen dioxide above the liquid');
  assert.equal(gasNoteText(gases, false), 'reddish brown nitrogen dioxide filling the vessel');
  assert.equal(gasNoteText([]), '');
});

test('ammonium chloride smoke forms inside, where the two gases meet; soot rises out of the mouth', () => {
  assert.equal(smokeFormsInside(engine.getReaction('rxn_smoke_nh3_hcl'), engine), true);
  assert.equal(smokeFormsInside(engine.getReaction('rxn_combustion_benzene'), engine), false);
});

// ---- Fuming liquids (curated fumes field) ----

import { fumesFor, fumesNoteText, MIST_HEX } from '../src/ui/gas-look.js';

test('only a curated fumes field makes a mist; nothing is read off a description', () => {
  const fake = {
    getChemical: (id) => ({
      a: { id: 'a', name: 'Fuming thing', fumes: 'mist', colorHex: '#000000', colorName: 'black' },
      b: { id: 'b', name: 'Red liquid (liquid)', fumes: 'vapour', colorHex: '#8B1A00', colorName: 'dark red-brown' },
      c: { id: 'c', name: 'Says it fumes', description: 'It fumes in air.' },
    })[id],
  };
  const fumes = fumesFor({ speciesIds: ['a', 'b', 'c'] }, fake);
  assert.deepEqual(fumes.map((f) => [f.id, f.kind, f.colorHex]), [['a', 'mist', MIST_HEX], ['b', 'vapour', '#8B1A00']]);
  assert.equal(fumesNoteText(fumes), 'white fumes from fuming thing; dark red-brown red liquid vapour at the mouth');
});

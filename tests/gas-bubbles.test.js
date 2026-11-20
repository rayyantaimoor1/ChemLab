/**
 * gas-bubbles.test.js — where bubbles come from and how fast (BUILD_UI.md UI.5.2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/core/engine.js';
import { paceFor, bubbleSourceFor, gasPerElectron, electrodeStreams } from '../src/ui/gas-bubbles.js';

const engine = createEngine();
const rule = (id) => engine.getReaction(id);

test('faster gas means more bubbles rising faster; null is the steady middle', () => {
  assert.ok(paceFor('vigorous').count > paceFor('steady').count);
  assert.ok(paceFor('steady').count > paceFor('slow').count);
  assert.ok(paceFor('vigorous').riseMs[1] < paceFor('slow').riseMs[0]);
  assert.deepEqual(paceFor(null), paceFor('steady'));
});

test('a metal in acid fizzes from the metal; two solutions fizz in the liquid', () => {
  assert.deepEqual(bubbleSourceFor(rule('rxn_displacement_mg_hcl'), ['mg_metal']), { at: 'solid', solidId: 'mg_metal' });
  assert.deepEqual(bubbleSourceFor(rule('rxn_carbonate_caco3_hcl'), ['caco3_s']), { at: 'solid', solidId: 'caco3_s' });
  assert.deepEqual(bubbleSourceFor(rule('rxn_carbonate_na2co3_hcl'), []), { at: 'liquid' });
});

test('peroxide fizzes from the grains of its solid catalyst', () => {
  assert.deepEqual(bubbleSourceFor(rule('rxn_catalysis_h2o2_mno2'), ['mno2_s']), { at: 'solid', solidId: 'mno2_s' });
});

test('gas per electron is read off the half-equation', () => {
  assert.equal(gasPerElectron('2H⁺ + 2e⁻ → H₂', 'H2'), 0.5);
  assert.equal(gasPerElectron('4OH⁻ → O₂ + 2H₂O + 4e⁻', 'O2'), 0.25);
  assert.equal(gasPerElectron('Cu²⁺ + 2e⁻ → Cu', 'O2'), 0);
});

test('splitting water: hydrogen at the cathode, twice the oxygen at the anode', () => {
  const streams = electrodeStreams(rule('rxn_electrolysis_water'), engine);
  const cathode = streams.find((s) => s.side === 'cathode');
  const anode = streams.find((s) => s.side === 'anode');
  assert.equal(cathode.gasId, 'h2_g');
  assert.equal(anode.gasId, 'o2_g');
  assert.equal(cathode.share, 1);
  assert.equal(anode.share, 0.5);
});

test('brine gives equal streams; copper sulfate bubbles only at the anode', () => {
  const brine = electrodeStreams(rule('rxn_electrolysis_brine'), engine);
  assert.deepEqual(brine.map((s) => [s.side, s.gasId, s.share]), [['cathode', 'h2_g', 1], ['anode', 'cl2_g', 1]]);
  const cuso4 = electrodeStreams(rule('rxn_electrolysis_cuso4'), engine);
  assert.deepEqual(cuso4.map((s) => [s.side, s.gasId]), [['anode', 'o2_g']]);
});

test('every electrolysis rule that names a gas product has a stream for it', () => {
  for (const reaction of engine.getAllReactions ? engine.getAllReactions() : []) {
    if (!reaction.electrodes) continue;
    const gasProducts = (reaction.products || []).filter((id) => engine.getChemical(id)?.state === 'gas');
    const streams = electrodeStreams(reaction, engine);
    for (const id of gasProducts) assert.ok(streams.some((s) => s.gasId === id), `${reaction.id}: no electrode makes ${id}`);
  }
});

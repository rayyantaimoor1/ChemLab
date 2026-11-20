/**
 * gas-rates.test.js — how fast a gas comes off (BUILD_UI.md UI.5.1).
 *
 * effects.gasRate is curated chemistry: slow, steady or vigorous, only on
 * rules where bubbles of a gas are drawn, and every value backed by a
 * reference that says it covers the rate. These tests hold the data to that.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../src/data/reactions.json', import.meta.url), 'utf8'));
const reactions = Array.isArray(data) ? data : data.reactions;
const byId = new Map(reactions.map((r) => [r.id, r]));
const rated = reactions.filter((r) => r.effects && 'gasRate' in r.effects);

test('every gasRate is slow, steady or vigorous - or null, no rate on record', () => {
  for (const r of rated) {
    assert.ok([null, 'slow', 'steady', 'vigorous'].includes(r.effects.gasRate), `${r.id}: "${r.effects.gasRate}"`);
  }
});

test('a gasRate goes only where bubbles of a gas are drawn', () => {
  for (const r of rated) {
    assert.equal(r.effects.bubbles, true, `${r.id}: no bubbles`);
    assert.ok(r.effects.gas, `${r.id}: no gas`);
  }
});

test('every gasRate is backed by a reference that covers it', () => {
  for (const r of rated.filter((x) => x.effects.gasRate !== null)) {
    const covering = (r.sources || []).filter((s) => s.covers.includes('gasRate'));
    assert.ok(covering.length > 0, `${r.id}: no source covers gasRate`);
    for (const s of covering) assert.ok(s.url, `${r.id}: a gasRate source must be a page that was opened`);
  }
});

test('every rule with bubbles of a gas has a gasRate (null when none is on record)', () => {
  for (const r of reactions.filter((x) => x.effects?.bubbles === true && x.effects?.gas)) {
    assert.ok('gasRate' in r.effects, `${r.id}: no gasRate`);
  }
});

test('the reactivity series shows in the bubbles: magnesium, zinc, iron in the same acid', () => {
  assert.equal(byId.get('rxn_displacement_mg_hcl').effects.gasRate, 'vigorous');
  assert.equal(byId.get('rxn_displacement_zn_hcl').effects.gasRate, 'steady');
  assert.equal(byId.get('rxn_displacement_fe_hcl').effects.gasRate, 'slow');
});

test('group 1 down the group: lithium steady, sodium and potassium vigorous', () => {
  assert.equal(byId.get('rxn_group1_li_water').effects.gasRate, 'steady');
  assert.equal(byId.get('rxn_group1_na_water').effects.gasRate, 'vigorous');
  assert.equal(byId.get('rxn_group1_k_water').effects.gasRate, 'vigorous');
});

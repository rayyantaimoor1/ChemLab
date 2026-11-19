/**
 * boiling-points.test.js — when a liquid boils and a solid melts
 * (BUILD_UI.md stage UI.4, batch.md §16).
 *
 * The bench will boil a liquid at its curated boiling point, so the numbers
 * must be sane, on the right kind of substance, and backed by a source that
 * says what it confirms.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import chemicals from '../src/data/chemicals.json' with { type: 'json' };

const isLiquid = (c) => c.state === 'aqueous' || c.state === 'liquid';

test('a boiling point is a sensible number of °C, and only on a liquid or solution', () => {
  for (const c of chemicals.filter((x) => 'boilingPointC' in x)) {
    assert.ok(isLiquid(c), `${c.id} is a ${c.state}, not a liquid`);
    assert.equal(typeof c.boilingPointC, 'number', c.id);
    assert.ok(c.boilingPointC > -60 && c.boilingPointC < 400, `${c.id}: ${c.boilingPointC} °C`);
  }
});

test('a melting point is only ever on a solid', () => {
  for (const c of chemicals.filter((x) => 'meltingPointC' in x)) {
    assert.equal(c.state, 'solid', c.id);
    assert.equal(typeof c.meltingPointC, 'number', c.id);
  }
});

test('water boils at 100 °C', () => {
  for (const id of ['water', 'water_distilled']) {
    assert.equal(chemicals.find((c) => c.id === id).boilingPointC, 100, id);
  }
});

test('a source that confirms a boiling or melting point is attached to one', () => {
  for (const c of chemicals) {
    for (const entry of c.sources || []) {
      if (entry.covers.includes('boilingPoint')) assert.ok('boilingPointC' in c, `${c.id}: no boilingPointC`);
      if (entry.covers.includes('meltingPoint')) assert.ok('meltingPointC' in c, `${c.id}: no meltingPointC`);
    }
  }
});

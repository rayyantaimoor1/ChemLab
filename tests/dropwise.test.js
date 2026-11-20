/**
 * dropwise.test.js — one drop, and swirl or stir (BUILD_UI.md UI.6.3).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DROP_ML, mixVerbFor } from '../src/ui/dropwise.js';

test('a drop is 0.05 mL - twenty to the millilitre', () => {
  assert.equal(DROP_ML, 0.05);
  assert.equal(Math.round(1 / DROP_ML), 20);
});

test("the burette's single drop is the same drop as the dropper's", () => {
  const bench = readFileSync(new URL('../src/ui/bench.js', import.meta.url), 'utf8');
  assert.match(bench, /const BURETTE_DROP_ML = DROP_ML;/);
});

test('a conical flask is swirled; a beaker or a tube is stirred with a rod', () => {
  assert.equal(mixVerbFor('flask'), 'Swirl');
  assert.equal(mixVerbFor('flask_small'), 'Swirl');
  assert.equal(mixVerbFor('beaker'), 'Stir');
  assert.equal(mixVerbFor('test_tube'), 'Stir');
});

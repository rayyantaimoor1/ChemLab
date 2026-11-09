/**
 * golden.test.js — no notebook sentence changes by accident
 * (BUILD_PHASE_2.md stage 2.1.3).
 *
 * tests/golden/notebook-sentences.json holds the exact sentence the notebook
 * writes for every reaction rule, as approved by a person. This test works
 * every sentence out afresh from the current data and engine and fails on
 * ANY difference — a changed colour, a different temperature, a reworded
 * observation, a reaction quietly overtaken by another rule, a reaction
 * added or removed without its sentence being approved.
 *
 * WHEN IT FAILS
 * Read the differences it prints. If the change was a mistake, undo it. If
 * it was meant — a corrected colour, a reworded explanation, a new reaction —
 * approve it with `npm run golden:update` and commit the updated golden file
 * alongside the change, so the history shows which sentences moved and why.
 *
 * What each entry means is explained at the top of
 * scripts/lib/golden-sentences.mjs.
 *
 * Run them with:  npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEngine } from '../src/core/engine.js';
import { buildGoldenSentences } from '../scripts/lib/golden-sentences.mjs';

const GOLDEN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden', 'notebook-sentences.json');
const APPROVE = 'If this change was meant, approve it with: npm run golden:update';

const approved = JSON.parse(readFileSync(GOLDEN, 'utf8'));
const current = buildGoldenSentences(createEngine());

test('every reaction has an approved notebook sentence, and no approved sentence is orphaned', () => {
  const missing = Object.keys(current).filter((id) => !(id in approved));
  const orphaned = Object.keys(approved).filter((id) => !(id in current));
  assert.deepEqual(
    { missing, orphaned },
    { missing: [], orphaned: [] },
    `Reactions without an approved sentence, or approved sentences for reactions that no longer exist. ${APPROVE}`
  );
});

for (const [id, now] of Object.entries(current)) {
  if (!(id in approved)) continue; // reported by the test above
  test(`notebook sentence unchanged: ${id}`, () => {
    assert.deepEqual(now, approved[id], `The notebook now reads differently for ${id}. ${APPROVE}`);
  });
}

/**
 * update-golden.mjs — re-approves the golden notebook sentences
 * (BUILD_PHASE_2.md stage 2.1.3).
 *
 * WHEN TO RUN IT
 * Only after a change to what students read was MEANT to happen — a
 * reworded explanation, a corrected colour, a new reaction — and only after
 * reading the differences the failing golden test printed. Running it
 * writes the current sentences into tests/golden/notebook-sentences.json,
 * which is what "approving" a wording change means. The changed file then
 * goes into the same commit as the change that caused it, so the history
 * shows exactly which sentences moved and why.
 *
 * Run it with:  npm run golden:update
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createEngine } from '../src/core/engine.js';
import { buildGoldenSentences, formatGolden } from './lib/golden-sentences.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN = path.join(ROOT, 'tests', 'golden', 'notebook-sentences.json');

const fresh = buildGoldenSentences(createEngine());
const previous = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : {};

const added = Object.keys(fresh).filter((id) => !(id in previous));
const removed = Object.keys(previous).filter((id) => !(id in fresh));
const changed = Object.keys(fresh).filter(
  (id) => id in previous && JSON.stringify(previous[id]) !== JSON.stringify(fresh[id])
);

mkdirSync(path.dirname(GOLDEN), { recursive: true });
writeFileSync(GOLDEN, formatGolden(fresh));

console.log(`Golden notebook sentences written: ${Object.keys(fresh).length} reactions.`);
console.log(`  ${added.length} new, ${changed.length} changed, ${removed.length} removed.`);
// Listed by name only when the list is short enough to read; the very first
// run adds every reaction at once and a 394-line list helps nobody.
for (const [label, ids] of [['changed', changed], ['new', added], ['removed', removed]]) {
  if (ids.length > 0 && ids.length <= 40) for (const id of ids) console.log(`  ${label}: ${id}`);
}

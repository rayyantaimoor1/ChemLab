/**
 * bottles.test.js — reagents as bottles with printed labels (BUILD_UI.md UI.8.2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { containerKindFor, glassFor, pictogramsFor, ghsPictogramSvg, bottleSvg, wrapLabel } from '../src/ui/bottles.js';

const chemicals = JSON.parse(readFileSync(new URL('../src/data/chemicals.json', import.meta.url), 'utf8'));
const byId = (id) => chemicals.find((c) => c.id === id);

test('the container comes from curated state and shelf drawer, never a formula', () => {
  assert.equal(containerKindFor(byId('nh3_g')), 'cylinder');
  assert.equal(containerKindFor(byId('mg_metal')), 'jar');
  assert.equal(containerKindFor(byId('phenolphthalein_1pct')), 'dropper');
  assert.equal(containerKindFor(byId('hcl_1m')), 'bottle');
});

test('amber only where the curated storage field says so', () => {
  assert.equal(glassFor({ storage: 'amber' }), 'amber');
  assert.equal(glassFor({}), 'clear');
  for (const c of chemicals) {
    if (glassFor(c) === 'amber') assert.equal(c.storage, 'amber', c.id);
  }
});

test('every pictogram comes from ghs-hazards.json, once each, in GHS order', () => {
  // Concentrated sulfuric acid is corrosive.
  const codes = pictogramsFor(byId('h2so4_conc'));
  assert.ok(codes.includes('GHS05'));
  assert.deepEqual(codes, [...new Set(codes)].sort());
  assert.deepEqual(pictogramsFor({ hazards: [] }), []);
});

test('each of the nine pictograms draws, red-bordered, with its meaning on hover', () => {
  for (let n = 1; n <= 9; n += 1) {
    const code = `GHS0${n}`;
    const svg = ghsPictogramSvg(code);
    assert.match(svg, /stroke="#D8202A"/, code);
    assert.match(svg, new RegExp(`<title>${code}: `), code);
  }
});

test('the printed label carries the name, formula, concentration and pictograms', () => {
  const svg = bottleSvg(byId('hcl_conc'));
  assert.match(svg, /Concentrated/);
  assert.match(svg, />HCl</);
  assert.match(svg, /data-ghs="GHS05"/);
  assert.doesNotMatch(bottleSvg(byId('hcl_conc'), { label: false }), /<text/);
});

test('long names wrap onto the label', () => {
  assert.deepEqual(wrapLabel('Concentrated hydrochloric acid', 16), ['Concentrated', 'hydrochloric', 'acid']);
});

test('a long concentration wraps on the label instead of running off it', () => {
  const svg = bottleSvg(byId('hcl_conc'), { width: 150, height: 215 });
  const subs = svg.match(/class="bottle__sub">[^<]*</g) || [];
  assert.ok(subs.length >= 3, 'formula plus a wrapped concentration');
  for (const line of subs) assert.ok(line.length < 50, line);
});

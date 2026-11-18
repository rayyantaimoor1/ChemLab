/**
 * solid-shapes.test.js — shelf solids drawn as what they are
 * (BUILD_UI.md UI.3.3).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import chemicals from '../src/data/chemicals.json' with { type: 'json' };
import { FORMS, solidSvg, solidBox, shelfSolidLabel } from '../src/ui/solid-shapes.js';

test('every form a chemical can have has a drawing', () => {
  const used = new Set(chemicals.filter((c) => c.form).map((c) => c.form));
  for (const form of used) assert.ok(FORMS.includes(form), `no drawing for "${form}"`);
});

test('every form draws as self-contained SVG, with no broken numbers', () => {
  for (const form of FORMS) {
    for (const width of [12, 30, 70]) {
      const svg = solidSvg({ id: 'x', form, colorHex: '#8A8F93' }, solidBox(width, 5));
      assert.match(svg, /^<svg [^>]*>.*<\/svg>$/s, form);
      assert.doesNotMatch(svg, /NaN|undefined|Infinity|href=|https?:/, form);
    }
  }
});

test('the same solid in the same glass looks the same every time', () => {
  const zinc = { id: 'zn_metal', form: 'granules', colorHex: '#8A8F93' };
  assert.equal(solidSvg(zinc, solidBox(60, 5)), solidSvg(zinc, solidBox(60, 5)));
  assert.notEqual(solidSvg(zinc, solidBox(60, 5)), solidSvg({ ...zinc, id: 'other' }, solidBox(60, 5)));
});

test('more solid makes a bigger heap, within the vessel', () => {
  const small = solidBox(60, 2);
  const big = solidBox(60, 20);
  assert.ok(big.h > small.h);
  assert.ok(big.w <= 60 && small.w <= 60);
});

test('a ribbon curls up taller than a heap of granules on the same floor', () => {
  assert.ok(solidBox(20, 5, 'ribbon').h > solidBox(20, 5, 'granules').h);
});

test('the label names the colour, the form and the substance', () => {
  assert.equal(
    shelfSolidLabel({ colorName: 'bluish-grey', form: 'granules', name: 'Zinc metal' }),
    'bluish-grey granules: Zinc metal'
  );
});

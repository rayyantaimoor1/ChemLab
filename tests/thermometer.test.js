/**
 * thermometer.test.js — the school thermometer's scale (BUILD_UI.md UI.4.3).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  columnFraction, offScale, thermometerGeometry, thermometerSvg, yFor, SCALE_MIN_C, SCALE_MAX_C,
} from '../src/ui/thermometer.js';

test('the column runs from -10 °C at the bottom of the scale to 110 °C at the top', () => {
  assert.equal(columnFraction(SCALE_MIN_C), 0);
  assert.equal(columnFraction(SCALE_MAX_C), 1);
  assert.equal(columnFraction(50), 0.5);
});

test('beyond its range it stops at the end of the scale and says so', () => {
  assert.equal(columnFraction(500), 1);
  assert.equal(columnFraction(-40), 0);
  assert.equal(offScale(500), true);
  assert.equal(offScale(100), false);
});

test('a hotter liquid puts the column higher up the drawn scale', () => {
  const g = thermometerGeometry(150);
  assert.ok(yFor(g, 100) < yFor(g, 25), 'higher on screen means a smaller y');
  assert.equal(yFor(g, SCALE_MIN_C), g.scaleBottom);
  assert.equal(yFor(g, SCALE_MAX_C), g.scaleTop);
});

test('the glass and scale draw as self-contained SVG with the figures 0 to 100', () => {
  const svg = thermometerSvg(150);
  assert.match(svg, /^<svg [^>]*>.*<\/svg>$/s);
  assert.doesNotMatch(svg, /NaN|undefined|href=|https?:/);
  for (const figure of ['0', '20', '100']) assert.match(svg, new RegExp(`>${figure}<`));
});

/**
 * liquid-colour.test.js — clarity and depth of colour (BUILD_UI.md UI.3.2).
 *
 * The rules that matter to a student: a clear solution lets the bench show
 * through and a milky one does not; the same solution looks deeper through
 * a wide beaker than through a narrow tube; and depth never changes what
 * colour it is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liquidFill, parseHex, REFERENCE_PATH_PX, __internal } from '../src/ui/liquid-colour.js';
import { liquidPathPx } from '../src/ui/glassware.js';

const BLUE = '#1F6FB2'; // copper(II) sulfate
const COLOURLESS = '#EEF3F5';

function read(css) {
  const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(css);
  assert.ok(m, `not a colour: ${css}`);
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}
const lightness = ({ r, g, b }) => (Math.max(r, g, b) + Math.min(r, g, b)) / 2;

test('a clear solution shows what is behind it; a milky one hardly does; opaque not at all', () => {
  const clear = read(liquidFill(BLUE, { clarity: 'clear' }));
  const cloudy = read(liquidFill(BLUE, { clarity: 'cloudy' }));
  const milky = read(liquidFill(BLUE, { clarity: 'milky' }));
  const opaque = read(liquidFill(BLUE, { clarity: 'opaque' }));
  assert.ok(clear.a < 1, 'a clear solution must be see-through');
  assert.ok(clear.a <= cloudy.a && cloudy.a <= milky.a && milky.a <= opaque.a);
  assert.equal(opaque.a, 1);
  assert.ok(lightness(milky) > lightness(clear), 'scattering lightens the colour');
});

test('water looks like water in any glass', () => {
  const thin = read(liquidFill(COLOURLESS, { pathPx: 15 }));
  const wide = read(liquidFill(COLOURLESS, { pathPx: 90 }));
  assert.deepEqual(thin, wide);
  assert.ok(thin.a < 0.4);
});

test('the same solution is deeper through a wide beaker than a narrow tube', () => {
  const tube = read(liquidFill(BLUE, { pathPx: liquidPathPx('test_tube', 20, 10) }));
  const beaker = read(liquidFill(BLUE, { pathPx: liquidPathPx('beaker', 250, 100) }));
  assert.ok(lightness(beaker) < lightness(tube), 'the beaker should look darker');
  assert.ok(beaker.a >= tube.a, 'and let less of the bench through');
});

test('depth never changes the hue, so the drawing never contradicts its label', () => {
  for (const hex of ['#1F6FB2', '#8E1B1B', '#F2CC0C', '#7B3FA0', '#2E8B57']) {
    const hue = __internal.toHsl(parseHex(hex)).h;
    for (const pathPx of [10, 30, 60, 120]) {
      const drawn = read(liquidFill(hex, { pathPx }));
      const h = __internal.toHsl(drawn).h;
      const gap = Math.min(Math.abs(h - hue), 1 - Math.abs(h - hue));
      assert.ok(gap < 0.02, `${hex} at ${pathPx}px drifted in hue`);
    }
  }
});

test('the reference path draws the curated colour unchanged', () => {
  const drawn = read(liquidFill(BLUE, { pathPx: REFERENCE_PATH_PX }));
  const curated = parseHex(BLUE);
  for (const c of ['r', 'g', 'b']) assert.ok(Math.abs(drawn[c] - curated[c]) <= 2);
});

test('the path through a vessel follows its real inside width', () => {
  assert.ok(liquidPathPx('beaker', 250, 100) > liquidPathPx('test_tube', 20, 10));
  // A conical flask is widest at the bottom, so a little liquid is a long path.
  assert.ok(liquidPathPx('flask', 250, 20) > liquidPathPx('flask', 250, 240));
  assert.equal(liquidPathPx('beaker', 250, 0), null);
});

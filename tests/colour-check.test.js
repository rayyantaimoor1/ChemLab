/**
 * colour-check.test.js — proves the validator's colour check (BUILD_PHASE_2.md
 * stage 2.1.2) catches a colour name that contradicts its hex code, without
 * crying wolf over the ordinary variety of real colour names.
 *
 * Run them with:  npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { checkColourName } from '../scripts/lib/colour-check.mjs';

const levels = (name, hex) => checkColourName(name, hex).map((f) => f.level);

test('a hue that contradicts the name is an error', () => {
  assert.deepEqual(levels('blue', '#B33A3A'), ['error']);
  assert.deepEqual(levels('pale green', '#E8A0B4'), ['error']);
  assert.deepEqual(levels('yellow', '#1F6FB2'), ['error']);
});

test('a neutral name on a strongly coloured hex is an error', () => {
  assert.ok(levels('white', '#1F6FB2').includes('error'));
  assert.ok(levels('silvery grey', '#D4453B').includes('error'));
});

test('matching names pass cleanly', () => {
  for (const [name, hex] of [
    ['blue', '#1F6FB2'],
    ['blood red', '#8E1B1B'],
    ['apple green', '#7FB069'],
    ['blue-green', '#59A6A0'],
    ['reddish brown', '#A0522D'],
    ['buff pink', '#E8C4A0'],
    ['canary yellow', '#F5D000'],
    ['lilac', '#B57EDC'],
    ['milky white', '#F4F6F3'],
    ['colourless', '#EEF3F5'],
    ['purplish black', '#3A1F3D'],
    ['silvery grey', '#C4C6C8'],
  ]) {
    assert.deepEqual(checkColourName(name, hex), [], `${name} ${hex}`);
  }
});

test('a hue word on a nearly grey hex is not an error', () => {
  // Faintly tinted greys are fairly called by their tint.
  assert.deepEqual(levels('pale cream', '#E4DACB'), []);
  assert.deepEqual(levels('bluish-grey', '#BFC3C6'), []);
});

test('shade words that do not fit are warnings, not errors', () => {
  assert.deepEqual(levels('pale blue', '#1B3F94'), ['warning']);
  assert.deepEqual(levels('dark green', '#C7E0C0'), ['warning']);
  assert.deepEqual(levels('black', '#8A8A85'), ['warning']);
  assert.deepEqual(levels('white', '#6E6F71'), ['warning']);
});

test('an unknown colour word is a warning, so it gets added rather than skipped', () => {
  assert.deepEqual(levels('vermilion', '#E34234'), ['warning']);
  assert.deepEqual(levels('bright vermilion red', '#E34234'), ['warning']);
});

/**
 * sound.test.js — the lab's sounds (BUILD_UI.md UI.9).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIZZ, fizzFor, pourSeconds, playSound, soundEnabled, setSoundEnabled } from '../src/ui/sound.js';

test('sound is off until it is turned on, and nothing plays while it is off', () => {
  assert.equal(soundEnabled(), false);
  assert.equal(playSound('clink'), false);
  assert.equal(playSound('hazard'), false);
});

test('the fizz follows the curated gas rate: louder and busier the faster the gas', () => {
  assert.ok(fizzFor('vigorous').gain > fizzFor('steady').gain);
  assert.ok(fizzFor('steady').gain > fizzFor('slow').gain);
  assert.ok(fizzFor('vigorous').popsPerSecond > fizzFor('slow').popsPerSecond);
  assert.deepEqual(fizzFor(null), FIZZ.steady, 'no rate on record is the steady middle');
});

test('a bigger pour sounds longer, within limits', () => {
  assert.ok(pourSeconds(25) > pourSeconds(5));
  assert.ok(pourSeconds(0.05) >= 0.35);
  assert.ok(pourSeconds(500) <= 1.2);
});

test('with no audio engine (as in these tests) turning sound on still plays nothing, quietly', () => {
  setSoundEnabled(true);
  assert.equal(playSound('clink'), false);
  setSoundEnabled(false);
});

/**
 * perf.test.js — the frame meter and the effects tier (BUILD_UI.md UI.10.1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrameMeter, createTierGovernor, effectsScale, LOW_FPS, HOLD_MS } from '../src/ui/perf.js';

test('the meter reads frames a second and the time between frames', () => {
  const meter = createFrameMeter(1000);
  for (let t = 0; t <= 1000; t += 20) meter.tick(t);
  assert.equal(Math.round(meter.fps()), 50);
  assert.equal(meter.frameMs(), 20);
});

test('auto stays full while the bench keeps up', () => {
  const g = createTierGovernor();
  for (let t = 0; t <= 5000; t += 100) assert.equal(g.update(t, 58), 'full');
});

test(`auto drops to low only after ${HOLD_MS} ms below ${LOW_FPS} fps`, () => {
  const g = createTierGovernor();
  assert.equal(g.update(0, 22), 'full');
  assert.equal(g.update(1500, 22), 'full');
  assert.equal(g.update(1900, 40), 'full', 'a recovery resets the clock');
  assert.equal(g.update(2000, 22), 'full');
  assert.equal(g.update(4100, 22), 'low');
  assert.equal(g.update(6000, 60), 'low', 'once low it stays low, so it does not flicker');
});

test('a hidden window does not count as slow', () => {
  const g = createTierGovernor();
  g.update(0, 20);
  g.pause();
  assert.equal(g.update(2500, 20), 'full');
});

test('a teacher can force either tier', () => {
  const g = createTierGovernor();
  g.setMode('full');
  assert.equal(g.update(10000, 5), 'full');
  g.setMode('low');
  assert.equal(g.update(0, 60), 'low');
  g.setMode('auto');
  assert.equal(g.update(0, 60), 'full');
});

test('the low tier draws half the particles', () => {
  assert.equal(effectsScale('full'), 1);
  assert.equal(effectsScale('low'), 0.5);
});

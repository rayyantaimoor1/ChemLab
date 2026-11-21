/**
 * held-tube.test.js — a tube heated in the flame is held at an angle, and
 * its liquid stays level (BUILD_UI.md UI.6.1, UI.10.4).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heldInFlame, levelLiquid, leanFor, HELD_TUBE } from '../src/ui/held-tube.js';
import { glassGeometry } from '../src/ui/glassware.js';

test('a test tube or boiling tube on a burner is held in the flame', () => {
  assert.equal(heldInFlame('test_tube', 'burner'), true);
  assert.equal(heldInFlame('boiling_tube', 'burner'), true);
});

test('a beaker on a burner still stands on the gauze, and a tube elsewhere stands upright', () => {
  assert.equal(heldInFlame('beaker_250', 'burner'), false);
  assert.equal(heldInFlame('test_tube', 'water_bath'), false);
  assert.equal(heldInFlame('test_tube', 'rack'), false);
  assert.equal(heldInFlame('test_tube', undefined), false);
});

test('held at about 45°, as a tube is held in a flame', () => {
  assert.equal(Math.abs(HELD_TUBE.angleDeg), 45);
});

test('the liquid pivots at its own upright surface, so its volume is kept', () => {
  const g = glassGeometry('boiling_tube', 55);
  const level = levelLiquid(g, 10);
  assert.equal(level.top, g.surfaceY(10));
  assert.equal(level.rotateDeg, -HELD_TUBE.angleDeg, 'turned back by exactly the tilt');
  assert.ok(level.bottom <= -g.h && level.left <= -g.w && level.right <= -g.w, 'reaches past the glass on every side');
});

test('the level line across a tilted tube is longer than the tube is wide', () => {
  const g = glassGeometry('test_tube', 20);
  const level = levelLiquid(g, 5);
  const across = 2 * g.innerHalfAt(level.top);
  assert.ok(Math.abs(level.surfaceWidth - across / Math.cos(Math.PI / 4)) < 1e-9);
});

test('a tube leans left when that side is clear, else right', () => {
  // A 150 px tube reaches about 106 px sideways at 45°.
  assert.equal(leanFor(300, 28, 150, 0, 700), -45, 'room on the left: leans left');
  assert.equal(leanFor(20, 28, 150, 0, 700), 45, 'by the left edge: leans right');
});

test('a tube does not lean into its neighbour', () => {
  // Another object's right side 40 px to the left: lean right, away from it.
  assert.equal(leanFor(300, 28, 150, 260, 700), 45);
  // Hemmed in on both sides: the side with more room.
  assert.equal(leanFor(300, 28, 150, 240, 380), -45);
  assert.equal(leanFor(300, 28, 150, 290, 420), 45);
});

test('the level is turned back by whichever way the tube leans', () => {
  const g = glassGeometry('test_tube', 20);
  assert.equal(levelLiquid(g, 5, 45).rotateDeg, -45);
  assert.equal(levelLiquid(g, 5, -45).rotateDeg, 45);
});

test('an empty tube has no liquid to level', () => {
  assert.equal(levelLiquid(glassGeometry('test_tube', 20), 0), null);
});

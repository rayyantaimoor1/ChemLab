/**
 * stand.test.js — the retort stand's geometry (BUILD_UI.md UI.6.1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAND, CLAMPED_TYPES, baseTopY, basePosition, clampPosition } from '../src/ui/stand.js';

const burette = { type: 'burette', w: 34, h: 200 };
const flask = { type: 'flask', w: 94, h: 160 };

test('the clamp grips burettes and tubes; flasks and beakers stand on the base', () => {
  assert.ok(CLAMPED_TYPES.has('burette'));
  assert.ok(CLAMPED_TYPES.has('test_tube'));
  assert.ok(!CLAMPED_TYPES.has('flask'));
  assert.ok(!CLAMPED_TYPES.has('beaker'));
});

test('a white tile raises what stands on the base by its own thickness', () => {
  assert.equal(baseTopY(false) - baseTopY(true), STAND.tileH);
  const onTile = basePosition(flask, true);
  assert.equal(onTile.y + flask.h, baseTopY(true));
});

test('the flask stands centred under the clamp', () => {
  const at = basePosition(flask, false);
  assert.equal(at.x + flask.w / 2, STAND.clampX);
});

test("a burette over a flask has its tip just inside the flask's mouth", () => {
  const held = clampPosition(burette, flask, true);
  const tip = held.y + burette.h;
  const mouth = baseTopY(true) - flask.h;
  assert.equal(tip - mouth, 8);
  assert.equal(held.x + burette.w / 2, STAND.clampX, 'directly above the flask');
  assert.ok(held.gripY > held.y && held.gripY < tip, 'the jaws grip the burette itself');
});

test('a burette with nothing under it is held clear of the base', () => {
  const held = clampPosition(burette, null, false);
  assert.ok(baseTopY(false) - (held.y + burette.h) >= 100);
});

test('a 100 mL flask under a 50 mL burette fits within the stand; a 250 mL one reaches above it', () => {
  const small = { type: 'flask_small', w: 70, h: 116 };
  assert.ok(clampPosition(burette, small, true).y >= 0);
  assert.ok(clampPosition(burette, flask, true).y < 0, 'the burette rises past the top of the rod');
});

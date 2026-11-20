/**
 * pour-path.test.js — how a pour looks (BUILD_UI.md UI.6.2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POUR, tiltAngleFor, pourPath } from '../src/ui/pour-path.js';

const target = { x: 300, y: 200, w: 55, h: 77 };
const base = { target, targetSurfaceY: 260, mouthHalfW: 26, fraction: 0.5 };

test('a fuller vessel needs less tipping before it pours', () => {
  assert.ok(tiltAngleFor(1) < tiltAngleFor(0.5));
  assert.ok(tiltAngleFor(0.5) < tiltAngleFor(0.05));
  assert.equal(tiltAngleFor(1), 30);
  assert.ok(tiltAngleFor(0) <= 85);
});

test('from the left, the source tips clockwise about its top-right corner, its lip over the mouth', () => {
  const p = pourPath({ ...base, source: { x: 100, y: 220, w: 55, h: 77 } });
  assert.equal(p.side, 'left');
  assert.equal(p.origin, '100% 0%');
  assert.ok(p.angle > 0);
  assert.equal(p.sourceAt.x + 55, p.lip.x, 'the corner is at the lip');
  assert.ok(p.lip.x > target.x && p.lip.x < target.x + target.w / 2, 'over the near half of the mouth');
});

test('from the right, it tips the other way about its top-left corner', () => {
  const p = pourPath({ ...base, source: { x: 500, y: 220, w: 55, h: 77 } });
  assert.equal(p.side, 'right');
  assert.equal(p.origin, '0% 0%');
  assert.ok(p.angle < 0);
  assert.equal(p.sourceAt.x, p.lip.x);
  assert.ok(p.lip.x > target.x + target.w / 2 && p.lip.x < target.x + target.w);
});

test('the lip is never below the rim, and the stream lands on the liquid surface', () => {
  const p = pourPath({ ...base, source: { x: 100, y: 220, w: 55, h: 77 }, releaseLipY: 400 });
  assert.ok(p.lip.y <= target.y - 6);
  assert.equal(p.landing.y, 260);
  assert.match(p.path, /^M \d+ \d+ Q \d+ \d+ \d+ \d+$/);
});

test('pouring from too high splashes; from just above the rim it does not', () => {
  const close = pourPath({ ...base, source: { x: 100, y: 220, w: 55, h: 77 } });
  assert.equal(close.splash, false);
  const high = pourPath({ ...base, source: { x: 100, y: 0, w: 55, h: 77 }, releaseLipY: target.y - POUR.splashGapPx - 30 });
  assert.equal(high.splash, true);
});

/**
 * meniscus.test.js — reading at eye level, and parallax (BUILD_UI.md UI.7.2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glassGeometry } from '../src/ui/glassware.js';
import { readingFor, readingNote, parallaxShiftPx, volumeAtY, lensSvg } from '../src/ui/meniscus.js';

const burette = glassGeometry('burette', 50);
const cylinder = glassGeometry('cylinder', 100);

test('volumeAtY undoes surfaceY', () => {
  for (const v of [5, 12.5, 30, 47]) {
    assert.ok(Math.abs(volumeAtY(burette, 50, burette.surfaceY(v)) - v) < 0.01);
  }
});

test('a burette reading at eye level matches the volume within its precision', () => {
  // 9.95 mL left in a 50 mL burette: 40.05 mL has run out.
  const r = readingFor('burette', burette, 50, 9.95, 'level');
  assert.equal(r.text, '40.05 mL');
  assert.equal(r.readTo, 0.05);
  assert.equal(r.error, 0);
  for (const v of [1.3, 17.85, 33.2, 49.95]) {
    const reading = readingFor('burette', burette, 50, v, 'level');
    assert.ok(Math.abs(reading.value - (50 - v)) <= 0.05 / 2 + 1e-9, `${v} mL left`);
  }
});

test('from above, a burette reads too low and a measuring cylinder too high', () => {
  assert.ok(readingFor('burette', burette, 50, 20, 'above').error < 0);
  assert.ok(readingFor('cylinder', cylinder, 100, 40, 'above').error > 0);
});

test('from below, the other way round', () => {
  assert.ok(readingFor('burette', burette, 50, 20, 'below').error > 0);
  assert.ok(readingFor('cylinder', cylinder, 100, 40, 'below').error < 0);
});

test('at eye level there is no shift; above and below shift equally and oppositely', () => {
  assert.equal(parallaxShiftPx(burette, 20, 'level'), 0);
  assert.ok(parallaxShiftPx(burette, 20, 'above') < 0);
  assert.equal(parallaxShiftPx(burette, 20, 'above'), -parallaxShiftPx(burette, 20, 'below'));
});

test('a cylinder is read to 0.5 mL; a beaker is only approximate; a test tube has no scale', () => {
  assert.equal(readingFor('cylinder', cylinder, 100, 37.2, 'level').text, '37.0 mL');
  assert.equal(readingFor('beaker_small', glassGeometry('beaker_small', 100), 100, 20, 'level').approximate, true);
  assert.equal(readingFor('test_tube', glassGeometry('test_tube', 20), 20, 5, 'level'), null);
});

test('the label says why you read at eye level', () => {
  assert.match(readingNote('burette', 'above'), /too low/);
  assert.match(readingNote('cylinder', 'above'), /too high/);
  assert.match(readingNote('burette', 'level'), /eye level/i);
});

test('the lens draws the scale, the curved surface and the parallax shift', () => {
  const level = lensSvg({ type: 'burette', geometry: burette, capacityMl: 50, volumeMl: 9.95, eye: 'level' });
  const above = lensSvg({ type: 'burette', geometry: burette, capacityMl: 50, volumeMl: 9.95, eye: 'above' });
  assert.match(level, /<text[^>]*>40<\/text>/);
  assert.match(level, /translate\(0 0\.00\)/);
  assert.doesNotMatch(above, /translate\(0 0\.00\)/);
});

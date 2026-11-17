/**
 * glassware.test.js — the drawn glassware tells the truth about volume
 * (BUILD_UI.md UI.2).
 *
 * The one promise that matters: liquid of volume V sits exactly on the
 * vessel's own printed V mark. If that broke, a student reading the scale
 * would read a different volume from the one in the notebook.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLASSWARE, LATER_GLASSWARE, glassGeometry, liquidFraction, frontSvg, backSvg } from '../src/ui/glassware.js';

// The capacities the apparatus tray gives each vessel (src/ui/app.js).
const CAPACITY = {
  beaker: 250, beaker_small: 100, flask: 250, flask_small: 100, test_tube: 20,
  boiling_tube: 55, cylinder: 100, burette: 50, dish: 60,
};

test('every vessel on the apparatus tray has a drawing', () => {
  assert.deepEqual(Object.keys(GLASSWARE).sort(), Object.keys(CAPACITY).sort());
});

test('liquid rises steadily as volume is added, and never past the rim', () => {
  for (const [type, capacity] of Object.entries(CAPACITY)) {
    const g = glassGeometry(type, capacity);
    let previous = Infinity;
    for (let k = 1; k <= 40; k += 1) {
      const y = g.surfaceY((capacity * k) / 40);
      assert.ok(y <= previous + 1e-9, `${type}: the level fell when liquid was added`);
      assert.ok(y > 0, `${type}: a full vessel is drawn up to or over its rim`);
      previous = y;
    }
    assert.equal(g.surfaceY(0), null, `${type}: an empty vessel has no surface`);
    assert.equal(liquidFraction(type, capacity, 0), 0);
  }
});

test('the liquid sits on the printed mark for its volume', () => {
  for (const [type, capacity] of Object.entries(CAPACITY)) {
    const g = glassGeometry(type, capacity);
    for (const mark of g.graduations) {
      // mark.volume is what the vessel holds when the level is on that line
      // (on a burette, the printed figure is the volume run OUT instead).
      const contents = mark.volume;
      if (type === 'burette' && mark.label !== null) assert.equal(contents, capacity - Number(mark.label));
      const y = g.surfaceY(contents);
      if (y === null) continue;
      assert.ok(Math.abs(y - mark.y) < 0.6, `${type}: ${contents} mL drawn at ${y}, its mark at ${mark.y}`);
    }
  }
});

test('a burette reads 0 full and 50 empty, from the top down', () => {
  const g = glassGeometry('burette', 50);
  const zero = g.graduations.find((m) => m.label === '0');
  const fifty = g.graduations.find((m) => m.label === '50');
  assert.ok(zero && fifty, 'both ends of the scale are numbered');
  assert.ok(zero.y < fifty.y, '0 is at the top');
  assert.ok(Math.abs(g.surfaceY(50) - zero.y) < 0.01, 'a full burette reads 0');
});

test('a conical flask fills slowly across its base and quickly up its cone', () => {
  const g = glassGeometry('flask', 250);
  const bottom = g.surfaceY(0.001);
  const firstFifty = bottom - g.surfaceY(50);
  const lastFifty = g.surfaceY(200) - g.surfaceY(250);
  assert.ok(lastFifty > firstFifty * 1.5, `first 50 mL rose ${firstFifty}px, last 50 mL ${lastFifty}px`);
});

test('printed lines are far enough apart to be seen', () => {
  for (const [type, capacity] of Object.entries(CAPACITY)) {
    const marks = glassGeometry(type, capacity).graduations;
    for (let i = 1; i < marks.length; i += 1) {
      assert.ok(Math.abs(marks[i].y - marks[i - 1].y) >= 2.9, `${type}: lines ${marks[i - 1].label}/${marks[i].label} merge`);
    }
  }
});

test('test tubes and dishes carry no scale; measuring glass does', () => {
  for (const type of ['test_tube', 'boiling_tube', 'dish']) {
    assert.equal(glassGeometry(type, CAPACITY[type]).graduations.length, 0, type);
  }
  for (const type of ['beaker', 'flask', 'cylinder', 'burette']) {
    assert.ok(glassGeometry(type, CAPACITY[type]).graduations.some((m) => m.label), type);
  }
});

test('a little liquid is still drawn a few pixels deep', () => {
  const g = glassGeometry('beaker', 250);
  assert.ok(g.floorY - g.surfaceY(1) >= 4);
});

test('every drawing is valid, self-contained SVG with no external references', () => {
  const all = { ...CAPACITY, ...Object.fromEntries(Object.keys(LATER_GLASSWARE).map((k) => [k, 250])) };
  for (const [type, capacity] of Object.entries(all)) {
    for (const svg of [frontSvg(type, capacity), backSvg(type, capacity)]) {
      assert.match(svg, /^<svg [^>]*>.*<\/svg>$/s, type);
      assert.doesNotMatch(svg, /NaN|undefined|href=|https?:/, type);
    }
  }
});

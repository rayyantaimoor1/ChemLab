/**
 * heat-look.test.js — what heat visibly does (BUILD_UI.md UI.4.2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/core/engine.js';
import { heatLookFor } from '../src/ui/heat-look.js';

const engine = createEngine();
const look = (contents, temperatureC, heatLevel) => heatLookFor({
  speciesIds: contents.map((c) => c.id), contents, temperatureC, heatLevel,
}, engine);
const water = [{ id: 'water_distilled', amount: 20, unit: 'mL' }];

test('water on a flame: still, then convection, then bubbles forming, then a rolling boil at 100 °C', () => {
  assert.equal(look(water, 25, 3).stage, 'still');
  assert.equal(look(water, 50, 3).stage, 'warming');
  assert.equal(look(water, 90, 3).stage, 'nucleating');
  const boiling = look(water, 100, 3);
  assert.equal(boiling.stage, 'boiling');
  assert.equal(boiling.boilingPointC, 100);
  assert.equal(boiling.steam, true);
});

test('each liquid boils at its own curated boiling point', () => {
  const ethanol = [{ id: 'c2h5oh_aq', amount: 10, unit: 'mL' }];
  assert.equal(look(ethanol, 79, 2).stage, 'boiling');
  assert.notEqual(look(water, 79, 2).stage, 'boiling');
});

test('nothing boils without heat going in - a volatile liquid on the bench only evaporates', () => {
  // Ethanal boils at 20 °C, below the app's room temperature.
  const ethanal = look([{ id: 'ch3cho_l', amount: 5, unit: 'mL' }], 25, 0);
  assert.equal(ethanal.stage, 'evaporating');
  assert.equal(look(water, 100, 0).stage, 'evaporating', 'water just off the flame steams');
});

test('vapour driven off a heated solid condenses on the cool glass above', () => {
  // Blue copper sulfate heated: the water comes off and settles as droplets.
  const dehydrated = look([{ id: 'cuso4_anhydrous_s', amount: 5, unit: 'g' }, { id: 'water', amount: 1, unit: 'g' }], 210, 3);
  assert.equal(dehydrated.condensation.id, 'water');
  // Mercury(II) oxide heated: silvery mercury condenses.
  const mercury = look([{ id: 'hg_l', amount: 2, unit: 'g' }, { id: 'o2_g', amount: 1, unit: 'g' }], 500, 3);
  assert.equal(mercury.condensation.id, 'hg_l');
  // Mercury below its boiling point does not.
  assert.equal(look([{ id: 'hg_l', amount: 2, unit: 'g' }], 200, 3).condensation, null);
});

test('a liquid with no boiling point on record never boils', () => {
  const adipoyl = look([{ id: 'adipoyl_cl_l', amount: 5, unit: 'mL' }], 300, 3);
  assert.equal(adipoyl.stage, 'still');
  assert.equal(adipoyl.boilingPointC, null);
});

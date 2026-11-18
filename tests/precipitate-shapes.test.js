/**
 * precipitate-shapes.test.js — a reaction's solid drawn by its curated
 * texture, placed by its curated kind (BUILD_UI.md UI.3.4).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import chemicals from '../src/data/chemicals.json' with { type: 'json' };
import { createEngine } from '../src/core/engine.js';
import { rememberReaction, appearanceFor } from '../src/ui/appearance.js';
import {
  TEXTURES, textureOf, hazeOpacity, formingStyle, settledBox, settledSvg, smokeSvg,
} from '../src/ui/precipitate-shapes.js';

const engine = createEngine();

test('every texture a chemical can have has a drawing', () => {
  for (const c of chemicals.filter((x) => x.texture)) {
    assert.ok(TEXTURES.includes(c.texture), `${c.id}: no drawing for "${c.texture}"`);
  }
});

test('every texture, and a pool and smoke, draw as self-contained SVG', () => {
  const svgs = [
    ...TEXTURES.map((texture) => settledSvg({ id: 'x', texture, colorHex: '#F2CC0C' }, settledBox({ texture }, 60, 50))),
    settledSvg({ id: 'hg', kind: 'liquid', colorHex: '#C8CCD0' }, settledBox({ kind: 'liquid' }, 40, 30)),
    smokeSvg({ id: 'nh4cl_s', kind: 'smoke', colorHex: '#F4F4F4' }, 60),
  ];
  for (const svg of svgs) {
    assert.match(svg, /^<svg [^>]*>.*<\/svg>$/s);
    assert.doesNotMatch(svg, /NaN|undefined|Infinity|href=|https?:/);
  }
});

test('a solid with no texture is drawn plainly, and a deposit as metal', () => {
  assert.equal(textureOf({ texture: null }), 'fine');
  assert.equal(textureOf({ kind: 'deposit', texture: 'crystalline' }), 'metallic');
});

test('fine particles leave the liquid hazy; crystals drop straight out', () => {
  assert.ok(hazeOpacity({ texture: 'fine' }) > hazeOpacity({ texture: 'curdy' }));
  assert.equal(hazeOpacity({ texture: 'crystalline' }), 0);
  assert.equal(hazeOpacity({ texture: 'fine', kind: 'smoke' }), 0, 'smoke is above, not in, the liquid');
});

test('crystals settle fast, fine particles slowly, and a floc forms in place', () => {
  assert.ok(formingStyle({ texture: 'crystalline' }).duration < formingStyle({ texture: 'fine' }).duration);
  assert.equal(formingStyle({ texture: 'gelatinous' }).fall, false);
  assert.equal(formingStyle({ texture: 'curdy' }).fall, true);
});

test('a gelatinous floc fills much of the liquid; a fine layer is thin', () => {
  assert.ok(settledBox({ texture: 'gelatinous' }, 60, 60).h > settledBox({ texture: 'fine' }, 60, 60).h * 3);
});

test('the solid a reaction leaves carries its curated texture', () => {
  const rule = engine.getReaction('rxn_precipitation_pbno3_ki');
  const result = engine.react(rule.reactants, {});
  const memory = rememberReaction(undefined, result, result.species, engine);
  const look = appearanceFor({ speciesIds: result.species, temperatureC: 25, heatLevel: 0, electrified: false }, memory, engine);
  assert.equal(look.precipitate.id, 'pbi2_s');
  assert.equal(look.precipitate.texture, 'crystalline');
});

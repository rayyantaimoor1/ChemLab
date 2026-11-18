/**
 * appearance.test.js — the bench never disagrees with the notebook
 * (BUILD_UI.md stage UI.1, rule 1).
 *
 * For every reaction in tests/golden/notebook-sentences.json — the approved
 * sentence a student reads — this runs the reaction with its conditions
 * met, builds the vessel's appearance exactly as the bench does
 * (src/ui/appearance.js), and checks the two agree:
 *   - the notebook says "The mixture turned X"  →  the vessel is labelled X;
 *   - the notebook says a solid formed           →  the vessel shows a solid;
 *   - the reaction has a curated colour           →  the vessel names it.
 *
 * Before UI.1 none of the first kind passed for any mixture: every vessel
 * holding two or more substances was drawn grey, "colour not known".
 *
 * Run them with:  npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createEngine, ROOM_TEMPERATURE_C } from '../src/core/engine.js';
import { appearanceFor, rememberReaction } from '../src/ui/appearance.js';

const golden = JSON.parse(readFileSync(new URL('./golden/notebook-sentences.json', import.meta.url), 'utf8'));
const engine = createEngine();

const SOLID_OPENINGS = /(A precipitate formed|A deposit formed|A coating formed|A liquid formed|A solid formed in the air|Left in the vessel): /;

/** Runs a rule with its conditions met, as the golden snapshot does. */
function runRule(reaction) {
  const c = reaction.conditions || {};
  const tempC = typeof c.minTempC === 'number'
    ? c.minTempC
    : typeof c.maxTempC === 'number' && c.maxTempC < ROOM_TEMPERATURE_C ? c.maxTempC : ROOM_TEMPERATURE_C;
  const options = {
    tempC,
    heating: c.requiresHeat === true || typeof c.minTempC === 'number',
    electrified: c.requiresElectricity === true,
  };
  const result = engine.react([...reaction.reactants, ...(c.catalyst ? [c.catalyst] : [])], options);
  const memory = rememberReaction(undefined, result, result.species, engine);
  const snapshot = {
    speciesIds: result.species,
    temperatureC: result.tempC,
    heatLevel: options.heating ? 2 : 0,
    electrified: options.electrified,
  };
  return { result, look: appearanceFor(snapshot, memory, engine) };
}

const reacting = engine.getAllReactions().filter((r) => !r.noReaction && golden[r.id]?.outcome === 'reaction');

test('every colour the notebook says the mixture turned is the colour the vessel is labelled', () => {
  const disagreements = [];
  for (const reaction of reacting) {
    const turned = golden[reaction.id].sentence.match(/The mixture turned ([^.]+)\./g) || [];
    if (turned.length === 0) continue;
    // A cascade can turn more than once; the vessel ends on the last one.
    const last = turned[turned.length - 1].replace(/^The mixture turned /, '').replace(/\.$/, '');
    const { look } = runRule(reaction);
    if (look.colorName !== last) disagreements.push(`${reaction.id}: notebook "${last}", vessel "${look.colorName}"`);
  }
  assert.deepEqual(disagreements, []);
});

test('every solid the notebook says formed is shown in the vessel', () => {
  const missing = [];
  for (const reaction of reacting) {
    if (!SOLID_OPENINGS.test(golden[reaction.id].sentence)) continue;
    const { look } = runRule(reaction);
    if (!look.precipitate) missing.push(reaction.id);
  }
  assert.deepEqual(missing, []);
});

test('a reaction with a curated colour never leaves the vessel "colour not known"', () => {
  const unnamed = [];
  for (const reaction of reacting) {
    if (!reaction.effects?.colorToHex) continue;
    const { look } = runRule(reaction);
    if (!look.colorName) unnamed.push(reaction.id);
  }
  assert.deepEqual(unnamed, []);
});

test('the four results that used to show grey now show their colours', () => {
  const nameOf = (id) => runRule(engine.getReaction(id)).look.colorName;
  assert.equal(nameOf('rxn_test_fe3_thiocyanate'), 'blood red');
  assert.equal(nameOf('rxn_fehlings_glucose'), 'brick red');
  assert.equal(nameOf('rxn_complex_cu_ammonia'), 'deep blue');
  assert.equal(nameOf('rxn_starch_iodine'), 'blue-black');
});

test('a mixture nothing describes stays honestly unknown, and an empty vessel is empty', () => {
  const unknown = appearanceFor({ speciesIds: ['hcl_1m', 'phenolphthalein_1pct'], temperatureC: 25, heatLevel: 0, electrified: false }, undefined, engine);
  assert.equal(unknown.colorName, null);
  const empty = appearanceFor({ speciesIds: [], temperatureC: 25, heatLevel: 0, electrified: false }, undefined, engine);
  assert.equal(empty.colorName, 'colourless');
  assert.equal(empty.precipitate, null);
});

test('two colourless solutions the data says do nothing stay colourless', () => {
  const none = engine.getAllReactions().find((r) => r.id === 'rxn_none_nacl_ki');
  const look = appearanceFor({ speciesIds: none.reactants, temperatureC: 25, heatLevel: 0, electrified: false }, undefined, engine);
  assert.equal(look.colorName, 'colourless');
});

test('adding something new after a reaction drops the remembered colour', () => {
  const { result } = runRule(engine.getReaction('rxn_test_fe3_thiocyanate'));
  const memory = rememberReaction(undefined, result, result.species, engine);
  const look = appearanceFor({ speciesIds: [...result.species, 'phenolphthalein_1pct'], temperatureC: 25, heatLevel: 0, electrified: false }, memory, engine);
  assert.equal(look.colorName, null);
});

// ---- Clarity (BUILD_UI.md UI.3.2) ----

const look = (speciesIds) => appearanceFor({ speciesIds, temperatureC: 25, heatLevel: 0, electrified: false }, undefined, engine);

test('a vessel is as clear as the least clear liquid in it', () => {
  assert.equal(look(['hcl_1m']).clarity, 'clear');
  assert.equal(look(['starch_aq']).clarity, 'cloudy');
  assert.equal(look(['latex_aq']).clarity, 'milky');
  assert.equal(look(['hcl_1m', 'latex_aq']).clarity, 'milky', 'one milky liquid makes the mixture milky');
  assert.equal(look([]).clarity, null, 'an empty vessel has no liquid to be clear or not');
});

test('solids and gases do not decide clarity - only liquids do', () => {
  assert.equal(look(['zn_metal']).clarity, null, 'a dry solid has no liquid');
  assert.equal(look(['zn_metal', 'hcl_1m']).clarity, 'clear');
});

test('the starch–iodine result is opaque, as its curated clarity says', () => {
  const rule = engine.getAllReactions().find((r) => (r.products || []).includes('starch_iodine_aq'));
  assert.ok(rule, 'a rule makes the starch–iodine complex');
  assert.equal(runRule(rule).look.clarity, 'opaque');
});

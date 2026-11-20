/**
 * appearance-fields.test.js — the curated words the bench draws from
 * (BUILD_UI.md stage UI.3).
 *
 * clarity, form and texture say what a substance LOOKS like: a milky
 * liquid, a ribbon, a gelatinous floc. They are curated in chemicals.json
 * batch by batch, never worked out from a formula. These tests hold the
 * words to the fixed lists (the same lists the validator uses) and keep
 * each word on the kind of substance it describes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import chemicals from '../src/data/chemicals.json' with { type: 'json' };
import reactions from '../src/data/reactions.json' with { type: 'json' };

const madeByAReaction = new Set(reactions.flatMap((r) => r.products || []));

const RULES = {
  clarity: {
    words: ['clear', 'cloudy', 'milky', 'opaque'],
    appliesTo: (c) => c.state === 'aqueous' || c.state === 'liquid',
  },
  form: {
    words: ['ribbon', 'granules', 'powder', 'chips', 'crystals', 'pellets', 'lump', 'wire', 'filings', 'turnings', 'foil', 'cloth'],
    appliesTo: (c) => c.state === 'solid' && c.onShelf === true,
  },
  texture: {
    words: ['fine', 'crystalline', 'gelatinous', 'curdy', 'metallic', 'flaky', 'lumpy', 'fibrous'],
    appliesTo: (c) => c.state === 'solid' && madeByAReaction.has(c.id),
  },
};

for (const [field, rule] of Object.entries(RULES)) {
  test(`every ${field} is one of the fixed words, on the right kind of substance`, () => {
    for (const chemical of chemicals) {
      if (!(field in chemical)) continue;
      assert.ok(rule.words.includes(chemical[field]), `${chemical.id}: ${field} "${chemical[field]}"`);
      assert.ok(rule.appliesTo(chemical), `${chemical.id} (${chemical.state}) should not carry ${field}`);
    }
  });
}

test('every substance of the right kind has its appearance words', () => {
  // The UI.3 batches filled every one (batch.md section 15). A chemical
  // added later must come with them, or the bench has nothing to draw from.
  for (const [field, rule] of Object.entries(RULES)) {
    for (const chemical of chemicals) {
      if (rule.appliesTo(chemical)) assert.ok(field in chemical, `${chemical.id} has no ${field}`);
    }
  }
});

test('a chemical source names what it confirms, with a link and a date', () => {
  for (const chemical of chemicals) {
    for (const entry of chemical.sources || []) {
      assert.match(entry.url ?? '', /^https:\/\//, chemical.id);
      assert.match(entry.checked ?? '', /^\d{4}-\d{2}-\d{2}$/, chemical.id);
      for (const word of entry.covers) {
        // What each word a chemical's source can confirm is stored as:
        // the appearance words (UI.3) and the boiling and melting points (UI.4).
        const field = {
          clarity: 'clarity', form: 'form', texture: 'texture',
          boilingPoint: 'boilingPointC', meltingPoint: 'meltingPointC',
          fumes: 'fumes', storage: 'storage',
        }[word];
        assert.ok(field, `${chemical.id}: covers "${word}"`);
        assert.ok(field in chemical, `${chemical.id}: a source confirms ${word}, but there is no ${field}`);
      }
    }
  }
});

/**
 * validate-content.mjs — checks every content file against the schemas
 * CLAUDE.md section 5 defines, without needing Electron or the test runner.
 *
 * WHY THIS EXISTS
 * The unit tests (tests/*.test.js) already guard the engine's behaviour, and
 * a few of them touch real content in passing. This script is narrower and
 * faster: it is only about the DATA — does every entry in chemicals.json,
 * reactions.json and experiments.json carry the fields CLAUDE.md requires,
 * and do the ids they reference actually resolve. It is meant to be run by
 * hand after every content batch, the way `npm test` is run after every code
 * change: cheap, immediate, and specific about what it found wrong.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It does not judge whether an explanation is scientifically correct, only
 * whether one exists. CLAUDE.md section 6.5 puts that judgement on a human
 * reading against a textbook — no script can do that part.
 *
 * Run it with:  npm run validate
 * Exits 1 if it found anything, 0 if the content is clean, so it can be
 * wired into a pre-commit hook or CI later without any changes here.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(SCRIPT_DIR, '..');
const DATA_DIR = path.join(ROOT, 'src', 'data');

/** Reads and parses a JSON file, reporting a clear problem instead of a raw
 *  stack trace if it is missing, empty, or malformed. */
function readJson(filename, { required = true } = {}) {
  const filePath = path.join(DATA_DIR, filename);
  if (!existsSync(filePath)) {
    if (required) problems.push(`${filename}: file does not exist`);
    return null;
  }
  const text = readFileSync(filePath, 'utf8');
  if (text.trim().length === 0) {
    problems.push(`${filename}: file is empty (not valid JSON)`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    problems.push(`${filename}: does not parse as JSON — ${err.message}`);
    return null;
  }
}

const problems = [];
// Kept separate from `problems` because these are exactly the three things
// the review asked this script to call out by name; everything else is
// broader schema/reference checking bundled in alongside them.
const missingSource = [];
const missingColourName = [];
const missingExplanation = [];

const MIN_SOURCE_LENGTH = 10; // "textbook, ch. 3" is about this long; "x" is not a source

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/* ------------------------------------------------------------------ *
 * chemicals.json — CLAUDE.md section 5's chemical schema
 * ------------------------------------------------------------------ */

const chemicals = readJson('chemicals.json') ?? [];
const chemicalsById = new Map();

{
  const REQUIRED_FIELDS = [
    'id', 'name', 'formula', 'state', 'colorHex', 'colorName',
    'solubility', 'conductivity', 'hazards', 'levels', 'structure',
    'description', 'source',
  ];
  const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;
  const seenIds = new Set();

  for (const chemical of chemicals) {
    const id = chemical.id || '(no id)';

    if (seenIds.has(id)) problems.push(`chemicals.json: duplicate id ${id}`);
    seenIds.add(id);
    chemicalsById.set(id, chemical);

    for (const field of REQUIRED_FIELDS) {
      if (chemical[field] === undefined || chemical[field] === null) {
        problems.push(`${id}: missing required field "${field}"`);
      }
    }

    if (!nonEmptyString(chemical.source)) {
      missingSource.push(id);
    } else if (chemical.source.trim().length < MIN_SOURCE_LENGTH) {
      problems.push(`${id}: source is too short to be a real citation ("${chemical.source}")`);
    }

    if (!nonEmptyString(chemical.colorName)) {
      missingColourName.push(id);
    }

    if (!nonEmptyString(chemical.description)) {
      missingExplanation.push(id);
    }

    if (chemical.colorHex && !HEX_PATTERN.test(chemical.colorHex)) {
      problems.push(`${id}: colorHex "${chemical.colorHex}" is not a 6-digit hex colour`);
    }

    if (typeof chemical.onShelf !== 'boolean') {
      problems.push(`${id}: onShelf must be true or false`);
    }

    if (!Array.isArray(chemical.levels) || chemical.levels.length === 0) {
      problems.push(`${id}: levels must be a non-empty array`);
    }

    if (chemical.structure) {
      const structurePath = path.join(DATA_DIR, chemical.structure);
      if (!existsSync(structurePath)) {
        problems.push(`${id}: structure file missing (${chemical.structure})`);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * reactions.json — CLAUDE.md section 5's reaction schema, including the
 * noReaction and electrolysis variants
 * ------------------------------------------------------------------ */

const reactions = readJson('reactions.json') ?? [];

{
  const seenIds = new Set();

  for (const reaction of reactions) {
    const id = reaction.id || '(no id)';

    if (seenIds.has(id)) problems.push(`reactions.json: duplicate id ${id}`);
    seenIds.add(id);

    if (!nonEmptyString(reaction.source)) {
      missingSource.push(id);
    } else if (reaction.source.trim().length < MIN_SOURCE_LENGTH) {
      problems.push(`${id}: source is too short to be a real citation ("${reaction.source}")`);
    }

    if (!nonEmptyString(reaction.explanation)) {
      missingExplanation.push(id);
    }

    if (!Array.isArray(reaction.reactants) || reaction.reactants.length === 0) {
      problems.push(`${id}: reactants must be a non-empty array`);
    }
    if (!Array.isArray(reaction.levels) || reaction.levels.length === 0) {
      problems.push(`${id}: levels must be a non-empty array`);
    }

    for (const reactantId of reaction.reactants || []) {
      if (!chemicalsById.has(reactantId)) problems.push(`${id}: unknown reactant "${reactantId}"`);
    }
    for (const productId of reaction.products || []) {
      if (!chemicalsById.has(productId)) problems.push(`${id}: unknown product "${productId}"`);
    }
    const catalyst = reaction.conditions?.catalyst;
    if (catalyst && !chemicalsById.has(catalyst)) {
      problems.push(`${id}: unknown catalyst "${catalyst}"`);
    }

    // The two shapes CLAUDE.md section 6.2 draws a hard line between.
    if (reaction.noReaction === true) {
      if (reaction.products) problems.push(`${id}: a noReaction rule should not carry products`);
    } else {
      if (!Array.isArray(reaction.products) || reaction.products.length === 0) {
        problems.push(`${id}: reaction must have products (or be marked noReaction)`);
      }
      if (!nonEmptyString(reaction.equation)) problems.push(`${id}: missing equation`);
      if (!reaction.effects) problems.push(`${id}: missing effects block`);
    }

    // A colour is never shown without its name (UI.md section 5) - the
    // engine reads the name straight off whichever chemical record carries
    // that exact colorHex, so a colorToHex nothing is named by would leave
    // the notebook silently unable to report the very change the rule
    // exists to show.
    const colourHex = reaction.effects?.colorToHex;
    if (colourHex) {
      const named = chemicals.some(
        (chemical) => (chemical.colorHex || '').toUpperCase() === colourHex.toUpperCase() && chemical.colorName
      );
      if (!named) problems.push(`${id}: effects.colorToHex "${colourHex}" is not named by any chemical's colorHex`);
    }

    if (reaction.hazard && !nonEmptyString(reaction.hazard.whatToDoInstead)) {
      problems.push(`${id}: hazard block has no whatToDoInstead`);
    }

    if (reaction.electrodes) {
      for (const side of ['cathode', 'anode']) {
        const electrode = reaction.electrodes[side];
        if (!electrode) {
          problems.push(`${id}: electrodes block is missing "${side}"`);
          continue;
        }
        if (!(reaction.products || []).includes(electrode.product)) {
          problems.push(`${id}: ${side}.product "${electrode.product}" is not one of the rule's own products`);
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * experiments.json — CLAUDE.md section 5's guided-experiment schema
 * ------------------------------------------------------------------ */

const experiments = readJson('experiments.json') ?? [];

{
  const REQUIRED_FIELDS = ['id', 'title', 'level', 'objective', 'apparatus', 'reagents', 'steps', 'expectedResult', 'theory'];
  const seenIds = new Set();

  for (const experiment of experiments) {
    const id = experiment.id || '(no id)';

    if (seenIds.has(id)) problems.push(`experiments.json: duplicate id ${id}`);
    seenIds.add(id);

    for (const field of REQUIRED_FIELDS) {
      if (experiment[field] === undefined || experiment[field] === null) {
        problems.push(`${id}: missing required field "${field}"`);
      }
    }

    if (!nonEmptyString(experiment.source)) {
      missingSource.push(id);
    } else if (experiment.source.trim().length < MIN_SOURCE_LENGTH) {
      problems.push(`${id}: source is too short to be a real citation ("${experiment.source}")`);
    }

    if (!nonEmptyString(experiment.theory)) {
      missingExplanation.push(id);
    }

    for (const reagentId of experiment.reagents || []) {
      if (!chemicalsById.has(reagentId)) problems.push(`${id}: unknown reagent "${reagentId}"`);
    }

    const declaredReagents = new Set(experiment.reagents || []);
    let previousN = 0;
    for (const step of experiment.steps || []) {
      if (step.n !== previousN + 1) {
        problems.push(`${id}: step numbering out of order at step n=${step.n} (expected ${previousN + 1})`);
      }
      previousN = step.n;

      for (const field of ['instruction', 'hint', 'onWrongAction', 'requiredAction']) {
        if (!step[field]) problems.push(`${id} step ${step.n}: missing "${field}"`);
      }

      const required = step.requiredAction || {};
      if (!required.type) problems.push(`${id} step ${step.n}: requiredAction has no type`);
      if (required.chemicalId) {
        if (!chemicalsById.has(required.chemicalId)) {
          problems.push(`${id} step ${step.n}: unknown chemical "${required.chemicalId}"`);
        } else if (!declaredReagents.has(required.chemicalId)) {
          problems.push(`${id} step ${step.n}: uses "${required.chemicalId}" but it is not declared in reagents`);
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * molecules3d.json — every chemical needs a viewer entry (Phase 6)
 * ------------------------------------------------------------------ */

const molecules3d = readJson('molecules3d.json') ?? {};

for (const chemical of chemicals) {
  if (!molecules3d[chemical.id]) {
    problems.push(`${chemical.id}: no molecules3d.json entry`);
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

console.log('ChemLab content validation');
console.log('='.repeat(60));
console.log(`chemicals.json:   ${chemicals.length} entries`);
console.log(`reactions.json:   ${reactions.length} entries (${reactions.filter((r) => r.noReaction).length} noReaction)`);
console.log(`experiments.json: ${experiments.length} entries`);
console.log(`molecules3d.json: ${Object.keys(molecules3d).length} entries`);

console.log('\n--- entries missing a source ---');
console.log(missingSource.length === 0 ? 'none' : missingSource.map((id) => `  - ${id}`).join('\n'));

console.log('\n--- entries missing a colour name ---');
console.log(missingColourName.length === 0 ? 'none' : missingColourName.map((id) => `  - ${id}`).join('\n'));

console.log('\n--- entries missing an explanation ---');
console.log(missingExplanation.length === 0 ? 'none' : missingExplanation.map((id) => `  - ${id}`).join('\n'));

console.log('\n--- every other schema and reference problem ---');
console.log(problems.length === 0 ? 'none' : problems.map((p) => `  - ${p}`).join('\n'));

const total = missingSource.length + missingColourName.length + missingExplanation.length + problems.length;
console.log('\n' + '='.repeat(60));
console.log(total === 0 ? 'ALL CLEAR — nothing flagged.' : `${total} issue(s) found.`);

process.exit(total === 0 ? 0 : 1);

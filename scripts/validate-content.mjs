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
 * THE CHEMISTRY CHECKS (BUILD_PHASE_2.md stage 2.1.2)
 * Beyond "is the field there", it checks the things a machine CAN check:
 *   - every equation balances, atoms and charge (scripts/lib/equation-balance.mjs)
 *   - every colour's hex looks like its name (scripts/lib/colour-check.mjs)
 *   - every hazard word maps to GHS pictograms (src/data/ghs-hazards.json)
 *   - every pH is on the 0–14 scale
 *   - every level tag is matric, fsc or bs
 *
 * ERRORS AND WARNINGS
 * An ERROR is something wrong: an equation that does not balance, a
 * "blue" painted red. The build fails on errors (CI runs this script).
 * A WARNING is something a person should look at but that may be fine:
 * an equation written in words that cannot be counted, a "pale" colour
 * that is darker than most. Warnings are listed but do not fail the build.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It does not judge whether an explanation is scientifically correct, only
 * whether one exists. CLAUDE.md section 6.5 puts that judgement on a human
 * reading against a textbook — no script can do that part.
 *
 * Run it with:  npm run validate
 * Exits 1 if it found any error, 0 otherwise (warnings alone exit 0).
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkEquation } from './lib/equation-balance.mjs';
import { checkColourName } from './lib/colour-check.mjs';
import { SOLID_KIND_OPENINGS } from '../src/core/engine.js';

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

// The 2.1.2 chemistry checks, each kept in its own list so the report can
// say which kind of problem it is. `warnings` never fails the build.
const unbalanced = [];
const colourErrors = [];
const hazardErrors = [];
const pHErrors = [];
const levelErrors = [];
const warnings = [];

const LEVELS = new Set(['matric', 'fsc', 'bs']);

const MIN_SOURCE_LENGTH = 10; // "textbook, ch. 3" is about this long; "x" is not a source

// What a `sources` entry on a reaction may say it confirms - see checkSources.
const SOURCE_COVERS = new Set([
  'products', 'equation', 'conditions', 'colour', 'precipitate', 'gas',
  'temperature', 'pH', 'hazard', 'explanation', 'noReaction',
]);

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

    // solidKind picks the notebook's opening words for the solid a rule
    // leaves ("A deposit formed", "Left in the vessel"). It means nothing
    // without a solid to introduce, and a misspelt kind would quietly fall
    // back to calling the solid a precipitate.
    const solidKind = reaction.effects?.solidKind;
    if (solidKind !== undefined) {
      if (!Object.hasOwn(SOLID_KIND_OPENINGS, solidKind)) {
        problems.push(`${id}: effects.solidKind "${solidKind}" is not one of ${Object.keys(SOLID_KIND_OPENINGS).join(', ')}`);
      }
      if (!reaction.effects.precipitate) {
        problems.push(`${id}: effects.solidKind is set but there is no effects.precipitate for it to describe`);
      }
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

    if ('sources' in reaction) checkSources(id, reaction.sources);
  }
}

/* ------------------------------------------------------------------ *
 * `sources` - the second-source audit (BUILD_PHASE_2.md stage 2.1.1).
 *
 * Optional, and kept beside `source` rather than replacing it. Each entry
 * records a reference somebody ACTUALLY consulted to check this rule: what
 * it is, where to find it, when it was checked, and which parts of the rule
 * it confirms. A web page carries its URL; a printed book is entered by a
 * person who held it, with no URL. An entry that cannot say what it covers
 * is not evidence of anything, so `covers` is required and must use the
 * fixed words (SOURCE_COVERS, near the top of this file).
 * ------------------------------------------------------------------ */
function checkSources(id, sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    problems.push(`${id}: sources must be a non-empty array when present`);
    return;
  }
  sources.forEach((entry, index) => {
    const where = `${id}: sources[${index}]`;
    if (!entry || typeof entry !== 'object') {
      problems.push(`${where} is not an object`);
      return;
    }
    if (!nonEmptyString(entry.ref) || entry.ref.trim().length < MIN_SOURCE_LENGTH) {
      problems.push(`${where}: ref is missing or too short to identify the reference`);
    }
    if ('url' in entry && !/^https:\/\/\S+$/.test(entry.url ?? '')) {
      problems.push(`${where}: url must be an https:// link`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.checked ?? '')) {
      problems.push(`${where}: checked must be the date it was consulted, as YYYY-MM-DD`);
    }
    if (!Array.isArray(entry.covers) || entry.covers.length === 0) {
      problems.push(`${where}: covers must list what this reference confirms`);
    } else {
      for (const word of entry.covers) {
        if (!SOURCE_COVERS.has(word)) problems.push(`${where}: "${word}" is not one of ${[...SOURCE_COVERS].join(', ')}`);
      }
    }
  });
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
 * category — the shelf's "kind" filter reads this
 *
 * A shelf drawer label, not a claim about chemistry, but it still has
 * to be curated: the filter shows nothing useful if entries drift into
 * spellings it does not offer.
 * ------------------------------------------------------------------ */

const CATEGORIES = new Set([
  'acid', 'base', 'salt', 'oxide', 'element', 'organic', 'complex', 'reagent', 'material', 'other',
]);

for (const chemical of chemicals) {
  if (!CATEGORIES.has(chemical.category)) {
    problems.push(
      `${chemical.id}: category ${JSON.stringify(chemical.category)} is not one the shelf filter offers`
    );
  }
}

/* ------------------------------------------------------------------ *
 * flame-tests.json — the flame test wire reads these (Phase 8)
 *
 * The tool refuses to guess a cation from a formula, so it depends
 * entirely on these two things lining up: every element a chemical
 * claims must have a curated colour, and every colour must carry a
 * name as well as a hex (UI.md section 5).
 * ------------------------------------------------------------------ */

const flameTests = readJson('flame-tests.json') ?? {};

for (const [key, entry] of Object.entries(flameTests)) {
  for (const field of ['element', 'colorName', 'colorHex', 'note', 'source']) {
    if (typeof entry[field] !== 'string' || entry[field].trim().length === 0) {
      problems.push(`flame-tests.json ${key}: missing ${field}`);
    }
  }
  if (entry.element !== key) {
    problems.push(`flame-tests.json ${key}: element field says "${entry.element}"`);
  }
  if (entry.colorHex && !/^#[0-9A-Fa-f]{6}$/.test(entry.colorHex)) {
    problems.push(`flame-tests.json ${key}: colorHex "${entry.colorHex}" is not a 6-digit hex`);
  }
}

for (const chemical of chemicals) {
  if (chemical.flameElements === undefined) continue;
  if (!Array.isArray(chemical.flameElements) || chemical.flameElements.length === 0) {
    problems.push(`${chemical.id}: flameElements must be a non-empty array`);
    continue;
  }
  for (const element of chemical.flameElements) {
    if (!flameTests[element]) {
      problems.push(`${chemical.id}: flameElements names "${element}", which has no flame-tests.json entry`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Equations balance (stage 2.1.2)
 *
 * An equation the checker cannot read — one written partly in words, such
 * as "starch + I₂ → starch·I₂" — is a warning, never a pass: it is listed
 * so a person checks it by hand.
 * ------------------------------------------------------------------ */

for (const reaction of reactions) {
  if (reaction.noReaction || !nonEmptyString(reaction.equation)) continue;
  const result = checkEquation(reaction.equation);
  if (result.status === 'unbalanced') {
    unbalanced.push(`${reaction.id}: "${reaction.equation}" does not balance (${result.detail})`);
  } else if (result.status === 'unreadable') {
    warnings.push(`${reaction.id}: equation cannot be counted automatically — check by hand: "${reaction.equation}"`);
  }
}

/* ------------------------------------------------------------------ *
 * Colours look like their names (stage 2.1.2)
 * ------------------------------------------------------------------ */

{
  const named = [
    ...chemicals.map((c) => [c.id, c.colorName, c.colorHex]),
    ...Object.entries(flameTests).map(([key, f]) => [`flame-tests.json ${key}`, f.colorName, f.colorHex]),
  ];
  for (const [id, name, hex] of named) {
    for (const finding of checkColourName(name, hex)) {
      if (finding.level === 'error') colourErrors.push(`${id}: ${finding.message}`);
      else warnings.push(`${id}: ${finding.message}`);
    }
  }

  // One hex, named "pale" by one chemical and "bright" by another. The
  // notebook names a colour from the reaction's own products first, so
  // this is not always visible — but both cannot be right.
  const SHADES = { pale: 'light', light: 'light', bright: 'strong', deep: 'strong', dark: 'strong' };
  const namesByHex = new Map();
  for (const c of chemicals) {
    if (!c.colorHex || !c.colorName) continue;
    const key = c.colorHex.toUpperCase();
    if (!namesByHex.has(key)) namesByHex.set(key, new Set());
    namesByHex.get(key).add(c.colorName);
  }
  for (const [hex, names] of namesByHex) {
    const shades = new Set();
    for (const name of names) {
      for (const word of name.toLowerCase().split(/[^a-z]+/)) if (SHADES[word]) shades.add(SHADES[word]);
    }
    if (shades.size > 1) {
      warnings.push(`${hex} is named both ${[...names].map((n) => `"${n}"`).join(' and ')} by different chemicals`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Hazards map to GHS pictograms (stage 2.1.2)
 *
 * The map itself is curated chemistry content, so it lives in
 * src/data/ghs-hazards.json rather than here. This only checks that every
 * hazard word used anywhere is in it, and that the map is well formed.
 * ------------------------------------------------------------------ */

{
  const ghsFile = readJson('ghs-hazards.json') ?? { pictograms: {}, hazards: {} };
  const pictograms = ghsFile.pictograms || {};
  const hazardWords = ghsFile.hazards || {};

  for (const [word, entry] of Object.entries(hazardWords)) {
    if (!Array.isArray(entry.ghs)) {
      hazardErrors.push(`ghs-hazards.json ${word}: ghs must be a list of pictogram codes`);
      continue;
    }
    for (const code of entry.ghs) {
      if (!pictograms[code]) hazardErrors.push(`ghs-hazards.json ${word}: "${code}" is not a GHS pictogram`);
    }
    if (entry.ghs.length === 0 && !nonEmptyString(entry.why)) {
      hazardErrors.push(`ghs-hazards.json ${word}: no pictogram, so it must say why`);
    }
  }

  for (const chemical of chemicals) {
    const words = chemical.hazards || [];
    for (const word of words) {
      if (!hazardWords[word]) hazardErrors.push(`${chemical.id}: hazard "${word}" is not in ghs-hazards.json`);
    }
    if (words.length > 0 && words.every((w) => hazardWords[w] && hazardWords[w].ghs?.length === 0)) {
      warnings.push(`${chemical.id}: hazards ${words.join(', ')} carry no GHS pictogram between them`);
    }
  }
  for (const reaction of reactions) {
    if (!reaction.hazard) continue;
    if (!hazardWords[reaction.hazard.type]) {
      hazardErrors.push(`${reaction.id}: hazard type "${reaction.hazard.type}" is not in ghs-hazards.json`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * pH is on the scale (stage 2.1.2)
 *
 * 0 to 14, with one honest exception: a concentrated strong acid really
 * does read below zero, so a chemical whose concentration is written as
 * "concentrated ..." may go down to -1. null means "no curated value"
 * and is always allowed (tools.js then refuses to give a reading).
 * ------------------------------------------------------------------ */

{
  const checkPH = (where, value, { concentrated = false } = {}) => {
    if (value === null || value === undefined) return;
    const floor = concentrated ? -1 : 0;
    if (typeof value !== 'number' || Number.isNaN(value)) {
      pHErrors.push(`${where}: pH ${JSON.stringify(value)} is not a number`);
    } else if (value < floor || value > 14) {
      pHErrors.push(`${where}: pH ${value} is off the ${floor}–14 scale`);
    }
  };
  for (const c of chemicals) {
    checkPH(c.id, c.pH, { concentrated: /^concentrated/i.test(c.concentration ?? '') });
  }
  for (const r of reactions) checkPH(`${r.id} resultPH`, r.effects?.resultPH);
  for (const e of experiments) checkPH(`${e.id} endpointPH`, e.expectedResult?.endpointPH);
}

/* ------------------------------------------------------------------ *
 * Level tags (stage 2.1.2)
 * ------------------------------------------------------------------ */

for (const item of [...chemicals, ...reactions]) {
  for (const level of item.levels || []) {
    if (!LEVELS.has(level)) levelErrors.push(`${item.id}: level "${level}" is not matric, fsc or bs`);
  }
}
for (const experiment of experiments) {
  if (!LEVELS.has(experiment.level)) {
    levelErrors.push(`${experiment.id}: level "${experiment.level}" is not matric, fsc or bs`);
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const list = (items) => (items.length === 0 ? 'none' : items.map((p) => `  - ${p}`).join('\n'));

console.log('ChemLab content validation');
console.log('='.repeat(60));
console.log(`chemicals.json:   ${chemicals.length} entries`);
console.log(`flame-tests.json: ${Object.keys(flameTests).length} elements, ${chemicals.filter((c) => c.flameElements).length} chemicals tagged`);
console.log(`reactions.json:   ${reactions.length} entries (${reactions.filter((r) => r.noReaction).length} noReaction)`);
console.log(`experiments.json: ${experiments.length} entries`);
console.log(`molecules3d.json: ${Object.keys(molecules3d).length} entries`);

console.log('\n' + '#'.repeat(60));
console.log('ERRORS — these fail the build');
console.log('#'.repeat(60));

const errorSections = [
  ['entries missing a source', missingSource],
  ['entries missing a colour name', missingColourName],
  ['entries missing an explanation', missingExplanation],
  ['equations that do not balance', unbalanced],
  ['colours that contradict their names', colourErrors],
  ['hazard words without a GHS mapping', hazardErrors],
  ['pH values off the scale', pHErrors],
  ['level tags that are not matric, fsc or bs', levelErrors],
  ['every other schema and reference problem', problems],
];
for (const [title, items] of errorSections) {
  console.log(`\n--- ${title} ---`);
  console.log(list(items));
}

console.log('\n' + '#'.repeat(60));
console.log('WARNINGS — for a person to look at; these do not fail the build');
console.log('#'.repeat(60));
console.log('\n' + list(warnings));

const errorCount = errorSections.reduce((sum, [, items]) => sum + items.length, 0);
console.log('\n' + '='.repeat(60));
if (errorCount === 0) {
  console.log(`NO ERRORS.${warnings.length ? ` ${warnings.length} warning(s) to look at.` : ' Nothing flagged.'}`);
} else {
  console.log(`${errorCount} error(s), ${warnings.length} warning(s).`);
}

process.exit(errorCount === 0 ? 0 : 1);

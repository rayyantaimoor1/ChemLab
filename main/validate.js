/**
 * validate.js — checks everything the page sends to the main process before
 * the main process acts on it.
 *
 * WHY THIS FILE EXISTS
 * The page runs in a locked-down sandbox and cannot touch the disk. The only
 * way anything it says reaches a file is through main/ipc.js, so this is the
 * one gate. If a bug in the page (or anything that ever got into it) sent
 * nonsense, the worst it can do here is have that message refused - it can
 * never write a strange file, fill the disk, or pick where a file goes.
 *
 * The rules are strict on purpose: a field the notebook does not have is
 * refused rather than quietly stored. If notebook.js gains a field later,
 * it is added to ENTRY_FIELDS below, deliberately.
 *
 * Every function either returns the cleaned-up value or throws a TypeError
 * with a plain-English reason. Nothing here touches files or Electron, so
 * tests/bridge.test.js can exercise all of it with plain Node.
 */

export const LIMITS = Object.freeze({
  MAX_ENTRIES: 5000,
  MAX_TEXT_LENGTH: 2000,
  MAX_ID_LENGTH: 64,
  MAX_SPECIES: 10,
  MAX_EXPORT_BYTES: 1_000_000,
  MAX_NOTE_LENGTH: 500,
  MAX_VESSEL_SPECIES: 40,
});

// The colour-codes src/ui/app.js gives notebook lines. Saved alongside the
// entries so a reopened notebook looks the same as when it was closed.
export const NOTEBOOK_TAGS = Object.freeze([
  'warning', 'action', 'reaction', 'observation', 'measurement', 'estimate', 'milestone',
]);

const MATCH_VALUES = new Set(['match', 'near-miss', 'miss']);
const ENTRY_TYPES = new Set(['auto', 'observation']);
const CHEMICAL_ID = /^[a-z0-9_]+$/;

function fail(reason) {
  throw new TypeError(reason);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function checkText(value, field, { nullable = false, max = LIMITS.MAX_TEXT_LENGTH } = {}) {
  if (value === null && nullable) return;
  if (typeof value !== 'string') fail(`${field} must be text`);
  if (value.length > max) fail(`${field} is longer than ${max} characters`);
}

function checkTextOrNumber(value, field) {
  if (value === null) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${field} must be a real number`);
    return;
  }
  checkText(value, field);
}

/**
 * What each field of a saved notebook entry may hold. These are the fields
 * notebook.js's toJSON() produces - see createNotebook's addEntry and
 * recordEstimate there. Fields marked optional are left off entries that
 * never needed them (an automatic entry has no quantity or unit).
 */
const ENTRY_FIELDS = {
  id: { required: true, check: (v) => (Number.isInteger(v) && v > 0) || fail('id must be a positive whole number') },
  type: { required: true, check: (v) => ENTRY_TYPES.has(v) || fail('type must be "auto" or "observation"') },
  timestamp: { required: true, check: (v) => Number.isFinite(v) || fail('timestamp must be a number') },
  text: { required: true, check: (v) => checkText(v, 'text') },
  revealed: { required: true, check: (v) => typeof v === 'boolean' || fail('revealed must be true or false') },
  containerId: { check: (v) => checkText(v, 'containerId', { nullable: true, max: LIMITS.MAX_ID_LENGTH }) },
  action: { check: (v) => checkText(v, 'action', { nullable: true, max: LIMITS.MAX_ID_LENGTH }) },
  measured: { check: (v) => checkTextOrNumber(v, 'measured') },
  expected: { check: (v) => checkTextOrNumber(v, 'expected') },
  matched: { check: (v) => v === null || MATCH_VALUES.has(v) || fail('matched must be match, near-miss, miss or empty') },
  quantity: { check: (v) => checkText(v, 'quantity', { nullable: true, max: LIMITS.MAX_ID_LENGTH }) },
  unit: { check: (v) => checkText(v, 'unit', { nullable: true, max: LIMITS.MAX_ID_LENGTH }) },
  tolerance: {
    check: (v) => v === null
      || (isPlainObject(v) && Object.keys(v).length === 2
        && Number.isFinite(v.match) && Number.isFinite(v.near))
      || fail('tolerance must be { match, near } numbers or empty'),
  },
};

function validateEntry(entry, index) {
  const where = `notebook entry ${index + 1}`;
  if (!isPlainObject(entry)) fail(`${where} is not an entry`);

  for (const key of Object.keys(entry)) {
    if (!(key in ENTRY_FIELDS)) fail(`${where} has an unexpected field "${key}"`);
  }
  for (const [key, rule] of Object.entries(ENTRY_FIELDS)) {
    if (!(key in entry) || entry[key] === undefined) {
      if (rule.required) fail(`${where} is missing "${key}"`);
      continue;
    }
    try {
      rule.check(entry[key]);
    } catch (error) {
      fail(`${where}: ${error.message}`);
    }
  }
}

/**
 * A whole notebook as the page wants it saved: the entries from
 * notebook.toJSON(), and the colour tag for any line that has one.
 *
 * @returns {{ entries: object[], tags: Record<string, string> }}
 */
export function validateNotebook(entries, tags = {}) {
  if (!Array.isArray(entries)) fail('the notebook must be a list of entries');
  if (entries.length > LIMITS.MAX_ENTRIES) {
    fail(`the notebook has more than ${LIMITS.MAX_ENTRIES} entries`);
  }
  entries.forEach(validateEntry);

  const ids = new Set(entries.map((entry) => entry.id));
  if (ids.size !== entries.length) fail('two notebook entries share the same id');

  if (!isPlainObject(tags)) fail('the notebook tags must be a lookup of entry id to tag');
  for (const [key, tag] of Object.entries(tags)) {
    if (!ids.has(Number(key))) fail(`a tag refers to entry ${key}, which is not in the notebook`);
    if (!NOTEBOOK_TAGS.includes(tag)) fail(`"${tag}" is not a notebook tag`);
  }

  return { entries, tags };
}

/**
 * A combination of chemicals the engine had no rule for (CLAUDE.md §6.3).
 * Every id must be one chemicals.json actually contains, so the log can only
 * ever hold real combinations a student really tried.
 *
 * @param {unknown} ids
 * @param {Set<string>} knownChemicalIds
 * @returns {string[]} the ids, de-duplicated and sorted (§7: order never matters)
 */
export function validateChemicalIds(ids, knownChemicalIds) {
  if (!Array.isArray(ids) || ids.length === 0) fail('an unknown combination needs at least one chemical');
  if (ids.length > LIMITS.MAX_SPECIES) fail(`an unknown combination has more than ${LIMITS.MAX_SPECIES} chemicals`);

  for (const id of ids) {
    if (typeof id !== 'string' || id.length > LIMITS.MAX_ID_LENGTH || !CHEMICAL_ID.test(id)) {
      fail('a chemical id must be lower-case letters, digits and underscores');
    }
    if (!knownChemicalIds.has(id)) fail(`"${id}" is not a chemical in chemicals.json`);
  }
  return [...new Set(ids)].sort();
}

/* ------------------------------------------------------------------ *
 * A "This looks wrong" report (BUILD_PHASE_2.md stage 2.1.4)
 *
 * A student flags a reaction result they think is wrong, with an optional
 * note. The report names the rule(s) that produced it and the state of the
 * vessel at that moment, so whoever reviews reports.json can reproduce it.
 * Every id must be real, every field is checked, and nothing else is kept.
 * ------------------------------------------------------------------ */

const REPORT_OUTCOMES = new Set(['reaction', 'no_reaction']);
const REPORT_FIELDS = ['reactionIds', 'outcome', 'notebookText', 'note', 'vessel'];
const VESSEL_FIELDS = ['name', 'speciesIds', 'volumeMl', 'temperatureC', 'heatLevel', 'electrified', 'pH'];

function checkExactFields(value, fields, what) {
  if (!isPlainObject(value)) fail(`${what} must be a set of named fields`);
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) fail(`${what} has an unexpected field "${key}"`);
  }
  for (const key of fields) {
    if (!(key in value)) fail(`${what} is missing "${key}"`);
  }
}

function checkIdList(ids, known, what, max) {
  if (!Array.isArray(ids) || ids.length === 0) fail(`${what} must list at least one id`);
  if (ids.length > max) fail(`${what} lists more than ${max} ids`);
  for (const id of ids) {
    if (typeof id !== 'string' || id.length > LIMITS.MAX_ID_LENGTH || !CHEMICAL_ID.test(id)) {
      fail(`${what}: an id must be lower-case letters, digits and underscores`);
    }
    if (!known.has(id)) fail(`${what}: "${id}" is not in the lab's data`);
  }
}

/**
 * @param {unknown} report
 * @param {{ knownReactionIds: Set<string>, knownChemicalIds: Set<string> }} known
 * @returns {object} the report, exactly as checked
 */
export function validateProblemReport(report, { knownReactionIds, knownChemicalIds }) {
  checkExactFields(report, REPORT_FIELDS, 'a problem report');
  checkIdList(report.reactionIds, knownReactionIds, 'the report\'s reactions', LIMITS.MAX_SPECIES);
  if (!REPORT_OUTCOMES.has(report.outcome)) fail('the report\'s outcome must be "reaction" or "no_reaction"');
  checkText(report.notebookText, 'the reported notebook line');
  checkText(report.note, 'the student\'s note', { max: LIMITS.MAX_NOTE_LENGTH });

  const vessel = report.vessel;
  checkExactFields(vessel, VESSEL_FIELDS, 'the reported vessel');
  checkText(vessel.name, 'the vessel name', { max: LIMITS.MAX_ID_LENGTH });
  checkIdList(vessel.speciesIds, knownChemicalIds, 'the vessel contents', LIMITS.MAX_VESSEL_SPECIES);
  if (!Number.isFinite(vessel.volumeMl) || vessel.volumeMl < 0) fail('the vessel volume must be a number, 0 or more');
  if (!Number.isFinite(vessel.temperatureC)) fail('the vessel temperature must be a number');
  if (!Number.isInteger(vessel.heatLevel) || vessel.heatLevel < -1 || vessel.heatLevel > 3) {
    fail('the vessel heat level must be a whole number from -1 to 3');
  }
  if (typeof vessel.electrified !== 'boolean') fail('whether the current is on must be true or false');
  if (vessel.pH !== null && !Number.isFinite(vessel.pH)) fail('the vessel pH must be a number or empty');

  return report;
}

/** The readable notebook text the student asked to save somewhere. */
export function validateExportText(text) {
  if (typeof text !== 'string') fail('the export must be text');
  if (Buffer.byteLength(text, 'utf-8') > LIMITS.MAX_EXPORT_BYTES) {
    fail('the export is larger than 1 MB');
  }
  return text;
}

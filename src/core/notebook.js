/**
 * notebook.js — the lab notebook: an automatic plain-English log of everything
 * that happened, plus the place a student writes down their own observations
 * and checks them against the real answer.
 *
 * WHY THIS FILE EXISTS
 * CLAUDE.md section 7 requires that every action produce a notebook entry in
 * plain English, automatically. UI.md's signature element section describes
 * the other half: a student writes what they think they saw, presses "Compare
 * with reference", and the true answer is revealed alongside their own words.
 * This file is both halves.
 *
 * TWO KINDS OF ENTRY
 *   'auto'        — written by the app itself, whenever an action in
 *                    actions.js runs. Already-known fact, nothing to compare.
 *   'observation' — written by the student via recordObservation(text). Holds
 *                    their own words, and (once revealReference is called) the
 *                    reference text and a rough match rating.
 *
 * WHERE THE "REFERENCE" TEXT COMES FROM
 * UI.md section 1 fixes recordObservation's signature to a single argument,
 * text, with nothing that says what the observation is ABOUT. So this file
 * keeps track of the most recent auto entry as "what is currently on the
 * bench", and captures that as the hidden reference the moment an observation
 * is recorded. Nothing is invented here — the reference text is always a
 * sentence engine.js already produced from curated data (see engine.js's
 * describeEffects). This file just remembers it and, later, shows it.
 *
 * THE MATCH RATING IS A ROUGH SELF-CHECK, NOT A GRADE
 * revealReference works out 'match' / 'partial' / 'miss' by checking how many
 * of the reference sentence's meaningful words show up in the student's own
 * words. That is a keyword-overlap heuristic, not language understanding. It
 * exists so a student gets an immediate rough steer, but the two full
 * sentences are always shown side by side so a human — student or teacher —
 * makes the real judgement. Treating this rating as an authoritative grade
 * would be exactly the kind of confidently-wrong result CLAUDE.md section 6
 * warns against, just applied to marking instead of chemistry.
 *
 * SAVING TO DISK
 * This file does not touch the filesystem or Electron. That belongs to
 * main.js, which CLAUDE.md section 4 already names as the owner of file
 * paths — and it is the only thing that can call Electron's
 * app.getPath('userData') in the first place. Instead, persist() and
 * restore() call an injected save(entries) / load() pair, the same pattern
 * engine.js uses for the unknown-combination log. Whoever wires this file up
 * for real supplies functions that write and read a JSON file; tests supply
 * an in-memory stand-in.
 *
 * NO DOM AND NO FILES. This folder is pure logic.
 */

/**
 * How close a comparison came, from revealReference(). The three words are
 * the ones UI.md section 4 uses: "marked as a match, a near-miss, or a miss".
 */
export const MATCH = {
  MATCH: 'match',
  NEAR_MISS: 'near-miss',
  MISS: 'miss',
};

const MATCH_THRESHOLD = 0.6;
const NEAR_MISS_THRESHOLD = 0.25;

// Common connecting words, stripped out before comparing text so that two
// sentences are judged on their chemistry, not their grammar.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'was', 'were', 'with', 'into',
  'from', 'that', 'this', 'it', 'its', 'is', 'are', 'be', 'been', 'on', 'in',
  'at', 'as', 'by', 'for', 'than', 'then', 'so', 'no', 'not', 'you', 'your',
  'which', 'when', 'while', 'there', 'here', 'about', 'over', 'after',
]);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/** Words worth comparing: four letters or more, common connectors removed. */
function significantWords(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9°%\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
}

/**
 * Rates how much of the reference sentence's meaningful vocabulary shows up in
 * the student's own words. See the file header: this is a rough steer, not a
 * grade, and is deliberately shown alongside the full text rather than on
 * its own.
 */
function classifyMatch(measured, expected) {
  const expectedWords = [...new Set(significantWords(expected))];
  if (expectedWords.length === 0) return null;

  const measuredText = (measured || '').toLowerCase();
  const hits = expectedWords.filter((word) => measuredText.includes(word));
  const coverage = hits.length / expectedWords.length;

  if (coverage >= MATCH_THRESHOLD) return MATCH.MATCH;
  if (coverage >= NEAR_MISS_THRESHOLD) return MATCH.NEAR_MISS;
  return MATCH.MISS;
}

/**
 * Rates a numeric estimate against the real measured value.
 *
 * Unlike the text version above, this one IS trustworthy: two numbers and a
 * tolerance leave nothing to interpret. The tolerance comes from the
 * instrument itself (see tools.js TOLERANCE) - it is how precisely that tool
 * can actually be read, not an arbitrary marking scheme. Estimating pH 7.2
 * when the answer is 7.0 is a match because pH paper genuinely cannot tell
 * those apart.
 */
function classifyNumeric(measured, expected, tolerance) {
  if (typeof measured !== 'number' || typeof expected !== 'number') return null;
  if (!tolerance || typeof tolerance.match !== 'number' || typeof tolerance.near !== 'number') {
    return null;
  }

  const difference = Math.abs(measured - expected);
  if (difference <= tolerance.match) return MATCH.MATCH;
  if (difference <= tolerance.near) return MATCH.NEAR_MISS;
  return MATCH.MISS;
}

/**
 * Turns a stored entry into what the UI is allowed to see. The reference and
 * match rating stay hidden until revealReference has actually been called for
 * that entry — otherwise "Compare with reference" would have nothing left to
 * reveal.
 */
function toPublicEntry(entry) {
  return {
    id: entry.id,
    type: entry.type,
    timestamp: entry.timestamp,
    text: entry.text,
    containerId: entry.containerId,
    action: entry.action,
    measured: entry.measured,
    expected: entry.revealed ? entry.expected : null,
    matched: entry.revealed ? entry.matched : null,
    revealed: entry.revealed,
    // Present only on numeric estimates, so the UI can print "pH" or "°C"
    // next to the two values without having to work out what was measured.
    quantity: entry.quantity ?? null,
    unit: entry.unit ?? null,
  };
}

/**
 * Builds a notebook.
 *
 * @param {object}   [options]
 * @param {Function} [options.save]  async (plainEntries) => void. Writes the
 *   notebook somewhere durable. Leave it out and persist() will refuse to run.
 * @param {Function} [options.load]  async () => plainEntries. Reads the
 *   notebook back. Leave it out and restore() will refuse to run.
 */
export function createNotebook({ save = null, load = null } = {}) {
  /** @type {Array<object>} */
  let entries = [];
  let nextId = 1;

  // "What is currently on the bench", used as the hidden reference the next
  // time recordObservation is called. Updated by every automatic entry.
  let currentReference = null;

  function addEntry(partial) {
    const entry = {
      id: nextId,
      revealed: false,
      containerId: null,
      action: null,
      measured: null,
      expected: null,
      matched: null,
      ...partial,
    };
    nextId += 1;
    entries.push(entry);
    return entry;
  }

  /**
   * Turns one automatic entry from actions.js into a notebook line.
   *
   * Wire this up directly as actions.js's onNotebookEntry:
   *   createActions({ ..., onNotebookEntry: notebook.logAction })
   *
   * @param {{text: string, containerId: string, action: string, timestamp: number}} actionEntry
   */
  function logAction(actionEntry) {
    if (!actionEntry || typeof actionEntry.text !== 'string') {
      throw new TypeError('logAction() needs an entry with a text field');
    }

    const entry = addEntry({
      type: 'auto',
      timestamp: actionEntry.timestamp ?? Date.now(),
      text: actionEntry.text,
      containerId: actionEntry.containerId ?? null,
      action: actionEntry.action ?? null,
    });

    currentReference = entry.text;
    return toPublicEntry(entry);
  }

  /**
   * recordObservation(text) — UI.md section 1's exact signature.
   *
   * Writes down what the student says they saw. The true answer (whatever the
   * most recent automatic entry said) is captured now but kept hidden until
   * revealReference is called for this same entry.
   */
  function recordObservation(text) {
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new TypeError('recordObservation() needs some text to record');
    }

    const entry = addEntry({
      type: 'observation',
      timestamp: Date.now(),
      text,
      measured: text,
      expected: currentReference,
    });

    return toPublicEntry(entry);
  }

  /**
   * Writes down a student's numeric estimate of something measurable, so it
   * can be checked against what the instrument actually says.
   *
   * This is the trustworthy half of compare-with-reference. recordObservation
   * above compares free text and can only ever give a rough steer;
   * this compares two numbers against the instrument's own precision, so
   * match / near-miss / miss genuinely means something.
   *
   * NOT one of UI.md section 1's dispatch names. That list has
   * recordObservation(text) and nothing for a numeric reading, and text
   * matching is too weak to build the compare-with-reference feature on. The
   * entry it produces still fits section 1's notebook shape exactly
   * (measured / expected / matched), so nothing downstream has to change.
   *
   * The true value is passed in rather than looked up, because this file has
   * no access to containers or tools and should not grow one - see the
   * boundary note in the file header.
   *
   * @param {object} details
   * @param {number} details.value      what the student thinks it is
   * @param {number|null} details.expected  what the instrument actually says
   * @param {string} details.quantity   'pH', 'temperature', ...
   * @param {string} [details.unit]     '°C' and so on, or none for pH
   * @param {object} [details.tolerance] { match, near } from tools.js
   * @param {string} [details.containerId]
   * @param {string} [details.containerName]
   */
  function recordEstimate({
    value,
    expected = null,
    quantity,
    unit = null,
    tolerance = null,
    containerId = null,
    containerName = null,
  } = {}) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new TypeError(`recordEstimate() needs a numeric value, got ${value}`);
    }
    if (typeof quantity !== 'string' || quantity.length === 0) {
      throw new TypeError('recordEstimate() needs to know which quantity was estimated');
    }

    const where = containerName ? ` in ${containerName}` : '';
    const printed = unit ? `${value} ${unit}` : `${value}`;

    const entry = addEntry({
      type: 'observation',
      timestamp: Date.now(),
      text: `Estimated ${quantity}${where}: ${printed}.`,
      measured: value,
      expected,
      quantity,
      unit,
      tolerance,
      containerId,
    });

    return toPublicEntry(entry);
  }

  /**
   * revealReference(notebookEntryId) — UI.md section 1's exact signature.
   *
   * Reveals the true value beside what the student wrote, and rates how close
   * they were. A numeric estimate is compared against the instrument's own
   * precision and the rating can be trusted; a free-text observation gets the
   * rough keyword steer described in the file header.
   */
  function revealReference(notebookEntryId) {
    const entry = entries.find((candidate) => candidate.id === notebookEntryId);
    if (!entry) {
      throw new Error(`revealReference: no notebook entry with id ${notebookEntryId}`);
    }
    if (entry.type !== 'observation') {
      throw new Error(`revealReference: entry ${notebookEntryId} is not a student observation`);
    }

    entry.revealed = true;
    entry.matched =
      typeof entry.measured === 'number'
        ? classifyNumeric(entry.measured, entry.expected, entry.tolerance)
        : classifyMatch(entry.measured, entry.expected);
    return toPublicEntry(entry);
  }

  /* ---------------------------------------------------------------- *
   * Reading the notebook
   * ---------------------------------------------------------------- */

  function getEntries() {
    return deepFreeze(entries.map(toPublicEntry));
  }

  function getEntry(notebookEntryId) {
    const entry = entries.find((candidate) => candidate.id === notebookEntryId);
    return entry ? deepFreeze(toPublicEntry(entry)) : null;
  }

  function isEmpty() {
    return entries.length === 0;
  }

  /** Wipes the notebook, for resetBench(). Does not touch anything on disk. */
  function clear() {
    entries = [];
    nextId = 1;
    currentReference = null;
  }

  /** The full, unredacted state — this is what gets saved to disk. */
  function toJSON() {
    return entries.map((entry) => ({ ...entry }));
  }

  /* ---------------------------------------------------------------- *
   * Persistence — see the file header for why this file does not touch
   * the filesystem itself.
   * ---------------------------------------------------------------- */

  async function persist() {
    if (typeof save !== 'function') {
      throw new Error('persist() needs createNotebook({ save }) to have been given a save function');
    }
    await save(toJSON());
  }

  async function restore() {
    if (typeof load !== 'function') {
      throw new Error('restore() needs createNotebook({ load }) to have been given a load function');
    }

    const loaded = await load();
    if (loaded == null) {
      clear();
      return;
    }
    if (!Array.isArray(loaded)) {
      throw new TypeError('restore(): the load() function must resolve to an array');
    }

    entries = loaded.map((entry) => ({ ...entry }));
    nextId = entries.reduce((max, entry) => Math.max(max, Number(entry.id) || 0), 0) + 1;

    const lastAuto = [...entries].reverse().find((entry) => entry.type === 'auto');
    currentReference = lastAuto ? lastAuto.text : null;
  }

  return {
    logAction,
    recordObservation,
    recordEstimate,
    revealReference,
    getEntries,
    getEntry,
    isEmpty,
    clear,
    toJSON,
    persist,
    restore,
  };
}

export default createNotebook;

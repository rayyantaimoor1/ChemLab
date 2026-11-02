/**
 * storage.js — reads and writes the app's three kinds of file: the saved
 * notebook, the unknown-combinations log, and a notebook export.
 *
 * WHY THIS FILE EXISTS
 * CLAUDE.md §4 gives file paths to the main process, never to src/. This
 * file is the part of the main process that actually touches the disk, kept
 * separate from main/ipc.js so it can be tested with plain Node: every
 * function is handed the folder or file to use, and nothing here imports
 * Electron.
 *
 * THREE HABITS THAT PROTECT A STUDENT'S WORK
 *   1. Atomic saves. A file is written to "name.tmp" first and then renamed
 *      over the real one, so a power cut halfway through a save leaves the
 *      old notebook intact rather than half a notebook.
 *   2. One save at a time per file. Two saves fired close together queue
 *      up instead of racing to write the same .tmp file.
 *   3. A damaged file is set aside, never deleted. If notebook.json cannot be
 *      read it is renamed to "notebook.damaged-<time>.json" and the app
 *      starts with an empty notebook, so a teacher can still recover it.
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { validateNotebook } from './validate.js';

export const FILE_NAMES = Object.freeze({
  NOTEBOOK: 'notebook.json',
  UNKNOWN_PAIRS: 'unknown-pairs.json',
});

const FILE_VERSION = 1;

// File path -> the promise for the last write queued against it.
const writeQueues = new Map();

/** Writes data as JSON, atomically, one write per file at a time. */
export function writeJsonAtomic(filePath, data) {
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  const next = previous
    .catch(() => {}) // an earlier failed save must not block every later one
    .then(async () => {
      await mkdir(path.dirname(filePath), { recursive: true });
      const tempPath = `${filePath}.tmp`;
      await writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await rename(tempPath, filePath);
    });
  writeQueues.set(filePath, next);
  return next;
}

/**
 * Reads a JSON file. A missing file gives `null` (first run, nothing saved
 * yet). A file that exists but cannot be parsed is set aside and also
 * gives `null`; `onDamaged` is told where it went.
 */
export async function readJsonOrSetAside(filePath, { onDamaged = () => {}, now = Date.now } = {}) {
  let raw;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return setAside(filePath, onDamaged, now);
  }
}

async function setAside(filePath, onDamaged, now) {
  const { dir, name, ext } = path.parse(filePath);
  const damagedPath = path.join(dir, `${name}.damaged-${now()}${ext}`);
  await rename(filePath, damagedPath);
  onDamaged(damagedPath);
  return null;
}

/* ------------------------------------------------------------------ *
 * The notebook
 * ------------------------------------------------------------------ */

/** @returns {Promise<{ entries: object[], tags: Record<string, string> }>} */
export async function loadNotebook(folder, options = {}) {
  const filePath = path.join(folder, FILE_NAMES.NOTEBOOK);
  const saved = await readJsonOrSetAside(filePath, options);
  if (saved === null) return { entries: [], tags: {} };

  // A file someone edited by hand (or one from a future version) is checked
  // with the same rules as a save from the page. If it fails, it is set
  // aside like any other damaged file rather than fed into the notebook.
  try {
    if (saved.version !== FILE_VERSION) throw new TypeError(`unknown notebook file version ${saved.version}`);
    return validateNotebook(saved.entries, saved.tags ?? {});
  } catch {
    await setAside(filePath, options.onDamaged ?? (() => {}), options.now ?? Date.now);
    return { entries: [], tags: {} };
  }
}

/** Saves an already-validated notebook (see validate.js validateNotebook). */
export function saveNotebook(folder, { entries, tags }, { now = Date.now } = {}) {
  return writeJsonAtomic(path.join(folder, FILE_NAMES.NOTEBOOK), {
    version: FILE_VERSION,
    savedAt: new Date(now()).toISOString(),
    entries,
    tags,
  });
}

/* ------------------------------------------------------------------ *
 * The unknown-combinations log — CLAUDE.md §6.3's "content roadmap".
 *
 * One record per combination, so the file stays small however long the app
 * is used, and the most-tried gaps are obvious at a glance.
 * ------------------------------------------------------------------ */

/**
 * @param {string}   folder
 * @param {string[]} chemicalIds  already validated and sorted
 */
export async function logUnknownCombination(folder, chemicalIds, { now = Date.now, onDamaged } = {}) {
  const filePath = path.join(folder, FILE_NAMES.UNKNOWN_PAIRS);
  const key = chemicalIds.join('+');
  const time = new Date(now()).toISOString();

  // Read-modify-write goes through the same queue as the write itself, so
  // two combinations logged at once cannot each overwrite the other.
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  const update = previous.catch(() => {}).then(async () => {
    const saved = await readJsonOrSetAside(filePath, { onDamaged, now });
    const log = saved && saved.version === FILE_VERSION && saved.combinations
      ? saved
      : { version: FILE_VERSION, combinations: {} };

    const existing = log.combinations[key];
    log.combinations[key] = existing
      ? { ...existing, count: existing.count + 1, lastSeen: time }
      : { species: chemicalIds, count: 1, firstSeen: time, lastSeen: time };

    await mkdir(folder, { recursive: true });
    const tempPath = `${filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(log, null, 2), 'utf-8');
    await rename(tempPath, filePath);
    return log.combinations[key];
  });
  writeQueues.set(filePath, update);
  return update;
}

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

/** Writes the export to the place the student chose in the Save dialog. */
export function writeExport(filePath, text) {
  return writeFile(filePath, text, 'utf-8');
}

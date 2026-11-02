/**
 * bridge.test.js — proves the page-to-disk bridge (preload.cjs, main/) only
 * ever writes what it should, where it should.
 *
 * Three layers, tested separately because none of them needs Electron:
 *   main/validate.js — refuses anything that is not a real notebook, a real
 *                      chemical, or a sane export;
 *   main/storage.js  — saves atomically, sets damaged files aside, and keeps
 *                      the unknown-combinations log as one record per pair;
 *   main/ipc.js      — refuses messages from any page but ChemLab's own.
 *
 * Run them with:  npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createNotebook } from '../src/core/notebook.js';
import { TOLERANCE } from '../src/core/tools.js';
import chemicals from '../src/data/chemicals.json' with { type: 'json' };
import { CHANNELS } from '../main/channels.js';
import {
  LIMITS,
  validateNotebook,
  validateChemicalIds,
  validateExportText,
} from '../main/validate.js';
import * as storage from '../main/storage.js';
import { registerBridge, isFromAppPage } from '../main/ipc.js';

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const knownIds = new Set(chemicals.map((chemical) => chemical.id));
const [idA, idB, idC] = chemicals.map((chemical) => chemical.id);

/** A notebook holding one of every kind of entry notebook.js can make. */
function realNotebook() {
  const notebook = createNotebook();
  notebook.logAction({ text: 'Added 25 mL of acid to Beaker.', containerId: 'b1', action: 'addChemical', timestamp: 1000 });
  const observation = notebook.recordObservation('It fizzed.');
  notebook.revealReference(observation.id);
  const quantity = Object.keys(TOLERANCE)[0];
  const estimate = notebook.recordEstimate({
    value: 6.5, expected: 7, quantity, tolerance: TOLERANCE[quantity], containerId: 'b1', containerName: 'Beaker',
  });
  notebook.revealReference(estimate.id);
  // Through the same structured-clone step IPC applies on the way to main.
  return structuredClone(notebook.toJSON());
}

async function withTempFolder(run) {
  const folder = await mkdtemp(path.join(tmpdir(), 'chemlab-bridge-'));
  try {
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ *
 * validate.js
 * ------------------------------------------------------------------ */

test('every kind of entry notebook.js really produces passes the save check', () => {
  const entries = realNotebook();
  assert.deepEqual(validateNotebook(entries, { 1: 'reaction' }).entries, entries);
});

test('a notebook entry with a field notebook.js does not have is refused', () => {
  const entries = realNotebook();
  entries[0].sneaky = 'value';
  assert.throws(() => validateNotebook(entries), /unexpected field "sneaky"/);
});

test('a notebook entry with the wrong kind of value is refused', () => {
  const badType = realNotebook();
  badType[0].type = 'script';
  assert.throws(() => validateNotebook(badType), /type must be/);

  const tooLong = realNotebook();
  tooLong[0].text = 'x'.repeat(LIMITS.MAX_TEXT_LENGTH + 1);
  assert.throws(() => validateNotebook(tooLong), /longer than/);

  const missing = realNotebook();
  delete missing[0].timestamp;
  assert.throws(() => validateNotebook(missing), /missing "timestamp"/);
});

test('a notebook that is not a list, too long, or has repeated ids is refused', () => {
  assert.throws(() => validateNotebook({}), /must be a list/);

  const entry = realNotebook()[0];
  const huge = Array.from({ length: LIMITS.MAX_ENTRIES + 1 }, (_, i) => ({ ...entry, id: i + 1 }));
  assert.throws(() => validateNotebook(huge), /more than/);

  assert.throws(() => validateNotebook([entry, { ...entry }]), /same id/);
});

test('a tag must name a real entry and a real tag', () => {
  const entries = realNotebook();
  assert.throws(() => validateNotebook(entries, { 999: 'reaction' }), /not in the notebook/);
  assert.throws(() => validateNotebook(entries, { 1: 'shiny' }), /not a notebook tag/);
});

test('an unknown combination is sorted, de-duplicated and limited to real chemicals', () => {
  assert.deepEqual(validateChemicalIds([idB, idA, idB], knownIds), [idA, idB].sort());
  assert.throws(() => validateChemicalIds([], knownIds), /at least one/);
  assert.throws(() => validateChemicalIds(['not_a_chemical_xyz'], knownIds), /not a chemical/);
  assert.throws(() => validateChemicalIds(['../../etc'], knownIds), /lower-case letters/);
  assert.throws(() => validateChemicalIds('hcl_1m', knownIds), /at least one/);
  const tooMany = Array.from({ length: LIMITS.MAX_SPECIES + 1 }, () => idA);
  assert.throws(() => validateChemicalIds(tooMany, knownIds), /more than/);
});

test('an export must be text and under 1 MB', () => {
  assert.equal(validateExportText('Notebook'), 'Notebook');
  assert.throws(() => validateExportText(42), /must be text/);
  assert.throws(() => validateExportText('x'.repeat(LIMITS.MAX_EXPORT_BYTES + 1)), /larger than 1 MB/);
});

/* ------------------------------------------------------------------ *
 * storage.js
 * ------------------------------------------------------------------ */

test('a saved notebook loads back exactly, tags included, with no temp file left behind', async () => {
  await withTempFolder(async (folder) => {
    const notebook = validateNotebook(realNotebook(), { 1: 'reaction' });
    await storage.saveNotebook(folder, notebook);

    assert.deepEqual(await storage.loadNotebook(folder), notebook);
    assert.deepEqual(await readdir(folder), [storage.FILE_NAMES.NOTEBOOK]);
  });
});

test('the saved notebook restores into notebook.js and carries on numbering', async () => {
  await withTempFolder(async (folder) => {
    const saved = validateNotebook(realNotebook());
    await storage.saveNotebook(folder, saved);
    const { entries } = await storage.loadNotebook(folder);

    const notebook = createNotebook({ load: async () => entries });
    await notebook.restore();
    const next = notebook.logAction({ text: 'Stirred.', containerId: 'b1', action: 'stir', timestamp: 2000 });
    assert.equal(next.id, saved.entries.length + 1);
  });
});

test('first run, with nothing saved yet, gives an empty notebook', async () => {
  await withTempFolder(async (folder) => {
    assert.deepEqual(await storage.loadNotebook(folder), { entries: [], tags: {} });
  });
});

test('a damaged notebook file is set aside, not deleted, and the app starts empty', async () => {
  await withTempFolder(async (folder) => {
    await writeFile(path.join(folder, storage.FILE_NAMES.NOTEBOOK), '{ this is not json', 'utf-8');
    const damaged = [];

    const loaded = await storage.loadNotebook(folder, { onDamaged: (p) => damaged.push(p), now: () => 123 });

    assert.deepEqual(loaded, { entries: [], tags: {} });
    assert.deepEqual(await readdir(folder), ['notebook.damaged-123.json']);
    assert.equal(damaged.length, 1);
  });
});

test('a notebook file that parses but breaks the rules is also set aside', async () => {
  await withTempFolder(async (folder) => {
    const file = path.join(folder, storage.FILE_NAMES.NOTEBOOK);
    await writeFile(file, JSON.stringify({ version: 1, entries: [{ id: 'one' }], tags: {} }), 'utf-8');

    assert.deepEqual(await storage.loadNotebook(folder, { now: () => 7 }), { entries: [], tags: {} });
    assert.deepEqual(await readdir(folder), ['notebook.damaged-7.json']);
  });
});

test('the unknown-combinations log keeps one record per combination and counts repeats', async () => {
  await withTempFolder(async (folder) => {
    let clock = Date.UTC(2026, 10, 2);
    const now = () => clock;
    await storage.logUnknownCombination(folder, [idA, idB], { now });
    clock += 60_000;
    await storage.logUnknownCombination(folder, [idA, idB], { now });

    const log = JSON.parse(await readFile(path.join(folder, storage.FILE_NAMES.UNKNOWN_PAIRS), 'utf-8'));
    const record = log.combinations[`${idA}+${idB}`];
    assert.equal(record.count, 2);
    assert.deepEqual(record.species, [idA, idB]);
    assert.notEqual(record.firstSeen, record.lastSeen);
  });
});

test('combinations logged at the same moment are all kept', async () => {
  await withTempFolder(async (folder) => {
    await Promise.all([
      storage.logUnknownCombination(folder, [idA, idB]),
      storage.logUnknownCombination(folder, [idA, idC]),
      storage.logUnknownCombination(folder, [idB, idC]),
    ]);
    const log = JSON.parse(await readFile(path.join(folder, storage.FILE_NAMES.UNKNOWN_PAIRS), 'utf-8'));
    assert.equal(Object.keys(log.combinations).length, 3);
  });
});

/* ------------------------------------------------------------------ *
 * ipc.js
 * ------------------------------------------------------------------ */

const indexUrl = pathToFileURL(path.join(projectRoot, 'src', 'index.html')).href;
const fromApp = { senderFrame: { url: `${indexUrl}#bench` } };
const fromElsewhere = { senderFrame: { url: 'https://example.com/' } };

function fakeBridge(folder, { dialogResult = { canceled: true } } = {}) {
  const handlers = new Map();
  registerBridge({
    ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
    dialog: { showSaveDialog: async () => dialogResult },
    getDataFolder: () => folder,
    getDocumentsFolder: () => folder,
    getWindow: () => null,
    indexUrl,
    knownChemicalIds: knownIds,
    log: () => {},
  });
  return (channel, event, ...args) => handlers.get(channel)(event, ...args);
}

test('only ChemLab\'s own page is recognised as a sender', () => {
  assert.equal(isFromAppPage(fromApp, indexUrl), true);
  assert.equal(isFromAppPage(fromElsewhere, indexUrl), false);
  assert.equal(isFromAppPage({ senderFrame: null }, indexUrl), false);
  assert.equal(isFromAppPage({ senderFrame: { url: pathToFileURL(path.join(projectRoot, 'other.html')).href } }, indexUrl), false);
});

test('every request from another page is refused before anything is written', async () => {
  await withTempFolder(async (folder) => {
    const send = fakeBridge(folder);
    for (const channel of Object.values(CHANNELS)) {
      assert.throws(() => send(channel, fromElsewhere, [idA]), /did not come from the ChemLab page/);
    }
    assert.deepEqual(await readdir(folder), []);
  });
});

test('a save through the bridge is checked, then written', async () => {
  await withTempFolder(async (folder) => {
    const send = fakeBridge(folder);
    await assert.rejects(send(CHANNELS.SAVE_NOTEBOOK, fromApp, 'not a notebook'), /must be a list/);
    assert.deepEqual(await readdir(folder), []);

    const entries = realNotebook();
    await send(CHANNELS.SAVE_NOTEBOOK, fromApp, entries, { 1: 'reaction' });
    assert.deepEqual(await send(CHANNELS.LOAD_NOTEBOOK, fromApp), { entries, tags: { 1: 'reaction' } });
  });
});

test('an export goes only where the Save dialog points, and only the file name comes back', async () => {
  await withTempFolder(async (folder) => {
    const cancelled = fakeBridge(folder);
    assert.deepEqual(await cancelled(CHANNELS.EXPORT_NOTEBOOK, fromApp, 'Notebook'), { saved: false });
    assert.deepEqual(await readdir(folder), []);

    const chosen = path.join(folder, 'my notebook.txt');
    const saving = fakeBridge(folder, { dialogResult: { canceled: false, filePath: chosen } });
    assert.deepEqual(await saving(CHANNELS.EXPORT_NOTEBOOK, fromApp, 'Notebook'), { saved: true, fileName: 'my notebook.txt' });
    assert.equal(await readFile(chosen, 'utf-8'), 'Notebook');
  });
});

/* ------------------------------------------------------------------ *
 * preload.cjs
 * ------------------------------------------------------------------ */

test('preload.cjs uses exactly the message names main/channels.js defines', async () => {
  const preload = await readFile(path.join(projectRoot, 'preload.cjs'), 'utf-8');
  const block = preload.match(/const CHANNELS = \{([\s\S]*?)\};/);
  assert.ok(block, 'preload.cjs should define its CHANNELS block');

  const fromPreload = Object.fromEntries(
    [...block[1].matchAll(/(\w+):\s*'([^']+)'/g)].map(([, key, value]) => [key, value]),
  );
  assert.deepEqual(fromPreload, { ...CHANNELS });
});

test('preload.cjs never hands the page ipcRenderer itself', async () => {
  const preload = await readFile(path.join(projectRoot, 'preload.cjs'), 'utf-8');
  const exposed = preload.slice(preload.indexOf('exposeInMainWorld'));
  assert.doesNotMatch(exposed, /:\s*ipcRenderer\s*[,}]/);
  assert.equal((exposed.match(/ipcRenderer\.invoke\(/g) || []).length, 4);
});

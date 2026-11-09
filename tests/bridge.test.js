/**
 * bridge.test.js — proves the page-to-disk bridge (preload.cjs, main/) only
 * ever writes what it should, where it should.
 *
 * Three layers, tested separately because none of them needs Electron:
 *   main/validate.js — refuses anything that is not a real notebook, a real
 *                      chemical, a sane export, or a well-formed report;
 *   main/storage.js  — saves atomically, sets damaged files aside, keeps
 *                      the unknown-combinations log as one record per pair,
 *                      and keeps every "This looks wrong" report in order;
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
import reactions from '../src/data/reactions.json' with { type: 'json' };
import { CHANNELS } from '../main/channels.js';
import {
  LIMITS,
  validateNotebook,
  validateChemicalIds,
  validateExportText,
  validateProblemReport,
} from '../main/validate.js';
import * as storage from '../main/storage.js';
import { registerBridge, isFromAppPage } from '../main/ipc.js';

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const knownIds = new Set(chemicals.map((chemical) => chemical.id));
const [idA, idB, idC] = chemicals.map((chemical) => chemical.id);
const knownReactionIds = new Set(reactions.map((reaction) => reaction.id));
const known = { knownReactionIds, knownChemicalIds: knownIds };

/** A report shaped exactly as src/ui/app.js builds one. */
function realReport() {
  return {
    reactionIds: [reactions[0].id],
    outcome: 'reaction',
    notebookText: 'Added 10 mL of acid to Beaker 1. HCl + NaOH → NaCl + H₂O. The mixture warmed by about 7 °C.',
    note: 'I expected it to get hotter.',
    vessel: {
      name: 'Beaker 1', speciesIds: [idA, idB], volumeMl: 20, temperatureC: 32, heatLevel: 0, electrified: false, pH: 7,
    },
  };
}

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

test('a well-formed report passes, and every field is checked', () => {
  assert.deepEqual(validateProblemReport(realReport(), known), realReport());
  assert.deepEqual(validateProblemReport({ ...realReport(), note: '' }, known).note, '');

  const cases = [
    [(r) => { r.extra = 1; }, /unexpected field "extra"/],
    [(r) => { delete r.note; }, /missing "note"/],
    [(r) => { r.reactionIds = ['rxn_not_real_xyz']; }, /not in the lab's data/],
    [(r) => { r.reactionIds = []; }, /at least one id/],
    [(r) => { r.outcome = 'unknown'; }, /outcome must be/],
    [(r) => { r.note = 'x'.repeat(LIMITS.MAX_NOTE_LENGTH + 1); }, /longer than/],
    [(r) => { r.vessel.speciesIds = ['../../etc']; }, /lower-case letters/],
    [(r) => { r.vessel.heatLevel = 7; }, /heat level/],
    [(r) => { r.vessel.pH = 'acidic'; }, /pH must be/],
    [(r) => { r.vessel.secret = true; }, /unexpected field "secret"/],
  ];
  for (const [spoil, reason] of cases) {
    const report = realReport();
    spoil(report);
    assert.throws(() => validateProblemReport(report, known), reason);
  }
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

test('reports are kept in order, numbered and dated, with no temp file left behind', async () => {
  await withTempFolder(async (folder) => {
    const now = () => Date.UTC(2026, 10, 10, 9, 30);
    assert.deepEqual(await storage.appendProblemReport(folder, realReport(), { now, appVersion: '1.2.3' }), { number: 1 });
    assert.deepEqual(await storage.appendProblemReport(folder, { ...realReport(), note: 'second' }, { now }), { number: 2 });

    const file = JSON.parse(await readFile(path.join(folder, storage.FILE_NAMES.REPORTS), 'utf-8'));
    assert.equal(file.reports.length, 2);
    assert.deepEqual(file.reports[0], { number: 1, reportedAt: '2026-11-10T09:30:00.000Z', appVersion: '1.2.3', ...realReport() });
    assert.equal(file.reports[1].note, 'second');
    assert.deepEqual(await readdir(folder), [storage.FILE_NAMES.REPORTS]);
  });
});

test('reports sent at the same moment are all kept', async () => {
  await withTempFolder(async (folder) => {
    await Promise.all([1, 2, 3].map((n) => storage.appendProblemReport(folder, { ...realReport(), note: `n${n}` })));
    const file = JSON.parse(await readFile(path.join(folder, storage.FILE_NAMES.REPORTS), 'utf-8'));
    assert.deepEqual(file.reports.map((r) => r.note).sort(), ['n1', 'n2', 'n3']);
  });
});

test('a full reports file refuses more, and says to collect it', async () => {
  await withTempFolder(async (folder) => {
    const full = { version: 1, reports: Array.from({ length: storage.MAX_REPORTS }, (_, i) => ({ number: i + 1 })) };
    await writeFile(path.join(folder, storage.FILE_NAMES.REPORTS), JSON.stringify(full), 'utf-8');
    await assert.rejects(storage.appendProblemReport(folder, realReport()), /Ask your teacher to collect it/);
  });
});

test('a damaged reports file is set aside, not deleted, and a fresh one is started', async () => {
  await withTempFolder(async (folder) => {
    await writeFile(path.join(folder, storage.FILE_NAMES.REPORTS), '{ broken', 'utf-8');
    await storage.appendProblemReport(folder, realReport(), { now: () => 55 });
    assert.deepEqual((await readdir(folder)).sort(), ['reports.damaged-55.json', 'reports.json']);
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
    knownReactionIds,
    getAppVersion: () => '9.9.9',
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

test('a report through the bridge is checked, then added to reports.json', async () => {
  await withTempFolder(async (folder) => {
    const send = fakeBridge(folder);
    await assert.rejects(send(CHANNELS.REPORT_PROBLEM, fromApp, { ...realReport(), outcome: 'maybe' }), /outcome must be/);
    assert.deepEqual(await readdir(folder), []);

    assert.deepEqual(await send(CHANNELS.REPORT_PROBLEM, fromApp, realReport()), { number: 1 });
    const file = JSON.parse(await readFile(path.join(folder, storage.FILE_NAMES.REPORTS), 'utf-8'));
    assert.equal(file.reports[0].appVersion, '9.9.9');
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
  assert.equal((exposed.match(/ipcRenderer\.invoke\(/g) || []).length, Object.keys(CHANNELS).length);
});

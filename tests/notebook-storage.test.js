/**
 * notebook-storage.test.js — the page's half of saving the notebook
 * (src/ui/notebook-storage.js) and the plain-text export
 * (src/ui/notebook-export.js).
 *
 * Neither needs Electron or a browser: the saver is handed a stand-in for
 * window.chemlab, and the export is a pure function of the notebook.
 *
 * Run them with:  npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createNotebookSaver, storageAvailable, loadSavedNotebook } from '../src/ui/notebook-storage.js';
import { formatNotebookForExport } from '../src/ui/notebook-export.js';

/** A stand-in bridge whose saves finish only when the test says so. */
function slowBridge() {
  const calls = [];
  return {
    calls,
    saveNotebook(entries, tags) {
      let finish;
      let fail;
      const done = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
      calls.push({ entries, tags, finish, fail });
      return done;
    },
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('outside the desktop app nothing is saved, and the page says so', async () => {
  assert.equal(storageAvailable, false);
  assert.deepEqual(await loadSavedNotebook(), { entries: [], tags: {}, error: null });
});

test('a burst of changes is saved once in flight and once more with the latest state', async () => {
  const target = slowBridge();
  let version = 0;
  const saver = createNotebookSaver({
    getSnapshot: () => ({ entries: [`version ${version}`], tags: {} }),
    onError: () => {},
    target,
  });

  saver.save();
  for (version = 1; version <= 5; version += 1) saver.save();
  assert.equal(target.calls.length, 1, 'only one save may be on its way to disk at a time');

  target.calls[0].finish();
  await tick();
  assert.equal(target.calls.length, 2, 'the changes that piled up go out in one more save');
  assert.deepEqual(target.calls[1].entries, ['version 6'], 'and that save carries the newest notebook');

  target.calls[1].finish();
  await tick();
  assert.equal(target.calls.length, 2, 'nothing left to save, so nothing more is sent');
});

test('a failed save is reported in plain words, and cleared by the next one that works', async () => {
  const target = slowBridge();
  const reported = [];
  const saver = createNotebookSaver({ getSnapshot: () => ({ entries: [], tags: {} }), onError: (m) => reported.push(m), target });

  saver.save();
  target.calls[0].fail(new Error("Error invoking remote method 'chemlab:notebook-save': TypeError: the notebook has more than 5000 entries"));
  await tick();
  assert.deepEqual(reported, ['The notebook could not be saved: the notebook has more than 5000 entries']);

  saver.save();
  target.calls[1].finish();
  await tick();
  assert.equal(reported.at(-1), null);
});

test('the export lays out every line, and copies a revealed comparison across honestly', () => {
  const at = new Date(2026, 10, 2, 14, 5).getTime();
  const entries = [
    { id: 1, type: 'auto', tag: 'reaction', timestamp: at, text: 'A white precipitate formed.', revealed: false },
    { id: 2, type: 'observation', tag: 'observation', timestamp: at, text: 'Cloudy white.', revealed: true,
      measured: 'Cloudy white.', expected: 'A white precipitate formed.', matched: 'near-miss' },
    { id: 3, type: 'observation', tag: 'estimate', timestamp: at, text: 'Estimated temperature: 30 °C.', revealed: true,
      measured: 30, expected: 31, unit: '°C', matched: 'match' },
    { id: 4, type: 'observation', tag: 'observation', timestamp: at, text: 'Not compared yet.', revealed: false,
      measured: 'Not compared yet.', expected: null, matched: null },
  ];

  const text = formatNotebookForExport(entries, (entry) => entry.tag, new Date(at));
  const lines = text.split('\r\n');

  assert.equal(lines[0], 'Virtual Chemistry Lab - Lab notebook');
  assert.ok(lines.includes('[14:05]  REACTION: A white precipitate formed.'));
  assert.ok(lines.includes('         Rating: near-miss (a rough steer, not a grade)'), 'text comparisons keep their warning');
  assert.ok(lines.includes('         Reference: 31 °C'));
  assert.ok(lines.includes('         Rating: match'), 'a numeric comparison is exact, so it carries no warning');
  assert.equal(text.match(/Reference:/g).length, 2, 'an unrevealed observation never gives its answer away');
  assert.ok(text.endsWith('\r\n'));
});

test('an empty notebook still exports something readable', () => {
  assert.match(formatNotebookForExport([], () => ''), /\(The notebook is empty\.\)/);
});

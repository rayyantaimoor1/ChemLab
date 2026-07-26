/**
 * notebook.test.js — proves the notebook logs every action automatically
 * (CLAUDE.md section 7) and that recordObservation / revealReference behave
 * the way UI.md's "compare with reference" feature needs.
 *
 * Run them with:  npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createNotebook, MATCH } from '../src/core/notebook.js';
import { createActions } from '../src/core/actions.js';
import { createContainer } from '../src/core/container.js';
import { createEngine } from '../src/core/engine.js';

/* ------------------------------------------------------------------ *
 * A fake action entry, shaped exactly like what actions.js hands to
 * onNotebookEntry — { text, containerId, action, timestamp }.
 * ------------------------------------------------------------------ */

function fakeActionEntry(overrides = {}) {
  return {
    text: 'Added 25 mL of Test acid to Beaker.',
    containerId: 'b1',
    action: 'addChemical',
    timestamp: 1000,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * Automatic entries (CLAUDE.md section 7)
 * ------------------------------------------------------------------ */

test('a new notebook is empty', () => {
  const notebook = createNotebook();
  assert.equal(notebook.isEmpty(), true);
  assert.deepEqual(notebook.getEntries(), []);
});

test('logAction writes an automatic entry with the given text', () => {
  const notebook = createNotebook();
  const entry = notebook.logAction(fakeActionEntry({ text: 'Added 25 mL of acid to Beaker.' }));

  assert.equal(entry.type, 'auto');
  assert.equal(entry.text, 'Added 25 mL of acid to Beaker.');
  assert.equal(entry.containerId, 'b1');
  assert.equal(entry.action, 'addChemical');
  assert.equal(notebook.isEmpty(), false);
});

test('logAction refuses an entry with no text', () => {
  const notebook = createNotebook();
  assert.throws(() => notebook.logAction({ containerId: 'b1' }), TypeError);
});

test('several automatic entries appear in the order they happened', () => {
  const notebook = createNotebook();
  notebook.logAction(fakeActionEntry({ text: 'first', timestamp: 1 }));
  notebook.logAction(fakeActionEntry({ text: 'second', timestamp: 2 }));
  notebook.logAction(fakeActionEntry({ text: 'third', timestamp: 3 }));

  assert.deepEqual(
    notebook.getEntries().map((entry) => entry.text),
    ['first', 'second', 'third']
  );
});

test('automatic entries never carry a measured, expected or matched value', () => {
  const notebook = createNotebook();
  const entry = notebook.logAction(fakeActionEntry());

  assert.equal(entry.measured, null);
  assert.equal(entry.expected, null);
  assert.equal(entry.matched, null);
});

/* ------------------------------------------------------------------ *
 * recordObservation(text) — UI.md section 1's exact signature
 * ------------------------------------------------------------------ */

test('recordObservation takes exactly one argument: the text', () => {
  const notebook = createNotebook();
  assert.equal(notebook.recordObservation.length, 1);
});

test('recordObservation writes the student own words', () => {
  const notebook = createNotebook();
  const entry = notebook.recordObservation('The liquid turned yellow.');

  assert.equal(entry.type, 'observation');
  assert.equal(entry.text, 'The liquid turned yellow.');
  assert.equal(entry.measured, 'The liquid turned yellow.');
});

test('recordObservation refuses empty or missing text', () => {
  const notebook = createNotebook();
  assert.throws(() => notebook.recordObservation(''), TypeError);
  assert.throws(() => notebook.recordObservation('   '), TypeError);
  assert.throws(() => notebook.recordObservation(), TypeError);
});

test('an observation hides the reference and match rating until revealed', () => {
  const notebook = createNotebook();
  notebook.logAction(fakeActionEntry({ text: 'A yellow precipitate formed.' }));
  const entry = notebook.recordObservation('I saw a yellow solid form.');

  assert.equal(entry.expected, null);
  assert.equal(entry.matched, null);
  assert.equal(entry.revealed, false);
});

/* ------------------------------------------------------------------ *
 * revealReference(notebookEntryId) — UI.md section 1's exact signature
 * ------------------------------------------------------------------ */

test('revealReference takes exactly one argument: the entry id', () => {
  const notebook = createNotebook();
  assert.equal(notebook.revealReference.length, 1);
});

test('revealReference shows the reference text captured when the observation was written', () => {
  const notebook = createNotebook();
  notebook.logAction(fakeActionEntry({ text: 'A yellow precipitate formed.' }));
  const written = notebook.recordObservation('I saw a yellow solid form.');

  const revealed = notebook.revealReference(written.id);

  assert.equal(revealed.revealed, true);
  assert.equal(revealed.expected, 'A yellow precipitate formed.');
});

test('once revealed, getEntries also shows the reference from then on', () => {
  const notebook = createNotebook();
  notebook.logAction(fakeActionEntry({ text: 'A yellow precipitate formed.' }));
  const written = notebook.recordObservation('I saw a yellow solid form.');
  notebook.revealReference(written.id);

  const stored = notebook.getEntries().find((entry) => entry.id === written.id);
  assert.equal(stored.expected, 'A yellow precipitate formed.');
  assert.notEqual(stored.matched, null);
});

test('revealReference complains about an id that does not exist', () => {
  const notebook = createNotebook();
  assert.throws(() => notebook.revealReference(999), /no notebook entry with id 999/);
});

test('revealReference refuses to run on an automatic entry', () => {
  const notebook = createNotebook();
  const auto = notebook.logAction(fakeActionEntry());

  assert.throws(() => notebook.revealReference(auto.id), /not a student observation/);
});

test('an observation written before anything happened has no reference to reveal', () => {
  const notebook = createNotebook();
  const written = notebook.recordObservation('Nothing was in the beaker yet.');

  const revealed = notebook.revealReference(written.id);

  assert.equal(revealed.revealed, true);
  assert.equal(revealed.expected, null);
  assert.equal(revealed.matched, null); // nothing to compare against, not a "miss"
});

/* ------------------------------------------------------------------ *
 * The match rating is a rough steer, not a grade — but it should still
 * behave sensibly on clear cases.
 * ------------------------------------------------------------------ */

test('wording that shares the reference vocabulary rates as a match', () => {
  const notebook = createNotebook();
  notebook.logAction(fakeActionEntry({ text: 'A bright yellow precipitate formed and the mixture warmed.' }));
  const written = notebook.recordObservation('I saw a bright yellow precipitate form and it warmed up.');

  const revealed = notebook.revealReference(written.id);
  assert.equal(revealed.matched, MATCH.MATCH);
});

test('wording that shares nothing with the reference rates as a miss', () => {
  const notebook = createNotebook();
  notebook.logAction(fakeActionEntry({ text: 'A bright yellow precipitate formed.' }));
  const written = notebook.recordObservation('Absolutely nothing changed at all.');

  const revealed = notebook.revealReference(written.id);
  assert.equal(revealed.matched, MATCH.MISS);
});

test('wording that shares some but not most of the vocabulary rates as partial', () => {
  const notebook = createNotebook();
  notebook.logAction(
    fakeActionEntry({ text: 'A bright yellow precipitate formed and bubbles of hydrogen appeared.' })
  );
  const written = notebook.recordObservation('I think some yellow stuff appeared.');

  const revealed = notebook.revealReference(written.id);
  assert.equal(revealed.matched, MATCH.PARTIAL);
});

test('the match rating is symmetric under harmless case and punctuation changes', () => {
  const notebook = createNotebook();
  notebook.logAction(fakeActionEntry({ text: 'A bright yellow precipitate formed.' }));
  const written = notebook.recordObservation('BRIGHT, YELLOW precipitate!! formed.');

  const revealed = notebook.revealReference(written.id);
  assert.equal(revealed.matched, MATCH.MATCH);
});

/* ------------------------------------------------------------------ *
 * clear() / resetBench support
 * ------------------------------------------------------------------ */

test('clear empties the notebook and forgets the current reference', () => {
  const notebook = createNotebook();
  notebook.logAction(fakeActionEntry({ text: 'Something happened.' }));
  notebook.recordObservation('I saw it.');

  notebook.clear();

  assert.equal(notebook.isEmpty(), true);
  const written = notebook.recordObservation('Starting fresh.');
  assert.equal(written.expected, null); // reference was forgotten, not carried over
});

test('clear is a full reset, so ids are allowed to start again from 1', () => {
  const notebook = createNotebook();
  notebook.logAction(fakeActionEntry());
  notebook.clear();
  const afterClear = notebook.logAction(fakeActionEntry());

  // This is fine, not a bug: clear() removes every old entry, so there is
  // nothing still around for a reused id to collide with.
  assert.equal(afterClear.id, 1);
});

/* ------------------------------------------------------------------ *
 * Nothing here touches the DOM or the filesystem directly
 * ------------------------------------------------------------------ */

test('getEntries returns frozen data a tool cannot quietly edit', () => {
  const notebook = createNotebook();
  notebook.logAction(fakeActionEntry());
  const entries = notebook.getEntries();

  assert.throws(() => {
    'use strict';
    entries[0].text = 'tampered';
  });
});

/* ------------------------------------------------------------------ *
 * Persistence: save() / load() are injected, never touched directly
 * ------------------------------------------------------------------ */

function makeMemoryStorage() {
  let stored = null;
  return {
    save: async (entries) => {
      stored = JSON.parse(JSON.stringify(entries));
    },
    load: async () => (stored ? JSON.parse(JSON.stringify(stored)) : []),
    peek: () => stored,
  };
}

test('persist() refuses to run without a save function configured', async () => {
  const notebook = createNotebook();
  await assert.rejects(() => notebook.persist(), /needs createNotebook\({ save }\)/);
});

test('restore() refuses to run without a load function configured', async () => {
  const notebook = createNotebook();
  await assert.rejects(() => notebook.restore(), /needs createNotebook\({ load }\)/);
});

test('persist() hands the full, unredacted entries to save()', async () => {
  const storage = makeMemoryStorage();
  const notebook = createNotebook({ save: storage.save, load: storage.load });

  notebook.logAction(fakeActionEntry({ text: 'A yellow precipitate formed.' }));
  const written = notebook.recordObservation('I saw yellow solid.');
  notebook.revealReference(written.id);

  await notebook.persist();

  const saved = storage.peek();
  assert.equal(saved.length, 2);
  const savedObservation = saved.find((entry) => entry.id === written.id);
  // Unlike getEntries(), what actually gets saved is not redacted - a reload
  // must be able to bring back an already-revealed entry as still revealed.
  assert.equal(savedObservation.expected, 'A yellow precipitate formed.');
  assert.equal(savedObservation.revealed, true);
});

test('restore() brings a saved notebook back exactly as it was', async () => {
  const storage = makeMemoryStorage();
  const writer = createNotebook({ save: storage.save, load: storage.load });
  writer.logAction(fakeActionEntry({ text: 'A yellow precipitate formed.' }));
  const written = writer.recordObservation('I saw yellow solid.');
  writer.revealReference(written.id);
  await writer.persist();

  const reader = createNotebook({ save: storage.save, load: storage.load });
  await reader.restore();

  assert.deepEqual(reader.getEntries(), writer.getEntries());
});

test('restore() picks up new ids past whatever was loaded, so nothing collides', async () => {
  const storage = makeMemoryStorage();
  const writer = createNotebook({ save: storage.save, load: storage.load });
  writer.logAction(fakeActionEntry());
  writer.logAction(fakeActionEntry());
  await writer.persist();

  const reader = createNotebook({ save: storage.save, load: storage.load });
  await reader.restore();
  const next = reader.logAction(fakeActionEntry({ text: 'newly added after restore' }));

  const existingIds = reader.getEntries().map((entry) => entry.id);
  assert.ok(!existingIds.slice(0, -1).includes(next.id));
});

test('restore() picks the reference back up from the last automatic entry', async () => {
  const storage = makeMemoryStorage();
  const writer = createNotebook({ save: storage.save, load: storage.load });
  writer.logAction(fakeActionEntry({ text: 'first thing' }));
  writer.logAction(fakeActionEntry({ text: 'most recent thing' }));
  await writer.persist();

  const reader = createNotebook({ save: storage.save, load: storage.load });
  await reader.restore();
  const written = reader.recordObservation('my guess');
  const revealed = reader.revealReference(written.id); // expected is redacted until revealed

  assert.equal(revealed.expected, 'most recent thing');
});

test('restore() with nothing ever saved leaves an empty notebook, not an error', async () => {
  const storage = makeMemoryStorage();
  const notebook = createNotebook({ save: storage.save, load: storage.load });

  await notebook.restore();

  assert.equal(notebook.isEmpty(), true);
});

test('restore() refuses a load() that does not resolve to an array', async () => {
  const notebook = createNotebook({ save: async () => {}, load: async () => 'not an array' });
  await assert.rejects(() => notebook.restore(), TypeError);
});

/* ------------------------------------------------------------------ *
 * Real disk I/O — proves the save/load CONTRACT works against a genuine
 * JSON file, using plain Node's fs. This is exactly the logic that would
 * sit behind main.js's real save/load functions once they read and write
 * inside Electron's app.getPath('userData') folder; fs behaves the same
 * whether Electron's main process is running it or plain Node is.
 * ------------------------------------------------------------------ */

test('persist() and restore() work against a real JSON file on disk', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'chemlab-notebook-'));
  const filePath = path.join(dir, 'notebook.json');

  try {
    const fileSave = async (plainEntries) => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(filePath, JSON.stringify(plainEntries, null, 2), 'utf-8');
    };
    const fileLoad = async () => {
      try {
        const raw = await readFile(filePath, 'utf-8');
        return JSON.parse(raw);
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
    };

    const writer = createNotebook({ save: fileSave, load: fileLoad });
    writer.logAction(fakeActionEntry({ text: 'Added 25 mL of acid to Beaker.' }));
    const written = writer.recordObservation('It stayed colourless.');
    writer.revealReference(written.id);
    await writer.persist();

    const onDisk = JSON.parse(await readFile(filePath, 'utf-8'));
    assert.equal(onDisk.length, 2);
    assert.equal(onDisk[0].text, 'Added 25 mL of acid to Beaker.');

    const reader = createNotebook({ save: fileSave, load: fileLoad });
    await reader.restore();

    assert.deepEqual(reader.getEntries(), writer.getEntries());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('restore() from a file that does not exist yet is treated as an empty notebook', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'chemlab-notebook-'));
  const filePath = path.join(dir, 'does-not-exist.json');

  try {
    const fileLoad = async () => {
      try {
        const raw = await readFile(filePath, 'utf-8');
        return JSON.parse(raw);
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
    };

    const notebook = createNotebook({ save: async () => {}, load: fileLoad });
    await notebook.restore();

    assert.equal(notebook.isEmpty(), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * Wired directly into actions.js, the way the real bench will use it
 * ------------------------------------------------------------------ */

test('notebook.logAction plugs straight into actions.js onNotebookEntry', () => {
  const chemicals = [
    { id: 'acid', name: 'Test acid', state: 'aqueous', pH: 1.0 },
    { id: 'alkali', name: 'Test alkali', state: 'aqueous', pH: 13.0 },
    { id: 'salt_solution', name: 'Test salt', state: 'aqueous', pH: 7.0 },
    { id: 'water', name: 'Test water', state: 'liquid', pH: 7.0 },
  ];
  const reactions = [
    {
      id: 'rxn_test',
      reactants: ['acid', 'alkali'],
      conditions: { requiresHeat: false, minTempC: null, catalyst: null },
      products: ['salt_solution', 'water'],
      equation: 'Acid + Alkali → Salt + Water',
      effects: {
        colorToHex: '#EEF3F5', precipitate: null, gas: null, bubbles: false,
        smoke: false, tempDeltaC: 7, resultPH: 7.0,
      },
      explanation: 'Test.',
      levels: ['matric'],
      source: 'fixture',
    },
  ];

  const engine = createEngine({ chemicals, reactions });
  const notebook = createNotebook();
  const containers = new Map();
  const getChemical = engine.getChemical;
  const b1 = createContainer({ id: 'b1', name: 'Beaker', capacityMl: 250, getChemical });
  containers.set('b1', b1);

  const actions = createActions({
    getContainer: (id) => containers.get(id),
    engine,
    onNotebookEntry: notebook.logAction,
  });

  actions.addChemical('b1', 'acid', 25);
  actions.addChemical('b1', 'alkali', 25);

  const entries = notebook.getEntries();
  assert.equal(entries.length, 2);
  assert.ok(entries[1].text.includes('warmed'));

  const observation = notebook.recordObservation('It got warm and turned clear.');
  const revealed = notebook.revealReference(observation.id);
  assert.equal(revealed.expected, entries[1].text);
});

/* ------------------------------------------------------------------ *
 * A full bench session: pouring, heating, and notebook generation together
 * ------------------------------------------------------------------ */

test('a full session across two containers: pour, heat, and the notebook fills in throughout', async () => {
  const { engine } = await import('../src/core/engine.js');
  const notebook = createNotebook();
  const containers = new Map();
  const register = (container) => containers.set(container.id, container);

  register(createContainer({ id: 'flask', name: 'Flask', capacityMl: 250, getChemical: engine.getChemical }));
  register(createContainer({ id: 'tube', name: 'Test tube', capacityMl: 50, getChemical: engine.getChemical }));

  const actions = createActions({
    getContainer: (id) => containers.get(id),
    engine,
    onNotebookEntry: notebook.logAction,
  });

  // Fill the flask, pour some into a test tube, then heat the tube to run a
  // reaction that needs heat.
  actions.addChemical('flask', 'zn_metal', 5);
  actions.addChemical('flask', 'hcl_1m', 40);
  const pourResult = actions.pour('flask', 'tube', 20);
  actions.setHeat('tube', 2);
  actions.stir('tube');

  const entries = notebook.getEntries();

  assert.equal(entries.length, 5);
  assert.deepEqual(
    entries.map((entry) => entry.action),
    ['addChemical', 'addChemical', 'pour', 'setHeat', 'stir']
  );

  // The pour genuinely moved liquid, and the flask still shows the zinc
  // reacting with whatever acid it kept.
  assert.equal(pourResult.poured, 20);
  assert.ok(containers.get('tube').getVolumeMl() > 0);

  // The student can now write down what they saw and check it.
  const observation = notebook.recordObservation('Bubbles came off the metal.');
  const revealed = notebook.revealReference(observation.id);
  assert.equal(revealed.expected, entries[4].text);
  assert.notEqual(revealed.matched, null);
});

/**
 * ipc.js — answers the five requests the page is allowed to make.
 *
 * WHY THIS FILE EXISTS
 * The page cannot touch the disk (contextIsolation, sandbox, no Node). When
 * it needs something saved it calls one of the five functions preload.cjs
 * puts on window.chemlab, and that arrives here as an IPC message. This file
 * is the switchboard: for each message it
 *   1. checks the message really came from the app's own page (not some
 *      other page a bug might have navigated to),
 *   2. checks what was sent, with main/validate.js, and
 *   3. hands the cleaned-up value to main/storage.js, which does the writing.
 *
 * The page never names a file or a folder. Where things are saved is decided
 * here and in storage.js, and an export goes only where the person at the
 * computer points the Save dialog.
 */

import path from 'node:path';

import { CHANNELS } from './channels.js';
import { validateNotebook, validateChemicalIds, validateExportText, validateProblemReport } from './validate.js';
import * as storage from './storage.js';

/**
 * True only for messages from the app's own index.html. Query strings and
 * #fragments are ignored, since they do not change which page it is.
 */
export function isFromAppPage(event, indexUrl) {
  const url = event?.senderFrame?.url;
  if (!url) return false;
  try {
    const sender = new URL(url);
    const expected = new URL(indexUrl);
    return sender.protocol === expected.protocol && sender.pathname === expected.pathname;
  } catch {
    return false;
  }
}

function todayStamp(now) {
  return new Date(now()).toISOString().slice(0, 10);
}

/**
 * @param {object}   deps
 * @param {object}   deps.ipcMain           Electron's ipcMain
 * @param {object}   deps.dialog            Electron's dialog
 * @param {Function} deps.getDataFolder     () => app.getPath('userData')
 * @param {Function} deps.getDocumentsFolder () => app.getPath('documents')
 * @param {Function} deps.getWindow         () => the BrowserWindow to attach dialogs to
 * @param {string}   deps.indexUrl          file:// URL of src/index.html
 * @param {Set<string>} deps.knownChemicalIds every id in chemicals.json
 * @param {Set<string>} [deps.knownReactionIds] every id in reactions.json
 * @param {Function} [deps.getAppVersion]  () => the app's version, stamped on reports
 * @param {Function} [deps.log]             where to report damaged files
 * @param {Function} [deps.now]
 */
export function registerBridge({
  ipcMain,
  dialog,
  getDataFolder,
  getDocumentsFolder,
  getWindow,
  indexUrl,
  knownChemicalIds,
  knownReactionIds = new Set(),
  getAppVersion = () => null,
  log = console.warn,
  now = Date.now,
}) {
  const onDamaged = (damagedPath) => log(`A damaged file was set aside as ${damagedPath}`);

  function handle(channel, handler) {
    ipcMain.handle(channel, (event, ...args) => {
      if (!isFromAppPage(event, indexUrl)) {
        throw new Error('Refused: this request did not come from the ChemLab page');
      }
      return handler(...args);
    });
  }

  handle(CHANNELS.LOAD_NOTEBOOK, () => storage.loadNotebook(getDataFolder(), { onDamaged, now }));

  handle(CHANNELS.SAVE_NOTEBOOK, async (entries, tags) => {
    const notebook = validateNotebook(entries, tags ?? {});
    await storage.saveNotebook(getDataFolder(), notebook, { now });
  });

  handle(CHANNELS.LOG_UNKNOWN, async (chemicalIds) => {
    const ids = validateChemicalIds(chemicalIds, knownChemicalIds);
    await storage.logUnknownCombination(getDataFolder(), ids, { now, onDamaged });
  });

  // A student's "This looks wrong" report (BUILD_PHASE_2.md 2.1.4). Only
  // the report's number goes back, for a "Thank you" message.
  handle(CHANNELS.REPORT_PROBLEM, async (report) => {
    const checked = validateProblemReport(report, { knownReactionIds, knownChemicalIds });
    return storage.appendProblemReport(getDataFolder(), checked, { now, onDamaged, appVersion: getAppVersion() });
  });

  handle(CHANNELS.EXPORT_NOTEBOOK, async (text) => {
    const content = validateExportText(text);
    const { canceled, filePath } = await dialog.showSaveDialog(getWindow(), {
      title: 'Save a copy of the lab notebook',
      defaultPath: path.join(getDocumentsFolder(), `ChemLab notebook ${todayStamp(now)}.txt`),
      filters: [{ name: 'Text file', extensions: ['txt'] }],
    });
    if (canceled || !filePath) return { saved: false };

    await storage.writeExport(filePath, content);
    // Only the file's name goes back to the page, for a "Saved as ..."
    // message. The page has no use for the full path on disk.
    return { saved: true, fileName: path.basename(filePath) };
  });
}

/** Removes every handler again (used by tests). */
export function unregisterBridge(ipcMain) {
  for (const channel of Object.values(CHANNELS)) ipcMain.removeHandler(channel);
}

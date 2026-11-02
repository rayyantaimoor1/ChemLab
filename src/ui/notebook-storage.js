/**
 * notebook-storage.js — the page's side of the save/load bridge.
 *
 * WHY THIS FILE EXISTS
 * The page cannot touch the disk. In the desktop app, preload.cjs puts four
 * functions on window.chemlab that ask the Electron main process to save and
 * load for it (see main/ipc.js). This file is the only place in src/ that
 * talks to them, so app.js never has to care whether they are there.
 *
 * They are NOT there when the UI runs in a plain browser through
 * scripts/dev-server.mjs. Everything here still works then - the notebook
 * just lives only in memory, and storageAvailable says so honestly so the
 * notebook panel can tell the student their work will not be kept.
 *
 * SAVING WITHOUT FLOODING THE DISK
 * A busy bench can add several notebook lines in a second. Saves are
 * coalesced: at most one is ever on its way to disk, and however many
 * changes pile up behind it, they go in a single save of the latest state
 * once it lands. Nothing waits on a timer, so closing the app loses at most
 * the save that was already in flight.
 */

const bridge = typeof window !== 'undefined' && window.chemlab ? window.chemlab : null;

/** True in the desktop app; false in a plain browser via the dev server. */
export const storageAvailable = Boolean(bridge);

/**
 * The notebook saved last time, or an empty one.
 * @returns {Promise<{ entries: object[], tags: Record<string, string>, error: string|null }>}
 */
export async function loadSavedNotebook() {
  if (!bridge) return { entries: [], tags: {}, error: null };
  try {
    const saved = await bridge.loadNotebook();
    return { entries: saved.entries, tags: saved.tags, error: null };
  } catch (error) {
    // Starting with an empty notebook is better than not starting at all.
    // main/storage.js has already set any damaged file aside, so nothing is
    // lost by carrying on.
    console.error('Could not load the saved notebook:', error);
    return { entries: [], tags: {}, error: 'The saved notebook could not be opened, so this one starts empty.' };
  }
}

/**
 * @param {object}   options
 * @param {Function} options.getSnapshot  () => ({ entries, tags }) - read at
 *   the moment a save actually goes out, so it is always the latest state.
 * @param {Function} options.onError      (message|null) => void - called with
 *   a plain-English message when a save fails, and with null once one works.
 * @param {object}   [options.target]     what to save through; window.chemlab
 *   unless a test supplies a stand-in.
 * @returns {{ save: Function }}
 */
export function createNotebookSaver({ getSnapshot, onError, target = bridge }) {
  let inFlight = false;
  let pending = false;

  async function run() {
    inFlight = true;
    pending = false;
    const { entries, tags } = getSnapshot();
    try {
      await target.saveNotebook(entries, tags);
      onError(null);
    } catch (error) {
      console.error('Could not save the notebook:', error);
      onError(`The notebook could not be saved: ${plainReason(error)}`);
    } finally {
      inFlight = false;
      if (pending) run();
    }
  }

  return {
    save() {
      if (!target) return;
      if (inFlight) {
        pending = true;
        return;
      }
      run();
    },
  };
}

/**
 * Adds a combination with no rule to the unknown-combinations log
 * (CLAUDE.md §6.3). Fire-and-forget: a failure is reported in the console
 * but never interrupts the student, because the lab has already told them
 * honestly that the combination is not available yet.
 */
export function logUnknownCombination(chemicalIds) {
  if (!bridge) return;
  bridge.logUnknownCombination([...chemicalIds]).catch((error) => {
    console.error('Could not log an unknown combination:', error);
  });
}

/**
 * Opens the Save dialog for a readable copy of the notebook.
 * @returns {Promise<string|null>} a message for the student, or null if they
 *   cancelled the dialog.
 */
export async function exportNotebookText(text) {
  if (!bridge) return 'Exporting only works in the desktop app.';
  try {
    const result = await bridge.exportNotebook(text);
    return result.saved ? `Saved a copy as "${result.fileName}".` : null;
  } catch (error) {
    console.error('Could not export the notebook:', error);
    return `The copy could not be saved: ${plainReason(error)}`;
  }
}

/**
 * Electron prefixes errors from the main process with "Error invoking
 * remote method '...': TypeError:". The student only needs the reason.
 */
function plainReason(error) {
  const message = String(error?.message ?? error);
  return message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '');
}

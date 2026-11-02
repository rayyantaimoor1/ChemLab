/**
 * channels.js — the names of the four messages the page may send to the
 * Electron main process.
 *
 * WHY THIS FILE EXISTS
 * The page (src/) and the main process talk over Electron's IPC, and both
 * sides have to use exactly the same message names. They live here, in one
 * place, so main/ipc.js cannot drift away from them.
 *
 * preload.cjs has to repeat these four strings, because a sandboxed preload
 * script can only load Electron's own modules, not files from this folder.
 * tests/bridge.test.js checks that the two copies match, so a typo in either
 * one fails the build instead of silently breaking saving.
 */

export const CHANNELS = Object.freeze({
  LOAD_NOTEBOOK: 'chemlab:notebook-load',
  SAVE_NOTEBOOK: 'chemlab:notebook-save',
  LOG_UNKNOWN: 'chemlab:unknown-log',
  EXPORT_NOTEBOOK: 'chemlab:notebook-export',
});

export default CHANNELS;

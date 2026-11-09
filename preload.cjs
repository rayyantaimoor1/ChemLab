// Runs before index.html loads, and is the only thing that can hand the page
// a way to reach the Electron main process.
//
// WHY .cjs AND NOT .js
// The window is sandboxed (see main.js), which is the strongest lock Electron
// offers. A sandboxed preload cannot use ES-module `import`, only CommonJS
// `require`, and only for Electron's own modules - hence this file's
// extension, since package.json makes every .js file in the project an ES
// module.
//
// WHAT THE PAGE GETS
// Exactly five functions on window.chemlab, each sending one fixed message.
// ipcRenderer itself is never handed over - with it, the page could send any
// message it liked. Everything sent is checked again in main/validate.js;
// nothing here is trusted on its own.
//
// The five message names must match main/channels.js. They are repeated here
// because this file cannot load that one; tests/bridge.test.js checks the two
// copies agree.

const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = {
  LOAD_NOTEBOOK: 'chemlab:notebook-load',
  SAVE_NOTEBOOK: 'chemlab:notebook-save',
  LOG_UNKNOWN: 'chemlab:unknown-log',
  EXPORT_NOTEBOOK: 'chemlab:notebook-export',
  REPORT_PROBLEM: 'chemlab:problem-report',
};

contextBridge.exposeInMainWorld('chemlab', {
  /** @returns {Promise<{ entries: object[], tags: Record<string, string> }>} */
  loadNotebook: () => ipcRenderer.invoke(CHANNELS.LOAD_NOTEBOOK),

  /** Saves notebook.toJSON() plus the line tags. */
  saveNotebook: (entries, tags) => ipcRenderer.invoke(CHANNELS.SAVE_NOTEBOOK, entries, tags),

  /** Adds a combination with no rule to unknown-pairs.json (CLAUDE.md §6.3). */
  logUnknownCombination: (chemicalIds) => ipcRenderer.invoke(CHANNELS.LOG_UNKNOWN, chemicalIds),

  /** Opens a Save dialog. @returns {Promise<{ saved: boolean, fileName?: string }>} */
  exportNotebook: (text) => ipcRenderer.invoke(CHANNELS.EXPORT_NOTEBOOK, text),

  /** Adds a student's "This looks wrong" report to reports.json (BUILD_PHASE_2.md 2.1.4). */
  reportProblem: (report) => ipcRenderer.invoke(CHANNELS.REPORT_PROBLEM, report),
});

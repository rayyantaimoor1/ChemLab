// Electron main process. Owns the app window, the menu, and file paths.
// This file must stay thin — it should never contain chemistry logic.

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

import { createNotebook } from './src/core/notebook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// notebook.js (src/core/) is pure logic and never touches the filesystem
// itself — that is this file's job, per CLAUDE.md section 4 ("main.js: file
// paths"). These two functions are the save/load pair notebook.js's
// persist()/restore() call; app.getPath('userData') only exists once
// Electron is ready, so the path is worked out fresh each call rather than
// cached at import time.
function notebookFilePath() {
  return path.join(app.getPath('userData'), 'notebook.json');
}

async function saveNotebook(entries) {
  await writeFile(notebookFilePath(), JSON.stringify(entries, null, 2), 'utf-8');
}

async function loadNotebook() {
  try {
    const raw = await readFile(notebookFilePath(), 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    // First run on this machine: nothing has been saved yet, which is a
    // normal empty notebook, not an error.
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

// NOT the same notebook the bench writes into. contextIsolation and
// nodeIntegration:false mean the renderer (src/ui/app.js) cannot reach into
// this process, so it builds its own notebook and this one currently only
// ever saves an empty list. Joining the two needs a contextBridge API in
// preload.js backed by ipcMain handlers here, so that what the student
// actually does on the bench is what gets written to disk.
//
// Until that exists this half is still worth keeping: it is the only place
// allowed to know where userData lives (CLAUDE.md section 4 gives main.js
// file paths), and it proves the save/load contract works against Electron's
// real userData folder, the way tests/notebook.test.js proves the same
// contract against a plain Node temp file.
const notebook = createNotebook({ save: saveNotebook, load: loadNotebook });

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    icon: path.join(__dirname, 'src', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox is disabled so preload.js can use ES modules (import/export).
      // contextIsolation + nodeIntegration:false still keep the renderer (index.html) locked down.
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(async () => {
  await notebook.restore();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Save whatever the notebook holds before the app actually exits. 'before-quit'
// (rather than 'window-all-closed') also fires on macOS, where the app can
// stay alive with no windows open.
app.on('before-quit', (event) => {
  event.preventDefault();
  notebook
    .persist()
    .catch((error) => console.error('Failed to save the notebook:', error))
    .finally(() => app.exit());
});

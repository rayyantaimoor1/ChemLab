// Electron main process. Owns the app window, the menu, and file paths.
// This file must stay thin — it should never contain chemistry logic.
//
// The page (src/) cannot reach the disk itself. Saving the notebook, logging
// combinations the lab has no rule for (CLAUDE.md §6.3) and exporting the
// notebook and saving a student's "This looks wrong" report all go through the
// five-function bridge in preload.cjs, answered by
// main/ipc.js. main/validate.js checks everything the page sends, and
// main/storage.js does the actual writing.

import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import chemicals from './src/data/chemicals.json' with { type: 'json' };
import reactions from './src/data/reactions.json' with { type: 'json' };
import { registerBridge } from './main/ipc.js';
import { installMenu } from './main/menu.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, 'src', 'index.html');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    icon: path.join(__dirname, 'src', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // The strongest lock Electron offers: the page runs in an OS-level
      // sandbox. This is why the preload is CommonJS (preload.cjs) - a
      // sandboxed preload cannot use ES-module imports.
      sandbox: true,
    },
  });

  // The app is one page that never leaves itself. Anything that tries to
  // navigate away or open a new window - a stray link, a bug - is refused,
  // so the bridge is only ever reachable from ChemLab's own page.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(indexPath);
}

app.whenReady().then(() => {
  registerBridge({
    ipcMain,
    dialog,
    getDataFolder: () => app.getPath('userData'),
    getDocumentsFolder: () => app.getPath('documents'),
    getWindow: () => mainWindow,
    indexUrl: pathToFileURL(indexPath).href,
    knownChemicalIds: new Set(chemicals.map((chemical) => chemical.id)),
    knownReactionIds: new Set(reactions.map((reaction) => reaction.id)),
    getAppVersion: () => app.getVersion(),
  });
  installMenu({ getDataFolder: () => app.getPath('userData') });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

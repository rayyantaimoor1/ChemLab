/**
 * menu.js — the window's menu bar.
 *
 * WHY THIS FILE EXISTS
 * Electron's default menu is kept (Edit, View, Window), with one addition a
 * teacher needs: File > Open data folder. That folder holds notebook.json,
 * unknown-pairs.json - the list of combinations students tried that the
 * lab has no rule for yet (CLAUDE.md §6.3) - and reports.json, the results
 * students flagged with "This looks wrong" (BUILD_PHASE_2.md 2.1.4).
 * Copying those two files onto a USB stick from each lab PC is how the
 * content roadmap and the error reports get back to whoever maintains the
 * reactions.
 *
 * It is a menu item and not a button on the bench on purpose: it is for the
 * teacher, not part of the experiment, and should not compete with the
 * chemistry for a student's attention.
 */

import { Menu, shell } from 'electron';

/**
 * @param {object}   deps
 * @param {Function} deps.getDataFolder () => app.getPath('userData')
 * @param {Function} [deps.log]
 */
export function installMenu({ getDataFolder, log = console.error }) {
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Open data folder',
          click: async () => {
            // openPath resolves to an error message, or '' when it worked.
            const problem = await shell.openPath(getDataFolder());
            if (problem) log(`Could not open the data folder: ${problem}`);
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]);
  Menu.setApplicationMenu(menu);
}

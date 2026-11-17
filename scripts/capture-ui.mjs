/**
 * capture-ui.mjs — saves screenshots of the bench at 1366×768, so every UI
 * stage can be compared with the one before (BUILD_UI.md rule 6).
 *
 * WHY THIS EXISTS
 * "Does it look more real?" is a question a person answers by looking, and
 * looking needs the same set-ups photographed the same way every time. This
 * opens the real app in a hidden window at the size of a school lab PC's
 * screen, builds each reference bench by clicking and dropping exactly as a
 * student would, lets every animation finish, and saves a PNG of each.
 *
 * Run it with:  npx electron scripts/capture-ui.mjs <stage>
 * e.g.          npx electron scripts/capture-ui.mjs UI.1
 * Pictures go to docs/ui-progress/<stage>/. Nothing here ships in the app
 * (package.json's "files" list does not include scripts/).
 */

import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv.find((arg) => /^UI\.\d+$/.test(arg)) || 'current';
const OUT = path.join(ROOT, 'docs', 'ui-progress', stage);

// Helpers injected into the page before each set-up. They do what a
// student's mouse does: press tray buttons and drop reagents on vessels.
const HELPERS = `
  window.__cap = {
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    press(label) {
      const b = [...document.querySelectorAll('button')]
        .find((x) => (x.getAttribute('aria-label') || x.title || x.textContent).toLowerCase().includes(label));
      if (!b) throw new Error('no button: ' + label);
      b.click();
    },
    drop(containerId, chemicalId) {
      const el = document.querySelector('.vessel-object[data-container-id="' + containerId + '"]');
      if (!el) throw new Error('no vessel: ' + containerId);
      const dt = new DataTransfer();
      dt.setData('text/plain', chemicalId);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    },
    // A solid opens the amount panel instead of pouring; press its Dispense.
    async dispense(containerId, chemicalId) {
      this.drop(containerId, chemicalId);
      await this.wait(300);
      const button = [...document.querySelectorAll('.amount-panel button')].find((b) => b.textContent.trim() === 'Dispense');
      if (!button) throw new Error('no amount panel for ' + chemicalId);
      button.click();
    },
    dismissHazard() {
      [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'I understand')?.click();
    },
    async settle() {
      await this.wait(400);
      document.getAnimations().forEach((a) => { try { a.finish(); } catch {} });
      await this.wait(200);
    },
  };
`;

// The reference set-ups. Each is a script run in the page; it may only use
// what a student could do.
const SETUPS = {
  'precipitate': `
    __cap.press('auto-pour'); await __cap.wait(100);
    __cap.press('take a beaker 250'); await __cap.wait(400);
    __cap.drop('beaker_1', 'pbno3_0_1m'); await __cap.wait(400);
    __cap.drop('beaker_1', 'ki_0_1m'); await __cap.wait(600);
    __cap.dismissHazard();`,
  'colour-change': `
    __cap.press('auto-pour'); await __cap.wait(100);
    __cap.press('take a test tube'); await __cap.wait(400);
    __cap.drop('tube_1', 'fecl3_0_1m'); await __cap.wait(400);
    __cap.drop('tube_1', 'kscn_aq'); await __cap.wait(600);`,
  'gas': `
    __cap.press('auto-pour'); await __cap.wait(100);
    __cap.press('take a boiling tube'); await __cap.wait(400);
    __cap.drop('boiling_tube_1', 'hcl_1m'); await __cap.wait(400);
    await __cap.dispense('boiling_tube_1', 'zn_metal'); await __cap.wait(600);
    __cap.dismissHazard();`,
  'busy-bench': `
    __cap.press('auto-pour'); await __cap.wait(100);
    __cap.press('take a beaker 250'); await __cap.wait(400);
    __cap.press('take a conical flask'); await __cap.wait(400);
    __cap.press('take a test tube'); await __cap.wait(400);
    __cap.press('take a boiling tube'); await __cap.wait(400);
    __cap.press('bunsen burner'); await __cap.wait(200);
    __cap.drop('beaker_1', 'pbno3_0_1m'); await __cap.wait(400);
    __cap.drop('beaker_1', 'ki_0_1m'); await __cap.wait(600);
    __cap.dismissHazard(); await __cap.wait(100);
    __cap.drop('flask_1', 'cuso4_0_5m'); await __cap.wait(400);
    __cap.drop('flask_1', 'nh4oh_aq'); await __cap.wait(600);
    __cap.drop('tube_1', 'fecl3_0_1m'); await __cap.wait(400);
    __cap.drop('tube_1', 'kscn_aq'); await __cap.wait(600);
    __cap.drop('boiling_tube_1', 'hcl_1m'); await __cap.wait(400);
    __cap.drop('boiling_tube_1', 'naoh_1m'); await __cap.wait(600);`,
};

/** Loads the app fresh, retrying once: back-to-back loads can be aborted. */
async function loadFresh(win) {
  const page = path.join(ROOT, 'src', 'index.html');
  try {
    await win.loadFile(page);
  } catch {
    await new Promise((r) => setTimeout(r, 500));
    await win.loadFile(page);
  }
}

async function capture(win, name, script) {
  await loadFresh(win);
  const lines = await win.webContents.executeJavaScript(`(async () => {
    ${HELPERS}
    await __cap.wait(600);
    ${script}
    await __cap.settle();
    const vessels = [...document.querySelectorAll('.vessel-object')].map((el) => {
      const r = el.querySelector('.vessel').getBoundingClientRect();
      return 'vessel ' + el.dataset.containerId + (el.classList.contains('is-selected') ? ' (selected)' : '')
        + ' at x ' + Math.round(r.left) + '-' + Math.round(r.right) + ', bottom ' + Math.round(r.bottom)
        + ': ' + el.querySelector('.object-chip__colour').textContent
        + ' | liquid ' + el.querySelector('.vessel__liquid--base').style.background;
    });
    const strip = document.querySelector('.bench-controls, .control-strip, [class*=control]')?.getBoundingClientRect();
    return [...vessels, 'devicePixelRatio ' + devicePixelRatio, ...[...document.querySelectorAll('.notebook-entry__text')].map((p) => p.textContent)];
  })()`);
  // Let one more frame paint after the page settled.
  win.webContents.invalidate();
  await new Promise((r) => setTimeout(r, 300));
  const image = await win.webContents.capturePage();
  writeFileSync(path.join(OUT, `${name}.png`), image.toPNG());
  console.log(`saved ${path.relative(ROOT, path.join(OUT, `${name}.png`))}`);
  for (const line of lines) console.log(`    ${line.slice(0, 110)}`);
}

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: false,
    width: 1366,
    height: 768,
    useContentSize: true,
    // Offscreen rendering paints every frame even though no window is shown
    // (a hidden ordinary window does not repaint, and capturePage then hands
    // back a stale picture), at exactly 1366×768 whatever the display
    // scaling. Animations must keep running in a window nobody is looking at.
    webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true },
  });
  win.setContentSize(1366, 768);
  try {
    for (const [name, script] of Object.entries(SETUPS)) await capture(win, name, script);
  } catch (error) {
    console.error('capture failed:', error);
    process.exitCode = 1;
  }
  app.quit();
});

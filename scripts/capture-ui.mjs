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
    // Adds the same reagent several times, to fill a vessel part-way.
    async fill(containerId, chemicalId, times) {
      for (let i = 0; i < times; i += 1) { this.drop(containerId, chemicalId); await this.wait(250); }
    },
    // Picks a vessel up and lets go of it over another, as the mouse would.
    async dragOnto(fromId, toId) {
      const from = document.querySelector('.vessel-object[data-container-id="' + fromId + '"]');
      const to = document.querySelector('.vessel-object[data-container-id="' + toId + '"] .vessel__glass');
      const a = from.querySelector('.vessel').getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const at = (x, y) => ({ clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true, button: 0 });
      from.dispatchEvent(new PointerEvent('pointerdown', at(a.left + a.width / 2, a.top + 20)));
      for (let k = 1; k <= 6; k += 1) {
        const x = a.left + a.width / 2 + ((b.left + b.width / 2) - (a.left + a.width / 2)) * k / 6;
        const y = a.top + 20 + ((b.top + 10) - (a.top + 20)) * k / 6;
        window.dispatchEvent(new PointerEvent('pointermove', at(x, y)));
        await this.wait(30);
      }
      window.dispatchEvent(new PointerEvent('pointerup', at(b.left + b.width / 2, b.top + 10)));
      await this.wait(300);
    },
    // Sets the auto-pour amount with the shelf's own − and + buttons.
    async setQuick(ml) {
      const value = () => Number.parseFloat(document.querySelector('.shelf-dispense__stepper span').textContent);
      for (let i = 0; i < 20 && value() !== ml; i += 1) {
        this.press(value() > ml ? 'decrease the auto-pour' : 'increase the auto-pour');
        await this.wait(60);
      }
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
    await __cap.setQuick(3);
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
    await __cap.setQuick(3);
    __cap.drop('tube_1', 'fecl3_0_1m'); await __cap.wait(400);
    __cap.drop('tube_1', 'kscn_aq'); await __cap.wait(600);
    await __cap.setQuick(10);
    __cap.drop('boiling_tube_1', 'hcl_1m'); await __cap.wait(400);
    __cap.drop('boiling_tube_1', 'naoh_1m'); await __cap.wait(600);`,
  // Stage UI.2: the glassware itself, each piece part-filled with copper
  // sulfate so the liquid's shape and its level against the scale show.
  'glassware': `
    __cap.press('auto-pour'); await __cap.wait(100);
    for (const label of ['take a beaker 250', 'take a beaker 100', 'take a conical flask', 'take a small conical flask', 'take a measuring cylinder', 'take an evaporating dish', 'take a test tube']) {
      __cap.press(label); await __cap.wait(300);
    }
    await __cap.fill('beaker_1', 'cuso4_0_5m', 10);
    await __cap.fill('beaker_small_1', 'cuso4_0_5m', 4);
    await __cap.fill('flask_1', 'cuso4_0_5m', 10);
    await __cap.fill('flask_small_1', 'cuso4_0_5m', 5);
    await __cap.fill('cylinder_1', 'cuso4_0_5m', 7);
    await __cap.fill('dish_1', 'cuso4_0_5m', 3);
    await __cap.setQuick(5);
    await __cap.fill('tube_1', 'cuso4_0_5m', 1);`,
  // Stage UI.3.2: clarity and depth of colour. The same copper sulfate in a
  // narrow tube, a wide beaker and a flask; then milky latex, cloudy starch,
  // and starch with iodine, which is opaque.
  'clarity-depth': `
    __cap.press('auto-pour'); await __cap.wait(100);
    for (const label of ['take a test tube', 'take a beaker 250', 'take a small conical flask', 'take a beaker 100', 'take a boiling tube', 'take a test tube']) {
      __cap.press(label); await __cap.wait(300);
    }
    await __cap.fill('beaker_1', 'cuso4_0_5m', 10);
    await __cap.fill('flask_small_1', 'cuso4_0_5m', 4);
    await __cap.fill('beaker_small_1', 'latex_aq', 4);
    await __cap.fill('boiling_tube_1', 'starch_aq', 2);
    await __cap.setQuick(5);
    await __cap.fill('tube_1', 'cuso4_0_5m', 2);
    await __cap.fill('tube_2', 'starch_aq', 1);
    await __cap.fill('tube_2', 'i2_aq', 1);`,
  'titration': `
    __cap.press('auto-pour'); await __cap.wait(100);
    __cap.press('take a conical flask'); await __cap.wait(300);
    __cap.press('take a burette'); await __cap.wait(300);
    __cap.press('take a boiling tube'); await __cap.wait(300);
    await __cap.fill('flask_1', 'naoh_1m', 2);
    await __cap.fill('burette_1', 'hcl_1m', 4);
    await __cap.fill('boiling_tube_1', 'cuso4_0_5m', 3);
    await __cap.dragOnto('burette_1', 'flask_1');`,
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

/**
 * check-access.mjs — the accessibility floor, checked in the running app
 * (BUILD_UI.md stage UI.10.3, UI.md §8).
 *
 * WHY THIS EXISTS
 * "Can it be used without a mouse? Can it be read from the back of the
 * room? Does Reduce animation really stop everything moving?" are questions
 * about the finished screen, not about any one file - so this opens the real
 * app at 1366×768, builds a bench that has every kind of control and moving
 * effect on it, and checks five things:
 *
 *   1. KEYBOARD  - Tab is pressed through the whole window. Every stop must
 *                  show a focus ring of at least 2 px that stands out 3:1
 *                  from what is behind it (WCAG 2.4.7, 1.4.11).
 *   2. MOUSE-ONLY - anything that looks clickable (a pointer or grab cursor)
 *                  but that Tab never reaches, and that has no keyboard
 *                  equivalent in reach, is listed.
 *   3. CONTRAST  - every piece of text against what is behind it, at least
 *                  4.5:1 (UI.md §8 - for all text, large or small).
 *   4. TEXT 125% - the window zoomed to 125%, as Windows' common 125%
 *                  display setting does: the page must not scroll sideways
 *                  and no text may be cut off.
 *   5. REDUCE ANIMATION - with the switch on, nothing may loop.
 *   7. CLICK TARGETS - every control at least 40×40 px (UI.md §2 and §8:
 *                  mouse-driven, often on a projector). A checkbox counts as
 *                  its whole label, which is what a click lands on.
 *
 * (6 is the keyboard path, which is not named for a check above.)
 *
 * Run it with:  npm run access
 *               npm run access -- --shots <folder>   (also save pictures)
 * Exit code 1 if anything fails. Nothing here ships in the app.
 */

import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { HELPERS } from './lib/bench-helpers.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.argv.includes('--shots')
  ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1])
  : null;

app.setPath('userData', path.join(os.tmpdir(), 'chemlab-check-access'));

/*
 * A bench with every kind of control and moving thing on it: a beaker
 * boiling on a burner, brine with the current on, a flask of concentrated
 * hydrochloric acid fuming in the fume cupboard, and a small flask of water
 * boiling in the water bath. Vessels are put on
 * things with the strip's "Put on…" (UI.10.3) rather than dragged: on a
 * crowded bench a drag can land on the wrong piece of furniture.
 */
const BUILD = `
  __cap.press('auto-pour'); await __cap.wait(100);
  __cap.press('take a beaker 100'); await __cap.wait(250);
  __cap.press('bunsen burner'); await __cap.wait(250);
  __cap.press('take a beaker 250'); await __cap.wait(250);
  __cap.press('take a conical flask'); await __cap.wait(250);
  __cap.press('fume cupboard'); await __cap.wait(250);
  __cap.press('water bath'); await __cap.wait(250);
  __cap.press('take a small conical flask'); await __cap.wait(250);
  await __cap.fill('beaker_small_1', 'water_distilled', 4);
  __cap.select('beaker_small_1'); await __cap.wait(100);
  __cap.press('stand it on'); await __cap.wait(150); __cap.press('on the bunsen burner'); await __cap.wait(250);
  __cap.press('heat 3'); await __cap.wait(200);
  await __cap.fill('beaker_1', 'nacl_1m', 6);
  __cap.select('beaker_1'); await __cap.wait(150);
  __cap.press('current off'); await __cap.wait(400);
  __cap.dismissHazard();
  __cap.select('flask_1'); await __cap.wait(100);
  __cap.press('stand it on'); await __cap.wait(150); __cap.press('in the fume cupboard'); await __cap.wait(250);
  __cap.drop('flask_1', 'hcl_conc'); await __cap.wait(400);
  __cap.dismissHazard();
  await __cap.fill('flask_small_1', 'water_distilled', 2);
  __cap.select('flask_small_1'); await __cap.wait(100);
  __cap.press('stand it on'); await __cap.wait(150); __cap.press('in the water bath'); await __cap.wait(250);
  __cap.press('boiling'); await __cap.wait(200);
  __cap.select('beaker_small_1'); await __cap.wait(150);
  await __cap.wait(12000);
  __cap.dismissHazard();
`;

/* ------------------------------------------------------------------ *
 * Page-side checks. Each returns plain data for the report.
 * ------------------------------------------------------------------ */

const PAGE_LIB = `
  window.__a11y = {
    parse(c) {
      const m = c.match(/rgba?\\(([^)]+)\\)/);
      if (!m) return null;
      const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    },
    over(top, under) {
      const a = top.a + under.a * (1 - top.a);
      if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
      const mix = (k) => (top[k] * top.a + under[k] * under.a * (1 - top.a)) / a;
      return { r: mix('r'), g: mix('g'), b: mix('b'), a };
    },
    lum({ r, g, b }) {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    },
    ratio(a, b) {
      const [l1, l2] = [this.lum(a), this.lum(b)].sort((x, y) => y - x);
      return (l1 + 0.05) / (l2 + 0.05);
    },
    hex(c) { return '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase(); },
    // What is painted behind el: its own and its ancestors' background
    // colours, stacked. An ancestor with a picture behind it is flagged.
    background(el) {
      const layers = [];
      let image = null;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const cs = getComputedStyle(n);
        const c = this.parse(cs.backgroundColor);
        if (cs.backgroundImage && cs.backgroundImage !== 'none' && !image) image = n;
        if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      }
      let bg = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = layers.length - 1; i >= 0; i -= 1) bg = this.over(layers[i], bg);
      return { bg, image };
    },
    opacity(el) {
      let o = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      return o;
    },
    visible(el) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || this.opacity(el) < 0.05) return false;
      return !el.closest('[hidden], [aria-hidden="true"]');
    },
    name(el) {
      const cls = (el.className && el.className.baseVal === undefined ? el.className : '').split(' ').filter(Boolean)[0] || '';
      const text = (el.getAttribute('aria-label') || el.textContent || el.title || '').replace(/\\s+/g, ' ').trim().slice(0, 40);
      return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (text ? ' "' + text + '"' : '');
    },
    focusable(el) {
      return el.matches('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, a[href], [tabindex]:not([tabindex="-1"]), summary');
    },

    // 3. Contrast of every visible piece of text.
    contrast() {
      const seen = new Set();
      const fails = [];
      const overImage = [];
      let checked = 0;
      let fading = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (!t.textContent.trim()) continue;
        const el = t.parentElement;
        if (!el || seen.has(el) || el.closest('svg, script, style, option')) continue;
        seen.add(el);
        if (!this.visible(el)) continue;
        // Text that is fading in or out is measured when it is still -
        // with Reduce animation on - not part-way through a fade.
        if (this.fading(el)) { fading += 1; continue; }
        checked += 1;
        const cs = getComputedStyle(el);
        const { bg, image } = this.background(el);
        const fg = this.parse(cs.color);
        fg.a *= this.opacity(el);
        const shown = this.over(fg, bg);
        const r = this.ratio(shown, bg);
        const row = { name: this.name(el), ratio: Math.round(r * 100) / 100, fg: this.hex(shown), bg: this.hex(bg), size: cs.fontSize };
        if (image) { row.image = this.name(image); overImage.push(row); }
        if (r < 4.5) fails.push(row);
      }
      return { checked, fails, overImage, fading };
    },

    fading(el) {
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        if (n.getAnimations().some((a) => a.playState === 'running')) return true;
      }
      return false;
    },

    // 7. Controls smaller than 40×40 px. A checkbox or select inside a label
    // is measured as the label, the whole of which takes the click.
    smallTargets() {
      const out = new Map();
      const controls = document.querySelectorAll('button, select, input, a[href], [tabindex]:not([tabindex="-1"]), summary');
      for (const el of controls) {
        if (!this.visible(el) || el.disabled) continue;
        const target = el.closest('label') || el;
        let r = target.getBoundingClientRect();
        // A vessel or piece of apparatus takes the click on its label card
        // too, so the target is the two together.
        const card = target.classList.contains('bench-object') ? target.querySelector(':scope > .object-chip') : null;
        if (card) {
          const c = card.getBoundingClientRect();
          r = { width: Math.max(r.right, c.right) - Math.min(r.left, c.left), height: Math.max(r.bottom, c.bottom) - Math.min(r.top, c.top) };
        }
        if (r.width >= 40 && r.height >= 40) continue;
        const key = this.name(target).replace(/ ".*$/, '');
        if (!out.has(key)) out.set(key, { name: this.name(target), w: Math.round(r.width), h: Math.round(r.height), count: 0 });
        out.get(key).count += 1;
      }
      return [...out.values()].sort((a, b) => a.h - b.h);
    },

    // 2. Things that look clickable but that the keyboard cannot reach.
    pointerOnly(reached) {
      const out = new Map();
      for (const el of document.querySelectorAll('body *')) {
        if (!this.visible(el)) continue;
        const cursor = getComputedStyle(el).cursor;
        if (!/pointer|grab|move/.test(cursor)) continue;
        if (this.focusable(el) || el.closest('button, select, input, label, a[href], [tabindex]:not([tabindex="-1"])')) continue;
        if (el.querySelector('button, select, input, [tabindex]:not([tabindex="-1"])')) continue;
        if (getComputedStyle(el.parentElement).cursor === cursor) continue; // report the outermost only
        const key = this.name(el).replace(/ ".*$/, '');
        if (!out.has(key)) out.set(key, { name: this.name(el), cursor, count: 0 });
        out.get(key).count += 1;
      }
      return [...out.values()];
    },

    // 1. The focused element: does it show a ring?
    ring(el) {
      const cs = getComputedStyle(el);
      const width = parseFloat(cs.outlineWidth) || 0;
      const outline = cs.outlineStyle !== 'none' && width >= 2;
      const shadow = cs.boxShadow && cs.boxShadow !== 'none';
      let ratio = null;
      if (outline) {
        const ringColour = this.parse(cs.outlineColor);
        const behind = el.parentElement ? this.background(el.parentElement).bg : { r: 255, g: 255, b: 255, a: 1 };
        ratio = Math.round(this.ratio(this.over(ringColour, behind), behind) * 100) / 100;
      }
      return { name: this.name(el), outline, width, shadow: !!shadow, ratio, colour: cs.outlineColor };
    },

    // 4. Sideways scrolling and cut-off text.
    overflow() {
      const sideways = document.documentElement.scrollWidth > innerWidth + 1;
      const clipped = [];
      for (const el of document.querySelectorAll('body *')) {
        if (!this.visible(el) || el.closest('svg')) continue;
        const cs = getComputedStyle(el);
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!hasText) continue;
        const hides = /hidden|clip/.test(cs.overflowX) || /hidden|clip/.test(cs.overflowY) || cs.textOverflow === 'ellipsis';
        if (hides && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
          clipped.push(this.name(el));
        }
      }
      // A column or bar that scrolls sideways hides its own left or right
      // edge. The control strip's row of buttons is meant to scroll.
      // (The bench is checked below by what it shows, not by its boxes:
      // an empty part of a box past its clipped edge loses nothing.)
      const sidewaysParts = [...document.querySelectorAll('.topbar, .zone, .shelf-scroll, .apparatus-tray, .shelf-dispense, .notebook-entries')]
        .filter((el) => this.visible(el) && el.scrollWidth > el.clientWidth + 1)
        .map((el) => {
          const right = el.getBoundingClientRect().left + el.clientWidth;
          const past = [...el.querySelectorAll('*')].filter((c) => this.visible(c) && c.getBoundingClientRect().right > right + 1).slice(0, 8)
            .map((c) => this.name(c).replace(/ ".*$/, '') + (c.dataset.containerId || c.dataset.equipmentId ? ' ' + (c.dataset.containerId || c.dataset.equipmentId) : ''));
          return this.name(el).replace(/ ".*$/, '') + ' (' + el.scrollWidth + ' px in ' + el.clientWidth + (past.length ? '; past the edge: ' + [...new Set(past)].join(', ') : '') + ')';
        });
      // Top-bar items that run into each other.
      const bar = [...document.querySelectorAll('.topbar > *')].filter((el) => this.visible(el)).map((el) => ({ el, r: el.getBoundingClientRect() }));
      const overlapping = [];
      for (let i = 0; i < bar.length; i += 1) {
        for (let j = i + 1; j < bar.length; j += 1) {
          const a = bar[i].r; const b = bar[j].r;
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) {
            overlapping.push(this.name(bar[i].el).replace(/ ".*$/, '') + ' and ' + this.name(bar[j].el).replace(/ ".*$/, ''));
          }
        }
      }
      // Anything on the bench past its right-hand edge.
      const canvas = document.querySelector('.bench-canvas');
      const edge = canvas ? canvas.getBoundingClientRect().right : innerWidth;
      const offBench = [...document.querySelectorAll('.bench-object')]
        .filter((el) => (el.querySelector('.vessel, .equipment__art') || el).getBoundingClientRect().right > edge + 1)
        .map((el) => el.dataset.containerId || el.dataset.equipmentId);
      // Words on the bench cut by its edge (the strip's button row scrolls
      // on purpose, so it is left out).
      const bounds = canvas ? canvas.getBoundingClientRect() : null;
      const cutWords = !bounds ? [] : [...canvas.querySelectorAll('*')]
        .filter((el) => !el.closest('.bench-controls__buttons') && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
        .filter((el) => this.visible(el) || (() => { const r = el.getBoundingClientRect(); return r.width > 0 && getComputedStyle(el).visibility !== 'hidden'; })())
        .filter((el) => { const r = el.getBoundingClientRect(); return r.right > bounds.right + 1 || r.left < bounds.left - 1; })
        .map((el) => this.name(el));
      return {
        sideways, width: document.documentElement.scrollWidth, viewport: innerWidth,
        clipped: [...new Set(clipped)], sidewaysParts, overlapping, offBench, cutWords: [...new Set(cutWords)],
      };
    },

    // 6. The keyboard path: what the state looks like after each key.
    snapshot() {
      const active = document.activeElement;
      return {
        active: active ? (active.dataset.focusKey || active.dataset.containerId || active.dataset.chemicalId || active.textContent.trim().slice(0, 40)) : null,
        activeIsBody: !active || active === document.body,
        selected: document.querySelector('.vessel-object.is-selected')?.dataset.containerId || null,
        title: document.querySelector('.bench-controls__title')?.textContent || '',
        sub: document.querySelector('.bench-controls__sub')?.textContent || '',
        buttons: [...document.querySelectorAll('.bench-controls__buttons button')].map((b) => b.dataset.focusKey || b.textContent),
        keys: (window.__keys || []).slice(-4).join(', '),
        notebook: [...document.querySelectorAll('.notebook-entry__text')].map((p) => p.textContent).slice(-3).join(' | '),
      };
    },
    focusOn(selector) {
      const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
      if (!el) throw new Error('nothing to focus: ' + selector);
      el.focus();
      return true;
    },

    // 5. What is still moving.
    moving() {
      return document.getAnimations()
        .filter((a) => a.playState === 'running')
        .map((a) => {
          const target = a.effect && a.effect.target;
          const iterations = a.effect && a.effect.getTiming ? a.effect.getTiming().iterations : 1;
          return { name: target ? this.name(target).replace(/ ".*$/, '') : '?', loops: iterations === Infinity, kind: a.constructor.name, animationName: a.animationName || '' };
        });
    },
  };
`;

async function page(win, js) {
  return win.webContents.executeJavaScript(`(async () => { ${js} })()`);
}

async function shot(win, name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  try {
    let image;
    try {
      image = await win.webContents.capturePage();
    } catch {
      // A capture at a zoom other than 100% can fail once; the window's own capture is the fallback.
      await new Promise((r) => setTimeout(r, 500));
      image = await win.capturePage();
    }
    writeFileSync(path.join(SHOTS, name), image.toPNG());
  } catch (error) {
    // A picture is a convenience; a graphics hiccup must not stop the checks.
    console.log(`   (could not save ${name}: ${error.message})`);
  }
}

/**
 * Presses a key as the keyboard does, through Chromium's debugging
 * interface: a key sent to the window the ordinary way is lost when another
 * program has Windows' focus, and this test must not depend on that.
 */
const KEYS = {
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
};
async function pressKey(win, name) {
  const dbg = win.webContents.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  // The page behaves as the focused window, as it would under a student's
  // hands, whatever else is in front on this PC.
  await dbg.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  const k = KEYS[name];
  await dbg.sendCommand('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...k });
  await dbg.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode });
}

/**
 * Presses Tab through the window, recording every stop, until it comes
 * round again. Each stop's ring is read with :focus-visible forced on it
 * through Chromium's debugging interface: whether Chromium draws the ring
 * by itself depends on the window having Windows' focus, which a test
 * running beside other programs cannot promise.
 */
async function tabWalk(win) {
  const dbg = win.webContents.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  await dbg.sendCommand('DOM.enable');
  await dbg.sendCommand('CSS.enable');
  const forced = async (classes) => {
    const { root } = await dbg.sendCommand('DOM.getDocument', { depth: 0 });
    const { nodeId } = await dbg.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-a11y-current]' });
    if (nodeId) await dbg.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: classes });
  };
  await page(win, `document.activeElement && document.activeElement.blur(); window.focus();`);
  win.focus();
  win.webContents.focus();
  const stops = [];
  const seen = new Set();
  for (let i = 0; i < 600; i += 1) {
    await pressKey(win, 'Tab');
    await new Promise((r) => setTimeout(r, 15));
    const marked = await page(win, `
      document.querySelectorAll('[data-a11y-current]').forEach((n) => n.removeAttribute('data-a11y-current'));
      const el = document.activeElement;
      if (!el || el === document.body) return false;
      el.setAttribute('data-a11y-current', '');
      return true;
    `);
    if (!marked) continue;
    await forced(['focus', 'focus-visible']);
    const stop = await page(win, `
      const el = document.querySelector('[data-a11y-current]');
      if (!el.dataset.a11yStop) el.dataset.a11yStop = String(Math.random()).slice(2);
      return { id: el.dataset.a11yStop, ...__a11y.ring(el), visible: __a11y.visible(el) };
    `);
    await forced([]);
    if (!stop) continue;
    if (seen.has(stop.id)) break;
    seen.add(stop.id);
    stops.push(stop);
  }
  return stops;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: true,
    width: 1366,
    height: 768,
    useContentSize: true,
    title: 'Virtual Chemistry Lab - accessibility check',
    webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true },
  });
  win.setContentSize(1366, 768);
  const problems = [];
  try {
    await win.loadFile(path.join(ROOT, 'src', 'index.html'));
    // Chromium remembers zoom per page between runs: start at 100%.
    win.webContents.setZoomFactor(1);
    await page(win, `${HELPERS}\n${PAGE_LIB}\n await __cap.wait(600); ${BUILD}`);
    await shot(win, 'access-bench.png');

    // 1. Keyboard: every Tab stop shows a ring.
    const stops = await tabWalk(win);
    const noRing = stops.filter((s) => s.visible && !(s.outline && (s.ratio === null || s.ratio >= 3)) && !s.shadow);
    console.log(`1. KEYBOARD: ${stops.length} Tab stops`);
    for (const s of noRing) {
      console.log(`   no visible ring: ${s.name}${s.outline ? ` (ring ${s.colour}, only ${s.ratio}:1 against what is behind it)` : ''}`);
    }
    if (noRing.length) problems.push(`${noRing.length} Tab stops without a visible focus ring`);

    // 2. Mouse-only things.
    const pointerOnly = await page(win, `return __a11y.pointerOnly();`);
    console.log(`2. MOUSE-ONLY: ${pointerOnly.length} kinds of thing the keyboard cannot reach`);
    for (const p of pointerOnly) console.log(`   ${p.name} (${p.cursor} cursor, ${p.count} on screen)`);
    if (pointerOnly.length) problems.push(`${pointerOnly.length} kinds of control only a mouse can use`);

    // 7. Click targets.
    const small = await page(win, `return __a11y.smallTargets();`);
    console.log(`7. CLICK TARGETS: ${small.length} kinds of control smaller than 40×40 px`);
    for (const s of small) console.log(`   ${s.w}×${s.h}  ${s.name}${s.count > 1 ? ` (+${s.count - 1} like it)` : ''}`);
    if (small.length) problems.push(`${small.length} kinds of control smaller than 40×40 px`);

    // 3. Contrast.
    const contrast = await page(win, `return __a11y.contrast();`);
    console.log(`3. CONTRAST: ${contrast.checked} pieces of text, ${contrast.fails.length} under 4.5:1 (${contrast.fading} fading in or out: measured still, below)`);
    const byName = new Map();
    for (const f of contrast.fails) {
      const key = f.name.replace(/ ".*$/, '') + f.fg + f.bg;
      if (!byName.has(key)) byName.set(key, { ...f, count: 0 });
      byName.get(key).count += 1;
    }
    for (const f of byName.values()) {
      console.log(`   ${f.ratio}:1  ${f.fg} on ${f.bg}  ${f.size}  ${f.name}${f.count > 1 ? ` (+${f.count - 1} like it)` : ''}${f.image ? `  [over a picture: ${f.image}]` : ''}`);
    }
    if (contrast.fails.length) problems.push(`${contrast.fails.length} pieces of text under 4.5:1`);

    // 5. Reduce animation (before the zoom, at the normal size).
    const before = await page(win, `return __a11y.moving();`);
    await page(win, `
      const box = document.getElementById('reduce-animation');
      if (!box.checked) box.click();
      await __cap.wait(1500);
    `);
    const first = await page(win, `return __a11y.moving();`);
    // 3c. Contrast again with everything still.
    const still = await page(win, `return __a11y.contrast();`);
    console.log(`3c. CONTRAST WITH EVERYTHING STILL: ${still.checked} pieces of text, ${still.fails.length} under 4.5:1`);
    for (const f of still.fails) console.log(`   ${f.ratio}:1  ${f.fg} on ${f.bg}  ${f.size}  ${f.name}`);
    if (still.fails.length) problems.push(`${still.fails.length} pieces of still text under 4.5:1`);
    await new Promise((r) => setTimeout(r, 3000));
    const later = await page(win, `return __a11y.moving();`);
    const looping = later.filter((a) => a.loops);
    const stillGoing = later.filter((a) => !a.loops);
    const kinds = (list) => [...new Set(list.map((a) => `${a.name}${a.animationName ? ` (${a.animationName})` : ''}`))];
    console.log(`5. REDUCE ANIMATION: ${before.length} animations running before (${before.filter((a) => a.loops).length} looping); ${first.length} 1.5 s after switching it on, ${later.length} 3 s later`);
    if (before.filter((a) => a.loops).length === 0) problems.push('nothing was looping before Reduce animation, so the check proved nothing');
    for (const k of kinds(looping)) console.log(`   still looping: ${k}`);
    for (const k of kinds(stillGoing)) console.log(`   still moving 4.5 s later (started again by a timer?): ${k}`);
    if (later.length) problems.push(`${later.length} animations still running with Reduce animation on`);
    await shot(win, 'access-reduce.png');
    await page(win, `const box = document.getElementById('reduce-animation'); if (box.checked) box.click();`);

    // 3b. Contrast with the panels open: a reagent's properties card, the
    // close look, and the amount panel.
    const panelFails = [];
    for (const [label, open, close] of [
      ['properties card', `document.querySelector('.reagent-bottle__properties').click();`, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`],
      ['close look', `__cap.select('beaker_1'); await __cap.wait(150); __cap.press('open it large');`, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`],
      ['amount panel', `__cap.press('ask amount'); await __cap.wait(100); __cap.drop('beaker_1', 'nacl_1m');`, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); __cap.press('auto-pour');`],
    ]) {
      await page(win, `${open} await __cap.wait(700);`);
      const c = await page(win, `return __a11y.contrast();`);
      for (const f of c.fails) panelFails.push({ ...f, where: label });
      await page(win, `${close} await __cap.wait(400);`);
    }
    console.log(`3b. CONTRAST WITH PANELS OPEN: ${panelFails.length} pieces of text under 4.5:1`);
    for (const f of panelFails) console.log(`   [${f.where}] ${f.ratio}:1  ${f.fg} on ${f.bg}  ${f.size}  ${f.name}`);
    if (panelFails.length) problems.push(`${panelFails.length} pieces of text in open panels under 4.5:1`);

    // 6. The keyboard path, on a fresh bench: select, add, pour, put on,
    // heat - with only Enter and Escape - and focus kept through redraws.
    await win.loadFile(path.join(ROOT, 'src', 'index.html'));
    win.webContents.setZoomFactor(1);
    await page(win, `${HELPERS}\n${PAGE_LIB}\n await __cap.wait(600);
      __cap.press('auto-pour'); await __cap.wait(100);
      __cap.press('take a beaker 250'); await __cap.wait(250);
      __cap.press('take a beaker 100'); await __cap.wait(250);
      __cap.press('bunsen burner'); await __cap.wait(250);`);
    win.webContents.focus();
    await page(win, "window.__keys = []; window.addEventListener('keydown', (e) => __keys.push(e.key + '>' + (e.target.dataset?.containerId || e.target.dataset?.chemicalId || e.target.tagName)), true);");
    const key = async (name) => {
      await pressKey(win, name);
      await new Promise((r) => setTimeout(r, 500));
    };
    const snap = () => page(win, `return __a11y.snapshot();`);
    const steps = [];
    const expect = (what, ok, s) => { steps.push({ what, ok }); if (!ok) console.log(`   FAILED: ${what}\n     ${JSON.stringify(s)}`); };

    await page(win, `__a11y.focusOn('.vessel-object[data-container-id="beaker_1"]');`);
    await key('Enter');
    let s = await snap();
    expect('Enter on a vessel selects it', s.selected === 'beaker_1', s);

    await page(win, `__a11y.focusOn('.reagent-bottle[data-chemical-id="hcl_1m"]');`);
    await key('Enter');
    s = await snap();
    expect('Enter on a shelf reagent adds it to the selected vessel', /Hydrochloric acid to Beaker/.test(s.notebook), s);

    await page(win, `__a11y.focusOn('[data-focus-key="pour-into"]');`);
    await key('Enter');
    s = await snap();
    expect('"Pour into…" lists the other vessels, with focus on the first', s.buttons.includes('to-beaker_small_1') && s.active === 'to-beaker_small_1', s);
    await key('Enter');
    await new Promise((r) => setTimeout(r, 1500));
    s = await snap();
    expect('choosing one pours into it', /Small beaker/.test(s.notebook) && /oured/.test(s.notebook), s);

    await page(win, `__a11y.focusOn('[data-focus-key="put-on"]');`);
    await key('Enter');
    await key('Escape');
    s = await snap();
    expect('Esc closes the list and returns to "Put on…"', s.active === 'put-on' && s.buttons.includes('put-on'), s);
    await key('Enter');
    await key('Enter');
    s = await snap();
    expect('"Put on…" then a burner stands the vessel on it', /standing on the bunsen burner/.test(s.sub), s);

    await page(win, `__a11y.focusOn([...document.querySelectorAll('.bench-controls__buttons button')].find((b) => b.textContent === 'Heat 2'));`);
    await key('Enter');
    await new Promise((r) => setTimeout(r, 2500));
    s = await snap();
    expect('focus stays on "Heat 2" while the bench redraws as it heats', s.active === 'Heat 2', s);
    await shot(win, 'access-keyboard.png');

    await page(win, `__cap.select('beaker_1'); document.querySelector('.bench-canvas').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await __cap.wait(200); __a11y.focusOn('.reagent-bottle[data-chemical-id="nacl_1m"]');`);
    await key('Enter');
    s = await snap();
    expect('Enter on a reagent with nothing selected says to choose a vessel first', /Choose a vessel first/.test(s.sub), s);

    const failedSteps = steps.filter((x) => !x.ok);
    console.log(`6. KEYBOARD PATH: ${steps.length - failedSteps.length} of ${steps.length} steps worked`);
    if (failedSteps.length) problems.push(`${failedSteps.length} keyboard steps did not work`);

    // 4. Text at 125%: first made larger mid-session, then a fresh start
    // at 125%, the way Windows' display setting opens it.
    const report125 = (label, z) => {
      console.log(`4. TEXT 125% (${label}): page ${z.width} px wide in a ${z.viewport} px window${z.sideways ? ' - SCROLLS SIDEWAYS' : ''}`);
      for (const c of z.clipped) console.log(`   cut off: ${c}`);
      for (const c of z.sidewaysParts) console.log(`   scrolls sideways: ${c}`);
      for (const c of z.overlapping) console.log(`   overlapping in the top bar: ${c}`);
      for (const c of z.offBench) console.log(`   off the right of the bench: ${c}`);
      for (const c of z.cutWords) console.log(`   cut by the bench's edge: ${c}`);
      const n = z.clipped.length + z.sidewaysParts.length + z.overlapping.length + z.offBench.length + z.cutWords.length + (z.sideways ? 1 : 0);
      if (n) problems.push(`at 125% (${label}) ${n} layout problems`);
    };
    await win.loadFile(path.join(ROOT, 'src', 'index.html'));
    win.webContents.setZoomFactor(1);
    await page(win, `${HELPERS}\n${PAGE_LIB}\n await __cap.wait(600); ${BUILD}`);
    win.webContents.setZoomFactor(1.25);
    await new Promise((r) => setTimeout(r, 1500));
    report125('made larger mid-session', await page(win, `return __a11y.overflow();`));
    await shot(win, 'access-125-midsession.png');

    await win.loadFile(path.join(ROOT, 'src', 'index.html'));
    win.webContents.setZoomFactor(1.25);
    await page(win, `${HELPERS}\n${PAGE_LIB}\n await __cap.wait(600); ${BUILD}`);
    report125('opened at 125%', await page(win, `return __a11y.overflow();`));
    await shot(win, 'access-125.png');

    if (problems.length) {
      console.log('FAIL');
      for (const p of problems) console.log(`  - ${p}`);
      process.exitCode = 1;
    } else {
      console.log('PASS');
    }
  } catch (error) {
    console.error('accessibility check failed to run:', error);
    process.exitCode = 1;
  }
  app.exit(process.exitCode || 0);
});

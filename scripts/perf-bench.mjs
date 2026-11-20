/**
 * perf-bench.mjs — the busy-bench performance test (BUILD_UI.md UI.10.2).
 *
 * WHY THIS EXISTS
 * The app must hold 30 frames a second on a school lab PC (CLAUDE.md §2).
 * Every new effect costs a little, and "it felt fine on my machine" is not
 * a measurement. This opens the real app at 1366×768, builds a busy bench
 * exactly as a student would - four vessels boiling, bubbling and
 * precipitating at once - times every frame for ten seconds, and compares
 * the average frame time with the number recorded for this machine in
 * PERFORMANCE.md.
 *
 * It FAILS (exit code 1) when:
 *   - the average frame is more than 20% slower than the recorded baseline;
 *   - the average frame is slower than 33.3 ms, i.e. under 30 fps;
 *   - this machine has no baseline yet (an unchecked result is not a pass).
 *
 * Run it with:   npm run perf                (check against the baseline)
 *                npm run perf -- --add-work 1 (check the test fails when slower)
 *                npm run perf -- --screenshot bench.png
 *                npm run perf -- --record    (record this machine's baseline)
 *                npm run perf -- --tier low  (measure the low effects tier)
 *
 * HOW IT MEASURES
 * The screen's refresh normally caps the app at 60 frames a second, and a
 * capped number cannot show a slowdown until it is a big one. So the test
 * runs with that cap lifted: each frame is drawn as soon as the last one is
 * done, and the time between frames is the real cost of drawing the bench.
 * The window is shown, with the graphics card in use, as in the classroom.
 * The effects tier is forced (Full unless --tier low), so Auto cannot make
 * the bench lighter halfway through.
 *
 * Nothing here ships in the app (package.json's "files" list does not
 * include scripts/).
 */

import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { HELPERS } from './lib/bench-helpers.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERFORMANCE_MD = path.join(ROOT, 'PERFORMANCE.md');

const RECORD = process.argv.includes('--record');
const tierArg = process.argv[process.argv.indexOf('--tier') + 1];
const TIER = process.argv.includes('--tier') && tierArg === 'low' ? 'low' : 'full';
// --add-work <ms>: the test's own check that it can fail. Wastes that many
// ms in every frame, like a slow new effect would, and is never recorded.
const ADD_WORK_MS = process.argv.includes('--add-work')
  ? Math.max(0, Number.parseFloat(process.argv[process.argv.indexOf('--add-work') + 1]) || 0)
  : 0;
// --screenshot <file.png>: a picture of the busy bench as the timing ends.
const SCREENSHOT = process.argv.includes('--screenshot')
  ? path.resolve(process.argv[process.argv.indexOf('--screenshot') + 1])
  : null;

/** How long the busy bench is timed, after it has been built and warmed up. */
const MEASURE_MS = 10000;
/** More than this much slower than the baseline fails. */
const ALLOWED_SLOWDOWN = 0.2;
/** 30 frames a second. */
const FLOOR_FRAME_MS = 1000 / 30;

app.setPath('userData', path.join(os.tmpdir(), 'chemlab-perf-bench'));
// Lift the screen-refresh cap, so frame time is the cost of a frame.
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('disable-gpu-vsync');

/*
 * The busy bench, built as a student would. Four vessels:
 *   1. a 100 mL beaker of water at full heat, with a thermometer - it boils,
 *      steams and shimmers;
 *   2. a 250 mL beaker of brine with the current on - bubbles of hydrogen
 *      and chlorine streaming off both electrodes, all the time;
 *   3. a boiling tube where magnesium meets hydrochloric acid - a vigorous
 *      burst of hydrogen;
 *   4. a conical flask where potassium iodide meets lead nitrate - a yellow
 *      precipitate falling.
 * The boil and the electrolysis keep going by themselves. A one-off
 * reaction's bubbles and grains come in a burst, so during the timed ten
 * seconds the tube and the flask are emptied and the reaction repeated,
 * every two and a half seconds, the way a student repeats a trial - and the
 * notebook keeps writing as it would in class.
 *
 * Why not simply pour in more acid? The engine has no amounts yet: when a
 * rule runs, both reactants go, even magnesium that was in excess, so a
 * second pour of acid meets only magnesium chloride and the notebook says
 * that combination is not in the lab. A fresh start is the honest repeat.
 */
const BUILD = `
  __cap.press('auto-pour'); await __cap.wait(100);
  __cap.press('take a beaker 100'); await __cap.wait(300);
  __cap.press('bunsen burner'); await __cap.wait(300);
  __cap.press('take a beaker 250'); await __cap.wait(300);
  __cap.press('take a boiling tube'); await __cap.wait(300);
  __cap.press('take a conical flask'); await __cap.wait(300);
  await __cap.fill('beaker_small_1', 'water_distilled', 4);
  await __cap.standOn('beaker_small_1', 'burner', 0);
  __cap.press('stand a thermometer in'); await __cap.wait(200);
  __cap.press('heat 3'); await __cap.wait(200);
  await __cap.fill('beaker_1', 'nacl_1m', 8);
  __cap.select('beaker_1'); await __cap.wait(200);
  __cap.press('current off'); await __cap.wait(600);
  __cap.dismissHazard();
  await __cap.setQuick(5);
  // Let the water come to the boil before the clock starts.
  await __cap.wait(16000);
  __cap.dismissHazard();
`;

/** One trial in the tube and one in the flask, repeated while the frames are timed. */
const KEEP_BUSY = `
  __cap.select('boiling_tube_1'); await __cap.wait(60);
  __cap.press('empty and rinse'); await __cap.wait(60);
  await __cap.dispense('boiling_tube_1', 'mg_metal'); await __cap.wait(60);
  __cap.drop('boiling_tube_1', 'hcl_1m'); await __cap.wait(150);
  __cap.dismissHazard();
  __cap.select('flask_1'); await __cap.wait(60);
  __cap.press('empty and rinse'); await __cap.wait(60);
  __cap.drop('flask_1', 'pbno3_0_1m'); await __cap.wait(150);
  __cap.drop('flask_1', 'ki_0_1m'); await __cap.wait(150);
  __cap.dismissHazard();
`;

/** Times every frame for MEASURE_MS while KEEP_BUSY runs every 2.5 seconds. */
const MEASURE = `
  const select = document.getElementById('effects-mode');
  select.value = ${JSON.stringify(TIER)};
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await __cap.wait(500);

  const gaps = [];
  let stop = false;
  const frames = new Promise((resolve) => {
    let last = null;
    const tick = (now) => {
      if (${ADD_WORK_MS} > 0) { const until = performance.now() + ${ADD_WORK_MS}; while (performance.now() < until) {} }
      if (last !== null) gaps.push(now - last);
      last = now;
      if (stop) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const started = performance.now();
  let rounds = 0;
  let busy = { boiling: false, bubbles: 0, grains: 0 };
  while (performance.now() - started < ${MEASURE_MS}) {
    const roundStart = performance.now();
    ${KEEP_BUSY}
    rounds += 1;
    busy.boiling = busy.boiling || !!document.querySelector('.vessel__boil.is-boiling');
    busy.bubbles = Math.max(busy.bubbles, document.querySelectorAll('.fx-bubble').length);
    busy.streams = Math.max(busy.streams || 0, document.querySelectorAll('.electrode-bubble').length);
    busy.grains = Math.max(busy.grains, document.querySelectorAll('.fx-precipitate').length);
    await __cap.wait(Math.max(0, 2500 - (performance.now() - roundStart)));
  }
  stop = true;
  await frames;

  gaps.sort((a, b) => a - b);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  return {
    frames: gaps.length,
    meanMs: mean,
    p95Ms: gaps[Math.floor(gaps.length * 0.95)],
    worstMs: gaps[gaps.length - 1],
    rounds,
    busy,
    tier: document.documentElement.classList.contains('effects-low') ? 'low' : 'full',
    errors: [...document.querySelectorAll('.notebook-entry__text')].map((p) => p.textContent)
      .filter((t) => /isn't available in this version/.test(t)),
  };
`;

/** This machine, as a line in PERFORMANCE.md: processor and graphics. */
async function machineName() {
  const cpu = (os.cpus()[0]?.model || 'unknown processor').replace(/\s+/g, ' ').trim();
  let gpu = 'unknown graphics';
  try {
    const info = await app.getGPUInfo('complete');
    const renderer = info?.auxAttributes?.glRenderer;
    const device = (info?.gpuDevice || []).find((d) => d.active) || info?.gpuDevice?.[0];
    gpu = (renderer || device?.deviceString || gpu).replace(/^ANGLE \((.*)\)$/, '$1');
    // Keep the readable part: "Intel, Intel(R) UHD Graphics 620 (0x...) Direct3D11 ..." -> the name.
    gpu = gpu.split(/\s*\(0x|\s+Direct3D/)[0].replace(/^[^,]+,\s*/, '');
  } catch {
    // No graphics information: the processor alone names the machine.
  }
  return `${cpu} · ${gpu}`.replace(/\|/g, '/');
}

/** The baseline rows of PERFORMANCE.md: machine, tier, average frame ms. */
function readBaselines(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 6 || !/^\d/.test(cells[2])) continue;
    rows.push({ machine: cells[0], tier: cells[1], meanMs: Number.parseFloat(cells[2]), line });
  }
  return rows;
}

function recordBaseline(text, machine, result) {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const row = `| ${machine} | ${TIER} | ${result.meanMs.toFixed(2)} | ${Math.round(1000 / result.meanMs)} | ${result.p95Ms.toFixed(2)} | ${today} |`;
  const existing = readBaselines(text).find((r) => r.machine === machine && r.tier === TIER);
  if (existing) return text.replace(existing.line, row);
  const marker = '<!-- baselines end -->';
  if (!text.includes(marker)) throw new Error('PERFORMANCE.md has no "<!-- baselines end -->" marker');
  return text.replace(marker, `${row}\n${marker}`);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: true,
    width: 1366,
    height: 768,
    useContentSize: true,
    title: 'Virtual Chemistry Lab - performance test',
    webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true },
  });
  win.setContentSize(1366, 768);
  try {
    await win.loadFile(path.join(ROOT, 'src', 'index.html'));
    const result = await win.webContents.executeJavaScript(`(async () => {
      ${HELPERS}
      await __cap.wait(600);
      ${BUILD}
      ${MEASURE}
    })()`);
    if (SCREENSHOT) writeFileSync(SCREENSHOT, (await win.webContents.capturePage()).toPNG());
    const machine = await machineName();
    const fps = 1000 / result.meanMs;

    console.log(`Busy bench, effects ${result.tier}, on ${machine}`);
    if (ADD_WORK_MS > 0) console.log(`  (with ${ADD_WORK_MS} ms of extra work added to every frame, to check the test fails)`);
    console.log(`  ${result.frames} frames in ${MEASURE_MS / 1000} s: average ${result.meanMs.toFixed(2)} ms (${Math.round(fps)} fps),`
      + ` 95% under ${result.p95Ms.toFixed(2)} ms, slowest ${result.worstMs.toFixed(1)} ms`);
    console.log(`  kept busy: ${result.rounds} rounds of additions; boiling ${result.busy.boiling ? 'yes' : 'NO'},`
      + ` up to ${result.busy.bubbles} reaction bubbles, ${result.busy.streams} electrode bubbles and ${result.busy.grains} falling grains at once`);

    const problems = [];
    if (result.tier !== TIER) problems.push(`the bench ran in the ${result.tier} tier, not ${TIER}`);
    if (!result.busy.boiling) problems.push('the water never boiled, so the bench was not as busy as it should be');
    if (result.busy.bubbles === 0 || !result.busy.streams || result.busy.grains === 0) problems.push('a vessel was not doing its part (no reaction bubbles, electrode bubbles or falling grains), so the bench was not as busy as it should be');
    if (result.errors.length > 0) problems.push(`a combination in the busy bench is not in the lab - the set-up needs fixing: ${result.errors[0]}`);
    if (result.meanMs > FLOOR_FRAME_MS) problems.push(`under 30 fps: average frame ${result.meanMs.toFixed(2)} ms is over ${FLOOR_FRAME_MS.toFixed(1)} ms`);

    const text = readFileSync(PERFORMANCE_MD, 'utf8');
    if (RECORD) {
      if (ADD_WORK_MS > 0) {
        console.log('  NOT recorded: --add-work is a check that the test fails, never a baseline');
      } else if (problems.length === 0) {
        writeFileSync(PERFORMANCE_MD, recordBaseline(text, machine, result));
        console.log('  recorded as this machine\'s baseline in PERFORMANCE.md');
      } else {
        console.log('  NOT recorded: a baseline must come from a run that passes its own checks');
      }
    } else {
      const baseline = readBaselines(text).find((r) => r.machine === machine && r.tier === TIER);
      if (!baseline) {
        problems.push(`no baseline for this machine and tier in PERFORMANCE.md - run "npm run perf -- --record${TIER === 'low' ? ' --tier low' : ''}" once to add one`);
      } else {
        const change = result.meanMs / baseline.meanMs - 1;
        const word = change >= 0 ? 'slower' : 'faster';
        console.log(`  baseline ${baseline.meanMs.toFixed(2)} ms: ${Math.abs(change * 100).toFixed(0)}% ${word}`
          + ` (fails beyond ${ALLOWED_SLOWDOWN * 100}% slower)`);
        if (change > ALLOWED_SLOWDOWN) {
          problems.push(`average frame is ${(change * 100).toFixed(0)}% slower than the baseline of ${baseline.meanMs.toFixed(2)} ms`);
        }
      }
    }

    if (problems.length) {
      console.log('FAIL');
      for (const p of problems) console.log(`  - ${p}`);
      process.exitCode = 1;
    } else {
      console.log('PASS');
    }
  } catch (error) {
    console.error('performance test failed to run:', error);
    process.exitCode = 1;
  }
  // app.exit, not app.quit: Electron does not pass process.exitCode on, and
  // a failing test must end with a failing exit code.
  app.exit(process.exitCode || 0);
});

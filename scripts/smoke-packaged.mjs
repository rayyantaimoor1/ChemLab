/**
 * smoke-packaged.mjs — checks the BUILT app, not the development copy
 * (Phase 10.2; CLAUDE.md §9: "test the .exe build early and often").
 *
 * WHY THIS EXISTS
 * Every other check runs the app from src/. The installer ships something
 * different: the app packed into an asar archive, run by its own copy of
 * Electron, with its own name and data folder. A path that only works
 * unpacked, a file left out of package.json's "files" list, or a network
 * call nobody noticed would pass every other test and fail on a lab PC.
 *
 * This starts build/win-unpacked/Virtual Chemistry Lab.exe - exactly what
 * the installer installs - with a throwaway data folder, and through
 * Chromium's debugging port checks that:
 *   1. the window opens on the app, titled "Virtual Chemistry Lab";
 *   2. the shelf has every reagent the engine says belongs on it;
 *   3. a reaction runs end to end: lead(II) nitrate and potassium iodide
 *      in a beaker write the yellow precipitate into the notebook;
 *   4. nothing at all is fetched from the network (CLAUDE.md §2: offline).
 *
 * Run it after building:  npm run dist   then   npm run smoke
 * Exit code 1 if anything fails. Nothing here ships in the app.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const EXE = path.join(ROOT, 'build', 'win-unpacked', `${pkg.build.productName}.exe`);
const PORT = 9333;
// The shelf stocks what the engine says is on the shelf - not every
// chemical, many of which only appear as something a reaction makes.
const { engine } = await import(new URL('../src/core/engine.js', import.meta.url));
const SHELF_COUNT = engine.getShelfChemicals().length;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(EXE)) {
  console.error(`No built app at ${path.relative(ROOT, EXE)} - run "npm run dist" first.`);
  process.exit(1);
}

const dataDir = mkdtempSync(path.join(os.tmpdir(), 'chemlab-smoke-'));
const child = spawn(EXE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${dataDir}`], { stdio: 'ignore' });

const problems = [];
const passed = [];
const check = (ok, what) => (ok ? passed : problems).push(what);

try {
  // The page, once the app is up.
  let target = null;
  for (let i = 0; i < 60 && !target; i += 1) {
    await wait(500);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.url.startsWith('file:'));
    } catch {
      // not listening yet
    }
  }
  if (!target) throw new Error('the app never opened its page');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const pending = new Map();
  const fetched = [];
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    } else if (data.method === 'Network.requestWillBeSent') {
      fetched.push(data.params.request.url);
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (reply.result?.exceptionDetails) throw new Error(reply.result.exceptionDetails.exception?.description || 'page error');
    return reply.result?.result?.value;
  };

  await send('Network.enable');
  // Reload, so everything the page loads is seen by the network check.
  await send('Page.enable');
  await send('Page.reload', { ignoreCache: true });
  await wait(2500);

  // 1. The app, by name.
  const title = await evaluate('document.title');
  check(title === pkg.build.productName, `the window is titled "${title}"`);
  check(target.url.includes('app.asar'), 'the page is served from the packed app (app.asar)');

  // 2. The shelf.
  const reagents = await evaluate("document.querySelectorAll('.reagent-bottle').length");
  check(reagents === SHELF_COUNT, `the shelf holds ${reagents} of the ${SHELF_COUNT} reagents it should`);

  // 3. A reaction, end to end, as a student does it.
  const notebook = await evaluate(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (label) => [...document.querySelectorAll('button')]
      .find((b) => (b.getAttribute('aria-label') || b.title || b.textContent).toLowerCase().includes(label)).click();
    const drop = (id, chemical) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', chemical);
      document.querySelector('.vessel-object[data-container-id="' + id + '"]')
        .dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    };
    [...document.querySelectorAll('.shelf-dispense__mode')].find((b) => b.textContent === 'Auto-pour').click();
    await wait(100);
    press('take a beaker 250'); await wait(400);
    drop('beaker_1', 'pbno3_0_1m'); await wait(400);
    drop('beaker_1', 'ki_0_1m'); await wait(800);
    return [...document.querySelectorAll('.notebook-entry__text')].map((p) => p.textContent).join(' | ');
  })()`);
  check(/A precipitate formed: bright yellow lead\(II\) iodide/.test(notebook), 'lead(II) nitrate and potassium iodide wrote the yellow precipitate into the notebook');

  // 4. Offline: nothing but the app's own files.
  const outside = fetched.filter((url) => !/^(file|data|blob|devtools|chrome-extension):/.test(url));
  check(outside.length === 0, outside.length === 0
    ? `nothing was fetched from the network (${fetched.length} requests, all the app's own files)`
    : `fetched from the network: ${[...new Set(outside)].join(', ')}`);

  ws.close();
} catch (error) {
  problems.push(`the check could not finish: ${error.message}`);
} finally {
  child.kill();
  await wait(800);
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* still held by the closing app */ }
}

console.log(`Packaged app: ${path.relative(ROOT, EXE)} (version ${pkg.version})`);
for (const p of passed) console.log(`  ok   ${p}`);
for (const p of problems) console.log(`  FAIL ${p}`);
console.log(problems.length ? 'FAIL' : 'PASS');
process.exitCode = problems.length ? 1 : 0;

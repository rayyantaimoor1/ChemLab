// generate-icon.mjs — builds src/assets/icon.ico and src/assets/icon.png
// from scripts/icon-source.svg.
//
// WHY THIS EXISTS AS A SCRIPT RATHER THAN A CHECKED-IN BINARY ALONE
// No image-rasterisation library is installed (no sharp, no jimp, no
// png-to-ico), and CLAUDE.md section 9 says not to add a dependency
// without stating what it is and why. Electron itself is already a
// devDependency and already ships a rasteriser (Chromium) plus a resizer
// (nativeImage.resize) - this script is Electron's own main process, run
// headless with offscreen rendering, using both. Nothing new installed.
//
// This is a one-off build tool, not part of the shipped app - main.js and
// package.json only ever reference the .ico/.png files it produces.
//
// Run with: node_modules/.bin/electron scripts/generate-icon.mjs --disable-gpu
// (--disable-gpu is required in this environment - without it the GPU
// process fails to initialise and the whole thing exits silently with no
// window ever created at all.)

import { app, BrowserWindow } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SVG_PATH = path.join(__dirname, 'icon-source.svg');
const ASSETS_DIR = path.join(__dirname, '..', 'src', 'assets');

// A real Windows .ico is expected to carry these sizes - small ones for
// the taskbar/title bar, large ones for Explorer's "extra large icons"
// view and the installer.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const MASTER_SIZE = 512; // rendered once, then resized down for quality

/** Packs a set of {size, png} frames into a valid multi-resolution ICO.
 *  ICO's own format: a 6-byte header, one 16-byte directory entry per
 *  frame, then the frames themselves - PNG-encoded frames have been
 *  valid inside an ICO since Windows Vista, so no BMP conversion is
 *  needed. Written by hand because nothing in node_modules does this. */
function packIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(frames.length, 4);

  const entries = [];
  const images = [];
  let offset = 6 + frames.length * 16;

  for (const { size, png } of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // colour palette: none
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
    images.push(png);
  }

  return Buffer.concat([header, ...entries, ...images]);
}

/**
 * Renders the icon SVG offscreen at `size`x`size` and returns
 * { image, close }. Deliberately does NOT destroy the window itself -
 * an offscreen BrowserWindow's captured NativeImage shares memory with
 * its renderer, and destroying the window before every resize()/toPNG()
 * derived from that image has run crashes the whole process natively
 * (no JS exception, no log line - the process just disappears). The
 * caller must call close() only once it is done with every image
 * derived from `image`.
 */
async function renderSvgToImage(svgMarkup, size) {
  // The SVG is inlined directly into the page rather than loaded through
  // an <img src="data:image/svg+xml..."> - that path silently failed to
  // decode under offscreen rendering in this environment (Chromium
  // painted its own broken-image glyph, which then got captured as a
  // "successful" screenshot: a valid PNG of nothing). Inlining removes
  // the decode step entirely.
  const html = `<!doctype html><html><head><style>
    html,body{margin:0;padding:0;background:transparent;overflow:hidden}
    svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${svgMarkup}</body></html>`;

  const win = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  win.webContents.setFrameRate(30);

  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  // Give the SVG's own image decode + layout time to settle before the
  // first paint is captured - capturing immediately on 'paint' can catch
  // the blank pre-layout frame instead.
  await new Promise((resolve) => setTimeout(resolve, 250));

  const image = await new Promise((resolve) => {
    win.webContents.once('paint', (_event, _dirty, bitmap) => resolve(bitmap));
    win.webContents.invalidate();
  });

  return { image, close: () => win.destroy() };
}

const LOG_PATH = path.join(__dirname, 'generate-icon.log');
async function log(line) {
  await writeFile(LOG_PATH, `${new Date().toISOString()} ${line}\n`, { flag: 'a' });
}

async function main() {
  await writeFile(LOG_PATH, ''); // reset
  await app.whenReady();
  await log('app ready');

  const svg = await readFile(SVG_PATH, 'utf-8');

  const { image: master, close } = await renderSvgToImage(svg, MASTER_SIZE);
  await log(`master rendered: ${JSON.stringify(master.getSize())} empty=${master.isEmpty()}`);
  if (master.isEmpty() || master.getSize().width !== MASTER_SIZE) {
    throw new Error(`Master render came back wrong: ${JSON.stringify(master.getSize())}, empty=${master.isEmpty()}`);
  }

  // Every resize()/toPNG() derived from `master` happens here, BEFORE the
  // window behind it is closed - see the warning on renderSvgToImage.
  const frames = ICO_SIZES.map((size) => ({
    size,
    png: master.resize({ width: size, height: size, quality: 'best' }).toPNG(),
  }));
  await log(`frames built: ${frames.map((f) => `${f.size}px(${f.png.length}b)`).join(', ')}`);

  const png256 = master.resize({ width: 256, height: 256, quality: 'best' }).toPNG();
  const png32 = master.resize({ width: 32, height: 32, quality: 'best' }).toPNG();
  await log('all derived PNGs built');

  // Deliberately NOT calling close()/win.destroy() here - doing so, even
  // after every derived image is built, was still enough to crash the
  // process natively part-way through the writes that follow. The render
  // window is left alive and cleaned up by app.exit() itself instead,
  // which is the well-trodden path rather than a manual mid-script one.
  void close;

  await writeFile(path.join(ASSETS_DIR, 'icon.ico'), packIco(frames));
  await log('wrote icon.ico');
  await writeFile(path.join(ASSETS_DIR, 'icon.png'), png256);
  await log('wrote icon.png');
  // A small favicon-sized PNG too, for the dev-preview browser tab.
  await writeFile(path.join(ASSETS_DIR, 'icon-32.png'), png32);
  await log('wrote icon-32.png - ALL DONE');

  setTimeout(() => app.exit(0), 100);
}

main().catch(async (error) => {
  await log(`ERROR: ${(error && error.stack) || error}`).catch(() => {});
  setTimeout(() => app.exit(1), 100);
});

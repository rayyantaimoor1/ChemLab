/**
 * make-room-images.mjs — draws the two room textures the bench stands in
 * front of (BUILD_UI.md stage UI.8.1), and saves them compressed into
 * src/assets/room/.
 *
 *   npx electron scripts/make-room-images.mjs
 *
 * Why drawn rather than photographed: the app ships offline with nothing
 * downloaded, and drawn textures can be remade exactly - the random
 * speckle is seeded, so the same script always gives the same images.
 *
 *   wall-tiles.jpg   glazed wall tiles, 100 mm square at the bench's scale
 *                    (110 px), in a dark slate green: the glassware is drawn
 *                    pale for a dark room, and pale glass vanishes on white.
 *                    2 × 2 tiles, so it repeats seamlessly.
 *   bench-resin.jpg  the bench top: dark phenolic resin with a faint
 *                    speckle. Repeats left to right.
 *
 * The light from one side is not in the images - it is a CSS gradient over
 * them, so the tiles repeat seamlessly and the light stays consistent.
 */

import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

app.setPath('userData', path.join(os.tmpdir(), 'chemlab-room-images'));
app.disableHardwareAcceleration();

const OUT = path.join(process.cwd(), 'src', 'assets', 'room');

const draw = `(() => {
  // A small seeded random, so the textures are the same every time.
  let seed = 20261121;
  const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const out = {};

  // --- Wall tiles: 2 x 2 tiles of 110 px, grout shared at the edges. ---
  {
    const S = 110, N = 2, W = S * N, G = 3;
    const c = document.createElement('canvas'); c.width = W; c.height = W;
    const g = c.getContext('2d');
    g.fillStyle = '#28302D'; // grout
    g.fillRect(0, 0, W, W);
    for (let i = 0; i < N; i += 1) for (let j = 0; j < N; j += 1) {
      const x = i * S + G / 2, y = j * S + G / 2, s = S - G;
      const shade = Math.round((rand() - 0.5) * 6);
      const base = [58 + shade, 70 + shade, 65 + shade];
      g.fillStyle = 'rgb(' + base.join(',') + ')';
      g.fillRect(x, y, s, s);
      // The glaze: a soft sheen toward the top-left of each tile.
      const sheen = g.createLinearGradient(x, y, x + s, y + s);
      sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0.0)');
      sheen.addColorStop(1, 'rgba(0,0,0,0.06)');
      g.fillStyle = sheen;
      g.fillRect(x, y, s, s);
      // A bevelled edge where the glaze rounds over.
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      // A faint fleck in the glaze.
      for (let k = 0; k < 140; k += 1) {
        g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
        g.fillRect(x + rand() * s, y + rand() * s, 1, 1);
      }
    }
    out.wall = c.toDataURL('image/jpeg', 0.82);
  }

  // --- Bench top: dark phenolic resin, repeating left to right. ---
  {
    const W = 256, H = 48;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#1D2220';
    g.fillRect(0, 0, W, H);
    // Seen at a low angle: the back of the top a little darker.
    const depth = g.createLinearGradient(0, 0, 0, H);
    depth.addColorStop(0, 'rgba(0,0,0,0.22)');
    depth.addColorStop(1, 'rgba(255,255,255,0.03)');
    g.fillStyle = depth;
    g.fillRect(0, 0, W, H);
    for (let k = 0; k < 900; k += 1) {
      g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.12)';
      g.fillRect(Math.floor(rand() * W), Math.floor(rand() * H), 1, 1);
    }
    out.bench = c.toDataURL('image/jpeg', 0.85);
  }
  return out;
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('about:blank');
  const images = await win.webContents.executeJavaScript(draw);
  mkdirSync(OUT, { recursive: true });
  for (const [name, file] of [['wall', 'wall-tiles.jpg'], ['bench', 'bench-resin.jpg']]) {
    const target = path.join(OUT, file);
    writeFileSync(target, Buffer.from(images[name].split(',')[1], 'base64'));
    console.log(`${file}: ${statSync(target).size} bytes`);
  }
  app.quit();
});

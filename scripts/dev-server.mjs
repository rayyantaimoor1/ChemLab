/**
 * dev-server.mjs — serves the renderer over HTTP so the UI can be opened in a
 * plain browser during development.
 *
 * The renderer is pure ES modules reading JSON straight from src/data, with no
 * dependency on Electron's preload bridge, so it runs fine outside Electron.
 * That makes UI work far quicker to check than rebuilding the app each time.
 * `npm start` is still the real thing; this is only a viewer.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

// src/ is the web root, because index.html loads "ui/app.js" relative to
// itself and the engine imports "../data/*.json" relative to src/core.
const ROOT = join(process.cwd(), 'src');
const PORT = Number(process.env.PORT) || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = normalize(join(ROOT, decodeURIComponent(path)));

  // Keep the server inside the project directory: refuse anything that
  // normalising walked back out of it.
  if (!file.startsWith(ROOT)) {
    response.writeHead(403, { 'content-type': 'text/plain' });
    response.end('Forbidden');
    return;
  }

  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not found');
  }
}).listen(PORT, () => console.log(`ChemLab renderer on http://localhost:${PORT}`));

// Runs before index.html loads, with access to Node APIs.
// contextBridge is the only safe way to hand anything to the page — it stops
// the renderer (and any future reagent/experiment content) from touching Node
// or Electron directly. Nothing is exposed yet; this is just the wiring.

import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('chemlab', {});

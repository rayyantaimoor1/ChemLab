/**
 * molecular3d.js — the ball-and-stick 3D viewer, CLAUDE.md section 8's
 * Phase 6 second half: "3D ball-and-stick after" the 2D structures
 * (src/data/molecules/) and the reaction animations (molecular.js).
 *
 * NO LIBRARY. This was evaluated, not skipped: three.js's npm package is
 * about 23 MB unpacked (checked via `npm view three dist.unpackedSize`
 * before writing any code here, per CLAUDE.md section 9's rule to state a
 * dependency's size before adding it) and even a minimal WebGL scene needs
 * real boilerplate - a shader, a camera, a render loop. Every molecule here
 * is small (2 to 9 atoms; nothing protein-scale), so that machinery buys
 * nothing a plain CSS 3D transform cannot already do. The result: zero new
 * dependencies, and "no WebGL" stays true everywhere in the app, not only
 * in the bench view UI.md section 6 says it for.
 *
 * HOW THE 3D IS DONE WITH ONLY CSS
 * A `.scene` element holds `transform-style: preserve-3d`. Every atom is a
 * sphere (a circle with a static radial-gradient for shading - the gradient
 * itself never changes, so it costs nothing extra to composite) positioned
 * with `transform: translate3d(...)`. Every bond is a thin rectangle aimed
 * at its two atoms by rotating it in yaw and pitch and scaling its length -
 * the same translate+rotate+scale idea molecular.js already uses for its 2D
 * bonds, extended into three dimensions. Chromium's preserve-3d does real
 * inter-element depth ordering for a scene this small, so nothing here does
 * manual z-sorting.
 *
 * Dragging updates two rotation angles and writes them straight onto
 * `.scene`'s transform - one line, no interpolation, no easing. That is
 * "lightweight" taken literally, and it is also what makes the next
 * paragraph true.
 *
 * WHY IT NEVER RUNS WHILE THE BENCH IS ANIMATING
 * This file has no requestAnimationFrame loop anywhere and never has one
 * running in the background. The rotation only changes inside a pointermove
 * handler, so there is zero work happening except in the instant a student
 * is actively dragging - there is nothing here to collide with a bubble
 * burst or a colour crossfade playing on the bench underneath. It is also
 * a modal: opening it sits a backdrop over the bench (the same as the
 * properties card and the 2D molecular view), which blocks the drag-and-
 * drop and button clicks that are the only way to start a NEW bench effect
 * while it is open.
 *
 * WHERE THE COORDINATES COME FROM
 * src/data/molecules3d.json, one entry per chemical id, each a list of
 * atoms with x/y/z and a list of bonds. Real geometry is used where it
 * is well known and simple (water's bent shape, sulfate's tetrahedral
 * oxygens, nitrate's flat triangle) - not computed from any physics, just
 * curated numbers, the same "curated, not computed" standard CLAUDE.md
 * section 6.6 sets for pH. Ionic pairs are drawn along a line, the same
 * simplification already used in the 2D structures and explicitly not a
 * crystal lattice. Phenolphthalein carries its own "note" field repeating
 * the same simplified-schematic caveat as its 2D drawing, for the same
 * reason: an organic ring system is the one thing here not safe to claim
 * bond-precise accuracy on from memory.
 */

import molecules3d from '../data/molecules3d.json' with { type: 'json' };

/** Matches molecular.js's element palette, so the same atom is the same
 *  colour in the 2D reaction animation and the 3D viewer. */
const ELEMENT_STYLE = {
  H: '#F5F5F0',
  O: '#E74C3C',
  N: '#2E86C1',
  Cl: '#2ECC71',
  I: '#6C3483',
  Na: '#8E44AD',
  K: '#9B59B6',
  Pb: '#7F8C8D',
  Ag: '#B0B7BD',
  Zn: '#5D6D7E',
  Cu: '#B5651D',
  S: '#F1C40F',
  C: '#2C3E50',
  group: '#D5DBDB',
};

const FALLBACK_COLOR = '#BDC3C7';

/** Roughly relative atomic radii, purely for how big the sphere is drawn. */
const ELEMENT_RADIUS = {
  H: 0.32, O: 0.5, N: 0.5, Cl: 0.62, I: 0.66, Na: 0.58, K: 0.66,
  Pb: 0.72, Ag: 0.6, Zn: 0.56, Cu: 0.58, S: 0.6, C: 0.5, group: 0.45,
};

export function getMolecule3D(chemicalId) {
  return molecules3d[chemicalId] || null;
}

function colorFor(element) {
  return ELEMENT_STYLE[element] || FALLBACK_COLOR;
}

function radiusFor(element) {
  return ELEMENT_RADIUS[element] ?? 0.5;
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

const UNIT_PX = 46; // one coordinate unit, in on-screen pixels at rest

/**
 * Builds the scene once. Every atom and bond is a plain positioned div;
 * nothing is ever added or removed afterwards, so a drag only ever writes
 * one `transform` string onto the outer `.scene` element - the atoms and
 * bonds inherit the rotation for free from `transform-style: preserve-3d`.
 */
function buildScene(stage, molecule) {
  stage.innerHTML = '';

  const scene = el('div', 'molecular3d__scene');

  for (const atom of molecule.atoms) {
    const radius = radiusFor(atom.element) * UNIT_PX;
    const sphere = el('div', 'molecular3d__atom');
    sphere.style.width = `${radius * 2}px`;
    sphere.style.height = `${radius * 2}px`;
    sphere.style.marginLeft = `${-radius}px`;
    sphere.style.marginTop = `${-radius}px`;
    sphere.style.background =
      `radial-gradient(circle at 35% 30%, #ffffff 0%, ${colorFor(atom.element)} 55%, #00000055 100%)`;
    sphere.style.transform =
      `translate3d(${atom.x * UNIT_PX}px, ${-atom.y * UNIT_PX}px, ${atom.z * UNIT_PX}px)`;

    if (atom.element !== 'group') {
      const label = el('span', 'molecular3d__label');
      label.textContent = atom.element;
      sphere.appendChild(label);
    }

    scene.appendChild(sphere);
  }

  for (const bond of molecule.bonds) {
    const from = molecule.atoms.find((atom) => atom.id === bond.from);
    const to = molecule.atoms.find((atom) => atom.id === bond.to);
    if (!from || !to) continue; // guarded by a data test; skip rather than throw on stage

    const dx = (to.x - from.x) * UNIT_PX;
    const dy = -(to.y - from.y) * UNIT_PX;
    const dz = (to.z - from.z) * UNIT_PX;
    const length = Math.hypot(dx, dy, dz);
    const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
    const pitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;

    const stick = el('div', `molecular3d__bond molecular3d__bond--${bond.type || 'covalent'}`);
    stick.style.height = `${length}px`;
    stick.style.transform =
      `translate3d(${from.x * UNIT_PX}px, ${-from.y * UNIT_PX}px, ${from.z * UNIT_PX}px)` +
      ` rotateY(${yaw}deg) rotateX(${-pitch}deg)`;
    scene.appendChild(stick);
  }

  stage.appendChild(scene);
  return scene;
}

/**
 * Wires mouse/touch drag rotation onto `scene`. Every update is written
 * directly inside the move handler - see this file's header for why that,
 * rather than a render loop, is the point.
 */
function wireDrag(stage, scene) {
  let rotateX = -18; // a slight tilt at rest, so a flat molecule does not
  let rotateY = 28;  // read as a 2D drawing before anyone has touched it
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function apply() {
    scene.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  }
  apply();

  function pointerDown(event) {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    stage.classList.add('molecular3d__stage--dragging');
    stage.setPointerCapture?.(event.pointerId);
  }

  function pointerMove(event) {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    rotateY += dx * 0.5;
    rotateX -= dy * 0.5;
    // Clamped rather than wrapped: past straight up or down, "which way is
    // up" stops meaning anything useful for a mouse drag to control.
    rotateX = Math.max(-89, Math.min(89, rotateX));
    apply();
  }

  function pointerUp(event) {
    dragging = false;
    stage.classList.remove('molecular3d__stage--dragging');
    stage.releasePointerCapture?.(event.pointerId);
  }

  stage.addEventListener('pointerdown', pointerDown);
  stage.addEventListener('pointermove', pointerMove);
  stage.addEventListener('pointerup', pointerUp);
  stage.addEventListener('pointercancel', pointerUp);

  return () => {
    stage.removeEventListener('pointerdown', pointerDown);
    stage.removeEventListener('pointermove', pointerMove);
    stage.removeEventListener('pointerup', pointerUp);
    stage.removeEventListener('pointercancel', pointerUp);
  };
}

/* ==================================================================== *
 * The modal
 * ==================================================================== */

/**
 * Mounts the 3D viewer overlay - UI.md section 3's molecular view, the 3D
 * half. Reachable from the properties card's "View in 3D" button, for
 * whichever chemical's card is open - a reagent or a formed product both
 * have a real structure, so the same viewer serves either, the same way
 * the 2D structure and the properties card already do.
 *
 * Same dismissal policy as the properties card and unlike the hazard alert:
 * a backdrop click closes this, since looking at a structure is a
 * voluntary look-up with nothing to lose by closing it early.
 */
export function mountMolecular3DView({ root, getState, dispatch, subscribe, getChemical }) {
  let shownChemicalId = null;
  let unwireDrag = null;
  let returnFocusTo = null;

  function render() {
    const chemicalId = getState().viewing3DChemicalId;

    if (!chemicalId) {
      if (shownChemicalId) close();
      return;
    }
    if (chemicalId === shownChemicalId) return;
    open(chemicalId);
  }

  function open(chemicalId) {
    const chemical = getChemical(chemicalId);
    const molecule = getMolecule3D(chemicalId);

    shownChemicalId = chemicalId;
    returnFocusTo = document.activeElement;

    root.innerHTML = '';
    root.appendChild(buildOverlay(chemical, molecule));
    root.hidden = false;

    const closeButton = root.querySelector('.molecular3d-panel__close');
    if (closeButton) closeButton.focus();

    document.addEventListener('keydown', onKeyDown, true);
  }

  function close() {
    if (unwireDrag) {
      unwireDrag();
      unwireDrag = null;
    }
    shownChemicalId = null;
    root.innerHTML = '';
    root.hidden = true;
    document.removeEventListener('keydown', onKeyDown, true);

    if (returnFocusTo && typeof returnFocusTo.focus === 'function' && returnFocusTo.isConnected) {
      returnFocusTo.focus();
    }
    returnFocusTo = null;
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch.close3DStructure();
    }
  }

  function buildOverlay(chemical, molecule) {
    const overlay = el('div', 'molecular3d-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'molecular3d-title');

    const backdrop = el('div', 'molecular3d-backdrop');
    backdrop.addEventListener('click', () => dispatch.close3DStructure());
    overlay.appendChild(backdrop);

    const panel = el('div', 'molecular3d-panel');

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'molecular3d-panel__close';
    closeButton.textContent = 'Close';
    closeButton.setAttribute('aria-label', 'Close 3D view');
    closeButton.addEventListener('click', () => dispatch.close3DStructure());
    panel.appendChild(closeButton);

    const title = document.createElement('h2');
    title.id = 'molecular3d-title';
    title.className = 'molecular3d-panel__title';
    title.textContent = chemical ? `${chemical.name} — 3D structure` : '3D structure';
    panel.appendChild(title);

    if (!molecule) {
      const missing = document.createElement('p');
      missing.textContent = chemical
        ? 'There is no 3D structure for this chemical in this version of the lab yet.'
        : 'That chemical could not be found.';
      panel.appendChild(missing);
      overlay.appendChild(panel);
      return overlay;
    }

    if (molecule.note) {
      const note = document.createElement('p');
      note.className = 'molecular3d-panel__note';
      note.textContent = molecule.note;
      panel.appendChild(note);
    }

    const stage = el('div', 'molecular3d__stage');
    stage.setAttribute('role', 'img');
    stage.setAttribute(
      'aria-label',
      `Rotatable 3D ball-and-stick model of ${chemical ? chemical.name : molecule ? Object.keys(molecule).join(',') : 'the molecule'}. Drag with the mouse to rotate; this model does not otherwise move on its own.`
    );

    const scene = buildScene(stage, molecule);
    unwireDrag = wireDrag(stage, scene);
    panel.appendChild(stage);

    const hint = document.createElement('p');
    hint.className = 'molecular3d-panel__hint';
    hint.textContent = 'Drag to rotate.';
    panel.appendChild(hint);

    overlay.appendChild(panel);
    return overlay;
  }

  root.hidden = true;
  subscribe(render);
  render();

  return { render };
}

export default mountMolecular3DView;

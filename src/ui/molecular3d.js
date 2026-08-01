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
 * `.scene`'s transform, no interpolation, no easing. Each atom sphere is
 * then billboarded: it gets the *inverse* of that same rotation appended
 * after its own translate3d, so it keeps facing the camera instead of
 * rotating edge-on into a flat ellipse (a `border-radius: 50%` div is a
 * flat disc, not a real sphere - without this it looks round only from
 * the angle it was built at). Every atom's position still moves correctly
 * in 3D; only its own face-on orientation is held fixed. That is still a
 * handful of direct style writes per pointermove, not a render loop - the
 * "lightweight" claim in the next paragraph still holds for molecules
 * this small (2 to 9 atoms).
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
  Mg: '#86A17A',
  Fe: '#8A6A4F',
  Ca: '#6E8FA6',
  Ba: '#4A6E8A',
  V: '#B5651D',
  Pt: '#C9CDD1',
  Mn: '#7D5BA6',
  Br: '#A62929',
  S: '#F1C40F',
  C: '#2C3E50',
  group: '#D5DBDB',
};

const FALLBACK_COLOR = '#BDC3C7';

/** Roughly relative atomic radii, purely for how big the sphere is drawn. */
const ELEMENT_RADIUS = {
  H: 0.32, O: 0.5, N: 0.5, Cl: 0.62, I: 0.66, Na: 0.58, K: 0.66,
  Pb: 0.72, Ag: 0.6, Zn: 0.56, Cu: 0.58, Mg: 0.54, Fe: 0.56, Ca: 0.68,
  Ba: 0.76, Br: 0.64, V: 0.6, Pt: 0.66, Mn: 0.58, S: 0.6, C: 0.5, group: 0.45,
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
 * A bond div's un-rotated shape points straight down the screen (its CSS
 * height grows in +Y). This computes the ONE rotation - about a single
 * axis, by a single angle (Rodrigues' rotation formula, exposed directly
 * by CSS's rotate3d()) - that swings that resting +Y direction onto the
 * vector toward the other atom.
 *
 * The previous version split this into a separate rotateY(yaw) then
 * rotateX(pitch). That decomposition has a real hole: whenever the two
 * atoms are level with each other (dy = 0, a purely horizontal bond -
 * exactly the case for every ionic bond in this data, since the metal
 * and the ion it is paired with are drawn at the same height), pitch
 * comes out to 0deg. rotateX(0) is a no-op, and rotateY can never rotate
 * a vector that starts out lying exactly on the Y axis in the first
 * place - so the bond stayed stuck pointing straight down instead of
 * reaching sideways to the other atom. A single-axis rotation has no
 * such degenerate case to fall into.
 */
function bondRotation(dx, dy, dz, length) {
  if (length < 1e-6) return ''; // guarded by a data test; distinct atoms only
  const ux = dx / length;
  const uy = dy / length;
  const uz = dz / length;

  // axis = (0, 1, 0) × (ux, uy, uz); the Y terms drop out algebraically.
  const axisX = uz;
  const axisZ = -ux;
  const axisLength = Math.hypot(axisX, axisZ);
  const angleDeg = (Math.acos(Math.max(-1, Math.min(1, uy))) * 180) / Math.PI;

  if (axisLength < 1e-6) {
    // Straight down (no rotation needed) or straight up (the axis is
    // undefined, but any axis perpendicular to Y works for a 180 turn).
    return angleDeg < 1 ? '' : 'rotate3d(1, 0, 0, 180deg)';
  }
  return `rotate3d(${axisX / axisLength}, 0, ${axisZ / axisLength}, ${angleDeg}deg)`;
}

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
    // Base position only, no rotation - wireDrag's apply() appends the
    // camera-facing billboard rotation on top of this every time the
    // scene turns, including once immediately for the resting pose.
    sphere.dataset.tx = String(atom.x * UNIT_PX);
    sphere.dataset.ty = String(-atom.y * UNIT_PX);
    sphere.dataset.tz = String(atom.z * UNIT_PX);
    sphere.style.transform =
      `translate3d(${sphere.dataset.tx}px, ${sphere.dataset.ty}px, ${sphere.dataset.tz}px)`;

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

    const stick = el('div', `molecular3d__bond molecular3d__bond--${bond.type || 'covalent'}`);
    stick.style.height = `${length}px`;
    stick.style.transform =
      `translate3d(${from.x * UNIT_PX}px, ${-from.y * UNIT_PX}px, ${from.z * UNIT_PX}px)` +
      ` ${bondRotation(dx, dy, dz, length)}`;
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

  // Snapshot once: buildScene has already populated the scene by the time
  // wireDrag is called, and the atom list never changes after that.
  const atomEls = Array.from(scene.querySelectorAll('.molecular3d__atom'));

  function apply() {
    scene.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    // Billboard every sphere: undo the scene's rotation, in reverse order,
    // on top of each atom's own translate3d, so a flat circular div keeps
    // presenting its round face to the camera instead of turning edge-on
    // into an ellipse as the molecule rotates.
    for (const atom of atomEls) {
      atom.style.transform =
        `translate3d(${atom.dataset.tx}px, ${atom.dataset.ty}px, ${atom.dataset.tz}px) ` +
        `rotateY(${-rotateY}deg) rotateX(${-rotateX}deg)`;
    }
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

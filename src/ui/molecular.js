/**
 * molecular.js — plays the scripted molecular animations: atoms and ions
 * moving apart, meeting, and joining up, for one reaction at a time.
 *
 * WHAT THIS IS AND IS NOT
 * Every animation is a list of hand-written keyframes in
 * src/data/animations.json - where each particle sits at each step, which
 * bonds exist, what charge each one carries, and a sentence saying what is
 * happening. This file tweens between those keyframes. There is no physics
 * here at all: nothing computes a force, an orbit or a trajectory. That is
 * deliberate and matches CLAUDE.md section 10, which rules out real-time
 * physics simulation, and section 6, which rules out the engine inventing
 * chemistry - a simulated rearrangement would be exactly that.
 *
 * WHY THE SCRIPTS ARE DATA AND NOT CODE
 * CLAUDE.md section 4: "JSON - all chemistry content lives in data files,
 * never hardcoded in logic." Which atom moves where during a reaction is a
 * depiction of the chemistry, so it belongs in a data file that can be
 * corrected without touching this renderer. animations.json is a new file,
 * not one of the four section 4 lists - worth noting as an addition.
 *
 * The one thing kept here rather than in the data is the colour of each
 * element, because that is presentation, not chemistry, and repeating the
 * same hex codes across every keyframe would guarantee they drift apart.
 * These match the static structure drawings in src/data/molecules/ so a
 * student sees the same oxygen red in both places.
 *
 * WHY THIS DRAWS ON A TIMER INSTEAD OF USING effects.js's animate()
 * Every other animation in this app hands a start and an end to the browser
 * and lets it interpolate. That cannot express a bond: a bond is a line
 * between two particles that are both moving, so where it should be drawn
 * depends on where they both are at that instant. So this runs its own
 * requestAnimationFrame loop, works out every position for the current
 * moment, and draws from that.
 *
 * It still obeys UI.md section 6's performance rule. Every particle and
 * every bond is a group positioned purely with a `transform` - translate for
 * particles, translate plus rotate plus scale for bonds - so nothing here
 * triggers layout or a repaint of anything but the small modal it lives in.
 * No filter, no box-shadow, no WebGL.
 *
 * REDUCED MOTION
 * prefersReducedMotion (effects.js, covering both the OS setting and the
 * in-app toggle) suppresses playback entirely: the final frame is drawn and
 * every caption is listed as text instead. The teaching content is in the
 * captions, so a student who cannot use animation loses none of it - which
 * is also UI.md section 8's rule that no information is ever conveyed by
 * animation alone.
 */

import animationData from '../data/animations.json' with { type: 'json' };
import { prefersReducedMotion } from './effects.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Element colours, matching the static structures in src/data/molecules/.
 * "group" is for a polyatomic spectator ion drawn as one labelled block
 * (NO₃⁻ and the like) rather than as separate atoms - at this level what
 * matters is that it drifts through the reaction untouched, not its
 * internal bonding.
 */
const ELEMENT_STYLE = {
  H: { fill: '#F5F5F0', text: '#161A19' },
  O: { fill: '#E74C3C', text: '#FFFFFF' },
  N: { fill: '#2E86C1', text: '#FFFFFF' },
  Cl: { fill: '#2ECC71', text: '#0B3D1E' },
  I: { fill: '#6C3483', text: '#FFFFFF' },
  Na: { fill: '#8E44AD', text: '#FFFFFF' },
  K: { fill: '#9B59B6', text: '#FFFFFF' },
  Pb: { fill: '#7F8C8D', text: '#FFFFFF' },
  Ag: { fill: '#B0B7BD', text: '#161A19' },
  Zn: { fill: '#5D6D7E', text: '#FFFFFF' },
  Cu: { fill: '#B5651D', text: '#FFFFFF' },
  Mg: { fill: '#86A17A', text: '#161A19' },
  Fe: { fill: '#8A6A4F', text: '#FFFFFF' },
  Ca: { fill: '#6E8FA6', text: '#161A19' },
  Ba: { fill: '#4A6E8A', text: '#FFFFFF' },
  V: { fill: '#B5651D', text: '#FFFFFF' },
  Pt: { fill: '#C9CDD1', text: '#161A19' },
  Mn: { fill: '#7D5BA6', text: '#FFFFFF' },
  Br: { fill: '#A62929', text: '#FFFFFF' },
  S: { fill: '#F1C40F', text: '#161A19' },
  C: { fill: '#2C3E50', text: '#FFFFFF' },
  group: { fill: '#D5DBDB', text: '#161A19' },
  electron: { fill: '#F1C40F', text: '#161A19' },
  // Both electrodes are drawn the same dark grey on purpose: in a real cell
  // they are usually two identical carbon rods, and it is the sign on them -
  // not their colour - that says which is which. UI.md section 5's rule that
  // colour is never the only channel applies here as much as anywhere, and
  // hazard red is reserved for danger (section 4) so it cannot mark an anode.
  electrode: { fill: '#4A4A4A', text: '#FFFFFF' },
};

const FALLBACK_STYLE = { fill: '#BDC3C7', text: '#161A19' };

function styleFor(element) {
  return ELEMENT_STYLE[element] || FALLBACK_STYLE;
}

export function getAnimation(animationId) {
  return animationData[animationId] || null;
}

export function listAnimationIds() {
  return Object.keys(animationData);
}

/** Ease-in-out, so each move starts and stops gently rather than jerking. */
function ease(t) {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function el(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

/**
 * Builds the SVG once and returns a draw function.
 *
 * Everything is created up front and then only re-positioned, so a frame
 * never rebuilds the DOM - the loop below just writes transforms.
 */
function buildScene(svg, animation) {
  svg.innerHTML = '';
  const [minX, minY, width, height] = animation.viewBox;
  svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);

  // Bonds are drawn under the particles so a line never crosses a label.
  const bondLayer = el('g');
  const particleLayer = el('g');
  svg.append(bondLayer, particleLayer);

  // Every bond named anywhere in the script gets one element, reused across
  // steps and faded in or out as it comes and goes.
  const bondKeys = new Set();
  for (const step of animation.steps) {
    for (const bond of step.bonds || []) bondKeys.add(`${bond.from}|${bond.to}|${bond.type || 'covalent'}`);
  }

  const bonds = new Map();
  for (const key of bondKeys) {
    const [from, to, type] = key.split('|');
    const group = el('g', { opacity: '0' });
    // A unit-length horizontal line, so a bond is positioned entirely by
    // transform: translate to the first atom, rotate to face the second,
    // scale to reach it.
    const line = el('line', {
      x1: 0, y1: 0, x2: 1, y2: 0,
      stroke: type === 'ionic' ? '#8A8A8A' : '#161A19',
      'stroke-width': type === 'ionic' ? 1.6 : 2.4,
      'vector-effect': 'non-scaling-stroke',
    });
    if (type === 'ionic') line.setAttribute('stroke-dasharray', '4 4');
    group.appendChild(line);
    bondLayer.appendChild(group);
    bonds.set(key, { group, from, to });
  }

  const particles = new Map();
  for (const particle of animation.particles) {
    const style = styleFor(particle.element);
    const group = el('g');

    if (particle.w && particle.h) {
      group.appendChild(el('rect', {
        x: -particle.w / 2, y: -particle.h / 2,
        width: particle.w, height: particle.h, rx: 8,
        fill: style.fill, stroke: '#161A19', 'stroke-width': 2,
      }));
    } else {
      group.appendChild(el('circle', {
        cx: 0, cy: 0, r: particle.r || 16,
        fill: style.fill, stroke: '#161A19', 'stroke-width': 2,
      }));
    }

    const label = el('text', {
      x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-family': 'sans-serif',
      'font-size': particle.element === 'group' ? 12 : Math.max(11, (particle.r || 16) * 0.8),
      'font-weight': 'bold', fill: style.text,
    });
    label.textContent = particle.label;
    group.appendChild(label);

    // The charge sits just outside the top-right edge, the way it is written
    // in a textbook. It is its own element because a charge can appear or
    // disappear mid-reaction - zinc becoming Zn²⁺ is the whole point of one
    // of these animations.
    const offsetX = particle.w ? particle.w / 2 : (particle.r || 16);
    const offsetY = particle.h ? particle.h / 2 : (particle.r || 16);
    const charge = el('text', {
      x: offsetX - 1, y: -offsetY - 2, 'text-anchor': 'start',
      'font-family': 'sans-serif', 'font-size': 13, 'font-weight': 'bold',
      fill: '#161A19',
    });
    group.appendChild(charge);

    particleLayer.appendChild(group);
    particles.set(particle.id, { group, charge, spec: particle });
  }

  return { particles, bonds };
}

/**
 * Draws one moment: `index` is the step being left, `t` how far towards the
 * next one (0 to 1). Positions, charges and bond visibility all come from
 * the two keyframes either side.
 */
function drawFrame(scene, animation, index, t) {
  const steps = animation.steps;
  const from = steps[index];
  const to = steps[Math.min(index + 1, steps.length - 1)];
  const eased = ease(t);

  const hiddenFrom = new Set(from.hidden || []);
  const hiddenTo = new Set(to.hidden || []);

  const current = new Map();

  for (const [id, particle] of scene.particles) {
    const a = from.positions[id] || to.positions[id] || [0, 0];
    const b = to.positions[id] || a;
    const x = lerp(a[0], b[0], eased);
    const y = lerp(a[1], b[1], eased);
    current.set(id, [x, y]);

    particle.group.setAttribute('transform', `translate(${x} ${y})`);

    // A particle that is hidden in one keyframe and shown in the next fades
    // between the two rather than blinking into existence.
    const opacityFrom = hiddenFrom.has(id) ? 0 : 1;
    const opacityTo = hiddenTo.has(id) ? 0 : 1;
    particle.group.setAttribute('opacity', String(lerp(opacityFrom, opacityTo, eased)));

    // The charge switches at the halfway point rather than cross-fading:
    // "2+" blended into nothing would just look like a rendering fault.
    const chargeSource = eased < 0.5 ? from : to;
    particle.charge.textContent = (chargeSource.charges || {})[id] || '';
  }

  for (const [key, bond] of scene.bonds) {
    const inFrom = (from.bonds || []).some((b) => `${b.from}|${b.to}|${b.type || 'covalent'}` === key);
    const inTo = (to.bonds || []).some((b) => `${b.from}|${b.to}|${b.type || 'covalent'}` === key);
    const opacity = lerp(inFrom ? 1 : 0, inTo ? 1 : 0, eased);
    bond.group.setAttribute('opacity', String(opacity));

    if (opacity <= 0.01) continue;

    const [x1, y1] = current.get(bond.from) || [0, 0];
    const [x2, y2] = current.get(bond.to) || [0, 0];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    // Positioned entirely by transform - see this file's header.
    bond.group.setAttribute('transform', `translate(${x1} ${y1}) rotate(${angle}) scale(${length} 1)`);
  }
}

/**
 * Creates a player bound to one SVG element.
 *
 * @returns {{ play: Function, stop: Function, destroy: Function }}
 */
/**
 * A gap longer than this between two frames is treated as the animation
 * having been paused rather than as time that should be skipped over.
 *
 * requestAnimationFrame stops entirely while a window is minimised or in a
 * background tab, which on the shared machines UI.md section 2 describes is
 * an ordinary thing for a student to do mid-animation. Without this, the
 * first frame after coming back would see several seconds of "elapsed" time
 * and jump straight past whatever step was on screen. With it, the animation
 * simply carries on from where it was left.
 */
const PAUSE_GAP_MS = 400;

export function createMolecularPlayer({ svg, animation, onStep }) {
  const scene = buildScene(svg, animation);
  let frameHandle = null;
  let startedAt = null;
  let lastFrameAt = null;
  let stepIndex = 0;

  function stop() {
    if (frameHandle !== null) {
      cancelAnimationFrame(frameHandle);
      frameHandle = null;
    }
  }

  /** Draws the last keyframe and stops - used for reduced motion. */
  function showFinalFrame() {
    stop();
    const last = animation.steps.length - 1;
    drawFrame(scene, animation, last, 1);
    if (onStep) onStep(last, animation.steps[last]);
  }

  function play() {
    stop();
    if (prefersReducedMotion()) {
      showFinalFrame();
      return;
    }

    stepIndex = 0;
    startedAt = null;
    lastFrameAt = null;

    function frame(now) {
      if (startedAt === null) startedAt = now;

      // Treat a long gap as a pause, not as elapsed time - see PAUSE_GAP_MS.
      if (lastFrameAt !== null && now - lastFrameAt > PAUSE_GAP_MS) {
        startedAt += now - lastFrameAt;
      }
      lastFrameAt = now;

      const step = animation.steps[stepIndex];
      const elapsed = now - startedAt;
      const duration = step.durationMs || 1400;

      if (elapsed >= duration) {
        if (stepIndex >= animation.steps.length - 1) {
          drawFrame(scene, animation, animation.steps.length - 1, 1);
          frameHandle = null;
          return;
        }
        stepIndex += 1;
        startedAt = now;
        if (onStep) onStep(stepIndex, animation.steps[stepIndex]);
        frameHandle = requestAnimationFrame(frame);
        return;
      }

      drawFrame(scene, animation, stepIndex, elapsed / duration);
      frameHandle = requestAnimationFrame(frame);
    }

    if (onStep) onStep(0, animation.steps[0]);
    frameHandle = requestAnimationFrame(frame);
  }

  // Draw something immediately so the panel is never blank before playback.
  drawFrame(scene, animation, 0, 0);

  return { play, stop, showFinalFrame, destroy: stop };
}

/* ==================================================================== *
 * The modal
 * ==================================================================== */

/**
 * Mounts the molecular view overlay - UI.md section 3's "Molecular view"
 * modal, and CLAUDE.md section 8's Phase 6 ("a reaction animation for a
 * formed product").
 *
 * Like the properties card and unlike the hazard alert, a backdrop click
 * closes this: it is something a student chose to open, so there is no
 * risk of dismissing something unread.
 */
export function mountMolecularView({ root, getState, dispatch, subscribe, getReaction }) {
  let shownReactionId = null;
  let player = null;
  let returnFocusTo = null;

  function render() {
    const reactionId = getState().viewingReactionId;

    if (!reactionId) {
      if (shownReactionId) close();
      return;
    }
    if (reactionId === shownReactionId) return;
    open(reactionId);
  }

  function open(reactionId) {
    const reaction = getReaction(reactionId);
    const animation = reaction ? getAnimation(reaction.molecularAnimation) : null;

    shownReactionId = reactionId;
    returnFocusTo = document.activeElement;

    root.innerHTML = '';
    root.appendChild(buildOverlay(reaction, animation));
    root.hidden = false;

    const closeButton = root.querySelector('.molecular-panel__close');
    if (closeButton) closeButton.focus();

    document.addEventListener('keydown', onKeyDown, true);
  }

  function close() {
    if (player) {
      player.destroy();
      player = null;
    }
    shownReactionId = null;
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
      dispatch.closeReactionAnimation();
    }
  }

  function buildOverlay(reaction, animation) {
    const overlay = el2('div', 'molecular-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'molecular-title');

    const backdrop = el2('div', 'molecular-backdrop');
    backdrop.addEventListener('click', () => dispatch.closeReactionAnimation());
    overlay.appendChild(backdrop);

    const panel = el2('div', 'molecular-panel');

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'molecular-panel__close';
    closeButton.textContent = 'Close';
    closeButton.setAttribute('aria-label', 'Close molecular view');
    closeButton.addEventListener('click', () => dispatch.closeReactionAnimation());
    panel.appendChild(closeButton);

    const title = document.createElement('h2');
    title.id = 'molecular-title';
    title.className = 'molecular-panel__title';
    title.textContent = 'What happens to the particles';
    panel.appendChild(title);

    if (!animation) {
      // Honest about a gap rather than showing an empty stage, the same way
      // the engine refuses to invent a reaction it has no rule for.
      const missing = document.createElement('p');
      missing.textContent = reaction
        ? 'There is no molecular animation for this reaction in this version of the lab yet.'
        : 'That reaction could not be found.';
      panel.appendChild(missing);
      overlay.appendChild(panel);
      return overlay;
    }

    const equation = document.createElement('p');
    equation.className = 'molecular-panel__equation';
    equation.textContent = animation.equation || (reaction && reaction.equation) || '';
    panel.appendChild(equation);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'molecular-panel__stage');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Scripted animation of ${animation.equation}`);
    panel.appendChild(svg);

    const caption = document.createElement('p');
    caption.className = 'molecular-panel__caption';
    panel.appendChild(caption);

    const reduced = prefersReducedMotion();

    player = createMolecularPlayer({
      svg,
      animation,
      onStep: (index, step) => {
        caption.textContent = `${index + 1}. ${step.caption}`;
      },
    });

    if (reduced) {
      // No playback, so the steps are laid out as a list instead - the
      // captions carry the teaching, and they must not be reachable only by
      // watching something move (UI.md section 8).
      player.showFinalFrame();
      caption.textContent = 'Animation is turned off, so every step is written out below.';

      const list = document.createElement('ol');
      list.className = 'molecular-panel__steps';
      for (const step of animation.steps) {
        const item = document.createElement('li');
        item.textContent = step.caption;
        list.appendChild(item);
      }
      panel.appendChild(list);
    } else {
      const replay = document.createElement('button');
      replay.type = 'button';
      replay.className = 'molecular-panel__replay';
      replay.textContent = 'Play again';
      replay.addEventListener('click', () => player.play());
      panel.appendChild(replay);

      player.play();
    }

    overlay.appendChild(panel);
    return overlay;
  }

  function el2(tag, className) {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  }

  root.hidden = true;
  subscribe(render);
  render();

  return { render };
}

export default mountMolecularView;

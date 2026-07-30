/**
 * effects.js — turns a container's curated reaction data into the motion
 * UI.md section 6 describes: colour change, bubbling, precipitate forming
 * and settling, gas evolution, plus the liquid level, temperature digits,
 * a burner flame, and a pour stream that bench.js needs to animate.
 *
 * WHERE THE DATA COMES FROM
 * Every function here is handed values that already came from src/core/ -
 * a reaction's curated effects.colorToHex, effects.precipitate, a container
 * snapshot's volumeMl. This file never decides what colour a reaction
 * produces or whether bubbles should appear; it only renders what it is
 * told. See UI.md section 1's "test of the boundary": a purely visual
 * change belongs here, a chemistry decision belongs in src/core/.
 *
 * THE PERFORMANCE RULE
 * UI.md section 6: animate transform and opacity only. No filter: blur(),
 * no animated box-shadow, no WebGL - the target is 30 fps on Intel HD
 * integrated graphics, and only transform/opacity can be composited by the
 * GPU without a repaint on every frame. That is also why "smooth colour
 * interpolation" is not a CSS transition on background-color (a repaint
 * every frame) - see crossfadeColor below for how it is done instead with
 * opacity alone.
 *
 * The one deliberate exception is tickNumber(): it updates a text node's
 * characters on a timer, not a composited style property. UI.md's own
 * motion table demands it ("Temperature change: tied to readout, digits
 * tick, don't jump") and updating text has none of the repaint cost the
 * transform/opacity rule exists to avoid.
 *
 * REDUCED MOTION
 * Every animation in this file goes through animate(), which checks
 * prefers-reduced-motion and, when set, jumps straight to the final state
 * instead of playing anything. setReduceAnimation() below adds the second
 * half UI.md section 6 asks for: an in-app toggle, independent of the OS
 * setting, for shared machines where that setting is rarely touched and for
 * a teacher who wants motion off on a projector without changing Windows
 * settings on a lab PC that is not theirs.
 *
 * The app toggle also sets a class on <html> so bench.css's ambient flame
 * animation (a CSS @keyframes loop, not something animate() below ever
 * touches) is silenced by the same switch - see bench.css's
 * .fx-flame--1/2/3 rules, which match the class exactly the way they
 * already match the OS media query.
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const APP_REDUCE_MOTION_CLASS = 'reduce-motion';

let appReduceMotionEnabled = false;

/**
 * The in-app "Reduce animation" toggle from UI.md section 6. This is an
 * override on TOP of the OS setting, not a replacement for it - turning
 * this off does not force animation on for someone whose OS already asked
 * for less motion.
 */
export function setReduceAnimation(enabled) {
  appReduceMotionEnabled = Boolean(enabled);
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.classList.toggle(APP_REDUCE_MOTION_CLASS, appReduceMotionEnabled);
  }
}

export function isReduceAnimationEnabled() {
  return appReduceMotionEnabled;
}

/**
 * True when motion should be suppressed, for EITHER reason: the OS's
 * prefers-reduced-motion, or the in-app toggle. Exported so anything that
 * animates outside animate() below - molecular.js runs its own timed loop,
 * because a molecule's bonds have to be redrawn from wherever its atoms
 * currently are - asks the same single question rather than re-implementing
 * half of it and drifting out of step.
 */
export function prefersReducedMotion() {
  if (appReduceMotionEnabled) return true;
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

// Kept as a local alias so the rest of this file reads unchanged.
const reducedMotionPreferred = prefersReducedMotion;

/**
 * The one place every animation in this file goes through. Reduced motion
 * skips straight to the last keyframe instead of playing anything.
 */
function animate(el, keyframes, options) {
  if (!el || !el.animate) return null;

  if (reducedMotionPreferred()) {
    const last = keyframes[keyframes.length - 1];
    Object.assign(el.style, last);
    return null;
  }

  return el.animate(keyframes, { fill: 'forwards', easing: 'ease-out', ...options });
}

/**
 * Runs callback once an animation from animate() has actually completed, or
 * immediately if animate() returned null (reduced motion already jumped
 * straight to the end). Uses the animation's `finished` promise rather than
 * its `onfinish` event - the two are usually equivalent, but the promise is
 * the more robust of the two when a browser throttles animation callbacks
 * for a document that is not currently the visible, composited tab.
 *
 * A timeout backstop also calls callback shortly after the animation should
 * have finished, guarded so it only ever runs once. UI.md section 2 is
 * explicit that these are shared machines - a window can end up minimised
 * or backgrounded mid-animation, and a browser is free to delay or drop an
 * animation's completion signal for as long as it stays that way. Rather
 * than leave a colour or a level stuck mid-transition until focus returns,
 * this settles it anyway.
 */
function whenDone(animation, callback) {
  if (!animation) {
    callback();
    return;
  }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    callback();
  };

  animation.finished.then(finish).catch(finish);

  const timing = animation.effect && animation.effect.getTiming ? animation.effect.getTiming() : {};
  const totalMs = (Number(timing.delay) || 0) + (Number(timing.duration) || 0);
  setTimeout(finish, totalMs + 150);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

/* ------------------------------------------------------------------ *
 * Colour change — UI.md section 6: "500-800ms ease-out. Interpolate;
 * never snap." A CSS transition on background-color repaints every frame,
 * which the performance rule rules out. Instead, an "incoming" layer sits
 * on top of the settled "base" layer, already the new colour, and only its
 * opacity is animated in. When it finishes, the colour is baked into the
 * base layer and the incoming layer resets invisible, ready to fade in the
 * next colour on top of that - a crossfade using opacity alone.
 * ------------------------------------------------------------------ */

export function crossfadeColor(baseEl, incomingEl, colorHex, { duration = 700 } = {}) {
  if (!baseEl || !incomingEl || !colorHex) return;
  if (baseEl.style.background === colorHex && incomingEl.style.opacity === '0') return; // already there

  incomingEl.style.background = colorHex;
  incomingEl.style.opacity = '0';

  const animation = animate(incomingEl, [{ opacity: 0 }, { opacity: 1 }], { duration });

  const settle = () => {
    baseEl.style.background = colorHex;
    incomingEl.style.opacity = '0';
  };

  whenDone(animation, settle);
}

/* ------------------------------------------------------------------ *
 * Liquid level — UI.md section 6's pour row: "receiving level rises".
 * The element's real height is set to the true final fraction (so layout
 * is always correct), then a transform: scaleY overlay - origin pinned to
 * the bottom - grows from the old fraction up to that height. No CSS
 * `height` transition is used, since animating height forces a layout
 * reflow every frame; scaleY from a fixed height does not.
 * ------------------------------------------------------------------ */

export function riseLiquidLevel(liquidEl, fromFraction, toFraction, { duration = 850 } = {}) {
  if (!liquidEl) return;

  const to = clamp01(toFraction);
  liquidEl.style.height = `${to * 100}%`;

  if (to <= 0) {
    // Nothing to grow into - the vessel emptied. Fade out rather than
    // scale toward a zero-height target, which scaleY cannot express.
    animate(liquidEl, [{ opacity: 1 }, { opacity: 0 }], { duration: Math.min(duration, 400) });
    return;
  }

  const from = clamp01(fromFraction);
  const startScale = to > 0 ? from / to : 0;

  liquidEl.style.opacity = '1';
  animate(
    liquidEl,
    [{ transform: `scaleY(${startScale})` }, { transform: 'scaleY(1)' }],
    { duration }
  );
}

/* ------------------------------------------------------------------ *
 * Bubbling — UI.md section 6: "looping. Sprite/CSS particles, capped
 * count." A burst of a few small circles rising and fading, not an
 * unbounded particle system.
 * ------------------------------------------------------------------ */

export function playBubbles(layerEl, { count = 6, burstMs = 2200 } = {}) {
  if (!layerEl) return;

  for (let i = 0; i < count; i += 1) {
    const bubble = document.createElement('span');
    bubble.className = 'fx-bubble';
    bubble.style.left = `${10 + Math.random() * 80}%`;
    const size = 3 + Math.random() * 4;
    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    layerEl.appendChild(bubble);

    const delay = Math.random() * burstMs * 0.6;
    const rise = 700 + Math.random() * 500;

    const animation = animate(
      bubble,
      [
        { transform: 'translateY(0) scale(0.6)', opacity: 0 },
        { transform: 'translateY(-8px) scale(1)', opacity: 0.9, offset: 0.2 },
        { transform: `translateY(-${36 + Math.random() * 18}px) scale(0.7)`, opacity: 0 },
      ],
      { duration: rise, delay }
    );

    whenDone(animation, () => bubble.remove());
  }
}

/* ------------------------------------------------------------------ *
 * Gas evolution — UI.md section 6: "1500ms. Rises, fades at container
 * mouth." One-shot, unlike bubbling's loop: a real reaction happens once,
 * so the gas it releases is a single burst, not an ongoing loop.
 * ------------------------------------------------------------------ */

export function playGasEvolution(layerEl, { count = 4, duration = 1500 } = {}) {
  if (!layerEl) return;

  for (let i = 0; i < count; i += 1) {
    const wisp = document.createElement('span');
    wisp.className = 'fx-gas';
    wisp.style.left = `${20 + Math.random() * 60}%`;
    layerEl.appendChild(wisp);

    const delay = Math.random() * duration * 0.3;
    const animation = animate(
      wisp,
      [
        { transform: 'translateY(0) scale(0.7)', opacity: 0 },
        { transform: 'translateY(-40%) scale(1)', opacity: 0.8, offset: 0.3 },
        // "fades at container mouth": most of the rise happens before the
        // fade, so it visibly reaches the top of the vessel before it goes.
        { transform: 'translateY(-100%) scale(1.1)', opacity: 0 },
      ],
      { duration, delay }
    );

    whenDone(animation, () => wisp.remove());
  }
}

/* ------------------------------------------------------------------ *
 * Precipitate forming and settling — UI.md section 6: "1200ms. Particles
 * appear, settle, accumulate." Unlike bubbles and gas, these particles are
 * NOT removed when the animation ends: they stay in place (courtesy of
 * fill: 'forwards') as the solid that has now settled at the bottom,
 * genuinely accumulating if the vessel reacts again later.
 * ------------------------------------------------------------------ */

export function playPrecipitate(layerEl, colorHex, { count = 10, duration = 1200 } = {}) {
  if (!layerEl || !colorHex) return;

  const layerHeight = layerEl.getBoundingClientRect().height || 120;

  for (let i = 0; i < count; i += 1) {
    const grain = document.createElement('span');
    grain.className = 'fx-precipitate';
    grain.style.left = `${10 + Math.random() * 80}%`;
    grain.style.top = `${5 + Math.random() * 15}%`;
    grain.style.background = colorHex;
    layerEl.appendChild(grain);

    const fallPx = layerHeight * (0.65 + Math.random() * 0.25);
    const delay = Math.random() * duration * 0.25;

    animate(
      grain,
      [
        { transform: 'translateY(0) scale(0.4)', opacity: 0 },
        { transform: 'translateY(0) scale(1)', opacity: 1, offset: 0.15 },
        { transform: `translateY(${fallPx}px) scale(1)`, opacity: 1, offset: 0.85 },
        // A tiny overshoot-and-settle on landing, transform only.
        { transform: `translateY(${fallPx * 0.96}px) scale(1)`, opacity: 1 },
      ],
      { duration: duration - delay, delay }
    );
    // Particles are deliberately left in the DOM (fill: forwards keeps them
    // visible at their settled position) - see bench.js for when a vessel
    // being emptied clears this layer back out.
  }
}

/* ------------------------------------------------------------------ *
 * Temperature readout — UI.md section 6: "tied to readout. Digits tick,
 * don't jump." Not a composited animation (see the file header): this
 * updates the element's text on a timer so the number visibly counts
 * rather than snapping to its new value.
 * ------------------------------------------------------------------ */

export function tickNumber(el, fromValue, toValue, { duration = 650, decimals = 0, suffix = '' } = {}) {
  if (!el) return;

  const from = typeof fromValue === 'number' ? fromValue : toValue;
  if (from === toValue || reducedMotionPreferred()) {
    el.textContent = toValue.toFixed(decimals) + suffix;
    return;
  }

  const start = performance.now();
  function frame(now) {
    const t = clamp01((now - start) / duration);
    // ease-out, matching the rest of this file's animations
    const eased = 1 - (1 - t) * (1 - t);
    const current = from + (toValue - from) * eased;
    el.textContent = current.toFixed(decimals) + suffix;
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ *
 * Burner flame — an ambient indicator for setHeat's level 0-3, not in
 * UI.md section 6's table by name but required by "heat control" in
 * section 7's component inventory. A continuous flicker while the burner
 * is on, so a CSS animation (still transform/opacity only) rather than a
 * one-shot WAAPI call, toggled by class so it can be governed by the same
 * prefers-reduced-motion media query directly in CSS.
 * ------------------------------------------------------------------ */

export function setFlameLevel(flameEl, level) {
  if (!flameEl) return;
  flameEl.classList.remove('fx-flame--1', 'fx-flame--2', 'fx-flame--3');
  if (level > 0) flameEl.classList.add(`fx-flame--${Math.min(level, 3)}`);
}

/* ------------------------------------------------------------------ *
 * Hazard alert — UI.md section 6: "200ms in. Screen edge flash + shake,
 * then hold the written warning."
 *
 * The two functions below are only the "200ms in" half: the flash and the
 * shake that get a student's eyes onto the screen. The warning itself is
 * held by the alert panel in panels.js and is never on a timer - it stays
 * until it is acknowledged.
 *
 * DELIBERATELY RESTRAINED. UI.md section 6 closes with: "Hazard visuals
 * stop at conveying danger and consequence. They do not glorify the
 * disaster or turn it into a reward for misbehaving." So there is no
 * explosion, no fire, no particle spectacle, and no sound here - a brief
 * flash, a small shake, and then the screen goes still so the writing can
 * be read. Anything more would make triggering a hazard feel like winning
 * something.
 *
 * Both go through animate(), so prefers-reduced-motion turns the flash and
 * the shake off entirely. The written warning is never motion-gated: it
 * appears either way, because safety information is not decoration.
 * ------------------------------------------------------------------ */

export function flashHazardEdge(edgeEl, { inMs = 200, holdMs = 500, outMs = 700 } = {}) {
  if (!edgeEl) return;

  // Clear any previous flash still attached. Every animation here uses
  // fill: 'forwards' so that it holds its final frame, which also means a
  // finished one keeps overriding the element's own style until it is
  // cancelled. Without this, triggering hazard after hazard in one session
  // would pile up dead animations on this element. Nothing else ever
  // animates the edge, so cancelling everything on it is safe.
  for (const previous of edgeEl.getAnimations()) previous.cancel();

  const total = inMs + holdMs + outMs;
  const animation = animate(
    edgeEl,
    [
      { opacity: 0 },
      { opacity: 1, offset: inMs / total },
      { opacity: 1, offset: (inMs + holdMs) / total },
      { opacity: 0 },
    ],
    { duration: total, easing: 'ease-in-out' }
  );

  whenDone(animation, () => {
    edgeEl.style.opacity = '0';
  });
}

/**
 * A short, small-amplitude shake. Applied to the bench rather than the
 * whole window on purpose: it localises the alarm to where the reaction
 * actually happened, and it leaves the warning panel perfectly still and
 * readable rather than shaking the text a student is meant to read.
 */
export function shakeElement(el, { duration = 200, amplitude = 6 } = {}) {
  if (!el) return;

  // Same reason as flashHazardEdge: drop any previous shake rather than
  // stacking held final frames. The bench zone itself is never animated by
  // anything else - the vessel effects all animate elements inside it.
  for (const previous of el.getAnimations()) previous.cancel();

  const animation = animate(
    el,
    [
      { transform: 'translateX(0)' },
      { transform: `translateX(-${amplitude}px)` },
      { transform: `translateX(${amplitude}px)` },
      { transform: `translateX(-${amplitude * 0.5}px)` },
      { transform: 'translateX(0)' },
    ],
    { duration, easing: 'ease-in-out' }
  );

  whenDone(animation, () => {
    el.style.transform = '';
  });
}

/* ------------------------------------------------------------------ *
 * Pour — UI.md section 6: "700-1000ms. Stream from lip; receiving level
 * rises." The level rise is riseLiquidLevel above, called on the
 * receiving vessel. This is the stream itself: a brief droplet appearing
 * at the receiving vessel's mouth and falling in, timed to land as the
 * level starts to rise.
 *
 * This does not draw a line connecting the two actual container elements
 * on screen - doing that precisely (and keeping it correct across scroll
 * and resize) is real geometry work that a placeholder bench does not need
 * yet. The visual cue that liquid arrived from somewhere above is enough
 * for now.
 * ------------------------------------------------------------------ */

export function playPourStream(mouthLayerEl, { duration = 850 } = {}) {
  if (!mouthLayerEl) return;

  const stream = document.createElement('span');
  stream.className = 'fx-pour-stream';
  mouthLayerEl.appendChild(stream);

  const animation = animate(
    stream,
    [
      { transform: 'scaleY(0.2)', opacity: 0 },
      { transform: 'scaleY(1)', opacity: 0.85, offset: 0.6 },
      { transform: 'scaleY(1)', opacity: 0 },
    ],
    { duration }
  );

  whenDone(animation, () => stream.remove());
}

export const __internal = { reducedMotionPreferred, animate, whenDone };


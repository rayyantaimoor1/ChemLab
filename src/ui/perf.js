/**
 * perf.js — measuring frame rate, and when to drop to the low effects tier
 * (BUILD_UI.md stage UI.10.1).
 *
 * The app must hold 30 fps on a 5th-generation i5 with integrated graphics
 * (CLAUDE.md §2). When a busy bench cannot, the effects step down to a
 * "low" tier: fewer particles, no convection shimmer, no slosh when a
 * flask is swirled. What the chemistry SHOWS is identical in every tier -
 * the same colours, the same precipitates, bubbles at the same relative
 * rates, the same words - there is only less decoration in motion.
 *
 *   auto  measure, and drop to low after two seconds below 30 fps. Once
 *         low it stays low until the setting is changed, so the bench does
 *         not flicker between tiers.
 *   full  always full, whatever the frame rate (a teacher's choice)
 *   low   always low (a teacher's choice, for a slow machine)
 *
 * Only frames while the window is visible count: a hidden window is slowed
 * on purpose by the system, and that is not the machine being slow.
 *
 * No DOM here, so tests/perf.test.js can check it.
 */

/** Below this many frames a second, for HOLD_MS, auto drops to low. */
export const LOW_FPS = 30;
export const HOLD_MS = 2000;

/** How much of each particle effect each tier draws. */
export function effectsScale(tier) {
  return tier === 'low' ? 0.5 : 1;
}

/**
 * Frames over the last `windowMs`, for an fps and an average frame time.
 */
export function createFrameMeter(windowMs = 1000) {
  const times = [];
  return {
    tick(now) {
      times.push(now);
      while (times.length > 1 && now - times[0] > windowMs) times.shift();
    },
    reset() {
      times.length = 0;
    },
    /** Frames a second over the window, or null until there are two frames. */
    fps() {
      if (times.length < 2) return null;
      const span = times[times.length - 1] - times[0];
      return span > 0 ? ((times.length - 1) * 1000) / span : null;
    },
    /** The average time between frames, in ms. */
    frameMs() {
      if (times.length < 2) return null;
      return (times[times.length - 1] - times[0]) / (times.length - 1);
    },
  };
}

/**
 * Decides the effects tier. In 'auto' it watches the frame rate and steps
 * down after HOLD_MS below LOW_FPS; 'full' and 'low' are forced.
 */
export function createTierGovernor({ lowFps = LOW_FPS, holdMs = HOLD_MS } = {}) {
  let mode = 'auto';
  let droppedToLow = false;
  let slowSince = null;
  return {
    setMode(next) {
      mode = next === 'full' || next === 'low' ? next : 'auto';
      droppedToLow = false;
      slowSince = null;
    },
    mode() {
      return mode;
    },
    /** Feed it the time and the current fps; it returns the tier to use. */
    update(now, fps) {
      if (mode !== 'auto') return mode;
      if (droppedToLow) return 'low';
      if (fps !== null && fps < lowFps) {
        if (slowSince === null) slowSince = now;
        if (now - slowSince >= holdMs) droppedToLow = true;
      } else {
        slowSince = null;
      }
      return droppedToLow ? 'low' : 'full';
    },
    /** A pause (the window hidden) does not count as being slow. */
    pause() {
      slowSince = null;
    },
  };
}

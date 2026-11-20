/**
 * stand.js — the retort stand: where a clamped vessel and the vessel on its
 * base go (BUILD_UI.md stage UI.6.1).
 *
 * A retort stand is a heavy base plate with an upright rod. A boss slides
 * up and down the rod and carries a clamp, whose jaws grip a burette or a
 * tube. Under the clamp, on the base - on a white tile if there is one, so
 * that a colour change shows against white - stands the flask the burette
 * delivers into. That is the textbook titration set-up, and it is all
 * geometry: this file says where each part goes; app.js keeps who is where.
 *
 * Positions are in px from the stand's own top-left corner.
 *
 * No DOM here, so tests/stand.test.js can check it.
 */

/** The stand's own size and the reach of its clamp. */
export const STAND = {
  w: 120,
  // Short enough to stand on the bench at 1366×768 with its foot in view.
  // A burette over a big flask may reach above the top of the rod, as a
  // real one often does.
  h: 340,
  rodX: 14, // centre of the rod
  baseH: 10, // the base plate
  clampX: 72, // centre of the clamp's jaws, and of whatever stands under it
  tileH: 6, // a white tile lying on the base
};

/** Vessels the clamp grips; everything else stands on the base. */
export const CLAMPED_TYPES = new Set(['burette', 'test_tube', 'boiling_tube']);

/** Where a vessel standing on the base sits: on the tile when there is one. */
export function baseTopY(hasTile) {
  return STAND.h - STAND.baseH - (hasTile ? STAND.tileH : 0);
}

/** Top-left of a vessel standing on the base, centred under the clamp. */
export function basePosition(vessel, hasTile) {
  return { x: Math.round(STAND.clampX - vessel.w / 2), y: Math.round(baseTopY(hasTile) - vessel.h) };
}

/**
 * Top-left of a vessel held in the clamp, and the height the clamp grips at.
 *
 * A burette over a flask goes down until its tip is just inside the flask's
 * mouth, as in a real titration, so no drop can miss. With nothing under
 * it, a burette or a tube is held well clear of the base.
 *
 * @param {{w:number,h:number,type:string}} vessel  what is clamped
 * @param {{w:number,h:number}|null} below          what stands on the base
 */
export function clampPosition(vessel, below, hasTile) {
  const floor = baseTopY(hasTile);
  const bottomY = vessel.type === 'burette' && below
    ? floor - below.h + 8
    : floor - (vessel.type === 'burette' ? 150 : 90);
  // May be above the stand's own top (negative) - see STAND.h.
  const y = Math.round(bottomY - vessel.h);
  // The jaws grip a burette a third of the way down, a tube near its top.
  const gripY = Math.round(y + (vessel.type === 'burette' ? vessel.h * 0.32 : 22));
  return { x: Math.round(STAND.clampX - vessel.w / 2), y, gripY };
}

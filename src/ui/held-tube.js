/**
 * held-tube.js — a test tube heated in the flame, held at an angle
 * (BUILD_UI.md UI.6.1's deferred item, raised again by the UI.10.4 realism
 * review).
 *
 * WHY THIS EXISTS
 * A test tube or boiling tube is never heated standing on a tripod and
 * gauze. It is held in a wooden test-tube holder at about 45°, its bottom
 * in the flame just above the bright inner cone, its mouth pointing away
 * from the person holding it and from everyone else. Until now the bench
 * stood the tube upright on the gauze, which teaches the wrong technique.
 *
 * Tilting the tube must not tilt the liquid in it: a liquid's surface stays
 * level whatever the glass does. The liquid layer is turned back by the same
 * angle about the point where its surface meets the tube's axis, and the
 * glass's own outline still clips it to the inside - the same method the
 * pour uses (pour-path.js, UI.6.2). For straight-sided glass that keeps the
 * volume right: the level line pivots about the axis, so what it gains on
 * one side it gives up on the other.
 *
 * No DOM here, so tests/held-tube.test.js can check it.
 */

/** The tubes that are held in a flame rather than stood over it. */
export const HELD_TYPES = new Set(['test_tube', 'boiling_tube']);

export const HELD_TUBE = {
  /** Leaning left, mouth up and away; the holder's handle is to the right. */
  angleDeg: -45,
  /** How far below the tripod's top the tube's bottom sits: in the flame,
   *  just above the inner cone, where it is hottest. */
  dropPx: 18,
};

/**
 * Which way the tube leans: to the left (mouth up and left, the holder's
 * handle to the right) when that side is clear, else to the right,
 * mirrored; when neither is, the side with more room. Clear means the
 * tube's mouth stays short of the nearest thing on that side - the bench's
 * edge or another object - so two tubes on neighbouring burners lean the
 * same way instead of crossing. Either way the mouth points away from the
 * hand holding it.
 *
 * @param {number} leftPx      the tube's left edge on the bench, upright
 * @param {number} widthPx     the tube's drawn width
 * @param {number} heightPx    the tube's drawn height
 * @param {number} leftLimit   the nearest edge to the left: 0, or another object's right side
 * @param {number} rightLimit  the nearest edge to the right: the bench's width, or another object's left side
 * @returns {number} the tilt in degrees: -45 (left) or +45 (right)
 */
export function leanFor(leftPx, widthPx, heightPx, leftLimit, rightLimit) {
  const angle = Math.abs(HELD_TUBE.angleDeg);
  const reach = heightPx * Math.sin((angle * Math.PI) / 180);
  const centre = leftPx + widthPx / 2;
  const roomLeft = centre - reach - leftLimit;
  const roomRight = rightLimit - (centre + reach);
  if (roomLeft >= 4) return -angle;
  if (roomRight >= 4) return angle;
  return roomRight > roomLeft ? angle : -angle;
}

/** Whether a vessel of this type, on this furniture, is held in the flame. */
export function heldInFlame(vesselType, furnitureKind) {
  return HELD_TYPES.has(vesselType) && furnitureKind === 'burner';
}

/**
 * How the liquid layer is placed so its surface stays level in a tube
 * tilted by angleDeg.
 *
 * @param {object} geometry  glassGeometry(type, capacityMl) from glassware.js
 * @param {number} volumeMl
 * @param {number} [angleDeg] the tube's tilt (HELD_TUBE.angleDeg)
 * @returns {null | {
 *   top: number, bottom: number, left: number, right: number,
 *   rotateDeg: number, surfaceWidth: number }}
 *   in px against the glass: the layer starts at the upright surface and
 *   reaches well past the glass on every other side, so turned it still
 *   fills the tube below the level line. null when the tube is empty.
 */
export function levelLiquid(geometry, volumeMl, angleDeg = HELD_TUBE.angleDeg) {
  if (!geometry || !(volumeMl > 0)) return null;
  const surface = geometry.surfaceY(volumeMl);
  if (surface === null || surface === undefined) return null;
  const tilt = (Math.abs(angleDeg) * Math.PI) / 180;
  return {
    top: surface,
    bottom: -geometry.h,
    left: -geometry.w,
    right: -geometry.w,
    // Turned back against the glass, so it is level on the bench.
    rotateDeg: -angleDeg,
    // A level line across a tilted tube is longer than the tube is wide.
    surfaceWidth: (2 * geometry.innerHalfAt(surface)) / Math.cos(tilt),
  };
}

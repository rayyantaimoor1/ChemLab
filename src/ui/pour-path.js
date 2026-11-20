/**
 * pour-path.js — how a pour looks: where the source goes, how far it tips,
 * where the stream lands, and whether it splashes (BUILD_UI.md UI.6.2).
 *
 * A real pour: you bring the glass over to the other vessel, hold its lip
 * just over the far vessel's mouth and tip it. The fuller it is, the less
 * you need to tip before liquid reaches the lip. The stream leaves the lip,
 * curves out and falls onto the liquid below (or the floor of an empty
 * vessel), the level drops in one and rises in the other, and a last drip
 * follows when you tip it back. Pour from too high and it splashes - shown,
 * never rewarded: the amount poured is exactly what the engine poured.
 *
 * Everything is in bench px, from the bench canvas's top-left corner.
 * No DOM here, so tests/pour-path.test.js can check it.
 */

/** Timings in ms, and the gap above a mouth beyond which a stream splashes. */
export const POUR = {
  tiltMs: 300,
  pourMs: 950,
  dripMs: 420,
  returnMs: 280,
  splashGapPx: 70,
};

/**
 * How far to tip a vessel this full (0..1) before it pours: about 30° when
 * brimming, nearly on its side when almost empty.
 */
export function tiltAngleFor(fraction) {
  const f = Math.max(0, Math.min(1, fraction || 0));
  return Math.round(30 + (1 - f) * 55);
}

/**
 * @param {object} p
 * @param {{x,y,w,h}} p.source     the source glass's drawing, where it is now
 * @param {{x,y,w,h}} p.target     the target glass's drawing
 * @param {number} p.targetSurfaceY y of the target's liquid surface, or its floor if empty
 * @param {number} p.mouthHalfW    half the width of the target's mouth
 * @param {number|null} p.releaseLipY where the student let go, as the height
 *                                  of the source's lip; null for just above
 * @param {number} p.fraction      how full the source is, 0..1
 */
export function pourPath({ source, target, targetSurfaceY, mouthHalfW, releaseLipY = null, fraction }) {
  const targetCx = target.x + target.w / 2;
  // Pour from the side the source came from.
  const fromLeft = source.x + source.w / 2 <= targetCx;
  const sign = fromLeft ? 1 : -1;

  // The lip, just inside the near edge of the target's mouth; never lower
  // than a few px above its rim.
  const lipX = Math.round(targetCx - sign * Math.max(2, mouthHalfW * 0.45));
  const highest = 4;
  const lowest = target.y - 6;
  const lipY = Math.round(Math.max(highest, Math.min(lowest, releaseLipY ?? target.y - 14)));

  // The source's drawing goes where its pouring corner is at the lip: its
  // top-right corner when coming from the left, top-left from the right.
  const sourceAt = { x: Math.round(fromLeft ? lipX - source.w : lipX), y: lipY };
  const origin = fromLeft ? '100% 0%' : '0% 0%';
  const angle = sign * tiltAngleFor(fraction);

  const landing = { x: Math.round(lipX + sign * 3), y: Math.round(targetSurfaceY) };
  const fall = landing.y - lipY;
  // The stream leaves the lip moving outward, then falls.
  const control = { x: Math.round(lipX + sign * 12), y: Math.round(lipY + Math.min(10, fall * 0.12)) };
  const gap = target.y - lipY;

  return {
    side: fromLeft ? 'left' : 'right',
    lip: { x: lipX, y: lipY },
    sourceAt,
    origin,
    angle,
    landing,
    control,
    gap,
    splash: gap > POUR.splashGapPx,
    path: `M ${lipX} ${lipY} Q ${control.x} ${control.y} ${landing.x} ${landing.y}`,
  };
}

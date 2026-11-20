/**
 * dropwise.js — how much one drop is, and which vessels are swirled rather
 * than stirred (BUILD_UI.md stage UI.6.3).
 *
 * One drop from a dropping pipette or a burette's tip is about 0.05 mL -
 * twenty drops to the millilitre, the figure every school titration uses.
 * The dropper and the burette share it, so a drop is the same drop
 * whichever way it falls.
 *
 * A conical flask is swirled, not stirred with a rod: its sloping sides
 * keep the liquid in as it goes round, which is why it is the titration
 * flask. Beakers and tubes are stirred with a glass rod. Either way the
 * engine does the same thing - it mixes - so this only decides how it looks.
 *
 * No DOM here, so tests/dropwise.test.js can check it.
 */

/** One drop, in mL. */
export const DROP_ML = 0.05;

/** Vessels the student swirls instead of stirring with a rod. */
export const SWIRLED_TYPES = new Set(['flask', 'flask_small']);

/** "Swirl" for a conical flask, "Stir" for anything else. */
export function mixVerbFor(type) {
  return SWIRLED_TYPES.has(type) ? 'Swirl' : 'Stir';
}

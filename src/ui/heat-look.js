/**
 * heat-look.js — what heat does to a vessel that you can SEE
 * (BUILD_UI.md stage UI.4.2).
 *
 * A liquid on a flame goes through stages a student learns to read long
 * before the thermometer says anything:
 *
 *   warming     faint shimmering convection currents in the liquid
 *   nucleating  small bubbles forming on the glass and collapsing, in the
 *               last fifteen degrees or so before the boil
 *   boiling     a rolling boil, with steam at the mouth, at the liquid's
 *               own curated boiling point (chemicals.json boilingPointC)
 *   evaporating a hot or very volatile liquid with no flame under it:
 *               vapour drifting from the mouth, no bubbles. This is how
 *               ethanal looks on a bench at 25 °C, five degrees above its
 *               boiling point - a liquid never boils without heat going in.
 *
 * And above the liquid, CONDENSATION: vapour of anything at or above its
 * boiling point settling as droplets on the cooler glass higher up - the
 * water driven off blue copper sulfate, the silvery mercury from heating
 * mercury(II) oxide.
 *
 * Which liquid boils when comes only from the curated boiling points. The
 * liquid body of a mixture starts to boil at its lowest boiling point. A
 * liquid whose boiling point is "none on record" (null) never boils here.
 * Nothing in this file decides chemistry; it only reads temperature, heat
 * and those curated numbers.
 *
 * No DOM here, so tests/heat-look.test.js can check every stage.
 */

/** Degrees below the boiling point at which bubbles start forming on the glass. */
export const NUCLEATION_BAND_C = 15;
/** Below this, a liquid on a flame shows nothing yet. */
export const CONVECTION_FROM_C = 35;
/** A hot liquid with no flame under it still steams within this many degrees of boiling. */
export const STEAMING_BAND_C = 25;

const isLiquid = (c) => c && (c.state === 'aqueous' || c.state === 'liquid');

/**
 * @param {object} snapshot  container.snapshot(): speciesIds, contents
 *                           ({ id, amount, unit }), temperatureC, heatLevel
 * @param {object} engine
 * @returns {{ stage: string, boilingPointC: number|null, steam: boolean,
 *             condensation: { id, name, colorHex, colorName } | null }}
 */
export function heatLookFor(snapshot, engine) {
  const T = snapshot.temperatureC ?? 25;
  const heating = (snapshot.heatLevel ?? 0) > 0;
  const contents = snapshot.contents || [];

  // The liquid body: liquids present by volume (mL), as the vessel's own
  // volume counts them. A liquid made by weight - water driven off a
  // crystal, mercury from an oxide - is vapour and droplets, not a body.
  const body = contents
    .filter((item) => item.unit === 'mL' && item.amount > 0)
    .map((item) => engine.getChemical(item.id))
    .filter((c) => isLiquid(c) && typeof c.boilingPointC === 'number');
  const boilingPointC = body.length ? Math.min(...body.map((c) => c.boilingPointC)) : null;

  let stage = 'still';
  if (boilingPointC !== null) {
    if (heating) {
      if (T >= boilingPointC - 0.5) stage = 'boiling';
      else if (T >= boilingPointC - NUCLEATION_BAND_C) stage = 'nucleating';
      else if (T >= CONVECTION_FROM_C) stage = 'warming';
    } else if (T >= boilingPointC - 0.5) {
      // At or above its boiling point with no flame: a volatile liquid
      // like ethanal on a warm bench. It evaporates fast; it does not boil.
      stage = 'evaporating';
    } else if (T >= 80 && T >= boilingPointC - STEAMING_BAND_C) {
      // Just off the flame and still hot: it steams as it cools.
      stage = 'evaporating';
    }
  }

  // Condensation: any liquid in the vessel at or above its own boiling
  // point, with heat going in or the vessel hot, gives vapour that settles
  // on the cool glass above. The liquid that condenses is the one with the
  // lowest boiling point among those vaporising - the first to come off.
  const vapourising = (snapshot.speciesIds || [])
    .map((id) => engine.getChemical(id))
    .filter((c) => isLiquid(c) && typeof c.boilingPointC === 'number' && T >= c.boilingPointC - 0.5)
    .sort((a, b) => a.boilingPointC - b.boilingPointC);
  const condenses = vapourising.length && (heating || stage === 'evaporating') ? vapourising[0] : null;

  return {
    stage,
    boilingPointC,
    steam: stage === 'boiling' || stage === 'evaporating',
    condensation: condenses
      ? { id: condenses.id, name: condenses.name, colorHex: condenses.colorHex, colorName: condenses.colorName }
      : null,
  };
}

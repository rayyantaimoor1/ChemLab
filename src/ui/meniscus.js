/**
 * meniscus.js — reading a meniscus at eye level, and what happens when you
 * don't (BUILD_UI.md stage UI.7.2).
 *
 * The scale is printed on the OUTSIDE of the glass; the bottom of the
 * meniscus is in the middle of the liquid, a tube's radius behind it. Look
 * from eye level and the mark in front lines up with the meniscus truly.
 * Look down from above and your line of sight crosses the glass higher than
 * the meniscus really is, so you read a mark that is too high on the glass:
 *   - a measuring cylinder, numbered upwards, reads TOO HIGH;
 *   - a burette, numbered downwards (how much has run out), reads TOO LOW.
 * From below it is the other way round. That is parallax, and it is why
 * every practical book says: eye level with the bottom of the meniscus.
 *
 * The offset is worked out from the drawing's own glass - its radius at the
 * surface and its scale - so what the reading lens shows and the number it
 * gives always agree. The angle is a modest glance above or below.
 *
 * Each instrument is read to half its smallest division: a burette's 0.1 mL
 * marks to 0.05 mL, a 100 mL measuring cylinder's 1 mL marks to 0.5 mL.
 * Beakers and conical flasks carry rough marks only and are not for measuring.
 *
 * No DOM here, so tests/meniscus.test.js can check it.
 */

/** How far above or below eye level "above" and "below" are, in degrees. */
export const EYE_ANGLE_DEG = 6;

/**
 * Each instrument's finest division and what it is read to. runOut: the
 * scale says how much has been run out (a burette), not how much is in.
 */
export const INSTRUMENTS = {
  burette: { division: 0.1, readTo: 0.05, runOut: true, approximate: false },
  cylinder: { division: 1, readTo: 0.5, runOut: false, approximate: false },
  beaker: { division: 10, readTo: 5, runOut: false, approximate: true },
  beaker_small: { division: 5, readTo: 2.5, runOut: false, approximate: true },
  flask: { division: 25, readTo: 12.5, runOut: false, approximate: true },
  flask_small: { division: 10, readTo: 5, runOut: false, approximate: true },
};

/** The volume held when the level is at height y, by bisection on surfaceY. */
export function volumeAtY(geometry, capacityMl, y) {
  let low = 0;
  let high = capacityMl;
  for (let k = 0; k < 40; k += 1) {
    const mid = (low + high) / 2;
    const at = geometry.surfaceY(mid);
    // Higher level = smaller y = more liquid.
    if (at === null || at > y) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** Where the line of sight crosses the scale, relative to the true level, in px (negative is higher). */
export function parallaxShiftPx(geometry, volumeMl, eye) {
  if (eye !== 'above' && eye !== 'below') return 0;
  const surface = geometry.surfaceY(volumeMl);
  if (surface === null) return 0;
  const radius = geometry.innerHalfAt(surface);
  const shift = radius * Math.tan((EYE_ANGLE_DEG * Math.PI) / 180);
  return eye === 'above' ? -shift : shift;
}

const roundTo = (value, step) => Math.round(value / step) * step;
// As many decimal places as the instrument is read to: 0.05 → 2, 0.5 → 1, 5 → 0.
const decimalsFor = (step) => (String(step).split('.')[1] || '').length;

/**
 * The reading a student takes, from where their eye is.
 *
 * @returns {null | { value: number, text: string, trueText: string, readTo: number,
 *                    approximate: boolean, runOut: boolean, error: number }}
 */
export function readingFor(type, geometry, capacityMl, volumeMl, eye = 'level') {
  const instrument = INSTRUMENTS[type];
  if (!instrument || !geometry || !(volumeMl > 0)) return null;
  const surface = geometry.surfaceY(volumeMl);
  if (surface === null) return null;
  const toScale = (v) => (instrument.runOut ? capacityMl - v : v);
  const seenVolume = volumeAtY(geometry, capacityMl, surface + parallaxShiftPx(geometry, volumeMl, eye));
  const value = roundTo(toScale(seenVolume), instrument.readTo);
  const trueValue = roundTo(toScale(volumeMl), instrument.readTo);
  const d = decimalsFor(instrument.readTo);
  return {
    value,
    text: `${value.toFixed(d)} mL`,
    trueText: `${trueValue.toFixed(d)} mL`,
    readTo: instrument.readTo,
    approximate: instrument.approximate,
    runOut: instrument.runOut,
    error: Math.round((value - trueValue) * 1000) / 1000,
  };
}

/** Why the reading is what it is, in a sentence or two. */
export function readingNote(type, eye) {
  const instrument = INSTRUMENTS[type];
  if (!instrument) return 'This vessel has no scale to read.';
  if (eye === 'level') {
    return 'Eye level with the bottom of the meniscus: the mark in front lines up with the liquid truly. Always read like this.';
  }
  const high = eye === 'above';
  const reads = instrument.runOut ? (high ? 'too low' : 'too high') : (high ? 'too high' : 'too low');
  return `${high ? 'Looking down from above' : 'Looking up from below'}, your line of sight crosses the scale ${high ? 'higher' : 'lower'} than the meniscus really is, so this ${instrument.runOut ? 'burette' : 'scale'} reads ${reads}. That is parallax: read with your eye level with the bottom of the meniscus.`;
}

/**
 * The reading lens: a magnified strip of the scale around the meniscus,
 * with the instrument's finest divisions, the liquid under its curved
 * surface, and the scale shifted by parallax when the eye is not level.
 *
 * @returns {string} SVG markup
 */
export function lensSvg({ type, geometry, capacityMl, volumeMl, eye = 'level', colorHex = '#9CC3E6', width = 256, height = 96 }) {
  const instrument = INSTRUMENTS[type];
  const surface = geometry.surfaceY(volumeMl);
  if (!instrument || surface === null) return '';
  const cx = width / 2;
  const cy = height / 2;
  const radius = geometry.innerHalfAt(surface);
  // A division about 22 px apart, the walls kept inside the lens.
  const divisionPx = Math.abs(geometry.surfaceY(Math.min(capacityMl, volumeMl + instrument.division) || 0) - surface)
    || Math.abs(surface - (geometry.surfaceY(Math.max(0.0001, volumeMl - instrument.division)) ?? surface)) || 1;
  const zoom = Math.max(1, Math.min(22 / divisionPx, (width / 2 - 14) / Math.max(1, radius)));
  const yOf = (v) => cy + ((geometry.surfaceY(v) ?? surface) - surface) * zoom;
  const shift = -parallaxShiftPx(geometry, volumeMl, eye) * zoom;
  const toScale = (v) => (instrument.runOut ? capacityMl - v : v);

  // Ticks within reach of the lens.
  const span = (height / 2 / zoom) / Math.max(0.0001, divisionPx) * instrument.division + instrument.division * 2;
  const first = Math.max(instrument.division, Math.ceil((volumeMl - span) / instrument.division) * instrument.division);
  const ticks = [];
  for (let v = first; v <= Math.min(capacityMl, volumeMl + span); v += instrument.division) {
    const vv = Math.round(v * 1000) / 1000;
    const y = yOf(vv);
    if (y < -4 || y > height + 4) continue;
    const scaleValue = Math.round(toScale(vv) * 1000) / 1000;
    const step = instrument.division * 10;
    const major = Math.abs(scaleValue / step - Math.round(scaleValue / step)) < 1e-6
      || (instrument.division >= 5 && Math.abs(scaleValue / (instrument.division * 2) - Math.round(scaleValue / (instrument.division * 2))) < 1e-6);
    const half = !major && Math.abs(scaleValue / (step / 2) - Math.round(scaleValue / (step / 2))) < 1e-6;
    const len = major ? 26 : half ? 17 : 10;
    const x0 = cx - radius * zoom + 2;
    ticks.push(`<line x1="${x0.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x0 + len).toFixed(1)}" y2="${y.toFixed(1)}" />`);
    if (major) {
      const label = Number.isInteger(scaleValue) ? scaleValue : scaleValue.toFixed(1);
      ticks.push(`<text x="${(x0 + len + 3).toFixed(1)}" y="${(y + 4).toFixed(1)}">${label}</text>`);
    }
  }

  const left = cx - radius * zoom;
  const right = cx + radius * zoom;
  const rise = Math.min(8, radius * zoom * 0.12);
  const liquid = `M ${left.toFixed(1)} ${(cy - rise).toFixed(1)} Q ${cx} ${(cy + rise).toFixed(1)} ${right.toFixed(1)} ${(cy - rise).toFixed(1)} L ${right.toFixed(1)} ${height} L ${left.toFixed(1)} ${height} Z`;
  const surfaceLine = `M ${left.toFixed(1)} ${(cy - rise).toFixed(1)} Q ${cx} ${(cy + rise).toFixed(1)} ${right.toFixed(1)} ${(cy - rise).toFixed(1)}`;

  return `<svg class="reading-lens" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">`
    + `<rect width="${width}" height="${height}" fill="#F4F4F0"/>`
    + `<path d="${liquid}" fill="${colorHex}" fill-opacity="0.55"/>`
    + `<path d="${surfaceLine}" fill="none" stroke="rgba(40, 60, 70, 0.7)" stroke-width="1.4"/>`
    + `<line x1="${left.toFixed(1)}" y1="0" x2="${left.toFixed(1)}" y2="${height}" class="reading-lens__wall"/>`
    + `<line x1="${right.toFixed(1)}" y1="0" x2="${right.toFixed(1)}" y2="${height}" class="reading-lens__wall"/>`
    + `<g class="reading-lens__scale" transform="translate(0 ${shift.toFixed(2)})">${ticks.join('')}</g>`
    + `<path d="M ${(right + 3).toFixed(1)} ${cy} l 7 -4 l 0 8 z" class="reading-lens__pointer"/>`
    + '</svg>';
}

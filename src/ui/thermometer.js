/**
 * thermometer.js — a thermometer standing in a vessel, its column read
 * against a printed scale (BUILD_UI.md stage UI.4.3).
 *
 * It is the ordinary school thermometer: a glass stem with a red alcohol
 * column, marked from -10 °C to 110 °C. The number beside the glass is still
 * the exact reading; this is the instrument a student actually reads in a
 * real practical, with the same small error you get reading any scale.
 *
 * Beyond its range it says so rather than pretending. A dry tube over a
 * roaring flame reaches several hundred degrees, which would break a real
 * glass thermometer: the column stops at the top and the vessel's label
 * says the temperature is above what the thermometer can show.
 *
 * Standing a thermometer in a vessel only reads it (CLAUDE.md §7: tools
 * read state, never change it). No DOM here, so tests/thermometer.test.js
 * can check the scale.
 */

export const SCALE_MIN_C = -10;
export const SCALE_MAX_C = 110;

// The drawing, in px: a stem and a bulb, with the scale printed on the stem.
const STEM_W = 7;
const BULB_R = 4.5;
const TOP_PAD = 6;    // glass above the 110 mark
const BULB_PAD = 4;   // between the bulb and the -10 mark

/** Where the column's top sits, as a fraction of the scale: 0 at -10, 1 at 110. */
export function columnFraction(temperatureC) {
  const t = Math.max(SCALE_MIN_C, Math.min(SCALE_MAX_C, temperatureC));
  return (t - SCALE_MIN_C) / (SCALE_MAX_C - SCALE_MIN_C);
}

/** True when the temperature is outside what this thermometer can show. */
export function offScale(temperatureC) {
  return temperatureC > SCALE_MAX_C || temperatureC < SCALE_MIN_C;
}

/**
 * The thermometer's geometry for a given overall height: where the scale
 * runs on the stem, so the column can be sized to it.
 */
export function thermometerGeometry(heightPx) {
  const h = Math.max(60, Math.round(heightPx));
  const w = 26; // stem plus room for the printed figures
  const bulbCy = h - BULB_R - 1;
  const scaleBottom = bulbCy - BULB_R - BULB_PAD; // the -10 mark
  const scaleTop = TOP_PAD;                        // the 110 mark
  return { w, h, stemX: 4, stemW: STEM_W, bulbCy, bulbR: BULB_R, scaleTop, scaleBottom };
}

/** The y of a temperature on the printed scale. */
export function yFor(geometry, temperatureC) {
  return geometry.scaleBottom - columnFraction(temperatureC) * (geometry.scaleBottom - geometry.scaleTop);
}

/**
 * The static glass and printed scale, as SVG. The red column is a separate
 * element (bench.js) so it can rise by transform alone.
 */
export function thermometerSvg(heightPx) {
  const g = thermometerGeometry(heightPx);
  const cx = g.stemX + g.stemW / 2;
  const parts = [];
  // The glass stem, rounded at the top, and the bulb.
  parts.push(`<rect x="${g.stemX}" y="0" width="${g.stemW}" height="${g.bulbCy}" rx="${g.stemW / 2}" fill="rgba(235, 240, 242, 0.55)" stroke="rgba(255, 255, 255, 0.8)" stroke-width="0.7"/>`);
  parts.push(`<circle cx="${cx}" cy="${g.bulbCy}" r="${g.bulbR}" fill="#C8332B" stroke="rgba(255, 255, 255, 0.8)" stroke-width="0.7"/>`);
  // The scale: a line every 10 °C, longer with a figure every 20 °C.
  const lines = [];
  const figures = [];
  for (let t = SCALE_MIN_C; t <= SCALE_MAX_C; t += 10) {
    const y = yFor(g, t).toFixed(1);
    const major = t % 20 === 0;
    lines.push(`M${g.stemX + g.stemW} ${y}h${major ? 4 : 2.5}`);
    if (major) figures.push(`<text x="${g.stemX + g.stemW + 5}" y="${(Number(y) + 3).toFixed(1)}">${t}</text>`);
  }
  parts.push(`<path d="${lines.join('')}" stroke="rgba(246, 246, 240, 0.9)" stroke-width="0.8"/>`);
  parts.push(`<g class="thermometer__figures" fill="rgba(246, 246, 240, 0.92)" font-size="8">${figures.join('')}</g>`);
  return `<svg class="thermometer__glass" width="${g.w}" height="${g.h}" viewBox="0 0 ${g.w} ${g.h}" aria-hidden="true">${parts.join('')}</svg>`;
}

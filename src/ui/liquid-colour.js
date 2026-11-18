/**
 * liquid-colour.js — how a liquid is painted, given its curated colour, how
 * clear it is, and how much of it the light passes through
 * (BUILD_UI.md stage UI.3.2).
 *
 * WHAT IT DOES, AND WHAT IT NEVER DOES
 * It never chooses a colour. The colour, its name and the clarity word all
 * come from curated data (appearance.js). This file only decides how that
 * colour LOOKS in a particular piece of glass, which is optics, not
 * chemistry:
 *
 *   - Clarity. A clear solution lets the bench show through it; a cloudy
 *     one scatters light, so it turns paler and hides what is behind; a
 *     milky one hides it almost completely; an opaque one (starch–iodine,
 *     mercury) is drawn solid.
 *
 *   - Depth. Light crossing a wide beaker passes through far more solution
 *     than light crossing a narrow test tube, so the same copper sulfate
 *     looks deep blue in the beaker and pale blue in the tube. That is the
 *     Beer–Lambert law: each colour of light is absorbed in proportion to
 *     the distance it travels. The curated colour is taken to be what the
 *     solution looks like through REFERENCE_PATH_PX of liquid (about 27 mm,
 *     between a test tube and a beaker); a wider vessel deepens it, a
 *     narrower one pales it, within limits so it never turns to black or
 *     to nothing. The HUE is kept: real absorption can tip a deep yellow
 *     toward amber, but a vessel whose label says "yellow" is never drawn
 *     orange, because the bench must not seem to disagree with its label.
 *
 * The label beside the glass always shows the curated colour and its name,
 * unchanged (UI.md §5). A deeper shade of the same blue is the same "blue".
 *
 * No DOM here, so tests/liquid-colour.test.js can check it.
 */

/** The path length (px of liquid) the curated colours are taken to describe. */
export const REFERENCE_PATH_PX = 30;

// How far depth may change a colour, as a multiple of the reference path.
// The ratio is softened (raised to DEPTH_SOFTEN) because a screen cannot
// show the full range a real beaker does without turning deep colours black.
const MIN_DEPTH = 0.6;
const MAX_DEPTH = 1.8;
const DEPTH_SOFTEN = 0.6;

// How much a scattering liquid is lightened toward white, and how little of
// the bench shows through it.
const SCATTER = {
  clear: { toWhite: 0, minAlpha: 0 },
  cloudy: { toWhite: 0.22, minAlpha: 0.62 },
  milky: { toWhite: 0.5, minAlpha: 0.94 },
};

export function parseHex(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Screen colour <-> light intensity. Absorption works on light, not on
// the numbers a screen uses, so depth is applied in between.
const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toScreen = (v) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, c)) * 255);
};

/** Colourless and very faintly tinted liquids: water, dilute acids, most salts. */
function seeThroughFor(rgb) {
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const lightness = (max + min) / 2 / 255;
  const chroma = (max - min) / 255;
  if (lightness > 0.88 && chroma < 0.09) return { colourless: true, alpha: 0.26 };
  if (lightness > 0.80 && chroma < 0.16) return { colourless: false, alpha: 0.48 };
  return { colourless: false, alpha: null };
}

/* Hue, saturation and lightness, so a deepened colour can keep its hue. */
function toHsl({ r, g, b }) {
  const R = r / 255; const G = g / 255; const B = b / 255;
  const max = Math.max(R, G, B); const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h / 6, s, l };
}

function fromHsl({ h, s, l }) {
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t) => {
    let u = t; if (u < 0) u += 1; if (u > 1) u -= 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return { r: Math.round(ch(h + 1 / 3) * 255), g: Math.round(ch(h) * 255), b: Math.round(ch(h - 1 / 3) * 255) };
}

/** The deepened colour's saturation and lightness, the curated colour's hue. */
function withHueOf(original, deepened) {
  const from = toHsl(original);
  const to = toHsl(deepened);
  return fromHsl({ h: from.h, s: to.s, l: to.l });
}

export const __internal = { toHsl, fromHsl };

/**
 * The paint for a liquid.
 *
 * @param {string} colorHex             the curated colour
 * @param {object} [options]
 * @param {string|null} [options.clarity]  curated clarity word; null = clear
 * @param {number} [options.pathPx]        width of liquid the light crosses
 * @returns {string} a CSS colour
 */
export function liquidFill(colorHex, { clarity = 'clear', pathPx = REFERENCE_PATH_PX } = {}) {
  const rgb = parseHex(colorHex);
  if (!rgb) return colorHex;

  // Opaque: drawn exactly as curated, and nothing shows through it.
  // (Written as rgb(), the form a browser reads it back in, so the bench
  // can tell an unchanged colour from a changed one.)
  if (clarity === 'opaque') return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;

  const base = seeThroughFor(rgb);
  let out = rgb;
  let alpha;

  if (base.colourless) {
    // Water looks like water in any glass; there is nothing to deepen.
    alpha = base.alpha;
  } else {
    // Beer–Lambert: each channel's transmission raised to the relative path.
    const ratio = (pathPx || REFERENCE_PATH_PX) / REFERENCE_PATH_PX;
    const depth = Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, ratio ** DEPTH_SOFTEN));
    const t = { r: toLinear(rgb.r) ** depth, g: toLinear(rgb.g) ** depth, b: toLinear(rgb.b) ** depth };
    out = withHueOf(rgb, { r: toScreen(t.r), g: toScreen(t.g), b: toScreen(t.b) });
    // The more light the liquid absorbs, the less of the bench shows
    // through it - a pale tint is nearly see-through, a deep colour is not.
    const transmitted = (t.r + t.g + t.b) / 3;
    alpha = Math.max(base.alpha ?? 0, Math.min(0.92, 1 - transmitted * 0.75));
  }

  const scatter = SCATTER[clarity] || SCATTER.clear;
  if (scatter.toWhite > 0) {
    const w = scatter.toWhite;
    out = {
      r: Math.round(out.r + (255 - out.r) * w),
      g: Math.round(out.g + (255 - out.g) * w),
      b: Math.round(out.b + (255 - out.b) * w),
    };
    alpha = Math.max(alpha, scatter.minAlpha);
  }

  const a = Math.round(alpha * 100) / 100;
  return a >= 1 ? `rgb(${out.r}, ${out.g}, ${out.b})` : `rgba(${out.r}, ${out.g}, ${out.b}, ${a})`;
}

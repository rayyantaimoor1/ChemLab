/**
 * solid-shapes.js — a solid taken off the shelf, drawn as what it is
 * (BUILD_UI.md stage UI.3.3).
 *
 * Magnesium is a curled ribbon, zinc is a few grey granules, marble is a
 * handful of white chips, copper sulfate is faceted crystals, sulfur is a
 * heap of powder. Which of these a solid is comes from its curated `form`
 * in chemicals.json (batch.md §15) - this file never decides it, only
 * draws it.
 *
 * Every shape is a small static SVG drawn once, in the solid's own curated
 * colour with a darker outline and a single highlight from the upper left,
 * the same light as the glassware (glassware.js). The scatter of granules
 * or chips comes from a seeded random sequence, so the same zinc in the
 * same vessel looks the same on every render instead of jittering.
 *
 * No DOM here, so tests/solid-shapes.test.js can check every form.
 */

import { parseHex } from './liquid-colour.js';

/** The forms this file can draw - the validator's fixed list. */
export const FORMS = [
  'ribbon', 'granules', 'powder', 'chips', 'crystals', 'pellets',
  'lump', 'wire', 'filings', 'turnings', 'foil', 'cloth',
];

const fmt = (n) => (Math.round(n * 10) / 10).toString();

/** A repeatable random sequence from a string (the chemical's id). */
function seeded(seedText) {
  let h = 2166136261;
  for (const ch of String(seedText)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex, amount) {
  const rgb = parseHex(hex) || { r: 150, g: 150, b: 150 };
  const f = (c) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  return `rgb(${f(rgb.r)}, ${f(rgb.g)}, ${f(rgb.b)})`;
}

/** An irregular closed polygon around (cx, cy). */
function blob(rand, cx, cy, rx, ry, corners, jag) {
  const pts = [];
  const turn = rand() * Math.PI;
  for (let i = 0; i < corners; i += 1) {
    const a = turn + (i / corners) * Math.PI * 2;
    const k = 1 - jag / 2 + rand() * jag;
    pts.push(`${fmt(cx + Math.cos(a) * rx * k)} ${fmt(cy + Math.sin(a) * ry * k)}`);
  }
  return `M${pts.join('L')}Z`;
}

/* Each drawer gets the box (w, h), its colours and the random sequence, and
   returns SVG elements. The solid rests on the bottom edge of the box. */
const DRAW = {
  granules({ w, h, fill, edge, light, rand }) {
    const out = [];
    const n = Math.max(3, Math.round(w / 7));
    for (let i = 0; i < n; i += 1) {
      const r = 2.6 + rand() * 1.8;
      const x = r + rand() * (w - 2 * r);
      const y = h - r * 0.8 - (i % 3 === 2 ? r * 1.2 : 0);
      out.push(`<path d="${blob(rand, x, y, r, r * 0.8, 7, 0.35)}" fill="${fill}" stroke="${edge}" stroke-width="0.6"/>`);
      out.push(`<circle cx="${fmt(x - r * 0.35)}" cy="${fmt(y - r * 0.3)}" r="${fmt(r * 0.28)}" fill="${light}"/>`);
    }
    return out;
  },
  chips({ w, h, fill, edge, light, rand }) {
    const out = [];
    const n = Math.max(3, Math.round(w / 9));
    for (let i = 0; i < n; i += 1) {
      const r = 3.6 + rand() * 2.4;
      const x = r + rand() * (w - 2 * r);
      const y = h - r * 0.7 - (i % 2 ? r * 0.7 : 0);
      out.push(`<path d="${blob(rand, x, y, r, r * 0.75, 5, 0.6)}" fill="${fill}" stroke="${edge}" stroke-width="0.7" stroke-linejoin="bevel"/>`);
      out.push(`<path d="M${fmt(x - r * 0.6)} ${fmt(y - r * 0.2)}L${fmt(x)} ${fmt(y - r * 0.6)}" stroke="${light}" stroke-width="0.8"/>`);
    }
    return out;
  },
  crystals({ w, h, fill, edge, light, rand }) {
    const out = [];
    const n = Math.max(3, Math.round(w / 8));
    for (let i = 0; i < n; i += 1) {
      const s = 2.8 + rand() * 2.2;
      const x = s + rand() * (w - 2 * s);
      const y = h - s * 1.1 - (i % 3 === 1 ? s : 0);
      // A rhombic prism: a diamond face and one lighter facet.
      out.push(`<path d="M${fmt(x)} ${fmt(y - s)}L${fmt(x + s * 0.8)} ${fmt(y)}L${fmt(x)} ${fmt(y + s)}L${fmt(x - s * 0.8)} ${fmt(y)}Z" fill="${fill}" stroke="${edge}" stroke-width="0.6"/>`);
      out.push(`<path d="M${fmt(x)} ${fmt(y - s)}L${fmt(x - s * 0.8)} ${fmt(y)}L${fmt(x)} ${fmt(y)}Z" fill="${light}" opacity="0.7"/>`);
    }
    return out;
  },
  pellets({ w, h, fill, edge, light, rand }) {
    const out = [];
    const n = Math.max(3, Math.round(w / 6));
    for (let i = 0; i < n; i += 1) {
      const r = 2.4;
      const x = r + rand() * (w - 2 * r);
      const y = h - r - (i % 3 === 2 ? r * 1.6 : 0);
      out.push(`<ellipse cx="${fmt(x)}" cy="${fmt(y)}" rx="${r}" ry="${fmt(r * 0.75)}" fill="${fill}" stroke="${edge}" stroke-width="0.5"/>`);
      out.push(`<ellipse cx="${fmt(x - 0.7)}" cy="${fmt(y - 0.6)}" rx="0.9" ry="0.5" fill="${light}"/>`);
    }
    return out;
  },
  lump({ w, h, fill, edge, light, rand }) {
    const r = Math.min(w * 0.28, h * 0.9);
    const x = w / 2 + (rand() - 0.5) * w * 0.2;
    const y = h - r * 0.75;
    return [
      `<path d="${blob(rand, x, y, r, r * 0.75, 8, 0.4)}" fill="${fill}" stroke="${edge}" stroke-width="0.8" stroke-linejoin="round"/>`,
      `<path d="${blob(rand, x - r * 0.25, y - r * 0.25, r * 0.35, r * 0.2, 6, 0.3)}" fill="${light}" opacity="0.6"/>`,
    ];
  },
  powder({ w, h, fill, edge, rand }) {
    // A low heap, flat at the bottom, with a scatter of darker grains.
    const top = h * 0.3;
    const out = [`<path d="M0 ${fmt(h)}Q${fmt(w * 0.25)} ${fmt(h * 0.55)} ${fmt(w / 2)} ${fmt(top)}Q${fmt(w * 0.75)} ${fmt(h * 0.55)} ${fmt(w)} ${fmt(h)}Z" fill="${fill}" stroke="${edge}" stroke-width="0.5"/>`];
    for (let i = 0; i < Math.round(w / 2.5); i += 1) {
      const x = w * 0.15 + rand() * w * 0.7;
      const y = h - rand() * (h - top) * (1 - Math.abs(x - w / 2) / (w / 2)) * 0.9;
      out.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="0.45" fill="${edge}" opacity="0.7"/>`);
    }
    return out;
  },
  filings({ w, h, edge, fill, rand }) {
    // Many tiny dark slivers in a low heap.
    const out = [`<path d="M${fmt(w * 0.08)} ${fmt(h)}Q${fmt(w / 2)} ${fmt(h * 0.35)} ${fmt(w * 0.92)} ${fmt(h)}Z" fill="${fill}" opacity="0.55"/>`];
    for (let i = 0; i < Math.round(w * 1.2); i += 1) {
      const x = w * 0.1 + rand() * w * 0.8;
      const lift = (1 - Math.abs(x - w / 2) / (w * 0.42)) * h * 0.6;
      const y = h - rand() * Math.max(1, lift);
      const a = rand() * Math.PI;
      const l = 1 + rand() * 1.4;
      out.push(`<path d="M${fmt(x)} ${fmt(y)}l${fmt(Math.cos(a) * l)} ${fmt(Math.sin(a) * l)}" stroke="${edge}" stroke-width="0.7"/>`);
    }
    return out;
  },
  ribbon({ w, h, fill, light, rand }) {
    // A few centimetres of ribbon leaning up the glass, with the twist it
    // keeps from being wound on a reel.
    const x0 = w * (0.2 + rand() * 0.1);
    const x1 = w * (0.75 + rand() * 0.1);
    const d = `M${fmt(x0)} ${fmt(h - 1.5)}`
      + `C${fmt(w * 0.95)} ${fmt(h * 0.75)} ${fmt(w * 0.05)} ${fmt(h * 0.45)} ${fmt((x0 + x1) / 2)} ${fmt(h * 0.3)}`
      + `S${fmt(x1 + w * 0.1)} ${fmt(h * 0.05)} ${fmt(x1)} ${fmt(h * 0.08)}`;
    return [
      `<path d="${d}" fill="none" stroke="${fill}" stroke-width="2.6" stroke-linecap="round"/>`,
      `<path d="${d}" fill="none" stroke="${light}" stroke-width="0.8" stroke-linecap="round" transform="translate(-0.6 -0.4)"/>`,
    ];
  },
  wire({ w, h, fill, light }) {
    // A short coil of wire lying on its side.
    const turns = Math.max(3, Math.round(w / 9));
    const r = Math.min(h * 0.4, 4.5);
    let d = '';
    for (let i = 0; i < turns; i += 1) {
      const x = w * 0.15 + (i / turns) * w * 0.7;
      d += `M${fmt(x)} ${fmt(h - 1)}a${fmt(r * 0.7)} ${fmt(r)} 0 1 1 ${fmt(w * 0.7 / turns)} 0`;
    }
    return [
      `<path d="${d}" fill="none" stroke="${fill}" stroke-width="1.4"/>`,
      `<path d="${d}" fill="none" stroke="${light}" stroke-width="0.5" transform="translate(-0.4 -0.4)"/>`,
    ];
  },
  turnings({ w, h, fill, light, rand }) {
    // Curly shavings off a lathe: a few loose spirals.
    const out = [];
    const n = Math.max(2, Math.round(w / 14));
    for (let i = 0; i < n; i += 1) {
      const cx = w * (0.2 + 0.6 * ((i + 0.5) / n)) + (rand() - 0.5) * 4;
      const cy = h - 4 - rand() * 2;
      let d = `M${fmt(cx)} ${fmt(cy)}`;
      for (let k = 1; k <= 14; k += 1) {
        const a = k * 0.75;
        const r = 0.5 + k * 0.32;
        d += `L${fmt(cx + Math.cos(a) * r * 1.3)} ${fmt(cy + Math.sin(a) * r * 0.7)}`;
      }
      out.push(`<path d="${d}" fill="none" stroke="${fill}" stroke-width="1.3" stroke-linejoin="round"/>`);
      out.push(`<path d="${d}" fill="none" stroke="${light}" stroke-width="0.4" transform="translate(-0.4 -0.4)"/>`);
    }
    return out;
  },
  foil({ w, h, fill, edge, light, rand }) {
    // A crumpled square of foil: a jagged top edge and a few lit facets.
    const pts = [`0 ${fmt(h)}`];
    const steps = 7;
    for (let i = 0; i <= steps; i += 1) {
      pts.push(`${fmt((i / steps) * w * 0.9 + w * 0.05)} ${fmt(h * (0.45 + rand() * 0.4))}`);
    }
    pts.push(`${fmt(w)} ${fmt(h)}`);
    return [
      `<path d="M${pts.join('L')}Z" fill="${fill}" stroke="${edge}" stroke-width="0.6" stroke-linejoin="bevel"/>`,
      `<path d="M${fmt(w * 0.2)} ${fmt(h * 0.7)}L${fmt(w * 0.35)} ${fmt(h * 0.55)}L${fmt(w * 0.45)} ${fmt(h * 0.8)}Z" fill="${light}" opacity="0.7"/>`,
    ];
  },
  cloth({ w, h, fill, edge }) {
    // A folded square of cloth with its weave just showing.
    const top = h * 0.35;
    const out = [`<path d="M${fmt(w * 0.08)} ${fmt(h)}Q${fmt(w * 0.1)} ${fmt(top)} ${fmt(w * 0.5)} ${fmt(top + 1)}T${fmt(w * 0.92)} ${fmt(h)}Z" fill="${fill}" stroke="${edge}" stroke-width="0.6"/>`];
    for (let x = w * 0.15; x < w * 0.88; x += 2.2) {
      out.push(`<path d="M${fmt(x)} ${fmt(top + 3)}V${fmt(h)}" stroke="${edge}" stroke-width="0.25" opacity="0.6"/>`);
    }
    return out;
  },
};

// Long, thin solids - a ribbon, a coil of wire, curly turnings, a sheet of
// foil or cloth - curl up and stand taller than a heap of granules does.
const TALL_FORMS = new Set(['ribbon', 'wire', 'turnings', 'foil', 'cloth']);

/**
 * The box a solid occupies at the bottom of a vessel: as wide as the floor
 * allows, and taller for more of it (by the square root of the amount, so
 * 20 g is a bigger heap than 5 g without overflowing a test tube).
 */
export function solidBox(floorWidthPx, amount = 5, form = null) {
  const grow = Math.max(0.7, Math.min(1.5, Math.sqrt((amount || 5) / 5)));
  const w = Math.max(10, floorWidthPx);
  let base = Math.max(8, Math.min(26, w * 0.32));
  if (TALL_FORMS.has(form)) base = Math.max(14, Math.min(34, w * 0.9));
  // A ribbon is long and thin: in a narrow tube it leans up the side.
  if (form === 'ribbon') base = Math.max(24, Math.min(50, w * 1.8));
  return { w: Math.round(w), h: Math.round(base * grow) };
}

/**
 * SVG markup for a shelf solid.
 *
 * @param {object} solid  { id, form, colorHex }
 * @param {{w: number, h: number}} box
 */
export function solidSvg(solid, box) {
  const draw = DRAW[solid.form] || DRAW.powder;
  const rand = seeded(`${solid.id}:${box.w}`);
  const fill = solid.colorHex || '#9AA0A6';
  const parts = draw({
    w: box.w,
    h: box.h,
    fill,
    edge: shade(fill, -0.45),
    light: shade(fill, 0.55),
    rand,
  });
  return `<svg class="shelf-solid__shape" width="${box.w}" height="${box.h}" viewBox="0 0 ${box.w} ${box.h}" aria-hidden="true">${parts.join('')}</svg>`;
}

/* Shared with precipitate-shapes.js, which draws a reaction's solids. */
export const shapeHelpers = { seeded, shade, blob, fmt };

/** One line for the vessel's label: "bluish-grey granules: Zinc metal". */
export function shelfSolidLabel(solid) {
  const what = solid.colorName ? `${solid.colorName} ${solid.form}` : solid.form;
  return solid.name ? `${what}: ${solid.name}` : what;
}

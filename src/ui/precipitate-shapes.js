/**
 * precipitate-shapes.js — the solid a reaction leaves, drawn by its
 * curated texture and placed by its curated kind (BUILD_UI.md UI.3.4).
 *
 * WHAT DECIDES WHAT
 *   texture (chemicals.json, batch.md §15) decides what the solid looks
 *   like and how it behaves in the liquid:
 *     fine        a smooth settled layer, and a haze still hanging in the
 *                 liquid because fine particles settle slowly (barium
 *                 sulfate, the milkiness of limewater)
 *     crystalline a layer of small glinting crystals that settled fast
 *                 (lead iodide, iodoform)
 *     gelatinous  a loose, see-through floc hanging in the lower liquid
 *                 rather than a layer (aluminium and iron hydroxides)
 *     curdy       clumps on the bottom with a few still suspended (silver
 *                 chloride, soap scum)
 *     metallic, flaky, lumpy, fibrous
 *                 a metal deposit, a flaky crust, a few lumps, tangled
 *                 strands
 *   kind (the reaction's curated solidKind) decides WHERE it goes:
 *     deposit     on the cathode while the current is on, else on the
 *                 floor where the metal it replaced lay
 *     liquid      a shining pool on the floor (molten sodium, mercury)
 *     smoke       hanging in the air above the vessel's mouth
 *     everything else on the floor
 *
 * Nothing here works out chemistry: both words are curated, and a solid
 * the data gives no texture (a reaction's own described solid) is drawn as
 * the plainest one, fine. Static SVG, drawn once per solid; the only motion
 * is the forming animation in effects.js.
 *
 * No DOM here, so tests/precipitate-shapes.test.js can check every texture.
 */

import { shapeHelpers } from './solid-shapes.js';

const { seeded, shade, blob, fmt } = shapeHelpers;

export const TEXTURES = ['fine', 'crystalline', 'gelatinous', 'curdy', 'metallic', 'flaky', 'lumpy', 'fibrous'];

/** The texture a solid is drawn with: its curated one, or the plainest. */
export function textureOf(solid) {
  if (solid?.kind === 'deposit') return 'metallic';
  return TEXTURES.includes(solid?.texture) ? solid.texture : 'fine';
}

/**
 * How much of the liquid a texture leaves hazy, as an opacity of the solid's
 * colour over the whole liquid. Fine particles settle slowly, so a fine
 * precipitate still clouds the liquid it formed in; a few curds stay
 * suspended; crystals and lumps drop straight out.
 */
export function hazeOpacity(solid) {
  if (!solid || solid.kind === 'smoke' || solid.kind === 'liquid' || solid.kind === 'deposit') return 0;
  return { fine: 0.22, curdy: 0.08 }[textureOf(solid)] || 0;
}

/** How long the forming animation takes, and how the grains move. */
export function formingStyle(solid) {
  switch (textureOf(solid)) {
    case 'crystalline': return { duration: 750, count: 12, fall: true };
    case 'gelatinous': return { duration: 1600, count: 9, fall: false };
    case 'curdy': return { duration: 1100, count: 8, fall: true };
    case 'fine': return { duration: 2200, count: 16, fall: true };
    default: return { duration: 1200, count: 10, fall: true };
  }
}

/**
 * The box the settled solid occupies on the floor, in px. A gelatinous floc
 * fills much of the liquid; everything else is a layer whose depth suits it.
 */
export function settledBox(solid, floorWidthPx, liquidHeightPx) {
  const w = Math.max(10, Math.round(floorWidthPx));
  const liquid = Math.max(0, liquidHeightPx || 0);
  const texture = textureOf(solid);
  let h;
  if (solid?.kind === 'liquid') h = 6;
  else if (texture === 'gelatinous') h = Math.max(14, Math.min(60, liquid * 0.6));
  else h = { crystalline: 9, curdy: 13, metallic: 6, flaky: 9, lumpy: 15, fibrous: 18 }[texture] || 7;
  return { w, h: Math.round(h) };
}

/* One drawer per texture. Each gets the box, its colours and a seeded
   random sequence, and returns SVG elements resting on the box's bottom. */
const DRAW = {
  fine({ w, h, fill, edge, rand }) {
    const out = [`<path d="M0 ${fmt(h)}V${fmt(h * 0.35)}Q${fmt(w / 2)} ${fmt(h * 0.15)} ${fmt(w)} ${fmt(h * 0.35)}V${fmt(h)}Z" fill="${fill}"/>`];
    for (let i = 0; i < Math.round(w / 3); i += 1) {
      out.push(`<circle cx="${fmt(rand() * w)}" cy="${fmt(h * 0.3 + rand() * h * 0.65)}" r="0.4" fill="${edge}" opacity="0.5"/>`);
    }
    return out;
  },
  crystalline({ w, h, fill, edge, light, rand }) {
    const out = [`<path d="M0 ${fmt(h)}V${fmt(h * 0.55)}H${fmt(w)}V${fmt(h)}Z" fill="${fill}"/>`];
    for (let i = 0; i < Math.round(w / 4); i += 1) {
      const x = rand() * w;
      const y = h * 0.25 + rand() * h * 0.5;
      const s = 1.4 + rand() * 1.6;
      out.push(`<path d="M${fmt(x)} ${fmt(y - s)}L${fmt(x + s * 0.8)} ${fmt(y)}L${fmt(x)} ${fmt(y + s)}L${fmt(x - s * 0.8)} ${fmt(y)}Z" fill="${fill}" stroke="${edge}" stroke-width="0.4"/>`);
      // The glint: a bright facet catching the light from the upper left.
      if (rand() < 0.45) out.push(`<path d="M${fmt(x)} ${fmt(y - s)}L${fmt(x - s * 0.8)} ${fmt(y)}L${fmt(x)} ${fmt(y)}Z" fill="${light}"/>`);
    }
    return out;
  },
  gelatinous({ w, h, fill, light, rand }) {
    // A loose, watery floc: overlapping translucent masses, densest low down.
    const out = [];
    for (let i = 0; i < Math.round(w / 5) + 4; i += 1) {
      const rx = 4 + rand() * w * 0.18;
      const ry = 3 + rand() * h * 0.18;
      const x = rand() * w;
      const y = h - ry * 0.6 - (rand() ** 1.6) * (h - ry);
      // A faint light edge shows each mass even in a liquid tinted the same
      // colour by the reaction - an iron(III) floc in a brown liquid.
      out.push(`<path d="${blob(rand, x, y, rx, ry, 9, 0.45)}" fill="${fill}" fill-opacity="${fmt(0.22 + rand() * 0.2)}" stroke="${light}" stroke-opacity="0.45" stroke-width="0.7"/>`);
    }
    out.push(`<path d="M0 ${fmt(h)}V${fmt(h * 0.82)}Q${fmt(w / 2)} ${fmt(h * 0.7)} ${fmt(w)} ${fmt(h * 0.82)}V${fmt(h)}Z" fill="${fill}" opacity="0.55"/>`);
    out.push(`<path d="${blob(rand, w * 0.35, h * 0.55, w * 0.12, h * 0.08, 7, 0.3)}" fill="${light}" opacity="0.18"/>`);
    return out;
  },
  curdy({ w, h, fill, light, rand }) {
    const out = [];
    for (let i = 0; i < Math.max(3, Math.round(w / 6)); i += 1) {
      const r = 2 + rand() * 2.8;
      const x = r + rand() * (w - 2 * r);
      const y = h - r * 0.7 - (rand() < 0.3 ? rand() * h * 0.5 : 0);
      out.push(`<path d="${blob(rand, x, y, r * 1.2, r, 8, 0.5)}" fill="${fill}" stroke="${light}" stroke-opacity="0.6" stroke-width="0.5"/>`);
    }
    return out;
  },
  metallic({ w, h, fill, edge, light, rand }) {
    // A thin deposit with a ragged top edge and a bright sheen.
    let top = `M0 ${fmt(h)}V${fmt(h * 0.5)}`;
    for (let x = 0; x <= w; x += 3) top += `L${fmt(x)} ${fmt(h * (0.25 + rand() * 0.4))}`;
    return [
      `<path d="${top}V${fmt(h)}Z" fill="${fill}" stroke="${edge}" stroke-width="0.4"/>`,
      `<path d="M${fmt(w * 0.1)} ${fmt(h * 0.7)}H${fmt(w * 0.55)}" stroke="${light}" stroke-width="0.9" opacity="0.8"/>`,
    ];
  },
  flaky({ w, h, fill, edge, rand }) {
    const out = [];
    for (let i = 0; i < Math.round(w / 4); i += 1) {
      const x = rand() * w;
      const y = h * 0.3 + rand() * h * 0.6;
      const a = (rand() - 0.5) * 50;
      out.push(`<rect x="${fmt(x - 2.5)}" y="${fmt(y - 1)}" width="${fmt(3 + rand() * 3)}" height="1.6" fill="${fill}" stroke="${edge}" stroke-width="0.3" transform="rotate(${fmt(a)} ${fmt(x)} ${fmt(y)})"/>`);
    }
    return out;
  },
  lumpy({ w, h, fill, edge, light, rand }) {
    const out = [];
    for (let i = 0; i < Math.max(2, Math.round(w / 14)); i += 1) {
      const r = 3.5 + rand() * 3;
      const x = r + rand() * (w - 2 * r);
      out.push(`<path d="${blob(rand, x, h - r * 0.8, r, r * 0.8, 8, 0.35)}" fill="${fill}" stroke="${edge}" stroke-width="0.6"/>`);
      out.push(`<circle cx="${fmt(x - r * 0.3)}" cy="${fmt(h - r * 1.05)}" r="${fmt(r * 0.25)}" fill="${light}" opacity="0.6"/>`);
    }
    return out;
  },
  fibrous({ w, h, fill, rand }) {
    // Tangled strands - DNA spooling out, nylon drawn into a rope.
    const out = [];
    for (let i = 0; i < Math.max(3, Math.round(w / 6)); i += 1) {
      const x0 = rand() * w;
      let d = `M${fmt(x0)} ${fmt(h - 1)}`;
      for (let k = 1; k <= 4; k += 1) {
        d += `Q${fmt(rand() * w)} ${fmt(h - k * h * 0.22 + rand() * 4)} ${fmt(rand() * w)} ${fmt(h - k * h * 0.2)}`;
      }
      out.push(`<path d="${d}" fill="none" stroke="${fill}" stroke-width="1.1" opacity="0.85" stroke-linecap="round"/>`);
    }
    return out;
  },
};

/** A molten metal or mercury: a shining pool on the floor. */
function pool({ w, h, fill, light }) {
  return [
    `<ellipse cx="${fmt(w / 2)}" cy="${fmt(h * 0.62)}" rx="${fmt(w * 0.42)}" ry="${fmt(h * 0.38)}" fill="${fill}"/>`,
    `<ellipse cx="${fmt(w * 0.38)}" cy="${fmt(h * 0.45)}" rx="${fmt(w * 0.16)}" ry="${fmt(h * 0.12)}" fill="${light}" opacity="0.85"/>`,
  ];
}

/**
 * SVG for the solid on the vessel floor (or, for a gelatinous floc, hanging
 * in the lower liquid).
 */
export function settledSvg(solid, box) {
  const fill = solid.colorHex || '#C9D6DA';
  const args = {
    w: box.w,
    h: box.h,
    fill,
    edge: shade(fill, -0.4),
    light: shade(fill, 0.6),
    rand: seeded(`${solid.id || solid.description || 'solid'}:${box.w}`),
  };
  const parts = solid.kind === 'liquid' ? pool(args) : DRAW[textureOf(solid)](args);
  return `<svg class="precipitate__shape" width="${box.w}" height="${box.h}" viewBox="0 0 ${box.w} ${box.h}" aria-hidden="true">${parts.join('')}</svg>`;
}

/** Smoke: soft puffs hanging above the mouth of the vessel. */
export function smokeSvg(solid, widthPx) {
  const w = Math.max(20, Math.round(widthPx));
  const h = 30;
  const rand = seeded(`${solid.id || 'smoke'}:${w}`);
  const fill = solid.colorHex || '#E8E8E8';
  const parts = [];
  for (let i = 0; i < 6; i += 1) {
    const r = 5 + rand() * 6;
    parts.push(`<circle cx="${fmt(w * 0.15 + rand() * w * 0.7)}" cy="${fmt(h - r * 0.6 - rand() * 12)}" r="${fmt(r)}" fill="${fill}" opacity="${fmt(0.18 + rand() * 0.14)}"/>`);
  }
  return `<svg class="precipitate__smoke" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${parts.join('')}</svg>`;
}

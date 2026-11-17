/**
 * glassware.js — the shape of every piece of glassware, and where a volume
 * of liquid really comes up to inside it (BUILD_UI.md stage UI.2).
 *
 * WHY THIS FILE EXISTS
 * A conical flask is not a box. 50 mL in the bottom of one is a shallow
 * pool across the wide base, while the last 50 mL climbs a long way up the
 * narrowing cone. If the drawn level were simply "volume ÷ capacity × height"
 * the liquid would sit at a different height from the flask's own printed
 * 50 mL mark, and the bench would be telling a student two different things.
 * So this file describes each vessel's real inside shape and works out the
 * liquid's height from it. The printed graduations are placed with the SAME
 * calculation, so the liquid always reads its true volume against the scale.
 *
 * It contains no chemistry and touches no DOM. It turns a vessel type and a
 * volume into numbers and SVG text; bench.js puts them on the screen.
 *
 * WHERE THE PROPORTIONS COME FROM (opened 2026-11-17)
 *   Beakers, low form, ISO 3819 / DIN 12331 — DURAN 250 mL: 70 mm across,
 *     95 mm tall; 100 mL: 50 × 70 mm. Carl Roth "Beaker, DURAN, low form"
 *     https://www.carlroth.com/com/en/beakers/beaker-duran-low-form/p/c114.1
 *   Conical (Erlenmeyer) flasks, narrow neck, ISO 1773 — 250 mL: base 85 mm,
 *     height 145 mm, neck 34 mm; 100 mL: 64 × 105 mm, neck 22 mm.
 *     https://www.haeberle-lab.de/en/erlenmeyer-flasks-narrow-neck-duran/688
 *   Test tube 16 × 150 mm and boiling tube 25 × 150 mm (outside diameter ×
 *     length), round bottom, the two sizes school suppliers sell.
 *     https://ecatalog.corning.com/life-sciences/b2b/AU/en/Glassware/Tubes%2C-Glass/PYREX%C2%AE-Test-Tube-with-Beaded-Rim/p/9800-16
 *     https://www.rapidonline.com/kimble-chase-test-tube-boiling-tube-no-spot-with-rim-24-x-150mm-pack-of-50-52-1902
 *   Measuring cylinder 100 mL, ISO 4788 tall form, hexagonal foot — body
 *     29 mm across, 256 mm tall, 1 mL divisions.
 *     https://www.dwk.com/duran-measuring-cylinder-with-hexagonal-base-class-a-100-ml-213902402?switch=IN
 *   Burette 50 mL, ISO 385 — 0.1 mL divisions, scale 500–600 mm long,
 *     overall at most 820 mm, tube about 14 mm across.
 *     https://www.dwk.com/pyrex-buretteclass-as-with-ptfe-key-50ml-329516as
 *   Evaporating dish, DIN 12903, with spout — 75 mL: 80 mm across, 34 mm tall.
 *     https://www.bartelt.at/en/produkt/evaporating-basins-porcelain-with-spout-round-bottom-medium-form/
 *
 * THE SCALE, AND WHERE IT IS BROKEN ON PURPOSE
 * Everything is drawn at 1.1 px per mm, so a beaker, a flask and a test tube
 * stand beside each other at their true relative sizes. Two cannot be:
 *   - the burette is 820 mm long — at this scale it would be taller than the
 *     whole bench — so it is drawn about a quarter of its length, and a
 *     little wider than true (22 px, not 15) so its numbers fit on the glass;
 *   - the measuring cylinder is drawn about three-quarters of its length,
 *     and 34 px across instead of 32, for the same reason.
 * Graduations follow the real divisions where they can be told apart at
 * bench size (at least 3 px apart). Where they cannot — 0.1 mL on a burette,
 * 1 mL on a cylinder — the finest legible real division is drawn instead,
 * and the vessel's label still gives the exact volume. The close look in
 * stage UI.7 draws the full scale.
 *
 * WHERE "FULL" IS
 * A vessel's capacity (how much the app lets it hold) is drawn at a real
 * place on the glass: a beaker is full a little below its rim, a conical
 * flask at the foot of its neck, a measuring cylinder at its top mark. It is
 * never drawn at the very brim, because no real vessel is filled to there.
 */

const PX_PER_MM = 1.1;

/* ------------------------------------------------------------------ *
 * Inside and outside of each shape.
 *
 * Every shape is a body of revolution: at each height y (0 at the top of the
 * drawing, growing downwards) it has a half-width. `half(y, d)` gives the
 * outside surface when d is 0 and the inside surface when d is the wall
 * thickness, so the glass wall and the space that holds the liquid always
 * come from the same description.
 * ------------------------------------------------------------------ */

/** A straight-sided vessel with rounded bottom corners (beakers, cylinders). */
function flatBottomed(bodyW, bottomY, cornerR) {
  return (y, d) => {
    const r = Math.max(0.5, cornerR - d);
    const floor = bottomY - d;
    if (y > floor) return null;
    const cornerTop = floor - r;
    if (y <= cornerTop) return bodyW / 2 - d;
    const dy = y - cornerTop;
    return bodyW / 2 - d - r + Math.sqrt(Math.max(0, r * r - dy * dy));
  };
}

/** A tube with a hemispherical bottom. */
function roundBottomed(bodyW, bottomY) {
  return (y, d) => {
    const R = bodyW / 2;
    const r = R - d;
    const centreY = bottomY - R;
    if (y > centreY + r) return null;
    if (y <= centreY) return r;
    const dy = y - centreY;
    return Math.sqrt(Math.max(0, r * r - dy * dy));
  };
}

/** A conical flask: straight neck, cone, rounded foot. */
function conical(baseW, bottomY, neckW, neckH, cornerR) {
  return (y, d) => {
    const floor = bottomY - d;
    if (y > floor) return null;
    const neck = neckW / 2 - d;
    const base = baseW / 2 - d;
    if (y <= neckH) return neck;
    const r = Math.max(0.5, cornerR - d);
    const coneBottom = floor - r;
    if (y <= coneBottom) {
      // Straight sides from the foot of the neck to the base - the cone of
      // a real flask is straight - eased over the first few pixels into a
      // short rounded shoulder rather than a sharp corner.
      const t = (y - neckH) / (coneBottom - neckH);
      const SHOULDER = 0.06;
      const eased = t < SHOULDER ? (t * t) / (2 * SHOULDER) : t - SHOULDER / 2;
      return neck + (base - neck) * (eased / (1 - SHOULDER / 2));
    }
    const dy = y - coneBottom;
    return base - r + Math.sqrt(Math.max(0, r * r - dy * dy));
  };
}

/** A shallow bowl with a flat centre (evaporating dish). */
function bowl(bodyW, bottomY, flatW) {
  return (y, d) => {
    const depth = bottomY - d;
    if (y > depth) return null;
    const flat = flatW / 2 - d;
    const span = bodyW / 2 - flatW / 2;
    const k = Math.max(0, Math.min(1, y / depth));
    return flat + span * Math.sqrt(1 - k * k);
  };
}

/** A round-bottomed flask: neck on a sphere. */
function spherical(bulbW, bottomY, neckW, neckH) {
  return (y, d) => {
    const R = bulbW / 2;
    const centreY = bottomY - R;
    const r = R - d;
    if (y > centreY + r) return null;
    const neck = neckW / 2 - d;
    if (y <= neckH) return neck;
    const dy = y - centreY;
    return Math.max(neck, Math.sqrt(Math.max(0, r * r - dy * dy)));
  };
}

/* ------------------------------------------------------------------ *
 * The vessels. w and h are the drawing's box in px (the body plus any foot
 * or tap); bodyTop/bodyBottom bound the part that holds liquid.
 * ------------------------------------------------------------------ */

const mm = (value) => Math.round(value * PX_PER_MM);

function beakerSpec(widthMm, heightMm, cornerMm) {
  const w = mm(widthMm);
  const h = mm(heightMm);
  return {
    w, h, wall: 2, half: flatBottomed(w, h, mm(cornerMm)), bodyW: w,
    fullY: Math.round(h * 0.13), spout: true, rim: 'flared',
    scale: { ticks: [5, 10, 25], labels: [20, 25, 50, 100], fromFraction: 0.2, toFraction: 0.9 },
  };
}

function flaskSpec(baseMm, heightMm, neckMm, neckHeightMm, cornerMm) {
  const w = mm(baseMm);
  const h = mm(heightMm);
  const neckH = mm(neckHeightMm);
  return {
    w, h, wall: 2, half: conical(w, h, mm(neckMm), neckH, mm(cornerMm)), bodyW: w,
    fullY: neckH + 3, spout: false, rim: 'bead', neckW: mm(neckMm),
    // Conical flask scales are "approximate" in the catalogues - a guide, not
    // a measurement - and are printed at 25 or 50 mL steps.
    scale: { ticks: [25, 50], labels: [50, 100], fromFraction: 0.2, toFraction: 0.8 },
  };
}

function tubeSpec(diameterMm, lengthMm) {
  const w = mm(diameterMm);
  const h = mm(lengthMm);
  return {
    w, h, wall: diameterMm > 20 ? 2 : 1.5, half: roundBottomed(w, h), bodyW: w,
    // Test tubes carry no scale: they are not for measuring.
    fullY: Math.round(h * 0.08), spout: false, rim: 'bead', scale: null,
  };
}

const CYLINDER = (() => {
  const bodyW = 34;
  const footW = 66;
  const h = 200;
  const footH = 9;
  return {
    w: footW, h, wall: 2, half: flatBottomed(bodyW, h - footH, 3), bodyW,
    fullY: 30, spout: true, rim: 'flared', foot: { w: footW, h: footH },
    scale: { ticks: [1, 2, 5], labels: [10, 20, 50], fromFraction: 0.1, toFraction: 1 },
  };
})();

const BURETTE = (() => {
  const bodyW = 22;
  const tubeBottom = 170;
  return {
    w: 34, h: 200, wall: 2, half: flatBottomed(bodyW, tubeBottom, 4), bodyW, tubeBottom,
    // The 0 mark near the top and the 50 mark near the foot of the tube.
    // A burette is read from the top down: the number at the level is how
    // much has been run OUT, so a full burette reads 0.
    zeroY: 9, endY: 161, tap: { y: 180, keyW: 34 }, rim: 'plain', spout: false,
    // Figures every 10 mL with a longer line at each 5: every 5 numbered
    // crowds a tube this narrow.
    scale: { ticks: [0.1, 0.2, 0.5, 1], labels: [10], fromFraction: 0, toFraction: 1, reversed: true },
  };
})();

const DISH = (() => {
  const w = mm(80);
  const h = mm(34);
  return {
    w, h, wall: 2, half: bowl(w, h, Math.round(w * 0.5)), bodyW: w,
    fullY: Math.round(h * 0.18), spout: true, rim: 'flared', scale: null,
  };
})();

export const GLASSWARE = {
  beaker: beakerSpec(70, 95, 6),
  beaker_small: beakerSpec(50, 70, 5),
  flask: flaskSpec(85, 145, 34, 30, 8),
  flask_small: flaskSpec(64, 105, 22, 22, 6),
  test_tube: tubeSpec(16, 150),
  boiling_tube: tubeSpec(25, 150),
  cylinder: CYLINDER,
  burette: BURETTE,
  dish: DISH,
};

/**
 * Shapes the later stages need (BUILD_UI.md UI.2.1). They are drawn here so
 * they share one look with the rest, but none of them is on the apparatus
 * tray yet: each becomes usable in the stage that gives it something to do.
 */
export const LATER_GLASSWARE = {
  // 250 mL round-bottomed flask: bulb about 85 mm, neck 26 mm.
  round_flask: (() => {
    const w = mm(85);
    const h = mm(140);
    const neckH = mm(42);
    return { w, h, wall: 2, half: spherical(w, h, mm(26), neckH), bodyW: w, fullY: neckH + 8, rim: 'bead', scale: null };
  })(),
  // Watch glass, 80 mm: a shallow dish of glass laid over a beaker.
  watch_glass: (() => {
    const w = mm(80);
    const h = mm(10);
    return { w, h, wall: 1.5, half: bowl(w, h, Math.round(w * 0.1)), bodyW: w, fullY: 2, rim: 'plain', scale: null };
  })(),
};

/* ------------------------------------------------------------------ *
 * Geometry: outlines, the inside's clip path, volume -> height.
 * ------------------------------------------------------------------ */

const fmt = (n) => (Math.round(n * 100) / 100).toString();

/** Samples y from top to bottom, finely where the outline curves fastest. */
function sampleYs(top, bottom) {
  const ys = [];
  const curveStart = bottom - 14;
  for (let y = top; y < curveStart; y += 1) ys.push(y);
  for (let y = Math.max(top, curveStart); y < bottom; y += 0.25) ys.push(y);
  ys.push(bottom);
  return ys;
}

/** Closed outline path of the surface d in from the outside. */
function outlinePath(spec, cx, d, top, bottom) {
  const right = [];
  for (const y of sampleYs(top, bottom)) {
    const r = spec.half(y, d);
    if (r === null) break;
    right.push([cx + r, y]);
  }
  if (!right.length) return '';
  const last = right[right.length - 1];
  // Close across the floor, then back up the left side.
  const points = [...right, [cx, last[1]], ...right.slice().reverse().map(([x, y]) => [2 * cx - x, y])];
  return `M${points.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}Z`;
}

/** The lowest y the inside reaches, i.e. the inside floor. */
function insideFloorY(spec, top) {
  let y = top;
  while (y < spec.h && spec.half(y + 0.25, spec.wall) !== null) y += 0.25;
  return y;
}

/**
 * Cumulative volume from the inside floor upwards, in the drawing's own
 * units (px³), one entry every quarter pixel. A body of revolution holds
 * π·r² per unit of height, so a flask's wide base fills slowly and its
 * narrow cone quickly - which is exactly what a student sees.
 */
function volumeTable(spec, floorY, topY) {
  const step = 0.25;
  const table = [{ y: floorY, v: 0 }];
  let v = 0;
  for (let y = floorY; y > topY; y -= step) {
    const r = spec.half(y - step / 2, spec.wall) || 0;
    v += Math.PI * r * r * step;
    table.push({ y: y - step, v });
  }
  return table;
}

const cache = new Map();

/**
 * Everything bench.js needs to draw one kind of vessel holding up to
 * capacityMl. Built once per (type, capacity) and remembered.
 *
 * @returns {null | {
 *   w: number, h: number, cx: number,
 *   outerPath: string, innerPath: string, floorY: number,
 *   surfaceY: (volumeMl: number) => number | null,
 *   graduations: Array<{ volume: number, y: number, kind: string, label: string | null }>,
 *     (volume is what the vessel holds when its level is on that line; label
 *     is the printed figure, which on a burette is the volume run out)
 * }}
 */
export function glassGeometry(type, capacityMl) {
  const spec = GLASSWARE[type] || LATER_GLASSWARE[type];
  if (!spec) return null;
  const key = `${type}:${capacityMl}`;
  if (cache.has(key)) return cache.get(key);

  const cx = spec.w / 2;
  const floorY = insideFloorY(spec, 0);
  const outerPath = outlinePath(spec, cx, 0, 0, spec.h);
  const innerPath = outlinePath(spec, cx, spec.wall, 0, spec.h);

  let levelY;
  if (spec.zeroY !== undefined) {
    // The burette: a straight tube, so its scale is evenly spaced.
    levelY = (volume) => spec.endY - (volume / capacityMl) * (spec.endY - spec.zeroY);
  } else {
    const table = volumeTable(spec, floorY, 0);
    const atFull = table.reduce((best, row) => (Math.abs(row.y - spec.fullY) < Math.abs(best.y - spec.fullY) ? row : best));
    const perMl = atFull.v / capacityMl;
    levelY = (volume) => {
      const target = volume * perMl;
      for (let i = 1; i < table.length; i += 1) {
        if (table[i].v >= target) {
          const a = table[i - 1];
          const b = table[i];
          const k = (target - a.v) / (b.v - a.v || 1);
          return a.y + (b.y - a.y) * k;
        }
      }
      return table[table.length - 1].y;
    };
  }

  // A thin film is still drawn a few pixels deep, so a little liquid in a
  // big vessel never looks like an empty one (UI.1.5). The label gives the
  // real volume.
  const MIN_DEPTH = 4;
  const liquidFloor = spec.zeroY !== undefined ? spec.endY + 8 : floorY;
  const surfaceY = (volumeMl) => {
    if (!(volumeMl > 0)) return null;
    const y = levelY(Math.min(volumeMl, capacityMl));
    return Math.min(y, liquidFloor - MIN_DEPTH);
  };

  const geometry = {
    w: spec.w, h: spec.h, cx, bodyW: spec.bodyW,
    outerPath, innerPath, floorY: liquidFloor, surfaceY,
    /** Half the inside width at height y - how wide the liquid's surface is there. */
    innerHalfAt: (y) => spec.half(y, spec.wall) ?? 0,
    graduations: graduationsFor(spec, capacityMl, levelY),
  };
  cache.set(key, geometry);
  return geometry;
}

/** The fraction of the drawing's height, from its bottom, the liquid fills. */
export function liquidFraction(type, capacityMl, volumeMl) {
  const geometry = glassGeometry(type, capacityMl);
  if (!geometry) return capacityMl > 0 ? Math.max(0, Math.min(1, volumeMl / capacityMl)) : 0;
  const y = geometry.surfaceY(volumeMl);
  return y === null ? 0 : (geometry.h - y) / geometry.h;
}

/* ------------------------------------------------------------------ *
 * Graduations
 * ------------------------------------------------------------------ */

const MIN_TICK_GAP = 3; // px: closer than this, lines merge on a lab monitor
const MIN_LABEL_GAP = 12; // px: room for one line of 10 px figures

function graduationsFor(spec, capacityMl, levelY) {
  const scale = spec.scale;
  if (!scale) return [];
  const from = capacityMl * scale.fromFraction;
  const to = capacityMl * scale.toFraction;
  const reading = (volume) => (scale.reversed ? capacityMl - volume : volume);
  const yOf = (mark) => levelY(scale.reversed ? capacityMl - mark : mark);

  const smallestGap = (step) => {
    let gap = Infinity;
    for (let mark = Math.ceil(from / step) * step; mark + step <= to + 1e-9; mark += step) {
      gap = Math.min(gap, Math.abs(yOf(mark) - yOf(mark + step)));
    }
    return gap;
  };
  const tick = scale.ticks.find((step) => smallestGap(step) >= MIN_TICK_GAP) ?? scale.ticks[scale.ticks.length - 1];
  const label = scale.labels.find((step) => step % tick < 1e-9 && smallestGap(step) >= MIN_LABEL_GAP)
    ?? scale.labels[scale.labels.length - 1];

  const marks = [];
  const count = Math.round((to - Math.ceil(from / tick - 1e-9) * tick) / tick);
  const start = Math.ceil(from / tick - 1e-9) * tick;
  for (let i = 0; i <= count; i += 1) {
    const mark = Math.round((start + i * tick) * 1000) / 1000;
    if (mark > to + 1e-9) break;
    const isLabel = Math.abs(mark / label - Math.round(mark / label)) < 1e-6;
    const isHalf = !isLabel && Math.abs((2 * mark) / label - Math.round((2 * mark) / label)) < 1e-6;
    marks.push({
      volume: reading(mark),
      y: yOf(mark),
      kind: isLabel ? 'major' : isHalf ? 'mid' : 'minor',
      label: isLabel ? String(mark) : null,
    });
  }
  return marks;
}

/* ------------------------------------------------------------------ *
 * The drawing. Two SVGs per vessel: the back of the glass, behind the
 * liquid, and the front - walls, rim, highlight and the printed scale -
 * over it. Both are drawn once and never animated (CLAUDE.md §9).
 * ------------------------------------------------------------------ */

let uid = 0;

const GLASS = 'rgba(201, 214, 218, 0.5)';
const GLASS_EDGE = 'rgba(226, 238, 242, 0.85)';
const PRINT = 'rgba(246, 246, 240, 0.88)';

/** SVG markup for the glass behind the liquid. */
export function backSvg(type, capacityMl) {
  const g = glassGeometry(type, capacityMl);
  if (!g) return '';
  return `<svg class="glassware glassware--back" width="${g.w}" height="${g.h}" viewBox="0 0 ${g.w} ${g.h}" aria-hidden="true">`
    + `<path d="${g.innerPath}" fill="rgba(201, 214, 218, 0.07)"/>`
    + '</svg>';
}

/** SVG markup for the glass in front of the liquid. */
export function frontSvg(type, capacityMl) {
  const spec = GLASSWARE[type] || LATER_GLASSWARE[type];
  const g = glassGeometry(type, capacityMl);
  if (!g) return '';
  uid += 1;
  const clipId = `glass-inside-${uid}`;
  const { cx, w, h } = g;
  const top = spec.half(0, 0);
  const parts = [];

  parts.push(`<defs><clipPath id="${clipId}"><path d="${g.innerPath}"/></clipPath></defs>`);

  // The wall: outside minus inside. Seen edge-on at the sides it is a
  // brighter band - which is how glass is actually told from air.
  parts.push(`<path d="${g.outerPath} ${g.innerPath}" fill="${GLASS}" fill-rule="evenodd"/>`);
  parts.push(`<path d="${g.outerPath}" fill="none" stroke="${GLASS_EDGE}" stroke-width="0.8"/>`);

  // One light, from the upper left: a soft stripe down the left of the
  // body and a fainter one on the right, both inside the glass.
  const bodyHalf = spec.bodyW / 2;
  parts.push(`<g clip-path="url(#${clipId})">`
    + `<rect x="${fmt(cx - bodyHalf * 0.62)}" y="0" width="${fmt(Math.max(2, bodyHalf * 0.16))}" height="${h}" fill="rgba(255, 255, 255, 0.24)"/>`
    + `<rect x="${fmt(cx + bodyHalf * 0.6)}" y="0" width="${fmt(Math.max(1, bodyHalf * 0.07))}" height="${h}" fill="rgba(255, 255, 255, 0.12)"/>`
    + '</g>');

  // The rim: a flared lip on beakers and cylinders, a rolled bead on flasks
  // and tubes - the thickened glass a student's thumb finds.
  const lip = spec.rim === 'flared' ? 1.6 : spec.rim === 'bead' ? 1.2 : 0.4;
  parts.push(`<rect x="${fmt(cx - top - lip)}" y="-1.5" width="${fmt(2 * (top + lip))}" height="3.4" rx="1.7" fill="rgba(232, 242, 245, 0.78)"/>`);

  // The spout, on the left - the side the vessel tips towards to pour.
  if (spec.spout) {
    const x = cx - top;
    parts.push(`<path d="M${fmt(x + 9)} 0 Q${fmt(x + 1)} 0 ${fmt(x - 4)} -3.5" fill="none" stroke="rgba(232, 242, 245, 0.8)" stroke-width="2" stroke-linecap="round"/>`);
  }

  // A measuring cylinder's hexagonal foot, seen side on.
  if (spec.foot) {
    const fy = h - spec.foot.h;
    const fw = spec.foot.w;
    parts.push(`<path d="M${fmt(cx - fw / 2 + 3)} ${fmt(fy)} L${fmt(cx + fw / 2 - 3)} ${fmt(fy)} L${fmt(cx + fw / 2)} ${fmt(h)} L${fmt(cx - fw / 2)} ${fmt(h)} Z" fill="rgba(201, 214, 218, 0.42)" stroke="${GLASS_EDGE}" stroke-width="0.8"/>`);
  }

  // A burette's tap: the tube narrows, a PTFE key crosses it, a fine tip
  // below delivers the drops.
  if (spec.tap) {
    const tubeBottom = spec.tubeBottom;
    const ty = spec.tap.y;
    parts.push(`<path d="M${fmt(cx - bodyHalf)} ${tubeBottom - 4} L${fmt(cx - 3)} ${ty - 3} L${fmt(cx + 3)} ${ty - 3} L${fmt(cx + bodyHalf)} ${tubeBottom - 4} Z" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="0.8"/>`);
    parts.push(`<rect x="${fmt(cx - 4)}" y="${ty - 4}" width="8" height="10" rx="1.5" fill="rgba(201, 214, 218, 0.6)" stroke="${GLASS_EDGE}" stroke-width="0.8"/>`);
    parts.push(`<rect x="${fmt(cx - spec.tap.keyW / 2)}" y="${ty - 1}" width="${spec.tap.keyW}" height="4" rx="2" fill="#E9E5DA" stroke="rgba(0, 0, 0, 0.35)" stroke-width="0.6"/>`);
    parts.push(`<path d="M${fmt(cx - 2)} ${ty + 6} L${fmt(cx - 0.8)} ${h} L${fmt(cx + 0.8)} ${h} L${fmt(cx + 2)} ${ty + 6} Z" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="0.6"/>`);
  }

  // The printed scale: white enamel lines with the figures beside the long
  // ones. Placed by the same volume -> height calculation as the liquid.
  if (g.graduations.length) {
    const inner = spec.bodyW / 2 - spec.wall;
    const x0 = cx - Math.min(12, inner - 2);
    const long = Math.min(12, Math.max(5, inner * 0.6));
    const lengths = { major: long, mid: long * 0.7, minor: long * 0.45 };
    const lines = g.graduations.map((m) => `M${fmt(x0)} ${fmt(m.y)}h${fmt(lengths[m.kind])}`).join('');
    parts.push(`<path d="${lines}" stroke="${PRINT}" stroke-width="0.9" fill="none"/>`);
    const labels = g.graduations.filter((m) => m.label !== null)
      .map((m) => `<text x="${fmt(x0 + long + 1.5)}" y="${fmt(m.y + 3.4)}">${m.label}</text>`)
      .join('');
    parts.push(`<g class="glassware__figures" fill="${PRINT}" font-size="10">${labels}</g>`);
  }

  return `<svg class="glassware glassware--front" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${parts.join('')}</svg>`;
}

export const __internal = { PX_PER_MM, MIN_TICK_GAP, MIN_LABEL_GAP };

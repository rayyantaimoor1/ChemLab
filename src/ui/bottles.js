/**
 * bottles.js — reagents as the bottles they come in, with printed labels
 * (BUILD_UI.md stage UI.8.2).
 *
 * WHICH CONTAINER comes from data already curated, never from a formula:
 *   a gas                      a gas cylinder
 *   a solid                    a wide-mouthed jar with a screw cap
 *   an indicator or test        a dropper bottle - the "reagent" drawer of
 *   reagent (category reagent)  the shelf, added a few drops at a time
 *   any other liquid            a reagent bottle with a glass stopper
 *
 * WHICH GLASS: amber for a reagent that light breaks down, clear otherwise.
 * That is the curated `storage: "amber"` field, sourced like everything
 * else (owner approved 2026-11-21) - never guessed.
 *
 * THE LABEL is printed: the name, the formula, the concentration, and the
 * GHS pictograms for the chemical's hazard words, looked up in
 * ghs-hazards.json. The pictograms are drawn here, simplified, in the GHS
 * form: a black symbol in a white diamond with a red border.
 *
 * No DOM here - it returns SVG markup - so tests/bottles.test.js can check it.
 */

import ghsData from '../data/ghs-hazards.json' with { type: 'json' };

/** The container a reagent comes in. */
export function containerKindFor(chemical) {
  if (!chemical) return 'bottle';
  if (chemical.state === 'gas') return 'cylinder';
  if (chemical.state === 'solid') return 'jar';
  if (chemical.category === 'reagent') return 'dropper';
  return 'bottle';
}

/** Amber glass for what light breaks down; clear for the rest. */
export function glassFor(chemical) {
  return chemical?.storage === 'amber' ? 'amber' : 'clear';
}

/** The GHS pictograms for a chemical's hazard words, each once, in GHS order. */
export function pictogramsFor(chemical) {
  const codes = new Set();
  for (const word of chemical?.hazards || []) {
    for (const code of ghsData.hazards[word]?.ghs || []) codes.add(code);
  }
  return [...codes].sort();
}

/** What each pictogram means, for hover text. */
export function pictogramMeaning(code) {
  return ghsData.pictograms[code] || code;
}

// The symbols, drawn in a 100 × 100 box with the diamond's inside roughly
// 22-78. Simplified, but each keeps the shape a student learns to know.
const SYMBOLS = {
  GHS01: '<circle cx="44" cy="60" r="13"/><path d="M53 49 L60 42" stroke="#000" stroke-width="3"/>'
    + '<path d="M60 30 l2 7 7 -3 -4 6 7 3 -7 2 2 7 -6 -4 -3 7 -2 -7 -7 2 4 -6 -6 -4 7 -1 z"/>',
  GHS02: '<path d="M50 26 C61 37 66 48 60 60 C66 57 68 51 66 45 C74 55 72 69 62 74 L38 74 C28 68 29 55 38 47 C38 55 42 59 46 61 C40 50 44 37 50 26 Z"/><rect x="33" y="76" width="34" height="4"/>',
  GHS03: '<circle cx="50" cy="66" r="11" fill="none" stroke="#000" stroke-width="5"/>'
    + '<path d="M50 28 C58 36 60 44 56 51 C60 49 61 45 60 41 C65 48 63 56 58 58 L42 58 C36 55 37 47 42 43 C42 48 44 51 47 52 C43 45 46 35 50 28 Z"/>',
  GHS04: '<rect x="30" y="44" width="40" height="16" rx="8" transform="rotate(-20 50 52)"/><rect x="66" y="38" width="7" height="6" transform="rotate(-20 50 52)"/>',
  GHS05: '<path d="M30 30 l12 -4 3 9 -12 4 z"/><path d="M57 26 l12 4 -3 9 -12 -4 z"/>'
    + '<path d="M38 42 l0 8 M43 44 l0 6 M62 42 l0 8 M57 44 l0 6" stroke="#000" stroke-width="2.5"/>'
    + '<path d="M26 66 h20 l-3 -6 h6 l2 6 h4 v6 h-29 z"/><path d="M56 62 h20 v8 h-20 l3 -4 z"/>',
  GHS06: '<circle cx="50" cy="42" r="13"/><circle cx="45" cy="41" r="3.5" fill="#fff"/><circle cx="55" cy="41" r="3.5" fill="#fff"/>'
    + '<rect x="44" y="51" width="12" height="7" rx="2"/><path d="M33 60 L67 76 M67 60 L33 76" stroke="#000" stroke-width="5" stroke-linecap="round"/>',
  GHS07: '<rect x="46" y="28" width="8" height="30" rx="3"/><circle cx="50" cy="68" r="5"/>',
  GHS08: '<circle cx="50" cy="32" r="6"/><path d="M36 76 V52 C36 44 42 40 50 40 C58 40 64 44 64 52 V76 Z"/>'
    + '<path d="M50 50 l2.5 5 5.5 .8 -4 3.9 1 5.5 -5 -2.6 -5 2.6 1 -5.5 -4 -3.9 5.5 -.8 z" fill="#fff"/>',
  GHS09: '<path d="M34 76 V44 M34 54 l-7 -7 M34 50 l7 -8 M34 60 l6 -5" stroke="#000" stroke-width="3" fill="none"/>'
    + '<path d="M48 66 C54 58 66 58 72 66 C66 74 54 74 48 66 Z M48 66 l-6 -5 v10 z"/><path d="M26 78 h48" stroke="#000" stroke-width="2.5"/>',
};

/** One GHS pictogram: a black symbol in a white diamond with a red border. */
export function ghsPictogramSvg(code, size = 18, x = 0, y = 0) {
  const symbol = SYMBOLS[code] || '';
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100" class="ghs" data-ghs="${code}">`
    + `<title>${code}: ${pictogramMeaning(code)}</title>`
    + '<rect x="18" y="18" width="64" height="64" transform="rotate(45 50 50)" fill="#fff" stroke="#D8202A" stroke-width="8"/>'
    + `<g fill="#000">${symbol}</g></svg>`;
}

const esc = (text) => String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Breaks a name into lines of about `width` characters, for the label. */
export function wrapLabel(text, width = 16, maxLines = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + word).length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/.{0,2}$/, '')}…`;
  }
  return lines;
}

/** The glass, the stopper or cap, and the contents, for each container. */
function containerParts(kind, glass, chemical, W, H) {
  const fill = chemical.colorHex || '#C9D6DA';
  const amber = glass === 'amber';
  const glassFill = amber ? 'rgba(138, 75, 18, 0.78)' : 'rgba(214, 228, 233, 0.32)';
  const glassEdge = amber ? '#5C300B' : 'rgba(150, 172, 180, 0.95)';
  if (kind === 'cylinder') {
    return `<rect x="${W * 0.22}" y="${H * 0.14}" width="${W * 0.56}" height="${H * 0.84}" rx="${W * 0.22}" fill="#8E9693" stroke="#3E4542" stroke-width="2"/>`
      + `<rect x="${W * 0.4}" y="${H * 0.03}" width="${W * 0.2}" height="${H * 0.12}" fill="#5F6663" stroke="#2E3331"/>`
      + `<rect x="${W * 0.3}" y="${H * 0.0}" width="${W * 0.4}" height="${H * 0.05}" rx="2" fill="#3E4542"/>`;
  }
  if (kind === 'jar') {
    return `<rect x="${W * 0.1}" y="${H * 0.18}" width="${W * 0.8}" height="${H * 0.8}" rx="${W * 0.08}" fill="${glassFill}" stroke="${glassEdge}" stroke-width="2"/>`
      + `<rect x="${W * 0.14}" y="${H * 0.45}" width="${W * 0.72}" height="${H * 0.5}" rx="${W * 0.05}" fill="${fill}" opacity="${amber ? 0.45 : 0.9}"/>`
      + `<rect x="${W * 0.12}" y="${H * 0.04}" width="${W * 0.76}" height="${H * 0.15}" rx="3" fill="#1E2321" stroke="#000"/>`;
  }
  if (kind === 'dropper') {
    return `<path d="M ${W * 0.16} ${H * 0.42} Q ${W * 0.16} ${H * 0.3} ${W * 0.36} ${H * 0.28} V ${H * 0.22} H ${W * 0.64} V ${H * 0.28} Q ${W * 0.84} ${H * 0.3} ${W * 0.84} ${H * 0.42} V ${H * 0.96} H ${W * 0.16} Z" fill="${glassFill}" stroke="${glassEdge}" stroke-width="2"/>`
      + `<rect x="${W * 0.19}" y="${H * 0.5}" width="${W * 0.62}" height="${H * 0.44}" fill="${fill}" opacity="${amber ? 0.45 : 0.85}"/>`
      + `<rect x="${W * 0.34}" y="${H * 0.15}" width="${W * 0.32}" height="${H * 0.08}" fill="#2B2F2D"/>`
      + `<rect x="${W * 0.38}" y="${H * 0.0}" width="${W * 0.24}" height="${H * 0.16}" rx="${W * 0.1}" fill="#B23A2E" stroke="#5E1A13"/>`;
  }
  return `<path d="M ${W * 0.14} ${H * 0.4} Q ${W * 0.14} ${H * 0.28} ${W * 0.36} ${H * 0.25} V ${H * 0.14} H ${W * 0.64} V ${H * 0.25} Q ${W * 0.86} ${H * 0.28} ${W * 0.86} ${H * 0.4} V ${H * 0.97} H ${W * 0.14} Z" fill="${glassFill}" stroke="${glassEdge}" stroke-width="2"/>`
    + `<rect x="${W * 0.17}" y="${H * 0.46}" width="${W * 0.66}" height="${H * 0.49}" fill="${fill}" opacity="${amber ? 0.4 : 0.85}"/>`
    + `<path d="M ${W * 0.32} ${H * 0.14} H ${W * 0.68} L ${W * 0.62} ${H * 0.02} H ${W * 0.38} Z" fill="${amber ? '#7A4210' : 'rgba(214, 228, 233, 0.75)'}" stroke="${glassEdge}"/>`;
}

/**
 * A reagent's bottle with its printed label.
 *
 * @param {object} chemical  a chemicals.json record
 * @param {{width?: number, height?: number, label?: boolean}} [opts]
 *        label: false gives the small shelf drawing, with a plain label band
 */
export function bottleSvg(chemical, { width = 120, height = 170, label = true } = {}) {
  const kind = containerKindFor(chemical);
  const glass = glassFor(chemical);
  const W = width;
  const H = height;
  const parts = containerParts(kind, glass, chemical, W, H);
  const lx = W * 0.2;
  const lw = W * 0.6;
  const ly = H * (kind === 'jar' ? 0.36 : 0.48);
  const lh = H * (kind === 'jar' ? 0.5 : 0.42);
  let text = '';
  if (label) {
    const nameLines = wrapLabel(chemical.name, Math.max(8, Math.round(lw / 5.6)), 3);
    // The formula on one line; a long concentration wraps like the name.
    const sub = [
      ...(chemical.formula ? [chemical.formula] : []),
      ...wrapLabel(chemical.concentration, Math.max(10, Math.round(lw / 4.6)), 2),
    ];
    const lines = [
      ...nameLines.map((t, i) => `<text x="${W / 2}" y="${ly + 11 + i * 10}" class="bottle__name">${esc(t)}</text>`),
      ...sub.map((t, i) => `<text x="${W / 2}" y="${ly + 13 + nameLines.length * 10 + i * 9}" class="bottle__sub">${esc(t)}</text>`),
    ];
    const codes = pictogramsFor(chemical);
    const size = Math.min(18, (lw - 4) / Math.max(1, Math.min(codes.length, 3)));
    const perRow = Math.max(1, Math.floor((lw - 2) / size));
    const rows = Math.ceil(codes.length / perRow);
    const pictos = codes.map((code, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, codes.length - row * perRow);
      const x0 = W / 2 - (inRow * size) / 2;
      return ghsPictogramSvg(code, size, x0 + (i % perRow) * size, ly + lh - 2 - (rows - row) * size);
    }).join('');
    text = lines.join('') + pictos;
  }
  return `<svg class="bottle bottle--${kind} bottle--${glass}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${chemical.name}, in a${glass === 'amber' ? 'n amber' : ''} ${kind === 'jar' ? 'jar' : kind === 'cylinder' ? 'gas cylinder' : kind === 'dropper' ? 'dropper bottle' : 'bottle'}`)}">`
    + parts
    + `<rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="2" fill="#FBFAF4" stroke="#B9B5A6" stroke-width="0.8"/>`
    + text
    + '</svg>';
}

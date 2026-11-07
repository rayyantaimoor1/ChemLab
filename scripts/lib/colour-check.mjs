/**
 * colour-check.mjs — does a colour's hex code look like its name?
 *
 * WHY THIS EXISTS
 * Every colour in the lab is stored twice: a hex code the screen paints
 * with, and a name the notebook writes down ("pale green"). If the two
 * drift apart, the student sees one colour and reads another, and nothing
 * else in the project would notice. This compares them.
 *
 * HOW IT DECIDES
 * The name is split into words. Colour words ("red", "bluish", "amber")
 * say which hues are acceptable; shade words ("pale", "dark") say how
 * light the colour should be; neutral words ("white", "grey", "silvery")
 * say the colour should be close to colourless.
 *
 * - A hue the name does not allow, on a hex that is clearly coloured, is
 *   an ERROR: "blue" painted red is simply wrong.
 * - A lightness that does not fit a shade word is a WARNING: where "pale"
 *   ends is a judgement, so a person decides.
 * - A name with no colour word this file knows is a WARNING too, so a new
 *   word gets added here rather than passing unchecked.
 *
 * The ranges are deliberately generous. They exist to catch contradictions,
 * not to argue about whether a particular green is slightly too blue.
 */

// Hue ranges in degrees around the colour wheel (0 = red, 120 = green,
// 240 = blue). A range may wrap past 360.
const HUES = {
  red: [[340, 360], [0, 22]],
  orange: [[10, 48]],
  yellow: [[35, 72]],
  green: [[60, 178]],
  blue: [[175, 262]],
  violet: [[250, 335]],
  pink: [[295, 360], [0, 25]],
  brown: [[0, 55]],
  cream: [[20, 72]],
  copper: [[8, 40]],
};

// Every word that names a hue, and which hue it means.
const HUE_WORDS = {
  red: 'red', reddish: 'red', crimson: 'red', scarlet: 'red', blood: 'red', rose: 'red', brick: 'red',
  orange: 'orange', amber: 'orange',
  yellow: 'yellow', yellowish: 'yellow', golden: 'yellow', canary: 'yellow', straw: 'yellow', gold: 'yellow',
  green: 'green', greenish: 'green', apple: 'green', olive: 'green',
  blue: 'blue', bluish: 'blue', cyan: 'blue', turquoise: 'blue',
  violet: 'violet', purple: 'violet', purplish: 'violet', lilac: 'violet', mauve: 'violet', indigo: 'violet',
  pink: 'pink', pinkish: 'pink',
  brown: 'brown', brownish: 'brown', rust: 'brown', tan: 'brown',
  cream: 'cream', buff: 'cream', sand: 'cream', beige: 'cream', ivory: 'cream',
  copper: 'copper',
};

// Words meaning "close to colourless". Their lightness rules follow.
const NEUTRAL_WORDS = new Set([
  'white', 'black', 'grey', 'gray', 'greyish', 'silver', 'silvery', 'colourless', 'colorless', 'clear',
  'translucent', 'chrome', 'steel', 'milky', 'opaque', 'chalky', 'pearly',
]);

// Words that describe texture or appearance and say nothing about colour.
const IGNORED_WORDS = new Set([
  'pale', 'very', 'light', 'dark', 'deep', 'bright', 'dull', 'matt', 'faint', 'cast', 'with', 'a', 'and',
  'slightly', 'cloudy', 'dirty', 'damp', 'hard', 'waxy', 'mirror', 'like', 'metallic', 'sheen', 'off',
  'crystalline', 'powder', 'jelly', 'stringy', 'sludge', 'blistered', 'lathering', 'warm', 'intense',
]);

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  let hue = 0;
  if (chroma > 0) {
    if (max === r) hue = 60 * (((g - b) / chroma) % 6);
    else if (max === g) hue = 60 * ((b - r) / chroma + 2);
    else hue = 60 * ((r - g) / chroma + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, chroma, lightness: (max + min) / 2 };
}

function hueName(hue) {
  const names = [[15, 'red'], [45, 'orange'], [70, 'yellow'], [165, 'green'], [255, 'blue'], [320, 'violet'], [360, 'red']];
  return names.find(([limit]) => hue < limit)[1];
}

const inRange = (hue, ranges) => ranges.some(([from, to]) => hue >= from && hue <= to);

// How strongly coloured a hex must be before its hue counts. Below this
// it reads as a tinted grey, and any hue word is fair.
const CHROMATIC = 0.12;

/**
 * Compares a colour name with its hex code.
 * Returns a list of findings: { level: 'error' | 'warning', message }.
 */
export function checkColourName(name, hex) {
  const findings = [];
  if (typeof name !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hex ?? '')) return findings;

  const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const hues = [...new Set(words.filter((w) => HUE_WORDS[w]).map((w) => HUE_WORDS[w]))];
  const neutrals = words.filter((w) => NEUTRAL_WORDS.has(w));
  const unknown = words.filter((w) => !HUE_WORDS[w] && !NEUTRAL_WORDS.has(w) && !IGNORED_WORDS.has(w));
  const { hue, chroma, lightness } = hexToHsl(hex);
  const describe = `${hex} is ${chroma < CHROMATIC ? 'nearly neutral' : hueName(hue)}, ${Math.round(lightness * 100)}% light`;

  if (hues.length === 0 && neutrals.length === 0) {
    findings.push({ level: 'warning', message: `"${name}" has no colour word the checker knows${unknown.length ? ` (${unknown.join(', ')})` : ''}` });
    return findings;
  }
  if (unknown.length) {
    findings.push({ level: 'warning', message: `"${name}": the checker does not know the word(s) ${unknown.join(', ')}` });
  }

  if (hues.length > 0 && chroma >= CHROMATIC) {
    if (!hues.some((h) => inRange(hue, HUES[h]))) {
      findings.push({ level: 'error', message: `named "${name}" but ${describe}` });
    }
  }
  if (hues.length === 0 && chroma > 0.25) {
    findings.push({ level: 'error', message: `named "${name}", a neutral colour, but ${describe}` });
  }

  const has = (w) => words.includes(w);
  if ((has('pale') || has('light')) && lightness < 0.58) {
    findings.push({ level: 'warning', message: `named "${name}" but ${describe} — darker than "pale" suggests` });
  }
  if ((has('dark') || has('deep')) && lightness > 0.5) {
    findings.push({ level: 'warning', message: `named "${name}" but ${describe} — lighter than "${has('dark') ? 'dark' : 'deep'}" suggests` });
  }
  const neutralOnly = hues.length === 0;
  if (neutralOnly && (has('white') || has('colourless') || has('milky')) && !has('grey') && lightness < 0.7) {
    findings.push({ level: 'warning', message: `named "${name}" but ${describe} — too dark for white` });
  }
  if (has('black') && lightness > 0.25) {
    findings.push({ level: 'warning', message: `named "${name}" but ${describe} — too light for black` });
  }
  return findings;
}

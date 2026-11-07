/**
 * equation-balance.mjs — checks that a reaction's equation balances.
 *
 * WHY THIS EXISTS
 * Every reaction shows the student an equation. An equation that does not
 * balance teaches something false just as surely as a wrong colour does,
 * and it is easy to miss by eye: the second-source audit found several.
 * This file counts the atoms and the charge on each side, so the content
 * validator (scripts/validate-content.mjs) can catch the next one before a
 * student sees it.
 *
 * WHAT IT CAN AND CANNOT READ
 * It reads ordinary formula notation as the lab writes it: subscripts and
 * superscript charges (H₂SO₄, Fe³⁺), brackets ([Cu(NH₃)₄]²⁺), hydrates
 * (CuSO₄·5H₂O), state symbols and labels ((aq), (anode), (alcoholic)),
 * conditions written on the arrow (→(heat)), electrons (2e⁻), structural
 * formulas (CH₂=CH₂), polymer repeat units (-(CH₂CH₂)ₙ-) and several steps
 * in one field ("... then ...").
 *
 * It does NOT read words. "starch + I₂ → starch·I₂" has no atoms to count,
 * so it comes back as "unreadable" — never as balanced. The validator
 * lists those for a person to check by hand, rather than skipping them
 * silently and letting an unchecked equation look checked.
 *
 * TWO NOTATIONS THAT GENUINELY DIFFER
 * - A number in front of a hydrate- or oxide-style formula is written two
 *   ways in textbooks: "2Fe₂O₃·xH₂O" means two of the whole thing, while
 *   "3Al₂O₃·2SiO₂" (mullite) is one formula unit written as oxides. Both
 *   readings are tried, and the equation passes if either one balances.
 * - n and x stand for "any number" (polymers, rust's water). The equation
 *   is checked with them as 1 and again as 2; it must balance both times,
 *   which is what "balances for every n" means for a linear equation.
 */

const SUBSCRIPTS = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₙ': 'n', 'ₓ': 'x' };
const SUPERSCRIPTS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
const SUPERSCRIPT_RUN = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g;
const ARROWS = /\s*(?:→|⇌)\s*/;

// Ligand shorthand that appears inside formulas. Expanded before counting.
const ABBREVIATIONS = { en: 'C2H8N2', EDTA: 'C10H12N2O8' };

// Every element symbol, so that a word like "DNA" is never mistaken for
// atoms of D, N and A.
const ELEMENTS = new Set(`H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn
Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb
Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu`.split(/\s+/));

/** Turns the lab's typography into plain characters: H₂O → H2O, Fe³⁺ → Fe^3+. */
function normalise(text) {
  return text
    .replace(/[₀-₉ₙₓ]/g, (c) => SUBSCRIPTS[c])
    .replace(SUPERSCRIPT_RUN, (run) => `^${[...run].map((c) => SUPERSCRIPTS[c]).join('')}`)
    .replace(/½/g, '0.5')
    .replace(/[↓↑]/g, '');
}

/** Removes a bracketed note written straight after an arrow: →(heat), →(Fe²⁺/Fe³⁺). */
function stripArrowNotes(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += text[i];
    if ((text[i] === '→' || text[i] === '⇌') && text[i + 1] === '(') {
      let depth = 0;
      let j = i + 1;
      for (; j < text.length; j++) {
        if (text[j] === '(') depth++;
        else if (text[j] === ')' && --depth === 0) break;
      }
      i = j;
    }
  }
  return out;
}

/**
 * Counts the atoms in one formula with no coefficient and no charge left on
 * it, e.g. "Ca(OH)2", "[Fe(H2O)5(NO)]", "(CH2CH2)n". Returns null if any part
 * of it is not a formula.
 */
function countFormula(formula, vars) {
  const stack = [{}];
  let i = 0;
  const readNumber = () => {
    const m = formula.slice(i).match(/^(\d+|[nx])/);
    if (!m) return 1;
    i += m[0].length;
    return /\d/.test(m[0]) ? Number(m[0]) : vars[m[0]];
  };
  while (i < formula.length) {
    const ch = formula[i];
    if (ch === '(' || ch === '[') {
      stack.push({});
      i++;
    } else if (ch === ')' || ch === ']') {
      if (stack.length < 2) return null;
      i++;
      const times = readNumber();
      const group = stack.pop();
      const into = stack[stack.length - 1];
      for (const [el, n] of Object.entries(group)) into[el] = (into[el] || 0) + n * times;
    } else {
      const m = formula.slice(i).match(/^([A-Z][a-z]?)/);
      if (!m || !ELEMENTS.has(m[1])) return null;
      i += m[1].length;
      const n = formula.slice(i).match(/^\d+/);
      if (n) i += n[0].length;
      const into = stack[stack.length - 1];
      into[m[1]] = (into[m[1]] || 0) + (n ? Number(n[0]) : 1);
    }
  }
  return stack.length === 1 ? stack[0] : null;
}

function addInto(totals, atoms, times) {
  for (const [el, n] of Object.entries(atoms)) totals[el] = (totals[el] || 0) + n * times;
}

/**
 * Reads one term such as "2Fe^3+", "3Al2O3·2SiO2", "n CH2=CH2" or "2e^-".
 * Returns a list of possible readings ({ atoms, charge }) — usually one,
 * two for the ambiguous hydrate notation — or null if it is not a formula.
 */
function readTerm(raw, vars) {
  let term = raw.trim();

  // Labels in brackets that are words, not formulas: (aq), (s), (anode),
  // (alcoholic), (after work-up), (dissolved in the iron). Ligand
  // shorthand such as (en) is expanded first so it is not mistaken for one.
  term = term.replace(/\((en|EDTA)\)/g, (m, abbr) => `(${ABBREVIATIONS[abbr]})`);
  term = term.replace(/\s*\((?:[a-z][a-z\s,.°0-9–-]*|[^()]*\s[^()]*)\)/g, '');

  // Isomer and position prefixes: cis-, trans-, 1,3-
  term = term.replace(/^(\d+(?:\.\d+)?|\d*[nx])?\s*(?:cis-|trans-|\d+(?:,\d+)+-)/, '$1');

  // The coefficient: 2, 0.5, n, 2n, 2x
  const c = term.match(/^(\d+(?:\.\d+)?)?([nx])?\s*/);
  let coefficient = 1;
  if (c && (c[1] || c[2])) {
    coefficient = (c[1] ? Number(c[1]) : 1) * (c[2] ? vars[c[2]] : 1);
    term = term.slice(c[0].length);
  }

  // Charges, wherever they sit: "C6H5N2^+Cl^-" carries one of each.
  let charge = 0;
  term = term.replace(/\^(\d*)([+-])/g, (m, digits, sign) => {
    charge += (sign === '-' ? -1 : 1) * (digits ? Number(digits) : 1);
    return '';
  });

  if (term === 'e') return [{ atoms: {}, charge: charge * coefficient }];
  if (ABBREVIATIONS[term]) term = ABBREVIATIONS[term];
  term = term.replace(/\bEDTA\b/g, `(${ABBREVIATIONS.EDTA})`);

  // Bond and chain marks in structural formulas carry no atoms.
  term = term.replace(/[=≡—–-]/g, '');
  if (term.length === 0) return null;

  const parts = term.split(/[·•]/);
  const counted = [];
  for (const part of parts) {
    // A multiplier inside a hydrate: the 5 in CuSO4·5H2O, the x in ·xH2O.
    const lead = part.match(/^(\d+(?:\.\d+)?)?([nx])?(?=[A-Z([])/);
    let times = 1;
    let body = part;
    if (lead && lead[0]) {
      times = (lead[1] ? Number(lead[1]) : 1) * (lead[2] ? vars[lead[2]] : 1);
      body = part.slice(lead[0].length);
    }
    const atoms = countFormula(body, vars);
    if (!atoms) return null;
    counted.push({ atoms, times });
  }

  const reading = (coefficientCoversAll) => {
    const atoms = {};
    counted.forEach(({ atoms: a, times }, index) => {
      const multiplier = coefficientCoversAll || index === 0 ? coefficient : 1;
      addInto(atoms, a, times * multiplier);
    });
    return { atoms, charge: charge * coefficient };
  };
  const readings = [reading(true)];
  if (counted.length > 1 && coefficient !== 1) readings.push(reading(false));
  return readings;
}

/** Every possible total for one side of the equation, or null if unreadable. */
function readSide(text, vars) {
  let totals = [{ atoms: {}, charge: 0 }];
  for (const raw of text.split(/\s+\+\s+/)) {
    if (!raw.trim()) continue;
    const readings = readTerm(raw, vars);
    if (!readings) return null;
    const next = [];
    for (const total of totals) {
      for (const r of readings) {
        const atoms = { ...total.atoms };
        addInto(atoms, r.atoms, 1);
        next.push({ atoms, charge: total.charge + r.charge });
      }
    }
    totals = next;
  }
  return totals;
}

function difference(left, right) {
  const elements = new Set([...Object.keys(left.atoms), ...Object.keys(right.atoms)]);
  const off = [];
  for (const el of [...elements].sort()) {
    const a = left.atoms[el] || 0;
    const b = right.atoms[el] || 0;
    if (Math.abs(a - b) > 1e-9) off.push(`${el} ${a} → ${b}`);
  }
  if (left.charge !== right.charge) off.push(`charge ${left.charge} → ${right.charge}`);
  return off;
}

/** Checks one step "A + B → C + D" (or a chain "A → B → C") for given n/x. */
function checkStep(step, vars) {
  const sides = step.split(ARROWS);
  if (sides.length < 2) return { status: 'unreadable' };
  for (let k = 0; k + 1 < sides.length; k++) {
    const left = readSide(sides[k], vars);
    const right = readSide(sides[k + 1], vars);
    if (!left || !right) return { status: 'unreadable' };
    let best = null;
    for (const l of left) {
      for (const r of right) {
        const off = difference(l, r);
        if (!best || off.length < best.length) best = off;
      }
    }
    if (best.length) return { status: 'unbalanced', detail: best.join(', ') };
  }
  return { status: 'balanced' };
}

/**
 * Checks an equation as written in reactions.json.
 * Returns { status: 'balanced' | 'unbalanced' | 'unreadable', detail? }.
 */
export function checkEquation(equation) {
  if (typeof equation !== 'string' || !equation.trim()) return { status: 'unreadable' };

  const text = stripArrowNotes(normalise(equation));
  // Several steps in one field, separated by "then" or ";".
  const steps = text
    .split(/,?\s+then\s+|;\s*/)
    // A note after a wide gap is commentary: "→ Cr   at the cathode".
    .map((step) => step.split(/\s{2,}/)[0])
    .filter((step) => /→|⇌/.test(step));
  if (steps.length === 0) return { status: 'unreadable' };

  for (const step of steps) {
    for (const vars of [{ n: 1, x: 1 }, { n: 2, x: 2 }]) {
      const result = checkStep(step, vars);
      if (result.status !== 'balanced') return result;
    }
  }
  return { status: 'balanced' };
}

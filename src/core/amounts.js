/**
 * amounts.js — how much: moles, the limiting reagent, and the pH of a
 * strong excess (BUILD_PHASE_2.md stage 2.2, owner approved 2026-11-22;
 * the schema is docs/STAGE_2_2_SCHEMA.md).
 *
 * WHY THIS FILE EXISTS
 * Before stage 2.2 a reaction used up every reactant completely, however
 * much of each was added: a gram of marble vanished in the first drop of
 * acid. This file is the arithmetic that fixes that, in one place, so
 * engine.js and container.js both use the same sums and can never
 * disagree about how much is left.
 *
 * IT NEVER DECIDES WHAT REACTS (CLAUDE.md section 6.1)
 * Which substances react, and what they make, still comes only from
 * reactions.json. Everything here is arithmetic on curated numbers:
 * concentration × volume, mass ÷ molar mass, and the numbers in front of
 * each formula in the curated equation (a rule's `coefficients`).
 *
 * "NOT KNOWN" MEANS "PLENTY"
 * An amount of null means nobody curated enough to work it out: a
 * "dilute" solution with no concentrationM, starch with no molar mass, a
 * gas bubbled in from a cylinder. Such a substance never limits a
 * reaction and is never used up by one. A rule where every reactant is
 * "not known", or that has no coefficients at all, works exactly as it
 * did before stage 2.2: everything is used up.
 *
 * NO DOM AND NO FILES. This folder is pure logic.
 */

/** Below this many moles (0.001 mmol) a substance counts as gone. */
export const GONE_MOL = 1e-6;

/** Water's ionic product at 25 °C, for the pH of a very small excess. */
const KW = 1e-14;

const round = (value, places) => {
  const f = 10 ** places;
  return Math.round(value * f) / f;
};

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Moles in an amount a student added, worked out from the chemical's own
 * curated fields. Returns null when they are not enough ("plenty").
 *
 * @param {object|null} chemical  a chemicals.json record
 * @param {number} amount         how much was added
 * @param {string} unit           'mL' or 'g'
 */
export function molesFor(chemical, amount, unit) {
  if (!chemical || !isNumber(amount)) return null;
  if (chemical.state === 'aqueous' && unit === 'mL' && isNumber(chemical.concentrationM)) {
    return (amount * chemical.concentrationM) / 1000;
  }
  if (chemical.state === 'solid' && unit === 'g' && isNumber(chemical.molarMass)) {
    return amount / chemical.molarMass;
  }
  if (chemical.state === 'liquid' && unit === 'mL' && isNumber(chemical.density) && isNumber(chemical.molarMass)) {
    return (amount * chemical.density) / chemical.molarMass;
  }
  // A gas from the shelf, or a solution with no curated concentration.
  return null;
}

/**
 * The mass or volume a number of moles takes up, in the unit the vessel
 * keeps that substance in. Null when the chemical cannot say.
 */
export function amountForMoles(chemical, mol, unit) {
  if (!chemical || !isNumber(mol)) return null;
  if (unit === 'g' && isNumber(chemical.molarMass)) return mol * chemical.molarMass;
  if (unit === 'mL' && chemical.state === 'liquid' && isNumber(chemical.density) && isNumber(chemical.molarMass)) {
    return (mol * chemical.molarMass) / chemical.density;
  }
  return null;
}

/**
 * True when a substance's moles follow from its measured amount rather
 * than being kept separately: a pure liquid (mL) or a weighed solid (g).
 * Their amount is the measurement, so the two can never drift apart.
 */
export function molesFollowAmount(chemical) {
  if (!chemical) return false;
  if (chemical.state === 'liquid') return isNumber(chemical.density) && isNumber(chemical.molarMass);
  if (chemical.state === 'solid') return isNumber(chemical.molarMass);
  return false;
}

/**
 * How far a reaction goes with what is in the vessel.
 *
 * Returns null when the rule should work the old way (everything used up):
 * it has no coefficients, one of its reactants has none, or not one of its
 * reactants has a known amount.
 *
 * @param {object} reaction          a reactions.json rule
 * @param {(id: string) => number|null} molesOf  moles present, or null for "plenty"
 * @returns {null | {
 *   extent: number,                  how many times the equation "happens", in mol
 *   limiting: string[],              the reactant(s) that run out
 *   consumed: Record<string, number>, moles used up, for reactants with a known amount
 *   made: Record<string, number|null> moles made; null when a product has no coefficient
 * }}
 */
export function reactionAmounts(reaction, molesOf) {
  const coefficients = reaction?.coefficients;
  if (!coefficients || typeof coefficients !== 'object') return null;
  const reactants = Array.isArray(reaction.reactants) ? reaction.reactants : [];
  if (reactants.length === 0 || !reactants.every((id) => isNumber(coefficients[id]) && coefficients[id] > 0)) {
    return null;
  }

  const known = reactants
    .map((id) => ({ id, mol: molesOf(id), nu: coefficients[id] }))
    .filter(({ mol }) => isNumber(mol));
  if (known.length === 0) return null;

  const extent = Math.max(0, Math.min(...known.map(({ mol, nu }) => mol / nu)));
  // Every reactant that runs out at that point: two can run out together,
  // which is exactly an end point.
  const limiting = known
    .filter(({ mol, nu }) => mol - nu * extent < GONE_MOL)
    .map(({ id }) => id)
    .sort();

  const consumed = {};
  for (const { id, nu } of known) consumed[id] = nu * extent;

  const made = {};
  for (const id of Array.isArray(reaction.products) ? reaction.products : []) {
    made[id] = isNumber(coefficients[id]) && coefficients[id] > 0 ? coefficients[id] * extent : null;
  }

  return { extent, limiting, consumed, made };
}

/**
 * Scales a rule's curated temperature change to how much actually reacted,
 * where the rule's stated basis (CLAUDE.md section 5) can be worked out:
 *
 *   - two solutions: equal volumes of each as labelled;
 *   - a gas into a solution: enough gas to use up the solution's reagent.
 *
 * Any other basis - a solid in water, a solid in a solution, which section 5
 * deliberately leaves open - keeps the curated number exactly as it is.
 *
 * @returns {number} the temperature change to apply, in °C
 */
export function scaledTempDelta(reaction, extent, volumeMl, getChemical) {
  const delta = reaction?.effects?.tempDeltaC;
  if (!isNumber(delta) || delta === 0) return 0;
  const coefficients = reaction.coefficients || {};
  if (!isNumber(extent) || !isNumber(volumeMl) || volumeMl <= 0) return delta;

  const records = (reaction.reactants || []).map((id) => ({ id, chemical: getChemical(id), nu: coefficients[id] }));
  if (records.length !== 2 || records.some(({ chemical, nu }) => !chemical || !isNumber(nu))) return delta;

  const solutions = records.filter(({ chemical }) => chemical.state === 'aqueous' && isNumber(chemical.concentrationM));
  const gases = records.filter(({ chemical }) => chemical.state === 'gas');

  let basisMolPerL = null;
  if (solutions.length === 2) {
    // V mL of each: the reaction goes min(c/ν) × V, in 2V of mixture.
    basisMolPerL = Math.min(...solutions.map(({ chemical, nu }) => chemical.concentrationM / nu)) / 2;
  } else if (solutions.length === 1 && gases.length === 1) {
    basisMolPerL = solutions[0].chemical.concentrationM / solutions[0].nu;
  }
  if (!isNumber(basisMolPerL) || basisMolPerL <= 0) return delta;

  const actualMolPerL = extent / (volumeMl / 1000);
  return round((delta * actualMolPerL) / basisMolPerL, 2);
}

/**
 * The pH of a strong acid or strong base left in excess (decision 2,
 * option b+). Every substance in the vessel that carries `acidBase` must
 * be the same kind - all strong acids (their H⁺ adds up: excess HCl beside
 * the nitric acid a precipitation made) or all strong bases - and every
 * one's amount must be known. Otherwise this returns null and the curated
 * pH stands: a strong acid beside a strong base would already have reacted
 * if a rule said so, and the lab does not guess.
 *
 * Water's own ions are included, [H⁺] = c/2 + √(c²/4 + Kw), so a tiny
 * excess reads close to 7 rather than drifting past it. Activity is
 * ignored: at 1 M that moves pH by about 0.1, below what pH paper shows.
 *
 * @param {Array<{id: string, mol: number|null}>} entries  what is in the vessel
 * @param {number} volumeMl
 * @param {(id: string) => object|null} getChemical
 * @returns {number|null} pH to one decimal place, or null
 */
export function strongExcessPH(entries, volumeMl, getChemical) {
  if (!isNumber(volumeMl) || volumeMl <= 0) return null;
  const strong = entries
    .map(({ id, mol }) => ({ mol, acidBase: getChemical(id)?.acidBase }))
    .filter(({ acidBase }) => acidBase);
  if (strong.length === 0) return null;

  const kinds = new Set(strong.map(({ acidBase }) => acidBase.kind));
  if (kinds.size !== 1) return null;
  const [kind] = kinds;

  let ionMol = 0;
  for (const { mol, acidBase } of strong) {
    if (!isNumber(mol) || !isNumber(acidBase.perFormula) || acidBase.perFormula <= 0) return null;
    ionMol += mol * acidBase.perFormula;
  }
  if (ionMol < GONE_MOL) return null;

  const c = ionMol / (volumeMl / 1000);
  const ions = c / 2 + Math.sqrt((c * c) / 4 + KW);
  if (kind === 'strong_acid') return round(-Math.log10(ions), 1);
  if (kind === 'strong_base') return round(14 + Math.log10(ions), 1);
  return null;
}

/**
 * amounts-notebook.js — the notebook's words for HOW MUCH: which reagent
 * ran out, and what was left over in excess (BUILD_PHASE_2.md stage 2.2.4).
 *
 * WHY THIS FILE EXISTS
 * Since stage 2.2 only the limiting reagent runs out, and the rest stays in
 * the vessel. A student watching marble fizz in acid cannot see that half
 * the marble is still there because the acid ran out - so the notebook
 * says it: "Hydrochloric acid was used up (the limiting reagent); calcium
 * carbonate (marble chips) was in excess, and 0.5 g of it is left."
 *
 * WHAT IT READS
 * Only what the engine already worked out: each reaction step's `amounts`
 * (what it used up, from amounts.js) and the moles left at the end of the
 * cascade. Nothing here decides what reacts or how much.
 *
 * WHEN IT SAYS NOTHING
 * - No step counted amounts: a rule without coefficients, or nothing of
 *   known amount. The lab works the old way and has nothing to report.
 * - Nothing of known amount is left over: everything reacted exactly, or
 *   the only thing left is a reagent counted as "plenty" (water, a gas from
 *   a cylinder), which never runs out and so is never "in excess".
 *
 * NO DOM AND NO FILES. This folder is pure logic.
 */

import { GONE_MOL, amountForMoles } from './amounts.js';

/** At most three significant figures, with no trailing zeros: 8.5, 0.25, 10. */
export function roundForReading(value) {
  if (!Number.isFinite(value)) return String(value);
  return String(Number(value.toPrecision(3)));
}

/**
 * What the cascade used up and left over, for the notebook and the bench.
 *
 * @param {object[]} steps        react()'s steps, in order
 * @param {string[]} species      what is in the vessel at the end
 * @param {object}   moles        moles of each at the end, by id (null = plenty)
 * @returns {{ usedUp: string[], leftOver: {id: string, mol: number}[] } | null}
 *   null when no step counted amounts.
 */
export function amountsSummary(steps, species, moles) {
  const counted = steps.filter((step) => step.amounts);
  if (counted.length === 0) return null;

  const present = new Set(species);
  const usedUp = [];
  const leftOver = [];
  const seen = new Set();
  for (const step of counted) {
    for (const id of step.reaction.reactants || []) {
      if (seen.has(id)) continue;
      // Only reactants of known amount: "plenty" is never used up or in excess.
      if (typeof step.amounts.consumed[id] !== 'number') continue;
      seen.add(id);
      const mol = moles ? moles[id] : undefined;
      if (!present.has(id)) usedUp.push(id);
      else if (typeof mol === 'number' && mol >= GONE_MOL) leftOver.push({ id, mol });
    }
  }
  return { usedUp, leftOver };
}

/** A chemical's name for the middle of a sentence: "hydrochloric acid". */
function midSentence(name) {
  // Keep a capital that belongs to a formula or a proper name ("PCl₅", "Fehling's").
  if (name.length > 1 && name[1] === name[1].toUpperCase() && name[1] !== name[1].toLowerCase()) return name;
  return name[0].toLowerCase() + name.slice(1);
}

function capitalise(text) {
  return text[0].toUpperCase() + text.slice(1);
}

function list(words) {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/** "0.5 g", "8.5 mmol" - grams for a solid, mL for a pure liquid, else mmol. */
export function amountWords(chemical, mol) {
  if (chemical && chemical.state === 'solid') {
    const grams = amountForMoles(chemical, mol, 'g');
    if (typeof grams === 'number') return `${roundForReading(grams)} g`;
  }
  if (chemical && chemical.state === 'liquid') {
    const ml = amountForMoles(chemical, mol, 'mL');
    if (typeof ml === 'number') return `${roundForReading(ml)} mL`;
  }
  return `${roundForReading(mol * 1000)} mmol`;
}

/**
 * The sentence, or '' when there is nothing worth saying.
 *
 * @param {object|null} summary     from amountsSummary
 * @param {Function}    getChemical (id) => curated record or null
 */
export function describeAmounts(summary, getChemical) {
  if (!summary || summary.leftOver.length === 0 || summary.usedUp.length === 0) return '';
  const nameOf = (id) => midSentence(getChemical(id)?.name || id);

  const used = summary.usedUp.map(nameOf);
  const usedPart = used.length === 1
    ? `${used[0]} was used up (the limiting reagent)`
    : `${list(used)} were used up`;

  let leftPart;
  if (summary.leftOver.length === 1) {
    const { id, mol } = summary.leftOver[0];
    leftPart = `${nameOf(id)} was in excess, and ${amountWords(getChemical(id), mol)} of it is left`;
  } else {
    leftPart = `left over in excess: ${list(summary.leftOver.map(({ id, mol }) => `${amountWords(getChemical(id), mol)} of ${nameOf(id)}`))}`;
  }
  return `${capitalise(usedPart)}; ${leftPart}.`;
}

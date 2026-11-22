/**
 * amounts-look.js — what the "Look closely" panel says about HOW MUCH is
 * in a vessel, and which reagent ran out (BUILD_PHASE_2.md stage 2.2.4).
 *
 * WHY THIS FILE EXISTS
 * Since stage 2.2 the engine counts moles: only the limiting reagent runs
 * out, and the excess stays. None of that can be seen in a beaker of
 * colourless liquid, so the close look lists each substance with its
 * measured amount (mL or g) and its millimoles, and says what the last
 * reaction used up and left over.
 *
 * IT ONLY READS (CLAUDE.md section 4)
 * The amounts come straight from the container's snapshot and the engine's
 * own summary of the last reaction. Nothing here works any amount out, so
 * the panel can never disagree with the notebook. The number wording is
 * shared with the notebook (src/core/amounts-notebook.js) for the same
 * reason.
 */

import { roundForReading, amountWords } from '../core/amounts-notebook.js';

/**
 * One row per substance: [name, "8.5 mL · 8.5 mmol"].
 * A substance whose moles are not known (a "dilute" solution, a gas from a
 * cylinder) shows its amount only - the panel never guesses a number.
 *
 * @param {object[]} contents  [{ chemicalId, amount, unit, mol }]
 * @param {Function} getChemical
 */
export function amountRows(contents, getChemical) {
  return contents.map(({ chemicalId, amount, unit, mol }) => {
    const chemical = getChemical(chemicalId);
    const parts = [];
    if (typeof amount === 'number' && amount > 0 && unit) parts.push(`${roundForReading(amount)} ${unit}`);
    if (typeof mol === 'number') parts.push(`${roundForReading(mol * 1000)} mmol`);
    if (parts.length === 0) parts.push('amount not measured');
    return [chemical?.name || chemicalId, parts.join(' · ')];
  });
}

/**
 * "Hydrochloric acid ran out first; lead(II) nitrate solution left over
 * (0.25 mmol)", or null when the last reaction counted nothing.
 *
 * @param {{ usedUp: string[], leftOver: {id, mol}[] } | null} summary
 * @param {Function} getChemical
 */
export function limitingText(summary, getChemical) {
  if (!summary || summary.usedUp.length === 0) return null;
  const nameOf = (id) => getChemical(id)?.name || id;
  const used = summary.usedUp.map(nameOf).join(', ');
  const ranOut = summary.usedUp.length === 1 ? `${used} ran out first (the limiting reagent)` : `${used} were used up`;
  if (summary.leftOver.length === 0) return `${ranOut}.`;
  const left = summary.leftOver
    .map(({ id, mol }) => `${nameOf(id)} (${amountWords(getChemical(id), mol)})`)
    .join(', ');
  return `${ranOut}; left over in excess: ${left}.`;
}

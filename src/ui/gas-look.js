/**
 * gas-look.js — gases and smoke you can see (BUILD_UI.md stage UI.5.3).
 *
 * COLOURED GASES. Most gases are colourless and show only as bubbles. A few
 * are not, and seeing them is the observation: the reddish brown of
 * nitrogen dioxide, the pale yellow-green of chlorine, the violet of iodine
 * vapour. A coloured gas a reaction made stays in the vessel's contents,
 * and it gathers in the space above the liquid - densest just over the
 * surface, since these gases are heavier than air - in its own curated
 * colour, always named on the label. Which gases are coloured, and what
 * colour, comes only from chemicals.json (state "gas", colorName, colorHex).
 *
 * WHERE SMOKE FORMS. A smoke is a solid made in the air. When the things
 * that make it are themselves gases - ammonia meeting hydrogen chloride -
 * it forms where they meet, inside the vessel, as a white cloud filling the
 * space above anything else. Smoke from something burning or reacting in
 * the vessel rises out of the mouth instead.
 *
 * FUMING LIQUIDS. Some liquids and solids fume the moment they meet moist
 * air: concentrated hydrochloric acid, silicon tetrachloride, ethanoyl
 * chloride. Their vapour meets the water in the air and makes a white mist
 * at the mouth, for as long as they are in the vessel. Bromine instead
 * gives off its own red-brown vapour. Which do, and which kind, is the
 * curated `fumes` field ("mist" or "vapour") - never read off a
 * description.
 *
 * No DOM here, so tests/gas-look.test.js can check it.
 */

/** The white of a mist where a vapour meets moist air. */
export const MIST_HEX = '#ECEFF0';

/** How strongly a coloured gas tints the space it fills. */
export const GAS_TINT = 0.55;

/**
 * The coloured gases in a vessel, in the order the vessel holds them.
 *
 * @param {object} snapshot  container.snapshot()
 * @returns {{ id, name, colorHex, colorName }[]}
 */
export function colouredGasesFor(snapshot, engine) {
  return (snapshot.speciesIds || [])
    .map((id) => engine.getChemical(id))
    .filter((c) => c && c.state === 'gas' && c.colorHex && c.colorName && c.colorName !== 'colourless')
    .map((c) => ({ id: c.id, name: c.name, colorHex: c.colorHex, colorName: c.colorName }));
}

/** "reddish brown Nitrogen dioxide above the liquid" - the label's line. */
export function gasNoteText(gases, hasLiquid = true) {
  if (!gases || gases.length === 0) return '';
  const named = gases.map((g) => `${g.colorName} ${g.name.toLowerCase()}`).join(' and ');
  return hasLiquid ? `${named} above the liquid` : `${named} filling the vessel`;
}

/** True when a reaction's smoke forms inside the vessel: every reactant is a gas. */
export function smokeFormsInside(reaction, engine) {
  const reactants = reaction?.reactants || [];
  return reactants.length > 0 && reactants.every((id) => engine.getChemical(id)?.state === 'gas');
}

/**
 * What fumes at the mouth: each fuming substance in the vessel, with the
 * colour its fumes are drawn in.
 *
 * @returns {{ id, name, kind: 'mist'|'vapour', colorHex, colorName }[]}
 */
export function fumesFor(snapshot, engine) {
  return (snapshot.speciesIds || [])
    .map((id) => engine.getChemical(id))
    .filter((c) => c && (c.fumes === 'mist' || c.fumes === 'vapour'))
    .map((c) => (c.fumes === 'vapour'
      ? { id: c.id, name: c.name, kind: 'vapour', colorHex: c.colorHex, colorName: c.colorName }
      : { id: c.id, name: c.name, kind: 'mist', colorHex: MIST_HEX, colorName: 'white' }));
}

/** "white fumes from concentrated hydrochloric acid" - the label's line. */
export function fumesNoteText(fumes) {
  if (!fumes || fumes.length === 0) return '';
  return fumes.map((f) => (f.kind === 'vapour'
    ? `${f.colorName} ${f.name.toLowerCase().replace(/ \(liquid\)$/, '')} vapour at the mouth`
    : `white fumes from ${f.name.toLowerCase()}`)).join('; ');
}

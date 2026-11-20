/**
 * gas-bubbles.js — where a reaction's gas bubbles come from, and how fast
 * (BUILD_UI.md stage UI.5.2).
 *
 * A gas forms somewhere in particular, and a student learns to look there:
 *
 *   on the solid    a metal in acid fizzes from the surface of the metal,
 *                   marble from the chips themselves, peroxide from the
 *                   grains of manganese(IV) oxide that catalyse it
 *   on each rod     in electrolysis, from the electrode where the gas is
 *                   made - and hydrogen's stream is twice oxygen's when
 *                   water is split, because the half-equations say so
 *   in the liquid   two solutions meeting fizz through the whole body
 *
 * HOW FAST comes from the curated effects.gasRate (slow, steady, vigorous),
 * set in UI.5.1 with a source for each. A rule whose rate is null - no rate
 * on record - is drawn at the middle, steady pace.
 *
 * WHICH ELECTRODE comes from each rule's curated electrodes block: a side
 * makes a gas when one of the rule's own gaseous products appears on the
 * right of that side's half-equation. How much gas each side gives per
 * electron is read off the same half-equation - 2H⁺ + 2e⁻ → H₂ is one
 * hydrogen per two electrons, 4OH⁻ → O₂ + 2H₂O + 4e⁻ one oxygen per four -
 * so the two streams are in the ratio the chemistry fixes. Nothing here
 * decides what gas a rule makes; it only reads the data.
 *
 * No DOM here, so tests/gas-bubbles.test.js can check it.
 */

/**
 * How bubbles look at each rate. count is bubbles in one burst (a reaction
 * that happens once); stream is bubbles kept rising from an electrode while
 * the current is on, before the share between the electrodes is applied.
 */
export const BUBBLE_PACE = {
  slow: { count: 4, burstMs: 3200, riseMs: [1500, 2000], sizePx: [2, 4], stream: 2 },
  steady: { count: 9, burstMs: 2600, riseMs: [950, 1350], sizePx: [3, 5], stream: 4 },
  vigorous: { count: 18, burstMs: 2000, riseMs: [600, 900], sizePx: [3, 7], stream: 7 },
};

/** The pace for a curated gasRate; null or missing is the steady middle. */
export function paceFor(gasRate) {
  return BUBBLE_PACE[gasRate] || BUBBLE_PACE.steady;
}

/**
 * Where a one-off reaction's bubbles start: from a solid reactant (or a
 * solid catalyst) that is lying in the vessel, otherwise from the liquid.
 *
 * @param {object} reaction    a reactions.json rule
 * @param {string[]} solidIds  the shelf solids in the vessel before it reacted
 * @returns {{ at: 'solid', solidId: string } | { at: 'liquid' }}
 */
export function bubbleSourceFor(reaction, solidIds = []) {
  const present = new Set(solidIds);
  const candidates = [...(reaction.reactants || []), reaction.conditions?.catalyst].filter(Boolean);
  const solidId = candidates.find((id) => present.has(id));
  return solidId ? { at: 'solid', solidId } : { at: 'liquid' };
}

const SUBSCRIPT = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const plain = (text) => String(text || '').replace(/[₀-₉]/g, (d) => SUBSCRIPT[d]).replace(/\s+/g, '');

/** Splits one side of an equation into { coefficient, species } terms. */
function termsOf(side) {
  return side.split(' + ').map((term) => {
    const match = term.trim().match(/^(\d*)\s*(.+)$/);
    return { coefficient: match[1] ? Number(match[1]) : 1, species: plain(match[2]) };
  });
}

/**
 * Molecules of `formula` made per electron in a half-equation, or 0 if the
 * half-equation does not make it.
 *   gasPerElectron('2H⁺ + 2e⁻ → H₂', 'H2') === 0.5
 */
export function gasPerElectron(halfEquation, formula) {
  const [left, right] = String(halfEquation || '').split('→');
  if (!right) return 0;
  const made = termsOf(right).find((t) => t.species === plain(formula));
  if (!made) return 0;
  const electrons = [...termsOf(left), ...termsOf(right)].find((t) => t.species === 'e⁻');
  return electrons ? made.coefficient / electrons.coefficient : 0;
}

/**
 * The gas streams an electrolysis rule gives off, one per electrode that
 * makes a gas, with share 1 for the stronger stream.
 *
 * @returns {{ side: 'cathode'|'anode', gasId: string, gasName: string, share: number }[]}
 */
export function electrodeStreams(reaction, engine) {
  const electrodes = reaction?.electrodes;
  if (!electrodes) return [];
  const gases = (reaction.products || [])
    .map((id) => engine.getChemical(id))
    .filter((c) => c && c.state === 'gas' && c.formula);

  const streams = [];
  for (const side of ['cathode', 'anode']) {
    const halfEquation = electrodes[side]?.halfEquation;
    for (const gas of gases) {
      const perElectron = gasPerElectron(halfEquation, gas.formula);
      if (perElectron > 0) {
        streams.push({ side, gasId: gas.id, gasName: gas.name, perElectron });
        break;
      }
    }
  }
  const most = Math.max(0, ...streams.map((s) => s.perElectron));
  return streams.map(({ perElectron, ...rest }) => ({ ...rest, share: most ? perElectron / most : 0 }));
}

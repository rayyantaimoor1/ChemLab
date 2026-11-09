/**
 * golden-sentences.mjs — works out the exact notebook sentence every reaction
 * produces, so it can be frozen as a "golden" snapshot (BUILD_PHASE_2.md
 * stage 2.1.3).
 *
 * WHY THIS EXISTS
 * The notebook writes its observations itself, by arranging curated facts
 * from reactions.json into sentences (engine.js, describeEffects). That is
 * the right design, but it means a small edit to a data file or to the
 * engine can quietly change what hundreds of students read — a colour name,
 * a temperature, a gas, a whole sentence. The golden test compares every
 * sentence against a copy a person has approved, so nothing a student reads
 * can change by accident.
 *
 * WHAT IS CAPTURED, FOR EVERY REACTION RULE
 *   sentence   — what the notebook says when the rule's reactants are put
 *                together with its conditions met: hot enough, cold enough,
 *                current on, catalyst in the vessel. Any reaction that
 *                follows on by itself (CLAUDE.md section 7's cascade) is
 *                part of the same sentence, exactly as the student reads it.
 *   fired      — which rules ran, in order, so a rule quietly overtaken by
 *                another one shows up even if the words happen to match.
 *   notMet     — for a rule with conditions, what the notebook says when
 *                they are NOT met: room temperature, no burner, no current,
 *                no catalyst (or, for a rule stopped by heat, 20 °C too
 *                hot). "This mixture needs to reach about 900 °C" is read by
 *                students too, and it carries a curated number.
 *
 * WHAT IS NOT CAPTURED
 * The opening words of each notebook line ("Added 10 mL of hydrochloric acid
 * to Beaker 1.") come from actions.js, not from the chemistry data, and are
 * covered by tests/actions.test.js. The sentence here is everything after
 * them.
 */

import { ROOM_TEMPERATURE_C } from '../../src/core/engine.js';

/** The temperature at which a rule's own conditions are satisfied. */
function temperatureMeetingConditions({ minTempC, maxTempC } = {}) {
  if (typeof minTempC === 'number') return minTempC;
  if (typeof maxTempC === 'number' && maxTempC < ROOM_TEMPERATURE_C) return maxTempC;
  return ROOM_TEMPERATURE_C;
}

function hasConditions(c = {}) {
  return (
    c.requiresHeat === true ||
    c.requiresElectricity === true ||
    typeof c.minTempC === 'number' ||
    typeof c.maxTempC === 'number' ||
    Boolean(c.catalyst)
  );
}

/**
 * Builds the snapshot for every reaction rule the engine holds, keyed by
 * rule id in the order they appear in reactions.json.
 */
export function buildGoldenSentences(engine) {
  const snapshot = {};

  for (const reaction of engine.getAllReactions()) {
    const c = reaction.conditions || {};

    const met = engine.react(
      [...reaction.reactants, ...(c.catalyst ? [c.catalyst] : [])],
      {
        tempC: temperatureMeetingConditions(c),
        heating: c.requiresHeat === true || typeof c.minTempC === 'number',
        electrified: c.requiresElectricity === true,
      }
    );

    const entry = {
      outcome: met.outcome,
      fired: met.steps.map((step) => step.reaction.id),
      sentence: met.message,
    };

    if (!reaction.noReaction && hasConditions(c)) {
      const tooHot = typeof c.maxTempC === 'number';
      const notMet = engine.react(reaction.reactants, {
        tempC: tooHot ? c.maxTempC + 20 : ROOM_TEMPERATURE_C,
        heating: tooHot,
        electrified: false,
      });
      entry.notMet = notMet.message;
    }

    snapshot[reaction.id] = entry;
  }

  return snapshot;
}

/** The snapshot as it is written to disk: stable, readable, one entry per rule. */
export function formatGolden(snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

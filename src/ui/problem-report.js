/**
 * problem-report.js — builds what a "This looks wrong" report says
 * (BUILD_PHASE_2.md stage 2.1.4).
 *
 * WHY THIS FILE EXISTS
 * When a student flags a notebook line, the useful facts are the ones from
 * the moment the line was written: which reaction rule(s) produced it, the
 * exact sentence they read, and what the vessel held right then. app.js
 * captures them with this function as each line is written, and adds the
 * student's note when they send it.
 *
 * It is its own small file, with no DOM, so tests/problem-report.test.js
 * can run a real reaction through it and hand the result to the main
 * process's own check (main/validate.js validateProblemReport). That proves
 * the page and the main process agree on the shape, which nothing else
 * would catch until a teacher found reports.json empty.
 */

import { OUTCOME } from '../core/engine.js';

/**
 * @param {object} result    what an action in actions.js returned
 * @param {object} snapshot  the vessel's container.snapshot() right after it
 * @returns {object|null} everything but the note, or null when the line was
 *   not produced by a reaction rule (nothing to report against - and a
 *   combination with no rule at all is already logged automatically to
 *   unknown-pairs.json, CLAUDE.md section 6.3)
 */
export function buildReportContext(result, snapshot) {
  const engineResult = result?.engineResult;
  if (!engineResult || !snapshot) return null;
  if (engineResult.outcome !== OUTCOME.REACTION && engineResult.outcome !== OUTCOME.NO_REACTION) return null;

  // The rules that ran, in order; or, when nothing ran, the one rule that
  // answered "No observable change" or was held back by a condition.
  const reactionIds = engineResult.steps?.length
    ? engineResult.steps.map((step) => step.reaction.id)
    : engineResult.finalStep?.reaction
      ? [engineResult.finalStep.reaction.id]
      : [];
  if (reactionIds.length === 0) return null;

  return {
    reactionIds,
    outcome: engineResult.outcome,
    notebookText: result.notebookText,
    vessel: {
      name: snapshot.name,
      speciesIds: [...snapshot.speciesIds],
      volumeMl: snapshot.volumeMl,
      temperatureC: snapshot.temperatureC,
      heatLevel: snapshot.heatLevel,
      electrified: snapshot.electrified,
      pH: snapshot.pH,
    },
  };
}

/** The finished report: the captured context plus the student's own words. */
export function withNote(context, note) {
  return { ...context, note: String(note ?? '').trim().slice(0, 500) };
}

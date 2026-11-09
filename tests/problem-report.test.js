/**
 * problem-report.test.js — proves a "This looks wrong" report built from a
 * real reaction is one the main process will accept (BUILD_PHASE_2.md
 * stage 2.1.4).
 *
 * The page builds the report (src/ui/problem-report.js); the main process
 * checks it field by field before writing it (main/validate.js). If the two
 * ever disagreed about the shape, every report would be refused and a
 * teacher would find reports.json empty with no clue why. So these tests run
 * real reactions on a real vessel, build the report exactly as app.js does,
 * and hand it to the real check.
 *
 * Run them with:  npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createEngine } from '../src/core/engine.js';
import { createActions } from '../src/core/actions.js';
import { createContainer } from '../src/core/container.js';
import { buildReportContext, withNote } from '../src/ui/problem-report.js';
import { validateProblemReport } from '../main/validate.js';
import chemicals from '../src/data/chemicals.json' with { type: 'json' };
import reactions from '../src/data/reactions.json' with { type: 'json' };

const known = {
  knownReactionIds: new Set(reactions.map((reaction) => reaction.id)),
  knownChemicalIds: new Set(chemicals.map((chemical) => chemical.id)),
};
const rule = (id) => reactions.find((reaction) => reaction.id === id);

function bench() {
  const engine = createEngine();
  const vessel = createContainer({ id: 'b1', name: 'Beaker 1', capacityMl: 250, getChemical: engine.getChemical });
  const actions = createActions({ getContainer: (id) => (id === 'b1' ? vessel : null), engine });
  /** Runs an action and builds the report exactly as app.js does. */
  const report = (result, note = '') => {
    const context = buildReportContext(result, vessel.snapshot());
    return context && withNote(context, note);
  };
  return { vessel, actions, report };
}

test('a reaction that ran gives a report the main process accepts', () => {
  const { actions, report } = bench();
  const [a, b] = rule('rxn_neutralisation_hcl_naoh').reactants;
  actions.addChemical('b1', a, 10);
  const result = actions.addChemical('b1', b, 10);

  const sent = report(result, '  I expected it to get much hotter.  ');
  assert.deepEqual(sent.reactionIds, ['rxn_neutralisation_hcl_naoh']);
  assert.equal(sent.outcome, 'reaction');
  assert.equal(sent.notebookText, result.notebookText);
  assert.equal(sent.note, 'I expected it to get much hotter.');
  assert.equal(sent.vessel.name, 'Beaker 1');
  assert.deepEqual(validateProblemReport(sent, known), sent);
});

test('a "No observable change" rule is reportable, naming the rule that answered', () => {
  const { actions, report } = bench();
  const none = reactions.find((reaction) => reaction.noReaction && reaction.reactants.length === 2);
  actions.addChemical('b1', none.reactants[0], 10);
  const sent = report(actions.addChemical('b1', none.reactants[1], 10));

  assert.deepEqual(sent.reactionIds, [none.id]);
  assert.equal(sent.outcome, 'no_reaction');
  assert.deepEqual(validateProblemReport(sent, known), sent);
});

test('a rule held back by a condition is reportable too', () => {
  const { actions, report } = bench();
  const [carbonate] = rule('rxn_group2_caco3_decomposition').reactants;
  const sent = report(actions.addChemical('b1', carbonate, 5));

  assert.deepEqual(sent.reactionIds, ['rxn_group2_caco3_decomposition']);
  assert.match(sent.notebookText, /needs to reach about 900 °C/);
  assert.deepEqual(validateProblemReport(sent, known), sent);
});

test('electrolysis with the current on is reported with the vessel state at that moment', () => {
  const { actions, report } = bench();
  const brine = rule('rxn_electrolysis_brine');
  for (const id of brine.reactants) actions.addChemical('b1', id, 20);
  const sent = report(actions.setPower('b1', true));

  assert.ok(sent.reactionIds.includes('rxn_electrolysis_brine'));
  assert.equal(sent.vessel.electrified, true);
  assert.deepEqual(validateProblemReport(sent, known), sent);
});

test('a combination with no rule at all is not reportable here (it is logged automatically)', () => {
  const { actions, report } = bench();
  actions.addChemical('b1', 'hcl_1m', 10);
  const result = actions.addChemical('b1', 'phenolphthalein_1pct', 1);
  assert.equal(result.engineResult.outcome, 'unknown');
  assert.equal(report(result), null);
});

test('the note is trimmed and capped at the length the main process allows', () => {
  const { actions, report } = bench();
  const [a, b] = rule('rxn_neutralisation_hcl_naoh').reactants;
  actions.addChemical('b1', a, 10);
  const sent = report(actions.addChemical('b1', b, 10), 'x'.repeat(900));
  assert.equal(sent.note.length, 500);
  assert.deepEqual(validateProblemReport(sent, known), sent);
});

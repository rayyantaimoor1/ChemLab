/**
 * actions.js — the four things a student can do to a vessel on the bench:
 * add a chemical, pour, turn the heat up or down, and stir.
 *
 * WHY THIS FILE EXISTS
 * UI.md section 1 defines a fixed contract: the UI is only allowed to dispatch
 * a handful of named actions with fixed argument lists. It is never allowed to
 * work out chemistry itself. This file is the other end of that contract — it
 * takes a dispatched action, updates the right container (container.js), and
 * asks the engine (engine.js) whether anything should now happen.
 *
 * Every action follows the same three moves:
 *   1. change the container  (container.js)
 *   2. ask the engine what happens now  (engine.js)
 *   3. apply whatever the engine found, and write a plain-English sentence
 *      describing what just happened (CLAUDE.md section 7: every action
 *      produces a notebook entry, automatically)
 *
 * NO DOM AND NO FILES. This folder is pure logic. Unknown combinations are
 * already tracked in memory by the engine; this file does not write anything
 * to disk itself, the same way engine.js and container.js do not.
 *
 * NAMES AND ARGUMENTS ARE FIXED BY UI.md SECTION 1. Do not rename these or
 * change their argument order — the UI calls them exactly like this:
 *
 *   addChemical(containerId, chemicalId, amountMl)
 *   pour(fromId, toId, amountMl)
 *   setHeat(containerId, level)      // 0-3
 *   stir(containerId)
 *
 * setPower(containerId, on) is the one addition to that list, for
 * electrolysis. See the comment above it for why an electric current could
 * not be squeezed into the existing conditions.
 */

import { engine as defaultEngine, OUTCOME } from './engine.js';

/**
 * Builds the action set for one bench.
 *
 * @param {object}   options
 * @param {Function} options.getContainer   (containerId) => container instance
 *   from container.js, or a falsy value if that id does not exist. Dispatch
 *   functions take plain ids, not container objects, so something has to look
 *   them up — this is that lookup, owned by whoever is running the bench.
 * @param {object}   [options.engine]       an engine from engine.js. Defaults
 *   to the app's real engine over the real data files.
 * @param {Function} [options.onNotebookEntry] called with { text, containerId,
 *   action, timestamp } after every action. This is how notebook.js will plug
 *   in once it exists, without this file needing to know its internals.
 * @param {object}   [options.tools]        a tool set from tools.js. Without
 *   it dipTool has nothing to dip and will say so rather than fail quietly.
 */
export function createActions({
  getContainer,
  engine = defaultEngine,
  onNotebookEntry = null,
  tools = null,
} = {}) {
  if (typeof getContainer !== 'function') {
    throw new TypeError('createActions() needs a getContainer(id) function');
  }

  function findContainer(containerId, callerName) {
    const container = getContainer(containerId);
    if (!container) {
      throw new Error(`${callerName}: no container found with id '${containerId}'`);
    }
    return container;
  }

  /**
   * Runs the container's current contents past the engine and applies whatever
   * it decides, including any cascade (CLAUDE.md section 7).
   *
   * This is the one and only place a reaction is ever triggered from, so every
   * action goes through here rather than each reimplementing the same three
   * steps.
   */
  function checkForReaction(container) {
    const speciesIds = container.getSpeciesIds();
    const result = engine.react(speciesIds, {
      tempC: container.getTemperatureC(),
      heating: container.isHeating(),
      electrified: container.isElectrified(),
    });

    // engine.react() only works out what WOULD happen; applying it to the real
    // vessel is this file's job, one cascade step at a time so container.js's
    // own bookkeeping (temperature, pH, volume) stays in step with the engine.
    for (const step of result.steps) {
      container.applyReaction(step.reaction);
    }

    return result;
  }

  function emitNotebookEntry(action, containerId, text) {
    const entry = { text, containerId, action, timestamp: Date.now() };
    if (typeof onNotebookEntry === 'function') onNotebookEntry(entry);
    return entry;
  }

  function chemicalName(chemicalId) {
    const chemical = engine.getChemical(chemicalId);
    return chemical ? chemical.name : chemicalId;
  }

  /* ------------------------------------------------------------------ *
   * addChemical(containerId, chemicalId, amountMl)
   * ------------------------------------------------------------------ */

  function addChemical(containerId, chemicalId, amountMl) {
    const container = findContainer(containerId, 'addChemical');

    if (!engine.getChemical(chemicalId)) {
      throw new Error(`addChemical: '${chemicalId}' is not a known chemical`);
    }

    // UI.md names this parameter amountMl for every reagent, solids included -
    // it is the number on the shelf's dispense control, not a unit promise.
    // container.add() still stores solids in grams; it works out the right
    // unit from the chemical's own state, not from this parameter's name.
    const addResult = container.add(chemicalId, amountMl);

    let sentence = `Added ${addResult.added} ${addResult.unit} of ${chemicalName(chemicalId)} to ${container.name}.`;
    if (addResult.overflowed) {
      sentence += ` ${addResult.spilled} ${addResult.unit} overflowed the vessel.`;
    }

    const engineResult = checkForReaction(container);
    sentence += ` ${engineResult.message}`;

    return {
      action: 'addChemical',
      containerId,
      chemicalId,
      amountMl,
      ...addResult,
      engineResult,
      notebookText: sentence,
      notebookEntry: emitNotebookEntry('addChemical', containerId, sentence),
    };
  }

  /* ------------------------------------------------------------------ *
   * pour(fromId, toId, amountMl)
   * ------------------------------------------------------------------ */

  function pour(fromId, toId, amountMl) {
    const from = findContainer(fromId, 'pour');
    const to = findContainer(toId, 'pour');

    const pourResult = from.pourInto(to, amountMl);

    let sentence =
      pourResult.poured > 0
        ? `Poured ${pourResult.poured} mL from ${from.name} into ${to.name}.`
        : `Tried to pour from ${from.name} into ${to.name}, but ${from.name} was empty.`;
    if (pourResult.spilled > 0) {
      sentence += ` ${pourResult.spilled} mL overflowed ${to.name}.`;
    }

    // Only the vessel that just received something new can have a fresh
    // reaction start. The source vessel lost volume, not a different mixture -
    // whatever was or was not reacting in it is unchanged.
    const engineResult = checkForReaction(to);
    sentence += ` ${engineResult.message}`;

    return {
      action: 'pour',
      fromId,
      toId,
      amountMl,
      ...pourResult,
      engineResult,
      notebookText: sentence,
      notebookEntry: emitNotebookEntry('pour', toId, sentence),
    };
  }

  /* ------------------------------------------------------------------ *
   * setHeat(containerId, level)   level 0-3
   * ------------------------------------------------------------------ */

  // Plain words for the four knob positions. This labelling is not specified
  // anywhere in CLAUDE.md or UI.md - it is only for the notebook sentence, so
  // it is safe to change in one place if the project owner wants different
  // wording (or a different number of positions).
  const HEAT_LEVEL_WORDS = ['off', 'low', 'medium', 'high'];

  function setHeat(containerId, level) {
    const container = findContainer(containerId, 'setHeat');

    container.setHeatLevel(level);

    const sentence =
      level === 0
        ? `The burner under ${container.name} was turned off.`
        : `The burner under ${container.name} was set to ${HEAT_LEVEL_WORDS[level]} heat.`;

    // Turning the burner on or off can unlock (or, at level 0, no longer
    // satisfy) a rule that requires heat, so the contents need rechecking -
    // see CLAUDE.md section 7, "conditions gate reactions".
    const engineResult = checkForReaction(container);
    const fullSentence = `${sentence} ${engineResult.message}`;

    return {
      action: 'setHeat',
      containerId,
      level,
      heating: container.isHeating(),
      engineResult,
      notebookText: fullSentence,
      notebookEntry: emitNotebookEntry('setHeat', containerId, fullSentence),
    };
  }

  /* ------------------------------------------------------------------ *
   * warmTo(containerId, tempC)
   *
   * Puts the vessel at a temperature and re-checks it. This is what makes
   * the burner actually DO something: setHeat only records the knob
   * position, and container.js says in as many words that turning "the
   * burner is on" into a temperature rise over time belongs outside it.
   * Whoever owns the clock (app.js's burner tick) calls this.
   *
   * The one place in this file that does NOT always write a notebook line.
   * A burner ticking a couple of degrees at a time would bury the log in
   * hundreds of "the beaker is now 34 °C" entries and drown the entries
   * that matter. So the temperature is recorded silently and only a real
   * reaction gets written down - which is the moment worth recording
   * anyway, and is still automatic, as CLAUDE.md section 7 requires.
   * ------------------------------------------------------------------ */

  function warmTo(containerId, tempC) {
    const container = findContainer(containerId, 'warmTo');
    if (typeof tempC !== 'number' || Number.isNaN(tempC)) {
      throw new TypeError(`warmTo() needs a temperature in °C, got ${tempC}`);
    }

    container.setTemperatureC(tempC);

    // Reaching a temperature can unlock a rule gated on it - that is the
    // whole point of raising it, so the contents have to be rechecked.
    const engineResult = checkForReaction(container);

    const reacted = engineResult.outcome === OUTCOME.REACTION;
    const sentence = `${container.name} reached ${Math.round(tempC)} °C. ${engineResult.message}`;

    return {
      action: 'warmTo',
      containerId,
      tempC,
      engineResult,
      notebookText: reacted ? sentence : null,
      notebookEntry: reacted ? emitNotebookEntry('warmTo', containerId, sentence) : null,
    };
  }

  /* ------------------------------------------------------------------ *
   * setPower(containerId, on)
   *
   * Dips a pair of electrodes into the vessel and switches the supply on
   * or off. Not one of UI.md section 1's original dispatch names - that
   * list predates electrolysis being modelled at all - but it follows the
   * same shape as setHeat, because it is the same kind of thing: a switch
   * position that gates which rules are allowed to fire.
   * ------------------------------------------------------------------ */

  function setPower(containerId, on) {
    const container = findContainer(containerId, 'setPower');

    container.setElectrified(Boolean(on));

    const sentence = on
      ? `Electrodes were placed in ${container.name} and the current switched on.`
      : `The current through ${container.name} was switched off.`;

    // Switching the supply on can unlock an electrolysis rule, and switching
    // it off can stop one being satisfied - the same reason setHeat rechecks.
    const engineResult = checkForReaction(container);
    const fullSentence = `${sentence} ${engineResult.message}`;

    return {
      action: 'setPower',
      containerId,
      on: Boolean(on),
      electrified: container.isElectrified(),
      engineResult,
      notebookText: fullSentence,
      notebookEntry: emitNotebookEntry('setPower', containerId, fullSentence),
    };
  }

  /* ------------------------------------------------------------------ *
   * stir(containerId)
   * ------------------------------------------------------------------ */

  function stir(containerId) {
    const container = findContainer(containerId, 'stir');

    // Stirring does not add, remove, heat or cool anything - the contents were
    // already treated as evenly mixed the moment they went in (container.js
    // holds one flat list of species, not separate unmixed layers). What
    // stirring is really for here is forcing a fresh look at the vessel: if
    // the heat was turned up or a catalyst dropped in without anything being
    // added afterwards, nothing has re-checked the contents since. Stirring is
    // the deliberate "check again now" moment, the way it is at a real bench.
    const engineResult = checkForReaction(container);
    const sentence = `The contents of ${container.name} were stirred. ${engineResult.message}`;

    return {
      action: 'stir',
      containerId,
      engineResult,
      notebookText: sentence,
      notebookEntry: emitNotebookEntry('stir', containerId, sentence),
    };
  }

  /* ------------------------------------------------------------------ *
   * dipTool(toolId, containerId)
   * ------------------------------------------------------------------ */

  function dipTool(toolId, containerId) {
    const container = findContainer(containerId, 'dipTool');
    if (!tools) {
      throw new Error('dipTool: createActions() was not given a tools set');
    }

    // Deliberately NOT followed by an engine check. CLAUDE.md section 7:
    // "Tools read state, never modify it." Dipping pH paper cannot start a
    // reaction, so unlike the four actions above this one only reads. It is
    // handed the container's frozen snapshot, so tools.js could not change
    // anything even if it tried.
    const reading = tools.dip(toolId, container.snapshot());

    return {
      action: 'dipTool',
      toolId,
      containerId,
      reading,
      notebookText: reading.text,
      notebookEntry: emitNotebookEntry('dipTool', containerId, reading.text),
    };
  }

  return { addChemical, pour, setHeat, setPower, warmTo, stir, dipTool };
}

export default createActions;

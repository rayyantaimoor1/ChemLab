/**
 * experiments.js — guided mode: walking a student through a real experiment
 * one step at a time.
 *
 * WHY THIS FILE EXISTS
 * Free Lab lets a student mix anything they like. Guided mode is the other
 * half of CLAUDE.md section 1: the app names a real experiment, tells the
 * student what to do next, and notices whether they did it. This file is the
 * part that "notices". It holds which experiment is running, which step the
 * student is on, and it judges each thing they do against that step.
 *
 * THE MOST IMPORTANT RULE HERE: THIS FILE NEVER STOPS ANYTHING HAPPENING
 * It does not gate the bench. It is told what the student just did, AFTER
 * they did it, and it responds. A student who ignores step 3 and pours acid
 * into the wrong vessel still pours the acid — the vessel really changes, the
 * engine really runs, and the notebook really records it. All this file does
 * is say "that is not what this step asked for, and here is why".
 *
 * That is a deliberate teaching decision, not a technical shortcut. A student
 * who cannot make a mistake cannot find out what a mistake looks like, and an
 * app that silently refuses a click teaches nothing at all. Guided mode is a
 * lab demonstrator standing next to the student, not a locked cupboard.
 *
 * WHAT COUNTS AS "THE RIGHT ACTION"
 * Each step in experiments.json carries a requiredAction describing what the
 * student is meant to do. Only the fields actually written in that block are
 * checked. A step that names a chemical but no amount accepts any amount; a
 * step that names no vessel accepts any vessel. This keeps the content in
 * charge of how strict each step is, without this file needing to change.
 *
 * FOUR THINGS THAT CAN HAPPEN, NEVER BLURRED TOGETHER
 *   'correct'  — it matched the current step. Move on.
 *   'ahead'    — it matched a step further down the list. The student has
 *                jumped forward, so say which step they are actually on.
 *   'repeat'   — it matched a step they already finished. Harmless. Dipping
 *                the pH paper twice is not a mistake, so it is not treated
 *                as one.
 *   'wrong'    — it matched nothing. Show the step's authored explanation
 *                and its hint.
 *
 * NO DOM AND NO FILES. This folder is pure logic (CLAUDE.md section 4). The
 * notebook entries this file produces are handed to whoever wired it up, the
 * same way actions.js and engine.js hand theirs over.
 */

import experimentData from '../data/experiments.json' with { type: 'json' };

/** Where a run has got to. */
export const STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETE: 'complete',
};

/** How one submitted action was judged. See the header for what each means. */
export const JUDGEMENT = {
  CORRECT: 'correct',
  AHEAD: 'ahead',
  REPEAT: 'repeat',
  WRONG: 'wrong',
  NOT_RUNNING: 'not_running',
};

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/**
 * Which vessel an action happened to.
 *
 * Most actions carry a containerId. Pouring carries two, and the one that
 * matters is where the liquid ended up, because that is the vessel whose
 * contents changed.
 */
function targetContainerId(action) {
  if (action.action === 'pour' || action.type === 'pour') return action.toId ?? action.containerId;
  return action.containerId;
}

/** The action's name, accepting either key so callers can pass actions.js's
 *  return value straight through without reshaping it. */
function actionName(action) {
  return action.action || action.type || null;
}

/**
 * Builds a guided-mode runner.
 *
 * @param {object}   [options]
 * @param {Array}    [options.experiments]  experiment records. Defaults to the
 *   real data file.
 * @param {Function} [options.getContainer] (containerId) => the vessel from
 *   container.js. Needed only for steps that name a containerType rather than
 *   a containerId, because working out whether a vessel is a beaker means
 *   asking the vessel. Pass the same lookup actions.js was given.
 * @param {Function} [options.onNotebookEntry] called with { text, action,
 *   timestamp, ... } as the run progresses, so guided milestones land in the
 *   same notebook as everything else.
 */
export function createExperimentRunner({
  experiments = experimentData,
  getContainer = null,
  onNotebookEntry = null,
} = {}) {
  deepFreeze(experiments);

  const experimentsById = new Map(experiments.map((experiment) => [experiment.id, experiment]));

  let current = null; // the experiment being run, or null in Free Lab
  let stepIndex = 0;
  let status = STATUS.NOT_STARTED;

  function emitNotebookEntry(action, text, extra = {}) {
    const entry = { text, action, timestamp: Date.now(), ...extra };
    if (typeof onNotebookEntry === 'function') onNotebookEntry(entry);
    return entry;
  }

  /* ------------------------------------------------------------------ *
   * Judging one action against one step
   * ------------------------------------------------------------------ */

  /**
   * Does this action satisfy this step?
   *
   * Returns null when it does, or a short plain-English sentence saying what
   * did not line up. That sentence is mechanical bookkeeping only — "you used
   * the test tube, this step is about the beaker". The chemistry explanation
   * always comes from the step's authored onWrongAction text, never from here.
   */
  function mismatchReason(step, action) {
    const required = step.requiredAction || {};
    const name = actionName(action);

    if (required.type && name !== required.type) return null; // different kind of action entirely

    if (required.chemicalId && action.chemicalId !== required.chemicalId) {
      return 'That is not the reagent this step asks for.';
    }

    if (required.toolId && action.toolId !== required.toolId) {
      return 'That is a different tool from the one this step asks for.';
    }

    if (typeof required.level === 'number' && action.level !== required.level) {
      return `This step asks for heat setting ${required.level}.`;
    }

    // Vessel, by exact id or by kind of vessel.
    const usedId = targetContainerId(action);
    if (required.containerId && usedId !== required.containerId) {
      return 'That is not the vessel this step asks for.';
    }
    if (required.containerType) {
      const vessel = typeof getContainer === 'function' ? getContainer(usedId) : null;
      // No way to look the vessel up means no way to check it. Say nothing
      // rather than accuse the student of a mistake we cannot actually see.
      if (vessel && vessel.type !== required.containerType) {
        return `This step is about the ${required.containerType.replace(/_/g, ' ')}, not the ${String(vessel.type).replace(/_/g, ' ')}.`;
      }
    }

    // Amounts are a range, not an exact figure, so that a student measuring by
    // eye is not failed for being 2 mL out. How wide that range is belongs to
    // the content, not to this file.
    const amount = action.amountMl;
    if (typeof required.minAmountMl === 'number' && typeof amount === 'number' && amount < required.minAmountMl) {
      return `That is less than this step needs — aim for about ${required.minAmountMl} to ${required.maxAmountMl ?? required.minAmountMl} mL.`;
    }
    if (typeof required.maxAmountMl === 'number' && typeof amount === 'number' && amount > required.maxAmountMl) {
      return `That is more than this step needs — aim for about ${required.minAmountMl ?? required.maxAmountMl} to ${required.maxAmountMl} mL.`;
    }

    return null;
  }

  /** True when the action is the right KIND of action for the step, whatever
   *  its details. Used to tell "wrong tool" apart from "not this step at all". */
  function sameActionType(step, action) {
    const required = step.requiredAction || {};
    return !required.type || actionName(action) === required.type;
  }

  /** A full match: right kind of action, and every detail the step specified. */
  function satisfies(step, action) {
    return sameActionType(step, action) && mismatchReason(step, action) === null;
  }

  /* ------------------------------------------------------------------ *
   * Running an experiment
   * ------------------------------------------------------------------ */

  function currentStep() {
    if (!current || status !== STATUS.IN_PROGRESS) return null;
    return current.steps[stepIndex] || null;
  }

  /**
   * The state the UI renders. UI.md section 1 fixes the four field names
   * experimentId, stepIndex, instruction and hint, so those are spelled
   * exactly that way and kept at the top level for the UI to pass straight
   * through.
   */
  function getState() {
    const step = currentStep();
    return deepFreeze({
      status,
      experimentId: current ? current.id : null,
      title: current ? current.title : null,
      stepIndex: current ? stepIndex : 0,
      totalSteps: current ? current.steps.length : 0,
      instruction: step ? step.instruction : null,
      hint: step ? step.hint : null,
      step: step ? { ...step } : null,
      objective: current ? current.objective : null,
      // Only revealed once the run is finished, so it cannot be read off the
      // screen as an answer key while the student is still working.
      expectedResult: status === STATUS.COMPLETE && current ? current.expectedResult ?? null : null,
    });
  }

  function start(experimentId) {
    const experiment = experimentsById.get(experimentId);
    if (!experiment) {
      throw new Error(`start: no experiment found with id '${experimentId}'`);
    }
    if (!Array.isArray(experiment.steps) || experiment.steps.length === 0) {
      throw new Error(`start: experiment '${experimentId}' has no steps`);
    }

    current = experiment;
    stepIndex = 0;
    status = STATUS.IN_PROGRESS;

    emitNotebookEntry('experimentStart', `Started the guided experiment: ${experiment.title}. ${experiment.objective}`, {
      experimentId: experiment.id,
    });

    return getState();
  }

  /** Leaves guided mode and goes back to Free Lab. The bench is untouched —
   *  clearing vessels is resetBench's job, not this file's. */
  function stop() {
    current = null;
    stepIndex = 0;
    status = STATUS.NOT_STARTED;
    return getState();
  }

  /**
   * Tells the runner what the student just did.
   *
   * Call this AFTER the action has already run on the bench. Nothing here can
   * undo it, and nothing here should try to — see the note at the top of this
   * file about not blocking curiosity.
   *
   * @param {object} action the shape actions.js returns, e.g.
   *   { action: 'addChemical', containerId, chemicalId, amountMl }
   * @returns {object} { judgement, correct, advanced, message, hint, ... }
   */
  function recordAction(action) {
    if (!action || typeof action !== 'object') {
      throw new TypeError('recordAction() needs the action the student performed');
    }

    // Free Lab, or an experiment that has already finished. Not an error: the
    // student is allowed to keep playing with the bench afterwards.
    if (!current || status !== STATUS.IN_PROGRESS) {
      return {
        judgement: JUDGEMENT.NOT_RUNNING,
        correct: false,
        advanced: false,
        message: null,
        hint: null,
        state: getState(),
      };
    }

    const step = current.steps[stepIndex];

    /* --- the step in front of them ---------------------------------- */
    if (satisfies(step, action)) {
      stepIndex += 1;
      const finished = stepIndex >= current.steps.length;
      if (finished) status = STATUS.COMPLETE;

      const message = finished
        ? `Step ${step.n} done. That completes ${current.title}.`
        : `Step ${step.n} done. Next: ${current.steps[stepIndex].instruction}`;

      emitNotebookEntry('experimentStep', message, {
        experimentId: current.id,
        stepNumber: step.n,
      });

      if (finished) {
        emitNotebookEntry('experimentComplete', `Finished the guided experiment: ${current.title}.`, {
          experimentId: current.id,
        });
      }

      return {
        judgement: JUDGEMENT.CORRECT,
        correct: true,
        advanced: true,
        completed: finished,
        message,
        hint: null,
        state: getState(),
      };
    }

    /* --- something they have already done ---------------------------- */
    // Checked before looking ahead, because repeating a measurement is the
    // commonest harmless thing a student does and should never read as an error.
    const repeatedStep = current.steps.slice(0, stepIndex).find((earlier) => satisfies(earlier, action));
    if (repeatedStep) {
      return {
        judgement: JUDGEMENT.REPEAT,
        correct: false,
        advanced: false,
        message: `That repeats step ${repeatedStep.n}, which you have already done — no harm done. You are still on step ${step.n}: ${step.instruction}`,
        hint: step.hint ?? null,
        state: getState(),
      };
    }

    /* --- a step further down the list -------------------------------- */
    const aheadStep = current.steps.slice(stepIndex + 1).find((later) => satisfies(later, action));
    if (aheadStep) {
      return {
        judgement: JUDGEMENT.AHEAD,
        correct: false,
        advanced: false,
        message: `That is step ${aheadStep.n}, and there is something to do first. Step ${step.n}: ${step.instruction}`,
        hint: step.hint ?? null,
        state: getState(),
      };
    }

    /* --- genuinely not what this step wanted -------------------------- */
    // Two sentences, and they do different jobs. The authored onWrongAction
    // carries the chemistry and the reasoning, written by whoever wrote the
    // experiment. The detail line is this file's own bookkeeping, and only
    // appears when the student was at least performing the right KIND of
    // action, where saying exactly what differed is genuinely useful.
    const detail = sameActionType(step, action) ? mismatchReason(step, action) : null;
    const authored = step.onWrongAction || `That is not what step ${step.n} asks for. ${step.instruction}`;

    return {
      judgement: JUDGEMENT.WRONG,
      correct: false,
      advanced: false,
      message: detail ? `${detail} ${authored}` : authored,
      detail,
      hint: step.hint ?? null,
      state: getState(),
    };
  }

  return {
    /* Reading the state */
    getState,
    getCurrentStep: currentStep,
    getHint: () => {
      const step = currentStep();
      return step ? step.hint ?? null : null;
    },
    isRunning: () => status === STATUS.IN_PROGRESS,

    /* The catalogue, for the experiment picker in UI.md section 3's top bar */
    listExperiments: () =>
      experiments.map(({ id, title, level, objective }) => ({ id, title, level, objective })),
    getExperiment: (id) => experimentsById.get(id) || null,

    /* Running one */
    start,
    stop,
    recordAction,
  };
}

export default createExperimentRunner;

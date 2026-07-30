/**
 * guided.js — the guided-mode chrome from UI.md section 3 and section 7's
 * component inventory: the experiment picker, the step card with its hint
 * and progress, and the completion summary.
 *
 * WHAT THIS FILE DOES AND DOES NOT DECIDE
 * Every judgement about whether a step was done correctly already happened
 * in src/core/experiments.js before any of this runs. This file only reads
 * state.guided (built by app.js from the runner's own getState()) and turns
 * it into DOM, the same boundary every other ui/*.js file keeps. It reads
 * engine.getChemical for names only, the same read-only lookup panels.js and
 * shelf.js already use - it never asks "did this reaction happen" or
 * "was this right", because experiments.js already answered that.
 *
 * THREE PIECES, THREE MOUNT FUNCTIONS
 *   mountGuidedBar       — the topbar's "MODE: ... Experiment ▾" area
 *   mountGuidedStepCard  — the persistent step card while a run is active
 *                           (UI.md section 7: "guided step card with hint")
 *   mountGuidedSummary   — the completion modal (UI.md section 3's
 *                           "Experiment step detail" overlay)
 * This mirrors how panels.js hosts several related overlays in one file
 * rather than three near-identical files.
 *
 * THE COMPLETION SUMMARY DOES NOT GRADE
 * It shows the experiment's curated expectedResult next to what the
 * student's own bench shows right now, side by side, exactly like the
 * notebook's existing "Compare with reference" (see panels.js /
 * notebook.js). No pass/fail verdict is computed here — inventing one would
 * be exactly the kind of confidently-wrong judgement CLAUDE.md section 6
 * rules out for chemistry, just applied to marking instead. A human reads
 * both columns and decides.
 */

import { engine } from '../core/engine.js';

/** "temperatureRiseC" -> "Temperature rise c", "endpointPH" -> "Endpoint pH".
 *  Purely cosmetic, data-driven - "pH" keeps the capital H used everywhere
 *  else in the app (chemicals.json, the properties card, pH paper's own
 *  readings) rather than being lowercased along with the rest of the key. */
function humaniseKey(key) {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word) => (/^ph$/i.test(word) ? 'pH' : word.toLowerCase()));

  if (words[0] !== 'pH') words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return words.join(' ');
}

/** Appends the right unit for a handful of common expectedResult keys, when
 *  the value is a plain number - everything else prints as-is. */
function formatExpectedValue(key, value) {
  if (typeof value !== 'number') return String(value);
  if (/pH$/i.test(key)) return String(value);
  if (/TempC$|TemperatureC$|RiseC$/i.test(key)) return `${value} °C`;
  return String(value);
}

/* ==================================================================== *
 * The topbar area: mode text + experiment picker
 * ==================================================================== */

/**
 * Mounts "MODE: Free Lab / Guided     Experiment ▾" from UI.md section 3's
 * topbar diagram. Picking an experiment starts it; picking "Free Lab" exits
 * guided mode without touching the bench (see stopExperiment in app.js for
 * why leaving guided mode does not reset anything).
 */
export function mountGuidedBar({ root, getState, dispatch, subscribe }) {
  function render() {
    const state = getState();
    root.innerHTML = '';

    const modeLabel = document.createElement('span');
    modeLabel.className = 'guided-bar__mode';
    modeLabel.textContent =
      state.mode === 'guided' && state.guided
        ? `MODE: Guided — ${state.guided.title}`
        : 'MODE: Free Lab';
    root.appendChild(modeLabel);

    const picker = document.createElement('select');
    picker.className = 'guided-bar__picker';
    picker.setAttribute('aria-label', 'Experiment');

    const freeOption = document.createElement('option');
    freeOption.value = '';
    freeOption.textContent = 'Free Lab';
    picker.appendChild(freeOption);

    for (const experiment of state.experiments) {
      const option = document.createElement('option');
      option.value = experiment.id;
      option.textContent = `${experiment.title} (${experiment.level})`;
      picker.appendChild(option);
    }

    picker.value = state.mode === 'guided' && state.guided ? state.guided.experimentId : '';

    picker.addEventListener('change', () => {
      if (picker.value === '') {
        dispatch.stopExperiment();
      } else {
        dispatch.startExperiment(picker.value);
      }
    });

    root.appendChild(picker);
  }

  subscribe(render);
  render();

  return { render };
}

/* ==================================================================== *
 * The step card
 * ==================================================================== */

/**
 * Mounts the persistent guided step card - UI.md section 7's "guided step
 * card with hint" - shown below the topbar while a run is in progress.
 *
 * The hint sits behind a <details> disclosure rather than being shown
 * outright. experiments.js's own header calls this "guiding without
 * blocking curiosity" - showing the instruction plainly but leaving the
 * hint to ask for keeps the same spirit: a student who wants to work it out
 * can, and a student who wants a nudge only has to click.
 *
 * Feedback from the most recent action (state.guided.feedback) is shown
 * underneath. It is never hidden or timed out - a wrong-action explanation
 * is worth reading at the student's own pace, the same reasoning the
 * hazard alert in panels.js already applies to a safety warning, just
 * without the alarm.
 */
export function mountGuidedStepCard({ root, getState, dispatch, subscribe }) {
  function render() {
    const state = getState();
    root.innerHTML = '';

    // Nothing to show in Free Lab, and nothing to show once the experiment
    // is complete - the completion summary takes over at that point.
    if (state.mode !== 'guided' || !state.guided || state.guided.status !== 'in_progress') {
      root.hidden = true;
      return;
    }
    root.hidden = false;

    const guided = state.guided;
    const card = document.createElement('div');
    card.className = 'guided-stepcard';

    const progressText = document.createElement('p');
    progressText.className = 'guided-stepcard__progress';
    progressText.textContent = `Step ${guided.stepIndex + 1} of ${guided.totalSteps}`;
    card.appendChild(progressText);

    const bar = document.createElement('div');
    bar.className = 'guided-progress';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(guided.totalSteps));
    bar.setAttribute('aria-valuenow', String(guided.stepIndex));
    const fill = document.createElement('div');
    fill.className = 'guided-progress__fill';
    fill.style.width = `${Math.round((guided.stepIndex / guided.totalSteps) * 100)}%`;
    bar.appendChild(fill);
    card.appendChild(bar);

    const instruction = document.createElement('p');
    instruction.className = 'guided-stepcard__instruction';
    instruction.textContent = guided.instruction;
    card.appendChild(instruction);

    if (guided.hint) {
      const details = document.createElement('details');
      details.className = 'guided-stepcard__hint';
      const summary = document.createElement('summary');
      summary.textContent = 'Need a hint?';
      details.appendChild(summary);
      const hintText = document.createElement('p');
      hintText.textContent = guided.hint;
      details.appendChild(hintText);
      card.appendChild(details);
    }

    if (guided.feedback) {
      const feedback = document.createElement('p');
      feedback.className = `guided-stepcard__feedback guided-stepcard__feedback--${guided.feedback.judgement}`;
      feedback.textContent = guided.feedback.message;
      card.appendChild(feedback);
    }

    root.appendChild(card);
  }

  subscribe(render);
  render();

  return { render };
}

/* ==================================================================== *
 * The completion summary
 * ==================================================================== */

/**
 * Reads the live state of one vessel into the same plain-English shape the
 * rest of the app already uses (properties card, notebook) - name, volume,
 * temperature, pH, and what is physically in it. No new chemistry logic:
 * every value here is already sitting in the container snapshot or in
 * chemicals.json.
 */
function describeContainer(container) {
  const items = container.contents.map((item) => {
    const chemical = engine.getChemical(item.chemicalId);
    const name = chemical ? chemical.name : item.chemicalId;
    return chemical && chemical.state === 'solid' ? `${name} (settled out)` : name;
  });

  return {
    id: container.id,
    contentsText: items.length > 0 ? items.join(', ') : 'empty',
    volumeMl: container.volumeMl,
    temperatureC: container.temperatureC,
    pH: container.pH,
    colorName: container.appearance.colorName,
  };
}

/**
 * Mounts the completion summary - UI.md section 3's "Experiment step
 * detail" modal overlay, shown automatically the moment the last step is
 * done. Same dismissal policy as the properties card and the molecular
 * views: backdrop click and Escape both close it, because reviewing your
 * own results is a voluntary look, not a warning that can be missed.
 */
export function mountGuidedSummary({ root, getState, dispatch, subscribe }) {
  let shown = false;
  let returnFocusTo = null;

  function render() {
    const state = getState();
    const visible = state.mode === 'guided' && state.guided && state.guided.status === 'complete' && state.guided.summaryVisible;

    if (!visible) {
      if (shown) close();
      return;
    }
    if (shown) return;
    open(state);
  }

  function open(state) {
    shown = true;
    returnFocusTo = document.activeElement;

    root.innerHTML = '';
    root.appendChild(buildOverlay(state));
    root.hidden = false;

    const closeButton = root.querySelector('.guided-summary-panel__close');
    if (closeButton) closeButton.focus();

    document.addEventListener('keydown', onKeyDown, true);
  }

  function close() {
    shown = false;
    root.innerHTML = '';
    root.hidden = true;
    document.removeEventListener('keydown', onKeyDown, true);

    if (returnFocusTo && typeof returnFocusTo.focus === 'function' && returnFocusTo.isConnected) {
      returnFocusTo.focus();
    }
    returnFocusTo = null;
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch.dismissGuidedSummary();
    }
  }

  function buildOverlay(state) {
    const guided = state.guided;

    const overlay = document.createElement('div');
    overlay.className = 'guided-summary-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'guided-summary-title');

    const backdrop = document.createElement('div');
    backdrop.className = 'guided-summary-backdrop';
    backdrop.addEventListener('click', () => dispatch.dismissGuidedSummary());
    overlay.appendChild(backdrop);

    const panel = document.createElement('div');
    panel.className = 'guided-summary-panel';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'guided-summary-panel__close';
    closeButton.textContent = 'Close';
    closeButton.setAttribute('aria-label', 'Close experiment summary');
    closeButton.addEventListener('click', () => dispatch.dismissGuidedSummary());
    panel.appendChild(closeButton);

    const title = document.createElement('h2');
    title.id = 'guided-summary-title';
    title.className = 'guided-summary-panel__title';
    title.textContent = `${guided.title} — complete`;
    panel.appendChild(title);

    const columns = document.createElement('div');
    columns.className = 'guided-summary-panel__columns';

    const expectedColumn = document.createElement('div');
    expectedColumn.className = 'guided-summary-panel__column';
    const expectedHeading = document.createElement('h3');
    expectedHeading.textContent = 'What was expected';
    expectedColumn.appendChild(expectedHeading);

    const expectedList = document.createElement('dl');
    expectedList.className = 'guided-summary-panel__facts';
    for (const [key, value] of Object.entries(guided.expectedResult || {})) {
      const dt = document.createElement('dt');
      dt.textContent = humaniseKey(key);
      const dd = document.createElement('dd');
      dd.textContent = formatExpectedValue(key, value);
      expectedList.append(dt, dd);
    }
    expectedColumn.appendChild(expectedList);
    columns.appendChild(expectedColumn);

    const actualColumn = document.createElement('div');
    actualColumn.className = 'guided-summary-panel__column';
    const actualHeading = document.createElement('h3');
    actualHeading.textContent = 'What your bench shows now';
    actualColumn.appendChild(actualHeading);

    const nonEmpty = state.containers.filter((container) => container.contents.length > 0);
    if (nonEmpty.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'The bench is empty.';
      actualColumn.appendChild(empty);
    }
    for (const container of nonEmpty) {
      const described = describeContainer(container);
      const vesselHeading = document.createElement('p');
      vesselHeading.className = 'guided-summary-panel__vessel';
      vesselHeading.textContent = container.id;
      actualColumn.appendChild(vesselHeading);

      const list = document.createElement('dl');
      list.className = 'guided-summary-panel__facts';
      const rows = [
        ['Contents', described.contentsText],
        ['Volume', `${described.volumeMl} mL`],
        ['Temperature', `${described.temperatureC} °C`],
        ['pH', described.pH === null ? 'not known for this mixture' : described.pH],
        ['Colour', described.colorName || 'not recorded'],
      ];
      for (const [label, value] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = String(value);
        list.append(dt, dd);
      }
      actualColumn.appendChild(list);
    }
    columns.appendChild(actualColumn);

    panel.appendChild(columns);

    // A human — student or teacher — makes the actual comparison; see the
    // file header on why nothing here computes a verdict.
    const note = document.createElement('p');
    note.className = 'guided-summary-panel__note';
    note.textContent = 'Compare the two columns yourself - nothing here is auto-marked.';
    panel.appendChild(note);

    overlay.appendChild(panel);
    return overlay;
  }

  root.hidden = true;
  subscribe(render);
  render();

  return { render };
}

export default { mountGuidedBar, mountGuidedStepCard, mountGuidedSummary };

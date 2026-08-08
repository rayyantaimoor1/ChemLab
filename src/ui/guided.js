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

/** How each experiment's own "level" field is printed - "fsc"/"bs" keep
 *  their real capitalisation rather than being lowercased along with the
 *  rest of the option text. */
const LEVEL_LABEL = { matric: 'matric', fsc: 'FSc', bs: 'BS' };

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

    const isGuided = state.mode === 'guided' && !!state.guided;

    // A static "MODE" caption and the value that changes, as two separate
    // elements rather than one combined string - the experiment's own
    // title belongs on the step card below, not folded into this label.
    const modeGroup = document.createElement('span');
    modeGroup.className = 'guided-bar__mode-group';
    const modeCaption = document.createElement('span');
    modeCaption.className = 'guided-bar__mode-caption';
    modeCaption.textContent = 'MODE';
    const modeValue = document.createElement('span');
    modeValue.className = 'guided-bar__mode-value';
    modeValue.textContent = isGuided ? 'Guided' : 'Free Lab';
    modeGroup.append(modeCaption, modeValue);
    root.appendChild(modeGroup);

    const picker = document.createElement('select');
    picker.className = 'guided-bar__picker';
    picker.setAttribute('aria-label', 'Choose an experiment');

    const freeOption = document.createElement('option');
    freeOption.value = '';
    freeOption.textContent = 'Free Lab';
    picker.appendChild(freeOption);

    for (const experiment of state.experiments) {
      const option = document.createElement('option');
      option.value = experiment.id;
      option.textContent = `${experiment.title} (${LEVEL_LABEL[experiment.level] || experiment.level})`;
      picker.appendChild(option);
    }

    picker.value = isGuided ? state.guided.experimentId : '';

    picker.addEventListener('change', () => {
      if (picker.value === '') {
        dispatch.stopExperiment();
      } else {
        dispatch.startExperiment(picker.value);
      }
    });

    root.appendChild(picker);

    if (isGuided) {
      const leaveButton = document.createElement('button');
      leaveButton.type = 'button';
      leaveButton.className = 'guided-bar__leave';
      leaveButton.textContent = 'Leave guided mode';
      leaveButton.addEventListener('click', () => dispatch.stopExperiment());
      root.appendChild(leaveButton);
    }
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
// Judgements experiments.js can return (see JUDGEMENT in experiments.js).
// Grouped into "the student is on track" vs "that was not the step" for the
// feedback strip's colour - never the hazard red UI.md section 4 reserves
// exclusively for danger, just a green/amber distinction, matching the
// mockup's own kind:'ok'/'wrong' split.
const ON_TRACK_JUDGEMENTS = new Set(['correct', 'ahead', 'repeat']);

export function mountGuidedStepCard({ root, getState, dispatch, subscribe }) {
  // Whether the hint disclosure is open, and which step it was opened on -
  // kept outside render() since render() rebuilds the DOM from scratch each
  // time and a plain <button> toggle has nowhere else to remember its own
  // state. Reset the moment the step changes, so a hint left open on step 2
  // does not stay open on step 3.
  let hintOpen = false;
  let hintOpenForStepKey = null;

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
    const stepKey = `${guided.experimentId}:${guided.stepIndex}`;
    if (stepKey !== hintOpenForStepKey) {
      hintOpen = false;
      hintOpenForStepKey = stepKey;
    }

    const card = document.createElement('div');
    card.className = 'guided-stepcard';

    // The header band: step label + title on the left, the hint toggle and
    // leave button on the right - one row, matching the mockup's own
    // distinct header strip rather than three stacked lines.
    const header = document.createElement('div');
    header.className = 'guided-stepcard__header';

    const heading = document.createElement('div');
    heading.className = 'guided-stepcard__heading';
    const progressText = document.createElement('span');
    progressText.className = 'guided-stepcard__progress';
    progressText.textContent = `STEP ${guided.stepIndex + 1} / ${guided.totalSteps}`;
    const titleText = document.createElement('span');
    titleText.className = 'guided-stepcard__title';
    titleText.textContent = guided.title;
    heading.append(progressText, titleText);
    header.appendChild(heading);

    const headerControls = document.createElement('div');
    headerControls.className = 'guided-stepcard__header-controls';

    if (guided.hint) {
      const hintToggle = document.createElement('button');
      hintToggle.type = 'button';
      hintToggle.className = 'guided-stepcard__hint-toggle';
      hintToggle.textContent = hintOpen ? 'Hide hint' : 'Show hint';
      hintToggle.addEventListener('click', () => {
        hintOpen = !hintOpen;
        render();
      });
      headerControls.appendChild(hintToggle);
    }

    const leaveButton = document.createElement('button');
    leaveButton.type = 'button';
    leaveButton.className = 'guided-stepcard__leave';
    leaveButton.textContent = '×';
    leaveButton.setAttribute('aria-label', 'Leave guided mode');
    leaveButton.addEventListener('click', () => dispatch.stopExperiment());
    headerControls.appendChild(leaveButton);

    header.appendChild(headerControls);
    card.appendChild(header);

    // Segmented progress - one pip per step, not a continuous bar, so
    // "how far through" reads as discrete steps the way the instruction
    // above it does.
    const pips = document.createElement('div');
    pips.className = 'guided-progress';
    pips.setAttribute('role', 'progressbar');
    pips.setAttribute('aria-valuemin', '0');
    pips.setAttribute('aria-valuemax', String(guided.totalSteps));
    pips.setAttribute('aria-valuenow', String(guided.stepIndex));
    for (let i = 0; i < guided.totalSteps; i += 1) {
      const pip = document.createElement('span');
      pip.className = 'guided-progress__pip';
      if (i < guided.stepIndex) pip.classList.add('guided-progress__pip--done');
      else if (i === guided.stepIndex) pip.classList.add('guided-progress__pip--current');
      pips.appendChild(pip);
    }
    card.appendChild(pips);

    const instruction = document.createElement('p');
    instruction.className = 'guided-stepcard__instruction';
    instruction.textContent = guided.instruction;
    card.appendChild(instruction);

    if (guided.hint && hintOpen) {
      const hintText = document.createElement('p');
      hintText.className = 'guided-stepcard__hint';
      hintText.textContent = guided.hint;
      card.appendChild(hintText);
    }

    if (guided.feedback) {
      const onTrack = ON_TRACK_JUDGEMENTS.has(guided.feedback.judgement);
      const feedback = document.createElement('p');
      feedback.className = `guided-stepcard__feedback guided-stepcard__feedback--${onTrack ? 'ok' : 'wrong'}`;
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

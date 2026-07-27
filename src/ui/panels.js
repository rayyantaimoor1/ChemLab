/**
 * panels.js — the panels from UI.md section 7's component inventory. Two so
 * far: the lab notebook (mountPanels) and the hazard alert
 * (mountHazardAlert).
 *
 * The notebook panel shows the automatic plain-English log plus
 * recordObservation and revealReference for the compare-with-reference
 * feature (UI.md sections 1 and 4). It reads state.notebook exactly as
 * notebook.js produced it and dispatches the two fixed names UI.md section 1
 * gives - recordObservation(text) and revealReference(notebookEntryId). It
 * never decides whether an observation is right; notebook.js already worked
 * that out (as a rough steer, not a grade - see notebook.js's file header)
 * before this ever renders it.
 *
 * Both subscribe to the same live-update mechanism bench.js uses, so they
 * react the moment an action happens, with no page reload.
 */

import { flashHazardEdge, shakeElement } from './effects.js';

export function mountPanels({ root, getState, dispatch, subscribe }) {
  function render() {
    const state = getState();
    root.innerHTML = '';

    const heading = document.createElement('h2');
    heading.textContent = 'Lab notebook';
    root.appendChild(heading);

    root.appendChild(renderEntries(state.notebook));
    root.appendChild(renderObservationForm());
    root.appendChild(renderEstimateForm(state));
  }

  function renderEntries(entries) {
    const list = document.createElement('ol');
    list.className = 'notebook-entries';

    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'notebook-empty';
      empty.textContent = 'Nothing recorded yet. Do something on the bench.';
      list.appendChild(empty);
      return list;
    }

    for (const entry of entries) {
      list.appendChild(renderEntry(entry));
    }
    return list;
  }

  function renderEntry(entry) {
    const li = document.createElement('li');
    li.className = `notebook-entry notebook-entry--${entry.type}`;

    const time = document.createElement('time');
    time.textContent = new Date(entry.timestamp).toLocaleTimeString();
    li.appendChild(time);

    const text = document.createElement('p');
    text.className = 'notebook-entry__text';
    text.textContent = entry.text;
    li.appendChild(text);

    if (entry.type === 'observation') {
      li.appendChild(renderComparison(entry));
    }

    return li;
  }

  function renderComparison(entry) {
    const wrapper = document.createElement('div');
    wrapper.className = 'notebook-entry__compare';

    if (!entry.revealed) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Compare with reference';
      button.addEventListener('click', () => dispatch.revealReference(entry.id));
      wrapper.appendChild(button);
      return wrapper;
    }

    const isNumeric = typeof entry.measured === 'number';
    const unit = entry.unit ? ` ${entry.unit}` : '';

    // The two values side by side. UI.md section 4 calls this the app's most
    // valuable teaching moment, so the student's own answer stays on screen
    // next to the real one rather than being replaced by it.
    if (isNumeric) {
      const yours = document.createElement('p');
      yours.className = 'notebook-entry__yours';
      yours.textContent = `Your answer: ${entry.measured}${unit}`;
      wrapper.appendChild(yours);
    }

    const reference = document.createElement('p');
    reference.className = 'notebook-entry__reference';
    if (entry.expected === null) {
      reference.textContent = isNumeric
        ? 'True value: not known for this mixture, so there is nothing to compare against.'
        : 'No reference was captured for this observation (nothing had happened yet when it was written).';
    } else {
      reference.textContent = isNumeric
        ? `True value: ${entry.expected}${unit}`
        : `Reference: ${entry.expected}`;
    }
    wrapper.appendChild(reference);

    if (entry.matched) {
      const rating = document.createElement('p');
      rating.className = `notebook-entry__rating notebook-entry__rating--${entry.matched}`;
      // A numeric comparison against the instrument's own precision can be
      // stated plainly. A text one is only a rough keyword steer, so it is
      // labelled as such rather than dressed up as a verdict - see the
      // header of notebook.js.
      rating.textContent = isNumeric
        ? `Result: ${entry.matched}`
        : `Rough self-check: ${entry.matched}`;
      wrapper.appendChild(rating);
    }

    return wrapper;
  }

  function renderObservationForm() {
    const form = document.createElement('form');
    form.className = 'observation-form';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'What did you observe?';
    input.setAttribute('aria-label', 'Your observation');

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Record';

    form.append(input, submit);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      dispatch.recordObservation(text);
      input.value = '';
      input.focus();
    });

    return form;
  }

  /**
   * The estimate half of compare-with-reference: pick a vessel and an
   * instrument, say what you think it will read, then check.
   *
   * Only tools that give a number are offered. Litmus and the conductivity
   * tester report a colour or a bulb, which cannot be scored against a
   * tolerance, so estimating them numerically would be meaningless.
   */
  function renderEstimateForm(state) {
    const form = document.createElement('form');
    form.className = 'estimate-form';

    const heading = document.createElement('h3');
    heading.textContent = 'Estimate a reading';
    form.appendChild(heading);

    const containerSelect = document.createElement('select');
    containerSelect.setAttribute('aria-label', 'Which container');
    for (const container of state.containers) {
      const option = document.createElement('option');
      option.value = container.id;
      option.textContent = container.id;
      containerSelect.appendChild(option);
    }

    const toolSelect = document.createElement('select');
    toolSelect.setAttribute('aria-label', 'Which measurement');
    const numericTools = state.tools.filter(
      (tool) => tool.quantity === 'pH' || tool.quantity === 'temperature'
    );
    for (const tool of numericTools) {
      const option = document.createElement('option');
      option.value = tool.id;
      option.textContent = tool.name;
      toolSelect.appendChild(option);
    }

    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.placeholder = 'Your estimate';
    input.setAttribute('aria-label', 'Your estimate');

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Record estimate';

    form.append(containerSelect, toolSelect, input, submit);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = Number(input.value);
      if (input.value === '' || !Number.isFinite(value)) return;

      dispatch.recordEstimate({
        containerId: containerSelect.value,
        toolId: toolSelect.value,
        value,
      });
      input.value = '';
      input.focus();
    });

    return form;
  }

  subscribe(render);
  render();

  return { render };
}

/* ==================================================================== *
 * The hazard alert
 * ==================================================================== */

/**
 * Plain words for each severity. The severity is ALWAYS written out, never
 * left to be inferred from how red something looks - see the three-channel
 * rule below.
 */
const SEVERITY_WORDS = {
  low: 'Low severity',
  moderate: 'Moderate severity',
  high: 'High severity',
};

/**
 * A warning triangle, drawn inline so nothing has to be fetched (CLAUDE.md
 * section 2: everything bundled, zero network calls).
 *
 * The shape carries the meaning on its own. A triangle with an exclamation
 * mark reads as "danger" to someone who cannot see the red at all, which is
 * the entire point of UI.md section 5 - roughly 1 in 12 boys has a colour
 * vision deficiency, and lab monitors distort colour badly.
 */
function warningIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '44');
  svg.setAttribute('height', '44');
  svg.setAttribute('class', 'hazard-icon');
  // The adjacent text says the same thing, so this is decorative to a
  // screen reader rather than being announced twice.
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const triangle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  triangle.setAttribute('d', 'M12 2.5 L22.5 21 L1.5 21 Z');
  triangle.setAttribute('fill', '#D0342C');
  triangle.setAttribute('stroke', '#161A19');
  triangle.setAttribute('stroke-width', '1.4');
  triangle.setAttribute('stroke-linejoin', 'round');

  const stem = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  stem.setAttribute('x', '11');
  stem.setAttribute('y', '9');
  stem.setAttribute('width', '2');
  stem.setAttribute('height', '6.5');
  stem.setAttribute('fill', '#FFFFFF');

  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  dot.setAttribute('x', '11');
  dot.setAttribute('y', '17');
  dot.setAttribute('width', '2');
  dot.setAttribute('height', '2');
  dot.setAttribute('fill', '#FFFFFF');

  svg.append(triangle, stem, dot);
  return svg;
}

/** "toxic_heavy_metal" -> "toxic heavy metal". Data-driven, not invented. */
function humaniseType(type) {
  return typeof type === 'string' ? type.replace(/_/g, ' ') : '';
}

/**
 * Mounts the hazard alert overlay.
 *
 * WHAT UI.md ASKS FOR, AND HOW EACH PART IS MET
 * Section 6's motion table: "200ms in. Screen edge flash + shake, then hold
 * the written warning." The flash and shake are effects.js's; the holding is
 * here - this panel has no timer and never dismisses itself.
 *
 * Section 5: "never a red flash alone. Red flash PLUS an icon PLUS a written
 * warning." All three are unconditional here, and none depends on either of
 * the others having worked. If a student has prefers-reduced-motion set, the
 * flash never plays and the icon and the writing still do. If they cannot
 * see red at all, the triangle's shape and every word still land.
 *
 * Section 6's closing rule, on not glorifying the disaster: the panel is
 * deliberately sober. It states what happened, what it does to a person, and
 * what to do instead - in that order, in plain prose, with no scoring, no
 * spectacle and nothing celebratory. The button is an acknowledgement rather
 * than a dismissal, because the point is that the warning was read.
 *
 * @param {object}   options
 * @param {Element}  options.root     where the overlay is mounted
 * @param {Element}  [options.edgeEl] the screen-edge flash element
 * @param {Element}  [options.shakeEl] what to shake (the bench)
 */
export function mountHazardAlert({ root, getState, dispatch, subscribe, edgeEl = null, shakeEl = null }) {
  // The hazard object currently on screen, so a re-render for an unrelated
  // reason does not replay the flash. Compared by identity, which works
  // because reaction data is frozen and handed out as the same object.
  let shownHazard = null;
  let returnFocusTo = null;

  function render() {
    const hazard = getState().activeHazard;

    if (!hazard) {
      if (shownHazard) close();
      return;
    }
    if (hazard === shownHazard) return;
    open(hazard);
  }

  function open(hazard) {
    shownHazard = hazard;
    returnFocusTo = document.activeElement;

    root.innerHTML = '';
    root.appendChild(buildOverlay(hazard));
    root.hidden = false;

    // The "200ms in" from section 6's table. Both are no-ops under
    // prefers-reduced-motion; the panel above is already on screen either way.
    flashHazardEdge(edgeEl);
    shakeElement(shakeEl);

    const acknowledge = root.querySelector('.hazard-panel__acknowledge');
    if (acknowledge) acknowledge.focus();

    document.addEventListener('keydown', onKeyDown, true);
  }

  function close() {
    shownHazard = null;
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
      dispatch.dismissHazard();
    }
  }

  function buildOverlay(hazard) {
    const overlay = document.createElement('div');
    overlay.className = 'hazard-overlay';
    // alertdialog rather than dialog: this interrupts to tell the student
    // something important, and expects an acknowledgement.
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'hazard-title');
    overlay.setAttribute('aria-describedby', 'hazard-warning');

    // Deliberately NOT clickable to dismiss. A stray click on the way back to
    // the bench should not be able to clear a safety warning before it has
    // been read; the button and Escape are both explicit.
    const backdrop = document.createElement('div');
    backdrop.className = 'hazard-backdrop';
    overlay.appendChild(backdrop);

    const panel = document.createElement('div');
    panel.className = 'hazard-panel';

    const head = document.createElement('div');
    head.className = 'hazard-panel__head';
    head.appendChild(warningIcon());

    const labels = document.createElement('div');
    const label = document.createElement('p');
    label.className = 'hazard-panel__label';
    label.textContent = 'HAZARD';
    labels.appendChild(label);

    const severity = document.createElement('p');
    severity.className = 'hazard-panel__severity';
    const severityWords = SEVERITY_WORDS[hazard.severity]
      || (hazard.severity ? `Severity: ${hazard.severity}` : 'Severity not recorded');
    severity.textContent = hazard.type
      ? `${severityWords} · ${humaniseType(hazard.type)}`
      : severityWords;
    labels.appendChild(severity);
    head.appendChild(labels);
    panel.appendChild(head);

    const title = document.createElement('h2');
    title.className = 'hazard-panel__title';
    title.id = 'hazard-title';
    title.textContent = hazard.title || 'Hazard';
    panel.appendChild(title);

    const warning = document.createElement('p');
    warning.className = 'hazard-panel__warning';
    warning.id = 'hazard-warning';
    warning.textContent = hazard.warning || '';
    panel.appendChild(warning);

    // The consequence half of "danger and consequence". CLAUDE.md section 5:
    // hazard entries "present the danger and the correct response". Without
    // this the panel would only frighten; with it, it teaches.
    if (hazard.whatToDoInstead) {
      const adviceHeading = document.createElement('h3');
      adviceHeading.className = 'hazard-panel__advice-heading';
      adviceHeading.textContent = 'What to do instead';
      panel.appendChild(adviceHeading);

      const advice = document.createElement('p');
      advice.className = 'hazard-panel__advice';
      advice.textContent = hazard.whatToDoInstead;
      panel.appendChild(advice);
    }

    const acknowledge = document.createElement('button');
    acknowledge.type = 'button';
    acknowledge.className = 'hazard-panel__acknowledge';
    acknowledge.textContent = 'I understand';
    acknowledge.addEventListener('click', () => dispatch.dismissHazard());
    panel.appendChild(acknowledge);

    overlay.appendChild(panel);
    return overlay;
  }

  root.hidden = true;
  subscribe(render);
  render();

  return { render };
}

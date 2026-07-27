/**
 * panels.js — the lab notebook panel: the automatic plain-English log, plus
 * recordObservation and revealReference for the compare-with-reference
 * feature (UI.md sections 1 and 4).
 *
 * This reads state.notebook exactly as notebook.js produced it and dispatches
 * the two fixed names UI.md section 1 gives - recordObservation(text) and
 * revealReference(notebookEntryId). It never decides whether an observation
 * is right; notebook.js already worked that out (as a rough steer, not a
 * grade - see notebook.js's file header) before this ever renders it.
 *
 * Subscribes to the same live-update mechanism bench.js uses, so a new
 * entry appears the moment an action happens, with no page reload and no
 * separate "refresh notebook" step.
 */

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

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

    const reference = document.createElement('p');
    reference.className = 'notebook-entry__reference';
    reference.textContent = entry.expected
      ? `Reference: ${entry.expected}`
      : 'No reference was captured for this observation (nothing had happened yet when it was written).';
    wrapper.appendChild(reference);

    if (entry.matched) {
      const rating = document.createElement('p');
      rating.className = `notebook-entry__rating notebook-entry__rating--${entry.matched}`;
      // See notebook.js: this is a rough keyword-overlap steer, not a grade.
      rating.textContent = `Rough self-check: ${entry.matched}`;
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

  subscribe(render);
  render();

  return { render };
}

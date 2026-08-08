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
// Same read-only access shelf.js already uses to list reagents (UI.md
// section 1: "the UI may read engine state"). The properties card looks a
// chemical up by id rather than app.js resolving it into state, so this
// stays a plain lookup, not a chemistry decision.
import { engine } from '../core/engine.js';

// Only used to check whether a 3D model exists, so the "View in 3D" button
// can be left out honestly rather than opening a viewer with nothing in it.
import { getMolecule3D } from './molecular3d.js';

// The mockup's own seven-way accent, one colour per tag - never the
// hazard red used decoratively (that stays reserved for the hazard
// alert, UI.md section 4); "warning" earns it here because a hazard
// actually did fire. Tags themselves are worked out in app.js
// (notebookTagFor) from data actions.js/experiments.js already return,
// never guessed here from the entry's text.
const TAG_ACCENT = {
  warning: '#D0342C',
  action: 'rgba(22, 26, 25, 0.22)',
  reaction: '#A8702B',
  observation: '#4C6B7A',
  measurement: 'rgba(22, 26, 25, 0.35)',
  estimate: '#4C6B7A',
  milestone: '#A8702B',
};

// The border accent above is deliberately faint for "action"/"measurement"
// (a quiet line down the margin for the common case), which would be
// unreadable as the tag word's own text colour - so the label text uses a
// solid, legible version of the same hue instead of the accent verbatim.
const TAG_TEXT_COLOR = {
  warning: '#D0342C',
  action: 'var(--ink-60)',
  reaction: '#A8702B',
  observation: '#4C6B7A',
  measurement: 'var(--ink-60)',
  estimate: '#4C6B7A',
  milestone: '#A8702B',
};

const TAG_LABEL = {
  warning: 'warning',
  action: 'action',
  reaction: 'reaction',
  observation: 'your observation',
  measurement: 'measurement',
  estimate: 'your estimate',
  milestone: 'guided',
};

export function mountPanels({ root, getState, dispatch, subscribe }) {
  function render() {
    const state = getState();
    root.innerHTML = '';

    const headingRow = document.createElement('div');
    headingRow.className = 'notebook-heading-row';
    const heading = document.createElement('h2');
    heading.textContent = 'Lab notebook';
    const count = document.createElement('span');
    count.className = 'notebook-heading-row__count';
    count.textContent = `${state.notebook.length} ${state.notebook.length === 1 ? 'entry' : 'entries'}`;
    headingRow.append(heading, count);
    root.appendChild(headingRow);

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
      empty.textContent =
        'Nothing recorded yet. Take a reagent off the shelf and put it in a vessel — every action you take is written down here.';
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
    li.style.setProperty('--tag-accent', TAG_ACCENT[entry.tag] || TAG_ACCENT.action);
    li.style.setProperty('--tag-text', TAG_TEXT_COLOR[entry.tag] || TAG_TEXT_COLOR.action);

    const metaRow = document.createElement('div');
    metaRow.className = 'notebook-entry__meta';
    const tag = document.createElement('span');
    tag.className = 'notebook-entry__tag';
    tag.textContent = TAG_LABEL[entry.tag] || entry.tag;
    const time = document.createElement('time');
    time.textContent = new Date(entry.timestamp).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    metaRow.append(tag, time);
    li.appendChild(metaRow);

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
      // near-miss carries the pill's own modifier name (matching MATCH.NEAR_MISS
      // exactly, hyphen and all - "match"/"miss" already read fine as classes
      // unmodified).
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

    const headingRow = document.createElement('div');
    headingRow.className = 'estimate-form__heading-row';
    const heading = document.createElement('h3');
    heading.textContent = 'Estimate a reading';
    const subtitle = document.createElement('span');
    subtitle.className = 'estimate-form__subtitle';
    subtitle.textContent = 'guess first, then check';
    headingRow.append(heading, subtitle);
    form.appendChild(headingRow);

    const controls = document.createElement('div');
    controls.className = 'estimate-form__controls';

    const containerSelect = document.createElement('select');
    containerSelect.setAttribute('aria-label', 'Which container');
    for (const container of state.containers) {
      const option = document.createElement('option');
      option.value = container.id;
      option.textContent = `${container.name} — ${container.id}`;
      containerSelect.appendChild(option);
    }

    const toolSelect = document.createElement('select');
    toolSelect.className = 'estimate-form__tool';
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
    input.placeholder = 'Value';
    input.setAttribute('aria-label', 'Your estimate');

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Check';

    controls.append(containerSelect, toolSelect, input, submit);
    form.appendChild(controls);

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
  svg.setAttribute('width', '46');
  svg.setAttribute('height', '46');
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

/* ==================================================================== *
 * The properties card
 * ==================================================================== */

/**
 * Mounts the properties card modal overlay - UI.md section 3's second
 * listed overlay, and section 7's "properties card (name, formula, state,
 * colour name, pH, molar mass, hazards, uses)".
 *
 * WHERE THE 2D STRUCTURE COMES FROM
 * Each chemical's curated `structure` field in chemicals.json points at a
 * static image under src/data/molecules/ - a plain <img>, nothing rendered
 * or computed here. CLAUDE.md section 8's Phase 6 asks for exactly this
 * first ("2D structure images first, 3D ball-and-stick after"); the
 * ball-and-stick view is a separate, later piece of work.
 *
 * "uses" FROM SECTION 7 IS chemicals.json's `description` FIELD
 * There is no separate "uses" field in the schema, and that text already
 * carries usage context ("Used with potassium iodide to show..."), so
 * inventing a second field with overlapping content did not seem worth
 * doing. Rendered under "Description" rather than mislabelled "Uses".
 *
 * WHY A DIFFERENT DISMISSAL POLICY FROM THE HAZARD ALERT
 * The hazard alert refuses to close on a backdrop click, because closing it
 * early could mean a safety warning went unread. There is no equivalent
 * risk here - this is a voluntary look-up, not a warning - so a backdrop
 * click closing it is normal, expected modal behaviour.
 *
 * @param {object}   options
 * @param {Element}  options.root   where the overlay is mounted
 */
export function mountPropertiesCard({ root, getState, dispatch, subscribe }) {
  let shownChemicalId = null;
  let returnFocusTo = null;

  function render() {
    const chemicalId = getState().viewingChemicalId;

    if (!chemicalId) {
      if (shownChemicalId) close();
      return;
    }
    if (chemicalId === shownChemicalId) return;
    open(chemicalId);
  }

  function open(chemicalId) {
    const chemical = engine.getChemical(chemicalId);
    shownChemicalId = chemicalId;
    returnFocusTo = document.activeElement;

    root.innerHTML = '';
    root.appendChild(buildOverlay(chemical, chemicalId));
    root.hidden = false;

    const closeButton = root.querySelector('.properties-panel__close');
    if (closeButton) closeButton.focus();

    document.addEventListener('keydown', onKeyDown, true);
  }

  function close() {
    shownChemicalId = null;
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
      dispatch.closeProperties();
    }
  }

  /** One cell of the two-column facts grid - a caption over a value,
   *  matching the mockup's own spec-sheet layout rather than a label
   *  and value sharing one line. */
  function fact(label, value) {
    if (value === null || value === undefined || value === '') return null;
    const cell = document.createElement('div');
    cell.className = 'properties-panel__fact';
    const term = document.createElement('span');
    term.className = 'properties-panel__fact-label';
    term.textContent = label;
    const val = document.createElement('span');
    val.className = 'properties-panel__fact-value';
    val.textContent = String(value);
    cell.append(term, val);
    return cell;
  }

  /** "matric" -> "Matric", "fsc" -> "FSc", "bs" -> "BS" - the level(s) a
   *  chemical is tagged with, same casing as the topbar's own experiment
   *  picker (guided.js's LEVEL_LABEL). */
  const LEVEL_LABEL = { matric: 'Matric', fsc: 'FSc', bs: 'BS' };
  function levelsText(levels) {
    if (!Array.isArray(levels) || levels.length === 0) return null;
    return levels.map((level) => LEVEL_LABEL[level] || level).join(', ');
  }

  function buildOverlay(chemical, chemicalId) {
    const overlay = document.createElement('div');
    overlay.className = 'properties-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'properties-title');

    const backdrop = document.createElement('div');
    backdrop.className = 'properties-backdrop';
    // Unlike the hazard alert's backdrop, this one IS allowed to close the
    // card - see the file header for why the two overlays differ here.
    backdrop.addEventListener('click', () => dispatch.closeProperties());
    overlay.appendChild(backdrop);

    const panel = document.createElement('div');
    panel.className = 'properties-panel';

    if (!chemical) {
      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'properties-panel__close';
      closeButton.textContent = 'Close';
      closeButton.setAttribute('aria-label', 'Close properties card');
      closeButton.addEventListener('click', () => dispatch.closeProperties());
      panel.appendChild(closeButton);

      const missing = document.createElement('p');
      missing.className = 'properties-panel__missing';
      missing.textContent = `No data found for '${chemicalId}'.`;
      panel.appendChild(missing);
      overlay.appendChild(panel);
      return overlay;
    }

    const body = document.createElement('div');
    body.className = 'properties-panel__body';

    // The sticky header band: a coloured spine swatch, the name, the
    // formula/concentration subtitle, and Close - all in one row, so the
    // card reads as a single instrument label rather than a generic modal
    // with facts stacked underneath a plain title.
    const header = document.createElement('div');
    header.className = 'properties-panel__header';

    const spine = document.createElement('span');
    spine.className = 'properties-panel__spine';
    spine.style.background = chemical.colorHex || '#C9D6DA';
    spine.setAttribute('aria-hidden', 'true');
    header.appendChild(spine);

    const headerText = document.createElement('div');
    headerText.className = 'properties-panel__header-text';
    const title = document.createElement('h2');
    title.id = 'properties-title';
    title.className = 'properties-panel__title';
    title.textContent = chemical.name;
    headerText.appendChild(title);

    const subtitleParts = [chemical.formula, chemical.concentration].filter(Boolean);
    if (subtitleParts.length > 0) {
      const subtitle = document.createElement('p');
      subtitle.className = 'properties-panel__subtitle';
      subtitle.textContent = subtitleParts.join(' · ');
      headerText.appendChild(subtitle);
    }
    header.appendChild(headerText);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'properties-panel__close';
    closeButton.textContent = 'Close';
    closeButton.setAttribute('aria-label', 'Close properties card');
    closeButton.addEventListener('click', () => dispatch.closeProperties());
    header.appendChild(closeButton);

    panel.appendChild(header);

    if (chemical.structure) {
      const figure = document.createElement('figure');
      figure.className = 'properties-panel__structure';
      const img = document.createElement('img');
      // chemicals.json's structure field ("molecules/hcl.svg") is relative
      // to src/data/. An <img src> resolves against the DOCUMENT's URL
      // (src/index.html), not this module's own location, so it needs a
      // "data/" prefix here - "../data/" would be wrong, since that goes
      // above src/ entirely.
      img.src = `data/${chemical.structure}`;
      img.alt = `2D structure of ${chemical.name}`;
      img.width = 160;
      img.height = 120;
      figure.appendChild(img);
      body.appendChild(figure);
    }

    if (getMolecule3D(chemicalId)) {
      const view3D = document.createElement('button');
      view3D.type = 'button';
      view3D.className = 'properties-panel__view-3d';
      view3D.textContent = 'View in 3D';
      view3D.addEventListener('click', () => dispatch.view3DStructure(chemicalId));
      body.appendChild(view3D);
    }

    // A two-column spec-sheet grid - formula/concentration already moved
    // to the header subtitle above, so this list is the rest: state, pH,
    // molar mass, conductivity, solubility, and which level(s) a student
    // would meet this at.
    const facts = document.createElement('div');
    facts.className = 'properties-panel__facts';
    [
      fact('State', chemical.state),
      fact('pH', chemical.pH === null || chemical.pH === undefined ? 'not applicable' : chemical.pH),
      fact('Molar mass', chemical.molarMass != null ? `${chemical.molarMass} g/mol` : null),
      fact('Conductivity', chemical.conductivity),
      fact('Solubility', chemical.solubility),
      fact('Level', levelsText(chemical.levels)),
    ]
      .filter(Boolean)
      .forEach((cell) => facts.appendChild(cell));
    body.appendChild(facts);

    // Colour gets its own highlighted box below the facts grid rather than
    // being one more row in it - section 5: never shown without its name,
    // and here given the same weight as the swatch itself.
    if (chemical.colorName) {
      const colourBox = document.createElement('div');
      colourBox.className = 'properties-panel__colour-box';
      const swatch = document.createElement('span');
      swatch.className = 'properties-panel__swatch';
      swatch.style.background = chemical.colorHex || '#C9D6DA';
      swatch.setAttribute('aria-hidden', 'true');
      colourBox.appendChild(swatch);
      const colourText = document.createElement('div');
      const caption = document.createElement('span');
      caption.className = 'properties-panel__colour-caption';
      caption.textContent = 'Colour';
      const name = document.createElement('span');
      name.className = 'properties-panel__colour-name';
      name.textContent = chemical.colorName;
      colourText.append(caption, name);
      colourBox.appendChild(colourText);
      body.appendChild(colourBox);
    }

    if (chemical.hazards && chemical.hazards.length > 0) {
      const hazardsHeading = document.createElement('h3');
      hazardsHeading.className = 'properties-panel__subheading';
      hazardsHeading.textContent = 'Hazards';
      body.appendChild(hazardsHeading);

      const hazardsText = document.createElement('p');
      hazardsText.className = 'properties-panel__hazards';
      hazardsText.textContent = chemical.hazards.map((h) => h.replace(/_/g, ' ')).join(' · ');
      body.appendChild(hazardsText);
    }

    if (chemical.description) {
      const descHeading = document.createElement('h3');
      descHeading.className = 'properties-panel__subheading';
      descHeading.textContent = 'Description';
      body.appendChild(descHeading);

      const desc = document.createElement('p');
      desc.className = 'properties-panel__description';
      desc.textContent = chemical.description;
      body.appendChild(desc);
    }

    const source = document.createElement('p');
    source.className = 'properties-panel__source';
    source.textContent = `Source: ${chemical.source || 'reaction product — see reactions.json'}`;
    body.appendChild(source);

    panel.appendChild(body);
    overlay.appendChild(panel);
    return overlay;
  }

  root.hidden = true;
  subscribe(render);
  render();

  return { render };
}

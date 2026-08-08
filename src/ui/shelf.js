/**
 * shelf.js — the reagent shelf. Lists what a student can drag onto the bench.
 *
 * This reads the chemical catalog straight from engine.js (the same read-only
 * access UI.md section 1 grants everywhere) so there is only ever one list of
 * chemicals in the app. It decides nothing about chemistry - it just starts a
 * native HTML5 drag carrying the chemical's id; bench.js is what turns a drop
 * into a dispatched addChemical() call.
 *
 * Each bottle also has a small "Properties" button, dispatching
 * viewProperties(chemicalId) to open the modal panels.js builds - the
 * dedicated button exists so viewing a reagent's card does not overload the
 * same click a drag gesture starts from.
 *
 * SEARCH (UI.md section 7 lists one for the shelf)
 * There are getting on for two hundred reagents on the shelf, which is far too
 * many to scroll through to find one bottle. The box at the top matches on
 * name, formula, id and concentration at once, so a student can type either
 * "hcl" or "hydrochloric" and land on the same bottle.
 *
 * Two details that matter more than they look:
 *   - Every term has to match, so "sodium chloride" narrows rather than
 *     widening the way a plain "any word" search would.
 *   - "sulphuric" and "sulfuric" both work. Pakistani textbooks use the
 *     British spelling and the data files use the international one, so
 *     without this the commonest acid in the app would be unfindable by the
 *     spelling most students have been taught.
 *
 * The bottles are built once and then shown or hidden. Rebuilding the list on
 * every keystroke would rebuild ~180 elements and re-attach their listeners
 * for each letter typed, which is exactly the sort of thing CLAUDE.md
 * section 9's performance budget is there to prevent on integrated graphics.
 *
 * LEVEL AND CATEGORY (the other two filters UI.md section 7 asks for)
 * Both read curated fields and neither works anything out for itself. The
 * level comes from each chemical's "levels" array, so a Matric student can
 * hide the university reagents. The category comes from the "category" field
 * added for this purpose - a shelf drawer label rather than a claim about
 * chemistry, and curated because deducing "is this an acid" from a formula is
 * the sort of guessing CLAUDE.md section 6.1 rules out.
 *
 * The three filters are ANDed: whatever is typed narrows further within the
 * level and category chosen, and the count under the box always says how many
 * bottles survived all three.
 */

import { engine } from '../core/engine.js';

/** The levels a chemical can be tagged with, coarsest first. */
const LEVELS = [
  { value: 'all', label: 'All' },
  { value: 'matric', label: 'Matric' },
  { value: 'fsc', label: 'FSc' },
  { value: 'bs', label: 'BS' },
];

/**
 * Shelf drawers, in the order they are offered. The wording is what a student
 * would look for rather than what a chemist would file under - "Test reagents"
 * rather than "analytical reagents", and "Made materials" for the alloys,
 * plastics and ceramics.
 *
 * Only drawers that actually hold a reagent are offered, worked out from the
 * data below. Most coordination complexes, for instance, are things a student
 * MAKES rather than takes off a shelf, so that drawer is thin here and would
 * be an empty dead end on a shelf that happened to stock none of them.
 */
const CATEGORY_LABELS = [
  ['acid', 'Acids'],
  ['base', 'Bases and alkalis'],
  ['salt', 'Salts'],
  ['oxide', 'Oxides'],
  ['element', 'Elements'],
  ['organic', 'Organic compounds'],
  ['complex', 'Complexes'],
  ['reagent', 'Test reagents'],
  ['material', 'Made materials'],
  ['other', 'Other'],
];

/**
 * Folds a string into the form both the search box and the bottle labels are
 * compared in. Lower case, and British "sulph-" spellings folded onto the
 * "sulf-" the data files use.
 */
function normalise(text) {
  return String(text || '').toLowerCase().replace(/sulph/g, 'sulf');
}

export function mountShelf({ root, getState, dispatch, subscribe }) {
  root.innerHTML = '';

  const headingRow = document.createElement('div');
  headingRow.className = 'shelf-heading-row';
  const heading = document.createElement('h2');
  heading.textContent = 'Reagent shelf';
  const shelfCount = document.createElement('span');
  shelfCount.className = 'shelf-heading-row__count';
  headingRow.append(heading, shelfCount);
  root.appendChild(headingRow);

  const controls = document.createElement('div');
  controls.className = 'shelf-filters';

  // Level is a row of toggle pills rather than a <select> - with only four
  // values it reads faster as buttons a student can see all of at once, and
  // it is the filter used most often (a Matric student sets it once and
  // leaves it), so it earns the more prominent control.
  const levelRow = document.createElement('div');
  levelRow.className = 'shelf-filters__levels';
  let currentLevel = 'all';
  const levelButtons = LEVELS.map(({ value, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shelf-level';
    button.textContent = label;
    button.setAttribute('aria-pressed', String(value === currentLevel));
    button.addEventListener('click', () => {
      currentLevel = value;
      for (const other of levelRow.querySelectorAll('.shelf-level')) {
        other.classList.toggle('shelf-level--active', other === button);
        other.setAttribute('aria-pressed', String(other === button));
      }
      applyFilter();
    });
    levelRow.appendChild(button);
    return button;
  });
  levelButtons[0].classList.add('shelf-level--active');
  controls.appendChild(levelRow);

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'shelf-search';
  search.placeholder = 'Search name or formula…';
  search.setAttribute('aria-label', 'Search reagents by name or formula');
  controls.appendChild(search);

  // Reagents only. chemicals.json also describes what reactions PRODUCE
  // (precipitates, gases, salts in solution) and those are not things a
  // student can take off the shelf - see engine.getShelfChemicals.
  const chemicals = engine.getShelfChemicals();

  const stocked = new Set(chemicals.map((chemical) => chemical.category));
  const categoryOptions = [
    { value: 'all', label: 'All kinds' },
    ...CATEGORY_LABELS
      .filter(([value]) => stocked.has(value))
      .map(([value, label]) => ({ value, label })),
  ];

  const categorySelect = document.createElement('select');
  categorySelect.className = 'shelf-filter';
  categorySelect.setAttribute('aria-label', 'Filter reagents by kind');
  for (const option of categoryOptions) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    categorySelect.appendChild(element);
  }
  controls.appendChild(categorySelect);
  root.appendChild(controls);

  // Screen readers get told how many bottles are left after each keystroke,
  // via the same count shown beside the "Reagent shelf" heading - this is
  // polite rather than assertive.
  shelfCount.setAttribute('role', 'status');
  shelfCount.setAttribute('aria-live', 'polite');

  // DISPENSE: Ask amount (the long-standing default - opens the amount
  // panel every time, and the only way to add a solid's exact grams) or
  // Auto-pour (skips straight to adding a fixed quickAmount of mL, for a
  // student repeating the same addition). Purely a convenience toggle over
  // bench.js's own openAmountModal/quickDispense - see app.js's
  // dispenseMode/quickAmount.
  const dispenseRow = document.createElement('div');
  dispenseRow.className = 'shelf-dispense';

  const dispenseLabel = document.createElement('span');
  dispenseLabel.className = 'shelf-dispense__label';
  dispenseLabel.textContent = 'Dispense';
  dispenseRow.appendChild(dispenseLabel);

  const askButton = document.createElement('button');
  askButton.type = 'button';
  askButton.className = 'shelf-dispense__mode';
  askButton.textContent = 'Ask amount';
  const quickButton = document.createElement('button');
  quickButton.type = 'button';
  quickButton.className = 'shelf-dispense__mode';
  quickButton.textContent = 'Auto-pour';
  askButton.addEventListener('click', () => dispatch.setDispenseMode('ask'));
  quickButton.addEventListener('click', () => dispatch.setDispenseMode('quick'));
  dispenseRow.append(askButton, quickButton);

  const quickStepper = document.createElement('div');
  quickStepper.className = 'shelf-dispense__stepper';
  const quickMinus = document.createElement('button');
  quickMinus.type = 'button';
  quickMinus.textContent = '−';
  quickMinus.setAttribute('aria-label', 'Decrease the auto-pour amount');
  const quickValue = document.createElement('span');
  const quickPlus = document.createElement('button');
  quickPlus.type = 'button';
  quickPlus.textContent = '+';
  quickPlus.setAttribute('aria-label', 'Increase the auto-pour amount');
  quickMinus.addEventListener('click', () => dispatch.setQuickAmount(getState().quickAmount - 5));
  quickPlus.addEventListener('click', () => dispatch.setQuickAmount(getState().quickAmount + 5));
  quickStepper.append(quickMinus, quickValue, quickPlus);
  dispenseRow.appendChild(quickStepper);

  root.appendChild(dispenseRow);

  function renderDispenseRow() {
    const state = getState();
    askButton.classList.toggle('shelf-dispense__mode--active', state.dispenseMode === 'ask');
    quickButton.classList.toggle('shelf-dispense__mode--active', state.dispenseMode === 'quick');
    quickStepper.hidden = state.dispenseMode !== 'quick';
    quickValue.textContent = `${state.quickAmount} mL`;
  }

  const list = document.createElement('ul');
  list.className = 'shelf-list';

  const bottles = [];

  for (const chemical of chemicals) {
    const item = document.createElement('li');
    item.className = 'reagent-bottle';
    item.draggable = true;
    item.dataset.chemicalId = chemical.id;
    item.title = chemical.description || '';
    // A coloured spine down the left edge of the bottle, printed-label
    // style. Decoration on top of the swatch/text below it, never the only
    // signal (UI.md section 5) - the formula and concentration are always
    // there in words underneath.
    item.style.setProperty('--spine', chemical.colorHex || '#C9D6DA');

    const name = document.createElement('span');
    name.className = 'reagent-bottle__name';
    name.textContent = chemical.name;
    item.appendChild(name);

    const meta = document.createElement('span');
    meta.className = 'reagent-bottle__meta';
    const swatch = document.createElement('span');
    swatch.className = 'reagent-bottle__swatch';
    swatch.style.background = chemical.colorHex || '#C9D6DA';
    swatch.setAttribute('aria-hidden', 'true');
    meta.appendChild(swatch);
    // Colour, formula, concentration - in that order, so the word next to
    // the swatch is always the colour it is showing (UI.md section 5: a
    // colour is never shown without its name alongside it).
    meta.append([chemical.colorName, chemical.formula, chemical.concentration].filter(Boolean).join(' · '));
    item.appendChild(meta);

    item.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', chemical.id);
      event.dataTransfer.effectAllowed = 'copy';
    });

    const propertiesButton = document.createElement('button');
    propertiesButton.type = 'button';
    propertiesButton.className = 'reagent-bottle__properties';
    propertiesButton.textContent = 'i';
    propertiesButton.setAttribute('aria-label', `View properties of ${chemical.name}`);
    propertiesButton.addEventListener('click', () => dispatch.viewProperties(chemical.id));
    item.appendChild(propertiesButton);

    // name is kept separately from the full haystack below, for ranking.
    bottles.push({
      item,
      name: normalise(chemical.name),
      levels: Array.isArray(chemical.levels) ? chemical.levels : [],
      category: chemical.category || 'other',
      haystack: normalise([
        chemical.name,
        chemical.formula,
        chemical.id,
        chemical.concentration,
      ].filter(Boolean).join(' ')),
    });

    list.appendChild(item);
  }

  const empty = document.createElement('p');
  empty.className = 'shelf-search__empty';
  empty.hidden = true;
  empty.textContent =
    'Nothing on the shelf matches that. Search by name or formula — HCl, H₂SO₄, sulphuric — or widen the kind and level filters.';

  /**
   * How good a match this is, lowest first. Typing "hcl" matches the formula
   * of several reagents that merely contain hydrochloric acid, so without
   * ranking the bottle a student actually wanted could sit below them.
   */
  function rank(bottle, query) {
    if (bottle.name.startsWith(query)) return 0;
    if (bottle.name.includes(query)) return 1;
    return 2;
  }

  function applyFilter() {
    const query = normalise(search.value).trim();
    const terms = query.split(/\s+/).filter(Boolean);
    const level = currentLevel;
    const category = categorySelect.value;
    const matched = [];
    const rest = [];

    // The kind dropdown's own counts are against the level filter only -
    // "how many of what's on the shelf at this level fall in each drawer" -
    // not the search box, so typing does not make every count flicker.
    const levelMatched = bottles.filter((bottle) => level === 'all' || bottle.levels.includes(level));
    const categoryCounts = new Map();
    for (const bottle of levelMatched) {
      categoryCounts.set(bottle.category, (categoryCounts.get(bottle.category) || 0) + 1);
    }
    for (const option of categorySelect.options) {
      const base = categoryOptions.find((entry) => entry.value === option.value);
      const count = option.value === 'all' ? levelMatched.length : categoryCounts.get(option.value) || 0;
      option.textContent = `${base.label} (${count})`;
    }

    for (const bottle of bottles) {
      // All three filters must pass, and every search term must appear, so
      // each thing the student adds narrows the shelf further.
      const matches =
        (level === 'all' || bottle.levels.includes(level)) &&
        (category === 'all' || bottle.category === category) &&
        terms.every((term) => bottle.haystack.includes(term));
      bottle.item.hidden = !matches;
      (matches ? matched : rest).push(bottle);
    }

    // Stable: bottles of equal rank stay in catalogue order.
    if (terms.length > 0) {
      matched.sort((a, b) => rank(a, query) - rank(b, query));
    }

    // Re-appending moves the existing elements rather than rebuilding them,
    // so every drag and Properties listener stays attached.
    const order = document.createDocumentFragment();
    for (const bottle of [...matched, ...rest]) order.appendChild(bottle.item);
    list.appendChild(order);

    empty.hidden = matched.length > 0;
    // "N on the shelf" with nothing narrowing it down, "N of levelTotal"
    // once the search box or the kind drawer has - the denominator is what
    // the level filter alone leaves, matching the kind dropdown's own
    // counts above.
    const filteringBeyondLevel = terms.length > 0 || category !== 'all';
    shelfCount.textContent = filteringBeyondLevel
      ? `${matched.length} of ${levelMatched.length}`
      : `${levelMatched.length} on the shelf`;
  }

  search.addEventListener('input', applyFilter);
  categorySelect.addEventListener('change', applyFilter);

  // The list scrolls in its own bounded region - nearly 180 bottles would
  // otherwise push the apparatus tray below it far down the page, so a
  // student would have to scroll past every reagent just to reach a
  // beaker. Filters above and apparatus below both stay on screen no
  // matter how far the list itself is scrolled.
  const scrollArea = document.createElement('div');
  scrollArea.className = 'shelf-scroll';
  scrollArea.append(list, empty);
  root.appendChild(scrollArea);

  applyFilter();

  /* ------------------------------------------------------------------ *
   * The apparatus tray: glassware and bench furniture, always visible
   * below the reagent list rather than scrolled away with it. Every
   * button calls straight through to app.js's addVessel / addEquipment -
   * this file does not decide what a beaker or a burner is, it only
   * offers the list app.js's getState() hands it, the same read-only
   * pattern the reagent list above already follows.
   * ------------------------------------------------------------------ */

  const apparatus = document.createElement('div');
  apparatus.className = 'apparatus-tray';

  const apparatusHeading = document.createElement('h3');
  apparatusHeading.textContent = 'Apparatus';
  apparatus.appendChild(apparatusHeading);

  const apparatusGrid = document.createElement('div');
  apparatusGrid.className = 'apparatus-tray__grid';
  apparatus.appendChild(apparatusGrid);

  root.appendChild(apparatus);

  function renderApparatus() {
    const state = getState();
    apparatusGrid.innerHTML = '';

    for (const { type, label } of state.vesselTypes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'apparatus-item';
      button.textContent = `+ ${label}`;
      button.disabled = state.vesselLimitReached;
      button.title = state.vesselLimitReached
        ? 'The bench already holds as much glassware as it can.'
        : `Take a ${label.toLowerCase()} from the tray`;
      button.addEventListener('click', () => dispatch.addVessel(type));
      apparatusGrid.appendChild(button);
    }

    for (const { kind, label } of state.equipmentTypes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'apparatus-item apparatus-item--furniture';
      button.textContent = `+ ${label}`;
      button.disabled = state.equipmentLimitReached;
      button.title = state.equipmentLimitReached
        ? 'The bench already holds as much furniture as it can.'
        : `Set up a ${label.toLowerCase()} on the bench`;
      button.addEventListener('click', () => dispatch.addEquipment(kind));
      apparatusGrid.appendChild(button);
    }
  }

  subscribe(renderApparatus);
  renderApparatus();
  subscribe(renderDispenseRow);
  renderDispenseRow();
}

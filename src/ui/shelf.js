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
  { value: 'all', label: 'All levels' },
  { value: 'matric', label: 'Matric' },
  { value: 'fsc', label: 'FSc' },
  { value: 'bs', label: 'BS' },
];

/**
 * Shelf drawers. The wording is what a student would look for rather than
 * what a chemist would file under - "Test reagents" rather than "analytical
 * reagents", and "Made materials" for the alloys, plastics and ceramics.
 */
const CATEGORIES = [
  { value: 'all', label: 'All kinds' },
  { value: 'acid', label: 'Acids' },
  { value: 'base', label: 'Bases and alkalis' },
  { value: 'salt', label: 'Salts' },
  { value: 'oxide', label: 'Oxides' },
  { value: 'element', label: 'Elements' },
  { value: 'organic', label: 'Organic compounds' },
  { value: 'reagent', label: 'Test reagents' },
  { value: 'material', label: 'Made materials' },
  { value: 'other', label: 'Other' },
];

/**
 * Folds a string into the form both the search box and the bottle labels are
 * compared in. Lower case, and British "sulph-" spellings folded onto the
 * "sulf-" the data files use.
 */
function normalise(text) {
  return String(text || '').toLowerCase().replace(/sulph/g, 'sulf');
}

export function mountShelf({ root, dispatch }) {
  root.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = 'Reagent shelf';
  root.appendChild(heading);

  const controls = document.createElement('div');
  controls.className = 'shelf-filters';

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'shelf-search';
  search.placeholder = 'Search: hcl, hydrochloric…';
  search.setAttribute('aria-label', 'Search reagents by name or formula');
  controls.appendChild(search);

  const dropdowns = document.createElement('div');
  dropdowns.className = 'shelf-filters__row';

  const makeSelect = (options, label) => {
    const select = document.createElement('select');
    select.className = 'shelf-filter';
    select.setAttribute('aria-label', label);
    for (const option of options) {
      const element = document.createElement('option');
      element.value = option.value;
      element.textContent = option.label;
      select.appendChild(element);
    }
    dropdowns.appendChild(select);
    return select;
  };

  const levelSelect = makeSelect(LEVELS, 'Filter reagents by level');
  const categorySelect = makeSelect(CATEGORIES, 'Filter reagents by kind');

  controls.appendChild(dropdowns);
  root.appendChild(controls);

  // Screen readers get told how many bottles are left after each keystroke;
  // sighted students can see it, so this is polite rather than assertive.
  const status = document.createElement('p');
  status.className = 'shelf-search__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  root.appendChild(status);

  const list = document.createElement('ul');
  list.className = 'shelf-list';

  // Reagents only. chemicals.json also describes what reactions produce
  // (precipitates, gases, salts in solution) and those are not things a
  // student can take off the shelf - see engine.getShelfChemicals.
  const chemicals = engine.getShelfChemicals();
  const bottles = [];

  for (const chemical of chemicals) {
    const item = document.createElement('li');
    item.className = 'reagent-bottle';
    item.draggable = true;
    item.dataset.chemicalId = chemical.id;
    item.title = chemical.description || '';

    const name = document.createElement('span');
    name.className = 'reagent-bottle__name';
    name.textContent = chemical.name;
    item.appendChild(name);

    if (chemical.concentration) {
      const concentration = document.createElement('span');
      concentration.className = 'reagent-bottle__concentration';
      concentration.textContent = ` (${chemical.concentration})`;
      item.appendChild(concentration);
    }

    item.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', chemical.id);
      event.dataTransfer.effectAllowed = 'copy';
    });

    const propertiesButton = document.createElement('button');
    propertiesButton.type = 'button';
    propertiesButton.className = 'reagent-bottle__properties';
    propertiesButton.textContent = 'Properties';
    propertiesButton.setAttribute('aria-label', `View properties of ${chemical.name}`);
    propertiesButton.addEventListener('click', () => dispatch.viewProperties(chemical.id));
    item.appendChild(propertiesButton);

    // The formula is searchable but not shown on the bottle, so that typing
    // "h2so4" finds the acid without the label becoming a wall of symbols.
    // The name is kept separately as well, for ranking.
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
    'No reagent matches. Try the formula instead of the name, or widen the level and kind above.';

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
    const level = levelSelect.value;
    const category = categorySelect.value;
    const matched = [];
    const rest = [];

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

    const filtering = terms.length > 0 || level !== 'all' || category !== 'all';
    empty.hidden = matched.length > 0;
    status.textContent = filtering
      ? `${matched.length} of ${chemicals.length} reagents`
      : `${chemicals.length} reagents`;
  }

  search.addEventListener('input', applyFilter);
  levelSelect.addEventListener('change', applyFilter);
  categorySelect.addEventListener('change', applyFilter);

  root.appendChild(list);
  root.appendChild(empty);

  applyFilter();
}

/**
 * shelf.js — the reagent shelf. Lists what a student can drag onto the bench.
 *
 * This reads the chemical catalog straight from engine.js (the same read-only
 * access UI.md section 1 grants everywhere) so there is only ever one list of
 * chemicals in the app. It decides nothing about chemistry - it just starts a
 * native HTML5 drag carrying the chemical's id; bench.js is what turns a drop
 * into a dispatched addChemical() call.
 *
 * No level/type filter yet (UI.md section 7 lists one for later) - every
 * chemical in chemicals.json is shown, unfiltered, for this placeholder.
 */

import { engine } from '../core/engine.js';

export function mountShelf({ root }) {
  root.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = 'Reagent shelf';
  root.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'shelf-list';

  // Reagents only. chemicals.json also describes what reactions produce
  // (precipitates, gases, salts in solution) and those are not things a
  // student can take off the shelf - see engine.getShelfChemicals.
  for (const chemical of engine.getShelfChemicals()) {
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

    list.appendChild(item);
  }

  root.appendChild(list);
}

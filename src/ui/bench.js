/**
 * bench.js — draws the containers on the bench and accepts a reagent dropped
 * from the shelf onto one of them.
 *
 * This module reads container state exactly as UI.md section 1 shapes it and
 * dispatches addChemical(containerId, chemicalId, amountMl) - the fixed name
 * and argument order from that same section. It never works out what adding a
 * chemical does; that answer comes back through getState() after the engine
 * has already decided it.
 *
 * This is a plain placeholder: contents, volume, temperature and pH are shown
 * as plain text, no colour or precipitate rendering yet (see UI.md section 1
 * for the appearance fields this deliberately does not use yet).
 */

export function mountBench({ root, getState, dispatch, subscribe }) {
  function render() {
    const state = getState();
    root.innerHTML = '';

    const heading = document.createElement('h2');
    heading.textContent = 'Bench';
    root.appendChild(heading);

    for (const container of state.containers) {
      root.appendChild(renderContainer(container, state));
    }

    root.appendChild(renderToolTray(state));
  }

  /**
   * The tool tray from UI.md section 3's layout. Picking a tool up and then
   * dipping it is two clicks rather than a drag, which keeps it usable from
   * the keyboard - UI.md section 8 requires full keyboard operation, and drag
   * and drop cannot give that.
   */
  function renderToolTray(state) {
    const tray = document.createElement('section');
    tray.className = 'tool-tray';

    const heading = document.createElement('h3');
    heading.textContent = 'Tool tray';
    tray.appendChild(heading);

    for (const tool of state.tools) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tool';
      button.dataset.toolId = tool.id;
      button.textContent = tool.name;

      const held = state.selectedToolId === tool.id;
      button.classList.toggle('tool--selected', held);
      button.setAttribute('aria-pressed', String(held));

      button.addEventListener('click', () => dispatch.selectTool(tool.id));
      tray.appendChild(button);
    }

    const hint = document.createElement('p');
    hint.className = 'tool-tray__hint';
    hint.textContent = state.selectedToolId
      ? 'Now press Dip on a container.'
      : 'Pick up a tool, then press Dip on a container.';
    tray.appendChild(hint);

    return tray;
  }

  function renderContainer(container, state) {
    const el = document.createElement('div');
    el.className = 'container';
    el.dataset.containerId = container.id;

    const title = document.createElement('h3');
    title.textContent = `${container.type.replace('_', ' ')} — ${container.id}`;
    el.appendChild(title);

    const contentsList = document.createElement('ul');
    contentsList.className = 'container__contents';
    if (container.contents.length === 0) {
      const li = document.createElement('li');
      li.textContent = '(empty)';
      contentsList.appendChild(li);
    } else {
      for (const item of container.contents) {
        const li = document.createElement('li');
        li.textContent = `${item.chemicalId}: ${item.amount === null ? 'present (amount not tracked)' : item.amount}`;
        contentsList.appendChild(li);
      }
    }
    el.appendChild(contentsList);

    const readout = document.createElement('p');
    readout.className = 'container__readout';
    readout.textContent =
      `Volume: ${container.volumeMl} mL` +
      ` · Temp: ${container.temperatureC} °C` +
      ` · pH: ${container.pH === null ? 'unknown' : container.pH}`;
    el.appendChild(readout);

    const dip = document.createElement('button');
    dip.type = 'button';
    dip.className = 'container__dip';
    dip.textContent = 'Dip';
    dip.disabled = !state.selectedToolId;
    dip.title = state.selectedToolId ? 'Dip the tool you are holding' : 'Pick up a tool first';
    dip.addEventListener('click', () => {
      if (!state.selectedToolId) return;
      dispatch.dipTool(state.selectedToolId, container.id);
    });
    el.appendChild(dip);

    el.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      el.classList.add('container--drag-over');
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('container--drag-over');
    });

    el.addEventListener('drop', (event) => {
      event.preventDefault();
      el.classList.remove('container--drag-over');

      const chemicalId = event.dataTransfer.getData('text/plain');
      if (!chemicalId) return;

      // No volume-picker widget yet, so a plain browser prompt stands in for
      // one. Cancelling, or entering anything that is not a positive number,
      // adds nothing.
      const amountText = window.prompt('How much to add (mL, or g for a solid)?', '10');
      if (amountText === null) return;

      const amount = Number(amountText);
      if (!Number.isFinite(amount) || amount <= 0) return;

      dispatch.addChemical(container.id, chemicalId, amount);
    });

    return el;
  }

  subscribe(render);
  render();

  return { render };
}

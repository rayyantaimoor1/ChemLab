/**
 * bench-helpers.mjs — what a student's mouse does, as a script injected
 * into the app's page: press tray buttons, drop reagents on vessels, drag
 * vessels onto furniture. Shared by capture-ui.mjs (the screenshots) and
 * perf-bench.mjs (the performance test), so both build a bench the same way.
 * Nothing here ships in the app.
 */

export const HELPERS = `
  window.__cap = {
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    press(label) {
      const b = [...document.querySelectorAll('button')]
        .find((x) => (x.getAttribute('aria-label') || x.title || x.textContent).toLowerCase().includes(label));
      if (!b) throw new Error('no button: ' + label);
      b.click();
    },
    drop(containerId, chemicalId) {
      const el = document.querySelector('.vessel-object[data-container-id="' + containerId + '"]');
      if (!el) throw new Error('no vessel: ' + containerId);
      const dt = new DataTransfer();
      dt.setData('text/plain', chemicalId);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    },
    // A solid opens the amount panel instead of pouring; press its Dispense.
    async dispense(containerId, chemicalId) {
      this.drop(containerId, chemicalId);
      await this.wait(300);
      const button = [...document.querySelectorAll('.amount-panel button')].find((b) => b.textContent.trim() === 'Dispense');
      if (!button) throw new Error('no amount panel for ' + chemicalId);
      button.click();
    },
    // Adds the same reagent several times, to fill a vessel part-way.
    async fill(containerId, chemicalId, times) {
      for (let i = 0; i < times; i += 1) { this.drop(containerId, chemicalId); await this.wait(250); }
    },
    // Picks a vessel up and lets go of it over another, as the mouse would.
    async dragOnto(fromId, toId) {
      const from = document.querySelector('.vessel-object[data-container-id="' + fromId + '"]');
      const to = document.querySelector('.vessel-object[data-container-id="' + toId + '"] .vessel__glass');
      const a = from.querySelector('.vessel').getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const at = (x, y) => ({ clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true, button: 0 });
      from.dispatchEvent(new PointerEvent('pointerdown', at(a.left + a.width / 2, a.top + 20)));
      for (let k = 1; k <= 6; k += 1) {
        const x = a.left + a.width / 2 + ((b.left + b.width / 2) - (a.left + a.width / 2)) * k / 6;
        const y = a.top + 20 + ((b.top + 10) - (a.top + 20)) * k / 6;
        window.dispatchEvent(new PointerEvent('pointermove', at(x, y)));
        await this.wait(30);
      }
      window.dispatchEvent(new PointerEvent('pointerup', at(b.left + b.width / 2, b.top + 10)));
      await this.wait(300);
    },
    // Sets the auto-pour amount with the shelf's own − and + buttons.
    async setQuick(ml) {
      const value = () => Number.parseFloat(document.querySelector('.shelf-dispense__stepper span').textContent);
      for (let i = 0; i < 20 && value() !== ml; i += 1) {
        this.press(value() > ml ? 'decrease the auto-pour' : 'increase the auto-pour');
        await this.wait(60);
      }
    },
    // Drags a vessel onto the nth piece of bench furniture of a kind.
    async standOn(vesselId, kind, index = 0) {
      const from = document.querySelector('.vessel-object[data-container-id="' + vesselId + '"]');
      const target = document.querySelectorAll('.equipment--' + kind + ' .equipment__art')[index].getBoundingClientRect();
      const a = from.querySelector('.vessel').getBoundingClientRect();
      const at = (x, y) => ({ clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true, button: 0 });
      const x0 = a.left + a.width / 2; const y0 = a.top + 20;
      const x1 = target.left + target.width / 2; const y1 = target.top + 10;
      from.dispatchEvent(new PointerEvent('pointerdown', at(x0, y0)));
      for (let k = 1; k <= 6; k += 1) {
        window.dispatchEvent(new PointerEvent('pointermove', at(x0 + (x1 - x0) * k / 6, y0 + (y1 - y0) * k / 6)));
        await this.wait(30);
      }
      window.dispatchEvent(new PointerEvent('pointerup', at(x1, y1)));
      await this.wait(300);
    },
    // Picks a vessel, as a click on it does, so its control strip shows.
    select(containerId) {
      const el = document.querySelector('.vessel-object[data-container-id="' + containerId + '"]');
      if (!el) throw new Error('no vessel: ' + containerId);
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    },
    dismissHazard() {
      [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'I understand')?.click();
    },
    async settle() {
      await this.wait(400);
      document.getAnimations().forEach((a) => { try { a.finish(); } catch {} });
      await this.wait(200);
    },
  };
`;

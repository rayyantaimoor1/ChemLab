/**
 * keep-focus.js — keyboard focus that survives a redraw (BUILD_UI.md stage
 * UI.10.3).
 *
 * WHY THIS EXISTS
 * Several parts of the screen are rebuilt from scratch whenever anything at
 * all changes: the bench's control strip, the tool tray, the readings, the
 * notebook, the guided-mode bar. While a vessel heats, that is many times a
 * second. A rebuilt button is a brand-new button, so a student working with
 * the keyboard would press Enter on "Heat 2" and find the keyboard's place
 * gone - back to the top of the window - before they could press anything
 * else. A mouse never notices; the keyboard cannot work at all.
 *
 * keepFocus remembers which control had focus inside a part of the screen,
 * lets it be rebuilt, then puts focus back on the same control: matched by
 * its focus key (data-focus-key) or its words, else the one in the same
 * place. The choosing is pickRefocus, which has no DOM, so it is tested in
 * tests/keep-focus.test.js.
 */

export const FOCUSABLE = 'button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])';

/** What identifies a control across a redraw: its focus key, else its words. */
export function focusKey(el) {
  if (el.dataset && el.dataset.focusKey) return el.dataset.focusKey;
  return `${el.tagName}|${el.getAttribute('aria-label') || ''}|${(el.textContent || '').trim()}`;
}

/**
 * Which of the rebuilt controls should get focus back.
 *
 * @param {Array<{key: string, disabled: boolean}>} candidates the new controls, in order
 * @param {string} key    the focused control's key before the redraw
 * @param {number} index  where it was among the old controls
 * @returns {number} an index into candidates, or -1 for none
 */
export function pickRefocus(candidates, key, index) {
  const same = candidates.findIndex((c) => c.key === key && !c.disabled);
  if (same >= 0) return same;
  if (candidates.length === 0) return -1;
  // The control in the same place, or the nearest one after it that can
  // take focus, or the nearest before it.
  const start = Math.min(Math.max(index, 0), candidates.length - 1);
  for (let i = start; i < candidates.length; i += 1) if (!candidates[i].disabled) return i;
  for (let i = start - 1; i >= 0; i -= 1) if (!candidates[i].disabled) return i;
  return -1;
}

/**
 * Runs rebuild(), and if focus was inside host before, puts it back on the
 * matching control afterwards. Returns whatever rebuild returns.
 */
export function keepFocus(host, rebuild) {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (!host || !active || active === host || !host.contains(active)) return rebuild();

  const key = focusKey(active);
  const index = [...host.querySelectorAll(FOCUSABLE)].indexOf(active);
  const result = rebuild();
  // The same element survived the redraw: nothing to do.
  if (host.contains(active)) return result;

  const fresh = [...host.querySelectorAll(FOCUSABLE)];
  const pick = pickRefocus(fresh.map((el) => ({ key: focusKey(el), disabled: !!el.disabled })), key, index);
  if (pick >= 0) fresh[pick].focus({ preventScroll: true });
  return result;
}

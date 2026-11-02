/**
 * notebook-export.js — turns the notebook into plain text a student can
 * keep, print or hand in.
 *
 * WHY PLAIN TEXT
 * It opens on every school computer with nothing installed, prints as it
 * looks, and cannot carry anything but words. The text is exactly what the
 * notebook panel already shows - this file only lays it out on a page. It
 * never adds a judgement of its own; a revealed comparison is copied across
 * with the same "rough steer, not a grade" wording notebook.js insists on.
 */

const RATING_WORDS = {
  match: 'match',
  'near-miss': 'near-miss',
  miss: 'miss',
};

function clock(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function withUnit(value, unit) {
  return unit ? `${value} ${unit}` : `${value}`;
}

/**
 * @param {object[]} entries   state.notebook from app.js's getState()
 * @param {Function} labelFor  (entry) => the tag word the panel shows
 * @param {Date}     [now]
 * @returns {string}
 */
export function formatNotebookForExport(entries, labelFor, now = new Date()) {
  const when = now.toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const lines = [
    'Virtual Chemistry Lab - Lab notebook',
    `Exported ${when}`,
    '',
  ];

  if (entries.length === 0) lines.push('(The notebook is empty.)');

  const indent = ' '.repeat(9);
  for (const entry of entries) {
    lines.push(`[${clock(entry.timestamp)}]  ${labelFor(entry).toUpperCase()}: ${entry.text}`);

    if (entry.type === 'observation' && entry.revealed) {
      const reference = typeof entry.expected === 'number'
        ? withUnit(entry.expected, entry.unit)
        : entry.expected;
      lines.push(`${indent}Reference: ${reference ?? 'no reference available'}`);
      if (entry.matched) {
        const steer = typeof entry.measured === 'number' ? '' : ' (a rough steer, not a grade)';
        lines.push(`${indent}Rating: ${RATING_WORDS[entry.matched] ?? entry.matched}${steer}`);
      }
    }
  }

  // Windows Notepad on older machines only breaks lines on CRLF.
  return `${lines.join('\r\n')}\r\n`;
}

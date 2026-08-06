/**
 * tools.js — the measuring instruments: pH paper, thermometer, litmus paper,
 * a conductivity tester and a flame test wire.
 *
 * WHY THIS FILE EXISTS
 * CLAUDE.md section 7 is blunt about it: "Tools read state, never modify it.
 * Dipping pH paper is a read operation." So every function in here takes a
 * container snapshot and returns a reading. Nothing in this file can change
 * what is in a vessel, and container.snapshot() is frozen, so an attempt to
 * would throw rather than silently succeed.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL
 * UI.md section 5 requires that every colour cue is always paired with its
 * name in text - about 1 in 12 boys has a colour vision deficiency, and lab
 * monitors distort colour badly. So every reading that has a colour carries
 * BOTH colorHex and colorName, always, and the plain-English text names the
 * colour too. There is deliberately no way to get a colour out of this file
 * without its name coming with it.
 *
 * WHERE THE NUMBERS COME FROM
 *   - pH and temperature are read straight off the container. They were
 *     curated by a human (CLAUDE.md section 6.6); this file does not compute
 *     or adjust them.
 *   - The pH-paper and litmus colour scales below are instrument calibration,
 *     not chemistry content: they describe what the paper does, not what a
 *     substance does. That is why they live here and not in a data file.
 *   - Conductivity is read from each chemical's curated "conductivity" field
 *     in chemicals.json. This file will NOT guess whether something conducts
 *     from its state or formula - that would be inventing chemistry, which
 *     section 6.1 forbids. No field, no reading.
 *   - The flame test works the same way, from a curated "flameElements" list
 *     on each chemical and the colours in data/flame-tests.json. It would be
 *     easy to read "NaCl" and deduce sodium; that is guessing from a formula
 *     and this file does not do it. The colours live in a data file rather
 *     than up here beside the pH scale because they are chemistry - what
 *     sodium does - and not instrument calibration like the indicator bands.
 *
 * WHEN THERE IS NO ANSWER, SAY SO
 * Every reading can come back with hasReading: false. A pH meter that reads
 * "no value" is far better than one that confidently reads 6.42 because the
 * code made something up. This happens most often when a vessel holds a
 * mixture nobody has curated a pH for - see container.js's pH rule.
 *
 * NO DOM AND NO FILES. This folder is pure logic.
 */

/** The tools from UI.md section 7's inventory, plus the flame test. */
export const TOOL = {
  PH_PAPER: 'ph_paper',
  THERMOMETER: 'thermometer',
  LITMUS: 'litmus',
  CONDUCTIVITY: 'conductivity',
  FLAME_TEST: 'flame_test',
};

/** What a reading is measuring, used to match an estimate against it. */
export const QUANTITY = {
  PH: 'pH',
  TEMPERATURE: 'temperature',
  ACIDITY: 'acidity',
  CONDUCTIVITY: 'conductivity',
  CATION: 'cation',
};

/**
 * Universal indicator (pH paper) colour scale.
 *
 * Bands are chosen so pH 7 sits squarely in green, the way a real chart
 * reads. Hexes are deliberately saturated and well separated because UI.md
 * section 2 warns that cheap TN lab monitors wash out subtle differences.
 *
 * Note these avoid UI.md section 4's hazard red (#D0342C), which that section
 * reserves exclusively for danger. Indicator red is a chemistry colour, not a
 * warning, so it uses its own hex.
 *
 * Source: standard universal indicator chart, Punjab Curriculum and Textbook
 * Board Chemistry 10 - acids, bases and salts.
 */
const PH_SCALE = [
  { max: 3, colorHex: '#C0392B', colorName: 'red' },
  { max: 5, colorHex: '#E67E22', colorName: 'orange' },
  { max: 6.5, colorHex: '#F1C40F', colorName: 'yellow' },
  { max: 7.5, colorHex: '#27AE60', colorName: 'green' },
  { max: 9, colorHex: '#16A085', colorName: 'blue-green' },
  { max: 11, colorHex: '#2471A3', colorName: 'blue' },
  { max: Infinity, colorHex: '#7D3C98', colorName: 'purple' },
];

/**
 * Litmus paper. Litmus changes over roughly pH 4.5 to 8.3 and is purple in
 * between, which is why it tells you acid from alkali but not how strong.
 *
 * Source: standard litmus transition range, Punjab Curriculum and Textbook
 * Board Chemistry 10.
 */
const LITMUS_ACID_BELOW = 4.5;
const LITMUS_ALKALI_ABOVE = 8.3;

/** How the conductivity tester's bulb behaves, per curated conductivity value. */
const CONDUCTIVITY_READINGS = {
  strong: {
    value: 'strong',
    summary: 'the bulb lit brightly',
    detail: 'The solution contains plenty of free ions, so it conducts well.',
  },
  weak: {
    value: 'weak',
    summary: 'the bulb glowed dimly',
    detail: 'The solution contains only a few free ions, so it conducts poorly.',
  },
  none: {
    value: 'none',
    summary: 'the bulb did not light',
    detail: 'There are almost no free ions to carry a current.',
  },
  metallic: {
    value: 'metallic',
    summary: 'the bulb lit brightly',
    detail: 'A metal conducts through its own free electrons, not through ions in solution.',
  },
};

/** Ranked worst to best, so a mixture reports its best conductor. */
const CONDUCTIVITY_RANK = { none: 0, weak: 1, strong: 2, metallic: 2 };

function bandFor(pH) {
  return PH_SCALE.find((band) => pH < band.max) || PH_SCALE[PH_SCALE.length - 1];
}

/** Every reading has the same shape, so the notebook and UI never special-case. */
function makeReading({
  toolId,
  toolName,
  containerId,
  containerName,
  quantity,
  value = null,
  unit = null,
  colorHex = null,
  colorName = null,
  text,
  note = null,
  tolerance = null,
}) {
  return Object.freeze({
    toolId,
    toolName,
    containerId,
    containerName,
    quantity,
    value,
    unit,
    hasReading: value !== null,
    colorHex,
    colorName,
    text,
    note,
    tolerance,
  });
}

/**
 * How close an estimate has to be to count as right. These are the honest
 * precision of each instrument, not a marking scheme: pH paper genuinely
 * cannot be read closer than about half a unit, and a school thermometer is
 * good to about a degree.
 */
export const TOLERANCE = {
  [QUANTITY.PH]: { match: 0.5, near: 1.5 },
  [QUANTITY.TEMPERATURE]: { match: 2, near: 5 },
};

/**
 * Builds the tool set.
 *
 * @param {object}   [options]
 * @param {Function} [options.getChemical] looks up a chemical record by id.
 *   Pass the engine's getChemical. Without it the conductivity tester has no
 *   curated data to read and will honestly report no reading.
 */
export function createTools({ getChemical = null, getFlameTest = null } = {}) {
  const lookup = (id) => (typeof getChemical === 'function' ? getChemical(id) : null);
  const flameFor = (element) =>
    typeof getFlameTest === 'function' ? getFlameTest(element) : null;

  const definitions = {
    [TOOL.PH_PAPER]: {
      id: TOOL.PH_PAPER,
      name: 'pH paper',
      quantity: QUANTITY.PH,
      read(snapshot) {
        const base = {
          toolId: TOOL.PH_PAPER,
          toolName: 'pH paper',
          containerId: snapshot.id,
          containerName: snapshot.name,
          quantity: QUANTITY.PH,
          tolerance: TOLERANCE[QUANTITY.PH],
        };

        if (snapshot.pH === null) {
          return makeReading({
            ...base,
            text: `pH paper dipped in ${snapshot.name}: no reading available.`,
            note: snapshot.speciesIds.length === 0
              ? 'The vessel is empty.'
              : 'This mixture has no checked pH value in the lab data, so the paper cannot be read honestly.',
          });
        }

        const band = bandFor(snapshot.pH);
        return makeReading({
          ...base,
          value: snapshot.pH,
          colorHex: band.colorHex,
          colorName: band.colorName,
          // The colour is always named in the text as well as carried as a
          // hex, per UI.md section 5 - and "the paper turned red" is what a
          // student actually has to write in a real practical exam.
          text: `pH paper dipped in ${snapshot.name}: the paper turned ${band.colorName}, reading pH ${snapshot.pH}.`,
        });
      },
    },

    [TOOL.THERMOMETER]: {
      id: TOOL.THERMOMETER,
      name: 'Thermometer',
      quantity: QUANTITY.TEMPERATURE,
      read(snapshot) {
        return makeReading({
          toolId: TOOL.THERMOMETER,
          toolName: 'Thermometer',
          containerId: snapshot.id,
          containerName: snapshot.name,
          quantity: QUANTITY.TEMPERATURE,
          value: snapshot.temperatureC,
          unit: '°C',
          tolerance: TOLERANCE[QUANTITY.TEMPERATURE],
          text: `Thermometer placed in ${snapshot.name}: ${snapshot.temperatureC} °C.`,
        });
      },
    },

    [TOOL.LITMUS]: {
      id: TOOL.LITMUS,
      name: 'Litmus paper',
      quantity: QUANTITY.ACIDITY,
      read(snapshot) {
        const base = {
          toolId: TOOL.LITMUS,
          toolName: 'Litmus paper',
          containerId: snapshot.id,
          containerName: snapshot.name,
          quantity: QUANTITY.ACIDITY,
        };

        if (snapshot.pH === null) {
          return makeReading({
            ...base,
            text: `Litmus paper dipped in ${snapshot.name}: no reading available.`,
            note: snapshot.speciesIds.length === 0
              ? 'The vessel is empty.'
              : 'This mixture has no checked pH value in the lab data, so the paper cannot be read honestly.',
          });
        }

        let colorHex;
        let colorName;
        let verdict;
        if (snapshot.pH < LITMUS_ACID_BELOW) {
          colorHex = '#C0392B';
          colorName = 'red';
          verdict = 'the solution is acidic';
        } else if (snapshot.pH > LITMUS_ALKALI_ABOVE) {
          colorHex = '#2471A3';
          colorName = 'blue';
          verdict = 'the solution is alkaline';
        } else {
          colorHex = '#8E44AD';
          colorName = 'purple';
          verdict = 'the solution is close to neutral';
        }

        return makeReading({
          ...base,
          value: colorName,
          colorHex,
          colorName,
          text: `Litmus paper dipped in ${snapshot.name}: the paper turned ${colorName}, so ${verdict}.`,
        });
      },
    },

    [TOOL.CONDUCTIVITY]: {
      id: TOOL.CONDUCTIVITY,
      name: 'Conductivity tester',
      quantity: QUANTITY.CONDUCTIVITY,
      read(snapshot) {
        const base = {
          toolId: TOOL.CONDUCTIVITY,
          toolName: 'Conductivity tester',
          containerId: snapshot.id,
          containerName: snapshot.name,
          quantity: QUANTITY.CONDUCTIVITY,
        };

        if (snapshot.speciesIds.length === 0) {
          return makeReading({
            ...base,
            text: `Conductivity tester placed in ${snapshot.name}: no reading available.`,
            note: 'The vessel is empty.',
          });
        }

        // Take the best conductor present. Aggregating curated values is not
        // the same as inventing one: if a strong electrolyte is in the vessel,
        // the bulb lights, whatever else is in there with it.
        let best = null;
        let unknownPresent = false;
        for (const speciesId of snapshot.speciesIds) {
          const chemical = lookup(speciesId);
          const value = chemical ? chemical.conductivity : null;
          if (!value || !(value in CONDUCTIVITY_RANK)) {
            unknownPresent = true;
            continue;
          }
          if (best === null || CONDUCTIVITY_RANK[value] > CONDUCTIVITY_RANK[best]) best = value;
        }

        if (best === null) {
          return makeReading({
            ...base,
            text: `Conductivity tester placed in ${snapshot.name}: no reading available.`,
            note: 'Nothing in this vessel has a checked conductivity value in the lab data.',
          });
        }

        const reading = CONDUCTIVITY_READINGS[best];
        const caveat = unknownPresent
          ? ' Something else in the vessel has no checked conductivity value, so this reading covers only what is known.'
          : '';

        return makeReading({
          ...base,
          value: reading.value,
          text: `Conductivity tester placed in ${snapshot.name}: ${reading.summary}. ${reading.detail}${caveat}`,
        });
      },
    },

    [TOOL.FLAME_TEST]: {
      id: TOOL.FLAME_TEST,
      name: 'Flame test wire',
      quantity: QUANTITY.CATION,
      read(snapshot) {
        const base = {
          toolId: TOOL.FLAME_TEST,
          toolName: 'Flame test wire',
          containerId: snapshot.id,
          containerName: snapshot.name,
          quantity: QUANTITY.CATION,
        };

        if (snapshot.speciesIds.length === 0) {
          return makeReading({
            ...base,
            text: `Flame test on ${snapshot.name}: no reading available.`,
            note: 'The vessel is empty.',
          });
        }

        // Which cations colour a flame is curated per chemical, exactly as
        // conductivity is. This tool will NOT read a formula and work out that
        // NaCl contains sodium - that is guessing, and CLAUDE.md section 6.1
        // forbids it. No curated flameElements, no reading.
        const found = [];
        for (const speciesId of snapshot.speciesIds) {
          const chemical = lookup(speciesId);
          const elements = Array.isArray(chemical?.flameElements) ? chemical.flameElements : [];
          for (const element of elements) {
            const entry = flameFor(element);
            if (entry && !found.some((f) => f.element === entry.element)) found.push(entry);
          }
        }

        if (found.length === 0) {
          return makeReading({
            ...base,
            text: `Flame test on ${snapshot.name}: the flame stayed its normal blue.`,
            note: 'Nothing in this vessel has a curated flame colour. Most cations give no flame colour at all, so this is a real result rather than missing data — but it only rules out the seven that do.',
          });
        }

        // Sodium's yellow is so intense it genuinely hides everything else,
        // which is why potassium is looked for through blue cobalt glass. That
        // masking is real chemistry a student has to know, so it is reported
        // rather than quietly resolved by picking a winner.
        const sodium = found.find((f) => f.element === 'sodium');
        const masked = sodium ? found.filter((f) => f.element !== 'sodium') : [];

        const name = (f) => `${f.colorName} (${f.element})`;
        let text;
        if (found.length === 1) {
          text = `Flame test on ${snapshot.name}: the flame burned ${found[0].colorName}, which is ${found[0].element}. ${found[0].note}`;
        } else if (masked.length > 0) {
          text =
            `Flame test on ${snapshot.name}: the flame burned ${sodium.colorName} — sodium, and it is swamping ` +
            `${masked.map(name).join(' and ')}. Sodium has to be filtered out with blue cobalt glass before anything else can be seen.`;
        } else {
          text =
            `Flame test on ${snapshot.name}: more than one cation here colours a flame — ` +
            `${found.map(name).join(', ')} — so the colours overlap and the test cannot separate them.`;
        }

        // The reported colour is the one actually dominating the flame.
        const shown = sodium || found[0];
        return makeReading({
          ...base,
          value: found.map((f) => f.element).join('+'),
          colorHex: shown.colorHex,
          colorName: shown.colorName,
          text,
          note: found.length > 1 && masked.length === 0
            ? 'A flame test identifies one cation at a time. Separate the mixture first.'
            : null,
        });
      },
    },
  };

  return {
    /** Every tool, for the UI's tool tray. */
    listTools: () =>
      Object.values(definitions).map(({ id, name, quantity }) => ({ id, name, quantity })),

    getTool: (toolId) => definitions[toolId] || null,

    /**
     * Dips a tool into a vessel and reports what it says. This is a read: it
     * takes the vessel's frozen snapshot and cannot change anything.
     */
    dip(toolId, snapshot) {
      const tool = definitions[toolId];
      if (!tool) throw new Error(`dip: '${toolId}' is not a known tool`);
      if (!snapshot || typeof snapshot.id !== 'string') {
        throw new TypeError('dip() needs a container snapshot');
      }
      return tool.read(snapshot);
    },
  };
}

export default createTools;

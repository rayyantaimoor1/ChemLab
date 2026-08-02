/**
 * container.js — what is inside a beaker, test tube or flask right now.
 *
 * WHY THIS FILE EXISTS
 * A vessel in this app is not "a beaker with blue liquid in it". It is a list of
 * substances, each with an amount, plus three properties of the vessel itself:
 * how full it is, how hot it is, and how acidic it is. That is what CLAUDE.md
 * section 7 requires, and it is what makes real behaviour possible — you cannot
 * work out that acid is left over after the zinc has dissolved if all you stored
 * was "the liquid is colourless".
 *
 * HOW IT SPLITS FROM THE ENGINE
 * This file never decides what reacts with what. It holds state and knows how to
 * change itself when it is told a reaction happened. engine.js decides. Keeping
 * the two apart means the engine can be tested with made-up chemicals, and this
 * file can be tested with no chemistry at all.
 *
 * THE PH RULE IS THE IMPORTANT ONE
 * CLAUDE.md section 6.6 says pH is curated, never computed. So this file will
 * NOT average two pH values together or work out what dilution does. A pH is
 * only ever shown when it came from a human-checked source:
 *
 *   - one solution in the vessel      -> that chemical's pH from chemicals.json
 *   - a reaction just happened        -> that rule's curated resultPH
 *   - anything else (a mixture)       -> null, meaning "we do not know"
 *
 * null is a real, honest answer here. A pH meter that reads "no value" is far
 * better than one that confidently reads 6.42 because the code averaged two
 * numbers that cannot be averaged.
 *
 * NO DOM AND NO FILES. This folder is pure logic.
 */

import { ROOM_TEMPERATURE_C } from './engine.js';

/** How an amount is measured. Liquids are counted in millilitres, solids in grams. */
export const UNIT = {
  ML: 'mL',
  GRAM: 'g',
};

/** States from chemicals.json that behave as a liquid and so take up volume. */
const LIQUID_STATES = new Set(['aqueous', 'liquid']);

/** Where a pH reading came from, so the app can be honest about it. */
export const PH_SOURCE = {
  CHEMICAL: 'chemical',
  REACTION: 'reaction',
  NONE: null,
};

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/**
 * Makes a vessel.
 *
 * @param {object}   [options]
 * @param {string}   [options.id]          something to refer to it by
 * @param {string}   [options.name]        what to call it on screen, e.g. "Beaker"
 * @param {string}   [options.type]        'beaker' | 'test_tube' | 'conical_flask' ...
 * @param {number}   [options.capacityMl]  how much liquid it can hold before it spills
 * @param {number}   [options.tempC]       starting temperature
 * @param {Function} [options.getChemical] looks up a chemical record by id. Pass
 *   the engine's getChemical here. Without it the vessel still works, it just
 *   cannot tell solids from liquids or report a pH.
 */
export function createContainer({
  id = 'container',
  name = 'Beaker',
  type = 'beaker',
  capacityMl = 250,
  tempC = ROOM_TEMPERATURE_C,
  getChemical = null,
} = {}) {
  /** @type {Map<string, {amount: number|null, unit: string}>} */
  const contents = new Map();

  let temperature = tempC;
  let pH = null;
  let pHSource = PH_SOURCE.NONE;
  // What is under the vessel. -1 = standing in an ice bath, 0 = nothing,
  // 1-3 = how high the burner is turned up. One value rather than two,
  // because a flask cannot be in ice and over a flame at the same time and
  // a single setting makes that impossible to express by accident.
  //
  // This file only tracks the setting; it does not change the temperature by
  // itself. Something outside this file (the UI tick loop) is what turns "the
  // burner is on" into an actual temperature rise over time, the same way a
  // real burner does not heat a beaker instantly - and the same way ice takes
  // a few minutes to bring a flask down.
  let heatLevel = 0;
  // Whether a pair of electrodes is dipped in and the power supply is on.
  // Like heatLevel this file only records the switch position - it does not
  // decide what electrolysis produces. engine.js does that, from
  // reactions.json, exactly as it does for every other reaction.
  let electrified = false;

  const lookup = (speciesId) => (typeof getChemical === 'function' ? getChemical(speciesId) : null);

  /** True when this substance takes up room in the vessel as a liquid. */
  function isLiquid(speciesId) {
    const chemical = lookup(speciesId);
    // Anything we have no record for is assumed to be dissolved in the mixture,
    // which is what reaction products usually are.
    if (!chemical) return true;
    return LIQUID_STATES.has(chemical.state);
  }

  function defaultUnitFor(speciesId) {
    return isLiquid(speciesId) ? UNIT.ML : UNIT.GRAM;
  }

  /** Total liquid in the vessel, in millilitres. Solids do not count. */
  function getVolumeMl() {
    let total = 0;
    for (const [speciesId, entry] of contents) {
      if (entry.unit === UNIT.ML && typeof entry.amount === 'number' && isLiquid(speciesId)) {
        total += entry.amount;
      }
    }
    return Math.round(total * 1000) / 1000;
  }

  /**
   * Works out the pH, following the curated-only rule described at the top.
   *
   * Only substances that actually carry a pH are considered, so dropping a piece
   * of zinc into acid leaves the acid's pH showing rather than wiping it out.
   */
  function recalculatePH() {
    const withPH = [];

    for (const speciesId of contents.keys()) {
      const chemical = lookup(speciesId);
      if (chemical && typeof chemical.pH === 'number') withPH.push(chemical.pH);
    }

    if (withPH.length === 1) {
      pH = withPH[0];
      pHSource = PH_SOURCE.CHEMICAL;
      return;
    }

    // Nothing with a pH, or a mixture we have no curated value for. Say so.
    pH = null;
    pHSource = PH_SOURCE.NONE;
  }

  const api = {
    id,
    name,
    type,
    capacityMl,

    /* ---------------------------------------------------------------- *
     * Reading the state. Tools use these and must never change anything
     * (CLAUDE.md section 7).
     * ---------------------------------------------------------------- */

    /** The ids of everything present, sorted — this is what engine.js wants. */
    getSpeciesIds() {
      return [...contents.keys()].sort();
    },

    /** Everything present, with amounts. */
    getContents() {
      return [...contents.entries()]
        .map(([speciesId, entry]) => ({ id: speciesId, amount: entry.amount, unit: entry.unit }))
        .sort((a, b) => a.id.localeCompare(b.id));
    },

    /** How much of one substance is present, or 0 if none. */
    getAmountOf(speciesId) {
      const entry = contents.get(speciesId);
      return entry && typeof entry.amount === 'number' ? entry.amount : 0;
    },

    has: (speciesId) => contents.has(speciesId),
    isEmpty: () => contents.size === 0,

    getVolumeMl,
    getFreeSpaceMl: () => Math.max(0, capacityMl - getVolumeMl()),
    getTemperatureC: () => temperature,

    /** The burner position under this vessel, 0 to 3. */
    getHeatLevel: () => heatLevel,

    /** True whenever the burner is on at all (level 1, 2, or 3). */
    isHeating: () => heatLevel > 0,

    /** True when electrodes are in the vessel and the current is flowing. */
    isElectrified: () => electrified,

    /** The pH, or null when we genuinely do not have a curated value. */
    getPH: () => pH,

    /** Where that pH came from: 'chemical', 'reaction', or null. */
    getPHSource: () => pHSource,

    /**
     * A frozen copy of everything, for measuring tools and for the UI to render.
     * Frozen so that a tool cannot change the vessel by accident, which section 7
     * forbids.
     */
    snapshot() {
      return deepFreeze({
        id,
        name,
        type,
        capacityMl,
        contents: api.getContents(),
        speciesIds: api.getSpeciesIds(),
        volumeMl: getVolumeMl(),
        temperatureC: temperature,
        heatLevel,
        electrified,
        pH,
        pHSource,
      });
    },

    /* ---------------------------------------------------------------- *
     * Changing the state
     * ---------------------------------------------------------------- */

    /**
     * Puts a substance in.
     *
     * Returns a small report rather than throwing, because overflowing a beaker
     * is a normal thing for a student to do and the app should be able to say so.
     *
     * @returns {{added: number, spilled: number, overflowed: boolean, unit: string}}
     */
    add(speciesId, amount = 0, unit = null) {
      if (typeof speciesId !== 'string' || speciesId.length === 0) {
        throw new TypeError('add() needs the id of a substance');
      }
      if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
        throw new TypeError(`add() needs a positive amount, got ${amount}`);
      }

      const useUnit = unit || defaultUnitFor(speciesId);
      let added = amount;
      let spilled = 0;

      // Only liquids can overflow; a solid dropped in simply sits there.
      if (useUnit === UNIT.ML) {
        const room = Math.max(0, capacityMl - getVolumeMl());
        if (amount > room) {
          added = room;
          spilled = Math.round((amount - room) * 1000) / 1000;
        }
      }

      const existing = contents.get(speciesId);
      if (existing && existing.unit === useUnit && typeof existing.amount === 'number') {
        existing.amount = Math.round((existing.amount + added) * 1000) / 1000;
      } else if (existing && existing.amount === null) {
        // It was present in an unmeasured way; now we have a number for it.
        contents.set(speciesId, { amount: added, unit: useUnit });
      } else {
        contents.set(speciesId, { amount: added, unit: useUnit });
      }

      recalculatePH();
      return { added, spilled, overflowed: spilled > 0, unit: useUnit };
    },

    /**
     * Takes some of a substance out. Leaving out the amount removes all of it.
     * @returns {number} how much was actually removed
     */
    remove(speciesId, amount = null) {
      const entry = contents.get(speciesId);
      if (!entry) return 0;

      if (amount === null || entry.amount === null || amount >= entry.amount) {
        const removed = entry.amount ?? 0;
        contents.delete(speciesId);
        recalculatePH();
        return removed;
      }

      entry.amount = Math.round((entry.amount - amount) * 1000) / 1000;
      if (entry.amount <= 0) contents.delete(speciesId);
      recalculatePH();
      return amount;
    },

    /** Tips everything out. Temperature stays as it is — the glass is still warm. */
    empty() {
      contents.clear();
      pH = null;
      pHSource = PH_SOURCE.NONE;
    },

    setTemperatureC(value) {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new TypeError(`setTemperatureC() needs a number, got ${value}`);
      }
      temperature = value;
    },

    /**
     * Sets what is under this vessel: -1 for an ice bath, 0 for nothing,
     * 1 to 3 for the burner turned progressively higher.
     */
    setHeatLevel(level) {
      if (!Number.isInteger(level) || level < -1 || level > 3) {
        throw new RangeError(`setHeatLevel() needs a whole number from -1 to 3, got ${level}`);
      }
      heatLevel = level;
    },

    /** Switches the electrolysis power supply for this vessel on or off. */
    setElectrified(on) {
      if (typeof on !== 'boolean') {
        throw new TypeError(`setElectrified() needs true or false, got ${on}`);
      }
      electrified = on;
    },

    /** Warms or cools the vessel by a set amount. */
    changeTemperatureC(delta) {
      if (typeof delta !== 'number' || Number.isNaN(delta)) {
        throw new TypeError(`changeTemperatureC() needs a number, got ${delta}`);
      }
      temperature = Math.round((temperature + delta) * 100) / 100;
    },

    /**
     * Pours liquid from this vessel into another one.
     *
     * Everything dissolved in the liquid goes across in the same proportion, so
     * pouring half a beaker of salt water moves half the salt too. Solids stay
     * behind, the way a zinc granule stays in the flask when you decant.
     *
     * @returns {{poured: number, spilled: number}}
     */
    pourInto(target, volumeMl = null) {
      if (!target || typeof target.add !== 'function') {
        throw new TypeError('pourInto() needs another container');
      }
      if (target === api) throw new Error('a container cannot be poured into itself');

      const available = getVolumeMl();
      if (available <= 0) return { poured: 0, spilled: 0 };

      const requested = volumeMl === null ? available : Math.min(volumeMl, available);
      if (requested <= 0) return { poured: 0, spilled: 0 };

      const fraction = requested / available;
      let spilled = 0;

      for (const { id: speciesId, amount, unit } of api.getContents()) {
        if (unit !== UNIT.ML || !isLiquid(speciesId) || typeof amount !== 'number') continue;

        const share = Math.round(amount * fraction * 1000) / 1000;
        if (share <= 0) continue;

        const result = target.add(speciesId, share, UNIT.ML);
        spilled += result.spilled;
        api.remove(speciesId, share);
      }

      // The receiving vessel ends up at whichever temperature it was already at
      // unless it was empty, in which case the poured liquid brings its heat.
      recalculatePH();
      return { poured: Math.round(requested * 1000) / 1000, spilled };
    },

    /**
     * Updates the vessel to reflect a reaction that engine.js has already worked
     * out. This file does not decide that a reaction happened; it is told.
     *
     * Reactants are used up and products appear. The liquid volume is carried
     * across unchanged rather than recalculated, because working out the volume
     * of the products from first principles would be inventing chemistry.
     *
     * Temperature and pH come straight from the rule's curated effects.
     *
     * @param {object} reaction a rule from reactions.json
     */
    applyReaction(reaction) {
      if (!reaction || !Array.isArray(reaction.reactants)) {
        throw new TypeError('applyReaction() needs a reaction rule');
      }
      if (reaction.noReaction === true) return;

      const volumeBefore = getVolumeMl();

      for (const reactantId of reaction.reactants) contents.delete(reactantId);

      const products = Array.isArray(reaction.products) ? reaction.products : [];
      const liquidProducts = products.filter((productId) => isLiquid(productId));
      const solidProducts = products.filter((productId) => !isLiquid(productId));

      // Liquid that was used up reappears as the liquid products, shared evenly.
      const volumeAfterReactants = getVolumeMl();
      const freedVolume = Math.max(0, volumeBefore - volumeAfterReactants);
      const sharePerProduct =
        liquidProducts.length > 0 ? Math.round((freedVolume / liquidProducts.length) * 1000) / 1000 : 0;

      for (const productId of liquidProducts) {
        const existing = contents.get(productId);
        const amount =
          existing && typeof existing.amount === 'number'
            ? Math.round((existing.amount + sharePerProduct) * 1000) / 1000
            : sharePerProduct;
        contents.set(productId, { amount, unit: UNIT.ML });
      }

      // A precipitate is recorded as present but not weighed. How much solid
      // forms depends on amounts we do not model, and guessing a mass would be
      // exactly the kind of invented number section 6 rules out.
      for (const productId of solidProducts) {
        contents.set(productId, { amount: null, unit: UNIT.GRAM });
      }

      const effects = reaction.effects || {};

      if (typeof effects.tempDeltaC === 'number' && effects.tempDeltaC !== 0) {
        api.changeTemperatureC(effects.tempDeltaC);
      }

      // Work out pH from what is now present, then let the rule's curated value
      // override it if it has one. The rule always wins, because a human checked it.
      recalculatePH();
      if (typeof effects.resultPH === 'number') {
        pH = effects.resultPH;
        pHSource = PH_SOURCE.REACTION;
      }
    },
  };

  return api;
}

export default createContainer;

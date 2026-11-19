/**
 * appearance.js — what a vessel looks like right now: the colour of its
 * liquid, with its name, and the solid a reaction left in it
 * (BUILD_UI.md stage UI.1).
 *
 * WHY THIS FILE EXISTS
 * The bench draws every vessel from this, and the notebook describes every
 * reaction from the engine. The two must never disagree (BUILD_UI.md's
 * first rule), and before this file they did: a vessel holding two or more
 * substances was always drawn grey and labelled "colour not known", so the
 * blood-red thiocyanate test showed colourless on the bench while the
 * notebook said, correctly, that it turned blood red.
 *
 * HOW A COLOUR IS DECIDED — and never guessed (CLAUDE.md §6)
 *   1. A reaction just ran here, and nothing has been added since: the
 *      reaction's own curated colour (effects.colorToHex), named exactly as
 *      the notebook names it.
 *   2. The vessel holds one substance: that substance's curated colour.
 *   3. The engine's answer for this mixture is "no change", and every
 *      substance in it has the same curated colour: that colour. Two
 *      colourless solutions that do not react stay colourless.
 *   4. Anything else: "colour not known for this mixture". Mixing colours
 *      by arithmetic would be inventing chemistry.
 *
 * THE SOLID
 * The solid shown in a vessel is one a reaction in that vessel produced and
 * that is still there (a later reaction can dissolve or use it). It is a
 * product the data records as a solid; or, for a molten metal or mercury,
 * the liquid product in the reaction's colour; or, where neither exists,
 * the reaction's own curated description and colour (calcium hydroxide
 * that "does not all dissolve" is recorded as dissolved; soot is no
 * product at all). Its kind — precipitate, deposit, liquid, smoke — is the
 * reaction's curated `solidKind`. A solid the student added from the shelf
 * is not drawn as a settled layer: it is a SHELF SOLID, below.
 *
 * SHELF SOLIDS (BUILD_UI.md UI.3.3)
 * A solid the student put in - zinc granules, marble chips, a magnesium
 * ribbon - is listed with its curated `form`, colour and the amount added,
 * so the bench can draw it as what it is. A solid a reaction made is not
 * listed again here; it is already one of the solids above.
 *
 * HOW CLEAR THE LIQUID IS (BUILD_UI.md UI.3.2)
 * Every solution and liquid carries a curated `clarity` (clear, cloudy,
 * milky or opaque). The vessel's liquid is as clear as the LEAST clear
 * liquid in it now: one drop of milky latex makes water milky, and a
 * reaction that leaves only clear products leaves a clear liquid. Solids
 * and gases are not part of it - how a precipitate clouds the liquid is
 * its own curated `texture` (UI.3.4), not this.
 *
 * LIQUIDS THAT DO NOT MIX (BUILD_UI.md UI.3.6)
 * When the rule for what is in the vessel carries a curated `layers` list
 * (CLAUDE.md §5) - tetrachloromethane and water, benzene and bromine water -
 * the vessel's liquid is a stack of layers, lightest on top by the curated
 * densities, each as deep as the volume of its liquid and coloured like the
 * chemical the data says it looks like. Never inferred from solubility.
 *
 * No DOM here, so tests/appearance.test.js can check every reaction.
 */

import { OUTCOME } from '../core/engine.js';

const EMPTY = Object.freeze({
  colorHex: '#EEF3F5',
  colorName: 'colourless',
  clarity: null,
  layers: null,
  shelfSolids: [],
  precipitate: null,
  solids: [],
  bubbling: false,
  smoking: false,
  glowing: false,
});

/** Shown, honestly, for a mixture nothing in the data describes. */
const UNKNOWN_HEX = '#C9D6DA';

const keyOf = (ids) => [...new Set(ids)].sort().join('+');

/**
 * The name of a reaction's colour, found the way the notebook finds it
 * (engine.js colourNameFor): the rule's own products first, then any
 * chemical known by that exact colour. tests/appearance.test.js holds the
 * two in step against the golden notebook sentences.
 */
export function colourNameFor(reaction, engine) {
  const hex = reaction?.effects?.colorToHex;
  if (!hex) return null;
  const wanted = hex.toUpperCase();
  for (const id of reaction.products || []) {
    const product = engine.getChemical(id);
    if (product?.colorHex?.toUpperCase() === wanted && product.colorName) return product.colorName;
  }
  const any = engine.getAllChemicals().find((c) => c.colorHex?.toUpperCase() === wanted && c.colorName);
  return any ? any.colorName : null;
}

/**
 * Remembers what a reaction left in a vessel. Called after every action
 * whose engine result ran at least one step.
 *
 * @param {object|undefined} previous  the vessel's memory before this action
 * @param {object} engineResult        from actions.js
 * @param {string[]} speciesAfter      the vessel's species once it ran
 * @param {object} engine
 * @returns {object} the vessel's new memory
 */
export function rememberReaction(previous, engineResult, speciesAfter, engine) {
  const solids = [...(previous?.solids || [])];
  const add = (entry) => {
    const same = solids.findIndex((s) => (entry.id ? s.id === entry.id : s.description === entry.description));
    if (same >= 0) solids.splice(same, 1);
    solids.push(entry); // most recent last
  };
  let colour = null;

  for (const step of engineResult?.steps || []) {
    const reaction = step.reaction;
    const effects = reaction?.effects || {};
    if (effects.colorToHex) {
      colour = { colorHex: effects.colorToHex, colorName: colourNameFor(reaction, engine) };
    }
    const kind = effects.solidKind || 'precipitate';
    const products = (reaction?.products || []).map((id) => engine.getChemical(id)).filter(Boolean);

    // The solid is a product the data records as a solid...
    const solidProducts = products.filter((c) => c.state === 'solid');
    for (const c of solidProducts) add(solidEntry(c, effects.precipitate ? kind : 'solid'));
    if (!effects.precipitate || solidProducts.length) continue;

    // ...or, for a molten metal or condensing mercury, the liquid product
    // carrying the reaction's colour...
    const liquid = kind === 'liquid'
      && products.find((c) => c.state === 'liquid' && c.colorHex?.toUpperCase() === effects.colorToHex?.toUpperCase());
    if (liquid) {
      add(solidEntry(liquid, kind));
      continue;
    }

    // ...or the reaction's own curated description of it: calcium hydroxide
    // that "does not all dissolve" is recorded as dissolved, and soot is no
    // product at all, but the reaction says what is seen and in what colour.
    add({
      id: null,
      kind,
      colorHex: effects.colorToHex || UNKNOWN_HEX,
      colorName: colourNameFor(reaction, engine),
      name: null,
      description: effects.precipitate,
      whileAllPresent: reaction.products || [],
    });
  }

  return {
    speciesKey: keyOf(speciesAfter),
    colour: colour || (previous?.speciesKey === keyOf(speciesAfter) ? previous.colour : null),
    solids,
  };
}

function solidEntry(chemical, kind) {
  return {
    id: chemical.id,
    kind,
    colorHex: chemical.colorHex,
    colorName: chemical.colorName,
    name: chemical.name,
    description: null,
    density: chemical.density,
    // How it looks - fine, gelatinous, curdy... - curated (UI.3.4).
    texture: chemical.texture || null,
  };
}

/** The word a vessel's label uses for each solidKind (see CLAUDE.md §5). */
const KIND_WORDS = {
  precipitate: 'precipitate',
  deposit: 'deposit',
  coating: 'coating',
  liquid: 'liquid',
  smoke: 'smoke',
  solid: 'solid',
};

/** One line for the vessel's label: "bright yellow precipitate: Lead(II) iodide". */
export function solidLabel(solid) {
  if (!solid) return null;
  const word = KIND_WORDS[solid.kind] || 'solid';
  const what = solid.colorName ? `${solid.colorName} ${word}` : word;
  return solid.name ? `${what}: ${solid.name}` : what;
}

/**
 * What the vessel looks like now.
 *
 * @param {object} snapshot   container.snapshot()
 * @param {object|undefined} memory  from rememberReaction, if any
 * @param {object} engine
 */
export function appearanceFor(snapshot, memory, engine) {
  const species = snapshot.speciesIds;
  if (species.length === 0) return EMPTY;

  const colour = colourFor(species, memory, engine, snapshot);

  // Solids reactions here produced and that are still in the vessel, most
  // recent last. A described solid lasts while everything its reaction made
  // is still there.
  const solids = (memory?.solids || []).filter((s) => (s.id
    ? species.includes(s.id)
    : s.whileAllPresent.every((id) => species.includes(id))));

  const made = new Set(solids.map((s) => s.id).filter(Boolean));
  const amounts = new Map((snapshot.contents || []).map((item) => [item.id ?? item.chemicalId, item.amount]));
  const shelfSolids = species
    .map((id) => engine.getChemical(id))
    .filter((c) => c && c.state === 'solid' && c.form && !made.has(c.id))
    .map((c) => ({
      id: c.id, name: c.name, form: c.form, colorHex: c.colorHex, colorName: c.colorName,
      amount: amounts.get(c.id) ?? null,
    }));

  return {
    ...EMPTY,
    colorHex: colour.colorHex,
    colorName: colour.colorName,
    clarity: clarityFor(species, engine),
    layers: layersFor(species, snapshot, engine),
    shelfSolids,
    precipitate: solids.length ? solids[solids.length - 1] : null,
    solids,
  };
}

/**
 * The layers the liquid separates into, top first, or null when it is one
 * liquid. Only ever from a rule's curated `layers`.
 */
export function layersFor(species, snapshot, engine) {
  if (species.length < 2) return null;
  const answer = engine.resolve(species, {
    log: false,
    tempC: snapshot.temperatureC,
    heating: snapshot.heatLevel > 0,
    electrified: snapshot.electrified,
  });
  const rule = answer.outcome === OUTCOME.NO_REACTION ? answer.reaction : null;
  if (!rule || !Array.isArray(rule.layers)) return null;

  const amounts = new Map((snapshot.contents || []).map((item) => [item.id ?? item.chemicalId, item.amount]));
  const layers = rule.layers.map((layer) => {
    const liquid = engine.getChemical(layer.liquid);
    const look = engine.getChemical(layer.looksLike || layer.liquid) || liquid;
    return {
      liquid: liquid.id,
      name: liquid.name,
      density: liquid.density,
      volumeMl: amounts.get(liquid.id) ?? null,
      colorHex: look.colorHex,
      colorName: look.colorName,
      clarity: look.clarity || 'clear',
    };
  });
  // Lightest on top. A missing amount counts as an equal share.
  return layers.sort((a, b) => a.density - b.density);
}

/** From most to least see-through. */
export const CLARITY_ORDER = ['clear', 'cloudy', 'milky', 'opaque'];

/**
 * The clarity of the liquid in a vessel: that of the least clear solution
 * or liquid in it, or null when it holds no liquid at all (a dry solid, a
 * gas). Always a curated word - a liquid without one counts as clear,
 * which the validator now makes impossible anyway.
 */
export function clarityFor(species, engine) {
  let worst = -1;
  for (const id of species) {
    const chemical = engine.getChemical(id);
    if (!chemical || (chemical.state !== 'aqueous' && chemical.state !== 'liquid')) continue;
    worst = Math.max(worst, Math.max(0, CLARITY_ORDER.indexOf(chemical.clarity)));
  }
  return worst < 0 ? null : CLARITY_ORDER[worst];
}

function colourFor(species, memory, engine, snapshot) {
  // 1. The reaction that made what is in the vessel now.
  if (memory?.colour && memory.speciesKey === keyOf(species)) return memory.colour;

  // 2. One substance.
  if (species.length === 1) {
    const chemical = engine.getChemical(species[0]);
    if (chemical) return { colorHex: chemical.colorHex, colorName: chemical.colorName };
  }

  // 3. A mixture the data says does nothing, all of one colour.
  const chemicals = species.map((id) => engine.getChemical(id));
  const names = new Set(chemicals.map((c) => c?.colorName));
  if (chemicals.every(Boolean) && names.size === 1) {
    const answer = engine.resolve(species, {
      log: false,
      tempC: snapshot.temperatureC,
      heating: snapshot.heatLevel > 0,
      electrified: snapshot.electrified,
    });
    if (answer.outcome === OUTCOME.NO_REACTION) {
      return { colorHex: chemicals[0].colorHex, colorName: chemicals[0].colorName };
    }
  }

  // 4. Honest.
  return { colorHex: UNKNOWN_HEX, colorName: null };
}

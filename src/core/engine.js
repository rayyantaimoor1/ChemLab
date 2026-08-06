/**
 * engine.js — works out what happens when chemicals are combined.
 *
 * WHY THIS FILE EXISTS
 * This is the part of the app that answers one question: "the student has put
 * these substances together — what happens?" It is deliberately the dumbest
 * possible answer to that question. It does not know any chemistry of its own.
 * It only looks things up in reactions.json. If there is no entry, it says so
 * honestly instead of guessing.
 *
 * That rule comes from CLAUDE.md section 6 and it is the most important rule in
 * the project: a confidently wrong result is worse than no result, because this
 * app is used to teach.
 *
 * THREE POSSIBLE ANSWERS, NEVER BLURRED TOGETHER
 *   1. "reaction"     — a rule matched, so run it and report what is observed.
 *   2. "no_reaction"  — a rule exists that says these two genuinely do nothing.
 *                       That is real chemistry and worth teaching.
 *   3. "unknown"      — we have no rule at all. Say so plainly and write the
 *                       combination down so it can be added later.
 *
 * WHAT THIS FILE MUST NEVER DO
 *   - No DOM. No document, no window, no HTML. This folder is pure logic.
 *   - No writing files. If an unknown combination needs saving to disk, this
 *     file just hands it to whoever asked; the Electron main process does the
 *     actual saving. That keeps the engine testable and portable.
 *   - No calculating pH or temperature from scratch. Those numbers are curated
 *     by a human and read straight out of the data files (section 6.6).
 *
 * A NOTE ON "SPECIES" VS "AMOUNTS"
 * This engine works with a plain list of what is present, e.g. ["hcl_1m",
 * "zn_metal"]. It does not track how much of each. Volumes and amounts belong
 * to container.js. This file answers "what happens", the container answers
 * "how much of it".
 */

import chemicalData from '../data/chemicals.json' with { type: 'json' };
import reactionData from '../data/reactions.json' with { type: 'json' };
import flameTestData from '../data/flame-tests.json' with { type: 'json' };

/** The three outcomes from CLAUDE.md section 6.2. Never add a fourth. */
export const OUTCOME = {
  REACTION: 'reaction',
  NO_REACTION: 'no_reaction',
  UNKNOWN: 'unknown',
};

/**
 * Exact wording required by CLAUDE.md section 6.2. These are shown to students,
 * so do not reword them without the project owner agreeing.
 */
export const MESSAGES = {
  NO_REACTION: 'No observable change.',
  UNKNOWN: "This combination isn't available in this version of the lab yet.",
};

/** Ordinary room temperature in degrees Celsius, used when nobody says otherwise. */
export const ROOM_TEMPERATURE_C = 25;

/** Safety limit on cascading reactions, from CLAUDE.md section 7. */
export const DEFAULT_MAX_CASCADE = 10;

/**
 * Stops anything handing out the loaded data from accidentally editing it.
 * The data files are the source of truth and should be read-only at runtime.
 */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/**
 * Puts a list of substance ids into one canonical form: duplicates removed and
 * sorted alphabetically.
 *
 * This is what makes matching order-independent (CLAUDE.md section 7). Dropping
 * acid into base and dropping base into acid are the same mixture, so both must
 * end up looking identical before we go looking for a rule.
 */
export function normaliseSpecies(ids = []) {
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))].sort();
}

/** A single string that stands for one set of substances, e.g. "hcl_1m+naoh_1m". */
export function speciesKey(ids = []) {
  return normaliseSpecies(ids).join('+');
}

/**
 * Checks whether a rule's stated conditions are satisfied right now.
 *
 * CLAUDE.md section 7: "Conditions gate reactions. A rule requiring heat must
 * not fire at room temperature." Returns null when the rule is free to run, or
 * a short reason string when something is holding it back.
 */
function blockingCondition(reaction, state, nameOf = (id) => id) {
  const conditions = reaction.conditions;
  if (!conditions) return null;

  const { requiresHeat, minTempC, maxTempC, catalyst, requiresElectricity } = conditions;

  // A minimum temperature is checked first because it is the more specific test.
  if (typeof minTempC === 'number' && state.tempC < minTempC) {
    return `needs to reach about ${minTempC} °C`;
  }

  // Some reactions are stopped by heat rather than started by it. Diazotisation
  // is the standard example: above about 5 °C the product falls apart faster
  // than it forms, so the ice bath is not a refinement of the method, it IS the
  // method. Modelling that as anything else would teach a student the ice is
  // optional. Checked right after minTempC because the two together describe a
  // temperature WINDOW, and a rule is allowed to carry both.
  if (typeof maxTempC === 'number' && state.tempC > maxTempC) {
    return `needs to be kept below about ${maxTempC} °C`;
  }

  // "Requires heat" with no specific temperature means the student has to
  // actually be heating the container.
  if (requiresHeat === true && typeof minTempC !== 'number' && !state.heating) {
    return 'needs to be heated';
  }

  // Electrolysis. Checked AFTER the temperature tests on purpose: molten
  // sodium chloride needs both, and a student who has not melted it yet
  // should be told to melt it first rather than to switch the power on.
  //
  // This is deliberately NOT modelled as a catalyst. A catalyst speeds up a
  // reaction that would happen anyway; an electric current DRIVES a reaction
  // that otherwise will not go at all. Calling electricity a catalyst would
  // teach a student something plainly wrong, which is what CLAUDE.md
  // section 6 exists to stop.
  if (requiresElectricity === true && !state.electrified) {
    return 'needs an electric current passed through it';
  }

  if (catalyst) {
    const catalystPresent =
      state.species.includes(catalyst) || state.catalysts.includes(catalyst);
    // Naming the catalyst turns a dead end into a next step: "needs a
    // catalyst" leaves a student with nowhere to go, while naming it tells
    // them exactly what to reach for off the shelf. Worded to sit inside
    // resolve()'s "This mixture ___ before anything happens." sentence
    // without reading like a list bolted onto the end of it.
    if (!catalystPresent) return `needs ${nameOf(catalyst)} present as a catalyst`;
  }

  return null;
}

/**
 * Turns the curated "effects" block into one plain-English sentence for the lab
 * notebook (CLAUDE.md section 7: every action produces a notebook entry in plain
 * English).
 *
 * Everything here is read straight from the data file. The engine is only
 * arranging curated facts into a sentence, never inventing an observation.
 */
function describeEffects(reaction, colourNameOf = () => null) {
  const effects = reaction.effects || {};
  const observations = [];

  // A colour change is an observation like any other, and for some reactions it
  // is the ONLY one - the silver mirror aside, a blood-red thiocyanate, a
  // blue-black starch test and a violet biuret test change nothing else at all.
  // Without this the notebook told a student "there was no visible change"
  // about the sharpest colour change in school chemistry.
  //
  // The name is never invented. It is read off whichever curated chemical
  // record carries that exact colour, because UI.md section 5 requires a colour
  // to travel with its name, and section 6 of CLAUDE.md forbids guessing one.
  // If no record names it, we simply say nothing about colour.
  //
  // "Colourless" is deliberately skipped. It is true of most neutralisations
  // and adds nothing to a notebook line; a reaction that leaves the beaker
  // colourless and does nothing else still falls through to the honest
  // "no visible change" sentence at the bottom of this function.
  // Said once, not twice. Most precipitate descriptions already name their own
  // colour ("brick red copper(I) oxide"), and a notebook line reading "The
  // mixture turned brick red. A precipitate formed: brick red copper(I) oxide."
  // is worse than either sentence alone.
  const colourName = effects.colorToHex ? colourNameOf(reaction) : null;
  const alreadySaid =
    colourName && typeof effects.precipitate === 'string'
      ? effects.precipitate.toLowerCase().includes(colourName.toLowerCase())
      : false;

  if (colourName && colourName.toLowerCase() !== 'colourless' && !alreadySaid) {
    observations.push(`The mixture turned ${colourName}.`);
  }

  if (effects.precipitate) {
    observations.push(`A precipitate formed: ${effects.precipitate}.`);
  }

  // The opposite of a precipitate, and just as much an observation. A solid
  // going into solution is the whole result of several reactions here - hot
  // water separating lead chloride from silver chloride, ammonia telling zinc
  // hydroxide from aluminium's, hypo clearing a film - and without this the
  // notebook called them "no visible change" while the beaker went clear.
  //
  // Curated, never inferred. It would be easy to work out that a solid
  // reactant left no solid product and announce a dissolution, and it would be
  // wrong: sulfur burning in oxygen fits that description exactly, and so does
  // sodium skidding about on water. Whether the disappearance of a solid is
  // the thing worth writing down is a judgement about the chemistry, so it
  // lives in reactions.json like every other observation.
  if (effects.dissolves) {
    observations.push(`The solid dissolved: ${effects.dissolves}.`);
  }

  if (effects.gas) {
    observations.push(
      effects.bubbles
        ? `Bubbles of ${effects.gas} gas were given off.`
        : `${effects.gas.charAt(0).toUpperCase()}${effects.gas.slice(1)} gas was given off.`
    );
  } else if (effects.bubbles) {
    observations.push('Bubbles were given off.');
  }

  if (effects.smoke) observations.push('A cloud of smoke or vapour appeared.');

  if (typeof effects.tempDeltaC === 'number' && effects.tempDeltaC !== 0) {
    observations.push(
      effects.tempDeltaC > 0
        ? `The mixture warmed by about ${effects.tempDeltaC} °C.`
        : `The mixture cooled by about ${Math.abs(effects.tempDeltaC)} °C.`
    );
  }

  if (observations.length === 0) {
    observations.push('There was no visible change, but a reaction did take place.');
  }

  return `${reaction.equation ? `${reaction.equation}. ` : ''}${observations.join(' ')}`;
}

/**
 * Builds an engine.
 *
 * Pass your own data in to test it against made-up chemicals; leave the
 * arguments out and it uses the real data files.
 *
 * @param {object}   [options]
 * @param {Array}    [options.chemicals]   chemical records
 * @param {Array}    [options.reactions]   reaction rules
 * @param {number}   [options.maxCascade]  hard cap on chained reactions
 * @param {Function} [options.onUnknownCombination] called when a combination has
 *   no rule at all. This is how the unknown-pair log from CLAUDE.md section 6.3
 *   gets written without this file touching the filesystem itself.
 */
export function createEngine({
  chemicals = chemicalData,
  reactions = reactionData,
  maxCascade = DEFAULT_MAX_CASCADE,
  onUnknownCombination = null,
} = {}) {
  deepFreeze(chemicals);
  deepFreeze(reactions);

  const chemicalsById = new Map(chemicals.map((chemical) => [chemical.id, chemical]));
  const reactionsById = new Map(reactions.map((reaction) => [reaction.id, reaction]));

  // Every rule's reactant list, pre-sorted once so we never re-sort during lookup.
  const rules = reactions.map((reaction) => ({
    reaction,
    reactants: normaliseSpecies(reaction.reactants),
  }));

  // Every colour any curated chemical is known by, indexed by its hex value.
  // This is how describeEffects turns a rule's colorToHex into words WITHOUT
  // inventing a name: the name has to already exist in chemicals.json against
  // that exact colour, or the notebook stays silent about colour.
  const colourNamesByHex = new Map();
  for (const chemical of chemicals) {
    if (!chemical.colorHex || !chemical.colorName) continue;
    const hex = chemical.colorHex.toUpperCase();
    if (!colourNamesByHex.has(hex)) colourNamesByHex.set(hex, chemical.colorName);
  }

  /**
   * The name for the colour a rule says the vessel ends up.
   *
   * A rule's own products are asked first, because they are what the vessel
   * actually now holds - the brick red belongs to the copper(I) oxide that was
   * just made. Only if none of them carries that colour do we fall back to any
   * other chemical known by the same hex, which covers the handful of rules
   * whose colour comes from something they consumed rather than produced.
   */
  function colourNameFor(reaction) {
    const hex = reaction.effects?.colorToHex;
    if (!hex) return null;
    const wanted = hex.toUpperCase();

    for (const id of reaction.products || []) {
      const product = chemicalsById.get(id);
      if (product?.colorHex?.toUpperCase() === wanted && product.colorName) {
        return product.colorName;
      }
    }

    return colourNamesByHex.get(wanted) || null;
  }

  /**
   * The species sets our own rules describe as finished outcomes.
   *
   * When a rule says "Zn + CuSO4 gives ZnSO4 + Cu", the data is asserting
   * that zinc sulfate and copper sitting together IS the end of the story.
   * So if a student stirs the vessel afterwards and we look those two up
   * again, the honest answer is "No observable change" - not "this
   * combination isn't available in this version of the lab yet", which
   * would be telling them our data is missing something it plainly is not.
   *
   * This is not the engine inventing chemistry (section 6.1). The answer
   * comes straight out of reactions.json's own products field; nothing is
   * guessed or approximated. It only ever applies when no rule matched, so
   * a genuine follow-on reaction always still wins - findRule runs first.
   *
   * It also keeps the unknown-combination roadmap (section 6.3) honest.
   * That log is meant to show what students TRIED that we cannot handle;
   * the aftermath of a reaction the app itself produced was never a thing
   * the student tried, and logging it buries the real gaps in noise.
   */
  const settledOutcomes = new Set();
  for (const reaction of reactions) {
    const products = Array.isArray(reaction.products) ? reaction.products : [];
    if (products.length === 0) continue;

    if (products.length > 1) settledOutcomes.add(speciesKey(products));

    // A catalyst is still sitting in the vessel when the reaction finishes -
    // that is the whole point of it. So "the products, plus the catalyst
    // that made them" is just as settled an outcome as the products alone,
    // and has to be recognised as one. Without this, the Contact process
    // ends holding sulfur trioxide and vanadium(V) oxide and the app calls
    // its own finished reaction an unsupported combination.
    const catalyst = reaction.conditions?.catalyst;
    if (catalyst) settledOutcomes.add(speciesKey([...products, catalyst]));
  }

  // Combinations students tried that we have no data for. This is the content
  // roadmap described in CLAUDE.md section 6.3.
  const unknownCombinations = new Map();

  function recordUnknown(species) {
    const key = speciesKey(species);
    const existing = unknownCombinations.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      const entry = { key, species: normaliseSpecies(species), count: 1 };
      unknownCombinations.set(key, entry);
      if (typeof onUnknownCombination === 'function') onUnknownCombination(entry);
    }
  }

  /**
   * Finds the rule that applies to what is currently in the container.
   *
   * A rule matches when everything it needs is present. The container is allowed
   * to hold extra substances that the rule does not mention — that is what makes
   * cascading possible, because after one reaction runs the leftovers are still
   * sitting there alongside the new products.
   *
   * When more than one rule could apply, the one needing the most substances
   * wins, because it is the more specific description of what is in the vessel.
   */
  /** A catalyst's readable name for the "you still need this" message. */
  const catalystName = (id) => chemicalsById.get(id)?.name || id;

  function findRule(species, state) {
    const present = new Set(species);

    const candidates = rules
      .filter(({ reactants }) => reactants.length > 0 && reactants.every((id) => present.has(id)))
      .sort(
        (a, b) =>
          b.reactants.length - a.reactants.length ||
          String(a.reaction.id).localeCompare(String(b.reaction.id))
      );

    if (candidates.length === 0) return { rule: null, blocked: null };

    // Prefer a rule that can actually run.
    for (const candidate of candidates) {
      if (candidate.reaction.noReaction === true) return { rule: candidate, blocked: null };
      if (!blockingCondition(candidate.reaction, state, catalystName)) return { rule: candidate, blocked: null };
    }

    // Every candidate is held back by a condition. We only say WHICH condition
    // if the rule accounts for everything in the vessel.
    //
    // Otherwise we would be answering about the wrong thing. Copper(II)
    // sulfate on its own has an electrolysis rule, so a vessel holding copper
    // sulfate AND phenolphthalein would otherwise be told it "needs an
    // electric current" - which quietly implies we know what phenolphthalein
    // does with copper sulfate. We do not, and section 6.2 says to say so.
    // An unexplained extra substance makes this an honest gap, not a
    // condition that has not been met yet.
    // A rule accounts for its reactants AND its catalyst: the catalyst is
    // named by the rule and is meant to be sitting in the vessel without
    // being consumed, so finding it there is the rule working as intended,
    // not an unexplained extra. Without this, potassium chlorate with its
    // manganese(IV) oxide already added would be called an unknown
    // combination instead of being told it still needs heating.
    const explains = candidates.find(({ reactants, reaction }) => {
      const accounted = new Set(reactants);
      if (reaction.conditions?.catalyst) accounted.add(reaction.conditions.catalyst);
      return [...present].every((id) => accounted.has(id));
    });
    if (!explains) return { rule: null, blocked: null };

    return {
      rule: null,
      blocked: { rule: explains, reason: blockingCondition(explains.reaction, state, catalystName) },
    };
  }

  /** Normalises the optional bench conditions the caller passes in. */
  function readState(species, options = {}) {
    return {
      species,
      tempC: typeof options.tempC === 'number' ? options.tempC : ROOM_TEMPERATURE_C,
      heating: options.heating === true,
      electrified: options.electrified === true,
      catalysts: Array.isArray(options.catalysts) ? options.catalysts : [],
    };
  }

  /**
   * Works out the single next thing that happens, without chaining.
   *
   * Set `options.log` to false to look ahead without adding anything to the
   * unknown-combination log — used internally while cascading, so that the
   * natural end of a cascade is not mistaken for a gap in our data.
   */
  function resolve(speciesIds, options = {}) {
    const species = normaliseSpecies(speciesIds);
    const state = readState(species, options);
    const shouldLog = options.log !== false;

    const base = {
      species,
      reaction: null,
      effects: null,
      blockedBy: null,
    };

    // An empty vessel has nothing to look up.
    if (species.length === 0) {
      return { ...base, outcome: OUTCOME.NO_REACTION, message: MESSAGES.NO_REACTION };
    }

    const { rule, blocked } = findRule(species, state);

    // A rule exists but a condition is holding it back. We do have data for this
    // mixture, so this is not an "unknown" and must not go in the roadmap log.
    if (!rule && blocked) {
      return {
        ...base,
        outcome: OUTCOME.NO_REACTION,
        message: `${MESSAGES.NO_REACTION} This mixture ${blocked.reason} before anything happens.`,
        reaction: blocked.rule.reaction,
        blockedBy: blocked.reason,
      };
    }

    if (!rule) {
      // One lone substance sitting in a vessel is not a gap in our data, it is
      // just a substance sitting in a vessel. (A rule with a single reactant,
      // such as a decomposition on heating, is still allowed to match above.)
      if (species.length < 2) {
        return { ...base, outcome: OUTCOME.NO_REACTION, message: MESSAGES.NO_REACTION };
      }

      // What is left in the vessel after one of our own reactions finished.
      // We already said what that reaction does; there is nothing missing
      // here to report. See settledOutcomes above.
      if (settledOutcomes.has(speciesKey(species))) {
        return { ...base, outcome: OUTCOME.NO_REACTION, message: MESSAGES.NO_REACTION, settled: true };
      }

      // Nothing in the data files covers this combination at all.
      if (shouldLog) recordUnknown(species);
      return { ...base, outcome: OUTCOME.UNKNOWN, message: MESSAGES.UNKNOWN };
    }

    // A rule that deliberately says "these two do nothing". Real chemistry.
    if (rule.reaction.noReaction === true) {
      return {
        ...base,
        outcome: OUTCOME.NO_REACTION,
        message: MESSAGES.NO_REACTION,
        reaction: rule.reaction,
      };
    }

    // A real reaction. Remove what was used up, add what was made.
    const leftovers = species.filter((id) => !rule.reactants.includes(id));
    const products = Array.isArray(rule.reaction.products) ? rule.reaction.products : [];

    return {
      outcome: OUTCOME.REACTION,
      message: describeEffects(rule.reaction, colourNameFor),
      reaction: rule.reaction,
      effects: rule.reaction.effects || null,
      species: normaliseSpecies([...leftovers, ...products]),
      blockedBy: null,
    };
  }

  /**
   * Runs a reaction and then keeps checking whether the new contents can react
   * again, as required by CLAUDE.md section 7.
   *
   * The loop is hard-capped so a badly written pair of rules that feed each
   * other can never hang the app. If the cap is hit, `capReached` comes back
   * true — that is a signal the data files need looking at, not a normal result.
   */
  function react(speciesIds, options = {}) {
    const startingSpecies = normaliseSpecies(speciesIds);
    const cap = Number.isInteger(options.maxCascade) ? options.maxCascade : maxCascade;

    let species = startingSpecies;
    let tempC = typeof options.tempC === 'number' ? options.tempC : ROOM_TEMPERATURE_C;
    const steps = [];
    let capReached = false;
    let last = null;

    for (let iteration = 0; ; iteration += 1) {
      if (iteration >= cap) {
        capReached = true;
        break;
      }

      // Only the very first look-up counts towards the unknown-combination log.
      // Later ones are just the cascade running out of things to do.
      const step = resolve(species, { ...options, tempC, log: iteration === 0 });
      last = step;

      if (step.outcome !== OUTCOME.REACTION) break;

      steps.push(step);
      species = step.species;

      // Apply the curated temperature change so that any follow-on rule with a
      // temperature condition is judged against the new, hotter mixture.
      const delta = step.effects && typeof step.effects.tempDeltaC === 'number'
        ? step.effects.tempDeltaC
        : 0;
      tempC += delta;
    }

    // The overall outcome is "a reaction happened" if anything at all happened.
    // Otherwise it is whatever the single look-up concluded.
    const outcome = steps.length > 0 ? OUTCOME.REACTION : last ? last.outcome : OUTCOME.NO_REACTION;
    const message =
      steps.length > 0
        ? steps.map((step) => step.message).join(' ')
        : last
          ? last.message
          : MESSAGES.NO_REACTION;

    return {
      outcome,
      message,
      steps,
      species,
      startingSpecies,
      tempC,
      capReached,
      finalStep: last,
    };
  }

  return {
    resolve,
    react,

    /** Look up one chemical record. Returns null rather than throwing. */
    getChemical: (id) => chemicalsById.get(id) || null,

    /** Look up one reaction rule by its id. */
    getReaction: (id) => reactionsById.get(id) || null,

    /**
     * Look up the curated flame colour for one element, for the flame test
     * wire in tools.js. Returns null for anything with no curated entry -
     * most cations give no flame colour at all, and inventing one would be
     * exactly the guessing section 6.1 forbids.
     */
    getFlameTest: (element) => flameTestData[element] || null,

    /** Everything currently loaded, products included. */
    getAllChemicals: () => chemicals,

    /**
     * Only the reagents a student can actually pick up, for the shelf.
     *
     * chemicals.json also holds the substances that reactions PRODUCE - a
     * precipitate, a gas, a salt left in solution. Those need full records so
     * the vessel knows a precipitate is a solid and the tools can read it,
     * but they are not things you take off a bottle rack. They are marked
     * "onShelf": false and filtered out here.
     */
    getShelfChemicals: () => chemicals.filter((chemical) => chemical.onShelf !== false),

    getAllReactions: () => reactions,

    /**
     * The combinations students tried that we have no data for, most-tried
     * first. Whoever owns the filesystem writes this out; see section 6.3.
     */
    getUnknownCombinations: () =>
      [...unknownCombinations.values()].sort((a, b) => b.count - a.count),

    clearUnknownCombinations: () => unknownCombinations.clear(),
  };
}

/** A ready-made engine using the real data files, for the app to import. */
export const engine = createEngine();

export default engine;

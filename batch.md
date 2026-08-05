# Content batch log

> Phase 8 of `CLAUDE.md` ("Content scale-up by level") is worked in batches of
> ~10 reactions at a time, each one reviewed against a textbook, committed on
> its own, and pushed before the next one starts. This file is the running
> log of that work: what has shipped, in what order, and what is still left
> to do. Update it at the end of every batch — do not let it drift out of
> date the way a comment would.
>
> Snapshot as of the last entry below: **284 chemicals, 282 reactions
> (38 of them `noReaction`), 18 guided experiments, 274 tests passing.**

---

## 1. Matric (Class 9–10)

| # | Commit | Topic |
|---|---|---|
| 1 | `404d160` | Metal reactivity series |
| 2 | `f1c4ecc` | Acids, bases and salts |
| 3 | `75be489` | Precipitation, solubility rules and tests for ions |
| 4 | `0800965` | Electrochemistry and redox |
| 5 | `02145a2` | The atmosphere, acid rain and water hardness |

Electrolysis was added as an engine capability partway through this run
(`2db9220`) rather than as a content batch — see §4.

## 2. FSc 1st year

| # | Commit | Topic |
|---|---|---|
| 1 | `6f457a6` | Catalysis and the industrial processes |
| 2 | `fa08039` | Thermochemistry and water of crystallisation |
| 3 | `da7332a` | The electrochemical series and cells |
| 4 | `298ee87` | The s-block, Groups IA and IIA |
| 5 | `ca108a0` | Group VIIA, the halogens in depth |
| 6 | `7167f7a` | The transition metals |

## 3. FSc 2nd year (organic + applied)

| # | Commit | Topic |
|---|---|---|
| 1 | `5567a71` | Organic chemistry, the hydrocarbons |
| 2 | `fbf81a1` | Benzene and the alkyl halides |
| 3 | `7c465fd` | Alcohols, aldehydes, ketones and acids |
| 4 | `81738d5` | Acid derivatives, soap and detergent |
| 5 | `6e834fd` | Carbohydrates and proteins |
| 6 | `e3b480a` | Industry, and what acid rain does when it lands |

## 4. BS (university-level)

Chosen deliberately for topics that fit the engine's set-based,
condition-gated, no-arithmetic model — see §6 for the topics that were
*not* forced in and why.

| # | Commit | Topic |
|---|---|---|
| 1 | `a345dfe` | Coordination chemistry and ligand exchange |
| 2 | `025461f` | The qualitative analysis cation scheme |
| 3 | `4c7ae13` | Grignard chemistry and selective reduction |
| 4 | `a8fa3af` | Aromatic substitution and directing effects |
| 5 | `5835be2` | Variable oxidation states and their colours (vanadium, chromium, iron, manganese; iodine/thiosulfate) |
| 6 | `942622a` | Periodicity across Period 3 (oxides and chlorides, Na → P) |
| 7 | `6e02cb8` | Diazonium salts and azo dyes |
| 8 | `ec8b73e` | Polymers — addition and condensation, and why one kind persists |
| 9 | `dc1eee3` | Rubber and cross-linking — thermoplastic against thermoset |
| 10 | `714eb98` | Silicones, and glass — an inorganic backbone |

## 5. Guided experiments (Phase 7)

| Commit | What |
|---|---|
| `1787f50` | The original two: acid–base titration, and the lead iodide precipitation |
| `a077a3d` | 16 more — 7 matric, 6 fsc, 5 bs, bringing the total to 18 |

Six of the sixteen are deliberately built as positive/negative pairs in the
bench's two default vessels (beaker + test tube), reusing a `noReaction`
rule that was already in the data so a negative result is taught *beside*
its positive twin rather than alone: zinc vs copper with acid, iron rusting
wet vs dry, starch vs glucose with iodine, Fehling's on glucose vs starch,
soap vs detergent in hard water, bromine water on ethene vs ethane. One
(cobalt chloride) runs a genuine equilibrium both directions in a single
vessel, depending on the engine's own cascading re-resolution — verified,
not assumed.

## 6. Engine capability additions

Per `CLAUDE.md` §8's Phase 8 note: content goes in as pure JSON, and an
engine change is only made when the data could not express something true
and faking it would have taught something false. In commit order:

1. **`requiresElectricity`** (`2db9220`) — electrolysis needed a condition
   that drives a reaction rather than merely catalysing it.
2. **Burner actually heats the vessel** (`9dd9378`) — `setHeat` recorded the
   knob position; nothing turned that into a temperature change over time,
   which left every `minTempC` rule unreachable.
3. **`settledOutcomes`** (`25af655`) — the app was calling its own reaction
   products "not available in this version yet" once cascading stopped.
4. **Colour in the notebook** (`14c038b`) — `describeEffects` never
   mentioned a colour change, so reactions whose only observable was colour
   (the thiocyanate test, starch–iodine, biuret) read as "no visible
   change". Fixed by looking the colour name up in curated chemical data,
   never inventing one.
5. **`effects.dissolves`** (`c161467`) — the mirror image of `precipitate`;
   a solid visibly going into solution had no field to record it.
6. **`conditions.maxTempC`, and the ice bath** (`dc0e60f`) — the engine
   could say a reaction needed heat and never that heat would stop one.
   Diazotisation forced this: above ~5 °C the diazonium salt decomposes
   faster than it forms. The vessel's heat setting now runs −1 (ice) to 3.

Each of these is recorded in `CLAUDE.md` §8's Phase 8 note as well — that
is the authoritative copy; this list exists so the *order* and *reason* are
visible without reading commit-by-commit.

## 7. Known, accepted gaps

Flagged rather than fixed, because fixing them is a real engine change that
has not been asked for yet:

- **Gases cannot be poured between vessels.** A limewater test for CO₂
  produced elsewhere only works if both are mixed in the same container.
- **The engine has no amounts.** Adding excess HCl to a solution containing
  both silver and lead precipitates only one, because a reactant is
  consumed exactly once per resolution rather than by concentration. Same
  root cause blocks a real quantitative titration (§8 below).

## 8. Remaining / planned batches

Good fits for this engine, not yet written:

- **More qualitative inorganic analysis** — the cation group separations
  only partly covered by batch BS-2; extending the scheme to nickel,
  manganese and the alkali/alkaline-earth groups properly.
- **Biochemistry beyond carbohydrates/proteins** — lipids in more depth,
  nucleic acid components.
- **Further halogen and Group trends** at BS depth, mirroring the Period 3
  batch's approach.
- **Ceramics and refractories** — clay firing, alumina, the reason a
  furnace lining survives what it contains. Continues the inorganic thread
  that the silicones and glass batch opened.

Deliberately **not** forced into this engine — different tooling needed,
not a content-writing problem:

- **Quantitative physical chemistry** (thermodynamics beyond simple ΔH,
  kinetics/rate laws, Nernst-equation electrochemistry). The engine
  tracks a *set* of species, never an amount, a rate, or a time — CLAUDE.md
  §6.6's "curated, not computed" rule for pH is the right call for an
  observable colour, but a rate constant is not an observable, it is a
  calculation. Needs a separate module, not reaction rules.
- **Quantum chemistry / bonding theory** (orbitals, hybridisation, MO
  theory, crystal field splitting). There is no reaction to run — the
  subject is *why*, not *what happens*. Closer to the molecular viewer than
  the bench.
- **Spectroscopy** (NMR, IR, MS, UV-Vis). Already out of scope per
  `CLAUDE.md` §10. The output is a spectrum, not a bench observation.
- **Quantitative titration** (calculating an unknown concentration from a
  titre). Reachable only once the engine tracks amounts — see §7's known
  gap.

---

*Add a new row (or a new `##` section for a new level/phase) at the end of
each batch, and update the snapshot line under the title.*

# Content batch log

> Phase 8 of `CLAUDE.md` ("Content scale-up by level") is worked in batches of
> ~10 reactions at a time, each one reviewed against a textbook, committed on
> its own, and pushed before the next one starts. This file is the running
> log of that work: what has shipped, in what order, and what is still left
> to do. Update it at the end of every batch — do not let it drift out of
> date the way a comment would.
>
> Snapshot as of the last entry below: **376 chemicals, 391 reactions
> (72 of them `noReaction`), 18 guided experiments, 311 tests passing.**

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
| 11 | `c010161` | Ceramics, refractories and plaster |
| 12 | `0725610` | Metallurgy — why each metal is won by the method it is |
| 13 | `12c4662` | Steelmaking, alloys and passivation — protecting metals |
| 14 | `6fbfca7` | Electroplating and surface finishing |
| 15 | `0f3635b` | Anion analysis — the confirmatory tests |
| 16 | `b6b2941` | The remaining cation groups, and why the scheme is ordered as it is |
| 17 | `0704e0a` | Flame tests — built as a **tool**, not reactions (see §6) |
| 18 | `957e1de` | Lipids, enzymes and the biological tests |
| 19 | `32e1359` | Nucleic acids — DNA against RNA |
| 20 | `e877cd5` | The d-block in depth — chelation, geometry and catalysis |
| 21 | `89f7139` | Group trends — the inert pair, and two trends that oppose |

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
7. **The flame test wire** (batch BS-17) — Group V ends with three white
   carbonates that no solution test separates, so the scheme could not be
   finished without one. Built as a TOOL rather than as reactions: it
   reads a sample and changes nothing, which is §7's definition of a tool,
   and modelling it as a reaction would have meant a "reaction" that
   consumes nothing and produces nothing. Colours are curated in
   `flame-tests.json`, membership in `flameElements` per chemical, and the
   tool never reads a cation off a formula.

One TEST was also tightened, in batch BS-15 — not an engine change, but
worth recording next to these. "No two reactions claim the same set of
reactants" was a flat uniqueness check; nitrous acid genuinely has two
outcomes on the same reagents depending on temperature, so the test now
allows a shared reactant set only when the temperature windows are
provably disjoint.

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
*(The dilute-acid audit that used to sit here is finished — see §9.)*

## 8. Remaining / planned batches

Good fits for this engine, not yet written:

*(Nothing outstanding. Every topic identified as a good fit for this engine
has now been written — batches BS-1 to BS-21. Further BS content is
possible but would be extension rather than filling a known gap.)*

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

## 9. The dilute/concentrated acid audit

Adding concentrated sulfuric acid (batch BS-15) and concentrated nitric
acid (batch BS-18) exposed a set of older rules that named the dilute
reagents because the concentrated ones did not exist when they were
written. In several the *prose was already correct* — the benzene
nitration hazard block has always said "the concentrated acid mixture" —
so only the reagent ids disagreed with what the rules were teaching.

Switched, on the owner's instruction:

| Rule | Why concentrated is required |
|---|---|
| `rxn_nitration_benzene` | generating NO₂⁺ gives off water, so dilute acid never produces the electrophile |
| `rxn_nitration_toluene` | same |
| `rxn_nitration_nitrobenzene` | same |
| `rxn_halide_nacl_h2so4` | HCl only leaves as a gas if there is little water to dissolve it |
| `rxn_halide_nabr_h2so4` | **the trend depends on it** — only concentrated acid oxidises |
| `rxn_halide_nai_h2so4` | same, and most dramatically |
| `rxn_sulfonation_benzene` | needs concentrated or fuming acid |
| `rxn_dehydration_ethanol` | needs concentrated acid at ~170 °C |
| `rxn_esterification` (catalyst) | it removes water; supplying protons is a different job |

Switching these left a student who reaches for the wrong bottle with an
"isn't available in this version yet" dead end, so four `noReaction` rules
were added to answer that properly — `rxn_none_nacl_dilute_h2so4`,
`rxn_none_nabr_dilute_h2so4`, `rxn_none_nai_dilute_h2so4` and
`rxn_none_esterification_dilute`. Each explains that the concentrated
reagent is the one to use and why, which is the lesson the switch exists
to teach.

Deliberately **not** switched, because dilute is correct for them:
neutralisations, zinc displacement, acid rain on marble, liming, the
dichromate and permanganate oxidations of iron(II), ethanol oxidation to
ethanal, dissolving vanadium(V) oxide, and the ammonium fertilisers.

## 10. The second-source audit (BUILD_PHASE_2.md stage 2.1.1)

Every reaction is being re-checked, 25 at a time in file order, for
products, equation balance, conditions, colours, precipitates, temperature,
pH and hazard text. Disagreements go to the project owner to decide;
nothing is changed silently.

**What counts as a second source.** Only a reference somebody actually
consulted, recorded in the reaction's `sources` array with what it confirms
(see `CLAUDE.md` §5). Claude cannot open printed books, so Claude records
web references with their links; book references are added by a person
who checked the book (stage 2.1.5). The existing `source` fields were
written alongside the content and have not been checked against the books
they name — `sources` is the evidence, `source` is the claim.

**Equation balance** is checked mechanically for every equation that can be
parsed (210 of 318 confirmed balanced at the start of the audit). The rest
contain words ("polymer", "starch") or unusual notation and are balanced by
hand as their batch comes up. That checker becomes part of the validator in
stage 2.1.2.

**One rule for temperatures**, agreed during batch 1: `tempDeltaC` assumes
equal volumes of the solutions as labelled. Values that disagree with
standard enthalpy data on that basis are corrected; the full set is
re-checked in stage 2.2, once the engine tracks amounts.

### Batch 1 — reactions 1–25

20 sound as written, 5 corrected (plus 1 found elsewhere). Owner approved
all recommendations on 2026-11-02.

| Reaction | Finding | Resolution |
|---|---|---|
| `rxn_oxidation_mg_steam` | A vessel at 100 °C is boiling water, not steam: magnesium gives the hydroxide with water and burns to the oxide only in steam (chemguide). The rule showed the steam result. | Products → `mgoh2_s` + `h2_g`; equation, effects, hazard and explanation rewritten to teach water → hydroxide, steam → oxide. Id kept so nothing that refers to it breaks. |
| `rxn_gastest_co2_limewater` | "Nothing else in ordinary school chemistry does this" — false: sulfur dioxide also turns limewater milky. | Explanation now says so, and how the two gases are told apart. |
| `rxn_reaction_ca_water` | Explanation described a cloudy white suspension; effects had no precipitate, so the vessel looked clear. | `effects.precipitate` and a white colour added. Done in effects rather than with a new `caoh2_s` chemical, which would have created new "not available yet" combinations for no visible gain. |
| `rxn_precipitation_pbno3_ki` | Called plain mixing "the golden rain experiment"; golden rain is recrystallising the precipitate from hot water. | One sentence reworded. |
| `rxn_carbonate_na2co3_hcl`, `rxn_carbonate_caco3_hcl`, `rxn_neutralisation_naoh_h2so4` | Temperature rises of +5, +6 and +14 °C. Standard enthalpies give ≈ −2 kJ/mol for carbonate + acid, and for equal volumes of 1 M H₂SO₄ and NaOH the alkali runs out first. | +1, +1 and +7 °C. The H₂SO₄ explanation now says why the per-molecule doubling does not show up in the tube. |
| `rxn_reduction_nabh4_ethanal` *(outside batch 1)* | `CH₃CHO + [H] → C₂H₅OH` is unbalanced. | `+ 2[H]`. |

Confirmed and left alone: `rxn_neutralisation_hcl_naoh` (+7 °C) and
`rxn_neutralisation_cuo_hcl` (+8 °C) both match standard enthalpies; the
endothermic `rxn_carbonate_nahco3_hcl` matches in sign. Noted but not
changed: magnesium in copper(II) sulfate usually fizzes a little too, and
copper(II) oxide dissolves faster in warm acid.

Deferred for the owner: the four Grignard equations (`rxn_grignard_*`) are
written as net "after work-up" equations without the magnesium salt — a
common textbook shorthand, kept as it is.

Reactions with a `sources` entry after batch 1: 10 of 389.

### Batch 2 — reactions 26–50

19 sound as written, 6 corrected. Owner approved all recommendations on
2026-11-02.

| Reaction | Finding | Resolution |
|---|---|---|
| `rxn_reduction_cuo_h2` | **Safety procedure in the wrong order.** Said to keep heating until the hydrogen is stopped; the correct procedure is to remove the burner and keep the hydrogen flowing until the tube cools, or air re-oxidises the hot copper. | `whatToDoInstead` rewritten. **No `sources` entry:** the evidence is an RSC practical sheet ("Reduction of copper(II) oxide by hydrogen") quoted in search results and a Purdue demonstration sheet, but neither page could be opened to check. A teacher should confirm against a printed practical guide in stage 2.1.5. |
| `rxn_electrolysis_molten_nacl` | "Down's cell" — it is the Downs cell, after James Cloyd Downs. The hazard said the cell runs "at over 800 °C"; the industrial cell adds calcium chloride and runs at about 600 °C. Pure NaCl does melt at 801 °C, so the vessel's `minTempC` is unchanged. | Hazard title, warning, `whatToDoInstead` and explanation corrected. The `source` string is left as written, since that is how the cited textbook may spell it. |
| `rxn_electrolysis_cuso4` | Called this "the reaction behind electroplating and refining", which use a copper anode that dissolves (the blue stays); this rule has an inert anode (oxygen forms, the blue fades). | Explanation now says the cathode half is shared and explains the difference. |
| `rxn_oxidation_cu_o2` | "Will not touch oxygen at room temperature" — copper reacts slowly, tarnishing and eventually forming a green patina. | Softened to "reacts only very slowly". |
| `rxn_precipitation_cacl2_na2co3` | Solubility rule omitted ammonium carbonate as an exception. | "Group 1 and ammonium". |
| `rxn_precipitation_agno3_ki` | Called comparing colours side by side "the only reliable way"; the confirmatory test is ammonia, which the lab already models. | Explanation now gives the ammonia test. |

Rusting (`rxn_corrosion_iron_rusting`) was balanced by hand — the checker
cannot read `·xH₂O`. Noted but not changed: brine electrolysis uses 1 M
salt; much more dilute solutions give some oxygen with the chlorine, but at
1 M chlorine is the main product.

Reactions with a `sources` entry after batch 2: 14 of 389.

### Batch 3 — reactions 51–75

19 sound as written, 6 corrected, 1 rule added. Owner approved all
recommendations on 2026-11-03.

**Second temperature rule**, agreed in this batch: a solid dissolving in
water assumes **10 g of solid in 100 mL of water**; a gas into a solution
assumes enough gas to use up the solution's reagent. All three rules now
live in `CLAUDE.md` §5. On the solid basis, four existing values were
already right — potassium nitrate −8, ammonium chloride −6, calcium
chloride +18, sodium hydroxide +25 °C — which suggests this is the basis
they were originally written on.

| Reaction | Finding | Resolution |
|---|---|---|
| `rxn_dissolution_kno3`, and `kno3_s`'s description | Said potassium nitrate cools "less sharply than ammonium nitrate", contradicting the enthalpies quoted in the same entries: +34.9 against +25.7 kJ/mol, so it is the MORE endothermic per mole and about equal per gram. Ammonium nitrate gets colder only because far more of it dissolves. | Both texts now give the true reason. |
| `rxn_smoke_nh3_hcl` | The white smoke needs hydrogen chloride as a GAS; the rule used 1 M hydrochloric acid solution, in which ammonia simply dissolves and is neutralised — and the explanation itself said "no water involved anywhere". | Reactant changed from `hcl_1m` to `hcl_g` (made in the lab from salt and concentrated sulfuric acid); explanation says why both must be gases. |
| *(new)* `rxn_neutralisation_nh3_hcl_aq` | Without it, ammonia into dilute acid would have become an "isn't available yet" dead end. | Added: NH₃ + 1 M HCl → ammonium chloride solution, +21 °C (ΔH −86.6 kJ/mol from OpenStax, on the gas basis above), pH 4.6, no smoke. Engine checked: dilute acid neutralises; two gases smoke, including after the salt + concentrated sulfuric acid route. |
| `rxn_dissolution_cacl2` | "The chemistry inside a reusable hand warmer" — calcium chloride is used in single-use hot packs; reusable warmers crystallise sodium acetate. | Corrected; the road-salt sentence softened to "helps". |
| `rxn_slaking_quicklime` | Showed clear liquid, though most of the calcium hydroxide stays as a white paste (the same gap as calcium + water in batch 1); +40 °C. | White paste added as the precipitate; +27 °C on the solid basis (ΔH −64.5 kJ/mol from OpenStax). |
| `rxn_dissolution_nh4no3` | −15 °C is about double the value for 10 g in 100 mL. | −8 °C; explanation now says cold packs use it because it is so soluble. |
| `rxn_decomposition_nahco3` | "Turns baking soda into washing soda" — washing soda is the decahydrate; heating leaves anhydrous sodium carbonate. | Reworded. |

Noted but not changed: the temporary-hardness rule shows limescale forming
only at 100 °C, while real kettles and hot-water pipes scale up below
boiling. The sources that could be opened did not settle a temperature, so
the condition is left as it is. "Carbon dioxide itself is not poisonous"
(`rxn_combustion_carbon`) is kept as a fair school-level statement.

Reactions with a `sources` entry after batch 3: 21 of 390.

### Batch 4 — originally reactions 76–100 (file positions 77–101)

18 sound as written, 7 corrected, 1 chemical and 1 rule added. Owner
approved all recommendations on 2026-11-03.

**Temperatures of a solid reacting with a solution — deferred.** No basis
gives honest numbers here without amounts: magnesium using up all of a 1 M
acid would warm it by about 56 °C, a small ribbon in excess acid by far
less. Agreed: leave every such value as it is (including batch 1's metal +
acid and displacement reactions) and work them out in stage 2.2. Recorded
in `CLAUDE.md` §5.

| Reaction | Finding | Resolution |
|---|---|---|
| `rxn_displacement_zn_agno3`, `rxn_displacement_zn_pbno3`, `rxn_displacement_zn_feso4`, `rxn_displacement_mg_feso4` | Taught that a bigger electrode-potential gap means a FASTER reaction ("a set of visible speeds"). E° says whether a reaction can go and how much energy it releases, never how fast (chemguide). | All four reworded to teach feasibility and energy, with rate named as a separate question. |
| `rxn_prep_chlorine_mno2` | Used 1 M hydrochloric acid; the preparation needs concentrated acid, as the rule's own hazard text already said. | **New chemical `hcl_conc`** (about 36%, 12 M, density 1.18 — Wikipedia), on the shelf for FSc/BS; the rule now uses it. **New rule `rxn_none_mno2_dilute_hcl`** answers the dilute acid honestly, mirroring §9's sulfuric acid rules. Its `source` says plainly it is awaiting a printed-source check. Engine checked: concentrated + heat → chlorine; cold → "needs heating"; dilute → no change. |
| `rxn_dehydration_cuso4` | Turned white at 100 °C; the last water leaves at about 200 °C. | `minTempC` 100 → 200 (the burner reaches 500 °C for a dry solid, so it stays reachable); explanation gives the three steps. |
| `rxn_dehydration_cocl2`, `rxn_hydration_cocl2` | Said cobalt chloride paper is reusable "in a way copper sulfate is not". Both are reusable; cobalt chloride needs only gentle warmth. | Reworded. |
| `rxn_displacement_mg_feso4` | Magnesium "bolted to ships' hulls" — ships at sea use zinc or aluminium; magnesium protects buried pipelines and fresh-water boats. | Corrected (Wikipedia, Galvanic anode). |
| `rxn_group2_caco3_decomposition` | "A Bunsen burner will not manage it however long you leave it" — strongly heating a chip in a roaring Bunsen flame is a standard class practical; only a glass tube cannot reach 900 °C. | Reworded. **No `sources` entry:** the RSC practical page would not open, so the evidence is search results only — for a teacher to confirm. |
| `rxn_electrolysis_agno3` | Promised "a bright, even layer" of silver; real silver plating uses a cyanide-complex bath, and plain silver nitrate tends to give loose crystals. | Explanation and cathode observation softened. Lowest-confidence change in the batch: Wikipedia confirms cyanide baths, but the "loose crystals" detail rests on practitioners' accounts found by search. |

Not adding, though it came up: a rule for concentrated ammonia with
concentrated hydrochloric acid. Mixing the two solutions in one vessel is a
violent neutralisation, not the two-gases-meet smoke demonstration; that
needs gases moving between vessels (stage 2.3).

Reactions with a `sources` entry after batch 4: 29 of 391.

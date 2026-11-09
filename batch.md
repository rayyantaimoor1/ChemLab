# Content batch log

> Phase 8 of `CLAUDE.md` ("Content scale-up by level") is worked in batches of
> ~10 reactions at a time, each one reviewed against a textbook, committed on
> its own, and pushed before the next one starts. This file is the running
> log of that work: what has shipped, in what order, and what is still left
> to do. Update it at the end of every batch — do not let it drift out of
> date the way a comment would.
>
> Snapshot as of the last entry below: **379 chemicals, 394 reactions
> (73 of them `noReaction`), 18 guided experiments, 311 tests passing.**

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

**Status: complete (2026-11-07).** All 389 original reactions were checked
in 16 batches — 315 sound as written, 74 corrected, with rules, chemicals
and one guided experiment added where the checking showed a gap. 83 of the
394 reactions now carry a `sources` entry. What could not be settled from
an opened page is listed under "Noted but not changed" in each batch, for
the teacher review in stage 2.1.5.

Every reaction was re-checked, 25 at a time in file order, for
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

### Batch 5 — originally reactions 101–125 (file positions 103–127)

22 sound as written, 3 corrected, 1 chemical added. Owner approved all
recommendations on 2026-11-03.

| Reaction | Finding | Resolution |
|---|---|---|
| `rxn_decomposition_kmno4` | **Could never fire.** It heated the 0.02 M solution to 240 °C, but a vessel holding liquid cannot pass 100 °C — and chemically it is the dry solid that decomposes. | **New chemical `kmno4_s`** (purplish-black crystals, 158.03 g/mol, density 2.7 — Wikipedia), on the shelf for FSc/BS; the rule now uses it. Engine checked: decomposes at 250 °C, "needs about 240 °C" at 150 °C, and the solution no longer offers a reaction it cannot reach. |
| `rxn_addition_ethene_bromine` | With bromine WATER, most of the product is 2-bromoethanol rather than 1,2-dibromoethane; the orange still disappears (chemguide). | One sentence added; the simple equation is kept, as chemguide says it can be quoted at this level and the guided experiment depends on it. |
| `rxn_prep_ethyne_carbide` | Showed clear liquid; the calcium hydroxide left is mostly a white sludge — the same gap as batches 1 and 3. | White suspension added to the effects. |

Noted but not changed: at the end of the permanganate titration
(`rxn_permanganate_oxidises_iron2`) the app shows "very pale pink", while
the iron(III) formed probably makes the solution look pale yellow. No
opened source settled it — left for the teacher review in stage 2.1.5.

Reactions with a `sources` entry after batch 5: 32 of 391.

### Batch 6 — originally reactions 126–150 (file positions 128–152)

20 sound as written, 5 corrected, 1 small clause removed, 1 chemical and
1 rule added. Owner approved all recommendations on 2026-11-03.

| Reaction | Finding | Resolution |
|---|---|---|
| `rxn_bromination_benzene` | **Wrong reagent.** Used bromine WATER with an iron(III) bromide catalyst; benzene is brominated by bromine itself with an iron catalyst (chemguide), and water destroys the catalyst — so adding iron(III) bromide to bromine water and benzene gave bromobenzene, which would not happen. | **New chemical `br2_l`** (liquid bromine: dark red-brown, density 3.10 — Wikipedia), on the shelf for FSc/BS; the rule now uses it, and its explanation says why bromine water will not do. **New rule `rxn_none_benzene_bromine_water`**: no reaction, the orange just moves into the benzene layer, with or without the catalyst. Engine checked all four combinations, and ethene still decolourises bromine water. Medium confidence on the water-destroys-the-catalyst point, which rests on search results; the new rule's `source` says so. |
| `rxn_hydrogenation_benzene` | Called the harsher conditions "the best measure" of benzene's stability; the measure is the enthalpy of hydrogenation (−208 against an expected −360 kJ/mol, about 150 kJ/mol delocalisation energy — chemguide). Also said ethene hydrogenates over nickel "at ordinary temperatures", contradicting the lab's own heated ethene rule. | Rewritten around the enthalpy figures. |
| `rxn_elimination_bromoethane_naoh` | "Nothing about the reagents predicts which — only the solvent does." The type of halogenoalkane matters most, and a primary one like bromoethane gives mainly substitution even in ethanol (chemguide). | Rule kept (the syllabus example, and some ethene does form); explanation now names all four factors and says the ethene is only part of the product. |
| `rxn_sulfonation_benzene` | Called benzenesulfonic acid "precisely the structure of a detergent"; real detergents are sulfonated LONG-CHAIN alkylbenzenes (Wikipedia). | Reworded. |
| `rxn_hydration_ethene` | "This is how most industrial ethanol is made — not by fermentation." Most ethanol today comes from fermentation; the US no longer uses the ethene route (Wikipedia). | Reworded: which route is cheaper depends on oil and crop prices. |
| `rxn_hydrogenation_ethyne` | Linked stopping at the alkene to "how partially hydrogenated fats came about" — those come from oils, not alkynes. | Clause removed. |

Left as they are for now, by agreement: phenol is "about five orders of
magnitude" more acidic than ethanol (nearer six — change once a source for
ethanol's pKa has been opened), and Tollens' "only an aldehyde does this"
(fructose also gives a mirror — better handled in the sugars batch).

Reactions with a `sources` entry after batch 6: 38 of 392.

### Batch 7 — originally reactions 151–175 (file positions 154–178)

20 sound as written, 5 corrected (one of them in `chemicals.json`). Owner
approved all recommendations on 2026-11-04.

| Reaction / chemical | Finding | Resolution |
|---|---|---|
| `rxn_urea_synthesis` | Repeated the "Wöhler myth": that making urea from "two lifeless minerals" ended vitalism. Wöhler made urea from ammonium cyanate, not CO₂ + NH₃, and the claim that it ended vitalism is a textbook myth (Wikipedia). | History sentence rewritten. The industrial chemistry was already right. |
| `fat_l` (chemical), `rxn_saponification_fat` | Glyceryl tristearate was recorded as a pale yellow LIQUID; it is a white solid melting at 54–72.5 °C (Wikipedia), and the lab's own `rxn_none_bromine_saturated_fat` already says "the fat is solid at room temperature". Saponification also called itself "the oldest deliberate chemical reaction there is". | State → solid, colour → white, pH → none (a solid); description and source updated; id kept so the five rules that use it are untouched. "One of the oldest". Engine checked: saponification and the bromine test behave as before. |
| `rxn_anhydride_from_acyl_chloride` | Used sodium ethanoate SOLUTION; ethanoyl chloride and the anhydride are both destroyed by water, so the real preparation is done dry (Wikipedia). | Honest note added, in the same style as the PCl₅ entry, rather than a new chemical. |
| `rxn_hydrolysis_starch` | Called the links between sugars "ester-like"; they are glycosidic links, an ether-type bond (Wikipedia). | Reworded; the point that water splits them stands. |
| `rxn_solvay_precipitation` | "Into washing soda" — the process makes sodium carbonate (soda ash); washing soda is its hydrate. | Reworded, matching batch 5's fix to `rxn_decomposition_nahco3`. |

Reactions with a `sources` entry after batch 7: 41 of 392.

### Batch 8 — originally reactions 176–200 (file positions 179–203)

20 sound as written, 3 corrected, 2 rules added, 1 guided experiment
corrected. Owner approved all recommendations on 2026-11-05.

| Reaction / experiment | Finding | Resolution |
|---|---|---|
| `rxn_ligand_exchange_cobalt_to_blue`, and **`exp_cobalt_chloride_equilibrium`** | Used 1 M HCl. The blue tetrachloro complex needs CONCENTRATED hydrochloric acid, because only that supplies enough chloride (chemguide); dilute acid just dissolves the crystals pink. The guided experiment's objective, expected result and safety note already said "concentrated", but its reagent list and step 2 used the 1 M acid — so the step "worked" in a way a real tube would not. | Rule switched to `hcl_conc`. Experiment reagent list, step 2's chemical, instruction, hint and wrong-action text switched to match. **New rule `rxn_dissolution_cocl2_dilute_hcl`**: dilute acid dissolves the crystals to a pale pink solution. Checked by running the experiment's own sequence through the real actions code: pink crystals → deep blue with concentrated acid → pale pink with water. |
| `rxn_ligand_exchange_cu_chloride` | The same, and its own explanation said "this needs concentrated hydrochloric acid". | Switched to `hcl_conc`. **New rule `rxn_none_cuso4_dilute_hcl`**: the solution stays blue in dilute acid. |
| `rxn_acidrain_attacks_marble` | Said marble "fizzes away in exactly the same manner" in sulfuric acid. It starts and then almost immediately stops, because the sparingly soluble calcium sulfate coats the chips (chemguide; Wikipedia). | Explanation rewritten; the coating is also what flakes the stone on a building. |

Noted but not changed:
- `rxn_test_nickel_dmg`: the standard test usually adds a little ammonia to take up the acid released. The page opened (Wikipedia, Dimethylglyoxime) did not state the conditions, so this waits for the teacher review.
- `rxn_soap_temporary_hard_water` lists sodium hydrogencarbonate as a solid product, though it stays dissolved; fixing it would need a new chemical for little gain.
- Adding water to most solutions (for example `nacl_aq` + `water_distilled`) gives "not available yet", because dilution is not modelled as a reaction. This is app-wide, not a data error; it belongs with stage 2.2's amounts.

Reactions with a `sources` entry after batch 8: 47 of 394.

### Batch 9 — originally reactions 201–225 (file positions 206–230)

19 sound as written, 6 corrected, 1 chemical added, 1 "no reaction" rule
turned into a reaction. Owner approved all recommendations on 2026-11-05.

| Reaction / chemical | Finding | Resolution |
|---|---|---|
| `rxn_nitration_phenol` | Used DILUTE nitric acid to make 2,4,6-trinitrophenol. Dilute acid gives 2- and 4-nitrophenol; more nitro groups need concentrated acid (Wikipedia, Phenol). Also called the product "thousands of times" more acidic than phenol; the pKa values (0.38 against 9.95) make it billions of times. | Reactant → `hno3_conc`; explanation now says what dilute acid gives and corrects the acidity. Phenol + dilute nitric acid is now an honest "not available yet", logged as an unknown pair, until a nitrophenol chemical is written in a later content batch. |
| `rxn_none_nabh4_ethanoic_acid` → **`rxn_nabh4_destroyed_by_acid`** | A "no reaction" rule, so the app said "No observable change" — but an acid destroys sodium borohydride and hydrogen fizzes off (Wikipedia). What does hold is that the acid is not reduced. | Turned into a reaction: NaBH₄ + CH₃COOH + 3H₂O → CH₃COONa + H₃BO₃ + 4H₂ (balanced by hand), with a flammable-gas hazard; the chemoselectivity lesson is kept. **New chemical `h3bo3_aq`** (boric acid solution, with a structure drawing and 3D model). `nabh4_aq`'s description now says the acid is not reduced, rather than "left completely alone". The id changed because the rule is no longer a "none"; nothing else referred to it. |
| `rxn_reduction_nitrobenzene_aniline` | Used 1 M HCl; the method is tin with CONCENTRATED hydrochloric acid under reflux, then sodium hydroxide to free the amine from its salt (chemguide). | Reactant → `hcl_conc`; explanation gives both stages. |
| `rxn_reduction_lialh4_acid` | Reacted lithium aluminium hydride with aqueous ethanoic acid; LiAlH₄ reacts violently with water, and the real reduction is done in dry ether (Wikipedia). | Honest note added, in the style of the PCl₅ entry. |
| `rxn_bromination_phenol_water` | Said benzene will not touch bromine water "without iron(III) bromide to help" — since batch 6 the lab correctly says it needs pure bromine, catalyst or not. | Sentence updated. |
| `rxn_vanadium_v_to_iv` | Said any vanadium solution drifts back to blue in air "whatever you did to it"; only the reduced +2 and +3 states are re-oxidised (chemguide). | Narrowed. |

A web search on the phenol point was refused (it named an explosive); the
fact was confirmed instead from Wikipedia's article text, fetched directly.

Reactions with a `sources` entry after batch 9: 52 of 394.

### Batch 10 — originally reactions 226–250 (file positions 231–255)

20 sound as written, 5 corrected (one of them also in `chemicals.json`,
`molecules3d.json` and a structure drawing). Owner approved all
recommendations on 2026-11-05.

| Reaction / chemical | Finding | Resolution |
|---|---|---|
| `rxn_azo_coupling_aniline`, `azo_dye_red_s` | **Wrong colour.** 4-aminoazobenzene was shown and described as deep red; it is Aniline Yellow — a yellow azo dye (an orange powder) and the first azo dye ever made, in 1861 (Wikipedia). | Colour → yellow in the chemical record, the reaction's colour and precipitate, the explanation, the structure drawing's label and the 3D model's note; the explanation now names the dye and its history. The id keeps "red" so nothing that refers to it breaks. |
| `rxn_diazonium_ki` | Said chloride, bromide and cyanide "all work the same way" as iodide; they need copper(I) salts — the Sandmeyer reaction (Wikipedia). | Corrected, with the reaction named. |
| `rxn_period3_sio2_naoh` | Put phosphorus "two places along" from silicon — it is the next element. Dissolved sand in 1 M alkali, though its own hazard says hot concentrated alkali is needed (Wikipedia). | "The very next element"; honest note that 1 M alkali attacks sand only very slowly. |
| `rxn_permanganate_alkaline_fe2` | Said "every one of those half-equations needs" hydrogen ions; the step to +6 (MnO₄⁻ + e⁻ → MnO₄²⁻) needs none. | Reworded: the deeper reductions are the ones that need hydrogen ions or water. |
| `rxn_diazotisation_aniline` | Called the product "an amine with two nitrogens on the ring"; it is a diazonium ion. | Reworded. |

Ionic equations for the vanadium, chromium and permanganate reductions in
this batch were balanced by hand, since the checker cannot read them.

Reactions with a `sources` entry after batch 10: 55 of 394.

### Batch 11 — originally reactions 251–275 (file positions 256–280)

22 sound as written, 3 corrected (four rules touched). Owner approved all
recommendations on 2026-11-07.

| Reaction | Finding | Resolution |
|---|---|---|
| `rxn_polymerisation_chloroethene`, `rxn_polymerisation_phenylethene`, `rxn_polymerisation_tetrafluoroethene` | All three used a Ziegler–Natta catalyst, which is for polymers of 1-alkenes such as ethene and propene. PVC, polystyrene and PTFE are made by FREE-RADICAL polymerisation, started by an initiator (Wikipedia, on each polymer and on Ziegler–Natta). | Condition switched to `na2s2o8_aq` (sodium persulfate, a radical initiator — Wikipedia — already on the BS shelf, the same level as these rules); each explanation now says so and notes that an initiator, strictly, is used up in a trace. `na2s2o8_aq`'s description gains one sentence on this use. Ethene and isoprene keep Ziegler–Natta, which is right for them. Engine checked. |
| `rxn_hydrolysis_polyester` | Used 1 M alkali although its own hazard says hot concentrated alkali is needed (the same pattern as sand in batch 10). | Honest note added. |

Side effect worth knowing: vinyl chloride, styrene or tetrafluoroethene
with the Ziegler–Natta catalyst now give "not available yet" and are logged,
rather than wrongly polymerising. A "no reaction" rule could teach that
the catalyst does not work for them, but no opened source said so
directly, so it is left for a later content batch.

Noted but not changed: `rxn_dye_on_fabric` calls its azo dye "a direct
dye", which is doubtful for so small a molecule, though the lesson (no
bond forms, so it can wash out) stands; and the chlorosilane entries
explain silicon's easy hydrolysis with "empty d orbitals", the standard
school explanation even though modern texts prefer the size argument.

Reactions with a `sources` entry after batch 11: 59 of 394.

### Batch 12 — originally reactions 276–300 (file positions 281–305)

23 sound as written, 2 corrected (explanations only). Owner approved all
recommendations on 2026-11-07.

| Reaction | Finding | Resolution |
|---|---|---|
| `rxn_copper_self_reduction` | Said copper "needs only a wood fire's temperature", so it was smelted thousands of years before iron and "the Bronze Age came first for chemical reasons". Copper was the first metal smelted, but campfires are about 200 °C too cool — it probably first happened in pottery kilns, with charcoal (Wikipedia, Smelting). Self-reduction of sulfide ores is the industrial route, not the origin story. | History sentences rewritten; the chemistry is unchanged. |
| `rxn_calcination_aloh3` | Said heating to 300 °C gives the hard, heat-resistant alumina used for linings and abrasives; the water starts leaving at a few hundred degrees, but that alumina is made at about 1200 °C (Wikipedia, Bayer process: about 1470 K). | `minTempC` kept (water does start leaving there); explanation now gives the real temperature for the hard form. |

Noted but not changed: `rxn_decomposition_polythene_hot` promises "a
black char", though polyethylene breaks down mostly to vapour and leaves
little char — not settled by the source opened, so left for the teacher
review; `rxn_none_silicone_hot` shows silicone unchanged at 350 °C, roughly
where it too starts to degrade, though far more slowly than polythene.

Reactions with a `sources` entry after batch 12: 61 of 394.

### Batch 13 — originally reactions 301–325 (file positions 306–330)

21 sound as written, 4 corrected. Owner approved all recommendations on
2026-11-07.

| Reaction | Finding | Resolution |
|---|---|---|
| `rxn_anodising_aluminium` | **Data error:** the cathode's `product` was the anodised aluminium itself, though hydrogen forms there; and the rule had no electrolyte, so it fired on bare aluminium with the power on. Real anodising is done in sulfuric acid, which releases hydrogen at the cathode (Wikipedia). | Reactants gain `h2so4_1m`; products gain `h2_g` (and keep the acid, which is not used up); cathode product → `h2_g`; anode now attracts sulfate; overall equation 2Al + 3H₂O → Al₂O₃ + 3H₂; pH 1. Engine checked: anodises in acid, "no change" without it. |
| `rxn_decomposition_hgo` | Decomposed at 400 °C; mercury(II) oxide decomposes above 500 °C (Wikipedia). | `minTempC` 400 → 500. The burner takes a dry solid to exactly 500 °C, so it stays reachable; engine checked at 450 and 500 °C. |
| `rxn_electroplating_silver` | Promised a mirror-bright coat from plain silver nitrate — the claim already softened for silver nitrate electrolysis in batch 4. Industry plates silver from a cyanide bath (Wikipedia). | Explanation and cathode observation reworded to match batch 4. |
| `rxn_electroless_copper_plastic` | Said copper deposits "wherever the solution touches — conductor or not"; the plastic is first primed with a palladium catalyst, and methanal does the job in alkali (Wikipedia). | Honest note added. |

Noted but not changed: `rxn_agbr_dissolves_conc_ammonia` reuses the
`agnh3_aq` record, whose formula reads [Ag(NH₃)₂]Cl although bromide is
the ion left in solution — cosmetic, and fixing it would need a separate
record.

Reactions with a `sources` entry after batch 13: 65 of 394.

### Batch 14 — originally reactions 326–350 (file positions 331–355)

23 sound as written, 2 corrected (wording only). Owner approved both on
2026-11-07. The cleanest batch of the audit.

| Reaction | Finding | Resolution |
|---|---|---|
| `rxn_qa_group4_manganese` | Called manganese sulfide's buff pink "the only sulfide here that is not black", though the lab's own `rxn_qa_group4_zinc` makes white zinc sulfide in the same group. | Reworded: white zinc, buff pink manganese, black nickel and cobalt. |
| `rxn_bromine_unsaturated_oil` | Said the iodine number "is how the unsaturation of a cooking oil is quoted on a label"; it is a laboratory measure of the unsaturation of fats and oils (Wikipedia). | Reworded. |

Noted but not changed: `rxn_qa_phosphate_molybdate` gives the yellow
precipitate at once, though the usual method warms it (not settled by an
opened source); the emulsion and Sudan III lipid tests now use the fat
that batch 7 correctly made a solid, and Sudan's "fat layer" wording is a
little loose for a solid but the result stands. The emulsion test's colour
shares a hex with polythene, but the notebook names a colour from the
rule's own products first, so it correctly reads "milky white".

Reactions with a `sources` entry after batch 14: 66 of 394.

### Batch 15 — originally reactions 351–375 (file positions 356–380)

19 sound as written, 6 corrected (five findings, one covering two rules). Owner approved all
recommendations on 2026-11-07.

| Reaction | Finding | Resolution |
|---|---|---|
| `rxn_ninhydrin_glycine` | **Data error in the product record:** `ruhemann_purple_aq` had the formula "C18H9N O6" (a stray space and two oxygens too many) and a molar mass of 335.27 worked out from it. Its 2D drawing and 3D model showed two plain benzene rings joined through N with one O each (12 C, 2 O). Ruhemann's purple is two indane-1,3-dione units joined through the nitrogen: C₁₈H₉NO₄, 303.3 (PubChem CID 71260940, matching the structure German Wikipedia's *Ninhydrin* describes). | Formula → C18H9NO4, molar mass → 303.27. SVG redrawn and 3D model rebuilt with the real skeleton (18 C, 1 N, 4 O; hydrogens not drawn, like the ninhydrin model). |
| `rxn_qa_phosphate_molybdate_acid` | Equation did not balance (H 15 vs 36, charge −21 vs 0). | 21H⁺ added to the left, as the inorganic rule already shows its H⁺. |
| `rxn_molisch_carbohydrate`, `rxn_none_molisch_amino_acid` | Said "EVERY carbohydrate" / "any carbohydrate at all" responds; trioses and tetroses do not (Wikipedia). | Reworded to "almost every", naming the exceptions; a negative now means "almost certainly" no carbohydrate. |
| `rxn_edta_displaces_ammonia_cu` | Said "Both ligands bind through nitrogen"; EDTA binds through two amines and four carboxylates (Wikipedia). And `resultPH` 6, though the reaction frees ammonia into a solution already at pH 11 — an ammonia–ammonium buffer sits near pH 9 (pKa 9.25). | Explanation rewritten around EDTA's two-nitrogen, four-oxygen grip; `resultPH` 6 → 9. |
| `rxn_edta_hardness_ca` | Said adding EDTA "until the water stops being hard" measures hardness — nothing visible marks that moment without an indicator (Wikipedia, *Complexometric titration*). | Eriochrome Black T named as what shows the end point. |

Noted but not changed, for the teacher review: the copper–EDTA complex
is named "deep blue" like the ammonia complex it replaces, though it is
believed to be a paler blue (no opened page settles it); DNA re-pairs
best on slow cooling, which "Cool it and the helix rebuilds itself" does
not say; the ninhydrin rule's `bubbles: true` is probably more fizzing
than the small amount of carbon dioxide gives; and the DNA-derived
phosphate gives its yellow precipitate unwarmed, the same open question
as in batch 14.

Reactions with a `sources` entry after batch 15: 75 of 394.

### Batch 16 — originally reactions 376–389 (file positions 381–394)

The last batch, 14 reactions: 8 sound as written, 6 corrected. Owner
approved all recommendations on 2026-11-07.

| Reaction | Finding | Resolution |
|---|---|---|
| `rxn_cisplatin_formation` | Called transplatin cisplatin's "mirror-arrangement" — cis and trans are geometric isomers, not mirror images — and "medically worthless" (Wikipedia: far less impact on medicinal chemistry). | "The other arrangement … of little use as a drug." |
| `rxn_cisplatin_binds_dna` | Said transplatin "cannot make the second bond"; it does bind DNA, but cannot form the 1,2-intrastrand cross-link between neighbouring bases (Wikipedia, *Cisplatin*). | Reworded to say exactly that. |
| `rxn_sncl2_reduces_fe3` | "Confirm the iron(II) with thiocyanate" — thiocyanate detects iron(III); the missing blood red shows iron(III) is gone, not that iron(II) is there. | Reworded. |
| `rxn_pbo2_oxidises_hcl` | "The roof of a church is lead(II)" — a lead roof is lead metal. | "Almost every lead compound you will meet is lead(II); lead(IV) is a laboratory oxidising agent." |
| `rxn_decomposition_hi_heat` | `resultPH` 7, and "the molecule has come apart" — hydrogen iodide decomposes only partly, to an equilibrium with hydrogen and iodine (Bodenstein), so most of the acid gas is still in the tube. | `resultPH` → null, like the other gas and solid decompositions; explanation says only some molecules split and why. |
| `rxn_catalysis_persulfate_iodide` | "Add starch to see the iodine appear", though the brown iodine is already showing. | "Add starch and the brown turns blue-black, confirming that it is iodine." |

Noted but not changed, for the teacher review: cisplatin with DNA gives
an off-white precipitate at once, though the drug must first lose a
chloride to water (slow, per Wikipedia) and no opened page describes a
visible solid; strontium carbonate's 1290 °C is not confirmed by an
opened page (Wikipedia gives only decomposition on melting, 1494 °C);
strontium and barium carbonate, like calcium carbonate, need far more
than the burner's 500 °C, so a student cannot trigger them; lead(IV)
oxide is usually shown with concentrated hydrochloric acid, and this rule
uses 1 M; and `ptcl4_aq` is "pinkish brown" where Wikipedia calls the
salt reddish orange (the solution's colour is not given).

Reactions with a `sources` entry after batch 16: 83 of 394. **The audit is complete.**

## 11. Validator chemistry checks (BUILD_PHASE_2.md stage 2.1.2)

`npm run validate` now reports **errors** (they fail the build, and CI
runs it) separately from **warnings** (for a person to look at). It
checks equation balance (atoms and charge), colour names against their
hex codes, a GHS pictogram for every hazard word
(`src/data/ghs-hazards.json`, checked against Wikipedia's *GHS hazard
pictograms*), pH on the 0–14 scale (concentrated acids may go to −1), and
that every level tag is matric, fsc or bs.

The first run found five unbalanced equations that the audit had missed,
because the audit's own parser could not read them. Owner approved the
fixes and the warning clean-ups on 2026-11-08.

| Reaction | Finding | Resolution |
|---|---|---|
| `rxn_qa_nitrate_brown_ring` | Second step `Fe²⁺ + NO → [Fe(H₂O)₅(NO)]²⁺` left out the water ligands (H 0 → 10, O 1 → 6). | `[Fe(H₂O)₆]²⁺ + NO → [Fe(H₂O)₅(NO)]²⁺ + H₂O`, as Wikipedia's *Nitrate test* writes it; `sources` added. |
| `rxn_grignard_methanal`, `_ethanal`, `_propanone`, `_co2` | Ended at "(after work-up)" with Mg and Br lost. | Both steps written out: addition to the magnesium alkoxide (or carboxylate), then hydrolysis to the product + Mg(OH)Br. |
| `rxn_tollens_ethanal` | Ended "+ ...". | Completed: `CH₃CHO + 2[Ag(NH₃)₂]⁺ + 3OH⁻ → CH₃COO⁻ + 2Ag + 4NH₃ + 2H₂O`. |
| `rxn_electroless_copper_plastic` | Had the word "base" in it. | `Cu²⁺ + HCHO + 3OH⁻ → Cu + HCOO⁻ + 2H₂O`. |
| six dissolution rules | "+ water" on the left only. | Water written over the arrow: `NaOH(s) →(water) NaOH(aq)`. |
| `cementite_s` | Named "pale grey" on a mid grey. | "grey". |

Left as warnings (28): 25 equations that genuinely are words (biochemical
tests, polymers, clay, DNA) and need checking by hand; two yellows that
share a hex with a differently named yellow (`chi3_s` and `fe_edta_aq`,
called "pale yellow", share hexes with chemicals called "bright yellow" —
the notebook is still right, because a reaction names colours from its own
products first); and `starch_iodine_aq`, whose only hazard, staining,
carries no GHS pictogram.

## 12. Golden notebook sentences (BUILD_PHASE_2.md stage 2.1.3)

`tests/golden/notebook-sentences.json` holds the exact sentence the
notebook writes for each of the 394 reactions, with its conditions met,
plus — for the 136 rules that have conditions — the sentence a student
reads when they are not ("needs to reach about 900 °C", "needs an electric
current", "needs to be kept below about 5 °C"). It also records which
rules fired, so a rule quietly overtaken by another shows up even when the
words match. `npm test` fails on any difference; an intended change is
approved with `npm run golden:update` and committed with the change.

Generating the first snapshot confirmed every reaction fires as itself
when its conditions are met, and every `noReaction` rule answers as
itself. Five "not met" sentences are not "needs …" messages, and all five
are correct behaviour: too warm, nitrous acid and the diazonium salt
decompose by their own rules; catalase too hot is answered by the
denatured-enzyme rule; and phenol with alkali reacts on its own when the
coupling is too warm.

Noted for a decision, not changed: the notebook calls every solid
described in `effects.precipitate` "a precipitate", and about twenty of
those are not precipitates — molten sodium and aluminium, metal plated on
a cathode, a silver mirror, residues left on heating, ammonium chloride
smoke, a char. Changing the wording is a change to `describeEffects` in
the engine, so it needs the owner's approval; the golden tests will then
show exactly which sentences move.

# Stage 2.2.1: amounts in the data (proposal)

**Status:** **approved by the owner on 2026-11-22.**
- **Decision 1:** amounts are approved as written.
- **Decision 2:** option (b+), "strong excess", for pH.

No code is written yet; stage 2.2.2 builds it.

**What it is for:** today a reaction uses up every reactant completely, however much of each was
added. With amounts, the lab works out which reactant runs out first. The rest stays in the
vessel, and the next reaction (§7's cascade) gets what is left.

**The rule that does not change:** *what* reacts with *what* still comes only from
`reactions.json`. Amounts are arithmetic on numbers that are already curated:
- concentration × volume;
- mass ÷ molar mass;
- the numbers in front of each formula in the curated equation.

Nothing is predicted.

---

## 1. On chemicals: two new fields

### `concentrationM`: the label's concentration as a number, in mol per litre

```json
{ "id": "hcl_1m", "concentration": "1 M", "concentrationM": 1.0 }
{ "id": "hcl_conc", "concentration": "concentrated (about 36%, roughly 12 M)", "concentrationM": 11.6,
  "sources": [{ "ref": "...", "url": "...", "checked": "...", "covers": ["concentration"] }] }
```

- **What gets one:** curated, never read off the `concentration` words. 36 solutions on the shelf
  have a plain molarity on their label ("0.1 M", "1 M"). Those get the same number.
- **Concentrated acids and ammonia** need a sourced value, `covers: ["concentration"]`: the label
  says "about 12 M", and 36% hydrochloric acid is 11.6 M.
- **"Dilute", "saturated", "1 %", "household"** get no `concentrationM` until somebody sources one.

### `acidBase`: a strong acid or strong base, for the pH of an excess (decision 2, option b+)

```json
{ "id": "hcl_1m", "acidBase": { "kind": "strong_acid", "perFormula": 1 } }
{ "id": "naoh_1m", "acidBase": { "kind": "strong_base", "perFormula": 1 } }
```

- **`kind`:** `strong_acid` or `strong_base`.
- **`perFormula`:** the H⁺ or OH⁻ each formula unit gives. Calcium hydroxide gives 2.
- **Curated with a source**, `covers: ["acidBase"]`. Never deduced from a formula or from the
  `category` drawer.
- **Weak acids and bases** (ethanoic acid, ammonia) get none: their pH stays curated.
- **Sulfuric acid** needs its own sourced decision when its field is written, because its second
  proton is only partly given up.

**How it is used:** when a reaction leaves one of these in excess, and nothing else in the vessel
has an `acidBase`, the pH is worked out from that leftover:
- strong acid: pH = −log(mol H⁺ ÷ litres);
- strong base: pH = 14 + log(mol OH⁻ ÷ litres).

In every other case the rule's curated `resultPH` stands, as today.

### How an amount is worked out, from fields that already exist

| What is added | Amount in moles |
|---|---|
| a solution with `concentrationM` | mL × concentrationM ÷ 1000 |
| a solid | grams ÷ `molarMass` |
| a pure liquid (ethanol, bromine) | mL × `density` ÷ `molarMass` |
| a gas from the shelf | **plenty.** It is bubbled in from a cylinder, so it never runs out. This is the same basis `tempDeltaC` already uses for gases. |
| anything else | **amount not known: treated as plenty** |

**"Amount not known" is the backwards-compatible part:**
- It covers a solution with no `concentrationM`, and the 62 substances with no molar mass
  (starch, albumin, polymers, cloth).
- These always count as being in excess, so they never limit a reaction.
- If *every* reactant in a rule is "not known", the rule behaves exactly as it does today.

**Water** counts as plenty when it is the solvent. A reaction that makes water does not add it to
the volume: 5 mmol of water is 0.09 mL.

---

## 2. On reactions: one new field

### `coefficients`: the equation's numbers, by chemical id

```json
"equation": "CaCO₃ + 2HCl → CaCl₂ + CO₂ + H₂O",
"coefficients": { "caco3_s": 1, "hcl_1m": 2, "cacl2_aq": 1, "co2_g": 1, "water": 1 }
```

- **What it is:** a map keyed by chemical id, so `reactants` and `products` stay exactly as they
  are. Every rule, test and golden sentence that reads them keeps working.
- **What the validator checks:**
  - every reactant and product has a positive whole number;
  - no other id is in the map;
  - where the equation is readable, each number matches the number in front of that chemical's
    formula in the equation. The equation stays the source of truth, and the map is a copy of it
    that the engine can read, so the two must agree. `scripts/lib/equation-balance.mjs` already
    reads equations.
- **A catalyst** gets no coefficient: it is not used up.
- **No `coefficients`** means the rule works exactly as it does today, with everything used up.
  Stage 2.2.3 adds them in batches of 30.

---

## 3. What the engine does with them (stage 2.2.2, for review now)

1. **How far the reaction goes.** For each reactant with a known amount, divide its moles by its
   coefficient. The smallest answer is how far the reaction goes, and that reactant is the
   **limiting reagent**. Reactants of unknown amount are left out of this, as plenty.
2. **What is used up and what is made.** Each reactant loses coefficient × that much. Each product
   gains coefficient × that much. Anything below 0.001 mmol counts as gone, so rounding never
   leaves a ghost behind.
3. **The excess stays in the vessel.** Then §7's cascade checks again with what is left, so excess
   acid goes on to react with the next thing.
4. **A rule cannot fire twice on its own leftovers:** its limiting reagent is gone, so the rule no
   longer matches. Add another portion of acid and it matches again. That is how "add acid until
   it stops fizzing" works.
5. **A finished reaction plus its own excess is "settled", not "unknown".** Today, a vessel holding
   exactly a rule's products is recognised as that rule having finished. This widens to "its
   products plus some of its own reactants". Without it, the excess acid left after a
   neutralisation would make every later action say "not available yet".
6. **Volume.**
   - A solution that is partly used up loses that share of its millilitres.
   - The freed volume goes to the products in solution, as today.
   - The vessel's total liquid stays the same.
7. **A precipitate gets a mass:** moles × molar mass. Today it is "recorded but not weighed". The
   properties card can then say "0.12 g of lead(II) iodide".
8. **Temperature is scaled from the rule's stated basis**, where that basis can be worked out:
   - **Two solutions:** the basis is equal volumes as labelled, so the rise is scaled by the moles
     that reacted per mL of mixture, compared with that basis.
   - **A solid in water:** the basis is 10 g in 100 mL.
   - **A solid in a solution:** this basis was deliberately left open (CLAUDE.md §5). Those keep
     today's value until a rule carries a sourced enthalpy. That would be an optional
     `deltaHkJPerMol`, added in 2.2.3, not now.

**What this still does not model** (said plainly, so nobody expects it):
- **Two rules competing for one limiting reagent.** For example, a little silver nitrate added to
  chloride *and* iodide: the rules run in id order. Real chemistry says silver iodide forms first,
  because it is less soluble. That would need curated data, and is not part of this proposal.
- **Equilibria:** weak acids, Kc, solubility products. Their pH stays curated.
- **Gases cannot be poured between vessels** (batch.md §7).

---

## 4. Three real reactions, converted

### 4.1 Calcium carbonate + hydrochloric acid: a solid, a solution and a gas

`rxn_carbonate_caco3_hcl` gains one field:

```json
"coefficients": { "caco3_s": 1, "hcl_1m": 2, "cacl2_aq": 1, "co2_g": 1, "water": 1 }
```

**1.00 g of marble chips, then 10 mL of 1 M acid at a time:**

| Step | Calcium carbonate | Hydrochloric acid | What the student sees |
|---|---|---|---|
| start: 1.00 g | 9.99 mmol | none | none |
| + 10 mL (10 mmol) | 9.99 − 5.00 = 4.99 mmol left | all used; **limiting** | fizzing, 5.0 mmol CO₂ (about 120 mL of gas) |
| + 10 mL | 4.99 → gone; **limiting** | 10 − 9.98 = 0.02 mmol left | fizzing, then it stops |
| + 10 mL | none | 10.02 mmol, in excess | **no fizzing**: nothing left to react |

**Today:** the first portion uses up the whole gram of marble.

### 4.2 Lead(II) nitrate + potassium iodide: a precipitate with a mass

`rxn_precipitation_pbno3_ki`:

```json
"coefficients": { "pbno3_0_1m": 1, "ki_0_1m": 2, "pbi2_s": 1, "kno3_aq": 2 }
```

**5 mL of each 0.1 M solution:**
- Lead nitrate: 0.50 mmol.
- Potassium iodide: 0.50 mmol, but 2 are needed per lead, so **iodide is limiting**.
- The reaction goes as far as 0.25 mmol: 0.25 mmol of PbI₂ forms, which is **0.115 g**.
- **0.25 mmol of lead nitrate is left in solution.** Add more KI and more yellow precipitate forms.

**Today:** both are used up, and a second portion of KI says "not available yet".

### 4.3 Hydrochloric acid + sodium hydroxide: the reason for decision 2

`rxn_neutralisation_hcl_naoh`:

```json
"coefficients": { "hcl_1m": 1, "naoh_1m": 1, "nacl_aq": 1, "water": 1 }
```

**25 mL of 1 M NaOH, then 15 mL of 1 M HCl:**
- 15 mmol react.
- **10 mmol of NaOH is left in 40 mL:** 0.25 M hydroxide.
- The true pH is **13.4**. Today's lab reads **7**, the rule's curated `resultPH`, which assumes
  equal amounts.
- The amounts above are pure arithmetic. The pH is where a decision is needed.

---

## 5. Decisions for the owner

### Decision 1: approve adding amounts to the engine

This is the largest engine change the project has made. It changes:
- `container.js`: each substance gains a `mol` alongside its mL or g;
- `engine.js`: the limiting reagent, the excess, and "settled with excess";
- the validator: the coefficients check.

It stays inside §6, because it is arithmetic on curated numbers.

### Decision 2: the pH when a reaction leaves something in excess

| Option | What it means | Good | Costs |
|---|---|---|---|
| **(a) curated points** | each titration pair gets a sourced list of pH against "how far to the end point"; the display reads between them | closest to §6.6's wording | about 10 sourced points per pair; reading between points is poor near the end point, where pH jumps 6 units in one drop, which is exactly what a titration is about |
| **(b) strong pairs only** | pH = −log[H⁺] from the excess, for rules the data marks as strong acid + strong base | exact for those, and it is the textbook definition rather than a model | every other rule keeps its curated pH, so Mg + excess HCl still reads 6 |
| **(b+) strong excess** (recommended) | as (b), but keyed to the **excess reagent**, not the rule: when what is left over is a curated strong acid or strong base (a new `acidBase` field on HCl, HNO₃, NaOH, KOH…), its pH comes from its moles left in the volume; anything else keeps its curated pH | fixes Mg + excess HCl, marble + excess acid and the titration, all with one curated field; weak acids, buffers and equilibria are never computed | sulfuric acid's second proton is only partly given up, so it needs its own sourced decision when its field is written |

At these concentrations the calculation ignores activity (how far real ions behave unlike ideal
ones). At 1 M that moves pH by about 0.1. The pH paper reads in whole units, so the student cannot
see the difference.

# Project review against CLAUDE.md (Phase 10.3)

**Date:** 2026-11-21, at commit `5c3d8e4` (10.2).
**Asked:** "an honest list of what doesn't meet the spec, what's fragile, and what will break
first as content grows."

Every claim below was checked on the code or data that day; how each was checked is given with
it.

> **Fixed on 2026-11-22:**
> - **1.1, the three-substance bug.** The engine fix was approved by the owner.
>   - The new test `tests/engine-three-substances.test.js` sweeps every case. It fails 4 of 5 on
>     the old engine and passes on the new one.
>   - The packaged-app smoke test now adds salt and potassium iodide first, then lead(II)
>     nitrate, and passes.
>   - No approved notebook sentence changed.
> - **1.6, the six large shadows.** Each is now a small `0 4px 12px` shadow.
>
> Everything else below is still open.

---

## Summary

- **One serious accuracy bug, found by this review.** In Free Lab, three substances in one vessel
  can give "No observable change" when a reaction should happen. Fix it before v1.0.
- **One known gap is bigger than it looks.** The engine ignores amounts, so uneven acid and
  alkali still read pH 7, and the guided titration allows that.
- **Content:** 28% of reactions have a source somebody actually opened.
- **The rest is sound:**
  - fully offline;
  - the engine/UI boundary holds;
  - 890 tests pass;
  - the content validator finds no errors;
  - every reaction has a source line and an approved notebook sentence.

---

## 1. What does not meet the spec

### 1.1 Three substances in one vessel can give a false "No observable change" (§6) — serious

**What happens.** A student adds sodium chloride solution, then potassium iodide, then lead(II)
nitrate to one beaker. The notebook says "No observable change" three times. In reality yellow
lead(II) iodide precipitates at once, and white lead(II) chloride with it.

**How it was found.** This went through the student's own actions (`addChemical` three times),
not a shortcut. A sweep of every pair of rules that share one reagent found **206 different
three-substance mixtures** where a real reaction is hidden like this. Examples:

| In the vessel | Should show | The lab says |
|---|---|---|
| NaCl + KI + AgNO₃ | silver halide precipitate | No observable change |
| NaCl + KI + FeCl₃ | iodine (brown colour) | No observable change |
| Cu + dilute HCl + Pb(NO₃)₂ | lead chloride precipitate | No observable change |

**Why.** When more than one rule could apply, the engine picks one with the most reactants, and
breaks a tie by **alphabetical order of the rule's id**. The no-reaction rules' ids begin
`rxn_none_`. That sorts before most real ones (`rxn_precipitation_`, `rxn_redox_`, `rxn_qa_`),
so "NaCl and KI do nothing" wins over "Pb(NO₃)₂ and KI precipitate".

A no-reaction rule also wins when the vessel holds a substance the rule says nothing about. The
lab then claims "no observable change" for a mixture it has no data on. §6.2 says that must be
"not available in this version of the lab yet".

**Guided mode is not affected.** Each experiment's reagents were run as the steps add them, and
all reacted correctly.

**Proposed fix (engine, `src/core/engine.js`, needs approval):**
- A no-reaction rule decides the result only when it accounts for everything in the vessel.
  Otherwise the engine keeps looking: a real reaction among those substances runs.
- If nothing explains the rest, the lab says "not available yet". That way the unknown log
  also records it.
- A test sweeps every such three-substance mixture so this can't come back.

The approved notebook sentences are per reaction, so they should not change.

**Done (2026-11-22).** Implemented as proposed:
- 0 of the 206 mixtures are now hidden.
- No approved notebook sentence changed.
- 895 tests pass.

**One limit remains, and it is 3.1's.** NaCl + KI + Pb(NO₃)₂ now precipitates the yellow lead(II)
iodide. It does not also give white lead(II) chloride, because without amounts the lead is used
up by the first rule. That waits for stage 2.2.

### 1.2 The engine has no amounts (§5, §6.6, §7)

This is recorded in `batch.md` §7 and planned as BUILD_PHASE_2.md stage 2.2. That stage has not
started; its first step is an owner decision. What it means in practice, checked today:

- **40 mL of 1 M sodium hydroxide with 15 mL of 1 M hydrochloric acid reads pH 7.** The real
  answer is about 13.6. §6.6 says a wrong pH is worse than an approximate right one.
- **The guided titration accepts this.** Its steps take anywhere from 15 to 40 mL of each
  solution, then expect pH 7.
  - It is a neutralisation, not a titration: there is no burette, no indicator, and no
    concentration worked out.
  - The objective in §5's own example, "determine the concentration of an unknown NaOH", cannot
    be done in this version.
- **A reaction uses up a reactant entirely, however much was added.** Excess metal vanishes. When
  one reagent should precipitate two ions, only one precipitate forms.
- **Adding water to a solution** gives "not available yet", because dilution isn't modelled.
- §7 says containers hold amounts. They do, but the engine never reads them.

### 1.3 The hardware floor has not been proven (§2)

- The ≥30 fps on an i5 5th-gen / i3 4th-gen with integrated graphics has never been measured.
- The only baseline is this PC, an i7-1355U: 3.06 ms a frame.
- The same PC measured about 6.5–7 ms today with no code change, so one run is not reliable
  evidence either way.
- The final check in BUILD_PROMPTS.md (`npm run perf -- --record` on a lab PC) is still to do.

### 1.4 Most reactions still rest on a source nobody has opened (§6.4, §6.5)

- **What meets the rule:** all 394 reactions have a `source`, so §6.4 is met in letter.
- **What has been confirmed:** only **112 (28%)** carry a `sources` entry from a page somebody
  actually opened.
- **The other 282** cite a textbook that nobody on the project has checked.
- **The teacher review pack** covers 30 of them, so even once it comes back, most will still be
  unconfirmed.
- **22 gas-producing rules** have no curated bubbling rate (`gasRate: null`, allowed by the
  spec, listed by the validator).

### 1.5 `equipment.json` is empty; apparatus is defined in UI code (§3, §5)

- §3 says all content lives in data files.
- **Where apparatus is defined:** `src/data/equipment.json` is `[]`. The vessels and furniture
  (beakers, tubes, burner, baths, stand, fume cupboard) are defined in `src/ui/app.js`.
- **No check on experiments:** each experiment's `apparatus` list is required but checked against
  nothing. The titration's list names no burette.

This doesn't cause wrong chemistry, but adding apparatus means editing code, not data.

### 1.6 Large box-shadows on six panels (§9)

- §9 says no large box-shadows.
- The hazard, properties, structure, 3D, guided-summary and amount panels each have one
  (`0 22px 60px`, or `0 20px 50px`).
- They are static and only on dialogs over the bench, so the cost is small.
- It is a one-line fix each.

**Done (2026-11-22):** each is now `0 4px 12px`. All six panels already have a border.

### 1.7 Some files are very large (§9: "prefer many small files")

| File | Lines |
|---|---|
| `src/styles/bench.css` | 4,696 |
| `src/ui/bench.js` | 3,195 |
| `src/ui/app.js` | 2,139 |
| `src/ui/panels.js` | 1,018 |

Every other file is under 900 lines, most well under. "The bench file" now means a fifth of all
the code, which makes problems hard to describe and reviews slow.

### 1.8 The installer is unsigned (§2, distribution)

Not a spec rule, but it affects "copy to a USB, install, it works". Windows SmartScreen warns on
every lab PC until a code-signing certificate is bought. That is a paid yearly purchase and the
owner's decision.

---

## 2. What does meet the spec

Checked today:

- **Offline (§2):** `npm run smoke` runs the built app. It made 52 requests, all its own files,
  and nothing from the network. No `fetch`, web socket or web address is used anywhere in
  `src/`. Fonts and images are bundled.
- **The boundary (§4):** no `document`, `window` or other page access anywhere in `src/core/`.
  The core imports only its own files and the data files. No chemical id is written into engine
  code.
- **The three outcomes (§6.2)** exist and are worded as the spec says, apart from 1.1.
- **The unknown-combination log (§6.3)** is written to `unknown-pairs.json` in the app's data
  folder, one record per combination, so it stays small.
- **Engine rules (§7):**
  - matching sorts reagent ids;
  - the cascade is capped at 10;
  - heat, temperature, current and catalyst gate rules;
  - tools only read;
  - every action writes a notebook sentence.
- **Content checks:** `npm run validate` finds no errors (29 warnings to look at). `npm test`
  runs 890 tests, all passing. All 394 reactions have an approved golden sentence.
- **Guided mode:** 18 experiments (7 Matric, 6 FSc, 5 BS), within §1's 15–20.
- **Hazard entries (§5):** the 108 hazard rules give the danger and what to do instead; none give
  a quantity.
- **Performance budget (§9):**
  - no `filter: blur()`;
  - no WebGL;
  - every animation and transition moves only `transform` and `opacity` (all 17 keyframe
    animations checked).
- **Accessibility (UI.md §8):** `npm run access` passes everything, including the 40×40 targets.

---

## 3. What is fragile

1. **Which rule wins depends on rule ids being in alphabetical order.**
   - This is the cause of 1.1, and it outlasts that fix: when two real reactions of the same
     size both apply, the alphabetically first one runs.
   - Without amounts it uses up the shared reagent, so the other never happens.
   - **Renaming a rule can change what a different mixture does,** and no test would notice,
     because the tests check rules one at a time.
2. **Colour words come from looking up a hex code.** The validator warns that three colours are
   named differently by different chemicals. For example, `#E8C547` is "bright yellow", "pale
   yellow" and "yellow". Which word the notebook writes depends on where the lookup finds it
   first.
3. **Sodium chloride solution alone in a beaker** tells the student it "needs an electric current
   passed through it before anything happens". This is true of the electrolysis rule, but it
   reads as if salt water does something odd. It is already an open item and needs a wording
   decision.
4. **The large UI files** (1.7). A change to `bench.js` can reach almost any part of the bench.
   The screenshot and access scripts catch a lot, but not everything.
5. **The performance measurement is noisy.** The same code measured 3.06 ms and about 7 ms on
   different days. A 20% threshold will either cry wolf or miss a real slowdown.
6. **Building needs the internet once.** electron-builder downloads the Electron runtime if its
   cache has been cleared. The built app needs none.

---

## 4. What will break first as content grows, in order

1. **Three-substance mix-ups (1.1).**
   - They grow with every new no-reaction rule that shares a reagent with a real one: 206
     mixtures today.
   - Salt analysis is exactly where students put several reagents in one tube, so Free Lab users
     will meet it first.
   - Fixing the engine stops the growth. Without the fix, each new "nothing happens" rule hides
     more real reactions.
2. **The unconfirmed-source backlog (1.4).**
   - Content is added faster than anyone can check it: 282 unconfirmed reactions now, and each
     new one adds to the pile unless it arrives with a web source.
   - §6.5 is the rule most at risk.
3. **Colour-name clashes (3.2).** More chemicals means more shared hex codes, and more chances
   for the notebook to name a colour differently from the label on the bottle.
4. **The shelf at 1366×768.** After the 40 px controls, the reagent list shows about two and a
   half reagents before it scrolls, out of 180 on the shelf. Every reagent added makes finding
   one slower. Search and the drawer filter help; a taller list or a collapsible control row
   would help more.
5. **Hand-editing the data files.**
   - `reactions.json` is 593 KB and `chemicals.json` 445 KB, each a single file.
   - The validator catches mistakes, but finding the right entry and reviewing a change get
     harder.
   - Two people editing at once will collide.
6. **The golden sentence file** grows by one sentence per reaction, and every content change
   shows up in it. That is the point of it, but its diffs will need reading with care.

**Not a problem as content grows:**
- engine speed: it checks 394 rules per action, which is instant, and would still be at ten
  times that;
- start-up time;
- the size of the unknown log.

---

## 5. Recommended order

1. **Before tagging v1.0:** approve and fix 1.1 (engine), with a test sweeping all
   three-substance mixtures. Remove the six large shadows (1.6).
2. **Before a teacher uses the guided titration in class:** either narrow its steps to equal
   volumes, so pH 7 is true, or rename it "Neutralisation" until stage 2.2. Owner's choice.
3. **Next phase of work:** stage 2.2, amounts. It fixes 1.2 and the "one precipitate only" half
   of 3.1.
4. **Ongoing:** second sources for the 282, starting with the Matric level; settle the 3 colour
   clashes; move apparatus into `equipment.json` when apparatus next changes.
5. **Owner's checks:** install on a lab PC, run `npm run perf -- --record`, and decide on code
   signing.

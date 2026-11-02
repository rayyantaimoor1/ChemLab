# Build Phase 2 — From "working lab" to "real lab"

> **What this file is.** `BUILD_PROMPTS.md` took the app from an empty folder to a shipped v1
> (Phases 0–10). This file is the plan for **v2**: making the lab more realistic, more accurate,
> more efficient and harder to get wrong — without breaking a single rule in `CLAUDE.md`.
>
> It works exactly like `BUILD_PROMPTS.md`: stages in order, each split into small sub-steps, a
> model suggested for each, a copy-paste prompt, and a **✅ Check** that must pass before moving on.
> Use the same **save routine** (git status → diff → commit → push) at the end of every sub-step
> that changes engine code, and at the end of every stage otherwise.

---

## Ground rules for all of Phase 2

These do not change just because we are improving things. Read them before every stage.

1. **`CLAUDE.md` still wins.** The engine never invents chemistry (§6), tools never change state
   (§7), the engine knows nothing about the UI (§4), offline-only, 30 fps on integrated graphics.
2. **"More realistic" never means "more made up".** Every new number a student sees — a
   temperature, a volume reading, a pH, a colour — is either curated in JSON with a `source`, or
   is plain arithmetic on curated numbers (e.g. moles = concentration × volume). Nothing is
   *predicted* from first principles.
3. **Every engine change needs the owner's approval first.** Phase 8 approved five engine changes
   one at a time; Phase 2 contains several more. Each stage below that touches `src/core/` lists
   its **decision needed** at the top — answer it in chat before Claude Code writes any code, and
   record the decision in `CLAUDE.md` §8 afterwards, the same way the Phase 8 note does.
4. **One stage at a time.** Do not start a stage until the previous one's ✅ Check has passed.
   Each stage leaves the app installable and working.
5. **Tests grow with the app.** Every sub-step adds tests for what it changes. `npm test` and
   `npm run validate` must both be green before every commit.

---

## Model choice (updated)

| Model | Use it for |
|---|---|
| **Opus 5.5** | Engine changes (amounts, gases, separation), schema design, accuracy audits, any chemistry content, anything that resisted one fix attempt |
| **Sonnet 5.5** | UI wiring, effects, apparatus drawings, IPC/preload plumbing, packaging, writing tests |
| **Haiku 5.5** | Renaming, reformatting existing JSON, moving files — no judgement involved |

The Phase 1 rule still overrides the table: **no cheap model writes chemistry content, ever.**

---

## The stages at a glance

| Stage | Theme | Main result | Engine change? |
|---|---|---|---|
| **2.0** | Foundation | Supported Electron, saved notebook, unknown-pair log on disk, CI | No (main/preload only) |
| **2.1** | Accuracy assurance | Every rule double-sourced, golden-text tests, teacher review loop | No |
| **2.2** | Amounts & stoichiometry | Limiting reagents, excess, partial reactions, real titration maths | **Yes** |
| **2.3** | Gases that travel | Delivery tubes, collecting gas, splint and limewater tests done properly | **Yes** |
| **2.4** | Separation techniques | Filtration, evaporation, crystallisation, distillation, separating funnel | **Yes** |
| **2.5** | Real technique & measurement | Dropwise burette, meniscus reading, instrument precision, sig. figs | Small |
| **2.6** | Mistakes & lab safety | Contamination, overfilling, wrong order, closed-vessel heating, PPE | **Yes** |
| **2.7** | Realistic effects | Mixing gradients, boiling, steam, flame types, settling layers, sound | No (UI only) |
| **2.8** | Efficiency & performance | Faster start-up, smaller installer, quality tiers, frame budget tests | No |
| **2.9** | Guided mode depth | Practical-exam mode, viva questions, teacher/projector mode, printable results | Small |
| **2.10** | Field test & ship v2 | Tested on real lab PCs with real students, v2.0.0 installer | No |

Stages 2.0 and 2.1 come first on purpose: everything after them is safer once mistakes are
caught automatically and the content has been audited.

---

## Stage 2.0 — Foundation and safety net

**Why:** before adding features, close the gaps v1 left in the plumbing. Right now the student's
notebook is lost when the app closes, the "unknown combinations" log that `CLAUDE.md` §6.3 calls
*the content roadmap* never reaches disk (`preload.js` exposes nothing yet), and the app runs on
Electron 33, which no longer receives security fixes.

**2.0.1 — Sonnet — Move the project out of OneDrive**
> The project lives inside OneDrive, which syncs node_modules and build output. Tell me the exact
> steps to move the repo to C:\chemlab, reinstall dependencies there, and confirm tests pass and
> the app starts. Don't delete the old copy — I'll do that once I've checked the new one.

**2.0.2 — Sonnet — Upgrade Electron**
> Upgrade Electron from 33 to the newest version that is still supported, and electron-builder to
> match. Read the breaking-changes notes for every major version in between and list anything that
> affects main.js or preload.js before changing code. Then run the tests, start the app, and build
> the installer.

✅ **Check:** the installer builds, installs and opens; every guided experiment still runs.

**2.0.3 — Opus — The preload bridge**
> Design a small contextBridge API in preload.js, backed by ipcMain handlers in main.js, for
> exactly three things: saving/loading the student's notebook, appending unknown combinations to
> a local log file, and saving a notebook export. Explain the API before writing it. Nothing in
> src/core/ changes — the engine already hands unknown pairs to its caller. No Node APIs leak to
> the renderer; validate every argument in main.js.

**2.0.4 — Sonnet — Wire it up**
> Connect src/ui/app.js to the bridge: the notebook survives closing and reopening the app, a
> "New session" button starts a fresh one, and every "isn't available in this version yet"
> result is appended to unknown-pairs.json in userData. Add a menu item that opens the userData
> folder so a teacher can copy that file onto a USB.

**2.0.5 — Sonnet — Continuous integration**
> Add a GitHub Actions workflow that runs npm test and npm run validate on every push, on
> windows-latest. This runs on GitHub only — it adds nothing to the app and makes no runtime
> network calls.

✅ **Check:** close the app mid-experiment, reopen it — the notebook is still there. Mix two
reagents with no rule, then find that pair in `unknown-pairs.json`. A deliberately broken test
turns the GitHub check red.

---

## Stage 2.1 — Accuracy assurance

**Why:** 389 reactions were each checked when written, but a single wrong colour is a wrong answer
in a practical exam. This stage builds machinery that catches errors *before* students see them,
and keeps catching them as content grows.

**2.1.1 — Opus — Second-source audit**
> Add an optional `sources` array (keeping `source`) and audit every reaction in batches of 25:
> confirm products, equation balance, colours, precipitate descriptions and hazard text against a
> second reference (Vogel, CRC, Housecroft & Sharpe, Clayden, or the Punjab/FBISE textbook). List
> every disagreement for me to decide — do not silently change anything. Record the audit in
> batch.md as a new section.

**2.1.2 — Opus — Equation and data checks in the validator**
> Extend scripts/validate-content.mjs to check: every equation is atom-balanced and
> charge-balanced (parse the formula text; flag anything it can't parse rather than skipping it);
> every colorToHex is visually consistent with its colour name (flag "blue" with a red hex);
> every hazard has GHS categories; every pH is within 0–14; every level tag is one of the three.
> Report warnings separately from errors.

**2.1.3 — Sonnet — Golden-text tests**
> For every reaction, generate a snapshot of the exact notebook sentence the student would read,
> stored under tests/golden/. A test fails if any sentence changes. Changing wording on purpose
> then means re-approving the snapshot — so no observation changes by accident.

**2.1.4 — Sonnet — "Report a problem" button**
> Add a small "This looks wrong" link to every reaction result. It writes the reaction id, the
> vessel's state and an optional note from the student to reports.json in userData (via the
> bridge from 2.0.3). Offline only — the teacher collects the file.

**2.1.5 — Owner — Teacher review**
> Not a prompt. Give the installer to two chemistry teachers (one Matric, one FSc) with a checklist
> of the 30 most-used reactions. Every disagreement goes back through 2.1.1's process.

✅ **Check:** the validator reports zero errors; every reaction has two sources; golden tests pass;
both teachers' comments are resolved and logged in batch.md.

---

## Stage 2.2 — Amounts and stoichiometry

**Why:** batch.md §7 records the biggest honest gap in v1: **the engine has no amounts.** Excess
HCl on a solution holding both silver and lead ions precipitates only one; a reactant is used up
exactly once no matter how much was added; and a titration can't tell you an unknown
concentration. Real labs are all about *how much*.

> **Decision needed before 2.2.1:** approve adding amounts (moles) to the engine. This is the
> largest engine change the project has made. It stays inside the accuracy policy because it is
> **arithmetic on curated numbers** (concentration × volume, balanced coefficients), never a
> prediction of what reacts with what — that still comes only from `reactions.json`.
>
> **Second decision:** pH after partial neutralisation. Options: (a) curated pH points per
> titration pair, with the display interpolating between them; (b) compute pH from moles of excess
> H⁺/OH⁻ for strong acid/strong base only, curated for everything else. Option (a) is closest to
> §6.6.

**2.2.1 — Opus — Schema**
> Propose a schema change, without writing code yet: numeric `concentrationM` on chemicals,
> stoichiometric coefficients on reaction reactants and products, and how solids (grams) and gases
> fit in. It must be backwards-compatible — existing rules with no coefficients keep working
> exactly as they do now. Show me three real reactions converted as examples.

**2.2.2 — Opus — Engine**
> Implement amounts in container.js and engine.js per the approved schema: limiting reagent, the
> excess left behind, partial reaction when one reactant runs out, and the cascade (§7) re-checking
> with what remains. Add tests for the silver/lead excess-HCl case from batch.md §7, and for adding
> acid in small portions to a carbonate until it stops fizzing.

**2.2.3 — Opus — Convert content**
> Add coefficients to the existing reactions in batches of 30, starting with the ones guided
> experiments use. Each batch: tests green, validator green, commit, push.

**2.2.4 — Sonnet — Show amounts in the UI**
> In the properties card, show what a vessel contains in mL and mmol, and say which reagent was
> limiting when a reaction stops. In the notebook, record "excess HCl remains" type observations.

**2.2.5 — Opus — A real quantitative titration**
> Rebuild exp_acid_base_titration so the student titrates a genuinely unknown NaOH (concentration
> chosen per session from a curated list), reads the titre, and calculates the concentration. The
> notebook compares their calculation with the true value using a stated tolerance.

✅ **Check:** the batch.md §7 silver/lead case now behaves correctly; three titrations in a row
give consistent titres that lead to the right concentration; every old test still passes.

---

## Stage 2.3 — Gases that travel

**Why:** `later discussins.txt` and batch.md §7 both note it: gases can't move between vessels, so
the limewater test only works if everything is tipped into one container — which is exactly what a
student must never do in a real practical.

> **Decision needed:** approve gases as species that can leave a vessel through a delivery tube
> and enter another, or be collected over water or in a gas jar.

**2.3.1 — Opus — Design**
> Design how a gas leaves a vessel (only if a tube or open mouth allows it), travels through a
> delivery tube, bubbles into another vessel, or collects in an inverted gas jar. Gas identity and
> what it does in the receiving vessel still come only from reactions.json. Show me the
> limewater, hydrogen "pop" and oxygen "relights a glowing splint" tests in your design.

**2.3.2 — Opus — Engine + tests**
> Implement it. Tests: CO₂ from marble + acid turns limewater milky in a *separate* tube; too much
> CO₂ clears it again (needs 2.2's amounts); a sealed vessel with no outlet builds pressure and
> raises a hazard.

**2.3.3 — Sonnet — Apparatus and tools**
> Add a delivery tube (drag from one vessel's mouth to another), a gas jar, and three gas-test
> tools — a glowing splint, a lit splint, and damp litmus held at the mouth — which read the gas
> above the liquid without changing it, like the other tools.

✅ **Check:** the full "test for CO₂" practical runs in two vessels, exactly as a textbook draws it.

---

## Stage 2.4 — Separation techniques

**Why:** `CLAUDE.md` §1 names **distillation** as a guided experiment, yet the bench has no way to
separate anything. Filtering off a precipitate, evaporating to get crystals and distilling are
core Matric and FSc practicals.

> **Decision needed:** approve a "separate" action family in the engine. It moves species between
> vessels by *physical state and curated boiling point* — it never creates or destroys a substance.

**2.4.1 — Opus — Curated physical data**
> Add boiling point and "soluble in water: yes/no/slightly" to chemicals that need them, with
> sources. List the ones you can't source with confidence instead of guessing.

**2.4.2 — Opus — Engine**
> Implement filtration (precipitate stays as residue, solution passes as filtrate), evaporation
> (water leaves, dissolved solid remains, crystals when curated), simple distillation (the
> lower-boiling liquid moves to the receiver), and a separating funnel (two immiscible layers
> taken off one at a time). Tests for each.

**2.4.3 — Sonnet — Apparatus**
> Draw and wire: funnel + filter paper, separating funnel, condenser with a receiving flask, and a
> thermometer in the still head. Animations: drops in the receiver, crystals forming at the rim of
> the evaporating dish.

**2.4.4 — Opus — Guided experiments**
> Add guided experiments for: separating sand and salt, preparing copper sulfate crystals, and
> distilling an ethanol–water mixture.

✅ **Check:** a student can make lead iodide, filter it, wash it and see a clean yellow residue.

---

## Stage 2.5 — Real technique and real measurement

**Why:** in a real practical, marks come from technique — reading a burette at eye level,
adding dropwise near the endpoint, recording 23.45 mL rather than 23.4523. The bench should reward
the same habits.

**2.5.1 — Sonnet — Dropwise control**
> Give the burette a stopcock: a fast-flow position, a slow position and single-drop clicks. Near
> the endpoint, the colour flashes and fades on each drop before it persists — the colour data
> still comes from the curated indicator rule.

**2.5.2 — Opus — Instrument precision**
> Add a curated precision for each instrument in equipment.json (currently empty): burette
> ±0.05 mL, measuring cylinder ±0.5 mL, thermometer ±0.5 °C, pH paper to the nearest whole unit,
> and so on, with sources. Readings are displayed to that precision. Decide with me whether
> readings should also carry small, seeded, repeatable variation — and if so, record why in
> CLAUDE.md.

**2.5.3 — Sonnet — Meniscus reading**
> Add a zoom-in "read the scale" view for the burette and measuring cylinder, where the student
> reads the bottom of the meniscus themselves and types the value into the notebook.

**2.5.4 — Sonnet — Notebook checks significant figures**
> When comparing a student's reading with the reference, also say whether it was recorded to the
> right precision for that instrument.

✅ **Check:** a titration done carefully matches the reference; one done carelessly (fast flow to
the end, reading the top of the meniscus) is marked as a near-miss with the reason given.

---

## Stage 2.6 — Mistakes and lab safety

**Why:** the most valuable thing a virtual lab can do is let students make the mistakes that are
dangerous or expensive in a real one, and explain them. Right now the bench is too forgiving: the
glassware is always clean, nothing overflows, and order of addition never matters.

> **Decision needed:** approve "technique hazards" — curated rules about *how* something was done
> (order, rate, closed vessel), not *what* was mixed. Same rules as hazard reactions: show the
> danger and the right way, never a recipe for harm.

**2.6.1 — Opus — Contamination**
> Vessels keep a trace of what they last held until rinsed. Unrinsed glassware can trigger the
> previous reagent's reaction with the new one (only via reactions.json), and the notebook says
> why. Add rinse with water / rinse with the reagent as actions.

**2.6.2 — Opus — Technique hazards**
> Curate and implement: water added to concentrated acid (splattering — "always add acid to
> water"), heating a stoppered vessel (pressure), overfilling past capacity (spill on the bench),
> heating a test tube pointed at someone, dropping a reactive metal into a large amount of water.
> Each with a sourced explanation and the correct technique.

**2.6.3 — Sonnet — PPE and the safety check**
> Before Free Lab starts, a short visual check — goggles, lab coat, hair tied back — that the
> student ticks. Hazard alerts then reference it ("goggles would have protected you here"). Keep
> it quick; a teacher can turn it off.

**2.6.4 — Sonnet — Undo, in the right places**
> Free Lab: an undo for the last action, so experimenting is cheap. Guided practical-exam mode
> (2.9): no undo, as in a real exam. Explain in the code why the two differ.

✅ **Check:** each technique hazard triggers, explains itself and states the correct method; none
of them reads as a reward for doing the wrong thing (UI.md §6).

---

## Stage 2.7 — Realistic effects

**Why:** the reaction should be the brightest, most alive thing on screen (UI.md §4). Everything
here is **UI only** — `src/core/` is not touched, and the 30 fps / transform-and-opacity rule
still applies.

**2.7.1 — Sonnet — Mixing**
> When a reagent is poured in without stirring, show the colour starting at the point of entry
> and spreading; stirring finishes the mix. Purely visual — the engine's resolved state is the
> final one either way.

**2.7.2 — Sonnet — Heat you can see**
> Gentle convection shimmer when warm, small bubbles forming on the glass before boiling, a
> rolling boil at the curated boiling point, steam at the mouth, and condensation droplets on a
> cold surface above. A luminous yellow flame when the burner's air hole is closed and a roaring
> blue one when it's open, with the correct teaching note.

**2.7.3 — Sonnet — Precipitates that behave**
> Precipitates differ by curated `density`: fine ones (BaSO₄) cloud the whole liquid and settle
> slowly; heavy ones (PbI₂) settle fast; gelatinous ones (Al(OH)₃, Fe(OH)₃) float in flocs. Shaking
> re-suspends them.

**2.7.4 — Sonnet — Sound (optional)**
> Bundled offline sound effects — pour, fizz, boil, glass clink, hazard tone — with a mute switch
> in the top bar that defaults to OFF on school machines. Check every file's licence before
> bundling. State the size added to the installer.

**2.7.5 — Sonnet — Liquid feel**
> A visible meniscus on every vessel, a gentle slosh when a vessel is dragged, and drips that
> follow the pour stream. All transform/opacity.

✅ **Check:** on the reference low-end PC (or Intel HD integrated graphics), a busy bench — four
vessels, boiling, bubbling and precipitating at once — stays at or above 30 fps.

---

## Stage 2.8 — Efficiency and performance

**Why:** lab PCs are slow, shared and sometimes years old. Start-up time and installer size matter
as much as frame rate.

**2.8.1 — Sonnet — Measure first**
> Add a developer-only performance overlay (hidden behind a keyboard shortcut) showing fps,
> frame-time and memory. Measure cold start-up time, time to first interaction, and memory after
> 10 minutes of use. Write the numbers into a new PERFORMANCE.md as the baseline.

**2.8.2 — Sonnet — Faster start-up**
> Load the molecular and 3D viewers only when opened; build the reaction lookup index once at
> start; defer anything not needed for the first screen. Re-measure against the baseline.

**2.8.3 — Sonnet — Smaller installer**
> Ship only the en-US Chromium locale (electronLanguages), exclude anything in src/ that is not
> loaded at runtime, and report the before/after installer size.

**2.8.4 — Sonnet — Quality tiers**
> Automatically drop to a "low" effects tier (fewer particles, no slosh, no shimmer) if fps falls
> under 30 for two seconds, and let a teacher force a tier in settings. The chemistry shown is
> identical in every tier — only decoration changes.

**2.8.5 — Sonnet — Performance tests**
> Add an automated test that runs a scripted busy-bench scenario and fails if the average frame
> time regresses by more than 20% against PERFORMANCE.md.

✅ **Check:** start-up and installer size are both measurably smaller than the baseline; a busy
bench holds 30 fps on the reference hardware.

---

## Stage 2.9 — Guided mode depth

**Why:** 18 guided experiments teach procedures. Students also need to be *assessed* the way their
board practical exam will assess them, and teachers need a mode for a projector.

**2.9.1 — Opus — Practical-exam mode**
> A mode where hints are hidden, no undo is allowed, and the student is scored on procedure
> (right order, right technique, from 2.5/2.6), observations (from the notebook comparison) and
> calculation (from 2.2). Show the marking scheme for my approval before building it.

**2.9.2 — Opus — Viva questions**
> After each guided experiment, 3–5 short questions of the kind an examiner asks in the viva,
> written per experiment in experiments.json with sources. Multiple choice or short answer; the
> answer is explained either way.

**2.9.3 — Sonnet — Teacher / projector mode**
> Larger text and controls, the notebook collapsed, the current step shown in large type, and a
> "lock steps" switch so the class follows together.

**2.9.4 — Sonnet — Printable results**
> Export the notebook and score as a PDF (offline, using Electron's built-in print-to-PDF) through
> the bridge from 2.0.3.

**2.9.5 — Opus — More experiments**
> Using the new capabilities, add guided experiments for: titration with a calculation, gas
> preparation and testing (CO₂, H₂, O₂), salt analysis start to finish (anion + cation), and
> preparation of a pure dry salt. Each one checked against the Punjab/FBISE practical notebook.

✅ **Check:** a teacher runs a whole class period in projector mode; a student completes a scored
practical-exam run and prints the result.

---

## Stage 2.10 — Field test and ship v2

**2.10.1 — Owner — Hardware test**
> Install the v2 build on at least two real lab PCs at the hardware floor (i5 5th gen / i3 4th gen,
> 8 GB, integrated graphics, 1366×768). Run every guided experiment. Note anything slow or broken.

**2.10.2 — Owner — Student sessions**
> Watch 5–10 students use it without help for 20 minutes. Write down every moment they get stuck.
> Collect `unknown-pairs.json` and `reports.json` from the machines afterwards.

**2.10.3 — Opus — Act on the field data**
> Here are the unknown pairs, problem reports and my notes from the school. Group them, propose
> what to fix and what content to add, most common first. Content goes through the batch process
> in batch.md.

**2.10.4 — Sonnet — Release**
> Bump to 2.0.0, update CLAUDE.md §8 with every Phase 2 decision, update batch.md's snapshot line,
> build the installer and tell me its size and where it is.

✅ **Check:** the v2 installer installs and runs from a USB stick on a lab PC that has never seen
the app, with no internet connection.

---

## Decisions log

Fill this in as each decision is made, then copy it into `CLAUDE.md` §8.

| Stage | Decision | Answer | Date |
|---|---|---|---|
| 2.2 | Add amounts (moles) to the engine | | |
| 2.2 | How pH after partial neutralisation is found | | |
| 2.3 | Gases can leave a vessel and travel | | |
| 2.4 | "Separate" action family | | |
| 2.5 | Seeded variation in instrument readings | | |
| 2.6 | Technique hazards | | |
| 2.7 | Sound in the app | | |

---

## Still out of scope in Phase 2

Unchanged from `CLAUDE.md` §10: photorealistic 3D, fluid simulation, a general reaction predictor,
accounts/cloud/analytics, spectroscopy, multiple languages. Quantum chemistry and rate laws (batch.md
§8) also stay out — they need a different kind of module, not a better bench.

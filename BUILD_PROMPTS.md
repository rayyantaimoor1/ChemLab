# Build Sequence — Prompts for Claude Code

Work through these **in order**. Each prompt assumes the previous one finished, you confirmed it
works, and it's been committed and pushed. Copy prompts one at a time — don't paste several at
once.

Every phase ends with the same three-step save routine. Do it every time, no exceptions — it's
your undo button and your backup if the lab PC's drive dies.

---

## One-time setup (do this once, before Phase 0)

**Local folder**
```
mkdir C:\chemlab
cd C:\chemlab
```
Put `CLAUDE.md`, `UI.md`, and this file inside it.

**Git identity** (skip if already configured on this machine)
```
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

**Create the GitHub repo**
1. Go to github.com → New repository
2. Name it e.g. `virtual-chem-lab`
3. **Private** repo (recommended — chemistry content and school-facing app, no reason to be public yet)
4. Do **not** initialise with a README, .gitignore, or licence — the local repo will provide these

**Connect local to remote**
```
git init
git add CLAUDE.md UI.md BUILD_PROMPTS.md
git commit -m "Initial project spec"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/virtual-chem-lab.git
git push -u origin main
```
Replace `YOUR_USERNAME` with your actual GitHub username. If it asks for credentials and password
login fails, GitHub will prompt you to use a Personal Access Token instead of your password — it
will link you to create one if needed.

**Open Claude Code**
```
claude
```

---

## The save routine (end of every phase)

After you've confirmed a phase works:

> Show me `git status` and `git diff` so I can see what changed before we commit.

Review the summary Claude Code gives you, then:

> Stage and commit everything with a clear, specific commit message describing what this phase
> added. Then push to origin main.

Claude Code will run the equivalent of:
```
git add .
git commit -m "Phase N: <description>"
git push origin main
```

**If a phase involves several risky steps**, ask for a commit after each sub-step, not just at
the end:
> Commit this specific change now, before we move to the next step.

This keeps your rollback points small — if something breaks, you lose one sub-step, not a whole
phase.

---

## Model choice

Switch with `/model` inside Claude Code.

| Model | Use it for | Why |
|---|---|---|
| **Opus 4.8** | Architecture, data schemas, the reaction engine, hazard and guided-mode logic, debugging anything that has resisted one fix attempt | These are the decisions everything else sits on. Getting them wrong costs weeks; getting them right makes later work mechanical. |
| **Sonnet 5** | Implementing clearly-specified features, UI wiring, effects, packaging, writing tests, git operations | Fast and strong. Once the spec is precise, this is the workhorse for most of the project. |
| **Haiku 4.5** | Mechanical reformatting, renaming, moving files, tidying JSON that already exists | Cheapest and fastest for work with no judgement in it. |

**One rule that overrides the table: never use a cheap model to generate chemistry content.**
Reaction data, pH values, colours, and hazards go into the app as fact and get taught to
students. Author that content with Opus, and verify every entry against a textbook or reference
before it ships. A wrong precipitate colour is a wrong answer in someone's practical exam.

---

## Phase 0 — Shell and packaging

Prove you can produce a working `.exe` on day one, before there's anything to lose.

**0.1 — Sonnet**
> Read CLAUDE.md. Set up a minimal Electron project: package.json, main.js, preload.js, and a
> src/index.html that just says "Virtual Chemistry Lab". Use ES modules and contextIsolation with
> nodeIntegration disabled. Don't build any features yet. Then tell me the exact command to run it.

**0.2 — Sonnet**
> Add electron-builder configured to produce a Windows NSIS installer. Add a .gitignore that
> excludes node_modules and the build output folder. Give me the exact command to build the .exe
> and tell me where the output file appears.

**0.3 — Sonnet**
> Create the full folder structure from CLAUDE.md §4 with empty placeholder files.

**Save this phase**
> Show me git status and git diff.

then
> Stage and commit everything with a clear message describing the Electron shell and folder
> structure. Push to origin main.

> ✅ **Check:** build the `.exe`, copy it to a **different PC**, install, and confirm the window
> opens. Do not move on until this works. Packaging problems found now cost hours; found in
> month three they cost weeks.

---

## Phase 1 — Data schemas and engine core (no UI)

**1.1 — Opus**
> Read CLAUDE.md §5 and §6. Create src/data/chemicals.json with exactly 10 chemicals suitable for
> Matric level, following the schema precisely. Include a real source for each. Suggested set:
> HCl, NaOH, NaCl, CuSO₄, Pb(NO₃)₂, KI, AgNO₃, phenolphthalein, distilled water, Zn metal.

**Commit this data file now, before writing more:**
> Stage and commit src/data/chemicals.json with message "Add initial 10 chemicals for Matric
> level". Push to origin main.

**1.2 — Opus**
> Create src/data/reactions.json with 5 reactions using only those chemicals: HCl+NaOH
> neutralisation, Pb(NO₃)₂+KI precipitation, AgNO₃+NaCl precipitation, Zn+HCl gas evolution, and
> one explicit noReaction entry. Follow the schema exactly, including the explanation and source
> fields.

> Stage and commit src/data/reactions.json. Push to origin main.

**1.3 — Opus**
> Build src/core/engine.js. It loads the JSON data and resolves what happens when a set of
> chemicals is combined. Follow CLAUDE.md §6 and §7 exactly — especially the three distinct
> outcomes and set-based order-independent matching. No DOM code anywhere in this file.

**1.4 — Opus**
> Write unit tests for the engine covering: order independence, the three outcome types, cascading
> reactions with the loop cap, and condition gating. Show me how to run them.

**Save this phase**
> Show me git status and git diff, then run the tests and show me the results.

then, only if tests pass:
> Stage and commit the engine and its tests with a clear message. Push to origin main.

> ✅ **Check:** tests pass. Ask Claude Code to demonstrate an unknown pair in the console and
> confirm it says *not available*, not a made-up result.

---

## Phase 2 — Containers, actions, notebook

**2.1 — Opus**
> Build src/core/container.js — vessel state per CLAUDE.md §7. Containers hold multiple species
> with amounts, plus volume, temperature and pH. No DOM code.

**2.2 — Sonnet**
> Build src/core/actions.js with addChemical, pour, setHeat and stir, using the exact signatures
> in UI.md §1. Each action updates container state and triggers an engine check.

**2.3 — Sonnet**
> Build src/core/notebook.js. Every action produces a plain-English log entry automatically.
> Support recordObservation and revealReference for the compare-with-expected feature. Save to a
> local JSON file in Electron's userData folder.

**2.4 — Sonnet**
> Extend the tests to cover pouring between containers, heating, and notebook entry generation.

**Save this phase**
> Run the full test suite and show me the results.

then, only if tests pass:
> Stage and commit containers, actions, and notebook with a clear message. Push to origin main.

> ✅ **Check:** tests pass, and the notebook produces sentences a student would understand.

---

## Phase 3 — Placeholder UI

Deliberately plain. Its only job is letting you *see* the engine working. Resist the urge to make
it pretty — that's Phase 9.

**3.1 — Sonnet**
> Read UI.md §1 and §3. Build a plain placeholder UI with the three-zone layout: reagent shelf,
> bench, notebook panel. Unstyled or minimally styled. It must only read state and dispatch the
> actions in UI.md §1 — no chemistry logic in the UI layer.

**3.2 — Sonnet**
> Add drag-and-drop: drag a reagent from the shelf into a container on the bench. Show the
> container's contents, volume, temperature and pH as plain text.

**Commit here — this is a real milestone:**
> Stage and commit the placeholder UI with drag-and-drop working. Push to origin main.

**3.3 — Sonnet**
> Wire up the notebook panel so entries appear live as actions happen.

**Save this phase**
> Stage and commit the notebook wiring. Push to origin main.

> ✅ **Check:** drag HCl and NaOH into a beaker and watch the result and notebook entry appear.
> **This is the first moment the app is real.**

---

## Phase 4 — Measurement tools

**4.1 — Opus**
> Build src/core/tools.js with pH paper, thermometer, litmus paper and conductivity tester. Tools
> read container state and never modify it. pH paper maps a pH value to both a colour and its
> name — per UI.md §5, always both.

**4.2 — Sonnet**
> Add the tool tray to the placeholder UI. Dipping a tool into a container shows the reading and
> logs it to the notebook.

**4.3 — Sonnet**
> Implement "Compare with reference": the student records their estimate, presses compare, and
> sees their value beside the true value marked as match, near-miss, or miss.

**Save this phase**
> Run the tests, show me the results, then stage and commit the measurement tools with a clear
> message. Push to origin main.

> ✅ **Check:** dip pH paper in HCl, estimate 1, compare, and see it confirmed.

---

## Phase 5 — Effects layer

**5.1 — Sonnet**
> Read UI.md §6. Build src/ui/effects.js with smooth colour interpolation, bubbling, precipitate
> formation and settling, and gas evolution. Animate transform and opacity only. No blur filters,
> no WebGL.

**5.2 — Sonnet**
> Add the pour animation and heat visuals to the bench.

**Commit here before the hazard work, which is higher-risk:**
> Stage and commit the effects layer and pour/heat animations. Push to origin main.

**5.3 — Opus**
> Implement hazard handling: when a reaction has a hazard entry, show the alert overlay with the
> screen-edge flash, icon, and the written warning held on screen. Follow UI.md §5 — never colour
> alone. The visual must convey danger and consequence without glorifying it.

**5.4 — Sonnet**
> Add a "Reduce animation" toggle and honour prefers-reduced-motion.

**Save this phase**
> Stage and commit the hazard handling and reduced-motion support. Push to origin main.

> ✅ **Check:** run it on the oldest PC you can find. If it stutters, fix it now — particle counts
> and simultaneous animations are the usual culprits.

---

## Phase 6 — Molecular view

**6.1 — Sonnet**
> Add 2D structure images to the properties card, loaded from src/data/molecules/. Start with
> static images — simplest and fastest.

> Stage and commit the 2D structure images and properties card update. Push to origin main.

**6.2 — Opus**
> Build the molecular reaction animation system: simple scripted animations of atoms and ions
> rearranging, referenced by the molecularAnimation field in reactions.json. Pre-scripted
> keyframes, not physics simulation.

**6.3 — Sonnet**
> Add a lightweight 3D ball-and-stick viewer for formed products, rotatable by mouse drag. Keep
> it in a modal so it never runs while the bench is animating. Tell me the install size of any
> library before adding it.

**Before committing this one, check the repo size:**
> Run `git count-objects -vH` and tell me the current repo size, and how much the new 3D library
> adds.

then:
> Stage and commit the molecular animation system and 3D viewer. Push to origin main.

> ✅ **Check:** confirm the 3D viewer doesn't drop the bench below 30 fps on integrated graphics.

---

## Phase 7 — Guided experiments

**7.1 — Opus**
> Read CLAUDE.md §5. Create src/data/experiments.json with two complete experiments: an acid–base
> titration and a precipitation reaction. Full steps, hints, and wrong-action messages.

> Stage and commit experiments.json. Push to origin main.

**7.2 — Opus**
> Build src/core/experiments.js — the guided-mode state machine. It validates each student action
> against the current step, gives the hint on a wrong action, and advances on a correct one. It
> guides without blocking curiosity: a wrong action explains itself rather than silently failing.

**7.3 — Sonnet**
> Add guided mode to the UI: experiment picker, step card, progress, and the completion summary
> comparing the student's results with expected values.

**Save this phase**
> Run all tests, show me the results, then stage and commit guided mode. Push to origin main.

> ✅ **Check:** run the full titration start to finish as a student would.

---

## Phase 8 — Content scale-up

This is where the app becomes valuable. If the engine is right, this phase adds **zero code**.
Commit **every single batch** — this phase produces the most content and the most risk of losing
work if you try to batch commits together.

**8.1 — Opus**
> Expand chemicals.json and reactions.json to cover the full Matric syllabus. Work in batches of
> 10 reactions, give me each batch to review before continuing, and cite a source for every entry.

**After each batch of 10 — every time, no exceptions:**
> Stage and commit this batch with a message naming the topic covered, e.g. "Add 10 Matric
> reactions: metal reactivity series". Push to origin main.

**8.2 — Opus** *(repeat per batch, commit after each)*
> Next batch of 10, same rules.

**8.3 — Opus**
> Now the same for FSc 1st and 2nd year.
*(commit after every batch, as above)*

**8.4 — Opus**
> Now general BS-level reactions that fit the existing engine. Tell me honestly which BS topics do
> **not** fit this model and would need a different approach — don't force them in.
*(commit after every batch)*

**8.5 — Sonnet**
> Add the remaining guided experiments to reach 15–20 total.

> Stage and commit the new experiments. Push to origin main.

**8.6 — Sonnet**
> Build a small internal check script that validates all JSON against the schemas and reports any
> entry missing a source, a colour name, or an explanation. Run it now against everything we have.

> Stage and commit the validation script and fix anything it flags before the final commit of this
> phase. Push to origin main.

> ⚠️ **Verify every batch against a textbook before accepting it.** This is the phase where a
> quiet error becomes a wrong answer in a student's exam.

---

## Phase 9 — Real UI

**9.1** — Take screenshots of the working placeholder UI.

**9.2** — In **Claude Design**, provide `UI.md`, the screenshots, and the state shape from UI.md
§1. Ask for the **Free Lab bench screen first** — it's the hardest and sets the language for
everything else.

**9.3 — Sonnet**
> Integrate the new design into the app. Per UI.md §1, this must not require changes inside
> src/core/. If it does, stop and tell me — the boundary is broken and we fix that first.

**Commit before fonts/assets, since that step can be large:**
> Stage and commit the new UI integration. Push to origin main.

**9.4 — Sonnet**
> Bundle all fonts locally and confirm there are no network requests at runtime. Verify by running
> the app with the machine's internet disconnected.

**Save this phase**
> Run `git count-objects -vH` and tell me the repo size now that fonts are bundled. Then stage and
> commit. Push to origin main.

---

## Phase 10 — Ship

**10.1 — Sonnet**
> Full accessibility pass against UI.md §8: keyboard navigation, focus rings, contrast, text
> scaling, click target sizes.

> Stage and commit the accessibility fixes. Push to origin main.

**10.2 — Sonnet**
> Build the final installer with a proper app name, icon, and version number.

**10.3 — Opus**
> Review the whole project against CLAUDE.md and give me an honest list of what doesn't meet the
> spec, what's fragile, and what will break first as content grows.

**Final save of this build cycle:**
> Stage and commit the final installer config. Tag this commit as v1.0 with
> `git tag -a v1.0 -m "First installable release"` and push the tag with `git push origin v1.0`.

> ✅ **Final check:** install on a real 8 GB / i5 5th gen lab PC with no internet. Have an actual
> student use it for ten minutes without you explaining anything. Watch where they hesitate —
> that's your Phase 11 list.

---

## When things go wrong

| Symptom | What to say |
|---|---|
| Feature broke something else | *"Revert to the last commit and try a different approach."* (`git log --oneline` first to see commits, then `git reset --hard <commit>` if needed) |
| Same bug after two fix attempts | Switch to Opus: *"Two fixes haven't worked. Diagnose the root cause before changing any code."* |
| Answer doesn't make sense | *"Explain that in plain English, I'm not a developer."* |
| Claude Code jumped ahead | *"Stop. Go back to Phase N in CLAUDE.md. One phase at a time."* |
| App got slow | *"Profile this and tell me what's costing the most, targeting integrated graphics."* |
| Chemistry looks wrong | *"Show me the source for that entry."* — then check it yourself |
| Push rejected / diverged | *"git pull origin main first, then help me resolve any conflict before pushing again."* |
| Accidentally committed something huge (node_modules etc.) | *"Remove this from git tracking with git rm -r --cached, add it to .gitignore, then commit that fix."* |

---

## Quick command reference

You'll rarely type these yourself — Claude Code runs them — but it helps to recognise what's
happening:

| Command | What it does |
|---|---|
| `git status` | Shows what's changed since the last commit |
| `git diff` | Shows the actual line-by-line changes |
| `git add .` | Stages all changes for the next commit |
| `git commit -m "message"` | Saves a snapshot with a description |
| `git push origin main` | Uploads your commits to GitHub |
| `git log --oneline` | Lists past commits, newest first |
| `git reset --hard <commit-id>` | Rewinds the project to an earlier commit (destructive — loses uncommitted work) |

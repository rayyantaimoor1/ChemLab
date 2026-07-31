# Virtual Chemistry Lab — Project Specification

> This file is the source of truth for the project. Claude Code reads it automatically at the
> start of every session. Do not deviate from it without the project owner explicitly approving
> the change in chat, and update this file when a decision changes.

---

## 1. What we are building

An **offline desktop application** that simulates a chemistry laboratory for students in
Pakistani schools and colleges. It ships as a Windows `.exe` installer, runs with no internet
connection, and requires no login.

**Audience:** Matric (Class 9–10), FSc (1st/2nd year), and general BS-level chemistry students,
plus the teachers demonstrating to them.

**Two modes:**

1. **Free Lab (sandbox)** — the student picks apparatus and reagents freely, mixes, heats, tests,
   and observes what happens.
2. **Guided Experiments** — 15–20 classic experiments (titration, distillation, flame tests,
   salt analysis, etc.) where the app walks the student through the real procedure step by step.

**What "feels real" means here:** correct observable outcomes (colour, precipitate, gas,
temperature, pH), correct products, honest hazard warnings, and a lab notebook the student fills
in and then checks against reference data. It does **not** mean photorealistic 3D.

---

## 2. Non-negotiable constraints

| Constraint | Requirement |
|---|---|
| **Offline** | Zero network calls at runtime. No telemetry, no CDN fonts, no remote assets. Everything bundled. |
| **Hardware floor** | Must run at ≥30 fps on: Intel i5 5th gen (or i3 4th gen), 8 GB RAM, **integrated graphics only**, 1366×768 display. |
| **Distribution** | Single Windows `.exe` installer. Copy to a USB, install on a lab PC, it works. |
| **No accounts** | No login, no cloud, no user data leaving the machine. |
| **Scientific accuracy** | See §6. This is the highest-priority rule in the project. |

---

## 3. Tech stack

- **Electron** — desktop shell
- **Vanilla JavaScript (ES modules)** — no framework for now. Chosen deliberately: fewer moving
  parts, simpler to debug, and the owner is directing rather than coding. Do not introduce React,
  Vue, or a build toolchain without approval.
- **HTML + CSS** — UI layer (see `UI.md`)
- **JSON** — all chemistry content lives in data files, never hardcoded in logic
- **electron-builder** — packaging to `.exe`
- **Vitest** (or node:test) — unit tests for the engine

**Explicitly rejected:** Unity, Godot, C/C++, Python/PyQt, React Native, any game engine.
Rationale: the visual target is 2D/stylised, the maintainer is not a developer, and web tech has
the shortest path from "describe the change" to "working change."

---

## 4. Architecture

The single most important architectural rule:

> **The engine knows nothing about the UI. The UI is a thin render layer over engine state.**

The UI will be redesigned later using Claude Design. If UI work requires touching engine files,
the boundary has been violated — stop and fix the boundary instead.

```
chemlab/
├── CLAUDE.md                 ← this file
├── UI.md                     ← UI/design spec
├── BUILD_PROMPTS.md          ← build sequence
├── package.json
├── main.js                   ← Electron main process (window, menu, file paths)
├── preload.js                ← contextBridge; no nodeIntegration in renderer
├── src/
│   ├── index.html
│   ├── core/                 ← PURE LOGIC. No DOM access anywhere in this folder.
│   │   ├── engine.js         ← reaction resolution
│   │   ├── container.js      ← vessel state (contents, volume, temp, pH)
│   │   ├── actions.js        ← add / pour / heat / stir / dip
│   │   ├── tools.js          ← pH paper, thermometer, litmus, conductivity
│   │   ├── notebook.js       ← observation log + compare-with-reference
│   │   └── experiments.js    ← guided mode state machine
│   ├── data/                 ← ALL chemistry content. Editable without touching code.
│   │   ├── chemicals.json
│   │   ├── reactions.json
│   │   ├── equipment.json
│   │   ├── experiments.json
│   │   └── molecules/        ← .mol files + 2D structure PNGs
│   ├── ui/                   ← DOM, rendering, effects. Replaceable.
│   │   ├── bench.js
│   │   ├── shelf.js
│   │   ├── effects.js
│   │   └── panels.js
│   ├── styles/
│   └── assets/               ← bundled fonts, icons, sounds
├── tests/
└── build/                    ← electron-builder output (gitignored)
```

---

## 5. Data schemas

These are contracts. Adding content must never require changing engine code.

### `chemicals.json`

```json
{
  "id": "hcl_1m",
  "name": "Hydrochloric acid",
  "formula": "HCl",
  "concentration": "1 M",
  "state": "aqueous",
  "colorHex": "#EEF3F5",
  "colorName": "colourless",
  "pH": 1.0,
  "molarMass": 36.46,
  "density": 1.18,
  "solubility": "miscible",
  "hazards": ["corrosive"],
  "levels": ["matric", "fsc"],
  "structure": "molecules/hcl.png",
  "description": "Strong monoprotic acid. Common laboratory reagent.",
  "source": "CRC Handbook 97th ed."
}
```

### `reactions.json`

```json
{
  "id": "rxn_neutralisation_hcl_naoh",
  "reactants": ["hcl_1m", "naoh_1m"],
  "conditions": { "requiresHeat": false, "minTempC": null, "catalyst": null },
  "products": ["nacl_aq", "water"],
  "equation": "HCl + NaOH → NaCl + H₂O",
  "type": "neutralisation",
  "effects": {
    "colorToHex": "#EEF3F5",
    "precipitate": null,
    "gas": null,
    "bubbles": false,
    "smoke": false,
    "tempDeltaC": 12,
    "resultPH": 7.0
  },
  "hazard": null,
  "molecularAnimation": "anim_neutralisation",
  "explanation": "H⁺ from the acid combines with OH⁻ from the base to form water. Na⁺ and Cl⁻ remain in solution as spectator ions.",
  "levels": ["matric", "fsc"],
  "source": "Punjab Textbook Board Chemistry 10, Ch. 5"
}
```

### Electrolysis (variant)

`conditions.requiresElectricity` gates a rule on the power supply being
switched on, exactly the way `requiresHeat` gates one on the burner. It is a
condition in its own right and **not** a catalyst: a catalyst speeds up a
reaction that would happen anyway, while a current *drives* one that
otherwise will not go at all.

A rule may carry both. Molten sodium chloride needs `minTempC: 801` **and**
`requiresElectricity: true`, so a cold vessel is told to melt the salt first
and only then asked for the current.

Every electrolysis rule must also carry an `electrodes` block. Which ion
travels to which electrode is curated chemistry that lives here — the UI
reads it to draw the ions drifting across the vessel, and never works it out
for itself.

```json
{
  "id": "rxn_electrolysis_brine",
  "reactants": ["nacl_1m"],
  "conditions": { "requiresHeat": false, "minTempC": null, "catalyst": null, "requiresElectricity": true },
  "products": ["naoh_aq", "h2_g", "cl2_g"],
  "equation": "2NaCl + 2H₂O → 2NaOH + H₂ + Cl₂",
  "type": "electrolysis",
  "electrodes": {
    "cathode": {
      "sign": "negative",
      "attracts": "H⁺",
      "attractsName": "hydrogen ions from the water",
      "halfEquation": "2H⁺ + 2e⁻ → H₂",
      "product": "h2_g",
      "observation": "Hydrogen, not sodium — the water is discharged in preference to the more reactive metal."
    },
    "anode": {
      "sign": "positive",
      "attracts": "Cl⁻",
      "attractsName": "chloride ions",
      "halfEquation": "2Cl⁻ → Cl₂ + 2e⁻",
      "product": "cl2_g",
      "observation": "Choking pale green chlorine, which bleaches damp litmus paper."
    }
  }
}
```

Each side's `product` must be one the rule actually makes — there is a test
for that, and for both signs being the right way round.

### Hazardous reaction (variant)

```json
{
  "id": "rxn_hazard_bleach_ammonia",
  "reactants": ["bleach", "ammonia_solution"],
  "products": ["chloramine_vapour"],
  "equation": "NaOCl + NH₃ → NH₂Cl + NaOH",
  "hazard": {
    "severity": "high",
    "type": "toxic_gas",
    "title": "Toxic gas released",
    "warning": "This combination releases chloramine vapour, which is toxic to inhale. In a real laboratory this must never be done outside a fume hood.",
    "visualEffect": "toxic_cloud",
    "whatToDoInstead": "Never mix chlorine bleach with ammonia-based cleaners. Ventilate and evacuate if it happens accidentally."
  },
  "levels": ["matric", "fsc", "bs"]
}
```

Hazard entries exist to **teach students what not to do**. They present the danger and the
correct response — never quantities, procedures, or anything that would help someone cause harm.

### Explicit "nothing happens"

```json
{
  "id": "rxn_none_nacl_kno3",
  "reactants": ["nacl_aq", "kno3_aq"],
  "noReaction": true,
  "explanation": "Both salts stay fully dissolved as ions. No precipitate forms because all possible products are soluble.",
  "levels": ["matric", "fsc"]
}
```

### `experiments.json` (guided mode)

```json
{
  "id": "exp_acid_base_titration",
  "title": "Acid–base titration",
  "level": "fsc",
  "objective": "Determine the concentration of an unknown NaOH solution using standard HCl.",
  "apparatus": ["burette", "conical_flask", "pipette", "stand"],
  "reagents": ["hcl_0_1m", "naoh_unknown", "phenolphthalein"],
  "steps": [
    {
      "n": 1,
      "instruction": "Rinse the burette with the standard HCl solution.",
      "requiredAction": { "type": "rinse", "target": "burette", "with": "hcl_0_1m" },
      "hint": "Rinsing prevents dilution of the titrant by leftover water.",
      "onWrongAction": "Rinse the burette with the acid you will fill it with, not with water."
    }
  ],
  "expectedResult": { "endpointPH": 8.2, "indicatorColour": "faint pink" },
  "theory": "..."
}
```

---

## 6. Scientific accuracy policy — highest priority rule

This app will be used to teach. A confidently wrong result is worse than no result.

1. **The engine never invents chemistry.** Outcomes come only from `reactions.json`.
2. **Three distinct outcomes** when the student mixes things — never blur them:
   - A matching rule exists → run it.
   - A rule exists with `noReaction: true` → *"No observable change."* (This is real chemistry
     and should be taught.)
   - **No rule exists at all** → *"This combination isn't available in this version of the lab
     yet."* Never guess, never approximate, never produce a plausible-looking fake result.
3. **Log unknown pairs** to a local file. That log is the content roadmap — it tells you exactly
   what students are trying to do that the app can't yet handle.
4. **Every reaction entry carries a `source` field.** No entry ships without one.
5. **Do not let a fast/cheap model bulk-generate chemistry data unreviewed.** Content must be
   authored carefully and checked against a textbook or reference. See `BUILD_PROMPTS.md` §Model
   choice.
6. **pH and temperature values are curated, not computed.** A simplified simulation that outputs
   a wrong pH to two decimal places is worse than one that outputs a correct approximate value.

---

## 7. Engine behaviour rules

- **Reactant matching is set-based and order-independent.** Sort reactant IDs before lookup, so
  `[A, B]` and `[B, A]` resolve identically.
- **Cascading reactions:** after a reaction resolves, re-check the container for further possible
  reactions. Hard-cap the loop (e.g. 10 iterations) to prevent infinite cycles.
- **Containers hold a set of species with amounts**, not a single "current liquid". Volume,
  temperature, and pH are properties of the container.
- **Conditions gate reactions.** A rule requiring heat must not fire at room temperature.
- **Tools read state, never modify it.** Dipping pH paper is a read operation.
- **Every action produces a notebook entry** in plain English, automatically.

---

## 8. Build phases

Build **one phase at a time**. Do not start the next phase until the current one runs and the
owner has confirmed it. Each phase must leave the app in a working state.

| Phase | Deliverable | Done when |
|---|---|---|
| **0** | Electron shell + `electron-builder` producing a working `.exe` | A near-empty window installs and opens from the `.exe` on a second PC |
| **1** | Data schemas + 10 chemicals + 5 reactions + engine core, headless | Unit tests pass; mixing resolves correctly with no UI at all |
| **2** | Containers, actions (add/pour/heat/stir), notebook logging | Actions work and log correctly, still via tests/console |
| **3** | Placeholder UI — deliberately plain | Student can drag a reagent into a beaker and see a result on screen |
| **4** | Measurement tools: pH paper, thermometer, litmus, conductivity | Dipping a tool shows a correct reading and logs it |
| **5** | Effects layer: colour transitions, bubbles, precipitate, smoke, hazard visuals | Reactions look convincing at 30+ fps on integrated graphics |
| **6** | Molecular view: 2D structure images first, 3D ball-and-stick after | Student can view structure and a reaction animation for a formed product |
| **7** | Guided mode: experiment runner, step validation, hints | Two full experiments (titration + one precipitation) run end to end |
| **8** | Content scale-up by level (Matric → FSc → BS) | Content added purely as JSON, zero engine changes needed |

> **Phase 8 note — one approved engine change.** Four batches of Matric
> content (40 reactions) were added as pure JSON with `src/core/` untouched,
> as the criterion asks. Electrolysis was the single exception: the engine
> gated reactions on heat, temperature and catalyst only, and there was no
> honest way to express "pass a current through this" without adding a
> condition. Faking it as a catalyst would have taught wrong chemistry (see
> §5's electrolysis variant), so `requiresElectricity` was added with the
> project owner's approval. It is a one-time capability addition: every
> electrolysis reaction after it is pure JSON again.
| **9** | Real UI, designed in Claude Design and integrated | Visual redesign required no changes inside `src/core/` |
| **10** | Packaging, installer polish, testing on target hardware | Installs and runs on a real 8 GB / i5 5th gen lab PC |

---

## 9. Working conventions for Claude Code

- **Stop and confirm at each phase boundary.** Do not sprint ahead into later phases.
- **Do not refactor across the engine/UI boundary** without flagging it first.
- **Prefer many small files** over few large ones — easier for a non-developer to describe
  problems ("the pH paper file") and easier to review.
- **Comment for a non-developer.** Explain *why* in plain English at the top of each module.
- **When something is ambiguous, ask** rather than assuming — especially for chemistry content.
- **Never add a dependency** without stating what it is, why it's needed, and its install size.
- **Test the `.exe` build early and often**, not once at the end.
- **Performance budget:** no CSS `filter: blur()`, no large box-shadows, no WebGL in the main
  bench view. Animate `transform` and `opacity` only.

---

## 10. Out of scope (do not build)

- Photorealistic 3D or a first-person lab environment
- Real-time fluid dynamics or physics-based liquid simulation
- A general-purpose chemistry solver that predicts arbitrary reactions from first principles
- Multiplayer, cloud sync, accounts, analytics, licensing/DRM
- Spectroscopy/instrumental analysis simulation (NMR, HPLC) — reconsider after Phase 8
- Multi-language UI — reconsider after v1 ships

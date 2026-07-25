# Virtual Chemistry Lab — UI Specification

> The interface is built **last** (Phase 9), in Claude Design. Phases 3–8 use a deliberately
> plain placeholder UI. This file exists so that the placeholder is built against the same
> contract the real UI will use, and so the redesign is a swap, not a rewrite.

---

## 1. The contract between UI and engine

The UI may **read** engine state and **dispatch** actions. It may not contain chemistry logic.

```js
// The UI receives this. It renders it. It does not compute it.
{
  containers: [{
    id, type, position,
    contents: [{ chemicalId, amount }],
    volumeMl, temperatureC, pH,
    appearance: {
      colorHex, colorName,          // ALWAYS both — see §5
      precipitate: { colorHex, colorName, density } | null,
      bubbling: bool, smoking: bool, glowing: bool
    }
  }],
  activeHazard: { severity, title, warning, visualEffect } | null,
  notebook: [{ timestamp, text, measured, expected, matched }],
  mode: "free" | "guided",
  guided: { experimentId, stepIndex, instruction, hint } | null
}
```

```js
// The UI dispatches these. Names are fixed.
addChemical(containerId, chemicalId, amountMl)
pour(fromId, toId, amountMl)
setHeat(containerId, level)      // 0–3
stir(containerId)
dipTool(toolId, containerId)
recordObservation(text)
revealReference(notebookEntryId)
resetBench()
```

**Test of the boundary:** if a purely visual change requires editing anything in `src/core/`,
the boundary is broken. Fix it before continuing.

---

## 2. Who this is for, physically

Design decisions follow from the room, not from taste:

- **1366×768 is the design target**, not a fallback. Many lab PCs are exactly this. Everything
  essential fits without scrolling at that size.
- **Often projected.** Type must stay legible from the back of a classroom. No hairlines, no
  low-contrast grey-on-grey, no text below 14px.
- **Cheap TN monitors with poor colour fidelity are common.** A subtle colour distinction that
  reads clearly on a good laptop screen may vanish on a lab monitor.
- **Mouse only.** No touch, no trackpad gestures. Click targets ≥ 40×40px.
- **Shared machines, short sessions.** A student sits down mid-period and must understand the
  screen in seconds. No onboarding tour, no hidden menus.

---

## 3. Screen structure

Three zones, mirroring an actual bench so the layout teaches the physical space:

```
┌──────────────────────────────────────────────────────────────────────┐
│  MODE: Free Lab / Guided     Experiment ▾                    Reset    │
├───────────────┬──────────────────────────────────┬───────────────────┤
│               │                                  │                   │
│  REAGENT      │           THE BENCH              │   LAB NOTEBOOK    │
│  SHELF        │                                  │                   │
│               │   (containers, apparatus,        │   auto-filled     │
│  filter by    │    drag-and-drop, effects)       │   observations    │
│  level /      │                                  │                   │
│  type         │                                  │   [Compare with   │
│               ├──────────────────────────────────┤    reference]     │
│  APPARATUS    │  TOOL TRAY                       │                   │
│               │  pH paper · thermometer · litmus │                   │
└───────────────┴──────────────────────────────────┴───────────────────┘
        ~22%                    ~52%                       ~26%
```

**Modal overlays** (not separate screens): Properties card, Molecular view, Hazard alert,
Experiment step detail.

---

## 4. Visual direction

**Concept: bench-top instrument, not web app.**

The interface should look like laboratory equipment and printed lab stationery — machined,
labelled, slightly utilitarian — rather than a modern SaaS dashboard. Every surface should have a
reason to exist that a chemistry student would recognise.

### Palette — drawn from real lab materials

| Role | Source in the real world | Suggested hex |
|---|---|---|
| Bench surface | Dark phenolic resin benchtop | `#26302D` |
| Panel / wall | Lab wall tile, off-white | `#EDEAE3` |
| Glassware | Borosilicate edge tint | `#C9D6DA` |
| Reagent shelf | Amber bottle glass | `#A8702B` |
| Ink / labels | Printed bottle label black | `#161A19` |
| **Hazard** | GHS pictogram red | `#D0342C` |

**One hard rule:** hazard red is reserved exclusively for danger. It never appears as a button
colour, an accent, a highlight, or decoration. When a student sees that red, it means one thing.

### The colour system is the chemistry

Do not invent a decorative accent palette. The app's colours come from the chemistry itself —
indicator colours across the pH scale, precipitate colours, flame test colours. The interface
stays deliberately muted so that the moment a solution turns brick-red or a yellow precipitate
drops, **it is the brightest thing on screen.** Restraint everywhere else is what makes the
reaction land.

### Typography

Three roles, all bundled locally (no web fonts — the app is offline):

- **Labels and apparatus names** — a condensed grotesque, echoing reagent bottle labels and
  stencilled equipment. *Candidates: IBM Plex Sans Condensed, Instrument Sans, Archivo Narrow.*
- **Readouts and measurements** — a monospace face. Temperature, pH, and volume are instrument
  readings and should look like it, with tabular figures so digits don't jitter as values change.
  *Candidates: IBM Plex Mono, JetBrains Mono.*
- **Notebook body** — a readable text face at generous size, since students read explanations here.

All candidates are open-source (SIL OFL) and redistributable inside the installer. Confirm the
licence of anything else before bundling.

### Signature element: the lab notebook

The right-hand panel is real **grid paper** — a faint 5 mm graph rule, the paper stock of every
chemistry practical notebook in the country. It fills itself in as the student works, in plain
English, in order. It is the one element that should feel physical and hand-made against an
otherwise machined interface.

It carries the app's most valuable teaching moment: the student writes down what they observed,
presses **Compare with reference**, and the true value is revealed alongside their answer —
marked as a match, a near-miss, or a miss. That comparison is the reason the app exists. Design
it as the hero, not as a sidebar.

### What to avoid

Cream background with a high-contrast serif and terracotta accent; near-black with one acid-green
accent; glassmorphism; gradient hero panels; floating card grids with large border radii. These
are house styles of generic app design and carry nothing of the subject.

---

## 5. Colour is never the only signal

The app's core content is colour change — and roughly 1 in 12 boys has a colour vision
deficiency. On top of that, lab monitors distort colour badly.

**Therefore: every colour cue is always paired with its name in text.** Not on hover, not in a
tooltip — visible.

> A brick-red precipitate settles at the bottom of the tube.
> `Precipitate: brick red (Cu₂O)`

This is also better chemistry teaching. "Brick red" is the observation a student must write in a
real practical exam; the pixel colour is not.

The same applies to hazards: never a red flash alone. Red flash **plus** an icon **plus** a
written warning.

---

## 6. Motion

Animation exists to convey physical process. Everything else is noise.

**Performance rule:** animate `transform` and `opacity` only. No `filter: blur()`, no animated
box-shadows, no WebGL in the bench view. Target 30 fps minimum on Intel HD integrated graphics.

| Animation | Duration | Notes |
|---|---|---|
| Pour | 700–1000 ms | Stream from lip; receiving level rises |
| Colour change | 500–800 ms ease-out | Interpolate; never snap |
| Precipitate forming | 1200 ms | Particles appear, settle, accumulate |
| Bubbling | looping | Sprite/CSS particles, capped count |
| Gas evolution | 1500 ms | Rises, fades at container mouth |
| Temperature change | tied to readout | Digits tick, don't jump |
| Hazard alert | 200 ms in | Screen edge flash + shake, **then hold** the written warning |
| pH paper dip | 400 ms | Dip, lift, colour resolves on the strip |

**Reduced motion:** respect `prefers-reduced-motion`. Also expose an in-app "Reduce animation"
toggle — the OS setting is rarely configured on shared school machines, and a teacher may want it
off on a projector.

Hazard visuals stop at conveying danger and consequence. They do not glorify the disaster or
turn it into a reward for misbehaving.

---

## 7. Component inventory

**Bench:** container (beaker, test tube, flask, burette), burner + heat control, stand/clamp,
pour interaction, drag ghost, drop target highlight.

**Shelf:** reagent bottle (amber/clear, printed label), level filter (Matric/FSc/BS), category
filter, search.

**Tools:** pH paper strip + colour chart, thermometer, litmus paper, conductivity tester.

**Panels:** properties card (name, formula, state, colour name, pH, molar mass, hazards, uses),
molecular view (2D structure → 3D ball-and-stick), notebook entry, compare-with-reference reveal,
hazard alert, guided step card with hint.

**System:** "No observable change" notice, "Not available in this version yet" notice (must read
as an honest gap in the app, never as a chemistry result), reset confirmation.

---

## 8. Accessibility floor

- Full keyboard operation, visible focus rings (not the browser default)
- Text scaling to 125% without breaking layout
- Every colour paired with text (§5)
- Minimum 4.5:1 contrast on all text
- Click targets ≥ 40×40px
- No information conveyed by animation alone

---

## 9. Handing this to Claude Design

When the time comes, give Claude Design: this file, screenshots of the working placeholder UI,
and the state shape from §1. Ask for the **Free Lab bench screen first** — it is the hardest and
sets the language for everything else. Get that right before the other screens.

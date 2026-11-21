# Build UI — making the bench look and behave like a real lab

> **What this file is.** The plan for the UI track the owner asked for on 2026-11-10: improve the
> interface stage by stage until the bench looks and behaves like a real school laboratory. It
> takes the place of CLAUDE.md §8 **Phase 9** ("designed in Claude Design") — the owner chose to
> have Claude Code build it directly — and absorbs BUILD_PHASE_2.md **Stage 2.7** (Realistic
> effects), whose five steps appear below in fuller form.
>
> It works like BUILD_PHASE_2.md: stages in order, small sub-steps, a model for each, and a
> **✅ Check** that must pass before the next stage starts. Commit and push at the end of every
> sub-step.

---

## What "realistic" means here

Not photorealistic 3D, which CLAUDE.md §10 rules out. Realistic means **a student who has stood
at a real bench recognises what they see**, and a student who has not learns what to expect:

- the right glassware, in the right proportions, with graduations you can read;
- the liquid the colour and clarity the notebook says, at the level its volume gives;
- solids that look like what they are — a ribbon, granules, a fine white cloud, a gelatinous
  floc, a copper coat on zinc, a pool of molten metal;
- gas coming from where it really forms, at the rate it really forms;
- heat you can see before the thermometer says so;
- apparatus that goes together the way it does on a real bench.

## Rules for every stage

1. **The bench and the notebook never disagree.** Anything drawn — a colour, a precipitate, a gas,
   a level — comes from the same curated data the notebook sentence comes from. Stage UI.1 adds a
   test that checks this for every reaction, and it stays green from then on.
2. **No chemistry in the UI.** The UI reads state and curated data; it never works out what
   happens. A new visual fact the data cannot express yet is a **data** change (curated, sourced,
   validated, owner-approved), never a guess in the drawing code. CLAUDE.md §4 and §6 still win.
3. **The hardware floor still wins.** 30 fps on Intel HD integrated graphics at 1366×768; animate
   `transform` and `opacity` only; no `filter: blur()`, no animated box-shadow, no WebGL on the
   bench (CLAUDE.md §9, UI.md §6). Shadows, highlights and textures are drawn once, statically.
4. **Colour is never the only signal** (UI.md §5). Every colour, precipitate and gas keeps its name
   in text beside it, however realistic the drawing becomes.
5. **Every effect answers "what would a student see?"** If it is not something a student would
   see at a real bench, it is decoration and stays out. Hazards show danger and the right
   response, never spectacle (UI.md §6).
6. **Before and after.** Every stage ends with screenshots at 1366×768 of the same set-ups,
   committed under `docs/ui-progress/`, so the improvement can be seen and any regression spotted.

---

## The stages at a glance

| Stage | Theme | Main result | New curated data? |
|---|---|---|---|
| **UI.1** | What you see is what happened | Bench always matches the notebook; current display bugs fixed | No |
| **UI.2** | Glassware that looks like glass | Every vessel redrawn in SVG with real proportions, graduations, meniscus | No |
| **UI.3** | Liquids and solids | Clarity, colour depth, solids by form, precipitates by texture, layers | **Yes** |
| **UI.4** | Heat and change of state | Proper Bunsen flame, boiling, steam, condensation, glowing solids | **Yes** (boiling points) |
| **UI.5** | Gas you can see | Bubbles where and as fast as they form; coloured gases, fumes, smoke | **Yes** (rate) |
| **UI.6** | Apparatus and handling | Stands, clamps, holders; tilting pours, dropwise addition, swirling | No |
| **UI.7** | The close look | A magnified view of one vessel against a white tile, meniscus at eye level | No |
| **UI.8** | The room | Bench, wall, real reagent bottles with GHS labels, fume cupboard, notebook paper | Small |
| **UI.9** | Sound (optional) | Offline pour, fizz, boil and glass sounds, off by default | No |
| **UI.10** | Fast, accessible, checked | Quality tiers, fps budget test, keyboard, the realism review | No |

Stages that need new curated data list a **decision needed** at the top. As in BUILD_PHASE_2.md,
answer it in chat before any code is written, and record it in the decisions log at the end.

---

## Stage UI.1 — What you see is what happened

**Why:** before anything is made prettier, what is drawn has to be right. On 2026-11-10 the app
was opened at 1366×768 with three vessels, and four problems showed up:

- **Every mixture is drawn grey and labelled "colour not known for this mixture".** The colour is
  worked out in `appearanceFor` (src/ui/app.js), which only knows a colour when a vessel holds
  exactly one substance. Almost every reaction leaves two or more, so iron(III) with thiocyanate
  was drawn colourless while the notebook said, correctly, "The mixture turned blood red". The
  same happens to Fehling's brick red, the deep-blue copper complex and the starch blue-black.
- **A precipitate is 10 yellow dots floating near the top of the liquid**, not a solid gathering at
  the bottom.
- **Labels overlap.** Vessels taken from the tray land close together, and their label cards sit on
  top of one another.
- **Small volumes are nearly invisible.** 20 mL in a 250 mL beaker is a 9-pixel strip.

**UI.1.1 — Sonnet — The vessel's colour comes from the reaction that made it**
> Move `appearanceFor` out of app.js into a small, DOM-free `src/ui/appearance.js`. When a reaction
> runs in a vessel, remember that reaction's curated `effects.colorToHex` and the engine's name for
> it (the same lookup the notebook uses: the rule's own products first), exactly as app.js already
> remembers the last animated reaction per vessel. Show that colour and name until the contents
> change again. A mixture no rule describes stays "colour not known" — honest, never guessed.

**UI.1.2 — Sonnet — The bench-notebook agreement test**
> A test that runs every reaction in `tests/golden/` through a real container, builds its
> appearance with `appearance.js`, and fails if the colour name drawn on the bench is not the one
> the notebook sentence names, or if the notebook mentions a precipitate the vessel does not show.

**UI.1.3 — Sonnet — Precipitates that stay**
> After the forming animation, a precipitate remains as a settled layer at the bottom of the
> vessel, in its curated colour, with its name on the label card. It stays until the vessel is
> emptied, dissolved (`effects.dissolves`) or reacted away.

**UI.1.4 — Sonnet — Labels that never overlap; apparatus that lands in free space**
> New apparatus is placed in the nearest free spot on the bench. Label cards that would overlap
> stack or shift aside; a selected vessel's card always comes to the front.

**UI.1.5 — Sonnet — Small volumes you can see**
> Keep the true level, but draw a thin liquid of at least a few pixels with its colour name, and
> show the volume on the glass's own graduation scale, so 20 mL in a 250 mL beaker reads as what
> it is rather than as an empty beaker.

**UI.1.6 — Sonnet — Baseline screenshots**
> Script the six reference set-ups (precipitate, colour change, gas evolution, electrolysis,
> heating, titration) and save screenshots at 1366×768 to `docs/ui-progress/UI.1/`.

✅ **Check:** the agreement test passes for every reaction; the blood-red, brick-red, deep-blue and
blue-black results all show on the bench in their colours with their names.

> **Done (2026-11-16).** What was built, and two more problems the stage turned up:
>
> - `src/ui/appearance.js` decides each vessel's colour and solid (the four rules in its header);
>   `tests/appearance.test.js` is the bench–notebook agreement test, and passes for every reaction.
>   It found five reactions whose notebook names a solid that no product records as one (calcium
>   hydroxide "that does not all dissolve", soot, condensing mercury); the bench draws those from
>   the reaction's own curated colour and description.
> - The settled layer replaces the floating dots; its label uses the curated `solidKind` word
>   ("bright yellow precipitate: Lead(II) iodide", "silvery liquid: Mercury").
> - New apparatus lands in the first free stretch of bench with room for its label; every card is
>   placed after each render so none covers another (the selected one stays full size).
> - **Found at true 1366×768 scale:** the bench's control strip wrapped to two rows and lay over
>   the bottom of every vessel — exactly where the liquid and precipitate are. It is now always one
>   row.
> - **`scripts/capture-ui.mjs`** saves the reference set-ups at 1366×768 into `docs/ui-progress/`
>   (`npx electron scripts/capture-ui.mjs UI.1`). The browser pane renders too small to judge, and
>   an ordinary hidden window hands back stale frames, so it renders offscreen.

---

## Stage UI.2 — Glassware that looks like glass

**Why:** the vessels are flat outlines today. Real glassware has a rim, a spout, thickness, a
curved base, and white graduations — and those details are part of what a student is learning.

**UI.2.1 — Sonnet — Redraw every vessel in SVG, to real proportions**
> Beaker (with spout), conical flask, test tube (round bottom), boiling tube, measuring cylinder
> (with foot), burette (with stopcock), evaporating dish, plus the shapes later stages need:
> round-bottom flask, filter funnel, watch glass, dropping pipette. Proportions taken from a
> supplier catalogue drawing, the page recorded in the file's header.

**UI.2.2 — Sonnet — Glass that reads as glass**
> A thin rim, darker edges where the glass is seen edge-on, one static highlight stripe from a
> single consistent light direction, and a soft static shadow underneath. All drawn once in SVG —
> no blur filters, nothing animated.

**UI.2.3 — Sonnet — Graduations you can read**
> White printed scales at the real spacing: every 10 mL on a beaker, 1 mL on a measuring cylinder,
> 0.1 mL on a burette, with numbers large enough at 1366×768.

**UI.2.4 — Sonnet — Liquid that fills the shape**
> The liquid is clipped to the inside of the vessel — up the curve of a test tube, into the cone of
> a flask — with a slightly lighter surface ellipse and a visible concave meniscus at the edges.

✅ **Check:** each vessel set side by side with a photograph of the real one (an open-licensed
image, linked in `docs/ui-progress/UI.2/`) is recognisable at a glance; 30 fps with seven vessels.

> **Done (2026-11-17).** What was built:
>
> - **`src/ui/glassware.js`** holds every vessel's real shape. The catalogue pages are listed in its
>   header: DURAN/ISO 3819 beakers, ISO 1773 flasks, 16 × 150 and 25 × 150 mm tubes, the ISO 4788
>   cylinder, the ISO 385 burette and the DIN 12903 dish.
>   - Everything is drawn at 1.1 px/mm. The burette and cylinder are shortened, and that is said
>     in the file.
>   - It also works out how high a volume of liquid comes in each shape. The printed scale is
>     placed with that same calculation, so liquid always sits on its own mark.
>   - A burette reads from the top down.
>   - The flask's marks spread out up the cone.
>   - Round-bottom flask and watch glass are drawn ready for later stages. They are not on the tray.
> - **Two static SVGs per vessel:** the back of the glass, then the liquid, then the walls, rim,
>   spout, highlight, foot or tap and the printed scale. Nothing is blurred or animated.
> - **The inside of the glass clips the liquid,** so it fills the round end of a tube and the
>   cone of a flask. Its surface is an ellipse as wide as the glass at that height, brightest
>   where it meets the walls.
> - **App layout takes its sizes from `glassware.js`,** so the layout and the drawing cannot
>   disagree. A clamped burette's tip now sits inside the flask's neck.
> - **`tests/glassware.test.js`** checks:
>   - the liquid sits on every printed mark;
>   - levels only rise as liquid is added;
>   - a burette reads 0 when full;
>   - a flask fills faster up its cone;
>   - lines are at least 3 px apart;
>   - the SVG is self-contained.
> - Fixed in passing: "A evaporating dish" now reads "An evaporating dish" in the notebook and on
>   the tray.
>
> **Decided (2026-11-17): real tube sizes.** The test tube now holds 20 mL and the boiling tube
> 55 mL, as real 16 × 150 and 25 × 150 mm tubes do. Fourteen guided experiments asked for
> 10–25 mL in a test tube, which would have overflowed or brimmed a real one. Their test-tube
> steps now ask for the 1–8 mL a real practical uses, and say so in their instructions. A
> heated tube stays no more than a third full. A test in `tests/experiments.test.js` keeps it
> that way. The shelf's auto-pour amount now steps 1 mL at a time up to 5 mL, then 5 mL at a
> time, so a few mL can be added without opening the amount panel. No reaction, colour or
> product changed.

---

## Stage UI.3 — Liquids and solids

**Decision needed:** add curated **appearance** fields to `chemicals.json`, each with a source:
`clarity` (clear / cloudy / milky / opaque) for liquids and solutions; `form` (ribbon, granules,
powder, chips, crystals, pellets, lump, wire) for solids taken off the shelf; and `texture` (fine,
crystalline, gelatinous, curdy, metallic) for solids a reaction makes. The validator checks the
fixed words, as it does for `category`. No engine change.

**UI.3.1 — Opus — Curate the fields**
> Fill `clarity`, `form` and `texture` for every chemical, using sources actually opened, in
> batches of 25 the way the audit ran. Limewater is clear and turns milky; starch–iodine is opaque;
> aluminium hydroxide is a gelatinous floc; silver chloride is curdy; lead iodide is crystalline.

> **Done (2026-11-18), in 15 batches.** Every chemical carries the fields that apply to it, and a
> missing one now fails the build. Four words were added along the way, each approved by the
> owner:
> - forms: `filings`, `turnings`, `foil` (all from batch 1) and `cloth`;
> - textures: `flaky` (rust), `lumpy` (clinker, plastics, ceramics, slags) and `fibrous` (nylon,
>   DNA, cloth).
>
> Of the 383 values:
> - 191 are clear solutions covered by one general reference;
> - 97 are confirmed by a page that was actually opened;
> - 95 are unconfirmed, and are listed in `batch.md` §15 for the teacher review.
>
> Many reference sites refuse automated reading: RSC Education and the suppliers always did, and
> Wikipedia often timed out. That is the main reason for the unconfirmed values.

**UI.3.2 — Sonnet — Clarity and depth of colour**
> A clear solution shows the bench through it; a milky one does not. A colour looks deeper through
> a wide beaker than a narrow tube — the same solution, drawn honestly. Purely visual.

> **Done (2026-11-18).**
> - **Clarity.** `appearance.js` gives each vessel a `clarity`: that of the least clear liquid in
>   it, from the curated words. Solids and gases are left out; how a precipitate clouds the liquid
>   is its `texture`, in UI.3.4.
> - **The paint.** The new `src/ui/liquid-colour.js` turns colour, clarity and path into what is
>   drawn:
>   - A clear coloured solution is see-through in proportion to how pale it is.
>   - Cloudy is paler and translucent. Milky hides the bench. Opaque (starch–iodine, mercury) is
>     drawn solid.
> - **Depth.** Depth follows the Beer–Lambert law. The light's path is the inside width at the
>   middle of the liquid, from `glassware.js`. The curated colour is what you see through about
>   27 mm; a wider vessel deepens it and a narrower one pales it, within limits.
>   - The **hue is always kept**, so a deep yellow never drifts to orange and the drawing never
>     seems to contradict its label. The label always shows the curated colour.
> - **Tests.** `tests/liquid-colour.test.js` checks:
>   - clear < cloudy < milky < opaque for how much of the bench is hidden;
>   - water looks the same in any glass;
>   - beaker deeper than tube;
>   - hue unchanged at any depth.
>
>   `tests/appearance.test.js` checks the clarity rule. Screenshot:
>   `docs/ui-progress/UI.3/clarity-depth.png`.

**UI.3.3 — Sonnet — Solids that look like what they are**
> Magnesium ribbon as a curled strip, zinc granules as grey lumps, marble chips as white stones,
> crystals as facets, powder as a heap. A reacting solid shrinks over the reaction's animation.

> **Done (2026-11-18).**
> - **What is in a vessel.** `appearance.js` lists the vessel's **shelf solids**: each solid the
>   student put in, with its curated `form`, colour and amount. A solid a reaction made is not
>   listed twice.
> - **The drawings.** The new `src/ui/solid-shapes.js` draws all twelve forms as small static SVGs
>   in the solid's own colour, scattered the same way every time:
>   - ribbon leaning up the glass;
>   - granules, chips, crystals and pellets;
>   - a single lump;
>   - a powder heap and a heap of filings;
>   - coiled wire, curly turnings, crumpled foil and folded cloth.
> - **On the bench.**
>   - A solid sits on the vessel floor behind the liquid, so clear liquid shows it and milky
>     liquid hides it.
>   - More solid makes a bigger heap.
>   - The vessel's label names it with its colour ("bluish-grey granules: Zinc metal").
> - **When a reaction uses it up**, it shrinks and fades away (`shrinkAway` in `effects.js`;
>   transform and opacity only). Emptying the vessel removes it at once.
> - **Tests.** `tests/solid-shapes.test.js` and two new cases in `tests/appearance.test.js`.
>   Screenshot: `docs/ui-progress/UI.3/shelf-solids.png`.
> - **Screenshot script.** `scripts/capture-ui.mjs` now uses its own data folder and draws in
>   software. On this PC another running Electron program, and a struggling graphics driver,
>   were making it die silently partway through.

**UI.3.4 — Sonnet — Precipitates by texture, and solids by kind**
> Fine ones cloud the whole liquid and settle slowly; crystalline ones glint and settle fast;
> gelatinous flocs hang in the liquid; curdy ones clump. `solidKind` (already curated) decides
> where the solid goes: a **deposit** coats the metal or the cathode, a **coating** grows on the
> surface, a **liquid** pools, **smoke** hangs in the air above the vessel.

> **Done (2026-11-18).** The new `src/ui/precipitate-shapes.js` draws a reaction's solid by its
> curated `texture` and places it by the reaction's curated `solidKind`:
> - **fine**: a smooth layer, plus a faint haze of the solid's colour over the whole liquid,
>   because fine particles settle slowly.
> - **crystalline**: a layer of glinting rhombs.
> - **gelatinous**: loose, see-through flocs hanging in the lower liquid, each with a faint light
>   edge so it shows even when the reaction tints the liquid the same colour.
> - **curdy**: clumps, a few still suspended.
> - **metallic, flaky, lumpy, fibrous**: a deposit with a sheen, a crust of flakes, a few lumps,
>   tangled strands.
> - A solid the data gives no texture is drawn plainly, as fine.
>
> Placement by kind:
> - A **deposit** coats the cathode while the current is on; otherwise it lies on the floor as
>   metal.
> - A **liquid** (molten sodium, mercury) is a shining pool.
> - **Smoke** hangs above the mouth, outside the glass.
>
> The forming animation follows the texture: crystals fall fast, fine grains slowly, and a floc
> forms where it is without falling. A deposit, a molten metal and smoke do not rain down at all.
> `appearance.js` carries each solid's texture; `effects.js`'s `playPrecipitate` takes the
> style.
>
> - **Tests.** `tests/precipitate-shapes.test.js`.
> - **Screenshot.** `docs/ui-progress/UI.3/textures.png`.
> - **Not seen in the app yet:** the smoke and the pool. No shelf reagents make them without gases
>   or a furnace. Both are covered by the tests only.

**UI.3.5 — Sonnet — Colour that spreads and fades**
> A reagent poured in colours the liquid from where it enters and spreads; stirring finishes it
> (2.7.1). A curated `colourFades` drains the colour over the reaction rather than snapping.

> **Done (2026-11-18).** When a reagent goes into liquid already in the vessel, the new colour
> does not cover the liquid at once:
> - It comes down from the surface as a plume (a third as wide as the glass), and the rest of the
>   liquid goes part-way to the new colour.
> - **Stir** finishes the mix in about half a second. Left alone, it finishes over a few seconds,
>   as diffusion would.
> - Anything else done to the vessel mid-mix completes it at once, so two colour changes never
>   fight over the same layer.
>
> A reaction with a curated `colourFades` drains its colour over 2.8 s instead of 0.7 s.
>
> This is purely visual. The engine's state and the label are the final ones from the start
> (BUILD_PHASE_2.md 2.7.1).
>
> `spreadColour` is in `effects.js`, and `withEffects` now says whether a reagent entered or the
> vessel was stirred. Transform and opacity only.
>
> Checked in the running app: the plume appears and the liquid is half-mixed; Stir finishes it;
> left alone it finishes; zinc in copper sulfate drains its blue over 2.8 s. Screenshot:
> `docs/ui-progress/UI.3/mixing.png`.
>
> **Found in passing:** diluting a coloured solution with water (copper sulfate plus distilled
> water) has no rule. It shows "colour not known" and is logged as an unavailable combination,
> which is the honest result, but a common thing for a student to try.

**UI.3.6 — Opus — Two layers**
> Where the data already says two liquids do not mix (the `noReaction` rules for tetrachloromethane
> and water, oil and water), draw them as two layers, the denser below, by the curated `density`.
> Shaking makes an emulsion that separates again.

> **Done (2026-11-19).**
> - **The data.** The explanations described layers in words but nothing the bench could read, so
>   the owner approved a curated `layers` field on a rule (CLAUDE.md §5). Each entry names the
>   liquid forming the layer, and optionally the chemical whose colour it shows. Two rules carry
>   it:
>   - **tetrachloromethane and water**: water floats on the denser tetrachloromethane;
>   - **benzene and bromine water**: benzene floats on top and takes the orange, and the water
>     below goes colourless.
>
>   The validator checks every name and density.
> - **Never inferred.** "Insoluble in water" in a `solubility` field is not enough: benzene and
>   tetrachloromethane are each insoluble in water, yet they mix with each other.
> - **On the bench.**
>   - `appearance.js` lists the layers lightest-first by the curated densities.
>   - Each layer is as deep as its own volume in the glass's real shape, with a bright line at the
>     boundary.
>   - The label reads "two layers: Benzene (orange-brown) above Bromine water (colourless)".
>   - **Stir** shakes them into a cloudy emulsion that separates back into the same layers over
>     about four seconds (`shakeLayers` in `effects.js`).
> - **Checked in the running app:** the layers, the label, the emulsion on Stir, and separation
>   afterwards.
> - **Tests** in `tests/appearance.test.js`. Screenshot: `docs/ui-progress/UI.3/layers.png`.
> - **Not done:** oil and water has no rule at all, so it still says the combination is not
>   available. It needs a no-reaction rule with an opened source, in a later content batch.

> **Stage UI.3 check, as far as it can be done here.** Every step is built and seen in the
> running app, and the screenshots for each are in `docs/ui-progress/UI.3/`.
> - The 383 appearance values are curated: 95 still need a teacher's confirmation (`batch.md`
>   §15).
> - The second half of the check, a chemistry teacher naming each reaction from the screenshots
>   alone, needs a teacher and has not been done.

✅ **Check:** the 30 review-pack reactions each show the right clarity, solid form and precipitate
behaviour; a chemistry teacher shown the screenshots names the reaction without being told.

---

## Stage UI.4 — Heat and change of state

**Decision needed:** add a curated `boilingPointC` to liquids and solutions (and `meltingPointC`
where a solid visibly melts), with sources, so a liquid boils at the right temperature and not at
a guessed one. No engine change.

**UI.4.1 — Sonnet — A Bunsen burner that works like one**
> Barrel, collar and air hole. Air hole closed: a tall, wavering, luminous yellow flame that leaves
> soot on the glass. Open: a roaring blue flame with a pale inner cone. The teaching note says
> which to use for heating and why. Flicker by transform only.

> **Done (2026-11-19).**
> - **The burner.** It now has an air hole in the barrel, a collar that covers it, and a gas
>   hose. A burner starts with its air hole open.
> - **Air hole open:** a roaring, translucent blue-violet flame with a bright pale inner cone.
> - **Air hole closed:** a tall, wavering, luminous yellow flame with no inner cone.
>   - It heats at half the rate. This is the burner clock in `app.js`, interface state, and
>     the eventual temperature is the same.
>   - It leaves soot on the outside of any vessel standing on it, which stays until the vessel is
>     put away.
>   - The flicker is transform only.
> - **Controls.** An "Air hole open / closed" button sits in the control strip, both for the
>   burner and for a vessel standing on it. Each change writes a notebook line.
> - **The teaching note.** The burner's strip explains which flame to use: yellow is the visible
>   safety flame but cooler and sooty; blue is hot and clean, the one to heat with; light it with
>   the air hole closed.
> - **A flame under a vessel** is capped so it spreads under the base instead of being drawn
>   through the glass.
> - **Checked in the running app:**
>   - Closing the air hole switches flame and status, and blackens the beaker.
>   - It writes the notebook line and shows the note.
>   - At heat 3, a beaker over the closed hole had reached 69 °C when the open one reached 100 °C.
>
>   Screenshot: `docs/ui-progress/UI.4/burner.png`.

**UI.4.2 — Sonnet — Heat you can see**
> Convection lines in a warming liquid; small bubbles forming on the glass before the boil; a
> rolling boil at the curated boiling point; steam at the mouth; condensation droplets on the cool
> glass above — the water from heating blue copper sulfate, the mercury from mercury(II) oxide.

> **Done (2026-11-19).** The new `src/ui/heat-look.js` reads a vessel's temperature, its heat and
> the curated boiling points (`batch.md` §16). It gives a stage:
> - **warming:** convection shimmer, from 35 °C on a flame;
> - **nucleating:** small bubbles forming on the glass and collapsing, in the last 15 °C;
> - **boiling:** a rolling boil with a heaving surface and steam at the mouth, at the liquid's own
>   boiling point. A mixture's liquid starts to boil at its lowest.
> - **evaporating:** no flame, and at or above its boiling point, or still hot just off the
>   flame. It gives off vapour with no bubbles, which is how ethanal (bp 20 °C) looks on a 25 °C
>   bench.
>
> Separately, **condensation:** anything in the vessel at or above its own boiling point, with
> heat going in, settles as droplets on the cool glass above the liquid, in that liquid's
> colour. The water from dehydrating blue copper sulfate and the silvery mercury from mercury(II)
> oxide are made by weight, not as a liquid body, so they appear only as these droplets. A
> boiling point "none on record" never boils.
>
> - **Drawing.** `appearance.js` carries the stage as `heat`; `bench.js` draws it with CSS
>   animations of transform and opacity only. With animation reduced, every state still shows,
>   standing still.
> - **Words.** The vessel's label says it: "small bubbles forming on the glass", "boiling
>   (100 °C)", "giving off vapour", "droplets of water on the cool glass above".
> - **Checked in the running app:** water heated at full flame showed nothing to 81 °C, bubbles
>   forming at 89 °C, then boiling at 100 °C with droplets on the glass. Blue copper sulfate heated
>   dry showed the droplets.
> - **Tests** in `tests/heat-look.test.js`. Screenshot: `docs/ui-progress/UI.4/heat.png`.
> - **Melting points** are not needed for any of this and are left for UI.4.4 (very hot solids),
>   where a solid melting can be shown.
> - **The burner now stops each liquid at its own boiling point** (owner approved 2026-11-19),
>   where it used to stop every liquid at 100 °C. Ethanol on a flame now sits at 78 °C while it
>   boils, and glycerol can pass 100 °C. A liquid with no boiling point on record still stops at
>   100 °C. This is the burner clock in `app.js`, interface state.
>   - Every heat-needing reaction was checked first: none becomes reachable or unreachable by
>     the change.
>   - Checked in the running app: ethanol boils and holds at 78 °C.
> - **Already out of reach, before and after:** dehydrating ethanol with concentrated sulfuric acid
>   needs 170 °C, but the mixture is treated as boiling at ethanol's 78 °C. Hydrogenating benzene
>   needs 180 °C. A content question for later, not changed here.

**UI.4.3 — Sonnet — A thermometer that reads**
> A thermometer stood in the liquid, its column rising with the vessel's temperature and readable
> against its scale, beside the existing number.

> **Done (2026-11-19).**
> - **The control.** A "Stand a thermometer in / Take thermometer out" button sits in a vessel's
>   control strip. Each writes a notebook line. It only reads, never changes anything (CLAUDE.md
>   §7).
> - **The instrument.** It stands near the vessel's right wall with its bulb in the liquid and its
>   stem above the rim. It's the ordinary school thermometer from `src/ui/thermometer.js`: a
>   glass stem with a red alcohol column and a printed scale from −10 to 110 °C, a line every
>   10 °C and a figure every 20 °C.
> - **The column** rises by transform alone, so a changing temperature never re-lays out the
>   page.
> - **Beyond its range,** for example a dry tube over a roaring flame at several hundred degrees,
>   the column stops at the top. The label then says "above 110 °C: off the thermometer's
>   scale", and the hover text says a real glass thermometer would break. The exact number stays
>   in the label beside it.
> - **Checked in the running app:** the column rose from 49 to 100 °C with the water.
> - **Tests** in `tests/thermometer.test.js`. Screenshot: `docs/ui-progress/UI.4/thermometer.png`
>   (water at 80 °C, column on the 80 mark; a dry tube off the scale).

**UI.4.4 — Sonnet — Very hot solids**
> A dry solid above about 500 °C glows dull red, then orange — a static overlay, faded in. Hot
> glass looks exactly like cold glass, and the label says so.

> **Done (2026-11-20).**
> - **The glow.** A dry vessel with a solid in it glows from the floor up, as a static overlay
>   that fades in over two seconds. The colours come from the Stirling table on Wikipedia's "Red
>   heat" page (opened 2026-11-20):
>   - just-visible red from 525 °C (the Draper point, above which almost every solid glows);
>   - dull red from 699 °C;
>   - cherry red from 800 °C;
>   - orange from 1100 °C;
>   - white from 1300 °C.
>
>   The label says it too, for example "the solid is glowing cherry red". A solid under liquid
>   never glows, because the liquid boils first. The table is `GLOW` in `src/ui/heat-look.js`.
> - **Not reachable in the app today.** The burner takes a dry vessel to 500 °C and no reaction
>   adds 200 °C or more, so nothing yet passes 525 °C. The rule is in place and tested, and it
>   waits for something hotter, such as a blowpipe or a furnace. The glow was not lowered to
>   500 °C to make it show: below the Draper point a solid does not visibly glow.
> - **Hot glass.** From 60 °C, too hot to hold, the vessel's label adds "hot - hot glass looks
>   just like cold glass". Nothing is drawn on the glass, because nothing would be seen.
> - **Checked in the running app:** water heated at full flame showed no warning at 49 °C, then
>   the hot-glass line from 65 °C through to the boil.
> - **Tests** in `tests/heat-look.test.js`.
> - **Melting points** were left for this stage in UI.4.2. They are still not added: nothing
>   here needs them, and a solid melting on the bench is its own piece of work, which needs a
>   sourced batch and owner approval first.

**UI.4.5 — Sonnet — Ice bath and water bath**
> An ice bath with visible ice and water, and a water bath for gentle warming, each holding the
> vessel at its temperature.

> **Done (2026-11-20).**
> - **In the bath, not on it.** A vessel stood in either bath sits down near its floor. The bath
>   is drawn in two parts, a back behind the vessel and a front of water and ice in front of it,
>   so the water comes up round the glass. The water is only faintly tinted, so a solution or
>   precipitate inside keeps its own colour: blue copper sulfate stays plainly blue in the ice.
> - **The ice bath** has ice floating at the surface, before and behind the vessel. It holds the
>   vessel at about 2 °C, as it already did.
> - **The water bath** is a glass trough of water on an electric hotplate, with a red light when
>   it is on. Its dial is off (room temperature), 40, 60 and 80 °C, and "Boiling" at 100 °C (owner's
>   choice, 2026-11-20).
>   - Any setting above off counts as heating, so reactions that need warming, such as Fehling's
>     and Tollens', work in it.
>   - The vessel comes to the bath's temperature and no further, at the gentle rate the ice cools.
>   - A liquid that boils below the bath's temperature boils and holds there: ether in a 60 °C
>     bath, ethanol in an 80 °C one.
>   - Water in a boiling water bath stops at 99 °C and does not boil, because no heat is driven in
>     once the temperatures are equal.
>   - The rule is `waterBathTarget` in `src/ui/heat-look.js`. Nothing becomes reachable that the
>     burner could not already reach.
>   - A hot bath gives off faint wisps, and a boiling one bubbles.
> - **The notebook names the bath** (an engine change, owner approved 2026-11-20).
>   - Before, an ice bath wrote "The burner under Small beaker was set to undefined heat." Level −1
>     had no words in `src/core/actions.js`.
>   - `setHeat` now takes an optional third argument saying what is under the vessel, used only
>     for the sentence. It writes:
>     - "Small beaker is now in the ice bath."
>     - "… is now in the water bath, at 60 °C."
>     - "… was taken out of the ice bath."
>   - Burner sentences are word for word the same.
>   - A rack no longer writes "The burner under … was turned off."
> - **Small wording fixes:** the vessel's label and the control strip say "in the ice bath", not
>   "on" it. The tray's tooltip says "Set up an ice bath", not "a ice bath".
> - **Checked in the running app:**
>   - water in the bath held at 60 °C, then 99 °C at "Boiling";
>   - copper sulfate in the ice bath went to 2 °C;
>   - the notebook named each bath.
> - **Tests:** `tests/actions.test.js` (the sentences) and `tests/heat-look.test.js` (the bath's
>   target).
> - **Screenshot:** `docs/ui-progress/UI.4/baths.png`.

✅ **Check:** heating water shows bubbles forming, then a rolling boil at 100 °C with steam;
heating blue copper sulfate shows droplets on the cool glass above it.

---

## Stage UI.5 — Gas you can see

**Decision needed:** add a curated `effects.gasRate` (slow / steady / vigorous) to reactions that
give off a gas, sourced from practical descriptions, so magnesium in acid fizzes harder than iron
does. No engine change. Gas collection and testing at the mouth are BUILD_PHASE_2.md Stage 2.3
(an engine stage) and stay there.

**UI.5.1 — Opus — Curate `gasRate`**
> For every rule with a gas: slow, steady or vigorous, with a source. Magnesium in 1 M acid is
> vigorous; zinc is steady; iron is slow.

> **Done (2026-11-20),** in 4 batches the owner approved. The record is in `batch.md` §17.
> - **Where it goes:** `effects.gasRate` is on all 60 rules with bubbles of a gas, and on no
>   other rule.
> - **The counts:**
>   - 20 steady, 14 vigorous, 4 slow;
>   - 22 `null`, meaning no rate is on record, because no page that could be opened gave one.
>     The bench draws these at the middle pace, and the validator lists them by name.
> - **Two general rules,** both owner approved:
>   - in electrolysis the rate is set by the current, so steady (pure water slow);
>   - a solid broken down by heat gives gas only while heated, so steady.
> - **Checks:** the validator and `tests/gas-rates.test.js` reject any other word, a rate on a
>   rule with nothing bubbling, and a rated value with no opened page behind it. A missing rate
>   fails the build.
> - **The lesson holds:** magnesium, zinc and iron in 1 M HCl are vigorous, steady and slow.

**UI.5.2 — Sonnet — Bubbles where the gas forms**
> On the surface of the metal for a metal in acid; on each electrode in electrolysis, with
> hydrogen's stream twice oxygen's where the electrodes block says so; from the chips themselves
> for a carbonate. Bubble count and speed follow `gasRate`.

> **Done (2026-11-20).** The rules are in `src/ui/gas-bubbles.js`, with no DOM, and are tested in
> `tests/gas-bubbles.test.js`.
> - **Where the gas forms.**
>   - A reaction's bubbles start from a solid reactant or solid catalyst lying in the vessel:
>     the magnesium ribbon, the zinc granules, the marble chips, the manganese(IV) oxide.
>   - With no solid, they start across the floor of the liquid (two solutions meeting).
>   - With no liquid, there are no bubbles: a dry solid giving off gas shows the gas, not bubbles.
> - **How fast.**
>   - `gasRate` sets the count, the size and the speed: slow 4 bubbles, steady 9, vigorous 18,
>     rising faster as the rate rises.
>   - `null` (no rate on record) is drawn at the steady pace.
>   - Bubbles rise only as far as the surface.
> - **Electrolysis.**
>   - While the current is on, bubbles keep streaming off each rod that makes a gas.
>   - Which rod makes a gas is read from the curated `electrodes` block: one of the rule's
>     gaseous products on the right of that rod's half-equation.
>   - The share comes from the same half-equations, as gas per electron. Splitting water gives
>     hydrogen twice oxygen's stream, and brine gives equal streams. Copper sulfate bubbles only
>     at the anode, while copper plates the cathode.
>   - The rods now reach down near the floor, so they dip into the liquid however little there is.
>     Before, a 20 mL beaker's rods ended above the surface.
> - **Checked in the running app:**
>   - magnesium, zinc and iron in 1 M HCl side by side had 16, 9 and 4 bubbles rising at once;
>   - magnesium's bubbles started across the ribbon;
>   - brine streamed equally from both rods.
>   - Screenshot: `docs/ui-progress/UI.5/bubbles.png`.
> - **Not visible yet: water's 2:1.** It is computed and tested, but in the app the vessel empties
>   the moment the current goes on, because the engine has no amounts yet (BUILD_PHASE_2.md stage
>   2.2) and turns all the water into gas at once. With no liquid left, no stream is drawn rather
>   than one rising through nothing. It will show once the engine keeps water in the cell.
> - **A data gap found: electropolishing.** Its cathode half-equation makes H₂ and its gas is
>   hydrogen, but `h2_g` is not in its products, so no rod is drawn bubbling. Left for the owner
>   to decide; nothing was changed in the data.

**UI.5.3 — Sonnet — Coloured gases, fumes and smoke**
> Coloured gases gather visibly above the liquid — brown nitrogen dioxide, yellow-green chlorine,
> violet iodine vapour, brown bromine vapour — always with their names. White ammonium chloride
> smoke forms where ammonia meets hydrogen chloride; fuming liquids show their mist at the mouth.

> **Done (2026-11-20).** The rules are in `src/ui/gas-look.js`, with no DOM, and are tested in
> `tests/gas-look.test.js`.
> - **Coloured gases gather above the liquid.**
>   - A gas a reaction made stays in the vessel's contents. When its curated colour is not
>     colourless, it fills the space above the liquid in that colour, densest just over the
>     surface, and fades in as it gathers.
>   - The label always names it, for example "reddish brown nitrogen dioxide above the liquid".
>     With no liquid, it says "filling the vessel".
>   - Today that is nitrogen dioxide (reddish brown), chlorine (pale yellow-green), iodine vapour
>     (violet) and ozone (very pale blue).
> - **Smoke where two gases meet.** When every reactant is a gas, as with ammonia and hydrogen
>   chloride, the smoke forms inside the vessel and fills it white, instead of hanging above the
>   mouth. Soot from burning benzene still rises from the mouth.
> - **A cloud at the mouth.**
>   - The notebook writes "A cloud of smoke or vapour appeared." for every rule with
>     `effects.smoke`, but the bench drew nothing for most of them.
>   - It now plays soft puffs leaving the mouth: the steamy hydrogen chloride from salt and
>     sulfuric acid, an acyl chloride in water, silicon tetrachloride in water, and so on.
> - **Checked in the running app:**
>   - nitrite with acid gathered reddish brown nitrogen dioxide, named on the label;
>   - brine with the current on gathered pale yellow-green chlorine;
>   - ammonia with hydrogen chloride filled the beaker with white smoke;
>   - salt with concentrated sulfuric acid sent 6 puffs out of the mouth.
>   - Screenshot: `docs/ui-progress/UI.5/gases.png`.
> - **Fuming liquids** (a curated `fumes` field, owner approved 2026-11-20).
>   - While a fuming liquid or solid is in a vessel, soft wisps keep rising from the mouth: white
>     for a "mist", or the substance's own colour for a "vapour".
>   - The label names it, for example "white fumes from concentrated hydrochloric acid".
>   - Six chemicals are curated, each from a page that was opened (`batch.md` §18):
>     concentrated HCl, ethanoyl chloride, silicon tetrachloride, phosphoryl chloride and
>     trimethylchlorosilane (mist), and bromine (red-brown vapour).
>   - Checked in the running app. Screenshot: `docs/ui-progress/UI.5/fumes.png`.
> - **Not drawn, because the data does not say so:** brown bromine vapour and violet iodine
>   vapour from the halides with sulfuric acid. Those rules make `br2_aq` and `i2_aq`, which are in
>   solution, not vapour. Changing that is a chemistry content change.

✅ **Check:** magnesium, zinc and iron in the same acid side by side are visibly fast, steady and
slow; electrolysis of water shows twice as many bubbles at the cathode.

---

## Stage UI.6 — Apparatus and handling

**Why:** a real practical is as much about handling apparatus as about the chemistry. Dropwise
addition and instrument precision are BUILD_PHASE_2.md Stage 2.5; this stage is how they look.

**UI.6.1 — Sonnet — Stands, clamps and holders**
> Retort stand with boss and clamp holding a burette or a tube at an angle; test-tube holder and
> rack; tripod with gauze; tongs for a crucible. Vessels snap into place when dropped on them.

> **Done (2026-11-20), except a tube at an angle and the crucible tongs** (below).
> - **Retort stand + clamp** (new on the tray): a heavy base, a steel rod, and a boss carrying a
>   clamp.
>   - A burette or a tube dropped on the stand goes into the clamp. Anything else stands on the
>     base, centred under it.
>   - A burette in the clamp over a flask on the base is clamped over it, with its tip just
>     inside the mouth, so its tap delivers into the flask.
>   - A burette dropped straight onto a flask that stands on a stand goes into that stand's clamp.
>   - The boss slides to the height the clamp grips at, and the jaws close either side of what
>     they hold.
>   - Moving the stand carries everything on it. Taking the flask away lifts the burette clear
>     again.
>   - The geometry is `src/ui/stand.js`, tested in `tests/stand.test.js`.
> - **White tile** (new on the tray): dropped on a retort stand it lies on the base, under the
>   flask, so a colour change shows against white. On its own, a vessel can stand on it.
> - **Gauze** on the burner's tripod: a wire mesh with its ceramic centre.
> - **Test-tube holder:** a test tube or boiling tube standing over a burner is drawn gripped by
>   a wooden holder, its handle reaching out to the side, as a tube is held in a flame.
> - **The stand's height.** At 1366×768 the bench is only 438 px tall, so the stand is 340 px with
>   its foot in view. A burette over the 250 mL flask reaches above the top of the rod, as a real
>   one often does. Where the bench is too short even for that, the burette sits a few px lower,
>   tip deeper in the neck, rather than leaving the bench.
> - **Checked in the running app,** assembling a titration from the tray by dragging alone:
>   - a retort stand, a white tile, a conical flask and a burette;
>   - the tile snapped onto the base, the flask onto the tile, and the burette into the clamp
>     over the flask, centred and with its tip in the neck;
>   - one drop delivered 0.05 mL into the flask;
>   - a test tube on a burner wore its holder, and both tripods their gauze.
>   - Screenshots: `docs/ui-progress/UI.6/titration.png`, `holder-gauze.png`.
> - **Not done at first: a tube held at an angle.** Tilting a tube tilts the liquid drawn inside
>   it, and a liquid's surface stays level. Doing it properly needed the level worked out for a
>   tilted tube, which came with UI.6.2.
> - **Done later (2026-11-21), after the UI.10.4 realism review: a tube heated in the flame.**
>   The geometry is `src/ui/held-tube.js`, tested in `tests/held-tube.test.js`.
>   - A test tube or boiling tube put on a burner is held in its wooden holder at 45°. Its bottom
>     sits in the flame just above the inner cone, and its mouth points away from the hand.
>   - No tripod or gauze is drawn under it: a tube is heated straight in the flame. Beakers and
>     flasks still stand on the gauze.
>   - **The liquid stays level.** The liquid layer turns back by the tube's tilt about the point
>     where its surface meets the axis, as in the pour. The meniscus is drawn as wide as a level
>     line across the tilted tube. Steam and fumes still rise straight up from the mouth. While the
>     tube is held, a change of level moves at once instead of scaling upright.
>   - **It leans into clear space.** A tube leans left unless the bench's edge or a neighbour is in
>     the way, then right, with the holder mirrored so the handle stays away from the mouth. Two
>     tubes on neighbouring burners lean the same way instead of crossing.
>   - **Turning with the tube:** the selection outline, and the tube's own label card, which now
>     keeps off its tilted glass.
>   - **Unchanged:**
>     - the close look shows the tube upright, lifted out of the flame;
>     - taking the tube off the burner stands it upright again;
>     - nothing new moves: the tilt is a still transform.
>   - **Checked** with the new `held-tube` reference set-up (`capture-ui.mjs --only held-tube`):
>     copper sulfate in a test tube and boiling water in a boiling tube, both level. The `heat`
>     set-up heats crystals in a tilted boiling tube, with water on the cool glass.
>     Screenshot: `docs/ui-progress/UI.10/held-tube.png`.
>   - **A question for the owner, not changed:** a tube heating crystals that give off water is
>     often held mouth slightly down, so the water does not run back onto the hot glass. The bench
>     holds every tube mouth up at 45°, the usual way for a liquid.
> - **Not done: tongs for a crucible.** There is no crucible in the app; it would be a new vessel,
>   and it has nothing to do until something needs heating strongly in one.

**UI.6.2 — Sonnet — Pouring that looks like pouring**
> The source vessel tilts at its lip, the stream falls in an arc onto the target, the level falls
> in one and rises in the other; a last drip follows. Pouring from too high splashes (shown, not
> rewarded).

> **Done (2026-11-20).** The geometry is in `src/ui/pour-path.js`, with no DOM, and is tested in
> `tests/pour-path.test.js`. The choreography is `pourWithHands` in `bench.js`.
> - **The glass goes to the other vessel.** It travels from where it was let go and holds its lip
>   just inside the near edge of the target's mouth, from whichever side it came from.
> - **It tips at its lip:** about 30° when full, nearly on its side when almost empty, because
>   the emptier a glass is, the further it has to tip before liquid reaches the lip.
> - **The liquid stays level.** The liquid layer turns against the glass about the point where
>   its surface meets the vessel's axis, and the glass's own clip still cuts it to the inside. For
>   straight-sided glass that keeps the volume right.
> - **The stream arcs** from the lip onto the target's liquid, or its floor if it is empty, in
>   the liquid's colour.
> - **The levels move together:** the level falls in the source while it rises in the target.
> - **A last drip falls,** then the glass tips back and goes home.
> - **Pouring from a height.** Holding the glass above a vessel's mouth now pours into it - up to
>   160 px above, wherever no furniture is under the pointer.
>   - From more than 70 px above the rim, the stream splashes: droplets thrown up where it lands.
>   - It is shown, never rewarded or punished: the amount poured is exactly what the engine poured.
> - **Unchanged:**
>   - a burette still delivers from its tap;
>   - with reduced motion the plain pour is used;
>   - only transform and opacity move, plus the stream's dash.
> - **Checked in the running app:**
>   - 40 mL of copper sulfate solution poured 10 mL into an empty beaker;
>   - the glass tipped 65°, the blue surface stayed level, and the stream arced in;
>   - afterwards the glass was back exactly where it started;
>   - let go well above the beaker, the long stream splashed 6 droplets.
>   - Screenshots: `docs/ui-progress/UI.6/pour.png`, `pour-high.png`.
> - **The tube at an angle (UI.6.1).** Keeping a liquid level in tilted glass now works, so a tube
>   held at an angle in a clamp can use it. It is still to do.

**UI.6.3 — Sonnet — Dropwise, swirling and stirring**
> A dropping pipette and a burette stopcock release single visible drops; a conical flask can be
> swirled; a glass rod stirs. Each matches what the engine already does when it is used.

> **Done (2026-11-20).** One drop and swirl-or-stir are in `src/ui/dropwise.js`, tested in
> `tests/dropwise.test.js`. The engine is untouched: a drop is an ordinary add or pour of
> 0.05 mL, and a swirl or a rod is the engine's stir.
> - **A dropping pipette.** The shelf's DISPENSE strip has a third mode, "Dropper". A liquid
>   dropped on a vessel then goes in one drop (0.05 mL) at a time.
>   - A pipette comes over the mouth, its rubber bulb is squeezed, and a single drop falls into
>     the liquid. As the drop lands, the engine gets its 0.05 mL.
>   - A solid still opens the amount panel.
> - **The burette's stopcock.** "1 drop" now releases one visible drop from the burette's tip into
>   the flask, and an open tap a run of them. Before, it drew a short streak in the flask's mouth.
>   The burette's drop is the dropper's drop: one constant, and a test holds them together.
> - **Swirling.** A conical flask's mixing button is "Swirl", and the flask rocks on its base as it
>   is swirled.
> - **A glass rod.** "Stir" in a beaker or a tube shows a glass rod dipping in and working back and
>   forth through the liquid.
> - **Checked in the running app:**
>   - the dropper added 10 mL to 10.05 mL with its pipette and falling drop;
>   - "1 drop" from the clamped burette released a drop into the flask;
>   - the flask's button read "Swirl" and it rocked;
>   - the beaker's read "Stir" and the rod appeared.
>   - Screenshots: `docs/ui-progress/UI.6/dropper.png`, `stir-swirl.png`.
> - **The notebook still says "stirred" for a swirl.** That is the engine's own sentence for
>   mixing, and changing it would be an engine change.

✅ **Check:** a titration set-up — burette clamped over a flask on a white tile — can be assembled
from the tray by dragging alone, and looks like the textbook diagram.

---

## Stage UI.7 — The close look

**Why:** at bench scale a precipitate's texture or a meniscus is a few pixels. In a real lab you
lift the tube and look closely against a white background. One large, detailed vessel costs far
less than making every vessel on the bench that detailed.

**UI.7.1 — Sonnet — Look closely**
> Double-click a vessel to open it large beside the bench: its liquid, clarity, precipitate
> texture, bubbles and meniscus at full detail, against a white tile, with every colour named.

> **Done (2026-11-20).**
> - **Opening it.** Double-click a vessel, or choose "Look closely" in its controls. A panel opens
>   beside the bench with the vessel up to three times its bench size, centred on a white tile.
>   × or Esc puts it back down.
> - **Never disagrees with the bench.** The close look is a second drawing of the same vessel,
>   painted by the same `updateVessel` and playing the same effects, at its own size. It shows
>   exactly what the bench and the notebook say: liquid, clarity, layers, precipitate texture,
>   bubbles, meniscus, gases, heat and electrodes.
> - **Glass against white.** On the dark bench glass is drawn pale. On the white tile its walls,
>   outline and printed scale take the darker tone glassware has against white, so they read.
> - **Every colour named.** Beneath the tile, in words:
>   - the liquid's colour and clarity, or each layer;
>   - the solid formed, by its colour and texture;
>   - any solid in the vessel;
>   - any gas or fumes above it;
>   - what heat is doing;
>   - the reading.
> - **Reagents still go in.** A reagent can be dropped on the close look as on the bench. It is
>   not dragged; the bench's drawing is.
> - **Checked in the running app:**
>   - copper sulfate with sodium hydroxide opened at 2.4×, its details reading "Liquid: pale
>     blue" and "Solid formed: pale blue precipitate: Copper(II) hydroxide";
>   - with magnesium fizzing in acid and the close look open, the page ran at 61 frames a second,
>     with 12 bubbles rising in the close drawing. That is this development PC; the i5 lab PC is
>     still to be measured (Phase 10).
>   - Screenshot: `docs/ui-progress/UI.7/close-look.png`.

**UI.7.2 — Sonnet — Reading at eye level**
> In the close look, the meniscus can be read against the graduations; viewed from above or below
> eye level the reading shifts (parallax), and the label explains why you read at eye level.

> **Done (2026-11-21).** The reading and parallax are in `src/ui/meniscus.js`, with no DOM, and
> are tested in `tests/meniscus.test.js`.
> - **A reading lens** in the close look: a magnified strip of the scale around the meniscus, with
>   the instrument's finest divisions and the liquid under its curved surface. A red pointer marks
>   the bottom of the meniscus.
>   - A burette shows 0.1 mL marks and is read to ±0.05 mL.
>   - A 100 mL measuring cylinder shows 1 mL marks and is read to ±0.5 mL.
>   - Beakers and conical flasks are read roughly and marked "approximate: not for measuring".
>   - A tube with no scale shows no lens.
> - **Where the eye is:** "Eye above", "Eye level" and "Eye below".
>   - Above or below eye level, the scale in the lens shifts against the meniscus.
>   - The reading changes the way parallax really works. From above, a burette, numbered
>     downwards, reads too low, and a measuring cylinder reads too high. From below, the reverse.
>   - Beneath the lens a sentence explains why, and says to read with your eye level with the
>     bottom of the meniscus.
> - **How big the shift is.** It comes from the drawing's own glass: its radius at the surface,
>   seen from 6° above or below, on its own scale. So the lens and the number always agree.
> - **A burette is read by what has run out:** 10 mL left in a 50 mL burette reads 40.00 mL.
> - **Checked in the running app,** with 10 mL in a 50 mL burette:
>   - at eye level it read 40.00 mL, to ±0.05 mL;
>   - from above, 39.70 (too low); from below, 40.30;
>   - back at eye level, 40.00.
>   - Screenshot: `docs/ui-progress/UI.7/reading-above.png`.
> - **The close look now scrolls** on a short bench, below its tile, to fit the reading and the
>   details.

✅ **Check:** the close look holds 30 fps with bubbling and settling running; a burette reading
taken in it matches the volume within the instrument's precision.

> **Checked (2026-11-21).**
> - **The burette reading:** at eye level it matches the volume run out to within ±0.05 mL, for
>   every level tested (`tests/meniscus.test.js`).
> - **The frame rate:** the close look ran at 61 frames a second with magnesium fizzing in acid.
>   That was on the development PC; the i5 lab PC is Phase 10.

---

## Stage UI.8 — The room

**Decision needed:** whether toxic-gas reactions (CLAUDE.md §5 hazard variant) should be done
inside a drawn fume cupboard when the student chooses to use one — a UI change in where the vessel
stands, with the hazard text unchanged.

**UI.8.1 — Sonnet — Bench and wall**
> A dark phenolic resin bench with a faint static texture, a tiled wall behind, consistent light
> from one side. Static images, compressed, size reported.

> **Done (2026-11-21).**
> - **The wall:** glazed tiles 100 mm square at the bench's scale, in a dark slate green. The
>   glassware is drawn pale for a dark room, and pale glass vanishes on white tiles, so the tiles
>   are dark. Each tile varies slightly, with a soft glaze sheen and a bevelled edge.
> - **The bench top:** dark phenolic resin with a faint speckle, a 48 px band just above the
>   control strip, where everything stands. A line marks where it meets the wall.
> - **Light from one side:** one gradient falls from the left across bench and wall alike. It is
>   not baked into the images, so the tiles repeat seamlessly and the light stays consistent.
> - **The images** are drawn by `scripts/make-room-images.mjs`
>   (`npx electron scripts/make-room-images.mjs`) with seeded randomness, so they remake exactly.
>   They are saved as JPEG in `src/assets/room/`:
>   - `wall-tiles.jpg`, 220 × 220 px: **2,650 bytes**;
>   - `bench-resin.jpg`, 256 × 48 px: **1,523 bytes**.
>
>   Nothing is downloaded, and they cost nothing at runtime: static backgrounds, no animation.
> - **Checked in the running app at 1366×768,** with the titration set-up standing on the resin:
>   the glass, labels and scales all stay legible. Screenshot:
>   `docs/ui-progress/UI.8/bench-and-wall.png`.

**UI.8.2 — Sonnet — Real reagent bottles**
> Amber and clear bottles, dropper bottles, solid jars and gas cylinders, each with a printed
> label: name, formula, concentration and the GHS pictograms from `ghs-hazards.json`.

> **Done (2026-11-21).** The drawings are in `src/ui/bottles.js`, with no DOM, and are tested in
> `tests/bottles.test.js`.
> - **Which container.** It follows from data already curated, never from a formula:
>   - a gas comes in a gas cylinder;
>   - a solid comes in a wide-mouthed jar with a screw cap;
>   - an indicator or test reagent (the "reagent" drawer) comes in a dropper bottle;
>   - any other liquid comes in a reagent bottle with a glass stopper.
> - **Which glass.** Amber where the new curated `storage: "amber"` field says so (owner approved
>   2026-11-21), clear otherwise. The first batch is five reagents, each from a page that was
>   opened (`batch.md` §19): silver nitrate, iodine, potassium permanganate and hydrogen peroxide
>   solutions, and concentrated nitric acid.
> - **On the shelf:** each reagent row shows its container small, in its glass, holding its
>   contents' colour.
> - **On the properties card:** the full container with its printed label: name, formula and
>   concentration (wrapped when long), and the GHS pictograms for its hazard words.
>   - The pictograms come from `ghs-hazards.json`, each once, in GHS order, with each
>     pictogram's meaning on hover.
>   - All nine are drawn here, simplified, in the GHS form: a black symbol in a white diamond with
>     a red border.
> - **Checked in the running app:**
>   - all 180 shelf reagents show a container, in all four kinds and both glasses;
>   - concentrated HCl's label carries the corrosive and exclamation-mark pictograms;
>   - silver nitrate's amber bottle carries oxidising, corrosive and environment.
>   - Screenshot: `docs/ui-progress/UI.8/bottles.png`.

**UI.8.3 — Sonnet — Fume cupboard**
> If the decision above is yes: a fume cupboard area on the bench; a hazardous reaction done inside
> it shows the fumes drawn away, and the hazard warning still appears in full.

> **Done (2026-11-21).** The owner decided yes (2026-11-21).
> - **A fume cupboard on the tray.** It is bench furniture: a cabinet with a lit back panel, a
>   white worktop, an extraction duct on top, a green airflow light, and a glass sash raised to
>   leave a working opening.
>   - A vessel dropped on it stands inside on the worktop, behind the sash.
>   - The notebook says it was "stood in the fume cupboard", and its label says "in the fume
>     cupboard".
>   - Faint streaks rise inside while the fan runs.
> - **Drawn away.** While the vessel inside holds any gas, fumes or smoke, wisps rise from it up
>   into the duct, in the gas's own colour when it has one. A coloured gas above the liquid is
>   thinner, because it is being drawn off.
> - **The hazard warning is untouched.** The alert appears in full, word for word, wherever the
>   reaction is done. The cupboard changes only where the work happens, never what the student is
>   told.
> - **A label fix found here.** A vessel's label used to sit in the same row as its glass. When
>   the label grew taller than the glass (an extra gas line, say), it pushed the glass down: a
>   beaker in the cupboard sank through the worktop, and the ammonium chloride beaker in UI.5.3's
>   screenshot was cut off by the control strip. Labels now stand beside the glass out of the
>   flow, growing upwards from its foot, so a vessel always stands exactly where it was put.
> - **Checked in the running app,** with bleach and dilute HCl in a small beaker inside the
>   cupboard:
>   - the hazard alert read in full ("Mixing bleach with acid releases chlorine", and the rest);
>   - the label named "pale yellow-green chlorine gas above the liquid";
>   - yellow-green wisps rose into the duct;
>   - the beaker's foot sat on the worktop, 436 px against the worktop's 435.
>   - Screenshot: `docs/ui-progress/UI.8/fume-cupboard.png`.

**UI.8.4 — Sonnet — The notebook as paper**
> The 5 mm grid paper of UI.md §4, with the student's own entries in a hand-written face (bundled,
> licence checked) and the app's entries in print.

> **Done (2026-11-21).**
> - **Grid paper:** the notebook is a faint 5 mm graph rule, about 19 px on screen, over its
>   paper stock.
> - **The student's own hand.** What the student wrote themselves is in Patrick Hand, in
>   blue-black pen, on the grid's 19 px line:
>   - their observations and estimates;
>   - their answer in a comparison;
>   - the box they type an observation into.
> - **The app's entries** stay in print.
> - **The font.** Patrick Hand Regular, Latin subset, 23,944 bytes, SIL Open Font License 1.1.
>   The owner approved the download. Its source, licence text and provenance are in
>   `src/assets/fonts/README.md`. Nothing is fetched at runtime.
> - **Checked in the running app:**
>   - an observation recorded in the notebook is drawn in Patrick Hand, and the font has loaded;
>   - the app's own entries stay in IBM Plex Sans Condensed on the grid.
>   - Screenshot: `docs/ui-progress/UI.8/full-screen.png`.

✅ **Check:** a screenshot of the full screen at 1366×768 reads as a school chemistry lab to
someone seeing it for the first time.

> **Ready for that check (2026-11-21).** `docs/ui-progress/UI.8/full-screen.png` is the whole
> window at 1366×768:
> - the reagent bottles on the shelf;
> - a titration set-up on the resin bench against the tiled wall;
> - the notebook as grid paper with a hand-written observation.
>
> Whether it reads as a school lab to a first-time viewer is for a person who has not seen the app
> to say; it has not been shown to one yet.

---

## Stage UI.9 — Sound (optional)

**Decision needed:** whether the app has sound at all (BUILD_PHASE_2.md decisions log, 2.7).

**UI.9.1 — Sonnet — Offline sounds, off by default**
> Pour, fizz (louder for a vigorous `gasRate`), boil, glass clink and a hazard tone; a mute switch
> in the top bar, OFF by default on school machines. Every file's licence checked and recorded;
> the size added to the installer stated.

> **Done (2026-11-21).** The owner decided: sound yes, synthesised in the app. The sounds are in
> `src/ui/sound.js`, and the choices are tested in `tests/sound.test.js`.
> - **Made, not recorded.** Every sound is generated with the browser's own Web Audio engine. There
>   are no sound files, so nothing is downloaded, there are no licences to check, and **0 bytes**
>   are added to the installer.
> - **The sounds:**
>   - **Pour:** shaped noise as long as the pour, rising in pitch as the vessel fills.
>   - **Fizz:** a crackle of tiny pops where a reaction's bubbles start. It is louder and busier
>     the faster its curated `gasRate`: about 10, 24 or 55 pops a second for slow, steady or
>     vigorous. A rule with no rate on record is steady. A cell's electrodes fizz too when their
>     streams start.
>   - **Boil:** a low rumble with bubbles bursting, for as long as anything on the bench is boiling.
>   - **Clink:** glass set down on furniture, or a burette clamped.
>   - **Hazard:** a soft two-tone alert as the hazard alert opens. It is three short pairs, not a
>     siren.
> - **Off by default.** A "Sound" switch in the top bar, beside "Reduce animation", starts unticked
>   at every launch. Until it is ticked, not even an audio context is made, so a school machine
>   stays silent.
> - **Checked in the running app,** by counting what the app asks of the audio engine:
>   - with Sound off, magnesium fizzing in acid and its hazard alert made no audio at all;
>   - ticked, the same made one audio context and the fizz's pops plus the hazard tone;
>   - setting a beaker on a burner rang a clink;
>   - water boiling at 100 °C started the boil.
>   - No errors.

✅ **Check:** with sound off, nothing is lost: every sound has a visible equivalent.

> **Checked (2026-11-21).** Each sound accompanies something already drawn:
> - the pour, the stream arcing (UI.6.2);
> - the fizz, the bubbles at the same rate (UI.5.2);
> - the boil, the rolling boil (UI.4.2);
> - the clink, the vessel snapping into place (UI.6.1);
> - the hazard tone, the hazard alert itself.
>
> Sound only ever adds to what is on screen.

---

## Stage UI.10 — Fast, accessible, checked

**UI.10.1 — Sonnet — Measure, then tier**
> An fps and frame-time overlay behind a shortcut. A "low" effects tier (fewer particles, no
> convection lines, no slosh) switched on automatically below 30 fps for two seconds, and forced
> by a teacher in settings. The chemistry shown is identical in every tier.

> **Done (2026-11-21).** The meter and the rules are in `src/ui/perf.js`, tested in
> `tests/perf.test.js`.
> - **The overlay.** Ctrl+Shift+F shows the frames a second, the time per frame and the tier in
>   use, for example "60 fps · 16.7 ms · effects full (auto)". Pressed again, it hides.
> - **The low tier:**
>   - half the particles: bubbles, fumes, settling grains, gas puffs and electrode streams, with
>     their rates kept in proportion;
>   - no convection shimmer;
>   - every other boil, steam and bath bubble left out;
>   - no rocking when a flask is swirled. It still mixes.
>
>   The colours, precipitates, bubbles at their relative rates, labels and notebook are identical.
> - **Auto.** Two seconds below 30 fps drops to the low tier, and it stays low until the setting
>   is changed, so the bench does not flicker between tiers. The first three seconds after launch
>   and any time the window is hidden are not counted.
> - **The teacher's setting.** "Effects" in the top bar: Auto (the default), Full or Low. Low is
>   for a machine known to be slow; Full keeps every effect whatever the frame rate.
> - **Checked in the running app:**
>   - the overlay read 60 fps on this PC;
>   - forcing Low cut magnesium-in-acid's bubbles from 18 to 9 and hid the convection shimmer;
>   - in Auto, with every frame slowed on purpose to about 45 ms of work, the tier dropped to low
>     after two seconds ("effects low (auto)").

**UI.10.2 — Sonnet — Performance test**
> A scripted busy bench — four vessels boiling, bubbling and precipitating at once — that fails if
> average frame time is more than 20% worse than the number recorded in `PERFORMANCE.md`.

> **Done (2026-11-21).** `npm run perf` (`scripts/perf-bench.mjs`); the baselines and how to
> record one are in `PERFORMANCE.md`.
> - **The busy bench:**
>   - water boiling with a thermometer in it;
>   - brine with the current on, bubbling off both electrodes the whole time;
>   - a tube of magnesium and acid;
>   - a flask of lead nitrate and potassium iodide.
>
>   Every 2.5 s of the timed ten seconds, the tube and the flask are emptied and their reaction
>   repeated. The test checks the bench really was busy: the water boiled, and bubbles and falling
>   grains were seen.
> - **Frame time is measured with the 60 fps screen cap lifted**, so it is the real cost of a
>   frame and a slowdown shows long before it would drop below 60.
> - **It fails** when the average is more than 20% slower than this machine's baseline, when it is
>   under 30 fps, or when the machine has no baseline. Baselines are per machine (processor and
>   graphics); `--record` adds one, and only from a run that passes its own checks.
> - **Checked on the development PC (i7-1355U, Intel UHD Graphics):**
>   - Full averages 3.06 ms (326 fps) and Low 2.88 ms; repeat runs vary by about 8%.
>   - `--add-work 1` (one wasted ms a frame) reads 36% slower and fails, with exit code 1.
> - **Found while building it:** adding more acid to a tube where magnesium has already reacted
>   says "isn't available in this version of the lab". The engine removes both reactants when a
>   rule runs, even one in excess. This waits for amounts (stage 2.2); the test repeats trials in
>   emptied vessels instead.
> - **Also fixed:** `capture-ui.mjs` ended with exit code 0 even when a capture failed.
> - **Not yet measured:** the lab PC itself (Phase 10).

**UI.10.3 — Sonnet — Accessibility floor**
> Every new control reachable by keyboard with a visible focus ring; text scales to 125%; Reduce
> animation turns off every looping effect; contrast 4.5:1 on all text (UI.md §8).

> **Done (2026-11-21).** `npm run access` (`scripts/check-access.mjs`) checks all four in the
> running app and fails on any miss. It first found 16 controls with no visible ring, 17 pieces of
> text under 4.5:1, a top bar that ran into itself at 125%, and the whole bench mouse-only.
> - **The keyboard (full path, owner approved).**
>   - Every vessel and piece of apparatus is a Tab stop; Enter or Space selects it.
>   - Enter on a reagent on the shelf adds it to the selected vessel, exactly as dropping it does
>     (with nothing selected, the strip says to choose a vessel first).
>   - "Pour into…" and "Put on…" in the control strip list what is on the bench (a burette's is
>     "Clamp above…"; a tile can go "On the retort stand"); Esc closes the list. The mouse can use
>     them too, and they run the same actions as dragging.
>   - **Focus survives redraws** (`src/ui/keep-focus.js`). The control strip, tool tray, readings,
>     notebook and guided bar are rebuilt on every change, many times a second while anything
>     heats, which threw the keyboard's place away after every key.
> - **Focus rings:** one `--focus-ring` colour, ink on light surfaces and wall-tile white on the dark
>   bench, where the ink ring was invisible (1.02:1). 3 px everywhere.
> - **Contrast:**
>   - the grey hierarchy ink (`--ink-60`) from 0.6 to 0.66, 5:1 on the darkest light surface;
>   - the search placeholder up to the same;
>   - a disabled strip button to 5:1, still dimmer than a live one;
>   - the electrolysis ion labels on a small dark backing: on the close look's white tile, white
>     text alone was 1.1:1.
> - **125% text** (Windows' default on many 1366×768 screens leaves a 1093 px window):
>   - the top bar wraps its switches onto a second row instead of overlapping the mode picker;
>   - the shelf and notebook narrow to 300 px below 1250 px;
>   - long formulas, reagent names, apparatus buttons and the strip's title wrap instead of being
>     cut off;
>   - a label card that would run off the bench slides back inside it;
>   - text made larger mid-session (View > Zoom In) redraws the bench and slides anything past its
>     edge back on.
>
>   Also fixed: the shelf's Dispense row overflowed sideways at 100% since the Dropper button
>   joined it.
> - **Reduce animation** already stopped every loop: 54 looping animations before, none after.
> - **Checked:** `npm run access` passes:
>   - 442 Tab stops, all with a ring;
>   - nothing mouse-only;
>   - 0 of 146 pieces of text under 4.5:1, with the properties card, close look and amount panel
>     also open;
>   - the keyboard path 8 of 8;
>   - 125% both opened that way and zoomed mid-session.
> - **Left as it is:** on a 485 px bench (125%) with seven objects, some label cards overlap
>   each other. The overlap resolver has run out of room; no words are cut off. SVG text (printed
>   glass scales, bottle labels) is drawing, not checked as text.

**UI.10.4 — Opus — The realism review**
> Compare the reference set-ups with open-licensed photographs of the same practicals, and list
> every difference a student would notice. Fix the ones that teach something wrong; record the rest.

> **Done (2026-11-21).** The full review is `docs/ui-progress/UI.10/realism-review.md`.
> - **Compared:** the reference benches against five open-licensed photographs, each opened and
>   only viewed, with its licence recorded: lead(II) iodide, Bunsen flames from closed to open, a
>   beaker on a gauze and tripod, a burette over a flask, and zinc in acid.
> - **Fixed (taught something wrong):** a solid a reaction makes was labelled by its shelf name.
>   Copper laid down by zinc read "Copper turnings", limewater's milky precipitate read "Calcium
>   carbonate (marble chips)", displaced iron read "Iron filings", and alumina read "(bauxite)".
>   The notebook already used the reaction's own words, so the bench disagreed with it. The label
>   now uses those words ("deposit: reddish brown copper"). The change is in
>   `src/ui/appearance.js` only, with a test over every rule.
> - **Teaches something wrong, but not a drawing; needs a decision:**
>   - distilled water alone is told it "needs an electric current" (pure water barely conducts);
>   - a reaction is a two-second burst and the metal in excess vanishes (stage 2.2, amounts);
>   - a test tube is heated standing upright on the tripod (the angled tube deferred in UI.6.1).
>     **Since done:** a tube on a burner is held at 45° in the flame (see UI.6.1).
> - **Recorded:**
>   - flame sizes;
>   - the gauze has no ceramic centre;
>   - the titration set-up has no stand or white tile;
>   - lead(II) iodide forms as falling grains rather than swirling clouds;
>   - label cards can cover glass on a crowded bench.

✅ **Check:** on Intel HD integrated graphics the busy bench holds 30 fps; the realism review
finds nothing that would teach a student something wrong.

---

## Decisions log

| Stage | Decision | Answer | Date |
|---|---|---|---|
| — | Build the UI realism track with Claude Code instead of Claude Design (Phase 9) | Yes (owner) | 2026-11-10 |
| UI.2 | Real tube capacities (test tube 20 mL, boiling tube 55 mL) and guided test-tube amounts scaled to 1–8 mL | Yes (owner) | 2026-11-17 |
| UI.3.6 | A curated `layers` field on rules for liquids that do not mix | Yes (owner) | 2026-11-19 |
| UI.4.2 | The burner stops each liquid at its own curated boiling point instead of always at 100 °C | Yes (owner) | 2026-11-19 |
| UI.4.5 | Engine change: `setHeat` can be told what is under the vessel, for the notebook sentence only | Yes (owner) | 2026-11-20 |
| UI.4.5 | Water bath settings: off, 40, 60, 80 °C and boiling | Yes (owner) | 2026-11-20 |
| UI.4 | Curated `boilingPointC` (all liquids and solutions) and `meltingPointC` (solids the app melts); one general reference for dilute aqueous solutions | Yes (owner) | 2026-11-19 |
| UI.3 | Curated `clarity`, `form` and `texture` in chemicals.json (plus `filings`, `turnings`, `foil` as forms; one general reference for clear solutions) | Yes (owner) | 2026-11-17 |
| UI.4 | Curated `boilingPointC` / `meltingPointC` | | |
| UI.5.3 | Curated `fumes` ("mist" or "vapour") on chemicals that fume in moist air, sourced | Yes (owner) | 2026-11-20 |
| UI.5 | Curated `effects.gasRate` (slow / steady / vigorous) on every rule with bubbles of a gas, sourced, in batches; missing fails the build once done | Yes (owner) | 2026-11-20 |
| UI.8.2 | Curated `storage: "amber"` on reagents kept from light, sourced | Yes (owner) | 2026-11-21 |
| UI.8 | A fume cupboard on the bench: a vessel can stand inside it; fumes and toxic gas made there are drawn away; the hazard warning is unchanged | Yes (owner) | 2026-11-21 |
| UI.10.3 | Full keyboard path on the bench: vessels and apparatus as Tab stops, Enter on a shelf reagent adds it to the selected vessel, "Pour into…" and "Put on…" in the control strip | Yes (owner) | 2026-11-21 |
| UI.9 | Sound in the app: yes, synthesised in the app with Web Audio (no files, no downloads, nothing added to the installer), with a top-bar switch OFF by default | Yes (owner) | 2026-11-21 |

# UI.10.4 — The realism review

BUILD_UI.md asks: *compare the reference set-ups with open-licensed photographs of the same
practicals, and list every difference a student would notice. Fix the ones that teach something
wrong; record the rest.*

**Our side.** The reference benches were captured with `npx electron scripts/capture-ui.mjs`
at 1366×768 on 2026-11-21.

**The other side.** Photographs were opened on Wikipedia's file pages, which show the Wikimedia
Commons licence. They were viewed only: nothing was downloaded or copied into the project.

## The photographs

| Practical | Photograph | Author | Licence |
|---|---|---|---|
| Lead(II) iodide precipitating | [File:Lead (II) iodide precipitating out of solution.JPG](https://en.wikipedia.org/wiki/File:Lead_(II)_iodide_precipitating_out_of_solution.JPG) | PRHaney | CC BY-SA 3.0 |
| Bunsen flames, air hole closed to open | [File:Bunsen burner flame types.jpg](https://en.wikipedia.org/wiki/File:Bunsen_burner_flame_types.jpg) | Arthur Jan Fijałkowski | CC BY-SA 3.0 |
| Beaker on gauze, tripod and burner | [File:Laboratory tripod with other lab equipments.jpg](https://en.wikipedia.org/wiki/File:Laboratory_tripod_with_other_lab_equipments.jpg) | NagayaS | CC BY-SA 4.0 |
| Burette over a conical flask | [File:Acid and Base Titration.jpg](https://en.wikipedia.org/wiki/File:Acid_and_Base_Titration.jpg) | Kengksn | CC BY-SA 4.0 |
| Zinc in hydrochloric acid | [File:Zn reaction with HCl.JPG](https://en.wikipedia.org/wiki/File:Zn_reaction_with_HCl.JPG) | — | Public domain |

The blood-red thiocyanate test and the coloured precipitates (copper(II) hydroxide, iron(III)
hydroxide, silver chloride, barium sulfate) were checked only against their curated colours, not
against photographs. They are not covered by this review.

## Fixed: it taught something wrong

**A solid a reaction makes was labelled by its shelf name.** In the textures set-up, zinc lays
copper down out of copper(II) sulfate solution, and the vessel's label read "reddish brown deposit:
Copper turnings". Turnings are machined curls of metal sold on the shelf. Displaced copper is a
reddish-brown powdery coat.

The notebook already said it right ("A deposit formed: reddish brown copper."), so the bench was
disagreeing with the notebook. The same fault affected:

| Label shown | Used for |
|---|---|
| "Calcium carbonate (marble chips)" | limewater turning milky, and four other precipitations of calcium carbonate |
| "Iron filings" | iron displaced from solution, and molten iron |
| "Aluminium oxide (bauxite)" | alumina made by heating aluminium hydroxide; bauxite is the ore |
| "Silica (sand and clay)" | silica made from silicon tetrachloride and water |
| "Tin granules" and "Carbon (charcoal)" | the solids the tinplate and polythene rules leave |

**The fix** is in `src/ui/appearance.js`, with no data or engine change. When the solid a reaction
makes is a shelf reagent (it carries a curated shelf `form`), its label uses the reaction's own
curated words, the same words the notebook uses. For example, "deposit: reddish brown copper" and
"precipitate: white calcium carbonate". A solid that is not a shelf reagent keeps its name, such as
"bright yellow precipitate: Lead(II) iodide". Tests in `tests/appearance.test.js` cover every rule.

## Needs a decision: it teaches something wrong, but is not a drawing

1. **Distilled water alone "needs an electric current".**
   - Pouring distilled water into an empty vessel writes "No observable change. This mixture needs
     an electric current passed through it before anything happens."
   - Pure water barely conducts; water is electrolysed with a little acid added. The sentence comes
     from the water electrolysis rule (chemistry content and the engine's sentence), so it is not
     the UI's to change.
   - Students see it every time they take water, which is often.
2. **A reaction is over in two seconds, and the metal in excess vanishes.**
   - In the photograph, zinc granules fizz steadily, wrapped in fine bubbles, for minutes while
     they slowly dissolve. On the bench the fizzing is a two-second burst and the zinc disappears.
   - The engine removes both reactants when a rule runs: it has no amounts yet. A second pour of
     acid onto the same tube says "isn't available" (found in UI.10.2).
   - This is stage 2.2, amounts.
3. **A test tube is heated standing upright on the tripod.**
   - A test tube or boiling tube is heated held in a holder, at an angle, in the flame, with its
     mouth pointing away. Standing it on a gauze is not how it is done.
   - The angled tube was deferred in UI.6.1; it is the drawing change most worth doing next.
   - **Since done (2026-11-21):** a tube on a burner is now held in its holder at 45°, in the flame,
     with no tripod under it and its liquid level. See `held-tube.png` and BUILD_UI.md UI.6.1.

## Recorded: a student would notice it, but it teaches nothing wrong

| Set-up | In the photograph | On our bench |
|---|---|---|
| Lead(II) iodide | Dense swirling yellow clouds as the iodide goes in, then a thick heap | Grains fall and settle into a thin yellow layer under clear liquid. The colour and the clear liquid above match. The layer is thin because 20 mL sits in a 250 mL beaker. |
| Bunsen, air hole closed | A tall, bushy, flickering luminous flame, two to three times the height of the blue one | Taller than the blue flame and wavering. With a vessel on the tripod both flames stop at the gauze and spread under it, as a real flame does. |
| Bunsen, air hole open | Pale blue, almost invisible in a lit room, with a bright inner cone | Clearly visible blue with a paler inner cone. It is drawn brighter on purpose, so a student can see it is lit. |
| Tripod | Wire gauze with a white ceramic centre | Gauze without a ceramic centre |
| Titration | The burette held in a clamp on a retort stand; the flask on a white tile; the tip inside the flask's neck | The scale reads 0 at the top and 50 at the bottom, the same way as the photograph's. In the reference set-up the burette is clamped over the flask with no stand drawn, and there is no tile; both exist on the apparatus tray. The tip sits just above the mouth. |
| Crowded benches | — | Label cards can cover the glass. In the layers set-up two tubes' layers are hidden behind a selected beaker's card. |

## What matched

- The lead(II) iodide colour, and the clear colourless liquid above it once it settles.
- The flames' colours, and which way the air hole changes them.
- The burette scale, read from the top.
- Bubbles rising from the surface of the metal, not from anywhere in the liquid.
- The thiocyanate test's blood red.
- Bromine moving into the benzene layer on top.

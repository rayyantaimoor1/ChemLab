# UI.2 — Glassware that looks like glass

Screenshots at 1366×768, made with `npx electron scripts/capture-ui.mjs UI.2`.
Compare with `../UI.1/` for the before.

| Shot | What it shows |
|---|---|
| `glassware.png` | Every vessel on the tray except the burette and boiling tube, part-filled with copper sulfate. Each level sits on the vessel's own printed mark. |
| `titration.png` | A burette clamped over a conical flask, with its tip inside the neck. 40 mL in the burette reads **10** on its scale, because a burette is read from the top down. |
| `precipitate.png`, `colour-change.png`, `gas.png`, `busy-bench.png` | The four UI.1 set-ups again, in the new glass. |

## Where the shapes come from

Each shape uses a real catalogue's dimensions, drawn at 1.1 px per mm.
The pages are listed at the top of `src/ui/glassware.js`. The burette and
the measuring cylinder are drawn shorter than true scale: at 1.1 px/mm a
burette would be taller than the bench. That file says so.

## Photographs to compare against

These are open-licensed photographs on Wikimedia Commons:

- Beakers: [File:Beakers.jpg](https://commons.wikimedia.org/wiki/File:Beakers.jpg) (CC BY-SA 2.5)
- Conical flask: [File:Erlenmeyer flask hg.jpg](https://commons.wikimedia.org/wiki/File:Erlenmeyer_flask_hg.jpg) (CC BY-SA 2.5)
- More of each: [Category:Beakers (laboratory equipment)](https://commons.wikimedia.org/wiki/Category:Beakers_(laboratory_equipment)),
  [Category:Erlenmeyer flasks](https://commons.wikimedia.org/wiki/Category:Erlenmeyer_flasks).
  Check each file's own licence on its page before reusing it.

Nothing here is copied into the app: these are links for a person to look at.

## The check, and what it found

- **Recognisable at a glance:** the beakers, flasks, tubes, cylinder, burette
  and dish all match the photographs and the catalogue proportions. Specifically:
  - the flask's figures spread out up the cone;
  - the cylinder has its hexagonal foot;
  - the burette has its PTFE tap.
- **30 fps with seven vessels:** this could not be measured here, because
  there are no integrated graphics to test on. The glass is static SVG drawn
  once per vessel, and nothing new animates, so the frame cost per vessel did
  not go up. It will be measured properly in UI.10.
- **Tube sizes, decided by the owner:** the test tube now holds 20 mL and the
  boiling tube 55 mL, as real ones do. The guided experiments' test-tube steps
  were scaled down to the few mL a real practical uses. The screenshots put
  3 mL portions into the test tube for the same reason.
- **Still open:** label cards on a crowded bench can still sit over a
  neighbour's glass. This is a UI.1 placement limit, not something new in UI.2.

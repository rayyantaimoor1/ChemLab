# UI.10 — Fast, accessible, checked

## UI.10.1 — Measure, then tier

Checked in the running app (no screenshot: the change is in counts):

| Step | Result |
|---|---|
| Ctrl+Shift+F | the overlay reads "60 fps · 16.7 ms · effects full (auto)" |
| Magnesium in 1 M HCl, effects Full | 18 bubbles rising |
| The same, effects Low | 9 bubbles rising; the convection shimmer is hidden |
| Auto, every frame slowed on purpose for 3 s | drops to low: "33 fps · 30.3 ms · effects low (auto)" |

## UI.10.2 — Performance test

`busy-bench.png`: the busy bench as the timing ends. It shows the water boiling with its
thermometer, the brine with chlorine at the anode, the lead iodide falling in the flask, and the tube
between trials.

| Run (i7-1355U, Intel UHD Graphics) | Average frame | Result |
|---|---|---|
| `--record`, Full | 3.06 ms (326 fps) | baseline |
| `--record --tier low` | 2.88 ms (347 fps) | baseline |
| `npm run perf` | 3.22 ms, 5% slower | PASS, exit 0 |
| `npm run perf -- --add-work 1` | 4.17 ms, 36% slower | FAIL, exit 1 |

## UI.10.3 — Accessibility floor

`npm run access -- --shots docs/ui-progress/UI.10` made these pictures:

| Picture | Shows |
|---|---|
| `access-bench.png` | the audit's bench at 100%: boiling, electrolysis, the fume cupboard, the water bath |
| `access-keyboard.png` | after the keyboard-only path: the light focus ring on "Heat 2", and the notebook lines it wrote |
| `access-reduce.png` | the same bench with Reduce animation on: nothing moving |
| `access-125.png` | opened at 125%: the top bar on two rows, narrower side columns, formulas wrapped |
| `access-125-midsession.png` | zoomed to 125% mid-session |

Result: PASS.
- 442 Tab stops, every one with a ring.
- Nothing is mouse-only.
- 0 of 146 pieces of text under 4.5:1.
- 54 loops before Reduce animation, none after.
- The keyboard path passed 8 of 8 steps.
- 125% passed, both when opened that way and when zoomed mid-session.

## UI.10.4 — The realism review

See `realism-review.md` in this folder. One fix was made: the label of a solid a reaction makes
is no longer its shelf name ("Copper turnings", "marble chips"); it uses the reaction's own words,
as the notebook does. `textures-after.png` shows "deposit: reddish brown copper" on the small
beaker where zinc took copper out of copper(II) sulfate.

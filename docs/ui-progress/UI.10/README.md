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

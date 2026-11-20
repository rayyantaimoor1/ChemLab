# Performance — the busy-bench baseline

The app must hold **30 frames a second** on a school lab PC: an Intel i5 5th gen (or i3 4th gen),
8 GB RAM, integrated graphics only, a 1366×768 screen (CLAUDE.md §2). This file holds the numbers
the performance test compares against (BUILD_UI.md stage UI.10.2).

## The test

```
npm run perf
```

This opens the app in a window at 1366×768 and builds a busy bench, the way a student would:

1. a 100 mL beaker of water at full heat with a thermometer in it: boiling, steam, shimmer;
2. a 250 mL beaker of brine with the current on: hydrogen and chlorine bubbling off both
   electrodes the whole time;
3. a boiling tube where magnesium meets hydrochloric acid: a vigorous burst of hydrogen;
4. a conical flask where potassium iodide meets lead nitrate: a yellow precipitate falling.

The test waits for the water to boil. It then times every frame for ten seconds. Every 2.5 seconds
during that time the tube and the flask are emptied and their reaction run again, the way a
student repeats a trial. So all four vessels stay busy and the notebook keeps writing. The test also
checks that they really were busy: the water boiled, and bubbles and falling grains were seen.

**Why the tube is emptied rather than topped up with acid.** The engine has no amounts yet. When a
rule runs, both reactants are removed, even magnesium that was in excess. A second pour of acid then
meets only magnesium chloride, and the notebook says the combination is not in the lab. A fresh
start is the honest repeat.

**Checking the test can fail:** `npm run perf -- --add-work 1` wastes one extra millisecond in
every frame, like a slow new effect would. On the development PC that reads 36% slower and fails.
Such a run is never recorded as a baseline.

**It fails when:**

- the average frame is **more than 20% slower** than this machine's baseline below;
- the average frame is slower than **33.3 ms**, which is under 30 fps;
- the machine has **no baseline** yet. An unchecked result is not a pass.

**The frame cap is lifted while it runs.** A screen normally caps the app at 60 frames a second, and
a capped number hides a slowdown until it is a big one. So each frame is drawn as soon as the last is
done, and the average frame time is the real cost of drawing the bench. That is why a fast PC reads
far above 60 fps here.

The effects tier is forced to Full (or to Low with `--tier low`), so Auto cannot lighten the bench
halfway through.

## Recording a baseline

```
npm run perf -- --record
npm run perf -- --record --tier low
```

This records the run as the baseline for **this machine**: its processor and graphics, as named
below. A run that fails its own checks is not recorded. That covers a run under 30 fps, or one where
the water never boiled.

Re-record only on purpose: after a change that is meant to cost more, or on new hardware. Say why in
the commit.

**Baselines are per machine.** A number from a fast development PC says nothing about a lab PC, and
comparing the two would fail every run or pass every run. Each machine is checked against its own row.

## Baselines

| Machine | Tier | Average frame (ms) | Frames a second | 95% of frames under (ms) | Recorded |
|---|---|---|---|---|---|
| 13th Gen Intel(R) Core(TM) i7-1355U · Intel(R) UHD Graphics | full | 3.06 | 326 | 6.50 | 2026-11-21 |
| 13th Gen Intel(R) Core(TM) i7-1355U · Intel(R) UHD Graphics | low | 2.88 | 347 | 6.00 | 2026-11-21 |
<!-- baselines end -->

On the development PC (a laptop) five runs of the Full tier ranged from 2.97 to 3.22 ms, a spread
of about 8%, well inside the 20% allowance. A laptop on battery or running hot can be slower.
Plug it in and close other programs before checking or recording.

## Not yet measured

**The lab PC itself** (i5 5th gen, Intel HD integrated graphics) has no row yet. That measurement
is Phase 10, on real hardware: install the app, run `npm run perf -- --record` from a copy of the
project, and add the row. Until then, the 30 fps target is unproven on the hardware that matters.

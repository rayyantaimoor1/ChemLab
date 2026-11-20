# UI.4 — Heat and change of state

Screenshots at 1366×768, made with `npx electron scripts/capture-ui.mjs UI.4`.
Compare with `../UI.3/` for the before.

## UI.4.1 — A Bunsen burner that works like one

`burner.png` shows two beakers of water on two burners at full heat.

- **Right: air hole open.** A roaring blue flame with a pale inner cone, and
  the air hole visible on the barrel. The water has reached 100 °C.
- **Left: air hole closed.** A tall, luminous yellow flame, and soot
  darkening the base of the beaker. The water has only reached 69 °C over
  the same time, because a luminous flame is cooler.

The burner's control strip carries the note on which flame to heat with.

## UI.4.2 — Heat you can see

`heat.png` shows three vessels on three burners:

- **Small beaker, full flame:** water at a rolling boil with steam at the
  mouth and droplets on the glass above it.
- **Boiling tube, full flame:** blue copper sulfate crystals heated dry,
  now the white anhydrous solid. The water driven off has condensed as
  droplets on the cool upper glass.
- **Small beaker, low flame:** water at 50 °C, with faint convection
  currents.

Each label says what heat is doing in words as well.

## UI.4.3 — A thermometer that reads

`thermometer.png` shows two thermometers standing in vessels on burners.

- **The beaker of water, at heat 2:** the red column stands on the 80 mark,
  matching the 80.0 °C beside it.
- **The boiling tube of copper sulfate, heated dry:** the tube is far above
  110 °C, so the column has run to the top of the scale. The label says the
  temperature is off the thermometer's scale.

## UI.4.4 — Very hot solids, and hot glass

`hot-glass.png` shows a beaker of water boiling on the burner. Its label ends
"hot - hot glass looks just like cold glass". The line appears from 60 °C and
stays while the vessel is that hot.

There is no screenshot of the glow, because nothing in the app reaches it yet.
The burner's dry maximum is 500 °C, and a solid only starts to glow at 525 °C.
The rule is in `src/ui/heat-look.js` and is covered by the tests.

## UI.4.5 — Ice bath and water bath

`baths.png` shows a small beaker in each bath:

- **The water bath, set to "Boiling":** water in the beaker has stopped at
  99 °C and does not boil, because the beaker is in water at the same
  temperature. The trough is glass, so the beaker's contents stay in sight.
  The hotplate's red light is on.
- **The ice bath:** copper sulfate solution at 2 °C. The beaker sits down in
  the water, with ice floating in front of it and behind it. The solution
  stays plainly blue through the bath water.

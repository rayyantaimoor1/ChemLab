# UI.9 — Sound

There is nothing to see, so there is no screenshot. Sound is synthesised in
`src/ui/sound.js` and checked by counting what the app asks of the audio
engine:

| Step | Audio contexts | Oscillators | Noise sources |
|---|---|---|---|
| Sound off: magnesium in acid, hazard alert | 0 | 0 | 0 |
| Sound on: the same again | 1 | 116 (the vigorous fizz's pops, and the hazard tone) | 1 |
| A beaker set on a burner | 1 | 119 (a three-tone clink) | 1 |
| Water boiling at 100 °C | 1 | 188 (bubbles bursting) | 2 (the rumble) |

0 bytes are added to the installer.

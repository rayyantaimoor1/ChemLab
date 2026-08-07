# Bundled fonts

Per UI.md's Typography section: "Three roles, all bundled locally (no web fonts — the app is
offline)." These three font files are those roles, fetched once at build time and referenced from
`src/styles/bench.css` via local `@font-face` rules with relative paths — nothing here is ever
requested over the network at runtime.

| Family | Role | Weights bundled |
|---|---|---|
| IBM Plex Sans Condensed | Labels and apparatus names | 400, 500, 600, 700 |
| IBM Plex Mono | Readouts and measurements (tabular figures) | 400, 500, 600 |
| Source Serif 4 | Notebook body text | 400 (regular), 400 (italic) |

Only the `latin` Unicode subset was kept (not `latin-ext`, `cyrillic`, `vietnamese`, `greek`, …),
since the app's own text is English. This keeps the bundle small: ~296 KB total across all nine
files, which barely moves the installer size against the 8 GB RAM / integrated-graphics hardware
floor in CLAUDE.md section 2.

## Licence

Both families are SIL Open Font License 1.1 — free to use, modify and redistribute, including
inside a commercial installer, provided the font files are not sold on their own and the copyright
notices travel with them. The full licence text for each family is bundled alongside the font
files: `OFL-ibm-plex.txt`, `OFL-source-serif.txt`. Source Serif 4's `600` weight reuses the same
file as `400` — the family ships as a variable font and Google's static-CSS endpoint served the
same file for both static weight requests; declaring it twice is harmless (worst case, the "600"
role renders at the file's own default weight rather than true bold) and was left in the CSS as a
future@font-face slot rather than dropped.

## Provenance

Fetched from `fonts.gstatic.com` (Google Fonts' static CDN — a build-time, one-time download, not
a runtime dependency) at the URLs the exported design mockup's `<link href="fonts.googleapis.com/
css2?...">` resolved to. The licence files came from each family's own canonical GitHub repository
(`IBM/plex`, `adobe-fonts/source-serif`).

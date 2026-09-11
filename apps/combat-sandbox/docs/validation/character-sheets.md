# Character contact sheets

The sheets in [`docs/evidence/races/`](../../../../docs/evidence/races/) are the
evidence that a shipped character build looks like what the roster says it does:
ten cards, each holding a close face and a full body, rendered through the
shipping renderer.

`scripts/render-character-sheet.mjs` makes them. Run it from
`apps/combat-sandbox`:

```bash
node scripts/render-character-sheet.mjs \
  --roster playable --sex male \
  --out ../../docs/evidence/races/current-defaults.png

node scripts/render-character-sheet.mjs \
  --roster variants --sex female \
  --out ../../docs/evidence/races/race-valid-variants-female.png
```

| Flag | Meaning |
| --- | --- |
| `--roster playable` | The shipped roster, `packages/game-core/src/actors/generated/races.json` |
| `--roster variants` | The sheet-only alternates in `tooling/asset-pipeline/output/sheet-variants/` (manifest `roster.json`) |
| `--sex male\|female\|both` | Which builds to card. Ten fit on a sheet |
| `--title`, `--subtitle` | Override the header |
| `--out` | Where the PNG goes. A `.json` of what was shot lands beside it |
| `--prebuilt` | Reuse `dist/` instead of rebuilding first |
| `--headed` | Watch the browser work |
| `--builds a,b` | Card only these roster build ids, instead of every build of the chosen sex |
| `--armour a,b` | **Armour mode.** One card per build × piece, each wearing exactly that one piece, framed on the neck |
| `--flag <item id>` | Draw those cards with a warm border and a “check this one” label |
| `--backdrop RRGGBB` | Scene clear colour (and fog colour) for the run. Default: the arena's own sky |

A run builds the app, serves it, drives one page load per panel and composes the
grid with ffmpeg. Budget a few minutes.

## The armour neck-seam sheet

[`docs/evidence/races/armour-neck-check.png`](../../../../docs/evidence/races/armour-neck-check.png)
answers one question: does any cuirass leave a hole where it meets the neck and
shoulders? Nine cuirasses on a Nord male and the same nine on a Nord female,
eighteen cards, each framed on the collar. Since decision 0056 each card wears
**that build's own** cuirass — one mesh per sex, blended to the wearer's body
weight — so the two rows are genuinely different garments, not one garment on
two bodies.

```bash
node scripts/render-character-sheet.mjs \
  --roster playable --sex both --builds nord-male,nord-female \
  --armour iron-cuirass,steel-cuirass,studded-cuirass,daedric-cuirass,dwarven-cuirass,ebony-cuirass,elven-cuirass,glass-cuirass,orcish-cuirass \
  --flag elven-cuirass --backdrop FF00C8 \
  --title "..." --subtitle "..." \
  --out ../../docs/evidence/races/armour-neck-check.png
```

Why it looks like that:

- **The backdrop is deliberately garish.** The defect being judged is *you can
  see the backdrop through the gap*, so the sky and the fog are both set to
  magenta for the run: a hole reads as a magenta pixel on skin, not as a slightly
  wrong shadow. It is a per-shot parameter, never the app's default.
- **One piece at a time.** The portrait path wears nothing unless a shot names an
  item id, so nothing but the cuirass under review is in frame. An id that is not
  wearable armour throws rather than rendering a bare neck that would read as a
  pass.
- **Fixed neck framing.** `shot=neck` is a third entry in `PORTRAIT_SHOTS`: a
  level lens 1.2 m out at shoulder height over a 30° frame, riding the build's
  `heightScale` like the face shot. Same pinning as every other shot, so it
  re-shoots as a diff.

Re-shoot it when an armour mesh, its rig weighting or the body under it changes.

## How the alternates are shown without shipping them

The alternate donors are evidence, not characters: their GLBs stay in the
pipeline's output, out of `packages/character-assets/` and out of the roster the
game imports, so nothing can select a body we do not ship. To card them the
renderer copies that directory into the app's `dist/` for the length of the run
and hands the page one roster entry per load
(`window.__PORTRAIT_SHEET_BUILD__`). The portrait path resolves the body through
`raceStore`'s `playerBuildOverride` — the same store the picker writes to, and
null in the game. `visualScenarioFromSearch` takes the build lookup as an
argument for the same reason: injected, so the game keeps one roster.

## When to re-shoot

Re-shoot whenever what a character **looks like** changes. Nothing else in the
repo shows the change:

- a new or replaced donor NPC, FaceGen mesh or FaceTint;
- a change to skin tint, hair tint, body weight or height scale;
- a new build, race or sex in the roster;
- a change to the body, head, hair or eye meshes the pipeline mounts;
- a change to the character shader, its tint path, or the arena lights.

Do **not** re-shoot for animation, combat or physics work. Nothing in the frame
moves with it, so the diff will be empty. Use
[animation recordings](animation-recordings.md) instead.

Re-shoot into a scratch path first and compare it with the committed sheet.
Overwrite the committed one only when the difference is the change you made.

## Why the diff is trustworthy

Everything in the frame is pinned, so two runs are pixel-comparable and a
re-shoot after an appearance change is a real diff rather than noise:

- **Pose.** The `portrait` visual scenario has no input cues. The character
  stands in `IDLE`, held at the clip's first frame. The mixer starts as soon as
  the GLB finishes decoding, which is a variable number of frames before the
  scenario driver arms, so a running idle would reach a different point in its
  cycle every time.
- **Camera.** A fixed world position, look-at and field of view per shot, in
  `packages/game-core/src/validation/visualScenarios.ts`. The face camera's
  height rides the build's own `heightScale` from the roster, which is a
  constant known before the run, not a measurement of the running scene.
- **Light.** The arena's ambient, hemisphere and directional lights are
  constants. The sandbox has no time of day and no weather.
- **Kit.** Armour, off-hand, quiver, arrow and the carried weapon are hidden,
  unless the shot named one armour piece (`--armour`, below).

The shots come out of the real renderer, as a Playwright screenshot of the
running sandbox, because that is the thing being judged. An offline render would
prove a mesh that we do not ship.

Measured on 2026-09-10, two runs of the ten male builds: the sheets differ by an
average of 0.05 luma levels out of 255 (PSNR 37.1 dB). What is left is
antialiasing along the silhouette, from the physics capsule settling over a
number of frames that still depends on load time. An appearance change moves the
picture by far more than that, so the diff reads.

The script fails rather than writing a plausible-looking sheet: it checks the
finished PNG's dimensions and measures every panel's luma, so a shot that never
rendered or landed in the wrong place stops the run.

## Reading the sheet by hand

`?scenario=portrait&build=<build id>&shot=face|body|neck` opens a single card in
the dev server, which is the quickest way to look at one build closely.
`&armour=<item id>` puts one piece on it and `&bg=RRGGBB` swaps the backdrop. It is a
debug entry point. The state of record for the chosen character stays
`raceStore`. The picker on the title screen sets it.

## Known gap: donor names

Each card names the `Skyrim.esm` NPC whose FaceGen the build wears. It shows a
tidied editor id: `Kharag Gro Shurkul`, not `Kharag gro-Shurkul`. The real
display name cannot be read on this machine. `Skyrim.esm` is a localised plugin,
so each NPC's `FULL` field is a four-byte string id. The tables those ids index
(`Skyrim_English.STRINGS` and its `.DL`/`.IL` siblings, normally carried in
`Skyrim - Interface.bsa`) are absent from the asset vault. One donor,
`EncWarlockIce03BossHighElfM`, has no name at all and does not inherit one; in
game it shows its race.

Tracked in [`docs/polish-backlog.md`](../../../../docs/polish-backlog.md). When
those files land in the vault the fix is small and belongs in
`pipeline/npc_records.py`, which already parses the record: read `FULL`, resolve
it against the table, carry the name in the roster, then label the card from
that. There is deliberately no name table in the renderer, because a table would
go stale the first time a donor changed.

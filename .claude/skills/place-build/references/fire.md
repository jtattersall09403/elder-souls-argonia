# Fire: presets, anchors, and how to check a place's flames

The runtime draws every flame with the fire module,
`packages/game-core/src/fx/fire/` (16k walk 5; TSL node materials since
decision 0110). Two renderers read one preset table:

- **Cards, every preset, both backends** (`flameMaterial.ts`): procedural
  flame cards (fbm noise over a teardrop, a 3-stop temperature ramp),
  Y-locked billboards. They are the only renderer on the WebGL 2 fallback,
  and the only renderer for `candle`, `lanternStanding` and
  `lanternHanging` on every backend.
- **Volume, large presets, WebGPU only** (`volumeFire.ts`): `torchGround`,
  `torchHandheld`, `brazier`, `hearth` and `campfire` (the presets with a
  `volume` block) draw as a box raymarched through a small simulated
  temperature grid when the renderer runs on WebGPU
  (`activeBackend(renderer) === "webgpu"`, read at the first draw) and the
  camera is within 35 m (`FIRE_VOLUME_REACH_M`). Beyond that, and on WebGL,
  the same fire is its cards; the two cross-fade over 5 m. The ray
  accumulates temperature and maps it once through the ramp; a 32^3
  tiling detail-noise texture (filled once per field) displaces each
  sample by about a grid cell and erodes the cool edge into tongues.

Both write display-referred colour through `displayToScene` (the inverse of
the frame's ACES tone map at the current exposure) with premultiplied
blending, so a fire reads as an orange shape by day and a glowing flame at
night. The builder never draws or places a flame
by hand: each flame comes from the kit manifest's mined `flames[]`
(build_kit `mine_fire_layer`, the NIF's own emitters). A lit piece with no
mined emitter gets one fallback anchor. Pick the piece, and the fire follows
from its records.

## 1. Which preset a flame gets

`fireTypes.ts` `firePresetFor` reads the piece's own records, never its name
alone. First match wins:

| Piece's records | Preset |
|---|---|
| fixture kind `campfire`, or a campfire asset | `campfire` (2 core + 3 outer cards, embers) |
| a fireplace or hearth asset (`fireplacewood01burning`) | `hearth` |
| fixture kind `brazier`, `forge` or `cook-fire` | `brazier` |
| the emitter's source names a torch (`MPSTorchFire01`), or kind `torch` | `torchGround` |
| kind `lantern` with a mined candle (`candlelanternwithcandle01`: 2 wicks) | `lanternStanding`, one per wick |
| kind `lantern`, no mined emitter, `anchorClass: hanging` (Argonian cord lanterns) | `lanternHanging`, at the body |
| anything else (candles, candelabra, shrine candles) | `candle` |

Brazier, hearth and campfire are fire beds: the piece burns once, at its
first emitter, spread over the bed. Every other preset burns at each mined
emitter. `torchHandheld` is for the carried torch; it has no world anchor.

## 2. Tweaking a preset

Presets are data in `FIRE_PRESETS` (`schemaVersion` 3, renderer-agnostic:
cards and volume read the same table). Change a number there, never in the
shader. Sizes are metres at piece scale 1 and follow real fires, and a
unit test holds that order: the candle is the smallest and calmest preset,
the campfire the largest and wildest.

- Size and shape: `shape.widthM`, `shape.heightM`, `shape.taper`.
- Motion: `turbulence`, `riseSpeed`, `flicker.rateHz`, `flicker.amount`. The
  point light flickers with the same seed and rate.
- Colour: `ramp.base`, `ramp.mid`, `ramp.tip` (linear 0..1).
- Day and night strength: `gain.day`, `gain.night`. The shader reads the
  renderer's exposure: 3.9e-5 at noon, 22 on a moonless night.
- Embers: `embers.count`, `embers.riseM`. Smoke hand-off: `smokeHandOffM`.
- Volume (large presets): `volume.grid` (cells; 16x32x16), `volume.box`
  (the box in flame widths and heights), `volume.riseSpeed`,
  `volume.turbulence`, `volume.noiseScale`, `volume.octaves` (the tongues),
  `volume.dissipation` (shorter flame when higher), `volume.emit`,
  `volume.sourceRadius`, `volume.steps` (raymarch), `volume.density`.
  `fireVolumeCost` states each preset's cost; `fire.test.ts` holds the
  budget (at most 16x32x16 cells, 0.25 MB per field, 32 steps). Adding a
  `volume` block to a small preset is a decision-0110 change, not a tweak.

## 3. Verify

1. **Contact sheet** (about 1.5 s for every preset, no GPU, no studio):
   `npm run look -- preset [<presetId> ...] --out <dir>`
   writes `<dir>/<preset>.png`: 6 frames,
   0.2 s apart, by day (top row) and by night (bottom row). The white tick
   marks the emitter. Bar: a solid orange flame by day, and at night an
   orange body with a pale core and no white blob. The flame's root sits on
   the tick. A shader error fails the run with the GLSL log.
   **On the piece** (about 0.4 s per fixture after the first): 
   `npm run look -- fixtures [<kit> <assetId> ...] --out <dir>`
   burns the flame on the real kit piece at the loader's anchors (front,
   above, close-up; day and night), one PNG per fixture (no pairs: the
   default fixture list in `tooling/visual-look/subjects/fixtures.mjs`).
   Bar (0107 "Flame size"): the flame rises clearly above the fuel, wick or
   torch head (a campfire >= 0.8x its log bundle's diameter above the logs, a
   torch 0.3-0.45 m seen, a candle ~4-6 cm), centred on it, inside a
   lantern's glass. A preset size change is judged here, never on the preset
   sheet alone: the preset sheet cannot show the fuel that hides the root.
1. **Backend contact sheets** (the subsystem harness, headless SwiftShader, no
   studio), run ONE backend at a time from `apps/world-studio`:
   `node scripts/harness-run.mjs --sys fire,fire-night,fire-close --backend webgpu --w 1024 --h 384 --out tmp/harness/fire-gpu`
   then the same with `--backend webgl --out tmp/harness/fire-gl`. `fire`
   and `fire-night` are all eight presets scaled to 0.8 m (left to right
   in `FIRE_PRESET_ORDER`), by day (exposure 3.9e-5) and by night (22);
   `fire-close` is the four large presets at night. On `webgpu` the large
   presets are volumes, on `webgl` cards: compare the two. Bar: a solid
   orange flame by day, and at night an orange body with a pale core and
   no white blob; the root sits on the ground line. A shader error or
   warning makes the run `ok: false` in `summary.json`. Cost: `fire-stress` (20 fires at
   night, 4-34 m, volumes on WebGPU) against `fire-stress-cards` (the same
   20 as cards) gives `frameMs` in `summary.json`; SwiftShader times are a
   ratio only (decision 0110 § Measured). A volume artefact: isolate it
   first with `fire-diag-vol` (three braziers, volumes only, seeds 0.5,
   0.55, 0.25) against `fire-diag-cards` (cards and embers only). Anything
   the fragment stage thresholds (the seed's mirroring variant) is made
   whole in the vertex stage: an interpolated value on a step edge flips
   row by row and prints as horizontal streaks (0110 fix 2).
2. **Anchor check** (in `npm test`, under 1 s):
   `packages/game-core/src/fx/fire/fire.test.ts` › "every flame of every
   published place and interior lies in its piece". Every anchor must lie
   inside its piece's bounds (2 cm slack), and a hanging piece's anchor must
   lie in the lower half (the body, never the cord). A failure names the
   placement id and asset. Run it after every publish:
   `cd packages/game-core && npx vitest run src/fx/fire`.
3. **Close-up renders:** every workbench render draws the fire pass, an
   emissive teardrop at each resolved flame anchor with the piece's full
   pose, hang and mount applied (`render.py fire_anchors`,
   `render_scene.py add_fire_light_pass`). A fallback anchor draws
   magenta-orange. For each lit piece, add a day and a night close-up to the
   round:
   `wb.py <scene> render --shots "front:<uid>/2.5,front:<uid>/2.5@night"`.
   The reader answers checklist row 34 on these shots: is each flame in its
   wick, bowl or lantern body?
   Examples: `tooling/.reports/16k/walk5/fire/renders/`.
4. **Flames visible in the build that deploys** (the only check that may
   say "flames verified"; 16k walk 7). Steps 1-3 draw the flame at the
   cell's or the piece's origin; the studio draws a cell 4000 m up beside
   its door through the water pipeline's on-screen pass, and for three
   rounds every interior flame was invisible there while steps 1-3 passed.
   Build and compose, then run the check per interior cell the place's
   doors claim, and once outdoors at night for a place with lit fixtures:

       npm run build -w @elder-souls/world-studio && npm run site:compose
       bash tooling/repo-standards/job_guard.sh <lane> -- node tooling/visual-look/flames.mjs interior <cellId> <xKm> <zKm>
       bash tooling/repo-standards/job_guard.sh <lane> -- node tooling/visual-look/flames.mjs place <placeId> --t 22

   It loads `site/` (the files that deploy), opens the cell, and reads the
   framebuffer at every on-screen flame with the flames on and off. PASS
   needs flame systems, emitters, draws, on-screen cards and VISIBLE cards
   all above zero; the JSON and PNG land in `tooling/.reports/flames/`.
   An unchanged key (fire sources, the cell bundle, its kits' fires maps)
   skips the browser and reprints the stored verdict. Add `--url
   https://jtattersall09403.github.io/elder-souls-argonia/studio/` to ask
   the same of the deployed site. The walk packet quotes the PASS line;
   a packet that claims flames without it is unfinished.

## 4. When it is wrong

- `flames.mjs` FAIL `zero: visible` with cards on screen: the flames are
  built and drawn but not where the camera looks, or blended away. Read
  the result's `groupWorld`, `firstCardRaw` and `cards[].dist` first (the
  walk-7 cause: shaders that ignored the group's world matrix drew the
  cell-local flames 4 km below the player, past `uMaxDistance`).
- `flames.mjs` FAIL `zero: emitters` or `flameSystems`: the cell's kits'
  `parts/index.json` carry no `fires` rows for the drawn assets (re-run
  `kit_parts.mjs` for that kit) or the loader's lookup missed them.

- A flame outside its piece: the mined `offsetM` or the piece's bounds is
  wrong. That is a kit-mining defect (kit-mining skill); never move the
  piece to hide it.
- A lit piece with no flame: the piece has no mined emitter, has flame
  cards of its own (`flameCardMaterials`), or has a fire child mounted on
  it (the brazier's `fxfirewithembers01`). Each is by design.
- The wrong preset: fix the piece's records (the LIGH `fixtureKind`, the
  kit category) or the `firePresetFor` rule, and add a case to
  `fire.test.ts` › "preset choice".
- A look problem that shows on the contact sheet: tune the preset (§ 2),
  then regenerate the sheets. A volume that looks wrong only on WebGPU:
  tune its `volume` block, never the card numbers.

Log a fire lesson as a row in
`.claude/skills/place-build/references/lessons/dressing-clearance-and-ground.md` with Shot
`front`, and name the preset or anchor rule the lesson changed.

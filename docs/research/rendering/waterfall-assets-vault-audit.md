# Waterfall / rapids / mist assets — what the vault actually holds

Date: 2026-09-08. Companion to [waterfalls-realtime.md](waterfalls-realtime.md)
(that doc is the *technique* survey; this one is the *asset* audit — measured
files, measured sizes, measured shader numbers, measured placements).

Everything below was read out of the vault, not inferred from filenames:

- meshes and textures listed from the BSAs via `pipeline/bsa.py`;
- every NIF parsed block-by-block (node tree, `BSEffectShaderProperty`
  settings, `NiAlphaProperty` blend modes, UV-scroll controllers and their
  key curves, per-shape vertex bounds);
- 26 of them converted through the real kit pipeline to glTF and rendered to a
  contact sheet;
- placement stacks mined from `Skyrim.esm` (693,339 REFRs, 7,263 of them
  water-FX), so "what goes with what" comes from Bethesda's own plugin data.

Unit scale is the pipeline's `METRES_PER_UNIT = 0.0142240` (build_kit.py:58).
Every metre figure here is a converted bounding box, cross-checked against the
piece's own name: `fxwaterfallthin4096x256` measures 4,096 units = 58.3 m of
sheet (the quoted 66 m box includes its spray fan).

---

## 1. Verdict up front

- **The whole vanilla waterfall kit is present, complete, and converts
  cleanly.** 26/26 assets exported, 31 textures resolved, 0 missing, 0
  substituted. Geometry, UVs and texture bindings all survive.
- **The animation does not survive, and was never going to.** These NIFs are
  static meshes plus float controllers that drive the shader's UV offset. The
  controllers are dropped at export. Their rates are recorded in §4 — they are
  one uniform each in our own shader.
- **Nothing usable comes from the mods.** Tropical Skyrim, Xanmeer, Project
  Rainforest, Sirenroot, Depths of Skyrim, Marsh Rest, Darkwater Den and the
  rest ship **no** waterfall, rapids, whitewater or spray asset. Black Marsh &
  Valenwood ships 17 of these files, every one at its vanilla path — vanilla art
  redistributed with the mod, not new work (matched by path, not by hash; see
  §8). So there is **no new credit line to add**: this is Bethesda art the
  README already credits.
- **The falling body cannot be stretched to our drops.** Skyrim's `XSCL` is a
  single uniform scale, so doubling a 30 m sheet to 60 m also doubles its
  width. Bethesda's own answer is to **tile and stack**, and the plugin data
  proves it (§5). For a 40–80 m Black Marsh fall we would stack sheets, or
  build the sheet procedurally and only borrow the textures.

---

## 2. Inventory — vanilla Skyrim

### 2.1 The falling body (curved sheets, authored to wrap a cliff)

| Asset (`meshes/…`) | KB | size m (x × y × z) | tri | notes |
|---|---|---|---|---|
| `effects/fxwaterfallbodytall.nif` | 65 | 13.2 × 13.0 × 16.0 | 1500 | 3 layered shells + 12 flat "CurrentPlane" helpers; has bhk collision |
| `effects/fxwaterfallbodytall02.nif` | 77 | 15.6 × 19.4 × 39.4 | 1658 | the tall one: 34 m of sheet + a 33 m mist jet pair |
| `effects/fxwaterfallbodyslope.nif` | 50 | 12.5 × 21.0 × 10.2 | 1050 | the ramp/cascade body — runs down a slope, not free air |
| `lod/waterfalls/fxwaterfallbodytall_lod.nif` | 3.2 | 13.8 × 9.3 × 15.5 | 84 | single-shell distant stand-in |
| `lod/waterfalls/fxwaterfallbodytall02_lod.nif` | 2.8 | 14.5 × 12.0 × 33.9 | 58 | |
| `lod/waterfalls/fxwaterfallbodyslope_lod.nif` | 3.2 | 12.1 × 19.0 × 9.2 | 70 | |

Each body is three co-located shells — inner water (`…Inner01`,
`BSLightingShaderProperty`, lit), a foam shell (`…Foam`) and a cross-stream
white layer (`L2_whiteCrossStream…`, `BSEffectShaderProperty`, unlit) — which
is exactly the "two overlaid scrolling copies + foam" recipe in
[waterfalls-realtime §1](waterfalls-realtime.md).

### 2.2 Thin sheets (flat strips, sized in game units)

| Asset | size m | tri | sheet height |
|---|---|---|---|
| `effects/fxwaterfallthin128x128.nif` | 2.0 × 1.8 × 2.5 | — | 128 u = 1.8 m |
| `effects/fxwaterfallthin256x128.nif` | 2.1 × 1.9 × 4.4 | — | 256 u = 3.6 m |
| `effects/fxwaterfallthin512x64.nif` | 1.6 × 2.0 × 7.5 | — | 512 u = 7.3 m |
| `effects/fxwaterfallthin512x128.nif` | 2.4 × 2.0 × 7.5 | 412 | 512 u = 7.3 m — **the workhorse** (201 placements) |
| `effects/fxwaterfallthin2048x128.nif` | 5.7 × 8.1 × 33.0 | 566 | 2048 u = 29.1 m |
| `effects/fxwaterfallthin2048x512.nif` | 12.3 × 11.1 × 32.9 | 566 | 29.1 m, four times as wide |
| `effects/fxwaterfallthin3096x256.nif` | 9.3 × 14.1 × 43.6 | — | 3096 u = 44.0 m |
| `effects/fxwaterfallthin4096x256.nif` | 11.3 × 16.3 × 66.1 | 566 | **4096 u = 58.3 m — the tallest single piece we own** |
| `effects/fxwaterfallthinsheet.nif` | 9.5 × 1.3 × 13.0 | 320 | wide, shallow — a weir/spillway sheet |
| `effects/fxwaterfallthinspray2048.nif` | 17.9 × 14.6 × 30.4 | 420 | 29 m sheet dominated by its spray fan |
| `effects/fxwaterfallthinleak(.small).nif` | 0.6 × 1.7 × 3.4 / 0.2 × 1.1 × 6.0 | — | drips from a ledge |

The name is the *texture-space* size, and it is honest: the mesh really is
that many units tall. The bigger boxes above include the piece's own spray/mist
child geometry.

### 2.3 Base skirts and mist

| Asset | size m | tri | notes |
|---|---|---|---|
| `effects/fxwaterfallskirttallfront.nif` | 17.1 × 12.7 × 47.1 | 408 | front skirt + `newFog` billboard; the piece that hides the fall→pool join |
| `effects/fxwaterfallskirtslope.nif` | 15.0 × 11.8 × 50.2 | 274 | ramp version, with mist |
| `effects/fxwaterfallskirtslopenomist.nif` | 15.2 × 11.8 × 51.2 | 274 | ramp version, mist stripped |
| `effects/fxwaterfallmistblast.nif` | 0.1 × 10.4 × 6.9 | 84 | two billboarded quads, ~10 m across, ~1 cm thick |
| `effects/fxwaterfallmistblastlite.nif` | 0.1 × 10.5 × 5.9 | 42 | **one quad** — the cheapest mist card in the game, 254 placements |
| `effects/ambient/fxmistlow01.nif` (+ ~40 variants) | 12.9 × 12.6 × 2.5 | 345 | ground-hugging mist disc; `…halfvis`, `…long`, `…adjust`, `…smokey`, `…swirls`, `…wet` are opacity/shape variants of one card |

The skirt boxes are misleading: the visible foam is only the bottom ~3.5 m
(`foam`, `foam01` shapes); the 47–51 m is a tall `…SkirtFillMesh` column that
runs *up* behind the fall, so the same piece serves any drop up to ~50 m.
That is the single most useful geometric fact in this audit.

### 2.4 Rapids, foam and splash (flat planes, laid on the water surface)

| Asset | size m | tri | notes |
|---|---|---|---|
| `effects/fxrapids.nif` / `fxrapids02.nif` | 7.5 × 12.2 × 0.2 | 131 | three near-flat planes, whitewater |
| `effects/fxrapidsbig01.nif` | 24.3 × 40.2 × 0.0 | 815 | two big dead-flat sheets — a whole rapid run |
| `effects/fxrapidsfallsline01.nif` | 5.1 × 16.1 × 0.5 | 204 | **the crest line** — the strip that sits on the lip |
| `effects/fxrapidsfallstop.nif` | 32.0 × 34.1 × 0.7 | 1100 | a large crest/top-of-falls apron |
| `effects/fxrapidsringheavy.nif` | 20.6 × 15.7 × 0.03 | 384 | **the plunge-pool foam ring** (`ripplesBig`, `ripplesSmall`, `jetPuffs`) |
| `effects/fxrapidsrocks01.nif` | 23.8 × 39.9 × 5.2 | — | rapids planes *with* rock geometry and collision |
| `effects/fxsplashlargechurn(norapids).nif` | 4.3 × 4.3 × 13.8 | 52 | pure particle churn — geometry is only an editor marker + a push volume |
| `architecture/whiterun/wreffects/wrstairsstreamrapids01(foam).nif` | 12.4 × 16.2 × 0.18 | 60 | a *hand-shaped* stepped-channel foam plane — the closest thing we own to a "rapids that follows a carved channel" |

### 2.5 Textures (the whole look is ~14 DDS files)

| File | KB | used by |
|---|---|---|
| `effects/FXfluidTile01.dds` | 313 | every thin sheet + body inner shell — the falling-water tile |
| `effects/FXfluidSub01.dds` | 187 | second (slower) sheet layer |
| `effects/FXwaterTile01.dds` / `_n` | 205 / 332 | body inner shell (lit) |
| `effects/FXwaterTile02_n.dds` | 323 | body normal |
| `effects/FXWhiteWater01.dds` | 312 | rapids, foam, cross-stream layer |
| `effects/FXWhiteWater02.dds` | 223 | rapids second layer |
| `effects/FXwhiteWater.dds` | 143 | plunge ring |
| `effects/VaporTile01.dds` | — | sheet spray |
| `effects/FXCloudRoundTile(Strip).dds` | 67 / 39 | mist blast, skirt fog |
| `effects/FXSteamThinAnim.dds` | 150 | mist blast |
| `effects/gradients/GradWhiteWater(.MedSoft/.MedSoftInv/.Soft).dds` | 38 / 44 / 30 / 4 | alpha/colour ramps for all of the above |
| `effects/gradients/GradSteamThin.dds`, `GradSmokeDiss.dds` | 43 / — | mist ramps |
| `effects/foamtile01.dds` | 59 | (unused by these NIFs; a seamless foam tile we could take) |

Under 3 MB of source art for the entire system.

## 3. What the mods hold — nothing

Directory listings of `meshes/effects/`, `textures/effects/` and every
`water*` folder in every extracted mod in the vault:

| Mod | waterfall/rapids/whitewater assets |
|---|---|
| Tropical Skyrim | none (4 FX NIFs: two birds, two lava) — one `water/defaultwater.dds` retexture only |
| Xanmeer tileset | none |
| Project Rainforest, Sirenroot, Sleeping Hist, Depths of Skyrim, Marsh Rest, Darkwater Den, Underwater Treasure, Hovelmud, Mud Mother, all boat mods | none |
| Black Marsh & Valenwood | 17 files, every one at its vanilla path (`effects/fxwaterfallbody*`, `fxwaterfallskirt*`, `fxrapids*`, `fxsplashlargechurnnorapids`, the Markarth and Whiterun ones) — redistributed vanilla, no new art |

**Credits: no new line needed.** The audit uses only Bethesda art the README
already credits. If we later take `foamtile01.dds` or the Whiterun stepped
channel piece, they are also vanilla.

## 4. The shader numbers (what to reproduce, since controllers are lost)

Every piece is `BSEffectShaderProperty` (unlit) or `BSLightingShaderProperty`
(lit inner shell) with `NiAlphaProperty` `SRC_ALPHA / INV_SRC_ALPHA`,
blend on, alpha-test off — **standard alpha blend, not additive**, on every
asset measured. `clampMode = 3` (wrap in both axes) everywhere, which is what
lets the UV offset scroll forever.

Scroll rates, read from the controllers' `NiFloatData` key curves
(value is in *UV tiles*; the loop length is the controller's stop time):

| Asset | layer | V offset rate (tiles/s) | U offset rate | other |
|---|---|---|---|---|
| `fxwaterfallthin512x128` / `2048x128` / `2048x512` | main sheet ×2 | **−0.857** (0 → −2 over 2.33 s) | +0.030 | U scale wobbles 1.00↔1.05 over 8.3 s |
| `fxwaterfallthin2048x128` | spray/vapor | −0.200 | +0.015 | |
| `fxwaterfallthin4096x256` | main sheet ×2 | −0.857 | +0.030 | spray −0.20 / +0.015 |
| `fxwaterfallthinsheet` | sheet ×2 | −0.760 | +0.030 | lit layer −0.30 |
| `fxwaterfallthinspray2048` | sheet ×2 | **−1.250** | +0.030 | spray −0.20 / +0.015 |
| `fxwaterfallbodytall` | lit inner shell | −0.120 | ±0.036 wobble | U/V scale wobble ±3 % over 6.5 s |
| `fxwaterfallbodytall` | unlit foam/cross | −0.313 and −0.333 | — | two layers, deliberately co-prime |
| `fxwaterfallbodytall02` | as above + mist | −0.313 / −0.333 / −0.200 | +0.015 | |
| `fxwaterfallbodyslope` | lit shell / unlit ×2 | −0.171 / −0.429 | — | ramp scrolls slower than free fall |
| `fxwaterfallskirttallfront` | foam ×2 / fog | −0.545 ×2, +0.362, −0.158 | 0.0 | note the **+0.362**: one layer scrolls *up* |
| `fxwaterfallmistblast(lite)` | mist card | −0.158 | — | |
| `fxrapids` | 3 planes | −0.150, −0.150, **−0.500** | — | one fast layer over two slow |
| `fxrapidsbig01` | 2 planes | −0.300 ×2 | — | |
| `fxrapidsfallsline01` | 3 planes | −0.500, −0.075, −0.150 | — | crest: one fast, two slow |
| `fxrapidsfallstop` | 3 planes | −0.300, −0.300, −0.500 | — | |
| `fxrapidsringheavy` | ripples ×2 / puffs | −0.667 ×2, **+0.375** | — | ring foam counter-scrolls |
| `fxmistlow01` | mist disc | +0.030 | −0.017 | 34 s / 60 s loops — very slow drift |
| `wrstairsstreamrapids01` | channel foam | −0.375 (0 → −1 over 2.67 s) | ~0 | driven by a `NiControllerSequence` |

Design rules visible in those numbers, worth copying:

1. **Two layers, never one**, at rates that are close but not equal
   (−0.313/−0.333, −0.545/−0.362) so the pattern never repeats visibly.
2. **A slow lateral drift** (U ≈ +0.03/s) on top of the fast downward scroll —
   this is what stops a fall reading as a conveyor belt.
3. **One counter-scrolling layer** at the base (skirt +0.362, ring +0.375):
   foam spreading *outward* from the impact, exactly the "foam spreads out
   along the pool, does not pop upward" note in waterfalls-realtime §1.
4. **Falls scroll ~3–5× faster than ramps** (−0.86 sheet vs −0.17 slope shell).
5. **Softness is data**: `softFalloffDepth` is 40 units (0.57 m) on the sheets,
   75 units (1.07 m) on the spray, 42 units on the ground mist — i.e. the
   depth-fade distance for a soft-particle term, per layer.
6. **Emissive multiple 0.70–0.75, emissive colour ~0.70 grey**: white water is
   faked with an unlit emissive-ish term, not PBR-lit.

## 5. How Bethesda assembles them (mined from `Skyrim.esm`)

89 base forms reference these meshes; 7,263 REFRs place them. All are `MSTT`
or `STAT` — hand-placed statics, no scripting.

**Uniform scale is used constantly and aggressively.** Share of placements with
a non-1.0 `XSCL`, and the range:

| Piece | placements | scale range | % scaled |
|---|---|---|---|
| `fxwaterfallthin512x128` | 201 | 0.42 – **4.81** | 58 % |
| `fxwaterfallbodytall` | 97 | 0.33 – 3.38 | 65 % |
| `fxwaterfallbodyslope` | 85 | 0.33 – 2.56 | 69 % |
| `fxwaterfallthin4096x256` | 29 | 0.75 – 1.85 | 55 % |
| `fxwaterfallskirtslope` | 114 | 0.14 – 1.94 | 80 % |
| `fxwaterfallmistblastlite` | 254 | 0.08 – 2.02 | 69 % (median **0.51**) |
| `fxrapidsringheavy` | 211 | 0.10 – 2.85 | 85 % |
| `fxrapidsfallsline01` | 232 | 0.35 – 2.28 | 83 % (median 1.18) |
| `fxsplashlargechurn` | 174 | 0.24 – 2.25 | 92 % (median 0.66) |

So the tallest thing Bethesda ever built from one piece is
`fxwaterfallthin4096x256` at 1.85× = **108 m** — but that scales the width to
21 m too. `fxwaterfallthin512x128` at 4.81× is a 35 m fall that is 11 m wide.

**Tiling and stacking is authored intent, not a hack.** Same-family neighbour
pairs within 22 m:

| Piece | pairs | side by side (vertical offset ≤ 1 m) | vertically offset | median Δz |
|---|---|---|---|---|
| `fxwaterfallthin512x128` (7.5 m) | 389 | 129 | 260 | 4.6 m |
| `fxwaterfallthin2048x128` (29 m) | 56 | 32 | 24 | 5.6 m |
| `fxwaterfallbodytall` (16 m) | 22 | 12 | 10 | 10.8 m |
| `fxwaterfallbodyslope` (10 m) | 38 | 22 | 16 | 4.6 m |

Sheets are laid **shoulder to shoulder** across the width (median horizontal
separation 4.5 m for a 2.4 m-wide piece — deliberately overlapping) *and*
**overlapped vertically** at roughly ⅔ of a piece height, so the seam is
always inside another sheet's body.

**The canonical stack**, from median relative offsets (NIF origins sit at the
*top* of these pieces, so Δz is top-to-top):

| Anchor | Partner | n | median Δz | median horizontal | partner scale |
|---|---|---|---|---|---|
| `fxwaterfallbodytall` | `fxrapidsfallsline01` (crest strip) | 161 | **+0.5 m** | 12.6 m | 1.17 |
| `fxwaterfallbodytall` | `fxwaterfallmistblastlite` (mist card) | 74 | −0.6 m | 13.7 m | 1.00 |
| `fxwaterfallbodytall` | `fxwaterfallskirttallfront` (base skirt) | 52 | **−11.6 m** | 13.1 m | 1.00 |
| `fxwaterfallbodytall` | `fxrapidsringheavy` (pool foam ring) | 69 | **−9.8 m** | 13.6 m | 1.20 |
| `fxwaterfallbodytall` | `fxsplashlargechurn` (churn particles) | 31 | −7.2 m | 15.0 m | 0.80 |
| `fxwaterfallbodyslope` | `fxwaterfallskirtslope` | 121 | −3.3 m | 13.1 m | 0.96 |
| `fxwaterfallbodyslope` | `fxrapidsbig01` (run-out) | 20 | −0.6 m | 18.5 m | 0.81 |
| `fxwaterfallthin2048x128` | `fxrapidsringheavy` | 70 | −13.5 m | 14.7 m | 0.63 |
| `fxwaterfallthin2048x128` | `fxwaterfallthinspray2048` | 37 | −5.1 m | 13.1 m | 0.65 |

A worked example (REFR `0x2782E`, a `fxwaterfallbodytall` at yaw 112.9°,
pitch 4.9°, scale 1.0; offsets in its own local frame, metres):

```
fxwaterfallskirttallfront   x +1.8  y  +3.3  z −11.5   scale 1.00  Δyaw  +20.5
fxrapidsringheavy           x +2.7  y  +2.6  z −12.1   scale 1.00  Δyaw  +22.1
fxwaterfallmistblast        x +0.6  y +11.2  z  −4.4   scale 0.50  Δyaw +149.8  pitch  −7.3
fxwaterfallmistblastlite    x −0.7  y  +9.7  z  −0.7   scale 0.23  Δyaw  +57.1  pitch −135.0
fxrapids                    x −2.0  y +12.4  z  −1.2   scale 0.50  Δyaw −112.9  pitch  +15.0
fxmistlow01  ×20            within ±5 m, random yaw, scale 0.87–1.00
```

Read that as the recipe: **one body, a crest strip on the lip, a skirt and a
foam ring at the plunge, half a dozen small mist cards pitched in every
direction around the impact (scale 0.2–0.5, often rotated 90–135° so they read
as blasts rather than sheets), and a scatter of 10–40 ground-mist discs at
random yaw filling the whole basin.** The mist cards are individually cheap and
numerous — that is the whole trick, and it is not a particle system.

Bodies are pitched a few degrees (median |pitch| 1–5°, up to 33°) to lean into
the rock; ground mist is always level.

## 6. Conversion results — `waterfall-fx-v1`

Kit config `tooling/asset-pipeline/pipeline/config/kits/waterfall-fx-v1.json`
(26 assets), built to `output/kits/waterfall-fx-v1.glb` (4.0 MB, textures
capped at 512 px), contact sheet at `output/sheets/waterfall-fx-v1/`
(26 PNGs + `sheet.md`, each with a 1.8 m human bar).

**Not committed** — it is an audit artefact. Rebuild with the driver used here
if it is wanted again (see the "registry" caveat below).

What survives:

- **All 26 convert.** `textures filled=31 missing=0 substituted=0`.
- Geometry, per-shape hierarchy and UVs are intact; measured sizes match the
  NIF bounds and the pieces' own unit names.
- Triangle counts are trivial: 42–1,658 per asset, 26 assets in 4 MB.

What is lost or wrong, and matters:

1. **The UV-scroll controllers are gone.** Expected. §4 is the replacement.
2. **Alpha blending is not expressible.** The NIFs all say
   `SRC_ALPHA/INV_SRC_ALPHA` blend. The kit builder derives sidedness and
   alpha from the *asset category* (`build_kit.py:412`), which only knows
   about foliage, so the first build exported all 67 materials `OPAQUE`.
   Forcing `"doubleSided": true` per entry gets them to glTF `MASK`
   (alpha-tested) — right sidedness, still not blend. **For waterfalls we
   should take the meshes' geometry and UVs and author the material in our own
   renderer**, not rely on the kit's material path.
3. **The greyscale/gradient ramps are dropped.** `BSEffectShaderProperty` has
   a second texture slot (`GradWhiteWater*.dds`, `GradSteamThin.dds`,
   `GradSmokeDiss.dds`) that has no glTF equivalent; only 13 of the 31
   resolved textures reach a material. Those ramps are the alpha/colour shape
   of every layer — take the DDS directly.
4. **Editor-only geometry exports with the mesh.** `EditorMarker` (on
   `fxmistlow01`, `fxsplashlargechurnnorapids`) and the 12–19 flat
   `CurrentPlane` quads inside each body NIF (Bethesda's water-current
   helpers, the "editor-only helper geometry" RW2's changelog mentions) come
   through as real shapes. Anything we ship must drop shapes named
   `EditorMarker`, `CurrentPlane*`, `boundPush`.
5. **The registry cannot hold these assets.** `NON_CONTENT_CATEGORIES` in
   `worldgen/asset_taxonomy.py:42` excludes `effect` and `water`, so no
   `effects/…` mesh has a registry row and `build_kit` rejects it. This audit
   worked around it with a throwaway registry in `/tmp`. If we ever place FX
   meshes as world content the taxonomy has to admit an `effect` category —
   logged in the polish backlog.

## 7. Diagnosis — what serves what, for our compiled falls

Our compiler gives each fall a lip point, a plunge point, a width and a drop,
and a ballistic path tracer already exists. Against that:

**(a) The falling body.** No vanilla piece stretches to a 40–80 m Black Marsh
fall without also becoming 15–25 m wide, because `XSCL` is uniform. Two honest
options:

- *Tile Bethesda's way* (authored intent, proven by §5): repeat
  `fxwaterfallthin512x128` (7.5 m) or `…2048x128` (29 m) down the ballistic
  path with ~⅔-height vertical overlap and ~2× width overlap side to side.
  Needs: a per-fall count = ceil(drop / (0.66 × pieceHeight)), a lateral count
  = ceil(width / (0.5 × pieceWidth)), a per-instance UV phase offset so the
  copies do not scroll in lockstep, and per-instance yaw following the path.
- *Procedural sheet* (recommended): generate one ribbon along the traced
  ballistic path, width from the compiled width, and use only the **textures**
  (`FXfluidTile01` + `FXfluidSub01` + `GradWhiteWater`) and the §4 rates. This
  is what waterfalls-realtime §1 says everyone ships, it removes the uniform-
  scale problem entirely, and it makes the lip and the plunge continuous
  instead of a seam. **A procedural mesh is still needed here — say so
  plainly.** The vanilla bodies remain useful as a reference silhouette (the
  outward bulge and the slight lean) and as a fallback for short falls.

**(b) The lip/crest.** `fxrapidsfallsline01` (5.1 × 16.1 m, 204 tri) is exactly
this and is placed at Δz +0.5 m from the body in 161 vanilla stacks; scale
median 1.18, freely scaled 0.35–2.28. `fxrapidsfallstop` (32 × 34 m) is the
big-river version. **Usable as-is**, laid flat on the water at the lip,
yaw-aligned to flow, x-scaled by width. Its three planes at −0.50 / −0.15 /
−0.075 tiles/s are the crest recipe.

**(c) The base skirt / mist.** `fxwaterfallskirttallfront` and
`fxwaterfallskirtslope` are the right pieces and — the useful discovery — the
visible foam is only their bottom ~3.5 m while the fill column runs 47–51 m
up, so **one skirt covers any drop up to ~50 m without scaling**. Place at the
plunge point, yaw to the fall. `fxwaterfallmistblastlite` (42 tri, one quad) is
the mist unit: place 4–8 per fall at scale 0.2–0.5, random yaw, pitched
anywhere from −10° to 135°, clustered within ~12 m of the impact.

**(d) Rapids/foam in the run-out.** `fxrapidsringheavy` at the plunge
(Δz −10 to −13.5 m from the body top, scale 0.6–1.2, and its counter-scrolling
+0.375 layer is the outward-spreading foam), then `fxrapids`/`fxrapids02`
(7.5 × 12 m) tiled downstream and `fxrapidsbig01` (24 × 40 m) for a wide run.
All are near-flat planes with ~0.2 m of relief, so they drape onto our water
surface with a small vertical offset. `wrstairsstreamrapids01foam` is a
hand-shaped stepped-channel plane worth stealing for a cascade over terraces.

**(e) Mist billboards.** `fxmistlow01` and its ~40 opacity/shape variants are
the ground layer — 12.9 × 12.6 × 2.5 m discs, scattered 10–40 per basin at
random yaw and scale 0.2–5.3. Drift rates are very slow (+0.030 / −0.017
tiles/s on 34 s and 60 s loops). Cheapest correct thing in the whole kit.

**What each needs from us**

| Need | Value |
|---|---|
| Blend mode | alpha blend `SRC_ALPHA/INV_SRC_ALPHA`, depth-write off, **not** additive |
| Sidedness | double-sided (the NIF flag says so; the kit builder does not read it) |
| Soft-particle fade | per layer, from `softFalloffDepth`: 0.57 m sheets, 1.07 m spray, 0.60 m ground mist |
| View-angle fade | `falloffStartOpacity → falloffStopOpacity` 1.0 → 0.0 between cos 0.26 and cos 0.09 (≈75°→85° from normal) — edge-on layers fade out |
| Tint | emissive colour ~0.70 grey × emissive multiple 0.70–0.75; whitewater layers 1.0 white at alpha 0.8 |
| UV wrap | repeat in both axes; scroll the offset, never the vertices |
| Scroll | §4 table; always ≥ 2 layers at near-but-unequal rates + a slow lateral drift |
| Scaling rule | uniform only if we reuse vanilla meshes — so derive counts, not scales, from drop and width |
| Snapping | crest at lip + 0.5 m; skirt and foam ring at the plunge; mist cards within 12 m of impact; ground mist filling the basin |

**Still needs a procedural mesh:** the falling ribbon itself for anything over
~30 m or narrower/wider than the authored aspect; and the lip *wrap* (the
geometry that carries water over the crest edge), which no vanilla piece
provides — Bethesda hides that join behind the crest strip and the rock.

## 8. Could not be verified

- **Vanilla texture pixel content.** DDS files were listed and sized, not
  decoded; "seamless tiling" is inferred from `clampMode = 3` and from the
  meshes' UV ranges, not from looking at the pixels.
- **How the contact-sheet frames actually look.** They were written and their
  sizes checked; per the repo's screenshot rule they were not ingested here.
  **Owner: please look at `output/sheets/waterfall-fx-v1/`.**
- **`fxwaterfallthin3096x256` and the `…thinleak` pieces** were measured from
  their NIFs but not put through the conversion kit.
- **Black Marsh & Valenwood's copies were matched by path, not by hash** — the
  17 files sit at vanilla paths in `manifest-data1.txt`; they were not
  extracted from the RARs and byte-compared. If BM&V turns out to have
  *retextured* them the difference would be textures, not meshes.
- **Bethesda's intent for the `CurrentPlane` quads** (they carry a
  `BSEffectShaderProperty` with `FXfluidTile01`, so they may be visible
  surface-current decals rather than pure editor helpers). Treat as
  droppable until someone checks in-game.

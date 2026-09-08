# Waterfalls and steep whitewater in real-time games — research + our recipe

Rewritten 2026-09-08 (supersedes the 2026-08-28 Phase 8b version). Context:
decision [0047](../../decisions/0047-water-one-physical-model.md) — two attempts
at falls/steep reaches failed (attempt 1: the terrain-following raster stretched
into static flat sheets down cliffs; attempt 2: strips rendered brown and
straight, sheets declared on ordinary slopes and misaligned with their strips).
This doc is the primary-source answer to "how is this actually built", and then
a decided recipe for our engine. Companion docs:
[water-rendering-threejs](water-rendering-threejs.md),
[water-edges-and-shore-waves](water-edges-and-shore-waves.md),
[water-handoff](water-handoff.md).

Everything in §2 was **measured on our own vault copies** on 2026-09-08 by
parsing the NIF blocks directly (block table, `BSEffectShaderProperty`,
`BSEffectShaderPropertyFloatController` → `NiFloatInterpolator` → `NiFloatData`
keys, `NiAlphaProperty`, and vertex bounds walked through the node transforms).
Where a claim is web-sourced or inferred it says so.

---

## 1. The standard industry recipe (web sources)

Nobody simulates a fall. Every shipped waterfall is the same layer stack.

**1.1 Sheet mesh.** A barely-tessellated ribbon following the fall path.
Cyanilux ([waterfall shader breakdown](https://www.cyanilux.com/tutorials/waterfall-shader-breakdown/)):
"a rotated quad/plane with the top edge extruded backwards and a bevel added",
UVs unwrapped "follow active quads" and allowed outside 0–1; explicitly **no
vertex displacement** — the wobble is a UV offset. Taiji devlog
([Don't Go Chasing Waterfalls](https://taiji-game.com/2019/10/01/57-dont-go-chasing-waterfalls/)):
"a flat rectangle" plus *separate mirrored edge-strip geometry whose UVs are
pinched in at the top*. Alisavakis
([unlit waterfall pt.1](https://halisavakis.com/my-take-on-shaders-unlit-waterfall-part-1/))
runs the same shader on an arbitrary curved mesh.

**1.2 Two-to-three scrolling layers at different scales and speeds.** This is
the one point every independent source agrees on: Taiji (foam layer = two
copies of one texture at different offsets *and* speeds, over two faster
part-transparent layers), Unity's own nature-shader guidance (a large slow
noise plus a small fast noise), DavidSchoneveld's `scale1/scale2/scale3` in
[RTVFX Sketch #49](https://realtimevfx.com/t/official-vfx-sketch-49-waterfall/19238).
Noise must be **y-stretched** so blobs become vertical streaks (Alisavakis).

**1.3 Concrete numbers the web sources actually give** (rare — most decline):
- Alisavakis scroll: `_Time.y / 5` → **0.2 UV/s** on both the noise and the
  displacement lookup.
- Alisavakis banding: `round(noise*5)/5` → 6 discrete bands (stylised look).
- Cyanilux side-to-side wobble on a 2-unit-wide sheet: **sine frequency 12,
  amplitude 0.05 UV, speed 1**; foam edge band **0.05 UV** wide (step at
  −0.025); noise contribution multiplied by **0.2**; base-mask smoothstep
  1.2/0.9; top-mask multiplier 0.75.
- Alisavakis vertex displacement (where used): sample a greyscale, remap
  `(d*2-1) * amount`.
- No web source gives waterfall mist/spray particle counts, rates or lifetimes.
  Every RTVFX thread declines. Our numbers come from Bethesda's NIFs (§2.5).

**1.4 Base of fall.** RTVFX ([this waterfall](https://realtimevfx.com/t/this-waterfall/41)):
mist hides the join; foam **spreads out along the pool surface**, and the
classic failure is a round particle popping upward. Use **soft particles**
(depth-faded alpha) and, per Floggins, a second depth-driven pass added into
diffuse for a brightness kick at the intersection. Yance: bake lighting into
the mist texture rather than lighting particles. Taiji's base is two systems —
big rings that shrink and fade, plus small droplets flying up and killed at a
plane.

**1.5 Sides.** Rocks tight against the sheet edges; the illusion breaks where
the ends show (RTVFX, and the [Varden Unity walkthrough](https://www.varden.ee/development-progress/step-by-step-guide-to-creating-a-stunning-realistic-waterfall-in-unity/),
which also puts spray emitters at the lip and at *every* rock intersection).

**1.6 Unreal.** The [UE Water system](https://dev.epicgames.com/documentation/en-us/unreal-engine/water-system-in-unreal-engine)
is spline-authored rivers with procedurally generated mesh and a buoyancy
component — the same "ribbon along a curve" shape we already build.
Advanced Waterfall Blueprint's own docs could not be fetched (Fab page
unreachable) — **unverified**.

---

## 2. Skyrim, measured from our vault (primary evidence)

Vault: `~/workspace/elder-souls-dev/elder-scrolls-asset-pipeline/skyrim-source/Data/Skyrim - Meshes.bsa`
and `Skyrim - Textures.bsa`, read with `pipeline/bsa.py`. All files below are
confirmed present in `manifest-skyrim-meshes.txt` and in the textures BSA
listing. NIF version 20.2.0.7, user 12, BS 83 (Skyrim LE).

### 2.1 The pieces and their real sizes

Bounding boxes are the **water geometry only**, walked through node transforms,
converted at **70.03 units/m** ([CK wiki: Unit](https://ck.uesp.net/wiki/Unit),
128 u = 1.828 m).

| Mesh (`meshes/effects/`) | drop (fall axis) | width | notes |
|---|---|---|---|
| `fxwaterfallbodytall.nif` | 1121 u = **16.0 m** | 920 u = 13.1 m | curved sheet, 276 verts; + foam copy + a 414-vert cross mesh |
| `fxwaterfallbodytall02.nif` | 2405 u = **34.3 m** | 989 u = 14.1 m | as above + 2 billboarded vapour "jet" planes (216 verts each) |
| `fxwaterfallbodyslope.nif` | 674 u = **9.6 m** over 1388 u = 19.8 m run (**≈26°**) | 876 u = 12.5 m | the *chute*, not a free fall; 180 verts |
| `fxwaterfallthin2048x512.nif` | 2120 u = **30.3 m** | nominal 512 u = 7.3 m (bbox 867 u — the sheet meanders) | 195-vert `fallsMesh` + 720-vert `fallsCrossMesh` + 208-vert vapour jet |
| `fxwaterfallthin4096x256.nif` | 4213 u = **60.2 m** | nominal 256 u = 3.7 m | same three-part build |
| `fxwaterfallthinsheet.nif` | 912 u = **13.0 m** | 665 u = 9.5 m | thin, 1.3 m deep — a wall-hugging veil |
| `fxwaterfallthinspray2048.nif` | 2136 u = **30.5 m** | — | spray-only companion |
| `fxwaterfallskirttallfront.nif` / `…skirtslope.nif` | mist volume ~47 / 50 m tall | — | fog planes + emitters, no water sheet |
| `fxwaterfallmistblast(.lite).nif` | 6.9 m tall × 10.5 m wide | — | 2 billboard nodes + 1 particle system |
| `fxrapids.nif` | 0.24 m tall, 7.5 × 12.3 m | — | 3 near-flat planes, 95 verts total |
| `fxrapidsfallsline01.nif` | 5.1 × 16.1 m | — | the **crest line** piece (`FXrapidsFallsTop*`) |
| `fxrapidsringheavy.nif` | 20.7 × 15.8 m, flat | — | plunge-pool ring: `ripplesBig`, `ripplesSmall`, `jetPuffs` |
| `fxrapidsrocks01.nif` | 23.9 × 40.1 × 4.5 m | — | **6 lit boulders with havok collision + 3 whitewater planes + a mesh-emitter particle system**: Bethesda's own "rocks in the bed" kit |
| `fxsplashlargechurnnorapids.nif` | 4.3 × 4.3 × 13.8 m | — | pure particle churn (4 box emitters, drag/bomb/collider modifiers) |
| `meshes/lod/waterfalls/*_lod.nif` | — | — | static distant stand-ins; [SkyFalls](https://www.nexusmods.com/skyrim/mods/40564) exists because they don't animate |

**Correction to the previous version of this doc**: the `NNNNxNNN` in the thin
names is **drop × width**, not width × height. Measured: `4096x256` is 60 m
tall; `2048x512` is 30 m tall. (The earlier note "2048 u ≈ 29 m tall" was right
by luck for one file and wrong about which axis.)

### 2.2 Textures (all in `textures/effects/`, confirmed in the BSA)

Body/rapids sheets use only four: `FXWhiteWater01.dds`, `FXWhiteWater02.dds`,
`FXwhiteWater.dds`, `FXfluidTile01.dds` (+ `FXfluidSub01.dds`,
`FXfluidTile_sub.dds` for the underwater-side copies). Masks are greyscale
LUTs in `textures/effects/gradients/`: `GradWhiteWater.dds`,
`GradWhiteWaterMedSoft.dds`, `GradWhiteWaterSoft.dds`,
`GradWhiteWaterMedSoftInv.dds`, `GradWaterSpec.dds`, `GradSteamThin.dds`,
`GradSmokeDiss.dds`, `GradCobWeb.dds`, `GradSplash.dds`. Mist/fog:
`FXSteamThinAnim.dds`, `FXCloudRoundTile.dds`, `FXCloudRoundTileStrip.dds`,
`FXFogHeavy.dds`, `VaporTile01.dds`, `FXfireAnim04loop.dds` (yes — the fire
loop is reused as churn, with `GradWhiteWaterMedSoftInv` as its mask).
`fxwaterfalllitscrolling(.dds/_n.dds)` and `fxwaterfallwhitestrip(.lite).dds`
exist in the BSA but are **not referenced by any of the meshes above** — the
earlier claim that the body NIFs use them is wrong. (Their actual users are
unidentified; **unverified**.)

The greyscale texture is a palette/alpha LUT enabled by the
`SLSF1_Greyscale_To_PaletteColor/Alpha` shader flags
([TES Alliance](https://tesalliance.org/forums/index.php?/topic/6437-sky-greyscale-to-palette-alphacolor-in-bseffectshaderproperty/)) —
i.e. the source texture is a *lookup coordinate*, and the gradient decides
colour/alpha. In our engine that is one extra 1D-ish texture fetch, or simply a
smoothstep, because we control the shader.

### 2.3 How they animate — the actual scroll rates

Every animated layer is a `BSEffectShaderPropertyFloatController` driving
`V Offset` (index 8), `U Offset` (6) or `U Scale` (7) with a **linear ramp from
0 to −N over T seconds**, frequency 1, looping. Rate = N/T tiles per second
**down** the sheet.

| Mesh / layer | texture (uvScale) | V rate | extra |
|---|---|---|---|
| bodytall / bodytall02 main | `FXWhiteWater01` (2×3) | 1/3.2 s = **0.313 UV/s** | — |
| bodytall / bodytall02 foam | `FXfluidTile01` (2×1.5) | 1/3.0 s = **0.333 UV/s** | — |
| bodyslope both layers | `FXWhiteWater01` (2×3), `FXfluidTile01` (1×1) | 1/2.33 s = **0.429 UV/s** | — |
| thin2048x512 / thin4096x256 (×2 layers) | `FXfluidTile01` | 2/2.33 s = **0.857 UV/s** | U drift 1/33.3 s = 0.030 UV/s; U-Scale breathes 1.00→1.05→1.00 over 8.33 s |
| thinsheet (×2) | `FXfluidTile01` | 2/2.63 s = **0.760 UV/s** | same U drift + U-Scale breathe |
| thinspray2048 (×2) | `FXfluidTile01` | +1→−4 over 4 s = **1.25 UV/s** | U drift 1/33.3 s, starting offset 0.338 |
| `fxrapids` planes | `FXWhiteWater01` ×2 | 0.150 / 0.075 UV/s | third plane `FXWhiteWater02` at **0.5 UV/s** |
| `fxrapidsfallsline01` (crest) | `FXWhiteWater02` / `01` / `01` | 0.5 / 0.075 / 0.150 UV/s | three speeds on one crest |
| `fxrapidsrocks01` | `FXWhiteWater01` ×2 | 0.188 / 0.300 UV/s | **U wobble 0→+0.096→0 over 4.1 s** (the lateral shimmy) |
| skirt fog | `FXFogHeavy` (2×2) | 0.545 UV/s | U wobble ±0.033 over 4.83 s |
| mistblast | `FXCloudRoundTileStrip` | 0.158 UV/s | — |
| vapour jets | `VaporTile01` | 0.200 UV/s | U 1/66.7 s = 0.015 UV/s |
| `fxrapidsringheavy` `jetPuffs` | `FXCloudRoundTile` | eased 0→1 over 2.67 s (ease-in curve, 6 keys) | the expanding plunge ring |

Three findings that matter for us:

1. **Bethesda's own answer to the "conveyor belt"** is *not* a flow map: it is
   (a) two-to-three layers at genuinely different rates (0.075 / 0.15 / 0.5 on
   one rapids piece — a 6.7× spread, not the 1.1× spread you get from
   "two layers slightly offset"), (b) a **slow lateral U drift** (0.03 UV/s)
   and (c) a **U-Scale breathing 1.00→1.05→1.00 over 8.33 s**, which
   continuously changes the horizontal tiling so no vertical streak stays put.
2. **Faster water gets a faster scroll and more tiles.** The 60 m thin fall
   scrolls 2 tiles / 2.33 s; the 16 m body 1 tile / 3.2 s. Roughly, rate ∝ the
   speed the water would have at that drop.
3. **Rates are in tiles/second on a UV space normalised to the piece**, so if
   we scale a sheet to a different drop we must scale the rate with it (or,
   better, drive UV in metres of arc length and scroll in m/s — see §4).

### 2.4 Shading parameters (from the effect shader blocks)

- Blend: `NiAlphaProperty` **0x10ed** on every water/mist layer — alpha blend
  `SRC_ALPHA / INV_SRC_ALPHA`, **alpha test off**, on almost everything. One
  additive layer exists (`0x100d`, `SRC_ALPHA/ONE`) in `fxrapidsfallsline01`
  and in the splash churn. So: mostly plain alpha, one additive accent.
- Emissive colour × multiple (the "unlit whitewater" trick, since
  `BSEffectShaderProperty` is unlit): body main layer `(1,1,1,1) × 1.00`, its
  foam layer `(1,1,1,0.8) × 0.90`; the *slope* body is deliberately duller,
  `(0.73,0.73,0.73,0.95) × 0.75` and `(0.75…,0.75) × 0.75`; the thin falls
  `(0.70,0.70,0.70,1) × 0.75`; skirt fog `(0.78…) × 0.75`; steam `× 0.85`.
  → **a fall is drawn at roughly unit white, a chute at ~0.75, mist at ~0.8**.
- Soft-particle depth fade (`Soft Falloff Depth`, game units → metres at
  70.03 u/m): main sheet **5 u = 7 cm**, foam layer 10 u = 14 cm, thin falls
  40 u = 0.57 m, steam 35 u = 0.5 m, mist/vapour 50–100 u = **0.7–1.4 m**.
  These are exactly the depth-fade distances our soft particles and contact
  fade should use.
- A view-angle falloff is set on the sheet layers (start/stop angle 0.42/0.09
  with opacity 1→0), i.e. **faces seen very edge-on fade out** — this is what
  stops the sheet's silhouette showing as a hard cut. Field order read from
  nif.xml; the interpretation is ours (**inference**).
- The body NIFs also carry `BSLightingShaderPropertyFloatController`s on the
  rock/collision part (U/V offset and scale wobbles, e.g. V 1 tile / 8.33 s and
  a ±0.036 U wander over 7.4 s) — a second, much slower drift on the lit layer.

### 2.5 Particle budgets (Bethesda's, since the web has none)

Per-piece particle systems, counted from the block lists: `fxwaterfallmistblast`
= **1** `NiParticleSystem` (box emitter + age-death + LOD + spawn + rotation +
scale + gravity + 3-axis drag) behind **2** billboard nodes. `bodytall` = 1
particle system + 12 flat 4-vert `CurrentPlane` quads at the base sized 2.9–5.7 m.
`bodytall02` = 1 system + 19 base quads + 2 vapour jets. `bodyslope` = 2 systems
+ 11 base quads. `skirtslope`/`skirttallfront` = 2 and 1 systems + fog planes.
`fxsplashlargechurnnorapids` = **4** systems (the heaviest single piece).

The pattern is: **one or two emitters per piece, ≤4 for a hero splash, and the
bulk of the base read is a dozen flat quads lying on the pool spreading
outward** — exactly the RTVFX advice, executed as geometry rather than
particles. `BSPSysLODModifier` on every system is Bethesda's distance cull.

### 2.6 Placement in the CK

From the [CK waterfall tutorial PDF](https://skyrimromance.com/wp-content/uploads/2019/12/How_to_Add_Waterfalls_Cave_Entrances_and_Doors_and_Map_Markers.pdf):
the animated pieces are `MovableStatic` (they look frozen in the editor and
animate in game); a few `_static` variants are plain `Static` with "Has Distant
LOD" and a separate LOD model — those are the ones that get the LOD swap.
Placement is manual, on a 16-unit grid snap, with a body piece and a skirt/mist
piece overlapping at the foot of the same cliff. Rapids use "similar meshes"
along the channel — same workflow, different pieces. The PDF gives **no**
numeric overlap, lip-hiding or sound-marker convention (**unverified**; the
overlaps we can read off the geometry instead, since e.g. `bodytall`'s foam
copy is 6 u larger than its inner mesh in every axis — a ~4 cm offset shell).

Community: [Realistic Water Two](https://www.nexusmods.com/skyrimspecialedition/mods/2182)
speeds up the scroll on large falls, adds splash systems, increases mist, and
adds a gradient texture for **waterfall top foam** (the crest is where vanilla
is weakest); it also fixed the body meshes reading over-bright in some weather —
because the inner layer is an unlit effect shader, not a lit one. SkyFalls
replaces the non-animating distant LODs. Water for ENB / Cathedral Water
specifics: **unverified**.

### 2.7 Mods in our vault

Checked by directory listing (no keyword search):
`skyrim-source/mod-sources/tropical-skyrim-33017/extracted/Meshes/effects/`
contains only `LavaFire*.nif` and two bird meshes, and its `textures/water/`
contains only `defaultwater.dds` — **Tropical Skyrim adds nothing for
waterfalls**. `tooling/asset-pipeline/black-marsh-mod-source/` is ground
textures and plugins only — **nothing**. So vanilla is our only source, and it
is enough.

### 2.8 Can we convert them?

Yes, on the existing path: `tooling/asset-pipeline/pipeline/build_kit.py` +
`pipeline/blender/build_kit.py` already extracts a NIF from a BSA, pulls its
referenced textures, imports via **pynifly** (`io_scene_nifly`) in Blender and
exports glTF with a decimated LOD chain and a `.kit.json` manifest of
dimensions. Gotchas: (a) the effect-shader materials will *not* survive import
usefully — we take the **geometry and UVs** and attach our own material; (b) a
known niftools bug collapses the greyscale texture onto the source texture on
round-trip ([issue #344](https://github.com/niftools/blender_niftools_addon/issues/344)),
irrelevant if we never re-export NIF; (c) the particle systems and havok are
not importable — we rebuild those from §2.5's budgets; (d) DDS → KTX2 for the
web.

---

## 3. Steep whitewater on a slope — why ours read brown and straight

**3.1 Brown.** Whitewater is opaque because it is *aerated*, not because of any
water tint ([Whitewater](https://en.wikipedia.org/wiki/Whitewater)). Running
Beer–Lambert silt absorption over a few centimetres of depth gives you the bed
colour, which in a silt channel is brown — the absorption path is shortest
exactly where the rapids are. Every dedicated whitewater shader surveyed
(Alisavakis pt.1/2, Bethesda's `fxrapids`) is **unlit/emissive and opaque-ish
above a threshold**, not the lit refractive water shader with parameters
tweaked. Bethesda's numbers: emissive `(1,1,1)` × 1.0 for a fall, × 0.75 for a
chute, alpha-blended, no refraction, no shore terms. Ocean whitecap albedo is
~0.22 physically ([Koepke 1984, via arXiv 1904.08922](https://arxiv.org/pdf/1904.08922));
games drive river whitewater far brighter (0.85–1.0, unlit) — that divergence
is deliberate.

**3.2 Straight / conveyor belt.** The canonical cause is a single UV phase with
unbounded (or hard-reset) accumulation: the shear grows linearly and reads as a
rigid diagonal stripe sliding uniformly
([Graphics Runner, Animating Water Using Flow Maps](http://graphicsrunner.blogspot.com/2010/08/water-using-flow-maps.html);
[Vlachos, Water Flow in Portal 2, SIGGRAPH 2010](https://cdn.akamai.steamstatic.com/apps/valve/2010/siggraph2010_vlachos_waterflow.pdf)).
The fix is the **two-phase flow cycle**: sample twice with `t2 = frac(t1+0.5)`
and cross-fade with the triangle weight `w = 1 - abs(2t - 1)`, so each layer's
reset happens under the other's peak. Catlike Coding's
[Directional Flow](https://catlikecoding.com/unity/tutorials/flow/directional-flow/)
gives worked constants: grid 10, **two tiling frequencies 3 and 50** mixed
**0.25 / 0.75** (fine detail dominant), flow strength 0.1, second grid offset by
a quarter tile, and derivatives rotated per-cell to the local flow direction.
Bethesda gets the same result more cheaply (§2.3): a 6.7× speed spread across
layers plus a U drift plus a breathing U-Scale.

**3.3 Uncharted 4 rapids** ([SideFX interview](https://www.sidefx.com/community/fx-adventures-in-uncharted-4-a-thiefs-end/),
[SIGGRAPH 2016 Advances](https://advances.realtimerendering.com/s2016/),
[ACM talk](https://dl.acm.org/doi/10.1145/2897839.2936731)): a Houdini
spline-driven river mesh, a baked flow texture with **RG = flow direction/
intensity and B = wave height** (16-bit height packed into two 8-bit channels),
authored as "a mix of simulation and hand-drawn curves" — a coarse sim
hand-corrected, not a live sim. Wave-particle contributions are stacked for the
high-frequency chop (**partial** — primary slides not freely hosted). The exact
foam-driving signal is **unverified**.

**3.4 BotW / Genshin.** No official talk exists. Community analysis
([ResetEra technical thread](https://www.resetera.com/threads/zelda-breath-of-the-wild-the-technical-analysis.8197/))
says BotW's foam is keyed to **the distance between surface and bed** — a
depth-to-bed function, not velocity. Treat as inference. The Genshin RenderDoc
breakdown cited in the old version of this doc could not be re-located
(**unverified**; drop it as a citation).

**3.5 Rock-wake foam.** No primary source describes a distance-field rock-wake
system. In the flow-map tradition the foam behind rocks is **painted into the
flow/foam mask** at bake time (Popka's hand-drawn curves). Bethesda's answer is
literally a piece of geometry: `fxrapidsrocks01.nif` bundles six collided
boulders with three whitewater planes and a mesh-emitter particle system, so
the foam is authored *with* the rocks.

**3.6 Rock scatter density.** No source gives numbers (UE PCG guides, Ultimate
River Tool, R.A.M all leave it to the artist). The functional rule, inferred:
rocks must be **big enough to read as individual obstacles** and each needs a
bow pillow upstream and a foam trail downstream; density matters less than that
per-rock read. `fxrapidsrocks01` is our own calibration point: 6 boulders in a
24 × 40 m patch ≈ **1 boulder per 160 m² of bed**, at 4.5 m relief.

---

## 4. The recipe for us — decided

Our situation: `compile_water` already classifies reaches into `field`, `steep`
and `fall` (decision 0047), `channels.py` owns one centreline per reach, and the
runtime already has `ChannelStrips.ts` (ribbon mesh in the carved trench, with
`aSideM`, `aArc`, `aScroll` attributes) and `WaterfallSheets.ts` (a ballistic
lip→plunge tracer producing a 3-layer sheet). Both are the right *shape*. What
follows changes what they draw, not the model underneath.

### 4.1 A waterfall = our ribbon, Skyrim's textures, Bethesda's numbers

**Do not** snap a Skyrim body NIF to the lip. Reason: those meshes are fixed
16 m / 34 m curved sheets with a specific plan-curve and a 26° chute shape;
snapping one to an arbitrary compiled lip→plunge path means either scaling it
non-uniformly (which shears the authored curve and breaks its UV rate) or
accepting that the geometry does not meet our terrain — that is exactly the
"pieces jammed together that were not designed to combine" failure the owner
ruled against, and it is what attempt 2's misalignment looked like. Our
ballistic tracer already produces a sheet that provably starts at the lip and
ends in the plunge pool.

So: **procedural ribbon, sourced textures, measured parameters.**

1. **Geometry** (extend `buildWaterfallSheetGeometry`): keep the traced path.
   Tessellate ~1 station per 0.75 m of arc and 8–12 across (Bethesda's body is
   276 verts for 16 m; `fallsCrossMesh` 720 for 30 m — we are in range). Add
   the two pieces we lack:
   - **Crest wrap**: extrude the top edge *back over the lip* by
     `CREST_BACK_M` (already 2 m) and bevel it, Cyanilux-style, so there is no
     seam where the field surface ends. RWT's own fix was a dedicated crest
     foam gradient — boost foam to ~1.0 over the first 1.5 m of arc.
   - **Side strips**: mirrored edge ribbons ~0.6 m wide with their UVs
     **pinched in toward the top** (Taiji). Plus the view-angle fade from §2.4
     so the silhouette does not cut.
2. **UV**: `u` = normalised across-width, `v` = **arc length in metres / tileM**
   with `tileM = 4` (so one texture tile is 4 m of fall — matches the body NIF:
   3 V-tiles over 16 m ≈ 5.3 m/tile, and the thin falls 2 tiles/… scaled by
   drop). Never world-XZ, never world-time × world-position.
3. **Scroll**: three layers, in **metres per second along arc**, converted to
   UV by `/tileM`:
   - L0 body `FXWhiteWater01`, tile 4 m, **1.7 m/s** (= 0.42 UV/s, the slope
     body's rate),
   - L1 foam `FXfluidTile01`, tile 2.6 m, **3.4 m/s** (0.86 UV/s, the thin-fall
     rate) — deliberately a **2×** spread, and add a third accent layer at
     **0.3 UV/s** for the 6.7× spread Bethesda uses on rapids,
   - all three additionally scaled by `min(1, v_local / 6 m/s)` so a small fall
     is slower than a gorge fall (§2.3 finding 2).
   - **U drift 0.030 UV/s** and **U-Scale breathing 1.00→1.05→1.00 over
     8.33 s** on every layer, phase-offset per layer. These two are the
     conveyor-belt cure and cost two `sin()`s.
   - Wobble: sine on U, frequency 12 per sheet width, amplitude 0.05 UV
     (Cyanilux), amplitude scaled by `frac` down the fall.
4. **Shading**: unlit/emissive aerated path, **no refraction, no Beer–Lambert,
   no shore terms**. Emissive `(1,1,1)` × 1.0 for a free fall, × 0.75 for a
   chute (§2.4). Alpha blend `SRC_ALPHA/INV_SRC_ALPHA`; one additive accent
   layer at ~0.25 weight for the crest line (Bethesda's `0x100d` layer).
   Soft depth fade **0.07 m** on the main layer, **0.14 m** on foam.
5. **Base kit** — this is the part we are missing and it is cheap:
   - **12–19 flat quads** lying on the plunge pool, 2.9–5.7 m across, spreading
     outward from the impact point, foam texture, alpha-blended, soft depth
     fade 0.5 m. Bethesda's `CurrentPlane` set, exactly. One `InstancedMesh`
     for all sites.
   - **1 mist emitter** per site (2 for a fall over 20 m), soft particles, slow
     rise, lighting baked into the texture, cap live instances globally.
   - **1 expanding ring** on the pool, eased 0→1 over 2.67 s
     (`fxrapidsringheavy`'s `jetPuffs` curve), reusing our existing foam-ring
     shader term.
   - Spray emitters at the lip and wherever the traced path re-contacts rock,
     rate growing with distance fallen (Varden).
6. **Sides**: a scatter rule that puts boulders tight against both edges of the
   sheet for its full drop — a Phase 10 scatter job, using the existing boulder
   kits, keyed off the compiled cascade record. Without it the ends show.
7. **Textures to convert** (§2.2): `FXWhiteWater01`, `FXWhiteWater02`,
   `FXfluidTile01`, `FXSteamThinAnim`, `FXCloudRoundTileStrip`,
   `GradWhiteWater`, `GradWhiteWaterMedSoft`, `GradSteamThin`. Eight files,
   DDS → KTX2. Credit them in root `README.md` § Credits in the same change.
   The greyscale-LUT trick collapses to a smoothstep in our shader.

**Where a Skyrim mesh *does* earn its place**: `fxrapidsrocks01.nif` — as a
*kit for the scatter compiler*, i.e. take its six boulder meshes (they are lit
meshes with havok hulls, ordinary statics) and its whitewater plane, and let
the scatter place them in the bed. That is using pieces the way their author
intended. Likewise `fxrapidsringheavy`'s ripple planes as our plunge-ring
geometry if the procedural ring disappoints.

### 4.2 A steep stream = the ribbon we already build, shaded as whitewater

1. Keep `ChannelStrips.ts` geometry (2 m resampling, `aArc`, `aSideM`).
2. **Shade it with the §4.1 aerated path**, blended in by
   `w = smoothstep(0.06, 0.30, slope) * smoothstep(0.8, 3.0, speed)` — below
   that it stays the field river shader. The failure in attempt 2 was drawing a
   steep strip with the *river* material (silt albedo + Beer–Lambert over a few
   cm). One material switch, driven by a physical quantity, fixes the brown.
   (No industry source gives this threshold — it is our choice, tuned to the
   0047 classifier's `slope ≥ 0.035` steep floor and its 45° fall floor.)
3. **Scroll along `aArc` only**, at `aScroll` m/s / tileM, plus the U drift and
   U-Scale breathe. Three layers at 0.3 / 0.43 / 0.86 UV/s.
4. **Rock scatter in the bed**: ~1 boulder per 160 m² of wetted bed
   (`fxrapidsrocks01`'s own density), sizes 0.6–2.5 m, from the Phase 10
   scatter compiler with a "in-channel" rule keyed off the strip polygon; each
   rock writes a **foam stamp** into the strip's per-vertex foam attribute — a
   pillow ~0.5 r upstream and a tail ~3 r downstream, baked at compile time
   (this is how the flow-map tradition does it: painted at bake, not a runtime
   distance field).
5. **Crest and toe**: where a steep reach starts, borrow the
   `fxrapidsfallsline01` idea — a crest line at three different scroll speeds
   across the full channel width — as an extra foam band 1.5 m long at the
   reach head, and a churn band at the toe.

### 4.3 What a probe can measure (no looking)

All of these are numeric and belong in the water probe / compiled-data tests:

- **Registration**: every cascade's lip point sits within 0.5 m of its steep
  reach's last station, and its plunge point within 0.5 m of the next reach's
  first station. (Attempt 2's misalignment would have failed this.)
- **Classification**: no cascade exists whose centreline slope is < 45° over
  the steep contiguous part; no steep strip on slope < 0.035. Histogram the
  slope of every classified reach and assert the two populations do not
  overlap.
- **Colour**: render the strip material's fragment path in a unit test
  (we already do this for other shader terms via CPU twins) at
  slope=0.3/speed=4 and assert output luminance > 0.7 and saturation < 0.12 —
  i.e. it is white, not brown. Same at slope=0.01 and assert it is *not* white.
- **Motion**: sample the shader's UV at t and t+1 s and assert the streak
  displacement is (a) non-zero, (b) parallel to `aArc` within 5°, (c) pointing
  **downhill** (dot with the descending tangent > 0). The "flowing uphill"
  defect is one dot product.
- **Non-repetition**: autocorrelate the L0/L1/L2 combined UV offset over 60 s
  and assert no peak above 0.9 at any lag < 20 s (the conveyor-belt signature).
- **Budget**: total live mist instances ≤ cap; base quads per site ≤ 20;
  draw calls added by the whole waterfall system ≤ 3.
- **Geometry sanity**: every sheet quad has area > 0 and the sheet's width at
  the lip equals the channel width there within 10%.

### 4.4 What NOT to do (from the two failures)

1. **Do not let the terrain-following raster/field surface draw anything on a
   near-vertical span.** It has no fall-parallel frame and produces a static
   stretched triangle. The field must be masked under every `steep` and `fall`
   reach (0047 already says this — enforce it with a test).
2. **Do not draw steep water with the river material.** Silt albedo plus
   Beer–Lambert over 3 cm is brown by construction. Switch material, don't
   tune parameters.
3. **Do not scroll on world time × world position, or with a fixed world-space
   drift direction.** That is what made ripples read as flowing upstream.
   Scroll along the ribbon's own arc length, always.
4. **Do not declare a waterfall from a drop threshold alone** (`FALL_DROP_M =
   2.5` over a 5.48 m segment = a 25° chute). A fall needs a cliff: ≥ 3 m at
   ≥ 45°, contiguous.
5. **Do not emit both a strip and a sheet over the same span.** One reach, one
   piece; the strip ends at the lip and resumes at the plunge.
6. **Do not snap an authored Skyrim body NIF to an arbitrary computed path.**
   Its curve, its width and its UV rate are all authored for its own shape.
   Use its *textures* and its *numbers*; use its *meshes* only where the piece
   is a genuine standalone prop (the rapids boulders).
7. **Do not use one noise layer, or two layers at nearly the same speed.**
   Bethesda's spread is up to 6.7×. Equal-ish speeds read as one belt.
8. **Do not put the base read in particles.** A dozen flat quads spreading out
   on the pool is what actually sells it; particles are the accent.

---

## 5. Open questions

- The exact identity of `fxwaterfalllitscrolling.dds` / `fxwaterfallwhitestrip.dds`
  users — present in the BSA, referenced by none of the 15 meshes parsed.
- Whether we want the stylised banding (`round(n*5)/5`) anywhere; it is a
  strong art-direction commitment and would need an owner steer.
- The slope×speed blend threshold in §4.2 is ours, not sourced; it should be
  tuned against the compiled reach histogram once the classifier reruns.
- Water for ENB / Cathedral Water waterfall changes: unverified.

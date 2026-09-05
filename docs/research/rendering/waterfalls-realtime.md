# Waterfalls in real-time games — research for Phase 8b

Date: 2026-08-28. Context: decision [0025](../../decisions/0025-phase8b-water-implementation-shape.md)
— our province-wide clipmap water surface forms stretched near-vertical triangle
sheets where a channel crosses a cliff; they read as static. Cascade shading
(round 4) helps on ramps but is not a waterfall. Companion docs:
[water-rendering-threejs](water-rendering-threejs.md), [water-edges-and-shore-waves](water-edges-and-shore-waves.md).

## 1. How games ship waterfalls — the standard recipe

Every shipped waterfall surveyed is the SAME layered kit; nobody simulates the fall.

1. **Sheet/ribbon mesh** following the fall path (a rotated quad, top edge
   extruded back over the lip, bevelled — barely tessellated), with a seamless
   falling-water/noise texture **scrolled down the UVs** ("panner"). Two copies
   at different speeds/offsets make the foam layer; a sine wobble on UV.x adds
   life. Best written breakdowns: Cyanilux [Waterfall Shader Breakdown](https://www.cyanilux.com/tutorials/waterfall-shader-breakdown/)
   (mesh + node graph), Taiji devlog ["Don't Go Chasing Waterfalls"](https://taiji-game.com/2019/10/01/57-dont-go-chasing-waterfalls/)
   (direct BotW/Wind Waker analysis: "essentially a variant on a basic
   scrolling texture effect" — flat rectangle, distorted UVs, two overlaid
   scrolling copies, mirrored edge strips pinched in at the top),
   Harry Alisavakis [unlit waterfall](https://halisavakis.com/my-take-on-shaders-unlit-waterfall-part-1/)
   (y-stretched noise → streaks; posterise for the BotW banded look).
2. **Top lip**: wrap the water over the crest with geometry + vertex noise, not
   a visible fade — veterans call the transition into the fall the hardest part
   ([RealTimeVFX "This waterfall"](https://realtimevfx.com/t/this-waterfall/41)).
3. **Base**: thick mist at impact hides the join; foam spreads OUT along the
   pool surface fast ("in pure foam form until it settles") — the classic
   mistake is round particles popping upward (same thread). Layer names used
   across the industry: splash, whitewater, foam ring, mist
   ([Roblox waterfall tutorial](https://create.roblox.com/docs/tutorials/use-case-tutorials/vfx/create-waterfalls) is a clean layer catalogue).
4. **Sides**: put rocks tight against the sheet edges — the illusion breaks
   where the "ends" show; real falls have no gap to the wall (same RTVFX thread).
5. **Perf idioms**: soft particles (depth-fade alpha), lighting baked into the
   mist texture, prerendered flipbooks when overdraw bites.

AAA data points: Naughty Dog's water engine builds rivers/rapids from
"inexpensive procedural components" driven by baked flow/height textures
(RG = flow dir/intensity, B = wave height) rather than simulation —
[Rendering Rapids in Uncharted 4](https://www.researchgate.net/publication/333915560_Rendering_Rapids_in_Uncharted_4),
[Water Technology of Uncharted (GDC 2012)](https://gdcvault.com/play/1015309/Water-Technology-of),
[SideFX interview](https://www.sidefx.com/community/fx-adventures-in-uncharted-4-a-thiefs-end/).
Genshin's waterfall, reverse-engineered from RenderDoc captures, is likewise a
mesh + scrolled textures, not particles ([wangtao-TA](https://wangtao-ta.com/?a=index&aid=105&c=View&m=home)).
Mesh-flipbook particles are the modern refinement ([RTVFX Sketch #49](https://realtimevfx.com/t/official-vfx-sketch-49-waterfall/19238)).

## 2. Skyrim specifics — verified against OUR vault

The whole vanilla system is small and fully present in the vault BSAs
(`skyrim-source/Data/Skyrim - Meshes.bsa` / `- Textures.bsa`; listed via
`pipeline/bsa.py` in the asset-pipeline repo):

- **Bodies** (curved sheet NIFs, `meshes/effects/`): `fxwaterfallbodytall.nif`
  (90 KB), `fxwaterfallbodytall02`, `fxwaterfallbodyslope` — plus dedicated
  distant-LOD meshes in `meshes/lod/waterfalls/*_lod.nif` (Bethesda shipped
  static LOD stand-ins; the [SkyFalls mod](https://www.nexusmods.com/skyrim/mods/40564)
  exists because those LODs don't animate).
- **Thin sheets**: `fxwaterfallthin{128x128 … 4096x256}.nif`, `thinsheet`,
  `thinleak`, `thinspray2048` — flat strips sized in game units (2048 u ≈ 29 m
  tall), snapped along cliff faces.
- **Skirts/mist/base**: `fxwaterfallskirt*` (front skirts w/ or w/o mist),
  `fxwaterfallmistblast(.lite)` — the mist NIF contains `NiBillboardNode` +
  `NiParticleSystem` (billboarded steam), textures `FXCloudRoundTileStrip.dds`,
  `FXSteamThinAnim.dds`, `GradSteamThin.dds`.
- **Rapids/foam**: `fxrapids(.02,big01)`, `fxrapidsfallsline01`, `fxrapidsfallstop`,
  `fxrapidsringheavy`, `fxsplashlargechurnnorapids` — tiny meshes (9 KB) using
  `FXWhiteWater01/02.dds` + `GradWhiteWater*.dds` alpha gradients.
- **Textures actually referenced by the body NIFs** (all confirmed in vault):
  `FXfluidTile01.dds`, `FXwaterTile01.dds`, `FXwaterTile02_n.dds` (normal),
  `FXWhiteWater01.dds`, `fxwaterfalllitscrolling(.dds/_n.dds)`,
  `fxwaterfallwhitestrip(.lite).dds`, plus the gradient masks. ~10 DDS files
  total ≤ 350 KB each — the entire look is UV-scrolled tiling textures
  (`BSEffectShaderProperty` + float controllers animate the offset; NIFs sit
  still in the Creation Kit but scroll in-game).
- **Placement**: hand-placed FX statics stacked against rocks — body + skirt +
  mistblast at base + fxrapids planes in the run-out; see the
  [CK waterfall tutorial PDF](https://skyrimromance.com/wp-content/uploads/2019/12/How_to_Add_Waterfalls_Cave_Entrances_and_Doors_and_Map_Markers.pdf)
  and [RW2's notes](https://www.nexusmods.com/skyrimspecialedition/mods/2182)
  (their changelog reveals editor-only helper geometry inside the NIFs).

So option C is legally sourceable today: NIF→glTF via the existing pipeline,
DDS→KTX2/PNG, re-implement "scroll UV at rate r" in our shader (we never take
Papyrus/engine code anyway; scrolling is one uniform).

## 3. Shader-only options on our existing displaced surface

No worked example exists of a *good* waterfall shader applied to arbitrary
stretched terrain-following geometry — Shadertoy falls are raymarched scenes
([Chocolate Waterfall](https://www.shadertoy.com/view/3sjyRR)) and every
game example uses an authored sheet. But the ingredients are all 2D shader
tricks that transfer directly to our vertical spans:

- **Detection**: we already know flow direction and sample downstream W in the
  vertex stage (round-4 cascade shading). A span where |∇W| along flow exceeds
  a threshold (say drop > 2 m over < 6 m run) IS a waterfall; pass a
  "fallness" 0–1 varying + fall-parallel frame to the fragment stage. Doable
  entirely at runtime, or better: bake per-site spans in `compile_water`.
- **Falling-water mode** (fragment): switch UV space from world-XZ to
  (across-flow, arc-length-down) and scroll fast down-fall; y-stretched noise
  streaks, two layers at different speeds, alpha breakup via a mask texture or
  thresholded noise, brightened aeration (foam albedo → 1, roughness up,
  reflection down). This is exactly the Godot [2D waterfall](https://godotshaders.com/shader/2d-waterfall/)
  recipe (scrolled simplex refraction + flow-gap mask) run in our onBeforeCompile
  shader. The Alisavakis/Cyanilux math ports 1:1 to GLSL.
- **Geometry cleanup**: the stretched triangles are fine as a canvas IF the
  vertex stage snaps the span to a smooth arc (we already terrace-smooth
  high-|∇W| spans; extend to project fall vertices onto a lip→plunge curve so
  the sheet bulges slightly outward instead of hugging the cliff).
- **Known limits** (from the RTVFX thread): edges will look cut off without
  side rocks; the top lip needs the crest foam boosted; lighting of white
  water is best faked (emissive-ish aeration term), not PBR-lit.

three.js precedents: [Mugen87's stylized waterfall](https://discourse.threejs.org/t/unlit-water-shader-with-foam/11641/7)
(sheet + InstancedMesh dissolve-shader spheres at the base, live demo
7rkse.csb.app), forum consensus in ["How to make 3D waterfall?"](https://discourse.threejs.org/t/how-to-make-3d-waterfall/21564),
and [free-unife/threejs-waterfall](https://github.com/free-unife/threejs-waterfall)
(two particle systems: ballistic fall + pseudo-random pool churn).

## 4. Base-of-fall treatment (cheap and load-bearing)

- **Mist**: 4–10 billboarded sprites per site (instanced quads, soft-particle
  depth fade using our existing scene depth), slow rise + fade, lighting baked
  into the texture — vanilla Skyrim's `fxwaterfallmistblast` is exactly this,
  and its `FXSteamThinAnim`/`GradSteamThin` textures are sourceable. three.js:
  one InstancedMesh of camera-facing quads for ALL sites, per-instance phase.
- **Plunge foam**: a disc of boosted foam in the existing water shader —
  radial noise ring expanding outward, advected downstream (we already have
  foam streaks + the annulus-ring pattern from the contact-foam fix; reuse).
  Spread OUT along the surface, don't pop particles up (RTVFX).
- **Ripple rings**: stamp the existing `RippleSim` when a fall site is within
  its 36 m patch; else the analytic wake-ring form already in the shader.
- **Churn**: 2 scrolling `fxrapids`-style planes or just max out the rapids
  foam class in a baked radius. Sound: module 60's soundscape already has
  cascade emitters — attach to the same baked sites.

## 5. LOD / perf across a province of falls

- **Tiering** (standard: [UE water guide](https://yelzkizi.org/water-simulation-in-unreal-engine/),
  [Unity particle culling](https://unity.com/blog/engine-platform/particlesystem-performance-culling-tips)):
  near (< ~300 m) full kit (sheet mode + mist + foam); mid — sheet mode only,
  mist instance count → 0; far — nothing extra (the cascade-shaded surface IS
  the distant LOD; Skyrim's static `_lod` meshes show even AAA ships a cheap
  distant stand-in, and players notice absence more than simplification).
- Mist is the overdraw hazard: few large soft sprites beat many small ones;
  cap total live mist instances globally (one shared InstancedMesh, sorted by
  distance), fade by distance not popping.
- Bake sites once in `compile_water` (lip point, drop, width, direction);
  runtime just culls the site list by distance/frustum — no per-frame search.
  Keep effects deterministic functions of time (our water clock) so an
  off-screen fall needs zero update (the "procedural mode" culling idea).
- Budget note: a fall site's marginal cost in option A is ~0 (same draw call);
  option B adds one instanced draw for all mist + the site uniform buffer.

## Options for our stack (ranked)

**A. Shader-only "falling-water mode" on the existing sheet — do first.**
Bake waterfall spans in `compile_water` (or detect from |∇W| along flow in the
vertex stage); vertex: snap span to a lip→plunge arc; fragment: switch to
across/down-fall UVs, fast down-scrolling y-stretched two-layer noise, alpha
breakup, aeration brightening, boosted crest foam at the lip. Effort: small
(extends round-4 cascade shading; all in the existing onBeforeCompile
material). Quality: fixes "static vertical sheet" and reads as moving water;
edges/base still bare. Zero new assets, zero new draw calls.

**B. A + procedural base kit — the recommended target.**
Add per-site: instanced soft-particle mist billboards (one shared
InstancedMesh, procedural cloud texture or vault `FXSteamThinAnim.dds`),
plunge-pool foam disc + expanding rings in the water shader, RippleSim stamp
when near, distance-tiered as §5. Effort: medium (~1 round). Quality: this is
the full industry-standard layer kit minus authored meshes — should pass an
owner playtest for all but hero falls.

**C. Sourced Skyrim FX meshes at compiled sites — for hero falls later.**
Convert `fxwaterfallbody*/skirt*/mistblast/fxrapids*` NIFs + the ~10 effects
DDS textures from the vault (all verified present, §2), give them a small
scroll-UV material in our pipeline, auto-place at the largest baked sites
(orient to flow, scale to drop). Effort: larger (NIF→glTF conversion, DDS
transcode, placement/orientation tooling, credits + README per the art rule).
Quality: highest — authored curved sheets, skirts and mist read as real falls
from every angle. Do after B, only where B's flat spans disappoint (big
gorge drops); B's mist/foam layers are reused as-is.

Sequencing: A immediately, B in the same or next round, C as a targeted
follow-up for the gorge-scale falls. All three keep buoyancy/W(x,z) untouched
— these are render-only changes.

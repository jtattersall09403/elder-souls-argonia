# Natural light, sky and atmosphere in a browser (three.js) — research, 2026-08-25

How to build a first-class sun/moon/star/sky/haze/weather stack for a
province-scale Three.js game that ships to GitHub Pages. Prior art, the physics
vocabulary, the library survey with adopt/reject verdicts, and the performance
envelope. The **plan** that consumes this is world module
[55-light-sky-time.md](../world/55-light-sky-time.md); the **climate fields**
it samples are in [black-marsh-climatology.md](black-marsh-climatology.md); the
**canon** (calendar, moons, constellations) is in
[world/sources/lore/topics/sky-moons-calendar.md](../../world/sources/lore/topics/sky-moons-calendar.md).

## 1. The vocabulary (so we name things correctly)

The "golden glowing air" of humid tropical places is **aerial perspective**
produced by **Mie scattering** off aerosol (water-coated haze particles), and
its warmth at low sun is **forward scattering**: Mie's phase function is
strongly forward-biased (Henyey–Greenstein `g` ≈ 0.75–0.9), so when you look
towards a low sun through thick aerosol the air itself glows. The right
quantitative knob is **aerosol optical depth** (density integrated along the
path); artist-facing engines expose it as **turbidity**. Contrast with
**Rayleigh scattering** (molecules, ∝ λ⁻⁴) which makes the sky blue and distant
mountains blue-grey.

Standard scale heights: **Rayleigh ≈ 8 km, Mie ≈ 1.2 km**
([Bruneton & Neyret; GPU Gems 2 ch.16](https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-16-accurate-atmospheric-scattering)).
Atmospheric models for humid air add a **mixing/boundary layer** — uniform
aerosol density below a height, exponential above. That single extra term is
what separates "crisp mountain air above, soup below" and is exactly the
mountain-vs-swamp contrast we want.

So, in our terms:

| Sensation we want | Physical control |
|---|---|
| Crisp, clear, deep-blue light in the border mountains | low aerosol density, camera above the boundary layer, high Rayleigh:Mie ratio |
| Hazy, glowing, low-contrast swamp air | high aerosol density inside a shallow boundary layer, strong forward Mie |
| Golden low-sun glow through humid air | forward Mie (`g`→0.85) × long optical path at low sun elevation × warm inscatter tint |
| Distant hills fading blue-grey | Rayleigh inscatter over distance (aerial perspective), not grey `THREE.Fog` |
| Dawn ground mist pooling in basins | separate *height-fog volume* term driven by the climate mist field, not the same knob as haze |

## 2. Prior art worth copying

### 2.1 Bethesda's data model (CLMT + WTHR) — copy the *schema*

Skyrim's [Climate](https://ck.uesp.net/wiki/Climate) record holds day length,
**sunrise/sunset begin+end**, which moons appear, **moon phase length**, sun
colour/glare, and weather-type list with a **volatility** knob controlling how
often weather changes. Its [Weather](https://ck.uesp.net/wiki/Weather) record
stores, **per time-of-day band (dawn / day / dusk / night)**, a full colour
set: sky upper, sky lower, horizon ring, ambient, sunlight (moonlight at
night), fog near/far, cloud layers, sky statics, water brightness, moon glare;
plus directional ambient (`DALC`: lateral fill, sky-down Z−, ground-bounce Z+,
ambient specular), fog distances (`FNAM`) and volumetric-lighting refs
(`HNAM`). ([UESP CLMT](https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/CLMT),
[UESP WTHR](https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/WTHR),
[STEP weather reference](https://stepmodifications.org/wiki/Project:Skyrim_Weather_Reference).)

**Verdict: adopt the schema shape, reject the authoring burden.** A 4-band ×
N-weathers × M-climates colour table is a huge hand-authoring job and is why
Skyrim weather mods exist at all. We instead **compute** the same quantities
from a physical sky model + our climate fields, and keep the table as an
*override* layer for hand-tuned moments. Bethesda's list is still the correct
checklist of "things a weather state must be able to say".

### 2.2 The Blacksmith (Unity) — the practical haze model

Unity's demo used *height-modulated exponential fog*: density from a sea-level
reference and a height falloff, scaling a distance-based exponential, tinted;
plus a separate sun-facing Mie term. They kept the names "Rayleigh" and "Mie"
for the two terms after simplifying away the physics, because those are the two
knobs artists actually want.
([Unity blog](https://blog.unity.com/technology/atmospheric-scattering-in-the-blacksmith))
**Verdict: this is our Tier-1 aerial perspective.** Best effort-to-result ratio,
runs anywhere, one fullscreen pass or a chunk-shader term.

### 2.3 Unreal's split (SkyAtmosphere vs ExponentialHeightFog)

Worth knowing because it names the trap: Mie in a sky-atmosphere component *is
itself* a height-fog simulation, so stacking a separate height fog
double-counts inscatter unless you black out one side
([UE docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/exponential-height-fog-in-unreal-engine)).
Our design keeps **one** aerial-perspective term and treats ground mist as a
distinct, spatially-bounded volume.

### 2.4 Volumetric fog (froxel) — the ceiling, not the floor

Frustum-aligned low-res 3D texture, per-voxel in/out-scatter, raymarch
accumulate; gives volumetric shadows and inhomogeneous density
([Wronski, SIGGRAPH 2014](https://bartwronski.com/wp-content/uploads/2014/08/bwronski_volumetric_fog_siggraph2014.pdf),
[Wenzel, SIGGRAPH 2006](https://advances.realtimerendering.com/s2006/Chapter6-Real-time%20Atmospheric%20Effects%20in%20Games.pdf)).
Feasible in WebGL2 at low res but expensive on the low device tier.
**Verdict: quality-tier-only (high tier), and only after Tier 1 ships.**

## 3. Three.js library survey (repo is three r0.184, R3F 9, drei 10)

| Option | What it gives | Verdict |
|---|---|---|
| **`three/addons/objects/Sky.js`** (Preetham "A Practical Analytic Model for Daylight"), wrapped by drei `<Sky>` | Analytic sky dome with `turbidity`, `rayleigh`, `mieCoefficient`, `mieDirectionalG`, `sunPosition`. De-facto standard, cheap, already in our dependency tree. Docs note you can disable `showSunDisc` while baking an env map. ([docs](https://threejs.org/docs/pages/Sky.html)) | **ADOPT** as the Tier-1 sky. Its parameters *are* the turbidity/Mie knobs we want, so climate fields map straight onto them. Caveat: WebGLRenderer only (`SkyMesh` for WebGPU); Preetham degrades below the horizon and at night — we cross-fade to a night model. |
| **`@takram/three-atmosphere`** (Bruneton precomputed atmospheric scattering + aerial-perspective LUT, R3F provider) ([repo](https://github.com/takram-design-engineering/three-geospatial/tree/main/packages/atmosphere)) | Physically correct sky *and* aerial perspective, planet-scale | **REJECT for now.** It is a geospatial/ellipsoid renderer, supports **only Lambertian BRDF** — it applies lighting inside `AerialPerspectiveEffect` and expects unlit materials with the render buffer treated as albedo. That is incompatible with our PBR terrain + PBR characters. Revisit only if we ever move to a deferred/albedo-buffer pipeline. |
| **`jeantimex/precomputed_atmospheric_scattering`** (Bruneton port) | Reference implementation of the same model | Reference reading, not a dependency. |
| **three.js bundled CSM** (`three/examples/jsm/csm/CSM.js`, [example](https://threejs.org/examples/webgl_shadowmap_csm.html)); standalone [three-csm](https://github.com/StrandedKitty/three-csm) is 3 years stale | Cascaded shadow maps: 4 frusta, `practical` split mode, `maxFar`, `fade` | **ADOPT.** Mandatory for a sun over kilometres of terrain. Gotchas: `setupMaterial()` must be called for *every* material (easy to miss on streamed chunks and instanced vegetation); `update()` every frame but `updateFrustums()` **not** every frame; `maxFar` well below draw distance is the single biggest win; 3 cascades @2048 usually beats 4 @1024 on terrain. |
| **drei `<Stars>`** | Points-based star field, opacity cross-fade | **ADAPT, don't adopt as-is** — our stars must be 13 canonical constellations rotating with the calendar (see the lore dossier), not random points. Use it as the rendering pattern (Points + size attenuation off + additive), feed it authored star positions. |
| **drei `<Cloud>` / `<Clouds>`** (billboard puffs) | Cheap volumetric-ish clouds | Candidate for Tier-2 cumulus over the marsh; not a sky model. |
| **`@takram/three-clouds`** | Real volumetric clouds | Tier-3 / high quality tier only; heavy. |
| **`pmndrs/postprocessing`** (`GodRaysEffect`, bloom, tone mapping) — not yet a dependency | Screen-space light shafts from a sun mesh | **Tier-2 ADOPT** for crepuscular rays through canopy; screen-space only (fails when the sun is offscreen), which is acceptable. |
| **`suncalc`** ([repo](https://github.com/mourner/suncalc)) — Meeus' *Astronomical Algorithms* | Sun/moon altitude+azimuth, rise/set, twilight bands (`addTime`, e.g. blue hour at −4°), `getMoonIllumination` → `fraction` (lit disc 0–1), `phase` (0–1), `angle` (bright-limb position angle) | **PORT THE MATH, DON'T DEPEND ON IT.** It computes real-Earth ephemerides from a JS `Date`; our world runs a fictional 365-day calendar with a 28-night moon. We reimplement ~60 lines (declination/hour-angle → alt/az) against our own clock. Its *API shape* is the right one to copy, and its twilight-angle table (−0.833° sunrise, −6° civil, −12° nautical, −18° astronomical) is the correct definition of our dawn/dusk bands. |
| Commercial "Sky Pro" / itch sky packs | Complete TSL sky systems | Rejected: licensing + we need our own celestial rules. |

## 4. Physically-based light values (three.js r155+)

Lights are physically correct by default (`useLegacyLights` removed); intensity
for a `DirectionalLight` is in **lux**. Reference illuminances to anchor the
sun/moon curve:

| Condition | Illuminance |
|---|---|
| Direct sun, clear noon | ~100,000 lx |
| Overcast day | ~1,000–10,000 lx |
| Sunset/sunrise (sun on horizon) | ~400 lx |
| Civil twilight | ~3–10 lx |
| Full moon, clear | ~0.1–0.3 lx |
| Starlight, moonless | ~0.001 lx |

That is an 8-order-of-magnitude range, so **tone mapping + exposure are part of
the light system, not a post-step**: `ACESFilmic` (or `AgX`, in three since
r16x, which holds saturation better in highlights) with a
`toneMappingExposure` driven by a slow **eye-adaptation** curve. Night must
*not* be authored by turning the sun down to 0.1 lx literally — the standard
game solution is a floor on scene exposure plus a cool "moonlight" ambient, so
the player can still read the world (Bethesda does exactly this via the
night-band ambient/`DALC` colours).

Env lighting: generate an IBL from the sky dome with `PMREMGenerator`, **on a
throttle** (every few degrees of sun elevation, not per-frame), sun disc
disabled during the bake.

## 5. The recommended stack (what module 55 specifies)

1. **World clock** (pure data, no rendering) → date/time → sun & moon
   altitude/azimuth + moon phase from our own ephemeris.
2. **Sky**: Preetham dome, driven by `sunPosition` + turbidity from the local
   climate fields; cross-faded at twilight into a night dome (gradient +
   constellations + moons).
3. **Sun/moon light**: one `DirectionalLight` per active body, colour and lux
   from an elevation-parameterised curve (Rayleigh-reddened at low elevation),
   CSM for shadows, exposure/adaptation on the renderer.
4. **Aerial perspective**: Blacksmith-style height-modulated exponential
   inscatter with separate Rayleigh (blue, tall scale height) and Mie (warm,
   forward, boundary-layer) terms — density sampled from the climate humidity
   /mist fields, so mountains clear and swamps glow *for free* from data we
   already compute.
5. **Ground mist / weather volumes**: separate, bounded, driven by the mist
   field and the weather state; billboards + shader band at Tier 1, froxel
   volumetrics at the high quality tier.
6. **Weather state machine**: region-weighted frequencies from the climate
   fields, interpolating a Bethesda-shaped parameter block (not hand-authored
   colours: computed targets with optional overrides).

## 6. Performance envelope (GitHub Pages, mid-range laptop and phone)

- Sky dome: negligible (one fullscreen-ish quad/dome, no depth writes).
- CSM: the dominant cost — cascade cost scales with **objects re-rendered per
  cascade**, so `castShadow=false` on distant LOD chunks and vegetation beyond
  cascade 2, cap `maxFar` at ~200–400 m for character play.
- Aerial perspective as an analytic term in the chunk shader: ~free. As a
  fullscreen post pass: one extra fullscreen pass, still cheap.
- PMREM re-bake: ~1–3 ms, throttled — never per-frame.
- Froxel volumetrics: high tier only; budget it as a whole quality tier, not a
  toggle.
- Quality tiers must be a **single declarative table** (as with water in module
  60), because these systems interact: no godrays without a sun mesh, no
  volumetrics on low tier, IBL bake rate scales with tier.

## 7. Open questions for the build (not decisions)

- Exact nominal latitude constant (drives day-length variation and sun
  culmination) — pick at the first studio gate by eye against the lore
  reasoning in the dossier.
- Whether moons render as lit spheres (phases fall out of the sun direction
  for free, and Masser's >2× size is trivially correct) or as textured
  billboards with an authored terminator. Spheres are cheaper to be *right*.
- Whether canopy darkening is a light-probe/volume term or a per-chunk
  occlusion raster baked at compile time (the latter is cheaper and matches
  "permanent dusk" being a *place* property, not a dynamic one).

## 8. Twilight palettes, golden hour and the display-referred moon (2026-08-25, round-3 research)

**Tropical dawn/dusk palette** (photography-derived, applied in the dome's
twilight-glow layer, `WorldSky.tsx`): horizon core molten orange
(#FC6A38-class → linear ≈ (1.0, 0.30, 0.10)), mid-sky coral→magenta spread
(#F5406D-class), zenith violet→indigo wash (#50366F/#32334D-class). Physics:
golden-hour colour temperature is ~2 000–4 000 K only while the sun is within
±6° of the horizon; deep orange/red belongs to the last degrees; after
sunset comes the uniformly cool "blue hour". Implementation notes: the glow is
anchored at the sun's azimuth (pow(azimuthDot, 5) core + pow(2) spread +
isotropic wash) and its luminance is computed CPU-side as
`k / exposureTarget × bell(sunAlt)` so its **on-screen** brightness follows
one smooth authored bell — that pattern is flash-proof by construction.
Sources: taskmate.digital/palettes/tropical-sunset-gradient,
schemecolor.com/sunset-sky-gradient.php, photopills.com "Mastering Golden
Hour", Wikipedia "Golden hour (photography)".

**Golden-hour ground haze**: the community-standard approach (e.g. the
r/threejs terrain post the owner referenced, 2025: "override the default fog
implementation … customizations of MeshStandardMaterial, you still get proper
lighting/shadows") is architecturally identical to our `aerial.ts`
(onBeforeCompile height-fog with a sun-forward Mie phase term). The missing
ingredient was tuning, not plumbing: boost the haze's sun-scatter gain
(~×3 at sun altitude 0–4°, fading by ~16°) so humid lowlands glow gold at low
sun — the humidity raster already localises it.

**Exposure**: derive-from-illuminance models diverge from what the
Preetham dome + IBL actually emit around sunrise (we shipped a severe
overexposure spike that way, twice). The robust pattern is an **authored
log-interpolated exposure curve over sun altitude** with a night value driven
by moonlight. Related: any stepped ambient (throttled PMREM bakes) against a
continuously-adapting exposure reads as flashes — tighten the bake threshold
through twilight (ours: 0.004 sun-y within ±0.25, else 0.025).

**Moons**: physically-scaled disc luminance cannot survive night exposure
floors (clips to a flat white circle). Author the discs **display-referred**
(skip scene tone mapping), additive over the dome, with soft-pow terminator,
view-angle limb darkening and procedural maria noise. Phase realism note: a
moon high at midnight IS near-full (same geometry as Earth's Moon —
crescents are daytime companions); don't "fix" that with fake phases.

### 8b. Sunlight CCT vs solar elevation (round-4 research)

Measured anchors: ~2000 K with the sun on the horizon, ~3000–3500 K in the
golden band (0–10°), ~5400–5750 K above ~30–40° (Granada daylight-spectra
study; lighting patents; PhotoPills). The warm shift CONCENTRATES near the
horizon (air mass ∝ 1/sin(elevation) — do not interpolate linearly across the
day). Implemented as a three-stop ramp in `lightRig.ts` (HORIZON_SUN 2000 K →
GOLDEN_SUN 3400 K by 10° → NOON_SUN 5500 K by ~42°), plus a low-sun turbidity
boost so the Preetham disc/halo redden together with the light. Sources:
rp-photonics.com/color_temperature.html, link.springer.com/article/10.1186/
1687-5281-2013-14, photopills.com golden-hour article.

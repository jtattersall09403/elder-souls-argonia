# Weather, clouds and rain in a browser (three.js) — research, 2026-08-28

Inspiration and known-good implementation pointers for **Phase 8c — weather
and atmosphere** (module [55-light-sky-time.md](../world/55-light-sky-time.md)
§97–98: state machine, cloud layers, rain/squall/thunderstorm, wet surfaces,
three mist regimes, god rays, quality tiers). Audience: the implementation
agents building 8c — capable experts; this is *prior art to reason from, not a
prescription*. It extends (does not restate)
[natural-light-sky-atmosphere-threejs.md](natural-light-sky-atmosphere-threejs.md)
(the sky/haze/light stack; §2.1 WTHR schema, §2.4 froxel fog, §3 library
survey) and [black-marsh-climatology.md](black-marsh-climatology.md) (the
climate fields that must *drive* everything here). Repo context: three r0.184,
R3F 9, drei 10, GitHub Pages, mid-range laptops + ideally phones.

## 1. What the repo already has (build on, don't duplicate)

- A custom Preetham dome with an envelope-pinned screen-luminance model and an
  authored exposure curve (`apps/world-studio/src/sky/`, research doc §8d) — any
  cloud/weather layer must live inside that envelope or it will re-break the
  gates that §8d fixed.
- One aerial-perspective authority (`aerial.ts`, onBeforeCompile height fog)
  fed by climate humidity — weather must modulate it, not add a second fog.
- `apps/world-studio/src/water/RippleSim.ts` — 256² ping-pong wave heightfield
  on a ~36 m player-following patch, impulse-stamped (Evan Wallace scheme).
  Rain splashes on water are an *impulse source* for this existing sim.
- `apps/world-studio/src/water/groundWetness.ts` — shore wetness band already
  darkens + polishes terrain from shared uniforms. Rain wetness is plausibly
  the same shader path with a global (or masked) wetness scalar.
- The wind uniform block is specified as weather-owned (module 55 §98);
  vegetation sway and water chop are existing consumers.

## 2. Clouds

### 2.1 `@takram/three-clouds` (three-geospatial) — the owner-flagged option

Verified from the repo ([three-geospatial](https://github.com/takram-design-engineering/three-geospatial),
[packages/clouds README](https://github.com/takram-design-engineering/three-geospatial/tree/main/packages/clouds)):

- **Split**: `@takram/three-atmosphere` (Bruneton precomputed scattering),
  `@takram/three-clouds` (volumetric clouds), `@takram/three-geospatial`
  (core GIS math), `@takram/three-geospatial-effects` (post effects). All
  **MIT**. Clouds is "beta"; `three-clouds` 0.7.6 hard-depends on
  `three-atmosphere` + `three-geospatial`, and peer-depends on
  `postprocessing >=6.36.7`, `@react-three/postprocessing >=3.0.4`,
  `three >=0.170.0`, `@react-three/fiber >=9.0.4`, `react >=19`
  ([package.json](https://github.com/takram-design-engineering/three-geospatial/blob/main/packages/clouds/package.json)).
  Our three r0.184 / R3F 9 satisfy all of these.
- **Technique** (confirmed, per its README): Nubis/Schneider-style raymarched
  volumetrics — weather texture (coverage packed RGBA, max **4 layers**, per
  layer altitude/height/densityScale), procedural shape + detail 3D noise,
  Henyey–Greenstein scattering, **Beer Shadow Maps** (sun-view optical-depth
  cascades, 3 by default, TAA-filtered) so clouds shadow the ground, optional
  raymarched **light shafts**, and **temporal upscaling** that cuts the march
  to 1/16 of pixels per frame (with the standard ghosting/smearing cost in
  sparse cloud and disocclusion).
- **Works without 3D Tiles**: verified — the Storybook has a
  [MinimalSetup story](https://github.com/takram-design-engineering/three-geospatial/blob/main/storybook/src/clouds/MinimalSetup.stories.tsx)
  (~23 lines: `<Atmosphere date>` → `<Clouds>` + `<AerialPerspective sky
  sunLight skyLight>` in an `EffectComposer`, no tiles), plus Basic/Vanilla/
  CustomLayers stories; the
  [Tokyo demo](https://takram-design-engineering.github.io/three-geospatial/?path=/story/clouds-3d-tiles-renderer-integration--tokyo)
  is the tiles showcase, not a requirement. **But** the *frame* is not
  optional: "the reference frame is fixed to ECEF and cannot be configured"
  (atmosphere README, verified) — camera/scene sit on an Earth ellipsoid.
  A `worldToECEFMatrix` exists precisely to pin a local-origin scene to a
  chosen geographic point (verified the parameter; using it for our flat
  province is *inferred* to be the intended route — a WorldOriginRebasing
  story exists).
- **Performance** (author's claims): quality presets low/medium/high/ultra;
  low ≈ 36–53 fps on an iPhone 13; temporal upscaling strongly recommended;
  cost scales with total layer height and erosion. The README itself says: if
  the low preset is still too slow, **use a skybox instead** — the author's
  own tiering advice matches our module-55 line ("volumetric = high tier
  extra, never a requirement").
- **Integration friction with our stack** (analysis, not verified): it is a
  `postprocessing`-library effect and composes with its *own* sky + aerial
  perspective (`AerialPerspectiveEffect`, HalfFloat buffers, tone mapping in
  the composer) — our sky is a custom envelope-pinned Preetham dome with
  renderer-side tone mapping and a CPU screen model, and the earlier survey
  already rejected `three-atmosphere`'s scene lighting (Lambertian-only,
  research doc §3). Whether `CloudsEffect` can composite over *our* dome with
  *our* sun direction, without adopting its sky/lighting, is the central
  unknown (open question below). GLSL/WebGL only today (WebGPU planned).

**Assessment: usable with caveats** — licence, versions and the no-tiles path
are all clean; the caveats are the ECEF frame, the postprocessing-pipeline
adoption, and reconciling two sky/tone-mapping authorities.

### 2.2 The canonical recipe (if we build or adapt our own)

The technique the whole field copies: Schneider's Nubis line —
[SIGGRAPH 2017 slides](https://advances.realtimerendering.com/s2017/Nubis%20-%20Authoring%20Realtime%20Volumetric%20Cloudscapes%20with%20the%20Decima%20Engine%20-%20Final%20.pdf),
[Guerrilla's publications](https://www.guerrilla-games.com/read/nubis-authoring-real-time-volumetric-cloudscapes-with-the-decima-engine),
[Nubis Evolved](https://www.guerrilla-games.com/read/nubis-evolved), GPU Pro 7
chapter. Core: clouds are a density *function* — low-frequency Perlin-Worley
base eroded by high-frequency Worley; a 2D **weather map** sampled by world XZ
gives per-region coverage/type/precipitation; a height gradient selects
stratus/cumulus/cirrus profiles; raymarch with cheap secondary marches to the
sun; ~2 ms on PS4 for a skybox-quality result. The 2022 GDC follow-up
([Superstorms](https://gdcvault.com/play/1027688/The-Real-Time-Volumetric-Superstorms))
added storm cells, internal lightning flashes and temporal upscaling — the
relevant art for our thunderstorm state. The **weather-map idea is valuable at
every tier**: our climate fields (rain amplitude R, storm exposure X,
climatology §3) are literally a province-scale weather map already.

### 2.3 Cheaper tiers (what low/mid devices should get)

- **Scrolling textured dome layers — the Bethesda way.** Skyrim's WTHR record
  drives up to 32 scrolling cloud texture layers on the sky dome, each with
  per-time-band colour, alpha and speed ([UESP WTHR](https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/WTHR),
  [STEP weather reference](https://stepmodifications.org/wiki/Project:Skyrim_Weather_Reference)).
  2–4 such layers (alpha textures, wind-scrolled, colour fed by our sky
  envelope) are near-free and cross-fade naturally during weather transitions.
  This is the shipped-game baseline for exactly our genre.
- **Billboard puffs**: drei `<Clouds>/<Cloud>` (already surveyed, research doc
  §3) for discrete low cumulus over the marsh; a dissertation comparing the
  approaches concludes billboards win wherever the skyscape is secondary and
  frame-time variance matters ([Staffs FYP](https://gradex.staffs.ac.uk/wp-content/uploads/2025/05/5270_FYP-Dissertation.docx)).
- **Community volumetrics** as reference reading, not dependencies:
  [FarazzShaikh/three-volumetric-clouds](https://github.com/FarazzShaikh/three-volumetric-clouds)
  (Nubis-Evolved-following, WebGL), the three.js
  [webgpu_volume_cloud example](https://threejs.org/examples/webgpu_volume_cloud.html),
  and forum threads on post-pass marching
  ([efficient volumetric clouds](https://discourse.threejs.org/t/efficient-volumetric-clouds/66067),
  ["game ready" thread](https://discourse.threejs.org/t/volumetric-clouds-game-ready/86598)).
- A useful hybrid (common practice, *inferred*): raymarch once into a static
  sky texture per weather state ("bake the volumetric to a skybox") and only
  animate scroll/colour — the takram README explicitly endorses skybox
  fallback over its own low preset.

## 3. Rain, squall, thunderstorm

- **Falling rain**: GPU-instanced stretched billboards in a camera-following
  volume is the standard — [Tariq's NVIDIA rain whitepaper](https://developer.download.nvidia.com/SDK/10/direct3d/Source/rain/doc/RainSDKWhitePaper.pdf)
  (texture array of streak appearances under different lighting) and
  [Tatarchuk's ToyShop chapter](https://advances.realtimerendering.com/s2006/Chapter3-Artist-Directable_Real-Time_Rain_Rendering_in_City_Environments.pdf)
  (SIGGRAPH 2006; also does a fullscreen scrolling-noise "rain veil" pass for
  distance rain — much cheaper than particles for monsoon walls of water).
  Frustum-restricted spawn volumes keep counts sane.
- **Occlusion under canopy/roofs — the trick that sells it**: Lagarde's
  *Water drop 2a* ([blog](https://seblagarde.wordpress.com/2012/12/27/water-drop-2a-dynamic-rain-and-its-effects/),
  from Remember Me): render a small **top-down depth map** (256², ~0.2–0.33 ms
  on PS3/360-class hardware) above the camera in the rain direction; test each
  drop's virtual position against it like a shadow map — drops vanish under
  cover, and the *same map* yields splash spawn positions on the ground.
  A soft camera-depth test also fades drops behind geometry. Our dense canopy
  ("permanent dusk" regions) makes this near-mandatory for believability.
- **Splash coupling**: splash sprites at depth-map hit points (Lagarde, ibid.);
  on water, rain should stamp small impulses into the existing `RippleSim`
  patch (repo path §1 — it was built to take arbitrary impulses); on terrain,
  the Unity production-ready shader sample shows the cheap alternative —
  4 phase-offset procedural ripple normals blended in the wet shader
  ([Unity Shader Graph samples](https://docs.unity3d.com/Packages/com.unity.shadergraph@17.4/manual/Shader-Graph-Sample-Production-Ready-Detail.html)).
- **Screen-space**: camera lens droplets/streaks are part 2b of Lagarde's
  series ([series index](https://seblagarde.wordpress.com/tag/rain/)); tasteful
  in third-person only during squalls, if at all.
- **Lightning**: shipped practice is a 1–3-frame sky+directional intensity
  spike (with our envelope, spike the *authored screen target*, not raw lux —
  §8d lesson; this framing is inferred), plus distance-delayed thunder:
  `delay = distance / 343 m·s⁻¹` (~3 s/km), with multi-path rumble tails
  ([arXiv 1103.4271](https://arxiv.org/pdf/1103.4271) implements exactly
  flash + delayed thunder in a weather system). Nubis Superstorms (above)
  shows in-cloud flash illumination for the high tier. Module 57 §106 owns the
  audio bed.

## 4. Wet-surface response

The canonical reference is Lagarde's *Water drop 3a — physically based wet
surfaces* ([blog](https://seblagarde.wordpress.com/2013/03/19/water-drop-3a-physically-based-wet-surfaces/)):
wetting = water filling pores → **darken (and slightly saturate) albedo,
lower roughness**, magnitude scaled by **porosity** (rough/porous/dark
materials change most; smooth/non-porous/metallic barely change). Most shipped
games used one eye-calibrated factor for everything — the porosity-aware
version is cheap and reads far better. Practical recipes:
[Van Huffelen tutorial](https://www.shaderic.com/tutorials/RealisticMaterialWetness.html)
(darken by lerping albedo toward albedo², derive porosity from roughness,
force normals flat above ~98% wetness for puddles, puddle mask from inverted
height map + contrast) and the Unity wetness subgraph (link above).
[fxguide's wet-environments piece](https://www.fxguide.com/fxfeatured/game-environments-partc/)
surveys the same ground. Coupling to state (standard practice, *inferred*):
a global `wetness` scalar that rises during rain and **decays over tens of
minutes after** (so the world stays glossy after a squall — exactly the
owner-praised behaviour `groundWetness.ts` already gives the shore band);
puddle masks accumulate by flatness/height and drain on the same clock. Our
terrain already has per-material roughness and the wetness uniform plumbing —
this is an extension, not a new system.

## 5. Weather dynamics — Bethesda's machine, tropical rhythms

### 5.1 The Bethesda dynamics layer (schema already adopted in §2.1 of the sky doc)

Verified from [CK wiki Climate](https://ck.uesp.net/wiki/Climate),
[CK wiki Weather](https://ck.uesp.net/wiki/Weather),
[STEP reference](https://stepmodifications.org/wiki/Project:Skyrim_Weather_Reference):
regions carry **weighted weather lists** (RDWT chances — e.g. fog 50, clear
11); a climate **volatility** slider sets roll frequency; each weather has a
**transition time in game-hours** and a Trans Delta rate; precipitation has a
`Begin Fade In` point (e.g. particles appear only at 80% transitioned).
Two dynamics lessons worth stealing: (a) **blended transitions are free
variety** — 10 weathers with long transitions yield 55 intermediate skies
modders deliberately exploit; (b) keep both a smooth-transition and a
force-set path (Skyrim's `sw` vs `fw`) for studio tooling. Our version should
compute the region weights from the climate fields (R, X, M, §33.1) rather
than hand-tables, per module 55 §98.

### 5.2 Tropical rhythms the state machine should echo (so it feels monsoonal, not temperate)

All verified climatology; the game mapping is ours to design:

- **Diurnal convection**: over tropical *land*, mornings are clear, cumulus
  builds through midday, rain/thunder peaks in the **afternoon–evening**,
  decaying overnight; over the *ocean*, deep convection peaks in the **early
  morning** ([COMET tropical textbook ch.5](https://ftp.comet.ucar.edu/memory-stick/tropical/textbook_2nd_edition/navmenu.php_tab_6_page_3.7.0.htm),
  [Yang & Slingo 2001](https://journals.ametsoc.org/view/journals/mwre/129/4/1520-0493_2001_129_0784_tdcitt_2.0.co_2.xml)).
  So: inland thunderstorm probability should be a function of *time of day*,
  not just a random roll — afternoon storms that build visibly are the single
  most recognisable tropical signature.
- **Monsoon active/break spells**: wet-season rain is not uniform — multi-day
  **active spells** (large, long-lived, widespread rain systems, 40–80 h)
  alternate with **break spells** (days of lighter wind, isolated storms)
  ([Bangladesh study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10520830/),
  [J. Climate 2016](https://journals.ametsoc.org/view/journals/clim/29/21/jcli-d-16-0028.1.xml)).
  A slow 3–10 day "spell" state *above* the hourly weather roll gives the
  season texture; monsoon **onset/burst** is itself a datable event
  ([BoM monsoon page](https://www.bom.gov.au/resources/learn-and-explore/climate-knowledge-centre/climate-factors/monsoon)) —
  a calendar moment quests can reference.
- **Squall lines**: mesoscale lines of storms with a sharp gust front, and —
  counterintuitively — characteristic of monsoon **break** phases over land
  (Darwin: [COMET ch.9](http://www.chanthaburi.buu.ac.th/~wirote/met/tropical/textbook_2nd_edition/navmenu.php_tab_10_page_7.3.1.3.htm),
  [AMS glossary](https://glossary.ametsoc.org/wiki/squall-line/)). As a game
  state: a *fast-moving front* (dark wall, wind spike hitting the shared wind
  block, minutes of violence, quick clearing) rather than a slow fade — the
  one weather that should legitimately transition fast.
- **Fog regimes** (mapped to the three mist regimes in module 55 §97 and the
  M field in climatology §3): **radiation fog** — clear calm nights over wet
  ground, densest just after dawn, burns off by late morning
  ([NWS](https://www.weather.gov/source/zhu/ZHU_Training_Page/fog_stuff/forecasting_fog/RADIATION_ADVECTION_FOG.html),
  [NAV CANADA](https://avmet.navcanada.ca/en/radiation-fog.aspx)) — i.e. the
  dawn-basin mist *requires last night to have been clear*: a
  cross-dependency between successive weather states that makes the machine
  feel causal, not random; **advection sea fog** rolling up estuaries when
  humid marine air crosses cooler water/land (same NWS source); the montane
  cloud-forest belt is quasi-permanent (climatology §2).

## 6. Performance notes (delta to the sky doc's §6 envelope)

- Dome cloud layers + wind scroll: negligible. Billboard puffs: overdraw-bound
  — keep counts low, fade by distance.
- takram clouds: budget it as its own quality tier (author's own guidance,
  §2.1); temporal upscaling on, light shafts off below ultra.
- Rain particles: cap by a "rain intensity" scalar, frustum-restricted volume;
  the 256² occlusion depth map is sub-millisecond-class (Lagarde's measured
  numbers, §3) and double-duties for splashes.
- Wetness: zero new passes — uniforms into existing terrain/ground shaders.
- The state machine itself is CPU trivia; determinism (seeded per region+date,
  module 55 §98) matters more than cost.

## 7. Open questions (for the implementing agent, not directives)

- Can `CloudsEffect` composite over our own dome, driven only by our sun
  vector — or does adopting it force the whole takram sky + postprocessing
  tone-mapping pipeline (and how does that coexist with the §8d
  envelope-pinning)? Needs a spike behind a flag before committing.
- If takram is high-tier-only, what is the *mid*-tier cloud look — dome
  layers + drei puffs, or a pre-marched per-state skybox bake?
- Do the 4-layer weather-texture channels map cleanly onto our states
  (e.g. stratus deck / cumulus / storm anvil / cirrus)?
- Where does the wetness scalar live — global per-province, per-region, or a
  coarse raster blended like the climate fields — and does interior/canopy
  dryness reuse the rain-occlusion depth map or the compiled canopy raster?
- Does the squall gust front deserve a moving *world-space* front position
  (visible approaching wall, ties to storm-exposure field X), or is a timed
  global transition enough at province scale?
- Thunder audio: one delayed crack per flash, or a small multi-path tail
  (§3)? Depends on module 57's audio budget.

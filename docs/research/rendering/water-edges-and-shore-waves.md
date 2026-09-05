# Water edges, shore waves, wet sand, interactive ripples — research

Online research (2026-08-27) for the province water renderer (three.js r184, WebGL2,
Gerstner water adapted from [WaterThreeJS](https://github.com/achrefelouafi/WaterThreeJS),
baked province water-surface-height raster ~3.66 m/px + shore-distance field, scene
colour+depth available in the water shader). Practical findings, formulas, sources.

## 1. Shore waves / lapping

**Industry consensus: no fluid sim.** Shipped games fake shore waves with one of three
tiers, all driven by *distance to shore* (from a distance field, water depth, or authored UVs):

**Tier A — analytic wave bands (what we should do).** Scroll a periodic function down the
shore-distance gradient. With `d` = shore distance (0 at waterline), `t` = time:

```glsl
float g = saturate(d / bandRange) + noise(worldXZ * nScale) * nAmp;  // distorted gradient
float w = fract(g * waveCount - t * speed);          // 0..1 sawtooth per band, moving shoreward
float band = smoothstep(0.95, 1.0, w);               // thin advancing foam line
// or smooth: band = 0.5 + 0.5*cos(TAU * (g*waveCount - t*speed));
```
- Fade each band out as it nears `d≈0` and re-fade in offshore, so lines "wash out" rather
  than teleport. Cyanilux and Alisavakis both do exactly this (noise-distorted gradient,
  ×waveCount, frac/cos, smoothstep to thin the line):
  [Cyanilux shoreline breakdown](https://www.cyanilux.com/tutorials/shoreline-shader-breakdown/),
  [Alisavakis stylized water](https://halisavakis.com/my-take-on-shaders-stylized-water-shader/) (his trick: `sin(foamDiff*8π + t)`).
- **Runup (swash) sync**: waterline advance/retreat is a separate oscillation
  `swash = 0.1 * cos(t * speed * waveCount * TAU + phase)` added to the waterline
  threshold; using the *same* `speed × waveCount` product guarantees one incoming band
  per swash cycle (Cyanilux; his empirically tuned phase ≈ −2.5 at waveCount 3.2).
- UE4's water does the same with mesh distance fields: `DistanceToNearestSurface` drives a
  sine "pulse" plus self-distorted noise foam — i.e. our baked shore-distance field is the
  standard input, we just already have it offline instead of an engine SDF.
- Amplitude/phase-by-distance is old practice (FarCry, Assassin's Creed, Outerra —
  per [gamedev.net shoreline waves thread](https://www.gamedev.net/forums/topic/665443-shoreline-waves/)):
  also *increase Gerstner amplitude and align wave direction to −∇d as d→0* so geometric
  swell visually feeds the foam bands.

**Tier B — baked/authored wavefronts (Horizon Forbidden West, Uncharted 4).**
[HFW SIGGRAPH 2022, Hugh Malan](https://advances.realtimerendering.com/s2022/SIGGRAPH2022-Advances-Water-Malan.pdf):
one baked animated *cross-section* of a breaking wave (a deformation texture: U =
back-to-front through the wave, V = animation age 0→1, breaking at ~0.5) is swept along
artist-authored wavefront curves (shape/guide/animation curves, Coons-patch interpolated,
baked per world tile); a variation texture (one row per wavefront) scales deformation to
punch gaps in the break; foam via vertex colour. Uncharted 4 layered "wave particles" and
offline-sim-informed flow ([Rendering Rapids in U4, SIGGRAPH 2016](https://advances.realtimerendering.com/s2016/)).
Verdict: gorgeous, but requires per-coast authoring tools + dense tessellation — not worth
it for us now; the *idea* to steal is "age parameter grows as the wave nears shore",
which Tier A's `g − t` already gives us for free.

**Tier C — Skyrim (the cheap floor).** Vanilla Skyrim has **no procedural shore foam**:
foam is hand-placed FX NIF meshes (`fxfoam`/`fxrapids`/`fxwaterfall*`) with a shared foam
texture, plus depth-fog blending at the waterline; badly landscaped shores show hard seams.
(Evidenced across [Realistic Water Two](https://www.nexusmods.com/skyrimspecialedition/mods/2182),
[Rally's Water Foam](https://www.nexusmods.com/skyrimspecialedition/mods/28922),
[Community Shaders Water.hlsl docs](https://deepwiki.com/doodlum/skyrim-community-shaders/3.4-water-shaders) —
the decompiled vanilla shader.) So the "foam decal" is literally a designer-placed mesh.
We beat Skyrim automatically with Tier A because we have a province-wide distance field.

## 2. Wet sand

Standard look = **darken albedo + drop roughness/raise specular** below the recent-max
waterline, fading with time-since-wet:
`albedo *= mix(1.0, 0.55, wet); roughness = mix(roughness, 0.15, wet);`
(e.g. [tidewright sand shader](https://github.com/winchxyz/tidewright): wetness darkens
albedo and drops roughness; [UE4 beach transition](https://medium.com/@nerud.de.zutter/creating-a-realistic-beach-to-ocean-transition-in-unreal-engine-4-ee27b1022a89): lerp to a darkened copy.)

**Computing "recent waterline" cheaply.** Two proven routes:
1. **Analytic runup envelope (recommended — free).** Our runup is a known closed-form
   function `waterline(x, t) = base(x) + swashAmp * cos(ωt + φ)`. The recent max over the
   last cycle is just `base(x) + swashAmp` — so the wet band is simply
   `wet = smoothstep(0, feather, (base + swashAmp) - d) * (1 - currentBand)`, optionally
   weighted by phase so wetness is strongest just after the retreat
   (`wet *= 0.5 + 0.5*cos(phaseSinceCrest)` for drying). Terrain shader needs only the
   shore-distance field + the same uniforms as the water shader — perfect sync because
   both evaluate the same formula (the sync problem is *the* hard part when the mask and
   the wave are computed separately; sharing the function solves it — same conclusion as
   tidewright and the Cyanilux writeup, where the wet trail is a low-alpha black overlay
   behind the retreating swash edge).
2. **Water-history buffer (only if we later need arbitrary waves).** Denny & Rogers,
   ["Water history in a deferred shader: wet sand on the beach"](https://www.researchgate.net/publication/247928705_Water_history_in_a_deferred_shader_wet_sand_on_the_beach):
   a screen/world-space buffer records last-submerged time per texel; wetness decays from
   it. More texture traffic, needed only for sim-driven waterlines.

## 3. Water–land edge quality

**Depth-fade alpha is the baseline** (used by essentially every modern title incl. the
Skyrim-derived shaders' fog blending). With scene depth available:

```glsl
float waterColumn = linearSceneDepth - linearFragDepth;      // metres of water under this pixel
float alpha  = saturate(waterColumn / softDist);             // softDist ≈ 0.3–1.0 m
float foamEdge = 1.0 - saturate(waterColumn / foamDist);     // contact foam mask
```
- Kill refraction/distortion and normal amplitude where `waterColumn` is small — distorted
  UVs sampling above-water pixels at the edge is the classic artifact (Community Shaders
  explicitly limits distortion in shallows).
- Break the parallel-to-shore foam line with world-space noise on `foamDist` and a
  scrolling foam texture; a hard uniform-width white line is the #1 "game water" tell
  ([Roystan toon water](https://roystan.net/articles/toon-water/), Cyanilux).
- **Slope dependence**: `waterColumn` thresholds produce a *ground-plan* band width of
  `foamDist / tan(slope)` — huge sheets on near-flat terrain, a sliver on cliffs.
  Roystan's fix: modulate the threshold by the underlying surface normal
  (`foamDist = mix(maxDist, minDist, saturate(dot(terrainN, waterN)))`) so steep rock gets
  a deeper foam threshold and flat shores a shallow one. Do the same for our wave bands:
  suppress runup/swash where terrain slope > ~20° (waves slap, they don't run up cliffs).
- **Terrain displacement vs shader tricks**: big studios mostly *author* the shoreline
  (erosion-carved gentle beach profiles in the heightmap, e.g. HFW hand-places wavefronts
  onto sculpted beaches; Skyrim's seams are exactly what un-authored shores look like).
  Runtime terrain displacement for shorelines is not standard practice. For us: bake a
  gentle 2–6° underwater apron into beach-classified shoreline during terrain generation —
  it makes every shader technique above look better and costs nothing at runtime.
- **Our resolutions**: edge softness itself is **screen-space** (depth fade), so the
  3.66 m/px water raster does *not* limit it — the raster only decides *where* the plane
  sits; bilinear-sample it and the 1.8 m/px terrain decides the intersection line. The
  shore-distance field at 3.66 m/px is fine for wave bands (features 10–50 m) but too
  coarse for the foam contact line — use depth-fade (screen-space) for the contact line,
  distance field only for bands/runup/wet sand, always noise-distorted to hide raster steps.

## 4. Interactive ripples

**Evan Wallace / jeantimex sim** ([webgl-water](https://madebyevan.com/webgl-water/),
[github.com/jeantimex/threejs-water](https://github.com/jeantimex/threejs-water),
[80.lv writeup](https://80.lv/articles/real-time-water-simulation-with-three-js)):
256×256 float ping-pong texture, RG = (height, velocity); per-frame update
```glsl
float avg = 0.25 * (h[x-1] + h[x+1] + h[y-1] + h[y+1]);
vel += (avg - h) * 2.0;  vel *= 0.995;  h += vel;          // wave equation + damping
```
Drops stamped as `h += strength * 0.5 * (1 - cos(π * saturate(1 - dist/radius)))`;
normals from neighbour differences in a second pass. jeantimex adds compound-sphere
displacement for arbitrary objects, half-float fallback, NaN clamps, notes iOS precision
issues. **WaterThreeJS has no sim at all** — foam is a shader-side energy field (Jacobian
folds + depth bands + contact foam), so player wading/splash rings need this sim added.

**Skyrim benchmark (the cheap floor)**: a dynamic displacement texture on a ~quad around
actors (`bUseWaterDisplacements`, `fWadingWaterQuadSize=2048` units ≈ 29 m;
[STEP INI docs](https://stepmodifications.org/wiki/Guide:SkyrimPrefs_INI/Water)) —
i.e. Skyrim itself ships exactly a small local sim patch following actors; rain ripples
are separate procedural normal-map ripples positioned via a `RippleData` cbuffer, advected
by the flowmap in world space ([Community Shaders docs](https://deepwiki.com/doodlum/skyrim-community-shaders/3.4-water-shaders)).

**Recommended integration shape** (matches both Skyrim's architecture and the Wallace sim):
- One **256×256 RG16F ping-pong patch, ~32 m world size** (12.5 cm/texel), centred on the
  player, **snapped to whole texels**; on recentre, offset-copy the old texture (or just
  let edge damping eat the loss). Damp to zero over the outer ~8% ring so waves never hit
  the border.
- **Stamp impulses**: player wade (each footfall/continuous while moving in water ≤ waist),
  object/projectile splashes, NPC wading — all via the cosine drop stamp above; splash
  strength ∝ impact speed. Expanding rings fall out of the sim automatically.
- **Feed the main material**: sample the patch in the water shader when the fragment is
  inside the patch AABB; add its finite-difference normal (scaled down with distance to
  patch edge) onto the Gerstner normal, and optionally its height to vertex displacement
  near the camera. No change to the Gerstner system.
- **Cost**: 2 passes (update + optional normal bake) over 65k texels ≈ well under 0.1 ms
  on anything WebGL2-capable; one extra texture sample in the water shader.
- **WebGL2 constraints**: render-to-float needs `EXT_color_buffer_float` (~universally
  available); full-float *linear filtering* needs `OES_texture_float_linear` (spotty on
  mobile) — but **RG16F is both renderable (with the ext) and linearly filterable in core
  WebGL2**, and 16-bit is ample for ±0.5 m ripples ⇒ use RG16F, nearest-filter inside the
  sim (exact texel fetches anyway), linear when the water material samples it. Clear after
  creation and clamp NaNs (jeantimex's iOS lesson).

## Bottom line for our stack

Baked shore-distance field + analytic swash gives us: wave bands (§1 Tier A), runup, wet
sand (§2 route 1, same formula in the terrain shader) — all uniform-synced, no new data.
Depth-fade + slope-aware foam threshold fixes the contact line (§3). A single 256² RG16F
Skyrim-style local sim patch adds all interactivity (§4). Terrain-side: carve gentle beach
aprons at generation time on shores flagged as beaches.

## 5. Round 7 — why lapping still doesn't read, and the fix

Second research pass (2026-08-28), after the owner reported that the Tier-A analytic
swash still "is not lapping on the shore as it should". Diagnosis from what shipped
implementations actually do, then the recipe.

### 5.1 Diagnosis: four things our Tier A is missing

**(a) The eye reads the WATERLINE MOVING, not foam lines.** Every stylised
implementation that convincingly "laps" — Cyanilux's shoreline shader, the Animal
Crossing-style beach shaders — makes the *edge of the water itself* translate metres up
and down the sand, with foam and wet sand hung off that moving edge
([Cyanilux breakdown](https://www.cyanilux.com/tutorials/shoreline-shader-breakdown/):
the cosine swash *offsets the shoreline gradient*, i.e. the alpha edge, before any foam;
[Feargrieve's ACNH-style tide shader](https://feargrieve.wordpress.com/portfolio/beach-waves-shader/):
layered masks pushing a foam edge *and a transparent water layer* up the sand, then
retracting). Our swash is a 9 cm **vertical** sine (`SWASH.amplitudeM = 0.09`); on a
typical 2–6° beach apron that is only ~1–2.5 m of horizontal excursion, symmetric in
time — it reads as the sea gently *throbbing*, not as waves arriving. Vertical amplitude
is the wrong control knob: the spec should be **horizontal runup excursion** (real swash
excursions are metres to tens of metres), back-derived per-shore from the apron slope.

**(b) No geometric arrival: waves must visibly approach, shoal, and break.** All the
engine-level systems make the *swell geometry* interact with the shore:
- UE5's ocean attenuates Gerstner waves by water depth ("depth at which waves are
  attenuated" on the [Water Body Actor](https://dev.epicgames.com/documentation/en-us/unreal-engine/water-body-actors-in-unreal-engine)).
- Crest dampens waves where depth < λ/2 with a configurable "Attenuation In Shallows",
  driven by a baked seabed depth cache
  ([Shorelines and Shallows](https://crest.readthedocs.io/en/stable/user/shallows-and-shorelines.html));
  its ShapeGerstner component exists specifically for "shoreline waves"
  ([Waves](https://crest.readthedocs.io/en/stable/user/waves.html)).
- Unity HDRP goes further with an explicit **Shore Wave deformer**: a train of bumps
  *translating shoreward*, with `Speed`, `Wavelength`, a **`Skipped Waves`** proportion,
  a `Blend Range` where amplitude is maximal, and a **`Breaking Range`** where "the wave
  reaches its maximum amplitude at the start of the range, generates surface foam inside
  it and loses 70 % of its amplitude at the end"
  ([HDRP water deformer docs](https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.0/manual/water-deform-a-water-surface.html);
  the [Island sample](https://github.com/Unity-Technologies/WaterScenes) drives these
  along the beach via custom render textures — [Unity blog](https://unity.com/blog/engine-platform/new-hdrp-water-system-in-2022-lts-and-2023-1)).
  That max→break(foam)→−70 %→swash amplitude profile is the exact envelope to copy.
- Physics for the profile: shoaling. Keep ω fixed; depth changes the dispersion to
  ω² = g·k·tanh(k·D) ([Tessendorf course notes](https://jtessen.people.clemson.edu/reports/papers_files/coursenotes2002.pdf)),
  so k grows (wavelength shortens, crests bunch up) and amplitude grows as
  A ∝ D^(−1/4) (Green's law, [wave shoaling](https://en.wikipedia.org/wiki/Wave_shoaling))
  until breaking at D_b ≈ H/0.78 (breaker index). Ubisoft's newest coasts (Skull &
  Bones) even model the collapsing topology with swept approximation curves because
  heightfields can't ([SIGGRAPH 2024 talk](https://dl.acm.org/doi/10.1145/3641233.3664308)) —
  far beyond us, but it confirms the read comes from *shape*, not texture. GPU Gems ch. 1
  gives the pragmatic floor: attenuate amplitude by depth and clamp vertices to never go
  below terrain, "for a gradual die-off of waves coming onto a shallow shore"
  ([GPU Gems 1 ch. 1](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models)).
  [Frozen Fractal's WebGL sailing game](https://frozenfractal.com/blog/2024/5/31/around-the-world-15-making-waves/)
  ships exactly this minimal loop: depth<λ/2 attenuation to zero at the waterline plus
  "opaque white where depth (incl. wave height) < 1 m".

**(c) Real swash is asymmetric.** Bore-driven swash has maximum velocity at the *start*
of the uprush, near-linear deceleration to reversal, then a gravity-accelerated backwash
that lasts *longer* than the uprush
([Coastal Wiki swash-zone dynamics](https://www.coastalwiki.org/wiki/Swash_zone_dynamics),
[Wikipedia Swash](https://en.wikipedia.org/wiki/Swash)). A symmetric `sin(ωt)` is the
single biggest tell after amplitude. Cyanilux notes the same limitation of his cosine.

**(d) The barcode: equal, parallel, ever-firing bands read as fake.** Three proven
breakers-up, all cheap:
1. **Phase jitter**: distort the shore-distance gradient with world-space noise before
   banding (Cyanilux — already partially in).
2. **Per-wave amplitude variation / skipped waves**: HDRP has a literal `Skipped Waves`
   parameter; Outerra masks its procedural beach waves "using a texture with a mask
   changing in time so they aren't continual all around the shore"
   ([Outerra ocean rendering](https://outerra.blogspot.com/2011/02/ocean-rendering.html)).
3. **Wave groups (surf beat)**: real waves arrive in sets of ~3–10 with lulls between —
   the "every 7th wave" folk rule — because wave groups drive a bound infragravity
   oscillation of the shoreline itself
   ([infragravity waves](https://en.wikipedia.org/wiki/Infragravity_wave),
   [wave sets & lulls](https://oceanfit.com.au/education/wave-sets-and-lulls-is-every-seventh-wave-the-biggest/)).
   One slow envelope multiplying band amplitude AND swash amplitude gives "one swash
   suddenly runs much farther up the beach" — the signature of real lapping. Run-up =
   slow set-up/set-down component + per-wave swash
   ([Coastal Wiki wave run-up](https://www.coastalwiki.org/wiki/Wave_run-up)).

### 5.2 Phase relationships (what syncs with what)

Physically correct ordering per cycle, from the sources above: crest arrives at the
break depth → **surface foam is born inside the breaking range** (HDRP), i.e. foam max
leads the tongue; the bore front (leading edge of the uprush tongue) carries the densest
foam, moving fastest at the *start* of the uprush; during the backwash foam is stranded
in arcs and streaks aligned with the flow (down-slope, ⊥ shore) — the Godot
[Realistic Shoreline](https://reboot16.itch.io/godot-rsw) demo strands "foam arcs" from
the draining swash; **wet sand darkens the instant water covers it and dries slowly**
(45 s in that demo — a time constant ≫ the swash period, so the wet band is the envelope
of recent maxima, sharpest just behind the retreating edge). Our single travelling phase
θ = ωt + k·d already gives crest→swash continuity for free; keep it and hang the new
envelopes off it.

### 5.3 Recipe for our stack

One shared phase, three new envelopes, all analytic (CPU query, water shader, terrain
shader keep evaluating identical closed forms — extend the `SWASH` table in
`packages/game-core/src/water/waves.ts`):

- **Inputs**: shore-distance d (SDF raster) and its gradient ∇d (bake an RG gradient
  raster next to the SDF, or Sobel it at load — 3.66 m/px derivatives need a ~2-texel
  smooth); local depth D = W − ground (already derivable); exposure; tide; water clock t.
  Respect the no-data-in-PNG-alpha rule (decision 0025 r3).
- **Group envelope** (fixes the barcode + gives "big seventh wave"):
  `G(d,t) = 0.55 + 0.45·(0.5 + 0.5·sin(ω_g·t + k_g·d + hashPerCoast))`, ω_g ≈ ω/6,
  k_g ≈ k/6, plus a slow world-noise gate that drops ~⅓ of individual bands
  (HDRP `Skipped Waves` / Outerra time-mask). G multiplies band foam, shoal amplitude
  and swash amplitude alike.
- **Shoal swell (geometry)**: where d < ~70 m and exposure > 0, add 1–2 Gerstner
  components in the water vertex shader with `dir = −normalize(∇d)`, phase θ = ωt + k(D)·d
  with `k(D) = k₀ / sqrt(tanh(k₀·max(D, 0.1)))` (cheap ω²=gk·tanh(kD) inversion —
  wavelength visibly shortens), amplitude
  `A = A₀ · min(pow(D_ref/max(D,0.3), 0.25), 2.0) · G` (Green's-law growth), steepness Q
  rising toward the break then → 0; past the break point (D < D_b ≈ 0.8·A·2) collapse
  amplitude by 70 % over ~8 m (the HDRP breaking-range profile) into the swash lift.
  Clamp displaced verts to ≥ terrain (GPU Gems). Suppress where slope > 20° or
  turbidity-damped (existing rules).
- **Asymmetric swash with real excursion**: replace `sin` with a skewed oscillator,
  e.g. `s(θ) = cos(θ − β·sin θ)` with β ≈ 0.5–0.7 (fast rise ≈ 35 % of period, slow
  fall), and spec amplitude as horizontal excursion: `amplitudeM = targetRunupM ·
  tan(apronSlope)` — target 4–8 m of excursion on beach coasts (≈ 0.2–0.4 m vertical on
  a 3° apron), × exposure × G. CPU query, wet-sand band and buoyancy all reuse s(θ).
- **The tongue**: the lifted surface × the existing depth-fade alpha *is* the swash
  sheet — but only if the water clipmap overlaps the runup zone; guarantee a skirt of
  water surface above the still-water shoreline up to `maxRunup` (extend the
  clipmap/raster W by the swash max near shore, as today, with the bigger amplitude).
  Where 0 < waterColumn < ~0.15 m inside the swash band: kill refraction & Gerstner
  normals, alpha = saturate(waterColumn/0.15) so the tongue thins to nothing (ACNH-style
  ramp), and add **leading-edge foam**: `foamLead = smoothstep(0.35, 0.0,
  runupEdgeM(θ) − upBeachDistM)` — foam rides the front, strongest during the uprush
  half (`ds/dθ > 0`), fading through the backwash. During backwash, reuse the round-6
  anisotropic streak sampling with `dir` (down-slope backwash streaks) and leave a
  decaying bubble term `pow(0.5+0.5·cos(θ − δ), 4)` trailing the band (stranded arcs).
- **Wet sand**: unchanged mechanism, new envelope — recent-max waterline uses
  `base + swashAmp·G_setMax` (the *group* max, so the wet band matches the farthest
  recent tongue), drying weighted by phase-since-covered with an asymmetric s(θ) inverse
  (instant wet, slow dry).
- **Priorities if time-boxed**: asymmetric + bigger + group-modulated swash first (the
  waterline translation is what reads), shoal swell second, leading-edge/stranded foam
  third. More parallel bands alone can never fix it — they *are* the barcode.

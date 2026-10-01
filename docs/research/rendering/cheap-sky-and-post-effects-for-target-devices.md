# Cheap 3D clouds and post effects for the target devices (research, 2026-10-01)

Targets: Honor Magic V5 (Snapdragon 8 Elite, Adreno 830) and MacBook Air M2 8 GB;
bar 60 fps (16.7 ms) with nothing else lost. Renderer: three r184, R3F; WebGL2
today, WebGPU/TSL on branch `webgpu` (decisions 0111, 0112). We have no post
stack today: no `EffectComposer`/`postprocessing` import under `apps/world-studio/src`
or `packages/`; the frame is MSAA forward (fable5 audit row 32). The sky is one
dome (`apps/world-studio/src/sky/WorldSky.tsx`) drawing a 2D weather cloud
field (`cloudField.ts`, shared `cloudUniforms`, deck + cirrus amounts, sunset
tint), the aerial fog march, and sun shafts (`game-core/air/sunShafts`).
Existing cloud research: `weather-clouds-rain-threejs.md` §2 (takram, Nubis).
That doc stays the home for the dome; this one adds the cheap 3D layer and the
post-effect verdicts.

No source below measured our devices. Numbers marked "est." are mine, scaled
from the nearest reported measurement; they become real only after a timer
query on each device (`EXT_disjoint_timer_query_webgl2` / WebGPU timestamps,
fable5 audit row 13).

## 1. 3D clouds as an addition to the dome

Not pursued (owner 2026-10-01): the sky stays the dome without 3D clouds.

| Technique | Reported cost | WebGL2 | three.js path | Verdict |
|---|---|---|---|---|
| Full raymarched volumetric, temporal upscale 1/16 (`@takram/three-clouds`, Nubis-style) | iPhone 13, Low preset: 36-53 fps at 780x1326 for the clouds scene alone; iPad Pro 1st gen 30-32 fps (README) | yes (pmndrs postprocessing effect, no TSL/WebGPU yet) | `<Clouds>` effect over its own atmosphere | no: alone it misses 60 on a phone-class GPU |
| Raymarch through baked 3D noise texture (forum "game ready" demo; three `webgpu_volume_cloud`) | 60 fps on a GTX 1060 at default; 11-20 fps reported on an RTX 2080 under Linux; pixel-bound, 16-128 steps | demo is WebGL; example is WebGPU | ShaderMaterial / TSL `raymarchingTexture` on a box | no for the phone; possible on M2 only at quarter res |
| Mesh-cluster clouds (noise-displaced spheres, lit by sun) | "medium" cost, no device numbers (CK42BB repo) | yes | InstancedMesh + custom shader | possible, hard silhouettes at close range |
| Billboard/impostor sprite clusters (drei `<Clouds>`/`<Cloud>`: instanced, default 20 segments per cloud, `limit` 200) | "low cost, mobile-friendly" (CK42BB); main cost is overdraw of transparent quads | yes | one InstancedMesh, soft-particle depth fade | **recommended** |

Recommendation: **lit sprite-cluster cumulus**, one InstancedMesh, both renderers.
- Content: 12-30 clouds visible at fair/broken/partly cloudy, 8-16 sprites
  each (<= 400 instances), 600-1500 m altitude, extra clusters seeded on
  peaks above a height threshold; count and opacity read from the same
  weather state that drives `cloudUniforms` (coverage 0 at overcast, so the
  layer is skipped, not drawn transparent). Placement deterministic from a
  seed per tile (standard: determinism).
- Shading: per sprite a normal-mapped or two-channel (density, thickness)
  puff texture from the vault/mod pool (we make no art: sourcing job; drei's
  default texture is a CDN file, not to be shipped), lit with the
  existing sun colour, `uCloudBright/uCloudDark` and sunset tint so the 3D
  puffs match the dome; fog applied with the shared aerial uniforms;
  soft-particle fade against scene depth (WebGL2: depth texture of the
  opaque pass; WebGPU: `viewportDepthTexture`).
- Cost control: draw after opaques with depth test on (terrain and peaks kill
  the fragments), sprites sorted far-to-near per cluster only, small
  on-screen at altitude, fade out by 4 km so the dome takes over; cap
  instances by quality tier.
- Est. cost: Adreno 830 0.4-1.0 ms at 1080p-class, M2 0.2-0.5 ms; worst case
  is the player flying through a cloud (full-screen overdraw), handled by a
  near fade that drops sprites within 60 m.
- WebGPU-only extra (later, M2 tier): a per-cloud bounded raymarch at
  quarter res with 4x4 temporal reprojection (Schneider/Hillaire; arXiv
  1609.05344; vertexfragment upsampling post). Not needed for the owner's
  ask; the sprite layer stays the fallback either way.

## 2. Post effects at 60 fps

Every full-screen pass on a tiled GPU costs a resolve and a re-read (Qualcomm
Adreno best-practices guide); WebGL2 has no subpass merge, so effects must be
merged into as few passes as possible. pmndrs/postprocessing merges effects
into one uber shader; three's WebGPU `RenderPipeline` (renamed from
PostProcessing in r183) composes nodes in one pass. Adding the first post
pass at all also turns MSAA into an MSAA-resolve plus a copy: budget est.
0.5-1 ms on Adreno for that base cost, near 0.2 ms on M2.

| Effect | Evidence | Half-res trick | WebGL2 / WebGPU path | Verdict |
|---|---|---|---|---|
| Soft glow (bloom) | Arm/Spellsouls: Gaussian bloom 3 ms on Mali, dual filtering far cheaper (14x at 1080p), fake bloom < 1 ms; three `BloomNode` = 12 quad passes, 5 mips, fill-bound | threshold pass at half res, mip chain from there | pmndrs `BloomEffect` (`mipmapBlur`, `resolutionScale`, threshold 1 with emissive > 1) / TSL `bloom()` from `three/addons/tsl/display` | **yes at 60 fps** at half-res start, est. 0.6-1.2 ms Adreno, 0.3 ms M2. Cheaper equal-look fallback for flames and lanterns: additive glow sprites at each light (Arm "fake bloom", < 1 ms) |
| Crease shading, screen-space AO | N8AO halfRes 2-4x faster, depth-aware upsample fixed ~1 ms, "Performance" preset 8 samples targets mobile; SSAO half res est. 0.3-0.7 ms, GTAO half 0.5-1 ms on an iGPU (thirdfold issue #159, unconfirmed); LAAS GTAO half res 2.4 ms on desktop (audit row 33) | half res + depth-aware upsample mandatory | N8AO (WebGL2, pmndrs-compatible) / `GTAONode` (halo artefacts reported) or `n8ao-webgpu` port | **only on M2** (est. 1-1.5 ms); on Adreno est. 2-4 ms with upsample: no |
| Crease shading, baked | standard practice; zero runtime cost | n/a | vertex-colour AO baked into kit meshes at kit build (`pipeline/`), plus a soft dark ground blob/decal under large objects from the footprint | **yes at 60 fps** on both; the phone's crease path |
| Small shadows under pebbles/grass (contact shadows) | LAAS 1.5 ms on desktop (audit row 33) | screen-space march at half res | custom pass, both | no on phone; M2 only if AO is not already on |
| Smoother leaf edges | TAA 4.4 ms on desktop (row 32) | n/a | `material.alphaToCoverage = true` on cutout foliage with the MSAA we already have | **yes** via alpha-to-coverage (near-free with MSAA); TAA no |
| Colour plan per time of day / AgX grade | a LUT or curve in the final pass | n/a | `AgXToneMapping` exists in three; 3D LUT effect (pmndrs `LUT3DEffect`, TSL `lut3D`) | **yes**, once a post pass exists (< 0.2 ms) |
| Bounced light in shadows | LAAS probe GI +3 ms desktop (row 34) | n/a | baked probe/irradiance field per tile | no at runtime; baked variant only |

Phone budget if the owner takes bloom + baked creases + alpha-to-coverage +
grade: est. 1.5-2.5 ms added; M2 high tier adds N8AO half res for est. 1-1.5 ms
more. Each verdict above is an estimate until timed on both devices.

## Sources

- https://www.npmjs.com/package/@takram/three-clouds (README presets and device table)
- https://discourse.threejs.org/t/efficient-volumetric-clouds/66067
- https://discourse.threejs.org/t/volumetric-clouds-game-ready/86598
- https://threejs.org/examples/webgpu_volume_cloud.html
- https://github.com/CK42BB/procedural-clouds-threejs
- https://drei.docs.pmnd.rs/staging/cloud
- https://discourse.threejs.org/t/instanced-particle-clouds-for-threejs/56547
- https://www.vertexfragment.com/ramblings/volumetric-cloud-upsampling/
- https://arxiv.org/pdf/1609.05344
- https://www.gamedev.net/forums/topic/698511-temporal-reprojection-on-volumetric-cloud-rendering/
- https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/post-processing-effects-on-mobile-optimization-and-alternatives
- https://pmndrs.github.io/postprocessing/public/docs/class/src/effects/BloomEffect.js~BloomEffect.html
- https://react-postprocessing.docs.pmnd.rs/effects/bloom
- https://github.com/oneilltomhq/three-rs/pull/108 (BloomNode pass structure)
- https://discourse.threejs.org/t/how-to-remove-webgpu-bloomnode-grain/72711
- https://github.com/N8python/n8ao
- https://github.com/marioandf/n8ao-webgpu
- https://github.com/tougenrip/thirdfold/issues/159
- https://docs.qualcomm.com/bundle/publicresource/topics/80-78185-2/mobile_best_practices.html
- https://thegamedev.guru/taskforce/2026-05-on-tile-post-processing-mobile-xr/

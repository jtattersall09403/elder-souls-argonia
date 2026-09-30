# Fire system: technique choice for WebGL now, WebGPU hero later (16k walk 5, 2026-09-29)

Full working notes: `tooling/.reports/16k/walk5/fire/research.md`. NIF contents: `tooling/.reports/16k/walk4/orient-fire.md` §(a).

## Why flames were invisible by day and white blobs by night
- The scene is in physical luminance units. Exposure (`apps/world-studio/src/sky/lightRig.ts` EXPOSURE_CURVE, `nightExposureOf`) is 3.9e-5 at 45 deg sun and up to 22 at night: about 19 EV apart.
- Flame sprites were authored display-referred (gain 1.5 x day factor 0.5), tone-mapped and additive. By day 0.75 x 3.9e-5 is black. At night 33 before ACES saturates to white.
- Additive blending cannot occlude a bright sky-lit background, so by day it adds nothing visible.
- Rule for any fire shader: `toneMapped: false`, own exposure-aware gain from a shared light-rig uniform, and premultiplied-alpha blending (`ONE, ONE_MINUS_SRC_ALPHA`). The core has alpha near 1 and occludes, so it reads by day. The fringe has alpha 0 and adds, so it glows at night.

## Techniques weighed
| technique | cost | verdict |
|---|---|---|
| three.js `webgpu_volume_fire`: stable-fluids solve on 100x100x200 half-float Storage3DTextures (8 fields, ~128 MB), ~7 compute dispatches/frame (advect, divergence, 2 Jacobi, project, advect dye, emit; curl noise once), `VolumeNodeMaterial` 16-step raymarch with HG phase + self-shadow, blur + bloom | one grid per fire; WebGPU compute only (no WebGL path, inferred) | hero only, WebGPU, shrunk grid (e.g. 32x32x64) |
| Raymarched noise box (mattatz/THREE.Fire, MIT; `@wolffo/three-fire`, MIT, GLSL + TSL; after Fuller et al. I3D 2007) | 20 steps x 3 simplex octaves per pixel, 1 draw per fire | near-hero band step |
| Noise-distorted flame quad / alpha erosion + temperature ramp (Wind Waker analysis by N. Gordon; BotW-class per community VFX analysis) | 1 instanced draw for all fires, 2-3 noise octaves per pixel, fill-rate bound | **build this** |
| Particle flipbook (Skyrim's own: FXFireAtlas02/04 x GradFlame palettes, MPSCandleFlame01 via ADDN) | many quads + particle state | reference only; the mined `flames[]` records stay as the input |

Breath of the Wild has no official breakdown. The community reading is emissive cards with panning noise or alpha erosion plus a gradient ramp, separate embers, and many particles doubling as point lights. There is no fluid simulation.

## What to build
1. Write the flame math once as a GLSL chunk with a 1:1 TSL `Fn` mirror:
   - `flameNoise` (fbm, 2-3 octaves, from a procedurally generated 64x64 tileable DataTexture or analytic noise);
   - `flameMask` (teardrop, lean, tongues);
   - `fireRamp` (volume_fire's 3-stop smoothstep ramp, stops per type).
2. Draw one InstancedMesh of a unit quad:
   - Y-locked billboard in the vertex shader;
   - instance attributes: pos, size, seed, intensity, palette, turbulence/speed/lean, layer (~64 B each);
   - depth test on, depth write off, drawn on the post-water layer;
   - sort back-to-front per frame (at most ~200 entries);
   - rewrite the instance buffer only when the fixture set changes.
3. Expand each mined flame record into 1-5 instances: a core layer and an outer layer, and for a campfire 3-5 spread over the emitter disc. Add instanced ember points and keep the smoke column. The point-light pool flickers from the same seed formula.
4. Author types in a `fireTypes` table with `schemaVersion`, referenced by id: candle, lantern, torch-hand, torch-sconce, brazier, campfire, hearth. Each entry sets size, layers, ramp, turbulence, embers, light, smoke and LOD distances. The carried torch uses the same table.
5. LOD by distance:
   - beyond ~40 m: 1 layer, 1 octave;
   - beyond ~150 m: glow dot only (keep the minimum-angle floor).
6. WebGPU later: the same InstancedMesh with a NodeMaterial from the TSL mirror. The nearest 1-3 fires swap to a box `VolumeNodeMaterial` raymarch with the same ramp, optionally fed by a small port of the volume_fire solver.

Costs here are estimates (no GPU on the build box). Prove the renderer on the 7 types in the yard before switching every fixture.

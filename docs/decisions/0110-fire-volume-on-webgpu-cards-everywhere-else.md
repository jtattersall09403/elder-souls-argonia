# 0110 — Fire: TSL cards on both backends, a raymarched volume for the large presets on WebGPU only

2026-09-29, WebGPU fire lane (16k walk 5). Extends 0107 (one config-driven
fire system) onto the node renderer of the WebGPU port (the TSL-only shader
rule, docs/standards/tsl-shaders.md).

## Decision

1. **The card renderer is a TSL NodeMaterial** (`fx/fire/flameMaterial.ts`,
   shared maths in `fireNodes.ts`): the same instanced Y-locked quads,
   fbm teardrop, 3+ cards per preset on their own phases, 3-band ramp and
   day/night gain as the 0107 GLSL material, one graph for the WebGPU and
   WebGL 2 backends. It is the only renderer on WebGL 2, and the only one
   for `candle`, `lanternStanding` and `lanternHanging` everywhere (cheaper,
   and their card look passed the walk-5 judges).
2. **`toneMapped: false` has no node-renderer equivalent** (three 0.184
   tone-maps the whole frame in its output pass; `toneMapped` is read
   nowhere). The fire stays display-referred by writing
   `displayToScene(colour)`: the exact inverse of three's TSL ACES filmic
   curve at `renderer.toneMappingExposure` (output matrix, per-channel
   RRT+ODT root, input matrix, ×0.6/exposure), clamped to display 0.94 and
   scene 60000 (half-float frame). The covering core lands on its display
   colour exactly; the premultiplied glow fringe now blends in scene space
   (an approximation of 0107's display-space blend).
3. **Volume, WebGPU only, large presets only.** `FireConfig` schema 3 adds an
   optional `volume` block (`fireTypes.ts` `FireVolumeConfig`), present on
   `torchGround`, `torchHandheld`, `brazier`, `hearth`, `campfire`. On the
   WebGPU backend (`activeBackend(renderer) === "webgpu"`, read by
   `FlameSystem` at its first draw or given by `setBackend`) each of those
   presets gets one extra draw: instanced boxes raymarched through the
   preset's simulated temperature field (`volumeFire.ts`). Within
   `FIRE_VOLUME_REACH_M` (35 m) the volume draws and the preset's cards
   yield; the two cross-fade over 5 m; beyond it the fire is cards. On WebGL
   none of the volume path is built.
4. **The simulation is cut down from three.js webgpu_volume_fire.** The
   example's stable-fluids solver (velocity advection, divergence, Jacobi
   pressure, projection, dye: ~25 compute passes on 100x200x100) becomes
   one semi-Lagrangian advection kernel of temperature on a 16x32x16 grid:
   velocity is buoyant rise plus the curl of a MaterialX-noise potential
   (divergence-free by construction, so no pressure solve), cooled by
   `dissipation` and fed by a flickering source disc. Every fire of a preset
   samples the SAME field, mirrored and swapped by its seed (8 variants), so
   compute cost is per preset in reach, never per fire. A field steps only
   in frames where one of its fires is in reach, and prewarms 60 steps on
   first use.

## Cost (stated per `fireVolumeCost`; measured numbers in § Measured)

| Item | Number |
|---|---|
| Field per preset | 16x32x16 = 8,192 cells, 2 x rgba16float = 128 KB |
| Fields at most | 5 (one per volume preset in reach): 640 KB |
| Per fire | one 48-byte instance row; no per-fire texture |
| Compute | 2 dispatches (two sub-steps, A->B->A) of 8,192 threads per preset in reach per frame; at most 10 per frame |
| Draws | 1 per volume preset in view (at most 5), plus the 2 card/ember draws |
| Raymarch | 32 steps per covered pixel, one trilinear 3-D fetch each |

The 20-fire bar (Adreno 740 class, Apple M2): the compute is independent of
the fire count (at most 10 dispatches of 8,192 threads, ~50 3-D Perlin
evaluations per cell for the curl), a few hundred thousand noise
evaluations per frame. The raymarch is the cost that scales: 20 fires with
one at 3 m (~165k pixels of box at 1080p) and 19 at 10-35 m (~10k each)
is ~355k pixels x 32 fetches = ~11M trilinear 3-D fetches per frame. On
paper that is well under a millisecond on both GPUs; it has NOT been timed
on either (this VM has no GPU: SwiftShader frame times are a ratio only),
so the bar is met on paper and stays open for a device timing. The levers
if a device misses it, cheapest first: `volume.steps` (linear), the reach
(35 m; fewer fires qualify), half-resolution volume target.

## Measured

2026-09-29, SwiftShader (CPU) at 512x288, `frameMs` from the harness
`summary.json`; a ratio between scenes, never a device time.

| Scene | WebGPU | WebGL |
|---|---|---|
| `fire-stress` (20 fires 4-34 m, volumes on WebGPU; 24 steps, density 7) | 72 ms, 10 calls | 35 ms, 5 calls |
| `fire-stress-cards` (same 20 as cards) | 26 ms, 5 calls | 45 ms, 5 calls |

Volumes cost ~2.8x the cards on SwiftShader WebGPU for the 20-fire scene.
After the judge fix (32 steps, density 12, envelope, white kernel) one
re-run gave 121 ms, taken with the machine CPU at 96 % (watchdog paused the
job), so it is not comparable. The 20-fire bar on the M2 / Adreno 740 is
met on paper only (§ Cost); a device timing is still owed.

Judges (two Sonnet agents, 2026-09-29): day/night visibility and the
20-fire stress PASS on both backends. Volume-vs-reference FAILED on the
first render (pale pink-grey by day, a box-filling column, no hot core,
banding); one fix round (32 steps, density 7 -> 12, a teardrop envelope on
the field, a near-white kernel above temperature 0.9) gave tapered flames
with a hot base at night. Still open: the volume reads fainter than the
cards by day, and one close-up fire shows horizontal banding under
SwiftShader (not yet checked on a GPU).

## Why not

- **A volume for the small presets**: a candle flame is a few pixels
  across; the raymarch would cost as much per pixel for no visible gain.
- **The full stable-fluids solver per fire**: ~25 passes on a grid a
  thousand times larger, per fire; 20 fires would be 500 passes a frame.
- **Procedural 3-D noise in the raymarch, no grid**: ~24 x 50 noise
  evaluations per pixel instead of 24 fetches; the grid moves the noise to
  8k cells per preset.

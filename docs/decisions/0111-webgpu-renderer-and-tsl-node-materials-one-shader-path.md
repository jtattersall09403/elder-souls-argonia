# 0111 — One renderer, one shader path: WebGPURenderer with TSL node materials, WebGL 2 as its fallback backend

**Date:** 2026-09-29. **Status:** accepted (WebGPU lane lead, 16k walk 5, on the
owner's instruction "migrate to WebGPU", tmp/16k-user-instruction.md, and the
planner's brief). **Branch:** `webgpu`, served at `/webgpu/` beside main's
studio until the owner accepts it on the M2 and the Honor phone.
**Evidence:** `tooling/.reports/16k/walk5/webgpu/` (lane reports L1–L10,
`report.md`). **Amends:** 0084 (GPU time source), 0108 §1 (the fixture light field is
ported to TSL and kept on both backends), 0082 (the
rung choice may run on the GPU). **Conventions:**
[docs/standards/tsl-shaders.md](../standards/tsl-shaders.md).

## 1. The renderer

Every app creates three's `WebGPURenderer` through
`packages/game-core/src/render/createRenderer.ts` (R3F: the async `gl`
factory in `render/canvasRenderer.ts`). It runs the WebGPU backend where the
browser has `navigator.gpu`, else its WebGL 2 backend (`forceWebGL`).
`?renderer=webgl|webgpu` forces a backend; the HUD and
`window.__RENDERER_BACKEND__` name the one that runs. The legacy
`WebGLRenderer` is gone: there is no second render path to keep in step.

Why WebGPURenderer and not a WebGPU-only renderer: both backends compile the
SAME node graphs, so a phone or browser without WebGPU still gets every
effect, and the owner can A/B the two backends on one build with a URL switch.

## 2. Shaders are TSL node graphs

No GLSL anywhere in `packages/` or `apps/`: no `ShaderMaterial`,
`RawShaderMaterial`, `onBeforeCompile`, `customProgramCacheKey`,
`ShaderChunk`, `WebGLRenderTarget`, GLSL strings, and no TSL `select()` on
computed values. `tooling/repo-standards/check_no_glsl.mjs` fails `npm test`
on any of them (under 1 s). A feature wraps a node slot of the material
(`positionNode`, `colorNode`, `maskNode`, `outputNode`...) through the helpers
in `render/nodes/materialNodes.ts`, so features compose in call order. Depth
twins are gone: the shadow pass reuses `positionNode` and `maskNode`.
Loaded classic materials are converted once at load (`toNodeMaterial`), and
node materials are copied only with `cloneNodeMaterial`.

**Shader builds are budgeted per frame** (walk 7: the `/webgpu/` studio froze
Chrome on the owner's phone and M2). three builds a node material into
shaders in JS, synchronously, the first frame an object with it is drawn;
character view's first frames bring hundreds of new materials (flora kit,
settlement kits, waterfall kit), and that one frame was a 25-67 s task
headless. `createRenderer` installs `render/shaderBuildBudget.ts`: an object
whose material is not built yet draws only while the frame's builds have
taken under `SHADER_BUILD_BUDGET_MS` (12), at least one per frame; the rest
wait a frame, so the world fills in over a few seconds and the browser keeps
control. Harness pages pass `shaderBuildBudgetMs: 0` (they compile up front).

**Sixteen textures per fragment shader at most.** WebGPU's default
`maxSampledTexturesPerShaderStage` is 16, as on SwiftShader and many
phones; a material over it fails validation and is not drawn (the water and
ground were at 17 and 19 in walk 7). The scene fog's textures count against
every fogged material. The boot check (§4) names any material over the limit
with its textures.

Aerial haze is ONE `scene.fogNode` built by the sky; CSM cascades are
`CSMShadowNode`. Every `reapply*` function that existed to survive CSM's
hook overwrite is deleted.

## 3. The GPU does per-instance work where WebGPU allows it

- **Many lights:** 0108's fixture light field (100 lamps in a texture, the
  nearest 8 per object, 16 for terrain), ported to TSL, lights settlements on
  BOTH backends. three's compute `TiledLighting` was measured against it on the
  WebGPU backend with 100 lamps and lost: 1.6x the GPU time, and it keeps only
  8 lights per 32 px tile in index order, not nearest first, so near huts went
  dark (mean pixel error 13.1/255 vs 0.14 for the field, against 100 real
  point lights). `installFixtureLighting(renderer, mode)` keeps `tiled` and
  `plain` as harness-only measurement modes. Revisit if three's tiled lights
  sort by distance.
- **Vegetation and ground cover:** on the WebGPU backend, a compute pass
  culls candidates against the frustum, chooses the rung with the same
  ladder and temporal cross-fade as `lodFade`, and writes compacted instance
  lists and indirect draw counts; per-frame CPU->GPU traffic is the camera
  and history uniforms. The WebGL backend keeps the CPU path.
- **GPU time on the HUD:** renderer timestamp queries (`trackTimestamp`),
  resolved every ~10 frames. On Apple Metal the value is the pass's wall time
  on the GPU queue, not pure shader time: read it as a ratio.

## 4. How subsystems are verified without a GPU

The VM has no GPU and the full studio is too slow headless (owner ruling,
walk 5). Each subsystem has a harness scene
(`apps/world-studio/src/harness/scenes/*.ts`) that builds its REAL materials,
compiles every program (`compileAsync`) and renders a small frame on both
backends (`node apps/world-studio/scripts/harness-run.mjs`). Headless
Chromium's SwiftShader gives a real WebGPU adapter, but it loses the device
when a page presents to a WebGPU canvas, so the harness renders to a target
and reads the pixels back. The visual and speed verdict is the owner's, on
the deployed `/webgpu/` build.

**Boot check (before any `/webgpu/` build goes to the owner; planner ruling
2026-10-01).** `cd apps/world-studio && node scripts/webgpu-boot-check.mjs`
boots the BUILT bundle the way Pages serves it and fails on a main-thread
freeze, a GPU validation error (a shader over 16 textures, a vertex-buffer
overflow), a device loss or no complete frame. It is cheap by design, never a
time-boxed cut-off, and never runs in preflight or CI:
- **Only when its inputs change.** A hash of the renderer and shader sources
  (the render package, fog, fire, water and ground shaders, the sky, three's
  version; `INPUTS` in the script) is stored with the last result in
  `apps/world-studio/tmp/webgpu-boot/last.json`; an unchanged hash prints the
  last line and exits. The lane whose batch touched those files runs it once,
  before the packet, and the packet quotes its line.
- **The smallest scene that exercises the failure classes:** one place (the
  server lists only `--place` in the settlement index), a 480x270 viewport at
  dpr 0.5, the low tier (the lowest that runs the froxel volumetrics), data
  from disk.
- **It stops at the first complete frame:** a frame has drawn and the GPU
  pipeline-creation count and the in-flight request count have been stable
  for 3 s of wall time (cached node builds, hundreds of them, do not move it);
  it then waits for the GPU queue, reads the validation errors and reports its
  own wall time against `TARGET_S`, the wall time of a green run on the EC2 VM
  plus 20% (SwiftShader compiles pipelines in stalls of up to 30 s, so the
  figure is the machine's, not the device's). A run over the target is a
  defect fixed by shrinking the scene or the method (and a lessons row),
  never by raising the target.
It swaps the canvas swap chain for an offscreen texture (SwiftShader drops
the device on present), and reports over-limit materials with their
textures, slow GPU calls with stacks, draw volume per pipeline, buffer bytes
per call site (`--profile`, `--alloc` add a CPU profile and allocations;
`CHROME_CDP=ws://... --present` runs it on a real GPU's Chrome). The adapter's
limits are WebGPU's defaults, as on many phones, so a pipeline that validates
here validates there; GPU work runs on the CPU, so frame rates are ratios and
the JS figures are the device's.

## 5. Rule for new shaders

A new visual effect is a function that takes (or builds) a NodeMaterial and
wraps its slots through the helpers, lives in `packages/` beside the system
that owns it, exports its plain maths for unit tests, and ships a harness
scene. No GLSL, no `onBeforeCompile`, no second material for shadows.

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

**Boot check (before any `/webgpu/` build goes to the owner).** The whole
studio is booted once, headless, from the BUILT bundle the way Pages serves
it, and fails on a hang, a GPU validation error, a device loss or no frame:

    cd apps/world-studio && node scripts/webgpu-boot-check.mjs \
      [--query "view=character&x=0.331&z=3.079&t=10%3A00"] [--seconds 90]

It builds into `/tmp/webgpu-boot-dist` (`--no-build --dist <dir>` reuses a
build), serves `public/` as the data base, swaps the canvas swap chain for an
offscreen texture on the same device (SwiftShader drops the device on
present; nothing else in the page changes) and reports in
`/tmp/webgpu-boot.json`: first frame, frames, the longest main-thread stall
(a CDP heartbeat), JS heap, every uncaptured GPU error, any shader over the
device's per-stage texture limit with its bindings, GPU calls that held the
main thread over 100 ms with their stacks, and draw volume per pipeline
(`--profile <s>` adds a CPU profile, `--gpu-timing` GPU ms per submit). The
adapter is SwiftShader's, whose limits (16 sampled textures per stage,
8 vertex buffers) are WebGPU's defaults and what many phones expose, so a
pipeline that validates here validates there. SwiftShader runs the GPU work
on the CPU: frame rates are ratios, and a main-thread stall here can be GPU
back-pressure that a real GPU absorbs; JS time and validation are the
device's own.

## 5. Rule for new shaders

A new visual effect is a function that takes (or builds) a NodeMaterial and
wraps its slots through the helpers, lives in `packages/` beside the system
that owns it, exports its plain maths for unit tests, and ships a harness
scene. No GLSL, no `onBeforeCompile`, no second material for shadows.

# 0109 — One renderer, one shader path: WebGPURenderer with TSL node materials, WebGL 2 as its fallback backend

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

## 5. Rule for new shaders

A new visual effect is a function that takes (or builds) a NodeMaterial and
wraps its slots through the helpers, lives in `packages/` beside the system
that owns it, exports its plain maths for unit tests, and ships a harness
scene. No GLSL, no `onBeforeCompile`, no second material for shadows.

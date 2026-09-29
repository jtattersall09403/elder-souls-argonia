# Shaders are TSL node materials (decision 0107)

Every app renders with three's `WebGPURenderer` (`packages/game-core/src/render/createRenderer.ts`):
the WebGPU backend where the browser has it, its WebGL 2 backend (`forceWebGL`) otherwise or with
`?renderer=webgl`. Both backends compile the same TSL node graphs, so there is ONE shader code path.
GLSL strings, `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile`, `customProgramCacheKey`,
`ShaderChunk` and `WebGLRenderer` are gone from `packages/` and `apps/` and must not come back
(`tooling/repo-standards/check_no_glsl.mjs` fails the build on them).

Read this before writing or changing any material, render pass or GPU job.

## 1. Imports

- Classes from `three/webgpu` (`MeshStandardNodeMaterial`, `NodeMaterial`, `QuadMesh`, `RenderTarget`,
  `StorageInstancedBufferAttribute`, `IndirectStorageBufferAttribute`, `BundleGroup`, `WebGPURenderer`).
  Core classes (`Mesh`, `BufferGeometry`, `DataTexture`, `Color`, `Vector3`) still come from `three`.
- Node functions from `three/tsl` (`Fn`, `uniform`, `reference`, `attribute`, `texture`, `textureLoad`,
  `positionLocal`, `positionWorld`, `positionView`, `normalLocal`, `normalView`, `cameraPosition`,
  `modelWorldMatrix`, `screenCoordinate`, `screenUV`, `varying`, `mix`, `smoothstep`, `select`, `If`,
  `Loop`, `float`, `vec2/3/4`, `int`, `uint`, `instanceIndex`, `storage`, `instancedArray`, `atomicAdd`).
- Type TSL values as `TslNode` (from `render/nodes/materialNodes.ts`); the chained typings are too deep
  for tsc to be useful. Keep the plain-number maths (thresholds, curves) as exported TS functions and
  unit-test those; the node graph mirrors them.

## 2. Patch points: old GLSL hook -> node slot

Features WRAP the node already in a slot, so several compose on one material in call order. Use the
helpers in `packages/game-core/src/render/nodes/materialNodes.ts`; never assign a slot a feature does
not own outright.

| Old patch | Node slot | Helper |
|---|---|---|
| `#include <begin_vertex>` edits to `transformed` | `positionNode` (object space) | `wrapPosition(m, p => p.add(offset))` |
| `customDepthMaterial` / `customDistanceMaterial` twin | none: the shadow pass reuses `positionNode` and `maskNode` | delete the twin |
| a shadow that must differ | `castShadowPositionNode`, `maskShadowNode` | `wrapShadowPosition`, `andShadowMask` |
| `discard` / dither / alpha cut | `maskNode` (bool, keep when true) | `andMask(m, keep)` |
| `diffuseColor` / `map_fragment` edits | `colorNode` (vec4) | `wrapColor(m, c => ...)` |
| `totalEmissiveRadiance` edits | `emissiveNode` | `wrapEmissive` |
| `gl_FragColor` / `opaque_fragment` edits | `outputNode` (vec4, before fog and tone map) | `wrapOutput(m, o => ...)` |
| normal perturbation | `normalNode` (view space) | assign |
| `fog_fragment` edits, aerial haze | `scene.fogNode` (one node for the scene) | set once in the sky |
| a whole custom shader (`ShaderMaterial`) | `NodeMaterial` / `MeshBasicNodeMaterial` with `vertexNode`/`positionNode` + `colorNode`/`fragmentNode` | write the graph |
| full-screen pass (sim, blit) | `QuadMesh(material).render(renderer)` into a `RenderTarget` | |
| `varying` | `varying(node, "name")` or `node.toVarying()` | |
| `gl_FragCoord` | `screenCoordinate`; `vViewPosition` -> `positionView` | |
| `#define` switches | JS `if` while building the graph (each variant is its own material) | |
| "never double-patch" string checks | `claimFeature(m, "wind")` | |

Loaded classic materials (GLTF, kit loaders) are converted ONCE at load with `toNodeMaterial` /
`convertObjectMaterials`, then features wrap their slots. A feature never mutates a material shared
with an object that must not have it: clone first (the old rule, unchanged).

### Gotchas proven on this port (each cost a lane an hour)

- `positionNode` is object space BEFORE the instance matrix (three 0.184, proven from the generated
  shader, although `NodeMaterial.setupPosition` reads the other way). Read instance matrices with
  `instanceMatrixNode` / `matrixColumn` from `packages/game-core/src/fx/instanceNodes.ts`; never
  `m.element(i)` on a buffer-backed matrix (it indexes the buffer).
- Never `select()` on computed values: the builder may lower it to if/else that reads unassigned
  temporaries, giving NaN silently (black striped water). Use the branch-free `sel()` from
  `packages/game-core/src/render/nodes/materialNodes.ts`.
- `Loop` and `If` only inside an `Fn(() => ...)`; a bare loop in a graph hangs the node builder.
- No texture sampling inside a function given `setLayout`: the WebGL 2 build emits an undeclared
  identifier. Pass the sampled value in instead.
- Debug a graph with `await renderer.debug.getShaderAsync(scene, camera, mesh)`; to see an
  intermediate value, route it to `outputNode` behind a harness switch.

## 3. Uniforms

- A per-frame value owned by a system is a `uniform(value)` node held by the object that owns the
  value today (`createWindUniforms()` returns nodes instead of `{ value }` objects). Update with
  `u.value = x`. Share the SAME node across materials; never copy the value into a new node.
- Where existing code hands out classic `{ value }` IUniform objects that many callers write, bridge
  with `reference("value", "float" | "vec3" | "color" | "vec4" | "mat4", obj)`; it reads `obj.value`
  each frame. Prefer migrating to `uniform()` when you own every writer.
- Textures: `texture(tex, uv)` samples; to swap the texture later set `node.value = newTex`.
  Texel fetch: `textureLoad(tex, ivec2(x, y))`.
- Uniform arrays (lights, ripples): `uniformArray(array, "vec4")`, loop with `Loop(count, ({ i }) => ...)`.
- No module-level mutable singletons (standard 5): a uniform node is state; build it in a factory
  and inject it, exactly as the `{ value }` objects were.

## 4. Instancing and per-instance data

- `InstancedMesh`: the instance matrix is applied for you (`positionLocal` is pre-instance; use
  `positionWorld` for world space). Instanced attributes: `attribute("esWindTune", "vec4")` on an
  `InstancedBufferAttribute`.
- Data-texture instance feeds keep working: `textureLoad(dataTex, ivec2(instanceIndex.mod(w), instanceIndex.div(w)))`.
  New GPU-fed data uses storage buffers: `instancedArray(count, "vec4")` read with `.element(instanceIndex)`.
- GPU-driven culling (WebGPU backend only): a compute node (`Fn(() => {...})().compute(n)`, run with
  `renderer.compute(node)`) tests each candidate and appends visible ids with `atomicAdd` into a
  storage buffer and the draw's `instanceCount` in an `IndirectStorageBufferAttribute`
  (`geometry.setIndirect(attr)`). The vertex stage reads the compacted id list. The WebGL backend has
  no compute: keep the CPU path behind `activeBackend(renderer) === "webgl"`.

## 5. Render targets, readback, timing

- `RenderTarget` (not `WebGLRenderTarget`); `renderer.setRenderTarget(rt)`; clear with `renderer.clear()`.
- Readback is async only: `await renderer.readRenderTargetPixelsAsync(rt, x, y, w, h)`.
- Compile ahead: `await renderer.compileAsync(object, camera, scene)` so first sight never stalls.
- GPU time: create with `trackTimestamp: true`, then `await renderer.resolveTimestampsAsync("render")`
  and read `renderer.info.render.timestamp` (ms). On Apple Metal the value is the pass's wall time
  on the GPU queue, not pure shader time (measured before on the M2: treat it as a ratio).
- Stats: `renderer.info.render.calls`, `.triangles`; there is no `info.programs`.

## 6. Lights and shadows

- Shadows: `renderer.shadowMap.enabled = true`, `type = PCFShadowMap`. Cascades: `CSMShadowNode`
  (`three/examples/jsm/csm/CSMShadowNode.js`) set as `light.shadow.shadowNode`; the old `CSM` class
  and its `onBeforeCompile` re-patch are gone (so the `reapply*` functions are too).
- Many point lights: on the WebGPU backend `renderer.lighting = new TiledLighting()` (compute-binned
  tiles). On the WebGL backend the settlement's fixed uniform-array loop (cap 100) is the fallback.

## 7. Tests

Vitest runs without a GPU. Test (a) the TS maths the graph mirrors, (b) that a helper filled the right
slots (`material.positionNode` is set, a second apply is a no-op, the shadow mask differs where it
must), (c) harness pages (`apps/world-studio/harness/`) compile every program with
`compileAsync` on both backends in headless Chromium (`--enable-unsafe-webgpu` gives a real
SwiftShader WebGPU adapter). Never assert on generated shader source text.

## 8. Rule for new shaders

A new visual effect is a function that takes a NodeMaterial (or builds one) and wraps slots through
the helpers above, lives in `packages/` beside the system that owns it, exports its plain maths for
tests, and ships a harness scene. No GLSL, no `onBeforeCompile`, no second material for shadows.

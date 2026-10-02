# Shaders are TSL node materials (decision 0111)

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
| `gl_FragColor` / `opaque_fragment` edits | `outputNode` (vec4; runs AFTER fog, before tone map: NodeMaterial.js setupOutput). For a pre-fog edit override the lighting model `finish` as waterMaterial.ts does | `wrapOutput(m, o => ...)` |
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

- A WebGPU draw binds at most 8 vertex buffers (default `maxVertexBuffers`). three counts one per
  distinct BufferAttribute or InterleavedBuffer, +1 for an InstancedMesh matrix (one stride-16
  buffer on the attribute path `shareInstancedPrograms` forces), +1 for `instanceColor`. Put
  per-instance data in ONE buffer with `packInstancedAttributes` (render/instancedPack.ts) and
  assert `vertexBufferCount(mesh) <= MAX_VERTEX_BUFFERS` in the factory's test (the mist volume
  hit 10 and failed only on WebGPU; WebGL was fine).
- A render-object attribute swap must keep the vertex-buffer count and order of the pipeline it
  shares (`render/shareInstancedBuilds.ts`: one replacement per source instance buffer). WebGL binds
  per location and hides a collapse; WebGPU rejects the command buffer (black frame). Verify with
  `pod-capture --probe-gpu-errors` (diag12: 6 buffers collapsed to 5, slot 5 unset).
- `positionNode` is object space BEFORE the instance matrix (three 0.184, proven from the generated
  shader, although `NodeMaterial.setupPosition` reads the other way). Read instance matrices with
  `instanceMatrixNode` / `matrixColumn` from `packages/game-core/src/fx/instanceNodes.ts`; never
  `m.element(i)` on a buffer-backed matrix (it indexes the buffer).
- Never `select()` on computed values: the builder may lower it to if/else that reads unassigned
  temporaries, giving NaN silently (black striped water). Use the branch-free `sel()` from
  `packages/game-core/src/render/nodes/materialNodes.ts`, for cheap operands only: it evaluates
  both sides on every fragment. Where dev's GLSL branched (an `if` or early return around texture
  fetches, a loop or a long ALU chain), use a real `If` inside the `Fn` writing a `toVar()` output,
  and `toVar()` every input the branch shares with code outside it. Derivatives (`dFdx`, implicit-LOD
  `.sample()`) stay at the top level, before the branch; inside a non-uniform branch read with
  `.load()` or explicit LOD only (webgpu10 F3: water 59 -> 9 unconditional fetches).
- `Loop` and `If` only inside an `Fn(() => ...)`; a bare loop in a graph hangs the node builder.
- A shared `.toVar()` node (three's `normalWorld`, `positionView`, ...) is assigned where it is FIRST
  built. If that is inside an `If` (CSMShadowNode's per-cascade normal bias), every later reader outside
  the branch reads it unassigned: zero on WebGPU, undefined on WebGL, so the backends split. Build it
  at the top first (`normalWorld.toStack()`); `createSunCascades` in apps/world-studio/src/sky/skyObjects.ts
  does this for the sun cascades (lane L16: far terrain IBL beyond the last cascade, 6 luma).
- A function given `setLayout` may not read uniforms, uniform arrays or textures: three 0.184 does not
  declare them inside it (WGSL "struct member nodeUniformN not found", GLSL undeclared identifier).
  Pass the values in as parameters, or leave the function inline.
- `NodeMaterial.clone()` is NOT a copy in three 0.184 (it drops map, color, roughness, side): clone
  node materials with `cloneNodeMaterial` from `render/nodes/materialNodes.ts`. The harness checks
  brightness, so a white untextured slab can pass it: look at the sheet.
- `sel()` and multiply-by-zero gates cannot cancel inf or NaN: clamp every `exp()` argument and guard
  every divisor (`max(x, eps)`) where the value is made (dry ground once rendered black from an
  `exp()` of a -300 m water depth). The harness fails a scene whose drawn pixels are over 20% black.
- The output pass tone-maps the whole frame, the clear colour too: a `scene.background` Color shifts under
  ACES (black at the studio's photometric exposure); the classic renderer left it alone. Pass it through
  `untonedBackground()` (`packages/game-core/src/render/untonedBackground.ts`) to keep the hex, or draw
  the sky dome / a `backgroundNode` on the scene's radiance scale as the studio does.
- Bake a PMREM environment BEFORE `renderer.compileAsync(scene)`: setting `scene.environment` after it
  recompiles every lit program inside `render()`, and on SwiftShader the terrain (WebGPU) and sky-noon
  (WebGL) harness scenes then never finished (see `addStudioSky` `bakeAtBuild`).
- Program count is a start-up budget: identical materials must compile to identical shader text.
  three 0.184 gave every small InstancedMesh (matrices under the uniform-buffer limit) its own
  uniform buffer named after the node id and sized by the count, so each mesh compiled its own
  vertex program (settlement-day: 167 programs for 176 draws); the WebGL backend links each one
  synchronously on the main thread (SwiftShader has no `KHR_parallel_shader_compile`, so even
  `compileAsync` blocks per link), and the studio never painted its first frame on SwiftShader.
  `createRenderer` calls `shareInstancedPrograms` (instanced attributes, as the classic renderer
  used). Never bake a per-object id, count or random into a graph; hold it in a uniform or an
  attribute. The harness reports `programs`, `pipelines` and `builds`, and fails a scene with
  `rebuildsAfterWarmup` above 0 (a material that recompiles every frame); `?dumpPrograms=1` puts the
  shader text in summary.json to diff two programs that should be one.
- A `texture(tex)` node with no uv builds the default `uv` attribute even when only
  `textureSize`/`textureLoad` read it ("Vertex attribute uv not found" on uv-less geometry):
  create holder nodes as `texture(tex, vec2(0))`.
- A named storage node must be ONE node per buffer, reused by every mesh and pass (the shadow pass
  builds the mesh twice; a second node of the same name is renamed into invalid WGSL). Unnamed, each
  mesh gets `NodeBuffer_<id>` and its own shader module: see `render/gpuCull/stableInstanceNames.ts`.
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
- GPU-driven culling (WebGPU backend only, `renderer` with `indirect-first-instance`): register draws
  with `GpuCullPool` (`packages/game-core/src/render/gpuCull/`). Candidates (matrix + payload vec4s)
  are written once when a slot is handed out; one `renderer.compute` per frame tests every candidate
  (frustum, sun-swept shadow sphere, rung band with the lodFade history) and copies the kept rows into
  each draw's instance buffer, with the count in its `IndirectStorageBufferAttribute`. Materials do not
  change. The WebGL backend keeps the CPU path (switch points: Vegetation.tsx, Groundcover.tsx).
- A compute stage may bind at most 8 storage buffers (WebGPU default limit): pack per-candidate and
  per-draw data into one buffer each.

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
- Many point lights: never add a `PointLight` per lamp. Fixture lamps go through the fixture light
  field (`packages/game-core/src/render/fixtureLights/`, `installFixtureLighting(renderer)`): one
  texture of lamps, the nearest 8 per object (16 for terrain), on both backends. three's
  `TiledLighting` was measured and rejected (decision 0111 §3). Draw settlement meshes per cell, never
  as one settlement-wide instanced mesh (it would get only the 8 lamps nearest its centre).

### Unlit colours under physical exposure

Exposure is physical (about 4e-5 at noon, up to ~22 at night), so a raw 0..1
colour written by an unlit or emissive material (smoke, motes, cards, glows)
draws near black by day. Convert it with `sceneRadiance(display)` from
`packages/game-core/src/air/volumetrics/volumetricNodes.ts` (display colour
to scene radiance at the current exposure), or light it with the scene's
sun and sky radiance (`waterParticleRadiance`). Decision 0112 §3.
A fixed display anchor is still unlit: by day the sunlit world is brighter
than it, so a pale particle draws darker than the ground behind it (the
charcoal chimney smoke). Anything that should read as lit by the sun (smoke,
steam, dust) lights itself in its own shader: the caller supplies the sun
direction and the sun and sky irradiance as uniforms, and the shader applies
albedo x (sky + sun x wrap-lambert on a domed billboard normal) / pi. The
PRECIP_LAYER pass camera sees no light objects, so a light-driven material
cannot do this; `smokeColumn.ts` (`setLighting`) is the example. `sceneRadiance`
is for things that emit (flames, glows, motes).

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

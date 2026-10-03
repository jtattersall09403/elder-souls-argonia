# Performance lane — the cheapest win, taken when it is cheapest

A standing lane (owner 2026-10-01, packet 9 call): every performance
technique is taken here as soon as it is the cheapest win, never parked for
a phase. [Phase 14](../README.md#phase-14--budget-lock-and-chunk-format)
keeps only the budget lock and the production chunk format before rollout.
Runs beside 16k under the lane rules in [README.md](README.md); a fix round
may hand it an item from the owner's walk.

## Scope

- Owns: frame-cost work in `packages/game-core/src/render/**`,
  `packages/game-core/src/{vegetation,settlement,fx}/**` cost paths,
  `apps/world-studio/src/{sky,water,vegetation}/**` composition, kit-build
  cost options (through the `kit-build` skill), this brief.
- WebGPU branch (decision 0111): every improvement on `dev` flows into
  `webgpu` automatically. The mechanism is
  `python3 tooling/repo-standards/merge_forward.py` (merges `dev` into the
  webgpu worktree, then runs the no-GLSL check and the world-studio
  typecheck); the enforcement is the preflight gate `webgpu-merged`, which
  fails any code batch while `dev` has commits not on `webgpu`. A conflict
  goes to a deliver agent to port the change into the TSL twin. The WebGPU
  volumetric features are judged against the reference pictures in
  `docs/research/rendering/volumetric-bars/` (README there).
- Never touches: the frozen world data, place layouts, gameplay tuning, the
  look (decision 0108 §6: quality defaults are never lowered to win frames).

## Bars

- **The frame is a triangle budget** ([0084](../../decisions/0084-the-frame-is-a-triangle-budget.md)):
  about 4 M triangles a frame counting every pass on the owner's Apple M2,
  60 fps.
- **Performance architecture** ([0108](../../decisions/0108-performance-architecture-fixture-light-field-ready-materials-view-gated-streaming-fading-tiers.md)):
  fixture lights through `FixtureLightField`, ready materials, view-gated
  streaming, fading tiers; measured by node harnesses over the real code
  (counts and ratios, § 8), never by full-studio probes on the VM.
- **Owner target: 60 fps at night in the rain in a place with lights** on
  the M2 (Riverwalk, Greenspring; walk 9 read 32–42 fps there).
- The owner's device gives the fps verdict (deployed studio, HUD).

## Acceptance (final read, c12m1, RTX 3070 pod, owner-accepted 2026-10-03)

Build 5438209e; capture `tooling/.reports/gpu-lane/c12m1/`; report
`tooling/.reports/perf10/c12-m1.md`. It is not a regression gate and is never
run routinely. Bars: settled >= 83 fps, 1 % low >= 69 (r = 1.38), scene
complete < 10 s. Eleven diagnosis rows are not judged and are left out. The
result column is the fps bars; the scene-complete column is read against the
10 s bar below.

| spot | settled fps | 1 % low | scene complete s | result |
|---|---|---|---|---|
| gswload | 236.2 | 135.3 | 17.835 | pass |
| rwwload | 214.6 | 148.3 | 15.907 | pass |
| a | 276.3 | 161.8 | 16.593 | pass |
| b | 239.6 | 157.3 | 17.413 | pass |
| b2 | 236.8 | 163.9 | 17.029 | pass |
| b3 | 237.0 | 156.9 | 18.514 | pass |
| c | 198.3 | 138.4 | 18.21 | pass |
| c2 | 196.5 | 127.7 | 16.724 | pass |
| c3 | 197.3 | 137.6 | 17.601 | pass |
| w | 151.6 | 110.5 | 17.276 | pass |
| d | 254.3 | 130.1 | 16.949 | pass |
| e | 251.6 | 151.6 | 16.242 | pass |
| e walk | 228.8 | 97.6 | - | pass |
| e2 | 258.0 | 178.7 | 16.097 | pass |
| e2 walk | 232.2 | 96.1 | - | pass |
| e3 | 260.8 | 181.7 | 16.494 | pass |
| e3 walk | 231.9 | 88.7 | - | pass |
| f | 238.4 | 113.0 | 15.767 | pass |
| g | 280.0 | 181.9 | 17.878 | pass |
| h | 212.7 | 152.5 | 17.388 | pass |
| a2 | 267.8 | 172.2 | 15.374 | pass |
| a3 | 269.2 | 127.3 | 15.495 | pass |
| f2 | 252.8 | 145.3 | 16.451 | pass |
| f3 | 249.5 | 170.7 | 16.367 | pass |
| gsw | 240.7 | 146.1 | 17.498 | pass |
| gsw walk | 161.9 | 60.6 | - | FAIL |
| rww | 214.6 | 136.4 | 16.311 | pass |
| rww walk | 201.8 | 91.7 | - | pass |
| camp22door | 188.4 | 121.0 | 16.987 | pass |
| camp12door | 151.7 | 82.1 | 16.784 | pass |
| camp22shed | 242.7 | 155.8 | 17.592 | pass |
| camp12shed | 198.7 | 138.7 | 16.75 | pass |
| camp12nw | 188.5 | 107.3 | 16.696 | pass |
| bog12se | 174.1 | 121.4 | 16.527 | pass |
| int-rosebone | 551.2 | 179.0 | 16.675 | pass (not ready at 150 s) |
| int-riverwalk | 524.5 | 303.7 | 15.644 | pass (not ready at 150 s) |
| int-jungle | 550.5 | 299.3 | 16.312 | pass |
| int-greenspring | 385.8 | 236.7 | 17.27 | pass |

37 of the 38 judged rows pass the fps bars (the report counts 49 of 50 over
all spots). The two interior rows that never reached ready in 150 s measured
fps on a not-ready scene.

- The failing row: `gsw walk` 1 % low 60.6 against 69 (settled 161.9). Cause:
  the first UBO bind per program (a synchronous round trip) and the per-draw
  wrapper; fixed in adef4d99, unmeasured since.
- Scene complete is 15-18 s on every cold row against the 10 s bar; the owner
  accepted it. The early program warm (454df8ba) landed after the read and is
  unmeasured.

Set and method:

- **Set** (`tooling/gpu-lane/spots/matrix.txt`, generated by
  `node tooling/gpu-lane/spots/gen-matrix.mjs` from `places.json`; choice in
  `tooling/.reports/16k/walk10/perf-matrix-choice.md`): Greenspring (most
  triangles and objects: 220,819 triangles, 149 objects), Claywater Station
  (most lights and fires: 13 lights, 19 flames), Riverwalk (most water
  within 150 m), each at t=12 and t=22, clear and rain; plus the ESE jungle
  marsh shallow-water walk (perf10 spot e, 20 s, three times).
- **Each spot static and under motion**: the settle, then a 20 s walk
  through the place with W held and two turns
  (`steps=w:7,yaw:+1.2,w:6,yaw:-2.0,w:7`).
- **Bars**: the player-felt `settledFps` >= 83 and `p1LowFps` >= 69 (r = 1.38;
  both from real rAF intervals), static and moving. The uncapped fields
  (`uncappedFps`, `p1LowUncapped`) are headroom only, never the bar.
- **Run**: `node tooling/gpu-lane/measure.mjs --run <name> --cdp 127.0.0.1:<port> --spots tooling/gpu-lane/spots/matrix.txt --trace --diag relink --bar 83,69`.

## Calibration (pod to M2)

r = pod fps / owner M2 fps at the same spot and build. Spot: Riverwalk night
rain, `?view=character&x=7.1971&z=0.584&t=22&w=rain`. Build: base3, the
pre-fix build the owner measured at 37 fps on the M2. Pod: RTX 3070, WebGL,
1280x720, DPR 1, uncapped, 51.1 fps. So **r = 1.38**.

- Bar: converted settled fps >= 60 means pod `settledFps` >= 83; converted
  1 % low >= 50 means pod `p1LowFps` (the player-felt 1 % low from real rAF
  intervals, `spots.mjs`) >= 69. Uncapped fields are headroom only.
- Kit: `tooling/gpu-lane/measure.mjs`. `--smoke` before any baseline;
  `--census`, `--trace` and `--diag` before the first fix batch; settled fps
  and 1 % low come from the same 10 s window after the ready gate.
- Cross-check: the WebGPU lane measured dev WebGL on its pod at the same spot
  at 54-60 fps on later dev builds, r 1.46-1.62 (it uses 1.5), 6-17 % above
  1.38 and inside the 20 % agreement bar. The gap is expected: its builds
  already carried some of the fixes (higher pod fps against the same 37 fps
  M2 figure, taken on base3), and its runs had the perf HUD and shared Chrome
  tabs.
- Recalibrate whenever the owner re-measures the M2 on a named build.

Walk-10 results converted with this r: [0108 § 7d](../../decisions/0108-performance-architecture-fixture-light-field-ready-materials-view-gated-streaming-fading-tiers.md).

## Open wins

| Win | Source | Note |
|---|---|---|
| Night rain with lights to 60 fps on the M2 | walk 9; 0108 § 7c | rain, ripple, foam and bloom are cleared (§ 7c); next: the owner's HUD at Riverwalk, night, rain, `?q=medium`: the `tris … / budget` line and the `scene` GPU ms. Scene ms near 2.6 × M triangles means triangle-bound (cut triangles: canopy shell, vertex hoists); far above it means fill-bound (the prepass row) |
| Vertex-stage hoists in foliage materials | fable5 audit row 17 | about -1.4 ms there |
| Depth prepass for alpha-tested foliage | fable5 audit row 18; 0108 § 7c | only on a fill-bound HUD reading: it doubles foliage triangles at ~2.6 ms per million on the M2 |
| CDLOD vertex morph on terrain | fable5 audit row 19 | replaces skirts-only seams |
| Far-forest canopy shell | fable5 audit row 20 | one draw for far forest |
| Uniform groups on static meshes | fable5 audit row 16 | `matrixAutoUpdate=false` is done for settlements (0108 § 7a) |
| Baked vertex ambient occlusion in the kit build, ground blob under buildings | packet 9 extras | the phone answer for crease shading |
| Foliage `alphaToCoverage` | 0108 § 7b | needs MSAA on the scene target |
| Vegetation program warm | c14-fwarm; 0108 § 7f | the 6 baked vegetation rows are not consumed: flora and impostor materials come from `buildFloraKit`, so a warm needs that factory; closes part of the 15-18 s scene-complete gap |
| Shadow-depth program warm | c14-fwarm; 0108 § 7f | `gl.compile` does not compile the shadow pass; read `programsLinkedAfterWarm` and its keys in the next pod round, then warm the depth twins through the shadow map |
| Env-map and vertex-alpha kit rebuild | c14-fenv | dark ore and kiln materials need specular, decals and rock skirts need their vertex-alpha fade; patch `tooling/.reports/perf10/c14-fenv.patch` (`git apply`; steps in `c14-fenv.md`), then rebuild and publish the kits; adds one program variant per class |
| Water owner-mask and flowing-switch seams | perf-diag23b A3; c14-fwater | the nearest-texel owner mask (`waterMaterial.ts` ~632-646) needs a bilinear owner weight at tile borders; the flowing branch (~1212) becomes a smoothstep on speed |
| ETC1S for opaque architecture | Phase 14 texture budgets; [compression research](../../research/rendering/gpu-texture-and-mesh-compression.md) | measured 4/5, ~30 % smaller; an owner call |

## How an item is picked

1. Measure first: a node harness count or the owner's HUD line names the
   cost the item removes.
2. Take the item with the largest measured saving per agent-hour; a win the
   owner's walk named comes first.
3. Prove it on the harness, ship it, and the owner's next walk gives the
   fps verdict; delete its row here when shipped and list it under Done.

Load under 10 s ([0120](../../decisions/0120-kits-stream-per-piece-spawn-ring-first.md)):
fetch kits per piece, spawn ring first, in `SettlementLayer.tsx` and the kit
loader; the webgpu branch bakes the shader signature list.

## Done (awaiting the owner's fps verdict)

- Walk 9: terrain splat samples −48 % per near fragment (0108 § 7c).

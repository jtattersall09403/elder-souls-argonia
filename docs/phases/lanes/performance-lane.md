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
  goes to a deliver agent to port the change into the TSL twin.
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

## Calibration

| r | Pod GPU | Pod fps | M2 fps | Spot | Build | Date |
|---|---|---|---|---|---|---|
| 1.38 | RTX 3070 | 51.1 | 37 | Riverwalk night rain `?view=character&x=7.1971&z=0.584&t=22&w=rain` | 68e7ab76 (pre-fix dev; see `tooling/.reports/16k/walk10/perf-lead.md`) | 2026-10-02 |

Re-measured only when the GPU type or the reference build changes; every lane converts pod fps to M2 fps with the row's r.

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
| ETC1S for opaque architecture | Phase 14 texture budgets; [compression research](../../research/rendering/gpu-texture-and-mesh-compression.md) | measured 4/5, ~30 % smaller; an owner call |

## How an item is picked

1. Measure first: a node harness count or the owner's HUD line names the
   cost the item removes.
2. Take the item with the largest measured saving per agent-hour; a win the
   owner's walk named comes first.
3. Prove it on the harness, ship it, and the owner's next walk gives the
   fps verdict; delete its row here when shipped and list it under Done.

## Done (awaiting the owner's fps verdict)

- Walk 9: terrain splat samples −48 % per near fragment (0108 § 7c).

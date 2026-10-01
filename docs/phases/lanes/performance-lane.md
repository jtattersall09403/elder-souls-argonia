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

## Open wins

| Win | Source | Note |
|---|---|---|
| Night rain with lights to 60 fps on the M2 | walk 9; 0108 § 7a | first item: measure which pass the lit night frame pays for |
| Vertex-stage hoists in foliage materials | fable5 audit row 17 | about -1.4 ms there |
| Depth prepass for alpha-tested foliage | fable5 audit row 18 | gated on an M2 measurement |
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
   fps verdict; delete its row here when shipped.

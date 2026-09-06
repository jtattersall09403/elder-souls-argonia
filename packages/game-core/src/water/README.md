# Water runtime map

The gameplay boundary is `WorldWaterQuery` in `@elder-souls/contracts`. Positions, depth, velocity and heights are true metres; studio vertical exaggeration belongs at its adapters. Time passed to the query is the world epoch, while visual wave/particle stepping uses elapsed real time.

| Concern | Entry point |
| --- | --- |
| Decoded hydrology, grid origins, supported domains and body identity | `waterData.ts` |
| Exact CPU/rendered channel triangles | `channelRibbons.ts` |
| Terrain-aware gameplay samples, tides, seasons and event queue | `waterWorld.ts` |
| Shared CPU/GLSL wave spectrum | `waves.ts` |
| Displacement, current-relative drag and angular motion | `buoyancy.ts` |
| Entry/exit and distance-spaced moving-body interactions | `contactEmitter.ts` |
| Bounded nearby terrain-obstacle spray/foam sources | `flowContacts.ts` |
| Validated browser assets and resource disposal | `render/loadWaterAssets.ts` |
| Ocean grid, body-isolated inland tiles and channel geometry | `render/WaterSurface.tsx`, `render/InlandWaterTiles.ts` |
| Shared opaque capture and underwater composition | `render/WaterPipeline.tsx` |
| Material, receiving-terrain wetness and caustics | `render/waterMaterial.ts`, `render/groundWetness.ts`, `render/caustics.ts` |
| Bounded local ripples and spray/foam | `render/RippleSim.ts`, `render/WaterEffects.ts` |

Inject `WaterRuntime` from `render/types.ts`; do not import a studio singleton. Use the surface handle's complete `meshes` collection when switching capture/underwater visibility. Call resource disposers on unmount. A consumer that applies caustics in its opaque terrain pass must set `causticsInOpaque` to prevent the refracted/composite fallback applying them twice.

New floating objects supply actual displaced volume, sample positions, mass and optional drag coefficients. Sample forces on physics ticks, including angular velocity at each sample, and apply them through the host physics engine. `forceScale` is an explicit unit adapter for controllers with artificial mass, not a density adjustment. Dense objects sink naturally; shallow bottoms limit displaced volume. See `buoyancy.test.ts` and the studio crate fixture.

Feed world-space contact velocity into interaction events; renderers subtract current once. `WaterContactEmitter` handles ordinary moving bodies. Projectiles, hulls or other impacts can emit their own radius and magnitude. The current renderer drains the bounded event queue once; future audio consumers should subscribe through a shared fan-out, not drain the same queue independently. Swimming controls, boat steering and sound content are separate consumers, not implemented by this package.

See [quality and regression contract](../../../../docs/research/rendering/water-quality.md) and [decision 0045](../../../../docs/decisions/0045-reversible-water-overhaul.md).

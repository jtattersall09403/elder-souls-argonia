# Water runtime map

The gameplay boundary is `WorldWaterQuery` in `@elder-souls/contracts`. Positions, depth, velocity and heights are true metres; studio vertical exaggeration belongs at its adapters. Time passed to the query is the world epoch, while visual wave/particle stepping uses elapsed real time.

| Concern | Entry point |
| --- | --- |
| Decoded hydrology, grid origins, supported domains and body identity | `waterData.ts` |
| Derived physical body records, field references and surface authority | `waterBodies.ts` |
| Exact CPU/rendered channel triangles | `channelRibbons.ts` |
| Compact native-bank sidecar and bounded decoded station cache | `packedCrossSections.ts` |
| Depth/roughness resistance, upstream momentum and falling-jet current | `channelCurrent.ts` |
| Metre/second-correct shared foam/detail coordinates | `flowAdvection.ts` |
| Terrain-aware gameplay samples, tides, seasons and event queue | `waterWorld.ts` |
| Shared CPU/GLSL wave spectrum | `waves.ts` |
| Displacement, current-relative drag and angular motion | `buoyancy.ts` |
| Fixed-step dynamic-body integration and explicit SI mass conversion | `rigidBody.ts`, `../physics/massUnits.ts` |
| Entry/exit and distance-spaced moving-body interactions | `contactEmitter.ts` |
| Independent bounded render/audio/gameplay event readers | `interactionStream.ts` |
| Conservative bounded local pool waves and immersed volume | `LocalWaterPatch.ts`, `displacementRegistry.ts` |
| Bounded nearby terrain-obstacle spray/foam sources | `flowContacts.ts` |
| Validated browser assets and resource disposal | `render/loadWaterAssets.ts` |
| Ocean grid, body-isolated inland tiles and channel geometry | `render/WaterSurface.tsx`, `render/InlandWaterTiles.ts` |
| Shared opaque capture and underwater composition | `render/WaterPipeline.tsx` |
| Material, receiving-terrain wetness and caustics | `render/waterMaterial.ts`, `render/groundWetness.ts`, `render/caustics.ts` |
| Bounded local ripples and spray/foam | `render/RippleSim.ts`, `render/WaterEffects.ts` |

Inject `WaterRuntime` from `render/types.ts`; do not import a studio singleton. Use the surface handle's complete `meshes` collection when switching capture/underwater visibility. Call resource disposers on unmount. A consumer that applies caustics in its opaque terrain pass must set `causticsInOpaque` to prevent the refracted/composite fallback applying them twice.

Compiled body records summarize actual hydraulic owners: stable identity,
basin membership, conservative potential-stage bounds, semantic class set,
river bands and field references. `data.waterBodyRecord(sample.waterBodyId)`
resolves these records; legacy identity-only bundles return null. Only
constant-head owners without channel ribbons declare a standing plane;
longitudinal rivers retain their reach references. Current wetness, depth,
chemistry, flow and tide/season response still come from the shared query,
not the bounding rectangle or a body-wide average. Unknown discharge,
navigability, ecology and authored place links are not fabricated. The
`province-semantic-v2` profile names the existing field-driven renderer, not
a different material per body.

Expanded channel cross-sections carry actual lateral ground and the upstream access barrier at each signed offset. The sampler lazily retains at most 256 records and 16,384 triangles. Streaming renderers use `sampler.meshDataFor(records)`, so current retains the whole graph's upstream momentum across mesh boundaries. Base-stage connected cross-sections supply hydraulic radius; resistance approaches Manning flow on gradual beds and transitions to gravitational jet acceleration on steep falls, with an explicit 12 m/s safety bound. Legacy records retain the prior current model. All foam/detail scales must advect through `flowAdvectionGlsl()` with full world-space velocity, including vertical fall speed; changing texture frequency must not change physical feature speed.

New floating objects supply actual displaced volume, sample positions, mass and optional drag coefficients. `WaterRigidBodyDriver` applies point impulses before each fixed physics step and emits surface contacts from the rotated collision envelope. Pass the same `PhysicsMassUnits` to the driver and collider mass/density conversion; SI is the default. The studio uses 0.01 mass units/kg to preserve calibrated player/prop collisions. `forceScale` remains the lower-level unit adapter, never a density or displaced-volume adjustment. Dense objects sink naturally; shallow bottoms limit displaced volume. Hull displacement uses equal-volume sampled columns, not an exact clipped hull. See `rigidBody.test.ts`, `buoyancy.test.ts` and the studio crate fixture.

Feed world-space contact velocity into interaction events; renderers subtract current once. `WaterContactEmitter` tracks entry, complete submersion, resurfacing, exit and distance-spaced wakes; call `reset` on known teleports or pooled-object reuse. Projectiles or other impacts can emit their own radius and magnitude. The renderer retains its legacy drain; audio/gameplay call `world.subscribeInteractions()`, drain their own reader and dispose it on teardown. Readers share a 256-event ring, with at most 16 subscribers; lag drops oldest events and reports `droppedEvents`. No reader steals another's events. Swimming controls, boat steering and sound content are separate consumers, not implemented by this package.

Authored `fallingToNext` intervals are finite falling sheets, never filled water columns. Free-surface queries exclude them and retain any real underlying standing/nonfalling water. `sampleSheetContact(position, radius, epoch)` separately tests the closest point on the actual stage-shifted triangle (radius ≤4 m), with real sheet current and no buoyancy/immersion. Player and rigid-body contact emitters use three bounded capsule-axis probes and at most one spray event per 120 ms; sheet metadata bypasses volume-only effect gates but never creates horizontal crowns/foam on the curtain. `waterVelocity` is an explicit current override, not a redefinition of actor world velocity. No air column below a lip becomes swimmable or triggers underwater fog.

Native coverage uses support R128 only as a non-rendered hydraulic proxy: neither CPU nor raster geometry may revive it outside a real channel ribbon. Optional `surface.accessFile` encodes RG16 minimum access stage and B fine tidal response. Access, tide and fine shore.G season use a normalized four-tap stencil restricted to the nearest support.GB owner (same-owner dry fringe remains included). Optical salinity is independent. Authored channel `tideResponse`/`seasonResponse` override raster coefficients and stay constant laterally; `levelResponses` mesh triples carry tide, season and a valid flag. Missing coefficients retain legacy fallback. `ownershipFootprintsInBounds` returns only outer envelopes for inland subtraction, without expanding the detailed physics cache; never use those envelope triangles to query actual bed/access.

The local pool solver is world-anchored and body-owned, at most 128² cells. Harmonic-depth face fluxes conserve column volume; dry/foreign-owner barriers carry no flux. Impacts are zero-volume energy-normalized height kernels, separate from moving excluded-volume spheres. Its RGBA fields and CPU sample share Float32 interpolation; any display-edge envelope is separate from the conservative fields. Existing occupancy is quietly seeded when selecting a patch, so `volumeOffsetM3 = displacedVolumeM3 - baselineDisplacedVolumeM3` for a fresh closed domain, without inventing a startup impact. Sphere/bed intersections use bounded quadrature, not an exact mesh Boolean intersection.

The pool's published fields are explicitly a bounded additive **presentation**, not a wetting/drying solver: a smooth `tanh` limit keeps each cell within 45% of rest depth, and a C1 distance-to-real-shore envelope fades disturbances to zero before dry or foreign-owner mask boundaries, including diagonal islands. Slopes are recomputed from that displayed height and attenuated energy produces bounded local foam. Raw flux/height volume remains unchanged; `displayedVolumeOffsetM3` reports the separate published cell-volume equivalent (before the rectangular patch envelope). Do not claim that displayed volume is conserved or that the local patch simulates runup, overflow, or a displaced body's global water-level rise. Existing coastal runup remains a separate model. Exact terrain clipping is still required between sample cells.

`WorldWaterQuery.setDisplacementSpheres(actorId, proxies|null)` registers persistent world-metre occupied volume. Registry budgets: 64 actors, 128 proxies total, 8 per actor; active solver slots are bounded separately (default 16, maximum 32). Already admitted eligible actors remain stable; remaining complete actors enter by distance. Rejected sets report diagnostics and release stale prior occupancy. Drivers derive equal-volume spheres from authored buoyancy volume, disable duplicate contact-emitter displacement, and batch changed probes into one field publication. Player emitters use capsule-volume proxies. Always `dispose()`/`reset()` producers on teardown/teleport; quiet registry replay is not an interaction event. The studio converts live capsule dimensions and volume out of vertical exaggeration without changing colliders or gameplay mass.

Terrain bed and diagonal repairs are independently reversible overlays; see [terrain runtime](../terrain/README.md). They must load before exposing terrain to rendering, queries or colliders.

Packed banks use `meta.crossSections` schema 1 (`float32-le-offset-ground-access`, sample count and optional SHA-256), with each point carrying `crossSectionStart`/`crossSectionCount`. The loader checks content, contiguous ranges and every ground/access sample before attaching non-enumerable lazy getters. One shared packed buffer replaces the giant sample-object JSON; decoded station residency is capped at 256 stations and 16,384 samples. Cheap min/max-offset properties support spatial indexing without decoding profiles. JSON logging must never expand lazy geometry.

Optional `meta.nativeGround` binds a compressed sparse native-PNG terrain authority to the native manifest, bed-overlay and diagonal-topology hashes. Exact declared download/inflated lengths and SHA-256 are verified before publishing any water assets; inflation is bounded to 128 MiB. CPU queries sample this exact field while retaining the original Float32 authored water plane. Atlas-backed renderers request `meshDataFor(records, { refineGround: false })` and sample the same bed per fragment, avoiding millions of redundant terrain-aligned water triangles. Exact refinement remains available for diagnostics and localized fallback providers; its point-query cache is bounded to 256 native-cell entries and 2,048 child faces, not whole refined river records. Metadata that declares an authority cannot silently load without it. Ownership-subtraction envelopes remain unrefined because the plan-view domain is unchanged.

With native ground present, ground-only lateral breakpoints are redundant: retain the centre/endpoints and access profile to within Float32 roundoff, while leaving the full original bed profile available to the hydraulic solver. The loader injects the actual authored tide-plus-season amplitude bound. Only faces whose affine access barrier is wholly above that bound may be removed before terrain refinement; native children wholly above the maximum still surface plus a 4 mm numerical guard are permanently dry (native waves cannot create positive depth from a dry bed). Missing bounds never assume the province's amplitudes. Ownership envelopes are not culled.

Descending strips have a geometric lateral-spread guard: each bank can expand beyond the incident potential-stage lip by at most `max(0, run - drop)` metres. Grade-one and steeper curtains retain their incident ray footprint regardless of total drop, so a broad low plunge pool cannot be lofted into an elevated fan. This is not a lateral-pressure simulation. Flat pool geometry remains independently owned; final native-ground/domain coverage audits are mandatory to detect underfill or terrain-crease mismatches.

See [quality and regression contract](../../../../docs/research/rendering/water-quality.md) and [decision 0045](../../../../docs/decisions/0045-reversible-water-overhaul.md).

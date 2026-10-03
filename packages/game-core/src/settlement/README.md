# Settlement rendering

`SettlementLayer` is the reusable renderer for compiler-placed architecture,
outdoor dressing and route structures. The Studio mounts it; no world data or
weather state is owned by the app layer.

Runtime input is `province/settlements.json`, produced atomically by
`python3 -m worldgen.export_settlement_bundle --copy-assets`. The exporter
refuses any settlement with compile errors or a mismatched
`sourceBlueprintSha256`, validates and stages every referenced measured kit
manifest/GLB, and publishes the JSON marker last. Route output filenames,
authored structures and their contiguous placement chainage are exact-set
checked too.
That hash is SHA-256 over the blueprint object encoded as canonical JSON
(`sort_keys=True`, compact separators, UTF-8/no ASCII escaping), so it survives
checkout/formatting timestamps but changes with any authored value.

Load-bearing contracts:

- semantic asset identity comes from glTF `extras.assetId`, never node names;
- every settlement and route-structure asset steps down an explicit LOD
  ladder (`settlementLadder`), built by the same `lodLadder` helper the
  vegetation cell build uses (0075): one kit level per rung, hard steps, no
  crossfade, and `card: none` for kit pieces in 16h (wind stiffness 0). The
  last mesh rung runs out to the draw cap, which covers the loaded ring, so
  nothing vanishes inside it — the 0073 one-copy-per-pixel walk runs over
  every ladder the shipped bundle builds. Before 16h this was a two-band
  `architectureLod` (`d0`/`d1` thresholds, level 2 beyond) with no ladder and
  no vanish check; `architectureLod` survives only as a thin read off the
  ladder. Every placed part is baked into one merged geometry per draw batch
  (material instance, vertex layout, cell, draw flags: `drawBatchKey`), one
  plain mesh with its shadow-depth twin per batch, cached by its copies'
  signature. Kit materials equal in every shaded field and image share one
  instance per layer (`materialIdentity.ts`; flame cards, lantern shells,
  transparent, additive and still-water materials keep their own), so pieces
  of different assets and kits merge (Greenspring LOD0: 267 instanced buckets
  to 146 draws, `greenspringDraws.test.ts`). Loaded colour
  texture dimensions—not a Boolean manifest claim—must fit the atlas cap;
- every ground-class reference re-grounds from streamed terrain and sinks by
  its own asset's **designed sink** (`designedSinkM.p50` on the published kit
  manifest, positive = pivot below the ground line, scaled by the placement).
  There is no per-class bury table and no stilt exemption: a manifest without
  a designed sink is a named error, not a fallback. Buildings sample every
  footprint vertex and take the MEAN of the samples for every fit; route and
  dressing pieces sample their origin, and route structures are audited like
  everything else. The measured ground line, applied burial and residual gap
  are retained per placement and rolled up per settlement in `onStats`;
- a placement with `yFinal: true` (bundle schema 4, 16k walk 2) keeps its
  `positionM[1]` verbatim: the workbench measured it on the same padded
  ground the runtime streams, and the compile wrote it unchanged. The terrain
  numbers are still audited; nothing re-anchors it. A schema-3 bundle reads
  as "no placement is final";
- a piece that does not stand on the ground is never sampled against it: a
  `wall`/`hanging`/`deck` child is positioned from its parent placement's
  FINAL transform times `mountOffsetM` (parent's local frame) and its own
  rotation — a missing parent, a mount cycle or a missing offset is a named
  error — and a `water` child sits at `waterLevelM - designedWaterlineM`;
- a modular-run piece (bundle schema 3 `run` {id, index, riseM}) is seated
  with its whole run as one rigid chain (`anchorRun`): the member with the
  highest mean ground is the datum, every other member sits at the datum's
  pivot plus its mined rise difference, so no joint steps with the terrain.
  `runJointErrors` (> 5 mm off the mined rise) is reported as
  `finalTransformEvidence.runJointFailures` and must stay empty;
- one rotation authority (`placementQuaternion`): the compile rotates with
  `wx = cx + x·cosθ − z·sinθ`, which three.js reaches by rotating about +Y by
  **−yawDeg**; `pitchDeg` (16e spans) follows as YXZ Euler. The draw, the
  collider and the tests all read that one matrix;
- settlement collision accepts only `settlement-pivot-yup-v1`. A `mesh` or
  `convex` placement collides as its own LOD0 triangles, one Rapier trimesh
  per primitive through `floraSolids.trimeshFromGeometry` (0071 §5), so a gate
  arch keeps its road open; geometry that is not loaded or has no index is a
  named error, never a box. Only measured manifest proxy boxes stay boxes. While the focus is inside an authored settlement
  boundary, every building collider in that settlement stays resident by
  stable id, including across focus-ring and terrain-chunk edges. Only the
  remaining explicit proxy-part budget is spent on the moving outside ring;
  its genuinely covered radius and every omitted placement id are reported.
  If resident buildings alone exceed the hard budget, the layer fails visibly
  instead of publishing a partial solid settlement. The app consumes the
  stable set with an imperative fixed-body diff;
- a placement of kind `effect`, assetId `fx:smoke-column` (anchor class `fx`)
  draws no kit mesh and loads no GLB: it must be a mounted child
  (`parentPlacementId` + `mountOffsetM` at the chimney top), and
  `smokeColumn.ts` draws every such column as one camera-facing quad buffer
  (16/12/8 puffs on 40/90/150 m rungs, alpha ramp over the last 30 m, off
  beyond 150 m) with the vanilla puff atlas its kit manifest's
  `effectTextures` row names, drifting on the injected environment's wind
  (`windDirXZ`/`windSpeedMS`, else `SMOKE_CALM_WIND`) and the frame clock;
- smoke columns and billboard flames draw on `PRECIP_LAYER`, after the water
  surface (like rain), so water never paints over them; the layer enables
  that layer on the scene camera;
- light fixtures (`lighting.ts`, walk 2 D7): every "light" layer piece (the
  compile's assembly layer, carried by the export), every piece whose kit
  manifest carries a mined LIGH record, every fire socket not sitting on one,
  and every window-glow facing of an architecture piece (one light 0.5 m
  inside the wall, 4 m). A fixture's radius and colour are its LIGH record's,
  else 6 m and warm (255,190,120). Its flame is the kit's own additive flame
  material (lit in the emissive stage × the lamp clock) or a billboard of
  vanilla's candle flame (works-v1 `effectTextures` `fx:flame-billboard`). A
  fixture's light is NOT a three light: the nearest 100 burning fixtures
  within 200 m (`LIGHTS_CAP`, `LIGHTS_ACTIVE_M`, faded over the last 20 m)
  go into the scene's `FixtureLightField` (render/fixtureLights), re-chosen
  once a second, and each drawn object is lit by its 8 nearest (one program
  for any count); the rest glow only. The manager is the layer's own or
  injected (`lightFixtures` prop). Batches are split per 48 m square
  (`SETTLEMENT_CHUNK_M`), so off-screen parts are culled and each batch's
  bounds pick its own lamps, and per kit level and ladder class
  (`settlementBatchCell`, `quantizedLadder`): the key never reads the camera,
  every level is merged once and linked (`compileAsync`, all batches visible)
  before the first swap, and walking only flips visibility
  (`applyBatchVisibility`, chunk-centre distance) with no merge or compile
  (F40; every level costs 2.08x the one-level merge at Greenspring);
- a failed bundle, manifest, schema, collision-frame or geometry load fails
  the layer closed: nothing of it is drawn, `console.error` names the cause
  and the injected `onError` hands the host `{fatal: true, message}` (the
  studio shows "SETTLEMENT LAYER FAILED: …" in red atop the HUD). A flame or
  smoke sprite that fails to load is NOT a refusal: the places draw without
  it and `onError` reports `{fatal: false}`. `publishedLoad.test.ts` runs the
  file-decidable refusals over every published bundle (preflight gate
  `bundle-load`); decision 0052 addendum 2026-09-28;
- materials carry aerial, rain wetness and all-tier window emission state in
  `userData`; `WorldSky` reapplies the hook after CSM. Rain height is measured
  from each instance's streamed ground line, and the same call creates an
  alpha/displacement-matched `customDepthMaterial` for its shadow, one per
  colour material for the layer's life. A glow material is one with an
  emissive map (the NIF's Glow_Map slot, carried by the kit build); it is lit
  in the emissive stage as mask × warm colour × the lamp clock
  (`lighting.ts` `artificialLightFactor`: 1 from 17:30 to 06:30, 0 from 06:50
  to 17:10, linear between, read from `environment().epochMinutes`). A decal material (glTF material extras
  `decal: true`, from the NIF DECAL/DYNAMIC_DECAL shader flags) gets polygon
  offset -1/-1 and no depth write, draws at renderOrder 1 after its opaque
  parent and casts no shadow (`applySettlementDecal`,
  `settlementMeshDrawFlags`);
- a rebuild (every ≤ 40 m of focus movement, a 2 s retry while terrain is
  missing, a kit or manifest arriving) is built detached and swapped in one
  synchronous step; the build effect's cleanup only cancels, and the live
  group is disposed only when the world goes (unmount, new bundle, fatal). A
  retry that resolves exactly what is live is not swapped. Nothing is drawn
  at a building's foot (16h check-in 2 ruling 1: skirt and rubble ring cut);
- ground treatments are the grass exclusion input only
  (`treatmentClearancePolygons`): a `floor` clears its footprint, a `deck`
  (stilt deck > 0.8 m over the ground) only its `contactsM`, and both their
  1.5 m door `apronsM`;
- a place's ground travels as overlays on its `settlement` row (decision
  0102 decision 1; the frozen terrain is never repainted or re-levelled for a
  place). Three ground kinds, each with its own `schemaVersion`, refused when
  unknown, and the still water of its pools:
  - `groundOverlays` (1): the levelled pads (`terrain/heightOverlays.ts`),
    applied to every height read of the chunk store. An overlay's `kind` is
    `run` (a modular run's pad), `building` (a declared pad; with no `kind`,
    bundles before r7, a building pad is the one with `hardM` 0) or `pool`
    (a layout `pool` op's basin, since schema 5: a 24-vertex circle at the
    ground under its centre minus `depthM`, `hardM` 0, `blendM` its `rimM`,
    applied with the run pads). Run and pool pads apply first in id order,
    then building pads, and run and pool pads yield inside building pads;
  - `pools` (bundle schema 5, 16k walk 4): each `pool` op's still water,
    `{id: pool.<placeId>.<uid>, centreM, radiusM, levelM (ground at the
    centre - 0.08), bedM (the basin's datum)}`. `SettlementLayer` registers
    a place's pools with the injected `localSurfaces`
    (`water/localSurfaces.ts`) on load and clears them when the place leaves
    the loaded set or the layer unmounts (`pools.ts`); pools on a bundle
    under schema 5 are refused, per place bundle (`assertPoolsSchema`);
  - `vegetationClearance` (2, since 16k walk 4): the clearance by tier.
    `hardClear` + `thinned` (+ `fringeFalloffM`) is where trees and large
    plants go: footprints (buildings grown 1.5 m, other pieces 0.5 m), ways
    grown 0.5 m, pads, floors and aprons, and a 10 m thinned ring graded over
    10 m; the vegetation cells filter on it (`makeClearanceFilter`).
    `groundClear` (+ `groundEdgeJitterM`) is where ground cover dies: ways,
    pads, floors and aprons only, grown 0.25 m with a 0-0.5 m wobble; the
    groundcover ring indexes it (`groundTierOf`). A version-1 row (one tier
    for everything) is refused. The blueprint's authored `hardClear` is not
    carried: it was a hull round the whole place;
  - `groundPaint` (1): every blueprint way (the layout's path ops) as
    `{id, routeId, kind, texture, edgeM, polygonM}`, the polyline buffered to
    its width plus half the soft edge and cut under pads and floors except
    inside a door's apron. `texture` is a ground-material name from
    `world/sources/vocab/ground-paint.json` (road `bc_road`, track
    `track_mud`, footpath `dirt_path`: the land cover's road paint); stairs
    and ramps paint nothing. `GroundPaintLayer` drapes each as a 0.5 m grid
    strip 3 cm over `groundAt` with a polygon offset and alpha rising over
    `edgeM`, one mesh per texture with the ground set's own albedo and normal
    files. Cost at load: 18-20 ms per place (Claywater 13 strips, 5,656
    triangles; Greenspring 17 strips, 6,932), measured in Node on the VM.
  The ground sidecar `province/settlements/ground-overlays.json` carries
  `groundOverlays` and `vegetationClearance` for the studio's terrain and
  vegetation; `groundPaint` rides only in the place bundle.

Browser acceptance may read the immutable `globalThis.__STUDIO_SETTLEMENT_DEBUG__`
snapshot. It reports `loading`/`loaded`/`failed`, bundle and rendered placement
counts, draw/triangle counts, final-transform evidence, the per-settlement
grounding audit and the complete collision residency/budget result; it exposes
no controls or mutable renderer objects. Its `frames` block is the one live
part: per-frame counters (`blankFrames` must stay 0) read by
`apps/world-studio/scripts/probe-settlement-flash.mjs`.

The authored/compiled boundary stays explicit: navmesh cuts, paired door
arrival markers and variants are bundle data for later gameplay systems; this
renderer does not invent any of them.

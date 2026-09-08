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
- one function selects full/LOD1/LOD2 and buckets `(asset, LOD, part)` across
  settlements and route chunks; far transforms are baked into actual merged
  geometry per material, while nearer repeats remain instanced. Loaded colour
  texture dimensions—not a Boolean manifest claim—must fit the atlas cap;
- every reference re-grounds from streamed terrain. Buildings sample every
  footprint vertex; route/dressing pieces sample their origin. The measured
  ground line, requested/applied burial, class-cap excess and residual gap are
  retained per placement and rolled up per settlement in `onStats`;
- settlement collision accepts only `settlement-pivot-yup-v1`, prefers
  measured manifest boxes where present, and otherwise derives visible-part
  boxes from loaded geometry. A moving ring spends an explicit proxy-part
  budget, reports its genuinely covered radius, and drives rebuild distance
  from that radius. The app consumes it with an imperative fixed-body diff;
- a failed bundle or kit load produces a conspicuous magenta failure sentinel;
  it cannot silently degrade into a settlement-free landscape;
- materials carry aerial, rain wetness and all-tier window emission state in
  `userData`; `WorldSky` reapplies the hook after CSM. Rain height is measured
  from each instance's streamed ground line, and the same call creates an
  alpha/displacement-matched `customDepthMaterial` for its shadow;
- footprint ground treatments are also the single grass exclusion input.

Browser acceptance may read the immutable `globalThis.__STUDIO_SETTLEMENT_DEBUG__`
snapshot. It reports `loading`/`loaded`/`failed`, bundle and rendered placement
counts, draw/triangle counts and the per-settlement grounding audit; it exposes
no controls or mutable renderer objects.

The authored/compiled boundary stays explicit: navmesh cuts, paired door
arrival markers and variants are bundle data for later gameplay systems; this
renderer does not invent any of them.

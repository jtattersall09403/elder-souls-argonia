# Settlement rendering

`SettlementLayer` is the reusable renderer for compiler-placed architecture,
outdoor dressing and route structures. The Studio mounts it; no world data or
weather state is owned by the app layer.

Runtime input is `province/settlements.json`, produced atomically by
`python3 -m worldgen.export_settlement_bundle --copy-assets`. The exporter
refuses any settlement with compile errors or a mismatched
`sourceBlueprintSha256`, then copies only referenced measured kit manifests/GLBs.
That hash is SHA-256 over the blueprint object encoded as canonical JSON
(`sort_keys=True`, compact separators, UTF-8/no ASCII escaping), so it survives
checkout/formatting timestamps but changes with any authored value.

Load-bearing contracts:

- semantic asset identity comes from glTF `extras.assetId`, never node names;
- one function selects full/LOD1/LOD2 and buckets `(asset, LOD, part)` across
  settlements and route chunks; the far tier remains one merged instanced draw;
- every reference re-grounds from streamed terrain. Buildings sample every
  footprint vertex; route/dressing pieces sample their origin;
- settlement collision accepts only `settlement-pivot-yup-v1`, publishes
  visible-part boxes, and trims their buried slice. The app consumes them with
  an imperative fixed-body diff;
- materials carry aerial, rain wetness and all-tier window emission state in
  `userData`; `WorldSky` reapplies the hook after CSM;
- footprint ground treatments are also the single grass exclusion input.

The authored/compiled boundary stays explicit: navmesh cuts, paired door
arrival markers and variants are bundle data for later gameplay systems; this
renderer does not invent any of them.

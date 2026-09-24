# Kit interiors library

One `<kit>.interiors.json` per built kit: for every asset in that kit, whether
it has an interior (matched / tileset / shell / none) and where its doorway
sits in the asset's own local frame.

Written by `tooling/asset-pipeline/pipeline/interiors_index.py`
(`write_kit`), which mines it from the built kit in
`tooling/asset-pipeline/output/kits/` and writes the same data to both
locations on every real build (a `--kits-dir` scratch build writes only its
own directory, never this one). This copy is the tracked record: it ships in
the repo so CI and a local checkout validate doors against the same data,
even before anyone rebuilds the kits locally.

Read by `tooling/world-generation/worldgen/blueprint.py` (door-facing
validation) and `worldgen/blueprint_interiors.py` (the shared library),
which merge the two locations PER KIT — this tracked copy wins for a kit
present in both, and a kit rebuilt locally but not yet re-committed is still
found here via the local fallback. A kit missing from both raises a
validation item instead of silently skipping its door checks.

`entrance.sideDeg` means one of two things, depending on the kind. For a
measured opening (`opening`, `open-front`, `leaf`, `door-piece`) it is the
bearing of `offsetM` from the plan centre (`planCentreM`), and
`test_interiors_index` holds the two within 30°. For `esp-door` and
`assembly` it is the facing of the door reference the mod's authors placed,
copied from their placement. That facing need not point away from the plan
centre: a kiosk's load door stands 0.29 m from the pivot, so a bearing from
the centre carries no information. Those two kinds are left out of the
bearing test.

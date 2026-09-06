# Final compiled confluence coverage gate

This is a bounded **artifact gate**, not a substitute for the compiler's
whole-graph constraints or the final visual review. The opt-in
`waterConfluenceCompiled.test.ts` uses production ribbon meshes, production
inland tile generation/subtraction, the exact native bed, and `WaterWorld`
still-boundary queries. No browser or province-wide geometry is created.

## Prerequisites

- One final water directory, never a mixture of checkpoint exports: metadata,
  packed cross-sections, surface/support/access/shore/flow/class/character PNGs,
  bed overlay, terrain topology, and the matching native-ground gzip.
- Metadata must contain the final `nativeGround` descriptor and packed-profile
  SHA-256. The gate checks these hashes, decoded/download sizes, and that the
  native-ground descriptor matches the exact overlay/topology JSON bytes.
- The **unchanged** production flood-state file supplies the tidal and seasonal
  amplitudes; they are not constants hidden in the test.
- Python with Pillow and NumPy (the existing world-generation environment).
  `WATER_AUDIT_PYTHON` can select its executable for the Vitest PNG decoder.
- The compiler's exported point `boundaryKinds` and packed section ranges are
  required by the edge-probe extractor. Regenerate its owner-edge JSON with
  `--all-owner-edges` for the same final directory. The versioned probe file
  includes the metadata SHA-256; the gate rejects old base-only or stale files.

The old `/tmp/water-stable-final` bundle predates final shared junction profiles
and hydraulic depths, and lacks the final attached native-ground descriptor.
It is **not** acceptance evidence. An NPZ graph/head checkpoint alone is also
insufficient: actual exported profiles and their raster handoff are required.

## Commands

From the repository root, replace `/absolute/final-water` and the Python path
with the final staged bundle and existing compiler environment:

```bash
PYTHONPATH=tooling/world-generation python3 -m worldgen.audit_water_owner_edges /absolute/final-water --all-owner-edges --out /tmp/water-final-owner-edges.json

WATER_COMPILED_ASSETS=/absolute/final-water WATER_COMPILED_FLOOD_STATES="$PWD/apps/world-studio/public/province/refined/flood-states.json" WATER_CONFLUENCE_EDGE_PROBES=/tmp/water-final-owner-edges.json npm test --workspace=@elder-souls/game-core -- waterConfluenceCompiled.test.ts

WATER_COMPILED_ASSETS=/absolute/final-water npm test --workspace=@elder-souls/game-core -- waterCompiled.test.ts
```

The second command is the new bounded gate (30-second timeout). The third is
the existing exhaustive topology/record gate and is intentionally separate;
do not run it merely to iterate this focused check. Its indexed deep-cut audit
allowlist must independently match the owner-approved final exception manifest.
Do not loosen that assertion to make a provisional export pass.

After the small gate passes, add `WATER_CONFLUENCE_FULL=1` to its command to
visit every detected branched junction and every standing-edge probe wet in
at least one of the five tested stages,
still grouping work by local tile and disposing each mesh. This mode has a
three-minute test timeout; measure the small pass first. It does not remove
the falling-sheet exclusion described below.

## Evidence produced

- Three deterministic, spatially distributed degree-three-or-higher junctions
  (all detected junctions in full mode),
  with the centre and eight directions at 0.25, 1 and 2 metres.
- Three fixed owner-reported neighbourhoods at `(2370,190)`, `(1960,220)`
  and `(3840,1120)` metres: each exact centre plus eight directions at
  0.25, 10 and 30 metres (25 points/site), in both small and full modes.
  They use the same two requested LODs and all five stages. They are never
  relocated onto convenient nearby water or required to remain seasonally wet.
- Up to three base-wet and three newly-wet-only native-to-standing owner
  boundaries (all members of the five-stage standing union in full mode),
  probing both sides of its 1-centimetre edge offset.
- Actual production inland geometry at requested LOD 1 and 16, including its
  adaptive refinement and native-footprint subtraction. Only touched tiles
  are built; every temporary mesh/material is disposed.
- Base stage and all four conservative tide/season extrema: tide `±amplitude`,
  season `−0.2×amplitude` or `+amplitude`. Actual authored longitudinal
  coefficients and per-profile access barriers remain in effect.
- Independent barycentric interpolation of exported native face heights,
  access and level coefficients, followed by exact native-ground clipping.
  The highest surviving face must agree with `WaterWorld.sampleBoundary`
  within 2 millimetres. Wet/dry disagreement is never waived.
- Inland standing heights likewise come from barycentric interpolation of
  actual uploaded mesh vertex samples and authored stage coefficients—not
  the exact raster height at the probe position. Unsupported vertices retain
  their shader sampling values. Fragment support/access and exact native-bed
  clipping then determine which interpolated faces actually survive.
- A separate failure if a physically wet standing raster owner has been
  removed by dry native geometry, even if CPU and rendered geometry both
  agree on that incorrect absence. A lower native handoff cannot substitute
  for the standing owner's higher plane.

The JSON console summary includes potential owner-edge count, standing stage
union size, available/selected newly-wet-only boundaries, classifications,
standing-water checks, threshold-near cases, excluded falling-sheet domains and the first
20 exact failure coordinates/stages/LODs. Threshold-near cases are counted
but **still asserted**. The test requires nonzero standing coverage and over
100 classifications; missing categories cannot silently pass.

Named `sites` counters report classified, query-wet, rendered-wet, dry and
excluded cases separately, including falling/marine exclusion reasons. Each
site accounts for all 250 point/LOD/stage cases. A fully excluded or dry-only
site is **not wet-surface verification**; no mandatory wet quota invents water
in a legitimate seasonal wetland. Exact native bed remains required wherever
a raster or native water candidate exists. Wholly unsupported dry points may
fall outside the sparse bed sidecar, but their World query must still agree dry.

## Scope and interpretation

This is sampled still-water ownership/geometry/query evidence, **not visual
certification** of a site or the province. Spectral/local ripples, temporal
anti-aliasing and actual GL atlas linkage have their separate runtime tests and
browser checks. Mixed free-falling-sheet records are explicitly excluded and
counted here because a curtain is not a filled-water volume; their sheet/plunge
contact tests remain mandatory.

Supported marine raster domains are also excluded and counted: the inland
tile generator is not the ocean renderer. River-mouth/ocean handoff needs its
own rendered-coverage evidence and must not be certified by this inland gate.

With `--all-owner-edges`, the Python extractor retains every exported
`reach-owner` section endpoint, without a base-depth/access filter or raster
hint. The gate samples both sides using real owner-aware raster levels/access
and exact native ground, taking the union across all five stages. Selection
costs one static sample and one ground query per side, without geometry builds
or five repeated World queries. Non-rendered R128 proxies and separate marine
geometry are excluded from this inland-standing category.

Selection deliberately precedes native footprint subtraction: using only
already-submitted faces to choose probes would hide missing standing water.
The selected probes must subsequently pass actual inland geometry coverage
and World comparisons. Small mode samples the newly-wet category separately
so common base-wet shores cannot crowd it out.

Owner-boundary evidence covers sampled exported section endpoints, not every
interior position along a longitudinal owner boundary; fixed repro rings add
neighbourhood samples, not continuous coverage. Unsampled junctions in small mode and
scene-level appearance also remain outside this check. Use reported failing coordinates to select the next
targeted compiler/runtime audit; do not hide them with a body-ID merge or a
CPU-only standing-water fallback below geometry that is not rendered.

# Settlement blueprints (Phase 11 Parts 6–8)

One `<place-id>.json` per authored place; the deterministic compiler consumes
these. Schema + validator: `tooling/world-generation/worldgen/blueprint.py`
(its docstring is the field reference; `python -m worldgen.blueprint --check`).
Blueprint IDs must exist in `world/sources/catalogue/`. Register each new
file in `tooling/repo-standards/id-registry.json` with `"references": ["place"]`
(the blueprint's own id is the catalogue place it details; every object
inside it has its own `<kind>.<slug>.<name>` id — standard 2).

## What sits next to each blueprint (Part 6 convention, 2026-09-04)

| File | What |
|---|---|
| `<place-id>.json` | the blueprint: `siting` (dossier ref + the 2–3 exact candidates, one chosen), districts as **kit sets** (`cultureKit` ∈ `KIT_SETS`), parcels with an exact `assetRef` chosen on measured geometry, landmarks, docks, sockets, clearance, budget |
| `<place-id>.md` | the meso design record: the candidate sitings with their numbers, why one won, the high-level design (districts, layout intent, signature feature), the asset picks with their measured footprints, open questions for the owner, and anything the catalogue record should change (never edited from here) |
| `../sites/dossiers/<slug>.{json,md}` | the site dossier over the plotted neighbourhood (`worldgen.site_dossier`) the siting cites |
| `tooling/world-generation/output/blueprint-maps/<place-id>.png` | the rendered map (`worldgen.render_blueprint`); derived, gitignored, regenerate in seconds |

Reading one interactively (Part 7): `python3 -m worldgen.export_blueprints`
(from `tooling/world-generation/`) writes the studio's `blueprints.json` and a
terrain crop per blueprint; then open World Studio at
`?bp=1&blueprint=<place-id>` — zoom, pan, toggle each object class, hover for a
name and click for the record and its *why*. The static PNG stays as the print
sheet; the studio view is the review medium.

Loop (decision 0041 Parts 6–7; the full playbook is
[docs/world/96-placement-playbook.md](../../../docs/world/96-placement-playbook.md)):
dossier → candidates → choose → design → blueprint → `blueprint --check` →
`compile_settlement` → `render_blueprint` → **`worldgen.apply_sitings`** (a
moved place moves its dot, paths and waterways too — owner rule 2026-09-05)
→ `export_blueprints` → owner Round A in the studio. Fixes go to the grammar or the compiler, never to hand
edits of compiled output; every owner steer becomes a Taste-ledger rule.

Geometry, never labels: a piece is chosen from its measured outline in
`tooling/asset-pipeline/output/kits/<kit>.footprints.json` (and its `sizeM` in
`<kit>.kit.json`, plus the kit config's `snapLogic`), not from its name.

## Authoring a parcel (owner ruling 2026-09-05)

A parcel is authored as four fields, and its `footprint` is **derived** from
them — never typed by hand, never an axis-aligned box:

| Field | What you write |
|---|---|
| `centreUV` | `[u, v]` — where the piece stands |
| `assetRef` | the exact kit asset id, picked on its measured outline |
| `yawDeg` | which way it faces: degrees clockwise from north (**required**) |
| `orientationWhy` | one plain sentence saying why it faces that way — "aligned to the contour behind it", "door to the quay", "front to the market square" (**required**) |

Then run, from `tooling/world-generation/`:

```
python3 -m worldgen.blueprint_footprints --apply world/sources/blueprints/<place-id>.json
```

which rewrites every parcel's `footprint` as that asset's measured ground hull,
rotated by `yawDeg` and placed at `centreUV`. `blueprint --check` recomputes it
and fails on any drift, so a hand edit cannot survive. A door's `facingDeg` is
checked against the outline too: it must point roughly outward from the
footprint edge nearest its threshold.

The measurements come from `python3 -m pipeline.measure_footprints` (run from
`tooling/asset-pipeline/`), which reads each built kit GLB and writes
`<kit>.footprints.json` — `footprintM` (what touches the ground), `planOutlineM`
(the full silhouette; use it via `"outline": "planOutlineM"` for stilt pieces
whose ground band is only piles), plus area, width, depth and height. Both the
kits and these measurements are derived and gitignored: rebuild, never commit.
Assets flagged `nodeAmbiguous` share a truncated GLB node name with a sibling —
their numbers are not attributable to one piece, so do not pick them.

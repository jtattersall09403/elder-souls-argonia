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

Loop (decision 0041 Parts 6–7): dossier → candidates → choose → design →
blueprint → `blueprint --check` → `compile_settlement` → `render_blueprint`
→ owner Round A. Fixes go to the grammar or the compiler, never to hand
edits of compiled output; every owner steer becomes a Taste-ledger rule.

Geometry, never labels: a piece is chosen from its `sizeM` / footprint in
`tooling/asset-pipeline/output/kits/<kit>.kit.json` and the kit config's
`snapLogic`, not from its name.

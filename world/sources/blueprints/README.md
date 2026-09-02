# Settlement blueprints (Phase 11)

One `<place-id>.json` per authored place; the deterministic compiler
consumes these. Schema + validator: `tooling/world-generation/worldgen/blueprint.py`
(docstring is the field reference; `python -m worldgen.blueprint --check`).
Blueprint IDs must exist in `world/sources/catalogue/`. Register each new
file in `tooling/repo-standards/id-registry.json`.

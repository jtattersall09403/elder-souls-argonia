"""Export the route registry for World Studio's routes/waterways layers.

    python3 -m worldgen.export_routes           # from tooling/world-generation

Writes ``apps/world-studio/public/province/routes-index.json`` from the
authoring registry ``world/sources/routes/registry.json``. The browser must not
read authoring files, so the studio joins the geometry bundles
(``routes.json``, ``waterways.json``, ``routes-minor.json``) to this index on
the route ``id`` and shows name / class / mode / endpoints / confidence /
sources / notes in its details panel. Minor routes with no registry id simply
fall back to their derived geometry fields — except for the `unmapped` flag,
which is copied here from ``routes-minor.json`` (owner requirement 2026-09-05).
An unmapped path is routed, graded and painted ground that the player's map
must not draw, so the one bundle every consumer already reads has to say so.

Deterministic (standard 6) and byte-stable: sorted by id, ``indent=2``,
``ensure_ascii=False``, one trailing newline. The TypeScript view of this shape
is ``RoutesIndexBundle`` in ``packages/contracts``.
"""

from __future__ import annotations

import json
from pathlib import Path

from . import route_registry

SCHEMA_VERSION = 1
OUT_PATH = route_registry.PROVINCE / "routes-index.json"

FIELDS = ("name", "mode", "class", "from", "to", "confidence", "solved", "notes")


def project(route: dict) -> dict:
    out = {k: route[k] for k in FIELDS if route.get(k) is not None}
    out["sources"] = list(route.get("sources") or [])
    out["aliases"] = list(route.get("aliases") or [])
    return out


def unmapped_ids(province: Path = route_registry.PROVINCE) -> set[str]:
    """Ids of derived minor paths flagged `unmapped` by `compile_minor_routes`."""
    path = province / "routes-minor.json"
    if not path.exists():
        return set()
    doc = json.loads(path.read_text())
    return {t["id"] for t in doc.get("tracks", []) if t.get("unmapped") and t.get("id")}


def build_bundle(registry_path: Path = route_registry.REGISTRY_PATH,
                 province: Path = route_registry.PROVINCE) -> dict:
    routes = route_registry.load(registry_path)
    out = {r["id"]: project(r) for r in sorted(routes, key=lambda r: r["id"])}
    # an unmapped MINOR path stays in routes-minor.json (where the studio and
    # the network join read tracks); only a REGISTRY route that is also flagged
    # gets the flag here — the major index is keyed by registry ids alone
    for rid in sorted(unmapped_ids(province)):
        if rid in out:
            out[rid]["unmapped"] = True
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": "world/sources/routes/registry.json via worldgen.export_routes",
        "routes": dict(sorted(out.items())),
    }


def render(bundle: dict) -> str:
    return json.dumps(bundle, indent=2, ensure_ascii=False) + "\n"


def export(out_path: Path = OUT_PATH, registry_path: Path = route_registry.REGISTRY_PATH) -> dict:
    bundle = build_bundle(registry_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(render(bundle), encoding="utf-8")
    return bundle


def main() -> None:
    bundle = export()
    print(f"wrote {OUT_PATH.relative_to(route_registry.REPO_ROOT)}: {len(bundle['routes'])} registered routes")


if __name__ == "__main__":
    main()

"""Export the route registry for World Studio's routes/waterways layers.

    python3 -m worldgen.export_routes           # from tooling/world-generation

Writes ``apps/world-studio/public/province/routes-index.json`` from the
authoring registry ``world/sources/routes/registry.json``. The browser must not
read authoring files, so the studio joins the geometry bundles
(``routes.json``, ``waterways.json``, ``routes-minor.json``) to this index on
the route ``id`` and shows name / class / mode / endpoints / confidence /
sources / notes in its details panel. Minor routes with no registry id simply
fall back to their derived geometry fields.

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


def build_bundle(registry_path: Path = route_registry.REGISTRY_PATH) -> dict:
    routes = route_registry.load(registry_path)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": "world/sources/routes/registry.json via worldgen.export_routes",
        "routes": {r["id"]: project(r) for r in sorted(routes, key=lambda r: r["id"])},
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

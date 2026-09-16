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

Also publishes the three records the map's route sub-layers read (16e
deliverable 8, decision 0068), for the same reason — the browser must not read
world/sources, and it must not recompute anything a record already states:

  * ``route-grades.json``   from ``world/sources/terrain/route-grade-patches.json``
  * ``crossings.json``      from ``world/sources/routes/water-crossings.json``
  * ``travel-services.json`` from ``world/sources/routes/travel-services.json``
    (stations, services, rootways, craft; the prose/policy blocks are dropped)
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from . import route_registry

SCHEMA_VERSION = 1
PROVINCE = route_registry.PROVINCE
REPO_ROOT = route_registry.REPO_ROOT
OUT_PATH = PROVINCE / "routes-index.json"

# The three records the 2D map's route sub-layers read (16e deliverable 8,
# decision 0068). The browser must not read world/sources, so they are
# published here verbatim-but-trimmed; nothing is recomputed in the browser.
GRADES_OUT = PROVINCE / "route-grades.json"
CROSSINGS_OUT = PROVINCE / "crossings.json"
SERVICES_OUT = PROVINCE / "travel-services.json"

GRADE_PATCHES_PATH = REPO_ROOT / "world/sources/terrain/route-grade-patches.json"
CROSSINGS_PATH = REPO_ROOT / "world/sources/routes/water-crossings.json"
SERVICES_PATH = REPO_ROOT / "world/sources/routes/travel-services.json"

# Prose/policy blocks the map never shows; dropped so the browser payload is data.
SERVICES_DROP = ("_", "policy", "operatorModel")

FIELDS = ("name", "mode", "class", "from", "to", "confidence", "solved", "notes", "condition", "conditionWhy")


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


def _load(path: Path) -> dict | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def grade_receipts() -> dict[str, float | None]:
    """`maxAbsDeltaM` actually applied per patch id, from the vault receipt.

    The natural ground is not available to the exporter, so the cut/fill a
    patch really moved is read from the receipt `apply_terrain_patches` writes
    beside the heights. The vault is not present on every machine; then every
    patch publishes null rather than a recomputed guess (decision 0066).
    """
    from .apply_terrain_patches import VAULT_DIR
    doc = _load(Path(VAULT_DIR) / "route-grade-applied.json")
    if not doc:
        return {}
    out: dict[str, float | None] = {}
    for row in doc.get("patches", []):
        rid = row.get("id")
        if not rid:
            continue
        receipt = row.get("receipt") or row
        v = receipt.get("maxAbsDeltaM", row.get("maxAbsDeltaM"))
        out[rid] = None if v is None else float(v)
    return out


def gradient_after_deg(profile: list) -> float:
    """Steepest consecutive-sample gradient of an authored [[e, s, z], ...] profile."""
    worst = 0.0
    for a, b in zip(profile, profile[1:]):
        ds = math.hypot(b[0] - a[0], b[1] - a[1])
        if ds <= 0:
            continue
        worst = max(worst, math.degrees(math.atan(abs(b[2] - a[2]) / ds)))
    return round(worst, 3)


def build_grades(patches_path: Path = GRADE_PATCHES_PATH,
                 receipts: dict[str, float | None] | None = None) -> dict:
    doc = _load(patches_path) or {}
    if receipts is None:
        receipts = grade_receipts()
    rows = []
    for p in doc.get("patches", []):
        if p.get("kind") != "route-grade":
            continue
        src = p.get("source") or {}
        params = p.get("params") or {}
        profile = params.get("profile") or []
        from_m, to_m = src.get("fromM"), src.get("toM")
        rows.append({
            "id": p["id"],
            "wayId": src.get("way"),
            "class": src.get("class"),
            "fromM": from_m,
            "toM": to_m,
            "lengthM": None if from_m is None or to_m is None else round(to_m - from_m, 2),
            "worstDegBefore": src.get("worstDegBefore"),
            "capDeg": src.get("capDeg", params.get("capDeg")),
            "gradientAfterDeg": gradient_after_deg(profile),
            "maxDeltaM": p.get("maxDeltaM"),
            "maxAbsDeltaM": receipts.get(p["id"]),
            "shoulderM": params.get("shoulderM"),
            "absorbed": src.get("absorbed"),
            "why": p.get("why"),
            "lineM": [[e, s] for e, s, *_ in profile],
        })
    rows.sort(key=lambda r: r["id"])
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": "world/sources/terrain/route-grade-patches.json via worldgen.export_routes",
        "patches": rows,
    }


def build_crossings(path: Path = CROSSINGS_PATH) -> dict:
    doc = _load(path) or {"schemaVersion": 2, "crossings": []}
    out = {k: v for k, v in doc.items() if k != "_"}
    out["source"] = "world/sources/routes/water-crossings.json via worldgen.export_routes"
    return out


def build_services(path: Path = SERVICES_PATH) -> dict:
    doc = _load(path) or {"schemaVersion": 1, "stations": [], "services": [], "rootways": [], "craft": {}}
    out = {k: v for k, v in doc.items() if k not in SERVICES_DROP}
    craft = out.get("craft")
    if isinstance(craft, dict):
        out["craft"] = {k: v for k, v in craft.items() if k != "_"}
    out["source"] = "world/sources/routes/travel-services.json via worldgen.export_routes"
    return out


def export_grades(out_path: Path = GRADES_OUT, patches_path: Path = GRADE_PATCHES_PATH,
                  receipts: dict[str, float | None] | None = None) -> dict:
    doc = build_grades(patches_path, receipts)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(render(doc), encoding="utf-8")
    return doc


def export_crossings(out_path: Path = CROSSINGS_OUT, path: Path = CROSSINGS_PATH) -> dict:
    doc = build_crossings(path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(render(doc), encoding="utf-8")
    return doc


def export_services(out_path: Path = SERVICES_OUT, path: Path = SERVICES_PATH) -> dict:
    doc = build_services(path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(render(doc), encoding="utf-8")
    return doc


def main() -> None:
    bundle = export()
    rel = lambda p: p.relative_to(REPO_ROOT)
    print(f"wrote {rel(OUT_PATH)}: {len(bundle['routes'])} registered routes")
    grades = export_grades()
    print(f"wrote {rel(GRADES_OUT)}: {len(grades['patches'])} route-grade patches")
    crossings = export_crossings()
    print(f"wrote {rel(CROSSINGS_OUT)}: {len(crossings.get('crossings', []))} crossings")
    services = export_services()
    print(f"wrote {rel(SERVICES_OUT)}: {len(services.get('stations', []))} stations, "
          f"{len(services.get('services', []))} services, {len(services.get('rootways', []))} rootways")


if __name__ == "__main__":
    main()

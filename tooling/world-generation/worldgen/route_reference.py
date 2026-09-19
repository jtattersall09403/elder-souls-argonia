"""The one resolver for "is this id a real route?".

`macro_plot.danglingRelations` and `plot_remedies.re-reference` both have to
answer the same question about a relation edge, and they answered it
differently: the plot resolved place ids only (so every road, track and lane
edge was reported dangling — 24 false rows that hid 27 real ones), and the
remedy tool resolved the route registry's own ids only (so a registry ALIAS,
a published lane or a rootway could not be written as a replacement). One
namespace, one reader.

The namespace is: the route registry's ids and aliases, the published boat
lanes, the rootway edges of the rootworm network, and the hydrology names
register's entity ids (a `reachedVia` edge may legitimately name a water).
Place ids are the caller's own business and are added by the caller.
"""

from __future__ import annotations

import json
from pathlib import Path

from . import catalogue

REPO_ROOT = catalogue.REPO_ROOT
ROUTE_REGISTRY_PATH = REPO_ROOT / "world" / "sources" / "routes" / "registry.json"
ROOTWORM_PATH = REPO_ROOT / "world" / "sources" / "routes" / "rootworm-stations.json"
NAMES_PATH = REPO_ROOT / "world" / "sources" / "hydrology" / "names.json"
PUBLISHED_PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"


def _json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def route_reference_ids(registry_path: Path = ROUTE_REGISTRY_PATH,
                        province_dir: Path = PUBLISHED_PROVINCE,
                        rootworm_path: Path = ROOTWORM_PATH,
                        names_path: Path = NAMES_PATH) -> set[str]:
    """Every id a relation edge may legitimately name that is not a place."""
    ids: set[str] = set()
    for r in _json(registry_path).get("routes", []) or []:
        if isinstance(r.get("id"), str):
            ids.add(r["id"])
        for a in r.get("aliases", []) or []:
            if isinstance(a, str):
                ids.add(a)
    for lane in _json(province_dir / "waterways.json").get("lanes", []) or []:
        if isinstance(lane.get("id"), str):
            ids.add(lane["id"])
    root = _json(rootworm_path)
    for way in root.get("rootways", []) or []:
        if isinstance(way.get("id"), str):
            ids.add(way["id"])
        else:
            # The authored file leaves the id to the derive, which builds it
            # from the two node slugs: `rootway.<from>-<to>`.
            a, b = way.get("from"), way.get("to")
            if isinstance(a, str) and isinstance(b, str):
                ids.add(f"rootway.{a.split('.')[-1]}-{b.split('.')[-1]}")
    for st in root.get("stations", []) or []:
        if isinstance(st.get("id"), str):
            ids.add(st["id"])
    for e in _json(names_path).get("names", []) or []:
        if isinstance(e.get("entityId"), str):
            ids.add(e["entityId"])
    return ids

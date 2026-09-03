"""Export the plotted place catalogue for World Studio's 2D map.

    python3 -m worldgen.export_places            # from tooling/world-generation

Writes ``apps/world-studio/public/province/places.json`` — the owner's Phase 11
Part 4 review medium (decision 0041 Part 0 item 5) — from the authoring
catalogue ``world/sources/catalogue/places-<region>.json``. Only records with a
``position`` are exported (the map can only draw sited places); each record is
projected to the review fields the layer needs, so the browser never reads the
authoring files directly. The region-zone colours are copied from
``society.CULTURES`` so the studio and the Python plot pictures agree by
construction.

Deterministic (standard 6) and byte-stable: sorted by id, ``indent=2``,
``ensure_ascii=False``, one trailing newline. The TypeScript view of this shape
is ``PlottedPlacesBundle`` in ``packages/contracts``.
"""

from __future__ import annotations

import json
from pathlib import Path

from . import catalogue
from .society import CULTURES

SCHEMA_VERSION = 1
OUT_PATH = catalogue.REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "places.json"

WHY_FIELDS = ("founding", "siteAdvantages", "occupantsMotive", "pressures", "wouldChangeIf")


def _hex(rgb) -> str:
    return "#%02x%02x%02x" % tuple(int(c) for c in rgb)


def zone_colours() -> dict[str, str]:
    """Region-zone → CSS hex, from the one place the palette is authored."""
    return {name: _hex(spec["colour"]) for name, spec in CULTURES.items()}


def project_record(rec: dict, region: str) -> dict:
    cls = rec.get("classification") or {}
    why = rec.get("why") or {}
    prefs = rec.get("sitingPrefs") or {}
    rel = rec.get("relations") or {}
    reward = rec.get("rewardProfile") or {}
    return {
        "id": rec["id"],
        "name": rec.get("name") or rec.get("namingRule") or rec["id"],
        "region": region,
        "class": cls.get("class"),
        "family": cls.get("family"),
        "type": cls.get("type"),
        "magnitude": cls.get("magnitude"),
        "importanceTier": rec.get("importanceTier"),
        "dangerTier": rec.get("dangerTier"),
        "densityLayer": rec.get("densityLayer"),
        "status": rec.get("status"),
        "workflow": rec.get("workflow"),
        "culture": rec.get("culture"),
        "position": {"u": rec["position"]["u"], "v": rec["position"]["v"]},
        "positionM": rec.get("positionM"),
        "plotFacts": rec.get("plotFacts"),
        "whySiteWon": rec.get("whySiteWon"),
        "why": {k: why.get(k) for k in WHY_FIELDS},
        "hardConstraints": list(prefs.get("hardConstraints") or []),
        "reachedVia": list(rel.get("reachedVia") or []),
        "discovery": rec.get("discovery"),
        "valueTier": reward.get("valueTier"),
    }


def build_bundle(catalogue_dir: Path = catalogue.CATALOGUE_DIR) -> dict:
    places = []
    unsited = 0
    for rf in catalogue.load_region_files(catalogue_dir):
        for rec in rf.places:
            if rec.get("position"):
                places.append(project_record(rec, rf.region))
            else:
                unsited += 1
    places.sort(key=lambda p: p["id"])
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": "world/sources/catalogue/places-*.json via worldgen.export_places",
        "zoneColours": zone_colours(),
        "unsitedCount": unsited,
        "places": places,
    }


def render(bundle: dict) -> str:
    return json.dumps(bundle, indent=2, ensure_ascii=False) + "\n"


def export(out_path: Path = OUT_PATH, catalogue_dir: Path = catalogue.CATALOGUE_DIR) -> dict:
    bundle = build_bundle(catalogue_dir)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(render(bundle), encoding="utf-8")
    return bundle


def main() -> None:
    bundle = export()
    print(f"wrote {OUT_PATH.relative_to(catalogue.REPO_ROOT)}: "
          f"{len(bundle['places'])} plotted places ({bundle['unsitedCount']} unsited, not exported)")


if __name__ == "__main__":
    main()

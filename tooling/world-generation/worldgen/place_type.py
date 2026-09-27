"""A catalogue place's taxonomy type: the one reader for tools outside the
catalogue validator (close_place, build_ledger).

Place records keep their type at `classification.type` (e.g.
`road-station-village`); no record has a top-level `type`. Dependency-free
so `tooling/repo-standards/build_ledger.py` can import it.
"""

from __future__ import annotations

import json
from pathlib import Path

CATALOGUE_DIR = Path(__file__).resolve().parents[3] / "world" / "sources" / "catalogue"


def record_type(rec: dict) -> str | None:
    """The record's `classification.type`, or None."""
    cls = rec.get("classification")
    return cls.get("type") if isinstance(cls, dict) else None


def find_record(place_id: str, catalogue_dir: Path = CATALOGUE_DIR) -> dict | None:
    for path in sorted(catalogue_dir.glob("places-*.json")):
        for rec in json.loads(path.read_text()).get("places", []):
            if rec.get("id") == place_id:
                return rec
    return None


def place_type(place_id: str, catalogue_dir: Path = CATALOGUE_DIR) -> str | None:
    rec = find_record(place_id, catalogue_dir)
    return record_type(rec) if rec else None

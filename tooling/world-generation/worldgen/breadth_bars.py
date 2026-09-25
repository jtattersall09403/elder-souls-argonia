"""Breadth bars: load, validate and query world/sources/placement/breadth-bars.json.

The record holds the per-place variety bars of decision 0098 and the 16k
slice 1b within-place numbers (decision 0100 decision 7). The compile's 0098
check and the place-build skill read the bars through ``bars_for``; no bar
lives in code.
"""
from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
BARS_PATH = REPO_ROOT / "world" / "sources" / "placement" / "breadth-bars.json"

SCHEMA_VERSION = 1
TIERS = ("M1", "M2", "M3", "M4", "M5")
TIER_FIELDS = (
    "shellsMin",
    "topShellShareMax",
    "signatureRatioMin",
    "dressingPiecesPerDwellingWithin12mMin",
    "clutterPiecesMin",
    "dressingAssetKindsMin",
    "dressingAssetShareMax",
    "groundKindsMin",
    "lightKindsMin",
)
TYPE_IDS = tuple(str(n) for n in range(1, 10))
# A type's defaultTier is a fallback only (planner 2026-09-25): a record that
# carries its own magnitude always wins, and the record says so on every row.
FALLBACK_MARK = "the record's own tier wins"


class BreadthBarsError(ValueError):
    """The bars record is malformed."""


def _sourced(value: object, where: str) -> None:
    if not isinstance(value, dict) or "value" not in value:
        raise BreadthBarsError(f"{where}: expected {{value, source}}")
    if not str(value.get("source") or "").strip():
        raise BreadthBarsError(f"{where}: number has no source")


def validate(record: dict) -> dict:
    """Raise BreadthBarsError on the first defect; return the record."""
    if record.get("schemaVersion") != SCHEMA_VERSION:
        raise BreadthBarsError(f"schemaVersion {record.get('schemaVersion')!r}, expected {SCHEMA_VERSION}")
    tiers = record.get("tiers") or {}
    for tier in TIERS:
        if tier not in tiers:
            raise BreadthBarsError(f"tier {tier} missing")
        for field in TIER_FIELDS:
            if field not in tiers[tier]:
                raise BreadthBarsError(f"tiers.{tier}.{field} missing")
            _sourced(tiers[tier][field], f"tiers.{tier}.{field}")
    for culture, row in (record.get("enclosureKindsMin") or {}).items():
        if not str(row.get("source") or "").strip():
            raise BreadthBarsError(f"enclosureKindsMin.{culture}: no source")
        missing = [t for t in TIERS if t not in (row.get("byTier") or {})]
        if missing:
            raise BreadthBarsError(f"enclosureKindsMin.{culture}: tiers {missing} missing")
    if not record.get("enclosureKindsMin"):
        raise BreadthBarsError("enclosureKindsMin empty")
    for key, value in (record.get("distance") or {}).items():
        _sourced(value, f"distance.{key}")
    if "samePurposeOnOneRoadMinM" not in (record.get("distance") or {}):
        raise BreadthBarsError("distance.samePurposeOnOneRoadMinM missing")
    types = record.get("types") or {}
    for type_id in TYPE_IDS:
        row = types.get(type_id)
        if row is None:
            raise BreadthBarsError(f"type {type_id} missing")
        if row.get("defaultTier") not in TIERS:
            raise BreadthBarsError(f"type {type_id}: defaultTier {row.get('defaultTier')!r}")
        if FALLBACK_MARK not in str(row.get("source") or ""):
            raise BreadthBarsError(f"type {type_id}: defaultTier source must say {FALLBACK_MARK!r}")
        for field, value in (row.get("overrides") or {}).items():
            if field not in TIER_FIELDS:
                raise BreadthBarsError(f"type {type_id}: override of unknown field {field}")
            _sourced(value, f"types.{type_id}.overrides.{field}")
    return record


def load(path: Path = BARS_PATH) -> dict:
    return validate(json.loads(Path(path).read_text(encoding="utf-8")))


def bars_for(tier: str | None, culture: str, place_type: int | str, record: dict | None = None) -> dict:
    """Flat bars for one place: {field: number} plus ``enclosureKindsMin``.

    ``tier`` is the record's magnitude (M1..M5) and always wins; only None
    falls back to the type's default tier. ``culture`` is a Part F kit set (``imperial``,
    ``argonian-mud``, ...). Type overrides win over the tier's numbers.
    """
    record = record if record is not None else load()
    type_row = record["types"][str(place_type)]
    tier = tier or type_row["defaultTier"]
    if tier not in record["tiers"]:
        raise KeyError(f"unknown tier {tier!r}")
    enclosure = record["enclosureKindsMin"].get(culture)
    if enclosure is None:
        raise KeyError(f"no enclosure bar for culture {culture!r}")
    tier_row = record["tiers"][tier]
    bars = {field: tier_row[field]["value"] for field in TIER_FIELDS}
    bars.update({field: v["value"] for field, v in (type_row.get("overrides") or {}).items()})
    bars["enclosureKindsMin"] = enclosure["byTier"][tier]
    bars["tier"] = tier
    bars["perQuarter"] = bool(tier_row.get("perQuarter"))
    return bars

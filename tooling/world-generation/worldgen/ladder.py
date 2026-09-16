"""The Phase 16 ladder, for tests: skip a gate whose layer or stage a later
chunk still owns (plan 16 §3, owner 2026-09-12: build only what is delivered).

`province/ladder.json` is written by `scripts/terrain-chain.sh` at the end of
every run and lists the stages that ran, the stages skipped and the studio
layers hidden as a result. A test that judges the shipped water, vegetation,
route structures or settlements is only meaningful once its chunk has
delivered that layer; until then it skips with the owning chunk named, so a
red is never "by design" and a green never measures a world that is not the
one being built. No record (a tree built before the ladder) skips nothing.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
LADDER_PATH = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "ladder.json"
OWNER = {"water": "16c", "route-structures": "16e (drawn from 16h)", "vegetation": "16f", "settlements": "16h",
         "grade_routes": "16e", "solve_major_routes": "16e", "apply_route_patches": "16e",
         "derive_crossings": "16e", "travel_services": "16e", "paint_route_overlays": "16e",
         "compile_water": "16c", "compile_scatter": "16f",
         "rebake_landcover": "16b (re-run at 16f: the bake reads the record)",
         "apply_vegetation_patches": "16f", "compile_water_dressing": "16f",
         "settlement_ground_control": "16h",
         "compile_route_structures": "16e", "terrain_request_postconditions": "16c",
         "compile_minor_routes": "16g", "compile_minor_waterways": "16g",
         "compile_settlement": "16h", "grade_settlement_pads": "16h"}


def load() -> dict | None:
    try:
        doc = json.loads(LADDER_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return doc if doc.get("schemaVersion") == 1 else None


def layer_hidden(layer: str) -> bool:
    doc = load()
    return bool(doc) and layer in doc.get("hiddenLayers", [])


def stage_skipped(stage: str) -> bool:
    doc = load()
    return bool(doc) and stage in doc.get("skipped", [])


def requires_layer(layer: str):
    """`@requires_layer("water")`: skip until the ladder delivers the layer."""
    doc = load()
    return pytest.mark.skipif(
        layer_hidden(layer),
        reason=f"the {layer} layer is owned by {OWNER.get(layer, 'a later chunk')} and was not rebuilt on this "
               f"ground (province/ladder.json: through {doc.get('through') if doc else '?'})")


# The ONE declaration of the chunk order; scripts/terrain-chain.sh reads it.
LADDER_ORDER = ("16b", "16c", "16d", "16e", "16f", "16g", "16h", "16i", "16j")


def chunk_delivered(chunk: str) -> bool:
    """Has the ladder been built through `chunk` (or `full`)?

    Raises on a chunk id outside LADDER_ORDER, whether it is the decorator's
    argument (a programming error) or `through` from a hand-edited
    `ladder.json` (a collection error is the right outcome: a gate that
    answered True for an unknown chunk would run tests against a world nobody
    built)."""
    if chunk not in LADDER_ORDER:
        raise ValueError(f"unknown chunk {chunk!r}; ladder is {LADDER_ORDER}")
    doc = load()
    if not doc:
        return True
    through = doc.get("through")
    if through == "full":
        return True
    if through not in LADDER_ORDER:
        raise ValueError(f"province/ladder.json says through={through!r}, not a chunk in {LADDER_ORDER}")
    return LADDER_ORDER.index(through) >= LADDER_ORDER.index(chunk)


def requires_delivered(chunk: str):
    """`@requires_delivered("16g")`: skip until that chunk has delivered — for
    a gate that judges a record a later chunk re-authors on this ground (the
    macro plot against the frozen water is 16g's)."""
    doc = load()
    return pytest.mark.skipif(
        not chunk_delivered(chunk),
        reason=f"judges a record that {chunk} re-authors on this ground; the ladder is through "
               f"{doc.get('through') if doc else '?'}")


def requires_stage(stage: str):
    """`@requires_stage("grade_routes")`: skip until the ladder runs the stage."""
    doc = load()
    return pytest.mark.skipif(
        stage_skipped(stage),
        reason=f"stage {stage} is owned by {OWNER.get(stage, 'a later chunk')} and did not run on this ground "
               f"(province/ladder.json: through {doc.get('through') if doc else '?'})")

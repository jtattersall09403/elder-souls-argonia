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
OWNER = {"water": "16c", "route-structures": "16e", "vegetation": "16f", "settlements": "16h",
         "grade_routes": "16e", "compile_water": "16c", "compile_scatter": "16f",
         "compile_route_structures": "16e", "terrain_request_postconditions": "16c",
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


def requires_stage(stage: str):
    """`@requires_stage("grade_routes")`: skip until the ladder runs the stage."""
    doc = load()
    return pytest.mark.skipif(
        stage_skipped(stage),
        reason=f"stage {stage} is owned by {OWNER.get(stage, 'a later chunk')} and did not run on this ground "
               f"(province/ladder.json: through {doc.get('through') if doc else '?'})")

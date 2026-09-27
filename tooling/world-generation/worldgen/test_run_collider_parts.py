"""One collider part per bound run (decision 0101 rule 9, planner ruling
2026-09-26): the export counts a run whose members all collide as their own
triangles once, as the runtime joins it (`runColliders.ts`). Claywater
Station counted 148 resident parts per piece (x 1.55 = 229 over the 200
ceiling); joined, 113 (175)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from . import export_settlement_bundle as E
from .settlement_bundles import load_published

PROVINCE_DIR = Path(__file__).resolve().parents[3] / "apps" / "world-studio" / "public" / "province"
PUBLISHED = PROVINCE_DIR / "settlements" / "index.json"   # the place bundles (S8)


def _row(pid, run=None, kind="mesh", parts=None):
    row = {"id": pid, "kit": "k", "assetId": "a", "collision": {"kind": kind}}
    if parts:
        row["collision"]["parts"] = parts
    if run:
        row["run"] = {"id": run, "index": 0, "riseM": 0.0}
    return row


def test_a_mesh_run_is_one_part_and_a_box_run_is_not(monkeypatch):
    monkeypatch.setattr(E, "lod0_part_counts", lambda kit, kits_dir=None: {"a": 3})
    rows = [_row("w1", "r"), _row("w2", "r"), _row("w3", "r"), _row("hut")]
    boxes = [_row("b1", "q", "box", [{}]), _row("b2", "q", "box", [{}])]
    site = [{"id": "s", "placementIds": [r["id"] for r in rows + boxes]}]
    assert E.resident_collision_parts(site, rows + boxes)["s"] == 1 + 3 + 2


@pytest.mark.skipif(not PUBLISHED.exists(), reason="no published bundle")
def test_claywater_fits_the_ceiling_once_its_runs_are_joined():
    bundle = load_published(PROVINCE_DIR)
    site = next((s for s in bundle["settlements"]
                 if s["id"] == "place.imperial-fringe.claywater-station"), None)
    if site is None:
        pytest.skip("Claywater is not published")
    # The published bundle is judged on the published kits, the GLBs the runtime
    # builds its parts from (tracked; the raw build under output/kits is local).
    joined = E.resident_collision_parts([site], bundle["placements"], E.PUBLIC_KITS)[site["id"]]
    unjoined = E.resident_collision_parts(
        [site], [{k: v for k, v in p.items() if k != "run"} for p in bundle["placements"]],
        E.PUBLIC_KITS)[site["id"]]
    # joining a run into one part saves parts, and the joined place fits the
    # ceiling (400 since walk 2 lane RA, bb5661d5: every prop over 0.3 m now
    # collides) with the export's headroom
    assert joined < unjoined
    assert round(joined * E.COLLIDER_PART_HEADROOM) <= E.COLLIDER_PART_CEILING
    assert E.COLLIDER_PART_WARNING < E.COLLIDER_PART_CEILING

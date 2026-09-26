"""Every dressing asset a place in the 16k loop or an accepted place lays has
an asset-level policy row (planner ruling 6, 2026-09-26, Claywater Station):
the fit it stands on is a reviewed row, never only its kit's default. Read
from the tracked blueprints (every `assembly` member of every parcel), so the
gate holds without a compiled output on disk."""

import json
import sys

from .placement_metadata import REPO_ROOT, normalize_asset_id

sys.path.insert(0, str(REPO_ROOT / "tooling" / "world-generation"))
from worldgen import blueprint as bp_mod  # noqa: E402  the one blueprint loader rule

POLICIES = REPO_ROOT / "tooling" / "asset-pipeline" / "pipeline" / "config" / "placement-policies.json"
ACCEPTED = REPO_ROOT / "world" / "sources" / "placement" / "accepted-places.json"


def _loop_places() -> list[dict]:
    """The accepted places and every place in the loop (a real place: a
    blueprint that is not a fixture)."""
    accepted = {row["placeId"] if "placeId" in row else row.get("id")
                for row in json.loads(ACCEPTED.read_text()).get("places", [])}
    out = []
    for path in bp_mod.blueprint_paths():
        bp = json.loads(path.read_text()).get("blueprint") or {}
        if bp.get("id") in accepted or not bp_mod.is_fixture(bp):
            out.append(bp)
    return out


def _missing(places, rows) -> list:
    return sorted({(bp["id"], item["asset"]) for bp in places
                   for parcel in bp.get("parcels", [])
                   for item in parcel.get("assembly") or []
                   if normalize_asset_id(item["asset"]) not in rows})


def test_every_dressing_asset_of_a_loop_place_has_a_policy_row():
    rows = json.loads(POLICIES.read_text())["assetPolicies"]
    places = _loop_places()
    assert any(bp["id"] == "place.imperial-fringe.claywater-station" for bp in places)
    missing = _missing(places, rows)
    assert not missing, missing


def test_the_gate_fails_on_a_dressing_asset_without_a_row():
    rows = json.loads(POLICIES.read_text())["assetPolicies"]
    fake = {"id": "place.t", "parcels": [{"assembly": [{"asset": "vanilla:clutter/no-such-thing01"},
                                                       {"asset": "vanilla:clutter/barrel02"}]}]}
    assert _missing([fake], rows) == [("place.t", "vanilla:clutter/no-such-thing01")]

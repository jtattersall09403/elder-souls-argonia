"""settlement_bundles (S8): the split is lossless and fails closed."""

import pytest

from . import settlement_bundles as sb


def _whole():
    site = {"id": "place.a", "placementIds": ["place.a.house"],
            "boundaryM": [[0, 0], [10, 0], [10, 10], [0, 10]]}
    return {
        "schemaVersion": 4, "collisionFrame": "f", "lod": {"colliderPartBudget": 7, "tiers": 3},
        "kits": {"k": {"glb": "k.glb"}, "route-structures-v1": {"glb": "r.glb"}},
        "settlements": [site],
        "placements": [
            {"id": "place.a.house", "kind": "settlement", "sourceId": "place.a", "kit": "k",
             "assetId": "h", "positionM": [30, 0, 5], "footprintM": [[29, 4], [31, 6]]},
            {"id": "route.r.1", "kind": "route-structure", "sourceId": "route.r",
             "kit": "route-structures-v1", "assetId": "b", "positionM": [100, 0, 100]}],
        "groundTreatments": [{"id": "treatment.place.a.house", "kind": "floor"}],
        "navmeshCuts": [{"id": "navcut.route.r.1", "placementId": "route.r.1"}],
        "navmeshLinks": [], "doors": [{"id": "door.1", "settlementId": "place.a"}],
        "compiledObjects": [{"id": "o", "placeId": "place.a"}], "knownRedWarnings": [],
        "phase11ObligationReceipts": [], "designedSinkGaps": [{"asset": "k/h", "placements": 1}],
        "stats": {"settlements": 1, "settlementPlacements": 1, "routeStructurePlacements": 1},
    }


def test_split_and_assemble_round_trip_and_budget_is_the_max():
    places, routes = sb.split(_whole(), {"place.a": 7})
    assert set(places) == {"place.a"} and set(routes) == {"route.r"}
    assert routes["route.r"]["lod"]["colliderPartBudget"] == 0
    assert "route-structures-v1" in routes["route.r"]["kits"]
    assert sb.assemble(list(places.values()) + list(routes.values())) == _whole()


def test_a_door_apron_treatment_goes_to_its_doors_place():
    whole = _whole()
    whole["groundTreatments"].append({"id": "treatment.door.1.apron", "kind": "floor"})
    places, _ = sb.split(whole, {"place.a": 7})
    assert [t["id"] for t in places["place.a"]["groundTreatments"]] == [
        "treatment.place.a.house", "treatment.door.1.apron"]


def test_a_whole_file_key_with_no_home_refuses():
    whole = {**_whole(), "newThing": 1}
    with pytest.raises(ValueError, match="no home"):
        sb.split(whole, {})


def test_a_row_of_no_published_place_refuses():
    whole = _whole()
    whole["doors"].append({"id": "door.x", "settlementId": "place.gone"})
    with pytest.raises(ValueError, match="no owner"):
        sb.split(whole, {})


def test_the_range_centre_and_radius_cover_every_piece():
    places, _ = sb.split(_whole(), {})
    centre, radius = sb._extent(places["place.a"])
    assert centre == [5.0, 5.0] and 26.0 <= radius < 26.2


def test_load_published_refuses_a_bundle_whose_bytes_moved(tmp_path):
    sb.write_published(_whole(), {"place.a": 7}, tmp_path)
    assert sb.load_published(tmp_path) == _whole()
    (tmp_path / "settlements/place.a.json").write_bytes(b"{}\n")
    with pytest.raises(ValueError, match="sha256"):
        sb.load_published(tmp_path)


def _two_places():
    whole = _whole()
    whole["settlements"].append({"id": "place.b", "placementIds": ["place.b.house"],
                                 "boundaryM": [[50, 50], [60, 50], [60, 60], [50, 60]]})
    whole["placements"].append({"id": "place.b.house", "kind": "settlement", "sourceId": "place.b",
                                "kit": "k", "assetId": "h", "positionM": [55, 0, 55],
                                "footprintM": [[54, 54], [56, 56]]})
    return whole


def test_a_scoped_load_ignores_another_places_stale_entry_but_not_its_own(tmp_path):
    sb.write_published(_two_places(), {}, tmp_path)
    stale = tmp_path / "settlements/place.b.json"                  # another lane's half-reverted publish
    stale.write_bytes(stale.read_bytes() + b"\n")
    with pytest.raises(ValueError, match="sha256"):
        sb.load_published(tmp_path)
    sb.load_published(tmp_path, verify_places={"place.a"})
    with pytest.raises(ValueError, match="sha256"):
        sb.load_published(tmp_path, verify_places={"place.b"})


def test_a_full_publish_removes_a_bundle_the_index_no_longer_names(tmp_path):
    sb.write_published(_whole(), {}, tmp_path)
    whole = _whole()
    whole["placements"] = whole["placements"][:1]
    whole["navmeshCuts"] = []
    whole["kits"] = {"k": whole["kits"]["k"]}
    result = sb.write_published(whole, {}, tmp_path)
    assert result["removed"] == ["settlements/routes/route.r.json"]
    assert not (tmp_path / "settlements/routes/route.r.json").exists()

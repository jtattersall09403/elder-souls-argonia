import json

from worldgen import place_type as pt


def test_real_record_type_is_the_classification_type():
    assert pt.place_type("place.imperial-fringe.claywater-station") == "road-station-village"
    recipes = json.loads((pt.CATALOGUE_DIR / "type-recipes.json").read_text())
    assert "road-station-village" in {t["type"] for t in recipes["types"]}


def test_unknown_place_and_missing_classification():
    assert pt.place_type("place.nowhere.none") is None
    assert pt.record_type({"type": "x"}) is None

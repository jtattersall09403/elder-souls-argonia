"""record_coherence: the walk-8 gate on what a record and its quests say."""
from __future__ import annotations

import numpy as np

from . import record_coherence as rc

RIVERWALK = "place.dunmer-north.riverwalk"


def _index(rec_why: str, premise: str, lane_through: bool) -> rc.Index:
    home = {"id": "place.t.home", "name": "Homestead", "positionM": [0.0, 0.0], "relations": {},
            "why": {"founding": rec_why}, "classification": {"class": "settlement"}}
    a = {"id": "place.t.aaa", "name": "Alderford", "positionM": [-20000.0, 0.0]}
    b = {"id": "place.t.bbb", "name": "Brinemouth", "positionM": [20000.0, 0.0]}
    y = 500.0 if lane_through else 9000.0
    lane = rc.Route("route.boat.aaa-bbb", "the Long reach", "lane", ("place.t.aaa", "place.t.bbb"),
                    ("aaa", "bbb"), np.array([[-20000.0, y], [20000.0, y]]), "synthetic")
    names = {"Homestead": ("place", "place.t.home"), "Alderford": ("place", "place.t.aaa"),
             "Brinemouth": ("place", "place.t.bbb"), "Long reach": ("route", lane.id)}
    import re
    name_re = re.compile(r"(?<![\w-])(" + "|".join(sorted(names, key=len, reverse=True)) + r")(?![\w-])")
    quest = {"id": "quest.t.1", "settlement": "place.t.home", "anchorPlaces": ["place.t.home"],
             "title": "Test", "premise": premise}
    return rc.Index({p["id"]: p for p in (home, a, b)}, {}, names, name_re, {lane.id: lane}, [],
                    {"stations": [], "services": []}, [("q.json", quest)])


def test_synthetic_green():
    ix = _index("A halt between Alderford and Brinemouth on the Long reach.", "The channel fouls", True)
    assert rc.coherence_failures("place.t.home", ix) == []


def test_synthetic_between_route_and_feature_fail():
    ix = _index("A halt between Alderford and Brinemouth on the Long reach.", "The shrine is robbed", False)
    fails = rc.coherence_failures("place.t.home", ix)
    assert any("between Alderford and Brinemouth" in f and "9.0 km away" in f for f in fails)
    assert any("names the route Long reach" in f for f in fails)
    assert any("premises a shrine" in f for f in fails)
    assert any("names Alderford" in f for f in fails)


def _rel_index(home_rel: dict, other_rel: dict) -> rc.Index:
    home = {"id": "place.t.home", "name": "Homestead", "positionM": [0.0, 0.0], "relations": home_rel,
            "interior": {"entranceCount": 1}}
    other = {"id": "place.t.aaa", "name": "Alderford", "positionM": [900.0, 0.0], "relations": other_rel}
    import re
    return rc.Index({p["id"]: p for p in (home, other)}, {}, {}, re.compile(r"(?!x)x"), {}, [],
                    {"stations": [], "services": []}, [])


def test_relations_green():
    ix = _rel_index({"supplies": ["place.t.aaa"], "rivals": []}, {"dependsOn": ["place.t.home"]})
    assert rc.coherence_failures("place.t.home", ix, {"doors": [{"interiorClaim": {"cellId": "c"}}]}) == []


def test_entrance_count_fail():
    ix = _rel_index({}, {})
    fails = rc.coherence_failures("place.t.home", ix, {"doors": [{"interiorClaim": {"c": 1}},
                                                                  {"interiorClaim": {"c": 2}}, {}]})
    assert any("entranceCount is 1 and the build has 2 load doors" in f for f in fails)


def test_entrance_count_not_recorded_skips():
    ix = _rel_index({}, {})
    del ix.places["place.t.home"]["interior"]
    fails = rc.coherence_failures("place.t.home", ix, {"doors": [{"interiorClaim": {"c": 1}}]})
    assert not any("entranceCount" in f for f in fails)


def test_season_and_idiom_are_no_features():
    """fig-market's premise (local-imperial-fringe.json): the season is no spring."""
    for prose in ("A herdsman who died in the spring", "Spring rains came late", "The fever takes its toll",
                  "The boatmen came as well"):
        ix = _index("A halt.", prose, True)
        assert not any("premises" in f for f in rc.coherence_failures("place.t.home", ix)), prose
    ix = _index("A halt.", "The spring under the hall is fouled", True)
    assert any("premises a spring" in f for f in rc.coherence_failures("place.t.home", ix))


def test_rival_and_dependency_fail():
    ix = _rel_index({"rivals": ["place.t.aaa"], "dependsOn": ["place.t.aaa"]}, {"rivals": ["place.t.home"]})
    assert any("both relations.rivals and relations.dependsOn" in f for f in rc.coherence_failures("place.t.home", ix))


def test_reciprocity_fail():
    ix = _rel_index({"rivals": ["place.t.aaa"]}, {"dependsOn": ["place.t.home"]})
    fails = rc.coherence_failures("place.t.home", ix)
    assert any("dependsOn this place and relations.supplies" in f for f in fails)
    assert any("does not name this place back" in f for f in fails)
    ix = _rel_index({}, {"rivals": ["place.t.home"]})
    assert any("names this place a rival" in f for f in rc.coherence_failures("place.t.home", ix))


def test_riverwalk_real_record():
    """The shipped Riverwalk record and its quests agree with the map and the build."""
    fails = rc.coherence_failures(RIVERWALK, rc.build_index(), rc.load_compiled(RIVERWALK))
    assert fails == [], "\n".join(fails)


def test_service_edge_form():
    ix = _rel_index({"travelServiceEdges": ["service:ferry.x.real"]}, {})
    ix.services["services"].append({"id": "ferry.x.real"})
    assert rc.coherence_failures("place.t.home", ix) == []
    ix.places["place.t.home"]["relations"]["travelServiceEdges"] = ["service:ferry.x.nope"]
    assert any("ferry.x.nope" in f for f in rc.coherence_failures("place.t.home", ix))


# ------------------------------------------------ walk 9: the scene, the plants, the receipt

def _veg_index(rec_why: str, n_mangrove: int, field: str = "founding") -> rc.Index:
    from pathlib import Path
    ix = _index("A halt.", "Nothing here", True)
    ix.places["place.t.home"]["why"] = {field: rec_why}
    ix.vegetation_dir = Path("/nonexistent")
    ix.cache["veg"] = {"order": ["bmv:landscape/trees/mangrovereachtree0gkb3", "bmv:landscape/plants/fern01"],
                       "cm": 500.0}
    xz = np.array([[10.0 + i, 10.0] for i in range(n_mangrove)] + [[20.0, 20.0]] * 10, dtype=np.float32)
    sp = np.array([0] * n_mangrove + [1] * 10, dtype=np.int32)
    ix.vegetation[(0, 0)] = (sp, xz.reshape(-1, 2))
    return ix


def _eco(ix):
    return [f for f in rc.coherence_failures("place.t.home", ix) if "grows here" in f]


def test_ecology_noun_needs_plants_within_200m():
    """Owner walk 9: Riverwalk's 'cove in mangrove forest' with no mangrove in sight."""
    assert any("mangrove forest or stand" in f for f in _eco(_veg_index("A cove in mangrove forest.", 20)))
    assert _eco(_veg_index("A cove in mangrove forest.", 80)) == []
    assert any("says mangrove grows" in f for f in _eco(_veg_index("A few mangroves lean over it.", 2)))
    assert _eco(_veg_index("A few mangroves lean over it.", 6)) == []
    assert _eco(_veg_index("Ferns crowd the bank.", 0)) == []          # ten ferns stand there


def test_ecology_materials_are_not_plants():
    assert _eco(_veg_index("Roofs of reed thatch and bamboo huts.", 0)) == []
    assert _eco(_veg_index("Mud and reed at the rear.", 0, field="materials")) == []
    assert any("reed" in f for f in _eco(_veg_index("Reeds crowd the water.", 0)))


def test_ecology_undressed_cell_is_not_measured():
    ix = _veg_index("A cove in mangrove forest.", 0)
    ix.vegetation.clear()
    assert _eco(ix) == []


def test_ecology_tokens_are_palette_species():
    """Every plant noun is proved by a species the flora palettes actually place."""
    import json
    import re
    text = json.dumps(json.loads((rc.SRC / "flora" / "palettes.json").read_text())).lower()
    leaves = {s.rsplit("/", 1)[-1] for s in re.findall(r'"[a-z0-9_]+:[^"]+/[^"]+"', text)}
    for noun, (_, tok) in rc.ECOLOGY.items():
        assert any(tok in leaf for leaf in leaves), noun


class _Water:
    """3 m cells: the mainland is the top 5 rows, an islet sits in open water."""
    mpp2 = 3.0

    def __init__(self):
        d = np.full((200, 200), 2.0, dtype=np.float32)
        d[:5, :] = -1.0
        d[39:44, 20:24] = -0.5
        self.depth2 = d


def test_scene_summary_land_islet_water_and_run_ends():
    ix = _index("A halt.", "Nothing here", True)
    ix.places["place.t.home"].update(positionM=[66.0, 66.0], footprintRadiusM=60.0)
    run = "place.t.home.parcel.t.walk"
    pl = [{"id": "place.t.home.parcel.t.house.building", "assetId": "k:a/hut", "positionM": [66.0, 0, 6.0]},
          {"id": "place.t.home.parcel.t.tent.building", "assetId": "k:a/tent", "positionM": [64.0, 0, 125.0]},
          {"id": "place.t.home.parcel.t.raft.building", "assetId": "k:a/raft", "positionM": [100.0, 0, 100.0]}]
    pl += [{"id": f"{run}.piece.{i}", "assetId": "k:a/plank", "positionM": [64.0, 0, 18.0 + 25.0 * i],
            "run": {"id": run, "index": i}} for i in range(5)]
    s = rc.scene_summary("place.t.home", ix, {"placements": pl}, water=_Water())
    on = {x["id"]: x["on"] for x in s["built"]["structures"]}
    assert on == {"t.house.building": "land", "t.tent.building": "islet", "t.raft.building": "water"}
    (walk,) = s["built"]["runs"]
    assert walk["pieces"] == 5 and walk["lengthM"] == 100.0
    assert walk["ends"][0]["on"] == "water" and walk["ends"][0]["nearestDry"]["on"] == "land"
    assert walk["ends"][0]["nearestStructure"] == "t.house.building"
    assert walk["ends"][1]["on"] == "islet" and walk["ends"][1]["nearestStructure"] == "t.tent.building"
    assert any("on islet" in ln for ln in rc.scene_lines(s))


def test_regression_green_to_red_only():
    now = {"a": "red", "b": "green", "c": "red"}
    before = {"a": "green", "b": "red", "c": "red"}
    fails = rc.regression_failures(now, before)
    assert len(fails) == 1 and "a was coherent at HEAD" in fails[0]

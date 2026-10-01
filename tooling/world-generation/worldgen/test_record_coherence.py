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

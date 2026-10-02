"""An off-network place (a lair reached across country, 16k walk 9): walkRule
starts at its approach, and no path end is asked of its doors."""
from types import SimpleNamespace

from workbench import rules


def _scene(paths=()):
    ground = SimpleNamespace(extent_m=1000.0)
    return SimpleNamespace(paths=list(paths), placeId="place.x.lair", ground=lambda: ground)


LAIR = {"networkTerminals": [], "approaches": [
    {"id": "approach.lair.east", "mode": "walk", "fromDirection": "east", "viaUV": [[0.5, 0.25]]}]}


def test_a_lair_with_no_way_is_off_network_and_walks_from_its_approach(monkeypatch):
    monkeypatch.setattr(rules, "_blueprint", lambda scene: LAIR)
    scene = _scene()
    assert rules.off_network(scene)
    assert rules.terminal(scene) == (500.0, 250.0)
    assert rules.path_reach(None, scene) == {"pieces": {}, "failures": [], "offNetwork": True}


def test_a_place_with_a_terminal_or_a_path_is_on_the_network(monkeypatch):
    on_road = dict(LAIR, networkTerminals=[{"entryUV": [0.1, 0.2]}])
    monkeypatch.setattr(rules, "_blueprint", lambda scene: on_road)
    assert not rules.off_network(_scene())
    monkeypatch.setattr(rules, "_blueprint", lambda scene: LAIR)
    assert not rules.off_network(_scene([{"id": "route.x.track", "pointsM": [[0, 0], [1, 1]]}]))
    by_road = dict(LAIR, approaches=[{"fromRouteId": "route.x", "fromDirection": "east",
                                      "viaUV": [[0.5, 0.25]]}])
    monkeypatch.setattr(rules, "_blueprint", lambda scene: by_road)
    assert not rules.off_network(_scene())

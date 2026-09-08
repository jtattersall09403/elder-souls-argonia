"""Major-waterway publication and stable route identity contracts."""

from __future__ import annotations

import json

import pytest

from . import compile_society as cs
from . import route_registry as rr


def _lane(x=1):
    return [{"from": "a", "to": "b", "px": [[x, 0], [2, 0]]}]


def test_unchanged_fit_inputs_preserve_a_reviewed_major_lane(tmp_path):
    fit = {"laneTerminals": {"b": [0.2, 0.3]}, "rasterSize": [8, 8]}
    assert cs.publish_waterways(_lane(), _lane(3), fit, tmp_path) is True
    repaired = {"lanes": [{"id": "route.boat.a-b", "from": "renamed-a", "to": "b",
                            "px": [[9, 9], [8, 8]]}]}
    (tmp_path / "waterways.json").write_text(json.dumps(repaired))

    assert cs.publish_waterways(_lane(), _lane(3), fit, tmp_path) is False
    assert json.loads((tmp_path / "waterways.json").read_text()) == repaired


def test_any_fit_input_change_invalidates_major_lane_publication(tmp_path):
    first = {"laneTerminals": {"b": [0.2, 0.3]}, "rasterSize": [8, 8]}
    cs.publish_waterways(_lane(), _lane(3), first, tmp_path)
    (tmp_path / "waterways.json").write_text('{"lanes":[]}')
    changed = {**first, "laneTerminals": {"b": [0.25, 0.3]}}

    assert cs.publish_waterways(_lane(), _lane(4), changed, tmp_path) is True
    assert json.loads((tmp_path / "waterways.json").read_text())["lanes"] == _lane(4)


def _registry(tmp_path):
    path = tmp_path / "registry.json"
    path.write_text(json.dumps({"schemaVersion": 1, "routes": [{
        "id": "route.boat.a-b", "mode": "boat", "from": "a", "to": "b",
        "name": "A–B lane", "class": "lane"
    }, {
        "id": "route.road.a-b", "mode": "road", "from": "a", "to": "b",
        "name": "A–B road", "class": "road"
    }]}))
    return path


def test_attach_keeps_stable_id_when_repair_changed_endpoint_labels(tmp_path):
    (tmp_path / "waterways-natural.json").write_text(json.dumps({"lanes": _lane()}))
    repaired = [{"id": "route.boat.a-b", "from": "new-a", "to": "b", "px": [[9, 9]]}]
    (tmp_path / "waterways.json").write_text(json.dumps({"lanes": repaired}))
    rr.attach(tmp_path, _registry(tmp_path))
    lane = json.loads((tmp_path / "waterways.json").read_text())["lanes"][0]
    assert lane["id"] == "route.boat.a-b"
    assert lane["from"] == "new-a"


def test_attach_rejects_stable_id_from_the_wrong_mode(tmp_path):
    bad = [{"id": "route.road.a-b", "from": "a", "to": "b", "px": [[0, 0]]}]
    (tmp_path / "waterways.json").write_text(json.dumps({"lanes": bad}))
    with pytest.raises(ValueError, match="geometry mode 'boat'.*registry mode 'road'"):
        rr.attach(tmp_path, _registry(tmp_path))


def test_published_pair_fallback_requires_a_stamped_natural_lane(tmp_path):
    (tmp_path / "waterways.json").write_text(json.dumps({"lanes": _lane()}))
    with pytest.raises(ValueError, match="no stable natural identity"):
        rr.attach(tmp_path, _registry(tmp_path))

    (tmp_path / "waterways-natural.json").write_text(json.dumps({"lanes": _lane()}))
    rr.attach(tmp_path, _registry(tmp_path))
    lane = json.loads((tmp_path / "waterways.json").read_text())["lanes"][0]
    assert lane["id"] == "route.boat.a-b"

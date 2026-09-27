"""The layout-template interface (16k S10): registry, inputs, output shape."""
from __future__ import annotations

import json

import pytest

from . import layout_template as lt

TYPES_DIR = lt.REPO / ".claude/skills/place-build/references/types"


def _packet(tmp_path, **more):
    path = tmp_path / "site-packet.json"
    path.write_text(json.dumps({"schemaVersion": 1, "placeId": "place.x.y", **more}))
    return path


def test_every_registered_type_has_its_sheet_and_yard_sets():
    assert "01-road-station" in lt.REGISTRY
    for type_id, cls in lt.REGISTRY.items():
        assert cls.type_id == type_id
        assert (TYPES_DIR / f"{type_id}.md").is_file()
        assert lt.load_yard_sets(type_id)["sets"]


def test_registry_is_read_only():
    with pytest.raises(TypeError):
        lt.REGISTRY["99-x"] = lt.LayoutTemplate                     # type: ignore[index]


def test_unknown_type_names_the_registered_ones():
    with pytest.raises(KeyError, match="01-road-station"):
        lt.generator_for("99-nothing", {"placeId": "p"}, {})


def test_packet_needs_a_place_id(tmp_path):
    bad = tmp_path / "p.json"
    bad.write_text(json.dumps({"schemaVersion": 1}))
    with pytest.raises(ValueError, match="placeId"):
        lt.load_packet(bad)
    assert lt.load_packet(_packet(tmp_path))["placeId"] == "place.x.y"


def test_yard_sets_must_be_the_types_own(tmp_path):
    (tmp_path / "01-road-station.json").write_text(json.dumps({"type": "02-other", "sets": []}))
    with pytest.raises(ValueError, match="02-other"):
        lt.load_yard_sets("01-road-station", tmp_path)
    with pytest.raises(FileNotFoundError, match="0101"):
        lt.load_yard_sets("07-missing", tmp_path)


def test_road_station_is_not_written_yet(tmp_path, capsys):
    gen = lt.generator_for("01-road-station", {"placeId": "p"}, lt.load_yard_sets("01-road-station"))
    with pytest.raises(NotImplementedError, match=r"written at Claywater's close \(S10\)"):
        gen.generate()
    out = tmp_path / "layout.json"
    code = lt.main(["--type", "01-road-station", "--packet", str(_packet(tmp_path)), "--out", str(out)])
    assert code == 2 and not out.exists()
    assert "written at Claywater's close (S10)" in capsys.readouterr().err


def test_the_authored_layouts_pass_the_shape_check():
    layouts = sorted((lt.REPO / "world/sources/blueprints").glob("*.layout.json"))
    assert layouts
    for path in layouts:
        assert lt.validate_layout(json.loads(path.read_text())) == [], path.name


def test_shape_check_names_what_is_wrong():
    assert lt.validate_layout({"schemaVersion": 1, "placeId": "p", "window": {"centreKm": [0, 0], "halfM": 1},
                               "ops": [{"op": "place"}, {}]}) == ["ops[1] has no op name"]
    assert len(lt.validate_layout({})) == 4


class _Fake(lt.LayoutTemplate):
    type_id = "00-fake"

    def window(self):
        return {"centreKm": [1.0, 2.0], "halfM": 50.0}

    def ops(self):
        return [{"op": "place", "uid": "b1", "asset": self.yard_sets["sets"][0]["anchor"], "at": [1000.0, 2000.0]}]


def test_a_written_generator_emits_the_layout_file_format(tmp_path):
    gen = _Fake({"placeId": "place.x.y"}, {"sets": [{"anchor": "vanilla:a/b"}]})
    layout = gen.generate()
    out = tmp_path / "x.layout.json"
    lt.write_layout(layout, out)
    assert out.read_text() == json.dumps(layout, indent=1) + "\n"
    assert list(layout) == ["schemaVersion", "placeId", "window", "ops"]

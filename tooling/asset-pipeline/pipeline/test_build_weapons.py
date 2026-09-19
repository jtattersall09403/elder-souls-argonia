"""The modded-mesh resolver: an item's ``root`` is matched case-insensitively.

Mod archives ship mixed case (`Meshes/weapons/NewArmoury/Rapier/IronRapier.nif`)
while the arsenal declares lower-cased paths, so the only thing worth pinning
here is that a declared path finds the file whatever its case on disk, lands it
in the batch data-root at the declared (lower-cased) path, and that a path that
is absent is reported rather than silently skipped.
"""

from __future__ import annotations

import json

import pytest

from pipeline.build_weapons import (
    MAX_MOD_TEXTURE, _dir_source, convert_textures, resolve_set)


@pytest.fixture()
def tree(tmp_path):
    nif = tmp_path / "Meshes" / "Weapons" / "NewArmoury" / "Rapier"
    nif.mkdir(parents=True)
    (nif / "IronRapier.nif").write_bytes(b"NIF")
    tex = tmp_path / "Textures" / "NewArmoury"
    tex.mkdir(parents=True)
    (tex / "Blade.DDS").write_bytes(b"DDS")
    return tmp_path


def test_resolves_and_extracts_case_insensitively(tree, tmp_path):
    source = _dir_source({}, tree)
    rel = "meshes/weapons/newarmoury/rapier/ironrapier.nif"
    assert source.contains(rel)
    assert source.contains("textures/newarmoury/blade.dds")
    dest = tmp_path / "data-root"
    source.extract_many([rel], dest)
    assert (dest / rel).read_bytes() == b"NIF"


def test_absent_path_is_reported_not_guessed(tree):
    source = _dir_source({}, tree)
    assert not source.contains("meshes/weapons/newarmoury/rapier/steelrapier.nif")


def test_root_index_is_built_once_per_root(tree):
    cache: dict = {}
    first = _dir_source(cache, tree)
    assert _dir_source(cache, tree) is first
    assert list(cache) == [tree]


def test_missing_root_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        _dir_source({}, tmp_path / "nope")


def test_resolve_set_carries_root_and_defaults_to_none():
    resolved = resolve_set("arsenal", ["iron-rapier", "iron-sword"])
    items = {item["id"]: item for item in resolved["items"]}
    assert items["iron-rapier"]["root"]
    assert items["iron-sword"]["root"] is None


def test_resolve_set_carries_an_obj_and_its_named_textures():
    """The OBJ path: a mod with no NIF declares the mesh and its loose maps."""
    resolved = resolve_set("arsenal", ["wooden-ball-club"])
    item = resolved["items"][0]
    assert item["nif"] is None
    assert item["obj"].lower().endswith(".obj")
    assert set(item["textures"]) == {"diffuse", "normal", "specular"}


def _obj_config(tmp_path, monkeypatch, entry):
    """One-item config around an entry, so `orient` validation can be exercised."""
    from pipeline import build_weapons as bw

    config = tmp_path / "weapons"
    config.mkdir(exist_ok=True)
    (config / "one.json").write_text(json.dumps({
        "classes": {"mace": {"lengthMeters": 0.8, "sheathSocket": "WeaponMace"}},
        "items": [{"id": "club", "class": "mace", "material": "wood", **entry}],
    }))
    monkeypatch.setattr(bw, "CONFIG", config)
    return bw


def test_obj_without_an_orient_block_is_rejected(tmp_path, monkeypatch):
    """An OBJ with no orient would build lying on whatever axis its modeller used."""
    bw = _obj_config(tmp_path, monkeypatch, {"obj": "a.obj"})
    with pytest.raises(ValueError, match="club"):
        bw.resolve_set("one", None)


def test_orient_tip_syntax_is_rejected(tmp_path, monkeypatch):
    bw = _obj_config(tmp_path, monkeypatch,
                     {"obj": "a.obj", "orient": {"tip": "y", "grip": 0.1}})
    with pytest.raises(ValueError, match="orient.tip"):
        bw.resolve_set("one", None)


def test_orient_grip_outside_the_handle_is_rejected(tmp_path, monkeypatch):
    """0.9 up the length is the blade, not the hand: a typo, not a choice."""
    bw = _obj_config(tmp_path, monkeypatch,
                     {"obj": "a.obj", "orient": {"tip": "+y", "grip": 0.9}})
    with pytest.raises(ValueError, match="orient.grip"):
        bw.resolve_set("one", None)


def test_orient_edge_on_the_tip_axis_is_rejected(tmp_path, monkeypatch):
    """The edge faces across the blade; along it, the rotation is degenerate."""
    bw = _obj_config(tmp_path, monkeypatch,
                     {"obj": "a.obj", "orient": {"tip": "+y", "edge": "+y", "grip": 0.1}})
    with pytest.raises(ValueError, match="orient.edge"):
        bw.resolve_set("one", None)


def test_a_nif_item_carries_no_orient():
    """A NIF is authored about the hand node already; orienting it would move it."""
    resolved = resolve_set("arsenal", ["iron-sword"])
    assert resolved["items"][0]["orient"] is None


def test_every_arsenal_obj_item_declares_an_orient_and_no_nif_item_does():
    import json as _json
    from pipeline.build_weapons import CONFIG

    config = _json.loads((CONFIG / "arsenal.json").read_text())
    for entry in config["items"]:
        assert bool(entry.get("obj")) == bool(entry.get("orient")), entry["id"]


def test_declaring_both_a_nif_and_an_obj_is_rejected(tmp_path, monkeypatch):
    """Exactly one mesh per item: two would silently build whichever came first."""
    import json
    from pipeline import build_weapons as bw

    config = tmp_path / "weapons"
    config.mkdir()
    (config / "both.json").write_text(json.dumps({
        "classes": {"mace": {"lengthMeters": 0.8, "sheathSocket": "WeaponMace"}},
        "items": [{"id": "x", "class": "mace", "material": "wood",
                   "nif": "a.nif", "obj": "a.obj"}],
    }))
    monkeypatch.setattr(bw, "CONFIG", config)
    with pytest.raises(ValueError, match="exactly one of nif / obj"):
        bw.resolve_set("both", None)


def _tga(path, size):
    from PIL import Image
    Image.new("RGB", size, (10, 120, 200)).save(path, format="TGA")


def test_convert_textures_writes_png_and_caps_the_longest_side(tmp_path):
    """glTF cannot carry a TGA, and a 4K map on a hand prop is pure download."""
    from PIL import Image

    src = tmp_path / "warhammer_diff.tga"
    _tga(src, (4096, 2048))
    out = convert_textures({"diffuse": src}, tmp_path / "png")
    dest = out["diffuse"]
    assert dest.suffix == ".png"
    with Image.open(dest) as image:
        assert image.format == "PNG"
        assert max(image.size) == MAX_MOD_TEXTURE
        assert image.size == (MAX_MOD_TEXTURE, MAX_MOD_TEXTURE // 2)


def test_convert_textures_leaves_a_small_map_at_its_own_size(tmp_path):
    from PIL import Image

    src = tmp_path / "club_diff.tga"
    _tga(src, (512, 512))
    out = convert_textures({"diffuse": src}, tmp_path / "png")
    with Image.open(out["diffuse"]) as image:
        assert image.size == (512, 512)

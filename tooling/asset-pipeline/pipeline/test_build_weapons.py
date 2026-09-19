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

from pipeline.build_weapons import _dir_source, resolve_set


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

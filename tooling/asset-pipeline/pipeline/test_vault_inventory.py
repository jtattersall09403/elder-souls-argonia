"""Folder grouping and coverage maths for the vault inventory.

Runs on a synthetic listing so it never touches the vault (CI has no vault).
"""

from pipeline.vault_inventory import (
    AssetSet, ModSource, build_sets, id_to_key, mesh_key, need_family, is_noise,
)


def test_mesh_key_anchors_on_meshes_segment():
    # Archive folders, Data wrappers and casing all normalise to one key.
    assert mesh_key("00 Core/Data/Meshes/Architecture/Hut01.NIF") == \
        "meshes/architecture/hut01.nif"
    assert mesh_key("meshes/a/b.nif") == "meshes/a/b.nif"
    # A loose mesh with no meshes/ folder is still rooted there.
    assert mesh_key("stilthouse.nif") == "meshes/stilthouse.nif"
    # LOD variants collapse onto their full-detail piece.
    assert mesh_key("meshes/x/rock01_lod_1.nif") == "meshes/x/rock01.nif"
    assert mesh_key("textures/x/y.dds") is None


def test_id_to_key():
    assert id_to_key("bmv:architecture/stilthouse/ext") == \
        "meshes/architecture/stilthouse/ext.nif"
    assert id_to_key("vanilla:clutter/barrel01.nif") == "meshes/clutter/barrel01.nif"


def test_need_family_and_noise():
    assert need_family("meshes/actors/mudcrab") == "creatures"
    assert need_family("meshes/architecture/citebosmer/passerelles") == "settlement kit"
    assert need_family("meshes/dungeons/nordic/chambers") == "dungeon tileset"
    assert need_family("meshes/effects") == "effects"
    assert need_family("meshes/yamadori/ferries") == "docks/boats"
    assert is_noise("meshes/actors/character/facegendata/facegeom/skyrim.esm")
    assert not is_noise("meshes/architecture/markarth")


SYNTH = [
    ModSource("modA", "modA", [
        "Data/meshes/architecture/reedhut/wall01.nif",
        "Data/meshes/architecture/reedhut/wall02.nif",
        "Data/meshes/architecture/reedhut/roofint01.nif",
        "Data/meshes/architecture/reedhut/wall01.dds",   # not a mesh
        "Data/meshes/actors/lurcher/lurcher.nif",
        "Data/meshes/actors/lurcher/character assets/skeleton.nif",
        "Data/meshes/actors/lurcher/character assets/body.nif",
    ]),
]


def _sets():
    known = {"meshes/architecture/reedhut/wall01.nif",
             "meshes/architecture/reedhut/wall02.nif"}
    packaged = {"meshes/architecture/reedhut/wall01.nif"}
    return {s.folder: s for s in build_sets(SYNTH, known, packaged)}


def test_grouping_is_by_author_folder():
    sets = _sets()
    assert sets["meshes/architecture/reedhut"].total == 3
    assert set(sets) == {
        "meshes/architecture/reedhut",
        "meshes/actors/lurcher",
        "meshes/actors/lurcher/character assets",
    }


def test_coverage_counts_known_and_packaged_separately():
    s = _sets()["meshes/architecture/reedhut"]
    assert (s.known, s.packaged) == (2, 1)
    assert round(s.known_pct, 3) == 0.667
    assert round(s.packaged_pct, 3) == 0.333
    # `roofint01` is an interior piece; `wall01` is not.
    assert s.interiors == 1


def test_skeleton_marks_the_whole_actor_rigged():
    sets = _sets()
    # The skeleton sits in `character assets/`, the body mesh does not — both
    # folders must come back rigged, under the same actor root.
    assert sets["meshes/actors/lurcher"].rigged
    assert sets["meshes/actors/lurcher/character assets"].rigged
    assert sets["meshes/actors/lurcher"].actor_root == "meshes/actors/lurcher"
    assert sets["meshes/actors/lurcher"].family == "creatures"


def test_empty_set_has_no_divide_by_zero():
    s = AssetSet("m", "meshes/x")
    assert s.packaged_pct == 0.0 and s.known_pct == 0.0

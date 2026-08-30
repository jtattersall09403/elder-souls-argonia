import json
import struct

import pytest

from .build_kit import (
    DirSource, RarSource, _default_collision, _flat_lod_of, set_alpha_modes,
)


def test_only_flat_lod_variants_become_billboards():
    # `_lod`/`_distant` siblings are decimated full meshes — our own LOD chain
    # already covers those; only the authored flat cards are the T4 tier.
    assert _flat_lod_of({"lodVariant": "meshes/t/x_lod_flat.nif"}) == (
        "meshes/t/x_lod_flat.nif"
    )
    assert _flat_lod_of({"lodVariant": "meshes/t/x_lod.nif"}) is None
    assert _flat_lod_of({"lodVariant": "meshes/t/x_distant.nif"}) is None
    assert _flat_lod_of({}) is None


def test_rar_source_maps_lowercase_paths_back_to_real_member_names(tmp_path):
    listing = tmp_path / "manifest.txt"
    listing.write_text(
        "meshes/architecture/Phitt/ashlands/tramaroot01.nif\n"
        "meshes\\landscape\\Trees\\BeachPalm1.nif\n"
    )
    source = RarSource(tmp_path / "Data1.rar", listing)
    assert source.contains("meshes/architecture/phitt/ashlands/tramaroot01.nif")
    assert source.names["meshes/landscape/trees/beachpalm1.nif"] == (
        "meshes/landscape/Trees/BeachPalm1.nif"
    )
    assert not source.contains("meshes/nope.nif")


def test_dir_source_is_case_insensitive(tmp_path):
    target = tmp_path / "Meshes" / "Plants" / "Fern.nif"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"nif")
    source = DirSource(tmp_path)
    assert source.contains("meshes/plants/fern.nif")
    out = tmp_path / "out"
    source.extract_many(["meshes/plants/fern.nif"], out)
    assert (out / "meshes/plants/fern.nif").read_bytes() == b"nif"


def test_collision_proxy_follows_the_tiered_rule():
    assert _default_collision({"category": "tree"}) == "trunk-capsule"
    assert _default_collision({"category": "grass"}) == "none"
    assert _default_collision({"category": "aquatic-plant"}) == "none"
    assert _default_collision({"category": "architecture"}) == "mesh"
    assert _default_collision({"category": "rock"}) == "convex"


def _make_glb(path, gltf, binary=b"\x00\x00\x00\x00"):
    encoded = json.dumps(gltf).encode()
    encoded += b" " * (-len(encoded) % 4)
    body = struct.pack("<I4s", len(encoded), b"JSON") + encoded
    body += struct.pack("<I4s", len(binary), b"BIN\x00") + binary
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body)


def test_set_alpha_modes_masks_foliage_and_clears_everything_else(tmp_path):
    glb = tmp_path / "kit.glb"
    _make_glb(glb, {
        "asset": {"version": "2.0"},
        "materials": [
            {"name": "leaf", "alphaMode": "BLEND"},
            {"name": "bark", "alphaMode": "BLEND"},
            {"name": "stone"},
            {"name": "card", "alphaMode": "BLEND"},
        ],
    })
    summary = {"assets": [
        {"alphaTest": True, "materials": ["leaf", "bark"]},
        # Billboard cards are cutouts even on a non-alpha-tested base asset.
        {"alphaTest": False, "materials": ["stone"],
         "billboardMaterials": ["card"]},
    ]}

    counts = set_alpha_modes(glb, summary)

    assert counts == {"MASK": 3, "OPAQUE": 1}
    data = glb.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF" and length == len(data)   # header length rewritten
    chunk_length, chunk_type = struct.unpack_from("<I4s", data, 12)
    assert chunk_type == b"JSON" and chunk_length % 4 == 0
    gltf = json.loads(data[20:20 + chunk_length])
    modes = {m["name"]: (m.get("alphaMode"), m.get("alphaCutoff")) for m in gltf["materials"]}
    assert modes["leaf"] == ("MASK", 0.5)
    assert modes["bark"] == ("MASK", 0.5)
    assert modes["stone"] == (None, None)
    assert modes["card"] == ("MASK", 0.5)
    # The binary chunk must survive the JSON rewrite intact.
    assert data[20 + chunk_length + 8:] == b"\x00\x00\x00\x00"


def test_set_alpha_modes_rejects_a_file_that_is_not_a_glb(tmp_path):
    path = tmp_path / "not.glb"
    path.write_bytes(b"nope" + b"\x00" * 32)
    with pytest.raises(ValueError):
        set_alpha_modes(path, {"assets": []})


def test_find_by_basename_prefers_the_closest_folder_match(tmp_path):
    for rel in ("textures/landscape/plants/bamboo.dds",
                "textures/landscape/Tamira/NewPlants/Bamboo.dds",
                "textures/armor/unrelated/bamboo.dds"):
        target = tmp_path / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"dds")
    source = DirSource(tmp_path)
    # The mesh asks for a path no pool ships; the Tamira copy shares two
    # trailing folders with the request and must win.
    assert source.find_by_basename("textures/plants/tamira/newplants/bamboo.dds") == (
        "textures/landscape/tamira/newplants/bamboo.dds"
    )
    assert source.find_by_basename("textures/plants/nothing/absent.dds") is None

import json
import struct

import pytest

from pathlib import Path

from . import build_kit
from .build_kit import (
    CARD_ATLAS_MAX_PX, DirSource, RarSource, _default_collision, _flat_lod_of,
    _part_specs, bakes_own_card, card_resolution_px, pack_card_tiles, plan_lod_levels,
    resolve_bake_card,
    resolve_lod_ratios,
    set_alpha_modes,
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


def test_set_alpha_modes_masks_a_nif_cutout_at_its_own_threshold(tmp_path):
    # 16h check-in 2 item 8: an NiAlphaProperty on a non-foliage piece (the
    # HTBM hut fringe, test 0x12ec) shipped OPAQUE; it is a MASK now.
    glb = tmp_path / "kit.glb"
    _make_glb(glb, {"asset": {"version": "2.0"}, "materials": [
        {"name": "OrcAwningFull01:1.Mat", "alphaMode": "BLEND"},
        {"name": "HutWalls.Mat"},
        {"name": "Farmhouse01:14.Mat"},
    ]})
    summary = {"assets": [{"alphaTest": False,
        "materials": ["OrcAwningFull01:1.Mat", "HutWalls.Mat"],
        "alphaMaskMaterials": {"OrcAwningFull01:1.Mat": 0.502}},
        {"alphaTest": False, "materials": ["Farmhouse01:14.Mat"],
         "glowMaterials": ["Farmhouse01:14.Mat"]}]}
    assert set_alpha_modes(glb, summary) == {"MASK": 1, "OPAQUE": 2}
    data = glb.read_bytes()
    chunk_length = struct.unpack_from("<I", data, 12)[0]
    modes = {m["name"]: (m.get("alphaMode"), m.get("alphaCutoff"))
             for m in json.loads(data[20:20 + chunk_length])["materials"]}
    assert modes["OrcAwningFull01:1.Mat"] == ("MASK", 0.502)
    assert modes["HutWalls.Mat"] == (None, None)
    assert modes["Farmhouse01:14.Mat"] == (None, None)   # glow is not alpha


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


def test_an_ordinary_entry_is_its_own_single_part():
    assert _part_specs({"asset": "bmv:landscape/trees/cypress1"}) == [
        {"asset": "bmv:landscape/trees/cypress1"}
    ]


def test_a_composite_entry_resolves_to_its_source_parts():
    # The composite's OWN id is free-form and has no registry row — the roof
    # trees are assembled from Tropical Skyrim's Anvil pieces (round 7).
    entry = {
        "asset": "composite:jungle/anvil-canopy-tree",
        "compose": {"parts": [
            {"asset": "tropical:landscape/trees/anvil_palm_trunk"},
            {"asset": "tropical:landscape/trees/anvil_palm foliage",
             "offsetM": [0.0, 0.0, 29.0], "yawDeg": 0, "scale": 1.0},
        ]},
    }
    parts = _part_specs(entry)
    assert [p["asset"] for p in parts] == [
        "tropical:landscape/trees/anvil_palm_trunk",
        "tropical:landscape/trees/anvil_palm foliage",
    ]
    # Placement travels with the part, not the entry.
    assert parts[1]["offsetM"] == [0.0, 0.0, 29.0]


def test_an_empty_composite_is_a_config_error_not_an_empty_tree():
    with pytest.raises(ValueError):
        _part_specs({"asset": "composite:x", "compose": {"parts": []}})


# --- derived far-tier cards ---------------------------------------------------


def test_card_resolution_class_by_height():
    assert card_resolution_px(0.4) == 128     # ground cover
    assert card_resolution_px(1.49) == 128
    assert card_resolution_px(1.5) == 256     # shrub / small tree
    assert card_resolution_px(7.99) == 256
    assert card_resolution_px(8.0) == 512     # canopy tree
    assert card_resolution_px(31.0) == 512
    assert card_resolution_px(0.4, [64, 128, 256]) == 64
    assert card_resolution_px(30.0, [64, 128, 256]) == 256


def test_atlas_packing_arithmetic():
    # 512 px tiles: 4 x 4 = 16 per 2048 atlas.
    tiles, sizes = pack_card_tiles(17, 512)
    assert len(tiles) == 17
    assert sizes == [(2048, 2048), (512, 512)]
    assert tiles[0] == (0, [0.0, 0.75, 0.25, 1.0])     # top-left tile
    assert tiles[3] == (0, [0.75, 0.75, 1.0, 1.0])     # top-right
    assert tiles[4] == (0, [0.0, 0.5, 0.25, 0.75])     # second row
    assert tiles[15] == (0, [0.75, 0.0, 1.0, 0.25])    # bottom-right
    assert tiles[16] == (1, [0.0, 0.0, 1.0, 1.0])      # alone on atlas 1

    # 128 px tiles: 16 x 16 = 256 per atlas; 8 x 8 = 64 at 256 px.
    assert pack_card_tiles(257, 128)[1] == [(2048, 2048), (128, 128)]
    assert pack_card_tiles(65, 256)[1] == [(2048, 2048), (256, 256)]

    # A part-filled atlas is trimmed to the rows and columns it uses.
    tiles, sizes = pack_card_tiles(6, 512)
    assert sizes == [(2048, 1024)]
    assert tiles[0] == (0, [0.0, 0.5, 0.25, 1.0])
    assert tiles[5] == (0, [0.25, 0.0, 0.5, 0.5])
    assert pack_card_tiles(2, 512)[1] == [(1024, 512)]
    assert pack_card_tiles(0, 512) == ([], [])

    # Every rect is inside the atlas and no two of a class overlap.
    tiles, sizes = pack_card_tiles(40, 256, CARD_ATLAS_MAX_PX)
    seen = set()
    for atlas, rect in tiles:
        assert all(0.0 <= c <= 1.0 for c in rect)
        assert rect[0] < rect[2] and rect[1] < rect[3]
        assert (atlas, tuple(rect)) not in seen
        seen.add((atlas, tuple(rect)))


def test_card_packing_rule_is_identical_in_the_blender_half():
    # The Blender process cannot import this package, so the two pure
    # functions are duplicated there. Drift would mean cards whose UV rect
    # does not match the atlas they were blitted into.
    import re
    here = Path(__file__).resolve().parent
    pattern = re.compile(
        r"\ndef card_resolution_px.*?\n    return tiles, sizes\n", re.S)
    host = pattern.search((here / "build_kit.py").read_text())
    blender = pattern.search((here / "blender" / "build_kit.py").read_text())
    assert host and blender
    assert host.group(0) == blender.group(0)


def test_a_mesh_under_the_floor_still_publishes_a_full_ladder_sharing_its_primitive():
    # 16h part 1 round 4: a 32-triangle ruin block (sirenroot arblockfreehollow)
    # used to publish ONE tier because levels the floor left identical were
    # skipped, and the settlement runtime refuses a chain shorter than three.
    # Every configured level is emitted; one the floor leaves identical to an
    # earlier level reuses that level's mesh (one glTF primitive, no copy).
    levels = plan_lod_levels([32], [0.35, 0.12], 300)
    assert [row["level"] for row in levels] == [1, 2]
    assert [row["sharesLevel"] for row in levels] == [0, 0]
    # 500 triangles: level 1 decimates to the floor, level 2 lands on the
    # same floor and shares level 1 rather than duplicating it.
    levels = plan_lod_levels([500], [0.35, 0.12], 300)
    assert [row["sharesLevel"] for row in levels] == [None, 1]
    assert levels[0]["effectives"] == [0.6]
    # A big mesh decimates at every level.
    levels = plan_lod_levels([12000], [0.35, 0.12], 300)
    assert [row["sharesLevel"] for row in levels] == [None, None]
    assert [row["effectives"] for row in levels] == [[0.35], [0.12]]
    # Multi-part assets compare the whole part list.
    levels = plan_lod_levels([100, 5000], [0.35, 0.12], 300)
    assert [row["sharesLevel"] for row in levels] == [None, None]


def test_lod_level_plan_is_identical_in_the_blender_half():
    import re
    here = Path(__file__).resolve().parent
    pattern = re.compile(r"\ndef plan_lod_levels.*?\n    return levels\n", re.S)
    host = pattern.search((here / "build_kit.py").read_text())
    blender = pattern.search((here / "blender" / "build_kit.py").read_text())
    assert host and blender
    assert host.group(0) == blender.group(0)


def test_lod_ratios_resolve_entry_then_category_then_kit():
    kit = {"lodRatios": [0.35, 0.12], "lodRatiosByCategory": {"rock": []}}
    assert resolve_lod_ratios({}, kit, "tree") == [0.35, 0.12]
    # Decimation multiplies boundary edges on open-shell cliff meshes, so
    # rocks ship LOD0 only.
    assert resolve_lod_ratios({}, kit, "rock") == []
    assert resolve_lod_ratios({"lodRatios": [0.5]}, kit, "rock") == [0.5]
    assert resolve_lod_ratios({}, {}, "rock") == [0.35, 0.12]


def test_every_asset_bakes_its_own_card_under_bake_cards():
    # 16f round 4: an authored `_lod_flat` is matched to a mesh by NAME
    # (an atlas rect by vanilla slot) and three trees wore another tree's
    # picture. Under `bakeCards` every asset bakes its own card; `false` is
    # the only opt-out; the old `"force"` reads as plain `true`.
    assert resolve_bake_card({}) is True
    assert resolve_bake_card({"bakeCard": False}) is False
    assert resolve_bake_card({"bakeCard": "force"}) is True
    assert resolve_bake_card({"bakeCard": "false"}) is False
    kit = {"bakeCards": True, "bakeCardSkipCategories": ["rock"]}
    assert bakes_own_card({}, kit, "tree") is True
    assert bakes_own_card({"bakeCard": False}, kit, "tree") is False
    assert bakes_own_card({}, kit, "rock") is False
    assert bakes_own_card({}, {}, "tree") is False


def _shipped_flora_cards():
    """(asset record, card mesh bounds per view) for every species in the
    SHIPPED flora kit, read from the GLB's own accessor bounds."""
    import struct
    root = Path(__file__).resolve().parents[3] / "apps/world-studio/public/kits"
    manifest = json.loads((root / "flora-province-v1.kit.json").read_text())
    with open(root / "flora-province-v1.glb", "rb") as fh:
        fh.read(12)
        length = struct.unpack("<II", fh.read(8))[0]
        gltf = json.loads(fh.read(length))
    nodes, meshes, accessors = gltf["nodes"], gltf["meshes"], gltf["accessors"]
    by_node = {n.get("name"): i for i, n in enumerate(nodes)}
    out = []
    for asset in manifest["assets"]:
        cards = []
        stack = [by_node[asset["node"]]]
        while stack:
            node = nodes[stack.pop()]
            stack.extend(node.get("children", []))
            extras = node.get("extras", {})
            if "mesh" not in node or not extras.get("billboard"):
                continue
            lo, hi = [1e9] * 3, [-1e9] * 3
            for prim in meshes[node["mesh"]]["primitives"]:
                acc = accessors[prim["attributes"]["POSITION"]]
                lo = [min(a, b) for a, b in zip(lo, acc["min"])]
                hi = [max(a, b) for a, b in zip(hi, acc["max"])]
            cards.append((node.get("name", ""), extras, lo, hi))
        out.append((asset, cards))
    return out


def test_shipped_flora_cards_are_baked_from_their_own_mesh():
    """The card↔mesh identity gate (16f round 4). Every far card in the
    shipped flora kit must be BAKED (`cardSource: "baked"`), carry this
    asset's own node hash in its name, and be the square frame
    `bake_asset_cards` renders — `max(height, footprint) × 1.02` of THIS
    asset's `sizeM`, standing on its base. A mod-authored `_lod_flat` fails
    all three: it is bound by name to an atlas rect, so it was
    `gkbjungletreenew17v2`'s picture on `hodalder01gkb`, vanilla
    `TreePineForest05`'s on `scottish-pine22`, and a single 27 m plane on the
    11 m `gkbjungletreenew30v3` (the owner's 1.11 km E / 5.21 km S tree)."""
    wrong = []
    for asset, cards in _shipped_flora_cards():
        if not cards:
            continue
        w, d, h = asset["sizeM"]
        frame = max(h, w, d) * 1.02
        node_hash = asset["node"][3:13]
        for name, extras, lo, hi in cards:
            span = [hi[i] - lo[i] for i in range(3)]
            reasons = []
            if extras.get("cardSource") != "baked":
                reasons.append("not baked")
            if node_hash not in name:
                reasons.append(f"card {name!r} is not this asset's hash {node_hash}")
            # Y is up in the GLB; the quad is square, `frame` on a side, and
            # one of X/Z is the (flat) card normal.
            if abs(span[1] - frame) > 0.05 * frame + 0.02:
                reasons.append(f"height {span[1]:.2f} != frame {frame:.2f}")
            if abs(max(span[0], span[2]) - frame) > 0.05 * frame + 0.02:
                reasons.append(f"width {max(span[0], span[2]):.2f} != frame {frame:.2f}")
            if reasons:
                wrong.append(f"{asset['id']}: " + "; ".join(reasons))
    assert not wrong, "\n".join(wrong)


def test_a_contested_texture_goes_to_the_kits_stated_pool():
    """`build_kit` fills each texture path once, so pool ORDER decides whose
    copy a kit ships. Before this, order was dict order and BM&V's texturepack
    won `textures/landscape/rocks01.dds` in flora-province-v1 over Tropical
    Skyrim's (backlog row, found 2026-09-16)."""
    wanted = {"bmv": {"textures/landscape/rocks01.dds", "textures/bmv/only.dds"},
              "vanilla": {"textures/landscape/rocks01.dds"},
              "tropical": {"textures/landscape/rocks01.dds"}}
    kit = {"id": "flora-province-v1", "texturePoolPrecedence": ["tropical", "bmv"]}
    assert build_kit.texture_pool_order(kit, wanted) == ["tropical", "bmv", "vanilla"]
    assert build_kit.contested_textures(wanted) == {"textures/landscape/rocks01.dds"}


def test_pool_order_without_a_stated_precedence_is_still_deterministic():
    wanted = {"vanilla": {"a.dds"}, "bmv": {"a.dds"}}
    assert build_kit.texture_pool_order({"id": "k"}, wanted) == ["bmv", "vanilla"]


def test_a_precedence_row_for_a_pool_the_kit_does_not_source_fails_the_build():
    with pytest.raises(ValueError, match="sources nothing from"):
        build_kit.texture_pool_order(
            {"id": "k", "texturePoolPrecedence": ["nowhere"]}, {"bmv": {"a.dds"}})


# --------------------------------------------------------------------------- #
# 16h tooling speed lane B2: whole kits built concurrently
# --------------------------------------------------------------------------- #
def _fake_build(kit_id, vault):
    import os
    import time
    time.sleep(0.3)
    return {"kit": kit_id, "pid": os.getpid()}


def test_build_many_runs_kits_concurrently_in_input_order():
    import time
    t = time.perf_counter()
    out = build_kit.build_many(["a", "b", "a"], Path("/vault"), jobs=2,
                               builder=_fake_build)
    assert [s["kit"] for s in out] == ["a", "b"]           # deduplicated, in order
    assert out[0]["pid"] != out[1]["pid"]                  # one process per kit
    assert time.perf_counter() - t < 0.55                  # the two overlapped


def test_build_many_serial_when_jobs_is_one():
    out = build_kit.build_many(["a", "b"], Path("/vault"), jobs=1, builder=_fake_build)
    assert [s["kit"] for s in out] == ["a", "b"]


def test_default_kit_jobs_is_recorded():
    assert 1 <= build_kit.DEFAULT_KIT_JOBS <= 3


@pytest.mark.skipif(not __import__("os").environ.get("ES_TOOLCHAIN_TESTS"),
                    reason="set ES_TOOLCHAIN_TESTS=1: builds two kits under Wine+Blender")
def test_two_tiny_kits_build_identically_serial_and_concurrent(tmp_path, monkeypatch):
    config = tmp_path / "config"
    config.mkdir()
    assets = {"b2-tiny-a": "vanilla:clutter/signage/roadsigns/roadsignpost",
              "b2-tiny-b": "vanilla:clutter/books/note01/note01"}
    manifests = {}
    for n in (1, 2):
        for kit_id, asset in assets.items():
            (config / f"{kit_id}.json").write_text(json.dumps({
                "id": kit_id, "output": str(tmp_path / "out" / f"{kit_id}.glb"),
                "lodRatios": [0.35], "publish": False, "assets": [{"asset": asset}]}))
        monkeypatch.setattr(build_kit, "CONFIG", config)
        # a throwaway kit id has no authored placement policy; that pass is
        # host-side and serial either way, so it is not what is compared here
        monkeypatch.setattr(build_kit, "apply_placement_metadata", lambda *a: None)
        build_kit.build_many(list(assets), build_kit.DEFAULT_VAULT, jobs=n)
        # the same output path both times: the manifest records it
        manifests[n] = {k: (tmp_path / "out" / f"{k}.kit.json").read_bytes()
                        for k in assets}
    assert manifests[1] == manifests[2]

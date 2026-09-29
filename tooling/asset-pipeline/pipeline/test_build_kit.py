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

    assert counts == {"MASK": 3, "OPAQUE": 1, "BLEND": 0}
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


def test_set_alpha_modes_cuts_foliage_at_the_nif_threshold(tmp_path):
    # Walk 5: the mangroves' leaves test at 45/255 in their NIF; a fixed 0.5
    # drew bare branches. A foliage material with an NiAlphaProperty ships at
    # its own cutoff, one without keeps 0.5, and the baked card stays 0.5.
    glb = tmp_path / "kit.glb"
    _make_glb(glb, {"asset": {"version": "2.0"}, "materials": [
        {"name": "leaf", "alphaMode": "BLEND"}, {"name": "bark", "alphaMode": "BLEND"},
        {"name": "card", "alphaMode": "BLEND"}]})
    summary = {"assets": [{"alphaTest": True, "materials": ["leaf", "bark"],
                           "alphaMaskMaterials": {"leaf": 0.176},
                           "billboardMaterials": ["card"]}]}
    assert set_alpha_modes(glb, summary) == {"MASK": 3, "OPAQUE": 0, "BLEND": 0}
    data = glb.read_bytes()
    chunk_length = struct.unpack_from("<I", data, 12)[0]
    cut = {m["name"]: m.get("alphaCutoff")
           for m in json.loads(data[20:20 + chunk_length])["materials"]}
    assert cut == {"leaf": 0.176, "bark": 0.5, "card": 0.5}


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
    assert set_alpha_modes(glb, summary) == {"MASK": 1, "OPAQUE": 2, "BLEND": 0}
    data = glb.read_bytes()
    chunk_length = struct.unpack_from("<I", data, 12)[0]
    modes = {m["name"]: (m.get("alphaMode"), m.get("alphaCutoff"))
             for m in json.loads(data[20:20 + chunk_length])["materials"]}
    assert modes["OrcAwningFull01:1.Mat"] == ("MASK", 0.502)
    assert modes["HutWalls.Mat"] == (None, None)
    assert modes["Farmhouse01:14.Mat"] == (None, None)   # glow is not alpha


def test_set_alpha_modes_flags_a_nif_decal_material_and_only_it(tmp_path):
    # 16h check-in 3 item 3: impfreewall01's ImpDirt01 overlay (SLSF1 Decal |
    # Dynamic_Decal) duplicates every plane of the skirting band; with no flag
    # the pair z-fought. The Blender half lists it in `decalMaterials`; this
    # pass writes the runtime's field, the material extra `decal: true`.
    glb = tmp_path / "kit.glb"
    _make_glb(glb, {"asset": {"version": "2.0"}, "materials": [
        {"name": "ImpDirt01:5.Mat", "extras": {"decal": True, "keep": 1}},
        {"name": "ImpWall06:14.Mat", "extras": {"decal": True}},
    ]})
    summary = {"assets": [{"alphaTest": False,
        "materials": ["ImpDirt01:5.Mat", "ImpWall06:14.Mat"],
        "alphaMaskMaterials": {"ImpDirt01:5.Mat": 0.42},
        "decalMaterials": ["ImpDirt01:5.Mat"]}]}
    set_alpha_modes(glb, summary)
    data = glb.read_bytes()
    chunk_length = struct.unpack_from("<I", data, 12)[0]
    mats = {m["name"]: m for m in json.loads(data[20:20 + chunk_length])["materials"]}
    assert mats["ImpDirt01:5.Mat"]["extras"] == {"decal": True, "keep": 1}
    assert mats["ImpDirt01:5.Mat"]["alphaMode"] == "MASK"
    assert "extras" not in mats["ImpWall06:14.Mat"]     # a stale flag is cleared


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


def _meeting_fake_build(kit_id, vault, meet_dir=None, peers=2, wait_s=5.0):
    """Records its own [start, end] on the system-wide monotonic clock, and
    between them waits (up to `wait_s`) until `peers` builds have started:
    run concurrently they meet at once; run in turn the first gives up after
    `wait_s` and ends before the second starts."""
    import os
    import time
    start = time.monotonic()
    (Path(meet_dir) / kit_id).touch()
    deadline = start + wait_s
    while len(list(Path(meet_dir).iterdir())) < peers and time.monotonic() < deadline:
        time.sleep(0.01)
    return {"kit": kit_id, "pid": os.getpid(), "span": (start, time.monotonic())}


def test_build_many_runs_kits_concurrently_in_input_order(tmp_path):
    """The two builds' intervals overlap (the later start is before the
    earlier end), measured by the builds themselves, so machine load can
    slow them without failing the test (the old < 1.5 s wall bar flaked
    under load, speed lane 2 Rec 6); serial runs cannot overlap and fail."""
    import functools
    builder = functools.partial(_meeting_fake_build, meet_dir=str(tmp_path))
    out = build_kit.build_many(["a", "b", "a"], Path("/vault"), jobs=2, builder=builder)
    assert [s["kit"] for s in out] == ["a", "b"]           # deduplicated, in order
    assert out[0]["pid"] != out[1]["pid"]                  # one process per kit
    starts, ends = zip(*(s["span"] for s in out))
    assert max(starts) < min(ends), f"the builds ran in turn: spans {[s['span'] for s in out]}"


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


# --- one composite yaw convention (16h check-in 3 item 4) ------------------ #
def composite_yaw_mismatches(config_dir: Path, assemblies: dict) -> list[str]:
    """`<kit> <composite> part <n>` for every part that names its mined
    `template` and carries a yaw other than the template's. The rule: a part's
    `yawDeg` IS the mined relative yaw (clockwise from above, as
    `kit-assemblies-mined.json` records it); `blender/build_kit.py
    import_composite` converts the sign once. A config that inverts by hand
    (the bamboo hut leaf turned 240 deg off) fails here."""
    templates = {t["id"]: t for s in assemblies["sets"].values() for t in s["templates"]}
    out = []
    for path in sorted(config_dir.glob("*.json")):
        for entry in json.loads(path.read_text()).get("assets", []):
            for n, part in enumerate((entry.get("compose") or {}).get("parts", [])):
                if "template" not in part:
                    continue
                template = templates.get(part["template"])
                if template is None:
                    out.append(f"{path.stem} {entry['asset']} part {n}: no template {part['template']}")
                    continue
                d = (float(part.get("yawDeg", 0.0)) - float(template["yawDeg"]) + 180.0) % 360.0 - 180.0
                if abs(d) > 0.05:
                    out.append(f"{path.stem} {entry['asset']} part {n}: yaw {part.get('yawDeg')} "
                               f"vs mined {template['yawDeg']}")
    return out


_ASSEMBLIES = build_kit.REPO_ROOT / "world/sources/placement/kit-assemblies-mined.json"
_CONFIGS = Path(build_kit.__file__).resolve().parent / "config" / "kits"


def test_every_templated_composite_part_carries_its_mined_yaw():
    assemblies = json.loads(_ASSEMBLIES.read_text())
    assert composite_yaw_mismatches(_CONFIGS, assemblies) == []
    # the templated parts exist: the check is not vacuous
    named = sum(1 for p in _CONFIGS.glob("*.json") for e in json.loads(p.read_text()).get("assets", [])
                for part in (e.get("compose") or {}).get("parts", []) if "template" in part)
    assert named >= 12


def test_the_yaw_check_fails_on_a_hand_inverted_yaw(tmp_path):
    assemblies = json.loads(_ASSEMBLIES.read_text())
    config = json.loads((_CONFIGS / "settlement-stilt-v1.json").read_text())
    for entry in config["assets"]:
        for part in (entry.get("compose") or {}).get("parts", []):
            if part.get("template") == "htbm:t0027":
                part["yawDeg"] = 360 - part["yawDeg"]      # 120 -> 240: the check-in 3 leaf
    (tmp_path / "settlement-stilt-v1.json").write_text(json.dumps(config))
    assert composite_yaw_mismatches(tmp_path, assemblies) == [
        "settlement-stilt-v1 composite:stilt/bamboohut01-with-door part 1: yaw 240 vs mined 120.0"]


def test_set_alpha_modes_blends_an_effect_card_and_flags_it_additive(tmp_path):
    # 16k kits lane 2: campfire01burning's flame-glow cards (BSEffectShader)
    # shipped MASK/opaque, i.e. solid cards. An `"effect": "additive"` piece
    # lists them in `additiveMaterials`; they ship BLEND with `additive: true`,
    # and win over an alpha-test mask the same material also carries.
    glb = tmp_path / "kit.glb"
    _make_glb(glb, {"asset": {"version": "2.0"}, "materials": [
        {"name": "Glow02:0.Mat", "alphaMode": "MASK", "alphaCutoff": 0.5},
        {"name": "Ash.Mat"},
    ]})
    summary = {"assets": [{"alphaTest": False, "materials": ["Glow02:0.Mat", "Ash.Mat"],
                           "alphaMaskMaterials": {"Glow02:0.Mat": 0.5},
                           "additiveMaterials": ["Glow02:0.Mat"],
                           "additiveGains": {"Glow02:0.Mat": 1.6}}]}
    assert set_alpha_modes(glb, summary) == {"MASK": 0, "OPAQUE": 1, "BLEND": 1}
    data = glb.read_bytes()
    chunk_length = struct.unpack_from("<I", data, 12)[0]
    materials = {m["name"]: m for m in json.loads(data[20:20 + chunk_length])["materials"]}
    assert materials["Glow02:0.Mat"]["alphaMode"] == "BLEND"
    assert "alphaCutoff" not in materials["Glow02:0.Mat"]
    assert materials["Glow02:0.Mat"]["extras"] == {"additive": True, "gain": 1.6}
    assert "alphaMode" not in materials["Ash.Mat"] and "extras" not in materials["Ash.Mat"]


def test_light_records_copy_the_config_block_and_refuse_a_partial_one():
    from pipeline.build_kit import apply_light_records
    light = {"formId": "000af8ba", "burnSeconds": -1, "radiusUnits": 512, "colourRgb": [226, 140, 63],
             "flags": ["dynamic", "flicker"]}
    summary = {"assets": [{"id": "a"}, {"id": "b", "light": {"stale": True}}]}
    kit = {"assets": [{"asset": "a", "light": light}, {"asset": "b"}]}
    assert apply_light_records(summary, kit) == 1
    assert summary["assets"][0]["light"] == light
    assert "light" not in summary["assets"][1]
    with pytest.raises(ValueError, match="radiusUnits"):
        apply_light_records({"assets": [{"id": "a"}]},
                            {"assets": [{"asset": "a", "light": {"formId": "x", "burnSeconds": -1,
                                                          "colourRgb": [1, 1, 1], "flags": []}}]})


# --- 16k fix round 2: unresolved diffuse gate and glow facings -------------

PUBLIC_KITS = Path(__file__).resolve().parents[3] / "apps/world-studio/public/kits"


def test_diffuse_classification_reads_the_slot_suffix():
    from pipeline.build_kit import is_diffuse_texture
    assert is_diffuse_texture("textures/_resourcepack/landscape/desertcracked01_d.dds")
    assert is_diffuse_texture("textures/creationclub/bgssse025/clutter/amber.dds")
    assert not is_diffuse_texture("textures/creationclub/bgssse025/clutter/amber_n.dds")
    assert not is_diffuse_texture("textures/creationclub/bgssse025/clutter/amber_bl.dds")
    assert not is_diffuse_texture("textures/cubemaps/shinydull.dds")


def test_unresolved_diffuse_fails_unless_accepted_with_a_reason():
    from pipeline.build_kit import unresolved_diffuse_errors
    missing = ["textures/a/wall_d.dds", "textures/a/wall_n.dds", "textures/b/roof.dds"]
    kit = {"id": "k", "texturesMissingAccepted": {"textures/b/roof.dds": "archive absent"}}
    assert [e.split()[3] for e in unresolved_diffuse_errors(kit, missing)] == [
        "textures/a/wall_d.dds"]
    kit["texturesMissingAccepted"]["textures/a/wall_d.dds"] = " "
    assert len(unresolved_diffuse_errors(kit, missing)) == 1   # a blank reason is no reason


def test_every_published_kit_has_no_unaccepted_unresolved_diffuse():
    # The build gate, held on what ships: a published manifest's
    # texturesMissing may carry a diffuse only if its kit config accepts it.
    from pipeline.build_kit import CONFIG, unresolved_diffuse_errors
    errors = []
    for manifest in sorted(PUBLIC_KITS.glob("*.kit.json")):
        config = CONFIG / manifest.name.replace(".kit.json", ".json")
        if not config.exists():
            continue
        kit = json.loads(config.read_text())
        missing = json.loads(manifest.read_text()).get("texturesMissing") or []
        errors += unresolved_diffuse_errors(kit, missing)
    assert errors == []


def test_glow_facings_cluster_one_bearing_per_wall():
    from pipeline.build_kit import glow_facings_from_faces
    # two window cards on the east wall (+x), one on the west, one wound
    # inward; a skylight (vertical normal) carries no bearing.
    cents = [[7, 3, -1], [7, 3, 1], [-7, 3, 0], [-7, 3, 1], [0, 5, 0]]
    norms = [[1, 0, 0], [1, 0, 0], [-1, 0, 0], [1, 0, 0], [0, 1, 0]]
    assert glow_facings_from_faces(cents, norms, [1, 1, 1, 1, 1]) == [90.0, 270.0]
    # north wall (-z) -> bearing 0
    assert glow_facings_from_faces([[0, 3, -5], [0, 3, 5]], [[0, 0, -1], [0, 0, 1]],
                                   [1, 1]) == [0.0, 180.0]


def test_farmhouse01_glow_faces_its_long_axis_ends():
    # Measured 2026-09-26 on the raw build: the Farmhouse01:14 glow cards sit
    # at x = +-7.2 m with normals +-x, so the windows face east and west.
    glb = Path(__file__).resolve().parents[1] / "output/kits/settlement-imperial-v1.glb"
    manifest = glb.with_suffix(".kit.json")
    if not glb.exists():
        pytest.skip("raw imperial kit not built on this machine")
    from pipeline.build_kit import apply_glow_facings
    summary = json.loads(manifest.read_text())
    facings = apply_glow_facings(glb, summary)
    assert facings["vanilla:architecture/farmhouse/farmhouse01"] == [90.0, 270.0]


class _FakeTextures(build_kit.Source):
    """An in-memory texture source: {path: bytes}."""

    def __init__(self, files: dict, fallback: bool = False):
        self.files = {k.lower(): v for k, v in files.items()}
        if fallback:
            self.vanilla_fallback = True

    def contains(self, rel):
        return rel.lower() in self.files

    def extract_many(self, rels, dest):
        for rel in rels:
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(self.files[rel.lower()])

    def names_available(self):
        return self.files.keys()


def test_every_own_source_exact_file_beats_any_stem_fallback(tmp_path):
    """16k kits r3 ruling 4: Data2.rar's stem fallback `roadsignmediumcamp1`
    answered `roadsignmedium` before the Hana resource's exact file was asked
    whenever Data2 came first; the pool's own sources are one tier now."""
    wanted = "textures/hana/signs/roadsignmedium.dds"
    data2 = _FakeTextures({"textures/hana/signs/roadsignmediumcamp1.dds": b"lettered"})
    hana = _FakeTextures({wanted: b"blank"})
    tiers = build_kit.texture_tiers([data2, hana])
    filled, substituted = build_kit.resolve_textures(tiers, {wanted}, tmp_path)
    assert filled == {wanted} and substituted == {}
    assert (tmp_path / wanted).read_bytes() == b"blank"


def test_a_pools_own_relocated_copy_still_beats_vanillas_exact_path(tmp_path):
    """Phase 10 round 3 (kept by ruling 4): BM&V's tree-LOD atlas at another
    folder wins over vanilla's different atlas at the exact path."""
    wanted = "textures/lod/tamrieltreelod.dds"
    own = _FakeTextures({"textures/landscape/trees/tamrieltreelod.dds": b"bmv"})
    vanilla = _FakeTextures({wanted: b"vanilla"}, fallback=True)
    filled, substituted = build_kit.resolve_textures(
        build_kit.texture_tiers([own, vanilla]), {wanted}, tmp_path)
    assert filled == {wanted}
    assert substituted == {wanted: "textures/landscape/trees/tamrieltreelod.dds"}
    assert (tmp_path / wanted).read_bytes() == b"bmv"


@pytest.mark.parametrize("kit_id", ["settlement-mud-v1", "settlement-imperial-v1"])
def test_published_kit_has_no_untextured_lod0_material(kit_id):
    """16k kits r3 ruling 5 on the shipped file: the mud kit's hut composite
    carried `Object10:3.Mat` (the Nordic door's untextured effect card)."""
    glb = build_kit.REPO_ROOT / "apps/world-studio/public/kits" / f"{kit_id}.glb"
    manifest = json.loads(glb.with_suffix(".kit.json").read_text())
    errors = build_kit.untextured_material_errors(
        build_kit.read_gltf_json(glb), manifest, manifest.get("texturesMissing", []))
    assert errors == []


def test_fire_card_gate_names_an_unflagged_flame_or_glow_card():
    fx = {"BS_Shader_Block_Name": "BSEffectShaderProperty"}
    gltf = {"materials": [
        {"name": "Flames:0.Mat", "extras": dict(fx)},
        {"name": "Glow.Mat", "extras": {**fx, "additive": True}},
        {"name": "EdgeBlood.Mat", "extras": dict(fx)},
        {"name": "Flames:1.Mat", "extras": {"BS_Shader_Block_Name": "BSLightingShaderProperty"}},
        {"name": "Flames:2.Mat", "extras": dict(fx)}],
        "meshes": [{"primitives": [{"material": i}]} for i in range(5)],
        "nodes": [{"name": f"es|{i}", "mesh": i} for i in range(4)]
                 + [{"name": "es|4__lod1", "mesh": 4}]}
    summary = {"assets": [{"id": "kit:fire", "materials": ["Flames:0.Mat"]}]}
    errors = build_kit.unflagged_fire_card_errors(gltf, summary)
    assert [e.split(":")[0] for e in errors] == ["Flames"] and "(kit:fire)" in errors[0]


@pytest.mark.parametrize("glb", sorted((build_kit.REPO_ROOT / "apps/world-studio/public/kits")
                                       .glob("*.glb")), ids=lambda p: p.stem)
@pytest.mark.xfail(reason="rebuild blocked on leafcut-sample policy row", strict=False)
def test_published_kit_ships_every_fire_card_additive(glb):
    """Walk 4: interior-farmhouse-v1 shipped fireplacewood01burning's
    Flames:0/1 cards MASK (solid streaks); its config row had no effect flag."""
    manifest = glb.with_suffix(".kit.json")
    summary = json.loads(manifest.read_text()) if manifest.is_file() else {}
    assert build_kit.unflagged_fire_card_errors(build_kit.read_gltf_json(glb), summary) == []


def test_untextured_gate_passes_textured_additive_and_judged_materials():
    gltf = {"materials": [
        {"name": "wood", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}},
        {"name": "flame", "extras": {"additive": True}},
        {"name": "amber", "extras": {"BSShaderTextureSet_Diffuse": "textures\\x\\amber.dds"}},
        {"name": "card", "extras": {"BS_Shader_Block_Name": "BSEffectShaderProperty"}},
        {"name": "far", "extras": {}}],
        "meshes": [{"primitives": [{"material": i}]} for i in range(5)],
        "nodes": [{"name": "es|a", "mesh": 0}, {"name": "es|b", "mesh": 1},
                  {"name": "es|c", "mesh": 2}, {"name": "es|d", "mesh": 3},
                  {"name": "es|e__lod1", "mesh": 4}]}
    summary = {"assets": [{"id": "kit:door", "materials": ["card"]}]}
    errors = build_kit.untextured_material_errors(gltf, summary, ["textures/x/amber.dds"])
    assert errors == ["card: LOD0 material with no texture and no effect flag "
                      "(BSEffectShaderProperty; kit:door)"]


# ── effect textures (16k fix round 2, lane effects: chimney smoke) ──────────

def _effect_pool(monkeypatch, tmp_path):
    from PIL import Image
    tex = tmp_path / "src" / "textures" / "effects"
    tex.mkdir(parents=True)
    Image.new("RGBA", (8, 8), (200, 200, 200, 90)).save(tex / "smokeparticles01.dds", format="PNG")
    monkeypatch.setattr(build_kit, "pool_sources", lambda pool, vault, tropical=True:
                        build_kit.PoolSources(meshes=None,
                                              textures=[build_kit.DirSource(tmp_path / "src")]))


def test_effect_texture_is_published_and_recorded(monkeypatch, tmp_path):
    _effect_pool(monkeypatch, tmp_path)
    kit = {"id": "works-v1", "effectTextures": {"fx:smoke-column": {
        "texture": "textures\\effects\\SmokeParticles01.dds", "atlas": [4, 4]}}}
    summary = {"assets": []}
    out = build_kit.publish_effect_textures(kit, tmp_path, summary, public_dir=tmp_path / "pub")
    assert out == {"fx:smoke-column": "works-v1-fx/smokeparticles01.png"}
    row = summary["effectTextures"]["fx:smoke-column"]
    assert (tmp_path / "pub" / row["file"]).is_file()
    assert row["px"] == [8, 8] and row["atlas"] == [4, 4] and row["sourceArchive"] == "src"
    assert len(row["sha256Dds"]) == 64


def test_unresolved_effect_texture_refuses_the_build(monkeypatch, tmp_path):
    _effect_pool(monkeypatch, tmp_path)
    kit = {"id": "works-v1", "effectTextures": {"fx:smoke-column": {
        "texture": "textures/effects/nosuchsmoke.dds"}}}
    with pytest.raises(FileNotFoundError, match="nosuchsmoke.dds for fx:smoke-column"):
        build_kit.publish_effect_textures(kit, tmp_path, {}, public_dir=tmp_path / "pub")


def test_published_works_kit_carries_the_smoke_texture():
    """The shipped manifest names the smoke atlas and the file is beside it
    (game-core settlement/smokeColumn.ts reads `effectTextures`)."""
    kits = build_kit.REPO_ROOT / "apps/world-studio/public/kits"
    manifest = json.loads((kits / "works-v1.kit.json").read_text())
    row = (manifest.get("effectTextures") or {}).get("fx:smoke-column")
    assert row, "works-v1.kit.json has no effectTextures row for fx:smoke-column"
    assert row["sourcePath"] == "textures/effects/smokeparticles01.dds"
    assert (kits / row["file"]).is_file()


def test_a_nif_water_surface_ships_translucent_and_flagged_water(tmp_path):
    """16k fix 2 round 4 ruling K4: horsetrough01's `WATER.Mat`
    (BSWaterShaderProperty, no texture) is listed in `waterMaterials`; it
    ships BLEND with `water: true`, and the untextured gate passes it."""
    glb = tmp_path / "kit.glb"
    _make_glb(glb, {"asset": {"version": "2.0"}, "materials": [
        {"name": "WATER.Mat"}, {"name": "Wood.Mat"}]})
    summary = {"assets": [{"id": "vanilla:clutter/horsetrough/horsetrough01", "alphaTest": False,
                           "materials": ["WATER.Mat", "Wood.Mat"],
                           "waterMaterials": ["WATER.Mat"]}]}
    assert set_alpha_modes(glb, summary) == {"MASK": 0, "OPAQUE": 1, "BLEND": 1}
    gltf = build_kit.read_gltf_json(glb)
    materials = {m["name"]: m for m in gltf["materials"]}
    assert materials["WATER.Mat"]["alphaMode"] == "BLEND"
    assert materials["WATER.Mat"]["extras"] == {"water": True}
    gltf["meshes"] = [{"primitives": [{"material": 0}]}]
    gltf["nodes"] = [{"name": "es|trough", "mesh": 0}]
    assert build_kit.untextured_material_errors(gltf, summary, []) == []
    materials["WATER.Mat"].pop("extras")
    assert build_kit.untextured_material_errors(gltf, summary, []) != []


def test_size_rule_gives_small_solids_a_convex_collider():
    kit = {"assets": [{"asset": "a:authored", "collision": "none"}]}
    summary = {"assets": [
        {"id": "a:woodpile", "category": "clutter", "collision": "none", "sizeM": [1.4, 0.9, 0.8]},
        {"id": "a:candle", "category": "clutter", "collision": "none", "sizeM": [0.26, 0.25, 0.62]},
        {"id": "a:rug", "category": "misc", "collision": "none", "sizeM": [2.0, 1.5, 0.02]},
        {"id": "a:fern", "category": "plant", "collision": "none", "sizeM": [1.0, 1.0, 1.0]},
        {"id": "a:authored", "category": "clutter", "collision": "none", "sizeM": [1.0, 1.0, 1.0]},
        {"id": "a:wall", "category": "architecture", "collision": "mesh", "sizeM": [4, 0.3, 3]},
    ]}
    assert build_kit.apply_size_collision(summary, kit) == ["a:woodpile"]
    kinds = {r["id"]: r["collision"] for r in summary["assets"]}
    assert kinds == {"a:woodpile": "convex", "a:candle": "none", "a:rug": "none",
                     "a:fern": "none", "a:authored": "none", "a:wall": "mesh"}


# The kits Claywater Station draws (walk 2 D6): published manifests obey the
# size rule, so the woodpile, handcart and troughs the owner walked through
# collide. A kit outside this list meets the rule on its next rebuild.
SIZE_RULE_KITS = ("settlement-imperial-v1", "settlement-mud-v1", "works-v1", "docks-v1")


@pytest.mark.parametrize("kit_id", SIZE_RULE_KITS)
def test_published_kit_obeys_the_size_collider_rule(kit_id):
    config = json.loads((build_kit.CONFIG / f"{kit_id}.json").read_text())
    authored = {e["asset"] for e in config.get("assets", []) if "collision" in e}
    manifest = json.loads((PUBLIC_KITS / f"{kit_id}.kit.json").read_text())
    missing = [a["id"] for a in manifest["assets"]
               if a.get("collision", "none") == "none" and a["id"] not in authored
               and build_kit.needs_size_collider(a)]
    assert missing == [], f"{kit_id}: {len(missing)} pieces meet the size rule with no collider"


def _glb(path, gltf):
    import json as _json
    import struct as _struct
    body = _json.dumps(gltf).encode("utf-8")
    body += b" " * (-len(body) % 4)
    path.write_bytes(_struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(body))
                     + _struct.pack("<II", len(body), 0x4E4F534A) + body)


def test_lod_levels_are_the_levels_the_glb_carries(tmp_path):
    """0105 R20: `lodLevels` = highest mesh-node `extras.lod` + 1 per scene
    root, as the runtime reads it; `lodRatios` stays the configured chain."""
    from pipeline.build_kit import apply_lod_levels, glb_lod_levels
    glb = tmp_path / "k.glb"
    _glb(glb, {"scene": 0, "scenes": [{"nodes": [0, 3]}], "nodes": [
        {"extras": {"assetId": "a:tree"}, "children": [1, 2]},
        {"mesh": 0}, {"mesh": 1, "extras": {"lod": 2}},
        {"extras": {"assetId": "a:nest"}, "children": [4]}, {"mesh": 2}]})
    assert glb_lod_levels(glb) == {"a:tree": 3, "a:nest": 1}
    manifest = {"assets": [{"id": "a:tree", "lodRatios": [0.5, 0.2]},
                           {"id": "a:nest", "lodRatios": [0.5, 0.2]},
                           {"id": "a:gone", "lodLevels": 9}]}
    assert apply_lod_levels(glb, manifest) == 1
    assert [a.get("lodLevels") for a in manifest["assets"]] == [3, 1, None]
    assert manifest["assets"][1]["lodRatios"] == [0.5, 0.2]


def test_every_published_manifest_lod_levels_equal_its_glb():
    """0105 R20 on the shipped kits: no row claims a level its GLB lacks."""
    from pipeline.build_kit import glb_lod_levels
    from pipeline.kit_compress import PUBLIC_KITS
    import json as _json
    bad = []
    for manifest in sorted(PUBLIC_KITS.glob("*.kit.json")):
        glb = manifest.parent / manifest.name.replace(".kit.json", ".glb")
        if not glb.exists():
            continue
        levels = glb_lod_levels(glb)
        for asset in _json.loads(manifest.read_text()).get("assets", []):
            if asset["id"] in levels and asset.get("lodLevels") != levels[asset["id"]]:
                bad.append(f"{manifest.name}:{asset['id']} {asset.get('lodLevels')} != {levels[asset['id']]}")
    assert not bad, f"{len(bad)} rows: {bad[:5]}"


def test_stem_fallback_never_takes_a_lod_texture():
    """A LOD distance copy (`textures/lod/*lod.dds`) is never the stem
    stand-in for a full-size diffuse (walk 5: KotM's 256² whwoodboards02lod
    beat vanilla's exact path); a real longer-named sibling still is."""
    class Names(build_kit.Source):
        def __init__(self, names):
            self.names = names

        def names_available(self):
            return self.names

    lod_only = Names(["textures/lod/whwoodboards02lod.dds",
                      "textures/lod/ceramic01teal_dlod.dds"])
    assert lod_only.find_by_stem("textures/architecture/windhelm/whwoodboards02.dds") is None
    assert lod_only.find_by_stem("textures/_resourcepack/_genericmaterials/ceramic/ceramic01teal_d.dds") is None
    sibling = Names(["textures/plants/vurt_shroomstemmoss.dds"])
    assert sibling.find_by_stem("textures/plants/vurt_shroomstem.dds") == "textures/plants/vurt_shroomstemmoss.dds"


def test_blender_scripts_compile():
    # Blender exits 0 when its --python script fails to compile, so a syntax
    # error in a blender/ script reached a kit build as a silent no-op (walk 5).
    import py_compile
    for script in sorted((Path(__file__).parent / "blender").glob("*.py")):
        py_compile.compile(str(script), doraise=True)

"""Smoke tests for the co-placement template miner.

No plugin is read: the fixtures below are hand-built references standing in
for a village of huts, each with its door, so the clustering, the frame
convention and the doorway derivation are checked on known answers.
"""

from __future__ import annotations

import math

from .mine_assemblies import (
    Ref,
    analyse,
    bearing_of,
    doorways_from,
    gaps_from,
    is_door_piece,
    local_offset,
    offset_text,
    render_report,
    wanted,
)

HUT = "architecture/village/hut01"
DOOR = "architecture/village/hutdoor01"
STAIR = "architecture/village/hutstair01"

DOOR_LOCAL = (-2.45, 1.4, 0.0)
STAIR_LOCAL = (3.0, 0.0, -1.0)


def place(model: str, x: float, y: float, z: float, yaw: float) -> Ref:
    return Ref(model, "kit", x, y, z, yaw % 360.0, 1.0, 40.0, (0, 0), "World")


def world_from_local(anchor: Ref, local, rel_yaw: float) -> Ref:
    """Inverse of `local_offset`, so the fixtures are built the way the miner
    reads them rather than the way it happens to be implemented."""
    a = math.radians(anchor.yaw_deg)
    lx, ly, lz = local
    dx = lx * math.cos(-a) - ly * math.sin(-a)
    dy = lx * math.sin(-a) + ly * math.cos(-a)
    return place(DOOR, anchor.x + dx, anchor.y + dy, anchor.z + lz,
                 anchor.yaw_deg + rel_yaw)


def village(yaws=(0.0, 47.0, 123.0, 250.0, 310.0)) -> list[Ref]:
    refs: list[Ref] = []
    for n, yaw in enumerate(yaws):
        hut = place(HUT, 200.0 * n, 0.0, 0.0, yaw)
        door = world_from_local(hut, DOOR_LOCAL, 120.0)
        stair = world_from_local(hut, STAIR_LOCAL, 0.0)
        stair.model_key = STAIR
        refs += [hut, door, stair]
    return refs


def test_local_offset_round_trips_through_any_yaw():
    for yaw in (0.0, 47.0, 123.0, 250.0, 310.0):
        hut = place(HUT, 12.0, -34.0, 5.0, yaw)
        door = world_from_local(hut, DOOR_LOCAL, 120.0)
        lx, ly, lz, rel = local_offset(hut, door)
        assert (round(lx, 3), round(ly, 3), round(lz, 3)) == DOOR_LOCAL
        assert round(rel, 3) == 120.0


def test_bearing_is_north_zero_clockwise():
    assert bearing_of(0.0, 1.0) == 0.0
    assert bearing_of(1.0, 0.0) == 90.0
    assert bearing_of(0.0, -1.0) == 180.0


def test_wanted_keeps_shells_and_doors_and_drops_natural_dressing():
    assert wanted("architecture/village/hut01.nif", 40.0)
    assert wanted("architecture/village/hutdoor01.nif", 0.2)   # door exempt
    assert not wanted("architecture/village/pot01.nif", 0.2)   # too small
    assert not wanted("architecture/phitt/trees/azura_tree02.nif", 90.0)
    assert not wanted("dungeons/caves/green/rocks/cavegrockl05.nif", 90.0)


def test_door_pieces_are_named_by_their_file_name():
    assert is_door_piece("architecture/village/hutdoor01.nif")
    assert not is_door_piece("architecture/doors/hut01.nif")


def analysed(refs=None):
    from .mine_assemblies import SourceSet
    source = SourceSet("test", "Test set", ["test.esp"], ["World"],
                       refs=refs if refs is not None else village())
    return analyse(source, 12.0, 0.3, 5.0, 3, {})


def test_the_door_and_the_stair_come_out_as_templates():
    data = analysed()
    found = {(t["anchorPiece"], t["partPiece"]): t for t in data["templates"]}
    door = found[("hut01", "hutdoor01")]
    assert door["kind"] == "fixed"
    assert door["count"] == 5
    assert door["offsetM"] == [round(v, 2) for v in DOOR_LOCAL]
    assert door["yawDeg"] == 120.0
    assert door["isDoor"]
    stair = found[("hut01", "hutstair01")]
    assert stair["offsetM"] == [round(v, 2) for v in STAIR_LOCAL]


def test_the_hut_with_its_door_and_stair_is_a_group():
    groups = analysed()["groups"]
    assert groups, "the shell carries two parts, so it is a group"
    parts = {p["part"].rsplit("/", 1)[-1] for p in groups[0]["parts"]}
    assert parts == {"hutdoor01", "hutstair01"}
    assert groups[0]["count"] == 5


def test_a_door_slid_round_a_round_hut_is_a_radial_template():
    refs: list[Ref] = []
    for n, (yaw, bearing) in enumerate(
            ((0.0, 0.0), (30.0, 90.0), (200.0, 190.0), (95.0, 280.0))):
        hut = place(HUT, 200.0 * n, 0.0, 0.0, yaw)
        radius = 2.83
        angle = math.radians(bearing)
        local = (radius * math.sin(angle), radius * math.cos(angle), 0.0)
        refs += [hut, world_from_local(hut, local, 120.0)]
    templates = analysed(refs)["templates"]
    radial = [t for t in templates if t["kind"] == "radial"]
    assert radial and radial[0]["radiusM"] == 2.83
    assert radial[0]["bearingSpreadDeg"] >= 20.0
    assert radial[0]["offsetM"] is None


def test_pieces_that_never_stand_alone_are_flagged():
    use = {p["piece"]: p for p in analysed()["pieceUse"]}
    assert use["hutdoor01"]["neverAlone"]
    assert use["hutdoor01"]["aloneInstances"] == 0
    lone = place(HUT, 9000.0, 9000.0, 0.0, 0.0)
    use = {p["piece"]: p for p in analysed(village() + [lone])["pieceUse"]}
    assert use["hut01"]["aloneInstances"] == 1
    assert not use["hut01"]["neverAlone"]


def test_doorways_and_gaps_read_off_the_templates():
    sets = {"test": analysed()}
    interiors = {"kit:" + HUT: {"interior": "shell", "kit": "test-kit",
                                "sizeClass": "small", "planAreaM2": 20.0,
                                "doorways": []},
                 "kit:architecture/village/silo01": {
                     "interior": "shell", "kit": "test-kit",
                     "sizeClass": "small", "planAreaM2": 12.0, "doorways": []}}
    doors = doorways_from(sets, interiors)
    entry = doors["kit:" + HUT]
    assert entry["anchorEncloses"] is True
    assert entry["doorways"][0]["offsetLocalM"] == [round(v, 2)
                                                   for v in DOOR_LOCAL]
    assert entry["doorways"][0]["sideDeg"] == bearing_of(*DOOR_LOCAL[:2])
    gaps = gaps_from(doors, interiors)
    assert [g["asset"] for g in gaps] == ["kit:architecture/village/silo01"]


def test_offset_text_reads_both_shapes():
    assert offset_text({"offsetM": [1.0, 2.0, 3.0]}) == "1.0, 2.0, 3.0"
    assert "radius" in offset_text({"offsetM": None, "radiusM": 2.8,
                                    "riseM": 0.0})


def test_the_run_is_deterministic_and_the_report_renders():
    first, second = analysed(), analysed()
    assert first == second
    payload = {"parameters": {"minCount": 3, "offsetToleranceM": 0.3,
                              "yawToleranceDeg": 5.0, "radiusM": 12.0},
               "sets": {"test": first},
               "doorwaysFromAssemblies": doorways_from({"test": first}, {}),
               "gaps": {"shellsWithoutDoor": []}}
    report = render_report(payload)
    assert "hutdoor01" in report
    assert report == render_report(payload)


# --- 16k remine r2: derived sets, kit-asset keys, stable ids -----------------


def test_sets_are_derived_from_the_pool_rows_and_bmv_keeps_its_two_ids():
    """One set per pool, in row order; BM&V's three plugins keep the two set
    ids kit configs cite (standard 1)."""
    from pathlib import Path

    from .mine_assemblies import derived_sets
    rows = [("vanilla", Path("Skyrim.esm")), ("vanilla", Path("Update.esm")),
            ("bmv", Path("Black Marsh.esm")), ("bmv", Path("Black Marsh North.esp")),
            ("bmv", Path("Valenwood.esp")), ("kotm", Path("King of the Murkmire.esp"))]
    sets = {s["id"]: [p.name for _pool, p in s["rows"]] for s in derived_sets(rows)}
    assert sets == {"vanilla": ["Skyrim.esm", "Update.esm"],
                    "bmv-blackmarsh": ["Black Marsh.esm", "Black Marsh North.esp"],
                    "bmv-valenwood": ["Valenwood.esp"],
                    "kotm": ["King of the Murkmire.esp"]}


def test_a_template_re_keyed_to_another_pool_keeps_its_id():
    """The kit-asset join turns `bmv:architecture/shackkit/x` (a vanilla mesh
    BM&V places) into `vanilla:architecture/shackkit/x`: same relation, same id."""
    from .mine_assemblies import assign_ids
    old = [{"id": "bmv-blackmarsh:t0007", "kind": "fixed",
            "anchor": "bmv:architecture/shackkit/wall", "part": "bmv:architecture/shackkit/door",
            "offsetM": [1.0, 0.0, 0.0], "yawDeg": 90.0, "anchorScale": 1.0}]
    new = [{"id": "", "kind": "fixed",
            "anchor": "vanilla:architecture/shackkit/wall",
            "part": "vanilla:architecture/shackkit/door",
            "offsetM": [1.05, 0.0, 0.0], "yawDeg": 90.5, "anchorScale": 1.0}]
    assign_ids(new, "bmv-blackmarsh", old, 0.3, 5.0)
    assert new[0]["id"] == "bmv-blackmarsh:t0007"


def test_an_issued_template_survives_the_rank_cut():
    """`max_templates` keeps the most repeated, and every template the
    previous record issued while the plugins still show it."""
    data = analysed()
    from .mine_assemblies import SourceSet
    source = SourceSet("test", "Test set", ["test.esp"], ["World"], refs=village())
    cut = analyse(source, 12.0, 0.3, 5.0, 3, {}, max_templates=0)
    assert len(cut["templates"]) < len(data["templates"])  # the cut can drop one
    kept = analyse(source, 12.0, 0.3, 5.0, 3, {}, max_templates=0,
                   previous=data["templates"])
    assert {t["id"] for t in data["templates"]} <= {t["id"] for t in kept["templates"]}


def test_sample_score_matches_on_the_path_and_flags_the_re_key():
    from .mine_assemblies import sample_score
    expected = [{"id": "s:t0001", "kind": "fixed", "anchor": "bmv:a/wall",
                 "part": "bmv:a/door", "offsetM": [1.0, 0.0, 0.0], "radiusM": 1.0,
                 "riseM": 0.0, "yawDeg": 0.0, "count": 4}]
    got = [dict(expected[0], anchor="vanilla:a/wall", part="vanilla:a/door", count=6)]
    row = sample_score(expected, got)["rows"][0]
    assert row["pass"] and row["rekeyed"] and row["gotCount"] == 6
    fewer = [dict(got[0], count=3)]
    assert not sample_score(expected, fewer)["rows"][0]["pass"]

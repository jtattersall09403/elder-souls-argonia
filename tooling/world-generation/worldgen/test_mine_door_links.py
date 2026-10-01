"""Which building an exterior load door belongs to (`mine_door_links.shell_for`),
on hand-made references: planner ruling 4 of interiors round 3."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from . import mine_door_links as M

U = M.UNITS_PER_METRE


def _base(model, half_x, half_y, h):
    b = [int(round(v * U)) for v in (-half_x, -half_y, 0, half_x, half_y, h)]
    return SimpleNamespace(type="STAT", model=model, model_key=model, bounds=b)


class _Vault:
    def __init__(self, bases):
        self.bases = bases

    def base_of(self, plugin, form_id):
        return self.bases.get(form_id)


def _ref(fid, base, x, y, z=0.0, scale=1.0):
    return SimpleNamespace(form_id=fid, base=base, pos=(x * U, y * U, z * U),
                           rot=(0.0, 0.0, 0.0), scale=scale)


BASES = {
    1: _base("argonia/mudhuts/smpodext02.nif", 8.0, 8.0, 12.0),   # the big pod, 3072 m3
    2: _base("argonia/mudhuts/mudhut01.nif", 5.0, 6.0, 9.0),      # the hut, 1080 m3
    3: _base("argonia/blackwood/doorframe.nif", 1.2, 0.5, 3.0),   # the frame the door is set in
    4: _base("gv_meshes/argoniannest/mudhut01.nif", 3.0, 3.2, 5.0),  # a hut set at scale 2
}
DOOR = _ref(99, None, 0.0, 0.0, 1.0)


def _pick(refs):
    ref, _base_ = M.shell_for(DOOR, refs, _Vault(BASES), None)
    return ref.form_id if ref else None


def test_a_door_inside_a_buildings_box_is_that_buildings_door():
    # the door stands inside the hut's box; the pod's wall is 2.1 m off
    assert _pick([_ref(10, 1, 10.1, 0.0), _ref(11, 2, 3.0, 0.0)]) == 11


def test_the_door_frame_holding_the_door_is_trim_not_the_building():
    assert _pick([_ref(10, 1, 10.1, 0.0), _ref(11, 2, 3.0, 0.0), _ref(12, 3, 0.0, 0.0)]) == 11


def test_the_reference_scale_sizes_the_box():
    # 6.2 m from the pivot: outside the unscaled 3.0 m half-box, inside it at scale 2.3
    assert _pick([_ref(13, 4, 6.2, 0.0, scale=2.3), _ref(10, 1, 10.1, 0.0)]) == 13


def test_with_nothing_against_the_door_the_biggest_near_building_wins():
    assert _pick([_ref(10, 1, 10.1, 0.0), _ref(11, 2, 7.5, 0.0)]) == 10


# planner ruling 7, interiors round 4: trim never wins a door
BASES.update({
    5: _base("architecture/windhelm/wholdflag05red.nif", 0.7, 2.7, 1.7),     # a hanging flag
    6: _base("architecture/windhelm/whdockdoortrim.nif", 1.5, 0.29, 3.2),    # door trim
    7: _base("dungeons/imperial/exterior/impextdoorhole01.nif", 1.21, 1.88, 3.64),
    # module-level so every test sees them in any order or xdist worker
    8: _base("architecture/farmhouse/farmhouse01.nif", 5.0, 6.0, 9.0),      # a farmhouse
    9: _base("argonia/stockades/walkway01.nif", 5.0, 5.0, 3.0),             # a walkway
})


def test_the_footprint_class_reads_the_scaled_box():
    assert M.footprint_class((1.41, 5.36, 1.68)) == "trim"        # too low: a flag
    assert M.footprint_class((3.02, 0.57, 3.21)) == "trim"        # too thin: door trim
    assert M.footprint_class((2.70, 2.15, 3.21)) == "trim"        # too small in plan: an arch
    assert M.footprint_class((2.42, 3.76, 3.64)) == "building"    # the fort door-hole module
    assert M.obnd_dims_m(BASES[4], 2.0) == pytest.approx((12.0, 12.8, 10.0), abs=0.05)


def test_trim_against_the_door_never_wins_it():
    # the flag and the trim both hold the door; the building is 2.5 m off
    assert _pick([_ref(14, 5, 0.0, 0.0), _ref(15, 6, 0.0, 0.0), _ref(16, 7, 3.7, 0.0)]) == 16
    # only trim near the door: no shell at all
    assert _pick([_ref(14, 5, 0.0, 0.0), _ref(15, 6, 0.0, 0.0)]) is None


def test_placed_scales_are_the_median_and_spread_of_every_reference():
    vault = SimpleNamespace(
        placed_scales={("mudmother", "gv_meshes/argoniannest/mudhut01.nif"): [1.92, 2.3, 2.3, 2.1, 2.0],
                       ("vanilla", "architecture/windhelm/wholdflag05red.nif"): [1.0, 1.0]},
        placed_bases={("mudmother", "gv_meshes/argoniannest/mudhut01.nif"): BASES[4],
                      ("vanilla", "architecture/windhelm/wholdflag05red.nif"): BASES[5]})
    index = {"meshes/gv_meshes/argoniannest/mudhut01.nif": {"mudmother": "mudmother:hut"},
             "meshes/architecture/windhelm/wholdflag05red.nif": {"vanilla": "vanilla:flag"}}
    out = M.placed_scales(vault, index, {"mudmother:hut", "vanilla:flag"})
    assert out == {"mudmother:hut": {"median": 2.1, "p10": 1.92, "p90": 2.3, "n": 5}}


# --- planner rulings 1 and 2, interiors round 5 ---
def test_the_shell_whose_family_matches_the_cells_room_seed_wins_the_door():
    # the door stands inside a farmhouse's box; the pod 2.1 m off shares the
    # directory family of the cell's room seed (smpodint02): the pod wins.
    refs = [_ref(10, 1, 10.1, 0.0), _ref(17, 8, 3.0, 0.0)]
    assert _pick(refs) == 17
    ref, _b = M.shell_for(DOOR, refs, _Vault(BASES), None,
                          seed_family="argonia/mudhuts")
    assert ref.form_id == 10
    # no candidate of the seed's family near the door: the bands decide
    ref, _b = M.shell_for(DOOR, refs, _Vault(BASES), None, seed_family="dungeons/nordic")
    assert ref.form_id == 17


class _PieceVault:
    def __init__(self, bases):
        self.bases = bases

    def base_of(self, plugin, form_id):
        return self.bases.get(form_id)


def test_the_interior_family_is_building_geometry_weighted_by_plan_area():
    """KeebaHouseFisher: one pod room (smpodint02, 14 x 14 m) against 18
    small farmhouse modules; 00MudHut01: one hut room against 32 riften
    clutter pieces too small to be building geometry."""
    bases = {
        1: _base("argonia/mudhuts/smpodint02.nif", 7.0, 7.0, 8.0),
        2: _base("architecture/farmhouse/interior/farmintend01.nif", 1.2, 1.5, 3.0),
        3: _base("dungeons/riften/clutter/rtbarrel01.nif", 0.5, 0.5, 1.2),
        4: _base("gv_meshes/argoniannest/mudhut01intnew.nif", 8.0, 6.0, 5.0),
    }
    fisher = [_ref(1, 1, 0, 0)] + [_ref(10 + i, 2, i, 0) for i in range(18)]
    prof = M.interior_profile(fisher, _PieceVault(bases), None, {})
    assert prof["interiorFamily"] == "argonia/mudhuts"
    assert prof["interiorFamilies"][0]["planM2"] == pytest.approx(196.0, abs=0.5)
    hut = [_ref(1, 4, 0, 0)] + [_ref(10 + i, 3, i, 0) for i in range(32)]
    assert M.interior_profile(hut, _PieceVault(bases), None, {})["interiorFamily"] == \
        "gv_meshes/argoniannest"


def test_the_room_seed_family_is_the_biggest_enclosing_structural_piece():
    bases = {
        1: _base("argonia/mudhuts/smpodint02.nif", 7.0, 7.0, 8.0),
        2: _base("architecture/farmhouse/interior/farmintend01.nif", 3.0, 3.0, 3.0),
        5: _base("architecture/farmhouse/interior/farmfloor01.nif", 9.0, 9.0, 0.3),
    }
    refs = [_ref(1, 1, 0, 0), _ref(2, 2, 0, 0), _ref(3, 5, 0, 0)]
    assert M.room_seed_family(refs, _PieceVault(bases), None) == "argonia/mudhuts"
    assert M.room_seed_family([_ref(3, 5, 0, 0)], _PieceVault(bases), None) is None


# --- interiors round 6 ---
def _yawed(fid, base, x, y, yaw_deg, z=0.0):
    import math
    return SimpleNamespace(form_id=fid, base=base, pos=(x * U, y * U, z * U),
                           rot=(0.0, 0.0, math.radians(yaw_deg)), scale=1.0)


def test_rot_z_is_a_clockwise_heading_in_box_gap_and_door_offset():
    """A shell at 90 deg: its local +y (a box reaching 0-6 m forward) points
    EAST (the convention mine_assemblies measured on farmhouse01 and
    interior_cells uses), so a door 5 m east of the pivot stands inside it,
    dead ahead (sideDeg 0), and a door 5 m west is 5 m outside."""
    base = SimpleNamespace(type="STAT", model="x.nif", model_key="x.nif",
                           bounds=[int(-1 * U), 0, 0, int(1 * U), int(6 * U), int(4 * U)])
    shell = _yawed(1, base, 0.0, 0.0, 90.0)
    east, west = _ref(98, None, 5.0, 0.0, 1.0), _ref(97, None, -5.0, 0.0, 1.0)
    assert M._box_gap(shell, base, east) == pytest.approx(0.0, abs=1e-6)
    assert M._box_gap(shell, base, west) == pytest.approx(5.0, abs=1e-3)
    off = M.door_offset(east, shell)
    assert (off["xM"], off["yM"], off["sideDeg"]) == pytest.approx((0.0, 5.0, 0.0), abs=1e-3)
    from .mine_assemblies import local_offset
    a = SimpleNamespace(x=0.0, y=0.0, z=0.0, yaw_deg=90.0)
    b = SimpleNamespace(x=5.0, y=0.0, z=1.0, yaw_deg=0.0)
    assert local_offset(a, b)[:2] == pytest.approx((off["xM"], off["yM"]), abs=1e-3)


def test_the_candidate_whose_room_ratio_fits_takes_the_door():
    """KeebaHouseFisher: the door stands inside mudhut01's box; the pod 2.1 m
    off is the only candidate the cell's room fits (1.504 against 2.222)."""
    refs = [_ref(10, 1, 10.1, 0.0), _ref(11, 2, 3.0, 0.0)]
    ratios = {10: 1.504, 11: 2.222}
    ref, _b = M.shell_for(DOOR, refs, _Vault(BASES), None,
                          ratio_of=lambda r, b: ratios[r.form_id])
    assert ref.form_id == 10
    # neither fits: the bands decide as before
    ref, _b = M.shell_for(DOOR, refs, _Vault(BASES), None, ratio_of=lambda r, b: 3.0)
    assert ref.form_id == 11
    # one candidate's room is not measurable: the ratio does not decide
    ratios[11] = None
    ref, _b = M.shell_for(DOOR, refs, _Vault(BASES), None,
                          ratio_of=lambda r, b: ratios[r.form_id])
    assert ref.form_id == 11
    # a lone candidate is never refused on its ratio
    ref, _b = M.shell_for(DOOR, refs[1:], _Vault(BASES), None, ratio_of=lambda r, b: 3.0)
    assert ref.form_id == 11


def test_a_box_holding_the_door_without_a_wall_at_it_gives_way_to_a_walled_one():
    # a walkway (building-class box) holds the door; the hut's wall is 1.5 m off
    refs = [_ref(18, 9, 0.0, 0.0), _ref(11, 2, 6.5, 0.0)]
    assert _pick(refs) == 18
    walls = {18: False, 11: True}
    ref, _b = M.shell_for(DOOR, refs, _Vault(BASES), None,
                          has_wall=lambda r, b: walls[r.form_id])
    assert ref.form_id == 11
    # no mesh for the walkway (None): the test cannot drop it
    ref, _b = M.shell_for(DOOR, refs, _Vault(BASES), None, has_wall=lambda r, b: None)
    assert ref.form_id == 18
    # another building within 1 m of the door (the door's own frame beside a
    # tree kiosk): the box holding the door is not tested
    near = [_ref(18, 9, 0.0, 0.0), _ref(11, 2, 5.5, 0.0)]
    ref, _b = M.shell_for(DOOR, near, _Vault(BASES), None,
                          has_wall=lambda r, b: walls[r.form_id])
    assert ref.form_id == 18


def test_a_doorway_piece_of_the_buildings_family_is_its_wall():
    """SnailMinder: the pod's own wall is metres from the door, but the pod's
    doorway module (smpodextdoor, a doorway piece of the same directory)
    stands against it: the pod passes the wall test."""
    bases = dict(BASES)
    bases[20] = _base("argonia/mudhuts/smpodextdoor.nif", 1.5, 1.0, 3.0)
    bases[21] = SimpleNamespace(type="DOOR", model="argonia/mudhuts/door01.nif",
                                model_key="argonia/mudhuts/door01.nif",
                                bounds=[-120, -51, 26, 72, 14, 341])
    door = SimpleNamespace(form_id=99, base=21, pos=(0.0, 0.0, U), rot=(0.0, 0.0, 0.0), scale=1.0)
    pod = _ref(10, 1, 0.0, 0.0)
    frame = _ref(22, 20, 0.0, 0.3)
    index = {"meshes/argonia/mudhuts/smpodextdoor.nif": {"kotm": "kotm:argonia/mudhuts/smpodextdoor"}}
    test = M.WallTest(door, bases[21], [pod, frame], _Vault(bases), None, index, "kotm",
                      meshes=None, doorways={"kotm:argonia/mudhuts/smpodextdoor"})
    assert test(pod, bases[1]) is True
    # a building of another family gets no wall from it (no mesh: unknown)
    assert test(_ref(17, 8, 0.0, 0.0), BASES[8]) is None


def test_a_cell_with_no_building_class_piece_is_named_by_structural_area():
    bases = {1: _base("architecture/farmhouse/interior/farmintwall01.nif", 1.5, 0.3, 3.0),
             2: _base("dungeons/riften/clutter/rtbarrel01.nif", 0.5, 0.5, 1.2)}
    refs = [_ref(1, 1, 0, 0), _ref(2, 1, 3, 0), _ref(3, 2, 1, 1)]
    prof = M.interior_profile(refs, _PieceVault(bases), None, {})
    assert prof["interiorFamily"] == "architecture/farmhouse/interior"


def test_the_miner_and_the_claim_share_one_ratio_band():
    from . import blueprint_interiors as BI
    assert M.FIT_RATIO is BI.FIT_RATIO


# --------------------------------------------------------------------------- #
# Overrides resolve in the asking plugin's load order (closeout B): its
# masters in MAST order, the plugin itself last; the last to define wins.
# --------------------------------------------------------------------------- #
def test_a_base_resolves_through_the_asking_plugins_own_load_order(tmp_path):
    from .esp_index import Plugin
    from .test_interior_cells import _plugin
    files = {
        "M.esm": _plugin((), {0x10: "m10.nif", 0x11: "m11.nif", 0x12: "m12.nif"}),
        "U.esm": _plugin(("M.esm",), {0x10: "u10.nif", 0x11: "u11.nif"}),
        "P.esp": _plugin(("M.esm", "U.esm"), {0x10: "p10.nif"}),
        "Q.esp": _plugin(("M.esm",), {0x10: "q10.nif"}),       # a sibling mod, not in P's chain
    }
    for name, data in files.items():
        (tmp_path / name).write_bytes(data)
    vault = M.Vault([("pool", tmp_path / n) for n in files])
    vault.index()
    plugins = {path.name: plugin for _pool, path, plugin in vault.entries}

    def models(name):
        return {fid: vault.base_of(plugins[name], fid).model for fid in (0x10, 0x11, 0x12)}
    assert models("P.esp") == {0x10: "p10.nif", 0x11: "u11.nif", 0x12: "m12.nif"}
    assert models("Q.esp") == {0x10: "q10.nif", 0x11: "m11.nif", 0x12: "m12.nif"}
    assert models("M.esm") == {0x10: "m10.nif", 0x11: "m11.nif", 0x12: "m12.nif"}
    assert isinstance(plugins["P.esp"], Plugin)


def test_a_cave_rock_holding_an_invisible_load_door_is_the_entrance():
    # King of the Murkmire's MugsumpHollowInt01: AutoLoadDoor01 stands 0.36 m
    # inside rockcaveentrance02; the Hist vines beside it are 5.85 m off
    bases = {
        20: _base("landscape/rocks/rockcaveentrance02.nif", 6.0, 5.0, 8.0),
        21: _base("argonia/trees/hist trees/hist_vines01.nif", 3.1, 2.7, 7.7),
        22: SimpleNamespace(type="DOOR", model="autoloadmarker01.nif",
                            model_key="autoloadmarker01.nif", bounds=None),
        23: SimpleNamespace(type="DOOR", model="architecture/farmhouse/farmhouseldoor01.nif",
                            model_key="architecture/farmhouse/farmhouseldoor01.nif", bounds=None),
    }
    refs = [_ref(30, 20, 0.25, 0.26), _ref(31, 21, 5.85, -0.2)]
    ref, _b = M.shell_for(_ref(98, 22, 0.0, 0.0, 1.0), refs, _Vault(bases), None)
    assert ref.form_id == 30
    # a rock never takes a door that draws a leaf
    ref, _b = M.shell_for(_ref(97, 23, 0.0, 0.0, 1.0), refs, _Vault(bases), None)
    assert ref.form_id == 31

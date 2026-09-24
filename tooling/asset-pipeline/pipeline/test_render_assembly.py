"""The assembly renderer's arithmetic: frames, parents and the sheet.

Blender is not needed for any of this — the host module resolves every world
transform before the render, so a wrong rotation sign or a wrong frame is a
test failure here rather than a picture nobody reads.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys
from pathlib import Path

import pytest

from . import render_assembly as ra

ASSEMBLIES = json.loads(ra.ASSEMBLIES_PATH.read_text())


def test_kit_to_compile_matches_the_gltf_export_axes():
    # z-up (x, y, z) -> y-up (x, z, -y): the inverse is what the kit build applies.
    assert ra.kit_to_compile([1.0, 2.0, 3.0]) == [1.0, 3.0, -2.0]


def test_template_pieces_land_on_the_template_offset():
    index = ra.KitIndex.load()
    templates = [t for t in ASSEMBLIES["sets"]["vanilla"]["templates"]
                 if t["anchor"] in index.asset_kit and t["part"] in index.asset_kit]
    assert templates, "no mined vanilla template has both pieces in a built kit"
    for template in templates[:25]:
        spec = ra.spec_from_template(ASSEMBLIES, "vanilla", template["id"])
        anchor, part = ra.place_pieces(spec["pieces"])
        assert anchor["worldM"] == [0.0, 0.0, 0.0]
        ox, oy, oz = template["offsetM"]
        assert part["worldM"] == pytest.approx([ox, oz, -oy])
        # radiusM is the mined plan distance in the kit's z-up frame.
        plan = math.hypot(part["worldM"][0], part["worldM"][2])
        assert plan == pytest.approx(template["radiusM"], abs=0.02)
        assert part["worldM"][1] == pytest.approx(template["riseM"], abs=0.02)


def test_a_mounted_child_rotates_with_its_parent():
    pieces = ra.place_pieces([
        {"id": "parent", "assetId": "a", "positionM": [10.0, 0.0, 0.0], "yawDeg": 90.0},
        {"id": "child", "assetId": "b", "parentId": "parent",
         "positionM": [2.0, 1.5, 0.0], "yawDeg": 15.0},
    ])
    child = pieces[1]
    # The compile convention: wx = cx + x cos t - z sin t; wz = cz + x sin t + z cos t.
    assert child["worldM"] == pytest.approx([10.0, 1.5, 2.0], abs=1e-9)
    assert child["worldYawDeg"] == pytest.approx(105.0)


def test_a_parent_cycle_is_an_error():
    with pytest.raises(SystemExit):
        ra.place_pieces([
            {"id": "a", "assetId": "a", "positionM": [0, 0, 0], "parentId": "b"},
            {"id": "b", "assetId": "b", "positionM": [0, 0, 0], "parentId": "a"},
        ])


def test_sheet_names_every_piece_and_flags_a_missing_sink_record(tmp_path):
    index = ra.KitIndex.load()
    template = next(t for t in ASSEMBLIES["sets"]["vanilla"]["templates"]
                    if t["anchor"] in index.asset_kit and t["part"] in index.asset_kit)
    spec = ra.spec_from_template(ASSEMBLIES, "vanilla", template["id"])
    jobs = ra.build_jobs([spec], index, tmp_path, 256)
    text = ra.write_sheet(jobs, tmp_path).read_text()
    assert template["anchor"] in text and template["part"] in text
    for piece in jobs["assemblies"][0]["pieces"]:
        if piece["designedSinkM"] is None:
            assert "no sink record" in text
    assert "-plan.png" in text and "1 m" in text


def test_an_unbuilt_asset_is_an_error():
    with pytest.raises(SystemExit):
        ra.KitIndex.load().kit_of("nosuchkit:no/such/asset")


@pytest.mark.skipif(
    not (Path(os.path.expanduser(ra.TOOLCHAIN["blender"])).exists()
         and Path(os.path.expanduser(ra.TOOLCHAIN["wine"])).exists()),
    reason="wine/blender toolchain absent")
def test_the_blender_script_parses():
    src = ra.BLENDER_SCRIPT.read_text()
    subprocess.run([sys.executable, "-c", "import ast,sys; ast.parse(open(sys.argv[1]).read())",
                    str(ra.BLENDER_SCRIPT)], check=True)
    assert "JOBS" in src and "-math.radians(piece[\"worldYawDeg\"])" in src


def test_a_declared_box_collider_is_named_as_a_box_not_the_mesh(tmp_path):
    index = ra.KitIndex.load()
    boxed = next(asset_id for asset_id, kit in index.asset_kit.items()
                 if index.manifests[kit][asset_id].get("collisionBox"))
    spec = {"name": "box", "pieces": [{"id": "p", "assetId": boxed,
                                       "positionM": [0.0, 0.0, 0.0], "yawDeg": 0.0}]}
    jobs = ra.build_jobs([spec], index, tmp_path, 256)
    assert "| box |" in ra.write_sheet(jobs, tmp_path).read_text()


def test_flat_stands_every_root_piece_on_its_designed_ground_line(tmp_path):
    # The defect: pieces rendered at their compile heights, so the Lilmoth gate
    # sheet spread its red lines over 6.5 m and no piece could be judged.
    index = ra.KitIndex.load()
    sunk = next(asset_id for asset_id, kit in index.asset_kit.items()
                if (index.manifests[kit][asset_id].get("designedSinkM") or {}).get("p50"))
    spec = {"name": "flat", "pieces": [
        {"id": "a", "assetId": sunk, "positionM": [0.0, 3.0, 0.0], "yawDeg": 0.0},
        {"id": "b", "assetId": sunk, "parentId": "a", "positionM": [0.0, 2.0, 0.0]},
    ]}
    jobs = ra.build_jobs([spec], index, tmp_path, 256, flat=True)
    a, b = jobs["assemblies"][0]["pieces"]
    assert a["worldM"][1] + a["designedSinkM"] == pytest.approx(0.0)
    assert jobs["assemblies"][0]["groundZ"] == 0.0
    # the child keeps its parent-local rise: that rise is the thing being judged
    assert b["worldM"][1] - a["worldM"][1] == pytest.approx(2.0)


def test_one_render_batch_per_set_of_kits(tmp_path):
    # The defect: a single Blender session imported every kit GLB (~600 MB) and
    # paid for all of it on every Cycles frame — 48 s per template.
    jobs = {"assemblies": [
        {"name": "x", "pieces": [{"glb": "/k/a.glb"}, {"glb": "/k/a.glb"}]},
        {"name": "y", "pieces": [{"glb": "/k/b.glb"}]},
        {"name": "z", "pieces": [{"glb": "/k/a.glb"}]},
    ]}
    groups = ra.kit_groups(jobs)
    assert [(label, len(a)) for label, a in groups] == [("a", 2), ("b", 1)]


def test_skip_existing_leaves_finished_assemblies_alone(tmp_path):
    for view in ra.VIEWS:
        (tmp_path / f"done-{view}.png").write_bytes(b"")
    assert ra.frames_exist(tmp_path, "done")
    (tmp_path / "done-plan.png").unlink()
    assert not ra.frames_exist(tmp_path, "done")


# --------------------------------------------------------------------------- #
# round 3 legibility: straight-on ortho elevations, metre scale, ground cut line,
# tinted mount children (16h ledger §4 renderer rules)
# --------------------------------------------------------------------------- #
def test_elevations_are_front_back_left_right_off_the_front_arrow():
    assert ra.ELEVATIONS == ("front", "back", "left", "right")
    assert ra.elevation_bearings(90.0) == {"front": 90.0, "right": 180.0,
                                          "back": 270.0, "left": 0.0}


def test_pixels_per_metre_comes_from_ortho_scale_and_resolution():
    assert ra.pixels_per_metre(10.0, 512) == pytest.approx(51.2)


def test_scale_bar_ticks_every_metre_and_labels_every_five():
    bar = ra.scale_bar(12.0, 600)            # 50 px per metre
    assert bar["lengthM"] == 5
    x0 = bar["x0"]
    assert bar["ticks"] == pytest.approx([x0 + 50.0 * i for i in range(6)])
    assert bar["labels"] == [(pytest.approx(x0), "0"), (pytest.approx(x0 + 250.0), "5")]
    assert bar["y"] < 600 and x0 < 600 * 0.1
    wide = ra.scale_bar(40.0, 400)           # 10 px per metre, 20 m bar
    assert [text for _, text in wide["labels"]] == ["0", "5", "10", "15", "20"]
    assert len(wide["ticks"]) == 21
    assert wide["ticks"][-1] < 400


def test_ground_row_projects_the_ground_line_and_clamps_off_frame():
    # 50 px/m, camera centre 2 m above the ground: 100 px below the middle row.
    assert ra.ground_row(0.0, 2.0, 10.0, 500) == (350, None)
    assert ra.ground_row(3.0, 2.0, 10.0, 500) == (200, None)
    row, clamp = ra.ground_row(-20.0, 2.0, 10.0, 500)
    assert clamp == "below" and 0 <= row < 500
    row, clamp = ra.ground_row(40.0, 2.0, 10.0, 500)
    assert clamp == "above" and 0 <= row < 500


def test_mount_pair_child_is_magenta_and_parent_ghosted_by_role():
    child = {"id": "child", "parentId": "parent"}
    parent = {"id": "parent", "parentId": None}
    assert ra.render_override("mount-pair", child) == {"kind": "emission",
                                                        "rgba": [1.0, 0.0, 1.0, 1.0]}
    assert ra.render_override("mount-pair", parent) == {"kind": "ghost", "alpha": 0.4}
    assert ra.render_override("kit-sheet", child) is None
    assert ra.render_override("template", parent) is None


def test_jobs_carry_front_bearing_ground_line_and_overrides(tmp_path):
    index = ra.KitIndex.load()
    sunk = next(asset_id for asset_id, kit in index.asset_kit.items()
                if (index.manifests[kit][asset_id].get("designedSinkM") or {}).get("p50"))
    spec = {"name": "pair", "source": {"kind": "mount-pair"}, "pieces": [
        {"id": "parent", "assetId": sunk, "positionM": [0.0, 1.0, 0.0], "yawDeg": 30.0},
        {"id": "child", "assetId": sunk, "parentId": "parent",
         "positionM": [0.0, 2.0, 0.0]},
    ]}
    assembly = ra.build_jobs([spec], index, tmp_path, 256)["assemblies"][0]
    parent, child = assembly["pieces"]
    assert assembly["groundLineM"] == pytest.approx(1.0 + parent["designedSinkM"])
    front = parent["frontDeg"]
    assert assembly["frontBearingDeg"] == pytest.approx(
        ((front or 0.0) + 30.0) % 360.0 if front is not None else 0.0)
    assert parent["override"]["kind"] == "ghost"
    assert child["override"]["kind"] == "emission"


def test_annotate_draws_the_cut_line_scale_and_label(tmp_path):
    from PIL import Image
    png = tmp_path / "x-front.png"
    Image.new("RGB", (500, 500), (20, 20, 20)).save(png)
    ra.annotate_frame(png, "front", "kit:some/asset",
                      {"orthoScale": 10.0, "centreUpM": 2.0, "res": 500}, 0.0)
    img = Image.open(png).convert("RGB")
    assert img.getpixel((250, 350)) == (255, 48, 48)      # the ground row
    assert img.getpixel((250, 348)) == (255, 255, 255)    # the halo above
    assert img.getpixel((250, 352)) == (255, 255, 255)    # and below
    bar = ra.scale_bar(10.0, 500)
    assert img.getpixel((int(bar["x0"]) + 10, bar["y"])) == (255, 255, 255)
    # top-left label: some pixel in the label box is no longer background
    box = img.crop((0, 0, 200, 24))
    assert len(box.getcolors()) > 1


def test_annotate_clamps_an_off_frame_ground_line_with_a_label(tmp_path):
    from PIL import Image
    png = tmp_path / "x-back.png"
    Image.new("RGB", (500, 500), (20, 20, 20)).save(png)
    note = ra.annotate_frame(png, "back", "a", {"orthoScale": 10.0, "centreUpM": 2.0,
                                                "res": 500}, -20.0)
    assert note == "(ground below frame)"


@pytest.mark.skipif(
    not (Path(os.path.expanduser(ra.TOOLCHAIN["blender"])).exists()
         and Path(os.path.expanduser(ra.TOOLCHAIN["wine"])).exists()),
    reason="wine/blender toolchain absent")
def test_the_two_legibility_fixtures_render(tmp_path):
    """One kit-sheet piece and one mined mount pair from the published kits,
    rendered here at 64 px so the test owns its frames (it used to read a
    hand-made /tmp render). The pair is the first mined pair whose two pieces
    are built, which spans hundreds of metres: the human figure must still
    draw at under 1 px per metre."""
    index = ra.KitIndex.load()
    mounts = json.loads(ra.MOUNTS_PATH.read_text())
    kit = min(index.manifests, key=lambda k: (len(index.manifests[k]), k))
    sheet = ra.specs_for_kit_sheet(index, kit, mounts)[:1]
    pair = next(p for p in mounts["pairs"]
                if p["child"] in index.asset_kit and p["parent"] in index.asset_kit)
    specs = sheet + [ra.spec_from_mount_pair(mounts, pair["child"], pair["parent"])]
    ra.render(specs, tmp_path, res=64, jobs=2)
    for spec in specs:
        safe = ra._safe(spec["name"])
        assert ra.frames_exist(tmp_path, safe), f"{spec['name']}: frames missing"
        for view in ra.VIEWS:
            path = tmp_path / f"{safe}-{view}.png"
            assert path.stat().st_size > 0, path


def test_annotate_draws_the_human_at_under_one_pixel_per_metre(tmp_path):
    from PIL import Image
    png = tmp_path / "x-front.png"
    Image.new("RGB", (64, 64), (20, 20, 20)).save(png)
    # 663 m across 64 px: 0.1 px per metre, the case that inverted the figure
    ra.annotate_frame(png, "front", "a", {"orthoScale": 663.0, "centreUpM": 0.0,
                                          "res": 64}, 0.0)


# --------------------------------------------------------------------------- #
# 16h tooling speed lane B2: the Sonnet preset, overlapped sessions, stamps
# --------------------------------------------------------------------------- #
def _two_group_specs(index):
    """Two templates from each of the first two kit groups (no Blender needed)."""
    specs = ra.all_template_specs(ASSEMBLIES, index)
    jobs = ra.build_jobs(specs, index, Path("/nonexistent"), 256)
    by_name = {s["name"]: s for s in specs}
    groups = ra.kit_groups(jobs)[:2]
    assert len(groups) == 2
    return [by_name[a["name"]] for _, group in groups for a in group[:2]]


def test_presets_owner_is_the_default_and_sonnet_is_small():
    assert ra.PRESETS["owner"] == {"res": 512, "views": ra.VIEWS, "samples": 12}
    assert ra.PRESETS["sonnet"] == {"res": 256, "views": ("front", "right", "plan"),
                                    "samples": 6}
    assert ra.DEFAULT_PRESET == "owner"


def test_jobs_and_sheet_carry_the_preset(tmp_path):
    index = ra.KitIndex.load()
    spec = _two_group_specs(index)[0]
    jobs = ra.build_jobs([spec], index, tmp_path, preset="sonnet")
    assert (jobs["res"], jobs["views"], jobs["samples"]) == (256, ["front", "right", "plan"], 6)
    text = ra.write_sheet(jobs, tmp_path).read_text()
    assert "-right.png" in text and "-back.png" not in text and "-collider.png" not in text
    owner = ra.build_jobs([spec], index, tmp_path)
    assert (owner["res"], len(owner["views"]), owner["samples"]) == (512, 6, 12)


def test_the_blender_script_reads_views_and_samples_from_the_jobs():
    src = ra.BLENDER_SCRIPT.read_text()
    assert 'JOBS.get("samples")' in src and 'JOBS.get("views")' in src


@pytest.mark.parametrize("res", [256, 512])
def test_scale_bar_and_cut_line_are_right_at_both_preset_resolutions(tmp_path, res):
    from PIL import Image
    scale = 16.0                                   # a typical two-piece span
    bar = ra.scale_bar(scale, res)
    ppm = res / scale
    assert bar["ppm"] == pytest.approx(ppm)
    # one tick per metre, the bar inside the frame, its length in metres true
    assert bar["ticks"][-1] - bar["ticks"][0] == pytest.approx(bar["lengthM"] * ppm)
    assert bar["ticks"][-1] <= res - ra.MARGIN_PX and bar["y"] < res
    assert bar["lengthM"] >= 5
    png = tmp_path / "x-front.png"
    Image.new("RGB", (res, res), (20, 20, 20)).save(png)
    ra.annotate_frame(png, "front", "kit:a", {"orthoScale": scale, "centreUpM": 2.0,
                                              "res": res}, 0.0)
    img = Image.open(png).convert("RGB")
    row = round(res / 2 + 2.0 * ppm)
    assert img.getpixel((res // 2, row)) == (255, 48, 48)
    mid_tick = int(round(bar["ticks"][2]))
    assert img.getpixel((mid_tick, bar["y"])) == (255, 255, 255)
    # the 5 m tick is where 5 m of the frame's own scale says it is
    assert bar["ticks"][5] - bar["x0"] == pytest.approx(5 * ppm)


def _fake_blender(calls):
    """Stand-in for run_blender: one file per view, sized by the assembly name."""
    import threading
    import time as _time
    state = {"live": 0, "peak": 0}
    lock = threading.Lock()

    def fake(jobs, out_dir, jobs_name="jobs.json"):
        with lock:
            state["live"] += 1
            state["peak"] = max(state["peak"], state["live"])
        calls.append(jobs_name)
        _time.sleep(0.2)
        for assembly in jobs["assemblies"]:
            for view in jobs["views"]:
                (out_dir / f"{assembly['safeName']}-{view}.png").write_bytes(
                    b"x" * (len(assembly["safeName"]) + len(view)))
        with lock:
            state["live"] -= 1
    return fake, state


def test_overlapped_sessions_write_the_same_files_as_serial(tmp_path, monkeypatch):
    index = ra.KitIndex.load()
    specs = _two_group_specs(index)
    sets = {}
    for n in (1, 2):
        calls = []
        fake, state = _fake_blender(calls)
        monkeypatch.setattr(ra, "run_blender", fake)
        out = tmp_path / f"jobs{n}"
        ra.render(specs, out, preset="sonnet", jobs=n)
        sets[n] = sorted((p.name, p.stat().st_size) for p in out.iterdir())
        assert len(calls) == 2
        assert state["peak"] == n
    assert sets[1] == sets[2]


def test_skip_existing_is_keyed_on_a_stamp_of_kit_and_preset(tmp_path):
    glb = tmp_path / "k.glb"
    glb.write_bytes(b"abc")
    assembly = {"safeName": "a", "pieces": [{"glb": str(glb)}, {"glb": str(glb)}]}
    owner = ra.PRESETS["owner"]
    assert not ra.is_current(tmp_path, assembly, owner)
    for view in ra.VIEWS:
        (tmp_path / f"a-{view}.png").write_bytes(b"")
    assert not ra.is_current(tmp_path, assembly, owner)       # frames, no stamp
    ra.write_stamp(tmp_path, assembly, owner)
    assert ra.is_current(tmp_path, assembly, owner)
    assert not ra.is_current(tmp_path, assembly, ra.PRESETS["sonnet"])   # preset
    glb.write_bytes(b"abcd")                                                # kit
    assert not ra.is_current(tmp_path, assembly, owner)
    ra.write_stamp(tmp_path, assembly, owner)
    (tmp_path / "a-plan.png").unlink()                                      # frame
    assert not ra.is_current(tmp_path, assembly, owner)


def test_skip_existing_re_renders_a_pair_whose_offset_or_yaw_moved(tmp_path):
    """16h K10 F: a re-mined pair changes the child's pose, not the kit GLB."""
    glb = tmp_path / "k.glb"
    glb.write_bytes(b"abc")
    assembly = {"safeName": "a", "pieces": [
        {"glb": str(glb), "id": "parent", "positionM": [0.0, 0.0, 0.0], "yawDeg": 0.0},
        {"glb": str(glb), "id": "child", "positionM": [1.0, 0.0, 0.0], "yawDeg": 90.0}]}
    owner = ra.PRESETS["owner"]
    for view in ra.VIEWS:
        (tmp_path / f"a-{view}.png").write_bytes(b"")
    ra.write_stamp(tmp_path, assembly, owner)
    assert ra.is_current(tmp_path, assembly, owner)
    assembly["pieces"][1]["positionM"] = [1.2, 0.0, 0.0]                    # offset
    assert not ra.is_current(tmp_path, assembly, owner)
    ra.write_stamp(tmp_path, assembly, owner)
    assembly["pieces"][1]["yawDeg"] = 95.0                                  # yaw
    assert not ra.is_current(tmp_path, assembly, owner)


def test_render_skips_only_stamped_assemblies(tmp_path, monkeypatch):
    index = ra.KitIndex.load()
    specs = _two_group_specs(index)
    calls = []
    fake, _ = _fake_blender(calls)
    monkeypatch.setattr(ra, "run_blender", fake)
    ra.render(specs, tmp_path, preset="sonnet", skip_existing=True)
    assert len(calls) == 2
    ra.render(specs, tmp_path, preset="sonnet", skip_existing=True)
    assert len(calls) == 2                        # everything current: no session
    ra.render(specs, tmp_path, preset="owner", skip_existing=True)
    assert len(calls) == 4                        # a changed preset re-renders


def test_render_sheet_passes_the_preset_and_jobs_through(monkeypatch, tmp_path):
    from . import render_sheet
    seen = {}
    monkeypatch.setattr(render_sheet.render_assembly, "specs_from_args", lambda a: ["s"])
    monkeypatch.setattr(render_sheet.render_assembly, "render",
                        lambda specs, out, res=None, **kw: seen.update(res=res, **kw))
    monkeypatch.setattr(sys, "argv", ["render_sheet", "--template", "x/y", "--out",
                                      str(tmp_path), "--preset", "sonnet", "--jobs", "3"])
    render_sheet.main()
    assert seen["preset"] == "sonnet" and seen["jobs"] == 3 and seen["res"] is None


# --------------------------------------------------------------------------- #
# 16h part 1 round 6: the Sonnet sample pass's six renderer defects
# --------------------------------------------------------------------------- #
def _box_corners(lo, hi):
    return [(x, y, z) for x in (lo[0], hi[0]) for y in (lo[1], hi[1])
            for z in (lo[2], hi[2])]


@pytest.mark.parametrize("length", [30.0, 2.0])
def test_every_view_is_framed_to_the_bbox_so_long_and_short_pieces_fill_it(length):
    # The defect: one fixed square round the pieces AND the ground and human
    # bar, so a tree walkway 58 m above its ground was a speck (t0085).
    corners = _box_corners((-length / 2, -0.5, 58.0), (length / 2, 0.5, 60.0))
    bearings = ra.elevation_bearings(0.0)
    for view in ("front", "plan"):
        frame = ra.frame_view(corners, view, bearings.get(view, 0.0))
        right = frame["right"]
        xs = [sum(p[i] * right[i] for i in range(3)) for p in corners]
        assert (max(xs) - min(xs)) / frame["orthoScale"] >= 0.6, (length, view)
        # 10 % margin per side: the piece is inside the frame
        assert frame["orthoScale"] == pytest.approx(
            max(length, 2.0 if view == "front" else 1.0) * 1.2)
    front = ra.frame_view(corners, "front", 0.0)
    assert front["centreUpM"] == pytest.approx(59.0)
    # the metre bar reads the frame's own scale, so it adapts with the framing
    assert ra.scale_bar(front["orthoScale"], 512)["ppm"] == pytest.approx(
        512 / front["orthoScale"])


def test_view_axes_follow_the_camera_bearing():
    right, up, toward = ra.view_axes("front", 0.0)      # camera north, looking south
    assert right == pytest.approx((-1.0, 0.0, 0.0)) and up == (0.0, 0.0, 1.0)
    assert toward == pytest.approx((0.0, 1.0, 0.0))
    right, up, toward = ra.view_axes("plan", 123.0)     # plan is always north-up
    assert (right, up, toward) == ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))


def test_a_two_piece_job_marks_only_each_test_pieces_own_doorways(tmp_path):
    # The defect: the 61 co-placement connectors of a window (up to 5 m from
    # it) were drawn as yellow dots and blanketed the frame (t0009).
    index = ra.KitIndex.load()
    spec = ra.spec_from_template(ASSEMBLIES, "bmv-blackmarsh", "bmv-blackmarsh:t0009")
    pieces = ra.build_jobs([spec], index, tmp_path, 256)["assemblies"][0]["pieces"]
    for piece in pieces:
        assert len(piece["connectorsM"]) > 0          # the data is still there
        expected = piece["doorwaysM"] if piece["role"] == "test" else []
        assert piece["dotsM"] == expected
    doored = next(a for a, kit in index.asset_kit.items()
                  if index.describe(a)["doorwaysM"])
    spec = {"name": "two", "source": {"kind": "assembly"}, "pieces": [
        {"id": "a", "assetId": doored, "positionM": [0.0, 0.0, 0.0], "yawDeg": 0.0},
        {"id": "b", "assetId": spec["pieces"][0]["assetId"],
         "positionM": [20.0, 0.0, 0.0], "yawDeg": 0.0}]}
    a, b = ra.build_jobs([spec], index, tmp_path, 256)["assemblies"][0]["pieces"]
    assert a["dotsM"] == index.describe(doored)["doorwaysM"] and b["dotsM"] == []


def test_inside_box_keeps_dots_on_the_piece_only():
    lo, hi = (0.0, 0.0, 0.0), (2.0, 1.0, 3.0)
    assert ra.inside_box((1.0, 0.5, 1.0), lo, hi)
    assert ra.inside_box((2.2, 0.5, 1.0), lo, hi)           # within the tolerance
    assert not ra.inside_box((5.1, 0.5, 1.0), lo, hi)


def test_template_anchor_is_ghosted_context_and_the_part_is_under_test(tmp_path):
    index = ra.KitIndex.load()
    spec = ra.spec_from_template(ASSEMBLIES, "vanilla", "vanilla:t0429")
    anchor, part = ra.build_jobs([spec], index, tmp_path, 256)["assemblies"][0]["pieces"]
    assert anchor["role"] == "context"
    assert anchor["override"] == {"kind": "ghost", "alpha": ra.GHOST_ALPHA}
    assert part["role"] == "test" and part["override"] is None


def test_a_mounted_template_asset_gets_its_host_ghosted_behind_it():
    index = ra.KitIndex.load()
    child, parent = next((a, b) for a in index.asset_kit for b in index.asset_kit if a != b)
    mounts = {"pairs": [{"child": child, "parent": parent, "n": 5,
                         "offsetM": [1.0, 2.0, 0.5], "yawDeg": 30.0}]}
    spec = {"name": "t", "source": {"kind": "template"}, "pieces": [
        {"id": "anchor", "assetId": parent, "positionM": [0.0, 0.0, 0.0], "yawDeg": 0.0},
        {"id": "part", "assetId": child, "positionM": [4.0, 1.0, -3.0], "yawDeg": 70.0}]}
    out = ra.add_mount_hosts(spec, mounts, index)
    host = next(p for p in out["pieces"] if p["id"] == "host-part")
    assert host["assetId"] == parent and host["role"] == "context"
    # the pair, re-applied to the host, puts the child back where it stands
    placed = ra.place_pieces([dict(host, id="h"),
                              {"id": "c", "assetId": child, "parentId": "h",
                               "positionM": ra.kit_to_compile([1.0, 2.0, 0.5]),
                               "yawDeg": 30.0}])
    assert placed[1]["worldM"] == pytest.approx([4.0, 1.0, -3.0])
    assert placed[1]["worldYawDeg"] == pytest.approx(70.0)
    # an asset with no pair gets nothing
    assert len(ra.add_mount_hosts(spec, {"pairs": []}, index)["pieces"]) == 2


def _frame_meta(view, bearing, scale=10.0, res=500, centre=(0.0, 0.0, 2.0)):
    right, up, toward = ra.view_axes(view, bearing)
    return {"orthoScale": scale, "centreUpM": centre[2], "res": res,
            "centre": list(centre), "right": list(right), "up": list(up),
            "toward": list(toward)}


def _green(img, box):
    return sum(1 for x in range(box[0], box[2]) for y in range(box[1], box[3])
               if img.getpixel((x, y)) == ra.ARROW_GREEN)


def test_front_arrow_is_an_arrow_in_plan_and_side_views_and_a_badge_head_on(tmp_path):
    from PIL import Image
    arrow = {"originM": [0.0, 0.0, 2.0], "directionM": [0.0, 1.0, 0.0], "lengthM": 3.0}
    # plan: north-up, so a north arrow runs up the frame from the centre
    png = tmp_path / "p-plan.png"
    Image.new("RGB", (500, 500), (20, 20, 20)).save(png)
    ra.annotate_frame(png, "plan", "a", _frame_meta("plan", 0.0), None, arrows=[arrow])
    img = Image.open(png).convert("RGB")
    assert _green(img, (245, 110, 256, 245)) > 50           # shaft + head above centre
    assert _green(img, (245, 260, 256, 400)) == 0           # nothing below it
    assert ra.arrow_glyph(_frame_meta("front", 0.0), arrow) == "toward"
    assert ra.arrow_glyph(_frame_meta("back", 180.0), arrow) == "away"
    assert ra.arrow_glyph(_frame_meta("left", 270.0), arrow) == "arrow"
    png = tmp_path / "f-front.png"
    Image.new("RGB", (500, 500), (20, 20, 20)).save(png)
    ra.annotate_frame(png, "front", "a", _frame_meta("front", 0.0), 0.0, arrows=[arrow])
    img = Image.open(png).convert("RGB")
    assert _green(img, (235, 235, 265, 265)) > 100          # the filled FRONT badge


def test_the_plan_gets_the_scale_bar_and_label_but_no_ground_line(tmp_path):
    from PIL import Image
    png = tmp_path / "x-plan.png"
    Image.new("RGB", (500, 500), (20, 20, 20)).save(png)
    ra.annotate_frame(png, "plan", "kit:a", _frame_meta("plan", 0.0), None)
    img = Image.open(png).convert("RGB")
    bar = ra.scale_bar(10.0, 500)
    assert img.getpixel((int(bar["x0"]) + 10, bar["y"])) == (255, 255, 255)
    assert len(img.crop((0, 0, 200, 24)).getcolors()) > 1
    assert all(img.getpixel((250, y)) != ra.CUT_RED for y in range(500))


def test_a_sheet_with_context_pieces_carries_the_legend(tmp_path):
    from PIL import Image
    plain, legend = tmp_path / "a-front.png", tmp_path / "b-front.png"
    for png in (plain, legend):
        Image.new("RGB", (500, 500), (20, 20, 20)).save(png)
    ra.annotate_frame(plain, "front", "a", _frame_meta("front", 0.0), 0.0)
    ra.annotate_frame(legend, "front", "a", _frame_meta("front", 0.0), 0.0,
                      legend=ra.CONTEXT_LEGEND)
    band = (0, 24, 320, 48)
    assert (Image.open(legend).crop(band).getcolors(4096)
            != Image.open(plain).crop(band).getcolors(4096))
    assert ra.CONTEXT_LEGEND == "solid = under test, ghost = context"


def test_the_collider_wire_is_unparented_before_it_is_placed():
    # The defect: `parent = None` after `matrix_world =` keeps the parent-local
    # basis, so every piece's wire landed on the assembly origin and the gate
    # sheet showed one piece's worth of cyan.
    src = ra.BLENDER_SCRIPT.read_text()
    body = src[src.index("def wireframe_copy"):src.index("def wire_box")]
    assert body.index("dup.parent = None") < body.index("dup.matrix_world =")


def test_a_blender_script_that_raises_fails_the_render(tmp_path, monkeypatch):
    # Blender exits 0 when its --python script raises; the closing line is the proof.
    class Done:
        returncode, stdout, stderr = 0, "Traceback ...\n", ""
    monkeypatch.setattr(ra.subprocess, "run", lambda *a, **k: Done())
    with pytest.raises(SystemExit, match="assembly render failed"):
        ra.run_blender({"assemblies": []}, tmp_path)
    Done.stdout = "[assembly] done 0 frames, 0 assemblies\n"
    ra.run_blender({"assemblies": []}, tmp_path)


def test_the_blender_script_loads_the_host_module_as_blender_would():
    # exec the loader lines outside Blender: the @dataclass needs sys.modules.
    import importlib.util
    spec = importlib.util.spec_from_file_location("host_probe", ra.__file__)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    assert module.frame_view and module.inside_box
    assert "sys.modules[_spec.name] = host" in ra.BLENDER_SCRIPT.read_text()


# --------------------------------------------------------------------------- #
# round 6 follow-up: recommendations 1, 3, 4, 5 (planner 2026-09-23)
# --------------------------------------------------------------------------- #
def test_flat_drops_the_whole_assembly_by_the_first_test_pieces_sink(tmp_path):
    # The defect: each root took its own sink, so t0429's roof corner lost the
    # mined rise between it and its frame.
    index = ra.KitIndex.load()
    sunk = [a for a, kit in index.asset_kit.items()
            if (index.manifests[kit][a].get("designedSinkM") or {}).get("p50")]
    a_id, b_id = sunk[0], next(x for x in sunk if index.asset(x)["designedSinkM"]["p50"]
                               != index.asset(sunk[0])["designedSinkM"]["p50"])
    spec = {"name": "t", "source": {"kind": "template"}, "pieces": [
        {"id": "anchor", "assetId": a_id, "positionM": [0.0, 0.0, 0.0], "yawDeg": 0.0},
        {"id": "part", "assetId": b_id, "positionM": [2.0, 1.5, 0.0], "yawDeg": 0.0}]}
    anchor, part = ra.build_jobs([spec], index, tmp_path, 256, flat=True)["assemblies"][0]["pieces"]
    assert part["worldM"][1] - anchor["worldM"][1] == pytest.approx(1.5)   # rise kept
    assert part["worldM"][1] + part["designedSinkM"] == pytest.approx(0.0)  # test piece on 0


def test_a_mount_pair_parent_carries_its_mined_scale(tmp_path):
    index = ra.KitIndex.load()
    child, parent = next((a, b) for a in index.asset_kit for b in index.asset_kit if a != b)
    mounts = {"pairs": [{"child": child, "parent": parent, "offsetM": [0, 0, 1],
                         "parentScale": 2.2}]}
    spec = ra.spec_from_mount_pair(mounts, child, parent)
    assert spec["pieces"][0]["scale"] == 2.2 and "scale" not in spec["pieces"][1]
    pieces = ra.build_jobs([spec], index, tmp_path, 256)["assemblies"][0]["pieces"]
    assert pieces[0]["scale"] == 2.2 and pieces[1]["scale"] == 1.0
    assert "piece.get(\"scale\")" in ra.BLENDER_SCRIPT.read_text()


def test_a_template_asset_with_no_mount_pair_takes_its_host_from_the_template_sets():
    # t0009: a window pair with no mined mount; the same set places that window
    # as the PART against a house ANCHOR, and that anchor is the host.
    index = ra.KitIndex.load()
    spec = ra.spec_from_template(ASSEMBLIES, "bmv-blackmarsh", "bmv-blackmarsh:t0009")
    out = ra.add_mount_hosts(spec, {"pairs": []}, index, ASSEMBLIES)
    host = next(p for p in out["pieces"] if p["id"] == "host-part")
    window = spec["pieces"][1]["assetId"]
    source = max((t for t in ASSEMBLIES["sets"]["bmv-blackmarsh"]["templates"]
                  if t["part"] == window and t["anchor"] != window
                  and t["anchor"] in index.asset_kit and t["offsetM"] is not None),
                 key=lambda t: t["count"])
    assert host["assetId"] == source["anchor"] and host["role"] == "context"
    placed = ra.place_pieces([dict(host, id="h"),
                              {"id": "w", "assetId": window, "parentId": "h",
                               "positionM": ra.kit_to_compile(source["offsetM"]),
                               "yawDeg": float(source.get("yawDeg") or 0.0)}])
    part = ra.place_pieces([dict(p) for p in spec["pieces"]])[1]
    assert placed[1]["worldM"] == pytest.approx(part["worldM"])


def test_sheet_md_merges_new_rows_into_the_batchs_sheet(tmp_path):
    index = ra.KitIndex.load()
    specs = ra.all_template_specs(ASSEMBLIES, index)[:3]
    ra.write_sheet(ra.build_jobs(specs, index, tmp_path, 256), tmp_path)
    ra.write_sheet(ra.build_jobs(specs[1:2], index, tmp_path, 256), tmp_path)
    text = (tmp_path / "sheet.md").read_text()
    for spec in specs:
        assert text.count(f"\n## {spec['name']}\n") == 1
    assert text.startswith("# Assembly sheets\n\n3 assemblies")
    assert text.count("## What to check on every frame") == 1


def test_a_host_already_standing_in_the_assembly_is_not_added_twice():
    # t0429's roof corner: its best template host IS the template's own anchor.
    index = ra.KitIndex.load()
    spec = ra.spec_from_template(ASSEMBLIES, "vanilla", "vanilla:t0429")
    assert len(ra.add_mount_hosts(spec, {"pairs": []}, index, ASSEMBLIES)["pieces"]) == 2

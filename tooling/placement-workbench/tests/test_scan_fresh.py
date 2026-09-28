"""0105 R31 (method review r5 finding B): a building op is legal only when
its pose lies inside a site scan newer than the op. At Claywater walk 3 the
brief named the stable's site and ~45 min of trial applies followed; the
`scanFreshRule` fails a re-sited building no fresh scan covers. No kit
builds or ground needed."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import layout, paths  # noqa: E402

STABLE = {"op": "place", "uid": "stable", "asset": "vanilla:architecture/riften/rtstables01",
          "at": [334.6, 3087.6], "yaw": 238.0, "pad": {"apronM": 2.0}}
LAMP = {"op": "mount", "child": "lamp", "asset": "x", "on": "stable"}


def _scan(at, centre, radius=4.0, step=1.0, yaws=(225.0, 240.0, 255.0), asset=STABLE["asset"]):
    return {"at": at, "buildings": [{"asset": asset, "centre": list(centre), "radius": radius,
                                     "step": step, "yaws": list(yaws), "poses": 1}]}


def test_a_building_moved_since_head_needs_a_fresh_scan_covering_its_pose():
    head = [{**STABLE, "at": [330.0, 3080.0]}, LAMP]
    now = [STABLE, LAMP]
    since = "2026-09-28T10:00:00Z"
    # no scan at all: fails, naming the piece and the rule
    [f] = wb.scan_fresh_failures(head, now, [], since)
    assert f.startswith("stable: changed since HEAD") and "0105 R31" in f
    # a scan older than HEAD's layout does not count
    old = _scan("2026-09-28T09:00:00Z", (334.0, 3088.0))
    assert len(wb.scan_fresh_failures(head, now, [old], since)) == 1
    # a fresh scan elsewhere, or of another asset, or not at this yaw, does not count
    assert len(wb.scan_fresh_failures(head, now, [_scan("2026-09-28T11:00:00Z", (300.0, 3000.0))], since)) == 1
    assert len(wb.scan_fresh_failures(head, now, [_scan("2026-09-28T11:00:00Z", (334.0, 3088.0),
                                                        asset="other")], since)) == 1
    assert len(wb.scan_fresh_failures(head, now, [_scan("2026-09-28T11:00:00Z", (334.0, 3088.0),
                                                        yaws=(0.0, 90.0))], since)) == 1
    # a fresh scan whose grid holds the pose passes
    assert wb.scan_fresh_failures(head, now, [_scan("2026-09-28T11:00:00Z", (334.0, 3088.0))], since) == []
    # an unchanged building and a non-building op never need one
    assert wb.scan_fresh_failures(now, now, [], since) == []
    # a new building with no HEAD copy needs one too
    assert len(wb.scan_fresh_failures([], now, [], None)) == 1


def test_a_move_or_swap_after_the_place_op_is_judged_on_the_end_pose():
    """Review 2026-09-28: the rule read raw `place` ops, so a later `move` or
    `swap` of an unchanged `place` op needed no scan."""
    head = [dict(STABLE)]
    since = "2026-09-28T10:00:00Z"
    moved = [dict(STABLE), {"op": "move", "uid": "stable", "dx": 8.0}]
    [f] = wb.scan_fresh_failures(head, moved, [_scan("2026-09-28T11:00:00Z", (334.0, 3088.0))], since)
    assert "at [342.60, 3087.60]" in f
    assert wb.scan_fresh_failures(head, moved, [_scan("2026-09-28T11:00:00Z", (342.0, 3088.0))], since) == []
    swapped = [dict(STABLE), {"op": "swap", "uid": "stable", "asset": "other"}]
    assert len(wb.scan_fresh_failures(head, swapped, [_scan("2026-09-28T11:00:00Z", (334.0, 3088.0))],
                                      since)) == 1
    turned = [dict(STABLE), {"op": "move", "uid": "stable", "turn": 180.0}]
    assert len(wb.scan_fresh_failures(head, turned, [_scan("2026-09-28T11:00:00Z", (334.0, 3088.0))],
                                      since)) == 1
    # a scan that recorded no yaws vouches for none
    no_yaws = _scan("2026-09-28T11:00:00Z", (334.0, 3088.0), yaws=())
    assert len(wb.scan_fresh_failures([], [dict(STABLE)], [no_yaws], None)) == 1


def _git(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True,
                   env={"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
                        "GIT_COMMITTER_EMAIL": "t@t", "PATH": "/usr/bin:/bin"})


def test_scan_fresh_rule_reads_head_and_the_places_own_scans(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init", "-q")
    lay = repo / "p.layout.json"
    lay.write_text(json.dumps({"placeId": "place.x", "ops": [{**STABLE, "at": [330.0, 3080.0]}]}))
    _git(repo, "add", "p.layout.json")
    _git(repo, "commit", "-qm", "walked")
    monkeypatch.setattr(paths, "REPO_ROOT", repo.resolve())
    reports = tmp_path / "reports"
    (reports / "place.x" / "round-2").mkdir(parents=True)
    (reports / "place.y" / "round-1").mkdir(parents=True)
    lay.write_text(json.dumps({"placeId": "place.x", "ops": [STABLE]}))
    got = wb.scan_fresh_rule(lay, reports)
    assert len(got["failures"]) == 1 and got["scans"] == 0
    rows = layout.check_failure_rows({"pieces": {"stable": {}}, "nearPairs": [], "doors": {},
                                      "scanFresh": got})
    assert [(r["rule"], r["uids"]) for r in rows] == [("scanFreshRule", ["stable"])]
    good = {**_scan("2100-01-01T00:00:00Z", (334.0, 3088.0)), "placeId": "place.x"}
    # a spec, a pre-R31 output (no `at`), and another place's scan are no evidence
    (reports / "place.x" / "round-2" / "scan-spec.json").write_text(json.dumps(
        {"buildings": [{"asset": STABLE["asset"], "centre": [334.0, 3088.0]}]}))
    (reports / "place.x" / "round-2" / "scan-old.json").write_text(json.dumps(
        {k: v for k, v in good.items() if k != "at"}))
    (reports / "place.y" / "round-1" / "scan.json").write_text(json.dumps({**good, "placeId": "place.y"}))
    assert wb.scan_fresh_rule(lay, reports)["scans"] == 0
    (reports / "place.x" / "round-2" / "scan.json").write_text(json.dumps(good))
    got = wb.scan_fresh_rule(lay, reports)
    assert got["scans"] == 1 and got["failures"] == []

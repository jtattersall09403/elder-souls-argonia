"""16k walk 4 lane COMPILE (owner 2026-09-28, decision 0097: the pose record
IS the output). The compile re-derived Y instead of taking the workbench's
pose: at HEAD the Claywater stable compiled 2.57 m under its seat (34.83 vs
37.40, its op carried a pad and no `settle`), the landing stage +3.01 m and
every retaining wall +1.78 to +2.97 m (a run's datum from its highest
ground). Now every compiled placement y (shells, landmarks, ground assembly
members, run members; a mounted child as its host plus its offset) equals
the workbench seat within 0.02 m on the Claywater and Greenspring layouts,
and the seat rules judge the compiled pivots as well as the scene. Local
only: the raw kit builds and the ground window."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import paths, rules, seat_rules  # noqa: E402

FIX = HERE.parent / "fixtures"
LAYOUTS = {"claywater": FIX / "claywater-walk4.layout.json",
           # the LIVE layout: the compile reads the live blueprint skeleton, whose
           # interior claims follow the live shells (Greenspring's shells changed
           # after the walk-4 fixture was cut: a pinned layout against the live
           # skeleton fails the claim size and door-on-way schema checks)
           "greenspring": HERE.parents[2] / "world" / "sources" / "blueprints" / "greenspring.layout.json"}
HEAD_COMPILED = FIX / "claywater-walk4.compiled.json"
"""Claywater's pivots as the HEAD compile wrote them (15:02, lane WB)."""
TOL_M = 0.02


@pytest.fixture(scope="module", params=sorted(LAYOUTS))
def compiled(request, applied_layout, tmp_path_factory):
    scene = applied_layout(LAYOUTS[request.param])
    out = tmp_path_factory.mktemp(f"compile-{request.param}")
    got = wb.compile_scene(scene.view(), paths.BLUEPRINTS / f"{scene.placeId}.json", keep_out=out)
    assert got.get("settlement"), ({k: got.get(k) for k in ("stage", "failed", "exitCode")},
                                   [e.get("msg") for e in got.get("errors") or []])
    return scene, json.loads(Path(got["settlement"]).read_text())


def _world_y(doc: dict) -> dict[str, float]:
    """placement id -> world pivot y (a mounted child: its host's plus its offset)."""
    by = {r["id"]: r for r in doc["placements"]}

    def y(r):
        if r.get("parentPlacementId"):
            return y(by[r["parentPlacementId"]]) + float((r.get("mountOffsetM") or [0, 0, 0])[1])
        return float(r["positionM"][1])
    return {pid: y(r) for pid, r in by.items()}


def _uid(scene, row) -> str | None:
    uid = rules.bundle_uid(scene, row["id"], scene.placeId)
    if uid is None and row.get("landmarkId"):
        uid = next((q.uid for q in scene.pieces if (q.role or {}).get("kind") == "landmark"
                    and q.role.get("id") == row["landmarkId"]), None)
    return uid


def test_every_compiled_y_is_the_workbench_seat(compiled):
    scene, doc = compiled
    ys, pieces = _world_y(doc), {p.uid: p for p in scene.pieces}
    matched, off, unseated = 0, [], []
    for row in doc["placements"]:
        uid = _uid(scene, row)
        if uid not in pieces:
            continue                        # a compile ring piece or a socket effect
        p = pieces[uid]
        if p.y is None:
            unseated.append(uid)
            continue
        matched += 1
        if abs(ys[row["id"]] - p.y) > TOL_M:
            off.append((uid, round(p.y, 3), round(ys[row["id"]], 3)))
    bound = [p.uid for p in scene.pieces if (p.role or {}).get("kind") in ("parcel", "run", "landmark")]
    assert not unseated and not off
    assert matched >= len(bound) > 0


def test_run_members_and_shells_are_final(compiled):
    """Every ground piece the workbench posed ships `yFinal`: the runtime
    (anchoring.ts) applies it, and a run's riseM is read from the poses, so
    anchorRun's rigid chain reproduces each member."""
    scene, doc = compiled
    grounded = [r for r in doc["placements"] if r.get("run") or r["id"].endswith(".building")]
    assert grounded and all(r.get("yFinal") is True for r in grounded)


def test_the_head_compile_put_the_stable_and_the_landing_off_their_seats(applied_layout):
    """Failing first: the frozen HEAD compile against the same poses."""
    scene = applied_layout(LAYOUTS["claywater"])
    head = seat_rules.compiled_from(scene, HEAD_COMPILED)
    assert head["stable"] == pytest.approx(34.831, abs=0.01)
    assert scene.piece("stable").y == pytest.approx(37.4, abs=TOL_M)
    for uid in ("land-dock1", "land-dock2"):
        assert head[uid] - scene.piece(uid).y == pytest.approx(3.01, abs=0.02)


def test_fixture_seat_judges_the_compiled_pivots(applied_layout, monkeypatch):
    """A compile that sinks a lantern the workbench seats fails fixtureSeatRule
    on the compiled pivot; one that moves the deck under it with it passes."""
    scene = applied_layout(LAYOUTS["claywater"]).view()
    cat = wb.place_catalogue(scene.placeId)
    y = scene.piece("isy-lamp").y
    monkeypatch.setattr(seat_rules, "compiled_y", lambda s: {"isy-lamp": y - 0.3})
    fails = rules.piece_rule("fixtureSeat", cat, scene, ["isy-lamp"])["failures"]
    assert fails and "last compile" in fails[0] and "under the" in fails[0]
    monkeypatch.setattr(seat_rules, "compiled_y", lambda s: {"isy-lamp": y})
    assert rules.piece_rule("fixtureSeat", cat, scene, ["isy-lamp"])["failures"] == []


def test_archway_fails_greenspring_open_mudhuts_naming_the_plugin_door(applied_layout):
    """kotm mudhut01 carries its doorway in its own mesh (interiors
    `own-geometry-door`) and b-fam1/b-fam2 stood with no door piece: the
    owner walked into an open archway. The door named is the one King of
    the Murkmire hangs in every linked shell of the same folder (mudhut02,
    smpodext02: door01). A shell that bakes its door (composite) passes."""
    scene = applied_layout(FIX / "greenspring-walk4.layout.json").view()   # the walk-4 shells
    cat = wb.place_catalogue(scene.placeId)
    out = rules.piece_rule("archway", cat, scene)
    failed = {f.split(":", 1)[0] for f in out["failures"]}
    assert {"b-fam1", "b-fam2"} <= failed
    assert all("kotm:argonia/mudhuts/door01" in f for f in out["failures"] if f.startswith("b-fam"))
    assert "lodge" not in failed and out["pieces"]["b-fam1"]["pluginDoor"] == "kotm:argonia/mudhuts/door01"

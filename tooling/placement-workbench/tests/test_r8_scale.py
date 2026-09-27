"""16k r8 (coordinator item): a `place` op with no --scale takes the
catalogue's placed scale (the manifest's placedScaleMedian), and the export
writes a parcel's scale whenever its manifest carries a median, 1.0 included."""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import export  # noqa: E402
from workbench.kits import Catalogue  # noqa: E402
from workbench.scene import Piece, Scene  # noqa: E402

HUT = "mudmother:gv_meshes/argoniannest/mudhut01"
WALL = "vanilla:architecture/farmhouse/stonewall/stonewall01"


def test_placing_the_mud_hut_with_no_scale_gives_its_placed_scale(tmp_path):
    cat = Catalogue()
    scene = Scene(path=tmp_path / "s.json", placeId="place.x")
    ns = wb.parser().parse_args(["-", "place", "hut", HUT, "--at", "10", "20"])
    wb.cmd_place(ns, scene, cat)
    assert scene.piece("hut").scale == 2.3
    ns = wb.parser().parse_args(["-", "place", "hut2", HUT, "--at", "10", "20", "--scale", "1.5"])
    wb.cmd_place(ns, scene, cat)
    assert scene.piece("hut2").scale == 1.5


def test_the_export_writes_the_scale_of_a_piece_with_a_median(tmp_path):
    scene = Scene(path=tmp_path / "s.json", placeId="place.x")
    scene.add(Piece("hut", HUT, 10.0, 20.0, scale=1.0, role={"kind": "parcel", "id": "p.hut"}))
    scene.add(Piece("wall", WALL, 30.0, 20.0, scale=1.0, role={"kind": "parcel", "id": "p.wall"}))
    got = export.poses(scene, 1000.0)["parcels"]
    assert got["p.hut"]["scale"] == 1.0          # the manifest has a median: written
    assert "scale" not in got["p.wall"]          # no median, scale 1.0: not written

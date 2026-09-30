"""wb.py packet-shots (walk 6 item 4): contents come from the published
bundle, and every picture and the manifest carry HEAD + bundle sha."""
from __future__ import annotations

import json
from types import SimpleNamespace

from PIL import Image

from workbench import packet_shots

SITE = "place.t.tiny"


def _bundle():
    pl = lambda pid, asset, kind="settlement", x=0.0: {
        "id": f"{SITE}.{pid}", "assetId": asset, "kind": kind, "positionM": [x, 0.0, 0.0]}
    return {"placeId": SITE, "settlement": {"id": SITE}, "placements": [
        pl("parcel.t.house.building", "composite:stilt/longhouse"),
        pl("parcel.t.walk.piece.1", "kit/boardwalk01"), pl("parcel.t.walk.piece.2", "kit/boardwalk01"),
        pl("parcel.t.pier.piece.1", "kit/boardwalk01"),
        pl("parcel.t.house.assembly.lamp", "kit/lantern01"),
        pl("parcel.t.house.assembly.lamp2", "kit/lantern01"),
        pl("landmark.t.tree", "kit/bigtree", kind="landmark"),
    ], "doors": [{"settlementId": SITE, "interiorClaim": {"cellId": "CellA"}}]}


def test_contents_and_stamp(tmp_path):
    prov = tmp_path / "province"
    (prov / "settlements").mkdir(parents=True)
    (prov / "settlements" / f"{SITE}.json").write_text(json.dumps(_bundle()))
    (prov / "settlements" / "index.json").write_text(json.dumps(
        {"places": [{"id": SITE, "sha256": "abcdef1234567890" * 4}]}))
    png = tmp_path / "00-top.png"
    Image.new("RGB", (64, 48)).save(png)
    got = packet_shots.run(SITE, tmp_path / "out", prov, head="deadbee",
                           render_fn=lambda p, b: ([{"png": str(png), "subject": "top"}], {}))
    c = json.loads((tmp_path / "out" / "contents.json").read_text())
    assert c["buildings"] == [{"asset": "composite:stilt/longhouse", "count": 1}]
    assert c["runs"] == [{"assets": ["kit/boardwalk01"], "runs": 2, "pieces": 3}]
    assert c["fixtures"] == [{"asset": "kit/lantern01", "count": 2}]
    assert c["landmarks"] == [{"asset": "kit/bigtree", "count": 1}]
    assert c["interiors"] == ["CellA"]
    md = (tmp_path / "out" / "contents.md").read_text()
    assert "- 1 building longhouse" in md and "2 runs of boardwalk01 (3 pieces)" in md
    m = json.loads((tmp_path / "out" / "manifest.json").read_text())
    assert m["gitHead"] == "deadbee" and m["bundleSha256"].startswith("abcdef123456")
    assert "HEAD deadbee | bundle abcdef123456" in m["pictures"][0]["caption"]
    assert got["pictures"] == 1


def test_read_back_refuses_a_moved_scene():
    b = _bundle()
    scene = SimpleNamespace(pieces=[SimpleNamespace(
        uid="h", x=3.0, z=0.0, role={"kind": "parcel", "id": "parcel.t.house"})])
    rb = packet_shots.read_back(b, scene)
    assert rb["moved"] == [{"id": f"{SITE}.parcel.t.house.building", "offM": 3.0}]
    assert f"{SITE}.parcel.t.walk.piece.1" in rb["missing"]
    assert f"{SITE}.landmark.t.tree" in rb["notDrawn"]

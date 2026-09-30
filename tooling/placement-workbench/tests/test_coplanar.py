"""wb.py coplanar on two quads (16k walk 6, the z-fighting class): flags at
0 mm, passes at 5 mm; a declared decal is exempt against its base, decal on
decal is not."""
import numpy as np

from workbench import coplanar as cp


def _quad(pid: str, y: float, size: float = 1.0, decal: bool = False, flip: bool = False,
          double: bool = False) -> dict:
    s = size / 2
    t = np.array([[[-s, y, -s], [s, y, -s], [s, y, s]], [[-s, y, -s], [s, y, s], [-s, y, s]]], float)
    if flip:
        t = t[:, ::-1]
    return {"id": pid, "kit": "k", "assetId": pid, "source": "plugin", "tris": t,
            "decal": np.full(2, decal), "double": np.full(2, double), "lo": t.reshape(-1, 3).min(0), "hi": t.reshape(-1, 3).max(0)}


def test_two_quads_at_one_height_are_flagged():
    hits = cp.find([_quad("a", 0.0), _quad("b", 0.0, size=0.8)])
    assert len(hits) == 1 and abs(hits[0]["overlapM2"] - 0.64) < 1e-3
    assert "sink or offset b" in hits[0]["fix"]


def test_facing_each_other_is_a_contact_unless_one_side_is_double_sided():
    assert cp.find([_quad("a", 0.0), _quad("b", 0.001, flip=True)]) == []
    hits = cp.find([_quad("a", 0.0), _quad("b", 0.001, flip=True, double=True)])
    assert len(hits) == 1 and hits[0]["facing"] == "each-other"


def test_five_mm_apart_passes():
    assert cp.find([_quad("a", 0.0), _quad("b", 0.005)]) == []


def test_a_decal_on_its_base_passes_and_decal_on_decal_fails():
    assert cp.find([_quad("floor", 0.0), _quad("blood", 0.0, 0.5, decal=True)]) == []
    hits = cp.find([_quad("blood1", 0.0, 0.5, decal=True), _quad("blood2", 0.0, 0.5, decal=True)])
    assert len(hits) == 1 and hits[0]["decalOnDecal"]


def test_a_decal_flush_on_its_floor_is_a_hit_where_the_runtime_draws_no_decal_bias():
    """DawnstarBrinasHouse (16k walk 6): hay scatter flush on the floor
    flickered because the interior loader never applied the decal offset;
    the exemption holds only where the runtime biases decals."""
    pair = [_quad("floor", 0.0), _quad("hay", 0.0, 0.5, decal=True)]
    assert cp.find(pair, decal_exempt=False)[0]["overlapM2"] > 0.2
    assert cp.find(pair, decal_exempt=True) == []
    assert cp.decals_biased("place") is True
    assert cp.decals_biased("cell") is True    # interiorLoader.ts applies it (walk 6)


def test_an_exact_duplicate_pose_is_dropped_keeping_the_lowest_id():
    """KeebaHouseCrafter: the plugin stored one piece twice in one pose."""
    pose = {"kit": "k", "assetId": "fence", "positionM": [1.0, 2.0, 3.0], "rotationDeg": [0.0, 90.0, 0.0], "scale": 1.0}
    bundle = {"placements": [{"id": "C.0B", **pose}, {"id": "C.0A", **pose},
                             {"id": "C.0C", **pose, "positionM": [1.0, 2.0, 4.0]}]}
    rows = cp.drop_duplicates(bundle)
    assert [p["id"] for p in bundle["placements"]] == ["C.0A", "C.0C"]
    assert rows == [{"refId": "0B", "reason": "duplicate-pose", "assetId": "fence",
                     "duplicateOf": "C.0A", "positionM": [1.0, 2.0, 3.0]}]


def test_pair_blocks_give_the_same_answer_as_one_block(monkeypatch):
    """The A x B pair build runs in PAIR_CHUNK blocks (memory standard); a
    one-pair block must report exactly what one whole block reports."""
    from worldgen import coplanar as wc
    a, b = _quad("a", 0.0), _quad("b", 0.0, size=0.8)
    whole = wc.pair_hits(a, b)
    monkeypatch.setattr(wc, "PAIR_CHUNK", 1)
    assert wc.pair_hits(a, b) == whole and whole["overlapM2"] > 0.6

"""`blueprint_footprints.lay_pieces`: the run direction is seeded from the
first pair's joint face, so a run joining on its ±y faces lays (BM&V steps02 +
bridge01, 16k walk 2 T3 backlog row) and a +x wall run lays as before."""
from . import blueprint_footprints as fp

_HUT = "bmv:architecture/huts/exterior/"
_Y_ABUTS = {"pairs": [
    {"parent": _HUT + "steps02", "child": _HUT + "bridge01", "parentPiece": "steps02",
     "childPiece": "bridge01", "parentFace": "+y", "childFace": "-y", "joint": "run",
     "relScale": 1.0, "offsetM": [-0.02, 4.86, -0.01], "riseMinM": -0.12, "riseMaxM": 0.03,
     "yawDeg": 360.0, "count": 3},
    {"parent": _HUT + "bridge01", "child": _HUT + "bridge01", "parentPiece": "bridge01",
     "childPiece": "bridge01", "parentFace": "+y", "childFace": "-y", "joint": "run",
     "relScale": 1.0, "offsetM": [-0.02, 4.85, 0.0], "riseMinM": -0.02, "riseMaxM": 0.0,
     "yawDeg": 0.0, "count": 13}]}


def test_a_y_joined_run_lays_along_its_joint_face():
    parcel = {"id": "landing", "yawDeg": 0.0, "centreUV": [0.5, 0.5],
              "pieces": [{"asset": _HUT + "steps02"}] + [{"asset": _HUT + "bridge01"}] * 3}
    laid, errors = fp.lay_pieces(parcel, _Y_ABUTS)
    assert errors == []
    # local +y is north = -z at yaw 0; 4.85 m pitch
    assert [(round(r["xM"], 2), round(r["zM"], 2)) for r in laid] == \
        [(0.0, 0.0), (-0.02, -4.86), (-0.04, -9.71), (-0.06, -14.56)]
    assert laid[1]["pair"] == "piece:steps02+y>bridge01-y n3"


def test_a_y_joined_run_laid_from_its_far_end_reverses_the_pair():
    parcel = {"id": "landing", "yawDeg": 0.0, "centreUV": [0.5, 0.5],
              "pieces": [{"asset": _HUT + "bridge01"}, {"asset": _HUT + "steps02"}]}
    laid, errors = fp.lay_pieces(parcel, _Y_ABUTS)
    assert errors == []
    assert (round(laid[1]["xM"], 2), round(laid[1]["zM"], 2)) == (0.02, 4.86)


def test_a_measured_authored_run_reads_its_rise_from_each_pose():
    """16k walk 4: a workbench run's members carry `yMeasured`; the laid
    riseM is each pivot's rise over member 0 (anchorRun then stands every
    piece at its pose), never 0 with a datum from the run's highest ground."""
    parcel = {"yawDeg": 90.0, "pieces": [
        {"asset": "a", "atM": [0.0, 0.0], "yMeasured": 37.075},
        {"asset": "b", "atM": [3.0, 0.0], "yMeasured": 36.971},
        {"asset": "b", "atM": [6.0, 0.0], "yMeasured": 36.575}]}
    laid, errors = fp.lay_pieces(parcel)
    assert not errors
    assert [r["riseM"] for r in laid] == [0.0, -0.104, -0.5]
    assert [r["yMeasured"] for r in laid] == [37.075, 36.971, 36.575]
    for q in parcel["pieces"]:
        q.pop("yMeasured")
    assert [r["riseM"] for r in fp.lay_pieces(parcel)[0]] == [0.0, 0.0, 0.0]

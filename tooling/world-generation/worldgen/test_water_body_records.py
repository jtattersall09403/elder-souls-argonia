import numpy as np
import pytest
from .water_body_records import compile_body_records


def fixture():
    meta = {"surface": {"metresPerPixel": 1, "gridOriginM": 0},
            "klass": {"metresPerPixel": 1, "gridOriginM": 0,
                      "classes": ["none", "coast", "estuary", "river", "lake", "marsh"]},
            "ribbons": []}
    fields = {"bodies2": np.array([[1, 1, 2], [1, 3, 2]], dtype=np.uint16),
              "support2": np.ones((2, 3), dtype=bool),
              "w2": np.array([[7., 7., 8.], [7., 6., 3.]]),
              "cls": np.array([[4, 5, 3], [4, 4, 3]], dtype=np.uint8),
              "river_band": np.array([[0, 0, 1], [0, 0, 2]], dtype=np.uint8),
              "body_records": [{"index": i, "id": f"water.{i}", "basinIndex": 1} for i in range(1, 5)]}
    return meta, fields


def test_flat_heads_are_not_merged_by_basin_and_mixed_semantics_survive():
    meta, fields = fixture()
    records = compile_body_records(meta, fields)
    assert len(records) == 3
    assert records[0]["surface"] == {"kind": "standing-plane", "baseHeightM": 7}
    assert records[2]["surface"]["baseHeightM"] == 6
    assert records[0]["semanticClasses"] == ["lake", "marsh"]
    assert records[1]["surface"]["kind"] == "field"
    assert records[1]["riverBandRange"] == [1, 2]
    assert "discharge" not in records[0] and "navigability" not in records[0]
    assert records == compile_body_records(meta, fields)


def test_explicit_channel_surface_and_potential_banks_are_retained():
    meta, fields = fixture()
    meta["ribbons"] = [{"id": "reach.2", "bodyIndex": 2, "riverBand": 2,
                        "points": [{"x": 2., "z": 0., "y": 8., "halfWidthM": .1,
                                    "crossSection": [{"offsetM": -3.5}, {"offsetM": 2.}]}]}]
    record = compile_body_records(meta, fields)[1]
    assert record["surface"] == {"kind": "channel-network", "ribbonIds": ["reach.2"], "field": "surface"}
    assert record["bounds"]["minX"] == -1.5
    assert record["bounds"]["maxX"] == 5.5


def test_missing_owner_identity_fails_instead_of_fabricating_a_body():
    meta, fields = fixture()
    fields["body_records"] = fields["body_records"][:1]
    with pytest.raises(ValueError, match="stable identity"):
        compile_body_records(meta, fields)

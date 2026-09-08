"""Fast known-answer checks for the placement clustering report (97 A5/G3)."""

import numpy as np

from .plot_stats import MIN_RECORDS_FOR_R, clark_evans


def test_clark_evans_known_square_lattice_is_regular():
    points = [(float(x), float(z)) for x in range(3) for z in range(3)]
    stats = clark_evans({"test-zone": points}, {"test-zone": 9.0})
    row = stats["byZone"]["test-zone"]
    assert row["n"] == 9
    assert row["R"] == 2.0
    assert stats["zonesOverTarget"] == ["test-zone"]


def test_clark_evans_refuses_a_tiny_sample():
    points = [(float(i), 0.0) for i in range(MIN_RECORDS_FOR_R - 1)]
    row = clark_evans({"test-zone": points}, {"test-zone": 100.0})["byZone"]["test-zone"]
    assert row["R"] is None
    assert "too few" in row["note"]


def test_same_mask_null_is_deterministic_and_records_edge_correction():
    mask = np.zeros((8, 12), dtype=bool)
    mask[1:7, 1:4] = True
    mask[5:7, 4:11] = True       # deliberately thin L-shaped territory
    points = [(float(x), float(z)) for x in (1.5, 2.5, 3.5, 5.5)
              for z in (1.5, 5.5)]
    kwargs = dict(mask_by_zone={"test-zone": mask}, cell_m=1.0, trials=32, seed=77)
    first = clark_evans({"test-zone": points}, {"test-zone": float(mask.sum())}, **kwargs)
    second = clark_evans({"test-zone": points}, {"test-zone": float(mask.sum())}, **kwargs)
    assert first == second
    row = first["byZone"]["test-zone"]
    assert row["null"] == "same-mask-monte-carlo"
    assert row["expectedM"] != row["analyticalExpectedM"]
    assert row["nullSdM"] > 0

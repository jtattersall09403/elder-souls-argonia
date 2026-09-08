"""Fast known-answer checks for the placement clustering report (97 A5/G3)."""

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

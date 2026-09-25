"""breadth-bars.json: schema, sources, and agreement with decision 0098 § 1."""
import copy
import re

import pytest

from worldgen import breadth_bars as bb

D0098 = bb.REPO_ROOT / "docs" / "decisions" / "0098-variety-is-measured-per-settlement-not-by-a-template-cap.md"


@pytest.fixture(scope="module")
def record():
    return bb.load()


def test_record_validates(record):
    assert record["schemaVersion"] == 1


@pytest.mark.parametrize("field", ["shellsMin", "lightKindsMin"])
def test_validate_fails_on_a_missing_field_or_source(record, field):
    broken = copy.deepcopy(record)
    del broken["tiers"]["M3"][field]
    with pytest.raises(bb.BreadthBarsError):
        bb.validate(broken)
    unsourced = copy.deepcopy(record)
    unsourced["tiers"]["M1"][field]["source"] = ""
    with pytest.raises(bb.BreadthBarsError):
        bb.validate(unsourced)


def _table_row(text: str, label: str) -> list[float]:
    """The four tier cells of the 0098 § 1 table row starting with ``label``."""
    line = next(l for l in text.splitlines() if l.startswith(f"| {label}"))
    cells = [c.strip() for c in line.strip().strip("|").split("|")][1:5]
    return [float(re.search(r"\d+(\.\d+)?", c).group(0)) for c in cells]


@pytest.mark.parametrize("label, field", [
    ("Distinct dwelling signatures", "signatureRatioMin"),
    ("Distinct shells", "shellsMin"),
    ("Top shell share", "topShellShareMax"),
    ("Pieces within 12 m per dwelling", "dressingPiecesPerDwellingWithin12mMin"),
])
def test_numbers_equal_decision_0098(record, label, field):
    expected = _table_row(D0098.read_text(encoding="utf-8"), label)
    got = [record["tiers"][t][field]["value"] for t in ("M1", "M2", "M3", "M4")]
    assert got == expected
    assert record["tiers"]["M5"][field]["value"] == expected[3]


def test_clutter_minimum_equals_decision_0098(record):
    line = next(l for l in D0098.read_text(encoding="utf-8").splitlines() if l.startswith("| Minimum set per dwelling"))
    minimum = int(re.search(r"≥ (\d+) personal clutter", line).group(1))
    assert {record["tiers"][t]["clutterPiecesMin"]["value"] for t in bb.TIERS} == {minimum}


def test_province_assembly_bars_equal_decision_0098(record):
    text = " ".join(D0098.read_text(encoding="utf-8").split())
    m = re.search(r"at most (\d+) times in the province and never twice within (\d+) km", text)
    assert record["distance"]["assemblyMaxPerProvince"]["value"] == int(m.group(1))
    assert record["distance"]["assemblyRepeatMinM"]["value"] == int(m.group(2)) * 1000


def test_distance_bars_equal_the_plot_constants(record):
    from worldgen import macro_plot as mp
    d = record["distance"]
    assert d["sameTypeMinM"]["value"] == mp.SAME_TYPE_MIN_M
    assert d["sameTypeLandmarkMinM"]["value"] == mp.SAME_TYPE_LANDMARK_MIN_M
    assert d["sameTypeOnOneRoadMinM"]["value"] == mp.ROUTE_REPEAT_MIN_M
    assert d["samePurposeOnOneRoadMinM"]["value"] == mp.PURPOSE_REPEAT_ROUTE_M == 500


def test_bars_for_claywater(record):
    bars = bb.bars_for("M2", "imperial", 1, record)
    assert bars["shellsMin"] == 4 and bars["topShellShareMax"] == 0.35
    assert bars["enclosureKindsMin"] == 1
    assert bb.bars_for("M3", "imperial", 1, record)["enclosureKindsMin"] == 2
    assert bb.bars_for(None, "argonian-mud", 2, record)["enclosureKindsMin"] == 0
    assert bb.bars_for("M4", "imperial", 8, record)["perQuarter"] is True
    with pytest.raises(KeyError):
        bb.bars_for("M2", "no-such-culture", 1, record)


def test_record_tier_wins_over_type_default(record):
    # type 4 (camp or hold) defaults to M1; a record carrying M3 gets M3's bars
    assert record["types"]["4"]["defaultTier"] == "M1"
    bars = bb.bars_for("M3", "imperial", 4, record)
    assert bars["tier"] == "M3"
    assert bars["shellsMin"] == record["tiers"]["M3"]["shellsMin"]["value"]
    assert bb.bars_for(None, "imperial", 4, record)["tier"] == "M1"


def test_type_default_must_be_marked_fallback(record):
    import copy
    broken = copy.deepcopy(record)
    broken["types"]["1"]["source"] = "docs/phases/16-foundation-and-places/16k-place-loop.md:224"
    with pytest.raises(bb.BreadthBarsError):
        bb.validate(broken)

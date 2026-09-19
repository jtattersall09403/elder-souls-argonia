"""plot_review counts moves, cuts, re-types, groups and re-references, and a
re-run replaces its section instead of appending a second copy."""
import json
from pathlib import Path

from worldgen import plot_review
from worldgen.catalogue import RegionFile

REPORT = {"demand": {"live": 2, "plotted": 2, "homelessUnresolved": 0},
          "seeding": {"mode": "resolve-all", "reSited": []},
          "routeVisibility": {"deadFraction": 0.09},
          "typedSitingViolations": [],
          "clarkEvans": {"median": 1.1, "zonesEvenerThanRandom": ["alpha"],
                         "byZone": {"alpha": {"n": 2, "areaKm2": 1.0, "meanNearestM": 100.0,
                                              "expectedM": 90.0, "R": 1.11}}}}


def _rec(rid, **kw):
    rec = {"id": rid, "status": "active", "classification": {"type": "camp"},
           "densityLayer": "fine-tempo", "dangerTier": "D2", "positionM": [0.0, 0.0],
           "relations": {"reachedVia": [], "travelServiceEdges": []}}
    rec.update(kw)
    return rec


def _pair():
    before = {
        "place.alpha.moved": _rec("place.alpha.moved"),
        "place.alpha.cut": _rec("place.alpha.cut"),
        "place.alpha.retyped": _rec("place.alpha.retyped"),
        "place.beta.rerouted": _rec("place.beta.rerouted",
                                    relations={"reachedVia": ["place.beta.old"],
                                               "travelServiceEdges": []}),
    }
    after = [
        RegionFile(Path("places-alpha.json"), "alpha", "s", [
            _rec("place.alpha.moved", positionM=[300.0, 400.0],
                 whySiteWon="Best cove. Second clause."),
            _rec("place.alpha.cut", status="deferred"),
            _rec("place.alpha.retyped", classification={"type": "shrine"}),
            _rec("place.alpha.grouped-a", designGroup="grp-1"),
            _rec("place.alpha.grouped-b", designGroup="grp-1"),
        ]),
        RegionFile(Path("places-beta.json"), "beta", "s", [
            _rec("place.beta.rerouted",
                 relations={"reachedVia": ["place.beta.new"], "travelServiceEdges": ["ferry:x"]}),
        ]),
    ]
    return after, before


def test_section_counts_everything():
    after, before = _pair()
    s = plot_review.build_section(after, before, REPORT, {"alpha": 0.25, "beta": 0.1})
    assert "`place.alpha.moved`" in s and "500.0" in s          # 3-4-5 move
    assert "| alpha | 1 | 500.0 | 500.0 | 500.0 |" in s         # one move in alpha
    assert "`place.alpha.cut` | alpha | active | deferred" in s  # the cut
    assert "`place.alpha.retyped` | alpha | camp | shrine" in s  # the re-type
    assert "`grp-1` | 2 |" in s                                  # the merge
    assert "`place.beta.rerouted`" in s and "ferry:x" in s       # the re-reference
    assert "Best cove" in s and "Second clause" not in s         # first clause only
    assert s.count(plot_review.PLACEHOLDER) >= 7
    assert "seeding mode `resolve-all`" in s
    # alpha: 4 live named records (the cut is deferred) over 0.25 km2 = 16.0/km2
    assert "| alpha | 4 | 4 | 0 | 0 | 0.2 | 16.0 |" in s
    assert "Province total named live records of the three layers: 5" in s


def test_rerun_replaces_the_section(tmp_path):
    after, before = _pair()
    out = tmp_path / "ledger.md"
    out.write_text("# Ledger\n\n## 1. Before\n\nkept\n\n## 2. Plot review\n\nstale\n\n## 3. After\n\ntail\n")
    for _ in range(2):
        s = plot_review.build_section(after, before, REPORT, None)
        plot_review.write_section(out, s, "## 2. Plot review")
    text = out.read_text()
    assert text.count("## 2. Plot review") == 1
    assert "stale" not in text
    assert "kept" in text and "## 3. After" in text and "tail" in text


def test_appends_when_the_section_is_absent(tmp_path):
    after, before = _pair()
    out = tmp_path / "ledger.md"
    out.write_text("# Ledger\n\n## 1. Before\n\nkept\n")
    plot_review.write_section(out, plot_review.build_section(after, before, REPORT, None),
                              "## 2. Plot review")
    text = out.read_text()
    assert text.index("## 1. Before") < text.index("## 2. Plot review")
    assert json.loads('true')

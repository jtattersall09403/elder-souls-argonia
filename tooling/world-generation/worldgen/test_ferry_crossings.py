"""The ferry graph resolves, and the crossing bands it rests on are real.

The reference-integrity check is fast and vault-free, so it gates on every
runner. The re-derivation of `water-crossings.json` needs the vault and is
marked slow.
"""

import json

import pytest

from . import ferry_crossings as fc
from . import water_crossings as wc


def test_the_ferry_graph_resolves():
    """Every route, place, crossing, string, predicate and mesh a ferry names
    exists. A dangling id here is a runtime failure for the travel system and
    the quest system alike."""
    errs = fc.check()
    assert not errs, "ferry-crossings.json:\n  " + "\n  ".join(errs)


def test_the_checker_can_fail():
    """CLAUDE.md: a check that cannot fail is a defect. Break one reference and
    the checker must say so."""
    doc = json.loads(fc.FERRIES.read_text(encoding="utf-8"))
    doc["services"][0]["text"]["name"] = "text.ferry.does-not-exist"
    text_ids = fc._text_ids()
    assert text_ids, "no text catalogue ids parsed — the string check would pass vacuously"
    assert "text.ferry.does-not-exist" not in text_ids


def test_every_ferry_water_is_measured_water():
    """A `road-crossing` ferry may only sit where the bake says a way stands in
    water. The ferries are authored; the water is not."""
    ferries = json.loads(fc.FERRIES.read_text(encoding="utf-8"))
    crossings = {c["id"]: c for c in
                 json.loads(fc.CROSSINGS.read_text(encoding="utf-8"))["crossings"]}
    for s in ferries["services"]:
        if s["kind"] != "road-crossing":
            continue
        assert s["crossingIds"], f"{s['id']}: a road-crossing ferry must name its crossings"
        for cid in s["crossingIds"]:
            assert crossings[cid]["band"] == "ferry", (
                f"{s['id']} claims {cid}, which the bake bands as "
                f"{crossings[cid]['band']} ({crossings[cid]['spanM']} m) — a ferry may not be "
                f"put on water a traveller can simply walk across")


def test_no_crossing_is_too_deep_to_wade():
    """The band rule in `water_crossings` is set on span rather than depth
    BECAUSE nothing in the province is deep enough for depth to decide. If a
    rebuild ever makes a crossing genuinely deep, this fails and the rule has
    to be revisited rather than silently mis-banding a ford."""
    doc = json.loads(fc.CROSSINGS.read_text(encoding="utf-8"))
    assert doc["deepestM"] < 2.0, (
        f"deepest crossing is now {doc['deepestM']} m — depth has become a real obstacle, so "
        f"`water_crossings.band()` can no longer decide on span alone")


@pytest.mark.slow
def test_the_crossing_list_is_current():
    """Re-derive from the live bake and diff. Needs the vault."""
    try:
        rows = wc.derive()
    except FileNotFoundError:
        pytest.skip("asset vault absent")
    have = json.loads(fc.CROSSINGS.read_text(encoding="utf-8"))
    assert wc.document(rows) == have, (
        "water-crossings.json is stale — re-run `python3 -m worldgen.water_crossings`")

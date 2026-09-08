"""The authoring debt gate for route structures.

`worldgen.author_route_structures` never stops a terrain rebuild: a survivor
whose way has no authored `why`, or whose region has no family, is emitted with
its measured window (the grader needs that exclusion window — without it the
second grading pass cuts the hillside the structure was meant to stand on) and
marked `unauthored`. The debt is gated HERE, in CI, where it is visible and red
until someone looks at the ground and writes the sentence.

Standard 12: prose is written against the record it describes, by a separate
agent, through the `text-review` skill. Nothing in the pipeline may invent it.
"""

import json

import numpy as np

from .grade_routes import STRUCTURES_PATH
from .author_route_structures import _kind, _window_rise


def test_no_shipped_route_structure_is_unauthored():
    structures = json.loads(STRUCTURES_PATH.read_text())["structures"]
    assert structures, f"no structures in {STRUCTURES_PATH}"
    bad = []
    for s in structures:
        miss = []
        if s.get("unauthored"):
            miss.append("marked unauthored")
        if not isinstance(s.get("why"), str) or not s["why"].strip():
            miss.append("no `why` sentence")
        if not s.get("family") or not s.get("pieceRef"):
            miss.append("no family/piece")
        if miss:
            bad.append(f"{s['id']} ({s['wayId']}): {', '.join(sorted(set(miss)))}; "
                       f"length {s['toM'] - s['fromM']:.1f} m, rise {s['riseM']:.2f} m, "
                       f"worst gradient {s['worstDeg']:.2f} deg")
    ways = len({b.split("(")[1].split(")")[0] for b in bad})
    assert not bad, (f"{len(bad)} unauthored route structures on {ways} ways — "
                     "add the sentence to WHY (and the region to FAMILY_BY_REGION) "
                     "in worldgen/author_route_structures.py:\n  " + "\n  ".join(bad))


def test_structure_kind_uses_exact_window_endpoints():
    """A steep endpoint between samples must not be hidden by sample snapping."""
    chain = np.array([0.0, 10.0, 20.0, 30.0])
    heights = np.array([0.0, 0.0, 2.0, 6.0])

    rise = _window_rise(chain, heights, 8.0, 28.0)

    assert rise == 5.2
    assert _kind(20.0, rise, worst_deg=10.0, way_kind="trail") == "stair"

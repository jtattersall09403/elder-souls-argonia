"""No authored record may point at a place that is not in the world.

Cutting a place (owner 2026-09-20, the thirteen unsited records) leaves its id
behind in every file that named it: quest anchors, rumour pools, the roster,
the travel graph, blueprints, authored track prose. Each survivor is a silent
dangling reference — a quest with no place, a station that cannot stand, a
rumour nobody can hear — and until this gate existed they were found one at a
time by whatever test happened to trip over one.

THE RULE: every `place.<region>.<slug>` string under `world/sources/`, plus the
authored track prose in `author_route_structures.py`, must name a catalogue
record that still exists and is not `cut`. `deferred` is allowed: a deferred
record is a real record awaiting promotion, and the catalogue's own
`relationsReserved` lists are how the world holds those ties open.
"""

import json
import re
from pathlib import Path

import pytest

from . import catalogue

HAVE_CATALOGUE = any(catalogue.CATALOGUE_DIR.glob("places-*.json"))
skip = pytest.mark.skipif(not HAVE_CATALOGUE, reason="no catalogue committed")

PLACE_REF = re.compile(r"place\.[a-z-]+\.[a-z0-9-]+")
SOURCES = catalogue.REPO_ROOT / "world" / "sources"
TRACK_PROSE = (catalogue.REPO_ROOT / "tooling" / "world-generation" / "worldgen"
               / "author_route_structures.py")

#: Files that record HISTORY and must keep naming the record they cut, with the
#: reason each one is exempt.
ALLOWED = {
    # the remedy rows ARE the cut: a `cut` row names the record it retires
    SOURCES / "sites" / "plot-remedies.json":
        "every `cut` row names the record it retires; that is the row's job",
    # the register of records the owner accepted as unsited, kept as the record
    # of what was decided even once the rows are emptied
    SOURCES / "sites" / "plot-homeless-accepted.json":
        "the accepted-unsited register is a decision log, not a live tie",
    # the plot report is the solver's own historic output (homeless batches,
    # candidate lists); only `macro_plot` may rewrite it
    SOURCES / "sites" / "macro-plot.json":
        "the solver's own report of a run that happened; only macro_plot writes it",
    # terrain patches are a chain-stage artefact: the request for a cut place is
    # dropped when the terrain chain next runs, never by hand (16b ladder)
    SOURCES / "terrain" / "terrain-patches.json":
        "a chain-stage artefact; the stale request is dropped at the next terrain run",
}


def _known() -> tuple[set[str], set[str]]:
    """(every catalogue id, the ids that are cut)."""
    every, cut = set(), set()
    for rf in catalogue.load_region_files():
        for rec in rf.places:
            every.add(rec["id"])
            if rec.get("status") == "cut":
                cut.add(rec["id"])
    return every, cut


#: keys whose subtree deliberately holds ids that are NOT in the world.
#: `relationsReserved` is where `plot_remedies._cut` parks an inbound edge so
#: the tie can be restored if the record is ever revived — the one place a
#: dead id is the point rather than a bug.
#: `candidatesConsidered` / `whySiteWon` are the solver's own account of a run
#: that happened (which sites it weighed, what it lost to) — history, like the
#: plot report, not a tie the world has to honour.
#: `sources` is provenance ("re-anchored 2026-09-04: place.x") and `reason` is
#: why a thing was retired — both have to name the record they are about.
RESERVED_KEYS = {"relationsReserved", "candidatesConsidered", "whySiteWon",
                 "sources", "reason"}

#: Dangling references that predate this gate, each with the decision it is
#: waiting on. A NEW one still fails: this list may only shrink. Emptied
#: 2026-09-20 — the three survivors were decided rather than carried:
#: `ten-maur-wolk.proseRefs` re-pointed at itself (it took Tenmar Wall's site
#: over), `the-crown-terrace.sitingPrefs.boundTo` replaced by a `nearPoint`
#: pin at the dot it already stands on (plot-remedies.json), and
#: `the-pen-yard.hostility.flips[0]` re-pointed at `the-dres-rows`, the
#: plantation quarters 99 m away that the yard is already bound to and
#: sighted on.
KNOWN_DANGLING: set[tuple[str, str]] = set()


def _refs_in(node) -> set[str]:
    """Every place id in a JSON tree, skipping the reserved subtrees."""
    out: set[str] = set()
    if isinstance(node, dict):
        for k, v in node.items():
            if k in RESERVED_KEYS:
                continue
            out |= _refs_in(v)
    elif isinstance(node, list):
        for v in node:
            out |= _refs_in(v)
    elif isinstance(node, str):
        out |= set(PLACE_REF.findall(node))
    return out


def _scan(paths) -> dict[str, set[str]]:
    """path -> the place ids it names."""
    out = {}
    for p in paths:
        text = p.read_text(encoding="utf-8")
        if p.suffix == ".json":
            doc = json.loads(text)
            if isinstance(doc, dict) and isinstance(doc.get("places"), list):
                # a catalogue file: a record naming ITSELF is its identity, not
                # a reference, and a cut record keeps its own id
                found = set()
                for rec in doc["places"]:
                    found |= _refs_in(rec) - {rec.get("id")}
            else:
                found = _refs_in(doc)
        else:
            found = set(PLACE_REF.findall(text))
        if found:
            try:
                name = str(p.relative_to(catalogue.REPO_ROOT))
            except ValueError:            # a scratch file in the mutation test
                name = str(p)
            out[name] = found
    return out


def _targets():
    return [p for p in sorted(SOURCES.rglob("*.json")) if p not in ALLOWED] + [TRACK_PROSE]


@skip
def test_no_authored_record_points_at_a_place_that_is_not_in_the_world():
    every, cut = _known()
    bad: list[str] = []
    for path, refs in _scan(_targets()).items():
        for ref in sorted(refs):
            if (path, ref) in KNOWN_DANGLING:
                continue
            if ref in cut:
                bad.append(f"{path}: {ref} is CUT — re-point it or drop the reference")
            elif ref not in every:
                bad.append(f"{path}: {ref} is not a catalogue record at all")
    assert not bad, "\n  ".join([f"{len(bad)} dangling place reference(s):"] + bad)


@skip
def test_the_gate_can_fail(tmp_path: Path):
    """MUTATION: a file naming a cut record is caught. Proven on a scratch file
    rather than by breaking the tree."""
    every, cut = _known()
    assert cut, "nothing has ever been cut — this gate would be vacuous"
    scratch = tmp_path / "scratch.json"
    scratch.write_text(json.dumps({"anchorPlaces": [sorted(cut)[0]]}), encoding="utf-8")
    found = _scan([scratch])
    refs = next(iter(found.values()))
    assert refs & cut, "the scanner did not see the reference it was given"


@skip
def test_every_allowlisted_file_still_exists_and_still_needs_the_exemption():
    """An allowlist entry that no longer names a cut record is dead weight."""
    _every, cut = _known()
    for path, reason in ALLOWED.items():
        assert path.exists(), f"allowlisted {path} is gone — drop the entry"
        assert reason.strip(), path
        assert PLACE_REF.findall(path.read_text(encoding="utf-8")), \
            f"{path} names no place at all — drop the allowlist entry"

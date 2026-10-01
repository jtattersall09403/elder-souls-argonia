"""The schema registry and the referential-integrity gate (decision 0104
decisions 7 and 8). Runs in `npm test` (this workspace's `test` script)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import integrity  # noqa: E402
import world_schema as ws  # noqa: E402

REPO = ws.REPO_ROOT
CLAYWATER = "place.imperial-fringe.claywater-station"
#: promises no socket, door or parcel fills yet, per place. A ledger that lands
#: before its place's fills pins its open count here; the count only falls, to
#: 0 at the slice's acceptance. Claywater fills all 14 rows since walk 2
#: (2026-09-27), so it pins nothing.
#: The Border road crossings (16k type 10) got their ledger at walk 9 close:
#: five prose rows await the builder's `confirmed` block.
OPEN_PROMISES_PINNED: dict[str, int] = {"place.route.border-road-greenspring-crossings": 5}


def test_every_schema_is_a_valid_draft_2020_12_schema():
    for path in sorted((HERE / "schemas").glob("*.schema.json")):
        Draft202012Validator.check_schema(json.loads(path.read_text()))


def test_every_family_names_a_schema_that_exists():
    for fam, row in ws.families().items():
        assert (HERE / "schemas" / row["schema"]).exists(), fam


def test_every_registered_data_family_has_a_schema_or_a_queued_owner():
    reg = json.loads((REPO / "tooling/repo-standards/data-registry.json").read_text())
    fams = ws.families()
    for entry in reg["paths"]:
        if "schema" in entry:
            assert entry["schema"] in fams, f"{entry['path']}: schema {entry['schema']!r} is no family"
        else:
            assert entry.get("schemaQueued"), (
                f"{entry['path']}: names no schema (packages/world-schema/families.json) and no "
                f"`schemaQueued` owner")


def test_the_real_records_are_whole():
    out = integrity.integrity_errors(REPO)
    assert out["schema"] == []
    assert out["references"] == []
    assert out["duplicates"] == []
    open_ = {pid: len(errs) for pid, errs in out["promises"].items() if errs}
    assert open_ == {k: v for k, v in OPEN_PROMISES_PINNED.items() if v}, open_


# --- shown failing first: the ferry-poler as it stood on 2026-09-27 --------
# data-model.md (walk 2): the Claywater poler in five records under three
# ids. The captured state: the layout defined the catalogue's post id as a
# marker socket (one id, two homes) and the ferry's operator named that
# catalogue id instead of the placed npc socket.

def _root(tmp_path: Path, *, fixed: bool) -> Path:
    post = "post.claywater-station.poler"
    place = {"id": CLAYWATER, "name": "Claywater Station",
             "sockets": {"scene": [], "evidence": [], "post": [post], "marks": []}}
    npc_socket = "socket.claywater-station.npc-poler"
    ops = [{"op": "socket", "id": npc_socket, "kind": "npc", "at": [336.0, 3012.4],
            "rosterSlotId": "landing-s-poler", "parcel": "parcel.claywater-station.ferry-raft"}]
    if not fixed:
        ops.append({"op": "socket", "id": post, "kind": "marker", "zone": "station",
                    "host": "parcel.claywater-station.ferry-raft"})
    if fixed:
        ops[0]["fills"] = ["promise.claywater-station.post-poler"]
    ledger = {"schemaVersion": 1, "placeId": CLAYWATER, "generator": "fixture", "derivedFrom": [],
              "promises": [{"id": "promise.claywater-station.post-poler", "kind": "socketBucket",
                            "source": {"file": "world/sources/catalogue/places-imperial-fringe.json",
                                       "path": f"places[{CLAYWATER}].sockets.post[{post}]"},
                            "text": "Claywater Station has the post socket.", "unfilled": None}]}
    service = {"id": "ferry.imperial-fringe.drowning-gate", "status": "active",
               "operator": {"nearestPlaceId": CLAYWATER,
                            "socketRef": npc_socket if fixed else post}}
    files = {
        "world/sources/catalogue/places-imperial-fringe.json": {"schemaVersion": 3, "places": [place]},
        "world/sources/blueprints/claywater-station.layout.json":
            {"schemaVersion": 1, "placeId": CLAYWATER, "ops": ops},
        f"world/sources/placement/promises/{CLAYWATER}.json": ledger,
        "world/sources/routes/travel-services.json":
            {"schemaVersion": 1, "stations": [], "services": [service]},
    }
    for rel, doc in files.items():
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / rel).write_text(json.dumps(doc))
    return tmp_path


def test_the_ferry_poler_duplication_fails(tmp_path):
    out = integrity.integrity_errors(_root(tmp_path, fixed=False))
    assert any("post.claywater-station.poler" in e and "catalogue sockets.post" in e
               and "layout socket" in e for e in out["duplicates"]), out["duplicates"]
    assert any("operator.socketRef 'post.claywater-station.poler' is not a placed npc socket" in e
               for e in out["references"]), out["references"]
    assert any("does not match" in e for e in out["schema"]), out["schema"]
    assert [e.split(":")[0] for e in out["promises"][CLAYWATER]] == ["promises.unfilled"]


def test_the_ferry_poler_fixed_passes(tmp_path):
    out = integrity.integrity_errors(_root(tmp_path, fixed=True))
    assert out["duplicates"] == [] and out["references"] == [] and out["schema"] == [], out
    assert out["promises"] == {CLAYWATER: []}


def test_an_npc_of_a_laid_out_place_must_stand_on_a_placed_socket(tmp_path):
    """T2 rec 1 (planner ruling 2026-09-27): once a place is laid out its
    npcs' home.socketId is a placed npc socket; the catalogue post id (the
    promise) is no longer accepted. Failing first: the gate allowed
    post.claywater-station.poler for the poler."""
    root = _root(tmp_path, fixed=True)
    npc = {"id": "npc.imperial-fringe.claywater-station.landing-s-poler",
           "home": {"placeId": CLAYWATER, "slotIndex": 1, "socketId": "post.claywater-station.poler"}}
    reg = root / "world/sources/registries/npcs.json"
    reg.parent.mkdir(parents=True, exist_ok=True)
    reg.write_text(json.dumps({"schemaVersion": 1, "entries": [npc]}))
    out = integrity.integrity_errors(root)
    assert any("is not a placed socket" in e and npc["id"] in e for e in out["references"]), out
    npc["home"]["socketId"] = "socket.claywater-station.npc-poler"
    reg.write_text(json.dumps({"schemaVersion": 1, "entries": [npc]}))
    assert integrity.integrity_errors(root)["references"] == []

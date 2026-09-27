"""The layout's `socket` op (decision 0103 decision 6): validated at load,
lifted out of the CLI ops so `apply` never sees it; a placed yard set's
containers and furniture carry the socket they yield."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import assembly, layout  # noqa: E402

WINDOW = {"centreKm": [0.3, 3.0], "halfM": 150.0}


def _write(tmp_path, ops):
    path = tmp_path / "x.layout.json"
    path.write_text(json.dumps({"schemaVersion": 1, "placeId": "place.x", "window": WINDOW,
                                "ops": ops}))
    return path


def test_socket_ops_are_lifted_out_of_the_cli_ops(tmp_path):
    ops = [{"op": "note", "uid": "a", "text": "t"},
           {"op": "socket", "id": "idle.bench", "kind": "idle", "at": [1.0, 2.0],
            "activity": "sit"}]
    doc = layout.load(_write(tmp_path, ops))
    assert [o["op"] for o in doc["ops"]] == ["note"]
    assert [s["id"] for s in doc["sockets"]] == ["idle.bench"]


@pytest.mark.parametrize("op, why", [
    ({"op": "socket", "id": "s", "kind": "loot", "at": [0, 0]}, "kind 'loot'"),
    ({"op": "socket", "id": "s", "kind": "idle", "activity": "sit"}, "needs `at`"),
    ({"op": "socket", "id": "s", "kind": "idle", "at": [0, 0], "bogus": 1}, "unknown field"),
])
def test_a_malformed_socket_op_refuses_the_layout(tmp_path, op, why):
    with pytest.raises(ValueError, match=why):
        layout.load(_write(tmp_path, [op]))


def test_a_duplicate_socket_id_refuses_the_layout(tmp_path):
    op = {"op": "socket", "id": "s", "kind": "marker", "at": [0, 0]}
    with pytest.raises(ValueError, match="used twice"):
        layout.load(_write(tmp_path, [op, op]))


def test_the_hut_yard_yields_its_urn_sack_table_and_chair():
    got = {op["host"]: op for op in assembly.group_sockets("argonian-hut-yard", "b5-")}
    assert got["b5-ahy-sack"]["fillRule"] == "blanket.storage-crate"
    assert got["b5-ahy-urn"]["containerClass"] == "urn"
    assert got["b5-ahy-chair"]["activity"] == "sit"
    assert "b5-ahy-candle" not in got                     # clutter yields nothing
    assert assembly.group_sockets("no-such-set", "") == []

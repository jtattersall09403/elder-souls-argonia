"""The layout's `pool` op (16k walk 4): validated at load and lifted out of
the CLI ops like a socket; the export turns it into a basin overlay and the
place's still-water record (`worldgen.pad_overlay`)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import layout  # noqa: E402

WINDOW = {"centreKm": [0.3, 3.0], "halfM": 150.0}
POOL = {"op": "pool", "uid": "spring", "centreM": [10.0, 20.0], "radiusM": 4.0,
        "depthM": 0.6, "why": "the spring the station is named for", "sources": ["UESP:x"]}


def _write(tmp_path, ops):
    path = tmp_path / "x.layout.json"
    path.write_text(json.dumps({"schemaVersion": 1, "placeId": "place.x", "window": WINDOW,
                                "ops": ops}))
    return path


def test_pool_ops_are_lifted_out_of_the_cli_ops(tmp_path):
    doc = layout.load(_write(tmp_path, [{"op": "note", "uid": "a", "text": "t"}, POOL]))
    assert [o["op"] for o in doc["ops"]] == ["note"]
    assert doc["pools"] == [POOL]


@pytest.mark.parametrize("patch, why", [
    ({"radiusM": 1.5}, "radiusM must be 2..12"),
    ({"radiusM": 13}, "radiusM must be 2..12"),
    ({"depthM": 0.1}, "depthM must be 0.2..1.5"),
    ({"depthM": 1.6}, "depthM must be 0.2..1.5"),
    ({"rimM": -1}, "rimM must be"),
    ({"centreM": [1.0]}, "centreM"),
    ({"why": ""}, "needs a why"),
    ({"sources": []}, "needs sources"),
    ({"bogus": 1}, "unknown key"),
])
def test_a_malformed_pool_op_refuses_the_layout(tmp_path, patch, why):
    with pytest.raises(ValueError, match=why):
        layout.load(_write(tmp_path, [{**POOL, **patch}]))


def test_a_duplicate_pool_uid_refuses_the_layout(tmp_path):
    with pytest.raises(ValueError, match="used twice"):
        layout.load(_write(tmp_path, [POOL, POOL]))

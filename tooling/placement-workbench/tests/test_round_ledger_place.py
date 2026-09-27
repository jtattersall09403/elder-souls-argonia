"""A round's rounds.jsonl row carries its place id, so the build ledger's
`append --from-rounds` needs no --place (speed-lane-3A rec 8). Written
failing first."""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402


def test_round_ledger_row_carries_the_place_id(tmp_path):
    summary = tmp_path / "apply" / "s" / "summary.json"
    summary.parent.mkdir(parents=True)
    summary.write_text("{}")
    out = {"placeId": "place.x.y", "layoutSha256": "L", "timings": {"totalS": 3.0}}
    wb.write_ledger(summary, out, tmp_path / "round-1")
    for path in (summary.parent / "rounds.jsonl", tmp_path / "round-1" / "rounds.jsonl"):
        [row] = [json.loads(x) for x in path.read_text().splitlines()]
        assert row["placeId"] == "place.x.y" and row["totalS"] == 3.0

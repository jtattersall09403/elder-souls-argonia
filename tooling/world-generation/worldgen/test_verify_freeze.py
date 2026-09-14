"""The freeze gate refuses when the frozen base or the graph has drifted.

Decision 0066 / 16d deliverable 0: a routine chain run checks the six rungs
above the gate by hash instead of rebuilding them, so the check itself has to
be shown failing, not just passing.
"""

import json
from pathlib import Path

import pytest

from . import freeze, verify_freeze

pytestmark = pytest.mark.skipif(
    freeze.vault_copy(freeze.SHAPED) is None,
    reason="the frozen terrain arrays are not in this machine's vault")


def _freeze_json() -> dict:
    return json.loads(freeze.FREEZE_PATH.read_text(encoding="utf-8"))


def test_clean_tree_passes():
    assert verify_freeze.verify() == []
    assert verify_freeze.main() == 0


def test_wrong_recorded_sha_fails(tmp_path: Path):
    doc = _freeze_json()
    doc["frozen"][freeze.SHAPED]["sha256"] = "0" * 64
    path = tmp_path / "freeze.json"
    path.write_text(json.dumps(doc), encoding="utf-8")

    bad = verify_freeze.verify(freeze_path=path)
    assert any(freeze.SHAPED in b or "shaped ground" in b for b in bad), bad


def test_graph_solved_on_another_ground_fails():
    graph = dict(verify_freeze.graph_doc())
    graph["sourceHeightSha256"] = "f" * 64
    graph["contentSha256"] = None
    graph["contentSha256"] = __import__(
        "worldgen.hydrology_graph", fromlist=["content_hash"]).content_hash(graph)

    bad = verify_freeze.verify(graph=graph)
    assert len(bad) == 1 and "different shaped ground" in bad[0], bad


def test_graph_edited_in_place_fails():
    graph = dict(verify_freeze.graph_doc())
    graph["contentSha256"] = "a" * 64

    bad = verify_freeze.verify(graph=graph)
    assert any("does not match its content" in b for b in bad), bad

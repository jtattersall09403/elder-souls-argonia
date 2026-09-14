"""The freeze-gate check a routine chain run performs instead of rebuilding.

Owner ruling 2026-09-14 (decision 0066, chunk 16d deliverable 0): layers are
added onto what is built, never rebuilt from the sculpt. So a plain
`terrain-chain.sh` run does not re-execute the six rungs above the freeze gate
(`sculpt_province`, `compile_hydrology`, `compile_society`, `shape_province`,
`hydrology_graph`, `carve_province`) — it CHECKS their outputs by hash and
starts at `apply_terrain_patches`.

What is checked (seconds):

  * the three arrays recorded in `world/sources/terrain/freeze.json` against
    the vault copies (`worldgen.freeze`);
  * `world/sources/hydrology/hydrology-graph.json`: `sourceHeightSha256`
    equals the recorded sha of `heightfield-shaped-f32.npy` (the graph is
    solved on the shaped ground, decision 0059), and `contentSha256` equals
    `hydrology_graph.content_hash` recomputed over the file as it stands.

Any mismatch exits non-zero: the frozen base or the graph has drifted, and a
deliberate re-freeze is `./scripts/terrain-chain.sh --refreeze`.

    python3 -m worldgen.verify_freeze

`ES_FREEZE_PATH` / `ES_HYDROLOGY_GRAPH` point the check at other copies of the
two records (how the refusal is exercised without touching the tracked files).
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np

from . import freeze

REPO_ROOT = freeze.REPO_ROOT
GRAPH_PATH = REPO_ROOT / "world" / "sources" / "hydrology" / "hydrology-graph.json"
SHAPED = freeze.SHAPED
REFREEZE_HINT = ("a deliberate re-freeze is `./scripts/terrain-chain.sh --refreeze` "
                 "(it rebuilds the frozen rungs and re-records the shas; the owner walks the result)")


def freeze_doc(path: Path | None = None) -> dict:
    """The freeze record, from `path`, else $ES_FREEZE_PATH, else the tracked file."""
    path = Path(path or os.environ.get("ES_FREEZE_PATH") or freeze.FREEZE_PATH)
    if not path.exists():
        raise freeze.FrozenError(f"verify_freeze: no freeze record at {path}")
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("schemaVersion") != freeze.SCHEMA_VERSION:
        raise freeze.FrozenError(
            f"{path}: schemaVersion {doc.get('schemaVersion')!r}, expected {freeze.SCHEMA_VERSION}")
    return doc


def graph_doc(path: Path | None = None) -> dict:
    path = Path(path or os.environ.get("ES_HYDROLOGY_GRAPH") or GRAPH_PATH)
    if not path.exists():
        raise freeze.FrozenError(f"verify_freeze: no hydrology graph at {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def check_arrays(doc: dict) -> tuple[list[str], list[str]]:
    """(lines to print, failures) for the three frozen arrays against the vault."""
    lines: list[str] = []
    bad: list[str] = []
    for name, rec in doc["frozen"].items():
        cand = freeze.vault_copy(name)
        if cand is None:
            lines.append(f"  {name}: not in the vault (recorded {rec['sha256'][:16]}…) — skipped")
            continue
        sha = freeze.sha256_of(np.load(cand, mmap_mode="r"))
        if sha == rec["sha256"]:
            lines.append(f"  {name}: {sha[:16]}… ok (frozen {rec['frozenOn']})")
        else:
            lines.append(f"  {name}: vault {sha[:16]}… DIFFERS from recorded {rec['sha256'][:16]}…")
            bad.append(f"{name} in the vault is not the array the province was built on")
    return lines, bad


def check_graph(graph: dict, doc: dict) -> tuple[list[str], list[str]]:
    """(lines, failures) for hydrology-graph.json against the freeze record."""
    from .hydrology_graph import content_hash  # heavy; imported only when we get here

    lines: list[str] = []
    bad: list[str] = []
    recorded_shaped = (doc["frozen"].get(SHAPED) or {}).get("sha256")
    source = graph.get("sourceHeightSha256")
    if recorded_shaped is None:
        lines.append(f"  hydrology-graph.sourceHeightSha256: {SHAPED} is not in the freeze record")
        bad.append(f"{SHAPED} is not recorded in the freeze record, so the graph's source cannot be checked")
    elif source == recorded_shaped:
        lines.append(f"  hydrology-graph.sourceHeightSha256: {source[:16]}… ok (solved on {SHAPED})")
    else:
        lines.append(f"  hydrology-graph.sourceHeightSha256: {str(source)[:16]}… "
                     f"DIFFERS from the recorded {SHAPED} {recorded_shaped[:16]}…")
        bad.append("hydrology-graph.json was solved on a different shaped ground than the one frozen")

    want = content_hash(graph)
    if graph.get("contentSha256") == want:
        lines.append(f"  hydrology-graph.contentSha256: {want[:16]}… ok")
    else:
        lines.append(f"  hydrology-graph.contentSha256: recorded {str(graph.get('contentSha256'))[:16]}… "
                     f"recomputes to {want[:16]}… DIFFERS")
        bad.append("hydrology-graph.json's contentSha256 does not match its content (it was edited in place)")
    return lines, bad


def verify(freeze_path: Path | None = None, graph_path: Path | None = None,
           graph: dict | None = None) -> list[str]:
    """Print one line per item; return the list of failures (empty = pass)."""
    doc = freeze_doc(freeze_path)
    lines, bad = check_arrays(doc)
    g = graph if graph is not None else graph_doc(graph_path)
    glines, gbad = check_graph(g, doc)
    for line in lines + glines:
        print(line)
    return bad + gbad


def main(argv: list[str] | None = None) -> int:
    bad = verify()
    if bad:
        print("verify_freeze: the frozen base has drifted —")
        for b in bad:
            print(f"  ! {b}")
        print(f"  {REFREEZE_HINT}")
        return 1
    print("verify_freeze: the frozen base and the hydrology graph are the ones on record.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""The frozen-base record: which terrain arrays are frozen, by content hash.

Phase 16b (decision 0059). The sculpted base and the refined frozen base are
each written ONCE and recorded here by sha256; every later stage reads them
and never writes them. `--allow-sculpt` destroyed the approved base twice
because a flag is not a record: from now on a stage that would overwrite a
frozen array whose sha is recorded REFUSES unless `ES_REFREEZE=1` is set
(the chain's `--refreeze`), and a refreeze rewrites the record in the same
run so the repo always names the array the province was built on.

The record is committed (`world/sources/terrain/freeze.json`): the truth
about which base the province stands on belongs in the tree, not in a
per-machine vault. `province/meta.json` carries the same shas for the studio.

    python3 -m worldgen.freeze          # print the record and check the vault against it
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[3]
FREEZE_PATH = REPO_ROOT / "world" / "sources" / "terrain" / "freeze.json"
SCHEMA_VERSION = 1
ENV_REFREEZE = "ES_REFREEZE"

SCULPT = "heightfield-sculpted-f32.npy"
SHAPED = "heightfield-shaped-f32.npy"
FROZEN = "refined-height-frozen-f32.npy"


class FrozenError(SystemExit):
    pass


def sha256_of(arr: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(arr).tobytes()).hexdigest()


def load() -> dict:
    if not FREEZE_PATH.exists():
        return {"schemaVersion": SCHEMA_VERSION, "frozen": {}}
    doc = json.loads(FREEZE_PATH.read_text(encoding="utf-8"))
    if doc.get("schemaVersion") != SCHEMA_VERSION:
        raise FrozenError(f"{FREEZE_PATH}: schemaVersion {doc.get('schemaVersion')!r}, expected {SCHEMA_VERSION}")
    return doc


def recorded(name: str) -> str | None:
    return (load()["frozen"].get(name) or {}).get("sha256")


def refreeze_allowed() -> bool:
    return os.environ.get(ENV_REFREEZE, "") not in ("", "0")


def guard(name: str, sha: str) -> None:
    """Refuse to replace a recorded frozen array with a different one."""
    old = recorded(name)
    if old is not None and old != sha and not refreeze_allowed():
        raise FrozenError(
            f"freeze: {name} is frozen at {old[:16]}… and this run produced {sha[:16]}….\n"
            f"  The frozen base is content-addressed (world/sources/terrain/freeze.json). If the\n"
            f"  re-derivation is deliberate, run with {ENV_REFREEZE}=1 (terrain-chain.sh --refreeze)\n"
            f"  and commit the new record; otherwise the code or an input has drifted — find out which.")


def record(name: str, sha: str, why: str, frozen_on: str) -> None:
    doc = load()
    doc["about"] = ("Content hashes of the terrain arrays the province is built on. A chain stage "
                    "refuses to overwrite a recorded array with different content unless ES_REFREEZE=1; "
                    "see worldgen/freeze.py and decision 0059.")
    doc["frozen"][name] = {"sha256": sha, "frozenOn": frozen_on, "why": why}
    FREEZE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FREEZE_PATH.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def atomic_save(path: Path, arr: np.ndarray) -> None:
    """np.save via a temp file + rename: a reader never sees a half-written array."""
    path = Path(path)
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    os.close(fd)
    try:
        np.save(tmp, arr)
        os.replace(tmp if tmp.endswith(".npy") else tmp + ".npy", path)
    finally:
        for cand in (tmp, tmp + ".npy"):
            if os.path.exists(cand):
                os.unlink(cand)


def save_frozen(path: Path, arr: np.ndarray, name: str, why: str, frozen_on: str) -> str:
    """Write a frozen array: guard against silent replacement, save, record."""
    sha = sha256_of(arr)
    guard(name, sha)
    atomic_save(path, arr)
    if recorded(name) != sha:
        record(name, sha, why, frozen_on)
    return sha


def main() -> int:
    from .vault import HEIGHTFIELD_DIR
    doc = load()
    rc = 0
    for name, rec in doc["frozen"].items():
        for cand in (HEIGHTFIELD_DIR / name, HEIGHTFIELD_DIR / "province-refined" / name):
            if cand.exists():
                sha = sha256_of(np.load(cand, mmap_mode="r"))
                state = "ok" if sha == rec["sha256"] else "DIFFERS"
                rc |= state != "ok"
                print(f"{name}: recorded {rec['sha256'][:16]}… vault {sha[:16]}… {state} ({rec['frozenOn']})")
                break
        else:
            print(f"{name}: recorded {rec['sha256'][:16]}… not in the vault")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())

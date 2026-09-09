"""The terrain chain's stage runner: timing, and skipping what has not changed.

`scripts/terrain-chain.sh` owns the stage ORDER (it is the one place that
lists it). This module owns what a stage *is* — how it is invoked, and how the
chain decides a stage's work is already on disk:

    python3 -m worldgen.chain_stages run <key> <stage> [args...]

A stage is skipped when three fingerprints all match the last recorded run:

1. **its code** — the sha256 of `worldgen/<stage>.py` and every worldgen
   module it imports, transitively (`module_closure`, walked from the source,
   so the list can never drift out of date the way a hand-written one does);
2. **its inputs** — the sha256 of every file it read last time;
3. **its outputs** — the sha256 of every file it wrote last time, so an output
   edited or deleted by hand rebuilds rather than being trusted.

Files whose last writer is a LATER stage are exempt from 2 and 3 — the chain
has feedback edges and would otherwise never settle. See `is_fresh`.

Input and output lists are OBSERVED, not declared: the runner installs an
audit hook, records every file the stage opens under the repo or the vault,
and calls a path an output when its mtime moved while the stage ran. That is
why the first run after this file appears rebuilds everything (nothing is
recorded yet), and why adding a stage needs no bookkeeping here.

Because a downstream stage's inputs are the upstream stage's outputs, a change
cascades on content alone: edit `compile_water` and only the water stage and
whatever reads `water-pass1.npz` re-runs; edit `sculpt.py` and everything does.

The record lives in `chain-stamps.json` in the vault heightfield directory
(next to the terrain it describes, never committed, and per-vault so a scratch
copy and the real vault keep separate books). It holds hashes only: no
timestamps, nothing that would make a rebuild non-deterministic (engineering
standard 4).
"""

from __future__ import annotations

import ast
import hashlib
import json
import os
import runpy
import sys
import time
from pathlib import Path

from .compile_chunks import HEIGHTFIELD_DIR, REPO_ROOT

PKG_DIR = Path(__file__).resolve().parent
STAMPS = (HEIGHTFIELD_DIR / "chain-stamps.json").resolve()
# Roots whose files count as a stage's inputs/outputs. Everything else a stage
# opens (the standard library, site-packages, /proc) is noise.
_ROOTS = (Path(REPO_ROOT).resolve(), Path(HEIGHTFIELD_DIR).resolve())
_IGNORE_PARTS = {".git", "__pycache__", "node_modules", ".venv"}


# ---------------------------------------------------------------- code hash

def module_closure(stage: str) -> list[Path]:
    """Every worldgen source file `worldgen.<stage>` pulls in, transitively."""
    seen: set[str] = set()
    todo = [stage, "__init__"]
    while todo:
        name = todo.pop()
        if name in seen:
            continue
        path = PKG_DIR / f"{name}.py"
        if not path.exists():
            continue
        seen.add(name)
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.level:
                if node.module:                       # from .scale import RAW_M
                    todo.append(node.module.split(".")[0])
                else:                                 # from . import catalogue
                    todo += [a.name for a in node.names]
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.startswith("worldgen."):
                        todo.append(alias.name.split(".", 2)[1])
    return [PKG_DIR / f"{name}.py" for name in sorted(seen)]


def _sha_sources(paths) -> str:
    h = hashlib.sha256()
    for path in paths:
        h.update(path.name.encode())
        h.update(path.read_bytes())
    return h.hexdigest()


# --------------------------------------------------------------- file hash

def _sha_file(path: Path) -> str:
    try:
        h = hashlib.sha256()
        with open(path, "rb", buffering=0) as fh:
            for block in iter(lambda: fh.read(1 << 20), b""):
                h.update(block)
        return h.hexdigest()
    except OSError:
        return "missing"


def _relevant(path: Path) -> bool:
    try:
        resolved = path.resolve()
    except OSError:
        return False
    if resolved == STAMPS or PKG_DIR in resolved.parents:
        return False
    if _IGNORE_PARTS & set(resolved.parts):
        return False
    if not resolved.is_file():
        return False
    return any(root == resolved or root in resolved.parents for root in _ROOTS)


# ------------------------------------------------------------------ runner

def _load() -> dict:
    try:
        return json.loads(STAMPS.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def _position(key: str) -> int:
    """The stage's place in the chain, from its `NN-name` stamp key."""
    head = key.split("-", 1)[0]
    return int(head) if head.isdigit() else -1


def last_writers(book: dict) -> dict[str, int]:
    """{path: the LAST chain position that writes it}."""
    out: dict[str, int] = {}
    for key, stamp in book.items():
        at = _position(key)
        for path in stamp.get("outputs", {}):
            out[path] = max(out.get(path, -1), at)
    return out


def is_fresh(stamp: dict, code: str, at: int = -1,
             written_by: dict[str, int] | None = None) -> bool:
    """Is this stage's recorded work still the work the chain would do now?

    The chain is not a clean DAG — it has feedback edges. `sculpt_province`
    reads `routes.json`, which `reroute_majors` rewrites four stages later;
    `refine_province` writes the refined heightfield, which `grade_routes`
    then re-grades. A file whose LAST writer is a later stage therefore says
    nothing about whether this stage is stale: it is downstream state, and
    holding a stage to it would mean the chain never settles — every run
    would rebuild the sculpt because the run before it moved the roads.

    So a stage is fresh when its code is unchanged and every file it touched
    whose last writer is itself or an earlier stage is unchanged. That is
    exactly the single-pass behaviour the chain has always had, with the work
    it has already done left in place.
    """
    if not stamp or stamp.get("code") != code:
        return False
    written_by = written_by or {}
    for group in ("inputs", "outputs"):
        for path, sha in stamp.get(group, {}).items():
            if written_by.get(path, -1) > at:
                continue
            if _sha_file(Path(path)) != sha:
                return False
    return True



# ------------------------------------------------- is this edit a local carve?

#: The only source files whose change a LOCAL RE-CARVE can account for: a
#: dock's promise (`dock_dredge`) and an authored minor waterway
#: (`authored_waterways`). Both cut a bounded patch of ground and nothing else.
LOCAL_CARVE_INPUTS = ("world/sources/blueprints/",
                      "world/sources/routes/authored-minor-waterways.json")


def local_carve_only() -> tuple[bool, str]:
    """Can this run take the fast path? Returns (yes, why).

    The fast path patches the graded heightfield with just the local carves
    instead of re-deriving the whole province, so it is valid only when the
    ONLY thing that changed is one of those carves. This is deliberately
    CONSERVATIVE: any code change at all, any other changed input, or a
    missing carve snapshot sends the run down the full chain. `recarve_local`
    then checks the ground outside the last footprint for itself and refuses
    to run if anything upstream moved, so a wrong answer here costs a failed
    stage, never a wrong province.
    """
    book = _load()
    key = next((k for k in book if k.endswith("-refine_province")
                and not k.startswith("fp-")), None)
    if key is None:
        return False, "no full chain has run against this vault yet"
    snapshot = HEIGHTFIELD_DIR / "province-refined" / "local-carve-inputs.npz"
    if not snapshot.exists():
        return False, "no local-carve snapshot: the fast path has nothing to restart from"
    stamp = book[key]
    if stamp.get("code") != _sha_sources(module_closure("refine_province")):
        return False, "the terrain code changed; only a full re-derive can be trusted"
    written_by = last_writers(book)
    at = _position(key)
    changed = []
    for group in ("inputs", "outputs"):
        for path, sha in stamp.get(group, {}).items():
            if written_by.get(path, -1) > at:
                continue          # downstream state, not this stage's input
            if _sha_file(Path(path)) != sha:
                changed.append(path)
    if not changed:
        return False, "nothing changed"
    # A fast run does not update the full chain's refine stamp — it never runs
    # refine. So the same carve would look "changed" for ever and be re-applied
    # on every plain run. It is the RECARVE's own stamp that says whether these
    # carves are already in the ground.
    fp_key = next((k for k in book if k.endswith("-recarve_local")), None)
    if fp_key is not None:
        fp = book[fp_key]
        if is_fresh(fp, _sha_sources(module_closure("recarve_local")),
                    _position(fp_key), written_by):
            return False, "the last fast run already applied these carves"
    other = [c for c in changed if not any(m in c for m in LOCAL_CARVE_INPUTS)]
    if other:
        return False, f"{len(other)} changed file(s) the carve cannot account for, first: {other[0]}"
    return True, f"only local carves changed ({len(changed)} file(s))"


def _mtime(path: Path) -> int:
    try:
        return path.stat().st_mtime_ns
    except OSError:
        return -1


def run(key: str, stage: str, argv: list[str], force: bool) -> tuple[float, bool]:
    """Run (or skip) one stage. Returns (seconds, ran)."""
    code = _sha_sources(module_closure(stage))
    book = _load()
    if not force and is_fresh(book.get(key, {}), code, _position(key), last_writers(book)):
        return 0.0, False

    seen_at: dict[Path, int] = {}

    def hook(event: str, args) -> None:
        # Fires BEFORE the open, so the mtime recorded here is the file's
        # state going in: anything whose mtime moves by the end was written.
        if event == "open":
            target = args[0]
            if isinstance(target, (str, bytes, os.PathLike)):
                try:
                    path = Path(os.fsdecode(target))
                except (ValueError, UnicodeDecodeError):
                    return
                if path not in seen_at:
                    seen_at[path] = _mtime(path)

    sys.addaudithook(hook)
    argv_saved = sys.argv[:]
    sys.argv = [f"worldgen/{stage}.py", *argv]
    t0 = time.perf_counter()
    try:
        runpy.run_module(f"worldgen.{stage}", run_name="__main__", alter_sys=True)
    finally:
        elapsed = time.perf_counter() - t0
        sys.argv = argv_saved

    inputs: dict[str, str] = {}
    outputs: dict[str, str] = {}
    for path in sorted(p for p in seen_at if _relevant(p)):
        group = outputs if _mtime(path) != seen_at[path] else inputs
        group[str(path)] = _sha_file(path)
    book[key] = {"stage": stage, "code": code, "inputs": inputs, "outputs": outputs}
    STAMPS.parent.mkdir(parents=True, exist_ok=True)
    STAMPS.write_text(json.dumps(book, indent=1, sort_keys=True) + "\n")
    return elapsed, True


def main(argv: list[str] | None = None) -> None:
    args = list(argv if argv is not None else sys.argv[1:])
    force = "--force" in args
    args = [a for a in args if a != "--force"]
    if args[:1] == ["local-carve-only"]:
        ok, why = local_carve_only()
        print(why)
        raise SystemExit(0 if ok else 1)
    if len(args) < 3 or args[0] != "run":
        print(__doc__)
        raise SystemExit(2)
    key, stage, *rest = args[1:]
    seconds, ran = run(key, stage, rest, force)
    print("skip (unchanged)" if not ran else f"[{stage}] {seconds:.1f}s")
    times = os.environ.get("CHAIN_TIMES")
    if times:
        with open(times, "a", encoding="utf-8") as fh:
            fh.write(f"{stage}|{seconds:.1f}|{'run' if ran else 'skip'}\n")


if __name__ == "__main__":
    main()

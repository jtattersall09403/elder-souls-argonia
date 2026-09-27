"""One atomic writer for every file the settlement publish writes.

`tempfile.mkstemp` creates 0600 and `os.replace` keeps the temp file's mode,
so a writer that forgets the chmod publishes a file Pages cannot serve
(2026-09-22). Every published file therefore goes through `atomic_write_bytes`:
write a sibling temp file, fsync it, give it the published mode, then rename
it over the target. A reader sees the old file or the new one, never half of
either, and the new one is world-readable whatever the process umask.
"""

from __future__ import annotations

import contextlib
import fcntl
import hashlib
import json
import os
import sys
import tempfile
import time
from pathlib import Path

PUBLISHED_MODE = 0o644


def stage_bytes(path: Path, data: bytes, mode: int = PUBLISHED_MODE) -> str:
    """Write `data` to a fsynced temp sibling of `path` with `mode`; return its name.

    For callers that rename several staged files in a set order."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(name, mode)
        return name
    except BaseException:
        if os.path.exists(name):
            os.unlink(name)
        raise


def atomic_write_bytes(path: Path, data: bytes, mode: int = PUBLISHED_MODE) -> None:
    """Replace `path` with `data` in one rename, at `mode`."""
    name = stage_bytes(path, data, mode)
    try:
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def atomic_write_json(path: Path, value: object, mode: int = PUBLISHED_MODE) -> None:
    """`atomic_write_bytes` of `value` as indented, key-sorted JSON."""
    data = json.dumps(value, indent=2, sort_keys=True).encode("utf-8") + b"\n"
    atomic_write_bytes(path, data, mode)


def publish_copy(source: Path, target: Path, mode: int = PUBLISHED_MODE) -> None:
    """Copy `source` to `target` atomically at `mode` (a staged asset copy)."""
    atomic_write_bytes(target, Path(source).read_bytes(), mode)


# --- locked whole-file writers (decision 0104 decision 9) --------------------
# The authored records (catalogue region files, quest packets, plot remedies,
# travel services, patches, crossings) are rewritten whole by a dozen
# modules, and two lanes writing one file at once used to leave whichever
# dump landed last. Every such writer takes an exclusive `flock` on a lock
# file keyed by the target path (the job_guard lock directory, like
# `kit_lock.py`), then stages a temp sibling and renames it over the target.
# The lock serialises the writes and the rename means a reader never sees
# half a file; a lost update between two read-modify-write lanes is closed
# only where the writer holds `write_lock` around its read as well (done in
# vegetation_patches and travel_services; the catalogue's twelve callers
# load in one function and dump in another, queued in the T2 report).


def write_lock_path(path: Path) -> Path:
    key = hashlib.sha256(str(Path(path).resolve()).encode("utf-8")).hexdigest()[:16]
    root = Path(os.environ.get("ES_JOB_LOCK_DIR", "/tmp/es-jobs")) / "writes"
    return root / f"{Path(path).name}.{key}.lock"


_HELD: set[str] = set()     # lock files this process holds (re-entry passes through)


@contextlib.contextmanager
def write_lock(path: Path, wait_s: float | None = None, poll_s: float = 0.2):
    """Hold the exclusive write lock of ``path`` for the block (waits up to
    ``ES_WRITE_LOCK_WAIT_S``, default 600 s, then raises). A writer that
    reads, edits and rewrites a file holds it around all three; the
    `locked_write_text` inside then passes straight through."""
    wait_s = float(os.environ.get("ES_WRITE_LOCK_WAIT_S", 600)) if wait_s is None else wait_s
    lock = write_lock_path(path)
    if str(lock) in _HELD:
        yield
        return
    lock.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(lock, os.O_RDWR | os.O_CREAT, 0o666)
    start = last = time.monotonic()
    try:
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                now = time.monotonic()
                if now - start >= wait_s:
                    raise TimeoutError(f"write lock: waited {now - start:.0f} s for {path} "
                                       f"({lock} held)") from None
                if now - last >= 60:
                    print(f"write_lock: waiting for {path}", file=sys.stderr, flush=True)
                    last = now
                time.sleep(poll_s)
        _HELD.add(str(lock))
        try:
            yield
        finally:
            _HELD.discard(str(lock))
    finally:
        os.close(fd)                # closing the descriptor releases the flock


def locked_write_text(path: Path, text: str) -> None:
    """Replace ``path`` with ``text`` (UTF-8) under its write lock, by rename.
    The file keeps its mode (0644 when new)."""
    path = Path(path)
    mode = (path.stat().st_mode & 0o777) if path.exists() else PUBLISHED_MODE
    with write_lock(path):
        atomic_write_bytes(path, text.encode("utf-8"), mode)

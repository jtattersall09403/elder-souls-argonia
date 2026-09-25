"""One atomic writer for every file the settlement publish writes.

`tempfile.mkstemp` creates 0600 and `os.replace` keeps the temp file's mode,
so a writer that forgets the chmod publishes a file Pages cannot serve
(2026-09-22). Every published file therefore goes through `atomic_write_bytes`:
write a sibling temp file, fsync it, give it the published mode, then rename
it over the target. A reader sees the old file or the new one, never half of
either, and the new one is world-readable whatever the process umask.
"""

from __future__ import annotations

import json
import os
import tempfile
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

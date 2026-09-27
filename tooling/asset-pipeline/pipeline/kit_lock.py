"""The kit-list lock (16k r8 rule 4): kit builds and the kit miners never overlap.

A kit build (`build_kit.build`, `kit_compress.publish`) rewrites the raw
manifests under ``output/kits`` and the published kits; the miners
(`worldgen.mine_mounts`, `mine_designed_sink`, `mine_abuts`,
`mine_effect_sockets`) read that kit list at start and end (remine r2: a
build at 19:44:48 rewrote the manifests under a running abuts miner and
skewed its singleUse). Builders take the lock EXCLUSIVE, miners SHARED
(miners may overlap one another, never a build).

The lock is ``flock`` on ``$ES_JOB_LOCK_DIR/kit-list.lock`` (the job_guard
lock directory, default /tmp/es-jobs), released when the holder exits
however it exits. A taker waits (message every 60 s) up to
``ES_KIT_LOCK_WAIT_S`` (1800 s), then raises. The holder exports
``ES_KIT_LOCK_HELD`` so a nested take in the same process or a child
process (a build calling publish, a miner calling another miner's
functions) passes straight through.

    with kit_list_lock("exclusive", "build_kit settlement-mud-v1"):
        ...
"""
from __future__ import annotations

import contextlib
import fcntl
import os
import sys
import time
from pathlib import Path

HELD_ENV = "ES_KIT_LOCK_HELD"


def lock_path() -> Path:
    return Path(os.environ.get("ES_JOB_LOCK_DIR", "/tmp/es-jobs")) / "kit-list.lock"


@contextlib.contextmanager
def kit_list_lock(mode: str, who: str, wait_s: float | None = None, poll_s: float = 0.5):
    """Hold the kit-list lock (``mode`` "exclusive" or "shared") for the block."""
    if mode not in ("exclusive", "shared"):
        raise ValueError(f"kit_list_lock mode {mode!r}")
    if os.environ.get(HELD_ENV):
        yield                       # an ancestor or this process already holds it
        return
    wait_s = float(os.environ.get("ES_KIT_LOCK_WAIT_S", 1800)) if wait_s is None else wait_s
    path = lock_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    flag = fcntl.LOCK_EX if mode == "exclusive" else fcntl.LOCK_SH
    fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o666)
    start = last = time.monotonic()
    try:
        while True:
            try:
                fcntl.flock(fd, flag | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                now = time.monotonic()
                if now - start >= wait_s:
                    raise TimeoutError(f"kit-list lock: {who} waited {now - start:.0f} s "
                                       f"({path} held)") from None
                if now - last >= 60:
                    print(f"kit_lock[{who}]: waiting for the kit list ({mode})",
                          file=sys.stderr, flush=True)
                    last = now
                time.sleep(poll_s)
        os.environ[HELD_ENV] = f"{os.getpid()}:{mode}:{who}"
        try:
            yield
        finally:
            os.environ.pop(HELD_ENV, None)
    finally:
        os.close(fd)                # closing the descriptor releases the flock

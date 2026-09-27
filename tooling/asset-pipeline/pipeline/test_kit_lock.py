"""16k r8 rule 4: a second taker of the kit-list lock waits."""
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from .kit_lock import HELD_ENV, kit_list_lock

HERE = Path(__file__).resolve().parents[1]
HOLD = ("import sys, time; sys.path.insert(0, {root!r});"
        "from pipeline.kit_lock import kit_list_lock\n"
        "with kit_list_lock({mode!r}, 'holder'):\n"
        "    print('held', flush=True); time.sleep({hold})\n")


def _holder(tmp_path, mode: str, hold: float) -> subprocess.Popen:
    env = {**os.environ, "ES_JOB_LOCK_DIR": str(tmp_path)}
    env.pop(HELD_ENV, None)
    proc = subprocess.Popen([sys.executable, "-c", HOLD.format(root=str(HERE), mode=mode,
                                                              hold=hold)],
                            env=env, stdout=subprocess.PIPE, text=True)
    assert proc.stdout.readline().strip() == "held"
    return proc


@pytest.fixture
def lock_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("ES_JOB_LOCK_DIR", str(tmp_path))
    monkeypatch.delenv(HELD_ENV, raising=False)
    return tmp_path


def test_a_second_taker_waits_for_a_build(lock_dir):
    proc = _holder(lock_dir, "exclusive", 1.5)
    start = time.monotonic()
    with kit_list_lock("shared", "miner", wait_s=30, poll_s=0.05):
        waited = time.monotonic() - start
    proc.wait()
    assert waited >= 1.0


def test_a_build_waits_for_a_miner_and_times_out_loudly(lock_dir):
    proc = _holder(lock_dir, "shared", 2.0)
    with pytest.raises(TimeoutError):
        with kit_list_lock("exclusive", "build", wait_s=0.3, poll_s=0.05):
            pass
    proc.wait()


def test_miners_share_and_a_nested_take_passes(lock_dir):
    proc = _holder(lock_dir, "shared", 1.0)
    start = time.monotonic()
    with kit_list_lock("shared", "miner", wait_s=5, poll_s=0.05):
        with kit_list_lock("exclusive", "nested", wait_s=0.1):
            assert os.environ[HELD_ENV].endswith(":shared:miner")
    assert time.monotonic() - start < 0.9
    proc.wait()
    assert HELD_ENV not in os.environ


def test_builders_take_it_exclusive_and_miners_shared(monkeypatch):
    import contextlib
    from . import build_kit, kit_compress, kit_lock
    taken = []

    @contextlib.contextmanager
    def record(mode, who, **_k):
        taken.append((mode, who.split()[0]))
        yield
    monkeypatch.setattr(kit_lock, "kit_list_lock", record)
    monkeypatch.setattr(build_kit, "_build", lambda *a: {})
    monkeypatch.setattr(kit_compress, "_publish", lambda *a: {})
    build_kit.build("k", Path("."))
    kit_compress.publish("k")
    sys.path.insert(0, str(HERE.parent / "world-generation"))
    from worldgen import mine_abuts, mine_designed_sink, mine_effect_sockets, mine_mounts
    for mod in (mine_abuts, mine_designed_sink, mine_effect_sockets, mine_mounts):
        monkeypatch.setattr(mod, "_main", lambda argv=None: 0)
        assert mod.main([]) == 0
    assert taken == [("exclusive", "build_kit"), ("exclusive", "kit_compress"),
                     ("shared", "mine_abuts"), ("shared", "mine_designed_sink"),
                     ("shared", "mine_effect_sockets"), ("shared", "mine_mounts")]


def test_a_batch_build_takes_the_lock_once_for_its_forked_builders(lock_dir):
    from . import build_kit
    got = build_kit.build_many(["a", "b"], Path("."), jobs=2, builder=_held)
    assert [g.split(":")[1] for g in got] == ["exclusive", "exclusive"]
    assert len({g.split(":")[0] for g in got}) == 1          # the parent's hold


def _held(kit_id, _vault):
    return os.environ[HELD_ENV]

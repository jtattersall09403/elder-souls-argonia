"""cpu_watchdog.py decisions on scripted samples (owner ruling 2026-09-25).

The decision core runs against a fake sampler, process table, clock and
signaller; one test drives the real daemon through its env-var hooks. The
live test (two `yes` hogs, real signals, ~20 s) runs only with ES_WD_LIVE=1.
"""
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import cpu_watchdog as wd  # noqa: E402

HERE = Path(__file__).parent


class World:
    """Scripted CPU samples and a process table whose ticks grow at set rates."""

    def __init__(self, samples, procs):
        self.samples = list(samples)
        self.procs = {p.pid: p for p in procs}
        self.rates = {p.pid: p.ticks for p in procs}   # ticks gained per sample
        self.t = 0.0
        self.signals = []
        self.logs = []

    def clock(self):
        self.t += 2.0
        return self.t

    def sampler(self):
        return self.samples.pop(0) if self.samples else 10.0

    def reader(self):
        for p in self.procs.values():
            if p.state != "T":
                p.ticks += self.rates[p.pid]
        return {k: wd.Proc(**v.__dict__) for k, v in self.procs.items()}

    def signal(self, pid, sig):
        if pid not in self.procs:
            raise ProcessLookupError
        self.signals.append((pid, signal.Signals(sig).name))
        if sig == signal.SIGSTOP:
            self.procs[pid].state = "T"
        elif sig == signal.SIGCONT:
            self.procs[pid].state = "S"
        elif sig == signal.SIGKILL:
            del self.procs[pid]

    def dog(self, **cfg):
        return wd.Watchdog(wd.Config(**cfg), self.sampler, self.reader, self.signal, self.clock,
                           self.logs.append, self_pids={999})

    def run(self, dog, n):
        for _ in range(n):
            dog.step()


def P(pid, rate, args, comm=None, ppid=100, age=10.0, state="S"):
    return wd.Proc(pid=pid, ppid=ppid, start=pid * 10, ticks=rate, age=age,
                   comm=comm or args.split()[0].rsplit("/", 1)[-1], args=args, state=state)


def test_stop_heaviest_one_per_sample_then_continue_oldest_first():
    w = World([90, 95, 90, 88, 65] + [50] * 12,
              [P(10, 150, "yes"), P(11, 190, "node vitest"), P(12, 5, "bash")])
    dog = w.dog()
    w.run(dog, 3)
    assert w.signals == [(11, "SIGSTOP")]            # third high sample, heaviest first
    w.run(dog, 1)
    assert w.signals[-1] == (10, "SIGSTOP")          # still above 70: next heaviest
    w.run(dog, 1)                                    # 65 < 70: stops stopping
    assert len([s for s in w.signals if s[1] == "SIGSTOP"]) == 2
    w.run(dog, 5)                                    # under 60 from sample 6 (t=12) to t=20: 8 s
    assert not [s for s in w.signals if s[1] == "SIGCONT"]
    w.run(dog, 1)                                    # t=22: 10 s under 60
    assert w.signals[-1] == (11, "SIGCONT")          # oldest stopped first
    w.run(dog, 4)
    assert w.signals[-1] == (11, "SIGCONT")          # the 10 s window restarts
    w.run(dog, 1)
    assert w.signals[-1] == (10, "SIGCONT")
    assert dog.stopped == []
    assert any(l.startswith("STOP pid 11 ") and "machine 90%" in l for l in w.logs)


def test_two_high_samples_do_nothing():
    w = World([95, 95, 50, 95, 95, 50], [P(10, 150, "yes")])
    dog = w.dog()
    w.run(dog, 6)
    assert w.signals == []


def test_exempt_processes_are_never_stopped():
    w = World([99] * 8, [
        P(20, 400, "/vscode/bin/linux-x64/abc/node --dns-result-order", comm="MainThread"),
        P(21, 300, "claude --model x", comm="claude"),
        P(22, 300, "sshd: user", comm="sshd"),
        P(23, 300, "/home/u/.vscode-server/bin/node extensionHost"),
        P(999, 300, "python3 cpu_watchdog.py"),
        P(1, 300, "/sbin/init", ppid=0),
        P(24, 50, "python3 -m worldgen.mine_mounts"),
    ])
    dog = w.dog()
    w.run(dog, 8)
    assert {pid for pid, s in w.signals if s == "SIGSTOP"} == {24}


def test_stale_rtk_terminated_then_killed_unless_wrapping_a_live_child():
    w = World([10] * 20, [
        P(30, 1, "rtk grep x", age=200),                 # old, alone: stale
        P(31, 1, "rtk npm run preflight", age=500),      # old, wraps a live job: kept
        P(32, 1, "npm run preflight", ppid=31),
        P(33, 1, "rtk git status", age=30),              # young: kept
    ])
    dog = w.dog(kill_grace=10)
    w.run(dog, 1)
    assert w.signals == [(30, "SIGTERM")]
    w.run(dog, 5)                                        # t = 12, grace 10 s from t = 2
    assert w.signals[-1] == (30, "SIGKILL")
    assert any(l.startswith("TERM pid 30 ") and "rtk older than 120 s" in l for l in w.logs)
    assert any(l.startswith("KILL pid 30 ") for l in w.logs)
    assert not [s for s in w.signals if s[0] in (31, 32, 33)]


def test_orphaned_workers_killed_after_ten_minutes():
    w = World([10] * 400, [
        P(40, 1, "node /repo/node_modules/vitest/dist/workers/forks.js", ppid=1),
        P(41, 1, "/opt/blender/blender -b --python wb.py", ppid=1),
        P(42, 1, "python3 my_server.py", ppid=1),            # not a stale kind
        P(43, 1, "node vitest", ppid=77),                    # parent alive
    ])
    dog = w.dog()
    w.run(dog, 295)                                          # t = 590: first seen at t = 2
    assert w.signals == []
    w.run(dog, 20)                                           # next sweep at or after t = 602
    assert {pid for pid, s in w.signals if s == "SIGTERM"} == {40, 41}


def test_stopped_process_that_exits_is_dropped():
    w = World([95] * 3 + [95], [P(10, 150, "yes"), P(11, 1, "sleepy")])
    dog = w.dog()
    w.run(dog, 3)
    assert [s.pid for s in dog.stopped] == [10]
    del w.procs[10]
    w.run(dog, 1)
    assert 10 not in [s.pid for s in dog.stopped]
    assert any(l.startswith("GONE pid 10 ") for l in w.logs)


def test_daemon_through_env_hooks(tmp_path):
    """The real daemon with ES_WD_SAMPLER / ES_WD_PROCS injected, dry-run."""
    samples = tmp_path / "samples"
    samples.write_text("\n".join(["90", "90", "90", "50"] + ["40"] * 8) + "\n")
    sampler = tmp_path / "sampler.sh"
    sampler.write_text(f'#!/bin/bash\nhead -1 {samples}; sed -i 1d {samples}\n')
    sampler.chmod(0o755)
    counter = tmp_path / "n"
    counter.write_text("0")
    procs = tmp_path / "procs.py"
    procs.write_text(
        "import json,sys\n"
        f"n=int(open({str(counter)!r}).read())+1; open({str(counter)!r},'w').write(str(n))\n"
        "print(json.dumps([dict(pid=4242,ppid=100,start=1,ticks=100*n,age=5,comm='yes',args='yes',state='S')]))\n")
    env = {**os.environ, "ES_WD_DIR": str(tmp_path), "ES_WD_SAMPLER": str(sampler),
           "ES_WD_PROCS": f"{sys.executable} {procs}", "ES_WD_DRY_RUN": "1", "ES_WD_FAKE_CLOCK": "1",
           "ES_WD_SLEEP": "0", "ES_WD_MAX_SAMPLES": "12"}
    subprocess.run([sys.executable, str(HERE / "cpu_watchdog.py")], env=env, check=True, timeout=60)
    log = (tmp_path / "watchdog.log").read_text()
    stop, cont = log.find("DRYRUN signal SIGSTOP -> pid 4242"), log.find("DRYRUN signal SIGCONT -> pid 4242")
    assert 0 <= stop < cont, log
    out = subprocess.run([sys.executable, str(HERE / "cpu_watchdog.py"), "--status"], env=env,
                         capture_output=True, text=True, check=True).stdout
    assert "NOT running" in out and "stopped: 0" in out


@pytest.mark.skipif(os.environ.get("ES_WD_LIVE") != "1", reason="live run: set ES_WD_LIVE=1 (~20 s, real signals)")
def test_live_two_yes_hogs(tmp_path):
    """Real signals, ~20 s: the machine is filled with `yes` processes (two
    victims plus nproc - 2 load hogs); the watchdog stops both victims (the
    heaviest it may touch: ES_WD_MATCH confines this test daemon to them, so
    it never touches other work), and continues both, one at a time, once the
    load hogs are killed and the machine calms."""
    cores = os.cpu_count() or 1           # resume below 1.6 hogs' share: one continued victim
    victims = [subprocess.Popen(["yes", f"es-wd-victim-{i}"], stdout=subprocess.DEVNULL) for i in range(2)]
    load = [subprocess.Popen(["yes", "es-wd-load"], stdout=subprocess.DEVNULL) for _ in range(max(0, cores - 2))]
    env = {**os.environ, "ES_WD_DIR": str(tmp_path), "ES_WD_INTERVAL": "1", "ES_WD_RESUME_BELOW": f"{160 / cores:.0f}",
           "ES_WD_RESUME_AFTER": "3", "ES_WD_MATCH": "^yes es-wd-victim-"}
    daemon = subprocess.Popen([sys.executable, str(HERE / "cpu_watchdog.py")], env=env)
    logf = tmp_path / "watchdog.log"
    read = lambda: logf.read_text() if logf.exists() else ""
    try:
        deadline = time.time() + 20
        while time.time() < deadline and not all(f"STOP pid {v.pid} " in read() for v in victims):
            time.sleep(0.5)
        for h in load:
            h.kill()
        while time.time() < deadline and not all(f"CONT pid {v.pid} " in read() for v in victims):
            time.sleep(0.5)
        log = read()
        for v in victims:
            assert f"STOP pid {v.pid} " in log, log
            assert f"CONT pid {v.pid} " in log, log
            assert log.index(f"STOP pid {v.pid} ") < log.index(f"CONT pid {v.pid} ")
    finally:
        for h in victims + load:
            h.kill()
        daemon.terminate()
        daemon.wait(10)
    print(read())

#!/usr/bin/env python3
"""CPU watchdog daemon (owner ruling 2026-09-25, after the second codespace
crash at 100 % CPU): watches the whole machine's CPU with no agent involved,
pauses the heaviest processes while the machine is saturated and clears
stale ones. A paused target gets one line on its own stderr (STOP_NOTICE)
and another when it resumes, so a paused job never reads as a hang. Started by tooling/bootstrap/on-start.sh through cpu_watchdog.sh
(nohup, one instance: flock on <dir>/watchdog.lock). Log: <dir>/watchdog.log,
state: <dir>/watchdog.state.json (dir = ES_WD_DIR, default /tmp/es-jobs).

Every INTERVAL s (2) it samples whole-machine CPU from /proc/stat.
  * Throttle: CPU above HIGH % (95; was 85 until 2026-09-27, when job_guard's
    and preflight's taskset pin already held heavy jobs to cores 1-7) for
    HIGH_SAMPLES samples (3) -> SIGSTOP the heaviest throttleable target (CPU
    ticks since the last sample), one per sample, until a sample is under
    STOP_UNTIL % (70); a target using under MIN_PCT (25 %) of one core is
    never stopped (it frees nothing). A target is one process, or a whole test run: a
    process that is, or descends from, a pytest/vitest runner is never stopped
    alone (a stopped xdist worker held its whole suite: 50 stops, 8,348
    process-seconds on 2026-09-27, speed deep dive); the target is then the
    topmost runner and every process under it, stopped and continued
    together, or nothing if any of them is exempt (`pick_target`).
  * Resume: once CPU has stayed under RESUME_BELOW % (60) for RESUME_AFTER s
    (10), SIGCONT the oldest-stopped target (every member of a group); the 10 s window restarts after
    each one, so they come back one at a time.
  * Stale sweep every SWEEP s (30): SIGTERM, then SIGKILL after KILL_GRACE s
    (10), any `rtk` older than RTK_MAX s (120) that has no live child (an rtk
    still wrapping a running command, e.g. `rtk npm run preflight`, is left to
    the throttle), and any blender / wb.py / mine_*.py / build_kit / vitest /
    node test worker whose parent has been dead (ppid 1) for ORPHAN_MAX s (600).
  * Memory hogs, every sample (2026-09-30, after two OOM kills of an
    unguarded ~30 GB python3 took the code-tunnel session down): any python /
    blender / node process OUTSIDE a job_guard slot whose RssAnon passes
    MEM_KILL_GIB (20: only a runaway) is sent SIGTERM, then SIGKILL after KILL_GRACE s (10),
    with pid, anon GiB and command logged to the watchdog log AND to
    tooling/.reports/job-guard/mem-watchdog.log (ES_WD_MEM_LOG_DIR). Never
    touched: the exempt set below, and the studio dev server (studio-dev.mjs,
    vite, or a command naming $ES_STUDIO_PORT) with its children. A guarded
    job has its own hard cap (job_guard.sh --mem), so the watchdog leaves it.
Throttleable = every process except code-server / vscode-server / extension
hosts, the VS Code tunnel CLI (`code tunnel`, comm `code`), sshd, tmux (the
sessions run in it), the `claude` CLI,
systemd/init (pid 1), kernel threads, the
watchdog itself with its ancestors, and any process whose own command line
or an ancestor's is job_guard.sh, or that shares a process group with such a
process (it holds a slot on purpose; exempt from both the throttle and the
stale/orphan sweep). Every action is one log line
with pid, target (process or test run and its size), command, CPU and
reason; a CONT line gives how long the target was paused. A restarted watchdog re-adopts the processes its
predecessor left stopped; SIGTERM/SIGINT continues everything it stopped.

  cpu_watchdog.py            run the daemon in the foreground
  cpu_watchdog.py --status   print the daemon's state and the stopped list

Test hooks (env): ES_WD_SAMPLER (a command printing the machine CPU % per
call), ES_WD_PROCS (a command printing a JSON list of processes: pid, ppid,
start, ticks, age, comm, args, state), ES_WD_DRY_RUN=1 (log, never signal),
ES_WD_FAKE_CLOCK=1 (time advances INTERVAL per sample), ES_WD_SLEEP (seconds
actually slept per sample), ES_WD_MAX_SAMPLES, ES_WD_MATCH (regex: only
processes whose command matches are throttleable). Thresholds: ES_WD_INTERVAL,
ES_WD_HIGH, ES_WD_HIGH_SAMPLES, ES_WD_STOP_UNTIL, ES_WD_RESUME_BELOW,
ES_WD_RESUME_AFTER, ES_WD_MIN_PCT, ES_WD_SWEEP, ES_WD_RTK_MAX, ES_WD_ORPHAN_MAX,
ES_WD_KILL_GRACE, ES_WD_MEM_KILL_GIB (0 turns the memory check off).
"""
from __future__ import annotations

import fcntl
import json
import os
import re
import signal
import subprocess
import sys
import time
from dataclasses import dataclass, field

CLK_TCK = os.sysconf("SC_CLK_TCK")
PAGE_KIB = os.sysconf("SC_PAGE_SIZE") // 1024
EXEMPT_ARGS = re.compile(
    r"code-server|vscode-server|/vscode/|\.vscode|extensionHost|"
    r"(^|/)code( .*)? tunnel( |$)|/claude-code/|@anthropic-ai/claude|cpu_watchdog")
# `code` is the VS Code CLI running `code tunnel` (the owner's only connection on EC2).
EXEMPT_COMM = {"sshd", "claude", "systemd", "init", "code", "tmux: server", "tmux: client"}
JOB_GUARD = re.compile(r"job_guard\.sh")
# A test runner: pytest (python -m pytest, py.test, the xdist controller) or
# vitest. Its workers descend from it; an xdist worker's own command line is
# execnet's bootstrap and names neither.
TEST_RUNNER = re.compile(r"(^|[\s/])(py\.test|pytest|vitest)(\s|$|\.mjs|/)|-m\s+pytest\b")
# The kinds of process the memory check may kill, by command name or argv[0].
MEM_KIND = re.compile(r"^(python[\d.]*|blender|node)$")
STUDIO = re.compile(r"studio-dev\.mjs|(^|[\s/])vite(\s|$|\.js)")
STALE_ORPHAN = re.compile(
    r"blender|\bwb\.py\b|mine_\w+(\.py)?|build_kit|vitest|tinypool|jest-worker|node\s+--test")


def env_num(name: str, default: float) -> float:
    v = os.environ.get(name)
    return float(v) if v not in (None, "") else default


@dataclass
class Config:
    interval: float = 2.0
    high: float = 95.0
    high_samples: int = 3
    stop_until: float = 70.0
    resume_below: float = 60.0
    resume_after: float = 10.0
    sweep: float = 30.0
    rtk_max: float = 120.0
    orphan_max: float = 600.0
    kill_grace: float = 10.0
    min_pct: float = 25.0
    match: str = ""
    mem_kill_gib: float = 20.0

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            interval=env_num("ES_WD_INTERVAL", 2), high=env_num("ES_WD_HIGH", 95),
            high_samples=int(env_num("ES_WD_HIGH_SAMPLES", 3)),
            stop_until=env_num("ES_WD_STOP_UNTIL", 70),
            resume_below=env_num("ES_WD_RESUME_BELOW", 60),
            resume_after=env_num("ES_WD_RESUME_AFTER", 10), sweep=env_num("ES_WD_SWEEP", 30),
            rtk_max=env_num("ES_WD_RTK_MAX", 120), orphan_max=env_num("ES_WD_ORPHAN_MAX", 600),
            kill_grace=env_num("ES_WD_KILL_GRACE", 10), min_pct=env_num("ES_WD_MIN_PCT", 25),
            match=os.environ.get("ES_WD_MATCH", ""), mem_kill_gib=env_num("ES_WD_MEM_KILL_GIB", 20))


@dataclass
class Proc:
    pid: int
    ppid: int
    start: int      # start time in ticks since boot: (pid, start) is the identity
    ticks: int      # utime + stime
    age: float      # seconds since the process started
    comm: str
    args: str
    state: str = "S"
    pgid: int = 0   # process group; 0 = unknown
    anon_kib: int = 0   # RssAnon (statm resident - shared)


# ---------------------------------------------------------------- readers

class ProcStatSampler:
    """Whole-machine busy % between consecutive calls (None on the first)."""

    def __init__(self) -> None:
        self.prev: tuple[int, int] | None = None

    def __call__(self) -> float | None:
        with open("/proc/stat") as f:
            vals = [int(x) for x in f.readline().split()[1:]]
        total = sum(vals[:8])
        idle = vals[3] + (vals[4] if len(vals) > 4 else 0)
        prev, self.prev = self.prev, (total, idle)
        if prev is None or total == prev[0]:
            return None
        return 100.0 * (1 - (idle - prev[1]) / (total - prev[0]))


def command_sampler(cmd: str):
    def sample() -> float | None:
        out = subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()
        return float(out) if out else None
    return sample


def read_procs() -> dict[int, Proc]:
    with open("/proc/uptime") as f:
        uptime = float(f.read().split()[0])
    procs: dict[int, Proc] = {}
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        try:
            with open(f"/proc/{name}/stat") as f:
                raw = f.read()
            with open(f"/proc/{name}/cmdline", "rb") as f:
                args = f.read().replace(b"\0", b" ").decode(errors="replace").strip()
        except OSError:
            continue
        try:
            with open(f"/proc/{name}/statm") as f:
                sm = f.read().split()
            anon_kib = max(0, int(sm[1]) - int(sm[2])) * PAGE_KIB
        except (OSError, ValueError, IndexError):
            anon_kib = 0
        lp, rp = raw.index("("), raw.rindex(")")
        comm, rest = raw[lp + 1:rp], raw[rp + 2:].split()
        start = int(rest[19])
        procs[int(name)] = Proc(
            pid=int(name), ppid=int(rest[1]), start=start, ticks=int(rest[11]) + int(rest[12]),
            age=uptime - start / CLK_TCK, comm=comm, args=args, state=rest[0], pgid=int(rest[2]),
            anon_kib=anon_kib)
    return procs


def command_procs(cmd: str):
    def read() -> dict[int, Proc]:
        out = subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout
        return {p["pid"]: Proc(**p) for p in json.loads(out or "[]")}
    return read


def real_signal(pid: int, sig: int) -> None:
    os.kill(pid, sig)


# A paused job says so on its own stderr (npm-test hang, walk 5 2026-09-29: two
# lanes read a paused `npm test` as a 300 s hang), so it never looks hung.
STOP_NOTICE = ("cpu_watchdog: PAUSED this job (machine CPU {cpu:.0f}%). It is not hung: it "
               "resumes by itself once the machine calms. Run heavy jobs and test runs as "
               "`bash tooling/repo-standards/job_guard.sh <lane> -- <command>`, which is never "
               "paused. Log: /tmp/es-jobs/watchdog.log")


def real_notify(pid: int, line: str) -> None:
    """Append one line to the process's stderr; never blocks, never raises."""
    try:
        fd = os.open(f"/proc/{pid}/fd/2", os.O_WRONLY | os.O_APPEND | os.O_NONBLOCK | os.O_NOCTTY)
    except OSError:
        return
    try:
        os.write(fd, ("\n" + line + "\n").encode())
    except OSError:
        pass
    finally:
        os.close(fd)


# ---------------------------------------------------------------- the decision core

@dataclass
class Stopped:
    pid: int
    start: int
    cmd: str
    since: float
    cpu: float
    members: list = field(default_factory=list)   # [[pid, start]] stopped with it (a test run)
    label: str = "process"


@dataclass
class Watchdog:
    cfg: Config
    sampler: object
    procs_reader: object
    signal_fn: object
    clock: object
    log_fn: object
    self_pids: set = field(default_factory=set)
    stopped: list = field(default_factory=list)          # [Stopped], oldest first
    pending: dict = field(default_factory=dict)          # pid -> (start, deadline, cmd)
    orphan_seen: dict = field(default_factory=dict)      # (pid, start) -> first time seen orphaned
    high_run: int = 0
    throttling: bool = False
    low_since: float | None = None
    last_sweep: float | None = None
    last_cpu: float | None = None
    prev_ticks: dict = field(default_factory=dict)       # (pid, start) -> ticks
    last_dt: float = 0.0
    last_t: float | None = None
    guard_pgids: set = field(default_factory=set)        # process groups holding a job_guard job
    notify_fn: object = None                             # (pid, line): tell the paused job itself
    mem_log_fn: object = None                            # (line): tooling/.reports/job-guard/mem-watchdog.log
    mem_pending: set = field(default_factory=set)        # pids sent SIGTERM by the memory check

    def notify(self, pid: int, line: str) -> None:
        if self.notify_fn is not None:
            self.notify_fn(pid, line)

    # --- helpers
    @staticmethod
    def guarded_by_ancestry(p: Proc, procs: dict) -> bool:
        seen = set()
        cur = p
        while cur is not None and cur.pid not in seen:
            if JOB_GUARD.search(cur.args or ""):
                return True
            seen.add(cur.pid)
            cur = procs.get(cur.ppid)
        return False

    def note_guard_groups(self, procs: dict) -> None:
        """The process groups of every job_guard job, once per sample."""
        self.guard_pgids = {q.pgid for q in procs.values()
                            if q.pgid > 1 and self.guarded_by_ancestry(q, procs)}

    def held_by_job_guard(self, p: Proc, procs: dict) -> bool:
        """True if p's own command line, or that of any ancestor, is job_guard.sh,
        or p shares a process group with such a process (a pool worker, an
        xdist worker or a Blender child that left the tree: method review C2,
        2026-09-27). job_guard admitted the job on purpose: never throttled or
        swept as stale/orphan."""
        return self.guarded_by_ancestry(p, procs) or (p.pgid > 1 and p.pgid in self.guard_pgids)

    def throttleable(self, p: Proc, procs: dict | None = None) -> bool:
        if p.pid in self.self_pids or p.pid <= 1 or p.ppid == 2 or not p.args:
            return False
        if p.comm in EXEMPT_COMM or os.path.basename(p.args.split(" ", 1)[0]) == "claude":
            return False
        if EXEMPT_ARGS.search(p.args):
            return False
        if procs is not None and self.held_by_job_guard(p, procs):
            return False
        if self.cfg.match and not re.search(self.cfg.match, p.args):
            return False
        return True

    @staticmethod
    def runner_root(p: Proc, procs: dict) -> Proc | None:
        """The topmost pytest/vitest runner among p and its ancestors, or None."""
        root, seen, cur = None, set(), p
        while cur is not None and cur.pid not in seen and cur.pid > 1:
            if TEST_RUNNER.search(cur.args or ""):
                root = cur
            seen.add(cur.pid)
            cur = procs.get(cur.ppid)
        return root

    @staticmethod
    def tree(root: Proc, procs: dict) -> list[Proc]:
        """root and every process under it, root first."""
        kids: dict[int, list[Proc]] = {}
        for q in procs.values():
            kids.setdefault(q.ppid, []).append(q)
        out, todo = [], [root]
        while todo:
            q = todo.pop(0)
            out.append(q)
            todo.extend(k for k in kids.get(q.pid, []) if k.pid != q.pid)
        return out

    def pick_target(self, procs: dict, deltas: dict, busy: set) -> tuple[list[Proc], str, float] | None:
        """What to stop now: (processes, label, cpu ticks), or None.

        The heaviest throttleable process, or, when it is or descends from a
        test runner, the topmost runner's whole tree (weighed by the tree's
        ticks), all or nothing: a run with an exempt member (under job_guard,
        the claude CLI) or a member already stopped is skipped, never split."""
        units: dict[int, tuple[list[Proc], str, float]] = {}
        for p in procs.values():
            if (p.pid in busy or p.state == "T" or deltas.get(p.pid, 0) <= 0
                    or not self.throttleable(p, procs)):
                continue
            root = self.runner_root(p, procs)
            if root is None:
                units[p.pid] = ([p], "process", deltas[p.pid])
                continue
            if root.pid in units:
                continue
            members = self.tree(root, procs)
            if any(m.pid in busy or m.state == "T" or not self.throttleable(m, procs) for m in members):
                units[root.pid] = ([], "", 0)          # not splittable: never a target
                continue
            ticks = sum(deltas.get(m.pid, 0) for m in members)
            units[root.pid] = (members, f"test run of {len(members)} processes under runner pid {root.pid}",
                               ticks)
        # a target using under MIN_PCT of a core frees nothing: on 2026-09-27
        # the throttle, still above 70 % from exempt work, went on to stop
        # tmux, wineserver (hanging a Blender test 277 s) and memwatch at 0-3 %
        live = [u for u in units.values() if u[0] and self.pct(u[2]) >= self.cfg.min_pct]
        return max(live, key=lambda u: u[2]) if live else None

    def pct(self, delta_ticks: int) -> float:
        return 100.0 * delta_ticks / CLK_TCK / self.last_dt if self.last_dt > 0 else 0.0

    def send(self, pid: int, sig: int) -> bool:
        try:
            self.signal_fn(pid, sig)
            return True
        except ProcessLookupError:
            return False
        except PermissionError:
            self.log_fn(f"SKIP pid {pid}: no permission for signal {sig}")
            return False

    @staticmethod
    def short(p: Proc) -> str:
        return (p.args or p.comm)[:120]

    # --- one sample
    def step(self) -> None:
        t = self.clock()
        cpu = self.sampler()
        procs = self.procs_reader()
        self.last_dt = (t - self.last_t) if self.last_t is not None else self.cfg.interval
        self.last_t = t
        deltas = {}
        new_ticks = {}
        for p in procs.values():
            key = (p.pid, p.start)
            new_ticks[key] = p.ticks
            deltas[p.pid] = p.ticks - self.prev_ticks.get(key, p.ticks)
        self.prev_ticks = new_ticks
        self.last_cpu = cpu
        self.note_guard_groups(procs)

        # processes that went away (killed by someone else, exited)
        for s in list(self.stopped):
            p = procs.get(s.pid)
            if p is None or p.start != s.start:
                self.stopped.remove(s)
                for pid, _start in s.members:
                    self.send(pid, signal.SIGCONT)
                self.log_fn(f"GONE pid {s.pid} target {s.label} ({s.cmd}): exited while stopped after "
                            f"{t - s.since:.0f} s; dropped from the stopped list")
        for pid, (start, deadline, cmd) in list(self.pending.items()):
            p = procs.get(pid)
            if p is None or p.start != start:
                del self.pending[pid]
            elif t >= deadline:
                self.send(pid, signal.SIGKILL)
                del self.pending[pid]
                self.log_fn(f"KILL pid {pid} ({cmd}): still alive {self.cfg.kill_grace:g} s after SIGTERM")
                if pid in self.mem_pending:
                    self.mem_log(f"KILL pid {pid} ({cmd}): still alive {self.cfg.kill_grace:g} s after SIGTERM")
        self.mem_pending &= set(self.pending)
        if self.cfg.mem_kill_gib > 0:
            self.mem_check(procs, deltas, t)

        if cpu is not None:
            self.throttle(cpu, procs, deltas, t)
        if self.last_sweep is None or t - self.last_sweep >= self.cfg.sweep:
            self.last_sweep = t
            self.sweep(procs, deltas, t)

    def throttle(self, cpu: float, procs: dict, deltas: dict, t: float) -> None:
        c = self.cfg
        self.high_run = self.high_run + 1 if cpu > c.high else 0
        if not self.throttling and self.high_run >= c.high_samples:
            self.throttling = True
        if self.throttling:
            if cpu < c.stop_until:
                self.throttling = False
                self.high_run = 0
            else:
                busy = ({s.pid for s in self.stopped} | {m[0] for s in self.stopped for m in s.members}
                        | set(self.pending))
                target = self.pick_target(procs, deltas, busy)
                if target:
                    members, label, ticks = target
                    p = members[0]
                    pc = self.pct(ticks)
                    if self.send(p.pid, signal.SIGSTOP):
                        rest = [[m.pid, m.start] for m in members[1:] if self.send(m.pid, signal.SIGSTOP)]
                        self.stopped.append(Stopped(p.pid, p.start, self.short(p), t, round(pc, 1), rest, label))
                        why = (f"> {c.high:g}% for {self.high_run} samples" if self.high_run >= c.high_samples
                               else f"still >= {c.stop_until:g}% while throttling")
                        self.log_fn(f"STOP pid {p.pid} target {label} cpu {pc:.0f}% ({self.short(p)}): "
                                    f"machine {cpu:.0f}% {why}; heaviest throttleable")
                        self.notify(p.pid, STOP_NOTICE.format(cpu=cpu))
        if cpu < c.resume_below:
            if self.low_since is None:
                self.low_since = t
        else:
            self.low_since = None
        if (self.stopped and not self.throttling and self.low_since is not None
                and t - self.low_since >= c.resume_after):
            s = self.stopped.pop(0)
            if self.cont(s):
                self.log_fn(f"CONT pid {s.pid} target {s.label} cpu {s.cpu:.0f}% when stopped ({s.cmd}): "
                            f"machine under {c.resume_below:g}% for {t - self.low_since:.0f} s; oldest stopped; "
                            f"paused {t - s.since:.0f} s")
                self.notify(s.pid, f"cpu_watchdog: resumed this job after {t - s.since:.0f} s paused.")
            self.low_since = t

    def sweep(self, procs: dict, deltas: dict, t: float) -> None:
        c = self.cfg
        children: dict[int, int] = {}
        for p in procs.values():
            children[p.ppid] = children.get(p.ppid, 0) + 1
        live_keys = set()
        for p in procs.values():
            if p.pid in self.pending or p.pid in self.self_pids:
                continue
            if self.held_by_job_guard(p, procs):
                continue
            reason = None
            if p.comm == "rtk" and p.age > c.rtk_max and not children.get(p.pid):
                reason = f"rtk older than {c.rtk_max:g} s ({p.age:.0f} s) with no live child"
            elif p.ppid == 1 and STALE_ORPHAN.search(p.args or ""):
                key = (p.pid, p.start)
                live_keys.add(key)
                first = self.orphan_seen.setdefault(key, t)
                if t - first >= c.orphan_max:
                    reason = f"orphaned (ppid 1) for {t - first:.0f} s"
            if reason:
                self.terminate(p, deltas, t, reason)
        self.orphan_seen = {k: v for k, v in self.orphan_seen.items() if k in live_keys}

    def mem_log(self, line: str) -> None:
        if self.mem_log_fn is not None:
            self.mem_log_fn(line)

    def studio(self, p: Proc, procs: dict) -> bool:
        """p is, or descends from, the studio dev server."""
        port = os.environ.get("ES_STUDIO_PORT", "")
        seen, cur = set(), p
        while cur is not None and cur.pid not in seen and cur.pid > 1:
            a = cur.args or ""
            if STUDIO.search(a) or (port and re.search(rf"(^|\D){re.escape(port)}(\D|$)", a)):
                return True
            seen.add(cur.pid)
            cur = procs.get(cur.ppid)
        return False

    def mem_check(self, procs: dict, deltas: dict, t: float) -> None:
        limit_kib = self.cfg.mem_kill_gib * 1048576
        for p in procs.values():
            if p.anon_kib <= limit_kib or p.pid in self.pending or p.pid in self.self_pids or p.pid <= 1:
                continue
            argv0 = os.path.basename((p.args or "").split(" ", 1)[0])
            if not (MEM_KIND.match(p.comm) or MEM_KIND.match(argv0)):
                continue
            if (p.comm in EXEMPT_COMM or argv0 == "claude" or EXEMPT_ARGS.search(p.args or "")
                    or self.held_by_job_guard(p, procs) or self.studio(p, procs)):
                continue
            gib = p.anon_kib / 1048576
            reason = (f"memory hog outside a job_guard slot: anon {gib:.1f} GiB > {self.cfg.mem_kill_gib:g} GiB "
                      f"(run it as `job_guard.sh <lane> --mem <GiB> -- ...`)")
            self.terminate(p, deltas, t, reason, kind="memory")
            if p.pid in self.pending:
                self.mem_pending.add(p.pid)
                self.mem_log(f"TERM pid {p.pid} anon {gib:.1f} GiB ({(p.args or p.comm)[:400]}): {reason}")

    def terminate(self, p: Proc, deltas: dict, t: float, reason: str, kind: str = "stale") -> None:
        if not self.send(p.pid, signal.SIGTERM):
            return
        was_stopped = [s for s in self.stopped if s.pid == p.pid]
        if was_stopped or p.state == "T":
            self.send(p.pid, signal.SIGCONT)   # a stopped process only acts on SIGTERM once continued
            self.stopped = [s for s in self.stopped if s.pid != p.pid]
        self.pending[p.pid] = (p.start, t + self.cfg.kill_grace, self.short(p))
        self.log_fn(f"TERM pid {p.pid} cpu {self.pct(deltas.get(p.pid, 0)):.0f}% ({self.short(p)}): {kind}, {reason}")

    def cont(self, s: Stopped) -> bool:
        """Continue a target: its members first, so a runner never wakes to stopped workers."""
        for pid, _start in s.members:
            self.send(pid, signal.SIGCONT)
        return self.send(s.pid, signal.SIGCONT)

    def release_all(self, why: str) -> None:
        for s in self.stopped:
            if self.cont(s):
                self.log_fn(f"CONT pid {s.pid} ({s.cmd}): {why}")
        self.stopped = []

    def state(self) -> dict:
        return {
            "pid": os.getpid(), "updated": time.time(), "cpu": self.last_cpu,
            "throttling": self.throttling, "highRun": self.high_run,
            "stopped": [s.__dict__ for s in self.stopped],
            "pendingKill": [{"pid": k, "start": v[0], "cmd": v[2]} for k, v in self.pending.items()],
            "orphansTracked": len(self.orphan_seen),
        }

    def adopt(self, state: dict, procs: dict) -> None:
        for s in state.get("stopped", []):
            p = procs.get(s["pid"])
            if p is not None and p.start == s["start"] and p.state == "T":
                self.stopped.append(Stopped(**{k: v for k, v in s.items() if k in Stopped.__dataclass_fields__}))
                self.log_fn(f"ADOPT pid {s['pid']} ({s['cmd']}): left stopped by the previous watchdog")


# ---------------------------------------------------------------- daemon plumbing

def paths() -> tuple[str, str, str, str]:
    d = os.environ.get("ES_WD_DIR", "/tmp/es-jobs")
    return d, f"{d}/watchdog.lock", f"{d}/watchdog.log", f"{d}/watchdog.state.json"


def make_logger(log_path: str):
    def log(msg: str) -> None:
        try:
            if os.path.getsize(log_path) > 5_000_000:
                os.replace(log_path, log_path + ".1")
        except OSError:
            pass
        with open(log_path, "a") as f:
            f.write(f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {msg}\n")
    return log


def ancestors(pid: int) -> set[int]:
    out = {pid}
    try:
        while pid > 1:
            with open(f"/proc/{pid}/stat") as f:
                raw = f.read()
            pid = int(raw[raw.rindex(")") + 2:].split()[1])
            out.add(pid)
    except OSError:
        pass
    return out


def status() -> int:
    d, lock_path, log_path, state_path = paths()
    running = False
    try:
        with open(lock_path, "a") as lf:
            try:
                fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)
                fcntl.flock(lf, fcntl.LOCK_UN)
            except OSError:
                running = True
    except OSError:
        pass
    try:
        with open(state_path) as f:
            st = json.load(f)
    except (OSError, ValueError):
        st = {}
    age = time.time() - st["updated"] if st.get("updated") else None
    cpu = st.get("cpu")
    nice_val = None
    if running and st.get("pid"):
        try:
            nice_val = os.getpriority(os.PRIO_PROCESS, int(st["pid"]))
        except OSError:
            pass
    print(f"watchdog: {'running' if running else 'NOT running'}"
          + (f", pid {st.get('pid')}, last sample {age:.0f} s ago" if age is not None else "")
          + (f", machine CPU {cpu:.0f}%" if cpu is not None else "")
          + (f", nice {nice_val}" if nice_val is not None else "")
          + (", THROTTLING" if st.get("throttling") else ""))
    stopped = st.get("stopped", [])
    print(f"stopped: {len(stopped)}")
    for s in stopped:
        print(f"  pid {s['pid']} stopped {time.time() - s['since']:.0f} s ago at {s['cpu']:.0f}% cpu: {s['cmd']}"
              if s['since'] > 1e9 else f"  pid {s['pid']} at {s['cpu']:.0f}% cpu: {s['cmd']}")
    for p in st.get("pendingKill", []):
        print(f"  pending SIGKILL: pid {p['pid']} {p['cmd']}")
    print(f"log: {log_path}")
    return 0


def main() -> int:
    if "--status" in sys.argv[1:]:
        return status()
    d, lock_path, log_path, state_path = paths()
    os.makedirs(d, exist_ok=True)
    try:
        os.chmod(d, 0o1777)
    except OSError:
        pass
    log = make_logger(log_path)
    lf = open(lock_path, "a")
    try:
        fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("cpu_watchdog: already running", file=sys.stderr)
        return 0
    cfg = Config.from_env()
    fake = os.environ.get("ES_WD_FAKE_CLOCK") == "1"
    tick = {"t": 0.0}

    def clock() -> float:
        if fake:
            tick["t"] += cfg.interval
            return tick["t"]
        return time.time()

    sampler = command_sampler(os.environ["ES_WD_SAMPLER"]) if os.environ.get("ES_WD_SAMPLER") else ProcStatSampler()
    reader = command_procs(os.environ["ES_WD_PROCS"]) if os.environ.get("ES_WD_PROCS") else read_procs
    if os.environ.get("ES_WD_DRY_RUN") == "1":
        def signal_fn(pid: int, sig: int) -> None:
            log(f"DRYRUN signal {signal.Signals(sig).name} -> pid {pid}")
    else:
        signal_fn = real_signal
    mem_dir = os.environ.get("ES_WD_MEM_LOG_DIR") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", ".reports", "job-guard")
    try:
        os.makedirs(mem_dir, exist_ok=True)
        mem_log = make_logger(os.path.join(mem_dir, "mem-watchdog.log"))
    except OSError:
        mem_log = None
    wd = Watchdog(cfg, sampler, reader, signal_fn, clock, log, self_pids=ancestors(os.getpid()),
                  notify_fn=None if os.environ.get("ES_WD_DRY_RUN") == "1" else real_notify,
                  mem_log_fn=mem_log)
    try:
        with open(state_path) as f:
            wd.adopt(json.load(f), reader())
    except (OSError, ValueError):
        pass
    stop = {"now": False}

    def on_term(signum, _frame) -> None:
        stop["now"] = True
    signal.signal(signal.SIGTERM, on_term)
    signal.signal(signal.SIGINT, on_term)
    log(f"START pid {os.getpid()}: every {cfg.interval:g} s; stop above {cfg.high:g}% x{cfg.high_samples} "
        f"until under {cfg.stop_until:g}%; continue under {cfg.resume_below:g}% for {cfg.resume_after:g} s")
    sleep_s = env_num("ES_WD_SLEEP", cfg.interval)
    max_samples = int(env_num("ES_WD_MAX_SAMPLES", 0))
    n = 0
    while not stop["now"]:
        try:
            wd.step()
        except Exception as e:  # a bad sample never kills the daemon
            log(f"ERROR {type(e).__name__}: {e}")
        tmp = state_path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(wd.state(), f)
        os.replace(tmp, state_path)
        n += 1
        if max_samples and n >= max_samples:
            break
        if sleep_s > 0:
            time.sleep(sleep_s)
    wd.release_all("watchdog exiting")
    with open(state_path, "w") as f:
        json.dump(wd.state(), f)
    log(f"EXIT pid {os.getpid()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

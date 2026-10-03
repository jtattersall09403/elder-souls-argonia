"""lane_wait.py (decision 0118 rule 8): a lead's foreground wait."""
import os
import subprocess
import sys
import time
from pathlib import Path

SCRIPT = Path(__file__).parent / "lane_wait.py"


def run(*args):
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, timeout=30)


def test_all_present_is_all_done(tmp_path):
    a, b = tmp_path / "a.md", tmp_path / "b.md"
    for f in (a, b):
        f.write_text("x")
        old = time.time() - 60
        os.utime(f, (old, old))
    r = run("--files", str(a), str(b), "--timeout", "5", "--poll", "1", "--any-mtime")
    assert r.returncode == 0
    assert r.stdout.splitlines() == [f"done {a}", f"done {b}", "all done"]


def test_missing_file_times_out(tmp_path):
    a, b = tmp_path / "a.md", tmp_path / "missing.md"
    a.write_text("x")
    old = time.time() - 60
    os.utime(a, (old, old))
    r = run("--files", str(a), str(b), "--timeout", "1", "--poll", "1", "--any-mtime")
    assert r.returncode == 0
    assert r.stdout.splitlines() == [f"done {a}", f"waiting {b}", "timeout: 1 of 2 done"]


def test_stale_file_ignored_fresh_file_done(tmp_path):
    a = tmp_path / "a.md"
    a.write_text("x")
    old = time.time() - 60
    os.utime(a, (old, old))
    r = run("--files", str(a), "--timeout", "1", "--poll", "1")
    assert r.stdout.splitlines() == [f"waiting {a}", "timeout: 0 of 1 done"]
    # a file older than call minus timeout is waiting; written 100 s before a 540 s call it is done at once
    b = tmp_path / "b.md"
    b.write_text("x")
    t = time.time() - 100
    os.utime(b, (t, t))
    start = time.time()
    r = run("--files", str(b), "--timeout", "540", "--poll", "5")
    assert r.stdout.splitlines() == [f"done {b}", "all done"]
    assert time.time() - start < 5
    r = run("--files", str(a), "--timeout", "1", "--poll", "1", "--since", str(old - 10))
    assert r.stdout.splitlines() == [f"done {a}", "all done"]

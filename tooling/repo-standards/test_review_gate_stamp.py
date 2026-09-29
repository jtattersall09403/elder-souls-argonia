"""The review stamp survives parallel preflights (16k S9) and the batch review
skips the design briefs (method review r3 finding D)."""
import json
import multiprocessing as mp
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import review_gate as rg  # noqa: E402

WRITERS, WRITES = 8, 25


def _writer(stamp_path, i):
    rg.STAMP = stamp_path
    for j in range(WRITES):
        rg.write_stamp(f"k{i}-{j}", f"h{i}-{j}", "ok", 0, head="h", paths=[f"lane{i}/path{j}"])


def test_concurrent_writers_keep_every_stamp(tmp_path):
    stamp = str(tmp_path / "review-stamp.json")
    # spawn, not fork: a forked child inherits every audit hook the test process
    # installed (sys.addaudithook cannot be undone); chain_stages.run leaves one
    # whose audit dir is gone, so a forked child's first open() raised
    # FileNotFoundError when test_chain_stages ran earlier in the same worker.
    ctx = mp.get_context("spawn")
    procs = [ctx.Process(target=_writer, args=(stamp, i)) for i in range(WRITERS)]
    for p in procs:
        p.start()
    for p in procs:
        p.join()
        assert p.exitcode == 0
    stamps = json.load(open(stamp))["stamps"]
    want = {f"k{i}-{j}" for i in range(WRITERS) for j in range(WRITES)}
    lost = want - set(stamps)
    assert not lost, f"{len(lost)} of {len(want)} stamps lost to a read-modify-write race"


def test_design_briefs_are_excluded_from_the_review_diff(tmp_path, monkeypatch):
    import subprocess
    run = lambda *a: subprocess.run(a, cwd=tmp_path, check=True, capture_output=True)  # noqa: E731
    run("git", "init", "-q")
    run("git", "config", "user.email", "t@t"); run("git", "config", "user.name", "t")
    bp = tmp_path / "world" / "sources" / "blueprints"
    bp.mkdir(parents=True)
    (bp / "x.design.md").write_text("brief v1\n")
    (tmp_path / "tooling").mkdir()
    (tmp_path / "tooling" / "code.py").write_text("a = 1\n")
    run("git", "add", "-A"); run("git", "commit", "-qm", "base")
    (bp / "x.design.md").write_text("brief v2 DESIGNPROSE\n")
    (tmp_path / "tooling" / "code.py").write_text("a = 2  # CODECHANGE\n")
    (bp / "new.design.md").write_text("a new brief UNTRACKEDPROSE\n")
    (tmp_path / "tooling" / "new.py").write_text("b = 1  # NEWCODE\n")
    monkeypatch.setattr(rg, "ROOT", str(tmp_path))
    for paths in (None, ["world", "tooling/code.py", "tooling/new.py"]):
        diff = rg.current_diff(paths)
        assert "CODECHANGE" in diff and "NEWCODE" in diff
        assert "DESIGNPROSE" not in diff and "UNTRACKEDPROSE" not in diff

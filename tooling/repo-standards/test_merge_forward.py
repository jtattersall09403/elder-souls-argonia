"""merge_forward.py --check over a tiny temp repo (dev ahead, then merged)."""
import subprocess
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import merge_forward  # noqa: E402


def g(cwd, *a):
    subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True)


def test_check_ahead_then_merged(tmp_path):
    g(tmp_path, "init", "-q", "-b", "dev")
    g(tmp_path, "config", "user.email", "t@t")
    g(tmp_path, "config", "user.name", "t")
    (tmp_path / "a").write_text("1")
    g(tmp_path, "add", "a")
    g(tmp_path, "commit", "-qm", "one")
    g(tmp_path, "branch", "webgpu")
    assert merge_forward.check(str(tmp_path))
    (tmp_path / "a").write_text("2")
    g(tmp_path, "commit", "-qam", "two")
    assert not merge_forward.check(str(tmp_path))
    g(tmp_path, "branch", "-f", "webgpu", "dev")
    assert merge_forward.check(str(tmp_path))

"""commit_place: a pathspec commit of a place's manifest files, in a temp repo only."""
import json
import subprocess

import pytest

from worldgen import commit_place as cp

PID = "place.test-zone.alpha"


def _git(repo, *a):
    return subprocess.run(["git", *a], cwd=repo, check=True, capture_output=True, text=True).stdout


@pytest.fixture
def repo(tmp_path):
    _git(tmp_path, "init", "-q")
    _git(tmp_path, "config", "user.email", "t@t")
    _git(tmp_path, "config", "user.name", "t")
    (tmp_path / "base.txt").write_text("base\n")
    _git(tmp_path, "add", "base.txt")
    _git(tmp_path, "commit", "-qm", "base")
    return tmp_path


def _manifest(repo, files):
    m = repo / cp.REPORTS / PID / "manifest.json"
    m.parent.mkdir(parents=True, exist_ok=True)
    m.write_text(json.dumps({"schemaVersion": 1, "placeId": PID, "writtenBy": "export_settlement_bundle",
                             "files": sorted(files)}))


def _write(repo, rel, text="x\n"):
    p = repo / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)


OWN = ["apps/world-studio/public/province/settlements/place.test-zone.alpha.json",
       "world/sources/blueprints/alpha.layout.json"]


def test_commits_only_the_manifest_files(repo):
    for rel in OWN:
        _write(repo, rel)
    _write(repo, "other-lane.py", "half-made\n")                  # another lane's work
    _git(repo, "add", "other-lane.py")                             # even staged, it stays out
    _manifest(repo, OWN)
    assert cp.main(["--place", PID, "--repo", str(repo)]) == 0
    committed = _git(repo, "show", "--name-only", "--format=", "HEAD").split()
    assert sorted(committed) == sorted(OWN)
    assert "other-lane.py" in _git(repo, "diff", "--cached", "--name-only")


def test_dry_run_commits_nothing(repo, capsys):
    for rel in OWN:
        _write(repo, rel)
    _manifest(repo, OWN)
    head = _git(repo, "rev-parse", "HEAD")
    assert cp.main(["--place", PID, "--repo", str(repo), "--dry-run"]) == 0
    assert _git(repo, "rev-parse", "HEAD") == head
    assert "would commit 2 changed" in capsys.readouterr().out


def test_refuses_a_shared_file_in_the_manifest(repo, capsys):
    shared = "world/sources/catalogue/places-test-zone.json"
    for rel in OWN + [shared]:
        _write(repo, rel)
    _manifest(repo, OWN + [shared])
    head = _git(repo, "rev-parse", "HEAD")
    assert cp.main(["--place", PID, "--repo", str(repo)]) == 2
    assert _git(repo, "rev-parse", "HEAD") == head
    assert "a shared file" in capsys.readouterr().err


@pytest.mark.parametrize("path", [
    "world/sources/placement/yard-sets/01-road-station.json",
    "apps/world-studio/public/kits/settlement-mud-v1.kit.json",
    ".claude/skills/place-build/references/lessons.md",
    ".claude/skills/place-build/references/creative-register.md",
    "world/sources/placement/accepted-places.json",
    "apps/world-studio/public/province/settlements/index.json",
    "world/sources/placement/signature-claims.json",
])
def test_shared_files(path):
    assert cp.is_shared(path)


def test_refuses_a_path_not_in_the_manifest(repo, capsys):
    for rel in OWN:
        _write(repo, rel)
    _write(repo, "stray.json")
    _manifest(repo, OWN)
    assert cp.main(["--place", PID, "--repo", str(repo), OWN[0], "stray.json"]) == 2
    assert "stray.json: not in" in capsys.readouterr().err


def test_nothing_changed_is_not_an_error(repo, capsys):
    _manifest(repo, [])
    assert cp.main(["--place", PID, "--repo", str(repo)]) == 0
    assert "nothing to commit" in capsys.readouterr().out


def test_the_manifest_lists_the_site_dossier_and_the_promise_ledger(repo):
    """SKILL § A place's files: the dossier (<slug>.json/.md, whichever exist)
    and the promise ledger (<place-id>.json) are the place's own files
    (REQUEST row 16, Greenspring)."""
    from worldgen import settlement_bundles as sb
    own = ["world/sources/sites/dossiers/alpha.json", "world/sources/sites/dossiers/alpha.md",
           f"world/sources/placement/promises/{PID}.json"]
    for rel in own + [f"apps/world-studio/public/province/settlements/{PID}.json"]:
        _write(repo, rel)
    files = sb.place_manifest(PID, {}, repo)["files"]
    assert set(own) <= set(files)
    assert "world/sources/sites/dossiers/beta.json" not in files
    _manifest(repo, files)
    chosen, refusals = cp.plan(PID, [], repo)
    assert refusals == [] and set(own) <= set(chosen)

"""commit_index_entry.py on a throwaway repo: only the named place's rows commit."""
import importlib.util
import json
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "commit_index_entry.py"
spec = importlib.util.spec_from_file_location("commit_index_entry", SCRIPT)
cie = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cie)


def _git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True,
                          text=True).stdout


def _write(repo, path, doc):
    p = repo / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(cie._dumps(doc))


def _docs(sha_a, sha_b, ids=("a", "b")):
    index = {"schemaVersion": 1, "routes": [],
             "places": [{"id": f"place.{i}", "bundle": f"settlements/place.{i}.json",
                         "sha256": {"a": sha_a, "b": sha_b}.get(i, "c")} for i in ids]}
    ground = {"schemaVersion": 1,
              "settlements": [{"id": f"place.{i}", "groundOverlays": {"sha": {"a": sha_a, "b": sha_b}.get(i, "c")}}
                              for i in ids]}
    return index, ground


def _repo(tmp_path):
    repo = tmp_path / "r"
    repo.mkdir()
    _git(repo, "init", "-q")
    _git(repo, "config", "user.email", "t@t")
    _git(repo, "config", "user.name", "t")
    index, ground = _docs("a0", "b0")
    _write(repo, cie.INDEX_PATH, index)
    _write(repo, cie.GROUND_PATH, ground)
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "base")
    return repo


def _head(repo, path):
    return json.loads(_git(repo, "show", f"HEAD:{path}"))


def test_only_the_named_place_rows_commit_and_the_rest_of_the_tree_stays(tmp_path):
    repo = _repo(tmp_path)
    index, ground = _docs("a1", "b-half-reverted", ids=("a", "b", "c"))   # a published, b stale, c new
    _write(repo, cie.INDEX_PATH, index)
    _write(repo, cie.GROUND_PATH, ground)
    (repo / "extra.txt").write_text("x")
    cie.commit_entry(repo, "place.a", "publish a", ["extra.txt"])
    head_index, head_ground = _head(repo, cie.INDEX_PATH), _head(repo, cie.GROUND_PATH)
    assert [(r["id"], r["sha256"]) for r in head_index["places"]] == [("place.a", "a1"), ("place.b", "b0")]
    assert [(r["id"], r["groundOverlays"]["sha"]) for r in head_ground["settlements"]] == [
        ("place.a", "a1"), ("place.b", "b0")]
    assert _git(repo, "show", "--stat", "--format=", "HEAD").count("|") == 3     # two files + extra
    # the working tree still holds the other lanes' rows, and the real index shows no reverse change
    assert json.loads((repo / cie.INDEX_PATH).read_bytes()) == index
    assert _git(repo, "diff", "--cached", "--name-only").strip() == ""
    # a new place inserts in order; a place the working tree dropped is removed
    cie.commit_entry(repo, "place.c", "publish c")
    assert [r["id"] for r in _head(repo, cie.INDEX_PATH)["places"]] == ["place.a", "place.b", "place.c"]
    _write(repo, cie.INDEX_PATH, _docs("a1", "b0", ids=("b", "c"))[0])
    _write(repo, cie.GROUND_PATH, _docs("a1", "b0", ids=("b", "c"))[1])
    cie.commit_entry(repo, "place.a", "retire a")
    assert [r["id"] for r in _head(repo, cie.INDEX_PATH)["places"]] == ["place.b", "place.c"]

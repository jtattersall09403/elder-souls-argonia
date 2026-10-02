"""walk_judge path listing (walk10 H-judge: fire sheet paths were listed with a doubled prefix)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import walk_judge  # noqa: E402


def _listed(brief: Path) -> list[str]:
    text = brief.read_text().split("## Images\n", 1)[1].split("\n\n", 1)[0]
    return [ln[2:] for ln in text.splitlines()]


def test_paths_listed_once_from_relative_report(tmp_path, monkeypatch):
    from PIL import Image
    rep = tmp_path / "rep"
    rep.mkdir()
    (rep / "summary.json").write_text(json.dumps({"placeId": "place.x", "passes": []}))
    (rep / "t12-overview-nw.jpg").write_bytes(b"")
    for i in range(3):
        Image.new("RGB", (100, 60)).save(rep / f"t12-fire0-f{i}.jpg")
    monkeypatch.chdir(tmp_path)
    written = walk_judge.briefs(Path("rep"))  # relative, as the README runs it
    for b in written:
        for p in _listed(b):
            assert Path(p).is_absolute() and Path(p).exists(), p  # outside the repo: absolute, joined once
            assert p.count("/rep/") == 1, p
    fires = _listed(rep / "judge/fires-1.md")
    assert fires == [str(rep / "judge/sheets/t12-fire0-series.jpg")]


def test_paths_under_repo_are_repo_relative(tmp_path, monkeypatch):
    monkeypatch.setattr(walk_judge, "REPO", tmp_path)
    assert walk_judge.shown(tmp_path / "a/rep", "judge/sheets/s.jpg") == "a/rep/judge/sheets/s.jpg"
    monkeypatch.chdir(tmp_path)
    assert walk_judge.shown(Path("a/rep"), "x.jpg") == "a/rep/x.jpg"

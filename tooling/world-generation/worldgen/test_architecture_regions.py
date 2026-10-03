"""Architecture rows carry grounded region classes (architecture-regions.json)."""
import json
from pathlib import Path

from worldgen import architecture_regions as ar

RULES = {"rules": [{"id": "argonian", "match": {"culture": "argonian"},
                    "regionClasses": ["mangrove forest", "tidal delta"], "source": "dossier x"}],
         "unsourced": [{"id": "no-culture", "match": {"culture": []}, "reason": "r"}]}


def _assets(tmp_path: Path, rows: list[dict]) -> Path:
    (tmp_path / "architecture-regions.json").write_text(json.dumps(RULES))
    (tmp_path / "registry-x.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
    return tmp_path


def _row(i, **kw):
    return {"id": f"x:{i}", "pool": "x", "path": f"meshes/{i}.nif", "category": "architecture", **kw}


def test_apply_tags_and_excuses(tmp_path):
    assets = _assets(tmp_path, [_row("hut", cultures=["argonian"]), _row("shed"),
                                {**_row("tree"), "category": "tree"}])
    counts = ar.apply(assets, RULES)
    assert dict(counts) == {"tagged": 1, "empty": 1}
    assert ar.errors(assets, RULES) == []
    rows = [json.loads(l) for l in (assets / "registry-x.jsonl").read_text().splitlines()]
    assert rows[0]["regionClasses"] == ["mangrove forest", "tidal delta"]
    assert rows[1]["regionClassesSource"] == "unsourced:no-culture"
    assert "regionClasses" not in rows[2]


def test_untagged_or_unexcused_rows_fail(tmp_path):
    assets = _assets(tmp_path, [_row("a"),
                                _row("b", regionClasses=[], regionClassesSource="unsourced:gone"),
                                _row("c", regionClasses=["swampland"], regionClassesSource="s")])
    errs = ar.errors(assets, RULES)
    assert len(errs) == 3, errs


def test_the_real_registry_is_whole():
    assert ar.errors() == []

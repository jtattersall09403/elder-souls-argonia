import json

from . import check_credits


def _setup(tmp_path, monkeypatch, *, credits_text, pools, rows=(), kits=()):
    readme = tmp_path / "README.md"
    readme.write_text("# Repo\n\n## Credits and third-party sources\n\n" + credits_text)
    registry = tmp_path / "registry"
    registry.mkdir()
    (registry / "registry-summary.json").write_text(json.dumps({"pools": pools}))
    for pool, ids in rows:
        (registry / f"registry-{pool}.jsonl").write_text(
            "".join(json.dumps({"id": i}) + "\n" for i in ids))
    kit_dir = tmp_path / "kits"
    kit_dir.mkdir()
    for kit in kits:
        (kit_dir / f"{kit['id']}.json").write_text(json.dumps(kit))
    monkeypatch.setattr(check_credits, "README", readme)
    monkeypatch.setattr(check_credits, "REGISTRY_DIR", registry)
    monkeypatch.setattr(check_credits, "KITS", kit_dir)


def test_passes_when_every_pool_is_credited(tmp_path, monkeypatch):
    _setup(
        tmp_path, monkeypatch,
        credits_text="- **Tropical Skyrim** (Nexus 33017, Soolie) — textures.\n",
        pools={"tropical": {"label": "Tropical Skyrim", "credit": "Tropical Skyrim",
                            "registered": 869}},
        rows=[("tropical", ["tropical:plants/tropical/manfern"])],
        kits=[{"id": "k", "assets": [{"asset": "tropical:plants/tropical/manfern"}]}],
    )
    assert check_credits.check() == []


def test_fails_when_a_shipped_pool_is_missing_from_the_readme(tmp_path, monkeypatch):
    _setup(
        tmp_path, monkeypatch,
        credits_text="- **ecctrl** — controller.\n",
        pools={"xanmeer": {"label": "Argonian Xanmeer Tileset",
                           "credit": "Argonian Xanmeer Tileset", "registered": 85}},
    )
    problems = check_credits.check()
    assert len(problems) == 1
    assert "Argonian Xanmeer Tileset" in problems[0]


def test_fails_when_a_kit_ships_an_asset_the_registry_never_saw(tmp_path, monkeypatch):
    _setup(
        tmp_path, monkeypatch,
        credits_text="- **Tropical Skyrim** — textures.\n",
        pools={"tropical": {"label": "Tropical Skyrim", "credit": "Tropical Skyrim",
                            "registered": 1}},
        rows=[("tropical", ["tropical:known"])],
        kits=[{"id": "k", "assets": [{"asset": "tropical:mystery"}]}],
    )
    problems = check_credits.check()
    assert any("tropical:mystery" in p and "uncredited" in p for p in problems)


def test_fails_when_a_new_pool_has_no_credit_marker(tmp_path, monkeypatch):
    _setup(
        tmp_path, monkeypatch,
        credits_text="- something\n",
        pools={"brandnew": {"label": "A New Mod", "credit": "A New Mod",
                            "registered": 12}},
    )
    assert any("credit marker" in p for p in check_credits.check())

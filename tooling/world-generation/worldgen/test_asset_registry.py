import json

from . import asset_registry
from .asset_registry import Pool, _plugin_facts, _semantic_id
from .test_esp_index import build_plugin


def test_semantic_id_strips_the_data_root_prefix_and_extension():
    pool = Pool(id="bmv", label="", source="", credit="")
    assert _semantic_id(pool, "Meshes\\Landscape\\Trees\\Palm01.nif") == (
        "bmv:landscape/trees/palm01"
    )


def test_plugin_facts_key_on_the_model_path_the_registry_joins_on(tmp_path):
    build_plugin(tmp_path)  # writes fixture.esp
    pool = Pool(
        id="fixture", label="", source="", credit="",
        plugins=[str(tmp_path / "fixture.esp")],
    )
    facts = _plugin_facts(pool, tmp_path)
    # MODL paths have no `meshes/` prefix — that is exactly the join key.
    entry = facts["landscape/grass/reed01.nif"]
    assert entry["editorIds"] == ["MarshReed01"]
    assert entry["recordTypes"] == ["STAT"]
    assert entry["sizeM"][2] == 1.991  # 140 units at 1.4224 cm each
    assert entry["originOffsetUnits"] == [-20, -20, 0]


def test_build_registers_a_pool_and_joins_plugin_and_mining_facts(tmp_path, monkeypatch):
    manifest = tmp_path / "manifest.txt"
    manifest.write_text(
        "Meshes/Landscape/Grass/Reed01.nif\n"
        "Meshes/Landscape/Grass/Reed01_lod_flat.nif\n"
        "Meshes/Architecture/Marsh/Hut01.nif\n"
        "Meshes/Sky/skyquad.nif\n"
    )
    build_plugin(tmp_path)

    placement = tmp_path / "world" / "sources" / "placement"
    placement.mkdir(parents=True)
    (placement / "fake-placement.json").write_text(json.dumps({
        "species": {
            "landscape/grass/reed01.nif": {"count": 812, "scale": {"p50": 1.6}},
            "edid:TreeSwordFern06": {"count": 40, "scale": {}},
        }
    }))
    registry_dir = tmp_path / "world" / "sources" / "assets"
    monkeypatch.setattr(asset_registry, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(asset_registry, "REGISTRY_DIR", registry_dir)
    monkeypatch.setattr(asset_registry, "POOLS", (Pool(
        id="fixture", label="Fixture", source="-", credit="-",
        manifest=str(manifest),
        plugins=[str(tmp_path / "fixture.esp")],
    ),))

    summary = asset_registry.build(tmp_path)["fixture"]
    rows = {
        r["id"]: r
        for r in (json.loads(line) for line in
                  (registry_dir / "registry-fixture.jsonl").read_text().splitlines())
    }

    # Sky meshes are engine plumbing; the LOD billboard is recorded on its hero.
    assert summary["skippedNonContent"] == {"sky": 1, "lod": 1}
    assert set(rows) == {"fixture:landscape/grass/reed01", "fixture:architecture/marsh/hut01"}
    reed = rows["fixture:landscape/grass/reed01"]
    assert reed["lodVariant"] == "meshes/landscape/grass/reed01_lod_flat.nif"
    assert reed["editorIds"] == ["MarshReed01"]
    assert reed["observedUses"] == 812
    assert reed["observedScaleP50"] == 1.6
    assert reed["category"] == "aquatic-plant"      # "reed" beats the grass folder
    assert summary["withLodVariant"] == 1 and summary["observedPlaced"] == 1

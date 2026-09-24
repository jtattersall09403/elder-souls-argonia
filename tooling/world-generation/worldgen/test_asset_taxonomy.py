from .asset_taxonomy import classify, is_scatterable


def test_directory_decides_the_category():
    assert classify("meshes/landscape/trees/beachpalm1.nif").category == "tree"
    assert classify("Meshes\\Architecture\\Jets\\wall01.nif").category == "architecture"
    assert classify("meshes/actors/raptor/raptor.nif").category == "creature"


def test_filename_refines_inside_a_flora_directory():
    assert classify("landscape/grass/vurt_reeds.nif").category == "aquatic-plant"
    assert classify("landscape/grass/WaterKelpTall01.nif").category == "aquatic-plant"
    assert classify("landscape/plants/braken.nif").category == "shrub"
    assert classify("landscape/trees/gkblillipad2.nif").category == "aquatic-plant"


def test_strong_tokens_rescue_misfiled_flora():
    # BM&V keeps its Morrowind trama roots under architecture/, and places
    # them ~2.9k times as vegetation.
    result = classify("architecture/Phitt/ashlands/tramaroot01.nif")
    assert result.category == "root"
    assert "reclassified-by-name" in result.tags
    assert result.confidence < 0.8


def test_lod_variants_are_separated_from_their_hero_mesh():
    assert classify("landscape/trees/beachpalm1_lod_flat.nif").category == "lod"
    assert classify("landscape/trees/beachpalm1.nif").category == "tree"


def test_biome_and_culture_tags_come_from_the_whole_path():
    palm = classify("landscape/trees/beachpalm1.nif")
    assert "coastal" in palm.biomes
    xanmeer = classify("meshes/architecture/xanmeer/xanmeer_wall01.nif")
    assert "argonian" in xanmeer.cultures
    snow = classify("landscape/trees/birchSnow.nif")
    assert "cold" in snow.biomes


def test_scatterable_covers_the_ground_layers_only():
    assert is_scatterable("tree") and is_scatterable("aquatic-plant")
    assert not is_scatterable("architecture") and not is_scatterable("creature")


def test_unknown_paths_are_flagged_low_confidence_rather_than_guessed():
    result = classify("meshes/xav_armorie_01.nif")
    assert result.category == "misc"
    assert result.confidence <= 0.3


def test_mushroom_architecture_is_architecture():
    """Stroti's mushroom house kit matched the `mushroom` strong token on its
    filenames and came back as `fungus` — 34 buildings, fences, doors, chairs
    and lamps counted as flora, which inflates every flora count and poisons
    any breadth check built on the category."""
    for name in ("mushroomhouse01", "mushroomfence01", "mushroomdoor01",
                 "strotimushroomchair", "mushroomlamp01"):
        result = classify(f"meshes/architecture/mushroom house/{name}.nif")
        assert result.category == "architecture", (name, result.category)
        assert "mushroom-form" in result.tags


def test_misfiled_flora_is_still_rescued_by_name():
    """The guard above must not undo the rule it guards: BM&V keeps Morrowind
    trama roots under `architecture/` and places them as vegetation."""
    assert classify("meshes/architecture/tramaroot01.nif").category == "root"
    assert classify("meshes/plants/floramushroom01.nif").category == "fungus"


def test_folder_stem_rules_split_shells_from_their_furniture():
    # 16h K12 A / M18 (planner ruling 2026-09-24): one flat folder holds the
    # hut shell and its furniture; the miner's shell rules read the category.
    hut = classify("meshes/gv_meshes/argoniannest/mudhut01.nif")
    room = classify("meshes/gv_meshes/argoniannest/mudhut01intnew.nif")
    assert (hut.category, room.category) == ("architecture", "architecture")
    assert hut.confidence == 0.7 and "folder-stem-rule" in hut.tags
    assert classify("gv_meshes/argoniannest/woventable01.nif").category == "furniture"
    assert classify("gv_meshes/argoniannest/potteryplate02.nif").category == "clutter"
    assert classify("gv_meshes/argoniannest/argonianbridge.nif").category == "misc"
    village = "here there be monsters - curse of cipactli/architecture/villages/argonian/"
    assert classify(village + "wickerchair01.nif").category == "furniture"
    assert classify(village + "wickerbasket01.nif").category == "clutter"
    assert classify(village + "bamboohut01_int.nif").category == "architecture"
    # the folder must be the mesh's own, not a file named like it
    assert classify("clutter/mudhut01.nif").category == "clutter"

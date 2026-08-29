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

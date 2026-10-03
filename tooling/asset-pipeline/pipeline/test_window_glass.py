"""Window glass read from the NIF's own shader (walk 9 lights follow-up;
nif_blocks.window_glass_shapes), never from the piece's name.

Expected answers written before the first run: the 25-item SAMPLE (12 window
glass, 13 other emitters) and the FRESH batch it had never seen (18 items).
FarmWindowInterior01 is the vanilla interior window glass (External_Emittance)
and counts as a window. The Cyrodiilic galleon's `shipwindows` is a hull's
night lamp glow (OWN_EMIT, no External_Emittance, no backlight), not a
daylight pane. The NIFs are the kit builds' staged data roots; an item whose
kit is not built on this machine is skipped.
"""
import glob
from pathlib import Path

import pytest

from . import nif_blocks as nb

KITS = Path(__file__).resolve().parents[1] / "build/kits"
FARM = "architecture/farmhouse/interior/"
SAMPLE = {
    "argonia/mudhuts/window01.nif": True,
    "argonia/mudhuts/window02.nif": True,
    "dungeons/ayleidruins/interior/arwindow01.nif": True,
    "architecture/ships/imperialship01base.nif": True,
    "architecture/farmhouse/farmhouse01.nif": True,
    "architecture/farmhouse/farmhouse02.nif": True,
    FARM + "farmintend01.nif": True,
    FARM + "farmintinnwall01.nif": True,
    FARM + "farmintlhfront01.nif": True,
    FARM + "farmintwoodend01.nif": True,
    FARM + "farmint2end01.nif": True,
    FARM + "farmintlhback01.nif": True,
    "critters/bee/beehoneycomb.nif": False,
    "giantsnailslime.nif": False,
    "plants/nirnroot01.nif": False,
    "plants/deathbell01.nif": False,
    "clutter/common/candlelanternwithcandle01.nif": False,
    "gv_meshes/argoniannest/argoniancandle01.nif": False,
    "argonia/clutter/townlantern04.nif": False,
    "argonia/blackwood/doorframe.nif": False,
    "furniture/alchemyworkbench.nif": False,
    "clutter/hagraven/hagravenhangingball01.nif": False,
    "clutter/ingredients/firesaltpile.nif": False,
    "clutter/chauruseggs/eggs.nif": False,
    "puzzle/magicstonealteration01.nif": False,
}
FRESH = {
    FARM + "farmintend02.nif": True,
    FARM + "farmintinnend03.nif": True,
    FARM + "farmintinnend06.nif": True,
    FARM + "farmintlhend02.nif": True,
    FARM + "farmintlhmid01.nif": True,
    FARM + "farmintinnwallentrance01.nif": True,
    "trees/histtree.nif": False,
    "histflower01.nif": False,
    "clutter/ingredients/sap.nif": False,
    "critters/firefly/fireflygo.nif": False,
    "actors/sfss/canoe/canoe1.nif": False,
    "lumbermill01waterwheel01.nif": False,
    "bfxoilbarrelclosedstatic01.nif": False,
    "effects/fxwaterfallbodytall.nif": False,
    "puzzle/arpuzzlepillar.nif": False,
    "shipcyrodiilicgalleon01_docked.nif": False,
    "ayleidruins/interior/arconstellationstele.nif": False,
    "landscape/plants/florahangingmoss02aaa.nif": False,
}
# The kit run after FRESH caught the bee-in-jar wings (a backlight map, no
# environment map); the rule then required both, and this second fresh batch
# (answers written before the run) passed with no further change.
FRESH_2 = {
    "critters/bee/beeinjar.nif": False,
    FARM + "farmintinnend01.nif": True,
    FARM + "farmintinnend02.nif": True,
    FARM + "farmintinnend04.nif": True,
    FARM + "farmintinnend05.nif": True,
    FARM + "farmint2end02.nif": True,
    FARM + "farmint2end03.nif": True,
    FARM + "farmintwoodend02.nif": True,
    FARM + "farmintlhend01.nif": True,
    "clutter/candles/candlehornchandelier01.nif": False,
    "clutter/candles/candlehorntable01.nif": False,
    "clutter/glazedcandles01.nif": False,
    "clutter/imperial/impcandle01.nif": False,
    "clutter/ruins/ruinsfloorcandlelampsmon.nif": False,
    "clutter/shrines/shrinebase.nif": False,
    "clutter/ingredients/spriggantaproot.nif": False,
    "clutter/ingredients/ectoplasm.nif": False,
    "clutter/dwemer/dweichorgoo01.nif": False,
    "furniture/alchemyworkstation.nif": False,
    "puzzle/magicstoneillusion01.nif": False,
    "landscape/plants/kelptallstatic01aaa.nif": False,
    "argonia/trees/greguire/swampplant08.nif": False,
    "critters/bee/beehivehusk.nif": False,
    "snt/ferry/ferryraft01.nif": False,
    "clutter/histfruit.nif": False,
}
_NIFS = glob.glob(str(KITS / "*/data-root/meshes/**/*.nif"), recursive=True)


@pytest.mark.parametrize("suffix,want", [*SAMPLE.items(), *FRESH.items(), *FRESH_2.items()])
def test_window_glass(suffix, want):
    path = next((p for p in _NIFS if p.lower().endswith(suffix)), None)
    if path is None:
        pytest.skip(f"{suffix}: kit not built here")
    assert bool(nb.window_glass_shapes(nb.parse(Path(path).read_bytes()))) is want


def test_own_emit_material_gets_its_diffuse_as_emissive_map():
    """Audit10 B1: an emitting OWN_EMIT material (the mud-hut amber window)
    ships its diffuse as the emissive map; others and Glow_Map ones are kept."""
    from .build_kit import own_emit_maps
    tex = {"index": 3, "texCoord": 0}
    gltf = {"materials": [
        {"name": "Objekt01:1.Mat.001", "pbrMetallicRoughness": {"baseColorTexture": tex}},
        {"name": "Door:0.Mat", "pbrMetallicRoughness": {"baseColorTexture": tex}},
        {"name": "Cylinder.Mat", "emissiveTexture": {"index": 7},
         "pbrMetallicRoughness": {"baseColorTexture": tex}},
    ]}
    changed = own_emit_maps(gltf, {"Objekt01:1.Mat", "Cylinder.Mat"})
    assert changed == ["Objekt01:1.Mat.001"]
    assert gltf["materials"][0]["emissiveTexture"] == tex
    assert gltf["materials"][0]["emissiveFactor"] == [1.0, 1.0, 1.0]
    assert "emissiveTexture" not in gltf["materials"][1]
    assert gltf["materials"][2]["emissiveTexture"] == {"index": 7}

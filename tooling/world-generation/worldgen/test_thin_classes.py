"""The two thin region classes realised from the water record (16f
deliverable 12).

Region 3 (tidal delta) and region 5 (deep river corridor) are thin strips on
the region raster and whole places in the hydrology record. Their dressing is
therefore ALSO applied as an overlay keyed to the record — the delta's to the
reaches and mouth bodies of its own river, the corridor's to the distance from
a band-3 reach — rather than to whichever class the paint gave a texel.

These tests check the two things that can silently go wrong: an overlay that
names an entity the graph does not carry (it would place nothing, forever),
and a corridor gate that either never fires or never refuses.
"""

import json

import pytest

from . import build_palettes as bp
from .scatter import Fields, Layer, Palette, scatter_chunk


@pytest.fixture(scope="module")
def graph() -> dict:
    if not bp.HYDRO_GRAPH.exists():
        pytest.skip("no hydrology graph in this checkout")
    return json.loads(bp.HYDRO_GRAPH.read_text())


# --- (a) the delta overlay names only entities the record carries ------------

def test_delta_overlay_entities_all_exist_in_the_graph(graph):
    known = {r["id"] for r in graph["reaches"]} | {b["id"] for b in graph["bodies"]}
    overlay = bp.delta_overlay()
    assert overlay, "the delta overlay authored no layers"
    for layer in overlay:
        ids = layer["water_entities"]
        assert ids, layer["species"]
        unknown = [i for i in ids if i not in known]
        assert not unknown, f"{layer['species']}: not in the graph: {unknown}"


def test_delta_overlay_is_the_river_and_its_mouth_bodies(graph):
    river = next(r for r in graph["rivers"] if r["id"] == bp.DELTA_RIVER_ID)
    ids = bp.delta_entities()
    assert set(river["reaches"]) <= set(ids)
    bodies = {b["id"]: b for b in graph["bodies"]}
    extra = [i for i in ids if i not in set(river["reaches"])]
    for body_id in extra:
        assert bodies[body_id]["kind"] in bp.DELTA_BODY_KINDS


def test_delta_overlay_reaches_every_land_class():
    """The point of the overlay: the region paint no longer decides it."""
    for layer in bp.delta_overlay():
        assert set(layer["region_classes"]) == set(bp.LAND_REGION_CLASSES)


# --- (b) the corridor gate fires and refuses ---------------------------------

def _corridor_layer() -> Layer:
    overlay = bp.corridor_overlay()
    assert overlay, "the corridor overlay authored no layers"
    entry = dict(overlay[0])
    for key in Palette.ANNOTATION_KEYS:
        entry.pop(key, None)
    for key in ("region_classes", "land_cover", "land_cover_not",
                "water_depth_m", "scale_range", "altitude_m", "shore_m",
                "glade_band", "coast_m", "corridor_m", "cliff_m",
                "sink_jitter", "water_kinds", "season_kinds",
                "water_entities"):
        if key in entry:
            entry[key] = tuple(entry[key])
    return Layer(**entry)


def _flat_fields(corridor_m: float, region: int) -> Fields:
    """Shallow slack water on gentle ground — what region 5's waterline
    gallery stands in — with only the corridor distance changing."""
    return Fields(
        height=lambda x, z: 4.0,
        water_depth=lambda x, z: 0.4,
        slope=lambda x, z: 2.0,
        region=lambda x, z: region,
        shore=lambda x, z: 0.0,
        water_kind=lambda x, z: "pond",
        water_season=lambda x, z: "perennial",
        corridor=lambda x, z: corridor_m,
    )


@pytest.mark.parametrize("region", [5, 13])
def test_corridor_overlay_places_near_a_band_3_reach_and_not_far_from_one(region):
    layer = _corridor_layer()
    assert layer.corridor_m == (0.0, bp.CORRIDOR_HALF_WIDTH_M)
    palette = Palette(id="corridor-overlay", layers=[layer])
    near = scatter_chunk(0.0, 0.0, 400.0, palette,
                         _flat_fields(20.0, region), seed=3)
    far = scatter_chunk(0.0, 0.0, 400.0, palette,
                        _flat_fields(200.0, region), seed=3)
    assert near, "the gallery ribbon placed nothing 20 m from a band-3 reach"
    assert not far, "the gallery ribbon placed 200 m from any band-3 reach"

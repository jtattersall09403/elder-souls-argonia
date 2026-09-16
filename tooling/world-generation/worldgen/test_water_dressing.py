"""The water dressing (16f deliverables 14 and 15): soft edges, the record
behind every dark texel, and the habitat bits where the record says life is.
The shipped-raster tests skip on a checkout without the published water.
"""

from __future__ import annotations

import json

import numpy as np
import pytest
from PIL import Image

from . import compile_water_dressing as wd
from .water_report import WATER_DIR, ShippedWater


def test_blur_inside_never_bleeds_across_the_mask():
    value = np.zeros((64, 64), dtype=np.float32)
    mask = np.zeros((64, 64), dtype=bool)
    mask[:, :32] = True                  # water on the left half only
    value[:, :32] = 1.0
    out = wd._blur_inside(value, mask, 6.0)
    assert out[:, 32:].max() == 0.0     # nothing outside the water
    assert out[:, :32].min() > 0.95     # nothing lost at the water's edge
    # a hard step inside the water becomes a slope wider than a texel
    value[:, 16:32] = 0.0
    out = wd._blur_inside(value, mask, 6.0)
    assert np.abs(np.diff(out[8, :32])).max() < 0.12


def test_rule_tables_only_name_kinds_in_the_dossier_and_the_vocabulary():
    graph = json.loads((wd.REPO_ROOT / "world" / "sources" / "hydrology" / "hydrology-graph.json").read_text())
    kinds = set(graph["vocabulary"]["reachKinds"]) | set(graph["vocabulary"]["bodyKinds"])
    assert set(wd.ALGAE_BY_KIND) <= kinds and set(wd.DARK_BY_KIND) <= kinds
    moving = {"horizontal-channel", "horizontal-tidal", "sloped-riffle", "sloped-rapid",
              "sloped-chute", "vertical-fall", "ocean"}
    assert not (set(wd.ALGAE_BY_KIND) & moving), "algae never in moving water or the sea"
    assert not (set(wd.DARK_BY_KIND) & moving | {"lagoon"} & set(wd.DARK_BY_KIND))


@pytest.fixture(scope="module")
def shipped():
    if not (WATER_DIR / wd.SIDECAR).exists() or not (WATER_DIR / "water-id.png").exists():
        pytest.skip("the published water dressing is not on this checkout")
    w = ShippedWater(heights=None)
    if w.ids is None:
        pytest.skip("no entity raster")
    side = json.loads((WATER_DIR / wd.SIDECAR).read_text())
    colour = np.asarray(Image.open(WATER_DIR / side["colour"]["file"]).convert("RGB")).astype(np.float32) / 255.0
    habitat = np.asarray(Image.open(WATER_DIR / side["habitat"]["file"]).convert("RGB")).astype(np.float32) / 255.0
    return w, side, colour, habitat


def test_colour_edges_are_soft(shipped):
    w, side, colour, _ = shipped
    assert side["schemaVersion"] == wd.SCHEMA_VERSION
    wet = w.wet_grid("wet")
    for ch, name in ((0, "algae"), (1, "dark")):
        g = wd.max_gradient_per_m(colour[..., ch], wet, w.mpp2)
        assert g <= wd.MAX_GRADIENT_PER_M, f"{name}: {g:.4f} per metre"


def test_every_dark_texel_lies_in_a_kind_the_dossier_names(shipped):
    w, _, colour, _ = shipped
    names = w.kind_names()
    kind = w.kind_index_grid()
    dark = colour[..., 1] > 0.3
    allowed = np.array([k in wd.DARK_BY_KIND for k in names])
    bad = dark & ~allowed[kind]
    assert bad.sum() <= 0.005 * max(dark.sum(), 1), f"{int(bad.sum())} dark texels outside the named kinds"
    algae = colour[..., 0] > 0.3
    allowed_a = np.array([k in wd.ALGAE_BY_KIND for k in names])
    assert (algae & ~allowed_a[kind]).sum() <= 0.005 * max(algae.sum(), 1)


def test_habitat_bits_follow_the_record(shipped):
    w, _, _, habitat = shipped
    names = w.kind_names()
    kind = w.kind_index_grid()
    standing = np.array([k in wd.STANDING_KINDS for k in names])[kind]
    wet = w.wet_grid("wet")
    # standing water is set over the standing bodies and nowhere far from water
    assert habitat[..., 0][standing & wet].mean() > 0.9
    from scipy import ndimage
    far = ~ndimage.binary_dilation(wet, iterations=14)     # > 50 m from any water
    assert habitat[..., 0][far].max() < 0.05 and habitat[..., 1][far].max() < 0.05
    # the canopy bit is the forest's, not the water's: it may be set anywhere
    # trees stand, and it is what puts fireflies under the jungle roof
    assert habitat[..., 2].max() > 0.5

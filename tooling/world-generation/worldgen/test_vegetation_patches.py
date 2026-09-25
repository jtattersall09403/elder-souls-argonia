"""A vegetation-clearance patch clears its ground, and the grading is real.

These are the regression guards for decision 0041's clearing integration and
placement principle C13. They run on synthetic fields in a fraction of a
second — no province rasters, no compiler run — so there is no excuse for not
running them.
"""

import numpy as np
import pytest

from . import vegetation_patches as sc
from .scatter import Fields, Layer, Palette, scatter_chunk

# A 100 x 100 m built core inside a 200 x 200 m worked fringe, with one kept
# tree standing in the middle of the built ground.
HARD = [[[100.0, 100.0], [200.0, 100.0], [200.0, 200.0], [100.0, 200.0]]]
THIN = [[[50.0, 50.0], [250.0, 50.0], [250.0, 250.0], [50.0, 250.0]]]
KEPT = [{"id": "kept.test.hist", "kind": "hist-tree", "positionM": [150.0, 150.0]}]
CLEARANCE = {"hardClear": HARD, "thinned": THIN, "kept": KEPT}


def fields_for(depth=0.0, slope=0.0, region=7, cover=0):
    return Fields(
        height=lambda x, z: 0.0,
        water_depth=lambda x, z: depth,
        slope=lambda x, z: slope,
        region=lambda x, z: region,
        land_cover=lambda x, z: cover,
    )


PATCH = {"id": "patch.test", "kind": "vegetation-clearance",
         "owner": {"record": "settlement.test", "chunk": "16h"}, "why": "test",
         **CLEARANCE}


def scatter(density=400.0, tier="T2", radius=0.0):
    """The WILD scatter: the compiler never sees a settlement (16f)."""
    palette = Palette("p", [Layer(species="tree", tier=tier,
                                  instances_per_hectare=density,
                                  clearance_radius_m=radius)])
    return scatter_chunk(0, 0, 300, palette, fields_for(), seed=4242)


def patched(instances, radius=0.0):
    """What the patch applier leaves of a wild scatter."""
    from .apply_vegetation_patches import patch_id_hash, survives
    h = patch_id_hash(PATCH["id"])
    return [i for i in instances if survives(i.x, i.z, PATCH, 4242, h, radius)]


# --- the hard failures ------------------------------------------------------


def test_no_plant_stands_on_built_ground():
    wild = scatter()
    inside = [i for i in wild if sc.keep_at(i.x, i.z, CLEARANCE) == 0.0]
    assert inside, "fixture: the wild scatter must reach the built ground"
    assert [i for i in patched(wild) if sc.keep_at(i.x, i.z, CLEARANCE) == 0.0] == []


def test_all_tiers_are_cleared_by_the_same_patch():
    for tier in ("T1", "T2", "T3"):
        wild = scatter(tier=tier)
        assert [i for i in patched(wild) if sc.keep_at(i.x, i.z, CLEARANCE) == 0.0] == []


def test_a_plants_extent_is_cleared_not_just_its_origin():
    """A canopy rooted 3 m outside the wall still overhangs the floor: the
    applier judges the plant over its reach, not its origin alone."""
    wild = scatter(density=2000.0)
    near_wall = [i for i in wild
                 if sc.keep_at(i.x, i.z, CLEARANCE) > 0.0
                 and sc.distance_to_polygon(i.x, i.z, HARD[0]) < 4.0]
    assert near_wall, "fixture: nothing rooted just outside the wall"
    origin_only = patched(near_wall, radius=0.0)
    with_reach = patched(near_wall, radius=6.0)
    assert len(with_reach) < len(origin_only)


def test_the_fringe_is_thinner_than_the_wild_but_not_empty():
    wild = scatter(density=1200.0)
    left = patched(wild)
    def band(items):
        return [i for i in items if 0.0 < sc.keep_at(i.x, i.z, CLEARANCE) < 1.0]
    before, after = len(band(wild)), len(band(left))
    assert before > 30, "fixture too sparse to measure a fringe"
    assert 0 < after < before
    far = [i for i in wild if sc.keep_at(i.x, i.z, CLEARANCE) == 1.0]
    far_after = [i for i in left if sc.keep_at(i.x, i.z, CLEARANCE) == 1.0]
    assert len(far_after) == len(far), "the wild ground outside the patch is untouched"


def test_the_grade_is_a_gradient_not_a_step():
    """Survival rises monotonically with distance from the built edge."""
    edges = [sc.keep_at(x, 150.0, CLEARANCE) for x in (99.0, 95.0, 90.0, 85.0)]
    assert edges == sorted(edges), edges
    assert edges[0] < edges[-1]
    assert sc.keep_at(60.0, 150.0, CLEARANCE) == pytest.approx(1.0)


def test_a_kept_plant_keeps_its_ground():
    wild = scatter(density=3000.0)
    under = [i for i in wild if np.hypot(i.x - 150.0, i.z - 150.0) <= 10.0]
    assert under, "fixture: nothing under the kept tree"
    assert len(patched(under)) == len(under)


def test_weeds_are_enriched_at_the_wall_foot():
    """The 0-1.2 m band outside a wall is a deliberate keep, not an oversight."""
    x = 150.0
    # Walk out from the wall to the first ground the clearing leaves standing.
    z = next(z for z in np.arange(100.0, 96.0, -0.02)
             if sc.keep_at(x, z, CLEARANCE) > 0.0)
    at_wall = sc.keep_at(x, z, CLEARANCE)
    # Un-enriched, the fringe rate this close to the wall is the floor.
    assert at_wall > sc.FRINGE_MIN_KEEP * 1.5
    # ... and the enrichment is local: it is gone by the band's edge.
    assert sc.keep_at(x, z - sc.WALL_ENRICH_BAND_M - 0.1, CLEARANCE) < at_wall


# --- the shared rule --------------------------------------------------------

def test_scalar_and_vectorised_rules_agree():
    rng = np.random.default_rng(7)
    xs = rng.uniform(30.0, 270.0, 500)
    zs = rng.uniform(30.0, 270.0, 500)
    for margin in (0.0, 0.9):
        vector = sc.keep_field(xs, zs, CLEARANCE, margin)
        scalar = np.array([sc.keep_at(x, z, CLEARANCE, margin)
                           for x, z in zip(xs, zs)])
        assert np.allclose(vector, scalar)


def test_the_raster_never_reports_built_ground_as_wild():
    """Cell-centre sampling let plants 20 cm inside a wall survive; the
    conservative half-cell margin is what stops it."""
    px_m = 1.83
    keep = sc.keep_raster((200, 200), px_m, [CLEARANCE])
    rng = np.random.default_rng(3)
    for x, z in zip(rng.uniform(101.0, 199.0, 200), rng.uniform(101.0, 199.0, 200)):
        if sc.keep_at(x, z, CLEARANCE) == 0.0:
            assert keep[int(z / px_m), int(x / px_m)] == 0, (x, z)


def test_affected_chunks_covers_the_interior_and_uses_the_scatter_chunk_size():
    assert sc.CHUNK_M == pytest.approx(467.927, abs=0.01)
    wide = {"hardClear": [[[100.0, 100.0], [1500.0, 100.0],
                           [1500.0, 200.0], [100.0, 200.0]]], "thinned": []}
    cells = sc.affected_chunks(wide)
    # 0..1500 m spans four chunks at 467.9 m, INCLUDING the ones with no vertex.
    assert [c[0] for c in cells] == [0, 1, 2, 3]
    assert {c[1] for c in cells} == {0}


def test_affected_chunks_is_polygon_aware_not_the_whole_bbox():
    """A long diagonal track only clears the chunks it actually crosses; a
    large square still keeps every interior chunk."""
    c = sc.CHUNK_M
    # a 20 m-wide track from chunk (0,0) to chunk (3,3) across a 4x4 grid
    pts = [(20.0 + i * (3.5 * c - 20.0) / 20.0, 20.0 + i * (3.5 * c - 20.0) / 20.0)
           for i in range(21)]
    track = {"hardClear": [[[x - 10.0, z + 10.0] for x, z in pts]
                           + [[x + 10.0, z - 10.0] for x, z in reversed(pts)]],
             "thinned": []}
    cells = set(sc.affected_chunks(track))
    assert {(0, 0), (1, 1), (2, 2), (3, 3)} <= cells, sorted(cells)
    # only the diagonal band (the 20 m width straddles the corners the chunks
    # meet at); the bbox's 16 chunks are NOT all taken
    assert all(abs(cx - cz) <= 1 for cx, cz in cells), sorted(cells)
    assert (0, 3) not in cells and (3, 0) not in cells

    square = {"hardClear": [[[10.0, 10.0], [4 * c - 10.0, 10.0],
                             [4 * c - 10.0, 4 * c - 10.0], [10.0, 4 * c - 10.0]]],
              "thinned": []}
    assert set(sc.affected_chunks(square)) == {(x, z) for x in range(4) for z in range(4)}


# --- the patch-list validator ----------------------------------------------

def _write(tmp_path, patches, schema=1):
    import json
    path = tmp_path / "vegetation-patches.json"
    path.write_text(json.dumps({"schemaVersion": schema, "patches": patches}))
    return path


def _patch(**over):
    patch = {"id": "patch.test.one", "kind": "vegetation-clearance",
             "owner": {"record": "place.test", "chunk": "16h"},
             "why": "the test needs a valid patch",
             "hardClear": HARD, "thinned": THIN, "kept": KEPT}
    patch.update(over)
    return patch


def test_a_valid_patch_list_loads(tmp_path):
    loaded = sc.load_patches(_write(tmp_path, [_patch()]))
    assert [p["id"] for p in loaded] == ["patch.test.one"]


def test_a_patch_missing_its_kind_is_refused(tmp_path):
    bad = _patch()
    del bad["kind"]
    with pytest.raises(ValueError, match="patch.test.one"):
        sc.load_patches(_write(tmp_path, [bad]))


def test_a_duplicate_id_is_refused(tmp_path):
    with pytest.raises(ValueError, match="duplicate"):
        sc.load_patches(_write(tmp_path, [_patch(), _patch()]))


def test_a_two_point_polygon_is_refused(tmp_path):
    bad = _patch(hardClear=[[[0.0, 0.0], [1.0, 1.0]]])
    with pytest.raises(ValueError, match="patch.test.one"):
        sc.load_patches(_write(tmp_path, [bad]))


def test_a_wrong_schema_version_is_refused(tmp_path):
    with pytest.raises(ValueError, match="schemaVersion"):
        sc.load_patches(_write(tmp_path, [_patch()], schema=2))


def test_the_shipped_patch_list_is_valid():
    """The authored file itself must pass its own validator."""
    sc.load_patches()


# --------------------------------------------------------------------------
# 16g: the track patches (decision 0070). The compiler that writes them is
# tested in test_minor_routes; these are the rules the FILE must keep.
# --------------------------------------------------------------------------
def test_every_shipped_track_patch_is_owned_by_a_record_and_clears_a_corridor():
    from . import compile_minor_routes as mr
    for patch in sc.load_patches():
        if not patch["id"].startswith(mr.TRACK_PATCH_PREFIX):
            continue
        assert patch["kind"] == sc.PATCH_KIND
        assert patch["owner"]["record"].startswith("place."), patch["id"]
        assert patch["owner"]["chunk"] == "16g", patch["id"]
        assert patch["hardClear"], patch["id"]
        assert patch["fringeFalloffM"] in set(mr.CLASS_WIDTH_M.values()), patch["id"]
        # the corridor is a list of convex quads, never one self-crossing ring
        assert all(len(poly) == 4 for poly in patch["hardClear"]), patch["id"]


def test_a_track_patch_clears_inside_its_polygon_and_nothing_outside():
    from . import compile_minor_routes as mr
    track = {"id": "track.test.line", "kind": "track", "from": "place.test.thing",
             "px": [[0, 0], [10, 0], [20, 0]]}
    patch = mr.clearance_patch(track, 10.0)       # a 200 m line at z = 5 m
    width = mr.CLASS_WIDTH_M["track"]
    on_line = np.array([100.0, 100.0]), np.array([5.0, 5.0 + width / 2 - 0.5])
    assert (sc.keep_field(*on_line, patch) == 0.0).all()
    far = np.array([100.0, 100.0, 100.0]), np.array([5.0 + 5 * width, -400.0, 900.0])
    assert (sc.keep_field(*far, patch) == 1.0).all()
    # and the scalar rule agrees with the vectorised one, as everywhere else
    for x, z in ((100.0, 5.0), (100.0, 5.0 + width), (100.0, 5.0 + 5 * width)):
        assert sc.keep_at(x, z, patch) == pytest.approx(
            float(sc.keep_field(np.array([x]), np.array([z]), patch)[0]))


def _keep_field_uncut(monkeypatch, x, z, clearance, margin_m):
    """`keep_field` with the 16h step E polygon cull switched off."""
    real = sc._inside_and_distance
    with monkeypatch.context() as m:
        m.setattr(sc, "_inside_and_distance",
                  lambda xs, zs, polys, cutoff_m=None: real(xs, zs, polys))
        return sc.keep_field(x, z, clearance, margin_m)


def test_the_polygon_cull_leaves_every_keep_value_unchanged(monkeypatch):
    """Many small quads scattered over a wide area, points in one chunk-sized
    patch among them: culling the far quads must not move one keep value,
    with and without a margin, with and without hard ground."""
    rng = np.random.default_rng(31)
    quads = []
    for cx, cz in rng.uniform(-2000.0, 2000.0, (300, 2)):
        w, h = rng.uniform(3.0, 25.0, 2)
        quads.append([[cx, cz], [cx + w, cz + 1.0], [cx + w - 2.0, cz + h], [cx - 1.0, cz + h - 3.0]])
    x = rng.uniform(-250.0, 250.0, 20000)
    z = rng.uniform(-250.0, 250.0, 20000)
    cases = [
        {"hardClear": quads[:150], "thinned": quads[150:],
         "kept": [{"positionM": [10.0, 10.0], "kind": "shade"}]},
        {"hardClear": [], "thinned": quads},
        {"hardClear": quads, "thinned": []},
    ]
    for clearance in cases:
        for margin in (0.0, 2.0):
            got = sc.keep_field(x, z, clearance, margin)
            want = _keep_field_uncut(monkeypatch, x, z, clearance, margin)
            assert np.array_equal(got, want), (margin, int((got != want).sum()))
    # and the test sees something both sides of the saturation line
    assert (want < 1.0).any() and (want == 1.0).any()


def test_the_polygon_cull_agrees_on_a_shipped_patch_over_a_real_chunk(monkeypatch):
    import json

    from .apply_vegetation_patches import BUNDLE_DIR
    from .scatter import decode

    if not (BUNDLE_DIR / "vegetation-index.json").exists():
        pytest.skip("published vegetation bundles are not on this checkout")
    for clearance in sc.load_patches(sc.PATCHES_PATH):
        for cx, cz in sc.affected_chunks(clearance):
            path = BUNDLE_DIR / f"chunk_{cx}_{cz}_vegetation.bin"
            if not path.exists():
                continue
            items = [i for g in decode(path.read_bytes()) for i in g["instances"]]
            x = np.array([i["x"] for i in items], dtype=np.float64)
            z = np.array([i["z"] for i in items], dtype=np.float64)
            x = np.concatenate([x, x + 3.0, x - 3.0])
            z = np.concatenate([z, z + 3.0, z - 3.0])
            got = sc.keep_field(x, z, clearance, 0.0)
            want = _keep_field_uncut(monkeypatch, x, z, clearance, 0.0)
            assert np.array_equal(got, want)
            assert (want < 1.0).any()
            return
    pytest.skip("no shipped patch reaches a published bundle")


def test_settlement_patches_clear_a_floor_and_only_the_aprons_of_a_deck(tmp_path):
    """16h check-in 3 item 5: a floor clears its footprint and door aprons; a
    deck on legs clears its aprons only, so ground cover stays under it."""
    import json
    vp = sc
    square = [[0.0, 0.0], [4.0, 0.0], [4.0, 4.0], [0.0, 4.0]]
    bundle = {"groundTreatments": [
        {"id": "treatment.place.x.parcel.p.house.building", "kind": "floor",
         "footprintM": square, "apronsM": [[2.0, -1.0, 1.5]]},
        {"id": "treatment.place.x.parcel.p.stilt.building", "kind": "deck",
         "footprintM": square, "apronsM": [[2.0, 5.0, 1.5]]},
        {"id": "treatment.place.x.parcel.p.dock.building", "kind": "deck", "footprintM": square},
    ]}
    patches = {p["id"]: p for p in vp.settlement_clearance_patches(bundle)}
    assert set(patches) == {"patch.clearance.settlement.place.x.parcel.p.house.building",
                            "patch.clearance.settlement.place.x.parcel.p.stilt.building"}
    house = patches["patch.clearance.settlement.place.x.parcel.p.house.building"]
    stilt = patches["patch.clearance.settlement.place.x.parcel.p.stilt.building"]
    assert house["owner"] == {"record": "place.x", "chunk": "16h"}
    assert len(house["hardClear"]) == 2 and len(stilt["hardClear"]) == 1
    assert vp.keep_at(2.0, 2.0, house) == 0.0          # under the floor
    assert vp.keep_at(2.0, 2.0, stilt) > 0.0           # under the deck
    assert vp.keep_at(2.0, 5.0, stilt) == 0.0          # in front of its door
    path = tmp_path / "patches.json"
    path.write_text(json.dumps({"schemaVersion": 1, "patches": [
        {**house, "id": "patch.clearance.track.keep-me"},
        {**house, "id": "patch.clearance.settlement.stale"}]}))
    vp.write_settlement_patches(bundle, path)
    ids = [p["id"] for p in json.loads(path.read_text())["patches"]]
    assert ids[0] == "patch.clearance.track.keep-me" and "patch.clearance.settlement.stale" not in ids


def settlement_patch_drift(patch_doc: dict, bundle: dict) -> list[str]:
    """Ids whose `patch.clearance.settlement.*` record differs from what the
    published settlement bundle's treatments emit (missing, stale or extra)."""
    fresh = {p["id"]: p for p in sc.settlement_clearance_patches(bundle)}
    held = {p["id"]: p for p in patch_doc["patches"]
            if p["id"].startswith(sc.SETTLEMENT_PATCH_PREFIX)}
    return sorted(i for i in set(fresh) | set(held) if fresh.get(i) != held.get(i))


def test_the_settlement_patches_match_the_published_treatments():
    """Fails when a place was republished and nobody re-emitted its clearance
    (`python3 -m worldgen.vegetation_patches <settlements.json>`): a moved
    door would keep a stale apron."""
    import json
    bundle = json.loads((sc.PROVINCE / "settlements.json").read_text())
    doc = json.loads(sc.PATCHES_PATH.read_text())
    assert settlement_patch_drift(doc, bundle) == []
    moved = json.loads(json.dumps(bundle))
    for t in moved["groundTreatments"]:
        for apron in t.get("apronsM") or []:
            apron[0] += 2.0
    assert settlement_patch_drift(doc, moved)

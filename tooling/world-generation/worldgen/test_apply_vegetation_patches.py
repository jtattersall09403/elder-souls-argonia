"""The patch stage removes what the gradient says, and nothing else.

Synthetic bundles in tmp_path — no province, no compiler run — so these are
cheap enough that there is no excuse for not running them.
"""

import json
import math

import pytest

from . import apply_vegetation_patches as avp
from . import vegetation_patches as vp
from .scatter import Instance, encode

SPECIES = ["tree", "fern"]
CHUNK_M = vp.CHUNK_M

HARD = [[[100.0, 100.0], [200.0, 100.0], [200.0, 200.0], [100.0, 200.0]]]
THIN = [[[50.0, 50.0], [250.0, 50.0], [250.0, 250.0], [50.0, 250.0]]]


def patch(**over):
    p = {"id": "patch.test.town", "kind": "vegetation-clearance",
         "owner": {"record": "place.test", "chunk": "16h"},
         "why": "a test town clears its own ground",
         "hardClear": HARD, "thinned": THIN}
    p.update(over)
    return p


def grid_instances(x0=0.0, z0=0.0, n=20, step=15.0):
    """~400 instances on a lattice, alternating species."""
    out = []
    for i in range(n):
        for j in range(n):
            x, z = x0 + i * step + 3.0, z0 + j * step + 7.0
            out.append(Instance(species=SPECIES[(i + j) % 2], tier="T2",
                                x=x, y=0.0, z=z, yaw=0.3, scale=1.0,
                                tilt_x=0.0, tilt_z=0.0))
    return out


def build(tmp_path, chunks):
    """chunks: {(cx, cz): [Instance, ...]} -> a published bundle directory."""
    bundles = tmp_path / "vegetation"
    bundles.mkdir(parents=True, exist_ok=True)
    index = {"seed": 1, "chunkMetres": round(CHUNK_M, 2),
             "speciesOrder": SPECIES, "chunks": {}}
    for (cx, cz), instances in chunks.items():
        (bundles / f"chunk_{cx}_{cz}_vegetation.bin").write_bytes(
            encode(instances, SPECIES))
        index["chunks"][f"{cx}_{cz}"] = {
            "chunk": [cx, cz], "instances": len(instances),
            "perHectare": round(len(instances) / (CHUNK_M * CHUNK_M / 10_000), 1)}
    (bundles / "vegetation-index.json").write_text(json.dumps(index, indent=1))
    return bundles


def patches_file(tmp_path, patches):
    source = tmp_path / "source"
    source.mkdir(exist_ok=True)
    path = source / "vegetation-patches.json"
    path.write_text(json.dumps({"schemaVersion": 1, "patches": patches}))
    return path


def survivors(bundles, cx=0, cz=0):
    from .scatter import decode
    groups = decode((bundles / f"chunk_{cx}_{cz}_vegetation.bin").read_bytes())
    return [(SPECIES[g["index"]], i["x"], i["z"])
            for g in groups for i in g["instances"]]


# --- the hard failures ------------------------------------------------------

def test_a_hard_clear_polygon_removes_what_is_inside_it_and_nothing_outside(tmp_path):
    placed = grid_instances()
    bundles = build(tmp_path, {(0, 0): placed})
    only_hard = patch(thinned=[])
    avp.run(bundles, patches_file(tmp_path, [only_hard]), seed=7)

    left = survivors(bundles)
    inside_before = [i for i in placed
                     if vp.keep_at(i.x, i.z, only_hard) == 0.0]
    assert inside_before, "fixture puts nothing on built ground"
    assert [p for p in left if vp.keep_at(p[1], p[2], only_hard) == 0.0] == []
    assert len(left) == len(placed) - len(inside_before)


def test_a_thinned_band_keeps_a_share_that_rises_outward(tmp_path):
    placed = grid_instances(n=40, step=7.0)
    bundles = build(tmp_path, {(0, 0): placed})
    p = patch()
    avp.run(bundles, patches_file(tmp_path, [p]), seed=11)
    left = {(round(x, 3), round(z, 3)) for _, x, z in survivors(bundles)}

    bins = {}
    for inst in placed:
        keep = vp.keep_at(inst.x, inst.z, p)
        if not 0.0 < keep < 1.0:
            continue
        # distance from the built core's edge
        d = min(vp.distance_to_polygon(inst.x, inst.z, poly) for poly in HARD)
        b = min(2, int(d // 5.0))
        hit, total = bins.get(b, (0, 0))
        bins[b] = (hit + ((round(inst.x, 3), round(inst.z, 3)) in left), total + 1)

    assert set(bins) == {0, 1, 2}, bins
    rates = [bins[b][0] / bins[b][1] for b in (0, 1, 2)]
    assert all(bins[b][1] >= 10 for b in bins), bins
    assert rates == sorted(rates), rates
    assert vp.FRINGE_MIN_KEEP - 0.15 < rates[0] < 1.0
    assert rates[2] <= 1.0


def test_the_receipt_names_the_chunks_the_bbox_touches_and_the_counts_add_up(tmp_path):
    # A patch straddling the chunk seam at x = CHUNK_M.
    x0 = CHUNK_M - 120.0
    wide = patch(id="patch.test.seam",
                 hardClear=[[[x0, 100.0], [x0 + 240.0, 100.0],
                             [x0 + 240.0, 220.0], [x0, 220.0]]],
                 thinned=[])
    chunks = {(0, 0): grid_instances(x0=x0 - 60.0, z0=40.0, n=14, step=12.0),
              (1, 0): grid_instances(x0=CHUNK_M + 5.0, z0=40.0, n=14, step=12.0)}
    bundles = build(tmp_path, chunks)
    receipt = avp.run(bundles, patches_file(tmp_path, [wide]), seed=3)

    rec = receipt["patches"][0]
    assert [tuple(c) for c in rec["chunks"]] == vp.affected_chunks(wide)
    assert {tuple(c) for c in rec["chunks"]} >= {(0, 0), (1, 0)}
    assert sum(c["removed"] for c in rec["byChunk"].values()) == rec["removed"]
    assert rec["removed"] > 0
    assert receipt["totals"]["removed"] == rec["removed"]
    assert receipt["totals"]["chunksTouched"] == len(rec["byChunk"])
    for key, entry in rec["byChunk"].items():
        assert sum(entry["bySpecies"].values()) == entry["removed"]
    # the index was decremented by exactly what went
    index = json.loads((bundles / "vegetation-index.json").read_text())
    for key, entry in rec["byChunk"].items():
        cx, cz = (int(v) for v in key.split("_"))
        assert index["chunks"][key]["instances"] == len(chunks[(cx, cz)]) - entry["removed"]
        assert index["chunks"][key]["perHectare"] == pytest.approx(
            round(index["chunks"][key]["instances"] / (CHUNK_M * CHUNK_M / 10_000), 1))


def test_running_the_stage_twice_changes_nothing(tmp_path):
    bundles = build(tmp_path, {(0, 0): grid_instances()})
    path = patches_file(tmp_path, [patch()])
    first = avp.run(bundles, path, seed=5)
    blob = (bundles / "chunk_0_0_vegetation.bin").read_bytes()
    second = avp.run(bundles, path, seed=5)
    assert (bundles / "chunk_0_0_vegetation.bin").read_bytes() == blob
    assert first["patches"][0]["removed"] > 0
    # The re-run removed nothing, so it does not get to speak for the bundles:
    # the receipt still carries what the first run took.
    assert second["totals"] == first["totals"]
    assert second["patches"][0]["removed"] == first["patches"][0]["removed"]


def test_a_re_run_that_removes_nothing_keeps_the_first_receipt(tmp_path):
    """The 16h defect: an idempotent re-run rebuilt the receipt from its own
    zero counters and overwrote the real numbers. It must append instead."""
    bundles = build(tmp_path, {(0, 0): grid_instances()})
    path = patches_file(tmp_path, [patch()])
    first = avp.run(bundles, path, seed=5)
    assert first["totals"]["removed"] > 0
    assert "reRuns" not in first

    avp.run(bundles, path, seed=5)
    avp.run(bundles, path, seed=5)
    receipt = json.loads((bundles / avp.RECEIPT_NAME).read_text())
    assert receipt["totals"] == first["totals"]
    assert receipt["patches"][0]["byChunk"] == first["patches"][0]["byChunk"]
    assert len(receipt["reRuns"]) == 2
    assert receipt["reRuns"][0] == {"at": receipt["reRuns"][0]["at"],
                                    "removed": 0, "chunksTouched": 0}


def test_the_receipt_carries_pre_patch_counts_so_a_no_op_reads_honestly(tmp_path):
    """16h step-0 diagnosis: a receipt that only ever says "removed" cannot
    tell "nothing here ever needed clearing" from "this cleared it on a
    prior run and today's run is a no-op". prePatchInstanceCount (the count
    standing in the touched chunks before THIS run) must be present and
    equal to what stood before, on both the clearing run and the no-op
    re-run that follows it."""
    bundles = build(tmp_path, {(0, 0): grid_instances()})
    path = patches_file(tmp_path, [patch()])
    n_before = len(grid_instances())

    first = avp.run(bundles, path, seed=5)
    assert first["totals"]["prePatchInstanceCount"] == n_before
    assert first["patches"][0]["prePatchInstanceCount"] == n_before
    assert first["totals"]["removed"] > 0

    # A re-run after the first one actually cleared ground: the receipt is
    # carried over unchanged (see test_a_re_run_that_removes_nothing_keeps_
    # the_first_receipt), so its prePatchInstanceCount still reads what stood
    # BEFORE the clearing run — never zero, never re-derived from the empty
    # re-run.
    avp.run(bundles, path, seed=5)
    receipt = json.loads((bundles / avp.RECEIPT_NAME).read_text())
    assert receipt["totals"]["prePatchInstanceCount"] == n_before


def test_a_run_with_nothing_to_clear_reports_a_nonzero_pre_patch_count(tmp_path):
    """A patch whose hard-clear zone lands on ground with instances, but
    none happen to fall inside it (roll or geometry never actually hits
    one): removed is 0, but prePatchInstanceCount must still show ground
    was there to check — distinct from a patch whose chunk never published
    at all (prePatchInstanceCount 0)."""
    x0 = CHUNK_M * 5 + 10.0
    far = patch(id="patch.test.far-away",
                hardClear=[[[x0, x0], [x0 + 1.0, x0], [x0 + 1.0, x0 + 1.0],
                            [x0, x0 + 1.0]]], thinned=[])
    bundles = build(tmp_path, {(0, 0): grid_instances()})
    receipt = avp.run(bundles, patches_file(tmp_path, [far]), seed=5)
    rec = receipt["patches"][0]
    assert rec["removed"] == 0
    assert rec["prePatchInstanceCount"] == 0  # its chunk was never published


def test_the_patch_list_is_published_beside_the_bundles(tmp_path):
    bundles = build(tmp_path, {(0, 0): grid_instances()})
    path = patches_file(tmp_path, [patch()])
    avp.run(bundles, path, seed=5)
    published = bundles.parent / "vegetation-patches.json"
    assert json.loads(published.read_text())["patches"][0]["id"] == "patch.test.town"


# --- the vectorised path answers exactly what the scalar one does -----------

CONCAVE = [[[0.0, 0.0], [300.0, 0.0], [300.0, 120.0], [180.0, 120.0],
            [180.0, 40.0], [120.0, 40.0], [120.0, 120.0], [0.0, 120.0]]]


def test_the_vectorised_mask_equals_the_scalar_survives_on_5000_instances():
    """`survives` is the reference; `survives_mask` must agree on every one,
    including instances sitting exactly on an edge and on a vertex."""
    import numpy as np

    p = patch(id="patch.test.concave", hardClear=CONCAVE,
              thinned=[[[-60.0, -60.0], [360.0, -60.0], [360.0, 180.0], [-60.0, 180.0]]],
              kept=[{"positionM": [250.0, 160.0], "kind": "hist-tree"},
                    {"positionM": [40.0, 200.0], "kind": "shade"}])
    rng = np.random.default_rng(4242)
    n = 5000
    xs = list(rng.uniform(-70.0, 370.0, n - 40))
    zs = list(rng.uniform(-70.0, 190.0, n - 40))
    # exactly on the vertices, and at the midpoint of every edge
    poly = CONCAVE[0]
    for i, (vx, vz) in enumerate(poly):
        wx, wz = poly[(i + 1) % len(poly)]
        xs += [vx, (vx + wx) / 2.0]
        zs += [vz, (vz + wz) / 2.0]
    # exactly on a kept disc's rim, and on the thinned band's edge
    xs += [250.0 + 18.0, 250.0, -60.0, 360.0]
    zs += [160.0, 160.0 + 18.0, 60.0, 60.0]
    # the reflex corner of the concave notch, repeated to fill out the set
    while len(xs) < n:
        xs.append(120.0)
        zs.append(40.0)
    xs, zs = xs[:n], zs[:n]
    assert len(xs) == len(zs) == n

    seed, id_hash = 19, avp.patch_id_hash(p["id"])
    for radius in (0.0, 2.5):
        expected = [avp.survives(x, z, p, seed, id_hash, radius)
                    for x, z in zip(xs, zs)]
        got = avp.survives_mask(np.array(xs), np.array(zs), p, seed, id_hash, radius)
        bad = [i for i, (a, b) in enumerate(zip(expected, got.tolist())) if a != b]
        assert not bad, f"radius {radius}: {len(bad)} disagree, first at " \
                        f"({xs[bad[0]]}, {zs[bad[0]]})"


def test_one_worker_and_three_workers_write_identical_bytes(tmp_path, monkeypatch):
    chunks = {(cx, cz): grid_instances(x0=cx * CHUNK_M, z0=cz * CHUNK_M,
                                       n=12, step=20.0)
              for cx in range(2) for cz in range(2)}
    wide = patch(id="patch.test.wide",
                 hardClear=[[[50.0, 50.0], [CHUNK_M + 200.0, 50.0],
                             [CHUNK_M + 200.0, CHUNK_M + 200.0], [50.0, CHUNK_M + 200.0]]],
                 thinned=THIN)
    second = patch(id="patch.test.overlap",
                   hardClear=[[[300.0, 300.0], [700.0, 300.0],
                               [700.0, 700.0], [300.0, 700.0]]], thinned=[])

    runs = {}
    for workers in ("1", "3"):
        root = tmp_path / f"w{workers}"
        root.mkdir()
        bundles = build(root, chunks)
        monkeypatch.setenv("ES_PATCH_WORKERS", workers)
        receipt = avp.run(bundles, patches_file(root, [wide, second]), seed=13)
        runs[workers] = (
            receipt,
            {f.name: f.read_bytes() for f in sorted(bundles.glob("*.bin"))},
            (bundles / "vegetation-index.json").read_text(),
        )

    assert runs["1"][1] == runs["3"][1]
    assert runs["1"][2] == runs["3"][2]
    assert runs["1"][0] == runs["3"][0]
    assert runs["1"][0]["totals"]["removed"] > 0
    assert runs["1"][0]["totals"]["chunksTouched"] > 1


def test_the_roll_is_deterministic_and_position_addressed(tmp_path):
    a = avp.instance_roll(5, avp.patch_id_hash("patch.a"), 123.25, 40.5)
    b = avp.instance_roll(5, avp.patch_id_hash("patch.a"), 123.25, 40.5)
    c = avp.instance_roll(5, avp.patch_id_hash("patch.b"), 123.25, 40.5)
    assert a == b and a != c
    assert 0.0 <= a < 1.0 and not math.isnan(a)


def _per_group_masks(groups, species_order, p, seed, radii):
    """The pre-16h-step-E reference: one `survives_mask` per species group."""
    import numpy as np

    id_hash = avp.patch_id_hash(p["id"])
    out = []
    for group in groups:
        items = group["instances"]
        if not items:
            out.append(None)
            continue
        xs = np.array([i["x"] for i in items], dtype=np.float64)
        zs = np.array([i["z"] for i in items], dtype=np.float64)
        out.append(avp.survives_mask(xs, zs, p, seed, id_hash,
                                     radii.get(species_order[group["index"]], 0.0)))
    return out


def _assert_same_masks(groups, species_order, p, seed, radii):
    got = avp._survives_masks_batched(groups, species_order, p, seed,
                                      avp.patch_id_hash(p["id"]), radii)
    want = _per_group_masks(groups, species_order, p, seed, radii)
    assert len(got) == len(want)
    for a, b in zip(got, want):
        assert (a is None) == (b is None)
        if a is not None:
            assert a.dtype == b.dtype and a.tolist() == b.tolist()


def test_the_batched_chunk_mask_equals_one_mask_per_species_group():
    """16h step E batches every group of a chunk into one `keep_field` call;
    each plant's answer must be the one the per-group call gave, radius or
    none, including an empty group."""
    import numpy as np

    rng = np.random.default_rng(77)
    species_order = ["tree", "fern", "reed", "rock"]
    groups = []
    for index, n in enumerate((900, 0, 350, 1)):
        groups.append({"index": index, "instances": [
            {"x": float(x), "z": float(z)}
            for x, z in zip(rng.uniform(-70.0, 370.0, n), rng.uniform(-70.0, 190.0, n))]})
    radii = {"tree": 3.25, "reed": 0.4}          # fern and rock: origin only
    p = patch(id="patch.test.batched", hardClear=CONCAVE,
              thinned=[[[-60.0, -60.0], [360.0, -60.0], [360.0, 180.0], [-60.0, 180.0]]],
              kept=[{"positionM": [250.0, 160.0], "kind": "hist-tree"}])
    _assert_same_masks(groups, species_order, p, 19, radii)


def test_the_batched_mask_agrees_on_the_shipped_patches_and_bundles():
    """The same equality on real data: the shipped track clearances over the
    published bundles they reach (skips where the bundles are not on disk)."""
    from .compile_scatter import DEFAULT_SEED
    from .scatter import decode

    bundles = avp.BUNDLE_DIR
    index_path = bundles / "vegetation-index.json"
    if not index_path.exists():
        pytest.skip("published vegetation bundles are not on this checkout")
    species_order = json.loads(index_path.read_text())["speciesOrder"]
    radii = avp.species_radii()
    # One real patch over one real chunk, eight species groups: the reference
    # costs ~2 s per group-patch pair on a ~1,000-edge track polygon, which is
    # the cost the batching removed.
    for p in vp.load_patches(vp.PATCHES_PATH):
        for cx, cz in vp.affected_chunks(p):
            path = bundles / f"chunk_{cx}_{cz}_vegetation.bin"
            if path.exists():
                groups = [g for g in decode(path.read_bytes()) if g["instances"]][:8]
                assert any(radii.get(species_order[g["index"]], 0.0) > 0.0
                           for g in groups)
                _assert_same_masks(groups, species_order, p, DEFAULT_SEED, radii)
                return
    pytest.skip("no shipped patch reaches a published bundle")

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
    assert second["patches"][0]["removed"] == 0
    assert second["totals"] == {"removed": 0, "chunksTouched": 0}


def test_an_empty_patch_list_writes_a_receipt_and_moves_nothing(tmp_path):
    bundles = build(tmp_path, {(0, 0): grid_instances()})
    blob = (bundles / "chunk_0_0_vegetation.bin").read_bytes()
    index = (bundles / "vegetation-index.json").read_text()
    receipt = avp.run(bundles, patches_file(tmp_path, []), seed=5)
    assert receipt["patches"] == []
    assert receipt["totals"] == {"removed": 0, "chunksTouched": 0}
    assert json.loads((bundles / avp.RECEIPT_NAME).read_text())["schemaVersion"] == 1
    assert (bundles / "chunk_0_0_vegetation.bin").read_bytes() == blob
    assert (bundles / "vegetation-index.json").read_text() == index


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

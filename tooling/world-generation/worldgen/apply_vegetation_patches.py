"""Apply the typed vegetation-clearance patches to the published bundles.

The chain stage that runs straight after ``compile_scatter`` (16f, decision
0070). The scatter compiler knows nothing about settlements or tracks: it
dresses the wild province once. Clearance is then a *patch* — a typed record
in ``world/sources/flora/vegetation-patches.json`` — applied here to the
published bundles, and published alongside them so the runtime groundcover
ring evaluates the identical list.

**Instance identity.** An instance is addressed as (chunk, species, ordinal) in
the PUBLISHED bundle, after patches; a patch's receipt lists what it removed
per chunk and species.

**Idempotent by construction.** Whether an instance goes is
``keep_at(x, z) < 1 and roll >= keep``, where ``roll`` is hashed from the seed,
the patch id and the instance's quantised position — no state, no ordinal, no
dependence on what else is in the bundle. Re-running therefore removes nothing
more, and a chunk a patch takes nothing from is not rewritten at all, so the
bundles stay byte-identical.

Usage::

    python3 -m worldgen.apply_vegetation_patches [--bundles DIR]
        [--patches FILE] [--seed 0x5CA77E5]
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

from . import vegetation_patches as vp
from .composition import _quantised
from .scatter import Instance, decode, encode, hash64, shipped_position, uniform_at

BUNDLE_DIR = vp.PROVINCE / "vegetation"
RECEIPT_NAME = "vegetation-patches-receipt.json"
#: Salt for the patch roll — the instance-thinning draw must not correlate
#: with any draw the scatter itself made.
ROLL_SALT = 0xC1EA4

ABOUT = (
    "Applied by worldgen.apply_vegetation_patches after compile_scatter "
    "(16f, decision 0070). An instance is addressed as (chunk, species, "
    "ordinal) in the PUBLISHED bundle, after patches; a patch's receipt "
    "lists what it removed per chunk and species."
)


def patch_id_hash(patch_id: str) -> int:
    return hash64(*[ord(c) for c in patch_id])


def instance_roll(seed: int, id_hash: int, x: float, z: float) -> float:
    qx, qz = _quantised(x, z)
    return uniform_at(hash64(seed, ROLL_SALT, id_hash, qx, qz), 0)


def keep_over_extent(x: float, z: float, patch: dict, radius_m: float = 0.0) -> float:
    """The keep at a plant's ORIGIN and at four points on its reach.

    A canopy overhangs its trunk exactly as a fern's fronds overhang its
    origin (No Grass In Objects' standing lesson, research/rendering/
    building-placement-rendering-treatments.md §2.3): an origin-only test
    leaves geometry poking through floors, so the answer is the worst over
    the plant's own extent. `radius_m` 0 is the origin alone."""
    keep = vp.keep_at(x, z, patch, margin_m=0.0)
    if radius_m > 0.0 and keep > 0.0:
        for dx, dz in ((radius_m, 0.0), (-radius_m, 0.0), (0.0, radius_m), (0.0, -radius_m)):
            keep = min(keep, vp.keep_at(x + dx, z + dz, patch, margin_m=0.0))
    return keep


def survives(x: float, z: float, patch: dict, seed: int, id_hash: int,
             radius_m: float = 0.0) -> bool:
    keep = keep_over_extent(x, z, patch, radius_m)
    if keep >= 1.0:
        return True
    return instance_roll(seed, id_hash, x, z) < keep


# --- the vectorised path ----------------------------------------------------
#
# `survives` above stays the scalar REFERENCE implementation: readable, and the
# thing the test measures the arrays against. Nothing calls it per instance on
# the province any more — a chunk carries tens of thousands of plants and the
# province a few million, and the per-instance Python loop cost 15 minutes for
# one patch set. The three pieces below do the identical arithmetic over numpy
# arrays: SplitMix64 in uint64 lanes, and `vp.keep_field` (which already exists
# for the keep raster and is the array twin of `vp.keep_at`) for the geometry.

_MASK64 = np.uint64(0xFFFFFFFFFFFFFFFF)
_GOLDEN = np.uint64(0x9E3779B97F4A7C15)
_MIX_A = np.uint64(0xBF58476D1CE4E5B9)
_MIX_B = np.uint64(0x94D049BB133111EB)


def _splitmix_step(state: np.ndarray, value: np.ndarray) -> np.ndarray:
    """One `hash64` fold, over arrays. uint64 arithmetic wraps, which is the
    `& _MASK` the scalar does explicitly."""
    with np.errstate(over="ignore"):
        state = state + value * _GOLDEN
        state = state ^ (state >> np.uint64(30))
        state = state * _MIX_A
        state = state ^ (state >> np.uint64(27))
        state = state * _MIX_B
        return state ^ (state >> np.uint64(31))


def instance_roll_array(seed: int, id_hash: int, x: np.ndarray,
                        z: np.ndarray) -> np.ndarray:
    """`instance_roll` over arrays of positions.

    Two hashes, exactly as the scalar does: `hash64(seed, SALT, id, qx, qz)`
    and then `uniform(that, 0)`, which is itself a fresh SplitMix64 over
    (that, 0). The first three folds of the first hash are constant for the
    whole chunk, so they are done once in Python.
    """
    prefix = np.uint64(hash64(seed, ROLL_SALT, id_hash) & 0xFFFFFFFFFFFFFFFF)
    qx = (np.rint(np.asarray(x, dtype=np.float64) * 16.0).astype(np.int64)
          .astype(np.uint64) & np.uint64(0xFFFFFFFF))
    qz = (np.rint(np.asarray(z, dtype=np.float64) * 16.0).astype(np.int64)
          .astype(np.uint64) & np.uint64(0xFFFFFFFF))
    state = _splitmix_step(np.broadcast_to(prefix, qx.shape).copy(), qx)
    key = _splitmix_step(state, qz)
    state = _splitmix_step(np.full(key.shape, _GOLDEN, dtype=np.uint64), key)
    state = _splitmix_step(state, np.zeros(key.shape, dtype=np.uint64))
    return (state >> np.uint64(11)).astype(np.float64) * (1.0 / (1 << 53))


def keep_over_extent_array(x: np.ndarray, z: np.ndarray, patch: dict,
                           radius_m: float = 0.0) -> np.ndarray:
    """`keep_over_extent` over arrays — the worst keep over the plant's reach."""
    keep = vp.keep_field(x, z, patch, margin_m=0.0)
    if radius_m > 0.0:
        for dx, dz in ((radius_m, 0.0), (-radius_m, 0.0),
                       (0.0, radius_m), (0.0, -radius_m)):
            keep = np.minimum(keep, vp.keep_field(x + dx, z + dz, patch,
                                                  margin_m=0.0))
    return keep


def survives_mask(x: np.ndarray, z: np.ndarray, patch: dict, seed: int,
                  id_hash: int, radius_m: float = 0.0) -> np.ndarray:
    """Boolean mask, one entry per position: the array twin of `survives`."""
    x = np.asarray(x, dtype=np.float64)
    z = np.asarray(z, dtype=np.float64)
    if x.size == 0:
        return np.zeros(0, dtype=bool)
    keep = keep_over_extent_array(x, z, patch, radius_m)
    return (keep >= 1.0) | (instance_roll_array(seed, id_hash, x, z) < keep)


KITS_DIR = Path(__file__).resolve().parents[3] / "apps" / "world-studio" / "public" / "kits"


def species_radii(kits_dir: Path = KITS_DIR) -> dict[str, float]:
    """species id -> half its footprint (m), from every published kit manifest
    the scatter draws from; {} when none is on this checkout."""
    out: dict[str, float] = {}
    for name in ("flora-province-v1", "underwater-v1"):
        path = kits_dir / f"{name}.kit.json"
        if not path.exists():
            continue
        for asset in json.loads(path.read_text()).get("assets", []):
            size = asset.get("sizeM") or [0, 0, 0]
            out.setdefault(asset["id"], max(float(size[0]), float(size[1])) / 2.0)
    return out


def _prune_decoded(groups: list[dict], species_order: list[str], patch: dict,
                   seed: int, radii: dict[str, float]) -> Counter:
    """Remove the patch's instances from `groups` IN PLACE; what came back.

    The survivors of a group the patch touched get the encoder's POSITION
    quantisation (`scatter.shipped_position`, a float32 each) applied, so the
    in-memory groups carry exactly what a re-read of the written bundle would
    give and a later patch judges the same numbers. That is the whole reason
    the stage used to re-encode and re-decode between patches.
    """
    id_hash = patch_id_hash(patch["id"])
    removed: Counter = Counter()
    for group in groups:
        species = species_order[group["index"]]
        items = group["instances"]
        if not items:
            continue
        xs = np.fromiter((i["x"] for i in items), dtype=np.float64, count=len(items))
        zs = np.fromiter((i["z"] for i in items), dtype=np.float64, count=len(items))
        mask = survives_mask(xs, zs, patch, seed, id_hash, radii.get(species, 0.0))
        gone = int(len(items) - int(mask.sum()))
        if not gone:
            continue
        removed[species] += gone
        kept = [i for i, alive in zip(items, mask.tolist()) if alive]
        for item in kept:
            item["x"], item["y"], item["z"] = shipped_position(item["x"], item["y"], item["z"])
        group["instances"] = kept
    return removed


def _encode_groups(groups: list[dict], species_order: list[str]) -> bytes:
    return encode([Instance(species=species_order[group["index"]], tier="T2",
                            x=i["x"], y=i["y"], z=i["z"], yaw=i["yaw"], scale=i["scale"],
                            tilt_x=i["tiltX"], tilt_z=i["tiltZ"],
                            anchor=i["anchor"], sink=i["sink"])
                   for group in groups for i in group["instances"]], species_order)


def _apply_decoded(groups: list[dict], species_order: list[str], patch: dict,
                   seed: int, radii: dict[str, float]) -> tuple[bytes | None, Counter]:
    """The surviving bundle, or None if nothing was removed. Mutates `groups`."""
    removed = _prune_decoded(groups, species_order, patch, seed, radii)
    if not removed:
        return None, removed
    return _encode_groups(groups, species_order), removed


def apply_to_chunk(path: Path, species_order: list[str], patch: dict,
                   seed: int, radii: dict[str, float] | None = None) -> tuple[bytes | None, Counter]:
    """The surviving bundle for one chunk, or None if nothing was removed."""
    radii = radii if radii is not None else species_radii()
    return _apply_decoded(decode(path.read_bytes()), species_order, patch,
                          seed, radii)


def _chunk_job(job: tuple) -> tuple[str, list[tuple[int, dict]], int]:
    """One chunk, all the patches that touch it, in patch order.

    Pure: it reads and rewrites its own bundle file (no other worker touches
    that path) and returns what the PARENT needs to update the shared index and
    receipt. Nothing here is shared mutable state.

    Between patches the surviving instances get the encoder's POSITION
    quantisation (`_prune_decoded`) and nothing else: that is the only part of
    the encode a later patch can see (it judges x/z), so the chunk is encoded
    ONCE, at the end, and the bytes are identical to the old encode-and-decode
    round per patch.
    """
    key, path_str, species_order, patch_items, seed, radii = job
    path = Path(path_str)
    groups = decode(path.read_bytes())
    out: list[tuple[int, dict]] = []
    dirty = False
    for index, patch in patch_items:
        removed = _prune_decoded(groups, species_order, patch, seed, radii)
        if not removed:
            continue
        dirty = True
        out.append((index, {"removed": int(sum(removed.values())),
                            "bySpecies": dict(sorted(removed.items()))}))
    if dirty:
        path.write_bytes(_encode_groups(groups, species_order))
    kept = sum(len(g["instances"]) for g in groups)
    return key, out, kept


def _worker_count() -> int:
    override = os.environ.get("ES_PATCH_WORKERS")
    if override:
        return max(1, int(override))
    # Three, not one per core: each worker holds a whole decoded chunk (tens of
    # thousands of instances as Python dicts) plus its numpy lanes, and the
    # session runs in a 12 GiB cgroup that OOM-killed this stage at six
    # workers. Three keeps the peak inside it; `ES_PATCH_WORKERS` overrides.
    return min(3, os.cpu_count() or 1)


def run(bundles: Path, patches_path: Path, seed: int) -> dict:
    patches = vp.load_patches(patches_path)
    index_path = bundles / "vegetation-index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    species_order = list(index.get("speciesOrder", []))
    chunk_area_ha = (float(index.get("chunkMetres", vp.CHUNK_M)) ** 2) / 10_000.0

    started = time.perf_counter()
    radii = species_radii()

    # Group by CHUNK first: a chunk several patches reach into is decoded,
    # masked and written once, with its patches in authored order.
    patch_chunks = [vp.affected_chunks(p) for p in patches]
    jobs: dict[str, list[tuple[int, dict]]] = {}
    for index_of, (patch, chunks) in enumerate(zip(patches, patch_chunks)):
        for cx, cz in chunks:
            if not (bundles / f"chunk_{cx}_{cz}_vegetation.bin").exists():
                continue
            jobs.setdefault(f"{cx}_{cz}", []).append((index_of, patch))
    keys = sorted(jobs)                      # deterministic, worker-count free
    payload = [(key,
                str(bundles / f"chunk_{key}_vegetation.bin"),
                species_order, items, seed, radii)
               for key, items in ((k, jobs[k]) for k in keys)]

    workers = min(_worker_count(), len(payload)) or 1
    if workers <= 1:
        results = [_chunk_job(job) for job in payload]
    else:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            results = list(pool.map(_chunk_job, payload))

    # The parent alone touches `touched`, the index and the receipt.
    per_chunk: dict[str, dict[int, dict]] = {}
    for key, entries, _kept in results:
        per_chunk[key] = dict(entries)

    receipt_patches = []
    touched: set[str] = set()
    total_removed = 0
    for index_of, (patch, chunks) in enumerate(zip(patches, patch_chunks)):
        by_chunk: dict[str, dict] = {}
        patch_removed = 0
        for cx, cz in chunks:
            key = f"{cx}_{cz}"
            entry = per_chunk.get(key, {}).get(index_of)
            if entry is None:
                continue
            touched.add(key)
            n = entry["removed"]
            patch_removed += n
            by_chunk[key] = entry
            record = index.get("chunks", {}).get(key)
            if record is not None:
                record["instances"] = max(0, record.get("instances", 0) - n)
                record["perHectare"] = round(record["instances"] / chunk_area_ha, 1)
        total_removed += patch_removed
        receipt_patches.append({
            "id": patch["id"], "owner": patch.get("owner", {}),
            "chunks": [list(c) for c in chunks],
            "removed": patch_removed, "byChunk": by_chunk,
        })
        print(f"  {patch['id']}: {patch_removed} removed "
              f"over {len(by_chunk)} of {len(chunks)} chunks")

    print(f"  chunks: {len(payload)} candidate / {len(touched)} touched "
          f"in {time.perf_counter() - started:.1f} s "
          f"({workers} worker{'' if workers == 1 else 's'})")

    if touched and index_path.exists():
        index_path.write_text(json.dumps(index, indent=1) + "\n")

    receipt = {
        "schemaVersion": 1,
        "about": ABOUT,
        "seed": seed,
        "patches": receipt_patches,
        "totals": {"removed": total_removed, "chunksTouched": len(touched)},
    }
    # A re-run of an idempotent stage removes nothing, and a receipt rebuilt
    # from THAT run's counters reads "removed 0" over ground the first run
    # cleared — which is what overwrote the 2026-09-19 receipt and cost us the
    # real numbers (16h). A run that removed nothing never speaks for the
    # bundles: it appends itself to `reRuns` and leaves the prior truth alone.
    receipt_path = bundles / RECEIPT_NAME
    if total_removed == 0 and not touched and receipt_path.exists():
        try:
            prior = json.loads(receipt_path.read_text())
        except json.JSONDecodeError:
            prior = None
        if isinstance(prior, dict) and int(
                prior.get("totals", {}).get("removed", 0)) > 0:
            re_runs = list(prior.get("reRuns") or [])
            re_runs.append({
                "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "removed": 0, "chunksTouched": 0})
            prior["reRuns"] = re_runs
            receipt = prior
    receipt_path.write_text(json.dumps(receipt, indent=1) + "\n")
    # The runtime streams the published copy, never the authored source.
    published = bundles.parent / "vegetation-patches.json"
    if patches_path.exists() and published.resolve() != patches_path.resolve():
        published.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(patches_path, published)
    return receipt


def main() -> int:
    from .compile_scatter import DEFAULT_SEED

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--bundles", type=Path, default=BUNDLE_DIR)
    ap.add_argument("--patches", type=Path, default=vp.PATCHES_PATH)
    ap.add_argument("--seed", type=lambda v: int(v, 0), default=DEFAULT_SEED)
    args = ap.parse_args()

    patches = vp.load_patches(args.patches)
    if not patches:
        run(args.bundles, args.patches, args.seed)
        print("apply_vegetation_patches: 0 patches")
        return 0
    print(f"apply_vegetation_patches: {len(patches)} patches")
    receipt = run(args.bundles, args.patches, args.seed)
    t = receipt["totals"]
    print(f"  totals: {t['removed']} instances removed, "
          f"{t['chunksTouched']} chunks touched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

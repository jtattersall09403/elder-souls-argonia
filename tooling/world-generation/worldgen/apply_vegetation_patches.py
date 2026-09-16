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
import shutil
from collections import Counter
from pathlib import Path

from . import vegetation_patches as vp
from .composition import _quantised
from .scatter import Instance, decode, encode, hash64, uniform_at

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


def apply_to_chunk(path: Path, species_order: list[str], patch: dict,
                   seed: int, radii: dict[str, float] | None = None) -> tuple[bytes | None, Counter]:
    """The surviving bundle for one chunk, or None if nothing was removed."""
    id_hash = patch_id_hash(patch["id"])
    radii = radii if radii is not None else species_radii()
    groups = decode(path.read_bytes())
    kept: list[Instance] = []
    removed: Counter = Counter()
    for group in groups:
        species = species_order[group["index"]]
        radius = radii.get(species, 0.0)
        for item in group["instances"]:
            if survives(item["x"], item["z"], patch, seed, id_hash, radius):
                kept.append(Instance(
                    species=species, tier="T2",
                    x=item["x"], y=item["y"], z=item["z"],
                    yaw=item["yaw"], scale=item["scale"],
                    tilt_x=item["tiltX"], tilt_z=item["tiltZ"],
                    anchor=item["anchor"], sink=item["sink"]))
            else:
                removed[species] += 1
    if not removed:
        return None, removed
    return encode(kept, species_order), removed


def run(bundles: Path, patches_path: Path, seed: int) -> dict:
    patches = vp.load_patches(patches_path)
    index_path = bundles / "vegetation-index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    species_order = list(index.get("speciesOrder", []))
    chunk_area_ha = (float(index.get("chunkMetres", vp.CHUNK_M)) ** 2) / 10_000.0

    receipt_patches = []
    touched: set[str] = set()
    total_removed = 0
    for patch in patches:
        chunks = vp.affected_chunks(patch)
        by_chunk: dict[str, dict] = {}
        patch_removed = 0
        for cx, cz in chunks:
            path = bundles / f"chunk_{cx}_{cz}_vegetation.bin"
            if not path.exists():
                continue
            blob, removed = apply_to_chunk(path, species_order, patch, seed)
            if blob is None:
                continue
            path.write_bytes(blob)
            key = f"{cx}_{cz}"
            touched.add(key)
            n = sum(removed.values())
            patch_removed += n
            by_chunk[key] = {"removed": n,
                             "bySpecies": dict(sorted(removed.items()))}
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

    if touched and index_path.exists():
        index_path.write_text(json.dumps(index, indent=1) + "\n")

    receipt = {
        "schemaVersion": 1,
        "about": ABOUT,
        "seed": seed,
        "patches": receipt_patches,
        "totals": {"removed": total_removed, "chunksTouched": len(touched)},
    }
    (bundles / RECEIPT_NAME).write_text(json.dumps(receipt, indent=1) + "\n")
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

"""The T3 ground-cover ring's candidate loop, in Python, for measuring it.

`apps/world-studio/src/vegetation/Groundcover.tsx` is the runtime. This module
is its twin: the same rules in the same order — region-then-cover swap lookup,
per-rule acceptance, the per-species clump field, the slope gate, the water
gates, and the per-species distance thinning by `fadeM` — so a floor can be
measured from repo files in CI without booting a browser.

**Statistics parity, not position parity.** The runtime draws its randomness
from a 32-bit hash of (tile, species, candidate, salt); this module draws from
numpy's generator. Instance FOR instance the two differ; instances per hectare,
coverage fraction, largest bare radius, entropy and the per-cover species mix
agree, and those are what the gate asserts. The clump field is the exception:
it is a deterministic hash lattice with the same salt in both, so a species'
patches land in the same places in both.

Not modelled here, because none of it is a property of the table: the
settlement/track vegetation patches, the building footprint exclusions and the
budget thinning. All three only ever REMOVE instances, so a floor measured
without them is an upper bound on what the runtime draws — read the numbers as
"the table can do at most this", and keep the floors well inside it.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

from .scale import PROVINCE_EXTENT_M

REPO_ROOT = Path(__file__).resolve().parents[3]
PUBLIC = REPO_ROOT / "apps/world-studio/public/province"
TABLE_PATH = REPO_ROOT / "world/sources/flora/groundcover.json"
KIT_PATH = REPO_ROOT / "apps/world-studio/public/kits/groundcover-province-v1.kit.json"

TILE_M = 16.0
RING_RADIUS_M = 75.0
#: Below this height a species is thinned from 30 m out; above it, from 55 m.
FULL_DENSITY_SHORT_M = 30.0
FULL_DENSITY_TALL_M = 55.0
SHORT_SPECIES_M = 0.6
LAND_MAX_DEPTH_M = 0.5
#: A `waterRule: "above"` species only stands where the water has gone.
DRY_MAX_DEPTH_M = 0.02
REGION_UNKNOWN = -1


# --- the clump field ---------------------------------------------------------

def _hash_lattice(ix: np.ndarray, iz: np.ndarray, salt: int) -> np.ndarray:
    """A deterministic value in [0,1) per integer lattice point.

    Integer mixing only, in uint32, so this is reproducible in TypeScript's
    `Math.imul` to the bit — the runtime uses the identical constants.
    """
    h = np.uint32(0x9E3779B9) ^ (ix.astype(np.uint32) * np.uint32(0x85EBCA6B))
    h = (h ^ (h >> np.uint32(13))) * np.uint32(0xC2B2AE35)
    h = h ^ (iz.astype(np.uint32) * np.uint32(0x27D4EB2F))
    h = (h ^ (h >> np.uint32(15))) * np.uint32(0x165667B1)
    h = h ^ np.uint32((salt * 0x9E3779B1) & 0xFFFFFFFF)
    h = (h ^ (h >> np.uint32(13))) * np.uint32(0x85EBCA6B)
    return _fmix32(h).astype(np.float64) / 4294967296.0


def hash32(a: int, b: int, c: int, d: np.ndarray) -> np.ndarray:
    """The runtime's candidate hash (`hash32` in `ringHash.ts`), vectorised
    over the last argument, bit for bit. The twin used to draw its keep,
    jitter and accept rolls from `np.random`, so `test_no_species_stands_in_rows`
    measured a stream the browser never used and stayed green while the
    runtime's correlated streams drew rows (16f round 3)."""
    m = np.uint32(0xFFFFFFFF)
    h = np.uint32(0x9E3779B9) ^ (np.uint32(a & 0xFFFFFFFF) * np.uint32(0x85EBCA6B))
    h = ((h ^ (h >> np.uint32(13))) * np.uint32(0xC2B2AE35)) ^ (np.uint32(b & 0xFFFFFFFF) * np.uint32(0x27D4EB2F))
    h = ((h ^ (h >> np.uint32(15))) * np.uint32(0x165667B1)) ^ (np.uint32(c & 0xFFFFFFFF) * np.uint32(0x9E3779B1))
    h = ((h ^ (h >> np.uint32(13))) * np.uint32(0x85EBCA6B)) ^ (d.astype(np.uint32) * np.uint32(0xC2B2AE35))
    return _fmix32(h & m)


def u01(h: np.ndarray) -> np.ndarray:
    return h.astype(np.float64) / 4294967296.0


def _fmix32(h: np.ndarray) -> np.ndarray:
    """MurmurHash3's finaliser, uint32. The mixing above folds the salt in
    with one multiply and one shift, which is not an avalanche: consecutive
    salts (consecutive species) gave near-identical fields, and in the
    runtime's candidate hash the same weakness put every plant on one of two
    diagonals per cell (rows; owner, 16f round 3). Mirrors `fmix32` in
    `Groundcover.tsx` bit for bit."""
    h = h.astype(np.uint32)
    h = h ^ (h >> np.uint32(16))
    h = h * np.uint32(0x85EBCA6B)
    h = h ^ (h >> np.uint32(13))
    h = h * np.uint32(0xC2B2AE35)
    h = h ^ (h >> np.uint32(16))
    return h


def clump(x: np.ndarray, z: np.ndarray, wavelength_m: float, salt: int) -> np.ndarray:
    """Bilinear value noise on a `wavelength_m` lattice, in [0,1]."""
    u = x / wavelength_m
    v = z / wavelength_m
    ix = np.floor(u).astype(np.int64)
    iz = np.floor(v).astype(np.int64)
    fx = u - ix
    fz = v - iz
    sx = fx * fx * (3.0 - 2.0 * fx)
    sz = fz * fz * (3.0 - 2.0 * fz)
    c00 = _hash_lattice(ix, iz, salt)
    c10 = _hash_lattice(ix + 1, iz, salt)
    c01 = _hash_lattice(ix, iz + 1, salt)
    c11 = _hash_lattice(ix + 1, iz + 1, salt)
    return (c00 * (1 - sx) + c10 * sx) * (1 - sz) + (c01 * (1 - sx) + c11 * sx) * sz


def distance_keep_fraction(distance_m: np.ndarray, fade_m: float,
                           height_m: float) -> np.ndarray:
    """Fraction of a species' instances surviving at this distance.

    Full density to 30 m for anything under 0.6 m tall and to 55 m for the rest,
    then linear to zero at the species' own `fadeM` (Bethesda's fade BAND and
    Unreal's per-variety cull distance, per species rather than one radius).
    """
    full = FULL_DENSITY_SHORT_M if height_m < SHORT_SPECIES_M else FULL_DENSITY_TALL_M
    if fade_m <= full:
        return (distance_m <= fade_m).astype(np.float64)
    return np.clip((fade_m - distance_m) / (fade_m - full), 0.0, 1.0)


# --- the table ---------------------------------------------------------------

def load_table(table_path: Path | str = TABLE_PATH) -> dict:
    return json.loads(Path(table_path).read_text())


def build_plans(table: dict) -> list[dict]:
    """One plan per species: its peak density, and its rule per (region, cover).

    Identical to `buildPlans()` in the runtime, including the region -1 slot
    that holds the unswapped base table.
    """
    by_cover = table["byLandCover"]
    by_region = table.get("byRegionClass", {})
    plans: dict[str, dict] = {}
    for region in [REGION_UNKNOWN] + [int(r) for r in by_region]:
        for cover in by_cover:
            swap = by_region.get(str(region), {}).get("swaps", {}).get(cover)
            for rule in (swap if swap is not None else by_cover[cover]["species"]):
                plan = plans.setdefault(rule["asset"], {
                    "id": rule["asset"], "index": len(plans), "maxDensity": 0.0,
                    "bySlot": {}, "anyRule": rule, "needsWater": False})
                plan["bySlot"][(region, int(cover))] = rule
                plan["maxDensity"] = max(plan["maxDensity"], rule["density"])
                if rule.get("waterRule") == "below-at-least":
                    plan["needsWater"] = True
    return list(plans.values())


# --- the rasters -------------------------------------------------------------

class RingInputs:
    """Everything the ring samples, loaded once. Raises if any is missing."""

    def __init__(self) -> None:
        from .regions import REGION_CLASSES
        from .water_report import ShippedWater

        cover_img = np.asarray(Image.open(PUBLIC / "refined/ground-control.png")
                               .convert("RGB"))
        self.cover = cover_img[..., 0]
        self.cover_mpt = PROVINCE_EXTENT_M / self.cover.shape[0]

        reg = np.asarray(Image.open(PUBLIC / "hydro-regions.png")
                         .convert("RGB")).astype(np.int32)
        self.region = np.full(reg.shape[:2], REGION_UNKNOWN, dtype=np.int16)
        for rid, (_name, colour) in REGION_CLASSES.items():
            hit = ((reg[..., 0] == colour[0]) & (reg[..., 1] == colour[1])
                   & (reg[..., 2] == colour[2]))
            self.region[hit] = rid
        self.region_mpt = PROVINCE_EXTENT_M / self.region.shape[0]

        water = ShippedWater()
        self.depth = water.signed_depth_m("wet")
        self.depth_mpp = water.mpp2
        ground = water.refined if water.refined is not None else water.ground2
        if ground is None:
            raise FileNotFoundError("no ground heights in the shipped water report")
        self.ground = ground
        self.ground_mpt = PROVINCE_EXTENT_M / (ground.shape[0] - 1)

    @staticmethod
    def _sample(grid, mpp, x, z):
        n = grid.shape[0]
        ix = np.clip((np.asarray(x) / mpp).astype(np.int64), 0, n - 1)
        iz = np.clip((np.asarray(z) / mpp).astype(np.int64), 0, n - 1)
        return grid[iz, ix]

    def cover_at(self, x, z):
        return self._sample(self.cover, self.cover_mpt, x, z)

    def region_at(self, x, z):
        return self._sample(self.region, self.region_mpt, x, z)

    def depth_at(self, x, z):
        return self._sample(self.depth, self.depth_mpp, x, z)

    def height_at(self, x, z):
        return self._sample(self.ground, self.ground_mpt, x, z)


def inputs_available() -> bool:
    try:
        RingInputs()
    except Exception:
        return False
    return True


# --- the ring ----------------------------------------------------------------

def place(table: dict, site_xz, radius_m: float = RING_RADIUS_M,
          data: RingInputs | None = None, seed: int = 12345) -> dict:
    """Every instance the table asks for around `site_xz`, per species."""
    data = data or RingInputs()
    cx, cz = float(site_xz[0]), float(site_xz[1])
    plans = build_plans(table)
    wavelength = float(table.get("clumpWavelengthM", 12))
    rng = np.random.default_rng(seed)
    tile_ha = TILE_M * TILE_M / 10_000.0
    ftx, ftz = math.floor(cx / TILE_M), math.floor(cz / TILE_M)
    reach = math.ceil(radius_m / TILE_M)
    out: dict[str, tuple[np.ndarray, np.ndarray]] = {}

    for plan in plans:
        max_density = plan["maxDensity"]
        if max_density <= 0:
            continue
        candidates = max_density * tile_ha
        g = max(1, math.ceil(math.sqrt(candidates)))
        cell = TILE_M / g
        keep_p = candidates / (g * g)
        xs: list[np.ndarray] = []
        zs: list[np.ndarray] = []
        for tz in range(ftz - reach, ftz + reach + 1):
            for tx in range(ftx - reach, ftx + reach + 1):
                near = math.hypot(
                    max(0.0, abs(cx - (tx + 0.5) * TILE_M) - TILE_M / 2),
                    max(0.0, abs(cz - (tz + 0.5) * TILE_M) - TILE_M / 2))
                if near > radius_m:
                    continue
                # The SAME streams the runtime draws (Groundcover.tsx): keep
                # on salt k*8, the x and z jitter on k*8+1 and k*8+2, accept
                # on k*8+3. Anything else here would measure a ring nobody
                # sees.
                ks = np.arange(g * g)
                k = ks[u01(hash32(tx, tz, plan["index"], ks * 8)) < keep_p]
                if k.size == 0:
                    continue
                # Stratified: one candidate per cell, uniform over the WHOLE
                # cell. A fixed jitter amplitude smaller than the cell leaves
                # the lattice visible as rows wherever the cell is wide.
                x = tx * TILE_M + ((k % g) + u01(hash32(tx, tz, plan["index"], k * 8 + 1))) * cell
                z = tz * TILE_M + ((k // g) + u01(hash32(tx, tz, plan["index"], k * 8 + 2))) * cell
                accept_roll = u01(hash32(tx, tz, plan["index"], k * 8 + 3))

                # Region THEN cover, exactly as the runtime resolves it.
                region = data.region_at(x, z)
                cover = data.cover_at(x, z)
                density = np.full(x.size, np.nan)
                slope_max = np.full(x.size, np.nan)
                fade = np.full(x.size, np.nan)
                height = np.full(x.size, np.nan)
                max_depth = np.full(x.size, np.nan)
                below = np.zeros(x.size, bool)
                dry = np.zeros(x.size, bool)
                for (r_id, c_id), rule in plan["bySlot"].items():
                    hit = (region == r_id) & (cover == c_id)
                    if not hit.any():
                        continue
                    density[hit] = rule["density"]
                    slope_max[hit] = rule["slopeDegMax"]
                    # The pre-16f table carried neither field; a v2 table
                    # measured for a before/after reads as "no thinning".
                    fade[hit] = rule.get("fadeM", radius_m)
                    height[hit] = rule.get("heightM", 1.0)
                    below[hit] = rule.get("waterRule") == "below-at-least"
                    dry[hit] = rule.get("waterRule") == "above"
                    max_depth[hit] = rule.get("maxDepthM", 1.5)
                ok = ~np.isnan(density)
                if not ok.any():
                    continue
                x, z = x[ok], z[ok]
                accept_roll = accept_roll[ok]
                density, slope_max = density[ok], slope_max[ok]
                fade, height, below, max_depth = (fade[ok], height[ok],
                                                  below[ok], max_depth[ok])
                dry = dry[ok]

                # Acceptance = the cover's share of the species' peak density,
                # modulated by the species' own clump field so that within a
                # cover the two or three species trade dominance in patches.
                c = clump(x, z, wavelength, plan["index"])
                p = np.clip((density / max_density) * (0.35 + 1.3 * c), 0.0, 1.0)
                acc = accept_roll < p
                x, z = x[acc], z[acc]
                slope_max, fade, height = slope_max[acc], fade[acc], height[acc]
                below, max_depth, dry = below[acc], max_depth[acc], dry[acc]
                if x.size == 0:
                    continue

                distance = np.hypot(cx - x, cz - z)
                keep = np.zeros(x.size)
                for f, h in {(float(a), float(b))
                             for a, b in zip(fade, height)}:
                    same = (fade == f) & (height == h)
                    keep[same] = distance_keep_fraction(distance[same], f, h)
                alive = (distance <= radius_m) & (rng.random(x.size) < keep)
                x, z = x[alive], z[alive]
                slope_max, below, max_depth = (slope_max[alive], below[alive],
                                               max_depth[alive])
                dry = dry[alive]
                if x.size == 0:
                    continue

                h0 = data.height_at(x, z)
                slope = np.degrees(np.arctan(np.hypot(
                    data.height_at(x + 2, z) - h0,
                    data.height_at(x, z + 2) - h0) / 2.0))
                fits = slope <= slope_max
                x, z, below, max_depth = x[fits], z[fits], below[fits], max_depth[fits]
                dry = dry[fits]
                if x.size == 0:
                    continue

                depth = data.depth_at(x, z)
                wet = np.where(
                    below, (depth > 0.02) & (depth <= max_depth),
                    np.where(dry, depth <= DRY_MAX_DEPTH_M,
                             depth <= LAND_MAX_DEPTH_M))
                x, z = x[wet], z[wet]
                if x.size:
                    xs.append(x)
                    zs.append(z)
        if xs:
            out[plan["id"]] = (np.concatenate(xs), np.concatenate(zs))
    return out


def measure(site_xz, radius_m: float = RING_RADIUS_M,
            table_path: Path | str = TABLE_PATH,
            data: RingInputs | None = None, seed: int = 12345) -> dict:
    """Instances/ha, coverage fraction, largest bare radius, entropy, mix.

    Coverage is the union of a disc of radius max(sizeM)/2 per instance,
    rasterised at 0.5 m, over the LAND inside the ring (depth <= 0.5 m).
    """
    from scipy import ndimage

    data = data or RingInputs()
    table = load_table(table_path)
    kit = json.loads(KIT_PATH.read_text())
    radius_of = {a["id"]: max(a["sizeM"]) / 2.0 for a in kit["assets"]}
    instances = place(table, site_xz, radius_m, data, seed)

    cx, cz = float(site_xz[0]), float(site_xz[1])
    px = 0.5
    n = int(round(2 * radius_m / px))
    gx = cx - radius_m + (np.arange(n) + 0.5) * px
    gz = cz - radius_m + (np.arange(n) + 0.5) * px
    gxx, gzz = np.meshgrid(gx, gz)
    in_ring = (gxx - cx) ** 2 + (gzz - cz) ** 2 <= radius_m * radius_m
    land = in_ring & (data.depth_at(gxx, gzz) <= LAND_MAX_DEPTH_M)
    land_m2 = float(land.sum()) * px * px

    covered = np.zeros((n, n), bool)
    counts: dict[str, int] = {}
    for asset, (xs, zs) in instances.items():
        counts[asset] = int(xs.size)
        r = radius_of.get(asset, 0.3)
        rr = int(math.ceil(r / px))
        yy, xx = np.ogrid[-rr:rr + 1, -rr:rr + 1]
        disc = (xx * xx + yy * yy) * px * px <= r * r
        ix = ((xs - (cx - radius_m)) / px).astype(int)
        iz = ((zs - (cz - radius_m)) / px).astype(int)
        for a, b in zip(ix, iz):
            x0, x1 = max(0, a - rr), min(n, a + rr + 1)
            z0, z1 = max(0, b - rr), min(n, b + rr + 1)
            if x0 >= x1 or z0 >= z1:
                continue
            covered[z0:z1, x0:x1] |= disc[z0 - (b - rr):z1 - (b - rr),
                                          x0 - (a - rr):x1 - (a - rr)]
    total = int(sum(counts.values()))
    empty = land & ~covered
    bare = float((ndimage.distance_transform_edt(empty.astype(np.uint8)) * px)
                 [land].max()) if land.any() else 0.0
    entropy = 0.0
    for c in counts.values():
        if c:
            share = c / total
            entropy -= share * math.log2(share)

    # Which species each painted cover actually produced — the mix the table
    # promised, read back off the ground rather than off the table.
    per_cover: dict[int, set[str]] = {}
    for asset, (xs, zs) in instances.items():
        for cover in np.unique(data.cover_at(xs, zs)):
            per_cover.setdefault(int(cover), set()).add(asset)

    return {
        "instances": total,
        "perHectare": total / (land_m2 / 10_000.0) if land_m2 else 0.0,
        "coverage": float((covered & land).sum()) * px * px / land_m2 if land_m2 else 0.0,
        "largestBareRadiusM": bare,
        "entropyBits": entropy,
        "landM2": land_m2,
        "counts": counts,
        "speciesPerCover": {c: sorted(v) for c, v in sorted(per_cover.items())},
    }

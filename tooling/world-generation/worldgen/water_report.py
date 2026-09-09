"""Read the SHIPPED province water and report it at named sites.

One place that knows how to open the compiled water outputs and turn a world
coordinate into numbers. `test_water_invariants.py` asserts on these same
readings; this module is the human-facing half — it prints the evidence table
that goes to the owner with a studio URL per row, so a review round is argued
with measurements instead of screenshots.

    python3 -m worldgen.water_report            # the owner's review sites
    python3 -m worldgen.water_report 2660 900   # any world x, z in metres
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from .compile_chunks import DEFAULT_HEIGHTS
from .compile_water import WEB_STEP, decode_surface, export_index
from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
WATER_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "water"
CLASS_NAMES = ("none", "coast", "estuary", "river", "lake", "marsh")


class ShippedWater:
    """The compiled water as it ships, on its own grids."""

    def __init__(self, water_dir: Path = WATER_DIR, heights: Path = DEFAULT_HEIGHTS):
        self.meta = json.loads((water_dir / "water-meta.json").read_text())
        rgb = np.asarray(Image.open(water_dir / self.meta["surface"]["file"]).convert("RGB"))
        self.w2, self.depth2 = decode_surface(rgb, self.meta)
        self.mpp2 = float(self.meta["surface"]["metresPerPixel"])
        shore = np.asarray(Image.open(water_dir / "water-shore.png").convert("RGB"))
        self.shore2 = shore[..., 0].astype(np.float32) / 255.0 * float(self.meta["surface"]["shoreMaxM"])
        self.season2 = shore[..., 1].astype(np.float32) / 255.0
        self.owner2 = np.asarray(Image.open(water_dir / "water-owner.png").convert("L"))
        klass = np.asarray(Image.open(water_dir / "water-class.png").convert("RGB"))
        self.cls = klass[..., 0]
        self.mppc = float(self.meta["klass"]["metresPerPixel"])
        flow = np.asarray(Image.open(water_dir / "water-flow.png").convert("RGB"))
        self.flow = flow[..., 2].astype(np.float32) / 255.0 * float(self.meta["flow"]["flowMax"])
        self.mppf = float(self.meta["flow"]["metresPerPixel"])
        # The full-resolution ground lives in the asset vault, which a clean
        # checkout (CI) does not have. Everything the shipped rasters answer on
        # their own — depth, wetness, class, flow, shore — must still work
        # there, or a gate that reads the water it ships cannot run in CI.
        # Callers that need `refined`/`ground2` get a clear error instead of a
        # missing attribute.
        self.refined = None
        self.ground2 = None
        if heights is not None and Path(heights).exists():
            self.refined = np.load(heights).astype(np.float32)
            i2 = export_index(self.refined.shape[0], WEB_STEP)
            self.ground2 = self.refined[np.ix_(i2, i2)]
        self.klass = klass          # R class, G turbidity, B salinity
        self.tannin2 = shore[..., 2].astype(np.float32) / 255.0
        self.wet2 = self.depth2 > 0.0

    # --- season -----------------------------------------------------------
    #
    # THE province has a wet and a dry season and the bake publishes both, so
    # "is there water here" is not a question with one answer. Every consumer
    # asks it through `signed_depth_m(season)` / `wet_grid(season)` and has to
    # name the season it means; nothing else may open these PNGs. The names
    # are the two ends of the runtime rule in `water-meta.json`
    # (`season.runtime`), evaluated at seasonWetness 0 and 1.
    SEASONS = {"dry": 0.0, "base": 0.0, "wet": 1.0}

    def season_wetness(self, season: str | float) -> float:
        """Resolve a season name (or a raw 0..1 wetness) to a wetness."""
        if isinstance(season, (int, float)):
            return float(np.clip(float(season), 0.0, 1.0))
        try:
            return self.SEASONS[season]
        except KeyError:
            raise ValueError(
                f"unknown season {season!r}; use one of {sorted(self.SEASONS)} "
                f"or a wetness in 0..1") from None

    def signed_depth_m(self, season: str | float) -> np.ndarray:
        """Signed depth over the surface grid at a named season, metres.

        Negative is dry ground above the local water table. At `wet` this is
        the seasonal maximum: base depth lifted by the per-body response in
        `water-shore.png` G times `season.amplitudeM`.
        """
        wetness = self.season_wetness(season)
        if wetness == 0.0:
            return self.depth2
        amplitude = float(self.meta["season"]["amplitudeM"])
        return (self.depth2 + amplitude * self.season2 * wetness).astype(np.float32)

    def wet_grid(self, season: str | float) -> np.ndarray:
        """MEASURED standing water at a named season: signed depth > 0."""
        return self.signed_depth_m(season) > 0.0

    # --- grid lookups -----------------------------------------------------

    def _tex(self, grid: np.ndarray, x: float, z: float, mpp: float):
        n = grid.shape[0]
        return grid[int(np.clip(z / mpp, 0, n - 1)), int(np.clip(x / mpp, 0, n - 1))]

    def at(self, x: float, z: float) -> dict:
        """Everything the shipped rasters say about one world point."""
        return {
            "surfaceM": float(self._tex(self.w2, x, z, self.mpp2)),
            "depthM": float(self._tex(self.depth2, x, z, self.mpp2)),
            "groundM": (float(self._tex(self.ground2, x, z, self.mpp2))
                        if self.ground2 is not None else float("nan")),
            "wet": bool(self._tex(self.wet2, x, z, self.mpp2)),
            "shoreM": float(self._tex(self.shore2, x, z, self.mpp2)),
            "season": float(self._tex(self.season2, x, z, self.mpp2)),
            "owner": int(self._tex(self.owner2, x, z, self.mpp2)),
            "class": CLASS_NAMES[int(self._tex(self.cls, x, z, self.mppc))],
            "flowMS": float(self._tex(self.flow, x, z, self.mppf)),
        }

    def disc(self, x: float, z: float, radius_m: float):
        """(slice, mask) over the surface grid within `radius_m` of a point."""
        n = self.w2.shape[0]
        cy, cx = int(z / self.mpp2), int(x / self.mpp2)
        r = int(np.ceil(radius_m / self.mpp2))
        y0, y1 = max(cy - r, 0), min(cy + r + 1, n)
        x0, x1 = max(cx - r, 0), min(cx + r + 1, n)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        return (slice(y0, y1), slice(x0, x1)), np.hypot(yy - cy, xx - cx) * self.mpp2 <= radius_m

    def body_flatness(self, x: float, z: float, radius_m: float = 200.0):
        """Spread of the water surface over the wet cells around a point, and
        their area — a lake reads as one flat body, a domed blob does not."""
        sl, mask = self.disc(x, z, radius_m)
        wet = self.wet2[sl] & mask
        if not wet.any():
            return {"wetCells": 0, "areaM2": 0.0, "spreadM": 0.0}
        w = self.w2[sl][wet]
        return {"wetCells": int(wet.sum()),
                "areaM2": float(wet.sum()) * self.mpp2 ** 2,
                "spreadM": float(w.max() - w.min())}

    def nearest_cascade(self, x: float, z: float):
        """(id, distance in metres, drop) of the compiled fall nearest a point."""
        best = None
        for c in self.meta.get("cascades", []):
            d = float(np.hypot(c["plunge"]["x"] - x, c["plunge"]["z"] - z))
            if best is None or d < best[1]:
                best = (c["id"], d, float(c["dropM"]))
        return best

    @staticmethod
    def cliff_angle_deg(cascade: dict) -> float:
        """How steep a cascade really is: its drop over the horizontal run
        from lip to plunge, in degrees.

        Measured on the cascade's own geometry rather than per sample of the
        exported profile — that profile is resampled at 1 m from a bilinearly
        sampled 1.83 m terrain grid, so it smears a genuine one-cell cliff
        across two or three samples and reads it as a ramp. This is also the
        line the renderer throws the sheet along.
        """
        dx = cascade["plunge"]["x"] - cascade["lip"]["x"]
        dz = cascade["plunge"]["z"] - cascade["lip"]["z"]
        run = float(np.hypot(dx, dz))
        return float(np.degrees(np.arctan(cascade["dropM"] / max(run, 1e-6))))

    def puddles_under(self, x: float, z: float, radius_m: float, area_m2: float) -> int:
        """Count of separate wet patches smaller than `area_m2` around a point
        — the marsh speckle the owner reported as floating plates."""
        sl, mask = self.disc(x, z, radius_m)
        lab, n = ndimage.label(self.wet2[sl] & mask)
        if not n:
            return 0
        sizes = np.bincount(lab.ravel())[1:] * self.mpp2 ** 2
        return int((sizes < area_m2).sum())


def _fmt(v) -> str:
    return f"{v:.2f}" if isinstance(v, float) else str(v)


def main(argv: list[str]) -> int:
    s = ShippedWater()
    if len(argv) >= 2:
        x, z = float(argv[0]), float(argv[1])
        for k, v in s.at(x, z).items():
            print(f"  {k:9} {_fmt(v)}")
        print(f"  {'body':9} {s.body_flatness(x, z)}")
        print(f"  {'cascade':9} {s.nearest_cascade(x, z)}")
        return 0

    print(f"# shipped water at the owner's review sites "
          f"(schema {s.meta['schemaVersion']}, {len(s.meta.get('cascades', []))} cascades)\n")
    for site, (x, z) in OWNER_SITES.items():
        r = s.at(x, z)
        print(f"{site:18} x={x:>5.0f} z={z:>5.0f}  {r['class']:7} "
              f"{'wet' if r['wet'] else 'dry':3} depth {r['depthM']:6.2f} m  "
              f"surface {r['surfaceM']:7.2f} m  ground {r['groundM']:7.2f} m  "
              f"flow {r['flowMS']:4.2f} m/s  shore {r['shoreM']:5.1f} m  season {r['season']:4.2f}")
    print("\n# every cascade: is it a cliff (>= 70 deg from lip to plunge) and how deep is its pool")
    for c in sorted(s.meta.get("cascades", []), key=lambda c: -c["dropM"]):
        angle = s.cliff_angle_deg(c)
        sl, mask = s.disc(c["plunge"]["x"], c["plunge"]["z"], 40.0)
        wet = mask & s.wet2[sl]
        pool = float(s.depth2[sl][wet].max()) if wet.any() else 0.0
        print(f"{c['id']:9} drop {c['dropM']:6.1f} m  {angle:5.1f} deg  pool {pool:5.2f} m  "
              f"lip {c['lip']['x']:.0f}/{c['lip']['z']:.0f}"
              f"{'   <-- RAMP, not a cliff' if angle < 70.0 else ''}")
    return 0


OWNER_SITES = {
    "dry-mud": (4570, 3870),
    "lowland-river": (1850, 4890),
    "marsh": (1500, 5280),
    "recarved-channel": (2660, 900),
    "above-the-fall": (2470, 300),
    "gorge-fall-foot": (2530, 320),
    "deep-basin": (1470, 4130),
    "basin-south-patch": (1590, 4250),
    "slope-site-a": (1827, 2093),
    "slope-site-b": (1816, 1810),
    "mountain-stream": (1750, 1740),
    "bay": (6160, 5070),
    "beach": (6100, 1640),
    "mountain-lake": (380, 1440),
}


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

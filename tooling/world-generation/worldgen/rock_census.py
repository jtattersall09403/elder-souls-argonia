"""Measure every rock the SHIPPED bundles place against the ground it stands
on and the mined figures it claims to follow (16f round 4).

The layer tests in `test_rock_layers.py` check the palette; this checks the
product. It decodes `province/vegetation/chunk_*_vegetation.bin`, re-reads
the province rasters the compiler used, and for each rock instance measures:

* **float** — how far the mesh's BASE plane stands above the ground anywhere
  under its footprint (metres; > 0 is a visible gap, a hollow underside
  showing). The base is `pivotAboveBaseM` below the pivot along the model's
  own up-axis, tilted as the instance was baked.
* **tilt** — the total off-vertical angle of the model's up-axis, degrees,
  against the mined `tiltDeg` p95 (the mine's `tilt_deg` is exactly this
  quantity: `hypot(rotX, rotY)` of the placed reference).
* **scale** — against the mined p5-p95.
* **sink** — the shipped pivot sink against the mined `sinkM` p50 band.
* **back** — for an open-backed shell, how far its open face is from
  pointing uphill, degrees.

Run:  python3 -m worldgen.rock_census --near 850,5100 --radius 40
      python3 -m worldgen.rock_census --summary
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path

from . import rock_dressing as rd
from .scatter import base_plane_normal, decode, terrain_aim

REPO_ROOT = Path(__file__).resolve().parents[3]
VEGETATION = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "vegetation"

#: Bearings sampled on the footprint ellipse (plus the centre).
SAMPLES = 8
#: A base plane this far above the ground anywhere under the footprint is a
#: visible gap on a hollow underside (the raster's own noise is ~0.1 m).
FLOAT_TOLERANCE_M = 0.15
#: A mesh whose top is this far under the ground has been swallowed.
SWALLOWED_M = 0.0


def is_rock(species: str) -> bool:
    return "/rocks/" in species or "shorerock" in species


@dataclass
class RockMeasure:
    chunk: tuple[int, int]
    species: str
    x: float
    z: float
    scale: float
    yaw_deg: float
    tilt_deg: float
    sink_m: float
    slope_deg: float
    float_m: float
    """Max height of the base plane over the ground under the footprint."""
    top_above_ground_m: float
    """Height of the mesh top over the LOWEST ground under the footprint."""
    back_off_uphill_deg: float | None
    mined_tilt_p50: float
    mined_tilt_p95: float
    mined_sink_p50: float
    mined_scale: tuple[float, float]
    underside: float

    @property
    def floats(self) -> bool:
        return self.float_m > FLOAT_TOLERANCE_M

    @property
    def over_tilted(self) -> bool:
        return self.tilt_deg > self.mined_tilt_p95 + 1e-6

    @property
    def off_scale(self) -> bool:
        lo, hi = self.mined_scale
        return not (lo - 1e-3 <= self.scale <= hi + 1e-3)

    @property
    def back_outward(self) -> bool:
        return self.back_off_uphill_deg is not None and self.back_off_uphill_deg > 45.0

    @property
    def swallowed(self) -> bool:
        return self.top_above_ground_m < SWALLOWED_M

    def defects(self) -> list[str]:
        out = []
        if self.floats:
            out.append(f"floats {self.float_m:.2f} m")
        if self.over_tilted:
            out.append(f"tilt {self.tilt_deg:.1f} > p95 {self.mined_tilt_p95:.1f}")
        if self.off_scale:
            out.append(f"scale {self.scale:.2f} off {self.mined_scale}")
        if self.back_outward:
            out.append(f"open back {self.back_off_uphill_deg:.0f} deg off uphill")
        if self.swallowed:
            out.append(f"top {self.top_above_ground_m:.2f} m under ground")
        return out


def _manifest_entry(species: str) -> dict:
    return rd._manifest()[species]


def measure(inst: dict, species: str, chunk: tuple[int, int], fields) -> RockMeasure:
    entry = _manifest_entry(species)
    size = entry["sizeM"]
    pivot_above_base = float(entry.get("pivotAboveBaseM") or 0.0)
    m = rd.mined(species)
    x, z = inst["x"], inst["z"]
    yaw, tx, tz, scale, sink = (inst["yaw"], inst["tiltX"], inst["tiltZ"],
                                inst["scale"], inst["sink"])
    nx, ny, nz = base_plane_normal(yaw, tx, tz)
    ground0 = fields.height(x, z)
    pivot_y = ground0 - sink
    # The base point: the pivot moved down the model's up-axis by the pivot's
    # height above the base (scaled). Its plane has the same normal.
    bx = x - nx * pivot_above_base * scale
    by = pivot_y - ny * pivot_above_base * scale
    bz = z - nz * pivot_above_base * scale
    rx, rz = size[0] / 2.0 * scale, size[1] / 2.0 * scale
    cy, sy = math.cos(yaw), math.sin(yaw)
    worst = by - fields.height(bx, bz)
    lowest_ground = fields.height(bx, bz)
    if abs(ny) > 1e-6:
        for i in range(SAMPLES):
            theta = math.tau * i / SAMPLES
            lx, lz = rx * math.cos(theta), rz * math.sin(theta)
            dx = lx * cy + lz * sy
            dz = -lx * sy + lz * cy
            plane = by - (nx * dx + nz * dz) / ny
            ground = fields.height(bx + dx, bz + dz)
            worst = max(worst, plane - ground)
            lowest_ground = min(lowest_ground, ground)
    # Swallowed = nothing of the mesh shows anywhere: its top is under even
    # the LOWEST ground beneath its footprint. Measured against the lowest
    # sample, not the pivot's, because a cliff shell is buried at its pivot
    # by design (rockcliff02: mined sink 8.6 m at the pivot) and its face
    # shows down the slope.
    top = pivot_y + ny * (size[2] - pivot_above_base) * scale
    back = rd.open_back_yaw_deg(species)
    off = None
    if back is not None:
        aim, _pitch = terrain_aim(fields, x, z)
        world_back = math.radians(back) + yaw
        delta = (world_back - (aim + math.pi) + math.pi) % math.tau - math.pi
        off = abs(math.degrees(delta))
    return RockMeasure(
        chunk=chunk, species=species, x=x, z=z, scale=scale,
        yaw_deg=math.degrees(yaw) % 360.0,
        tilt_deg=math.degrees(math.acos(max(-1.0, min(1.0, ny)))),
        sink_m=sink, slope_deg=fields.slope(x, z), float_m=worst,
        top_above_ground_m=top - lowest_ground, back_off_uphill_deg=off,
        mined_tilt_p50=m["tilt_p50"], mined_tilt_p95=m["tilt_p95"],
        mined_sink_p50=m["sink_p50"],
        mined_scale=(m["scale_p5"], m["scale_p95"]),
        underside=rd.underside_cover(species),
    )


def load_fields(vegetation: Path = VEGETATION):
    from .compile_scatter import ProvinceFields
    return ProvinceFields().as_fields()


def species_order(vegetation: Path = VEGETATION) -> list[str]:
    return json.loads((vegetation / "vegetation-index.json").read_text())["speciesOrder"]


def iter_rocks(vegetation: Path = VEGETATION, chunks=None):
    """(chunk, species, instance dict) for every rock in the shipped bundles."""
    order = species_order(vegetation)
    paths = sorted(vegetation.glob("chunk_*_vegetation.bin"))
    for path in paths:
        _, cx, cz, _ = path.stem.split("_")
        chunk = (int(cx), int(cz))
        if chunks is not None and chunk not in chunks:
            continue
        for group in decode(path.read_bytes()):
            species = order[group["index"]]
            if not is_rock(species):
                continue
            for inst in group["instances"]:
                yield chunk, species, inst


def census(fields, vegetation: Path = VEGETATION, chunks=None,
           near: tuple[float, float] | None = None, radius_m: float = 40.0
           ) -> list[RockMeasure]:
    out = []
    for chunk, species, inst in iter_rocks(vegetation, chunks):
        if near is not None and math.hypot(inst["x"] - near[0], inst["z"] - near[1]) > radius_m:
            continue
        out.append(measure(inst, species, chunk, fields))
    return out


def summarise(rows: list[RockMeasure]) -> dict:
    n = len(rows) or 1
    by_species: dict[str, dict] = {}
    for r in rows:
        s = by_species.setdefault(r.species, {"n": 0, "floats": 0, "overTilt": 0,
                                              "offScale": 0, "backOut": 0, "swallowed": 0})
        s["n"] += 1
        s["floats"] += r.floats
        s["overTilt"] += r.over_tilted
        s["offScale"] += r.off_scale
        s["backOut"] += r.back_outward
        s["swallowed"] += r.swallowed
    return {
        "rocks": len(rows),
        "floats": sum(r.floats for r in rows),
        "overTilt": sum(r.over_tilted for r in rows),
        "offScale": sum(r.off_scale for r in rows),
        "backOut": sum(r.back_outward for r in rows),
        "swallowed": sum(r.swallowed for r in rows),
        "floatShare": round(sum(r.floats for r in rows) / n, 4),
        "overTiltShare": round(sum(r.over_tilted for r in rows) / n, 4),
        "bySpecies": by_species,
    }


def chunk_of(x: float, z: float) -> tuple[int, int]:
    from .compile_scatter import CHUNK_M
    return int(x // CHUNK_M), int(z // CHUNK_M)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--near", help="x,z in metres")
    ap.add_argument("--radius", type=float, default=40.0)
    ap.add_argument("--summary", action="store_true", help="whole province")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    fields = load_fields()
    if args.near:
        x, z = (float(v) for v in args.near.split(","))
        cx, cz = chunk_of(x, z)
        chunks = {(cx + i, cz + j) for i in (-1, 0, 1) for j in (-1, 0, 1)}
        rows = census(fields, chunks=chunks, near=(x, z), radius_m=args.radius)
        rows.sort(key=lambda r: math.hypot(r.x - x, r.z - z))
        for r in rows:
            d = math.hypot(r.x - x, r.z - z)
            print(f"{d:5.1f} m  {r.species.split('/')[-1]:18s} scale {r.scale:.2f} "
                  f"yaw {r.yaw_deg:5.1f} tilt {r.tilt_deg:5.1f} (p50 {r.mined_tilt_p50:.1f}/p95 {r.mined_tilt_p95:.1f}) "
                  f"sink {r.sink_m:.2f} (p50 {r.mined_sink_p50:.2f}) slope {r.slope_deg:4.1f} "
                  f"float {r.float_m:+.2f} top {r.top_above_ground_m:+.2f} under {r.underside:.2f} "
                  f"back {'' if r.back_off_uphill_deg is None else f'{r.back_off_uphill_deg:.0f}deg'} "
                  f"{'DEFECT: ' + '; '.join(r.defects()) if r.defects() else ''}")
        print(json.dumps(summarise(rows), indent=1) if args.json else summarise(rows))
    else:
        rows = census(fields)
        print(json.dumps(summarise(rows), indent=1))


if __name__ == "__main__":
    main()

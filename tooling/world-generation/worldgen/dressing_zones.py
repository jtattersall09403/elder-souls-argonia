"""Authored dressing zones: a polygon with a palette overlay (16f
deliverable 4, decision 0070).

A zone is the mechanism any later phase reuses for local dressing a region
palette cannot express — a named boulder field, a burnt patch, a battlefield's
debris. The record is `world/sources/flora/dressing-zones.json`: an id, a
polygon in world metres, a lore `why` with its sources, and an `overlay`
naming a builder here. The NUMBERS stay with the mined rules in
`rock_dressing`; the record never types a density.

Zone layers are ADDITIVE: they are appended to the region palettes the polygon
touches and suppress nothing, so inside the polygon the zone's rocks stand on
top of the region's own dressing. The scatter gates them with `Layer.zone`
against `Fields.zone`, which the compiler rasterises from the polygons.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from . import rock_dressing as rd

REPO_ROOT = Path(__file__).resolve().parents[3]
ZONES_PATH = REPO_ROOT / "world" / "sources" / "flora" / "dressing-zones.json"
SCHEMA_VERSION = 1


def _boulder_field(zone_id: str) -> list[dict]:
    """A named field of loose stone: the freestanding ladder at field density
    with the heroes raised, spaced so a player walks BETWEEN the rocks.

    Every shape figure still comes from the mined record (`rock_layer`); this
    builder only changes the shares, the density, how tightly the stones
    gather and how far apart they must stand.
    """
    shares = {f"{rd._ROCK}rockl01": 0.25, f"{rd._ROCK}rockl04": 0.25,
              f"{rd._ROCK}rockl05": 0.15, f"{rd._ROCK}rockm03": 0.20,
              f"{rd._ROCK}rocks01": 0.05, f"{rd._ROCK}rocks02": 0.05,
              f"{rd._ROCK}rocks03": 0.05}
    out = []
    for species, share in shares.items():
        layer = rd.rock_layer(species, 90.0 * share, region_classes=[],
                              zone=zone_id)
        layer["clump_radius_m"] = 9.0
        layer["singleton_share"] = 0.05
        # Nooks and passages: a field you can walk into needs more than the
        # scatter's no-overlap floor between its stones.
        layer["clearance_radius_m"] = round(
            rd.footprint_half_diagonal_m(species) + 1.2, 2)
        layer["note"] += (f"; dressing zone {zone_id}: hero-weighted field at "
                          "90/ha, clump radius 9 m, clearance +1.2 m so the "
                          "stones never touch")
        out.append(layer)
    for layer in rd.rock_piles((), 20.0, zone=zone_id):
        layer["note"] += f"; dressing zone {zone_id}"
        out.append(layer)
    return out


#: overlay name -> builder(zone_id) -> layers.
ZONE_OVERLAYS = {"boulder-field": _boulder_field}


def load_zones(path: Path = ZONES_PATH) -> list[dict]:
    """Validated zone records. Raises on anything a compile cannot honour."""
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"{path.name}: schemaVersion "
                         f"{doc.get('schemaVersion')} != {SCHEMA_VERSION}")
    seen: set[str] = set()
    zones = doc.get("zones", [])
    for zone in zones:
        zid = zone.get("id")
        if not zid or zid in seen:
            raise ValueError(f"{path.name}: missing or duplicate zone id {zid!r}")
        seen.add(zid)
        if not zone.get("kind"):
            raise ValueError(f"{zid}: no kind")
        poly = zone.get("polygonM") or []
        if len(poly) < 3 or any(len(p) != 2 for p in poly):
            raise ValueError(f"{zid}: polygonM needs >= 3 [x, z] points")
        if zone.get("overlay") not in ZONE_OVERLAYS:
            raise ValueError(f"{zid}: overlay {zone.get('overlay')!r} is not a "
                             f"builder ({sorted(ZONE_OVERLAYS)})")
        if not zone.get("why") or not zone.get("sources"):
            raise ValueError(f"{zid}: every zone carries a lore why + sources")
    return zones


def zone_layers(zones: list[dict] | None = None) -> list[dict]:
    """Every zone's overlay layers, each carrying its own `zone` gate."""
    out = []
    for zone in (zones if zones is not None else load_zones()):
        out += ZONE_OVERLAYS[zone["overlay"]](zone["id"])
    return out


def bounds(zone: dict) -> tuple[float, float, float, float]:
    xs = [p[0] for p in zone["polygonM"]]
    zs = [p[1] for p in zone["polygonM"]]
    return min(xs), min(zs), max(xs), max(zs)


def contains(zone: dict, x: float, z: float) -> bool:
    """Ray-casting point-in-polygon on the authored metres."""
    poly = zone["polygonM"]
    inside = False
    n = len(poly)
    for i in range(n):
        ax, az = poly[i]
        bx, bz = poly[(i + 1) % n]
        if (az > z) != (bz > z):
            t = (z - az) / (bz - az)
            if x < ax + t * (bx - ax):
                inside = not inside
    return inside


def rasterise(zones: list[dict], shape: tuple[int, int],
              metres_per_px: float) -> np.ndarray:
    """Zone index raster on a control grid: 0 off every zone, else 1-based
    index into `zones`. Only the polygons' own bounding boxes are tested, so
    a province-sized grid costs the zones' area, not the province's."""
    idx = np.zeros(shape, dtype=np.uint8)
    for n, zone in enumerate(zones, start=1):
        x0, z0, x1, z1 = bounds(zone)
        c0 = max(0, int(x0 / metres_per_px))
        c1 = min(shape[1], int(x1 / metres_per_px) + 2)
        r0 = max(0, int(z0 / metres_per_px))
        r1 = min(shape[0], int(z1 / metres_per_px) + 2)
        for row in range(r0, r1):
            zc = (row + 0.5) * metres_per_px
            for col in range(c0, c1):
                if contains(zone, (col + 0.5) * metres_per_px, zc):
                    idx[row, col] = n
    return idx


def regions_touched(zone: dict, region: np.ndarray,
                    metres_per_px: float) -> set[int]:
    """Region classes the polygon's bounding box covers — which region
    palettes the overlay has to be appended to."""
    x0, z0, x1, z1 = bounds(zone)
    r0, r1 = int(z0 / metres_per_px), int(z1 / metres_per_px) + 1
    c0, c1 = int(x0 / metres_per_px), int(x1 / metres_per_px) + 1
    window = region[max(0, r0):r1, max(0, c0):c1]
    return set(int(v) for v in np.unique(window)) if window.size else set()

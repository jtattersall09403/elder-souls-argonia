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
from functools import cached_property
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from .compile_chunks import DEFAULT_HEIGHTS
from .compile_water import GRAPH_PATH, WEB_STEP, decode_ids, decode_surface, export_index
from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
WATER_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "water"
CLASS_NAMES = ("none", "coast", "estuary", "river", "lake", "marsh")
# The graph's body kinds that are marsh: shallow standing water that is waded,
# poled and built on (`hydrology-graph.json` vocabulary.bodyKinds).
MARSH_KINDS = frozenset({"marsh-fringe", "marsh-deep", "swamp", "backswamp"})
# Reach kinds that are a flowing channel (the record's vocabulary, 0058); a
# `horizontal-backwater` reach is the body it crosses and is NOT a channel.
# These live HERE, with the record reader, because every consumer that joins
# through the record needs them (site_fields re-exports them for its callers).
CHANNEL_REACH_KINDS = frozenset({"horizontal-channel", "horizontal-tidal", "sloped-riffle",
                                 "sloped-rapid", "sloped-chute", "vertical-fall"})
# Body kinds a road cannot ford: crossed by ferry or not at all.
STANDING_BODY_KINDS = frozenset({"ocean", "lagoon", "lake-lowland", "tarn-upland", "pond",
                                 "pool", "plunge-pool"})
SEASON_INDEX = {"perennial": 1, "seasonal": 2, "ephemeral": 3}


class ShippedWater:
    """The compiled water as it ships, on its own grids."""

    def __init__(self, water_dir: Path = WATER_DIR, heights: Path = DEFAULT_HEIGHTS,
                 graph_path: Path = GRAPH_PATH):
        self.graph_path = Path(graph_path)
        self.meta = json.loads((water_dir / "water-meta.json").read_text())
        rgb = np.asarray(Image.open(water_dir / self.meta["surface"]["file"]).convert("RGB"))
        self.w2, self.depth2 = decode_surface(rgb, self.meta)
        self.mpp2 = float(self.meta["surface"]["metresPerPixel"])
        shore = np.asarray(Image.open(water_dir / "water-shore.png").convert("RGB"))
        self.shore2 = shore[..., 0].astype(np.float32) / 255.0 * float(self.meta["surface"]["shoreMaxM"])
        self.season2 = shore[..., 1].astype(np.float32) / 255.0
        self.owner2 = np.asarray(Image.open(water_dir / "water-owner.png").convert("L"))
        # The graph key. Every downstream stage that needs a water *kind* joins
        # through this, never through a re-derivation of its own (0066).
        # The entity raster arrived with schema 3 (16c). A bundle without one
        # (an older publish, a snapshot another stage copied aside) still
        # loads: `ids` is None and `entity_at` answers None, so a caller that
        # needs the graph's answer gets nothing rather than a wrong id.
        id_path = water_dir / "water-id.png"
        self.ids = (decode_ids(np.asarray(Image.open(id_path).convert("RGB")))
                    if id_path.exists() else None)
        self.entities = self.meta["entities"]
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
    # THE province has a wet and a dry season, so "is there water here" is not
    # a question with one answer. Every consumer asks it through
    # `signed_depth_m(season)` / `wet_grid(season)` and has to name the season
    # it means; nothing else may open these PNGs. Since 16c (owner 2026-09-13)
    # the compiled level IS the wet-season high-water line and the season only
    # draws it DOWN: the names are the season scalar s of the runtime rule in
    # `water-meta.json` (`season.runtime`): wet = 1 (the line), base = 0 (the
    # calendar mean, half the draw-down), dry = -1 (the full draw-down).
    SEASONS = {"dry": -1.0, "base": 0.0, "wet": 1.0}

    def season_wetness(self, season: str | float) -> float:
        """Resolve a season name (or a raw -1..1 scalar) to the season scalar."""
        if isinstance(season, (int, float)):
            return float(np.clip(float(season), -1.0, 1.0))
        try:
            return self.SEASONS[season]
        except KeyError:
            raise ValueError(
                f"unknown season {season!r}; use one of {sorted(self.SEASONS)} "
                f"or a season scalar in -1..1") from None

    def signed_depth_m(self, season: str | float) -> np.ndarray:
        """Signed depth over the surface grid at a named season, metres.

        Negative is dry ground above the local water table. At `wet` this is
        the compiled depth (the high-water line); at `dry` the line drawn
        down by the per-texel response in `water-shore.png` G times
        `season.amplitudeM`; `base` is halfway.
        """
        s = self.season_wetness(season)
        if s >= 1.0:
            return self.depth2
        amplitude = float(self.meta["season"]["amplitudeM"])
        return (self.depth2 - amplitude * self.season2 * (1.0 - s) / 2.0).astype(np.float32)

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

    def entity_at(self, x_m: float, z_m: float) -> dict | None:
        """The graph entity whose compiled extent covers a world point, or None.

        `water-id.png` stores `0 none, else 1 + index into entities[]` on the
        surface grid, so this is the one join from a coordinate to the record
        the owner signed off (0065/0066). None when the bundle ships no
        entity raster (see `ids`).
        """
        if self.ids is None:
            return None
        label = int(self._tex(self.ids, x_m, z_m, self.mpp2))
        return self.entities[label - 1] if label > 0 else None

    # --- the record (decision 0066) --------------------------------------
    #
    # Kinds, ids, levels and seasons come from the signed-off graph; the
    # compiled rasters realise it. A downstream stage asks `water_at` and
    # reads the record's fields; it never decides "river", "lake" or "marsh"
    # from a raster of its own.

    @cached_property
    def _graph_index(self) -> tuple[dict[str, dict], dict[str, dict]]:
        """(reaches by id, bodies by id) from the hydrology graph, loaded on
        first use so a caller that only wants depths never pays for it."""
        graph = json.loads(self.graph_path.read_text(encoding="utf-8"))
        return ({r["id"]: r for r in graph["reaches"]},
                {b["id"]: b for b in graph["bodies"]})

    def reach(self, entity_id: str) -> dict | None:
        """The graph's reach record for an id, or None."""
        return self._graph_index[0].get(entity_id)

    def body(self, entity_id: str) -> dict | None:
        """The graph's body record for an id, or None."""
        return self._graph_index[1].get(entity_id)

    def record(self, entity_id: str) -> dict | None:
        """Reach or body record for an id, whichever the graph holds."""
        rec = self.reach(entity_id)
        return rec if rec is not None else self.body(entity_id)

    def water_at(self, east_m: float, south_m: float) -> dict | None:
        """The water record at a world point: the compiled entity merged with
        its graph record, plus the measured `depthM` at the texel.

        Graph fields win on conflict; the compiled `levelM` survives as
        `compiledLevelM` only where it differs from the graph's by more than
        1 cm. An id present in one set and not the other is returned with the
        fields it has. Two arguments only: the compiled level IS the
        wet-season line (16c) and the record's own `season` field says how
        it behaves; there is no season to choose here. None on dry ground or
        when the bundle ships no entity raster.
        """
        compiled = self.entity_at(east_m, south_m)
        if compiled is None:
            return None
        graph = self.record(compiled["id"]) or {}
        out = {**compiled, **graph}
        if "levelM" in graph and "levelM" in compiled \
                and abs(float(graph["levelM"]) - float(compiled["levelM"])) > 0.01:
            out["compiledLevelM"] = compiled["levelM"]
        # A reach record carries the channel's designed `depthM`; the measured
        # depth at this texel takes the name, the design depth keeps its value.
        if "depthM" in graph:
            out["designDepthM"] = graph["depthM"]
        out["depthM"] = float(self._tex(self.signed_depth_m("wet"), east_m, south_m, self.mpp2))
        return out

    def reach_band_grid(self) -> np.ndarray | None:
        """int8 surface-grid raster of the graph `band` of the reach under each
        texel (0 where the entity is not a reach or there is no entity),
        read through the id raster and `hydrology-graph.json`; None without
        an id raster. The record-legal replacement for the Phase 3
        `river_band` class raster (0066)."""
        if self.ids is None:
            return None
        reaches, _bodies = self._graph_index
        lut = np.zeros(len(self.entities) + 1, dtype=np.int8)
        for i, e in enumerate(self.entities, 1):
            rec = reaches.get(e.get("id"))
            if rec is not None:
                lut[i] = int(rec.get("band") or 0)
        return lut[self.ids]

    def vocabulary(self) -> dict:
        """The graph's own `vocabulary` block — the ONE list of legal reach
        kinds, body kinds and seasons (0066: read it, never restate it)."""
        return json.loads(self.graph_path.read_text(encoding="utf-8"))["vocabulary"]

    def kind_names(self) -> list[str]:
        """Index -> kind name for `kind_index_grid` (0 is "none")."""
        v = self.vocabulary()
        return ["none"] + list(v["reachKinds"]) + list(v["bodyKinds"])

    def kind_index_grid(self) -> np.ndarray | None:
        """uint8 surface-grid raster of the index into `kind_names()` of the
        entity under each texel (0 none); None without an id raster."""
        if self.ids is None:
            return None
        index = {name: i for i, name in enumerate(self.kind_names())}
        lut = np.zeros(len(self.entities) + 1, dtype=np.uint8)
        for i, e in enumerate(self.entities, 1):
            lut[i] = index.get(e.get("kind"), 0)
        return lut[self.ids]

    def season_index_grid(self) -> np.ndarray | None:
        """uint8 surface-grid raster of the season of the entity under each
        texel: 0 none, 1 perennial, 2 seasonal, 3 ephemeral. The graph
        record's `season` wins; the compiled entity's own is the fallback."""
        if self.ids is None:
            return None
        lut = np.zeros(len(self.entities) + 1, dtype=np.uint8)
        for i, e in enumerate(self.entities, 1):
            rec = self.record(e.get("id")) or {}
            season = rec.get("season") or e.get("season")
            lut[i] = SEASON_INDEX.get(season, 0)
        return lut[self.ids]

    def reach_width_grid(self) -> np.ndarray | None:
        """float32 surface-grid raster of the reach's declared `widthM` under
        each texel (0 off a reach); None without an id raster."""
        if self.ids is None:
            return None
        reaches, _bodies = self._graph_index
        lut = np.zeros(len(self.entities) + 1, dtype=np.float32)
        for i, e in enumerate(self.entities, 1):
            rec = reaches.get(e.get("id"))
            if rec is not None:
                lut[i] = float(rec.get("widthM") or 0.0)
        return lut[self.ids]

    def record_depth_grid(self) -> np.ndarray | None:
        """float32 surface-grid raster of the RECORD's depth of the entity
        under each texel: a reach's declared `depthM`, a body's `maxDepthM`,
        0 where there is no entity. None without an id raster.

        This is the record's designed depth, not a measurement of the bake —
        what a berth or a boat lane is judged against (0066: read the record,
        sample the raster only to locate the entity)."""
        if self.ids is None:
            return None
        reaches, bodies = self._graph_index
        lut = np.zeros(len(self.entities) + 1, dtype=np.float32)
        for i, e in enumerate(self.entities, 1):
            eid = e.get("id")
            rec = reaches.get(eid)
            if rec is not None:
                lut[i] = float(rec.get("depthM") or 0.0)
                continue
            rec = bodies.get(eid)
            if rec is not None:
                lut[i] = float(rec.get("maxDepthM") or 0.0)
        return lut[self.ids]

    def river_of(self, entity_id: str) -> str | None:
        """The `river` id the reach with this id belongs to, or None."""
        rec = self.reach(entity_id)
        return rec.get("river") if rec else None

    def kind_grid(self, kinds) -> np.ndarray | None:
        """Boolean surface-grid mask of the texels whose entity kind is in
        `kinds`, read through the id raster; None without one."""
        if self.ids is None:
            return None
        wanted = frozenset(kinds)
        lut = np.zeros(len(self.entities) + 1, dtype=bool)
        for i, e in enumerate(self.entities, 1):
            lut[i] = e.get("kind") in wanted
        return lut[self.ids]

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

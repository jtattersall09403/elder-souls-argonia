"""Province site-survey fields — the one loader every Phase 11 siting tool reads.

HOW TO USE
----------
    from worldgen.site_fields import ProvinceSurvey
    s = ProvinceSurvey()                 # ~10 s, reads only committed repo data
    s.sample(x_m, z_m)                   # every field at one world point
    s.height_grid, s.slope_grid, s.aspect_grid, s.region_grid, s.danger, ...
                                         # aligned 1345 x 1345 rasters for sweeps
    s.area_report()                      # authored-land km2
    s.viewshed(x, z, r) / s.line_of_sight(...) / s.effort_to_reach(x, z)
    s.nearest_mined_form(water_m, road_m, radius_m)

Consumers: `worldgen.site_dossier` (per-site dossiers) and
`worldgen.terrain_scour` (province-wide candidate-site sweep), both Phase 11
Part 0 deliverables (decision 0041).

WHY IT READS PNGs, NOT THE VAULT
--------------------------------
The Phase 3/4/6 `.npz`/`.npy` caches live next to the source esp in the asset
vault and are *not* in the repo (and are absent on a fresh VM). Everything the
compilers publish is, however, committed under
`apps/world-studio/public/province/`. This module therefore decodes those
published rasters back into arrays, inverting each writer's encoding exactly —
the same trick `compile_scatter.ProvinceFields` and `test_climate_weather.py`
already use. It composes `ProvinceFields` rather than duplicating it.

CONVENTIONS (module 00-core §8, decisions 0003/0015)
----------------------------------------------------
* metres, sea level y = 0, province extent 7373.5 m square, HSCALE 1.
* World X = east, Z = south. Origin (0, 0) is the province's NORTH-WEST corner,
  which is pixel (row 0, col 0) of every published raster ("row 0 is north").
  So `col = x / px_m`, `row = z / px_m` on any raster — the same mapping
  `compile_scatter` uses, and the one anchors' (u, v) already follow.
* Two raster resolutions are in play: the refined height/water pair at
  3.65568 m/px (2017²) and the hydrology/society/climate stack at 5.48352 m/px
  (1345²). The `*_grid` properties resample onto the 1345² grid so province
  sweeps run on one aligned stack.
* Deterministic: no randomness here at all; the sweep's seed lives in
  `terrain_scour`.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from .compile_scatter import CHUNK_M, ProvinceFields
from .regions import REGION_CLASSES, SOIL_CLASSES
from .society import CULTURES, DANGER_BANDS

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
ANCHORS_PATH = REPO_ROOT / "world" / "sources" / "anchors" / "settlement-anchors.json"
PLACEMENT_DIR = REPO_ROOT / "world" / "sources" / "placement"

# Region classes that are open water rather than authored, walkable/wadeable
# ground. Marsh and tidal flats are NOT here: they are played on.
OPEN_WATER_REGIONS = (0, 12)          # ocean, lake & standing water
OCEAN_REGION = 0
RIVER_REGION = 5                      # deep river corridor


def _rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"))


def _rgba(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"))


def _classify(rgba: np.ndarray, table: dict[int, tuple[int, int, int]]) -> np.ndarray:
    """Invert a categorical overlay: exact RGB match where alpha > 0."""
    out = np.zeros(rgba.shape[:2], dtype=np.uint8)
    opaque = rgba[..., 3] > 0
    for value, colour in table.items():
        match = opaque & np.all(rgba[..., :3] == np.array(colour, np.uint8), axis=-1)
        out[match] = value
    return out


def _resample(a: np.ndarray, size: int) -> np.ndarray:
    """Nearest-neighbour resample onto a square grid (deterministic, no interp
    so categorical rasters survive)."""
    if a.shape[0] == size:
        return a
    idx = (np.arange(size) * (a.shape[0] / size)).astype(np.int32)
    return a[np.ix_(idx, idx)]


def _bilinear(a: np.ndarray, size: int) -> np.ndarray:
    """Bilinear resample for continuous fields (heights)."""
    if a.shape[0] == size:
        return a.astype(np.float32)
    t = (np.arange(size) + 0.5) * (a.shape[0] / size) - 0.5
    return ndimage.map_coordinates(
        a.astype(np.float32), np.meshgrid(t, t, indexing="ij"), order=1, mode="nearest"
    ).astype(np.float32)


@dataclass(frozen=True)
class Route:
    kind: str            # "road" | "boat"
    frm: str
    to: str
    length_km: float
    points_m: np.ndarray  # (n, 2) world metres, [x, z]


class ProvinceSurvey:
    """Every published province field, decoded, plus the survey primitives
    (aspect, viewshed, effort-to-reach, mined-form analogue)."""

    def __init__(self, province: Path = PROVINCE):
        self.province = province
        # Siting scores NATURAL ground: route grading (worldgen.grade_routes)
        # reshapes the terrain *because of* the plotted places and their
        # routes, so scoring on the graded surface would feed that back and
        # move committed records. The graded surface is what the chunks and
        # colliders carry; siting keeps the ungraded raster when it exists.
        natural = province / "refined" / "height-natural-rg.png"
        self.fields = ProvinceFields(
            province, "height-natural-rg.png" if natural.exists() else "height-rg.png")
        # The water bake follows the graded ground, so siting reads the
        # natural-state snapshot of it that `grade_routes` keeps beside it.
        water_dir = province / "water" / "natural"
        if not water_dir.exists():
            water_dir = province / "water"
        self.hydro_meta = json.loads((province / "hydrology-meta.json").read_text())
        self.society_meta = json.loads((province / "society-meta.json").read_text())
        self.water_meta = json.loads((water_dir / "water-meta.json").read_text())
        self.refined_meta = json.loads((province / "refined" / "meta.json").read_text())

        self.extent_m = float(self.fields.extent_m)
        self.height_px_m = float(self.fields.px_m)          # 3.65568
        self.grid_px_m = float(self.hydro_meta["metresPerPixel"])  # 5.48352
        self.grid_n = int(self.hydro_meta["imageWidth"])           # 1345

        # -- hydrology stack (1345) ---------------------------------------
        self.flood = _classify(_rgba(province / "hydro-flood.png"),
                               {1: (120, 170, 220), 2: (80, 140, 220), 3: (50, 100, 210)})
        self.soil = _classify(_rgba(province / "hydro-soil.png"),
                              {1: (135, 135, 145), 2: (165, 150, 105), 3: (95, 140, 85),
                               4: (80, 60, 40), 5: (150, 110, 70)})
        rivers = _rgba(province / "hydro-rivers.png")
        self.river_band = _classify(rivers, {1: (95, 172, 235), 2: (70, 150, 230),
                                             3: (45, 115, 225)})
        self.lakes = np.all(rivers[..., :3] == np.array((60, 130, 215), np.uint8), axis=-1) \
            & (rivers[..., 3] > 0)
        wet = _rgba(province / "hydro-wetlands.png")
        self.wetlands = np.all(wet[..., :3] == np.array((60, 200, 140), np.uint8), axis=-1)
        self.tidal = np.all(wet[..., :3] == np.array((170, 205, 130), np.uint8), axis=-1)
        # salinity writer: R = 40 + 180 s, only where s > 0.02
        sal = _rgba(province / "hydro-salinity.png").astype(np.float32)
        self.salinity = np.where(sal[..., 3] > 0,
                                 np.clip((sal[..., 0] - 40.0) / 180.0, 0, 1), 0.0).astype(np.float32)

        # -- society stack (1345) -----------------------------------------
        self.danger = _classify(_rgba(province / "soc-danger.png"),
                                {b: tuple(rgb) for b, (_n, rgb) in DANGER_BANDS.items()})
        self.culture = _classify(
            _rgba(province / "soc-cultures.png"),
            {i + 1: tuple(spec["colour"]) for i, spec in enumerate(CULTURES.values())})
        self.culture_names = {i + 1: name for i, name in enumerate(CULTURES)}

        # -- climate stack (1345) -----------------------------------------
        air = _rgb(province / "climate-air.png").astype(np.float32) / 255.0
        self.humidity, self.mist, self.canopy = air[..., 0], air[..., 1], air[..., 2]
        weather = _rgb(province / "climate-weather.png").astype(np.float32) / 255.0
        self.rain, self.storm_exposure, self.sea_fog = (
            weather[..., 0], weather[..., 1], weather[..., 2])
        vis = _rgb(province / "climate-vis.png").astype(np.float32) / 255.0
        self.cloud_belt = vis[..., 0]
        # G channel: beta/0.02 per byte; Koschmieder V = 3.912 / beta
        beta = np.maximum(vis[..., 1] * 0.02, 1e-6)
        self.air_visibility_m = (3.912 / beta).astype(np.float32)

        # -- water (2017 / 1345) -------------------------------------------
        surf = _rgb(water_dir / "water-surface.png").astype(np.float32)
        wlo, whi = self.water_meta["surface"]["minM"], self.water_meta["surface"]["maxM"]
        self.water_level_m = ((surf[..., 0] * 256 + surf[..., 1]) / 65535.0
                              * (whi - wlo) + wlo).astype(np.float32)
        self.water_depth_m = (surf[..., 2] * 0.1).astype(np.float32)
        klass = _rgb(water_dir / "water-class.png")
        self.water_class = _resample(klass[..., 0], self.grid_n)
        self.water_turbidity = _resample(klass[..., 1], self.grid_n).astype(np.float32) / 255.0
        self.water_salinity = _resample(klass[..., 2], self.grid_n).astype(np.float32) / 255.0
        self.water_class_names = self.water_meta["klass"]["classes"]
        # water-shore.png: R = shore distance / SHORE_MAX_M, G = seasonal
        # response (how much this water rises/falls with the wet season),
        # B = tannin (blackwater staining).
        shore = _rgb(water_dir / "water-shore.png").astype(np.float32) / 255.0
        self.water_season_response = _resample(shore[..., 1], self.grid_n)
        self.water_tannin = _resample(shore[..., 2], self.grid_n)
        # wet-season newly-inundated mask (refine_province, half-res of refined)
        self.wet_season = np.asarray(
            Image.open(province / "refined" / "flood-wet.png")) > 127

        # -- routes, lanes, anchors ----------------------------------------
        self.anchors = json.loads(ANCHORS_PATH.read_text())
        self.routes = self._load_routes()

    # ------------------------------------------------------------------ #
    # coordinate helpers
    # ------------------------------------------------------------------ #
    def uv_to_m(self, u: float, v: float) -> tuple[float, float]:
        return u * self.extent_m, v * self.extent_m

    def m_to_uv(self, x: float, z: float) -> tuple[float, float]:
        return x / self.extent_m, z / self.extent_m

    def _px(self, x: float, z: float, px_m: float, n: int) -> tuple[int, int]:
        return (min(max(int(z / px_m), 0), n - 1), min(max(int(x / px_m), 0), n - 1))

    def grid_px(self, x: float, z: float) -> tuple[int, int]:
        return self._px(x, z, self.grid_px_m, self.grid_n)

    def _load_routes(self) -> list[Route]:
        out: list[Route] = []
        # Siting scores the NATURAL road corridors, for the same reason it
        # scores natural ground: `reroute_majors` re-solves the steep stretches
        # of a road *because of* the gradient cap, and a place's score depends
        # on how near a road it is — so scoring on the repaired line would feed
        # the repair back into the plot and move committed records. The
        # repaired line is what the world carries; the snapshot is what siting
        # reads. `reroute_majors` keeps it fresh (2026-09-05).
        natural_roads = self.province / "routes-natural.json"
        roads_path = natural_roads if natural_roads.exists() else self.province / "routes.json"
        roads = json.loads(roads_path.read_text())["routes"]
        for r in roads:
            pts = np.asarray(r["px"], dtype=np.float32) * self.grid_px_m
            out.append(Route("road", r["from"], r["to"], float(r["lengthKm"]),
                             pts if pts.size else np.zeros((0, 2), np.float32)))
        lanes = json.loads((self.province / "waterways.json").read_text())["lanes"]
        lengths = {(w["from"], w["to"]): w["lengthKm"]
                   for w in self.society_meta.get("waterRoutes", [])}
        for lane in lanes:
            pts = np.asarray(lane["px"], dtype=np.float32) * self.grid_px_m
            out.append(Route("boat", lane["from"], lane["to"],
                             float(lengths.get((lane["from"], lane["to"]), 0.0)), pts))
        return out

    # ------------------------------------------------------------------ #
    # derived province-wide fields (built lazily — the sweep wants them all,
    # a single dossier wants two of them)
    # ------------------------------------------------------------------ #
    @cached_property
    def height_grid(self) -> np.ndarray:
        """Refined height resampled onto the 1345 analysis grid, metres."""
        return _bilinear(self.fields.height_m, self.grid_n)

    @cached_property
    def slope_grid(self) -> np.ndarray:
        gy, gx = np.gradient(self.height_grid, self.grid_px_m)
        return np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)

    @cached_property
    def aspect_grid(self) -> np.ndarray:
        """Downslope compass bearing in degrees (0 = north, clockwise)."""
        gy, gx = np.gradient(self.height_grid, self.grid_px_m)
        # +gx is east, +gy is south (row index grows southwards)
        return (np.degrees(np.arctan2(gx, gy)) % 360.0).astype(np.float32)

    @cached_property
    def region_grid(self) -> np.ndarray:
        return self.fields.region

    @cached_property
    def open_water(self) -> np.ndarray:
        """Open water: ocean, lakes, and anything deeper than 0.5 m.

        Shallower standing water is marsh — authored, played-on ground.
        """
        deep = _resample(self.water_depth_m, self.grid_n) > 0.5
        return np.isin(self.region_grid, OPEN_WATER_REGIONS) | deep

    @cached_property
    def land(self) -> np.ndarray:
        return ~self.open_water

    @cached_property
    def dist_to_route_m(self) -> np.ndarray:
        """Euclidean distance to the nearest road corridor OR boat lane."""
        mask = np.zeros((self.grid_n, self.grid_n), bool)
        for r in self.routes:
            for x, z in r.points_m:
                row, col = self.grid_px(float(x), float(z))
                mask[row, col] = True
        return (ndimage.distance_transform_edt(~mask) * self.grid_px_m).astype(np.float32)

    @cached_property
    def dist_to_water_m(self) -> np.ndarray:
        wet = self.open_water | self.wetlands | (self.river_band > 0)
        return (ndimage.distance_transform_edt(~wet) * self.grid_px_m).astype(np.float32)

    @cached_property
    def anchor_points_m(self) -> dict[str, tuple[float, float]]:
        return {a["id"]: self.uv_to_m(a["u"], a["v"]) for a in self.anchors["anchors"]}

    # ------------------------------------------------------------------ #
    # authored-land area (Part 0 item C)
    # ------------------------------------------------------------------ #
    def area_report(self) -> dict:
        cell_km2 = (self.grid_px_m / 1000.0) ** 2
        n = self.grid_n * self.grid_n
        reg = self.region_grid
        deep = _resample(self.water_depth_m, self.grid_n) > 0.5
        ocean = reg == OCEAN_REGION
        lake = reg == 12
        river_open = (~ocean) & (~lake) & deep
        marsh_shallow = (~ocean) & (~lake) & (~deep) & (self.wetlands | (reg == 14))
        authored = self.land
        return {
            "provinceExtentKm": round(self.extent_m / 1000.0, 3),
            "provinceBoundingAreaKm2": round(n * cell_km2, 2),
            "openSeaKm2": round(int(ocean.sum()) * cell_km2, 2),
            "lakeKm2": round(int(lake.sum()) * cell_km2, 2),
            "deepRiverAndChannelKm2": round(int(river_open.sum()) * cell_km2, 2),
            "authoredLandKm2": round(int(authored.sum()) * cell_km2, 2),
            "ofWhichShallowMarshKm2": round(int(marsh_shallow.sum()) * cell_km2, 2),
            "definition": (
                "authored land = province bounding square minus open water, where "
                "open water = ocean region + lake region + any cell with published "
                "water depth > 0.5 m. Shallow marsh (<= 0.5 m) counts as authored "
                "land: it is waded, poled and built on."
            ),
        }

    # ------------------------------------------------------------------ #
    # survey primitives
    # ------------------------------------------------------------------ #
    @cached_property
    def height_view(self) -> np.ndarray:
        """Height smoothed to ~11 m for line-of-sight work.

        Phase 6's detail noise carries the province's perceived relief, but at
        1.7 m eye height it also blocks every ray within 40 m, which would make
        every site read as "sees nothing". Landmark visibility is a property of
        the terrain *skeleton*; vegetation and micro-relief occlusion is the
        renderer's business, not the siting model's.
        """
        return ndimage.gaussian_filter(self.height_grid, 2.0)

    def view_height_at(self, x: float, z: float) -> float:
        row, col = self.grid_px(x, z)
        return float(self.height_view[row, col])

    def viewshed(self, x: float, z: float, radius_m: float,
                 eye_m: float = 1.7, rays: int = 72,
                 step_m: float | None = None) -> dict:
        """Coarse radial (R2) viewshed: march `rays` azimuths, tracking the
        running horizon angle. Returns the visible fraction, the horizon
        profile and a `visible(x, z)` predicate over the same rays.

        Reciprocity: line of sight is symmetric for equal eye heights, so the
        same result answers "what can I see" and "where can I be seen from".
        """
        step = step_m or self.grid_px_m
        n = max(2, int(radius_m / step))
        h0 = self.view_height_at(x, z) + eye_m
        horizon = np.full(rays, -math.pi / 2, dtype=np.float64)
        visible = np.zeros((rays, n), dtype=bool)
        first_block_m = np.full(rays, radius_m, dtype=np.float64)
        for i in range(rays):
            a = 2.0 * math.pi * i / rays
            dx, dz = math.sin(a), -math.cos(a)     # 0 = north (−Z), clockwise
            for j in range(1, n + 1):
                d = j * step
                px, pz = x + dx * d, z + dz * d
                if not (0.0 <= px < self.extent_m and 0.0 <= pz < self.extent_m):
                    break
                ang = math.atan2(self.view_height_at(px, pz) - h0, d)
                if ang >= horizon[i]:
                    horizon[i] = ang
                    visible[i, j - 1] = True
                elif first_block_m[i] == radius_m:
                    first_block_m[i] = d
        return {
            "rays": rays,
            "radiusM": round(radius_m, 1),
            "visibleFraction": round(float(visible.mean()), 4),
            "horizonAngleDeg": {
                "p5": round(float(np.degrees(np.percentile(horizon, 5))), 2),
                "p50": round(float(np.degrees(np.percentile(horizon, 50))), 2),
                "p95": round(float(np.degrees(np.percentile(horizon, 95))), 2),
                "max": round(float(np.degrees(horizon.max())), 2),
            },
            "openAzimuthFraction": round(float((horizon <= 0.0).mean()), 3),
            "medianFirstBlockM": round(float(np.median(first_block_m)), 1),
        }

    def line_of_sight(self, ax: float, az: float, bx: float, bz: float,
                      eye_a: float = 1.7, eye_b: float = 1.7,
                      step_m: float | None = None) -> bool:
        step = step_m or self.grid_px_m
        d = math.hypot(bx - ax, bz - az)
        if d < 1e-6:
            return True
        n = max(2, int(d / step))
        h0 = self.view_height_at(ax, az) + eye_a
        h1 = self.view_height_at(bx, bz) + eye_b
        for j in range(1, n):
            t = j / n
            hx = self.view_height_at(ax + (bx - ax) * t, az + (bz - az) * t)
            if hx > h0 + (h1 - h0) * t:
                return False
        return True

    def height_at(self, x: float, z: float) -> float:
        row, col = self._px(x, z, self.height_px_m, self.fields.height_m.shape[0])
        return float(self.fields.height_m[row, col])

    def effort_to_reach(self, x: float, z: float) -> dict:
        """Cheap, explainable effort model: how far from the nearest route and
        the nearest anchor, over what ground, at what danger.

        A full least-cost solve belongs to the plot stage (Part 3); this is the
        screening number, and it is deterministic and instant.
        """
        row, col = self.grid_px(x, z)
        d_route = float(self.dist_to_route_m[row, col])
        anchors = sorted(
            ((math.hypot(x - ax, z - az), aid)
             for aid, (ax, az) in self.anchor_points_m.items()))
        d_anchor, nearest = anchors[0]
        slope = float(self.slope_grid[row, col])
        danger = int(self.danger[row, col])
        # 0..1: distance from a route dominates, roughened by slope and danger.
        score = min(1.0, d_route / 2500.0) * 0.55 \
            + min(1.0, slope / 35.0) * 0.2 \
            + min(1.0, max(0, danger - 1) / 4.0) * 0.25
        return {
            "distanceToNearestRouteM": round(d_route, 1),
            "nearestAnchor": nearest,
            "distanceToNearestAnchorM": round(d_anchor, 1),
            "dangerBand": danger,
            "effortScore": round(float(score), 3),
        }

    # ------------------------------------------------------------------ #
    # mined-form analogue
    # ------------------------------------------------------------------ #
    @cached_property
    def mined_forms(self) -> list[dict]:
        """Every mined settlement cluster from the BM&V / vanilla form tables,
        flattened into comparable records."""
        out = []
        for name in ("bmv-settlement-form.json", "bmv-valenwood-settlement-form.json",
                     "vanilla-tamriel-settlement-form.json"):
            path = PLACEMENT_DIR / name
            if not path.exists():
                continue
            data = json.loads(path.read_text())
            for i, s in enumerate(data.get("form", {}).get("settlements", [])):
                out.append({
                    "source": name.replace("-settlement-form.json", ""),
                    "index": i,
                    "buildings": s.get("buildings"),
                    "radiusM": s.get("radiusM"),
                    "buildingsPerHectare": s.get("buildingsPerHectare"),
                    "orientationCoherence": s.get("orientationCoherence"),
                    "medianWaterDistanceM": s.get("medianWaterDistanceM"),
                    "medianRoadDistanceM": s.get("medianRoadDistanceM"),
                    "kits": s.get("kits", []),
                })
        return out

    def nearest_mined_form(self, water_distance_m: float, road_distance_m: float,
                           buildable_radius_m: float, top: int = 3) -> list[dict]:
        """Which mined cluster shape fits this ground.

        Matched on the three site-legible axes the miner recorded: distance to
        water, distance to road, and how much room the site has (the cluster's
        own radius). Normalised in log space, because all three span decades.
        """
        def lg(v: float) -> float:
            return math.log10(max(float(v), 1.0))

        scored = []
        for f in self.mined_forms:
            if f["medianWaterDistanceM"] is None or f["radiusM"] is None:
                continue
            d = (lg(f["medianWaterDistanceM"]) - lg(water_distance_m)) ** 2
            if f["medianRoadDistanceM"] is not None:
                d += (lg(f["medianRoadDistanceM"]) - lg(road_distance_m)) ** 2
            d += (lg(f["radiusM"]) - lg(buildable_radius_m)) ** 2
            scored.append((d, f))
        scored.sort(key=lambda kv: (kv[0], kv[1]["source"], kv[1]["index"]))
        return [{**f, "formDistance": round(math.sqrt(d), 3)} for d, f in scored[:top]]

    # ------------------------------------------------------------------ #
    # point sample
    # ------------------------------------------------------------------ #
    def sample(self, x: float, z: float) -> dict:
        row, col = self.grid_px(x, z)
        hrow, hcol = self._px(x, z, self.height_px_m, self.fields.height_m.shape[0])
        wrow, wcol = self._px(x, z, self.height_px_m, self.water_level_m.shape[0])
        region = int(self.region_grid[row, col])
        culture = int(self.culture[row, col])
        return {
            "worldM": [round(x, 1), round(z, 1)],
            "uv": [round(x / self.extent_m, 5), round(z / self.extent_m, 5)],
            "elevationM": round(float(self.fields.height_m[hrow, hcol]), 2),
            "slopeDeg": round(float(self.fields.slope_deg[hrow, hcol]), 2),
            "aspectDeg": round(float(self.aspect_grid[row, col]), 1),
            "regionClass": region,
            "regionName": REGION_CLASSES[region][0],
            "soilClass": int(self.soil[row, col]),
            "soilName": SOIL_CLASSES.get(int(self.soil[row, col]), "unclassified"),
            "dangerBand": int(self.danger[row, col]),
            "cultureTerritory": self.culture_names.get(culture),
            "hydrology": {
                "waterLevelM": round(float(self.water_level_m[wrow, wcol]), 2),
                "waterDepthM": round(float(self.water_depth_m[wrow, wcol]), 2),
                "heightAboveWaterTableM": round(
                    float(self.fields.height_m[hrow, hcol] - self.water_level_m[wrow, wcol]), 2),
                "shoreDistanceM": round(float(self.fields.shore_m[hrow, hcol]), 1),
                "coastDistanceM": round(float(self.fields.coast_m[row, col]), 1),
                "riverBand": int(self.river_band[row, col]),
                "onLake": bool(self.lakes[row, col]),
                "wetland": bool(self.wetlands[row, col]),
                "tidal": bool(self.tidal[row, col]),
                "floodBand": int(self.flood[row, col]),
                "wetSeasonInundated": bool(
                    self.wet_season[self._px(x, z, self.extent_m / self.wet_season.shape[0],
                                             self.wet_season.shape[0])]),
                "salinity": round(float(self.salinity[row, col]), 3),
                "waterSalinity": round(float(self.water_salinity[row, col]), 3),
                "turbidity": round(float(self.water_turbidity[row, col]), 3),
                "tannin": round(float(self.water_tannin[row, col]), 3),
                "seasonalResponse": round(float(self.water_season_response[row, col]), 3),
                "waterClass": self.water_class_names[
                    min(int(self.water_class[row, col]), len(self.water_class_names) - 1)],
            },
            "climate": {
                "humidity": round(float(self.humidity[row, col]), 3),
                "mist": round(float(self.mist[row, col]), 3),
                "canopyClosure": round(float(self.canopy[row, col]), 3),
                "rainAmplitude": round(float(self.rain[row, col]), 3),
                "stormExposure": round(float(self.storm_exposure[row, col]), 3),
                "seaFog": round(float(self.sea_fog[row, col]), 3),
                "cloudBelt": round(float(self.cloud_belt[row, col]), 3),
                "airVisibilityM": round(float(self.air_visibility_m[row, col]), 1),
                "profile": self.hydro_meta["climateProfiles"].get(REGION_CLASSES[region][0]),
            },
        }

    # ------------------------------------------------------------------ #
    # vegetation (compiled scatter — partial coverage)
    # ------------------------------------------------------------------ #
    @cached_property
    def vegetation_index(self) -> dict:
        path = self.province / "vegetation" / "vegetation-index.json"
        return json.loads(path.read_text()) if path.exists() else {"chunks": {}}

    def vegetation_at(self, x: float, z: float) -> dict:
        cx, cz = int(x // CHUNK_M), int(z // CHUNK_M)
        chunks = self.vegetation_index.get("chunks", {})
        rec = chunks.get(f"{cx}_{cz}")
        if rec is None:
            return {"chunk": [cx, cz], "compiled": False,
                    "note": "no compiled scatter for this chunk yet — Phase 10 has "
                            f"dressed {len(chunks)} chunks of the province so far"}
        return {"chunk": [cx, cz], "compiled": True, **rec,
                "speciesPaletteSize": len(self.vegetation_index.get("speciesOrder", []))}

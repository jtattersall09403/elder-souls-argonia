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

import hashlib
import json
import os
import shutil
import sys
import time
from functools import cached_property, lru_cache
from pathlib import Path
from typing import Callable, Iterable

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


# --------------------------------------------------------------------------- #
# the survey cache (16h tooling lane step B #1)
# --------------------------------------------------------------------------- #
# `ShippedWater`, `compile_scatter.ProvinceFields` and `site_fields.ProvinceSurvey`
# decode the same published rasters and run the same distance transforms in
# every process (~1 GiB private, ~10 s). The decoded arrays are written once as
# `.npy` under SURVEY_CACHE_ROOT/<namespace>/<signature hash>/ and served
# memory-mapped and read-only, so every process shares one copy in the page
# cache. The key is the (path, mtime, size) of every source file AND of the
# code that decodes them: a touched source is a new key, the old key is
# deleted, and a stale array is never served. Only the published province is
# cached; a caller reading another directory (a test fixture, a snapshot) gets
# a plain decode.
SURVEY_CACHE_ROOT = REPO_ROOT / "tooling" / "world-generation" / "output" / "survey-cache"
#: the modules whose code turns the sources into the cached arrays
DECODER_MODULES = ("water_report.py", "compile_water.py", "compile_scatter.py", "site_fields.py",
                   "routes_raster.py", "dressing_zones.py", "regions.py", "society.py",
                   "scatter.py", "scale.py")


@lru_cache(maxsize=1024)
def _sha256(path: str, ino: int, mtime_ns: int, ctime_ns: int, size: int) -> str:
    """Content hash, memoised per (path, inode, mtime, ctime, size) so a process
    hashes each file once (~0.6 s for the province's 126 MiB) and rehashes only
    on a write. The inode catches a replace-by-rename; mtime/ctime/size a write
    in place (a same-size rewrite inside one timestamp tick is the residue)."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 24), b""):
            h.update(block)
    return h.hexdigest()


def file_signature(paths: Iterable[Path]) -> tuple:
    """(path, size, sha256) of every existing file, sorted by path. Content,
    never mtime: a save that changes nothing, or a checkout, keeps the key."""
    out = []
    for p in sorted({Path(p) for p in paths}):
        if p.is_file():
            st = p.stat()
            out.append((str(p), st.st_size, _sha256(str(p), st.st_ino, st.st_mtime_ns, st.st_ctime_ns, st.st_size)))
    return tuple(out)


def province_signature(province: Path) -> tuple:
    """The signature of every file the province readers derive arrays from:
    the published province, the vault height, the hydrology, route and flora
    records they join through, and the decoders' own code."""
    from .compile_chunks import DEFAULT_HEIGHTS
    here = Path(__file__).resolve().parent
    sources = [*province.glob("*.png"), *province.glob("*.json"),
               *province.glob("refined/*"), *province.glob("water/**/*"),
               DEFAULT_HEIGHTS, *GRAPH_PATH.parent.glob("*.json"),
               *(REPO_ROOT / "world" / "sources" / "routes").glob("*.json"),
               REPO_ROOT / "world" / "sources" / "flora" / "dressing-zones.json",
               *(here / name for name in DECODER_MODULES)]
    return file_signature(sources)


def _read_only(a: np.ndarray) -> np.ndarray:
    a.setflags(write=False)
    return a


#: how long an unused cache key survives a newer key's publish (7 days),
#: and how many keys a namespace keeps at most (each province key ~600 MB)
KEEP_KEYS_S = 7 * 24 * 3600
KEEP_KEYS_MAX = 3


class ArrayCache:
    """One signature's cached arrays. `namespace=None` is a pass-through: every
    builder runs and nothing touches the disk. `misses` lists each group or
    array this instance had to build, with its build seconds (read by the
    ES_TIMINGS=1 `survey.cache` line in site_fields)."""

    def __init__(self, namespace: str | None, signature: tuple = (),
                 root: Path = SURVEY_CACHE_ROOT):
        self.dir = None
        self.misses: list[tuple[str, float]] = []
        if namespace is not None:
            key = hashlib.sha1(repr(signature).encode()).hexdigest()[:16]
            self.dir = Path(root) / namespace / key

    @classmethod
    def for_province(cls, province: Path, enabled: bool = True) -> "ArrayCache":
        published = WATER_DIR.parent
        if not enabled or Path(province).resolve() != published.resolve():
            return cls(None)
        return cls("province", province_signature(published))

    def _publish(self, write: Callable[[Path], None]) -> None:
        """Write into a private temp dir, then move the files in atomically;
        a new key prunes the namespace's keys last used over KEEP_KEYS_S ago
        and all but the KEEP_KEYS_MAX most recently used (a hit touches the
        key's directory): concurrent agents whose signatures differ each keep
        their key instead of deleting each other's and rebuilding in turn."""
        parent = self.dir.parent
        fresh = not self.dir.exists()
        tmp = parent / f".tmp-{self.dir.name}-{os.getpid()}"
        tmp.mkdir(parents=True, exist_ok=True)
        try:
            write(tmp)
            self.dir.mkdir(exist_ok=True)
            for f in sorted(tmp.iterdir(), key=lambda f: f.suffix == ".json"):
                os.replace(f, self.dir / f.name)      # manifests land last
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        if fresh:
            # "now" is the mtime of the key just published: the file system's
            # own clock, the one every other key's mtime was stamped by.
            cutoff = self.dir.stat().st_mtime - KEEP_KEYS_S
            others = []
            for other in parent.iterdir():
                if other.name == self.dir.name or other.name.startswith(".tmp-"):
                    continue
                try:
                    others.append((other.stat().st_mtime, other))
                except FileNotFoundError:
                    pass          # another process pruned it first
            others.sort(reverse=True)                 # most recently used first
            for rank, (mtime, other) in enumerate(others):
                if mtime < cutoff or rank >= KEEP_KEYS_MAX - 1:
                    shutil.rmtree(other, ignore_errors=True)

    def _touch(self) -> None:
        """Mark the key used, so pruning goes by last use, not last write."""
        try:
            os.utime(self.dir)
        except OSError:
            pass

    def _load(self, name: str) -> np.ndarray:
        return np.asarray(np.load(self.dir / f"{name}.npy", mmap_mode="r"))

    def group(self, group: str, build: Callable[[], dict]) -> dict:
        """The arrays `build()` returns (None values dropped), from the cache."""
        if self.dir is None:
            return {k: _read_only(v) for k, v in build().items() if v is not None}
        manifest = self.dir / f"{group}.json"
        if not manifest.exists():
            t0 = time.perf_counter()
            arrays = {k: v for k, v in build().items() if v is not None}

            def write(tmp: Path) -> None:
                for name, a in arrays.items():
                    np.save(tmp / f"{group}.{name}.npy", np.ascontiguousarray(a),
                            allow_pickle=False)
                (tmp / f"{group}.json").write_text(json.dumps(sorted(arrays)))
            self._publish(write)
            self.misses.append((group, round(time.perf_counter() - t0, 3)))
        else:
            self._touch()
        return {n: self._load(f"{group}.{n}") for n in json.loads(manifest.read_text())}

    def array(self, name: str, build: Callable[[], np.ndarray]) -> np.ndarray:
        """One lazily built array (a derived field only some callers ask for)."""
        if self.dir is None:
            return _read_only(build())
        if not (self.dir / f"{name}.npy").exists():
            t0 = time.perf_counter()
            a = np.ascontiguousarray(build())
            self._publish(lambda tmp: np.save(tmp / f"{name}.npy", a, allow_pickle=False))
            self.misses.append((name, round(time.perf_counter() - t0, 3)))
        else:
            self._touch()
        return self._load(name)


class ShippedWater:
    """The compiled water as it ships, on its own grids."""

    def __init__(self, water_dir: Path = WATER_DIR, heights: Path = DEFAULT_HEIGHTS,
                 graph_path: Path = GRAPH_PATH, cache: bool = True):
        self.graph_path = Path(graph_path)
        self.meta = json.loads((water_dir / "water-meta.json").read_text())
        self.mpp2 = float(self.meta["surface"]["metresPerPixel"])
        self.entities = self.meta["entities"]
        self.mppc = float(self.meta["klass"]["metresPerPixel"])
        self.mppf = float(self.meta["flow"]["metresPerPixel"])
        # The full-resolution ground lives in the asset vault, which a clean
        # checkout (CI) does not have. Everything the shipped rasters answer on
        # their own — depth, wetness, class, flow, shore — must still work
        # there, or a gate that reads the water it ships cannot run in CI.
        # Callers that need `refined`/`ground2` get a clear error instead of a
        # missing attribute.
        with_heights = heights is not None and Path(heights).exists()
        published = (Path(water_dir).resolve() == WATER_DIR.resolve()
                     and self.graph_path.resolve() == GRAPH_PATH.resolve()
                     and (not with_heights
                          or Path(heights).resolve() == Path(DEFAULT_HEIGHTS).resolve()))
        store = self.cache = ArrayCache.for_province(WATER_DIR.parent, cache and published)
        arrays = store.group("water-heights" if with_heights else "water",
                             lambda: self._decode(water_dir, heights if with_heights else None))
        self.refined = None
        self.ground2 = None
        if with_heights:
            # the vault array is already an .npy: map it, never copy it
            refined = np.load(heights, mmap_mode="r" if store.dir is not None else None)
            self.refined = (np.asarray(refined) if refined.dtype == np.float32
                            else refined.astype(np.float32))
            self.ground2 = arrays["ground2"]
        for name in ("w2", "depth2", "shore2", "season2", "owner2", "cls", "flow",
                     "klass", "tannin2", "wet2"):
            setattr(self, name, arrays[name])
        # The graph key. Every downstream stage that needs a water *kind* joins
        # through this, never through a re-derivation of its own (0066).
        # The entity raster arrived with schema 3 (16c). A bundle without one
        # (an older publish, a snapshot another stage copied aside) still
        # loads: `ids` is None and `entity_at` answers None, so a caller that
        # needs the graph's answer gets nothing rather than a wrong id.
        self.ids = arrays.get("ids")

    def _decode(self, water_dir: Path, heights: Path | None) -> dict:
        """Every raster decoded from its PNG (the cache's builder)."""
        out = {}
        rgb = np.asarray(Image.open(water_dir / self.meta["surface"]["file"]).convert("RGB"))
        out["w2"], out["depth2"] = decode_surface(rgb, self.meta)
        shore = np.asarray(Image.open(water_dir / "water-shore.png").convert("RGB"))
        out["shore2"] = shore[..., 0].astype(np.float32) / 255.0 * float(self.meta["surface"]["shoreMaxM"])
        out["season2"] = shore[..., 1].astype(np.float32) / 255.0
        out["tannin2"] = shore[..., 2].astype(np.float32) / 255.0
        out["owner2"] = np.asarray(Image.open(water_dir / "water-owner.png").convert("L"))
        id_path = water_dir / "water-id.png"
        out["ids"] = (decode_ids(np.asarray(Image.open(id_path).convert("RGB")))
                      if id_path.exists() else None)
        klass = np.asarray(Image.open(water_dir / "water-class.png").convert("RGB"))
        out["klass"] = klass          # R class, G turbidity, B salinity
        out["cls"] = klass[..., 0]
        flow = np.asarray(Image.open(water_dir / "water-flow.png").convert("RGB"))
        out["flow"] = flow[..., 2].astype(np.float32) / 255.0 * float(self.meta["flow"]["flowMax"])
        out["wet2"] = out["depth2"] > 0.0
        if heights is not None:
            refined = np.load(heights).astype(np.float32)
            i2 = export_index(refined.shape[0], WEB_STEP)
            out["ground2"] = refined[np.ix_(i2, i2)]
        return out

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
        self._rivers = {r["id"]: r for r in graph.get("rivers", [])}
        return ({r["id"]: r for r in graph["reaches"]},
                {b["id"]: b for b in graph["bodies"]})

    def river(self, river_id: str) -> dict | None:
        """The graph's river record for an id, or None."""
        self._graph_index
        return self._rivers.get(river_id)

    def reach(self, entity_id: str) -> dict | None:
        """The graph's reach record for an id, or None."""
        return self._graph_index[0].get(entity_id)

    def body(self, entity_id: str) -> dict | None:
        """The graph's body record for an id, or None."""
        return self._graph_index[1].get(entity_id)

    @cached_property
    def _names(self) -> dict[str, dict]:
        """`world/sources/hydrology/names.json` by entity id (16g): the names
        record lives beside the graph, never inside it, because the carve and
        the water compile recorded the graph's content hash into their meta
        and editing the graph would stale those silently."""
        path = self.graph_path.with_name("names.json")
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return {n["entityId"]: n for n in doc.get("names", []) if "entityId" in n}

    def name_of(self, entity_id: str) -> str | None:
        """The entity's name (a literal for tools; the text key is
        `textKey` on the same row), or None when it has none."""
        row = self._names.get(entity_id)
        return row.get("name") if row else None

    def record(self, entity_id: str) -> dict | None:
        """Reach or body record for an id, whichever the graph holds, with
        `name` merged from the names record when one exists."""
        rec = self.reach(entity_id)
        if rec is None:
            rec = self.body(entity_id)
        if rec is None:
            rec = self.river(entity_id)
        if rec is None:
            return None
        # a reach with no name of its own carries its river's
        name = self.name_of(entity_id) or (self.name_of(rec["river"]) if rec.get("river") else None)
        return {**rec, "name": name} if name and not rec.get("name") else rec

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
        under each texel: a reach's declared `depthM`, a body's level realised
        on the ground (the compiled depth),
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
                # a body's record is its LEVEL; its depth at a texel is that
                # level realised on the frozen ground, which is the compiled
                # depth (0065). `maxDepthM` here gave the whole ocean 106 m
                # at its 0.1 m shore (measured 2026-09-19, 16g review).
                lut[i] = -1.0
        out = lut[self.ids]
        body_px = out < 0.0
        out[body_px] = np.maximum(self.depth2[body_px], 0.0)
        return out

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

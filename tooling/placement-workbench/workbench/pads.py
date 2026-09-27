"""Building pads in the workbench (decision 0101): a piece that declares a
pad ({apronM?, datumM?, floorMinM?}, `place --pad`) is judged and seated on
the PATCHED ground, never the frozen ground, and its edges on rule R1.

The math is `worldgen.settlement_run_pads` (one pad surface for the
workbench, the compile and the bundle export); this module only reads the
scene: the pad polygon from the piece's measured outline, the datum from the
chunk ground under it (the ground the runtime seats on), and the retaining
walls laid along its edges.
"""
from __future__ import annotations

from . import measure, paths

PAD_KEYS = ("apronM", "datumM", "floorMinM", "batter", "apronBySide")

RETAIN_REACH_M = 1.0      # a wall piece's outline within this of a pad edge retains it
RETAIN_COVER = 0.9        # ... over at least this share of the edge's length


def _srp():
    paths.bridge()
    from worldgen import settlement_run_pads as srp
    return srp


def parse(tokens: list[str] | None) -> dict | None:
    """`--pad [KEY=VALUE ...]` -> {apronM?, datumM?, floorMinM?}; None
    without the flag (a bare `--pad` is a pad with every default)."""
    if tokens is None:
        return None
    out = {}
    for tok in tokens:
        key, _, value = tok.partition("=")
        if key not in PAD_KEYS or not value:
            raise ValueError(f"--pad takes KEY=VALUE with KEY one of {', '.join(PAD_KEYS)}; "
                             f"got {tok!r}")
        if key == "apronBySide":
            # `apronBySide=n:3.5,e:1` (round 4): a per-side apron (compass sides)
            out[key] = {k: float(v) for k, _, v in (kv.partition(":") for kv in value.split(","))}
            if not set(out[key]) <= set("nesw"):
                raise ValueError(f"--pad apronBySide takes n|e|s|w:METRES; got {tok!r}")
            continue
        if key == "batter":
            if value.lower() not in ("true", "false"):
                raise ValueError(f"--pad batter takes true or false; got {tok!r}")
            out[key] = value.lower() == "true"
        else:
            out[key] = float(value)
    return out


def resolve(cat, g, piece) -> dict | None:
    """The piece's pad on this pose: polygon (outline grown by the apron),
    the datum (`settlement_run_pads.resolve_pad` over the chunk ground under
    the polygon, clamped on it and on the survey), fill, cut and the
    compile's refusal, or None."""
    if piece.pad is None:
        return None
    srp = _srp()
    apron = float(piece.pad.get("apronM", srp.PAD_APRON_M))
    polygon = srp.pad_polygon(measure.footprint_province(cat, piece), apron,
                              piece.pad.get("apronBySide"))
    samples = srp.footprint_samples(polygon)
    # the median on the chunk ground (what the runtime seats on); the clamp
    # also holds on the survey raster the compile judges fill and cut on
    got = srp.resolve_pad([g.chunk_height(x, z) for x, z in samples], piece.pad.get("datumM"),
                          piece.pad.get("floorMinM"),
                          also=[g.survey_height(x, z) for x, z in samples])
    blend = (srp.batter_blend_m(polygon, got["datumM"], g.chunk_height)
             if piece.pad.get("batter") and got["datumM"] is not None else srp.PAD_BLEND_M)
    return {**got, "apronM": apron, "polygonM": polygon, "blendM": blend}


class PaddedGround:
    """The scene's ground with every overlay the runtime applies (0102): each
    declared building pad and each run pad (`run_overlays`), point by point
    (`pad_overlay.ground`, in overlay id order); anything else is the frozen
    ground's. ``pad_index`` covers the building pads only (the retaining sill
    and the padded slope read a building's level pad)."""

    def __init__(self, g, pads: list[dict], runs: list[dict] | None = None):
        srp = _srp()
        from worldgen import pad_overlay
        self._g = g
        self.pad_index = srp.PadIndex([p["polygonM"] for p in pads])
        overlays = [pad_overlay.building_overlay(p["id"], p["polygonM"], float(p["datumM"]),
                                                 float(p.get("blendM", srp.PAD_BLEND_M)))
                    for p in pads] + list(runs or [])
        self.overlays = overlays
        # a building pad's reach (its polygon grown by its blend ramp): the
        # ground a dressing prop seated there stands on is the padded surface
        from shapely.geometry import Polygon
        from shapely.ops import unary_union
        self._reach = unary_union([Polygon(p["polygonM"]).buffer(float(p.get("blendM", srp.PAD_BLEND_M)))
                                   for p in pads]) if pads else None
        self._chunks = pad_overlay.ground(g.chunk_height, overlays)
        self._survey = pad_overlay.ground(g.survey_height, overlays)

    def __getattr__(self, name):
        return getattr(self._g, name)

    def chunk_height(self, x: float, z: float) -> float:
        return self._chunks(x, z)

    def chunk_heights(self, X, Z):
        """`chunk_height` over arrays in one vectorised pass: the frozen
        ground's array sampler, then every overlay over the arrays
        (`pad_overlay.ground_many`, the point maths operation for operation,
        so each height equals `chunk_height` at that point; r5 review)."""
        import numpy as np
        from worldgen import pad_overlay
        X, Z = np.asarray(X, float), np.asarray(Z, float)
        return pad_overlay.ground_many(self._g.chunk_heights(X, Z), X, Z, self.overlays)

    def survey_height(self, x: float, z: float) -> float:
        return self._survey(x, z)

    def height(self, x: float, z: float, source: str = "chunks") -> float:
        return self.chunk_height(x, z) if source == "chunks" else self.survey_height(x, z)

    def dressing_slope_deg(self, polygon_m) -> float | None:
        """A dressing prop's footing slope inside a building pad's reach (pad
        + blend) read on the padded surface itself (0.5 m probes, never the
        5.48 m grid cells, which read the frozen ground: planner ruling
        2026-09-27, walk 2 round 3); None outside every reach."""
        from shapely.geometry import Polygon
        if self._reach is None or not self._reach.contains(Polygon(polygon_m)):
            return None
        return _srp().surface_slope_deg(self._survey, polygon_m)

    def footprint_max_slope_deg(self, polygon_m) -> float:
        """Over a pad the patched surface's own slope (the grid's 5.48 m cells
        read the frozen ground); elsewhere the grid's."""
        padded = _srp().padded_slope_deg(self._survey, self.pad_index, polygon_m,
                                         self._g.footprint_max_slope_deg)
        return self._g.footprint_max_slope_deg(polygon_m) if padded is None else padded


def refusal(cat, g, piece, pad: dict) -> str | None:
    """Why the compile would refuse this resolved pad, from the compile's own
    judge (`settlement_run_pads.building_pad`) on the ground it reads (the
    survey raster and its water), or None. The datum is resolved on the
    chunk ground (0101); a fill or cut the survey puts over the limit, water
    under the pad, or a datum under its flood floor is refused here too."""
    if pad["error"]:
        return pad["error"]
    spec = {"datumM": pad["datumM"], "apronM": pad["apronM"]}
    for key in ("apronBySide", "batter"):          # the compile judges the same pad
        if piece.pad.get(key):
            spec[key] = piece.pad[key]
    if piece.pad.get("floorMinM") is not None:
        spec["floorMinM"] = piece.pad["floorMinM"]
    _, why = _srp().building_pad(spec, measure.footprint_province(cat, piece),
                                 g.survey_height, lambda x, z: g.depth(x, z) > 0.0)
    return why


def _pad_key(scene) -> tuple:
    """What the scene's pads depend on: every padded piece's pose and spec."""
    return (getattr(scene, "groundStem", ""), tuple(
        (p.uid, p.asset, p.x, p.z, p.yaw, p.pitch, p.roll, p.mirror, p.scale,
         tuple(sorted((k, str(v)) for k, v in p.pad.items()))) for p in scene.pieces if p.pad is not None))


def scene_pads(cat, scene) -> dict:
    """{uid: resolved pad} for every piece that declares one; resolved once
    per set of padded poses (a settle of an unpadded piece re-reads the
    memo, never re-resolves every pad)."""
    key = _pad_key(scene)
    memo = scene.__dict__.setdefault("_padMemo", {})
    if memo.get("key") != key:
        g = scene.ground()
        out = {}
        for p in scene.pieces:
            got = resolve(cat, g, p)
            if got is not None:
                out[p.uid] = got
        memo.clear()
        memo.update(key=key, pads=out)
    return memo["pads"]


def _pad_owner(piece) -> str:
    """The parcel id a piece's pad overlay is named for (its uid when unbound)."""
    role = getattr(piece, "role", None) or {}
    return role["id"] if role.get("kind") == "parcel" and role.get("id") else piece.uid


def overlay_id(scene, uid: str) -> str:
    """The id the bundle export gives this piece's pad overlay
    (`settlement_run_pads.pad_patch`: patch.pad.settlement.<place>.<parcel
    id>), so the workbench applies pads in the runtime's id order (16k fix 2
    round 3); an unbound piece takes its uid as the parcel id."""
    owner = _pad_owner(next(p for p in scene.pieces if p.uid == uid))
    return _srp().pad_patch(getattr(scene, "placeId", "") or "scene", owner, [{"placementId": uid, "targetM": 0.0,
                                                    "footprintM": [[0.0, 0.0]]}],
                            owner="building")["id"]


def _run_members(scene) -> dict[str, list]:
    """{run parcel id: [(index, piece)...] sorted} for every run whose
    members all carry a pivot height."""
    runs: dict[str, list] = {}
    for p in scene.pieces:
        role = getattr(p, "role", None) or {}
        if role.get("kind") == "run" and role.get("id"):
            runs.setdefault(role["id"], []).append((int(role.get("index", 0)), p))
    return {rid: sorted(m, key=lambda t: t[0]) for rid, m in runs.items()
            if all(q.y is not None for _i, q in m)}


def run_overlays(cat, scene, g=None) -> list[dict]:
    """The run pads the bundle export measures for this scene (planner ruling
    W3, 16k fix 2 round 4): the scene's runs as bundle rows (member id
    `<run>.piece.<n>`, riseM the pivot's rise over member 0, the measured
    footprint, the manifest's designed sink), through the export's own
    `settlement_run_pads.run_pad_patches` on the frozen survey with its
    water, and `pad_overlay.overlay_from_patch` (ids and maths as the
    runtime's `groundOverlays`)."""
    srp = _srp()
    from worldgen import pad_overlay
    from worldgen.scale import RAW_M
    g = scene.ground() if g is None else g
    place = getattr(scene, "placeId", "") or "scene"
    rows = []
    for rid, members in _run_members(scene).items():
        run_id = f"{place}.{rid}"
        y0 = members[0][1].y
        for idx, p in members:
            rows.append({"id": f"{run_id}.piece.{idx + 1}",
                         "run": {"id": run_id, "index": idx, "riseM": float(p.y - y0)},
                         "footprintM": [[float(x), float(z)]
                                        for x, z in measure.footprint_province(cat, p)],
                         "anchor": {"designedSinkM": cat.row(p.asset)["designedSinkM"]},
                         "scale": p.scale})
    if not rows:
        return []
    patches = srp.run_pad_patches(rows, place, g.survey_height,
                                  lambda x, z: g.depth(x, z) > 0.0)
    hard = srp.PAD_HARD_RADIUS_PX * RAW_M
    return [pad_overlay.overlay_from_patch(q, hard) for q in patches]


def _run_key(scene) -> tuple:
    return tuple((rid, tuple((i, p.uid, p.asset, p.x, p.z, p.yaw, p.scale, round(p.y, 6))
                             for i, p in m)) for rid, m in sorted(_run_members(scene).items()))


def ground_for(cat, scene, piece, resolved: dict | None = None):
    """The ground every piece is seated and judged on: the frozen ground
    patched by every overlay the runtime applies for the scene, building pads
    and run pads alike, whether or not this piece declares one (the compile
    reads `PaddedSurvey` for every piece once the pads resolve, 0101); the
    frozen ground itself when there is none. ``piece`` is kept for the
    callers' signature."""
    g = scene.ground()
    resolved = scene_pads(cat, scene) if resolved is None else resolved
    memo = scene.__dict__.setdefault("_padMemo", {})
    stem = getattr(scene, "groundStem", "")
    run_key = (stem, _run_key(scene))
    ok = [(uid, r) for uid, r in resolved.items() if r["error"] is None]
    # `scene.ground()` hands a new window object per call over the same
    # ground: the key is the ground's stem and the overlay set, never an id.
    # It is built from what the overlays are made of (the pad's owner, outline
    # and datum; the runs' poses), so a repeat call builds no overlay (r5 review)
    owners = {p.uid: _pad_owner(p) for p in scene.pieces} if ok else {}
    key = (stem, getattr(scene, "placeId", ""),
           tuple((uid, owners.get(uid), tuple(map(tuple, r["polygonM"])), r["datumM"],
                  r.get("blendM")) for uid, r in ok), run_key[1])
    if memo.get("groundKey") == key:
        return memo["ground"]
    if memo.get("runKey") != run_key:
        memo.update(runKey=run_key, runs=run_overlays(cat, scene, g) if run_key[1] else [])
    runs = memo["runs"]
    live = [{"id": overlay_id(scene, uid), "polygonM": r["polygonM"], "datumM": r["datumM"],
             "blendM": r.get("blendM", _srp().PAD_BLEND_M)} for uid, r in ok]
    if not live and not runs:
        return g
    memo.update(groundKey=key, ground=PaddedGround(g, live, runs))   # one per overlay set
    return memo["ground"]


def pad_fit(cat, scene, piece, pad: dict) -> dict:
    """Rule R1 (0101): every pad edge whose fill or cut against the frozen
    ground beyond it exceeds RETAIN_BAR_M is retained by pieces of the
    building kit's wall family covering it; a kit with no wall family keeps
    every edge within the bar. `padRule` is None exactly when the pad passes
    (and the compile would not refuse it)."""
    from shapely.geometry import LineString, Polygon
    from shapely.ops import unary_union
    srp = _srp()
    g = scene.ground()
    kit = cat.row(piece.asset)["kit"]
    family = srp.RETAINING_WALLS.get(kit)
    walls = [q for q in scene.pieces if q is not piece and family
             and q.asset.startswith(family)]
    reach = (unary_union([Polygon(measure.footprint_province(cat, q)) for q in walls])
             .buffer(RETAIN_REACH_M) if walls else None)
    edges = srp.pad_edges(pad["polygonM"], pad["datumM"], g.chunk_height)
    unretained = []
    for e in edges:
        if not e["needsWall"]:
            continue
        line = LineString([e["fromM"], e["toM"]])
        cover = 0.0 if reach is None else line.intersection(reach).length / line.length
        e["wallCover"] = round(cover, 2)
        if cover < RETAIN_COVER:
            unretained.append(e)
    if not family and (piece.pad or {}).get("batter"):
        # 0101 R1 amendment (planner ruling 2026-09-27, round 3): a kit with
        # no retaining-wall family (Argonian mud) grades an edge up to
        # BATTER_MAX_M over a blend ramp BATTER_RUN x its height wide
        # (`srp.batter_blend_m`, the ramp the overlay draws); higher stays illegal
        for e in unretained:
            e["batter"] = max(e["fillM"], e["cutM"]) <= srp.BATTER_MAX_M
        unretained = [e for e in unretained if not e["batter"]]
    why = refusal(cat, g, piece, pad)
    if why is None and unretained:
        worst = max(max(e["fillM"], e["cutM"]) for e in unretained)
        why = (f"pad-fit: {len(unretained)} pad edge(s) stand up to {worst:.2f} m off the ground "
               f"(> {srp.RETAIN_BAR_M} m) with no retaining wall"
               + (f" of {kit}'s family ({', '.join(family)}) along them" if family else
                  f"; {kit} has no retaining-wall family, so its pad stays within "
                  f"{srp.RETAIN_BAR_M} m, or up to {srp.BATTER_MAX_M} m as a graded batter "
                  f"(`batter: true`: a blend ramp {srp.BATTER_RUN:g} x the edge wide): "
                  f"move the piece or change it"))
    return {"datumM": pad["datumM"], "how": pad["how"], "fillM": pad["fillM"],
            "blendM": pad.get("blendM"),
            "cutM": pad["cutM"], "edges": edges,
            "unretainedEdges": [e["edge"] for e in unretained], "padRule": why}

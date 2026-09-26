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

PAD_KEYS = ("apronM", "datumM", "floorMinM")
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
    polygon = srp.pad_polygon(measure.footprint_province(cat, piece), apron)
    samples = srp.footprint_samples(polygon)
    # the median on the chunk ground (what the runtime seats on); the clamp
    # also holds on the survey raster the compile judges fill and cut on
    got = srp.resolve_pad([g.chunk_height(x, z) for x, z in samples], piece.pad.get("datumM"),
                          piece.pad.get("floorMinM"),
                          also=[g.survey_height(x, z) for x, z in samples])
    return {**got, "apronM": apron, "polygonM": polygon}


class PaddedGround:
    """The scene's ground with every declared pad applied (point by point,
    `settlement_run_pads.pad_ground`); anything else is the frozen ground's."""

    def __init__(self, g, pads: list[dict]):
        srp = _srp()
        self._g = g
        self._pads = pads
        self._chunks = srp.pad_ground(g.chunk_height, pads)
        self._survey = srp.pad_ground(g.survey_height, pads)

    def __getattr__(self, name):
        return getattr(self._g, name)

    def chunk_height(self, x: float, z: float) -> float:
        return self._chunks(x, z)

    def survey_height(self, x: float, z: float) -> float:
        return self._survey(x, z)

    def height(self, x: float, z: float, source: str = "chunks") -> float:
        return self.chunk_height(x, z) if source == "chunks" else self.survey_height(x, z)

    def footprint_max_slope_deg(self, polygon_m) -> float:
        """Over a pad the patched surface's own slope (the grid's 5.48 m cells
        read the frozen ground); elsewhere the grid's."""
        from shapely.geometry import Polygon
        poly = Polygon(polygon_m)
        if any(poly.intersects(Polygon(p["polygonM"])) for p in self._pads):
            return _srp().surface_slope_deg(self._survey, polygon_m)
        return self._g.footprint_max_slope_deg(polygon_m)


def refusal(cat, g, piece, pad: dict) -> str | None:
    """Why the compile would refuse this resolved pad, from the compile's own
    judge (`settlement_run_pads.building_pad`) on the ground it reads (the
    survey raster and its water), or None. The datum is resolved on the
    chunk ground (0101); a fill or cut the survey puts over the limit, water
    under the pad, or a datum under its flood floor is refused here too."""
    if pad["error"]:
        return pad["error"]
    spec = {"datumM": pad["datumM"], "apronM": pad["apronM"]}
    if piece.pad.get("floorMinM") is not None:
        spec["floorMinM"] = piece.pad["floorMinM"]
    _, why = _srp().building_pad(spec, measure.footprint_province(cat, piece),
                                 g.survey_height, lambda x, z: g.depth(x, z) > 0.0)
    return why


def scene_pads(cat, scene) -> dict:
    """{uid: resolved pad} for every piece that declares one."""
    g = scene.ground()
    out = {}
    for p in scene.pieces:
        got = resolve(cat, g, p)
        if got is not None:
            out[p.uid] = got
    return out


def ground_for(cat, scene, piece, resolved: dict | None = None):
    """The ground a piece is seated and judged on: patched by every pad in
    the scene when it declares one, else the frozen ground."""
    g = scene.ground()
    if piece.pad is None:
        return g
    resolved = scene_pads(cat, scene) if resolved is None else resolved
    return PaddedGround(g, [{"polygonM": r["polygonM"], "datumM": r["datumM"]}
                            for r in resolved.values() if r["error"] is None])


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
    why = refusal(cat, g, piece, pad)
    if why is None and unretained:
        worst = max(max(e["fillM"], e["cutM"]) for e in unretained)
        why = (f"pad-fit: {len(unretained)} pad edge(s) stand up to {worst:.2f} m off the ground "
               f"(> {srp.RETAIN_BAR_M} m) with no retaining wall"
               + (f" of {kit}'s family ({', '.join(family)}) along them" if family else
                  f"; {kit} has no retaining-wall family, so its pad stays within "
                  f"{srp.RETAIN_BAR_M} m: move the piece or change it"))
    return {"datumM": pad["datumM"], "how": pad["how"], "fillM": pad["fillM"],
            "cutM": pad["cutM"], "edges": edges,
            "unretainedEdges": [e["edge"] for e in unretained], "padRule": why}

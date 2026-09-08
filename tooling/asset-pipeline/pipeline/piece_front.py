"""Which way a piece FACES when it has no door to tell you.

Owner ruling 2026-09-07. A gate arch, a wall stub, a tower, a deck, a shrine or
a statue has no entrance, so nothing in the interiors index says which way round
it should be planted — and a gate that opens inward, or a wall whose outside
face looks at the market, reads as broken. Skyrim ships no "front" metadata: a
NIF carries a local axis and nothing else, and authors rely on the convention
plus on how they themselves placed the piece (see
docs/research/placement-settlements/piece-front-derivation.md).

**The definition** (owner steer 2026-09-07). A piece's front is the side its
authors repeatedly left OPEN — free of other statics, with somewhere to walk —
and its back is the side they set against something. It is a property of the
PIECE, read off its author's own placements, so it generalises past settlements
to lairs, shrines, ruins, camps, dungeon mouths and docks: every one of them has
a side you come at it from.

So the front is DERIVED, ranked, and only ever from evidence:

  1. **co-placement** — how the source authors actually planted the piece. Every
     mined assembly (`world/sources/placement/kit-assemblies-mined.json`) gives
     the pieces they stood AROUND it, as offsets in a known frame. Those are the
     blocked sides; the modal bearing away from them is the side left open, and
     that is the front. For an enclosure edge it is also the outside face — the
     gate's road side, the wall's field side — because what a gate is set
     against is the thing it encloses.
  2. **asymmetry** — the face the modeller detailed. Crenellation, decals,
     arch mouldings and reveals all cost triangles, so the bearing band with the
     highest triangle density per unit of surface is the show face, which is the
     face the author expected the player to walk up to.
  3. nothing — a symmetric piece (a plain block, a round platform). `None`, and
     the validator lets any yaw stand.

Angles are bearings in the PIECE's own frame: north = 0, clockwise, the same
convention as `interiors_index._bearing_deg` and a parcel's `yawDeg`, so the
world bearing of a front is ``frontDeg + yawDeg``.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
ASSEMBLIES_PATH = (REPO_ROOT / "world" / "sources" / "placement"
                   / "kit-assemblies-mined.json")

#: co-placement: bins for the modal bearing, and how much evidence it takes.
COPLACEMENT_BIN_DEG = 45.0
COPLACEMENT_MIN_WEIGHT = 3.0      # placements behind the answer
COPLACEMENT_MIN_SHARE = 0.4       # of all weight, in the winning bin

#: asymmetry: 30° bands, and how much more detailed the show face must be.
ASYMMETRY_BIN_DEG = 30.0
ASYMMETRY_MIN_TRIANGLES = 24      # in the winning band
ASYMMETRY_MIN_RATIO = 1.35        # its density against the median band's
#: A slab piece — a wall, a gate span — has two broad faces and two ends, and
#: only a broad face can be its front. Above this length-to-width ratio the
#: search is confined to bands whose bearing is off the long axis: on a ruined
#: wall the busiest triangles are the broken END, which is not a face at all.
ASYMMETRY_SLAB_RATIO = 1.3
ASYMMETRY_FACE_HALF_ANGLE_DEG = 45.0


def _bearing_deg(x: float, z: float) -> float:
    """North = 0, clockwise, in the GLB frame (x east, z south)."""
    return math.degrees(math.atan2(x, -z)) % 360.0


def _circular_mean(samples: list[tuple[float, float]]) -> float:
    """Weighted mean of `(degrees, weight)`."""
    sx = sum(w * math.sin(math.radians(d)) for d, w in samples)
    sy = sum(w * math.cos(math.radians(d)) for d, w in samples)
    return math.degrees(math.atan2(sx, sy)) % 360.0


def _modal(samples: list[tuple[float, float]], bin_deg: float,
           min_weight: float, min_share: float) -> float | None:
    """The modal bearing of weighted samples, or None if they do not agree."""
    total = sum(w for _, w in samples)
    if total < min_weight:
        return None
    bins = max(1, int(round(360.0 / bin_deg)))
    buckets: dict[int, list[tuple[float, float]]] = {}
    for deg, weight in samples:
        buckets.setdefault(int(deg // bin_deg) % bins, []).append((deg, weight))
    best_key = max(buckets, key=lambda k: sum(w for _, w in buckets[k]))
    best = buckets[best_key]
    if sum(w for _, w in best) / total < min_share:
        return None
    return _circular_mean(best)


# --------------------------------------------------------------------------- #
# (a) how the authors planted it
# --------------------------------------------------------------------------- #
def load_coplacements(path: Path = ASSEMBLIES_PATH) -> dict[str, list[tuple[float, float]]]:
    """asset id -> `(bearing to the neighbours' centroid, weight)` samples, in
    the piece's OWN frame.

    Read off the mine's groups (a piece and everything the authors repeatedly
    put around it) and its two-piece templates. A self-chain — a wall next to a
    copy of itself — is skipped: it says how the piece tiles, not which side
    faced the field.

    Offsets are the mine's z-up local metres, where the plan bearing is
    ``atan2(x, y)``; that is the same angle about the same axis as this
    module's GLB-frame ``atan2(x, -z)`` (see
    `interiors_index.assembly_doorway_entries`), so no conversion is needed.
    """
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    out: dict[str, list[tuple[float, float]]] = {}

    def add(asset_id: str | None, deg: float, weight: float) -> None:
        if asset_id and weight > 0:
            out.setdefault(asset_id, []).append((deg % 360.0, float(weight)))

    for kit_set in (data.get("sets") or {}).values():
        for group in kit_set.get("groups") or []:
            anchor = group.get("anchor")
            parts = [p for p in group.get("parts") or [] if p.get("offsetM")]
            if not anchor or not parts:
                continue
            weight = float(group.get("count") or 1)
            pts = [(float(p["offsetM"][0]), float(p["offsetM"][1])) for p in parts]
            n = len(pts) + 1                      # the anchor sits at the origin
            cx = sum(x for x, _ in pts) / n
            cy = sum(y for _, y in pts) / n
            add(anchor, math.degrees(math.atan2(cx, cy)), weight)
            for part, (px, py) in zip(parts, pts):
                if part.get("part") == anchor:
                    continue
                bearing = math.degrees(math.atan2(cx - px, cy - py))
                add(part.get("part"), bearing - float(part.get("yawDeg") or 0.0), weight)
        for tpl in kit_set.get("templates") or []:
            anchor, part = tpl.get("anchor"), tpl.get("part")
            if not anchor or not part or anchor == part or tpl.get("selfChain"):
                continue
            side = tpl.get("sideDeg")
            if side is None:
                continue
            weight = float(tpl.get("count") or 1)
            # the pair's centroid is the midpoint, so the anchor looks along
            # `sideDeg` at it and the part looks back down the same line.
            add(anchor, float(side), weight)
            add(part, float(side) + 180.0 - float(tpl.get("yawDeg") or 0.0), weight)
    return out


def coplacement_front(samples: list[tuple[float, float]] | None) -> tuple[float, int] | None:
    """`(front bearing, placements behind it)` — the modal OPEN side: the
    direction away from where the authors' other pieces stood."""
    if not samples:
        return None
    inward = _modal(samples, COPLACEMENT_BIN_DEG, COPLACEMENT_MIN_WEIGHT,
                    COPLACEMENT_MIN_SHARE)
    if inward is None:
        return None
    return (inward + 180.0) % 360.0, int(round(sum(w for _, w in samples)))


# --------------------------------------------------------------------------- #
# (b) the face the modeller detailed
# --------------------------------------------------------------------------- #
def _long_axis_deg(rel) -> float | None:
    """The bearing of a slab piece's long axis, or None when it is compact.

    Principal axis of the plan point cloud. Used to rule the ENDS of a wall out
    of the front search: an end is where a modular piece is cut, not a face
    anyone was meant to look at.
    """
    import numpy as np

    cov = np.cov(np.asarray(rel).T)
    if not np.all(np.isfinite(cov)) or cov.shape != (2, 2):
        return None
    values, vectors = np.linalg.eigh(cov)
    if values[0] <= 1e-9 or values[1] / values[0] < ASYMMETRY_SLAB_RATIO ** 2:
        return None
    vx, vz = vectors[:, 1]
    return math.degrees(math.atan2(float(vx), -float(vz))) % 360.0


def asymmetry_front(triangles) -> tuple[float, float] | None:
    """`(front bearing, density ratio)` from triangle density per bearing band.

    `triangles` is the `(n, 3, 3)` array `interiors_index.asset_triangles`
    returns, in the piece's own GLB frame. Detail is triangles per square metre
    of surface in the band: a plain wall is two big triangles, a crenellated or
    moulded one is hundreds of small ones, and the difference survives a piece
    being long on one axis (which raw counts would not).
    """
    if triangles is None or len(triangles) < ASYMMETRY_MIN_TRIANGLES * 2:
        return None
    import numpy as np

    tris = np.asarray(triangles, dtype=np.float64)
    centroids = tris.mean(axis=1)
    plan = centroids[:, [0, 2]]
    areas = 0.5 * np.linalg.norm(
        np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0]), axis=1)
    total = float(areas.sum())
    if total <= 1e-9:
        return None
    # AREA-weighted middle, not the mean of the triangle centroids: dicing one
    # face into a hundred triangles must not drag the origin towards it, or the
    # detailed face would end up reading as two side bands.
    origin = (plan * areas[:, None]).sum(axis=0) / total
    rel = plan - origin
    bearings = (np.degrees(np.arctan2(rel[:, 0], -rel[:, 1])) % 360.0)

    bins = int(round(360.0 / ASYMMETRY_BIN_DEG))
    index = (bearings // ASYMMETRY_BIN_DEG).astype(int) % bins
    counts = np.bincount(index, minlength=bins).astype(np.float64)
    band_area = np.bincount(index, weights=areas, minlength=bins)
    surfaced = band_area > 1e-6
    density = np.where(surfaced, counts / np.maximum(band_area, 1e-6), 0.0)
    # A band may only WIN on enough triangles to mean something, and — on a slab
    # piece — only if it is a broad face rather than an end. The reference it is
    # compared against is every surfaced band, plain ones included: that is what
    # "more detailed than the rest of the piece" means.
    candidate = surfaced & (counts >= ASYMMETRY_MIN_TRIANGLES)
    long_axis = _long_axis_deg(rel)
    if long_axis is not None:
        centres = (np.arange(bins) + 0.5) * ASYMMETRY_BIN_DEG
        off = np.abs((centres - long_axis + 90.0) % 180.0 - 90.0)
        candidate &= off >= ASYMMETRY_FACE_HALF_ANGLE_DEG
    if not candidate.any() or not surfaced.any():
        return None
    winner = int(np.argmax(np.where(candidate, density, -1.0)))
    reference = float(np.median(density[surfaced]))
    if reference <= 0 or density[winner] / reference < ASYMMETRY_MIN_RATIO:
        return None
    members = index == winner
    front = _circular_mean([(float(b), float(w))
                            for b, w in zip(bearings[members], counts[index[members]])])
    return front, round(float(density[winner] / reference), 2)


# --------------------------------------------------------------------------- #
# the ranked answer
# --------------------------------------------------------------------------- #
def derive_front(asset_id: str, triangles=None,
                 coplacements: dict[str, list[tuple[float, float]]] | None = None,
                 ) -> dict | None:
    """`{deg, evidence, outside, why}` for a piece, or None when it is symmetric.

    `outside` says the derived bearing is the face that must look AWAY from
    whatever an enclosure boundary encloses — true for both evidence kinds we
    have, since both find the side the author left open. It is carried
    explicitly so a future evidence kind that means "the way in" can say so
    instead of silently inverting the rule.
    """
    samples = (coplacements or {}).get(asset_id)
    mined = coplacement_front(samples)
    if mined is not None:
        deg, weight = mined
        return {"deg": round(deg, 1), "evidence": "co-placement", "outside": True,
                "why": (f"the source authors placed this piece {weight} times with other "
                        f"statics to one side; the side they left open, at {deg:.0f}° in "
                        f"its own frame, is the front — and on an enclosure edge that open "
                        f"side is the outside")}
    shape = asymmetry_front(triangles)
    if shape is not None:
        deg, ratio = shape
        return {"deg": round(deg, 1), "evidence": "asymmetry", "outside": True,
                "why": (f"the band at {deg:.0f}° in the piece's own frame carries "
                        f"{ratio:.2f}x the triangle density of a median band — the "
                        f"detailed face, which is the show side")}
    return None

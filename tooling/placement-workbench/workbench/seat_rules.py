"""The walk-4 seat rules (16k walk 4 lane WB, owner 2026-09-28): four defects
the owner found walking Claywater and Greenspring that a measurement should
have caught first. Each is a `check` rule (`wb.py check`, `apply`, `round`):

- burialRule: a shell or prop whose base sits deeper under the local ground
  than its designed burial (a Riften stable 0.91 m down on a pad).
- hangingRule: a hanging asset (the mined class, its pivot at its top, or a
  piece authored in its host's frame) standing on the ground unmounted.
- fixtureSeatRule: a light fixture's base on the surface under it (ground,
  deck, barrel top, floor) within FIXTURE_FLOAT_M, never below it.
- landingRule: every water-edge deck run sits LANDING_DECK_M over the water
  at its water end and meets dry ground (or a step) at its landward end.

The fifth (two arms on one post) extends `rules.sign` (signRule).
All read the PADDED ground (`rules._ground`), as every walk-packet rule does.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

import numpy as np

from . import measure, paths
from .mesh_query import cast_rays

BURY_MIN_M = 0.15            # burialRule: a base may sit this far under the ground with no design
BURY_TOL_M = 0.03            # ... over the allowance by more than the miner's contact (0097 rule 3)
DESIGNED_EVIDENCE = ("plugin", "base:", "part:", "swap:")
DESIGNED_ROW_EVIDENCE = ("policy",)
GUESS_EVIDENCE = ("mesh-sill", "mesh")
"""A sink read off the mesh alone (the mesh-sill ground-line tell: n 0, no
plugin placement measured it) is a guess, never a design (16k walk 9: the
notice board's mesh-sill sink of 1.82 m buried it to its roof and passed;
the Bosmer stair and the cave door before it). burialRule grants a guess
only as far as the real mesh contact allows (0085): at most
GUESS_BURY_MAX_M, or GUESS_BURY_SHARE of the mesh's height for a tall
piece whose base band is a foundation."""
GUESS_BURY_MAX_M = 0.3
GUESS_BURY_SHARE = 0.2
"""burialRule (CLAYWATER2, planner ruling 1 2026-09-28): an ``assetPlacement``
row (evidence exactly "policy", never "policy-fallback") is a reviewed
designed sink: the Riften stable's floor on the pad, its 0.91 m foundation
buried by design. The rule judges against that recorded sink, never the
mesh's lowest point alone."""
"""A sink whose evidence starts so is designed: measured from the plugin or
the mesh, or taken from another piece's row (a composite's base or part, a
variant's swap source: R44)."""
HANG_TOP_M = 0.15            # hangingRule: a pivot within this of the mesh top ...
HANG_DROP_RATIO = 3.0        # ... with the mesh hanging at least this many times further below
HANG_MIN_DROP_M = 0.5        # ... and at least this far (a basket's rim pivot is no hook)
HOST_FRAME_LIFT_M = 1.0      # ... or a mesh starting this far over its pivot (a host-frame part)
FIXTURE_FLOAT_M = 0.05       # fixtureSeatRule: a fixture's base at most this over its surface
FIXTURE_SINK_M = 0.03        # ... and at most this under it (the miner's contact, 0097 rule 3)
FIXTURE_REACH_M = 0.6        # ... the surface is read down from this far over the base
FIXTURE_TOKENS = ("lantern", "candle", "brazier", "torch", "sconce", "lamp")
LANDING_DECK_M = (0.15, 0.35)   # landingRule: deck over the water at the water end
LANDING_FOOT_M = 0.2         # ... landward end: deck within this of the dry ground past it
LANDING_STEP_REACH_M = 1.0   # ... or a step piece within this of the end
LANDING_TOKENS = ("step", "stair", "ramp")
LANDING_INSET_M = 0.3        # deck read this far inside an end, ground this far past it
WADE_DEPTH_M = 0.8           # ... a run end in water closes on a paired step-down this shallow
WADE_WAY_M = 3.0             # ... where a way (scene path) ends this close


def _has(asset: str, tokens) -> bool:
    stem = asset.rsplit("/", 1)[-1].lower()
    return any(t in stem for t in tokens)


def _mounted(scene, p) -> bool:
    from .scene import hung_on
    return hung_on(p) is not None or (p.role or {}).get("on") == "parent"


def _posed(cat, g, p):
    """The piece as the runtime stands it: its own pose, or (never settled)
    the runtime's seat (`measure.seat`), so an unsettled building is judged
    too (the Claywater stable has no `settle` in its op)."""
    if p.y is not None:
        return p, "pose"
    import copy
    q = copy.copy(p)
    try:
        q.y = measure.seat(cat, g, p)["y"]
    except ValueError:
        return None, None
    return q, "runtime-seat"


COMPILED_OFF_M = 0.03        # a compiled pivot this far off the workbench's is judged as well


def compiled_file(scene):
    """The place's last compiled settlement `apply` kept, or None."""
    pid = scene.placeId
    return paths.OUTPUT / "apply" / f"{pid}.compiled" / f"{pid}.settlement.json" if pid else None


def compiled_y(scene) -> dict[str, float]:
    """{uid: pivot y} of the place's last compile (`apply` keeps it at
    output/apply/<placeId>.compiled/<placeId>.settlement.json): what the
    runtime draws for a `yFinal` or re-anchored piece. The owner walked the
    compiled Claywater stable at y 34.83 while the workbench seats it at the
    37.4 m pad datum, and the landing's pivot at 38.60 against 35.59
    (walk 4): a rule judged on the workbench pose alone cannot see that.
    Empty when there is no compile or it is older than the layout file."""
    pid = scene.placeId
    f = compiled_file(scene)
    if not pid or f is None or not f.exists():
        return {}
    ref = (scene.layout or {}).get("path")
    src = paths.REPO_ROOT / ref if ref else None
    if src is not None and src.exists() and src.stat().st_mtime > f.stat().st_mtime:
        return {}                   # compiled before the layout last changed: stale, not judged
    return compiled_from(scene, f)


def compiled_from(scene, f) -> dict[str, float]:
    """{uid: pivot y} of the compiled settlement (or fixture) at ``f``."""
    from . import rules
    doc = json.loads(Path(f).read_text())
    out = {}
    marks = {(q.role or {}).get("id"): q.uid for q in scene.pieces
             if (q.role or {}).get("kind") == "landmark"}
    for pl in doc.get("placements") or []:
        uid = rules.bundle_uid(scene, pl.get("id", ""), scene.placeId) or marks.get(pl.get("landmarkId"))
        pos = pl.get("positionM")
        if uid and pos and len(pos) == 3:
            out[uid] = float(pos[1])
    return out


def _sink_row(cat, asset: str) -> tuple[float, str]:
    row = cat.row(asset)
    ds = row.get("designedSinkM") or {}
    return float(ds.get("p50") or 0.0), str(ds.get("evidence") or "none")


# --------------------------------------------------------------------------
# burialRule
# --------------------------------------------------------------------------

def burial_targets(cat, scene) -> list[str]:
    """Shells (parcels, landmarks) and ground props; never a mounted child, a
    run member, a hull, a piled or water piece, or a dug-in shell (C11a)."""
    out = []
    for p in scene.pieces:
        row = cat.row(p.asset)
        kind = (p.role or {}).get("kind")
        if kind == "run" or p.beached or row.get("piled") or _mounted(scene, p):
            continue
        if (row.get("anchorClass") or "ground") in ("water", "hanging", "fx"):
            continue
        if (row.get("fit") or (row.get("placement") or {}).get("groundFit")) == "dug-in":
            continue
        out.append(p.uid)
    return out


def _base_depth(cat, g, q) -> tuple[float, float, float]:
    """(depth of the lowest mesh point under the padded ground there, x, north)."""
    world = q.world_points(np.asarray(cat.mesh(q.asset).vertices))
    k = int(np.argmin(world[:, 2]))
    x, north, low = (float(v) for v in world[k])
    return float(g.chunk_height(x, -north)) - low, x, north


def designed_burial(cat, asset: str, scale: float) -> tuple[float, str, float | None]:
    """(designed base depth, sink evidence, the guess cap or None): the
    depth under the ground the piece's base is designed to stand, (p50 +
    pivot over base) x scale. Plugin-measured sinks (and rows derived from
    them) and reviewed ``assetPlacement`` rows design it in full; a mesh-only
    guess (GUESS_EVIDENCE) is capped at max(GUESS_BURY_MAX_M,
    GUESS_BURY_SHARE x the mesh height); anything else designs nothing."""
    sink, ev = _sink_row(cat, asset)
    row = cat.row(asset)
    depth = (sink + float(row["originOffsetM"][2])) * scale
    if ev.startswith(DESIGNED_EVIDENCE) or ev in DESIGNED_ROW_EVIDENCE:
        return depth, ev, None
    if ev.startswith(GUESS_EVIDENCE):
        height = float((row.get("sizeM") or [0, 0, 0])[2]) * scale
        cap = max(GUESS_BURY_MAX_M, GUESS_BURY_SHARE * height)
        return min(depth, cap), ev, cap
    return 0.0, ev, None


def buried_share(cat, g, q, most: int = 400) -> float:
    """The real mesh contact (0085): the share of the posed mesh's vertices
    under the ground straight below each (a seeded-stride subsample of at
    most ``most``); a foundation band reads a few per cent, a piece sunk to
    its roof most of them."""
    v = q.world_points(np.asarray(cat.mesh(q.asset).vertices))
    step = max(1, len(v) // most)
    v = v[::step]
    under = np.array([float(g.chunk_height(float(x), -float(n))) for x, n, _ in v])
    return round(float((v[:, 2] < under).mean()), 3) if len(v) else 0.0


def burial_piece(cat, scene, ctx, p) -> tuple[dict, list]:
    """burialRule for one piece: its lowest mesh point against the padded
    ground straight under it, at the workbench pose (or the runtime seat
    when never settled) AND at the place's last compiled pose when that
    stands more than COMPILED_OFF_M off (`compiled_y`). The designed burial
    is the base depth the designed sink gives, (p50 + pivot over base) x
    scale, when the sink has evidence (DESIGNED_EVIDENCE); a policy sink
    designs nothing, an assetPlacement row (evidence "policy",
    DESIGNED_ROW_EVIDENCE) designs. The allowance is max(designed,
    BURY_MIN_M), plus BURY_TOL_M."""
    import copy
    g = ctx["g"]
    q, how = _posed(cat, g, p)
    if q is None:
        return {}, []
    designed, ev, guess_cap = designed_burial(cat, q.asset, q.scale)
    allow = max(designed, BURY_MIN_M)
    poses = [(how, q)]
    cy = ctx.get("compiled", {}).get(p.uid)
    if cy is not None and abs(cy - q.y) > COMPILED_OFF_M:
        c = copy.copy(q)
        c.y = cy
        poses.append(("compiled", c))
    r = {"allowM": round(allow, 3), "designedBaseDepthM": round(designed, 3), "sinkEvidence": ev}
    if guess_cap is not None:
        r["guessCapM"] = round(guess_cap, 3)
    fails = []
    dug_in = (cat.row(q.asset).get("placement") or {}).get("evidence", {}).get("policyId") == "dug-in"
    for where, pose in poses:
        depth, x, north = _base_depth(cat, g, pose)
        if dug_in:
            # a dug-in piece is seated on the lowest ground under its outline
            # (`wb.py _sill`'s line), so its designed burial is measured from
            # that line: ground rising under one end of a 30 m cave mound is
            # the hill it is set into, not a sinking (16k walk 9)
            poly = measure.footprint_province(cat, pose)
            if poly:
                line = min(float(g.chunk_height(px, pz)) for px, pz in poly)
                depth = min(depth, line - (float(np.min(pose.world_points(
                    np.asarray(cat.mesh(pose.asset).vertices))[:, 2]))))
        key = "baseDepthM" if where != "compiled" else "compiledBaseDepthM"
        r[key] = round(depth, 3)
        if where != "compiled":
            r["buriedShare"] = buried_share(cat, g, pose)
        r["judgedAt" if where != "compiled" else "compiledOffM"] = (
            where if where != "compiled" else round(pose.y - q.y, 3))
        if depth > allow + BURY_TOL_M:
            tag = {"runtime-seat": " [at the runtime seat: the op never settles it]",
                   "compiled": f" [at the last compile's pivot y {pose.y:.2f}, "
                               f"{pose.y - q.y:+.2f} m off the workbench's]"}.get(where, "")
            capped = (f"; the {ev} sink is a guess, granted only {guess_cap:.2f} m by the "
                      f"mesh contact rule" if guess_cap is not None else "")
            fails.append(f"{p.uid}: its base stands {depth:.2f} m under the ground at "
                         f"({x:.1f}, {-north:.1f}) (allowed {allow:.2f} m: designed {designed:.2f} m "
                         f"by a {ev} sink, least {BURY_MIN_M} m{capped}){tag}")
    return {p.uid: r}, fails


# --------------------------------------------------------------------------
# rockSeatRule
# --------------------------------------------------------------------------

ROCK_POLICY = {
    "tokens": ("rockcairn", "boulder"),
    "contacts": 3,          # seated by its lowest three contacts ...
    "contactM": 0.05,       # ... each within this of the ground (or under it)
    "spreadM": 0.15,        # ... at least this far apart in plan
    "embedMaxM": 0.3,       # ... and embedded at most this deep anywhere
    "samples": 800,         # mesh points judged (seeded subsample of the lower half)
    "why": "0075 rock seating (planner ruling 5, CLAYWATER2 2026-09-28): a rock on "
           "a rim or bank rests on its lowest three contacts and may embed up to "
           "0.3 m; the direct fit's slope and delta limits are for built pieces",
}
"""The kit policy row 'rock': the assets it covers (name tokens: the Skyfall
cairns rockcairn01-04 and the boulder classes) seat by rock_seat, never by
the direct fit's 2 deg slope / ground-delta rule or the footFloat bar."""


def is_rock(asset: str) -> bool:
    return _has(asset, ROCK_POLICY["tokens"])


def rock_targets(cat, scene) -> list[str]:
    return [p.uid for p in scene.pieces if is_rock(p.asset) and not _mounted(scene, p)
            and not p.beached]


def _rock_gaps(cat, g, q) -> tuple[np.ndarray, np.ndarray]:
    """(plan points (n, 2) as (x, north), gap of each mesh point over the
    padded ground under it (negative: embedded)) over a seeded subsample of
    the mesh's lower half at the pose."""
    world = q.world_points(np.asarray(cat.mesh(q.asset).vertices))
    lo, hi = float(world[:, 2].min()), float(world[:, 2].max())
    low = world[world[:, 2] <= lo + 0.5 * (hi - lo) + 1e-6]
    n = ROCK_POLICY["samples"]
    if len(low) > n:
        low = low[np.random.default_rng(0).choice(len(low), n, replace=False)]
    ground = np.array([g.chunk_height(float(x), -float(north)) for x, north, _z in low])
    return low[:, :2], low[:, 2] - ground


def _spread_contacts(xy: np.ndarray, gaps: np.ndarray, k: int) -> list[int]:
    """The lowest-gap points, taken in gap order, at least spreadM apart."""
    out: list[int] = []
    for i in np.argsort(gaps, kind="stable"):
        if all(math.dist(xy[i], xy[j]) >= ROCK_POLICY["spreadM"] for j in out):
            out.append(int(i))
            if len(out) == k:
                break
    return out


def rock_seat_y(cat, g, p) -> float:
    """The pivot height that rests ``p`` on its lowest three spread contacts:
    its third contact's gap brought to zero (the first two then touch or
    embed)."""
    xy, gaps = _rock_gaps(cat, g, p)
    idx = _spread_contacts(xy, gaps, ROCK_POLICY["contacts"])
    return float(p.y) - float(gaps[idx[-1]])


def rock_piece(cat, scene, ctx, p) -> tuple[dict, list]:
    """rockSeatRule for one rock: ROCK_POLICY["contacts"] spread points
    within contactM of the padded ground (or under it), and no point
    embedded deeper than embedMaxM."""
    g = ctx["g"]
    if p.y is None:
        return {p.uid: {"judged": False}}, [f"{p.uid}: a rock needs a height (settle or y)"]
    xy, gaps = _rock_gaps(cat, g, p)
    k = ROCK_POLICY["contacts"]
    idx = _spread_contacts(xy, gaps, k)
    third = float(gaps[idx[-1]]) if len(idx) == k else math.inf
    embed = max(0.0, -float(gaps.min()))
    r = {"contactGapsM": [round(float(gaps[i]), 3) for i in idx], "embedM": round(embed, 3),
         "seatYM": round(float(p.y) - third, 3) if math.isfinite(third) else None,
         "policy": "rock"}
    fails = []
    if third > ROCK_POLICY["contactM"]:
        fails.append(f"{p.uid}: rests on fewer than {k} contacts (the {k}th stands "
                     f"{third:.2f} m over the ground; seat it at y {r['seatYM']})")
    if embed > ROCK_POLICY["embedMaxM"] + BURY_TOL_M:
        fails.append(f"{p.uid}: embedded {embed:.2f} m (> {ROCK_POLICY['embedMaxM']} m, "
                     f"0075 rock seating): a flatter spot or a smaller rock")
    return {p.uid: r}, fails


# --------------------------------------------------------------------------
# hangingRule
# --------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _mined_anchors() -> dict:
    path = paths.PLACEMENT_RECORDS / "kit-mounts-mined.json"
    return json.loads(path.read_text()).get("anchors") or {}


def hanging_class(cat, asset: str) -> str | None:
    """Why ``asset`` hangs, or None: the mined anchor class `hanging` from its
    plugin placements (kit-mounts-mined `anchors`), the manifest's anchor
    class, its pivot at its top with the mesh hanging below it, or a mesh
    that starts HOST_FRAME_LIFT_M or more over its pivot (a part authored in
    its host's frame: histflower01's strand starts 5.85 m up its Hist tree)."""
    mined = _mined_anchors().get(asset) or {}
    if mined.get("anchorClass") == "hanging" and mined.get("anchorClassEvidence") == "plugin":
        return f"mined hanging ({mined.get('n')} plugin placements)"
    if cat.row(asset).get("anchorClass") == "hanging":
        return "manifest anchorClass hanging"
    lo, hi = (float(v) for v in cat.mesh(asset).bounds[:, 2])
    if hi <= HANG_TOP_M and -lo >= max(HANG_DROP_RATIO * max(hi, 0.01), HANG_MIN_DROP_M):
        return f"pivot at its top (mesh {lo:.2f}..{hi:.2f} m about it)"
    if lo >= HOST_FRAME_LIFT_M:
        return f"authored in its host's frame (mesh starts {lo:.2f} m over its pivot)"
    return None


def hanging_targets(cat, scene) -> list[str]:
    return [p.uid for p in scene.pieces if not _mounted(scene, p)
            and (p.role or {}).get("kind") not in ("parcel", "run")]


def hanging_piece(cat, scene, ctx, p) -> tuple[dict, list]:
    why = hanging_class(cat, p.asset)
    if why is None:
        return {}, []
    fix = ("attach it at its host's pivot (`attach`: the mesh already stands where its "
           "author hung it on the host)" if why.startswith("authored in its host's frame")
           else "hang it (mount --hang)")
    return ({p.uid: {"hanging": why, "mounted": False}},
            [f"{p.uid}: {p.asset.rsplit('/', 1)[-1]} hangs ({why}) but stands unmounted on "
             f"the ground: {fix} or use a standing piece"])


# --------------------------------------------------------------------------
# fixtureSeatRule
# --------------------------------------------------------------------------

def is_fixture(cat, p) -> bool:
    return ((p.role or {}).get("layer") == "light" or bool(cat.row(p.asset).get("light"))
            or _has(p.asset, FIXTURE_TOKENS))


def fixture_targets(cat, scene) -> list[str]:
    return [p.uid for p in scene.pieces if p.y is not None and is_fixture(cat, p)]


def _surface_under(cat, scene, g, p, x: float, north: float, base: float,
                   lift: dict | None = None):
    """(height, what) of the highest surface under (x, north) at most
    FIXTURE_REACH_M over the base: the padded ground, else any other piece's
    mesh top there (a deck, a floor, a barrel), each piece raised by its
    ``lift`` (the compiled pivot minus the workbench's). A surface is a
    piece that reaches below the base (FIXTURE_SINK_M): never a piece
    mounted on the fixture (the flame in its brazier bowl) nor one standing
    beside or over it on the same ground (the cooking stand straddling its
    cook fire; CLAYWATER2 2026-09-28)."""
    from .scene import hung_on
    best = (float(g.chunk_height(x, -north)), "ground")
    reach = base + FIXTURE_REACH_M
    for q in scene.pieces:
        if q is p or q.y is None or hung_on(q) == p.uid:
            continue
        m = measure._transform4(q)
        dy = (lift or {}).get(q.uid, 0.0)
        if dy:
            m = m.copy()
            m[2, 3] += dy
        mesh = cat.mesh(q.asset)
        b = mesh.bounds
        corners = np.array([[a, c, d, 1.0] for a in b[:, 0] for c in b[:, 1] for d in b[:, 2]]) @ m.T
        if not (corners[:, 0].min() <= x <= corners[:, 0].max()
                and corners[:, 1].min() <= north <= corners[:, 1].max()
                and corners[:, 2].min() <= reach
                and corners[:, 2].min() < base - FIXTURE_SINK_M):
            continue
        world = mesh.copy().apply_transform(m)
        locs, _r, _t = world.ray.intersects_location([[x, north, reach]], [[0.0, 0.0, -1.0]],
                                                     multiple_hits=True)
        tops = [float(v[2]) for v in locs if float(v[2]) <= reach]
        if tops and max(tops) > best[0]:
            best = (max(tops), q.uid)
    return best


def fixture_piece(cat, scene, ctx, p) -> tuple[dict, list]:
    """fixtureSeatRule for one light: a mounted fixture (mined pair, hang,
    wall or top mount) touches its parent within FIXTURE_FLOAT_M; a standing
    one's base (its lowest point, at its plan centre) stands on the highest
    surface under it (ground, deck, floor, barrel top) between FIXTURE_SINK_M
    below (plus its designed sink on the ground, when the sink has evidence:
    a brazier's plugin sink is 0.04 m) and FIXTURE_FLOAT_M above."""
    from .scene import hung_on
    g = ctx["g"]
    parent_uid = hung_on(p)
    if parent_uid:
        # a mounted light (a mined pair, a hang, a wall or top mount) touches
        # its parent: the pair designs where, the gap says whether it touches
        parent = scene.piece(parent_uid)
        got = measure.contact(cat, p, parent)
        r = {"on": parent_uid, "gapM": got["gapM"], "mounted": True}
        fails = ([f"{p.uid}: stands {got['gapM']:.3f} m off {parent_uid} it is mounted on "
                  f"(> {FIXTURE_FLOAT_M} m)"] if got["gapM"] > FIXTURE_FLOAT_M else [])
        return {p.uid: r}, fails
    world = measure._transform4(p)
    v = np.asarray(cat.mesh(p.asset).vertices) @ world[:3, :3].T + world[:3, 3]
    x, north = float(v[:, 0].mean()), float(v[:, 1].mean())
    compiled = ctx.get("compiled") or {}
    lift = {u: cy - q.y for q in scene.pieces if q.y is not None
            for u, cy in [(q.uid, compiled.get(q.uid))]
            if cy is not None and abs(cy - q.y) > COMPILED_OFF_M}
    # judged at the workbench pose and, where the place's last compile put
    # it or the surface under it elsewhere, at the compiled pivots (walk 4)
    poses = [("", None)] + ([("compiled", lift)] if lift else [])
    r, fails = {}, []
    for where, lf in poses:
        base = float(v[:, 2].min()) + (lf or {}).get(p.uid, 0.0)
        surf, what = _surface_under(cat, scene, g, p, x, north, base, lf)
        gap = base - surf
        designed = designed_burial(cat, p.asset, p.scale)[0] if what == "ground" else 0.0
        allow = max(FIXTURE_SINK_M, designed + FIXTURE_SINK_M)
        if where:
            if round(gap, 3) == r.get("gapM") and what == r.get("on"):
                continue                                  # the compile moved nothing under it
            r.update({"compiledOn": what, "compiledGapM": round(gap, 3)})
            tag = " [at the last compile's pivots]"
        else:
            r.update({"on": what, "baseM": round(base, 3), "surfaceM": round(surf, 3),
                      "gapM": round(gap, 3), "sinkAllowM": round(allow, 3)})
            tag = ""
        name = what if what == "ground" else what + " surface"
        if gap < -allow:
            fails.append(f"{p.uid}: its base is {-gap:.2f} m under the {name} "
                         f"(never below it; allowed {allow:.2f} m: the miner's contact"
                         f"{f' + a designed {designed:.2f} m' if designed > 0 else ''}){tag}")
        elif gap > FIXTURE_FLOAT_M:
            fails.append(f"{p.uid}: its base floats {gap:.2f} m over the {name} "
                         f"(> {FIXTURE_FLOAT_M} m){tag}")
    return {p.uid: r}, fails


# --------------------------------------------------------------------------
# landingRule
# --------------------------------------------------------------------------

def _member_mesh(cat, q, meshes: dict | None):
    """``q``'s world mesh, built once per (piece, pose) in ``meshes`` so its
    ray BVH is built once too: the landing probes read each member up to
    20 times per end, at two ends and two poses (review 5536a1d9)."""
    from . import measure, rules
    if meshes is None:
        return rules._world_mesh(cat, q)
    key = (q.uid, q.asset, measure._transform4(q).tobytes())
    if key not in meshes:
        meshes[key] = rules._world_mesh(cat, q)
    return meshes[key]


def _deck_top(cat, members, x: float, z: float, lift: dict | None = None,
              meshes: dict | None = None) -> float | None:
    """The highest deck of ``members`` at (x, z), each raised by its ``lift``
    (the compiled pivot minus the workbench's), or None. ``meshes``: the
    caller's (piece, pose) -> world mesh cache (`_member_mesh`)."""
    best = None
    for q in members:
        mesh = _member_mesh(cat, q, meshes)
        top = float(mesh.bounds[1][2]) + 1.0
        locs, _r, _t = mesh.ray.intersects_location([[x, -z, top]], [[0.0, 0.0, -1.0]],
                                                    multiple_hits=False)
        if len(locs):
            best = max(best if best is not None else -1e9,
                       float(locs[0][2]) + (lift or {}).get(q.uid, 0.0))
    return best


def _deck_in(cat, members, end, ua, sign, lift=None,
             meshes: dict | None = None) -> tuple[float | None, float | None]:
    """(deck top, how far inside) nearest the run end: read LANDING_INSET_M
    in, then on inward 0.1 m at a time up to 2 m (a dock's last metre may be
    bare posts)."""
    for k in range(20):
        d = LANDING_INSET_M + 0.1 * k
        top = _deck_top(cat, members, end[0] + sign * ua[0] * d, end[1] + sign * ua[1] * d, lift, meshes)
        if top is not None:
            return top, round(d, 2)
    return None, None


def _over_water(g, x: float, z: float) -> float | None:
    level = g.water_level(x, z)
    if level is None or level <= float(g.chunk_height(x, z)) + 0.05:
        return None
    return float(level)


def landing_runs(cat, scene, g) -> dict[str, list]:
    """Every water-edge deck run: the walkable pieces grouped by run (a lone
    walkable piece is its own run) with any deck sample over water."""
    from .rules import _ends
    runs: dict[str, list] = {}
    for p in scene.pieces:
        if p.y is None or not getattr(p, "walkable", False):
            continue
        if measure.deck_seated(cat.row(p.asset)):
            continue                     # a house on stilts: `house_landing` judges its landing
        role = p.role or {}
        key = role["id"] if role.get("kind") == "run" else p.uid
        runs.setdefault(key, []).append(p)
    out = {}
    for key, members in runs.items():
        ends = [e for q in members for e in _ends(cat, q)]
        a, b = max(((u, v) for u in ends for v in ends), key=lambda uv: math.dist(*uv))
        n = max(2, int(math.dist(a, b) / 0.5))
        if any(_over_water(g, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) is not None
               for t in np.linspace(0, 1, n)):
            out[key] = (members, a, b)
    return out


def wade_step_end(cat, scene, g, members, ends) -> dict | None:
    """A run end closed in the water (16k walk 6, Riverwalk's west boards: the
    track wades the shallows onto the boards): a member step piece
    (LANDING_TOKENS) posed by a mined pair (`settledBy` evidence-snap) with an
    end within LANDING_STEP_REACH_M of the run end, the water there at most
    WADE_DEPTH_M deep, and a scene way (path) ending within WADE_WAY_M of it.
    walkwayRule walks the step's risers; this only closes the end."""
    from .rules import _ends
    for e in ends:
        level = g.water_level(*e)
        depth = None if level is None else level - float(g.chunk_height(*e))
        if depth is None or depth > WADE_DEPTH_M:
            continue
        way = next((pa["id"] for pa in scene.paths
                    for pt in (pa.get("pointsM") or [])[:1] + (pa.get("pointsM") or [])[-1:]
                    if math.dist(pt, e) <= WADE_WAY_M), None)
        if way is None:
            continue
        for q in members:
            if not _has(q.asset, LANDING_TOKENS) or not str(q.settledBy or "").startswith("evidence-snap"):
                continue
            if min(math.dist(e, x) for x in _ends(cat, q)) <= LANDING_STEP_REACH_M:
                return {"step": q.uid, "end": [round(e[0], 2), round(e[1], 2)],
                        "depthM": round(depth, 2), "way": way}
    return None


def _floor_deck(cat, q, lowest: bool = False) -> float | None:
    """``q``'s walked deck height from its descriptor (`describe` floors zM:
    the largest up-facing face, or the lowest for a step piece's foot tread),
    never its bounds max (a rail post's top; audit10 c4 crossings)."""
    from . import describe
    floors = describe.describe(cat, q.asset).get("floors") or []
    if not floors:
        return None
    f = min(floors, key=lambda f: f["zM"]) if lowest else floors[0]
    return q.y + float(f["zM"]) * q.scale


def _dry_end(cat, scene, g, members, end, ua, out, step, lift=None) -> tuple[dict, str | None]:
    """One dry end of a crossing run (``out`` signs ``ua`` outward): the deck
    of the member nearest the end (`_floor_deck`; a step member's lowest
    tread) within LANDING_FOOT_M of the ground LANDING_INSET_M past it, or a
    step piece there (`_landing_step`)."""
    from .rules import _ends
    q = min(members, key=lambda m: min(math.dist(end, e) for e in _ends(cat, m)))
    deck = _floor_deck(cat, q, lowest=_has(q.asset, LANDING_TOKENS))
    if deck is not None:
        deck += (lift or {}).get(q.uid, 0.0)
    past = (end[0] + out * ua[0] * LANDING_INSET_M, end[1] + out * ua[1] * LANDING_INSET_M)
    drop = None if deck is None else round(deck - float(g.chunk_height(*past)), 2)
    row = {"end": [round(end[0], 2), round(end[1], 2)], "member": q.uid, "landDropM": drop}
    if drop is not None and abs(drop) <= LANDING_FOOT_M:
        return row, None
    row["step"] = _landing_step(cat, scene, g, members, end, deck, step)
    if row["step"] is not None:
        return row, None
    return row, (f"its dry end at {row['end']} stands {drop} m over the ground past it with no "
                 f"step (want within {LANDING_FOOT_M} m, or a step piece whose top is within "
                 f"{step} m of the deck)")


def _buried_fail(cat, g, key, members, lift, r, pre, tag) -> list[str]:
    """Ground over the deck along the run (a deck run into a bank, audit10
    c4 crossings ib-00 1.04 m): every 0.5 m along each member's axis the
    ground stands at most LANDING_FOOT_M (the end's bar: a plank end may
    tuck that far into a bank) over its `_floor_deck`; step members
    are skipped (walkwayRule walks their treads). Records the worst five."""
    from .rules import _ends
    out = []
    for q in members:
        deck = None if _has(q.asset, LANDING_TOKENS) else _floor_deck(cat, q)
        if deck is None:
            continue
        deck += (lift or {}).get(q.uid, 0.0)
        a, b = _ends(cat, q)
        for t in np.linspace(0.05, 0.95, max(2, int(math.dist(a, b) / 0.5) + 1)):
            x, z = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            over = float(g.chunk_height(x, z)) - deck
            if over > LANDING_FOOT_M:
                out.append({"uid": q.uid, "atM": [round(float(x), 2), round(float(z), 2)],
                            "groundOverDeckM": round(over, 2)})
    if not out:
        return []
    out = sorted(out, key=lambda v: -v["groundOverDeckM"])[:5]
    r[pre + ("Buried" if pre else "buried")] = out
    w = out[0]
    return [f"{key}: the ground stands {w['groundOverDeckM']} m over the deck of {w['uid']} at "
            f"{w['atM']} (a deck run into a bank; want at most {LANDING_FOOT_M} m){tag}"]


def landing(cat, scene) -> dict:
    """landingRule (owner 2026-09-25 'Landing stage reaches dry ground', for
    every water-edge run, walk 4): along the run's axis (its two farthest
    member ends), the deck LANDING_INSET_M inside the water end stands
    LANDING_DECK_M over the water there; the deck inside the landward end
    stands within LANDING_FOOT_M of the dry ground LANDING_INSET_M past it,
    or a step piece (LANDING_TOKENS) within LANDING_STEP_REACH_M of that end
    has its top within the controller's step (`rules.character` stepM) of
    the deck and its base on the ground (within FIXTURE_FLOAT_M); a run with
    both ends over water is an open run; a run with both ends dry (a
    crossing) has each dry end judged by the same bar (`_dry_end`); and on
    every run the ground never stands over a member's deck (`_buried_fail`). Judged at the workbench pose and,
    where the place's last compile put a member more than COMPILED_OFF_M
    off it, at the compiled pivots too (`compiled_y`)."""
    from . import rules
    g = rules._ground(cat, scene)
    step = rules.character()["stepM"]
    compiled = compiled_y(scene)
    rows, fails = {}, []
    meshes: dict = {}
    for key, (members, a, b) in landing_runs(cat, scene, g).items():
        ua = np.subtract(b, a) / max(math.dist(a, b), 1e-9)

        def inside(e, sign):
            return (e[0] + sign * ua[0] * LANDING_INSET_M, e[1] + sign * ua[1] * LANDING_INSET_M)
        wa, wb = _over_water(g, *inside(a, 1)), _over_water(g, *inside(b, -1))
        uids = [q.uid for q in members]
        if wa is not None and wb is not None:
            wade = wade_step_end(cat, scene, g, members, (a, b))
            if wade is not None:
                rows[key] = {"members": uids, "wadeStep": wade}
                continue
            rows[key] = {"members": uids, "open": True}
            fails.append(f"{key}: both ends of the run stand over water (an open run end: end it "
                         f"on dry ground, or in a plugin-paired step-down piece whose foot stands "
                         f"in wadeable water, at most {WADE_DEPTH_M} m, where a way arrives)")
            continue
        lift = {q.uid: compiled[q.uid] - q.y for q in members
                if q.uid in compiled and abs(compiled[q.uid] - q.y) > COMPILED_OFF_M}
        if wa is None and wb is None:              # a crossing: judge each dry end, and the bank
            r = {"members": uids, "crossing": True, "stepM": step}
            for where, lf in [("", None)] + ([("compiled", lift)] if lift else []):
                tag = " [at the last compile's pivots]" if where else ""
                r[where + ("DryEnds" if where else "dryEnds")] = ends = []
                for end, out in ((a, -1), (b, 1)):
                    row, fail = _dry_end(cat, scene, g, members, end, ua, out, step, lf)
                    ends.append(row)
                    if fail:
                        fails.append(f"{key}: {fail}{tag}")
                fails += _buried_fail(cat, g, key, members, lf, r, where, tag)
            rows[key] = r
            continue
        water_end, land_end, sign = (a, b, 1) if wa is not None else (b, a, -1)
        level = wa if wa is not None else wb
        past = (land_end[0] - sign * ua[0] * LANDING_INSET_M, land_end[1] - sign * ua[1] * LANDING_INSET_M)
        ground = float(g.chunk_height(*past))
        r = {"members": uids, "waterLevelM": round(level, 3),
             "landEnd": [round(land_end[0], 2), round(land_end[1], 2)], "stepM": step}
        for where, lf in [("", None)] + ([("compiled", lift)] if lift else []):
            deck_w, in_w = _deck_in(cat, members, water_end, ua, sign, lf, meshes)
            deck_l, in_l = _deck_in(cat, members, land_end, ua, -sign, lf, meshes)
            over = None if deck_w is None else round(deck_w - level, 2)
            drop = None if deck_l is None else round(deck_l - ground, 2)
            pre = "compiled" if where else ""
            r[pre + ("DeckOverWaterM" if pre else "deckOverWaterM")] = over
            r[pre + ("LandDropM" if pre else "landDropM")] = drop
            r[pre + ("DeckReadInsideM" if pre else "deckReadInsideM")] = [in_w, in_l]
            tag = (f" [at the last compile's pivots, {', '.join(f'{u} {v:+.2f} m' for u, v in lift.items())}"
                   f" off the workbench's]") if where else ""
            if over is None or not LANDING_DECK_M[0] <= over <= LANDING_DECK_M[1]:
                fails.append(f"{key}: the deck stands {over} m over the water at its water end "
                             f"(want {LANDING_DECK_M[0]}-{LANDING_DECK_M[1]} m){tag}")
            if drop is None or abs(drop) > LANDING_FOOT_M:
                stepper = _landing_step(cat, scene, g, members, land_end, deck_l, step)
                r[pre + ("Step" if pre else "step")] = stepper
                if stepper is None:
                    fails.append(f"{key}: its landward end stands {drop} m over the dry ground "
                                 f"past it with no step (want within {LANDING_FOOT_M} m, or a step "
                                 f"piece whose top is within {step} m of the deck){tag}")
            fails += _buried_fail(cat, g, key, members, lf, r, pre, tag)
        rows[key] = r
    for p in scene.pieces:
        if p.y is not None and getattr(p, "walkable", False) and measure.deck_seated(cat.row(p.asset)):
            r, f = house_landing(cat, scene, g, p, step, meshes)
            rows[p.uid] = r
            fails += f
    return {"runs": rows, "failures": fails}


LANDING_DECK_BAND_M = 1.0   # a stilt house's landing deck: a hit this far under its floor top at most


def _landing_deck(cat, p, floor: float | None, edge, inward, meshes) -> float | None:
    """A stilt house landing's deck height near one edge: the median of the
    first hits of rays down from just over the house floor top (never the
    roof or a post cap above it) at the edge's samples, LANDING_INSET_M to
    1.5 m inward, keeping hits within LANDING_DECK_BAND_M under the floor
    (a ray through a plank gap meets a pile foot metres down)."""
    if floor is None:
        return None
    mesh = _member_mesh(cat, p, meshes)
    pts = [(x + inward[0] * d, z + inward[1] * d) for x, z in edge
           for d in (LANDING_INSET_M, 0.6, 1.0, 1.5)]
    origins = [[x, -z, floor + 0.3] for x, z in pts]
    locs, _r, _t = cast_rays(mesh, origins, [0.0, 0.0, -1.0], multiple_hits=False)
    hits = [float(v[2]) for v in locs if floor - LANDING_DECK_BAND_M <= float(v[2]) <= floor + 0.3]
    return float(np.median(hits)) if hits else None


def house_landing(cat, scene, g, p, step: float, meshes: dict | None = None) -> tuple[dict, list]:
    """landingRule for a house on stilts (`measure.deck_seated`): each
    landing part of its composite (`measure.landing_edges`) has its outer
    edge on dry ground (every sample LANDING_INSET_M past the edge above the
    drawn water) with the deck inside the edge's middle within LANDING_FOOT_M
    of that ground (or a step piece there), and its inner edge meeting the
    house floor within the controller's step."""
    from . import rules
    rows, fails = [], []
    edges = measure.landing_edges(cat, p)
    if not edges:
        return {"landings": []}, [f"{p.uid}: a house on stilts with no landing part in its composite"]
    floor = rules._walk_top_y(cat, p)
    for e in edges:
        ux, uz = e["unit"]
        past = [(x + ux * LANDING_INSET_M, z + uz * LANDING_INSET_M) for x, z in e["outer"]]
        wet = []
        for x, z in past:
            lv = g.water_level(x, z)
            h = float(g.chunk_height(x, z))
            if lv is not None and lv > h + 0.05:
                wet.append((x, z, lv - h))
        mx, mz = e["outer"][1]
        deck = _landing_deck(cat, p, floor, e["outer"], (-ux, -uz), meshes)
        ground = float(g.chunk_height(*past[1]))
        level = g.water_level(*past[1]) or g.water_level(p.x, p.z)
        drop = None if deck is None else round(deck - ground, 3)
        deck_in = _landing_deck(cat, p, floor, e["inner"], (ux, uz), meshes)
        inner = None if deck_in is None or floor is None else round(floor - deck_in, 3)
        r = {"part": e["asset"], "outerEdgeM": [[round(x, 2), round(z, 2)] for x, z in e["outer"]],
             "outwardDeg": e["outwardDeg"], "deckM": None if deck is None else round(deck, 3),
             "groundPastM": round(ground, 3),
             "groundOverWaterM": None if level is None else round(ground - level, 3),
             "landDropM": drop, "floorOverInnerDeckM": inner, "stepM": step}
        if wet:
            fails.append(f"{p.uid}: its landing's outer edge stands over water at "
                         + ", ".join(f"({x:.1f}, {z:.1f}) {d:.2f} m deep" for x, z, d in wet))
        if drop is None or abs(drop) > LANDING_FOOT_M:
            stepper = _landing_step(cat, scene, g, [p], e["outer"][1], deck, step)
            r["step"] = stepper
            if stepper is None:
                fails.append(f"{p.uid}: its landing's deck stands {drop} m over the dry ground "
                             f"past its outer edge with no step (want within {LANDING_FOOT_M} m)")
        if inner is None or abs(inner) > step:
            fails.append(f"{p.uid}: its landing's inner edge meets the floor {inner} m under it "
                         f"(want within the step, {step} m)")
        rows.append(r)
    return {"landings": rows}, fails


def _landing_step(cat, scene, g, members, end, deck, step: float) -> str | None:
    from shapely.geometry import Point, Polygon
    if deck is None:
        return None
    for q in scene.pieces:
        if q in members or q.y is None or not _has(q.asset, LANDING_TOKENS):
            continue
        if Polygon(measure.footprint_province(cat, q)).distance(Point(end)) > LANDING_STEP_REACH_M:
            continue
        world = q.world_points(np.asarray(cat.mesh(q.asset).vertices))
        top = float(world[:, 2].max())
        fl = measure.float_under(cat, g, q)
        if abs(deck - top) <= step and abs(fl["footFloatMinM"]) <= FIXTURE_FLOAT_M:
            return q.uid
    return None


# --------------------------------------------------------------------------
# archwayRule (16k walk 4 lane COMPILE)
# --------------------------------------------------------------------------

ARCHWAY_DOOR_REACH_M = 2.5   # archwayRule: a door piece this near a measured doorway closes it
ARCHWAY_OPEN = ("own-geometry-door",)
"""The interiors sidecar's `closedShellPromotedBy` for a shell whose own
mesh carries the doorway and no door leaf (a composite that bakes its
plugin's door reads `door-piece`)."""


@lru_cache(maxsize=1)
def _links() -> dict:
    path = paths.PLACEMENT_RECORDS / "exterior-interior-links.json"
    return json.loads(path.read_text()).get("shells") or {}


def plugin_door(cat, asset: str) -> tuple[str | None, str]:
    """(the door piece the plugin hangs in ``asset``'s doorway, evidence):
    the sidecar entrance's door, its esp link, the links record's shell row,
    else the door every linked shell of the same folder takes (family)."""
    rec = cat.interiors(asset)
    got = ((rec.get("entrance") or {}).get("doorAsset")
           or (rec.get("espLink") or {}).get("doorModel"))
    if got:
        return got, "kit interiors entrance"
    links = _links()
    rows = links.get(asset) or []
    if rows and rows[0].get("doorModel"):
        return rows[0]["doorModel"], "exterior-interior-links shell row"
    folder = asset.rsplit("/", 1)[0] + "/"
    from collections import Counter
    fam = Counter(r.get("doorModel") for a, rs in links.items() if a.startswith(folder)
                  for r in rs if r.get("doorModel"))
    if fam:
        door, n = fam.most_common(1)[0]
        return door, f"family: {n} linked shell placement(s) under {folder}"
    return None, "no plugin door piece mined for this shell or its folder"


def archway_targets(cat, scene) -> list[str]:
    return [p.uid for p in scene.pieces if p.y is not None
            and (p.role or {}).get("kind") == "parcel"]


def archway_piece(cat, scene, ctx, p) -> tuple[dict, list]:
    """archwayRule: a shell whose kit records a doorway in its own mesh with
    no door leaf (`ARCHWAY_OPEN`) needs a door piece (an asset named door)
    within ARCHWAY_DOOR_REACH_M of a measured doorway; else it fails naming
    the plugin's door piece for it (`plugin_door`). Greenspring's b-fam1 and
    b-fam2 (kotm mudhut01) stood with open doorways and door records: the
    owner walked into an archway."""
    rec = cat.interiors(p.asset)
    if rec.get("closedShellPromotedBy") not in ARCHWAY_OPEN:
        return {}, []
    ways = cat.doorways(p.asset)
    if not ways:
        return {}, []
    pts = p.world_points(np.asarray([[w["offsetInPieceM"][0], -w["offsetInPieceM"][1], 0.0]
                                     for w in ways]))[:, :2]
    doors = []
    for q in scene.pieces:
        if q is p or q.y is None or "door" not in q.asset.rsplit("/", 1)[-1].lower():
            continue
        d = float(np.min(np.hypot(pts[:, 0] - q.x, pts[:, 1] + q.z)))
        if d <= ARCHWAY_DOOR_REACH_M:
            doors.append((q.uid, round(d, 2)))
    door, why = plugin_door(cat, p.asset)
    r = {"doorways": len(ways), "doorPieces": doors, "pluginDoor": door, "evidence": why}
    if doors:
        return {p.uid: r}, []
    return {p.uid: r}, [f"{p.uid}: {p.asset.rsplit('/', 1)[-1]} has a doorway in its own mesh "
                        f"and no door piece within {ARCHWAY_DOOR_REACH_M} m of it (an open "
                        f"archway): place {door or 'a door piece'} ({why}) in the doorway"]

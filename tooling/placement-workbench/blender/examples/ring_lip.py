"""Is a ring of pieces (a stone lip round a pool, a hearth ring) closed where
the player sees it: AT THE GROUND, not at the buried closest points (audit10
c5: 13 boulders whose check gaps read 0.002-0.045 m showed 0.3-0.5 m ground
gaps, because the meshes touch 0.4 m under the ground).
ARGS: CX CZ RMAX UID [UID ...] (province centre, search radius, ring uids).
Per 1-degree bearing from the centre, a level ray at HEIGHT over the ground
under the ring (heights 0.05 and 0.15 m) hits a ring piece or passes.
Result: per height the open share and the open spans (bearing from, to,
width at the ring in metres). Bar: no open span at 0.05 m."""
import math

cx, cz, rmax = float(ARGS[0]), float(ARGS[1]), float(ARGS[2])
uids = set(ARGS[3:])
heights = (0.05, 0.15)
rows = {}
for h in heights:
    open_b, hit_r = [], []
    for b in range(360):
        a = math.radians(b)
        dx, dy = math.sin(a), math.cos(a)          # bearing 0 = north (+y in the wb frame)
        # the ground under the ring on this bearing: the highest of three samples
        gs = [api.ground_height(cx + dx * r, cz - dy * r) for r in (rmax * 0.7, rmax * 0.85, rmax)]
        gs = [g for g in gs if g is not None]
        z = (max(gs) if gs else 0.0) + h
        hit = api.ray_cast((cx, -cz, z), (dx, dy, 0.0), filter=uids, distance=rmax)
        if hit is None:
            open_b.append(b)
        else:
            hit_r.append(hit["distance"])
    spans, start, prev = [], None, None
    for b in open_b + [None]:
        if start is None:
            start = prev = b
        elif b is not None and b == prev + 1:
            prev = b
        else:
            spans.append([start, prev])
            start = prev = b
    if spans and spans[0] == [None, None]:
        spans = []
    spans = [s for s in spans if s[0] is not None]
    if len(spans) > 1 and spans[0][0] == 0 and spans[-1][1] == 359:
        spans[0][0] = spans[-1][0] - 360
        spans.pop()
    rr = sum(hit_r) / len(hit_r) if hit_r else rmax
    rows[f"{h:.2f}"] = {"openShare": round(len(open_b) / 360, 3), "meanHitRM": round(rr, 2),
                        "openSpans": [{"fromDeg": s[0], "toDeg": s[1],
                                       "widthM": round(math.radians(s[1] - s[0] + 1) * rr, 2)}
                                      for s in spans]}
RESULT["ring"] = rows
RESULT["closedAtGround"] = not rows["0.05"]["openSpans"]

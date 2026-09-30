"""The gap between a piece's lowest rim and the padded ground, all round it
(walk 6: the tents hovering at their front edges). ARGS: uid [uid ...].
Per 15-degree bearing round the piece's plan centre, the lowest mesh vertex
in that sector within 0.6 m of the piece's lowest point (the ground skirt)
and the ground under it: gapM > 0 hovers, < 0 is buried."""
import math

rows = {}

for uid in ARGS:
    verts = [v for o in api._meshes(uid) for v in api._world_verts(o)[0]]
    lo = min(v[2] for v in verts)
    cx = sum(v[0] for v in verts) / len(verts)
    cy = sum(v[1] for v in verts) / len(verts)
    band = [v for v in verts if v[2] <= lo + 0.6]
    sectors = {}
    for v in band:
        b = int((math.degrees(math.atan2(v[0] - cx, v[1] - cy)) % 360) // 15)
        r = math.hypot(v[0] - cx, v[1] - cy)
        cur = sectors.get(b)
        if cur is None or r > cur[0] + 0.05 or (abs(r - cur[0]) <= 0.05 and v[2] < cur[1][2]):
            sectors[b] = (r, v)          # the outermost low vertex: the skirt's edge
    out = []
    for b, (r, v) in sorted(sectors.items()):
        g = api.ground_height(v[0], -v[1])
        if g is None:
            continue
        out.append({"bearing": b * 15, "rM": round(r, 2), "gapM": round(v[2] - g, 3),
                    "overLowestM": round(v[2] - lo, 3),
                    "at": [round(v[0], 2), round(-v[1], 2)]})
    gaps = [o["gapM"] for o in out]
    rows[uid] = {"lowestZ": round(lo, 3), "maxGapM": max(gaps), "minGapM": min(gaps),
                 "hovering": [o for o in out if o["gapM"] > 0.03], "sectors": out}
RESULT["pieces"] = rows

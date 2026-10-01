"""Where an open structure's posts stand (walk 9, the Tag House: a candle
stood on the half pavilion's leaning centre post, a table had no free walk
cell inside the post ring). ARGS: uid [max_height_m, default 2.2].

Every mesh vertex of the piece lower than max_height over the padded ground,
binned on a 0.25 m grid, then clustered (cells within 0.8 m join one
cluster). Each cluster is one post or wall foot: its centre and its x and z
extent in province metres (x east, z south). Dress the structure in the
gaps between clusters, 0.3 m clear of each (the walk capsule)."""

uid = ARGS[0]
max_h = float(ARGS[1]) if len(ARGS) > 1 else 2.2
import bpy

cells = set()

for o in bpy.data.objects:
    if o.get("wb_uid") != uid or o.type != "MESH":
        continue
    mw = o.matrix_world
    for v in o.data.vertices:
        p = mw @ v.co
        g = api.ground_height(p.x, -p.y)
        if g is None or p.z - g > max_h:
            continue
        cells.add((round(p.x * 4) / 4, round(-p.y * 4) / 4))

clusters = []
for x, z in sorted(cells):
    for c in clusters:
        if any(abs(cx - x) < 0.8 and abs(cz - z) < 0.8 for cx, cz in c):
            c.append((x, z))
            break
    else:
        clusters.append([(x, z)])

RESULT["uid"] = uid
RESULT["maxHeightM"] = max_h
RESULT["posts"] = [{
    "centre": [round(sum(p[0] for p in c) / len(c), 2), round(sum(p[1] for p in c) / len(c), 2)],
    "x": [min(p[0] for p in c), max(p[0] for p in c)],
    "z": [min(p[1] for p in c), max(p[1] for p in c)],
} for c in clusters]

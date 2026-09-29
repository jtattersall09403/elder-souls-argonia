"""wb.py bpy example: where can something hang from a tree, and does a
piece touch what it should? ARGS: TREE_UID [PIECE_UID [OTHER_UID]].
    wb.py bpy wb4gs blender/examples/branch_survey.py --out /tmp/s.json --args hist
Every call is bpy_api (`api`, passed in); 3D points are wb frame (x east,
y NORTH, z up); ground_height takes province (x, z)."""
import math

tree = ARGS[0]
(lo, hi) = api.bounds(tree)
cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
rows = []
for bearing in range(0, 360, 15):                 # a ring of rays per bearing
    for r in (2.0, 3.0, 4.0, 5.0, 6.0, 7.0):
        x = cx + r * math.sin(math.radians(bearing))
        y = cy + r * math.cos(math.radians(bearing))
        g = api.ground_height(x, -y)               # province z = -y
        if g is None:
            continue
        hit = api.ray_cast((x, y, g + 0.05), (0, 0, 1), filter=tree)
        if hit and hit["normal"][2] < -0.2:        # a branch underside
            rows.append({"bearing": bearing, "r": r, "overGroundM":
                         round(hit["point"][2] - g, 2), "at": [round(x, 2), round(-y, 2)]})
            break                                   # the nearest on this bearing
RESULT["tree"] = tree
RESULT["lowestPoint"] = api.lowest_point(tree)
RESULT["branches"] = sorted(rows, key=lambda b: b["overGroundM"])
if len(ARGS) > 1:                                   # a piece against its host / the ground
    piece, other = ARGS[1], (ARGS[2] if len(ARGS) > 2 else "ground")
    RESULT["contact"] = api.contacts(piece, other)
    RESULT["pieceLowest"] = api.lowest_point(piece)
RESULT["pieces"] = len(api.objects_by_uid())

"""wb.py bpy example: is a shell's doorway open in its own LOD0 mesh (the
runtime's `mesh` collider is those triangles, and the renderer culls back
faces: a face seen from behind is invisible but still collides)?

    wb.py bpy <scene> blender/examples/doorway_rays.py --only UID --args UID ring
    wb.py bpy <scene> blender/examples/doorway_rays.py --only UID --args UID '<doorways json>'

`ring`: from 12 m out, a horizontal ray toward the piece's plan centre every
5 degrees at 0.5/1.0/1.5 m over the padded ground; each row gives the first
hit's distance from the centre and whether it is a BACK face (its normal
along the ray: culled when drawn, solid to the collider). A doorway list
[{"name", "pointM": [x, y, z|null] (wb frame; null reads the ground),
"outM": [dx, dy] (unit, outward)}]: from 3 m outside inward at 0.2-2.0 m;
`firstHitM` is how far past the opening plane the ray first meets the
shell (about 0: a face across the doorway)."""
import json
import math

uid = ARGS[0]
objs = api.objects_by_uid()[uid]
(lo, hi) = api.bounds(uid)
cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
rows = []
if ARGS[1] == "ring":
    g0 = api.ground_height(cx, -cy)
    for b in range(0, 360, 5):
        ox, oy = math.sin(math.radians(b)), math.cos(math.radians(b))
        for h in (0.5, 1.0, 1.5):
            start = (cx + 12.0 * ox, cy + 12.0 * oy, g0 + h)
            hit = api.ray_cast(start, (-ox, -oy, 0.0), filter=uid)
            if hit is None:
                rows.append({"bearing": b, "overGroundM": h, "hit": None})
                continue
            back = hit["normal"][0] * -ox + hit["normal"][1] * -oy > 0.0
            rows.append({"bearing": b, "overGroundM": h,
                         "fromCentreM": round(12.0 - hit["distance"], 2), "backFace": back})
else:
    for d in json.loads(ARGS[1]):
        px, py, pz = d["pointM"]
        if pz is None:
            pz = api.ground_height(px, -py)
        ox, oy = d["outM"]
        for k in range(10):
            h = 0.2 + 0.2 * k
            hit = api.ray_cast((px + 3.0 * ox, py + 3.0 * oy, pz + h), (-ox, -oy, 0.0), filter=uid)
            rows.append({"door": d["name"], "overFloorM": round(h, 2),
                         "firstHitM": None if hit is None else round(hit["distance"] - 3.0, 3),
                         "backFace": None if hit is None else
                         hit["normal"][0] * -ox + hit["normal"][1] * -oy > 0.0})
RESULT["uid"] = uid
RESULT["centre"] = [round(cx, 2), round(cy, 2)]
RESULT["rays"] = rows

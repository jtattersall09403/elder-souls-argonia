"""Walk a doorway's approach on the actual geometry (audit10 c5: a cave mouth
sunk into level ground must stay walkable from the approach into the mouth).
From OUT_M metres outside the threshold to IN_M metres inside, along the
doorway's outward bearing, a walker's feet follow the walkable surface: at
each 0.25 m step a ray falls from 1.2 m over the last foot height and takes
the higher of the first mesh hit (every placed piece) and the ground, and a
ray rises from the foot for the headroom (null: open sky). The result names
the largest up-step and down-step and the steepest 1 m rise, to set against
the controller step (0.45 m) and the capsule height (1.44 m).

    wb.py bpy <scene> tooling/placement-workbench/blender/examples/walk_in_profile.py \
        --out R.json --args X Z BEARING_DEG [OUT_M IN_M]

X Z is the threshold (wb.py doors `thresholdM`), BEARING_DEG the compass
bearing pointing OUT of the doorway (0 north = -z, 90 east = +x)."""
import math

x0, z0, brg = float(ARGS[0]), float(ARGS[1]), float(ARGS[2])
out_m = float(ARGS[3]) if len(ARGS) > 3 else 12.0
in_m = float(ARGS[4]) if len(ARGS) > 4 else 6.0
ox, oz = math.sin(math.radians(brg)), -math.cos(math.radians(brg))   # wb frame unit, outward

rows = []
foot = None
d = out_m
while d >= -in_m - 1e-6:
    px, pz = x0 + ox * d, z0 + oz * d
    g = api.ground_height(px, pz)
    start = (g if foot is None else foot) + 1.2
    hit = api.ray_cast((px, -pz, start), (0.0, 0.0, -1.0))
    mesh = None if hit is None else start - hit["distance"]
    surf = g if mesh is None or (g is not None and g >= mesh) else mesh
    up = api.ray_cast((px, -pz, surf + 0.1), (0.0, 0.0, 1.0))
    rows.append({"dM": round(d, 2), "groundY": None if g is None else round(g, 3),
                 "meshY": None if mesh is None else round(mesh, 3), "footY": round(surf, 3),
                 "headroomM": None if up is None else round(up["distance"] + 0.1, 2),
                 "stepM": None if foot is None else round(surf - foot, 3)})
    foot = surf
    d -= 0.25

steps = [r["stepM"] for r in rows if r["stepM"] is not None]
grade = 0.0
for i in range(4, len(rows)):
    grade = max(grade, abs(rows[i]["footY"] - rows[i - 4]["footY"]))
RESULT["threshold"] = [x0, z0]
RESULT["outBearingDeg"] = brg
RESULT["maxUpStepM"] = round(max(steps), 3)        # walking inward (d falls): stepM > 0 rises
RESULT["maxDownStepM"] = round(max(-s for s in steps), 3)
RESULT["steepestRisePer1M"] = round(grade, 3)
RESULT["controllerStepM"] = 0.45
heads = [r["headroomM"] for r in rows if r["dM"] >= 0 and r["headroomM"] is not None]
RESULT["minHeadroomOutsideM"] = min(heads) if heads else None   # threshold to OUT_M; None = open sky
RESULT["walkable"] = max(abs(s) for s in steps) <= 0.45
RESULT["profile"] = rows

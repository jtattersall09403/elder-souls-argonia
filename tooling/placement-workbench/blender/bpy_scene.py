"""Blender side of `wb.py bpy` (Linux Blender 3.2.2, headless): build the
workbench scene exactly as the render does (render_scene.build_world: the
per-kit .blend cache, every piece posed and named by its uid, 'ground',
'water'), then run the agent's script with `bpy_api` importable (and passed
in as `api`), and write `api.RESULT` to the JOB's `out` JSON.

JOB (environment): the scene half of a render job (`render.scene_job`) plus
{"script": path, "args": [...], "out": path}.
"""
import json
import os
import runpy
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)                                  # render_scene
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "workbench"))   # bpy_api

import bpy  # noqa: E402

import render_scene  # noqa: E402  (reads JOB; its main() runs only as __main__)
import bpy_api  # noqa: E402

JOB = render_scene.JOB


def main():
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    render_scene.build_world(bpy.context.scene)
    bpy.context.view_layer.update()
    built = time.time() - t0
    bpy_api.ARGS[:] = list(JOB.get("args") or [])
    bpy_api.RESULT.clear()
    t1 = time.time()
    runpy.run_path(JOB["script"], init_globals={"api": bpy_api, "ARGS": bpy_api.ARGS,
                                                "RESULT": bpy_api.RESULT},
                   run_name="__main__")
    out = {"result": bpy_api.RESULT, "sceneBuildS": round(built, 2),
           "scriptS": round(time.time() - t1, 2), "pieces": len(JOB["pieces"])}
    with open(JOB["out"], "w") as fh:
        json.dump(out, fh, indent=1, default=lambda o: list(o) if hasattr(o, "__iter__") else str(o))
    print("[wb-bpy] done")


try:
    main()
except Exception as exc:  # Blender exits 0 when a --python script raises
    import traceback
    traceback.print_exc()
    print(f"[wb-bpy] FAILED {exc}")
    sys.exit(1)

"""`wb.py bpy SCENE SCRIPT --out JSON [--only UID,..] [--args ...]`: headless
Blender with the whole workbench scene loaded, running an agent's script
(owner 2026-09-28: a deliver agent answers a placement question the commands
do not answer in Blender directly, and adds the command in the same lane).

The scene half of the job is the render's (`render.scene_job`: the same
Linux Blender 3.2.2, raw kit GLBs through the per-kit .blend cache, the
padded ground and water); `blender/bpy_scene.py` builds it and runs the
script with `workbench/bpy_api.py` on the path.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path


from . import paths
from .render import TIMEOUT_S, _frame, scene_job

BPY_SCRIPT = paths.WORKBENCH / "blender" / "bpy_scene.py"
GROUND_STEP_M = 0.5          # the 'ground' mesh grid (`bpy_api.ground_height` reads it)
MARGIN_M = 10.0              # the ground mesh reaches this far past the pieces


def runtime_posed(cat, scene):
    """(a view of the scene with every never-settled piece at the runtime's
    seat (`measure.seat`), their uids): the Claywater stable's op never
    settles it, and the runtime still draws it."""
    from . import measure, pads
    view = scene.view()
    g = pads.ground_for(cat, view, None)
    seated = []
    for p in view.pieces:
        if p.y is None:
            try:
                p.y = measure.seat(cat, g, p)["y"]
                seated.append(p.uid)
            except (ValueError, KeyError):
                pass
    view.pieces = [p for p in view.pieces if p.y is not None]
    return view, seated


def run(cat, scene, script: Path, out: Path, args: list | None = None,
        only: set | None = None) -> dict:
    t0 = time.time()
    scene, seated = runtime_posed(cat, scene)
    low, high = _frame(cat, scene, sorted(only) if only else [])
    centre = (low + high) / 2
    half = float(max(high[0] - low[0], high[1] - low[1]) / 2 + MARGIN_M)
    work = Path(tempfile.mkdtemp(prefix="wb-bpy-", dir=paths.OUTPUT))
    try:
        job = scene_job(cat, scene, work, centre, half, only=only, ground_step=GROUND_STEP_M)
        job.update({"script": str(Path(script).resolve()), "args": list(args or []),
                    "out": str(Path(out).resolve())})
        (work / "job.json").write_text(json.dumps(job))
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        t1 = time.time()
        proc = subprocess.run(paths.guarded([str(paths.LINUX_BLENDER), "-b", "--factory-startup",
                                            "--python", str(BPY_SCRIPT)], "bpy"), env=dict(os.environ, JOB=str(work / "job.json")),
                              capture_output=True, text=True, timeout=TIMEOUT_S)
        if proc.returncode != 0 or "[wb-bpy] done" not in proc.stdout:
            raise RuntimeError("wb.py bpy failed:\n" + proc.stdout[-4000:] + proc.stderr[-2000:])
        got = json.loads(Path(out).read_text())
        got.update({"out": str(out), "prepS": round(t1 - t0, 2),
                    "blenderS": round(time.time() - t1, 2), "totalS": round(time.time() - t0, 2),
                    "groundHalfM": round(half, 1), "seatedAtRuntime": seated})
        Path(out).write_text(json.dumps(got, indent=1))
        return got
    finally:
        shutil.rmtree(work, ignore_errors=True)

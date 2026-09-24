"""Dump the triangles of many NIFs to .npz, for mesh-to-mesh contact mining.

Runs inside Blender (PyNifly), launched by ``worldgen.mine_mounts --dump-meshes``.
The NIF import is ``build_kit.import_nif_meshes`` itself, lifted from that
script's source with ``ast`` (importing it would run a whole kit build), so the
dumped mesh is exactly the geometry a kit build would see: unit scale baked in
(metres), z-up, the NIF's own local frame.

Plan (``DUMP_PLAN`` env, JSON): ``{build_kit_script, metresPerUnit, jobs:
[{nif, out}]}``. Each job writes ``out`` = npz(vertices float32 (n, 3), faces
int32 (m, 3)); a job whose NIF will not import writes empty arrays, so a rerun
skips it too. Prints ``DUMP_DONE`` at the end.
"""

import ast
import json
import os

import bpy
import numpy as np
from mathutils import Matrix

PLAN = json.loads(open(os.environ["DUMP_PLAN"], "r", encoding="utf-8").read())
bpy.ops.preferences.addon_enable(module="io_scene_nifly")  # as build_kit does


def _lift_import_nif_meshes():
    source = open(PLAN["build_kit_script"], "r", encoding="utf-8").read()
    namespace = {"bpy": bpy, "Matrix": Matrix, "os": os,
                 "UNIT_SCALE": PLAN["metresPerUnit"]}
    for node in ast.parse(source).body:
        if isinstance(node, ast.FunctionDef) and node.name == "import_nif_meshes":
            exec(compile(ast.Module([node], []), "build_kit.py", "exec"), namespace)
    return namespace["import_nif_meshes"]


def _clear():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def main():
    import_nif_meshes = _lift_import_nif_meshes()
    done = failed = 0
    for job in PLAN["jobs"]:
        _clear()
        vertices, faces, base = [], [], 0
        try:
            for obj in import_nif_meshes(job["nif"]):
                mesh = obj.data
                mesh.calc_loop_triangles()
                count = len(mesh.vertices)
                co = np.empty(count * 3, dtype=np.float32)
                mesh.vertices.foreach_get("co", co)
                tris = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int32)
                mesh.loop_triangles.foreach_get("vertices", tris)
                vertices.append(co.reshape(-1, 3))
                faces.append(tris.reshape(-1, 3) + base)
                base += count
        except Exception as error:  # a broken NIF must not stop the batch
            print("[dump] FAIL %s: %s" % (job["nif"], error))
            vertices, faces = [], []
            failed += 1
        np.savez(job["out"],
                 vertices=np.vstack(vertices) if vertices else np.zeros((0, 3), np.float32),
                 faces=np.vstack(faces) if faces else np.zeros((0, 3), np.int32))
        done += 1
    print("[dump] %d written, %d failed" % (done, failed))
    print("DUMP_DONE")


main()

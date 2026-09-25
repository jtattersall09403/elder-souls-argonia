# Placement workbench

An agent places kit pieces the way a person does in Blender or the Creation
Kit: in a 3D scene over the frozen ground, placing, snapping, settling,
measuring every contact, rendering and looking, then exporting the poses as
the blueprint record the compile realises unchanged. Lane brief:
[docs/phases/lanes/placement-workbench-lane.md](../../docs/phases/lanes/placement-workbench-lane.md).

    python3 tooling/placement-workbench/wb.py --help

| File | What it is |
|---|---|
| `wb.py` | The CLI: one command per call, the scene JSON is the whole state, JSON out, a `[wb] <cmd> <s>` timing line on stderr. `check` judges every piece on the compile's own ground rules (fit slope, fit delta, the yard gate's sill), every near pair on its relation's bar (mounted, run joint, unrelated) and every quay on the compile's slide, the 97 C5 clearance and its published reach; `compile` runs the real derive passes and compile on the scene's poses in a temporary copy (6 s) and names the pieces behind each refusal; `site` lists the poses that pass those rules; `map --heights` prints the ground in metres. |
| `workbench/scene.py` | Scene and piece poses; the one frame table (province x east / z south; workbench = Blender = kit frame turned by yaw). |
| `workbench/ground.py` | The ground window, extracted once per scene: the studio's lod1 chunks (what the runtime seats on) and the compile's survey (height, slope, wet, depth, water level). |
| `workbench/kits.py` | Published manifest rows and sidecars; meshes from the raw kit builds via `mine_mounts.MeshLibrary`, cached as npz. |
| `workbench/measure.py` | Exact gap and crossing (FCL), penetration by separation, contact patch (the miner's `patch_class`), the runtime's seat height, foot float, doors to paths. |
| `workbench/snap.py` | Snap by the mined abuts evidence (skipping faces the plugins end runs on), snap face to face by geometry, mount on a mined mount pair, attach by a mined template; the runtime's mounted pose for comparison. |
| `workbench/assembly.py` | Building assemblies: groups saved and placed as prefabs, variant swap, the front-face and openings check, the repetition signature. |
| `workbench/describe.py` | The per-asset descriptor (bounds, floors, walls, openings, doorways, symmetry, connectors, the mined evidence), cached with `schemaVersion`. |
| `workbench/render.py`, `blender/render_scene.py` | Renders (top, front, side, back, iso, turntable, cutaway) with Linux Blender 3.2.2, Cycles CPU; scale bar, labels and outlines drawn from the camera projection. |
| `workbench/export.py` | Poses into a blueprint's parcels, runs (`pieces` with `atM`), a shell's `assembly`, landmarks and routes. |
| `tests/` | The round-1 answers (`expected_round1.json`, written before the code), the round-3 fixes and yard B's gates (`test_proving_ground_b.py`: the published record is the scene's poses, every run joint is contact) as pytest. Local only: they need the raw kit builds. |

Output (scenes, ground windows, mesh and descriptor caches, renders) goes to
`output/`, which git ignores.

Dependencies beyond the world-generation set: `python-fcl` (exact
mesh-mesh distance and crossing, used through `trimesh.collision`), listed
in `requirements.txt`; Blender 3.2.2 for Linux at `~/tools/blender-3.2.2-linux-x64/`.

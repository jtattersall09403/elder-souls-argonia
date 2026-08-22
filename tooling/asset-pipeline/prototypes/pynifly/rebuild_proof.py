import bpy
import os

bpy.ops.preferences.addon_enable(module="io_scene_nifly")

def active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

COMMON = dict(
    blender_xf=True,
    rotate_bones_pretty=False,
    rename_bones=True,
    rename_bones_niftools=True,
)

# ------------------------------------------------------------
# Clean scene
# ------------------------------------------------------------

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

bpy.context.scene.render.fps = 30

# ------------------------------------------------------------
# 1. Canonical 99-bone Skyrim HKX skeleton
# ------------------------------------------------------------

bpy.ops.import_scene.pynifly_hkx(
    filepath=os.environ["SKEL"],
    **COMMON,
)

arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
assert len(arms) == 1, f"Expected 1 armature, got {len(arms)}"

arm = arms[0]
assert len(arm.data.bones) == 99, len(arm.data.bones)

# ------------------------------------------------------------
# 2. Complete humanoid geometry onto SAME armature
# ------------------------------------------------------------

for key in ["BODY", "HANDS", "FEET", "HEAD", "EYES", "MOUTH"]:
    active(arm)

    result = bpy.ops.import_scene.pynifly(
        filepath=os.environ[key],
        create_bones=False,
        import_tris=False,
        import_animations=False,
        import_collisions=False,
        **COMMON,
    )

    if "FINISHED" not in result:
        raise RuntimeError(f"{key} import failed: {result}")

# Validate one armature remains.
arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
assert len(arms) == 1

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
assert len(meshes) == 7, f"Expected 7 meshes, got {len(meshes)}"

# Every real skin group must exist on the HKX skeleton.
for obj in meshes:
    for vg in obj.vertex_groups:
        if vg.name.startswith("SBP_"):
            continue
        assert vg.name in arm.data.bones, (
            f"{obj.name}: unmatched skin group {vg.name}"
        )

# ------------------------------------------------------------
# 3. Native Skyrim Dark Elf race morph
# ------------------------------------------------------------

head = bpy.data.objects["MaleHeadIMF"]
active(head)

result = bpy.ops.import_scene.pyniflytri(
    filepath=os.environ["RACE_TRI"],
    do_apply_active=True,
)

assert "FINISHED" in result

keys = head.data.shape_keys.key_blocks
assert "DarkElfRace" in keys

for key in keys:
    if key.name != "Basis":
        key.value = 0.0

keys["DarkElfRace"].value = 1.0

# ------------------------------------------------------------
# 4. Vanilla Silent Roll onto same 99-bone armature
# ------------------------------------------------------------

active(arm)

result = bpy.ops.import_scene.pynifly_hkx(
    filepath=os.environ["ROLL"],
    **COMMON,
)

action = arm.animation_data.action
assert action is not None
assert action.name == "sneakrun_forwardroll"
assert tuple(round(x) for x in action.frame_range) == (1, 27)

# ------------------------------------------------------------
# 5. Save proof
# ------------------------------------------------------------

bpy.ops.wm.save_as_mainfile(filepath=os.environ["OUT"])

print("SUMMARY_BEGIN")
print("ARMATURE", arm.name)
print("BONES", len(arm.data.bones))
print("ARMATURE_SCALE", tuple(round(x, 3) for x in arm.scale))
print("MESHES", len(meshes))
print("DARK_ELF_MORPH", keys["DarkElfRace"].value)
print("ACTION", action.name)
print("ACTION_FRAMES", tuple(round(x) for x in action.frame_range))
print("OUTPUT", os.environ["OUT"])
print("SUMMARY_END")

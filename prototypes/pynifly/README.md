# PyNifly Skyrim Character/Animation Proof

This directory records the known-good headless pipeline proved interactively before productionising it.

## Proven architecture

```text
Skyrim skeleton.hkx
        ↓ PyNifly
99-bone Skyrim humanoid armature
        ↓ PyNifly
Skyrim body/head/hands/feet/eyes/mouth NIFs
        ↓
single correctly-skinned humanoid
        ↓ PyNifly TRI
DarkElfRace head morph
        ↓ PyNifly HKX
Skyrim animations as Blender Actions
```

This has been visually validated with Skyrim's vanilla Silent Roll.

## Toolchain

Linux host, command-line/headless.

Portable Wine:

```text
~/tools/wine-11.13-amd64-wow64/bin/wine
```

Wine prefix:

```text
~/tools/wine-pynifly-prefix
```

Windows Blender:

```text
~/tools/blender-4.4.3-windows-x64/blender.exe
```

PyNifly:

```text
v28.1.0
~/tools/blender-4.4.3-windows-x64/4.4/scripts/addons_core/io_scene_nifly
```

Important: on this Blender installation the working addon location is `addons_core`.

Inside background Blender scripts use:

```python
bpy.ops.preferences.addon_enable(module="io_scene_nifly")
```

Using only `addon_utils.enable()` caused PyNifly's addon-preferences lookup to be absent during NIF import.

Linux paths passed to Windows Blender should be converted using:

```text
~/tools/wine-11.13-amd64-wow64/bin/winepath
```

## Canonical skeleton proof

Source:

```text
skyrim-source/extracted/hkx-skeleton/skeleton.hkx
```

PyNifly HKX settings known to work:

```python
bpy.ops.import_scene.pynifly_hkx(
    filepath=...,
    blender_xf=True,
    rotate_bones_pretty=False,
    rename_bones=True,
    rename_bones_niftools=True,
)
```

Observed result:

```text
armatures: 1
bones: 99
armature scale: (0.1, 0.1, 0.1)
game: SKYRIM
HKX bone list: 99
```

Reference output:

```text
output/pynifly-skyrim-skeleton.blend
```

## Complete humanoid proof

The following were imported through PyNifly onto the SAME existing HKX armature:

```text
malebody_1.nif
malehands_1.nif
malefeet_1.nif
malehead.nif
eyesmale.nif
mouth/mouthhuman.nif
```

For mesh imports the successful settings include:

```python
create_bones=False
import_tris=False
import_animations=False
import_collisions=False
blender_xf=True
rotate_bones_pretty=False
rename_bones=True
rename_bones_niftools=True
```

Observed result:

```text
armatures: 1
bones: 99
meshes: 7
unmatched non-partition skin groups: 0
```

Groups such as:

```text
SBP_32_BODY
SBP_38_CALVES
SBP_34_FOREARMS
```

are Skyrim body-partition groups and are not missing bones.

Reference outputs:

```text
output/pynifly-skyrim-body.blend
output/pynifly-skyrim-complete.blend
```

## Dunmer morph proof

Source:

```text
skyrim-source/extracted/racemorphs/meshes/actors/character/character assets/maleheadraces.tri
```

Target mesh:

```text
MaleHeadIMF
```

Both use 898 vertices.

PyNifly TRI import created 11 shape keys, including:

```text
DarkElfRace
```

Setting:

```text
DarkElfRace = 1.0
```

visibly produced the Dunmer/elven facial shape and pointed ears.

Reference:

```text
output/pynifly-skyrim-dunmer.blend
output/pynifly-skyrim-dunmer-clear.blend
```

## Texture state

Already-resolved Skyrim DDS sets include:

Body/feet:

```text
malebody_1.dds
malebody_1_msn.dds
malebody_1_s.dds
malebody_1_sk.dds
```

Hands:

```text
malehands_1.dds
malehands_1_msn.dds
malehands_1_s.dds
malehands_1_sk.dds
```

Head:

```text
malehead.dds
malehead_msn.dds
malehead_s.dds
malehead_sk.dds
```

The unified Dunmer source tree substitutes the Dunmer-specific head normal for `malehead_msn.dds`.

Already extracted race-specific assets include:

```text
mouthhuman_darkelf.dds

eyedarkelf.dds
eyedarkelfdeepred.dds
eyedarkelfdeepred2.dds
eyedarkelfunique1.dds
```

The complete native dependencies for the underwear and eye shaders still need to be resolved from the NIF shader references / Textures BSA. Temporary preview materials are not the desired production solution.

## Animation proof

Vanilla Silent Roll source:

```text
skyrim-source/extracted/animation-tests/sneakrun_forwardroll.hkx
```

PyNifly imported it directly onto the same 99-bone character armature.

Observed result:

```text
Action: sneakrun_forwardroll
frames: 1..27
duration: ~0.8667 s at 30 fps
bones: 99
armature scale remains 0.1
```

Reference:

```text
output/pynifly-skyrim-dunmer-roll.blend
output/skyrim-silent-roll.gif
```

The GIF visually demonstrated coherent full-character deformation through the roll.

## Important failed approach

Do not rediscover this unless the supported PyNifly path develops a concrete blocker.

Earlier experiments used:

```text
Blender 3.2
NifTools NIF import
PyNifly standalone HKX parser
custom HKX → Blender armature/Action code
```

The standalone HKX parser successfully decoded Skyrim HKX, but combining a custom HKX armature with NifTools-bound meshes caused extreme skin deformation.

Raw HKX joint positions were found to correspond almost exactly to the NifTools representation with a 0.1 scale:

```text
fit scale: 0.099999996
mean positional residual: ~0.0000014
```

Applying an armature object-scale patch afterwards did not solve the deformation.

Current PyNifly already handles the skeleton orientation, scale, bind/rest transforms and animation application correctly. Use it.

## Executable proof

`rebuild_proof.py` and `run_proof.sh` reconstruct the essential successful path from source:

```text
skeleton.hkx
→ complete humanoid
→ DarkElfRace morph
→ Silent Roll
→ validated .blend
```

Run with:

```bash
./prototypes/pynifly/run_proof.sh
```

Expected output includes:

```text
BONES 99
MESHES 7
DARK_ELF_MORPH 1.0
ACTION sneakrun_forwardroll
ACTION_FRAMES (1, 27)
```

## Productionisation intent

These are proof artefacts, not the desired final pipeline.

Production work should:

- turn source paths and animation selections into manifests/configuration;
- automate BSA extraction where required;
- support many semantic game animation Actions on one armature;
- validate bone count, mesh binding, textures and Action names;
- export a deterministic game-ready GLB;
- make replacing an individual animation a manifest/source change rather than a runtime-code change.

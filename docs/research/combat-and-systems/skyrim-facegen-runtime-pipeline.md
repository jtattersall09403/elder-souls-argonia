# Skyrim FaceGen pipeline

The previous playable-race build was not a Skyrim character pipeline. It chose
one broad race TRI, baked that shape into a generic head, substituted a few
textures, then rebuilt every material as plain diffuse. At runtime it reduced
the diffuse to luminance and recoloured it. That discarded the NPC's facial
sliders and selected head parts, its generated tint texture, head detail,
normals, hair alpha and eye material. It also explains both reported failures:
several races had nearly the same geometry, and the invented luminance remap
made almost every body look like the same dark grey statue.

## Source model

Skyrim resolves an NPC's appearance from its `TESNPC` data and exports the
finished head assembly as
`meshes/actors/character/facegendata/facegeom/<plugin>/<formid>.nif`, with the
generated face tint at the parallel `facetint` texture path. `TESNPC::FaceData`
holds facial morph values and preset indices, while tint layers are separate
typed records. The local build therefore identifies every default by plugin,
FormID and editor ID and imports that generated NIF as one coherent source.
This keeps the same boundary a later character creator needs: it can edit NPC
face data and head parts, generate FaceGen output, and pass the resulting
plugin/FormID asset through the existing browser conversion.

Sources:

- [CommonLibSSE `TESNPC` layout](https://ryan.commonlib.dev/TESNPC_8h_source.html)
- [Bethesda NIF texture and shader roles](https://github.com/BadDogSkyrim/BethesdaLibrary/blob/main/docs/file-formats/textures-materials.md)

## Skin and face colour

Skyrim uses two closely related shader paths rather than painting a flat colour
over the finished character. A generated NPC head uses `FACEGEN`: its base
diffuse and per-NPC FaceTint texture are combined, then multiplied by the face
detail map. Tintable skin such as the body uses `FACEGEN_RGB_TINT`, where the
NPC's constant `QNAM` skin colour replaces the FaceTint texture. Both paths use
the same overlay operation:

```text
overlay = base² + 2 × tint × base - 2 × tint × base²
colour  = overlay × detail
```

The body tint comes directly from the chosen NPC's `QNAM` RGB floats and runs
through that equation.
`Actor::UpdateSkinColor` passes those values to the shader as normalized colour
components, so they must not receive an additional sRGB conversion. Hair uses
the NPC's `HCLF` colour record with Skyrim's `/128` normalization and applies
to the generated hair, hairline, brow, beard and feather head parts.

Sources:

- [Skyrim SE FaceGen pixel shader](https://github.com/aers/Skyrim-SE-Shader-Tools/blob/master/old/shaders/Lighting/BSLightingShader.ps.hlsl)
- [CommonLibSSE `Actor::UpdateSkinColor`](https://github.com/Ryan-rsm-McKenzie/CommonLibSSE/blob/master/src/RE/A/Actor.cpp)
- [Skyrim engine FaceGen material structs](https://github.com/Nukem9/skyrimse-test/blob/master/skyrim64_test/src/patches/TES/BSShader/Shaders/BSLightingShaderMaterial.h)

## Browser material translation

The converter keeps source diffuse maps, compatible tangent-space normal maps,
and transparency for hair, scars, marks and other overlay head parts. Skyrim
model-space `_msn` normal
maps are not put into glTF's tangent-space normal slot because that changes
their meaning. Eye materials retain their selected eye diffuse and normal and
translate the glossy cornea response to a low-roughness clearcoat material.
The generated FaceGen head texture is already composited; only body pieces and
the head parts driven by HairTint remain dynamically tintable.

FaceGen NIFs contain a mixture of head-local geometry and head parts with a
separate NIF-node transform. The importer classifies those two spaces. Generated
heads retain the vanilla base head's topology and vertex order, so the pipeline
finds the open neck loop and rigidly registers it against Skyrim's support head,
then snaps that boundary to the support ring. Other transformed head parts use
the same solved registration; head-local eyes, mouths, brows and overlays
receive the actual head-bone attachment. This derives the bind correction from
Skyrim geometry instead of a race-specific offset. Without it, parts receive
incompatible or repeated transforms: skulls float, eyes separate, and an open
mouth exposes the empty scene. The mouth and eye meshes remain part of the
complete assembly so open mouths are enclosed and eyes keep their Skyrim
surfaces.

The body also follows each NPC's `NAM7` weight. Skyrim supplies `_0` and `_1`
body, hand and foot meshes; the build interpolates their vertices by that
weight before export. This makes the body's neck opening match the already
generated head instead of pairing every head with the maximum-weight body.
Khajiit and Argonian additionally use their race-specific body texture sets.

Skyrim's character-generation presets are NPC records marked as char-gen face
presets. The shipped archives do not include pre-generated FaceGen geometry and
FaceTint files for those presets, because the game generates a new player face
from the selected parts and slider data. Until the planned runtime character
creator performs that generation, the browser defaults use ordinary authored
NPC records whose complete FaceGen files are present. This preserves the same
asset boundary and avoids inventing race colour grades or brightness changes.

The default roster now uses these vanilla Skyrim NPC FaceGen records:

| Race | Source NPC | FormID | `NAM7` weight |
| --- | --- | --- | ---: |
| Nord | Addvar | `00013255` | 75 |
| Imperial | General Tullius | `0001327E` | 60 |
| Breton | Giraud Gemane | `00013281` | 20 |
| Redguard | Ahtar | `0001325F` | 85 |
| Altmer | Quaranir | `0002BA3C` | 50 |
| Bosmer | Faendal | `00013480` | 40 |
| Dunmer | Dravin Llanith | `00013353` | 20 |
| Orsimer | Kharag gro-Shurkul | `00013291` | 40 |
| Khajiit | Mazaka | `00013298` | 50 |
| Argonian | Gulum-Ei | `00013284` | 30 |

These are defaults, not race templates. Future presets can point at other
FaceGen outputs, and full creation can generate a new output without changing
the rendering contract. Every listed skin and hair colour is the selected NPC's
authored `QNAM`/`HCLF` value. General Tullius replaces the former Imperial
source because that source shared Addvar's exact skin colour; the ten defaults
now have ten distinct Skyrim-authored skin colours.

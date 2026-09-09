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
rigidly registers the complete generated face surface against Skyrim's support
head. Registering an arbitrarily chosen open-boundary component is unsafe: the
support head's 12-vertex mouth opening was previously mistaken for its neck,
which distorted the mouth and left the real neck detached. The weight-blended
body's highest open boundary is now the authoritative neck. Generated-head
boundary vertices close to that loop snap to its nearest edges, and inherit the
same interpolated body skin weights. Matching the positions closes the bind
pose; matching the weights keeps it closed through idle and combat animation.

Other transformed head parts use the same solved full-surface registration;
head-local eyes, mouths, brows and overlays receive the actual head-bone
attachment. This derives the bind correction from Skyrim geometry instead of a
race-specific offset. Without it, parts receive incompatible or repeated
transforms: skulls float, eyes separate, and an open mouth exposes the empty
scene. The mouth and eye meshes remain part of the complete assembly so open
mouths are enclosed and eyes keep their Skyrim surfaces. Every race build now
rejects a partial registration, an open neck, or a head without a FaceTint
bake. Khajiit heads legitimately omit the humanoid detail map; their FaceTint
still composites over the fur with a neutral detail term.

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
| Nord | Ralof | `0002BF9D` | 75 |
| Imperial | Brother Verulus | `0001338C` | 15 |
| Breton | Adeber | `000661AD` | 55 |
| Redguard | Nazir | `0001C3AB` | 40 |
| Altmer | Quaranir | `0002BA3C` | 50 |
| Bosmer | Enthir | `0001C19C` | 10 |
| Dunmer | Dravin Llanith | `00013353` | 20 |
| Orsimer | Kharag gro-Shurkul | `00013291` | 40 |
| Khajiit | Mazaka | `00013298` | 50 |
| Argonian | Gulum-Ei | `00013284` | 30 |

These are defaults, not race templates. Future presets can point at other
FaceGen outputs, and full creation can generate a new output without changing
the rendering contract. Every listed skin and hair colour is the selected NPC's
authored `QNAM`/`HCLF` value. The human defaults deliberately span Ralof's pale
Nord tone, Adeber's light-medium Breton tone, Brother Verulus's medium Imperial
tone and Nazir's dark Redguard tone. This is the same data-driven variation
Skyrim uses; none of these values is a post-process brightness or colour grade.
The ten defaults now have ten distinct Skyrim-authored skin colours.

## Character-generation boundary and timing

The current pipeline is already scalable for authored appearances: a config
can select any complete Skyrim NPC FaceGen record, body weight, skin colour and
hair colour, and the race build produces the same browser-ready asset. The
second comparison sheet exercises that path with a fixed race-valid sample:
Balgruuf, Sorex Vinius, Cosnach, Ahtar, Ancano, Faendal, Savos Aren, Burguk,
Ma'iq and Jaree-Ra. It proves variation in morph geometry, head parts, eyes,
hair, beards, marks, FaceTint and weight, including beast races.

It is not yet a full Skyrim character generator. Randomly mixing only the
existing JSON values would mismatch a baked FaceGeom NIF with its FaceTint and
head parts. A correct generator must choose sex and race-valid head parts,
apply race morph presets and sliders, compose ordered tint layers, blend body
weight, then emit one matched FaceGeom/FaceTint result. That visual generator
belongs in Phase 10b, alongside the portable actor-loading and character-view
work it must serve. Phase 10c then connects the already designed attributes and
progression rules, while MQ01 presents the player-facing creation flow. This
order also lets the implementation cover both sexes and armour/body fitting
instead of freezing a male-only JSON schema now.

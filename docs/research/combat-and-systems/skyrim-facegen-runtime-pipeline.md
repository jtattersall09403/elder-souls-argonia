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

The fixed NPC head uses the real FaceGen shader inputs. During conversion its
base diffuse, generated FaceTint texture and head-detail texture are combined
with Skyrim SE's `FACEGEN_RGB_TINT` colour stage:

```text
overlay = base² + 2 × tint × base - 2 × tint × base²
colour  = overlay × detail
```

The body remains selectable at runtime. Its tint comes directly from the
chosen NPC's `QNAM` RGB floats and runs through the same overlay equation.
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
and transparency for hair-like head parts. Skyrim model-space `_msn` normal
maps are not put into glTF's tangent-space normal slot because that changes
their meaning. Eye materials retain their selected eye diffuse and normal and
translate the glossy cornea response to a low-roughness clearcoat material.
The generated FaceGen head texture is already composited; only body pieces and
the head parts driven by HairTint remain dynamically tintable.

The default roster now uses these vanilla Skyrim NPC FaceGen records:

| Race | Source NPC | FormID |
| --- | --- | --- |
| Nord | Addvar | `00013255` |
| Imperial | Corpulus Vinius | `00013266` |
| Breton | Giraud Gemane | `00013281` |
| Redguard | Ahtar | `0001325F` |
| Altmer | Quaranir | `0002BA3C` |
| Bosmer | Faendal | `00013480` |
| Dunmer | Dravin Llanith | `00013353` |
| Orsimer | Kharag gro-Shurkul | `00013291` |
| Khajiit | Mazaka | `00013298` |
| Argonian | Gulum-Ei | `00013284` |

These are defaults, not race templates. Future presets can point at other
FaceGen outputs, and full creation can generate a new output without changing
the rendering contract.

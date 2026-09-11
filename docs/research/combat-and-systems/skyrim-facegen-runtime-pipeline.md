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

HairTint head parts are exported as alpha-tested cutouts. Blender 4 otherwise
turns their authored alpha into glTF `BLEND`, which produces sorting and edge
artefacts on brows and layered hair. The post-export pass follows the glTF
node-to-mesh-to-material references for the selected hair, hairline, brow,
beard, mustache and feather meshes, then writes `MASK` with a 0.5 cutoff. It
does not guess from a material name. A race build rejects any selected brow
that has fallen outside the HairTint set or any discovered HairTint material
that was not masked.

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
| Nord | Golldir | `00019FE8` | 65 |
| Imperial | Brother Verulus | `0001338C` | 15 |
| Breton | Adeber | `000661AD` | 55 |
| Redguard | Nazir | `0001C3AB` | 40 |
| Altmer | Ice warlock 03 boss | `000E101E` | 50 |
| Bosmer | Wood Elf road courier | `001065EE` | 20 |
| Dunmer | Dravin Llanith | `00013353` | 20 |
| Orsimer | Kharag gro-Shurkul | `00013291` | 40 |
| Khajiit | Mazaka | `00013298` | 50 |
| Argonian | Gulum-Ei | `00013284` | 30 |

These are defaults, not race templates. Future presets can point at other
FaceGen outputs, and full creation can generate a new output without changing
the rendering contract. Every listed skin and hair colour is the selected NPC's
authored `QNAM`/`HCLF` value. The human defaults deliberately span Golldir's pale
Nord tone, Adeber's light-medium Breton tone, Brother Verulus's medium Imperial
tone and Nazir's dark Redguard tone. This is the same data-driven variation
Skyrim uses; none of these values is a post-process brightness or colour grade.
The ten defaults now have ten distinct Skyrim-authored skin colours.

## Character-generation boundary and timing

The current pipeline is already scalable for authored appearances: a config
can select any complete Skyrim NPC FaceGen record, body weight, skin colour and
hair colour, and the build produces the same browser-ready asset. The second
comparison sheet exercises that path with a fixed race-valid sample. It is now a
roster of its own, `config/characters/sheet-variants.json`, twenty alternates —
one per race and sex — built to `output/sheet-variants/` and never shipped as
playable. The male ten are Alvor, Sorex Vinius, Cosnach, Ahtar, the ice warlock
04 High Elf boss, Niruin, Savos Aren, Burguk, Ma'iq and Jaree-Ra; the female ten
are Maven, Safia, Bothela, Salma, Endarie, Nivenor, Irileth, Shel, Atahba and
Wujeeta. They prove variation in morph geometry, head parts, eyes, hair, beards,
marks, FaceTint and weight, including beast races and both sexes.

The source NPC's race is audited before selection, as are its complete PNAM
head parts. Editor IDs describe the reusable asset family rather than a race
restriction: vanilla Skyrim, for example, gives Breton NPCs race-valid
`HairMaleNord*` parts and gives both Altmer and Bosmer race-valid
`HairMaleElf*` parts. The accepted current/alternate pairs use `Elf06`/`Elf07`
for Altmer and `Elf07`/`Elf04` for Bosmer. No Bosmer in either sheet uses a
`DarkElf` hair part. Among **`HairMaleElf*`**, `Elf01`, `Elf02`, `Elf03`,
`Elf08` and `Elf09` were visually rejected because they produce the bald-crown,
long lower-fringe silhouette.

That reject list is **male parts only**, and does not carry to the female side:
`HairFemaleElf*` are different meshes with different silhouettes, and a shared
suffix is not a shared shape. The same *rule* is applied — no cross-race hair —
so Niranye takes `HairFemaleElf06` and Brelas `HairFemaleElf07`, with
`HairFemaleElf09` and `HairFemaleElf03` on the alternates sheet. **No female
Elf part has been visually assessed yet**; the owner review of
`docs/evidence/races/race-valid-variants-female.png` is what decides whether a
female reject list is needed. Stated explicitly because an earlier revision of
this paragraph put the male list directly after the female sentence, which read
as though the female alternates had shipped against a standing rejection. They
had not.

Every accepted humanoid and mer appearance carries the brow chosen
by that same NPC record; valid beast head parts remain species-specific.

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


## Two sexes: what actually had to be measured per sex (2026-09-10)

Decision 0054 left one question open — whether the runtime needs one set of
support envelopes and one fitted hurtbox, or a set per sex. It is settled by
measurement, comparing the two reference builds (`dunmer-male`,
`dunmer-female`) from the same build run.

**Support envelopes: sex-invariant where it counts.** Across all 103 clips the
per-clip `soleMarkerMinZ` values are **bit-identical** between the two builds —
the sole markers are read from the skeleton, which is shared, so grounding and
the cross-fade sole margin do not care about sex. The visible-surface floor
`surfaceMinZ` does differ, because the female body, hands and feet are different
meshes: mean absolute difference 0.021, worst 0.274 on `ROLL` (a clip whose
whole silhouette is on the floor), next worst 0.051 on the three knockdown/death
clips. Everything else is under 0.05.

**The fitted hurtbox is not sex-invariant.** Per-bone capsule radii, fitted to
posed skinned geometry:

| bone | male r | female r | Δ |
| --- | --- | --- | --- |
| `NPC Spine [Spn0]` | 1.482 | 1.217 | −17.8% |
| `NPC UpperArm [Uar].L` | 0.532 | 0.448 | −15.7% |
| `NPC Clavicle [Clv].L/R` | 0.875 | 0.741 | −15.3% |
| `NPC Thigh [Thg].R` | 1.207 | 1.035 | −14.3% |
| `NPC Pelvis [Pelv]` | 1.379 | 1.496 | **+8.5%** |
| `NPC Spine1 [Spn1]` | 1.470 | 1.564 | **+6.4%** |

Shoulders and upper torso are narrower on the female body and the pelvis is
wider — the differences run in *both* directions, so no single scalar reconciles
them. At the shipped character scale the spine capsule differs by roughly four
centimetres of world radius, which is inside the range a Souls-like trades on:
whether a swing that just misses a woman's shoulder connects.

**Finding, and what was done (2026-09-10).** One shared support envelope is
defensible and one shared hurtbox is not. The runtime animation manifest
(`rig-skyrim-humanoid.animations.json`) now carries `hurtbox` **keyed by sex**,
the way `referenceBuilds` is:

```jsonc
"hurtbox": { "male": { "segments": [...] }, "female": { "segments": [...] } }
```

The male set is byte-identical to what it was; the female set is the female
reference's own measurement, which the build was already taking and throwing
away. `pipeline/build.py` writes the rig-emitting reference's set and
`merge_hurtbox_for_sex` merges each other reference's in afterwards, converting
with the manifest's own `rig.recommendedScale` so both sexes' radii are in the
same units. The runtime resolves by the actor's `CharacterBuild.sex`
(`animationManifest.hurtboxSegments(sex)`); a sex with no measured set still
falls back to the navigation capsule, and `animationManifest.test.ts` fails if
one sex silently serves another's capsules.

`supportEnvelope` stays **shared**, deliberately: `soleMarkerMinZ` is
bit-identical between the sexes and it is the sole markers that grounding and
the cross-fade margin read. The caveat to keep: the visible-surface floor
`surfaceMinZ` differs most on `ROLL` (0.274) and the knockdown/death clips
(~0.051), everything else under 0.05. If a female character ever appears sunk
or floating mid-roll, that is the number to re-measure per sex first.

## Head parts are not torso: the biped-slot defect (2026-09-10)

The generated roster used to give `MaleEyesHumanDemon`,
`MaleMouthHumanoidDefault` and `BrowsMaleHumanoid05` the biped slot `[32]` —
the torso — so any cuirass declaring slot 32 would have hidden the character's
eyes, mouth and brows. Read out of the NIFs directly, those three shapes carry a
plain `NiSkinInstance` and **no dismember partitions at all**; pyNifly's C++
layer hands an unpartitioned Skyrim-era shape a synthetic `SBP_32_BODY` group,
because 32 is its default. The `[32]` was never in Bethesda's data.

The FaceGen head's own `[30, 32, 43]` had a second, separate cause in our code:
the neck stitch in `pipeline/blender/build_character.py` interpolated *every*
vertex group of the body onto the head's neck vertices, including the body's
`SBP_32_BODY` partition group, manufacturing one on the head. It also summed
that group's 1.0 into the normalisation total, so stitched neck bone weights
were stored at about half their intended magnitude.

Both are fixed in `build_character.py`: `vertex_weights` skips `SBP_*` groups,
and `biped_slots` drops the torso slot from FaceGen head-part geometry. The
`% 100` fold of section-cap partitions is replaced by an explicit table, because
`% 100` also turned 230 (NECK) into 30 (HEAD). The head now reports `[30, 43]`
and the head parts report no slot at all.

**The armour side is fixed too (2026-09-10).** `build_armour.py` did the
identical `% 100` fold. The table, the regex and the non-slot set now live in
`pipeline/blender/biped_slots.py` and both builds import them, so the two
answers the runtime compares against each other cannot drift apart. Rebuilding
the whole armour set changed nothing: all 36 pieces report the same
`coversBipedSlots` and every GLB came back byte-identical, because no vanilla
piece in the set happens to declare a 130/141/230 partition. The defect was
latent, not live — a future piece with a neck cap would have read as a head
cover and hidden the wearer's face.

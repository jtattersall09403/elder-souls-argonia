# Grounding a placed building: the rendering treatments, and the vegetation lessons that apply

> Written for **Phase 11 Round B** (massing — compiling settlement blueprints into
> the 3D world), on the owner's directive of 2026-09-05: *"don't make the same
> mistakes with buildings that we made with plants and trees"*, and *"what
> mid-2010s AAA treatment do placed buildings need — the extra shadow where a
> building meets the ground, grass and foliage sprouting at edges, a band of
> local ground texture at the base?"*
>
> **Companions, not duplicates.** Siting, grading, plinth/stilt selection,
> navmesh ordering, draw-call budget and the DynDOLOD large-reference trap are
> already settled in
> [openworld-place-distribution-and-siting.md](../placement-settlements/openworld-place-distribution-and-siting.md)
> §4–5; the approach/reveal checklist is in
> [openworld-approach-and-wayfinding.md](../placement-settlements/openworld-approach-and-wayfinding.md);
> the binding placement rules are [world/97](../../world/97-placement-principles.md).
> This document covers only what those do not: **the per-building rendering
> treatments that make a placed mesh read as part of the ground**, and the
> transfer of the Phase 10 vegetation defect history onto architecture.
>
> Confidence marks: **[doc]** cited primary/technical source · **[inf]**
> inference from cited evidence · **[spec]** plausible convention that the
> research pass could **not** confirm as period practice (see §4).

---

## 1. The Phase 10 vegetation history, mapped onto buildings

Every row below is a defect that actually shipped in the vegetation pipeline and
was root-caused in [decision 0036](../../decisions/0036-phase10-placement-decisions.md).
The middle column is what the same class of defect looks like when the placed
object is a house rather than a tree. The right column is the rule Round B
inherits, so that the defect is not re-discovered a second time through the
owner's playtest.

| Vegetation defect (round) | The building form of the same defect | The rule for Round B |
|---|---|---|
| **LOD chosen per 468 m chunk, from the chunk centre** — whole chunks including plants beside the camera ran on flat cards (round 3) | A settlement is one cluster: a chunk-level LOD decision puts an entire village on its low tier while the player stands in the market | LOD selection is **per building reference**, from its own centre to the camera, recomputed on a movement trigger — never per chunk, never frozen at chunk arrival |
| **LOD froze at chunk-arrival focus**, so walking never upgraded it (round 3) | Walking into a village leaves it on the tier chosen at the settlement edge | Rebuild the LOD assignment on a movement trigger sized to the ring, as `Vegetation.tsx` does at 48 m |
| **`lodRatios` are proportions**: 0.12 of a 273-triangle shrub is a collapsed cross-plane, so "upgrading" changed nothing (round 5, A1) | A 900-triangle shack decimated by ratio becomes a hole-riddled shell while a 20k-triangle temple is still detailed. Kits are wildly uneven in triangle count | LOD budgets for architecture are **absolute triangle floors**, as `MIN_LOD_TRIANGLES = 300` became for flora. Below the floor, keep full geometry at every level |
| **`lodDistances` too tight** — a 2.15 m shrub was a card at 33 m (round 5, A1) | A 4 m outbuilding drops to its low tier while it is still the thing the player is walking towards | A minimum mesh reach per reference, as `MIN_MESH_LOD_REACH_M = 24`; scale it by **footprint diagonal**, not height (a long low hall is read at distance by its plan, not its ridge) |
| **The wrong far tier bound to the object**: palms sampled vanilla's *pine* card because BM&V ships two atlases and the build bound the plain one (round 10) | A Hlaalu house rendering the far tier baked from a different kit — a silhouette the player never saw up close. In a two-culture province this is the likeliest single visual bug | Every building LOD is generated **from the final placed mesh and transform**, after grading, and audited by rendering the LOD and the full mesh from the same camera and comparing silhouettes. Bethesda's own pipeline generates architecture LOD as reduced 3D meshes, not billboards, precisely because a wrong building silhouette reads as wrong where a flattened canopy does not **[doc]** ([DynDOLOD Object LOD](https://dyndolod.info/Help/Object-LOD)) |
| **Composites had no far tier at all** — 2.7 M of 4.4 M triangles at the owner's coordinates, the main FPS regression (round 10) | The landmark — the xanmeer, the temple, the keep — is the heaviest mesh in the province and the one visible furthest away. A missing tier on the landmark is the whole frame budget | Landmarks get the **most** LOD attention, not the least. A reference with no far tier is a compile error, not a warning |
| **Billboards rendered black**: a flat card's geometric normal faces away from the sun half the time (round 3) | Not directly transferable — architecture LOD is 3D. It transfers to any **flat overlay** Round B adds: base skirts, ground decals, window-glow planes | Any flat quad added at a building gets its normal authored deliberately, and is checked at both midday and low sun |
| **Cards did not fade with the aerial-perspective haze** and read as stark dark blobs (rounds 2–4) | A distant village that is crisper or darker than the hillside it stands on — the "pasted-on" read the owner will notice from any ridge | Every building tier, including LOD and any impostor, is patched by `applyAerialPerspective` from `apps/world-studio/src/sky/aerial.ts` on the **same** authority as the full mesh, and the switch distance is checked against the haze depth so the swap happens where haze already hides it |
| **`CSM.setupMaterial` overwrites `onBeforeCompile`** ~1 s after load, silently killing the wind hook; and one constant `customProgramCacheKey` let a patched material share an unpatched twin's compiled program (round 6, C1) | Any per-material shader patch Round B adds — wetness, contact-AO darkening, window emissive, world-aligned dirt — dies the same silent death | Follow the `windSway.ts` contract exactly: state on `material.userData`, an exported `reapplyX(material)` that is a no-op unless the live hook is not ours and otherwise chains, called from `WorldSky`'s `patchScene` after `csm.setupMaterial`, **and a chained `customProgramCacheKey` suffix** |
| **Shadow depth material not patched in step with the colour material** — the shadow stands still while the tree moves (round 5, B1) | Any vertex-displaced or alpha-tested building element (a hanging sign, a thatch card, a banner) casts a shadow that disagrees with it | Patch colour and `customDepthMaterial` from **one** call site with **one** shared uniform block, as `applyWindSwayWithShadow` does |
| **Cards blacked out by a CSM cascade** on up-normal quads, so `receiveShadow` was disabled on them (round 4) | Base skirt decals and flat pad geometry are exactly this shape and will black out the same way | Test any near-horizontal added quad against every cascade before shipping it; prefer a lit, shadow-receiving *mesh* skirt to an unlit quad |
| **Collider budget, not collider shape, was the real bug**: 96 bodies within 45 m ran out ~12 m from the player in a thicket, while the rebuild trigger was a fixed 12 m (round 9) | A settlement is denser than a thicket. A fixed ring budget will run out inside the village and the player walks through walls | Budget in **colliders, not references**; return an honest `coveredRadiusM`; trigger the rebuild on a fraction of that covered radius, not a fixed distance. Buildings additionally justify a **static, chunk-resident** collider set inside a settlement footprint — a village is not crossed in a minute |
| **Imperative Rapier body diffing replaced re-rendering 1,400 React `<RigidBody>` per rebuild** — half the FPS drop (round 10) | Same failure, same fix | Building colliders diff fixed bodies between rebuilds; no per-reference React components |
| **Collision frame mismatch**: kit emitted bbox-centre offsets in Blender z-up, runtime read pivot-relative y-up; offsets never yaw-rotated; rock tilt dropped (round 6, C2) | A house collider offset by metres, or rotated wrongly once the parcel `yawDeg` is applied. Invisible until walked | A **versioned collision frame** on the building kit, and the runtime **refuses untagged kits**. Misplaced colliders are worse than none |
| **Colliders must match the visible volume, not the bounding box** (round 9–10; and the buried-ledge warning in the siting research §5) | A buried plinth generating a collision ledge the player stands on inside the terrain; a stilt deck with collision only on part 0 | Collision is fitted to the wood/stone geometry, per part, with a `solid` flag per part; the buried portion is excluded |
| **Pivot vs base**: `originOffsetM` was recorded and nothing consumed it; baked Y from the compile raster sat ~1 m off the rendered mesh on banks (round 3) | The classic building float/sink. A kit piece whose pivot is at floor level and one whose pivot is at the bbox centre cannot share one anchoring rule | Anchoring is a **declared per-asset mode** in the kit manifest (as bundle v2's `anchorMode` 0/1/2), and the renderer re-grounds from the **streamed** terrain via `terrainHeight.ts` — never from the compile raster alone |
| **Sink is per-species, measured, with a slope term and a class cap** (round 4, C1/C2); rocks classed as plants got a 0.05 m sink on a 9.9 m shell (round 5, A2) | One global bury depth applied to a stilt hut and to a stone quay. The siting research already prescribes ≥0.25 m below `h_min` at every perimeter sample | Bury depth is per **ground-fit class** (plinth / graded pad / stilt / rock-cut), measured off the mesh, with a slope term — not one constant |
| **Terrain alignment did not exist at all**; then: rocks align to slope, **trees never do** (round 5, A2) | Buildings are the tree case, not the rock case: they stand plumb. Only the *pad* tilts | Buildings take yaw only. The pad takes a residual 0.5–1° tilt against shadow acne (§2.5) |
| **Vanilla tilt median 5.8°, p95 28.7° — our zero-tilt uniform-yaw habit is the mod's, not Bethesda's** (round 5, B6/D1) | A village whose every house sits on an exact 0/90° yaw reads procedural at a glance | Parcel yaw carries authored jitter within the district's alignment rule; `blueprint.py` already requires an `orientationWhy` per parcel |
| **`moss_rockcliff01`: an open-backed doubleSided dressing shell used as a freestanding boulder** (round 5, A2) | A wall segment authored as a facade used as a free-standing building; an interior-only piece placed outdoors with no back faces | The kits-only-combine-as-authored golden rule, enforced by measuring the mesh: closed volume, single-sided, has collision. `vet_kit.py` is the place for the check |
| **Atlas mistakes**: vanilla's 1024² atlas baked instead of BM&V's 4096², then shrunk to 256 → grey slabs; a texture path no archive ships → untextured at every LOD (round 4) | A building LOD atlas at 256 px per building, or a kit texture that silently resolves to nothing. `vet_kit.py` already flags texture-less primitives | Building LOD atlases are exempted from the general `textureMaxSize`, as `billboardTextureMaxSize` was; the kit vet gate fails the build on any untextured primitive |
| **Per-instance data must be an offset from neutral**, so a draw lacking the attribute reads WebGL's default `(0,0)` and degrades to the old look; and the buffer is **grown in place**, not reallocated per rebuild (round 7, R5/R6) | Any per-building instanced channel — wetness, dirt amount, window-lit state, material variant index | Same contract. The siting research §5 already requires per-building uniqueness to come from a **material variant index**, not unique meshes; that index is exactly such a channel |
| **Wind height weight measured from the instance pivot, which is underground for sunk species** (round 7, R6) | Any effect keyed to height above ground — a wetness gradient up a wall, a moss band at the base — measured from a buried pivot lands underground | Height-keyed effects measure from the **ground line** (`rawHeight − sink`), never the pivot |
| **A killed refine run (OOM, exit 137) left half-written rasters** decoding against a stale `meta.json`; the VM has a 12 GiB cap shared across terminals (round 10) | Same trap for any Round B raster the settlement compile writes (footprint masks, pad heights, repainted ground control) | Write rasters atomically (temp file, then rename); restore from HEAD on a killed run |
| **`ground-control.png` is full-resolution while `meta.json` describes the half-res height raster** — sampling with `meta.metresPerPixel` read the wrong quadrant, with no error anywhere (round 10, trap 4) | Any footprint mask Round B rasterises into ground control | Derive texel scale from the image's own size against the province extent. Measured today: 4033 texels over 7.37 km = **1.83 m per texel** |
| **The budget measurement is the owner's M2 Air FPS read** — the GPU micro-lab was cut, and *every hand-off must ask for an FPS read* (round 5, B2) | Unchanged | The Round B hand-off asks for an FPS read at a named coordinate inside the exemplar settlement, on all three quality settings |
| **Never look a kit asset up by its glTF node name** — three.js sanitises names and the kit renders empty with no error (trap 1) | Identical for building kits | Ids travel in glTF `extras` |
| **One instanced mesh per chunk is a draw call per chunk**; bucket by (asset, LOD) **across** chunks (trap 2) | A settlement spans several chunks and repeats the same kit piece hundreds of times | Bucket building kit pieces by (asset, LOD) across the whole settlement, per the siting research §5 draw-call rule |

Two further transfers are worth stating as principles rather than rows.

**Measure the mesh; do not trust the label.** Round 7 retired five "wide-crowned
tropical" picks that were an English oak, a cedar of Lebanon and a conifer, and
round 6's scree fix was a texture that passed every numeric screen and still
looked like more mossy rock. The lesson recorded in `build_ground_materials.py`
— *the numeric screen is necessary, not sufficient; look at the candidate* — is
the owner's later geometry-not-labels ruling in another form. `render_sheet`
already renders one framed still per kit asset against a 1.8 m human bar; run it
over the building kits before a parcel picks an asset.

**Root-cause before touching anything.** Every round in 0036 that went well
began by reproducing the defect from data. Round 5's "jungle reads open" was not
a filter bug at all — the tall layers *did not exist*.

---

## 2. The standard treatments, their cost, and how each is done in our stack

### 2.1 Contact shadow at the base — the "extra shadow where a building meets the ground"

The effect the owner is describing is the soft dark band in the first metre or so
around a building's foot, where the sky's ambient light cannot reach. Three
mechanisms produce it, and the industry uses them **together**, not instead of
each other: baked ambient occlusion in the mesh's own material handles
texture-scale crevice detail, a screen-space pass adds dynamic object-scale
contact darkening at runtime **[doc]**
([AO overview](https://craftpbr.com/guides/what-is-an-ambient-occlusion-map),
[GTAO/HBAO+ summary](https://garagefarm.net/blog/ambient-occlusion-realism-through-shadows)),
and a world-space method fills the gap the screen-space pass cannot.

The gap is the point. SSAO is purely screen-space: geometry off-screen or beyond
the frame edge cannot occlude, it has no data about hidden or back-facing
surfaces, and its cost scales with resolution rather than scene complexity —
which makes large-radius occlusion in an open outdoor scene its worst case
**[doc]** ([Unity HDRP AO](https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.5/manual/Override-Ambient-Occlusion.html),
[LearnOpenGL SSAO](https://learnopengl.com/Advanced-Lighting/SSAO)). A building's
foot is exactly the case it handles badly: the occluder is a large static, the
radius wanted is a metre or more, and much of the occluding volume is behind the
visible surface. Unreal's answer is **Distance Field AO** — precomputed signed
distance fields per rigid mesh giving world-space medium-scale occlusion,
explicitly built to avoid the off-screen and edge artefacts, with the caveat that
very large static meshes get lower quality because one volume texture is
stretched over a big object **[doc]**
([UE5 DFAO](https://dev.epicgames.com/documentation/unreal-engine/distance-field-ambient-occlusion-in-unreal-engine),
[mesh distance field properties](https://dev.epicgames.com/documentation/unreal-engine/mesh-distance-fields-properties-in-unreal-engine)).
Distance-field soft shadows are the companion: sharp at the contact point,
softening with distance from the caster **[doc]**
([UE5 DF soft shadows](https://dev.epicgames.com/documentation/en-us/unreal-engine/distance-field-soft-shadows-in-unreal-engine)).

**In our stack.** Neither DFAO nor a full GTAO pass is proportionate: the studio
has no deferred G-buffer and the province already spends its budget on
vegetation and water. The cheap, cascade-independent equivalent is a **compiler-baked
contact-AO ring in the terrain vertex colours**. The settlement compile already
emits a footprint polygon as data (siting research §4, step 4); rasterise a signed
distance from that polygon out to ~1.5 m into a per-chunk vertex attribute, and
multiply the ground material's ambient term by it. Cost: one extra float attribute
on terrain vertices inside settlement chunks, zero per-frame cost, and no material
patch to be clobbered. It is authored in the compiler (`compile_settlement.py`)
and consumed in `groundMaterial.ts`.

The alternative — a decal or gradient mesh skirt sitting on the ground around each
building — is a technique this research pass could **not** confirm as named period
practice in any of the four target engines **[spec]**; it is a widely used general
convention. It is also the CSM-blackout shape that flora cards already hit
(round 4). Prefer the vertex-attribute route; keep the skirt mesh as a fallback for
kit pieces whose footprint is too complex to rasterise at 1.83 m.

### 2.2 The band of local ground texture at the base

Bethesda's own mechanism has two halves. Terrain texture is hand- or
rule-painted: the Creation Kit's Region system auto-paints ground textures by
density, slope and height rules, so dirt and mud around structures is generated
rather than hand-daubed **[doc]** ([region generation writeup](http://hoddminir.blogspot.com/2021/02/region-generation-part-i-landscape.html)).
On top of that sit dedicated **blend statics** that taper an object's or road's
edge geometry down into the terrain so the join is not a hard, floating edge.
That such blend meshes exist is well attested in Creation Engine practice; the
literal internal names (`RoadBlend`, `LandscapeBlend`) are community terminology
and are **[spec]** here, not sourced from Bethesda. That vanilla's blend meshes
and splat painting were felt insufficient is itself evidence: *Terrain Blending —
Community Shaders* exists to add a **real-time shader blend** between an object's
base and the landscape in Skyrim SE **[doc]**
([Nexus 157076](https://www.nexusmods.com/skyrimspecialedition/mods/157076?tab=files)).

**In our stack.** Two layers, at two scales.

*Coarse (district and yard).* Repaint `ground-control.png`'s red channel over
settlement footprints and their yards with a trodden/built land-cover id, in the
settlement compile. This is a raster the studio already loads once per session
and samples CPU-side (`Groundcover.tsx`), and it already drives both the ground
splat material and groundcover species choice — so one repaint delivers the
texture band *and* the grass exclusion of §2.3 in one edit. The constraint is
resolution: **1.83 m per texel**, so this layer is honest for a courtyard, a
threshold yard or a village common, and dishonest for a 0.6 m band at a wall.

*Fine (the wall foot).* At 0.6–1.5 m the band has to be geometry or a decal. Our
renderer has no deferred decal pass, so the practical form is a thin skirt ring
generated with the footprint polygon, textured with a dirt/moss material, and
**offset a small tested distance above the terrain rather than made coplanar** —
the production-standard fix, because true coplanarity cannot be resolved by depth
precision at all, and depth bias must scale with surface slope
(`m * SlopeScaleDepthBias + DepthBias`) rather than being constant **[doc]**
([D3D depth bias](https://learn.microsoft.com/en-us/windows/win32/direct3d9/depth-bias),
[polycount Z-fighting](http://wiki.polycount.com/wiki/Z-Fighting),
[practical offset discussion](https://gamedev.net/forums/topic/450278-how-to-solve-z-fighting/)).
Depth precision degrades with distance from the near plane, so the skirt must
also be dropped from the far LOD tiers, where it will flicker.

### 2.3 Grass and foliage at the foundation

Two distinct requirements, and the second is the one that bites.

*Exclusion.* Grass through a floor is a documented Creation Engine failure class.
Skyrim's grass is precomputed into a **grass cache**, and any landscape or load-order
change without regenerating it produces floating or clipped grass, including grass
inside object footprints — hence the dedicated *Grass Cache Fixes* and *Landscape
Fixes For Grass Mods* **[doc]**
([60891](https://www.nexusmods.com/skyrimspecialedition/mods/60891),
[9005](https://www.nexusmods.com/skyrimspecialedition/mods/9005)). The transferable
detail is in *No Grass In Objects*, which notes that a wide grass mesh can still
poke through a floor if its **placement origin** is not inside the blocked area —
i.e. exclusion is tested per mesh origin, not per footprint volume **[doc]**
([42161](https://www.nexusmods.com/skyrimspecialedition/mods/42161)).

**In our stack** this is nearly free and must not be got wrong: `Groundcover.tsx`
generates its ring at runtime from the land-cover raster, so the §2.2 repaint
already excludes grass — *provided* the exclusion is tested against the instance
origin **plus the species' own radius**, not the origin alone. Our T3 species
include 1–2 m ferns whose origin can sit 1 m outside a footprint with fronds
inside it. There is at present **no exclusion mask in `Groundcover.tsx` at all**;
adding one is Round B work.

*Clustering.* The complement — weeds and rubble deliberately gathered at the wall
foot, breaking the hard vertical/horizontal join — is standard environment-art
practice but could **not** be confirmed as a named period pipeline step **[spec]**.
It is also the thing our compiler is best equipped to do: the T2 scatter already
places clump centres with members around them, already stamps clearance, and
already has a `coast_m`-style signed-distance gate. A signed distance to the
footprint polygon is the same mechanism, with the gain peaking in the 0–1.2 m
band outside the wall and going to zero inside it.

### 2.4 LOD for architecture

Bethesda generates object LOD as reduced 3D `_lod.nif` meshes under
`Meshes\Terrain\[WORLDSPACE]\Objects\`, at LOD levels 4, 8 and 16 (4×4, 8×8,
16×16 cell groupings); level 32 does not exist in vanilla. Only the largest and
most important objects receive a level-16 model, and requesting a level with no
matching model renders **nothing** — a real LOD-gap failure mode. Some vanilla
objects ship distinct `_lod_0/_lod_1/_lod_2` variants per band rather than one
simplified mesh reused everywhere **[doc]**
([DynDOLOD Object LOD](https://dyndolod.info/Help/Object-LOD)). TexGen builds the
reduced textures and stitches them into a shared **LOD atlas**, so a distant
cell's worth of LOD geometry renders in very few draws **[doc]**
([TexGen](https://dyndolod.info/Help/TexGen)). Buildings keep 3D silhouettes at
distance where trees fall back to billboards, because a wrong building silhouette
reads as wrong far more readily than a flattened canopy **[doc]**
([DynDOLOD reference](https://dyndolod.info/DynDOLOD-Reference)).

The failure mode to design against is the one the siting research already names:
**one authority per building** for whether the full model or the LOD is drawn, at
one distance. Where two systems can disagree, the artefacts are flicker, LOD that
never unloads, and popping — still a live, reported class of bug **[doc]**
([STEP forum](https://stepmodifications.org/forum/topic/21145-dyndolod-dragonsreach-and-other-buildings-windows-glow-lods-switch-off-too-soon/)).

**In our stack**, the tier ladder is `floraKit.lodDistances`'s shape with
architecture's numbers: full mesh → light decimation → heavy decimation → a
merged per-settlement far mesh. Three-tier decimation with absolute triangle
floors, LOD generated from final placed transforms after grading, atlas exempted
from the general texture cap, and the swap distance placed where §2.7's haze
already hides it. Reuse the vegetation bucketing (asset, LOD) across chunks.

### 2.5 Shadows

Cascaded shadow maps split the frustum so the near cascade gives the foundation
— where grounding matters most — the highest texel density **[doc]**
([CSM overview](https://alextardif.com/shadowmapping.html)). Two artefacts sit on
either side of the bias setting: **acne** (depth-precision self-shadowing, fixed
with a *slope-scale* bias, since a constant bias is insufficient wherever the
surface is steep relative to the light) and **peter-panning** (over-correction
that visibly detaches the shadow from the caster's base — precisely the artefact
that makes a foundation look as though it floats above its own shadow) **[doc]**
([LearnOpenGL shadow mapping](https://learnopengl.com/Advanced-Lighting/Shadows/Shadow-Mapping)).
Front-face culling in the shadow pass mitigates acne, but only for closed
volumes — not for thin or open terrain meshes. Fitting cascade Z-bounds to
open-world terrain trades clipping distant casters against depth precision
**[doc]** (same source).

**In our stack.** `WorldSky.tsx` owns the CSM. Three rules: give the graded pad a
residual 0.5–1° tilt rather than mathematical flatness; check that no cascade
split boundary lands inside a settlement; and confirm buildings and their LOD both
cast and receive on the same tiers, because flora already needed
`castShadow = level <= 1` and `receiveShadow = !isCard` decided per tier. Whether
any of the four target games coordinated shadow distance against LOD distance
explicitly could not be sourced **[spec]**, but the artefact is real and cheap to
test: a building whose shadow vanishes before its LOD swaps un-grounds itself.

### 2.6 Wetness on walls and roofs

The honest position is that the four target engines' wetness algorithms are not
publicly documented at the level wanted. What is attestable: The Witcher 3 has a
well-known bug where Geralt's face stays dry while his body and armour wet,
implying a mask-based "is this surface exposed" system imperfectly applied per
body part; NPCs indoors were reported getting wet; and mod descriptions imply a
few seconds' wetness decay after an interior transition, consistent with an
exposure-timer/mask implementation **[doc]**
([Dynamic Wet Face](https://www.nexusmods.com/witcher3/mods/4902),
[Too Wet Geralt](https://www.nexusmods.com/witcher3/mods/11753),
[forum report](https://gamefaqs.gamespot.com/boards/702760-the-witcher-3-wild-hunt/76194567)).
RDR2's per-surface wetness and rain-occlusion masking could **not** be sourced at
all beyond a general RAGE weather description **[spec]**. The top-down rain-depth
occlusion map is the industry-standard way to make eaves keep the ground beneath
them dry, and our own backlog already carries it (Lagarde; polish-backlog, 8c
deferral, explicitly *"needs placed canopy/buildings to occlude under"*) — but
attributing it to CDPR or Rockstar specifically is unsupported.

**In our stack.** `apps/world-studio/src/water/groundWetness.ts` already exports
`wetnessUniforms` and `applyShoreWetness(material)`; the weather system already
publishes `windDirXZ`/`windSpeedMS` that `windSway.ts` consumes. Round B's
proportionate scope is a **roughness/albedo darkening driven by the weather
system's rain intensity**, applied to building materials through the same
userData + `reapplyX` + cache-key-suffix contract as §1's CSM row demands, with a
height term measured from the ground line so wall feet stay damp longest. The
rain-occlusion depth map stays where it is, in the polish backlog.

### 2.7 Fading with the haze

Not a treatment the sources name, but the defect our own history names twice
(rounds 2–4): a distant object that does not receive the same aerial perspective
as the terrain reads as pasted on. `aerial.ts` exports
`applyAerialPerspective` and the GLSL blocks; `WorldSky`'s `patchScene`
re-applies the inscatter authority **after** `csm.setupMaterial`. Every building
tier goes through the same path, and the LOD swap distance is chosen so the swap
happens inside the haze.

### 2.8 Culling, portals and doors

The Witcher 3 used **Umbra 3** for automated visibility and streaming — occluders
generated automatically, removing the need for hand-placed portal volumes; CD
Projekt Red and Umbra gave a joint GDC talk on it **[doc]**
([GDC Vault](https://www.gdcvault.com/play/1020231/Solving-Visibility-and-Streaming-in)).
Unreal ships no classic room/portal system, relying on Cull Distance Volumes plus
frustum culling **[doc]**
([UE5 visibility and occlusion](https://dev.epicgames.com/documentation/en-us/unreal-engine/visibility-and-occlusion-culling-in-unreal-engine)).
Classic portal culling — a visible doorway becoming a clipping-plane portal,
recursing through chains — is the baseline technique **[doc]**
([explainer](https://gamedev.net/forums/topic/703572-portal-occlusion-culling-help/)).
That Skyrim and Fallout 4 use separate interior cells joined by load doors is
common modder knowledge but was not confirmed from a primary Bethesda source in
this pass **[spec]**.

**In our stack**, the interior is a separate scene; what matters at compile time
is the siting research's rule — the exterior door transform, the interior arrival
marker and the navmesh on both sides are **three pieces of data emitted
together**. `blueprint.py` already validates doorway bearings against the mesh's
real sides after yaw, so a door cannot be claimed on a blank wall; Round B extends
that to emitting the arrival marker alongside.

### 2.9 Navmesh cutting

Skyrim originated navmesh-cutting primitives — invisible shapes that cut the
walkable mesh only when the associated object is disabled or removed. Fallout 4
inherits this as **precuts** (hot-pink in the CK, created via "Link Precuts for
Selection", inactive while the linked static exists), with the automated batch
options explicitly warned against as unreliable. Statics additionally carry an
**Obstacle** flag controlling whether the engine consults their NAVCUT data at
all, plus navmesh-generation import options and collision settings that stop
auto-generated navmesh intersecting the object **[doc]**
([FO4 navmesh resources](https://www.nexusmods.com/fallout4/articles/4209),
[CK wiki: Static](https://falloutck.uesp.net/w/index.php?title=Static&veaction=edit&section=2&mobileaction=toggle_view_desktop),
[navmesh cut history](https://fallout.wiki/wiki/Resource:Creative_Family_Wiki/Navmesh)).
The system is fragile in production — FO4 workshop navcuts leak across interior
cells, needing a dedicated fix mod **[doc]**
([72904](https://www.nexusmods.com/fallout4/mods/72904)).

**In our stack** the transferable rules are ordering and authority: grade → roads
→ navmesh → vegetation → materials → LOD (siting research §4.4), the footprint
polygon is the cut, and the cut is emitted by the same compile pass that emits
the pad, never inferred later.

### 2.10 Night windows, wall grime, roof edges

DynDOLOD generates a dedicated **Windows Glow** object LOD so lit buildings read
at long range without extending `uGrids` (which would force full simulation of
everything in the wider radius) **[doc]**
([DynDOLOD](https://www.nexusmods.com/skyrim/mods/59721)). Its documented live bug
is the one to design against: windows-glow LOD switching off before the
full-detail model with its own lit windows fades in, producing a pop from lit
silhouette to unlit **[doc]** ([STEP forum](https://stepmodifications.org/forum/topic/21145-dyndolod-dragonsreach-and-other-buildings-windows-glow-lods-switch-off-too-soon/)).
**In our stack**: an emissive window plane per building keyed to the world clock
(`GAME_TIME_SCALE`, decision 0016) and present on **every** tier, with the same
one-authority rule as the mesh.

For wall grime, the attested production workflow is: base wall texture → vertex-painted
damage masking → dirt streaks applied via a **World Aligned Texture**, so wear reads
consistently regardless of the mesh's own UVs (valuable across a varied kit) →
separate decals for drips and localised grime, rather than baking all weathering
into the base material **[doc]**
([Polycount breakdown](https://polycount.com/discussion/237462/creating-assets-for-an-elden-ring-inspired-location-roundtable-hold-fan-art)).
Base-of-wall dirt decals are a standard commercial asset category, which confirms
the convention **[doc]** ([TextureCan](https://www.texturecan.com/details/333/)).
World-aligned dirt is a shader patch and therefore subject to the CSM clobber
contract. Roof-edge treatment and silhouette breakup as named studio rules could
not be sourced **[spec]**; under the no-new-art rule they are in any case a
*sourcing and arrangement* question, not a shading one.

### 2.11 Floating and sunk QA

The Creation Kit workflow the owner asked about is real and tool-supported:
statics have no ground snap, so placement is corrected by editing X/Y/Z and
rotation in the Reference dialog; the CK's **Warnings** window flags ground and
object clipping as part of validation; and the Landscape Edit tools ship
**Flatten Vertices**, **Soften** and **Flatten Border** — literally
flatten-then-blend-then-place **[doc]**
([FO4 CK: Landscape Edit](https://falloutck.uesp.net/w/index.php?title=Landscape_Edit&mobileaction=toggle_view_desktop)).
A formal "raycast at every corner" heuristic and any specific numeric bury depth
could **not** be sourced **[spec]** — our own ≥0.25 m figure comes from the siting
research's inference, not from documented Bethesda practice, and should be treated
as a starting value to be tuned by eye.

The automatable form for us is a compile-time probe, in the spirit of
`clark_evans` and `vet_kit`: for every placed reference, sample the streamed
terrain at every footprint perimeter vertex and report `max(gap)` and
`min(bury)`. A positive gap anywhere is a float; a bury greater than the class cap
is a sunk building. Report per settlement, fail the compile above a threshold.

---

## 3. Round B requirements checklist

Yes/no items the compiler and the renderer must satisfy **before the owner walks
a place**. Anything answered "no" is either fixed or explicitly listed in the
hand-off as a known gap.

**Anchoring and ground fit**
1. Every parcel is classified by footprint height range Δ into plinth / graded pad / stilt / re-site, per the siting research §4.3 ladder, and the class is recorded on the record.
2. Bury depth is per ground-fit class and per asset (measured off the mesh), with a slope term — not one global constant.
3. Anchor mode is declared per kit asset in the manifest and consumed by the renderer; the renderer re-grounds from the **streamed** terrain, not the compile raster.
4. The perimeter probe reports zero positive gaps and no bury above the class cap, per settlement.
5. Buildings take yaw only; the pad, not the building, carries the residual tilt. Parcel yaw carries authored jitter (no all-90° villages).

**LOD**
6. Three decimation tiers plus a merged far mesh, with an **absolute** triangle floor, and mesh reach scaled by footprint diagonal.
7. LOD generated from **final placed transforms, after grading**; silhouettes compared against the full mesh from one camera.
8. Exactly **one authority** decides full-vs-LOD per building, at one distance; landmarks have a far tier (missing tier = compile error).
9. LOD atlas exempt from the general texture cap; kit vet reports zero untextured primitives.
10. Bucketing is by (asset, LOD) across the settlement, not per chunk.

**Atmosphere and light**
11. Every tier, LOD included, is patched by `applyAerialPerspective`, and the LOD swap sits inside the haze.
12. Every shader patch follows the `windSway` contract: `material.userData` state, exported `reapplyX`, called from `patchScene` after `csm.setupMaterial`, chained `customProgramCacheKey`.
13. Colour and `customDepthMaterial` are patched from one call site with one shared uniform block.
14. Pads carry a 0.5–1° residual tilt; no cascade split boundary falls inside a settlement; cast/receive decided per tier and checked at low sun.
15. Contact AO exists at the base: a footprint signed-distance ring in the terrain ambient term, out to ~1.5 m.
16. Wetness responds to rain on walls and roofs, height-keyed from the **ground line**.
17. Night windows glow on **every** tier, keyed to the world clock, with one authority.

**Ground and dressing**
18. Ground control is repainted over footprints and yards with a trodden/built class (texel scale derived from the image's own size; 1.83 m/texel today).
19. A fine base skirt exists at 0.6–1.5 m as offset geometry, dropped from the far tiers, with no z-fighting at any distance.
20. Groundcover exclusion exists and is tested against instance origin **plus species radius**, not origin alone.
21. A foundation clutter/foliage ring is scattered on a signed distance to the footprint, peaking 0–1.2 m outside the wall and zero inside it.

**Physics, navigation and interiors**
22. Building colliders use a **versioned collision frame**; the runtime refuses untagged kits.
23. Collision is fitted per part to the visible volume; buried portions generate no standable ledge.
24. The collider budget is counted in colliders with an honest covered radius and a proportional rebuild trigger; inside a settlement footprint, colliders are static and chunk-resident.
25. Body management is imperative diffing, not per-reference React components.
26. Navmesh is cut by the footprint polygon, in the order grade → roads → navmesh → vegetation → materials → LOD; pad rim slope ≤ 30°; stilt decks have both deck navmesh and a link to ground.
27. Door transform, interior arrival marker and navmesh on both sides are emitted **together**; doorway bearings validate against the real mesh sides after yaw.

**Process**
28. Rasters are written atomically; a killed run leaves no half-written output.
29. The hand-off asks the owner for an **FPS read** at a named coordinate inside the settlement, on all three quality settings.
30. `render_sheet` has been run over the building kits and the assets were chosen on the rendered geometry, not on names.

---

## 4. Open questions for the owner

Items the research pass could **not** confirm as genuine mid-2010s practice, or
that are taste calls rather than technical ones.

1. **The AO skirt.** No citable source describes a discrete "AO skirt decal mesh"
   at a building's foot as a named technique in Creation Engine, REDengine, RAGE
   or Unreal of that era. The effect is real and the general convention exists;
   the specific implementation is our choice. §2.1 recommends the terrain
   vertex-attribute route as the cheaper and less fragile one — a steer on how
   strong and how wide the band should read is a taste call the owner should make
   on a rendered frame.
2. **Blend-mesh naming.** `RoadBlend`/`LandscapeBlend` are community terminology,
   not a sourced Bethesda naming convention. It does not change what is built.
3. **Weed and rubble rings at wall bases.** Standard environment-art practice, not
   confirmed as a named period pipeline step. It is also the item most likely to
   cost frame time, since it multiplies scatter instances exactly where the
   building instances are densest. Worth a steer on whether to ship it in Round B
   or defer it.
4. **Shadow distance against LOD distance.** No period-specific source describes
   how the four target games coordinated these. The artefact is real; the fix is
   ours to tune.
5. **Wetness algorithms.** Neither RDR2's per-surface wetness nor The Witcher 3's
   "dry under eaves" implementation could be sourced technically. The top-down
   rain-occlusion depth map is the industry-standard answer and is already in the
   polish backlog. Question for the owner: does Round B ship flat rain-darkening
   on buildings now, with the occlusion map at Phase P, or wait and do both once?
6. **Interior transitions.** That Skyrim and Fallout 4 use separate cells and load
   doors rather than portal-culled seamless interiors is modder common knowledge
   with no primary citation found. Our seam is already decided (interior as a
   separate scene); no action.
7. **Roof edges and silhouette breakup** could not be sourced as named studio
   rules. Under the no-new-art rule these are sourcing and arrangement questions
   anyway.
8. **Bury depth numbers.** No documented figure exists. The ≥0.25 m in the siting
   research is our own inference. Expect to tune it by eye on the exemplar.
9. **Scope.** Items 15, 19, 21 and 16 of the §3 checklist (contact AO, base skirt,
   clutter ring, wetness) are the four that are *new systems* rather than
   applications of an existing one. If Round B must be narrowed, they are the
   candidates, and the recommended order to keep is contact AO first (largest read
   per unit of cost), then the ground-control repaint, then the clutter ring, then
   wetness.

---

## Related

- Siting, grading, plinths, stilts, draw calls, navmesh ordering, the DynDOLOD large-reference trap: [openworld-place-distribution-and-siting.md](../placement-settlements/openworld-place-distribution-and-siting.md) §4–5
- Approach, reveal and the pre-Round-A checklist: [openworld-approach-and-wayfinding.md](../placement-settlements/openworld-approach-and-wayfinding.md)
- The vegetation defect history in full: [decision 0036](../../decisions/0036-phase10-placement-decisions.md)
- Instancing and LOD technique verdicts: [vegetation-scatter-instancing-threejs.md](vegetation-scatter-instancing-threejs.md)
- Haze, CSM and the patch chain: [natural-light-sky-atmosphere-threejs.md](natural-light-sky-atmosphere-threejs.md), decision [0032](../../decisions/0032-phase8c-weather-implementation-shape.md)
- Wetness and shore materials: decision [0025](../../decisions/0025-phase8b-water-implementation-shape.md)
- Binding placement rules: [world/97](../../world/97-placement-principles.md); the blueprint schema: `tooling/world-generation/worldgen/blueprint.py`

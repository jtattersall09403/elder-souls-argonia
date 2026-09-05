# Distributing and siting places in an open world — pull, distinctiveness, POI recipes, and building on slopes

**What this doc is for.** Phase 11 places *things people made* on a real
heightfield: settlements, camps, ruins, shrines, wrecks, waystations. This doc
covers the four questions that were not already answered elsewhere in
`docs/research/`:

1. how shipped open worlds *distribute* content and make you want to walk to it,
2. how they keep regions distinct from each other and varied within themselves,
3. what the recurring *recipe* is for each common wilderness place-type, and
4. **how buildings actually sit on non-flat ground** — the gotcha that will bite
   an agent-built placement compiler hardest.

**Already covered, do not duplicate:**

| Question | Live doc |
|---|---|
| How many POIs, how many quests, what density budget | [morrowind-content-density.md](morrowind-content-density.md) |
| Kit anatomy, snap grids, footprints, kit-bashing, village layout *algorithms* | [kit-level-design-and-layout-generation.md](kit-level-design-and-layout-generation.md) |
| Measured snap modules, chamber sizes, clutter counts, building spacing | [mined-interior-assembly-and-settlement-form.md](mined-interior-assembly-and-settlement-form.md) |
| Real-world marsh settlement siting, forms, archetype menu | [marsh-settlement-morphology.md](marsh-settlement-morphology.md) |
| Vegetation macro→meso→micro placement, clumping, waterline rules | [openworld-vegetation-placement-architecture.md](../vegetation/openworld-vegetation-placement-architecture.md), [shipped-world-placement-rules.md](shipped-world-placement-rules.md), [vegetation-density-design.md](../vegetation/vegetation-density-design.md) |
| Ruin taphonomy, Xanmeer form | [xanmeer-mesoamerican-reference.md](xanmeer-mesoamerican-reference.md) |
| Rewards, loot tiers, faction payoffs | [tes-quest-and-faction-rewards.md](../quests-and-cast/tes-quest-and-faction-rewards.md) |

Everything below is new material or a numeric derivation not stated elsewhere.

Evidence tags: **[doc]** = developer-authored/translated primary source;
**[lore]** = credible secondary analysis or community measurement; **[inf]** =
our inference.

---

## 1. Distribution: how much, how far apart, and how you're pulled there

### 1.1 The numbers, with the spacing maths done

Densities are only useful once converted into *pitch* (how far apart things
land) and *time* (how long the player walks between them). For a target density
`d` places/km², a jittered-grid layout has pitch `p = 1/√d` km; a Poisson-random
scatter has mean nearest-neighbour distance `≈ 0.5/√d` km. At our on-foot run
speed (~3.5 m/s) time-between-interest `t = p / 3.5`.

| World | Area | Content | Density | Pitch | Time on foot |
|---|---|---|---|---|---|
| Skyrim | 119×94 cells = 6.96×5.50 km ≈ **38 km²** [lore — cell counts widely reproduced; 1 cell = 4096 units = 58.5 m, see kit doc §1.2] | ~343 map-marked locations | **~9 /km²** | **~330 m** | **~95 s** |
| Skyrim (+ unmarked) | as above | ~200+ unmarked places catalogued by [UESP:Unmarked Places](https://en.uesp.net/wiki/Skyrim:Unmarked_Places) | ~14 /km² | ~265 m | ~75 s |
| BotW | ~9×6.8 km ≈ **61 km²** [lore — community measurement, no official figure; [TweakTown](https://www.tweaktown.com/news/55963/zelda-breath-wilds-hyrule-bigger-skyrim/index.html)] | 120 shrines | ~2 /km² | ~715 m | ~3.5 min |
| BotW | as above | 900 Korok seeds | **~15 /km²** | ~260 m | ~75 s |
| Vvardenfell | see [morrowind-content-density.md](morrowind-content-density.md) | — | ~18 /km² | ~235 m | ~65 s |

Two things fall out and they are the load-bearing findings of this section:

- **Every one of these worlds converges on roughly one "something" every 60–100
  seconds of travel** — Skyrim's marked+unmarked mix, BotW's Korok layer, and
  Vvardenfell's POI count all land at 230–330 m pitch. That is the real
  constant, not the POI count.
- **The tiers are separate populations with wildly different pitch.** BotW's
  *destination* tier (shrines) is 3× coarser than its *snack* tier (Koroks).
  Skyrim does the same thing with marked vs unmarked. A single "POI density"
  number is therefore a design error: you need at least three ladders (§1.4).

Caveats worth recording: Skyrim's 38 km² includes unplayable border regions —
sceptics put the walkable area under ~19 km², which would *double* every Skyrim
density above [lore — contested in community threads]. BotW's area estimate has
a 6× spread in circulation (61 km² vs a pre-launch 360 km² claim). Treat these
as order-of-magnitude anchors and prefer Morrowind's mined numbers, which we
derived ourselves, as the binding budget.

### 1.2 BotW: the triangle rule, and "gravity"

Source: CEDEC 2017, "Field Level Design in *The Legend of Zelda: Breath of the
Wild*", Hidemaro Fujibayashi & Makoto Yonezu, translated by Matt Walker
([gist mirror](https://gist.github.com/idbrii/e39fe96279aa1670319bfa521d907399),
[Medium thread](https://medium.com/@gypsyOtoko/this-is-a-reposting-of-my-twitter-thread-summarizing-articles-written-about-the-cedec-botw-dev-266c34fd30e8));
analysis in [Radiator Blog, "Open world level design: spatial composition and
flow in BotW"](https://www.blog.radiator.debacle.us/2017/10/open-world-level-design-spatial.html).

- **The triangle is the atom of the field.** A triangular/pyramidal mass gives
  the player a binary choice at a glance — *over it* or *around it* — and it
  occludes what is behind it, so the world reveals itself in stages. Rectangles
  occlude *completely*; triangles occlude *gradually*. That gradient is the
  point. **[doc]**
- **Three explicit size tiers, deployed everywhere, all the time:** large =
  landmarks visible across the map for orientation; medium = sightline blockers
  that hide the next thing; small = tempo control, changing what the player is
  doing minute to minute. "Clear differences and contrasts between each scale
  level are important" — muddled scale reads as noise. **[doc]**
- **No straight A→B.** Critical paths curve and meander so the destination is
  never continuously visible; the same landmark is rediscovered several times on
  approach. **[doc]**
- **Chained reveal.** The documented worked example: cresting a hill reveals a
  bridge; the bridge itself hides a distant tower; the tower's approach reveals
  the castle behind a rock mass. The player always holds 2–3 candidate goals,
  never a wall of them. **[doc]**
- **"Gravity" replaced linearity.** Towers were originally used to *enforce* an
  order and playtesting showed players felt guided and the world felt too
  linear. Heat maps showed traffic concentrated on a few corridors with whole
  regions untouched. The fix was to scatter structures of *varying visibility
  and importance* so several pulls compete at once and being sidetracked is the
  default state. The second heat map showed the distribution had evened out.
  **[doc]**
- **[inf] The heat map is the acceptance test, not the design.** Nintendo did
  not compute a spacing rule; they placed, measured coverage, and re-placed. Our
  equivalent is cheap and we should build it: rasterise "what can a player see
  and want from here" over the province and look for dead zones. See §7.

### 1.3 Morrowind: distribution without markers

Sources: community/design analyses collected around [CBR on marker-free
design](https://www.cbr.com/bethesda-elder-scrolls-morrowind-games-without-quest-markers/)
and [Unmapped Worlds, "Map markers and the joy of getting
lost"](https://unmappedworlds.com/posts/map-markers-and-the-joy-of-getting-lost/).

- Direction is **diegetic and layered**: journal text from dialogue topics,
  signposts on every road, labelled buildings, NPCs who can be asked, books and
  notes. Directions are landmark- and cardinal-based ("follow the coast to the
  rock cairn, then inland"), rarely distance-quantified. **[lore]**
- Because there is no marker, **the landmark set has to be nameable**. A route
  description is only usable if the things along it are distinct enough to be
  described in one clause. This is a hard constraint on §2: regional
  distinctiveness is not decoration in a marker-free game, it is the navigation
  system.
- Transport (silt striders, boats, Mages Guild) is itself content: choosing a
  route through a network is remembered as exploration. **[lore]**
- **[inf] Consequence for us.** Every place we author needs a one-clause
  describable *approach cue* recorded as data (`approach_cue: "reed causeway on
  the south bank, three carved posts"`), because quest direction text, sign
  posts and NPC dialogue all have to be generated from it later. Retrofitting
  approach cues after placement is far more expensive than emitting them at
  placement time.

### 1.4 The pull/attention economy, as rules we can implement

Synthesised from the above; **[inf]** unless tagged.

1. **Three place tiers with separate densities.** *Beacon* (visible >1 km,
   silhouette-defining, ~0.1–0.3/km²), *destination* (a place you enter and
   spend 5–20 min in, ~1–2/km²), *snack* (10–60 s: a corpse, a cairn, a wreck,
   a shrine, a chest under a flag, ~10–15/km²). Only the snack tier is dense
   enough to fill the 60–100 s constant from §1.1.
2. **Two-visible rule.** From any point on a road or shoreline, at least one
   destination-tier or beacon-tier object should be visible, and never more than
   three. Zero = dead world; four+ = a chore list. This is our implementable
   reading of "gravity" plus the chained reveal.
3. **Occlude on purpose.** A destination should be visible, lost behind terrain
   during the approach, and re-revealed at least once. If a POI is continuously
   visible from first sighting to arrival, the walk is dead time.
4. **Effort must be paid.** BotW's rule of thumb — anything that costs a
   noticeable climb, swim or detour gets a reward *at the top of it*. A summit,
   an island, a cave mouth behind a waterfall: never empty.
5. **Never place on the straight line.** If a POI sits exactly on the geodesic
   between two settlements it stops being a discovery and becomes a toll booth.
   Offset by a sightline, not by a distance.
6. **The snack tier is where variety is cheapest and repetition is most
   punishing.** It is also what agents will be tempted to mass-produce. See §6.

---

## 2. Regional distinctiveness, and variety within a region

### 2.1 What actually differentiates regions

Compiled from [The Level Design Book — Environment
Art](https://book.leveldesignbook.com/process/env-art), [80.lv interview with a
Skyrim environment artist](https://80.lv/articles/building-open-worlds-with-skyrim-envir-artist),
and the [GDC Art Direction Summit: "Building a Visual Identity"](https://gdcvault.com/play/1028954/Art-Direction-Summit-Building-a).
All **[lore]** except where marked.

A region reads as *itself* when several independent channels agree. In rough
order of how far away they work:

| Range | Channel | What varies |
|---|---|---|
| 2–10 km | **Terrain silhouette** | mountain vs mesa vs flat; the triangle-tier profile |
| 1–5 km | **Sky/haze/light tint** | fog colour and density, sun angle bias, wetness |
| 0.5–2 km | **Canopy silhouette and height** | already owned by [vegetation-composition-rules.md](../vegetation/vegetation-composition-rules.md) |
| 0.2–1 km | **Landmark type** | what the region's beacon-tier object *is* (a ziggurat vs a lighthouse vs a hanging village) |
| 50–300 m | **Architectural grammar** | roof pitch, material, storey count, how a building meets the ground |
| 0–50 m | **Ground palette + clutter vocabulary** | see [skyrim-morrowind-landscape-texture-granularity.md](../rendering/skyrim-morrowind-landscape-texture-granularity.md) |

- **Colour is used as *meaning*, not just variety** — warm/golden for safe and
  settled, cool/desaturated for hostile or abandoned, per the standard
  environment-art framing. If our danger tiers and our regional palettes
  disagree, players will trust the colour.
- **Uniqueness is a finite resource.** The Level Design Book's Valorant case
  study makes the rule explicit: the hero landmark is used *once across the
  entire map*, and its base is deliberately kept free of competing silhouettes
  so it reads clean. A "signature feature" repeated three times is no longer a
  signature.
- **Callouts are the test.** If players (or our own quest text) cannot give a
  short memorable nickname to a place, it does not have identity.
- **Silhouette check at thumbnail size.** Environment artists return to
  thumbnails after every detail pass and ask whether the composition still
  reads. **[inf]** Our mechanical equivalent: render each region's skyline from
  its main road at 128 px wide and diff regions pairwise — two regions whose
  128 px skylines are near-identical are not distinct, whatever the asset list
  says.

### 2.2 Variety *within* a region

The failure mode of a rules-based system is that a region becomes internally
uniform — one biome, one building type, one camp layout, repeated to the border.
Techniques the source games use **[lore/inf]**:

- **Sub-region grammar.** Each region gets 3–5 *sub-types* (e.g. for a marsh
  region: open reed flat / drowned forest / tidal channel mouth / limestone
  outcrop / cultivated levee). Every rule in the placement compiler keys off the
  sub-type, not the region.
- **One anomaly per region.** A deliberately off-grammar place — a foreign
  architectural style, an out-of-biome grove, a ruin from the wrong era. This is
  Bethesda's habit and it is what makes a region feel authored rather than
  generated. Budget exactly one or two; more and the grammar dissolves.
- **Vary meaning, not just dressing.** GDC 2013's kit lesson (see the kit doc
  §1.3) generalises: repetition is noticed fastest when the *same aesthetic
  always means the same gameplay*. Don't bind one enemy faction to one
  architecture set across the province.
- **Gradient, not partition.** Regional boundaries that coincide exactly with
  palette, architecture and fauna changes read as a level select screen. Offset
  each channel's transition by a few hundred metres so the change is felt before
  it is seen.

---

## 3. Place-type recipes

Sourced by reading how Bethesda actually built these: [UESP:Unmarked
Places](https://en.uesp.net/wiki/Skyrim:Unmarked_Places) (which is effectively
Bethesda's own taxonomy — Hostile / Creature / Camp / Caravan / Boat / Shrine /
House / Dragon mound / Ruin-monument / Loot-only), and worked examples including
[Wreck of the Winter War](https://en.uesp.net/wiki/Skyrim:Wreck_of_the_Winter_War)
and the Fandom camp pages (Skybound Underhang, Dawnstar shoreline, Helgen
Cliffs). All **[lore]**.

### 3.1 The universal five-part recipe

Every small Bethesda POI decomposes into the same five slots. **This is the
schema our authoring system should encode**:

1. **A long-range cue** — one readable-from-the-road signal: a smoke plume from
   a campfire, a flag on a pole, a broken mast, a lit brazier, a bird flock.
2. **A population** — small (2–5), usually with *one elevated ranged member*
   perched on a rock or platform. Verticality is the difficulty dial, not count.
3. **Domestic props that narrate** — bedrolls, cooking spit, a journal, a
   corpse. The prop choice characterises the occupants (a roasting skeever says
   "desperate" without a line of dialogue).
4. **A two-tier reward** — one *free* find that rewards looking (a skill book on
   a crate), plus one *gated* find that rewards a capability (a locked chest, a
   swim, a climb). Winter War stacks these: the skill book beside four lockpicks
   sits in front of an expert-locked chest.
5. **Optionally a satellite node** that resolves the first node's implied story
   — the Bear Hunter's Camp is empty and its Hunter's Journal points uphill to a
   cave where the hunters lie dead beside the bears. Two nodes, ~200–400 m
   apart, no quest attached. Winter War's satellite sits ~1170 ft (~360 m) NE:
   a skeleton, gold ingots, a dagger and a skill book under a flag on a pole.

Two structural notes: **subversion needs the formula to exist first** (Helgen
Cliffs reads as an abandoned camp and is a trap — that only lands because the
player has learned the honest version), and the **tiny POI is legitimate**.
Elden Ring's Groveside Cave is an antechamber, a wolf pack and a boss room; Edge
praised the *variation in duration* of encounters, not their length. Some
destinations should be over in 90 seconds.

### 3.2 Per-type deltas from the base recipe

**[inf]** — the recipe above plus the type-specific variation to encode:

| Type | Long-range cue | Layout rule | Signature reward |
|---|---|---|---|
| Bandit/pirate camp | smoke plume; palisade line | commands a route or a river bend; one elevated archer; loot cached away from the fire | gated chest; the goods are *stolen*, so they should match a nearby trade route |
| Fishing village | drying racks, boats, smoke; jetty line on water | linear along the waterline, not radial; boats outnumber houses | trade goods, a boat, local knowledge (a rumour) |
| Waystation / wayshrine | on the road, visible from both approaches | shelter + water + fire; deliberately safe | rest, a signpost, direction-giving (§1.3) |
| Watchtower | silhouette on a ridge; the cue *is* the building | one of a chain — must be visible from its neighbours or it is not a watch tower | the *view*: from the top, 2–3 new destinations become visible |
| Hermit dwelling | a single light or a thin smoke line, no path to it | hard to reach; approach cost is the gate | knowledge or a unique service, not loot |
| Shrine | small, high-contrast, often on a rise or spring head | a single focal object with cleared ground around it | a blessing/buff; offerings left by others imply a pilgrim traffic |
| Wreck | broken mast/hull above the waterline | wreck geometry *is* the level: planks laid as ramps between broken halves, partly flooded lower deck | tiered by depth and lock; something requiring the swim mechanic |
| Cave | a dark mouth framed by rock, visible from below | one entrance, one loop; short is fine | one reason to have come |
| Farm | cleared fields, fences, animal pens | the *clearing* is the cue; vegetation must be cut back to a hard edge | food, labour, a person who talks |
| Ruin | dominant silhouette, often the region's beacon | partly subsumed by terrain/vegetation — see [xanmeer-mesoamerican-reference.md](xanmeer-mesoamerican-reference.md) | the region's history, told without text |

**Telegraphing rule of thumb:** the cue must be visible from at least *one*
place the player is likely to be (road, river, ridge, shoreline), and that
sightline should be verified, not assumed. A camp whose smoke plume is behind a
hill is a camp that does not exist.

---

## 4. Buildings on uneven ground — the critical section

We place on a real heightfield with continuous terrain and no cell-level editor.
This is precisely where Bethesda's workflow is *manual* and ours cannot be.

### 4.1 What Bethesda actually does

Sources: [CK wiki: Landscape](https://ck.uesp.net/wiki/Landscape) and its
Landscape Editing tools, the [Fallout 4 CK wiki: Landscape
Edit](https://falloutck.uesp.net/w/index.php?title=Landscape_Edit),
[Vanilla Landscape Corrections](https://www.nexusmods.com/skyrimspecialedition/mods/104962)
(a mod whose entire purpose is cataloguing and fixing vanilla's object/terrain
gaps), and Nexus/Steam modding threads on house placement. **[doc/lore]**

**The honest answer: they flatten the terrain by hand, then hide what's left
with rocks.** In detail:

- **Grading is a brush.** *Flatten Vertices* raises everything within the brush
  radius to the terrain height under the cursor. *Edit Radius* and *Edit
  Falloff* control the pad size and how the pad blends outward. *Flatten Border*
  smooths the pad's rim. *Soften Vertices* is then run over the rim because a
  raw flatten produces "creases" — sharp corners and points that read as
  obviously artificial. **The two-step (flatten, then soften the rim) is the
  whole technique.**
- **Absolute Height / Raise-Lower To** let a pad be set to a numeric height
  rather than a sampled one — i.e. the pad height is authored, and it is the
  building's floor height.
- **Snapping is mandatory for the buildings, free for the terrain.** Kit pieces
  snap to a 128-unit grid at 45° (kit doc §1.2); the *terrain* is then deformed
  to meet them. The building is the fixed thing; the ground moves. That is the
  inversion an agent-built compiler must adopt.
- **Vanilla architecture sets ship dedicated base/skirt pieces** — search the
  Object Window for `WallBase`, `Foundation`, `Base` suffixes in the Whiterun /
  Solitude / Riften sets, plus `RockPile` / `DirtPile` / `SnowPile` clutter,
  which exist *for this job*.
- **Sink, don't float.** The standing modder rule: it is always correct to clip
  the base into the ground and never correct to leave a gap. "If a wall doesn't
  clip into the raised ground at the bottom, it will have a gap at the top." A
  building's Z is set from the *highest* terrain sample under its footprint, so
  the uphill side buries and the downhill side is what needs solving.
- **Design around the slope where possible.** Widely used in house mods:
  multi-storey buildings dug into a hillside so the lowest storey reads as a
  cellar with only one exposed face. This is cheaper and better-looking than
  grading a big pad.
- **Stilts/pillars on the downhill side** where the floor plate overhangs — a
  vertical support down to sampled terrain, so the overhang reads as
  *deliberate* rather than as a bug. Note this is exactly what a marsh culture
  would build anyway ([marsh-settlement-morphology.md](marsh-settlement-morphology.md)),
  so for us the engineering fix and the lore-correct answer coincide.

### 4.2 How the procedural world does it

From [SideFX Houdini heightfield docs](https://www.sidefx.com/docs/houdini/model/heightfields.html)
and [HeightField Flatten](https://www.sidefx.com/docs/houdini/nodes/sop/heightfield_flatten.html).
**[doc]**

- **Rasterise the footprint into a mask, then flatten to the mask's *average*
  height.** HeightField Flatten explicitly supports computing the mean height of
  the masked area and flattening to it — this is the automatic pad-height
  solution for a placement compiler that does not know the right height in
  advance. Mask value 0 = untouched, 1 = fully flat, so the mask's blur radius
  *is* the pad falloff. Same two-step as the CK, expressed as data.
- **HeightField Project** stamps terrain from a 3D mesh (the building's own
  base) — useful for berms and terraces.
- **Heightfields cannot represent verticals.** A pad edge is a *slope*, never a
  cliff. Anything that must be vertical (a retaining wall, a plinth face, a
  quay) has to be geometry placed on top of the graded terrain, not terrain.
  This is a hard constraint and the reason stilt/pillar generation belongs in
  polygon-land: ray-sample the terrain under each support point of the
  footprint, take the max for the floor plate, extrude a column down to each
  sampled ground point.
- **Suitability masking comes first**: mask by slope/height to find buildable
  ground, scatter footprints there, *then* grade. Grading should be a last
  resort correction of a few tens of centimetres, not the primary tool.

### 4.3 The prescriptive procedure for our compiler

**[inf]** — this is the recommended algorithm, per building:

1. **Sample** terrain height at the footprint's corners and at a small interior
   grid. Compute `h_min`, `h_max`, `h_mean`, and `Δ = h_max − h_min`.
2. **Classify by Δ** against the building's footprint span `S`, i.e. by the
   footprint's effective slope `Δ/S`:
   - `Δ < 0.15 m` → place directly at `h_max`; no grading. (Most placements
     should land here if suitability masking did its job.)
   - `0.15 ≤ Δ < 0.6 m` → **plinth**: floor at `h_max`, emit a skirt/base course
     around the perimeter down to `h_min − 0.3 m`. Grading not needed.
   - `0.6 ≤ Δ < 2.0 m` → **grade a pad**: flatten the footprint + a 1.5× margin
     to `h_mean`, with a falloff ring of ~2–3× the footprint span, then a
     *soften* pass over the ring. Plinth still emitted for the residual.
   - `Δ ≥ 2.0 m` → **do not flatten**. Either (a) choose a stilt/piled variant of
     the building (the marsh answer, and the good-looking one), (b) choose a
     terraced/multi-storey variant whose lower storey is buried, or (c) **reject
     the site and re-site**. Grading a 2 m+ pad on open terrain produces the
     visible mesa that every reviewer notices.
3. **Always bury by a margin.** Set the building's Z so the base course is
   `≥ 0.25 m` below `h_min` at every sampled perimeter point. Never solve a gap
   by raising terrain against a wall alone.
4. **Emit a footprint polygon as data** with a `graded: true/false` flag and the
   pad height. Downstream stages need it: vegetation clearing, road snapping,
   navmesh, ground-material overrides, and the shadow/LOD fixes in §5.
5. **Determinism.** Pad heights and jitter derive from `hash(place_id)`, never
   from iteration order (engineering standard: determinism in world building).

**What breaks if you skip a step** (all observed failure modes in Skyrim
modding): floating buildings (Z from `h_mean` instead of `h_max`); gaps at the
downhill corner (no plinth); z-fighting where two graded pads overlap or where a
zero-thickness floor meets terrain; clutter and rocks poking up through
floorboards (the standard mitigation is a small air gap under the floor plate,
plus a vegetation/rock exclusion mask on the footprint); and terrain creases at
the pad rim from flattening without a soften pass.

### 4.4 Navmesh implications

**[inf]**, informed by CK practice (finalise navmesh *after* terrain edits — a
navmesh generated against pre-grade terrain floats or sinks):

- Grading must run **before** navmesh generation, and the navmesh must be
  regenerated for any cell whose heightfield the settlement compiler touched.
  Ordering this wrongly is the classic silent breakage: NPCs walk 30 cm above or
  below the ground on the pad rim.
- The pad rim's falloff slope must stay under the agent's max walkable slope, or
  the settlement becomes an island in the navmesh. Practical bound: keep the rim
  ≤ 30° (GDC 2013 notes AI handles up to 60° but 30–45° reads better; for a
  *settlement approach* stay at the gentle end).
- Stilted/overhanging floor plates need navmesh on the deck *and* a link
  (stairs/ramp) to ground, or the deck is unreachable.
- Doorways must have navmesh continuity across the threshold — see the
  interior/exterior door portal note in §5.

---

## 5. Other gotchas for province-scale agent placement

All **[inf]** unless a source is cited; each is stated as a rule.

**Draw calls and instancing.** A settlement is the densest object cluster in the
world and will blow the draw-call budget before vegetation does. Rule: all kit
pieces of a given mesh in a settlement render from one instanced batch;
per-building uniqueness comes from *material variant index*, not from unique
meshes. Cross-ref the instancing work in
[vegetation-scatter-instancing-threejs.md](../rendering/vegetation-scatter-instancing-threejs.md).

**Building LOD and the large-reference trap.** Bethesda's own solution to
"buildings visible from far away" is a separate LOD object system, and the
[DynDOLOD docs on Large References](https://dyndolod.info/Help/Large-References)
document exactly how it fails: LOD and full model both rendering (flicker), LOD
never unloading, whole cells going empty when a child worldspace (a walled city)
overlaps its parent. **[doc]** The transferable rules: (a) a building must have
*one* authority for whether its full model or its LOD is drawn, at a single
distance, per building — never two systems that can disagree; (b) never model a
settlement as a separate world/scene that overlaps the main world's streaming
grid; (c) generate building LOD from the *final* placed transforms, after
grading, or the LOD sits at the pre-grade height. Related: always regenerate
terrain LOD after height edits, or the distant terrain shows the ungraded
hillside through the settlement.

**Terrain LOD seams under a pad.** A graded pad changes heights that the coarse
terrain LOD does not know about, producing a visible step where LOD meets full
terrain at the settlement edge. Mitigation: keep grading inside a single LOD
tile where possible, and rebuild the affected LOD tiles as part of the same
compile.

**Shadow acne on flat pads.** A large perfectly-flat, near-horizontal surface is
the worst case for shadow-map depth bias — it self-shadows in stripes. Fixes, in
order: give pads a ~0.5–1° residual tilt rather than mathematically flat; use
normal-offset bias; and check the CSM cascade split does not land its boundary
inside a settlement (the CSM gotchas we already hit are recorded in
[openworld-vegetation-placement-architecture.md](../vegetation/openworld-vegetation-placement-architecture.md) §4.2).

**Collision.** Every kit piece needs collision that matches its *visual* base,
not its bounding box; buried portions must not generate a collision ledge that
players can stand on inside the terrain. Test: walk the full perimeter of every
building type on a 20° slope in the sandbox.

**Doors and portals.** An interior is a separate scene; the exterior door
transform, the interior arrival marker, and the navmesh on both sides are three
pieces of data that must be emitted together at placement time. Emitting them
separately is how you get arrival-inside-a-wall.

**Water-edge structures.** Docks, jetties, stilt houses and moored boats depend
on a *water level that varies* (tide/season — see
[world/60](../../world/60-water-traversal.md)). Rule: place water-edge geometry
against the water system's **highest** level and check it against the lowest,
because a jetty that floats at low tide is worse than one that is partly
submerged at high tide. Piles must reach the *bed*, sampled from the terrain
under the water, not the water surface.

**Roads meeting buildings.** Roads are generated from a graph; buildings are
placed from a site plan. If they run independently you get roads through walls.
Rule: settlements publish their footprint polygons and their door positions as
*constraints* to the road compiler, which routes around footprints and
terminates spurs at doors. Road grading and building grading must be the same
pass, or two pads fight over the same vertices.

**Vegetation clearing edges.** A settlement needs a clearance mask (exclusion
inside footprints and roads; reduced density in a ring) — but a hard-edged
circle of no-vegetation reads as a crop circle. Use the footprint union dilated
by a jittered offset, with a density gradient over ~5–15 m, and *keep* deliberate
plantings inside the clearing (a garden, a shade tree) so the void isn't total.
Also: a farm's cleared field should have a *hard* edge (that's the story), while
a camp's should have a soft one.

**Seams between authored and procedural.** The tell is always a discontinuity in
one channel — ground material, vegetation density, or terrain smoothness —
stopping on a line. Fix by making every settlement-driven modification a
*field with falloff*, never a boolean region, and by making the falloff radius
different per channel (material 8 m, vegetation 15 m, terrain 25 m) so the three
edges never coincide.

**Ordering.** The compile order that avoids most of the above:
suitability mask → site selection → footprint layout → **terrain grading** →
roads → navmesh → vegetation clearing/scatter → ground materials → LOD/impostor
bake. Anything that reads terrain height must run after grading.

---

## 6. Avoiding sameyness in rule-driven placement

Sources: [Game Developer, "Devs weigh in on the best ways to use (but not abuse)
procedural generation"](https://www.gamedeveloper.com/design/devs-weigh-in-on-the-best-ways-to-use-but-not-abuse-procedural-generation),
[GDC Vault: Practices in Procedural Generation](https://www.gdcvault.com/play/1023372/Practices-in-Procedural).
**[lore]**

### 6.1 The known techniques

- **The risk is blandness, not chaos.** The standard framing: newcomers fear
  randomness will produce nonsense; in practice pure noise produces
  *emotionally flat* uniformity. Variance in a parameter is not variety in an
  experience.
- **Template families, not instances.** Spelunky/Isaac model: a curated pool of
  authored chunks assembled under strict rules with defined connection points.
  For us: each place-type has a *family* of 4–8 authored layout templates, and
  the compiler chooses and perturbs, rather than generating layout from scratch.
- **Guarantee a set piece every N.** Hand-placed hero moments among procedural
  filler, at a fixed rate, so the player never goes long without something the
  generator could not have produced.
- **Orthogonality.** Choose systems whose outputs *don't* overlap in what they
  express — the less two variation axes say the same thing, the larger the
  perceived output space. (Varying roof colour and wall colour is one axis;
  varying roof colour and building *stance on the ground* is two.)
- **Poisson-disc, not uniform random.** Minimum-separation sampling avoids both
  clumping and grid artefacts, which is why it reads as hand-placed. Note this
  is in tension with the mined finding that *hand placement is strongly
  clustered* ([shipped-world-placement-rules.md](shipped-world-placement-rules.md)
  R1) — the resolution is a two-level process: cluster centres by Poisson-disc,
  members within a cluster by clumped sampling.
- **Deterministic seed derivation per system.** Chunk/place content is a pure
  function of `(id, world_seed)`; never share PRNG state between unrelated
  systems (a classic source of "why did adding a tree change a camp").
- **The No Man's Sky lesson**: everything derived from one seed became visibly
  repetitive; the fix shipped later was hand-authored elements mixed in.
  Budget the hand-authored fraction up front rather than as a patch.

### 6.2 The 80/20 mix, concretely

**[inf]** For each place-type: ~10% hand-authored unique instances (the
beacon-tier and story-critical places), ~70% template-family instances with
seeded variation, ~20% pure-rule filler (the snack tier). The hand-authored
fraction must be spent on the things players *aim at*, never on filler.

### 6.3 Breadth checklists — stopping the author fixating

The specific failure for an AI author: it invents three good ideas and then
generates 200 variations of them. Mitigations, all mechanical:

1. **Taxonomy before instances.** Enumerate the *full* type list first (use
   Bethesda's own taxonomy from [UESP:Unmarked Places](https://en.uesp.net/wiki/Skyrim:Unmarked_Places)
   as the floor: hostile camp, creature den, camp (hunter/fisher/empty),
   caravan, boat afloat, boat wrecked, shrine, house, burial, jail, ruin/
   monument, loot-only, plus our marsh-specific set) and require every type to
   be *used* before any type is used twice as often as the median.
2. **Quota table, checked mechanically.** Per region: counts per place-type,
   per template within a family, per faction, per reward class. A test that
   fails when any single template exceeds ~25% of its family's instances.
3. **Vary the *axes*, not just the values.** Keep an explicit axis list —
   occupant, motive, age, condition, ground relationship (flat/stilt/dug-in/
   cliffside/floating), water relationship, approach cost, reward class,
   danger — and require any two instances of the same template within 2 km to
   differ on ≥3 axes.
4. **The "why here, why now, why still" test** on every place, per CLAUDE.md's
   lore rule: why does this exist, why at this exact spot, and why has it not
   been abandoned/looted? An instance that cannot answer all three is filler and
   should be demoted to the snack tier or deleted.
5. **Adjacency rule.** No two instances of the same template within sight of
   each other, ever.
6. **Coverage audit as a report, not a vibe.** Emit a per-region table of type
   counts, template histogram and axis coverage as part of the compile, so the
   next agent sees the imbalance rather than having to notice it.

---

## 7. What this means for our Phase 11

Prescriptive rules, in priority order.

1. **Adopt three place tiers with separate densities** (§1.4): beacon
   ~0.1–0.3/km², destination ~1–2/km², snack ~10–15/km². Bind the *destination*
   tier to the Morrowind-derived budget in
   [morrowind-content-density.md](morrowind-content-density.md); the snack tier
   is new and is what delivers the 60–100 s constant.
2. **Building placement is site-first, grade-last** (§4.3). Suitability mask by
   slope → place → classify by footprint Δ → plinth / grade / stilt / re-site.
   Hard rule: **never grade more than 2 m**; above that, change the building or
   the site. Never set Z from mean height; always from max, buried ≥0.25 m.
3. **Emit footprint polygons, door transforms and pad flags as first-class
   data**, consumed by roads, navmesh, vegetation clearing, materials and LOD.
   Ordering: grade → roads → navmesh → vegetation → materials → LOD.
4. **Every place carries an `approach_cue` and a verified sightline** (§1.3,
   §3.2). A place whose cue is not visible from any road, river, ridge or shore
   fails the compile check. This is also what makes marker-free, Morrowind-style
   direction-giving possible later, and it is far cheaper to emit now.
5. **Implement the two-visible rule and a coverage heat map** (§1.4 rules 2–3,
   §1.2). Rasterise "destinations visible and desirable from here" over the road
   and shoreline network; dead zones and 4+-visible clusters are both bugs.
   This is Nintendo's own acceptance test and it is cheap for us.
6. **Encode the five-part POI recipe as the schema** (§3.1): cue, population,
   narrating props, two-tier reward, optional satellite node. Every generated
   place fills all five slots or is rejected. Allow tiny destinations (90 s).
7. **Regional distinctiveness is a multi-channel agreement** (§2.1), with
   transitions *offset* per channel. Add the 128 px skyline pairwise diff as a
   distinctiveness check. One hero landmark per region, used once.
8. **Sameyness is prevented mechanically, not by good intentions** (§6.3): a
   type taxonomy that must be fully used, a per-template ≤25% quota test, the
   ≥3-axes-differ adjacency rule, and a coverage report emitted every compile.
9. **Cluster, then Poisson.** Cluster centres by Poisson-disc (min separation);
   members inside a cluster by the clumped distributions we already mined in
   [shipped-world-placement-rules.md](shipped-world-placement-rules.md) R1.
10. **Water-edge geometry is placed against the highest water level and piled to
    the bed** (§5) — this is the one gotcha most likely to ship broken given how
    much of Black Marsh is waterline.

Open questions for a later pass: what our beacon-tier objects actually are per
region (needs the lore dossiers, not this doc); whether the snack tier should be
compiled or authored; and whether stilted buildings need a distinct kit family
or can reuse plinth pieces at length (an asset-sourcing question for
[world/90](../../world/90-asset-strategy.md)).

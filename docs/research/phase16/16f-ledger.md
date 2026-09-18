# 16f ledger — vegetation and dressing on the frozen water

Evidence for the 16f owner check (brief:
[16f](../../phases/16-foundation-and-places/16f-vegetation-on-frozen-water.md);
decision [0070](../../decisions/0070-vegetation-and-dressing-read-the-record.md)).
Every number here was measured on the shipped files; "before" is the
2026-09-16 tree as 16e round 3b left it, "after" the chain run of this chunk.

## 1. The reconcile pass (delivery step 0)

- The brief predated 16e round 3b by four hours; nothing 3b changed is read
  by 16f. 16f's record is 0070 (0069 is 16e's).
- The water stage's recorded inputs and code had moved since 16c, so a
  plain run would have recompiled the water; the 16e route stages had no
  stamps at their chain positions. Owner: nothing earlier is rebuilt. The
  chain now skips `compile_water` on every routine run and the seven
  affected stages were stamped with `chain_stages adopt` (their accepted
  outputs re-hashed, no run). `chain_contracts --all` then reads
  `contracts: OK (28 stages, 75 artefacts)`.
- The contract pass's first real list (before the stations fix): one
  mismatch, `paint_route_overlays` requiring `positionM` on two stations 16g
  has not sited; the declaration was wrong (the stage tolerates a null
  siting), not the file.

## 2. Ground cover (deliverable 2)

Measured with the ring's candidate loop ported to Python
(`worldgen/groundcover_ring.py`; statistics parity, not position parity), a
75 m ring at each site, land texels only.

| site | table | inst/ha | coverage | largest bare radius (m) | entropy (bits) |
|---|---|---:|---:|---:|---:|
| jungle 4020,4610 | HEAD before | 5,019 | 49.3 % | 16.0 | 2.34 |
| | pre-0048 | 6,587 | 61.6 % | 15.4 | 1.32 |
| floodplain 3010,2450 | HEAD before | 3,506 | 33.5 % | 24.4 | 3.20 |
| | pre-0048 | 2,096 | 31.0 % | 24.9 | 2.30 |
| rootland 2840,3020 | HEAD before | 6,107 | 58.4 % | 8.4 | 3.30 |
| | pre-0048 | 3,423 | 51.0 % | 7.6 | 2.13 |
| mangrove 5170,4450 | HEAD before | 0 | 0.0 % | 41.9 | 0 |
| mountain 930,920 | HEAD before | 55 | 0.4 % | 36.6 | 2.26 |

After the rebuild (schema 3 table, 61-mesh kit, the ring rewritten):

| site | inst/ha | coverage | floor | largest bare radius (m) | entropy (bits) |
|---|---:|---:|---:|---:|---:|
| jungle | 10,248 | 63.7 % | 60 % | 7.6 | 2.55 |
| floodplain | 6,381 | 46.7 % | 45 % | 5.0 | 3.68 |
| rootland | 10,563 | 64.0 % | 55 % | 6.9 | 3.93 |
| mangrove | 1,002 | 10.2 % | 10 % | 6.8 | 3.24 |
| mountain | 665 | 5.2 % | 5 % | 9.0 | 3.20 |

The bare-radius floor is 14 m; every site clears it. What moved the numbers:
the dry silt of the floodplain (34 % of that ring) and the dry sand of the
mangrove flat were bare by rule and now carry a dry binding beside the
wet-bed one (a third water regime, `above`); BC_ROCK left the bare list
(steep lowland ground, not a cliff face) and the jungle's largest bald disc
fell from 15.3 m to 7.6 m; MOUNTAIN_ROCK carries rock grass at 1,200 /ha.
The rich covers needed 2.2 × the pre-0048 totals to clear their floors
(recorded in the table's `grounding`). The mountain and mangrove floors are
what the ruled densities produce: a tidal flat and a crag belt are
legitimately open; the scatter's upland dressing carries the rest of the
mountain read. Bare list now: BLACK_MUD, SALT, PATH, TRACK, BC_ROAD,
DIRT_CLIFF. The table is hand-maintained JSON with no generator.

Why the mangrove and mountain rings were bare: every land cover under them
(seabed sand, silt, beach sand, mountain rock, pebbles, scree) was on the
table's bare list; only 14 of 38 covers carried any species anywhere. The
0048 rework had also cut the jungle floor by a quarter (15,500 → 9,950 /ha on
cover 19) while adding variety. "After" rows land with the ring rebuild.

## 3. Rows and hanging pieces (deliverables 6 and 7)

- Rows: of 137 species rows across the five 3×3-chunk windows, only
  `composite:jungle/anvil-emergent-giant` scored above random (Clark–Evans
  1.10; a pure jittered grid, `singleton_share` 1.0, `clump_radius_m` 0):
  fixed at the palette (clumped like every other giant, density unchanged).
  Every pooled window sits at or below the uniform-random null on the
  bearing-peak measure, so no sampler change was warranted; the bearing
  check joined `test_output_is_clustered_the_way_hand_placement_is`
  (peak ratio < 1.5; a grid scores above 2).
- Hanging pieces, before: 20,421 attachments over 199 bundles; 3,538 more
  than 0.35 m off any trunk surface (worst 35.5 m), 13,199 above their
  host's usable trunk. Root cause: `composition.load_trunk_capsules`
  accepted only `pivot-yup-v2` frames and the kit ships `pivot-yup-v3`, so
  the trunk table was empty and every piece fell to the ±0.5 m pivot-square
  fallback around any nearby plant, bamboo included; and the pieces' pivot
  sits mid-strand, so a piece hung at the attach height put half of itself
  above the branch. Fixed at the root (both frames accepted; hosts are the
  46 assets with a ≥ 6 m trunk; the strand's TOP meets the trunk).

## 4. Rocks (deliverable 4)

- The mined rule table: 57 species; the rules and their evidence in
  [rock-placement-rules.md](../vegetation/rock-placement-rules.md). The
  load-bearing figure: large boulders sink 1.0–2.4 m (p25–p75) against our
  shipped 0.08 m; only the wet-rock family stands in water (submerged
  fraction 0.53–0.86); we shipped none of it.
- The kit: 35 vanilla rocks added (41 in the flora kit); every one carries
  its mined p25/p50/p75 sink and `test_rock_rules` proves none resolves to
  a class default. Mesh measurement: `moss_rockcliff01` is the open-backed
  shell (yaw 270°); only `rockl01` and `rockm03` are closed underneath —
  Bethesda authored most boulders as open-bottomed shells meant to be sunk,
  which is what their mined sinks say. Freestanding rule: open-back null
  and underside cover ≥ 0.3 (`rockl01/l04/l05`, `rockm03`, `rocks01–03`);
  the open-bottomed rest are placed at no less than 0.8 × their mined sink
  on ground under 20°.
- The layers (`worldgen/rock_dressing.py`, 1,113 per-figure tests): dry
  boulders in regions 1 and 2 at today's totals and at 3 /ha on firm lowland
  covers; rock piles at 8 /ha in the uplands and 1.5 /ha within 15 m of any
  ≥ 28° ground everywhere; the eight `rockcliff` pieces and the moss shell
  laid into every ≥ 28° face with their open back into the hill; the ten wet
  rocks in and beside channels, backwaters, lakes, tarns, ponds, lagoons and
  the sea at 25 /ha of the wetted band, 40 /ha in rocky surf, 60 /ha at
  falls and chutes. Record-driven passes: bed boulders in every steep reach
  (one per 160 m² of wetted bed, wet family only, scaled to their authored
  radius) and 2–4 boulders against each side of every fall's lip plus a
  ring round its plunge pool; 904 rocks (749 bed, 155 cascade) written to
  `water/bed-rocks.json`, from which the channel strips bake a foam pillow
  and tail per rock. Test chunks: border mountains 87 /ha with 20 bed
  rocks; the gorge fall 29 bed rocks. The brief's first bed-rock species
  (`rocks03`, a dry rock) put 210 dry rocks in channels and was replaced by
  the wet family before anything shipped. A rock pair is held apart by the
  larger rock's footprint (one-directional clearance), not the sum: backlog
  row.
- Litter mask: 311,969 texels of `ground-tint.png` alpha set from 70,286
  crowns; the ground material blends the three rock classes toward LITTER
  by it. The tint raster was RGB (alpha read as 1 = the whole province
  littered): now carved RGBA with alpha 0, guarded by a test.

## 5. Underwater and the sea bed (deliverable 8; re-cut 2026-09-18)

The owner's walk: the sea bed is bare nearly everywhere. Where it is not, it
reads as "large flat horizontal 2D squares jumbled on top of each other".
Measured, those squares are Depths of Skyrim's three corals: 16.8 x 17.9 x
3.6 m, 11.2 x 10.9 x 3.2 and 5.4 x 5.3 x 2.7 on 144/94/64 triangles, with
46–72 % of their triangle area within 15 degrees of horizontal. Card fans.
All three are out of the kit and out of every layer.

The band's figures used to be quoted from an ad-hoc mine nobody committed.
The mine is now a file: `world/sources/placement/depths-underwater-placement.json`
(4,693 refs, DepthsOfSkyrim.esp + Underwater_Treasure.esp, Tamriel, 17 s).
Every Depths species' band quotes it or says it has no mined row.

Kit `underwater-v1`: 33 → 79 assets. Added: Jokerine's `coral` and
`coral_spiky` (the sole genuine 3D corals for Skyrim SE), starfish, sponge, conch, sand
dollar, six scallops, a large clam; Shores of Skyrim's eleven usable shore
rocks and three shells; the nine vanilla `wetrocks` no layer had ever used;
`nordicbarnaclecluster01`; the three vanilla coast driftwoods; three bones;
barrel, basket, bucket; BM&V's two pebble mats. The three sirenroot walkable
floors STAY (Lilmoth's drowned quarter places them by hand).

Eleven new province-wide bands, `ocean` only: pebbles, shells, barnacles,
reef, starfish, sponges, sunken driftwood, bones, lost cargo, a rowboat and
algae, plus three sea-bed rock bands (small 14/ha, medium 3/ha, large
0.8/ha) that reach 45 m down, where the old wet band stopped at 2.5 m. All of
them ride a shoreline ramp on the sampler's `coast_factor`: 1.0 within 150 m
of the coast, 0.4 at 500 m, 0.2 beyond. Lagoons and tidal reaches are
excluded: "sea" is the record's word `ocean` (decision 0065). The ring's three bed
covers had a 4 m depth cap, so anything deeper carried no cover at all; it is
now 25 m.

Sea urchins and anemones exist in NO Skyrim SE asset, in the vault or on
Nexus: 29 index queries found zero. That is a hard gap, recorded, not
substituted. Coral is Jokerine's two meshes for the same reason: no
coral-reef static mod exists for SSE at all.

Earlier in the deliverable, still true: no wreck piece has a connector
template in any mined worldspace, so `wrecks-v1` is a piece list, not an
assembly kit (19 statics, 30.2 MB). Six Depths hulls reference textures the
mod does not ship; the owner eyeballs those six before 16g plots a wreck.

## 6. Roads (deliverable 5)

Registry census: 8 major roads, no `conditionSections`; worn 4, decayed 1,
broken 3, maintained 0. T3 keep by condition 0.08 / 0.25 / 0.60 / 1.00.

Rule, rewritten 2026-09-18 after the owner walk found decayed and broken
roads invisible: condition moves the material MIX, the cleared width and the
fine gaps. It never deletes the surface. The old rule erased the road class
over ~120 m stretches of the `wear` field, which left 82% of a broken road
with no road texel at all. Synthetic bake, road-class share of the paintable
centreline over seeds 1-3 (worldgen/test_landcover.py): maintained 1.00,
worn 1.00, decayed 0.93, broken 0.82; longest hole 0.0 / 0.0 / 3.7 / 7.3 m
against a 12 m cap; BC_ROAD share falls monotonically with condition. Gaps
are a 2.5 m noise field at 5% (decayed) and 16% (broken). Width factors are
now 1.0 / 0.85 / 0.7 / 0.5, so a broken road still clears trees off half its
width. TRACK's texture moved to Tropical Skyrim's dirt road (mean luminance
71.5 against the lowland covers' 50-58, where the old mud sat at 54.5).
PATH and TRACK now carry sparse grass. Shipped-raster shares are re-measured
after the chain run.

## 7. Water dressing (deliverables 14 and 15)

`compile_water_dressing` on the pre-run bundles (7 s): 1,698,643 wet texels;
standing-water bit over 95.5 % of them (the sea); wet-ground bit on 729,681
texels; algae over 0.3 on 273,239 texels, dark over 0.3 on 49,124; max
gradient 0.022 (algae) and 0.020 (dark) per metre against a 0.035 bound.
Dossier: [water-colour.md](../../../world/sources/lore/topics/water-colour.md);
no body is black.

## 8. Performance (deliverable 3)

Suspects and fixes (static audit; no probe measures frame time on a real
GPU, the owner's machine reports it):

| suspect | before | after |
|---|---|---|
| ground-cover ring | whole ring regenerated every 16 m (396,033 candidate cells) | per-tile cache; only new tiles generated |
| tree neighbourhood rebuild | ~81,000 `Matrix4` allocations per rebuild | zero; one scratch matrix |
| frustum culling | one bounding sphere per species over 2.3 km; never rejects | quarters around the focus; ~115 → ~143 draws (jungle, 2.3 parts) |
| shadows | levels 0–1 cast, alpha-tested, both cascades | level 0 only, within 60 m (120 m on 2026-09-16, halved the next morning) |
| rebuild trigger | `setState` re-fired every frame until commit | once per crossing |
| collider ring | bodies keyed on y, recreated on 1 cm shifts | keyed on (species, x, z); moved in place |
| nearest-solid selection | full sort per rebuild | min-heap, popped to the budget |

## 9. The boulder field (deliverable 4)

Survey (the frozen ground, 250 m windows, region 2/9/11/13, no marsh,
relief within 400 m): the brief's "≥ 6 ha at 3–20° inside 250 m" is
unsatisfiable province-wide (max 6.0004 ha); measured on the 500 m box.
Chosen: **the Rockpark stones**, 842 E / 5136 S
(`?view=character&x=0.84&z=5.14`), a 21 ha coastal bench of the upland
hills 5.5 m from an 88° cliff, 469 m from the Gideon–Soulrest road, the
plague-abandoned village Rockpark 91 m off. Candidates for Phase 15: 3606/3508
(firm lowland by the Archon–Gideon road, with 3902/3508 on the same bench),
3606/4643 (jungle, by a rapid), 3113/3705, then 1731/3853 on the Onkobra
side, where the lore's one mechanism for loose lowland rock applies. The dossiers carry
no scree, moraine or quarry anywhere; stone is unquarried in Black Marsh.

## 9b. Uplands, thin classes and the last gates (deliverables 11, 12)

- Upland dressing: 16 vanilla pieces in the flora kit (dead shrubs, tundra
  shrubs and scrub, the three placed mountain flowers, pine and aspen logs
  and stumps), 20 layers in regions 1 and 2 at the vanilla calibration
  (`deadshrub01` 9 /ha, `thicket01` 12 /ha, shrubs 10 /ha split by mined
  count, flowers 5 /ha, deadfall 1.5–2.5 /ha), every sink its own mined
  figure; dressing roles are not stems, so the 0048 ratios hold (max drift
  0.004). Mountain test chunk: 88.9 /ha with the dead shrubs and flowers
  present.
- Thin classes on the record: the delta dressing is keyed to 20 entity ids
  (the 19 reaches of `river.889-484` and the one lagoon body within 400 m
  of its mouth) and fires on the mouth chunk at 159 /ha where the region
  paint gives two delta texels; the corridor gallery follows band-3 reaches
  within 60 m (0.30 km²; only 494 band-3 texels exist, so the ribbon is
  thin by the record's own count).
- Exclusive understory restored for the delta, the lagoon and the corridor
  from unplaced kit species; the corridor has no second reed mesh left in
  the kit (a sourcing row for Phase 15 if wanted).
- Companions crossing into channels: the 47 trunks the channel gate still
  found were cluster companions spawned 1–2 m from an anchor just outside
  the wetted margin; `expand_clusters` now refuses a companion across the
  margin its anchor respects (test shown failing without the gate).

## 10. Chain run and gates

One run, `terrain-chain.sh --from rebake_landcover` (owner 2026-09-16: one
run per chunk, nothing above it): `verify_freeze` and the contract pass
(7 stages, 33 artefacts) green; `rebake_landcover` 37 s, `export_routes`,
`build_border_apron` 43 s (re-runs on the new bake), `compile_scatter`
57 s over all 256 chunks, `apply_vegetation_patches` (0 patches),
`compile_water_dressing`; 138 s in all. The 16h stages skipped on the
ladder. Two follow-up runs from `compile_scatter` only: the first because the
whole-province files (bed rocks, litter mask) were skipped by a
footprint run (a partial run now merges them), the second after the ladder
re-fit below. The cap is 2.5× after the mangrove's re-fit.

**The ladder re-fit.** The record bake moved the covers under every region,
so the 0048 delivered tables (`MEASURED_DELIVERED_PER_HA`,
`MEASURED_ATTENUATION`) described ground that no longer ships: the jungle
delivered 57.4 stems/ha where the table said 39.1 (its authored table is
untouched; more of its floor is now painted as ground trees may stand on).
Regions 2, 6, 7 and 14 fell under their ratios. Re-fitted from one
bake (to be averaged in the next); the re-base multiplier is capped at 2.5×
(a region that needs more is starved by its gates, not its authoring); the
two record-keyed thin classes (delta 3, corridor 5) leave the ratio gate,
because the corridor's paint is the wetted bank the channel gate keeps
trees out of and its dressing now follows band-3 reaches.

## 11. The owner's first look (2026-09-16 evening): three defects, all fixed

- **A shader error killed the water material**: the strip's rock-foam
  varying was declared twice in the vertex shader (once beside the attribute,
  once with the strip varyings). Removed the duplicate.
- **No ground cover anywhere; it predates 16f**: `hydro-regions.png`
  has carried a partial alpha (120) since 2026-09-13; a 2D canvas stores
  premultiplied colour and hands back 55,174,45 for the legend's 55,175,45,
  so every texel decoded as region 0 and the ring bound no species (probe:
  68 tiles, 0 instances; 497,767 candidates rejected as "bare"). The ring now
  matches the nearest legend colour. A second, 16f-made defect sat behind it:
  a tile generated before its terrain chunks had decoded was cached empty for
  good; an incomplete tile is no longer cached. After both: 14,874 instances,
  59 draws in the jungle ring. The ring's debug hook now reports rejections
  per filter.
- **Frame rate**: measured at the jungle site, the tree layer drew 3.13 M
  triangles in character view and 4.68 M from the air, because the full-mesh
  ring ran to height × 6 (capped 150 m) and the light decimation to 240 m:
  ~2,800 canopy meshes at 5–12 k triangles each. The LOD mechanism exists
  (three decimated levels per asset at 0.35 and 0.12, a flat billboard card
  for the tree species that have one, per-species draw distance) but its
  distances were far outside what shipped worlds use. Now: full mesh to
  height × 2.5 inside 24–60 m, the 0.35 level to height × 5 inside 50–140 m,
  the 0.12 level to height × 8 inside 100–260 m, cards beyond; draw distance
  capped at 900 m; shadow casters within 60 m; the fly camera runs the
  medium preset and rebuilds the instance set at most every 0.75 s (each
  rebuild walks ~80,000 instances, which was the "hang" while flying).
  Result: 0.75 M triangles in both views (4.2× and 6.2× less), 204 draws.
  The ground cover ring is now the larger triangle count (0.93 M for
  14,874 instances: the swordferns are 100–128 triangles each); a far-band
  cross-quad tier for the T3 ring and occlusion culling (a hierarchical
  depth buffer or the BVH culling the research names) are the next two
  levers, queued in the backlog. Rocks have the decimated levels and no
  card; small plants leave the scene at 60–80 m.

## 12. Sites for the owner walk (computed from the shipped data, 2026-09-17)

The brief's Owner check names sites "the ledger gives"; these are them
(`?view=character&…`, add `&t=` as the check says). Wrecks are NOT in place
(16g plots them); the underwater band is.

- Underwater kelp and seaweed, densest: `x=2.93&z=5.17`, then `x=3.08&z=6.67`, `x=5.78&z=2.02`.
- Corals: `x=4.88&z=2.48`, then `x=4.42&z=5.92`.
- Shell beds: `x=5.17&z=3.38`, then `x=5.47&z=2.33`.
- Sunken debris is sparse everywhere (3 pieces per 150 m cell at most): `x=2.33&z=1.57`.
- Backswamp (largest, 1.2 ha) for the water colour: `x=2.34&z=1.21`; mudflat (delta mouth, 0.9 ha): `x=1.50&z=6.46`; lagoon beside it: `x=1.74&z=6.26`.
- Band-3 corridor (gallery of waterline trees): `x=1.85&z=4.86`.
- Roads by condition (midpoint / quarter point): Gideon–Stormhold `decayed` `x=1.97&z=2.08` / `x=1.84&z=2.74`; Archon–Gideon `broken` `x=3.60&z=3.58` / `x=4.77&z=3.55`; Gideon–Soulrest `broken` `x=1.92&z=4.74`; Blackrose–Lilmoth `broken` `x=3.01&z=6.23`. The brief's `route.road.helstrom-blackrose` does not exist in the registry (Helstrom is reached by water and root since 0069); read that bullet as Gideon–Stormhold.

## 13. The underwater band's depth floor (owner walk, 2026-09-17)

The owner could not find the band, then found kelp standing out of the sea.
Measured, not guessed: the renderer seats every underwater instance on the
streamed seabed with its designed sink (zero null ground samples at two
sites), so the pieces were scattered into water shallower than themselves —
a 3.98 m mesh under a band opening at 0.8 m.

Fixed at the source. `compile_scatter.floor_submerged_depths` raises every
submerged layer's minimum `water_depth_m` to the piece's own drawn height
(`sizeM[2]` from either kit) at the layer's largest scale, so a rigid mesh
is only ever placed in water that covers it. The eight submerged roles are
named in `SUBMERGED_ROLES`; reeds, lilypads, `drowned-tree` and
`drowned-thicket` are excluded, because those four stand proud by design.
264 shipped layers are floored, the largest move being the 4 m kelps from
0.8–2.0 m to 5.18 m. Area kept: 68.5 % of all water and 87 % of the ocean
(1,511 ha) is deeper than 5.18 m, so the band loses only its shallow fringe.
`test_submerged_layers_never_sit_shallower_than_their_plant` pins both
halves, the floor and the four exclusions.

**Not yet realised in the shipped bundles.** The palette is read at scatter
time, so this needs one `terrain-chain.sh --from compile_scatter` run (57 s
over 256 chunks, nothing above it) and a raster publish. The recipe hash
carries the code change, so that run re-scatters the whole province by
itself.

## 14. Sea versus inland water (audit, 2026-09-18)

The owner's rule holds in the record. The graph has one `ocean` body. The 20
lagoons keep their kind up to 2.5 km inland. Vegetation, land cover,
rock, groundcover and water dressing all read the kind through the entity id.
Three residual reads are fixed here. `landcover.py:429` no longer accepts the
class raster's coast/estuary as salt, so only `SALT_KINDS` decides a salty
shore. `site_fields.py:493` splits the area census by the record's own kinds
(`ocean_grid`, `lake_grid`) instead of region classes 0 and 12; open sea reads
16.86 km² against the ocean entity's 17.42 km². The `hydrograph-bodies` overlay
is repainted from the compiled record by `worldgen/paint_hydrograph_bodies.py`:
lagoon falls from 75.0 ha to 7.9 ha and swamp rises from 73.6 ha to 176.0 ha,
both now within 3 % of the id raster. `derive` still carries 16a's painter above
the freeze gate; this script is what refreshes the layer below it. The compiled
`ocean` label over-reaches the sea by 56 ha of tidal creek
(`compile_water.py:1565`, 16c, above the gate) — queued in
`docs/phases/P-polish/backlog.md`.

## 15. Round 2 (owner feedback of 2026-09-17, delivered 2026-09-18; decision 0071)

Every item of the owner's list, with the measured cause and what shipped.
Renderer numbers are the local probe at the jungle site
(`probe-local-16f.mjs`, `x=4.02&z=4.61`), which counts instances and
triangles but cannot measure frame time; the owner's machine does.

| Owner item | Measured cause | Shipped |
|---|---|---|
| Rocks sway | every non-card material took the wind hook; a rock has no trunk capsule so it swayed at the full amplitude tuned for palms | wind by category: rocks, deadfall, containers, ruins, architecture and clutter carry stiffness 0 and no hook (66 species) |
| Standing on a rock floats you; invisible walls | the collider was the bounding box shrunk 12 %: a flat lid 0.19–0.68 m above the domed stone on the boulders people climb (3.9 m on a cliff shell), 8–26 % of every footprint solid air | rocks collide as a Rapier trimesh of their own LOD0 triangles, scaled per instance (`floraSolids.trimeshFromGeometry`); the box is the fallback with no geometry |
| Hollow backs on slopes | the open back was turned to `downhill + 2β` (only uphill for β = 90/270: rockcliff02 −26.7°, rockcliff04 +16.3° medians), yaw jitter ±22.9°; the sink was one number under the pivot while the downhill footprint edge stood up to 1.4 m (p90) above the ground; rockcliff05 never placed (slope band 28–20°) | yaw = downhill + 180° − β, jitter ±8°; the base plane is sampled at 8 points on the footprint and the sink raised by any exposure + 0.25 m (cap 0.6 × height); the open-bottom cap applies to freestanding boulders only; rockcliff05 places (448 instances) |
| Holes in rocks at distance | decimation multiplied boundary edges 5–10× on the open shells (rockcliff03 level 2: 354 open edges on 336 triangles), shown from 25 m out | rocks ship one mesh level (`lodRatiosByCategory {"rock": []}`) |
| Plants in straight rows | a fixed 0.42–0.55 m jitter on a per-species lattice whose cell is 2–4 m for any rule under ~7,000 /ha | full-cell stratified jitter; folded-bearing peak on the worst species 2.05 → 1.35 (a lattice scores > 2); `test_no_species_stands_in_rows` |
| Quality drops in one jump | levels switched at the 48 m rebuild, no transition | dithered crossfade between adjacent levels and a fade-out at the draw distance (`lodFade.ts`), rebuild every 16 m, both copies inside a 21 m overlap; a fully faded copy collapses to zero-area triangles |
| Ground cover vanishes at a line; wants bands for everything | one full-mesh ring to 65/75 m, then nothing; 61 species with no card | mesh to 0.4 r, camera-facing card to r, sparser card to 110/145/165 m by preset; cards baked for all 78 ring species and the 74 flora species without one |
| Grass looks 2D up close | the asset: 34 of 61 ring species were crossed cards of ≤ 12 triangles | 16 true-3D species sourced (DrJacopo, Hoddminir, vanilla `plants/`) at 40 % of every lush cover's density, totals unchanged; the 3.3 m size ceiling holds |
| Billboard mismatches | no card mapped by a wrong filename; 11 explicit borrows (three willows wear weeping-jungle silhouettes, the two composites a date palm); 115 flora species had NO card | baked cards replace nothing authored; the 74 uncarded species now carry their own silhouette |
| Occlusion culling and a far tier "now" | queued in the backlog | terrain-horizon test per 32 m cell at each rebuild (1,554 instances culled at the jungle site); the far ring above |
| Frame rate worse | two layers came back into the frame on 2026-09-17 that had drawn nothing before: the ground ring (0 instances since 2026-09-13, a premultiplied-alpha decode) and the water surface (its shader had failed to compile); plus the ring rebuilt 59 meshes every 16 m and re-derived every settlement's rubble province-wide | persistent instanced meshes (a crossing generates 8 of 298 tiles, recreates 0 meshes), rubble prefiltered by distance, the HUD split so the scene tree stops re-rendering at 7 Hz, the card tiers (ring 2.80 M → 0.80 M triangles at 3× the instances), the collapsed faded copies, submerged species drawn to 120 m |
| Broken and decayed roads invisible | the bake erased 82 % of a broken road's surface over 120 m stretches; the track texture had the ground's luminance (ΔL 3–5); broken roads had no corridor at all | the surface always stays: cobbles → dirt → track with 2.5 m potholes (5 % decayed, 16 % broken); TRACK is Tropical Skyrim's road01 (L 71.5, ΔL +14 to +22 against the ground); widths 1.0/0.85/0.7/0.5; sparse grass on PATH and TRACK |
| HUD "vis" | — | removed |
| Flat squares on the sea bed | Depths of Skyrim's `tbp_coralbig/medium/small01`: 16.8/11.2/5.4 m card fans, 46–72 % of their area horizontal, clumped at 5 m | removed from the kit and every palette; 547 instances gone |
| Sea-bed cover nearly everywhere, densest near shore | under `ocean` only kelp, seaweed, cover-gated corals and clams; no pebbles, no debris, ring bed cover capped at 4 m, wet rocks stopped at 2.5 m | 11 sea-bed bands + 3 rock bands, `ocean` only, a 0.2-base coastline ramp (1.0 at the shore, 0.4 at 500 m); the ring's bed covers run to 25 m; Jokerine's two 3D corals, sponge, starfish, shells; Shores of Skyrim stones and shells; nine unused vanilla wet rocks, barnacle clusters, driftwood, bones, containers; the mine of Depths and Underwater Treasure committed (`depths-underwater-placement.json`, 4,693 refs) |
| Coral reefs? | the only corals were the card fans; no coral-reef static mod exists for Skyrim SE; sea urchins and anemones exist nowhere (a hard gap) | Jokerine's `coral` and `coral_spiky` in clumped reef patches within 600 m of the shore, 2–12 m deep: 2,915 pieces; the densest 150 m cells are `x=4.72&z=5.77`, `x=5.33&z=4.88`, `x=5.62&z=2.32`, `x=5.17&z=4.58`, `x=5.62&z=4.27` |
| Depth floor over-stated by the box | `pivotAboveBaseM == originOffsetM[2]` on all 33 assets (one quantity, two names); `waterkelptall03` alone sits 0.71 m higher than its twins | floor = (sizeM[2] − pivotAboveBaseM) × max scale; tall02 5.06 m vs tall03 4.14 m |
| "The water record classes inland water as sea" | false of the graph (one ocean body; 20 lagoons up to 2.5 km inland keep their kind); the compiled `ocean` label over-reaches by 56 ha of tidal creek (16c, above the gate, backlog row); two raster-derived salt reads below the gate; the map painted 74.9 ha of lagoon against 8.5 | §14: reads fixed; the map's bodies layer painted from the record (lagoon 7.9 ha, swamp 176 ha) |
| `province:publish` slow | one 122 MB archive re-uploaded for any change | five per-group assets; only changed groups upload |

Chain: `terrain-chain.sh --from rebake_landcover`, 142 s (rebake 37 s,
apron, scatter 66 s over 256 chunks), then a second `--from compile_scatter`
after the sea-bed gates were corrected (the coast field is signed, − at sea;
the first run's starfish, driftwood and coral gates read the land side).
Second-run census (680,062 instances): coral 2,915, starfish 885, barnacle clusters 635, driftwood 243, sponges 1,034, pebble mats 7,031, shells 3,304, shore stones 550, wet rocks 1,485; rockcliff05 448. Kits: flora 159 assets (54.4 MB, 74 baked cards), ground cover 78 (11.4 MB,
78 cards), underwater 79 (27.0 MB). Docs: decision 0071; playbook §2 row;
backlog rows struck; Phase 14's billboard row closed.

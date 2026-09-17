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

## 5. Underwater (deliverable 8)

Depths of Skyrim's own pieces carry mined contact (seaweed trees 8–70 m
deep at scale 0.15–1.15; corals in a 2.3–5.5 m band); every wreck hull is
single-digit n; Underwater Treasure places no flora, only loot. Skyrim's
underwater grasses are GRAS records painted by texture, so bed cover is the
ring's (SILT, SEABED_SAND, OCEAN_FLOOR bound with a 4 m depth cap). Shell
beds exist in vanilla (`clam01`, `clamlarge01`, `clamthin01`). Kit/palette
defects fixed: `tbp_seaweed06var1` used but not in the kit. No wreck piece
has a connector template anywhere in the mined worldspaces, so `wrecks-v1`
is a piece list, not an assembly kit (19 statics, 30.2 MB; the `_c` hull
variants are shader-stripped twins and are left out; intact hulls are not
wrecks and are left out). Six Depths hulls reference textures the mod does
not ship (`atmoranshipwood01/02`, `atmshipshields`, `breticshipside01_n`):
the owner eyeballs those six before 16g plots a wreck on them; the six
vanilla wrecks carry the kit if they read grey. The underwater kit grew 23
→ 33 assets; 23 province-wide band layers (kelp forest, seaweed, deep kelp
trees, corals, algae mats, driftwood, shell beds, sunken debris), each gated
by water kind, season, signed depth and bed cover; the old region-gated
aquatic layers are gone. Before, on the shipped bundles: 487 of 5,795
aquatic instances stood in under 0.3 m of water (the old region gates).
Breadth: 21 of 23 scatter-eligible underwater assets used (91 %).

## 6. Roads (deliverable 5)

Registry census: 8 major roads, no `conditionSections`; worn 4, decayed 1,
broken 3, maintained 0. Synthetic bake: non-road share of the surface
maintained 0.00, worn 0.00, decayed 0.54, broken 0.87 (monotonic); T3 keep
by condition 0.08 / 0.25 / 0.60 / 1.00. Shipped map before: worn 0.094,
decayed 0.048, broken 0.046 (no condition paint; noise).

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
| shadows | levels 0–1 cast, alpha-tested, both cascades | level 0 only, within 120 m |
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

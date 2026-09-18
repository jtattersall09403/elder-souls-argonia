# Rock placement rules, derived from Skyrim's own placements (16f)

**Source of truth:** `world/sources/placement/vanilla-tamriel-placement.json`
(Skyrim.esm, worldspace Tamriel, 250,830 instances mined 2026-08-31; 57 rock
species profiled). Every number below is read from that file by
`worldgen/build_palettes.py` and `world/sources/placement/composition-rules.json`
at build time; this page states the *rules* the numbers support and is not a
second copy of the table. Full per-species tables: run
`python3 -m worldgen.mine_placement --help` or read the JSON.

## What Bethesda does with a rock (the rules, each with its evidence)

1. **Rocks are buried, not set down.** Large boulders sink p25/p50/p75 =
   −2.4/−1.6/−1.0 m (`rockl01`), medium −1.0/−0.6/−0.3 m (`rockm02`), small
   −0.4/−0.26/−0.1 m (`rocks02`); rock piles −0.2 to −0.4 m (`rockpiles01–04`)
   except the big `rockpilel01` at −2.0 m; cliff pieces −4 to −12 m
   (`rockcliff01–08`: shells pushed into the hill). Our shipped policy was a
   0.08 m bury. **Rule:** sink = the species' mined p50 with the p25–p75
   spread as the jitter; never a class default (`Composition.CLASS_SINK` is
   the fallback for unmined species only; `test_rock_rules.py` proves no
   rock reaches it).
2. **Rocks tilt.** Median tilt 15–23° on boulders (p95 50–60°), 3–17° on
   cliffs, 9–18° on piles; yaw is uniform (0.86–0.99). **Rule:** yaw random;
   `tilt_deg_max` = 2 × the mined tilt p50 (a uniform draw whose median is
   the mined median), on top of `align_to_slope` = 1 so the long axis lies
   with the hill.
3. **Rocks stand on slopes.** Slope p25–p75 is 10–35° for boulders and piles,
   16–47° for cliff pieces. The piles' ground is the `NoRocks` texture
   twin of the rock texture (LRocks01NoRocks 15–29 %), i.e. bare painted
   ground around them. **Rule:** slope gate 0–(p75 + 10°) per species; cliff
   pieces need ≥ 28° (`slope_deg_min`); piles and boulders prefer the rock
   and scree covers (`land_cover` gate: MOUNTAIN_ROCK, SCREE, PEBBLES,
   MOSSY_ROCK, BC_ROCK, GRASS_DIRT, SCRUB, TROP_GRASS as the bake paints them).
4. **Rocks clump.** Clark–Evans R 0.32–0.58, mean nearest neighbour 7–15 m,
   clump link 14–30 m. **Rule:** `clump_size_median` 3, `clump_radius_m` =
   half the mined link, `singleton_share` 0.15; clearance radius = the mesh's
   own footprint half-diagonal + 0.5 m so no rock stands inside another
   (the mined p5 nearest neighbour is under 2 m, so the floor is geometric,
   not the mean).
5. **Only the wet-rock family stands in water.** `wetrocks/*`: submerged
   fraction 0.53–0.86, origin 0.2–2.0 m BELOW the water plane at p50,
   flooded-ground fraction 0.32–0.61, ground `LRiverBottom01`,
   `LRiverbedEdge01`, `LCoastBeach01`. Dry boulders sit at 0.04–0.27
   submerged (incidental shorelines). **Rule:** wet rocks are gated to
   `water_depth_m` (−1.0, 2.5) and to the record's channel, backwater, lake,
   lagoon and ocean kinds; every other rock is gated dry (`water_depth_m`
   upper bound 0). Steep reaches get the authored bed-boulder rule (1 per
   160 m² of wetted bed, radii 0.6–2.5 m, inside 80 % of the half-width,
   seeded by reach id) from the wet family only.
6. **Scale is modest.** p5–p95 0.7–1.7 on large boulders, 0.8–1.2 on the
   rest; wet rocks up to 2.4. **Rule:** `scale_range` = the mined p5–p95.
7. **Clearance from buildings** p50 18–30 m. **Rule:** carried into the
   settlement patch kind (16h applies it); the scatter itself has no
   buildings.
8. **What goes with what** (`associations`, 16 species): rock piles on rocks
   (`rockpiles03` ↔ `rockpiles04` ×338), moss on piles
   (`florahangingmoss03` ×104 on `rockpilem02`), waterfall FX beside big
   boulders (`rockl01`/`rockl04` with fall and churn effects), dead shrubs
   and stumps near mid boulders. **Rule:** the fall lip and both sides of
   the sheet get boulders (deliverable 4, from the cascade record); piles
   follow boulders as a smaller clump layer in the same palette.

## Mesh-side rules (`vet_kit.py`, recorded in the kit manifest)

- `undersideClosed`: the footprint is covered by downward faces (≥ 0.6). A
  rock that is not closed underneath is a shell: cliff dressing only.
- `openBackYawDeg`: a horizontal direction with no faces while the opposite
  has many. An open-backed piece is laid with its back into the hill
  (`align_to_slope`): yaw = downhill azimuth + 180° − `openBackYawDeg`, so the
  open back faces uphill. Never freestanding. Six of the nine cliff pieces
  carry an `openBackYawDeg` and all nine are open underneath.
- `pivotAboveBaseM`: the pivot's height above the mesh's lowest point, so a
  sink is measured from the right datum.

## The kit (flora-province-v1, 16f)

Vanilla `landscape/rocks/`: boulders `rockl01–05`, `rockm01–04`,
`rocks01–03`; wet rocks `wetrocks/rockl01–05wet`, `rockm02wet`,
`rockpilel01–03wet`, `rockpilem02wet`; piles `rockpiles01–04`,
`rockpilem01–02`, `rockpilel01–04`; cliffs `rockcliff01–08`; plus BM&V's
`moss_rockcliff01` as cliff dressing. Tropical Skyrim's rock textures
(`mountainslab01/02` and the rest) replace the vanilla ones through the
pipeline's texture resolution. Credits: root README § Credits.

## Where the rules are applied

- `worldgen/rock_dressing.py` — the layer builders (`boulders_dry`,
  `rock_piles`, `cliff_pieces`, `wet_rocks`, `surf_rocks`, `fall_rocks`,
  `cliff_foot_piles`), each figure read from the mined JSON and the kit
  manifest at build time; `worldgen/build_palettes.py` calls them from its
  `# --- rocks and dressing zones (16f) ---` block and files the
  province-wide ones (cliffs, cliff feet, wet, surf, falls) once with an
  explicit list of every land region class.
- `worldgen/dressing_zones.py` — authored polygon overlays
  (`world/sources/flora/dressing-zones.json`); the numbers stay with the
  mined rules, the record only says where and why.
- `worldgen/rock_dressing.py` — the record-driven passes: bed boulders in
  steep reaches, fall lips and plunge-pool rims, written to
  `apps/world-studio/public/province/water/bed-rocks.json` for the water
  renderer's foam stamps.
- `worldgen/test_rock_rules.py` — the kit-side contract: every rock's mined
  ground contact, on the shipped manifest and rules file.
- `worldgen/test_rock_layers.py` — one test per figure on the shipped
  PALETTES (sink, tilt, yaw, scale, slope band, clumping and clearance, no
  open side outward, the water relation, rocks are not stems), plus the two
  record-driven passes and the dressing-zone overlay, so a rule typed from
  memory cannot ship again (decision 0036's round-4 lesson).

  Known limit, queued in `docs/phases/P-polish/backlog.md`: clearance
  stamping is one-directional, so a PAIR of rocks is held apart by the larger
  one's footprint rather than by the sum of the two (rockl02 and rockl03 land
  9.41 m apart on a dense mountain hectare where the sum rule wants 9.93 m).

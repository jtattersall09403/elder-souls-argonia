# 16h — The building blocks: kit truth, the settlement runtime, doors, patches and the picture-checking loop

> **Closed.** Part 1 (kit truth and the runtime boundary) closed with
> the check-in 3 fix round in 16k slice 1a (2026-09-25). Part 2 was
> retired by [0099](../../decisions/0099-places-are-built-in-a-loop-until-the-skill-is-proven.md)
> on 2026-09-25: its live items (10–27, 29, 31–38 and the planner
> rulings of 2026-09-24) are in [16k](16k-place-loop.md) § Carried
> backlog, the only copy; the procedure is in the place-build skill. This
> file keeps part 1's closed record: its state, the owner's three yard
> check-ins and their rulings, the part 1 deliverables and the rules it
> ran under. Part 1's still-open items (§ Part 1 state › Open, in order)
> are taken by 16k slices from here.

**What part 1 did.** Every kit piece understood (how it sits in the
ground, what hangs off what, its real collision shape, how it fades with
distance); the runtime draws a placed piece where the compile put it; the
**proving grounds** (yard A, then yard B: scratch yards on real frozen
ground carrying one of every mechanism) stand as permanent regression
fixtures, never exported to the shipped build; the picture-checking loop
reads rendered sheets with cheap Sonnet eyes.


## Part 1 state (2026-09-23 night; instruction: `continue 16h part 1 fix round after owner check-in 1`)

**Done today.** Miner rounds 7–11 landed: real mesh contact, refs whose
base lives in a master, the last override wins, the water column,
contacts decide first, and the defining file's refs vote. The golden
loop is still open (ledger "Round 6–11 miner"). The BM&V terrain
question is resolved: no file is missing, and the misreads were three
miner defects. Yard rounds K4 and K5 fixed the entrance derivation
defect across all 23 kits. The threshold is now the measured opening,
the slope rule 97 B3 lives in the compile, docks are exempt, and fixture
obligations are skipped through one predicate. The five 2026-09-09
blueprints were RETIRED to `world/sources/blueprints/retired/` (owner
2026-09-23: the yard is the only fixture) and then deleted with that folder
(16k hand-off ruling 4, 0099 addendum 2026-09-25). Test-fix rounds 1–7 fixed
stale `plot_remedies` tests, the survey cache read-only defect, water
facts on reseats, stale exports (regenerated), roster `slotId` authored
ids, and type bands 5–9 and 2–6 after the owner's cut. The owner CUT
road-wear paint. Blackrose: the reseat is honoured by `city_centres` and
`city_layout.solve`. The island city keeps its 230 m disc
(`footprintSource` band plus `footprintWhy`). Lake features and the toll
tower bind through `sitingPrefs.boundTo`. Five land satellites are
reseated outside the disc. The toll tower stands at the causeway's shore
end on the Soulrest road. Runtime: kit asset meta is keyed by id (it was
`Object.entries` on a list, so every placement resolved null). Dug-in
fits anchor on the lowest sample (world 97 C11a). The placement resolver
is extracted, with a resolve test on the published bundle. Bundle tests
are invariants (budget == round(worst × 1.55)). `ladder.json` was
written from the fresh stamps, through 16h. The chain's own ladder write
could not run: `compile_minor_waterways` trips on a dock authored for the
retired Nine Trunks (backlog row). The studio settlement layer is
unhidden.

### Owner check-in 1 (2026-09-23), what the owner saw

- Building bases are good.
- Imperial gate: a thin gap to the wall west of it; the gate's east side
  is hollow and open.
- Imperial tower (4.24E 5.70S) stands alone, with hollow east and west
  faces.
- Stilt hut (4.33E 5.78S): the legs reach the ground, but it is not sunk
  enough for its staircase to reach the ground; no path is visible.
- Imperial house (4.28E 5.80S): the door is a body-height above the
  ground; there are no paths anywhere.
- Mud hut (4.27E 5.77S): height good, but its door stands alone beside
  it; random tables nearby.
- The stair and the cave mouth were not found. They are at 4.25E 5.68S
  and 4.32E 5.74S.
- Landing stage (4.37E 5.72S): the deck is far too high above water and
  land, and its landward end does not reach the land.
- Random chairs around 4.36E 5.73S and elsewhere.
- Ferry raft (4.38E 5.73S) sits right on the water but is not
  collidable.
- The sconce on the free wall is good; the wall is hollow at its short
  ends.
- The sign post is not solid.
- A stray boardwalk on land at 4.27E 5.74S, at shoulder height, with
  chairs.
- Owner questions: lit sconces from early evening to after sunrise, and
  when man-made lighting is done.
- Owner rule: every future check lists every item with its coordinates,
  the full list each time.

### Five causes

1. **Stilt and quay pieces are seated by their leg tips.** The sink
   fallback `ground_line_tell` returns the mesh bottom for every tell
   except foundation-top (`mesh_ground_line.py`). So the stilt hut,
   landing stage, boardwalk and farmhouse (manifest fit stilt) stand with
   legs touching and the deck a leg-length up. Rule: a stilt or quay fit
   is seated by its DECK (threshold or deck top). The deck sits at the
   height the mod's placements show above water or ground (plugin
   evidence), and the legs bury as deep as needed. The mesh fallback for
   stilt fits is the deck-top tell, never the leg bottoms. Owner
   2026-09-23: these kits have long legs so they can be sunk to suit the
   ground or water.
2. **The Imperial wall, gate and tower are modular pieces placed as
   three lone parcels.** Their hollow ends are the faces meant to butt
   into the next piece. The assembly templates in
   `kit-assemblies-mined.json` were mined by bounding boxes. The mount
   miner had the same defect until round 6 (t0429 pairs a roof corner
   with a frame end that never met). Rule: the yard's Imperial group is
   one mined assembly template, never separate parcels. The template
   says which wall goes with which tower and gate, with the snap offsets.
   Open ends get the kit's end pieces or face a neighbour (owner: "better
   rules on what goes with what and how things snap together"). The fix
   round extends the mesh-contact miner to assemblies. For every pair of
   kit pieces placed touching in the plugins (wall to wall, wall to
   tower, gate to wall, arch to wall), it records the contact face,
   offset and relative yaw as an `abuts` pair with counts. The compile
   snaps modular pieces only by those pairs. It flags an open modular end
   that faces nothing (owner 2026-09-23: the same mesh-aware work that
   placed the sconce right is what the walls, arches and towers need).
3. **The mud hut's door piece is bound to the wrong point** after the
   entrance re-derivation. Rule: for every composite in the yard, the
   door threshold equals the doorway within 0.5 m. Extend the K5
   agreement test from the stilt hut to all composites.
4. **Dressing is added by the COMPILE from the mined templates** (the
   blueprint holds no chairs, tables or barrels), and it is placed with
   no host. Rule: the compile places template dressing only on a host (a
   floor, deck, wall or mount pair). With no host it is dropped and
   counted. The yard carries no dressing beyond the two mount exemplars.
   The barrels beside the Imperial house float 0.47 m. That is the
   plugin-sink defect (static-supported refs) the miner fixed in round
   10.
5. **The ferry raft and the sign post have no collider.** Check that the
   trimesh collider sidecars for the ferry/wrecks kit and the imperial
   kit's sign post are published and attached (`SettlementColliders`).
   Fix the data or the attach.

Two answers. Paths are 16h part 2's ground paint
(`settlement_ground_control`, skipped on the ladder). Lit sconces and
man-made lighting are not scheduled yet. They are queued as a part 2
runtime item (item 22): a light emitter property on mount children,
switched on and off by the calendar.

### Yard coordinates (studio km E / S)

The current table, read from the bundle republished after the check-in 2
fixes (2026-09-24; `bash tooling/studio-loop/yard-publish.sh` prints it),
with a studio link and a check per item, is the check-in 3 yard packet
(§ Owner check-ins). Yard centre 4.306 / 5.737
(`?view=character&x=4.306&z=5.737&t=12`).

### Open, in order

Reconciled 2026-09-24 after yard rounds K6–K14 and miner rounds M13–M19.
Done work lives in the ledger rows named; this list names only what is
still open. The two lanes are decoupled (next section): nothing in the
miner list blocks a yard item.

**Yard** (`continue 16h part 1 fix round`)

0. **Check-in 2 yard fixes** (rulings 5–12; ledger "Check-in 2 fixes:
   yard"): delivered and republished. Still open from them: (a) red
   `test_every_yard_composite_door_leaf_stands_in_its_doorway`, stilt
   house 6.256 m: `interiors_index` reads the house's open-front entrance
   on the +y side while the leaf sits in the jamb-measured doorway on −y
   (the index should take a composite's own leaf part as its doorway);
   (b) the landing stage's bank: the yard ground never rises to the deck
   (deck 18.60, bank peak 17.71 within 30 m, gap 1.90 m), so the run
   needs the docks kit's `dockstepsdownend01` end (mined abut with
   `dockstrent01`, n 4); (c) the cave mouth's flanks: no mined
   co-placement and no terrain patch kind in this lane; (d) the runtime
   wet-stilt datum (support = water where it covers the legs) is not in
   `anchoring.ts`; (e) the yard's parcels are authored `interior: none`
   while two carry doors (a fixture has no `playerPurpose`): planner call;
   (f) `render_assembly` has no cutaway view; (g) `text-review` on the
   new yard `why.what` lines and the config notes.

1. **Owner walk** with the check-in 3 yard packet (§ Owner check-ins;
   republished after the check-in 2 fixes, 2026-09-24).
2. **Planner call: the truth-table fix path.** Six yard assets disagree
   with their hand-written expectations (`worldgen/fixtures/yard-truth.json`
   `knownMismatches`, ledger "Yard round K14"): `quay-run-2` ground
   (expected water), `dockstrent01` deck (water), `signwrpost01` deck
   (ground), `stilthouseext` water with no waterline, `stilthousedooranim`
   ground (hanging), `passesc128h64d01` sink −1.542 m (expected −0.3 to
   1.6 m). A policy row cannot fix them: `apply_placement_metadata` takes
   the class from `kit-mounts-mined.json` and the sink from the record's
   p50 before any policy row, `POLICY_ANCHOR` (`mine_mounts.py:1415`)
   imposes only water or deck and only in a miner run, and
   `--refresh-built-manifests` has no per-kit form. Decide the mechanism.
3. **Red `test_no_published_yard_piece_floats_or_misplaces_its_sill`**:
   landing stage 0.47 m, stilt hut 0.17 m (limit 0.15 m). The landing
   stage shares item 2's `quay-run-2` cause (unplaced in the plugins, so
   classed ground). Planner call for the stilt hut: the test measures the
   terrain under the footprint against the ground at the pivot, which may
   be the wrong measure for a stilt fit.
4. **Planner calls carried from K11–K13**: the mined relative yaw is
   clockwise and the composite importer turns counter-clockwise (K11 D;
   mesh-contact check on every composite with a template yaw other than
   0/180: mud hut frames and leaf, marsh-house-03 overhangs, farmhouse
   doors); `street_router` does not end a way at its door (mire-landing
   door 4's path end is moved by hand).
5. **Mount sheets pass 2** (ledger §4): rounds 5–7 rendered 0 sheets
   because the publish stopped first. K14 published, so render the 173
   sheets on the current record and run the Sonnet sweep.
6. **`text-review`** on the K9 run parcel's prose, the `wr-fence-run-3`
   note and the yard `whyNeighbours` as K12 C rewrote them (run in
   neither K12 nor K14).
7. `npm run docs:check`, then the `preflight` agent, then commits BY
   PATHSPEC: tooling speed lane; miner and records; renderer and sheets;
   yard, bundle and runtime; test-fix and catalogue; skills; docs. Then
   the PROGRESS row. The typecheck and game-core reds at K14
   (`visualScenarios.ts:274`, `CombatScene.tsx:18`, `sandboxStore.ts:28`,
   `visualScenarioExpectations.test.ts`) are the combat-sandbox lane's.
8. **Queued, not part 1** (one backlog row each in
   `docs/phases/P-polish/backlog.md`): yard `whyNeighbours` distances
   generated from footprints at compile time; "kit sidecars 0.0 MB" in
   `site:compose`; the terrain height-blend shader at the wall foot (16h
   part 2).

**Check-in 2 runtime fixes** (ledger "Check-in 2 fixes: runtime", uncommitted)

1. Owner look at night (`t=22`) at the yard farmhouse: the windows glow
   warm, and the thatch, rope and sign cutouts (28 materials now MASK) read
   right by day.
2. Done at the publish round: the exporter writes treatment rows as id +
   footprint only, and the yard bundle was republished without the dead
   fields.
3. Committed 2026-09-24: runtime `5d854e98`, yard and kits `cbf94703`
   (ledger "Check-in 2 fixes: publish"). Still uncommitted, owned by the
   docs lanes: `docs/research/combat-and-systems/follow-camera-collision.md`
   (item 24's research) and the treatments doc edits.
4. Miner run owed: `test_mine_mounts::test_the_record_follows_every_asset_placement_row`
   is red on the yard's new `stilthouseext` / stilt-house composite rows
   (record water, row ground) until the miner's next run writes the policy
   rows into `kit-mounts-mined.json`.

**Miner lane** (`continue 16h miner lane`; rules in the next section)

1. Apply the three M19-evidenced fixes: (a) ground and deck pooled as
   support before the plurality vote (answers the M19 golden miss on
   `wrfencestr01` and batch 6's `stockadescaffoldtop0sided01`); (b) the
   plugin-spread fallback only for structure categories with n < 6 or a
   spread over half the mesh height (answers the 90-row `housetronc001`
   spread rule that overturned decision 0075's rock seating); (c) the
   cloud mesh folder in `NON_SUPPORT_STATIC_DIRS`.
2. Golden set 25/25, then fresh seed batches (never 20260923–41) until
   one passes with no rule change. The number of batches cannot be known
   in advance; no round is called final.
3. The ONE full mounts run (`--jobs 5`, memwatch). It writes
   `meshesMissingIds` and owns three reds:
   `test_mine_mounts.py::test_the_record_holds_the_golden_set`
   (`cedartree3` pair classed `wall`),
   `test_repository_used_asset_coverage_is_dynamic_and_explicit`
   (`dungeon-root-v1`), and the catalogue form of the shipped-kit
   contract (`PLACEMENT_CONTRACT_SCOPE=catalogue`, 21 findings). Then
   `mine_designed_sink --complete-only`, the regression gate on the
   full-run diff (more class changes than the stated target set plus 10
   fails before the refresh), and
   `placement_metadata --refresh-built-manifests`. The yard truth table
   then fails on every mismatch the new record clears; update
   `knownMismatches` in the same change.
4. The `mwkeep` registry takes the King of the Murkmire plugin data
   (rebuilt copy `/tmp/wf/round7/registry-mwkeep.rebuilt.jsonl`): 156
   rows gain editor ids and sizes; five `imperial-keep` pieces turn
   `door` by record type and keep the plugin's kind unless the yard's
   wall run needs the gate arch as a static (report which). Rebuild
   `imperial-keep` after.
5. The literal run rule makes `wrfencestr01` (−x/−x along y, n 17) a
   double joint.
6. The seven meshes absent from the vault (backlog row, sourcing).
7. **WITHDRAWN 2026-09-25 (owner and planner):** the miner runs once over
   the whole pool on the `/tmp` cache volume, so no batch mode is built
   ([16k](16k-place-loop.md) § 1a). Was: a batch mode + merge step in
   the three miners so a full run can pull, mine and evict one batch at
   a time (a batch = one plugin plus the mod folders of every master
   and asset source it references, read from the plugin's master list
   and `exterior-interior-links.json`, vanilla always present); spec in
   docs/research/infrastructure/codespaces-migration-plan.md § miners'
   batch mode (lines ~346–354).

### The miner lane and the yard are decoupled (owner 2026-09-24)

Rounds K6–K13 and M13–M19 (ledger) each ended on a fresh 25-asset
batch finding a new idiom somewhere in the 1,400-asset catalogue, and
the yard walk was gated on that. Owner rulings: the "fresh batch of 25
until one passes with no rule change" protocol STAYS (it is the right
bar for the catalogue), it never again blocks a yard publish or an
owner walk, and nobody calls a miner round "final": it ends when a
fresh batch passes, which cannot be known in advance.

- **Yard publishes from the current record**, whatever the miner's
  state, after a yard truth table: every asset the yard uses gets a
  hand-written expected class, sink, waterline and pairs (from the
  geometry, by an agent that has not read the record) as a fixture
  test; a mismatch is fixed by a policy row, never a rule. The export
  and the shipped-kit contract check the assets a bundle uses; the
  catalogue-wide tests are the miner lane's gates, not the yard's. The
  export copies the published, compressed kits (never a raw GLB, M19
  ruling 5).
- **The miner lane** (`continue 16h miner lane`) applies the three
  M19-evidenced fixes ((a) ground and deck pooled as support before the
  plurality vote; (b) the plugin-spread fallback only for structure
  categories with n < 6 or a spread over half the mesh height; (c) the
  cloud mesh folder in `NON_SUPPORT_STATIC_DIRS`), then runs the batch
  protocol honestly: golden, fresh seed, stop on a real miss, fix,
  another fresh seed, until a batch passes; then the one full run, sink
  completion, refresh, and a regression gate on the full-run diff (more
  class changes than the stated target set plus 10 fails before the
  refresh). The `mwkeep` registry takes the King of the Murkmire plugin
  data; the five imperial-keep pieces it marks as doors keep the
  plugin's kind unless the yard's wall run needs the gate arch as a
  static (report which). Each miner round reports its batch score and
  what it changed; the owner's walks continue on whatever record the
  yard last published.

### Owner check-in 2 (2026-09-24 afternoon): findings, causes, rulings

Every finding is a rule or skill change first, a yard fix second (owner
2026-09-24). Good: wall run joints, ends and collisions; gate; tower;
sconce and its wall; sign post and huntsman sign; Imperial house sink;
stilt stair grounded; ferry raft; landing-stage height; mud hut size,
no tables.

1. **Rubble ring and skirt band are CUT** (planner's own K6 choices from
   the seam research, options 2 and 3). The rocks stood around every
   base, blocked the gateway and the ramp foot, had no colliders and
   looked wrong; the band jutted past the ruined wall ends and flashed
   every ~2 s. Rule: no code-placed dressing at a building's foot; the
   seam is the height-blend shader (option 1), a part 2 runtime item.
2. **Buildings flash out for a frame while moving** (all of them; the
   sconce wall's base flickers for seconds after the camera stops).
   Suspects: the LOD ladder swap (0075), the skirt's polygonOffset, the
   settlement layer re-mounting on tile changes. Probe, find the one
   cause, fix at the root; a visual check scene.
3. **Camera clips into buildings.** Rule: the follow camera collides
   with settlement colliders as it already does with terrain (one
   collision set, injected). Inside a shell (the stilt hut) the camera
   must not put walls between itself and the player: research how
   Breath of the Wild / Tears of the Kingdom handle interiors (pull-in,
   near-plane fade, cutaway) and adopt one; part 2 runtime item 24.
4. **No paths visible.** Part 2 ground paint moves to the FRONT of part
   2 (owner asked at both check-ins).
5. **Stilt hut sunk to the ground; stilts and stairs buried; a door
   part sits in the roof.** Cause: the K14 `stilthouseext` row gave a
   water class with a deck datum; on DRY ground the runtime seated the
   deck on the ground. Rule (restating cause 1): a stilt fit seats its
   DECK at the designed clearance above the support surface (water
   surface, or ground under the legs when dry); the clearance comes
   from the plugin refs (median deck height above ground/water) and the
   legs bury as needed; never a water class for a piece on land. The
   door in the roof is the composite's door part at a wrong offset
   after the anchor-scale re-mine: the composite-author skill gains a
   MANDATORY visual step (turntable + cutaway renders of the built
   composite, judged by a Sonnet reader against a what-to-look-at list)
   before a composite ships. A hollow shell with no interior needs no
   door record: the door is a transition (0081) only where an interior
   exists; otherwise the door leaf is a static part.
6. **Mud hut door still wrong, asset judged poor.** Same skill rule as
   5, plus the composite rule: a composite holds only the shell, the
   door the mod placed with it, and a walkway or porch where one was
   mined; everything else is authored per building in the workbench
   (0 of 17 Argonian hut shells has a door in the mesh;
   [building-depth-and-variety.md](../../research/placement-settlements/building-depth-and-variety.md)
   §2, §6 item 2). Source a better
   Argonian hut (BM&V, King of the Murkmire, HTBM already in the pool)
   and replace the composite in the yard.
7. **Boardwalk invisible at 4.273/5.739.** Find why (sunk, culled, not
   published, LOD); the truth table gains a "visible from the ground
   at its coordinates" probe.
8. **Windows.** No building shows a window. Research how vanilla and
   mods do windows (window meshes, glass alpha, night glow) and whether
   the kit build drops them; rule and fix in kit-build.
9. **Cave mouth** has hollow ends and a 6–12 inch threshold. Rule: a
   dug-in piece is EMBEDDED (a terrain patch raises the ground around
   its flanks, or rock pieces close them) and its threshold is flush
   with the approach (sink until the sill meets the ground).
10. **Landing stage's landward end short of the shore.** Rule: the
    landward end reaches the bank where the DECK plane meets the
    ground (not the waterline); extend the run or add the kit's shore
    piece.
11. **Ramp piece** (`passesc128h64d01`) is a ramp, part of a built-ways
    family; connects to nothing. Rule: built ways (ramps, stairs,
    boardwalks, bridges) are chains under the modular-runs skill and
    are only placed as a run with both ends resolved. The yard keeps
    it as a labelled single piece until the ways run exists.
12. **Tower** is wall-height by the mod's design (a wall tower); the
    set has taller towers (`mwimparchtowerbg01`); note in the ledger.
13. **Sconce wall's open ends** are expected (interior piece, no
    exterior evidence); the yard keeps it as the mount exemplar.

**Migration leftover, do in this part:** `ES_ASSET_PIPELINE_ROOT` has
two meanings (vault root in `tooling/world-generation/worldgen/vault.py:41`;
kits root in `blueprint_footprints.py:69`, `blueprint_interiors.py:54`,
`vegetationSolidity.test.ts:40`, `preflight.mjs:61`). Split into a
`ES_VAULT_ROOT`-style vault name and a separate kits-root name, set
neither in the codespace unless needed, and record it in
`tooling/bootstrap/README.md` and the migration plan.

### Owner check-in 3 (2026-09-25): causes, rulings, and every yard defect as a gate

Causes (the read-only diagnosis of 2026-09-25, recorded here in full):
- **Camera swing.** The look target stayed at player + 0.55 m while the
  obstructed camera slid toward the pivot at + 1.15 m, so the view pitch
  followed the arm length (25° at 5.8 m, 71° at 0.25 m) and nodded as a pan
  changed the wall distance. Fix 259b200a: aim along a direction taken at
  full arm (`followCamera.ts`).
- **Wall-run seam.** The compile seats a run on one datum; the export dropped
  `run` and the runtime re-seated every piece on its own ground (destroyed01
  +5.6 cm against the gate). Fix 259b200a: `run {id, index, riseM}` on each
  piece, `anchoring.ts anchorRun` seats the run rigidly.
- **Skirting flicker.** impfreewall01's ImpDirt01 overlay (SLSF1 Decal |
  Dynamic_Decal) duplicates all nine planes of the ImpWall06 band; no decal
  flag was read, so the pair z-fought. 203 materials carry the flag across
  the raw kits. Fix: `blender/build_kit.py` records `decalMaterials`,
  `build_kit.set_alpha_modes` writes the material extra `decal: true`, the
  runtime biases it (259b200a). Rebuilt 2026-09-25: settlement-imperial-v1
  (10 decal materials), settlement-stilt-v1 and settlement-mud-v1 (0). The
  other kits pick the flag up at their next rebuild (kit-build skill).
- **Bamboo hut leaf rotated.** The mined relative yaw is clockwise and
  `import_composite` turned counter-clockwise, so the leaf copied at mined
  120 stood 240° off. Rule: one convention, `yawDeg` IS the mined value and
  the importer converts once (composite-author step 10a); the hand-inverted
  configs (enclosure fence ends, flora canopy parts) were converted to keep
  their shape.
- **Stilt-house leaf 6.256 m from its doorway.** No plugin places that leaf,
  so the ray probe's open front on the far side won the entrance. Fix:
  `interiors_index.composite_leaf_doorways` makes a leaf the composite hangs
  its doorway (`composite-leaf`, ranked after `assembly`).
- **Bush at the farmhouse door.** Groundcover was cleared inside footprints
  only, and scatter had no settlement clearance at all (algrass03b 0.52 m
  from the threshold). Fix: door aprons (1.5 m) on every treatment, and
  `vegetation_patches.settlement_clearance_patches` writes one
  `patch.clearance.settlement.*` patch per treatment (a floor clears its
  footprint and aprons, a deck only its aprons and contacts, so ground cover
  stays under the deck: owner 2026-09-25).
- **Cave mouth** (doorcaveb is an interior tileset piece no plugin places
  outdoors) and **landing stage** (the bank never reaches the 18.60 m deck
  within 40 m; the "1.9 m drop" was to ground under water): DEFERRED by the
  owner (hand-off 2026-09-25 ruling 5) to the 16k carried backlog, where the
  owner's dry-ground rule for the landing stage is written out.

Owner rulings at check-in 3: the landing stage reaches DRY ground first
(0.2 m above the local water surface at the tip and under the closing
piece's whole foot), extended by straight sections or shifted along its
axis, and is closed by the smallest catalogued drop piece whose drop covers
deck minus dry ground, sunk by a recorded remainder; never a step piece
chosen by drop alone (the full rule: 16k § Carried backlog). Groundcover
stays under a raised deck. The yard is never walked again (0099 decision 7):
every defect below is an automatic gate on proving grounds A and B.

Check-in 1–3 defects as gates (`[A,B]` = parametrised over both yards; test
files: `worldgen/test_proving_ground.py` unless named):

| # | Defect | Cause | Gate |
|---|---|---|---|
| C1-1, C1-2 | gate gap, hollow gate and tower faces | modular pieces placed as lone parcels | compile `openModularEnds`; `test_every_yard_run_piece_carries_its_run_contract[A,B]` |
| C1-3, C1-11, C2-5 | stilt hut, boardwalk seated by leg tips; stilt hut sunk on dry ground | stilt fit seated by its legs; water class on land | `test_no_published_yard_piece_floats_or_misplaces_its_sill[A,B]` |
| C1-4 | farmhouse door a body-height up | sink fallback at the mesh bottom | same sill test |
| C1-5, C2-6 | mud hut door beside the hut | assembly offset at the plugin's 1.30 scale | `test_every_yard_composite_door_leaf_stands_in_its_doorway`, `test_every_yard_composite_door_stands_on_its_doorway[A,B]` |
| C1-6, C2-1 | random chairs and tables; rubble ring and skirt | hostless template dressing; K6 ring | `test_a_fixture_carries_no_ring_dressing`, `test_no_yard_dressing_stands_over_water` |
| C1-7, C2-7 | stair, cave, boardwalk not visible | seated below their tops | `test_every_published_yard_piece_shows_above_the_ground_at_its_coordinates[A,B]` |
| C1-8, C2-10, C3-7 | landing stage too high, short of the shore | deck datum; no dry-ground rule | `test_the_landing_stage_starts_at_the_shore_and_ends_at_the_hull` (A); the dry-ground gate is deferred (16k backlog) |
| C1-9 | ferry raft, sign post not solid | no collider sidecar | `worldgen/test_kit_colliders.py` |
| C2-2 | buildings flash | build-effect cleanup, depth twins, alpha test (5d854e98) | `packages/game-core/src/settlement/settlement.test.ts` depth-twin pair check |
| C2-3, C3-1 | camera clips; camera swings at a wall | no settlement collision; look target below the pivot | `packages/game-core/src/camera/followCamera.test.ts` (collision, view pitch under obstruction) |
| C2-5 | stilt-house door in the roof | leaf at the shared origin | `test_the_door_leaf_check_fails_on_the_shared_origin` plus the leaf test |
| C3-2 | wall-run joints off | per-piece re-seat | `test_every_yard_run_piece_carries_its_run_contract[A,B]` (each `riseM` equals the compile's laid rise); `runs.test.ts` (the rigid seat) |
| C3-3 | skirting flicker | decal overlay without a flag | `test_every_yard_decal_material_ships_flagged[A,B]`; `pipeline/test_build_kit.py::test_set_alpha_modes_flags_a_nif_decal_material_and_only_it`; `decal.test.ts` |
| C3-4 | bamboo hut leaf turned | importer yaw sign | `test_every_yard_door_leaf_lies_in_the_plane_of_its_doorway` (built geometry); `pipeline/test_build_kit.py::test_every_templated_composite_part_carries_its_mined_yaw` |
| C3-5 | bush at the farmhouse door | no apron, no scatter clearance | `test_no_scatter_stands_in_a_yard_door_apron[A,B]`; `test_vegetation_patches.py::test_the_settlement_patches_match_the_published_treatments`; `groundTreatment.test.ts` |
| C2-9, C3-6 | cave mouth hollow, high sill | interior piece used outdoors | deferred (16k backlog) |
| C2-4 | no paths | ground paint not built | 16k row G1 |
| C2-8 | no windows | kit-build research | 16k checklist "windows glowing at night" (item 28, done) |
| C1-10, C2-11, C2-12, C2-13 | wall ends, lone ramp, tower height, sconce wall ends | by design or a labelled single piece | none (accepted at check-in 2) |

### Commit state

The check-in 2 fixes are committed (2026-09-24): runtime `5d854e98`,
yard and kits `cbf94703`, and the docs commit with this brief and the
ledger. The rest of the tree (miner, KotM, building-breadth, combat and
sound lanes, other docs) is other lanes' uncommitted current work, not a
crash. Commit by pathspec only.


### Owner decisions on kit sourcing (2026-09-24)

From
[building-depth-and-variety.md](../../research/placement-settlements/building-depth-and-variety.md):
- King of the Murkmire meshes: **RULED 2026-09-24**, usable; the owner
  holds permission from every mod author in the pool.
- The Dragonborn door for Mud Mother's hut: may we take it from your own
  Dragonborn DLC archive? Pending the owner's depot check.
- Jet's building kit: **RULED 2026-09-24**, usable; permission held.
- Missing archives (KotM plan § 5.1): may we bring the Skyrim SE/AE
  resource pack (`_ResourcePack.bsa`), the Creation Club archives (Fish,
  Curios, Saints & Seducers, `_shared`) and the Dawnguard, HearthFires
  and Dragonborn archives into the vault? The vault holds the 2011 depot
  you pulled; an SE/AE depot pull, if you own it, unblocks the KotM mud
  huts, Ayleid ruins and 184 tree meshes.
- KotM and AI (plan § 5.2): **RULED 2026-09-25**. The author's "no AI"
  clause concerns creating art, not coding. Our use (the assets
  unchanged, no generated art) is within the permission. KotM voice
  lines are never used.
- Tropical Skyrim (skyrim 33017): **RULED 2026-09-24**, covered. Its
  page says "you MUST contact me and obtain permission before ...
  using its contents in your own mod"; the owner's statement of
  2026-09-24 (permission held from every author in the pool) covers
  it.
- Stone cities and forts in a tropical repaint: **RULED 2026-09-25**,
  permission held for both mods below; download and use them (part 2
  item 38). Tropical Skyrim repaints no Markarth, Winterhold or
  fort texture and only one Windhelm map (breadth doc §2). The only full
  repaints found are SCO Tropical Edition v2 (Tamikonelf and AceeQ,
  skyrim 69382: Markarth, Windhelm, Winterhold, High Hrothgar, Imperial
  forts, caves) and New Windhelm summer and tropical edition v2
  (tamikoneolf, skyrim 63649: all of Windhelm, built on Osmodius's
  Windhelm Texture Pack, skyrim 54322). Neither page states terms. Under
  decision 0098 §2 as amended, these families need no repaint to pass
  the texture rule; they still fail the silhouette rule, so a repaint
  would matter only for pieces that pass it (Markarth or Windhelm stone
  used as an alias target, or a fort wall).


## Visual ingestion (owner rule 2026-09-20; supersedes plan §8's six-image cap for subagents)

Validate with tooling, measurements and probes first. Then **use Sonnet
subagents for visual ingestion, liberally**: a Sonnet agent (the `run`
agent type, or `general-purpose` with `model: sonnet`) is given the path
of an image rendered by tooling and a careful prompt saying exactly what
to look at and how to report; it describes what it sees and answers each
question with the visible evidence. The planner (Fable) ingests at most
six images itself per part, only where a Sonnet report leaves the call
genuinely open. Every Sonnet report is kept in the ledger beside the
number that later replaced the judgement, if one did.

The prompt template lives in the `kit-qa` skill (deliverable 20) and is
used from part 1 onwards. It always contains: what the image is
(assembly, plan, contact sheet, studio shot), the camera and scale, the
list of things to check, one per line ("does the arch have a visible
opening at ground level", "is the door sill level with the ground line
drawn in red", "does any piece cast no contact shadow and appear to
float"), the answer format (one line per check: `PASS`/`FAIL`/`UNSURE` +
what was seen, in metres where a grid is drawn) and the rule that the
agent proposes no fixes. Illegible shots (wrong framing, light, distance)
are re-rendered, not judged (owner amendment (a), plan §8). Off-world
renders are cheap and unlimited; do not run many slow probes on the built
world, the owner prefers quick visual checks there themselves.

## Record reads (decision 0066) — deliverable 0

`compile_settlement` and `settlement_ground_control` are the last two rows
in `worldgen/record-reads-allowlist.json`. `waterOk`, the door-on-land
test, the stilt over-water share, the flood band per section (97 B4) and
dock depth (B5) read the coarse flood band or decode the water image, so
every blueprint describes the pre-16c water. Port them to
`ProvinceSurvey.water_at / reach / body / nearest_water_entity`, delete
the reads and the rows (16j needs the allowlist empty); a parcel's
`waterOk` reason names the body or reach id and its kind. Test: every
blueprint water fact and every over-water placement joins to its id and
fails on a missing id or a disagreeing kind, shown failing on the five
shipped blueprints.

Add the `kotm` set (King of the Murkmire, worldspace `ArgoniaWorld`) to
`mine_assemblies`, `mine_mounts`, `mine_abuts` and `mine_door_links`,
sample first per `kit-mining` (KotM plan § 3.1, § 3.4:
[king-of-the-murkmire-adoption-plan.md](../../research/placement-settlements/king-of-the-murkmire-adoption-plan.md)).

**Rule scope, decided in 16g (binding):** the `argonian-stilt` 15–30 %
over-water share is asked only of a district whose parcels touch a
recorded body, reach or flood band by id; `works-quays-flood-section`
only of a works parcel that does; a district on dry high ground is out of
scope. The known-red register is empty; it must still fail if a row in
scope quietly passes (make it fail once on a synthetic in-scope district).

Ground contact is the second thing read from its source rather than
guessed: deliverable 1.

## Deliver

Each item names its proving test, **shown failing first** on the current
tree or bundle. The suite is 517-green today through every defect; a new
gate that passes on the current bundle is not a gate.

### Part 1 — kit truth and the runtime boundary (to owner check-in 1)

0a. **Reconcile.** Run the `routing-audit` skill on this brief. Fix the
    mode of `settlements.json` (0600 → 0644). Diagnose the zero-removed
    clearance receipt: re-run `apply_vegetation_patches` on a scratch copy
    of two chunks a track crosses and report instances removed; if the
    shipped bundles were not pruned, the 16g stage is red and is fixed
    here; either way the receipt must afterwards carry the pre-patch
    instance count so "nothing to remove" and "removed on a previous run"
    read differently. Apply the 16g record remedies queued for this chunk
    (Blackrose centre onto the island in `body.1284-3448`; entrances on
    the bank for `underwaterAccessDetail` villages) through
    `plot-remedies.json` and 16g's stages from `apply_sitings` (data below
    the gate; nothing above re-runs); confirm on the 2D map (`?cat=1`).

1. **Designed ground contact per asset** (`designedSinkM`; 0066, 0071
   §7). For every kit asset, mine how its makers placed it: every
   reference to the base object in Skyrim.esm and the source mod's
   plugin, pivot z minus `esp_index.height_at`, the method
   `mine_placement.py:195-217` already uses. Record on the kit manifest
   `designedSinkM: {p25, p50, p75, n, slopeTermMPerDeg, evidence: "plugin"}`.
   Where an asset has no placements: first ask whether an asset that
   *does* have placements is a straight, lore-consistent swap (one hut or
   fence piece for another of the same culture and role); record the swap
   in the sourcing log. Otherwise measure the mesh: the lowest door sill,
   the floor plane, the bottom step, the foundation course top, the stilt
   foot, the hull waterline; the tell differs by asset type and the list
   of tells is recorded per type in the kit manifest's `groundLineTell`
   with `evidence: "mesh-sill"`. `anchoring.ts` sinks by the asset's
   value; `placement-policies.json` survives only as `buryCapM` and a
   fallback the export lists as a gap. The stilt exemption goes
   (`anchoring.ts:62`); route structures enter the ground audit. Hulls get
   `designedWaterlineM` the same way, from placements over water. Tests:
   every kit asset carries `designedSinkM` with evidence; a `mesh-sill`
   value that leaves the sill more than 0.1 m off the ground line fails;
   shipped-bundle replay: floats > 0.3 m == 0, sills within 0.15 m of the
   ground.

2. **Mounts** (D10). Anchor class `ground / wall / ceiling / deck / water`
   and `parentPlacementId` from `placement_metadata.py` through the
   manifest to the bundle; the layer positions a child from its parent's
   runtime transform. Derive how each mounted asset is mounted **from the
   plugins**: extend the assembly miner (`kit-assemblies-mined.json`'s
   pair-template method) to child–parent pairs where the child's anchor
   class is wall, ceiling or deck: for each reference of a hanging or
   wall-mounted base object, the nearest parent reference whose bounds
   contain the child's pivot, the attachment offset in the parent's local
   frame, aggregated per (child, parent) into `kit-mounts-mined.json` with
   sample counts. The compile mounts ours the same way, on the same parent
   asset at the same point. A `water` child (a hull) sits on the recorded
   level of the reach or body its berth names, sunk by
   `designedWaterlineM`, never on the ground beneath. Tests: no asset
   whose geometry hangs below its pivot is grounded by the ground rule;
   every wall/ceiling child names a parent placement and its offset
   matches a mined template within 0.1 m; every hull's waterline is within
   0.1 m of its berth's recorded level.

3. **The rotation sign, pivot offsets, pitch.** Negate the runtime
   rotation in `finalPlacementTransform` and `solidFrom` (three.js
   `setFromAxisAngle(+θ)` is the compile convention's R(−θ), audit §5);
   apply `originOffsetM[0..1]`; honour the `pitchDeg` 16e puts on span
   placements. Fix the sign in one place; never touch the compile
   convention. Test: LOD0 corners via `Matrix4` equal the export's
   footprint within 0.05 m on every shipped placement (fails today on 691
   pieces).

4. **Real collision** (D7). `mesh` pieces export convex parts or a
   trimesh index from the kit build through the same path rocks use
   (`floraSolids.trimeshFromGeometry`, 0071 §5); `solidFrom` refuses a
   `mesh` placement without parts; `SettlementColliders` gains the
   convex/trimesh path. Re-measure the part budget (0052; 1,600 today)
   from the rebuilt bundle rather than raising it by hand. Tests: a ray
   through the Lilmoth gate's archway passes; no `mesh` placement without
   parts; the budget test fails on a bundle one part over. Collision must
   be final enough for 10b's navmesh bake (0062).

5. **Buildings step down the ladder** (0071, 0075). Every settlement and
   route-structure kit asset carries a `lodLadder` stepped from the camera
   with no merged rungs, a card tier baked from its own mesh or an
   explicit `card: none` with the draw distance covering the loaded ring
   and wind stiffness 0. Measure what `lod.ts` and the kit build do today
   before writing; port, do not duplicate, the flora path. Test: the 0073
   one-copy-per-pixel walk passes on every settlement ladder; nothing
   fades to nothing inside the loaded ring.

6. **Kit data shipped and compressed.** Copy `.connectors.json`,
   `.footprints.json`, `.interiors.json` beside the 21 published kit pairs
   (small JSON; measure the bytes against the site budget, standard 16);
   confirm every published GLB went through `kit_compress.py`; fix the two
   kit-lane backlog rows (stray decimated LODs, cross-pool texture
   precedence). Test: a published kit without its three sidecars fails the
   export; the site budget gate reads the new bytes.

7. **Composites and snap checks on runtime transforms** (D1, D2, D4).
   `compile_settlement` expands `composite:` refs from
   `kit-assemblies-mined.json` (proved on Lilmoth's 52); connectors,
   fronts and doorways are in the bundle; `check_abuts_snap` re-runs on
   the runtime transforms; doors bind to the mesh doorway. Test: fails
   today on every rotated pair; a composite ref that names no template
   fails the compile.

8. **The assembly renderer and the sheets** (D13, plan §8). Extend
   `render_sheet.py` to render an assembly, a list of
   `(assetId, positionM, yawDeg, parentId?)`, from four fixed cameras and
   a plan view, with collider wireframes, the designed ground line drawn
   in red on every piece, the front arrow and the doorway marks, a 1 m
   grid. Render: the Lilmoth gate + wall + tower assembly; every template
   in `kit-assemblies-mined.json`; a per-kit sheet of every asset with its
   ground line and mount points; each mined mount pair. Every sheet goes
   to a Sonnet agent with the protocol above; the planner reads the
   reports, fixes shared causes as rules (97 §C and a
   `blueprint_integration` check, never per-piece), re-renders. What the
   owner sees at check-in 1 is the residue: the sheets the rules still
   flag and one sheet per culture that passed.

9. **The proving ground, export gates and the replay.** Stand up a
   scratch yard, `world/sources/sites/proving-ground.json` (a site record
   with `fixture: true`: excluded from the catalogue, the quests, the
   density budget, the shipped-build export and every province count; shown in
   the studio under the settlements layer at its own
   `?view=character` URL), on an empty stretch of real frozen ground
   chosen by measurement: no live record within 300 m, mean slope under
   5°, a recorded body or reach along one edge so a hull can float. It
   carries one instance of every mechanism the runtime must draw right:
   the Lilmoth gate + wall + tower assembly from the mined template; a
   stilt hut with its deck and a kit stair; a mud hut and an Imperial
   house on their designed sink; a lantern on a post and a sign on a
   wall from `kit-mounts-mined.json`; a hull at a berth on the recorded
   level; a cave entrance piece (16i's sixth exemplar will use the same
   kind); a fence run and a boardwalk length. It compiles through
   `compile_settlement` like a place and is the walk at check-in 1; part
   2 adds a pad, a clearing and an added rock group to it (item 16). It
   stays in the tree as a regression fixture: every 16h test that walks
   a bundle runs on it. Also: GLB header and chunk-length parse on every
   published kit; `test:placement` selects by directory or marker; the
   `shippedWithKnownErrors` waiver removed (pads are patches from part 2;
   until then a pad-needing parcel is reported, not waived). Rebuild the
   five stale blueprints' bundle on the frozen ground
   (`rederive_blueprints` → `compile_settlement` →
   `export_settlement_bundle`) **as a numeric fixture only** for the
   replay tests of items 1–7 (733 placements is a better sample than the
   yard); nobody walks it and its layout is not judged. Test: a truncated
   GLB fails; a new test file under the directory is collected without
   editing `package.json`; the shipped-build export refuses a `fixture: true`
   site.

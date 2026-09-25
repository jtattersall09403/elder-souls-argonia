# 16h — The building blocks: kit truth, the settlement runtime, doors, patches and the picture-checking loop

> **Part 2 SUPERSEDED 2026-09-25** by the place loop (decision
> [0099](../../decisions/0099-places-are-built-in-a-loop-until-the-skill-is-proven.md),
> brief [16k](16k-place-loop.md)). Part 1 closes with the check-in 3 fix
> round and then 16k slice 1 takes over. Part 2's items 10–38 and part 1's
> open items stay below as their text; 16k § Carried backlog takes them by
> number, one slice at a time. Do not run `deliver 16h part 2`.

**Goal.** Give the two chunks after this one (16i, the exemplars; 16j, the
rollout) every mechanism they need and none of the design work. After
16h: every kit piece is understood (how it sits in the ground, what hangs
off what, its real collision shape, how it fades with distance); the
runtime draws a placed piece where the compile put it; every kind of
thing a place needs to be walkable (ways, stairs, docks, hulls, entrance
pieces, route structures) can be placed by the compile; every door is a
stable record with a reachability verdict and an empty slot for its
interior; a place can level a pad, clear its vegetation and add its own
set dressing as **local patches** that touch only their own tiles and
chunks and rebuild nothing above them; and a picture-checking loop
(`kit-qa`) lets a fresh agent judge an assembly or a plan from rendered
sheets with cheap Sonnet eyes. Design happens in 16i; this chunk proves
its mechanisms on off-world sheets, on tests that were first made to fail,
on a **proving ground** (a scratch yard on real frozen ground, not a
catalogue place, carrying one of everything: § Deliver item 9) and on
one small exemplar set of the road chunk's recorded structures and the
Drowning Gate ferry. The owner never walks a designed place in 16h,
because none is designed until 16i.

**Delivered in two parts, one fresh agent each, an owner check-in after
each** (owner 2026-09-20): `deliver 16h part 1`, `deliver 16h part 2`.
A part may span more than one session if it must (end at a commit,
PROGRESS.md says where; the next session resumes the same part); the
check-in happens once, at the end of the part. § Owner check-ins says
what each shows and why it sits there; § Delivery plan says how each
part runs with subagents in parallel.

Needs ruling 12 (plan §8, given 2026-09-11), amended by the owner's
2026-09-20 rule on Sonnet visual ingestion (§ Visual ingestion).

## How the three chunks fit (read this once)

```
16h  building blocks     kit truth · runtime · door records · renderable kinds ·
                         three patch kinds · route-structure exemplar set · kit-qa
        │
16i  exemplars           six places designed on paper (check-in), built, walked
                         (check-in), steers → rules, interiors tier A, skill v2
        │
16j  rollout skill       one region packet through the skills unattended:
                         plans (check-in), build + walk (check-in); roadmap;
                         Phase 16 closes
        │
15   rollout             one pass per packet from the roadmap, the same rhythm
```

This chunk designs no place. Three things that need no design carry it;
the owner walks two of them: off-world rendered sheets of
assemblies; the **proving ground**, a scratch yard on an empty stretch of
real frozen ground beside recorded water, holding one instance of every
mechanism (a gate arch in a wall, a stilt hut with its deck and stair, a
lantern on a post, a hull at a berth, a cave entrance piece with its
door, a pad, a clearing, an added rock group), kept afterwards as a
permanent regression fixture and never exported to the shipped build; and the
**route-structure exemplar set**, real structures the road chunk (16e)
already recorded on real roads, which depend on no place. The five
existing blueprints (`world/sources/blueprints/place.*.json`, 2026-09-09,
hollow: see Starting state) are replayed on the frozen ground **only as
a numeric fixture** for the replay tests (floats, sills, corners); nobody
walks or judges them; 16i re-authors them. Whatever the old 16h plan
said about laying out the five places here is withdrawn (planner
2026-09-20): the owner would have been steering layouts 16i then
discards.

## What this chunk realises and what it leaves to others

- **Realises:** the runtime boundary (rotation sign, per-asset ground
  contact, mounts, real colliders, the quality ladder for buildings); the
  compile's renderable kinds (ways, boardwalks, stairs, docks, landings,
  hulls, entrance pieces, 16e's route structures) with a hard error when a
  kind owns no placement; doors as stable records with reachability and an
  interior-claim slot; the three patch kinds a place uses (`settlement-pad`
  terrain patches, `vegetation-clearance` by tier, the new `dressing-add`);
  the bundle format that the build-out register requires; kit data shipped and
  compressed; the assembly and plan renderers, the Sonnet ingestion
  protocol and the `kit-qa` skill; the **proving ground** (item 9); the
  **route-structure exemplar set** stood up in 3D (one structure of each
  recorded kind and the Drowning Gate ferry with its two berths and
  hulls; the rest `pending: packet`, owner 2026-09-20); the 16g owner
  calls that are record remedies (Blackrose centre onto its island).
- **Leaves to 16i:** the design of the six exemplar places (the five plus
  one dungeon-kind place, 16i part 1 chooses it) as assemblies on the
  frozen ground, their berths and hulls included; the interior side of
  the door (transition, load contract, interior lighting, tier A cells,
  the reserved-door message); the approach checklist; every pad,
  clearance and dressing patch a *place* wants; the `settlement-build`
  skill v2. The three patch kinds are built and proved here on the
  proving ground and the route exemplars; they are used for real places
  first in 16i.
- **Leaves to 10b:** the province navmesh bake. This chunk gives the
  character its step height and slope limit on placed geometry and makes
  the navigation widget honest; it bakes nothing.
- **Leaves to 16j and Phase 15:** every place, route structure and ferry
  berth beyond the exemplar sets. No city pass happens here: cities are
  owner-guided (0062).

## Starting state (2026-09-20; written by the 16h planner from the verified tree; the part 1 agent re-audits it with `routing-audit`)

A mod not yet on this machine (kit source or chain heightfield) is fetched
with `bash tooling/bootstrap/vault-pull.sh mod-sources/<folder>` (or
`--tier chain` for the base heightfield); see tooling/bootstrap/README.md.

**What 16g settled.** 567 live records sited, 567 of 567 (the thirteen
unsited were cut on the owner walk 2026-09-20; four `promise-unmet` rows
stay open as owner calls in `world/sources/sites/plot-homeless-accepted.json`);
171 minor tracks and 134 waterway channels; one travel-service graph
(`world/sources/routes/travel-services.json`, 39 stations, 24 services, 6
dugout-canoe runs); harbour and rootworm stations, design groups,
`ownerGuided: true` on the eight major cities and the opening-scene
places; the promise vocabulary on all 327 dungeon-kind records (world 70
§48, `worldgen/catalogue.py` schema 3); the chain runs by dependency with
receipts (0080). 183 `vegetation-clearance` patches for the tracks are
authored (`world/sources/flora/vegetation-patches.json`, `owner.chunk:
"16g"`). Blackrose Lake is `body.1284-3448` (owner 2026-09-20); the
Blackrose centre move onto its island is queued for this chunk (remedy
plan :46); villages with `underwaterAccessDetail` get their entrance on
the bank and the volume off it (remedy plan :25); the stronghold is
Rockpoint. The stilt over-water share and the quay flood-section rule
scope were decided in 16g (§ Record reads).

**The runtime and compile, verified 2026-09-20 (no commit has touched
them since the 2026-09-11 audit).**
- `packages/game-core/src/settlement/`: 8 files, 1,602 lines including
  the test. `anchoring.ts:91` rotates by `+yawDeg` (wrong sign: median
  heading error 92.7°, 691 of 733 shipped pieces); `:45,59` use
  `originOffsetM[2]` only; `:62` zeroes the stilt gap.
- `SettlementLayer.tsx:142` `solidFrom` falls back to the bounding box
  (`:166-167`); `apps/world-studio/src/character/SettlementColliders.tsx:34`
  builds cuboids only.
- `apps/world-studio/src/navigation/settlementNavigationHandoff.tsx:83`
  returns the literal `blocked-no-navigation-runtime`; its test asserts it.
- `worldgen/compile_settlement.py:597` reads `survey.flood` (gone since
  16d); zero occurrences of "composite" (Lilmoth's 52 composite refs are
  not expanded). `worldgen/record-reads-allowlist.json` has two rows,
  `compile_settlement` and `settlement_ground_control`, both yours.
- `export_settlement_bundle.py:57` `COLLIDER_PART_BUDGET = 1600`; the
  `shippedWithKnownErrors` waiver at `:1063,:1149`; no GLB header check.
- `package.json:24` `test:placement` names ~37 files by hand.
- `apps/world-studio/public/province/settlements.json`: 10.2 MB, mode
  0600, built 2026-09-09 on pre-16b ground; `ladder.json` hides the
  `settlements` and `route-structures` layers (`SHOWN_FROM` = 16h).
- `terrain-chain.sh:269` `[16h]=""`, `:252 DELIVERED_THROUGH="16g"`.
  `rederive_blueprints`, `compile_settlement`, `export_settlement_bundle`,
  `settlement_ground_control` sit above the 16g row in `STAGES`;
  `--check-contracts` prints two `warn: order:` lines that are yours
  (`apply_terrain_patches ← route-structures.json`,
  `rederive_blueprints ← places.json`).

**Kits and kit data.** `tooling/asset-pipeline/output/kits/` holds 25
kits; 20 carry `.connectors.json`, `.footprints.json`, `.interiors.json`
sidecars. `apps/world-studio/public/kits/` holds 21 `.glb` + `.kit.json`
pairs and **no sidecar**. `pipeline/render_sheet.py` (91 lines) renders
single assets. `placement_metadata.py` has no anchor class, no parent
placement, no `designedSinkM` (the word appears nowhere in the repo);
`placement-policies.json` sinks by class (direct 0.08 m, dug-in 0.35 m,
"reviewed" guesses). `worldgen/mine_placement.py:195-217,363` already
computes per-base-object `sinkM` percentiles from plugin references
(`esp_index.height_at`) for flora: the method exists, not the field.
`kit-assemblies-mined.json` (4 sets × 8 templates, 75 doorways) is the
composite source of truth; `exterior-interior-links.json` (571 links over
330 shells) is the door-to-cell source of truth (16i reads it). Three
sourcing rows are OPEN in the
[sourcing log](../../research/placement-settlements/settlement-kit-sourcing-log.md)
(the Argonian cart gate, the one-cart Nordic viaduct deck, the 5.4 m high
crossing with no pier): recorded gaps, shown as gaps.

**Blueprints.** Five, `world/sources/blueprints/place.*.json`, four
dated 2026-09-09 and Lilmoth touched 2026-09-20 by 16g's siting: Lilmoth
(61 parcels, 52 composite refs), Mazzatun (29), Nine-Trunks (15), the
licensed sap camp (7), Wamasu Pond (3). 45 of 733 shipped placements are
composites and all are Lilmoth's; dressing is one wicker chair (237
placements). They are **stale inputs**: replayed here, re-authored in 16i.
`settlement-warning-known-red.json` is an empty list.

**Patches.** Terrain: `worldgen/terrain_patches.py` (181 patches in 20
kinds in `terrain-patches.json`; 118 `route-grade` patches; seven
refuse-never-clamp invariants incl. the 22 m shore guard); 16e's
`grade_routes.py` authors and proves each patch on a scratch window,
`apply_route_patches.py` applies natural → graded and aborts on a
refusal. `grade_settlement_pads.py:294` still writes `refined-height-f32.npy`
in place: the one edit below the gate that is not a patch (0059 §9).
Vegetation: one kind, `vegetation-clearance` (`vegetation_patches.py`,
`apply_vegetation_patches.py` rewrites only the chunks a patch touches,
three workers under the cgroup; `packages/game-core/src/vegetation/vegetationPatches.ts`
evaluates the same list for the groundcover ring, ten parity tests).
**A patch cannot add an instance today**: the only additive path is
`dressing-zones.json` (one zone, the Rockpark boulder field) inside
`compile_scatter`, a province re-run. **The 183 track patches ARE applied in the shipped bundles**, verified on
2026-09-20 by sampling hard-cleared ground in the published chunks: no
survivor stands on it. The `removed: 0, chunksTouched: 0` in
`province/vegetation/vegetation-patches-receipt.json` was a no-op chain
re-run of this idempotent stage rebuilding the receipt from its own zero
counters over the real 2026-09-19 numbers, which are unrecoverable because
no pre-patch scatter was kept. The stage now preserves a prior receipt
whose totals are non-zero and appends the no-op run to `reRuns`, so a
re-run can never again erase what a real run recorded.

**Route structures** (`world/sources/routes/route-structures.json`): 55
(stair 31, deck 17, lip-step 5, bridge 2), each with `pieceRef`,
`walkSurface`, `windowFromM/ToM`, `riseM`; ferries carry `jettyM` and an
operator socket. Never drawn: the layer waits for this chunk.

**Uncommitted in the tree** at the time of writing: the 16g agent's
follow-up round (about 60 files across apps, packages, tooling, world,
docs). Another lane's; commit by pathspec only; run `git status` before
you touch anything and never revert a file you did not change.

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
blueprints are RETIRED to `world/sources/blueprints/retired/` (owner
2026-09-23: the yard is the only fixture). Test-fix rounds 1–7 fixed
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
7. **Migration leftover for this lane:** a batch mode + merge step in
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

### Commit state

The check-in 2 fixes are committed (2026-09-24): runtime `5d854e98`,
yard and kits `cbf94703`, and the docs commit with this brief and the
ledger. The rest of the tree (miner, KotM, building-breadth, combat and
sound lanes, other docs) is other lanes' uncommitted current work, not a
crash. Commit by pathspec only.

## Read (fresh agent: this is your whole map; read the section named, not the file, unless "in full" is said)

- This brief in full, then the plan [README](README.md) §3 (the ladder
  rules), §8 (kit QA and the image budget as amended), §6 rows C1, C4,
  D1–D13.
- [research/phase16/audit-settlements-delivered.md](../../research/phase16/audit-settlements-delivered.md)
  in full: §5 yaw, §7 the five gates that cannot fail, §9 the ordered fix
  list. Every finding is still true in code.
- Decisions [0052](../../decisions/0052-a-published-bundle-obeys-the-runtime-contract.md)
  (the three non-waivable bundle gates), [0059](../../decisions/0059-terrain-built-once-frozen-base-and-typed-patches.md)
  §8–9 (patches), [0062](../../decisions/0062-dungeons-are-places-interiors-are-a-late-phase.md)
  in full (doors, tiers, the queue), [0066](../../decisions/0066-downstream-stages-read-the-signed-record-never-re-solve-it.md),
  [0068](../../decisions/0068-routes-below-the-gate-records-here-realised-in-16h.md),
  [0070](../../decisions/0070-vegetation-and-dressing-read-the-record.md) §3, §5,
  [0071](../../decisions/0071-every-placed-thing-steps-down-through-bands-and-collides-as-itself.md)
  §1, §5, §7, [0075](../../decisions/0075-lod-is-a-ladder-stepped-from-the-camera.md)
  §1–2, [0080](../../decisions/0080-the-chain-runs-by-dependency-not-position.md)
  and the record this planning round writes,
  [0081](../../decisions/0081-building-blocks-then-exemplars-then-rollout-and-doors-are-transitions.md)
  (the reshaped 16h/16i/16j flow and the door model).
- [16e brief](16e-routes-grading-spans-ferries.md) § What 16e owns,
  §4 structures and `walkSurface`, § ferries; [16f brief](16f-vegetation-on-frozen-water.md)
  deliverable 9 and § Seams; [16g brief](16g-macro-plot-places-adapt.md)
  § Moved out; the [16g remedy plan](../../research/phase16/16g-remedy-plan.md)
  (the rows queued for you); [16i brief](16i-exemplars-end-to-end.md)
  § What 16i needs from 16h (what you are building for).
- [docs/phases/buildout/README.md](../../phases/buildout/README.md)
  § the bundle format register (state variants, door records, the
  interior streaming boundary) and [docs/phases/README.md](../../phases/README.md)
  § Phase 11 → where delivered now (which door work is yours and which
  16i's); [world/80](../../world/80-repo-architecture.md) §63 (the portal
  spec; 0081 fixes what it leaves open).
- [world/97](../../world/97-placement-principles.md) Part C (C5a abuts,
  C8 orientation, C9 doors on ways, C12 dressing, C13 vegetation meets
  buildings, C14 verticality, C15 the Hist) and Part G; [world/96](../../world/96-placement-playbook.md)
  §1, §3.
- [research/rendering/building-placement-rendering-treatments.md](../../research/rendering/building-placement-rendering-treatments.md)
  §3 (contact, skirt, foundation clutter, LOD atlases, navmesh sync);
  [research/placement-settlements/kit-assemblies-evidence.md](../../research/placement-settlements/kit-assemblies-evidence.md),
  [piece-front-derivation.md](../../research/placement-settlements/piece-front-derivation.md),
  [shipped-world-placement-rules.md](../../research/placement-settlements/shipped-world-placement-rules.md)
  (the fourteen rules mined from 186k references; the sheets are judged
  against them), [settlement-form-evidence.md](../../research/placement-settlements/settlement-form-evidence.md);
  [research/rendering/gpu-texture-and-mesh-compression.md](../../research/rendering/gpu-texture-and-mesh-compression.md)
  (standard 16; the tool is `tooling/asset-pipeline/pipeline/kit_compress.py`).
- Code: `packages/game-core/src/settlement/README.md`, `anchoring.ts`,
  `SettlementLayer.tsx`, `lod.ts`; `apps/world-studio/src/character/SettlementColliders.tsx`,
  `apps/world-studio/src/navigation/settlementNavigationHandoff.tsx`;
  `worldgen/compile_settlement.py`, `export_settlement_bundle.py`,
  `blueprint_integration.py`, `grade_settlement_pads.py`, `grade_routes.py`
  (the author-and-prove pattern), `terrain_patches.py` (module docstring),
  `apply_vegetation_patches.py`, `vegetation_patches.py`, `dressing_zones.py`,
  `rock_dressing.py`, `compile_scatter.py` (the instance emission and
  `lodCopies` path only), `mine_placement.py:180-370`, `esp_index.py`;
  `tooling/asset-pipeline/pipeline/placement_metadata.py`, `render_sheet.py`,
  `kit_compress.py`; `packages/game-core/src/vegetation/vegetationPatches.ts`,
  `floraSolids.ts`; `.claude/skills/settlement-build/SKILL.md` (v1 banner
  and §0 only; 16i rewrites it).
- Backlog rows to strike or absorb: `docs/phases/P-polish/backlog.md`
  (order warnings; stilt share and quay section; licensed camp track
  overrun; water crossings: draw what is recorded, list the rest as the
  sourcing gap it is; stray decimated LODs and cross-pool texture
  precedence, both kit-lane work). Find them by their titles; line numbers
  drift.

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

### Part 2 — the place machinery, proven on the route exemplars (to owner check-in 2)

10. **Renderable kinds place geometry** (D6). A declared list, each with
    a hard export error when it owns no placement: ways (painted; laid as
    boardwalk pieces where the culture builds them), canals, approaches,
    docks (`jettyM` long, from the berth record), ferry landings and a hull
    at every berth of its class (`travel-services.json`), the operator
    socket as a stand-in marker, **entrance pieces** for every dungeon-kind
    record with a blueprint (the door of the piece is a door record, item
    11), **underwater-access entrances on the bank** from
    `underwaterAccessDetail`; and 16e's route structures with their
    `walkSurface`. **Exemplar first:** this chunk stands up the
    **route-structure exemplar set**, recorded in
    `world/sources/routes/route-structure-exemplars.json`: one structure of
    each recorded kind (stair, deck, lip-step, bridge), chosen to include
    the Nine-Trunks stair flight and the Xul-Vaat walkway (both on the
    road, outside the village plots), plus the Drowning Gate ferry
    crossing with its two berths and hulls. The berths that belong to the
    six exemplar places are 16i's, with the places. The other structures
    and berths keep their records
    and are placed per packet by 16j and Phase 15 through the same kinds;
    the export lists them as `pending: packet` so nothing is skipped
    silently; the `route-structures` layer (`SHOWN_FROM`) shows what is
    placed. Roads carry their 4E 201 `condition`: a `broken` road's
    structure may be authored collapsed or overgrown where the kit has
    such a piece (16f deliverable 5's condition dressing). The three OPEN
    sourcing rows stay gaps, shown as gaps. Test: each renderable kind
    owns ≥ 1 placement within the exemplar set or a replayed blueprint;
    every exemplar berth has a hull; every placed structure's
    `walkSurface` heights match the record within 0.1 m; every recorded
    structure or berth is either placed or listed `pending: packet`,
    never absent.

11. **Doors as records** (0062 §3, 0081, the build-out register). Every
    enterable shell and every entrance piece gets a stable door id
    `door.<placeId>.<parcelId>.<n>`, one entrance per piece (16i: never
    invent a second), bound to the mesh doorway, with `interiorClaim:
    null`, `interiorStatus: "reserved"` by default, an `arrivalMarker`
    (the exterior point and bearing where the character stands after
    leaving), a `streamingBoundary` slot, plus the reserved-door catalogue
    message reserved in `packages/text-catalogue` (16i writes and reviews
    the text). **The door model is the TES one (0081):** using a door
    moves the character into a separate interior cell and back; an open
    structure with no interior (a deck, a gate arch, a shelter) has no
    door record and is walked through as exterior geometry. **Reachability
    is validated every compile:** the threshold is within 4 m of a way
    (C9) and reachable from it under the step rules of item 12. Test: a
    door 5 m from any way fails; a door with no id fails; ids are stable
    across two compiles; an entrance piece with no door record fails.
    Sample: the 58 replayed doors (47 sit more than 0.5 m from a doorway)
    are the sample; the interiors index re-runs `--kit` for changed shells
    only, never all 23 kits ([audit](../../research/phase16/16h-catalogue-wide-steps-audit.md) step 5).

12. **Stairs, decks and honest navigation** (D8). A real stair or ramp
    piece from a kit per deck link (stockade, Ayleid, dock steps; never an
    invented ramp), referenced by the link; decks and stilt assets that
    ship a built-in stair are read from the kit's geometry (which reach
    the ground by sinking stilts, which expect a piece attached at the
    bottom step: recorded per asset in the manifest with the tell). The
    character gets a step height and slope limit on placed geometry; the
    handoff widget reports what is consumed and says the province navmesh
    is 10b's. Test: collider top within step height of the deck, base
    within step height of the ground, for every deck link; the widget test
    no longer asserts a literal. Sample first ([audit](../../research/phase16/16h-catalogue-wide-steps-audit.md) step 3): a
    15-asset stair-tell golden file (`fixtures/stair-golden.json`, stilts
    and decks with and without stairs, tell written first), then a fresh
    15, before the one full manifest write.

13. **Pads as terrain patches** (D9, C4). Replace
    `grade_settlement_pads.py`'s in-place write with 16e's pattern: an
    author stage writes `world/sources/terrain/settlement-pad-patches.json`
    (a new `settlement-pad` grade kind in `terrain_patches.py`, `KINDS` +
    `GRADE_KINDS`, consuming the shared exclusion-window module
    unchanged), each patch proved on a scratch window with
    `check_invariants`; an apply stage after `apply_route_patches` refuses
    nothing it did not prove; `patch_water --graded` proves no water
    moved. Pads are rare: prefer the asset's designed sink and stilts
    (ruling 9's spirit). A pad re-runs the tile stages for its own tiles
    only (`chain-footprint`); measure and record the seconds per pad. Test:
    the pad receipt reads the shipped raster; a pad inside the 22 m shore
    guard is refused; a pad touches only its own tiles.

14. **Settlement vegetation clearance as patches, realistic by tier**
    (0070 §3, 16f deliverable 9). A blueprint's `hardClear`, `thinned` and
    `kept` become `vegetation-clearance` patches; the applier clears by
    tier as a settlement would: trees and large plants go from plots,
    ways, pads and a margin; low groundcover survives between buildings and
    dies on hard surfaces (ways, pads, floors); the fringe thins on the
    keep gradient; `kept` names the shade and Hist trees the place was
    built around (C15: the Hist is never cleared). The groundcover ring
    evaluates the same list. `compile_scatter` is never re-run for a
    settlement. Test: a patch's receipt names only its chunks; a patch that
    would clear a Hist tree fails; the receipt carries pre-patch counts;
    the TS/Python parity tests extend to the tiers.

15. **Additive dressing as a patch** (new; owner 2026-09-20). A second
    vegetation patch kind, `dressing-add`, that adds placed instances
    locally with no re-run above: either an explicit list
    `[{assetId, positionM, yawDeg?, scale?}]` or a rule
    `{overlay, polygonM, seed}` using the `rock_dressing` overlay builders
    on the polygon only. **Root cause first:** lift `compile_scatter`'s
    instance emission (seat on the shipped ground by `designedSinkM`, the
    0075 `lodCopies` rungs, the bundle encoding) into one function both the
    compiler and the applier call, so a patched instance is
    indistinguishable from a compiled one. Ordinals append after the
    existing instances (an instance stays `(chunk, species, ordinal)`,
    0070); the receipt names chunks and counts added; the runtime reads
    nothing new. Every patch carries `why` and `sources` (a design act is
    lore- and asset-aware). Test: an added instance round-trips through
    the bundle with the same seat and ladder as a compiled neighbour; the
    applier on a chunk with no patch leaves the file byte-identical; a
    patch that adds an instance inside a clearance polygon of a higher tier
    fails. The lifted emission is proved byte-identical on 3 named chunks,
    then a fresh 3, then one full `compile_scatter` run; never a full run
    per edit ([audit](../../research/phase16/16h-catalogue-wide-steps-audit.md) step 8).

16. **Prove the three patch kinds on the proving ground and the route
    exemplar set, small and real.** On the proving ground: one
    `settlement-pad` under the Imperial house, one `vegetation-clearance`
    by tier over the yard with one tree named `kept`, one `dressing-add`
    rock group at the cave entrance piece. On the route exemplars: the
    clearance the Xul-Vaat walkway and the Nine-Trunks stair flight need
    (their `walkSurface` footprint plus the C13 margin); a `dressing-add`
    at the Drowning Gate landings (reeds or rocks by the bank, from the
    region palette, with `why` and `sources`). These are the only patches
    applied to the ground or the bundles in 16h; each is a few tens of
    metres; 16i may re-emit the route ones.

17. **Dressing vocabulary** (D11). Per-rule draws with a distinct-asset
    floor; interior-kit assets never placed outside. Test: ≥ 4 distinct
    assets per place, ≤ 40 % share for any one, on the replayed
    blueprints.

18. **The bundle format the build-out asks for.** `schemaVersion` bumped;
    a `variants` overlay slot (`LocalStateVariant`: a keyed set of
    placements shown or hidden by a world-state key, empty by default) read
    by the layer; `interiorStatus`, `interiorClaim`, `arrivalMarker` and
    `streamingBoundary` on every door record; the bundle's `doors` array
    is the list 16i's door transition consumes. Test: a variant that hides
    a placement hides it in the layer; an old-schema bundle is refused
    with the version named.

19. **The plan renderer.** A plan renderer to PNG per place (footprints
    with front arrows and door dots, ways, pads with their delta in metres,
    clearance polygons by tier, kept trees, stairs, berths and hulls,
    entrances, additive dressing) and per route structure or ferry
    crossing (the structure on its road line with its `walkSurface`, the
    berths with their hulls). Proven here on the replayed blueprints and
    the exemplar set; 16i's check-in 1 is built from it. Sonnet reads every
    sheet against the C-rules with the protocol.

20. **The `kit-qa` skill.** `.claude/skills/kit-qa/SKILL.md`: render an
    assembly, a kit sheet, a plan sheet or an interior-cell sheet (16i
    adds the interior renderer; leave the slot); the Sonnet prompt
    template; the rule list it checks (97 §C) and the
    `blueprint_integration` checks that back each; how a "wrong" becomes a
    rule, never a per-piece fix; the refusal on `ownerGuided` records for
    unattended runs. Runnable per assembly by a rollout agent without the
    owner. Its own step carries the CLAUDE.md rule "Prove on a sample,
    validate on a fresh batch, scale once" for every sweep
    ([audit](../../research/phase16/16h-catalogue-wide-steps-audit.md)).

21. **Chain, gates, docs.** The `[16h]` ladder row lists the stages
    actually delivered (expected: `rederive_blueprints`,
    `author_settlement_pads`, `apply_settlement_pads`,
    `compile_settlement`, `export_settlement_bundle`,
    `settlement_ground_control`, `author_settlement_clearance`,
    `author_dressing_add`; then 16f's `apply_vegetation_patches` cascades),
    `DELIVERED_THROUGH="16h"`, `STAGES` reordered so `--check-contracts`
    prints no `warn: order:`; one chain run from the freeze gate; the
    licensed camp's track overrun fixed while you hold the chain lock.
    Every test above green and shown failing first; audit §7's five gates
    that cannot fail made to fail on their defect first; probe-blueprints
    zero grounding findings on the real formula; `npm test`, typecheck,
    `npm run preflight` green. Docs: the `settlement-build` banner reads
    "runtime correct as of 16h; 16i rewrites to v2"; 97 §C and §G carry
    the rules the sheets produced; world 80 §63 edited to the door model
    of 0081; the backlog rows above struck; the ledger
    `docs/research/phase16/16h-ledger.md` (measurements, Sonnet reports,
    departures from this plan); one decision record for the non-obvious
    choices (the additive patch, the door record fields, the sink and
    mount derivations); the 16i brief's Starting state replaced from the
    ledger's ending state; PROGRESS.md.

22. **Man-made lighting** (owner question, check-in 1, 2026-09-23). A
    light emitter property on mount children (sconces, lanterns),
    switched on and off by the calendar: lit from early evening to after
    sunrise. The runtime reads the property; no per-piece code. Huts
    without windows (0 of the BM&V, HTBM and stilt shells carry a window
    shape, /tmp/wf/checkin2/windows.md) are lit by lanterns and braziers
    placed under this item; the night factor is the settlement layer's
    sun-altitude ramp (`settlement/materials.ts` `settlementNightFactor`).

23. **Host-aware ring dressing** (planner ruling C, K7, 2026-09-23). The
    97 decision 4 ring (`compile_settlement.dressing_count` by parcel
    `use`) stands props on bare ground round the pivot: the owner's
    "random tables" and "random chairs" at check-in 1. Place them against
    wall faces, on porches and decks, and chairs at tables by mined pairs
    (`kit-assemblies-mined.json` templates and `abuts`), never on a ring.
    Fixtures are exempt already (`blueprint.is_fixture`, K7).

Items 24–28 come from check-in 2 and
[building-depth-and-variety.md](../../research/placement-settlements/building-depth-and-variety.md)
(2026-09-24).

24. **Interior camera** (check-in 2 item 3). Inside a shell, occluders
    between the camera and the player fade at the near plane. Research:
    [follow-camera-collision.md](../../research/combat-and-systems/follow-camera-collision.md)
    (§ Open: a per-instance fade attribute and a `discard` in the
    settlement material patch). The exterior pull-in, the gradual return
    and the player fade landed 2026-09-24 (ledger "Check-in 2 fixes:
    runtime").
25. **Base height-blend shader** (check-in 2 item 1): option 1 of the
    seam research, the seam at a building's foot.
26. **Dressing mine** (research §6 item 5). Evidence only, nothing
    placed by code; sample first per `kit-mining`. From the ~227k
    vanilla and ~131k BM&V non-structural refs the assemblies miner
    skips, those within 12 m of shells, per family: counts and offsets for barrels, firewood, benches, lanterns,
    smoke and gardens. Sets: vanilla, BM&V, HTBM and `kotm`; the first
    KotM sample is the Keeba Hollow compounds and the Seekhat-Yol
    platforms (KotM plan § 2).
27. **Kit additions** (research §6 item 4), from the mined groups:
    imperial farmhouse walkways, porches and steps, farmhouse03–06,
    inn01, smith01; stilt shack window panels; mud BM&V hut windows and
    steps, plus the KotM sets of KotM plan § 3.1 (permission held,
    2026-09-24; meshes and textures extracted 2026-09-24;
    `settlement-mud-v1` KotM pieces blocked on the missing archives, plan
    § 5.1); root Phitt window composites; Dagon Fel into the
    existing `hlaalu-domestic` kit (68 Hlaalu pieces; no new Hlaalu kit);
    the window glow effect meshes in a shared kit. Superseded in order
    and scope by item 33.
28. **Window lighting** (check-in 2 item 8). DONE 2026-09-24 (ledger
    "Check-in 2 fixes: runtime"): the kit build carries the NIF glow slot
    as the emissive map and NiAlphaProperty cutouts as MASK; the runtime
    selects glow materials by emissive map and lights them in the emissive
    stage on the sun-altitude night ramp. Left for item 27: the window
    meshes and glow-effect meshes the kits do not yet carry.
29. **Composite-author skill** (research §6 item 2).
    `.claude/skills/composite-author/SKILL.md` §1–2 states the composite
    rule of check-in 2 item 6.
30. **Treatments doc item 17** (research §6 item 3). DONE 2026-09-24:
    `docs/research/rendering/building-placement-rendering-treatments.md`
    §2 state records item 17 as inert before and live after item 28, and
    items 19 and 21 as cut.
31. **Building checks as gates** (research §2 checks, §6 item 7). Front
    face to a path, window openings clear of neighbours and terrain by
    1 m, the minimum dressing set (door, light, personal clutter, one
    roof detail) and the per-settlement variety table of
    [decision 0098](../../decisions/0098-variety-is-measured-per-settlement-not-by-a-template-cap.md)
    (it replaces the 25 % template cap; the workbench's
    repetition-signature command computes the signature 0098 defines).
    They gate the yard and every 16i plan. The workbench commands behind
    them and the building-assembly skill chapter belong to the
    [placement-workbench lane](../lanes/placement-workbench-lane.md).

Items 32–38 come from
[building-asset-breadth.md](../../research/placement-settlements/building-asset-breadth.md)
(2026-09-24). Item 33 absorbs item 27's kit additions.

32. **Replace the Nordic route pieces.** `route-spans-v1` carries the 9
    `nortmpextplat*` Nordic temple platform pieces and `dragonbridge01`;
    `route-structures-v1` carries `wrcastlestairs01` with its platform.
    All fail 0098 rule 2.1 (Nordic burial and castle silhouettes; breadth
    doc §2 table, Recommendations 3). Replace them with pieces that pass
    (the vanilla imperial-fort bridge and stair pieces are the candidates
    the breadth doc names), rebuild both kits, re-lay the runs that use
    them.
33. **The kit plan** (breadth doc Recommendations 2), in this order:
    1. **Unpack and register King of the Murkmire (KotM) first.**
       `pipeline/bsa.py` unpacks `King of the Murkmire.bsa` to
       `extracted/`; register pool `kotm` in `build_kit.py` `dir_pools`
       and `asset_registry.POOLS`; record authorship per folder
       (`argonia/mudhuts`, `blackwood`, `clutter` the author's own;
       `tesak1243` is mwkeep; `denoffen`, `ayleidruins`, `1mjy`
       third-party); then `mine_assemblies` on `King of the Murkmire.esp`
       for mudhut and blackwood templates, sample first per `kit-mining`.
       **Settled 2026-09-24** (KotM plan, Reconciliation): meshes and
       textures are extracted to the vault's `extracted/meshes` and
       `textures` (3,018 files: 2,292 meshes, 726 textures) and the `kotm` pool is registered (2,096
       rows); 692 meshes name textures held only in the SE resource
       pack, Creation Club or DLC archives (plan § 5.1).
    2. **Mud kit** (`settlement-mud-v1`): KotM mudhuts (30 exterior
       pieces) and its 6 interior shells; BM&V hut window01–03,
       windowbox01, steps01–03; KotM clutter (scalefence, scaletent,
       saxhleelfence, saxhleellantern, townlantern, wallbasket,
       hangingfeathers, tamwindchime, buntingline). Retire the Mud Mother
       hut (`mudhut01`, `mudhut01intnew`, the `mudmother-hut-int` shell)
       in the same change; the pool's other 57 pieces stay. The yard
       rebuild takes the retirement: the yard's mud hut becomes KotM
       `mudhut02`.
    3. **Stilt kit** (`settlement-stilt-v1`): the other 50 shack kit
       pieces; KotM blackwood (thatchhouse ×8, house ×5 with platforms,
       roundhut ×3, walkways 8, plankwall ×5, partitions and windows,
       watchtower, stable, watertower ×2, docks 13) once the lore check
       against material-culture.md:21–24 passes.
    4. **Imperial kit additions** (`settlement-imperial-v1`):
       farmhouse03–06, inn01, smith01, farmlonghouse01, the 6 destroyed
       variants, walkway01–04 and the 28-piece walkway kit, the 14
       remaining terraces, ivy ×3, farmwell01; the Solitude farm set
       (sfarmhouse ×3, porch ×3, steps, shed, silo, windmill, lighthouse,
       lumbermill); cyrfarmhouse01–03, smallhouseext, Jet's farmhouse kit
       (235), the BM&V `imp/` exterior 6, the BM&V chimney kit 13,
       wrshutter ×4, imperial tents 2.
    5. **A new Imperial town kit** (`settlement-imperial-town-v1`): the
       Riften timber houses 17, decks 10 and Riften docks 18 for the
       Imperial waterside quarter (Lilmoth, Gideon ports); the Solitude
       named houses 13 as one-off landmark shells (owner question (b)
       below).
    6. **A new fort kit** (`fort-imperial-v1`): vanilla impext 75, tower
       19, stable kit 9, and the Reimperialized impwindow moss ×6: the
       second fort language beside mwkeep.
    7. **Dagon Fel into `hlaalu-domestic`**: shack01–05, housetall ×2,
       awnings, chimneys, window01–02 and doorframe, for Thorn only.
    8. **A shared dressing kit** (`dressing-v1`): fxsmokechimney01/02,
       fxsmokelargeclose01, whfxwindowglow01–04, fxambwindowglow01,
       lampposts, and the vanilla farmhouse dressing set
       (building-depth-and-variety.md §6 item 7).

    Every family passes 0098 rule 2 first. Credits go in root README
    § Credits in the same change.
34. **Owner sourcing list** (breadth doc §4; ask the owner, download
    nothing until permission is recorded):
    - FYX 3D Shack Kit Walls / Roofs (Yuril), SSE 67123 / 67488: real 3D
      boards on the shack kit the stilt kit uses; terms not stated.
    - Keep and Middle Class Houses (kiko), SSE 137960: 7 town houses, 6
      chimneys, a keep; "free to use", credit optional; lore fit to check.
    - Cyrodiil Farmhouse Tileset (Beyond Skyrim), LE 48582: adds the inn
      and windmill to the 3 cyrfarmhouses we hold.
    - Stroti's Stilt House, optional split file, LE 61824: hut and
      platform apart, so the stilt house stands on our own decks.

    Owner questions carried with it: (b) Solitude's named houses and
    Riften's timber houses as Imperial-quarter shells; (c) the FYX
    author's and kiko's permission.
35. **KotM registry origins** (KotM plan § 4.2–4.3).
    `world/sources/assets/registry-kotm.jsonl` records no third-party
    origin and classes 1,111 of its 2,096 rows `misc` (4 `tree` rows for
    246 `argonia/trees` paths). Add `origin` per path prefix from the
    plan's § 4.3 folder-to-origin table, rerun the taxonomy on a
    25-asset sample first, and credit each origin shipped in root README
    § Credits in the same change as its first kit.
36. **Tropical Skyrim v1.1 in the kits.** The vault's `extracted/` took
    the v1.1 update on 2026-09-24 (sourcing log, Tropical row): the
    plugin and the two trunk meshes under
    `meshes/landscape/trees/tropical/` (`anvil_palm_trunk.nif`,
    `anvilgianttrunk.nif`); v1.0 copies sit beside them as `*.v1_0`.
    No kit config, composite or placement record reads those two
    meshes: every reference is to the root-folder copies
    `tropical:landscape/trees/anvil_palm_trunk` and `.../anvilgianttrunk`
    (`meshes/landscape/trees/`, unchanged by the update), in
    `flora-province-v1.json`:185/230, `settlement-root-v1.json`:448/451,
    `probe-gapfill.json`:7–8, `probe-tall-tropical.json`:38/41,
    `placement-policies.json`:200 and `test_build_kit.py`:165/172; the
    only rows naming the updated files are `registry-tropical.jsonl`:22–23.
    No kit rebuild follows from the meshes. The plugin changed
    (1,987,282 → 1,992,588 B; the update readme: "Fixed objects that
    still had snow on them", "The large trees now have proper
    collision"); its readers are `asset_registry.py`:118,
    `mine_groundcover` and `mine_micro_siting`. Whether their records are
    re-mined from v1.1 is the planner's call; the bootstrap snapshot
    (`tooling/bootstrap/snapshot-manifest.json`:971–999) no longer
    matches the vault folder.
37. **Project Rainforest as a second texture overlay.** Add
    `mod-sources/project-rainforest-20636/extracted` to
    `build_kit.vanilla_texture_roots` (build_kit.py:232–250) behind
    Tropical Skyrim and ahead of the vanilla BSA, so a texture Tropical
    leaves unchanged resolves to Project Rainforest's repaint where one
    exists. What it adds (breadth doc §2): Windhelm street and ground
    maps (6 diffuse: whstreetstone01, whroughground*, whdirtbrick…),
    caves 12 diffuse, dungeon root 5, Whiterun 2. Its nordic, imperial,
    dwemer, mines and Riften-dungeon files (192) are vanilla copies and
    change nothing. The per-file classification is
    `docs/research/archive/building-depth-2026-09/diffuse-classes.tsv`
    (pool `PR`). `test_tropical_default.py` gains the second root's
    order; the README.md:157 credit scope widens from "tropical ground
    textures" to "tropical ground textures and the Windhelm street and
    ground and cave repaints" in the same change. Licence: "Patches,
    bugfixes, updates, add-ons, third-party retextures, and the like are
    allowed freely ... as long as due credit is given."
38. **SCO Tropical and New Windhelm tropical repaints** (owner
    2026-09-25: permission held; download and use). Download SCO
    Tropical Edition v2 (Tamikonelf and AceeQ, skyrim 69382) and New
    Windhelm summer and tropical edition v2 (tamikoneolf, skyrim 63649,
    built on Osmodius's Windhelm Texture Pack, skyrim 54322) with the
    Nexus API into `mod-sources/` with hashes, a sourcing-log row, a
    mod-register entry and the README.md credit in the same change. They
    cover Markarth, Windhelm, Winterhold, High Hrothgar, the Imperial
    forts and the caves (69382) and all of Windhelm (63649). They add
    texture overlays in `build_kit.vanilla_texture_roots` the way item 37
    adds Project Rainforest. Under decision 0098 §2 these families still
    fail the silhouette rule (rule 1), so the repaints matter for pieces
    that pass it: Markarth or Windhelm stone used as an alias target, and
    fort walls. Re-derive the breadth doc §2 verdict table after the
    overlay.

Planner rulings (2026-09-24):
- The variety rule is decision 0098's per-settlement table; it replaces
  the 25 % template cap and the earlier ruling that the cap counts
  assemblies.
- A piece may sit where its mod never placed it when it is fitted on
  measured geometry in the workbench and passes a visual check.

## Moved out of this chunk (recorded, not parked)

- Designing any place, including the five: 16i, plans first.
- The interior side of every door (transition, load contract, lighting,
  tier A cells, the reserved message text): 16i, in a lane that runs from
  the start of 16i part 1 on this chunk's door records.
- The province navmesh bake: 10b, which may start once part 1 lands.
- The berths and hulls of the six exemplar places: 16i, with the places.
- Every route structure and ferry berth outside the exemplar set: placed
  per packet by 16j and Phase 15 through this chunk's renderable kinds.
- Water crossings with no recorded pier: the sourcing gap stays in the
  log with its OPEN reason; 16h draws every crossing that has a record.
- The 27 graph bodies missing from the water bundle: 16c's backlog row.

## Acceptance

- The chain ladder row confirmed and `DELIVERED_THROUGH` bumped in the
  delivering commit of part 2; until then a plain run skips the stages
  and their published JSON is stale (plan §3).
- Every test above green and shown failing first; the record-reads
  allowlist empty; every kit asset with `designedSinkM` and an anchor
  class; every door with an id, an arrival marker and a reachability
  verdict; the proving ground compiled, published and excluded from the
  shipped-build export; the Drowning Gate berths with hulls; the three patch kinds
  each applied at least once with a receipt naming only their tiles or
  chunks; the site budget gate reading the shipped kit bytes; `kit-qa`
  runnable.
- Two owner check-ins passed or explicitly accepted as good enough.

## Owner check-ins

Why two and why here: check-in 1 sits where a "wrong" is a rule change
and a re-render (cheap now; every place is built from these rules
later). Check-in 2 sits where the machinery is proven on a handful of
real road structures before 16i builds six whole places with it. Each
check-in is a batch: answer everything in one message; no fix-wait loops.

**Check-in 1 — is the kit truth right?** (after part 1). Off-world sheets
and one walk.
- The kit sheets a rule still flags after the Sonnet pass (expect under a
  dozen) and one passed sheet per culture: for each, "right" or "wrong"
  in one line. Each "wrong" becomes a rule, not a per-piece fix.
- The per-kit ground-line sheets: does the red line sit where a building
  of that kind meets the ground?
- The mount sheets: does every lantern, sign and banner hang from the
  part of the parent it should?
- The proving ground (URL in the ledger; it is a test yard, not a
  place): walk through the gate arch and the open frames; up the stair
  onto the stilt deck; round the huts, which sit on the ground at their
  sills; the lantern hangs from its post and the sign from its wall; the
  boat floats at the berth; the cave entrance reads as an entrance. Say
  what looks wrong in one line each.
- The Blackrose centre on the island in its lake on the 2D map (`?cat=1`).

**Check-in 2 — does the machinery stand up on real ground?** (after
part 2).
- The proving ground again, now with its three local edits: the pad
  under the Imperial house, the clearing with its one kept tree, the
  rocks at the cave mouth. Does the clearing read as cleared and kept,
  not stamped; do the rocks sit like rocks that were always there.
- The route layer, first time drawn (these are the road chunk's own
  recorded structures on real roads, not places): the Nine-Trunks stair
  flight `x=4.517&z=3.608` and the Xul-Vaat walkway `x=1.203&z=5.730`
  with the deck at road height and the trees cleared from its line; the
  Drowning Gate ferry `x=0.458&z=3.132` with a boat at each landing
  sitting on the water and the added reeds or rocks at the bank; the
  exemplar bridge and lip-step (URLs in the ledger).
- One plan sheet of the proving ground and one of the Drowning Gate: can
  you read it in a minute (fronts, doors, ways, clearance tiers, dressing)?
  This is the format every 16i and 16j plan will use; say what is missing
  from it now.
- The `kit-qa` skill file: readable by you in five minutes.
- Say whether the route-structure exemplar set is the right one for
  proving the kinds.

**Check-in 3 yard packet** (republished 2026-09-24 after the check-in 2
fixes; ledger "Check-in 2 fixes: runtime" and "Check-in 2 fixes: yard").
The coordinates are read from the published bundle
(`apps/world-studio/public/province/settlements.json`: 16 placements,
2 doors, 0 dressing objects). Every item in the yard is listed. Open each
link in the studio; `$ES_TUNNEL_URL` is the local studio address.

**How to reply.** One message. For each row, give the item name and
"right" or "wrong: what you see". Skip a row you could not reach and say
so. A "wrong" becomes a fix to a rule or a record, never a nudge to one
piece.

**What changed since check-in 2.**
- The rocks and the band round every building's foot are gone. Where a
  wall meets the ground is left as it is until part 2 blends the ground
  colour into the wall.
- Buildings no longer vanish for a frame while you move.
- The camera stops at walls instead of passing through them. When it has
  to come in close, your character fades out so it does not fill the
  screen.
- Windows glow warm at night, where the building's own model has glowing
  windows. In this yard that is the Imperial house.
- The stilt hut stands on its stilts at the height the mod builds it
  (the deck about 3.5 m up), with its own stair down to the ground. Its
  door is now part of the building, since there is no inside to enter.
- The mud hut is replaced by a bamboo hut from the same mod as the
  boardwalk. Its door is built into it and leads inside.
- The boardwalk was buried to its rails. It now stands at the height the
  mod builds it.
- The cave mouth is sunk until its sill is level with the ground.
- The landing stage is built to reach the bank where its deck meets the
  ground. Here the bank is lower than the deck, so the end is still
  short (see below).

**Known before you walk.**
- Landing stage: the bank near it never rises to deck height (it stays
  1.9 m below the deck within 30 m), so the landward end still stops in
  the air. The fix is the mod's step-down end piece, which comes next.
- Cave mouth: the sides of the rock face are still open. No mod places
  rocks beside this piece, so closing them needs a ground raise, which
  comes next.
- The tall stone stair is still a single piece. It leads nowhere until
  stairs and ramps are laid as a connected way.

| Item | E / S (studio km) | Piece | Studio link | Check |
|---|---|---|---|---|
| Imperial wall, north end (ruined) | 4.237 / 5.681 | `mwimparchwall01destroyed01` | `$ES_TUNNEL_URL?view=character&x=4.237&z=5.681&t=12` | You passed this at check-in 2. No rocks or band stand at its foot now, and the broken end holds steady as you walk past. |
| Imperial gate | 4.237 / 5.688 | `mwimparchwallgate01` | `$ES_TUNNEL_URL?view=character&x=4.237&z=5.688&t=12` | No rocks block the arch now. Walk through it: the camera stays on your side of the wall and does not look through the stone. |
| Imperial tower | 4.237 / 5.696 | `mwimparchwalltower01` | `$ES_TUNNEL_URL?view=character&x=4.237&z=5.696&t=12` | Back the camera into the tower: it stops at the stone rather than going inside. (Its height is the mod's wall tower; the taller towers are a different piece.) |
| Imperial wall, south end (ruined) | 4.237 / 5.703 | `mwimparchwall01destroyed02` | `$ES_TUNNEL_URL?view=character&x=4.237&z=5.703&t=12` | No band sticks out past the broken end any more. |
| Stone stair | 4.252 / 5.675 | `passesc128h64d01` | `$ES_TUNNEL_URL?view=character&x=4.252&z=5.675&t=12` | No rocks at its foot now. It still stands alone (see above); say only if it looks worse than at check-in 2. |
| Free wall with the candle sconce | 4.265 / 5.685 | `impfreewall01` | `$ES_TUNNEL_URL?view=character&x=4.265&z=5.685&t=12` | Stop the camera near it: the base holds steady and does not flicker. |
| Candle sconce | 4.267 / 5.686 | `impwallsconcecandle01` | `$ES_TUNNEL_URL?view=character&x=4.267&z=5.686&t=12` | Still flat against the wall, and still unlit (lighting comes in part 2). |
| Sign post | 4.262 / 5.695 | `signwrpost01` | `$ES_TUNNEL_URL?view=character&x=4.262&z=5.695&t=12` | Unchanged since check-in 2; say only if it has moved. |
| Huntsman sign | 4.262 / 5.695 | `signwrdrunkenhuntsman01` | `$ES_TUNNEL_URL?view=character&x=4.262&z=5.695&t=12` | Its cut-out edges look clean by day, with no dark or see-through blocks round the painted board. |
| Boardwalk | 4.273 / 5.739 | `tamu_wooddock01` | `$ES_TUNNEL_URL?view=character&x=4.273&z=5.739&t=12` | You can see it now: the deck is about 1.1 m above the ground on its posts. Say whether that height looks right for a boardwalk on dry ground. |
| Bamboo hut (replaces the mud hut) | 4.273 / 5.773 | `bamboohut01-with-door` | `$ES_TUNNEL_URL?view=character&x=4.273&z=5.773&t=12` | It is a new building. Its base meets the ground. Say whether it reads better than the mud hut did. |
| Bamboo hut door | 4.274 / 5.776 | (built into the hut) | `$ES_TUNNEL_URL?view=character&x=4.274&z=5.776&t=12` | The door sits in the hut's own doorway, flush, with nothing standing apart from the hut. |
| Imperial house | 4.276 / 5.795 | `farmhouse01-with-door` | `$ES_TUNNEL_URL?view=character&x=4.276&z=5.795&t=12` | By day: the thatch edges and ropes look clean, not blocky. Then open the same spot at night (`t=22` in place of `t=12`): the windows glow warm. |
| Imperial house door | 4.274 / 5.799 | (part of the house) | `$ES_TUNNEL_URL?view=character&x=4.274&z=5.799&t=12` | Stand at the door and turn round: the camera stays outside the house walls. |
| Cave mouth | 4.320 / 5.737 | `bmv doorcaveb` | `$ES_TUNNEL_URL?view=character&x=4.320&z=5.737&t=12` | The step at the entrance is gone: the sill is level with the ground in front of it. The sides are still open (see above). |
| Stilt hut | 4.326 / 5.777 | `stilthouse-with-door` | `$ES_TUNNEL_URL?view=character&x=4.326&z=5.777&t=12` | It stands on visible stilts, not sunk to the ground. Its stair reaches the ground and you can walk up it onto the deck. The door is at deck height in the doorway, not in the roof. Walk inside: the camera does not put a wall between itself and you. |
| Stray chairs and tables (seen at check-in 1) | 4.36 / 5.73 | none | `$ES_TUNNEL_URL?view=character&x=4.36&z=5.73&t=12` | Still none, here or anywhere in the yard. |
| Landing stage | 4.369 / 5.721 | `quay-run-2` | `$ES_TUNNEL_URL?view=character&x=4.369&z=5.721&t=12` | The deck sits just above the water. The landward end is still short of the bank (see above): say whether the gap matches what you see. |
| Ferry raft | 4.381 / 5.725 | `ferryraft01` | `$ES_TUNNEL_URL?view=character&x=4.381&z=5.725&t=12` | It still sits on the water. The edges of the floating pontoon look clean by day, not blocky. |
| Yard centre (overview) | 4.306 / 5.737 | none | `$ES_TUNNEL_URL?view=character&x=4.306&z=5.737&t=12` | Walk round the whole yard: no building disappears for a frame, and no rocks or band stand round any building. |

Still part 2 (not in this walk):
- Paths between the doors: part 2 draws the ground paint first.
- Lit sconces from early evening until after sunrise: part 2 item 22.
- The camera inside buildings that have a real interior: part 2 item 24.
- Blending the ground colour into wall feet: part 2, where the rocks and
  band used to be.
- Tables and chairs set against walls, on decks and at tables: part 2
  item 23.

**Decisions for the owner (2026-09-24)**, from
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

## Gotchas

- Fix the rotation sign in one place; every measurement, snap check and
  pad tilt was made in the compile convention.
- Real collision raises the part count: re-measure the budget, never lift
  it by hand.
- A stair is a sourced kit piece; never an invented ramp.
- `grade_settlement_pads` today writes the graded array in place: never
  run it on the vault array again; the author stage replaces it.
- `apply_route_patches` aborts if the natural array moved and
  `apply_terrain_patches` if the frozen base moved: pads go *after* route
  grading, on the graded array and never touch either.
- One `shared_survey()` per process (the 12 GiB cgroup); three patch
  workers, not six.
- Catalogue and remedy writers dump whole files: run them one at a time
  and the placement tests serially before preflight.
- The province rasters must be still before any settlement compile
  (settlement-build §0); the chain lock in the vault is honoured.
- Sonnet judges what a number cannot; a number replaces its judgement
  wherever one can be written afterwards. Illegible renders are
  re-rendered, not judged.
- Never "correct" a kit asset's designed sink per place; re-measure the
  asset.
- Do not design a place here. If an item seems to need a layout decision,
  it belongs in 16i; record it in the 16i brief's Starting state.

## Delivery plan (written 2026-09-20; the delivering agent follows it and records departures in the ledger)

**Roles** (decision 0079). Fable plans, decides the rules, judges the
Sonnet reports and the sheets, fixes shared causes once and writes every
lane brief with files, mechanism, numbers and the test named. `deliver`
(Opus, low) implements a fully planned lane and commits nothing.
`research` (Opus, low) mines and measures. `run` (Sonnet) runs jobs and
ingests images. `find` (Haiku) looks things up. Lanes run at once only on
disjoint files; a lane that needs another lane's output waits for the
named gate. Every lane brief carries a time budget and Fable checks
elapsed time at every hand-back.

**Part 1 (`deliver 16h part 1`).**
- Step 0: reconcile (item 0a): `routing-audit`; the clearance-receipt
  diagnosis as one `run` job on a scratch copy; the 16g remedies as one
  `run` job. Fable decides what the diagnosis means.
- Step 1, five lanes at once:
  - A `research` → `deliver`: designed sink, hull waterline and mount-pair
    mining (items 1, 2): `mine_placement.py`, the assembly miner,
    `placement_metadata.py`, kit manifests, `kit-mounts-mined.json`.
  - B `deliver`: the runtime (items 3, 4, 5): `anchoring.ts`,
    `SettlementLayer.tsx`, `lod.ts`, `SettlementColliders.tsx`, the kit
    build's collider export.
  - C `deliver`: kit data shipped and compressed, the two kit backlog
    rows, export gates (items 6, 9's gates): `kit_compress.py`, the
    publish step, `export_settlement_bundle.py`'s GLB parse, `package.json`.
  - D `deliver`: record-reads port (deliverable 0) and composite
    expansion + snap checks on runtime transforms (item 7):
    `compile_settlement.py`, `blueprint_integration.py`, the allowlist.
  - E `deliver`: the assembly renderer (item 8): `render_sheet.py`.
  Gate to step 2: A's fields on every manifest, B's Matrix4 test green,
  E renders the Lilmoth gate assembly.
- Step 2 (Fable): the sheet loop. `run` (Sonnet) ingests every sheet with
  the protocol; Fable reads the reports, writes each shared cause as a 97
  §C rule and a `blueprint_integration` check (`deliver`), re-renders.
  Two loops at most, then the residue.
- Step 3: the proving ground (item 9): `research` measures three
  candidate stretches of ground, Fable picks one and lists the yard's
  contents by asset and template id, `deliver` authors the site record
  and its blueprint, `run` compiles and publishes it; then the five-blueprint
  replay as a `run` job with `--out` scratch (numeric fixture only); the
  replay and yard tests; `npm run docs:check`, preflight, commit by
  pathspec.
- Step 4: the check-in 1 packet in PROGRESS.md § Waiting on user and the
  ledger; this brief's part 2 Starting-state lines added under
  § Starting state.

**Part 2 (`deliver 16h part 2`).**
- Step 0: apply the owner's check-in 1 answers as rules (Fable decides,
  `deliver` edits). Each rule is proved on the owner's flagged sheets plus
  ~10 named neighbours with the answers written first, then a fresh 25,
  then one re-mine and one re-render of the diff set only ([audit](../../research/phase16/16h-catalogue-wide-steps-audit.md) step 1).
- Step 1, five lanes at once:
  - F `deliver`: renderable kinds incl. the route-structure exemplar set,
    hulls, landings, entrance pieces, the layer reveal (item 10):
    `compile_settlement.py`, the route-structure placement module,
    `route-structure-exemplars.json`, `ladder.json`.
  - G `deliver`: doors as records and reachability, the bundle format
    (items 11, 18): `export_settlement_bundle.py`, `types.ts`, the layer's
    variant read, `packages/text-catalogue` (the key only).
  - H `deliver`: stairs, decks, step rules, the honest widget (item 12):
    `settlementNavigationHandoff.tsx`, the character step config, the
    deck-link placement.
  - I `deliver`: pads as patches (item 13) then clearance by tier
    (item 14): `terrain_patches.py`, `grade_settlement_pads.py` →
    `author_settlement_pads.py`, `apply_settlement_pads.py`,
    `vegetation_patches.py`, `vegetationPatches.ts` parity, the clearance
    author.
  - J `deliver`: the plan renderer (item 19): `render_sheet.py`'s plan
    mode (E's file; E is finished, so no conflict).
  Then, after I's clearance author lands: K `deliver`: the additive patch
  kind (item 15), with Fable having first specified the lifted emission
  function's signature; L `deliver`: dressing vocabulary (item 17).
- Step 2 (Fable): author the proving-ground and exemplar-set patches
  (item 16: lore- and asset-aware, `why` and `sources` on each) and hand
  them to `deliver` to apply; render the plan sheets; Sonnet pass; fix
  shared causes. The emission lift is proved per item 15 (3 named chunks,
  a fresh 3, one full scatter); the Sonnet loop is capped at two, then
  the residue ([audit](../../research/phase16/16h-catalogue-wide-steps-audit.md) step 7).
- Step 3: the ladder row, order fix and camp-track fix landed; one chain
  run from the freeze gate as a `run` job; two lanes at once: M `deliver`
  the `kit-qa` skill (item 20); N `deliver` audit §7's gates made to
  fail, waiver removal, the replay and receipt tests (item 21).
- Step 4 (Fable): the check-in 2 packet built from Sonnet studio shots of
  the exemplar sites (few, legible, listed in the ledger); docs (item
  21); `docs:check`; preflight; commit by pathspec; the 16i Starting
  state; PROGRESS.md.

**Order of the owner's answers.** A "wrong" at check-in 1 re-opens a rule
and a re-render, never a place. A "wrong" at check-in 2 on a rule is a 97
§C edit and a local re-apply; on a piece is a re-measure of that asset;
on the exemplar set is a record edit and one more small stand-up. Nothing
re-runs the chain above `rederive_blueprints`.

## The story, in plain English (for the owner)

**Where we are.** The land, the water, the roads, the plants and the dots
on the map that say "a village goes here" are finished and locked. What
is not finished is turning a dot into a place you can enter. A week
ago we tried that and got a mess: buildings facing the wrong way,
invisible walls in gateways, huts floating above the ground, lanterns
hanging in mid-air, no paths, stairs you could not reach. The audit found
the reasons. They were few and shared: the program that draws
buildings turned them the wrong way round; it treated every building as
a solid block; it sat every building on the highest bit of ground it
could find instead of the way the building's makers meant it to sit; and
several things the plan said to place (paths, stairs, boats) were never
placed at all.

**What this chunk does.** It builds the toolkit and proves each tool,
without designing a single village. Think of it as sharpening every tool
in the shed before the carpentry starts.

*Part 1: get the building blocks right.* Every building piece we own is
understood: how deep it sits in the ground (read from how the original
game and the mods placed the same piece, thousands of times), what hangs
off what (a lantern from a post, a sign from a wall, read the same way),
its real shape when you walk through it and how it fades with distance
as the trees already do. We also fix the drawing program itself.
Then we render pictures of assembled pieces in a blank test space and a
cheap helper looks at each picture and says what it sees. Anything the
helper keeps flagging becomes a rule. We also build a **test yard**: not
a village, just an empty patch of real ground by real water with one of
everything on it (a gate arch in a wall, a stilt hut with its deck and
stair, a couple of huts, a lantern on a post, a boat at a landing, a
cave entrance). It never ships; it is where the tools are tried. **Your first check** is a handful of those pictures and a short
walk round the test yard: "right" or "wrong" per picture and per thing
in the yard. This is cheap to change now and expensive later, because
every place is built from these rules.

*Part 2: the machinery for places.* With the pieces right, we build
what every place needs: paths that lead to doors, a stair to every
raised deck, a boat at every ferry landing, an entrance piece at every
cave and at every underwater entrance, plus a named door on every
building with a slot waiting for its interior (going through a door will
work as it does in Skyrim and Morrowind: you use the door, arrive
inside a separate room and come back out to the same doorstep). Three
new abilities arrive here, all as small local edits that touch only the
few map squares under them and rebuild nothing else: levelling a small pad
under a building; clearing trees and plants under buildings and paths the
realistic way (big trees go, low grass stays between the huts, the trees
the village was built around are kept, the Hist tree is never touched);
and adding set dressing such as rocks around a cave mouth or reeds at a
landing. These three edits are tried on the test yard (a pad under one
hut, a clearing with one tree kept, rocks at the cave mouth) and used on
real places for the first time in the next chunk. We also stand up a
handful of the road chunk's own structures, which were recorded weeks
ago on real roads and are not villages, so they need no design: one
stair, one walkway, one bridge, one river step and the Drowning Gate
ferry with its boats. **Your second check** is a walk round the test
yard with its three edits, a walk to those few road structures and a
look at one flat plan drawing, because that drawing format is what you
will be steering from in the next chunk.

**What we have at the end.** Building pieces that sit right, face right
and have open doorways; a drawing program that is correct; a way to
place paths, stairs, boats, entrances and doors; three kinds of small
local edit for pads, clearings and dressing; a handful of road structures
standing as the pattern for the rest; and a repeatable way to check all
of it from pictures. That is the floor for the next chunk, where the
example places are properly designed, shown to you on paper first, then
built and walked.

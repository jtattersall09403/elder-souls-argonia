# 16h — The settlement runtime made correct, places on the ground, and the kit QA loop

**Goal.** Make the runtime draw every placed piece where the compile put it,
seated as its makers designed it, colliding as its own shape and stepping
down the same quality ladder as the trees; make the compile place what a
place needs to be walkable (ways, stairs, doors, berths, hulls, entrances);
make every change a place makes to the ground and the vegetation a local
patch that touches only its own tiles; and prove the kit rules on rendered
sheets so that a rollout agent can run the same checks without the owner.
Everything a later chunk builds on a place (16i exemplars, 16j packet,
Phase 12 interiors, Phase 15 rollout) is judged on what this chunk fixes.

**Delivered in three parts, one fresh agent each, an owner check-in after
each** (owner 2026-09-20): `deliver 16h part 1`, `deliver 16h part 2`,
`deliver 16h part 3`. § Owner check-ins says what each check-in shows and
why it sits where it does; § Delivery plan says how each part runs.

Needs ruling 12 (plan §8, given 2026-09-11), amended by the owner's
2026-09-20 rule on Sonnet visual ingestion (§ Visual ingestion below).

## What this chunk realises and what it leaves to others

- **Realises:** the runtime boundary (rotation sign, colliders, per-asset
  ground contact, mounts, quality bands); the compile's renderable kinds
  (ways, boardwalks, stairs, doors as records, berths and hulls, landings,
  dungeon and underwater entrances); 16e's route structures drawn for the
  first time; pads as terrain patches; settlement vegetation clearance as
  patches; a new **additive dressing patch** (scatter added locally as
  set dressing); stable door ids with an interior-claim slot and a
  reachability gate; the bundle format required by the build-out register;
  the kit data shipped and compressed; the assembly renderer, the Sonnet
  ingestion protocol and the `kit-qa` skill.
- **Leaves to 16i:** re-authoring the five exemplar blueprints as
  assemblies on the frozen ground, tier A interiors, the door transition
  and the interior load contract, the approach checklist on the ground,
  the `settlement-build` skill v2. This chunk compiles the five *existing*
  blueprints (re-derived on the frozen ground) only as proof that the
  runtime is right; their design is 16i's to redo.
- **Leaves to 10b:** the province navmesh bake. This chunk gives the
  character its step height and slope limit on placed geometry and makes
  the navigation widget honest; it bakes nothing.
- **Leaves to 16j and Phase 15:** every place beyond the five. No city
  pass happens here: cities are owner-guided (0062). The Blackrose centre
  move the owner called in 16g is a plot-record remedy, applied at the
  start of part 2 through 16g's remedy machinery (§ Deliver, item 0b).

## Starting state (2026-09-20; written by the 16h planner from the verified tree)

**What 16g settled.** 567 of 580 live records sited on the frozen world;
13 accepted homeless (`world/sources/sites/plot-homeless-accepted.json`);
171 minor tracks and 134 waterway channels; one travel-service graph
(`world/sources/routes/travel-services.json`, 28 stations, 19 services);
harbour stations, rootworm stations, design groups; the chain runs by
dependency with receipts (0080). 183 `vegetation-clearance` patches for
the tracks are authored (`world/sources/flora/vegetation-patches.json`,
all `owner.chunk: "16g"`).

**What 16g handed you** (quotes in the 16g brief § Moved out and the
[remedy plan](../../research/phase16/16g-remedy-plan.md)):
the stilt over-water share and the quay flood-section rule scope, decided
(§ Record reads); Blackrose's centre onto its lake shore (the record, not
the gate: remedy plan :46); villages with `underwaterAccessDetail` get
their entrance on the bank and the volume off it (remedy plan :25); the
pirate-freeholds zone water identity, open with the owner; the stronghold
reserved at the Empty Steading, reversible. The Blackrose lake is named
`body.1290-3508` in the remedy plan and `body.1284-3448` in the ledger:
resolve which id the graph carries before touching the record.

**The runtime and compile, verified 2026-09-20 (no commit has touched
them since the 2026-09-11 audit).**
- `packages/game-core/src/settlement/`: 8 files, 1,602 lines including
  the test. `anchoring.ts:91` rotates by `+yawDeg` (the sign is wrong:
  median heading error 92.7°, 691 of 733 shipped pieces); `:45,59` use
  `originOffsetM[2]` only; `:62` zeroes the stilt gap.
- `SettlementLayer.tsx:142` `solidFrom` falls back to the bounding box
  (`:166-167`); `apps/world-studio/src/character/SettlementColliders.tsx:34`
  builds cuboids only.
- `apps/world-studio/src/navigation/settlementNavigationHandoff.tsx:83`
  returns the literal `blocked-no-navigation-runtime`; its test asserts it.
- `worldgen/compile_settlement.py:597` reads `survey.flood` (gone since
  16d); zero occurrences of "composite" (Lilmoth's 52 composite refs are
  not expanded). `worldgen/record-reads-allowlist.json` has two
  rows, `compile_settlement` and `settlement_ground_control`, both yours.
- `export_settlement_bundle.py:57` `COLLIDER_PART_BUDGET = 1600`; the
  `shippedWithKnownErrors` waiver at `:1063,:1149`; no GLB header check.
- `package.json:24` `test:placement` names ~37 files by hand.
- `apps/world-studio/public/province/settlements.json`: 10.2 MB, mode
  0600, built 2026-09-09 on pre-16b ground; `ladder.json` hides the
  `settlements` and `route-structures` layers (`SHOWN_FROM` = 16h).
- `terrain-chain.sh:269` `[16h]=""`, `:248 DELIVERED_THROUGH="16g"`.
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
composite source of truth. Three sourcing rows are OPEN in the
[sourcing log](../../research/placement-settlements/settlement-kit-sourcing-log.md)
(the Argonian cart gate, the one-cart Nordic viaduct deck, the 5.4 m high
crossing with no pier): recorded gaps, shown as gaps.

**Blueprints.** Five, `world/sources/blueprints/place.*.json`, all
2026-09-09: Lilmoth (61 parcels, 52 composite refs), Mazzatun (29),
Nine-Trunks (15), the licensed sap camp (7), Wamasu Pond (3). Their
records moved under them in 16g (Lilmoth's centre is now 3597,6325).
`settlement-warning-known-red.json` is an empty list.

**Patches.** Terrain: `worldgen/terrain_patches.py` (kinds
`poling-channel`, `terrain-request`, `bed-cut`, `levee`, `route-grade`;
seven refuse-never-clamp invariants incl. the 22 m shore guard); 16e's
`grade_routes.py` authors and proves each patch on a scratch window,
`apply_route_patches.py` applies natural → graded and aborts on a
refusal. `grade_settlement_pads.py:294` still writes `refined-height-f32.npy`
in place: the one edit below the gate that is not a patch (0059 §9).
Vegetation: one kind, `vegetation-clearance`; `apply_vegetation_patches.py`
rewrites only the chunks a patch touches (three workers under the cgroup)
and the runtime evaluates the same list for the groundcover ring. **A
patch cannot add an instance today**: the only additive path is
`dressing-zones.json` inside `compile_scatter`, a province re-run. **The
shipped receipt `province/vegetation/vegetation-patches-receipt.json`
reports `removed: 0, chunksTouched: 0` for all 183 track patches**; the
16g ledger did not report the clearance result. Either the stage ran on
already-pruned bundles or it removed nothing; the receipt cannot tell.

**Route structures** (`world/sources/routes/route-structures.json`): 55
(stair 31, deck 17, lip-step 5, bridge 2), each with `pieceRef`,
`walkSurface`, `windowFromM/ToM`, `riseM`; ferries carry `jettyM` and an
operator socket. Never drawn: the layer waits for this chunk.

**Uncommitted in the tree:** `packages/text-catalogue/src/entries.ts`
(+5 lines, the 16g hydrology-name export). Another lane's; commit by
pathspec only.

## Read

Read the section named, not the file, unless "in full" is said.

- [research/phase16/audit-settlements-delivered.md](../../research/phase16/audit-settlements-delivered.md)
  in full: §5 yaw, §7 the five gates that cannot fail, §9 the ordered fix
  list. Every finding is still true in code.
- The plan [README](README.md) §3 (the ladder rules), §8 (the kit QA
  loop and the image budget, as amended below), §6 rows C1, C4, D1–D13.
- Decisions [0052](../../decisions/0052-a-published-bundle-obeys-the-runtime-contract.md)
  (the three non-waivable bundle gates), [0059](../../decisions/0059-terrain-built-once-frozen-base-and-typed-patches.md)
  §8–9 (patches), [0066](../../decisions/0066-downstream-stages-read-the-signed-record-never-re-solve-it.md),
  [0068](../../decisions/0068-routes-below-the-gate-records-here-realised-in-16h.md),
  [0070](../../decisions/0070-vegetation-and-dressing-read-the-record.md) §3, §5,
  [0071](../../decisions/0071-every-placed-thing-steps-down-through-bands-and-collides-as-itself.md)
  §1, §5, §7, [0075](../../decisions/0075-lod-is-a-ladder-stepped-from-the-camera.md)
  §1–2, [0080](../../decisions/0080-the-chain-runs-by-dependency-not-position.md),
  [0061](../../decisions/0061-phase-seams-after-16.md) and
  [0062](../../decisions/0062-dungeons-are-places-interiors-are-a-late-phase.md) §doors.
- [16e brief](16e-routes-grading-spans-ferries.md) § What 16e owns
  (:20-34), §4 structures and `walkSurface` (:314-327), § ferries (:334-343);
  [16f brief](16f-vegetation-on-frozen-water.md) deliverable 9 and § seams;
  [16i brief](16i-exemplars-end-to-end.md) :48, :66-69, :117, :138-143
  (what 16i measures against); [16j brief](16j-rollout-skill-and-trial-packet.md)
  :19-32, :56-57, :83-85 (the empty allowlist, entrance pieces).
- [docs/phases/buildout/README.md](../../phases/buildout/README.md) :92-97
  (the bundle format register: state variants, door records, the interior
  streaming boundary) and [docs/phases/README.md](../../phases/README.md)
  :342-347 (which door work is 16h's and which 16i's).
- [world/97](../../world/97-placement-principles.md) Part C (C5a abuts,
  C8 orientation, C9 doors on ways, C12 dressing, C13 vegetation meets
  buildings, C14 verticality, C15 the Hist) and §G; [world/96](../../world/96-placement-playbook.md)
  §1, §3.
- [research/rendering/building-placement-rendering-treatments.md](../../research/rendering/building-placement-rendering-treatments.md)
  §3 (contact, skirt, foundation clutter, LOD atlases, navmesh sync);
  [research/placement-settlements/kit-assemblies-evidence.md](../../research/placement-settlements/kit-assemblies-evidence.md),
  [piece-front-derivation.md](../../research/placement-settlements/piece-front-derivation.md),
  [exterior-interior-linking-in-skyrim-mods.md](../../research/placement-settlements/exterior-interior-linking-in-skyrim-mods.md),
  [settlement-form-evidence.md](../../research/placement-settlements/settlement-form-evidence.md)
  (spacing and orientation statistics the sheets are judged against);
  [research/rendering/gpu-texture-and-mesh-compression.md](../../research/rendering/gpu-texture-and-mesh-compression.md)
  (standard 16's path; the tool is `tooling/asset-pipeline/pipeline/kit_compress.py`).
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
  and §0 only).
- Backlog rows to strike or absorb: `docs/phases/P-polish/backlog.md` :38
  (order warnings), :224-247 (stilt share, quay section), :248-262
  (licensed camp track overrun), :282-300 (water crossings: draw what is
  recorded, list the rest as the sourcing gap it is), :37 and :332 (stray
  decimated LODs, cross-pool texture precedence, both kit-lane work).

## Visual ingestion (owner rule 2026-09-20, supersedes plan §8's six-image cap for subagents)

Validate with tooling, measurements and probes first. Then **use Sonnet
subagents for visual ingestion, liberally**: a Sonnet agent (the `run`
agent type, or `general-purpose` with `model: sonnet`) is given the path
of an image rendered by tooling and a careful prompt saying exactly what
to look at and how to report; it describes what it sees and answers each
question yes/no with the visible evidence. The planner (Fable) ingests at
most six images itself per part, only where a Sonnet report leaves the
call genuinely open. Every Sonnet report is kept in the ledger beside the
number that later replaced the judgement, if one did.

The prompt template lives in the `kit-qa` skill (deliverable 20) and is
used from part 1 onwards. It always contains: what the image is (assembly,
plan, contact sheet, studio shot), the camera and scale, the list of
things to check (one per line: "does the arch have a visible opening at
ground level", "is the door sill level with the ground line drawn in
red", "does any piece cast no contact shadow and appear to float"), the
answer format (one line per check: `PASS`/`FAIL`/`UNSURE` + what was
seen, in metres where a grid is drawn) and the rule that the agent
proposes no fixes. Illegible shots (wrong framing, light, distance) are
re-rendered, not judged (owner amendment (a), plan §8).

Do not run many slow probes on the built world; the owner prefers quick
visual checks there themselves. Off-world renders (assembly sheets, plan
sheets, single-asset sheets) are cheap and unlimited.

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

**Rule scope, decided in 16g (binding):** the `argonian-stilt` 15–30 %
over-water share is asked only of a district whose parcels touch a
recorded body, reach or flood band by id; `works-quays-flood-section`
only of a works parcel that does; a district on dry high ground is out of
scope (Lilmoth's `council-crown` and `hist-court`, the camp's stage and
deck). The known-red register is already empty; it must still fail if a
row in scope quietly passes (make it fail once on a synthetic in-scope
district).

Ground contact is the second thing read from its source rather than
guessed: deliverable 1.

## Deliver

Each item names its proving test, **shown failing first** on the current
tree or bundle. The suite is 517-green today through every defect; a new
gate that passes on the current bundle is not a gate.

### Part 1 — kit truth and the runtime boundary (to owner check-in 1)

0a. **Reconcile.** Run the `routing-audit` skill on this brief. Fix the
    mode of `settlements.json` (0600 → 0644). Confirm the Blackrose lake
    body id against the graph. Diagnose the zero-removed clearance
    receipt: re-run `apply_vegetation_patches` on a scratch copy of two
    chunks a track crosses and report instances removed; if the shipped
    bundles were not pruned, the 16g stage is red and is fixed here
    (the receipt must then distinguish "nothing to remove" from "removed
    on a previous run" by carrying the pre-patch instance count).

1. **Designed ground contact per asset** (`designedSinkM`; 0066, 0071
   §7). For every kit asset, mine how its makers placed it: every
   reference to the base object in Skyrim.esm and the source mod's
   plugin, pivot z minus `esp_index.height_at`, the method
   `mine_placement.py:195-217` already uses. Record on the kit manifest
   `designedSinkM: {p25, p50, p75, n, slopeTermMPerDeg, evidence: "plugin"}`.
   Where an asset has no placements: first ask whether an asset that
   *does* have placements is a straight, lore-consistent swap (one
   hut or fence piece for another of the same culture and role); record
   the swap in the sourcing log. Otherwise measure the mesh: the lowest
   door sill, the floor plane, the bottom step, the foundation course top,
   the stilt foot, the hull waterline; the tell differs by asset type and
   the list of tells is recorded per type in the kit manifest's
   `groundLineTell` with `evidence: "mesh-sill"`. `anchoring.ts` sinks by
   the asset's value; `placement-policies.json` survives only as
   `buryCapM` and a fallback the export lists as a gap. The stilt
   exemption goes (`anchoring.ts:62`); route structures enter the ground
   audit. Hulls get `designedWaterlineM` the same way, from placements
   over water. Tests: every kit asset carries `designedSinkM` with
   evidence; a `mesh-sill` value that leaves the sill more than 0.1 m
   off the ground line fails; shipped-bundle replay: floats > 0.3 m == 0,
   sills within 0.15 m of the ground.

2. **Mounts** (D10). Anchor class `ground / wall / ceiling / deck / water`
   and `parentPlacementId` from `placement_metadata.py` through the
   manifest to the bundle; the layer positions a child from its parent's
   runtime transform. Derive how each mounted asset is mounted **from
   the plugins**: extend the assembly miner (`kit-assemblies-mined.json`'s
   pair-template method) to child–parent pairs where the child's anchor
   class is wall, ceiling or deck: for each reference of a hanging or
   wall-mounted base object, the nearest parent reference whose bounds
   contain the child's pivot, the attachment offset in the parent's local
   frame, aggregated per (child, parent) into `kit-mounts-mined.json`
   with sample counts. The compile mounts ours the same way, on the same
   parent asset at the same point. A `water` child (a hull) sits on the
   recorded level of the reach or body its berth names, sunk by
   `designedWaterlineM`, never on the ground beneath. Tests: no asset
   whose geometry hangs below its pivot is grounded by the ground rule;
   every wall/ceiling child names a parent placement and its offset
   matches a mined template within 0.1 m; every hull's waterline is
   within 0.1 m of its berth's recorded level. Design further tests that
   make "no lantern hangs from nothing" true in the bundle, not the eye.

3. **The rotation sign, pivot offsets, pitch.** Negate the runtime
   rotation in `finalPlacementTransform` and `solidFrom` (three.js
   `setFromAxisAngle(+θ)` is the compile convention's R(−θ), audit §5);
   apply `originOffsetM[0..1]`; honour the `pitchDeg` 16e puts on span
   placements. Fix the sign in one place; never touch the compile
   convention. Test: LOD0 corners via `Matrix4` equal the export's
   footprint within 0.05 m on every shipped placement (fails today on
   691 pieces).

4. **Real collision** (D7). `mesh` pieces export convex parts or a
   trimesh index from the kit build through the same path rocks use
   (`floraSolids.trimeshFromGeometry`, 0071 §5); `solidFrom` refuses a
   `mesh` placement without parts; `SettlementColliders` gains the
   convex/trimesh path. Re-measure the part budget (0052; 1,600 today)
   from the rebuilt bundle rather than raising it by hand. Tests: a ray
   through the Lilmoth gate's archway passes; no `mesh` placement
   without parts; the budget test fails on a bundle one part over.
   Collision must be final enough for 10b's navmesh bake (0062).

5. **Buildings step down the ladder** (0071, 0075). Every settlement
   and route-structure kit asset carries a `lodLadder` stepped from the
   camera with no merged rungs, a card tier baked from its own mesh or an
   explicit `card: none` with the draw distance covering the loaded
   ring and wind stiffness 0. Measure what `lod.ts` and the kit build do
   today before writing; port, do not duplicate, the flora path. Test:
   the 0073 one-copy-per-pixel walk passes on every settlement ladder;
   nothing fades to nothing inside the loaded ring.

6. **Kit data shipped and compressed.** Copy `.connectors.json`,
   `.footprints.json`, `.interiors.json` beside the 21 published kit
   pairs (small JSON; measure the bytes against the site budget, standard
   16); confirm every published GLB went through `kit_compress.py`; fix
   the two kit-lane backlog rows (stray decimated LODs, cross-pool texture
   precedence). Test: a published kit without its three sidecars fails
   the export; the site budget gate reads the new bytes.

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
   in `kit-assemblies-mined.json`; a per-kit sheet of every asset with
   its ground line and mount points; each mined mount pair. Every sheet
   goes to a Sonnet agent with the protocol above; the planner reads the
   reports, fixes shared causes as rules (97 §C and a
   `blueprint_integration` check, never per-piece), re-renders. What
   the owner sees at check-in 1 is the residue: the sheets the rules
   still flag and one sheet per culture that passed.

9. **Export gates.** GLB header and chunk-length parse on every
   published kit; `test:placement` selects by directory or marker; the
   `shippedWithKnownErrors` waiver removed (it goes with item 13's pads).
   Test: a truncated GLB fails; a new test file under the directory is
   collected without editing `package.json`.

### Part 2 — places on the ground, authored and shown, not yet applied (to owner check-in 2)

0b. **Apply the owner's 16g calls as record remedies** where they change
    a record (Blackrose centre onto the lake shore; the pirate-zone water
    identity if ruled; any of the 13 homeless the owner loosened or cut),
    through `plot-remedies.json` and 16g's stages from `apply_sitings`
    (a data remedy below the gate; nothing above re-runs). Then
    `rederive_blueprints` on the frozen ground for the five.

10. **Renderable kinds place geometry** (D6). A declared list, each with
    a hard export error when it owns no placement: ways (painted; laid
    as boardwalk pieces where the culture builds them), canals, approaches,
    docks (`jettyM` long, from the berth record), ferry landings and a
    hull at every berth of its class (`travel-services.json`), the operator
    socket as a stand-in marker, **dungeon entrance pieces** for every
    dungeon-kind record with a blueprint (16j :56), **underwater-access
    entrances on the bank** from `underwaterAccessDetail`; and 16e's 55
    route structures with their `walkSurface`. Then reveal the
    `route-structures` layer (`SHOWN_FROM`). Roads carry their 4E 201
    `condition`: a `broken` road's structure may be authored collapsed or
    overgrown where the kit has such a piece; the record says which pieces
    exist for that (16f deliverable 5's condition dressing). The three
    OPEN sourcing rows stay gaps, shown as gaps. Test: each renderable
    kind owns ≥ 1 placement; every berth has a hull; every structure has a
    placement whose `walkSurface` heights match the record within 0.1 m.

11. **Doors as records** (build-out register :94-97; docs/phases/README
    :345). Every enterable shell gets a stable door id
    `door.<placeId>.<parcelId>.<n>`, one entrance per piece (16i :46),
    bound to the mesh doorway, with `interiorClaim: null` and
    `interiorStatus: "reserved"` by default, a `streamingBoundary` slot
    and the reserved-door catalogue message reserved in
    `packages/text-catalogue`. **Reachability is validated every
    compile:** the threshold is within 4 m of a way (C9) and reachable
    from it under the step rules of item 12. Test: a door 5 m from any
    way fails; a door with no id fails; ids are stable across two
    compiles.

12. **Stairs, decks and honest navigation** (D8). A real stair or ramp
    piece from a kit per deck link (stockade, Ayleid, dock steps; never an
    invented ramp), referenced by the link; decks and stilt assets that
    ship a built-in stair are read from the kit's geometry (which reach
    the ground by sinking stilts, which expect a piece attached at the
    bottom step: recorded per asset in the manifest with the tell). The
    character gets a step height and slope limit on placed geometry; the
    handoff widget reports what is consumed and says the province navmesh
    is 10b's. Test: collider top within step height of the deck, base
    within step height of the ground, for every deck link; the widget
    test no longer asserts a literal.

13. **Pads as terrain patches** (D9, C4). Replace
    `grade_settlement_pads.py`'s in-place write with 16e's pattern: an
    author stage writes `world/sources/terrain/settlement-pad-patches.json`
    (a new grade kind in `terrain_patches.py`, `KINDS` + `GRADE_KINDS`,
    consuming the shared exclusion-window module unchanged), each patch
    proved on a scratch window with `check_invariants`; an apply stage
    after `apply_route_patches` refuses nothing it did not prove;
    `patch_water --graded` proves no water moved. Pads are rare: prefer
    the asset's designed sink and stilts (ruling 9's spirit). A pad
    re-runs the tile stages for its own tiles only (`chain-footprint`);
    measure and record the seconds per pad. **Authored in part 2, applied
    in part 3.** Test: the pad receipt reads the shipped raster; a pad
    inside the 22 m shore guard is refused.

14. **Settlement vegetation clearance as patches** (0070 §3, 16f
    deliverable 9), **realistic by tier.** A blueprint's `hardClear`,
    `thinned` and `kept` become `vegetation-clearance` patches; the applier
    clears by tier in the way that a settlement would: trees and large plants go
    from plots, ways, pads and a margin; low groundcover survives between
    buildings and dies on hard surfaces (ways, pads, floors); the fringe
    thins on the keep gradient; `kept` names the shade and Hist trees the
    place was built around (C15: the Hist is never cleared). The
    groundcover ring evaluates the same list. `compile_scatter` is never
    re-run for a settlement. **Authored in part 2, applied in part 3.**
    Test: a moved settlement's receipt names only its chunks; a patch that
    would clear a Hist tree fails; the receipt carries pre-patch counts.

15. **Additive dressing as a patch** (new; owner 2026-09-20). A second
    vegetation patch kind, `dressing-add`, that adds placed instances
    locally with no re-run above: either an explicit list
    `[{assetId, positionM, yawDeg?, scale?}]` or a rule
    `{overlay, polygonM, seed}` using the `rock_dressing` overlay builders
    on the polygon only. **Root cause first:** lift `compile_scatter`'s
    instance emission (seat on the shipped ground by `designedSinkM`, the
    0075 `lodCopies` rungs, the bundle encoding) into one function both
    the compiler and the applier call, so a patched instance is
    indistinguishable from a compiled one. Ordinals append after the
    existing instances (an instance stays `(chunk, species, ordinal)`,
    0070); the receipt names chunks and counts added; the runtime reads
    nothing new. Author the first ones as part of place design where a
    place wants them (rocks at a cave mouth, a reed bed at a landing, a
    boulder against a wall foot) and record `why` and `sources` on each.
    Test: an added instance round-trips through the bundle with the same
    seat and ladder as a compiled neighbour; the applier on a chunk with
    no patch leaves the file byte-identical.

16. **Dressing vocabulary** (D11). Per-rule draws with a distinct-asset
    floor; interior-kit assets never placed outside. Test: ≥ 4 distinct
    assets per place, ≤ 40 % share for any one.

17. **The bundle format the build-out asks for.** `schemaVersion` bumped;
    a `variants` overlay slot (`LocalStateVariant`: a keyed set of
    placements shown or hidden by a world-state key, empty by default) read
    by the layer; room for `interiorStatus`, `interiorClaim` and
    `streamingBoundary` on every door record. Test: a variant that hides
    a placement hides it in the layer; an old-schema bundle is refused
    with the version named.

18. **The plan sheet.** A plan renderer to PNG per place (footprints with
    front arrows and door dots, ways, pads with their delta in metres,
    clearance polygons by tier, kept trees, stairs, berths and hulls,
    entrances, additive dressing), plus one province sheet of the 55
    route structures on the road lines and one of the ferry berths. Sonnet
    reads every sheet against the C-rules first; the owner sees the five
    place sheets, the two province sheets and the `?bp=1` studio links.
    Nothing in items 13–15 is applied to the ground or the bundles before
    check-in 2.

### Part 3 — applied, run, gated, packaged (to owner check-in 3)

19. **Apply and run.** Apply the pad, clearance and dressing patches as
    the owner steered; the `[16h]` ladder row lists the stages actually
    delivered (expected: `rederive_blueprints`, `author_settlement_pads`,
    `apply_settlement_pads`, `compile_settlement`, `export_settlement_bundle`,
    `settlement_ground_control`, `author_settlement_clearance`; then 16f's
    `apply_vegetation_patches` cascades), `DELIVERED_THROUGH="16h"`,
    `STAGES` reordered so `--check-contracts` prints no `warn: order:`;
    one chain run from the freeze gate; the licensed camp's track overrun
    fixed while you hold the chain lock (backlog :248).

20. **The `kit-qa` skill.** `.claude/skills/kit-qa/SKILL.md`: render an
    assembly, a kit sheet or a plan sheet; the Sonnet prompt template;
    the rule list it checks (97 §C) and the `blueprint_integration`
    checks that back each; how a "wrong" becomes a rule, never a
    per-piece fix. Runnable per assembly by a rollout agent without the
    owner (16i :68 runs it on every assembly).

21. **Gates shown failing, then green.** Every test above; audit §7's
    five gates that cannot fail made to fail on their defect first;
    `export_settlement_bundle` with no waiver; probe-blueprints zero
    grounding findings on the real formula; `npm test`, typecheck,
    `npm run preflight` green.

22. **Docs.** The `settlement-build` banner reads "runtime correct as of
    16h; 16i rewrites to v2"; 97 §C and §G carry the rules the sheets
    produced; the backlog rows above struck; the ledger
    `docs/research/phase16/16h-ledger.md` (measurements, Sonnet reports,
    departures from this plan); one decision record for the non-obvious
    choices (the additive patch, the door record, the sink and mount
    derivations); the 16i brief's Starting state replaced from the
    ledger's ending state; PROGRESS.md.

## Moved out of this chunk (recorded, not parked)

- Re-authoring the five exemplar blueprints as assemblies: 16i. The
  vegetation clearance and pad patches for those five will be re-emitted
  by 16i when it moves parcels; that is by design (patches are cheap).
- The province navmesh bake: 10b, which may start once part 1 lands.
- Water crossings with no recorded pier (backlog :282-300): the sourcing
  gap stays in the log with its OPEN reason; 16h draws every crossing
  that has a record.
- The 27 graph bodies missing from the water bundle: 16c's backlog row.

## Acceptance

- The chain ladder row confirmed and `DELIVERED_THROUGH` bumped in the
  delivering commit of part 3; until then a plain run skips the stages
  and their published JSON is stale (plan §3).
- Every test above green and shown failing first; the record-reads
  allowlist empty; every kit asset with `designedSinkM` and an anchor
  class; every door with an id and a reachability verdict; every berth
  with a hull; the two receipts (pads, vegetation) naming only their
  tiles and chunks; the site budget gate reading the shipped kit bytes.
- Three owner check-ins passed or explicitly accepted as good enough.

## Owner check-ins

Why three and why here (owner 2026-09-20): each sits where a steer is
cheap and a later change would cost a session. Nothing is applied to the
ground or the vegetation until check-in 2 has passed. Each check-in is a
batch: answer everything in one message; no fix-wait loops.

**Check-in 1 — is the kit truth right?** (after part 1). Off-world
sheets and one walk.
- The kit sheets a rule still flags after the Sonnet pass (expect under a
  dozen) and one passed sheet per culture: for each, "right" or "wrong"
  in one line. Each "wrong" becomes a rule, not a per-piece fix.
- The per-kit ground-line sheets: does the red line sit where a building
  of that kind meets the ground?
- The mount sheets: does every lantern, sign and banner hang from the
  part of the parent it should?
- Lilmoth gate `?view=character&x=3.61&z=6.38&t=12:00` (stale design,
  correct runtime): walk through the arch, then any open frame. Pieces
  face the way the blueprint view `?bp=1` shows.

**Check-in 2 — are the places laid out right, before the ground is
touched?** (after part 2). 2D only.
- Five place plan sheets: buildings, fronts, doors on ways, stairs to
  decks, berths with hulls, entrances on the bank, pads (with their
  height change), the clearance polygons by tier and the kept trees, any
  added dressing. Say where you would move, keep or cut a way, a pad, a
  clearing or a piece of dressing.
- The province sheet of route structures and the sheet of ferry berths:
  any structure or berth that should not be there.
- The Blackrose centre on its lake shore on the 2D map (`?cat=1`).

**Check-in 3 — does it stand and can you walk it?** (after part 3).
- Lilmoth gate: through the arch and every open frame; the harbour
  hull on the water.
- Nine-Trunks `x=4.97&z=3.76`: climb the stair onto a stilt deck; no
  stilt sunk wrong, no deck hanging.
- Mazzatun `x=1.99&z=1.34`: terraces on the ground, faced as `?bp=1`
  shows, no piece floating; the lanterns hang from something.
- The route layer, first time drawn: the Nine-Trunks stair flight
  `x=4.517&z=3.608` and the Xul-Vaat walkway `x=1.203&z=5.730` with the
  deck at road height; the Drowning Gate ferry `x=0.458&z=3.132` with a
  boat at each landing, sitting on the water.
- The clearing around one village and the dressing at one entrance:
  does it read as a place someone cleared and kept, not a stamp.
- The `kit-qa` skill file: readable by you in five minutes.

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
- The `settlements.json` mode 0600 stops a second agent reading it.
- The province rasters must be still before any settlement compile
  (settlement-build §0); the chain lock in the vault is honoured.
- Sonnet judges what a number cannot; a number replaces its judgement
  wherever one can be written afterwards. Illegible renders are
  re-rendered, not judged.
- Never "correct" a kit asset's designed sink per place; re-measure the
  asset (16i :139).

## Delivery plan (written 2026-09-20; the delivering agent follows it and records departures in the ledger)

**Roles** (decision 0079). Fable plans, decides the rules, judges the
Sonnet reports and the sheets, fixes shared causes once and writes every
lane brief with files, mechanism, numbers and the test named. `deliver`
(Opus, low) implements a fully planned lane and commits nothing.
`research` (Opus, low) mines and measures. `run` (Sonnet) runs jobs and
ingests images. `find` (Haiku) looks things up. Lanes run at once only on
disjoint files; a lane that needs another lane's output waits for the
named gate. Every lane brief carries a time budget and Fable checks in on
elapsed time at every hand-back (never let a lane run long unnoticed).

**Part 1 (one session, `deliver 16h part 1`).**
- Step 0: reconcile (item 0a): `routing-audit`; the clearance-receipt
  diagnosis as one `run` job on a scratch copy; the Blackrose id as a
  `find` look-up. Fable decides what the diagnosis means.
- Step 1, five lanes at once:
  - A `research` → `deliver`: designed sink and hull waterline mining
    (item 1) and mount-pair mining (item 2), writing manifest fields and
    `kit-mounts-mined.json`. Files: `mine_placement.py`, the assembly
    miner, `placement_metadata.py`, kit manifests.
  - B `deliver`: the runtime (items 3, 4, 5): `anchoring.ts`,
    `SettlementLayer.tsx`, `lod.ts`, `SettlementColliders.tsx`, the kit
    build's collider export.
  - C `deliver`: kit data shipped and compressed, the two kit backlog
    rows, export gates (items 6, 9): `kit_compress.py`, the publish step,
    `export_settlement_bundle.py`'s GLB parse, `package.json`.
  - D `deliver`: record-reads port (deliverable 0) and composite
    expansion + snap checks on runtime transforms (item 7):
    `compile_settlement.py`, `blueprint_integration.py`, the allowlist.
  - E `deliver`: the assembly renderer (item 8): `render_sheet.py`.
  Gate to step 2: A's fields on every manifest, B's Matrix4 test green,
  E renders the Lilmoth gate assembly.
- Step 2 (Fable): the sheet loop. `run` (Sonnet) ingests every sheet
  with the protocol; Fable reads the reports, writes each shared cause as
  a 97 §C rule and a `blueprint_integration` check (`deliver`),
  re-renders. Two loops at most, then the residue.
- Step 3: rebuild the five stale blueprints' bundle on the frozen ground
  (`rederive_blueprints` → `compile_settlement` → `export_settlement_bundle`
  as a `run` job with `--out` scratch, then published), the replay tests,
  `npm run docs:check`, preflight, commit by pathspec.
- Step 4: the check-in 1 packet in PROGRESS.md § Waiting on user and the
  ledger; the 16h part 2 Starting state lines added to this brief.

**Part 2 (one session, `deliver 16h part 2`).**
- Step 0: apply the owner's check-in 1 answers as rules (Fable decides,
  `deliver` edits); the 16g remedies (item 0b) as one `run` job from
  `apply_sitings`; `rederive_blueprints`.
- Step 1, four lanes at once:
  - F `deliver`: renderable kinds incl. route structures, hulls, landings,
    entrances, the layer reveal (item 10): `compile_settlement.py`,
    the route-structure placement module, `ladder.json`.
  - G `deliver`: doors as records and reachability, the bundle format
    (items 11, 17): `export_settlement_bundle.py`, `types.ts`, the layer's
    variant read, `packages/text-catalogue`.
  - H `deliver`: stairs, decks, step rules, the honest widget (item 12):
    `settlementNavigationHandoff.tsx`, the character step config, the
    deck-link placement.
  - I `deliver`: pads as patches, the author stage and kind (item 13),
    then clearance authoring by tier (item 14): `terrain_patches.py`,
    `grade_settlement_pads.py` → `author_settlement_pads.py`,
    `apply_settlement_pads.py`, `vegetation_patches.py`, the clearance
    author.
  Then, after I's clearance author lands: J `deliver`: the additive patch
  kind (item 15), with Fable having first specified the lifted emission
  function's signature; K `deliver`: dressing vocabulary (item 16); L
  `deliver`: the plan renderer (item 18).
- Step 2 (Fable): author the first additive dressing where the five
  places want it (a design act: lore and asset-aware, with `why` and
  `sources`) and the clearance `kept` lists per place (C15).
- Step 3: render the plan sheets, Sonnet pass, fix shared causes, tests
  failing-first then green, `docs:check`, preflight, commit by pathspec.
  Nothing applied to the ground or bundles.
- Step 4: the check-in 2 packet; part 3's Starting state lines.

**Part 3 (one session, `deliver 16h part 3`).**
- Step 0: apply the owner's check-in 2 steers (record edits by
  `deliver`; re-render the changed sheets once).
- Step 1: apply patches and run the chain once from the freeze gate as a
  `run` job (item 19), with the ladder row, the order fix and the camp
  track fix landed first.
- Step 2, two lanes at once: M `deliver`: the `kit-qa` skill (item 20);
  N `deliver`: audit §7's gates made to fail, waiver removal, the
  replay and receipt tests (item 21).
- Step 3 (Fable): the walk-check packet built from Sonnet studio shots
  of the seven sites (few, legible, listed in the ledger); docs (item
  22); preflight; commit by pathspec; PROGRESS.md.

**Order of the owner's answers.** A "wrong" at check-in 1 re-opens a rule
and a re-render, never a place. A "move it" at check-in 2 re-opens a
blueprint field, a patch record and a sheet, never the ground. A "wrong"
at check-in 3 on a rule is a 97 §C edit and a local re-apply; on a piece
is a re-measure of that asset. Nothing re-runs the chain above
`rederive_blueprints`.

## The story, in plain English (for the owner)

**Where we are.** The land, the water, the roads, the plants and the dots
on the map that say "a village goes here" are all finished and locked.
What is not finished is the last step: turning a dot into a place you can
enter. A week ago we tried that step and got a mess: buildings
facing the wrong way, invisible walls in gateways, huts floating above
the ground, lanterns hanging in mid-air, no paths, stairs you could not
reach. The audit found the reasons. They were few and shared: the
program that draws buildings turned them the wrong way round; it treated
every building as a solid block; it sat every building on the highest
point of ground it could find instead of the way the building's makers
meant it to sit; and several of the things the plan said to place (paths,
stairs, boats) were not placed at all.

**What this chunk does, in three parts, with a check from you after
each.**

*Part 1: get the building blocks right.* Before we build a single place,
we make sure every building piece we own is understood: how deep it sits
in the ground (we read that from how the original game and the mods
placed the same piece, thousands of times), what hangs off what (a
lantern hangs from a post, a sign from a wall; we read that the same
way), what its real shape is when you walk through it and how it fades
with distance like the trees already do. We also fix the drawing program
itself. Then we render pictures of assembled pieces, off in a blank test
space. A cheap helper looks at each picture and says what it sees.
Anything the helper keeps flagging becomes a rule. **Your first check** is
a handful of those pictures and one short walk through the Lilmoth gate:
you say "right" or "wrong" per picture. This is cheap to change now and
expensive later, because every place is built from these rules.

*Part 2: lay the places out on paper.* With the pieces right, we work out
what each place needs to be walkable: paths from the road to every door,
a stair to every raised deck, a boat at every ferry landing, an entrance
piece at every cave and at every way in from underwater, plus the small
levelled pads and the clearings in the trees that a village needs. None
of that is done to the world yet. It is drawn as flat plans, one per
place, plus one map of every bridge and stair on the roads and one of
every ferry. **Your second check** is those plans. If you want a path
moved, a clearing made smaller or a boat put somewhere else, this is the
moment: a line on a plan moves in minutes. After this point, the
clearings are cut and the pads are levelled. Undoing that costs a session. (This is the lesson from the
last chunk, where the trees were cleared before you had seen the plot.)

Two new abilities arrive here. A place can now clear trees and plants
under its buildings and paths as a small local edit, touching only the
few map squares beneath it, without rebuilding anything else. And a place
can now add its own set dressing the same way: rocks around a cave mouth,
reeds at a landing, a boulder against a wall, again as a small local
edit. Both are done the realistic way: big trees go from plots and paths,
low grass stays between the huts, the trees around which a village
was built are kept. The Hist tree is untouched.

*Part 3: build it and walk it.* We apply the plans you approved, run the
build once and prove it with tests that we first make fail on the old
mess so we know they can catch it. We package the picture-checking loop
as a skill so future agents can check every place the same way without
you. **Your third check** is a walk: through the Lilmoth gate and its open
doorways, up a stair onto a Nine-Trunks deck, around Mazzatun's terraces,
across the walkway and the stair on the road, onto the ferry at the
Drowning Gate with a boat at each landing sitting on the water, plus a
look at one village clearing and one dressed entrance.

**What we have at the end.** Buildings that face the right way, sit in
the ground as their makers designed, have open doorways, have paths to
their doors, stairs to their decks and boats at their landings;
every door with a fixed name and a slot waiting for its interior; the
roads' bridges and stairs standing for the first time; places that clear
and dress their own ground locally; and a repeatable way to check all of
it from pictures. That is the floor on which the next chunk stands, where
the five example places are properly redesigned and get their interiors.
After that, every other place in the province is rolled out region by
region.

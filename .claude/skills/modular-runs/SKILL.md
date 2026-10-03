---
name: modular-runs
description: Chains of abutting kit pieces (walls, fences, docks, and the built ways: ramps, stairs, boardwalks, bridges) from the mined abuts record to a laid, flag-free run in a settlement compile. Use when authoring or changing a `pieces` parcel, when a compile reports `openModularEnds` or `singleUsePieces`, when a run step fails "no pair", when re-mining the abuts section, or when a structural set has no plugin placing it.
---

> Written 2026-09-24 against ledger `docs/research/phase16/16h-ledger.md` rows
> "Yard round K8", "K9", "K10" (and K7 B for the first abuts miner), decisions
> 0085 (kit truth is mined) and 0086 (four kit skills), module
> `docs/world/97-placement-principles.md` B3 (slope ladder). Rules live there
> and in the docstrings of `worldgen/mine_abuts.py` (method 1–9),
> `blueprint.py` (parcel `pieces`) and `compile_settlement.open_modular_ends`;
> this file is the procedure only. Umbrella: `place-build`
> (its step 5 calls this skill). Miner
> protocol in general: `kit-mining`. Rebuild and sidecars: `kit-build`.

All paths below are from the repo root; `WG=tooling/world-generation`,
`R=world/sources/placement/kit-assemblies-mined.json`.

## A. Read the abuts record before authoring

1. Find the pieces' family and its run joints:
   `python3 -c "import json;a=json.load(open('$R'))['abuts'];print(a['stats'])"`,
   then filter `a['familyPairs']` and `a['pairs']` on `parent`/`child` (or
   `family_of(asset)` from `worldgen.mine_abuts`). Read per row: `joint`
   (`run` steps a run; `double` is back-to-back, never a step), `parentFace`/
   `childFace`, `offsetM` (child in the parent's UNIT frame), `yawDeg`,
   `relScale`, `count`, `offsetSpreadM`.
2. Check the piece's ends: `endFaces[asset]` (run faces only), `terminates[asset]`
   / `familyTerminates[family]` (faces a plugin run ends on bare), `singleUse`
   (stands alone in every plugin: never a run member), `placedAssets` (absent =
   no plugin places it: go to D).
3. A run needs a run pair (piece or family, `relScale` 1.0) for every adjacent
   step, and first/last pieces with `terminates` evidence on the outward face;
   K8/K9 show a run may end on a variant (`…destroyed01`) rather than an end cap.
   Overlap-chained sets (BM&V `troncons`) are templates, not abuts
   (`mine_abuts` "Out of scope"): author those as kit composites (`composite-author`).

## B. Author a `pieces` parcel

4. In the blueprint under `world/sources/blueprints/`, replace `assetRef` with
   `pieces: [{asset, yaw?}, …]` (at least two; never both). `centreUV` is the
   FIRST piece's pivot; `yawDeg` turns the whole run; a piece's `yaw` only picks
   among pairs. Precedent: `parcel.proving-ground.imperial-wall-run` in
   `place.fixture.proving-ground.json`.
5. Site the strip on ground that clears B3 over its whole length; scan lengths
   (K9: 7 and 5 pieces failed at 2.26°, 4 passed at 1.96°) before choosing
   the piece count. Write `orientationWhy` against the gate/face that matters.
6. Re-derive what the run changes, in order (each skipped step leaves the
   named field stale and the compile red or wrong):
   `cd $WG && python3 -m worldgen.blueprint_footprints --apply <bp>` (footprint =
   union of laid outlines), `--areas <bp>` (district boundary), `--doors <bp>`
   if a door binds to a run piece (not `--orient`: it re-solves the run's yaw), then
   `python3 -m worldgen.street_router --apply <bp>` (ways re-routed through a gate).
7. New prose (`orientationWhy`, approach lines) goes through `npm run
   docs:check` and a separate `text-review` agent (CLAUDE.md player-facing text).

## C. Compile and read the flags

8. `cd $WG && python3 -m worldgen.compile_settlement --blueprint <bp>` (a fixture:
   add `--skip-catalogue`; the chain: `--all`). A step with no run pair fails
   naming both pieces: re-read step 1, do not hand-place.
9. Read the result's `openModularEnds` rows (`placementId`, `face`, `reason`):
   - `faces-nothing`: a run face no neighbour meets within `ABUTS_MATCH_M` 0.5 m
     / `ABUTS_MATCH_DEG` 10° at the pair's `relScale`, and not a run terminal
     with `terminates` evidence. Fix the run (missing piece, wrong `yaw`, wrong end piece).
   - `no-abuts-evidence`: a structural piece no mined plugin places. Go to D; if
     none exists anywhere, it is a planner call (K10: stilt stair, cave mouth).
   - `placed-no-pairs`: placed, in no run pair, not `singleUse`. Planner call
     or a miner question (`kit-mining`), never a blueprint workaround.
   `singleUsePieces` is information, never a defect. Both are counted, never
   fatal (the caller decides; K7 B).
10. Tests: `cd $WG && python3 -m pytest worldgen/test_blueprint.py
    worldgen/test_compile_settlement.py worldgen/test_mine_abuts.py -q`, plus
    `worldgen/test_proving_ground.py` for yard work (four read the exported
    bundle and stay red until the yard is exported: K7–K10).
11. Materials budget: a run adds each piece's materials (K9: yard 98 → 106);
    raise the declared budget with the reason, per `place-build` §5.

## D. A set no plugin places (King of the Murkmire precedent, K8)

12. Confirm: the pool's `plugins=[]` in `$WG/worldgen/asset_registry.py` and the
    set's assets absent from `abuts.placedAssets`.
13. Find a mod whose plugin PLACES the set under the same model paths: the
    set's Nexus page "mods requiring this file", then the mod scene; open the
    candidate archive's file list first (133090's .rar held no plugin).
    Download with the owner's key (CLAUDE.md sourcing rule), sha256 it.
14. Register, all in one change: the pool's `plugins` in `asset_registry.py`
    (statistics only, comment why); `PLUGIN_POOLS` row in `mine_assemblies.py`
    (plugin file name lower case → pool; the join key); a row in
    `docs/research/placement-settlements/settlement-kit-sourcing-log.md`
    (source, version, sha256, what is taken); root `README.md` § Credits.
    Tests: `test_asset_registry.py test_mine_assemblies.py test_mine_designed_sink.py`.
15. A piece or set joining the pool is mined into the record with
    `python3 -m worldgen.mine_abuts --assets <ids> --merge` (seconds;
    decision 0106); a full run (E) is only for a miner rule change.

## E. Re-mining abuts after a miner RULE change (sample first, fresh batch, scale once)

16. Write expectations first to a file (pairs, faces, `joint`, offset, count,
    ends, terminates) for a named sample directory; K10's shape:
    `/tmp/k10/expected_sample.txt`.
17. Sample (seconds): `cd $WG && python3 -m worldgen.mine_abuts <set args>
    --only <pool>:<dir>/ --cache /tmp/<round>cache --out /tmp/<round>/s.json`
    (`--min-count 1` to see single joints). Compare to the file; a wrong
    expectation is recorded as such in the ledger row, not silently changed.
18. Fresh batch: a directory never used before. Used: vanilla `wrfarmfence`,
    `stonewall`, `stockade`; BM&V Valenwood `newcastle`, `troncons`; KotM
    `walls`, `stonewalls`. A failing batch means fix, then another unseen batch.
19. One full run, all five sets (`vanilla`, `bmv-blackmarsh`, `bmv-valenwood`,
    `htbm`, `kotm`; plugin and worldspace arguments as `sets.*.plugins` /
    `worldspaces` in `$R`, kotm as step 15) under
    `bash tooling/repo-standards/job_guard.sh miner -- python3 -m worldgen.mine_abuts … --write --rule-change`
    (0099 decision 8; job_guard runs it under memwatch). Overnight, when
    nothing else is queued (kit-mining §5).
    K9/K10: 251–278 s, cgroup peak 4.50–5.34 GiB; nothing else heavy alongside.
20. After `--write`: `test_mine_abuts.py` (the spread check fails on purpose if
    a family pair spreads > 0.3 m), recompile every blueprint with a `pieces`
    parcel (`compile_settlement --all`), and compare `openModularEnds` counts
    with the last ledger row. Record stats (pairs run/double, family pairs,
    `endFaces`, `singleUse`) in a new ledger row.

## F. Built ways: ramps, stairs, boardwalks, bridges

Piece catalogue (what turns, what ends, which edges have rails, measured):
`docs/research/placement-settlements/boardwalk-piece-catalogue.md`. No
mined pair turns a corner in any marsh kit: a turn is always a piece MADE to
turn, snapped face to face by geometry, then walked.

21. A built way (a ramp, stair, boardwalk, bridge or walkway piece) is a
    chain in this skill, never a standalone building: it is placed only as a
    `pieces` run with BOTH ends resolved. An end is resolved when it meets a
    run piece of the same family (a mined run pair), a `terminates` face on the
    ground or a deck at the height the pair records, or a door threshold.
    An end that meets nothing is an `openModularEnds` defect, not a design.
22. Precedent: the yard's `passesc128h64d01` (a Bosmer walkway ramp,
    `parcel.proving-ground.stilt-stair`) stands as a LABELLED single piece
    whose blueprint `why.what` says so, until a ways run exists. No other
    blueprint may place a built way alone.
23. **Route a boardwalk with the tool, never by hand** (16k walk 6):

        python3 tooling/placement-workbench/wb.py <scene> boardwalk --run <parcel-id> \
            --piece <straight> --junction <turn piece> --from X Z --to X Z --prefix <uid> \
            [--pick N] [--search 8] --layout <place>.layout.json --write

    (`workbench/boardwalk.py`). Ends: the flat dry cell (slope <= 6 deg within
    1.5 m, ground <= 0.6 m over the water) nearest the other end, never the
    bump beside it. Line: the straight between them when clear (no ground
    standing into the deck, nothing placed within 1 m of its edge, water
    within the piles' reach); else the shortest L with ONE 90 deg turn on the
    `--junction` piece (+6 m penalty). Pieces: whole modules per leg by the
    mined run pair (`--pick` as `snap --pick`: choose the pair whose joint is
    flush; vanilla `dockstrent02` pick 3 = 7.28 m, rise 0; pick 0 = 7.09 m
    crosses at every joint), the junction snapped by geometry to the leg's
    north face and the next leg's first piece to its east or west face.
24. **The junction rule**: never butt a straight's end against another
    straight's railed side (Riverwalk walk 5: `le00` on `lw11`'s side, the
    rail of the piece you stood on barred the turn). Turn only on a corner,
    3-way or 4-way piece of the SAME family (deck heights differ between
    families: vanilla 0, KotM 0.2, Mud Mother 0.1), open on both legs' faces.
    A branch (a track joining a walk) is a junction piece in the run with a
    second run off its side face. 45 deg and curves exist only in the
    Valenwood set; an open platform takes any angle within its own family.
25. **The walkway check** (`wb.py <scene> walkway [--published]`,
    walkwayRule in `check`, `workbench/walkway.py`): a player capsule (radius
    and step from `characterPhysics.ts`) walked through every run from the
    ground past its first end, through every piece's deck centre, to the
    ground past its last end (a run end over water walks on into the
    walkable piece within 1.5 m: the joint is walked), and along every bound
    door's approach (the last 8 m of the path that ends there, the threshold,
    1 m inside). Red: a rise over the step under the capsule or anything
    across its body 0.5-1.7 m up (rail, post, chain, lantern: the uid is
    named); no deck under the whole capsule for 2 stations (a hole or open
    joint); a start or end on ground steeper than 12 deg, or whose step-off
    (the ground 2 m on past the end, 1.5 m either side of the way) rises over
    12 deg over 2 m (`bump-on-step-off`, walk 6; a bank beside the deck is not
    judged); a light or hanging
    piece inside a door opening (0.6 m either side of the threshold, 0.1-2.1 m
    up). Shown red on the walked Riverwalk (`tests/test_walkway.py`,
    `fixtures/riverwalk-walk6.layout.json`). Run it on the scene before the
    render round and on the published bundle (`--published`) after publish.
26. **Render and look at every corner and both ends** before the walk
    packet, in ONE launch of low close-ups (never an 18 m iso: readers answer
    UNSURE, walk 6): `render --shots "joint:<first>/8,joint:<junction>+<branch>/9,
    joint:<last>/8,joint:<step>/9,front:<house uid>/12"`, then the door
    approach from the path;
    the Sonnet reader's list: can a person walk every corner with no rail
    across the way; is the route direct; does it start and end on flat
    ground; do deck heights meet at joints; is the door opening clear; does
    anything float or sink.
27. The landward end of a quay or landing stage reaches the bank where the
    DECK plane meets the ground, not the waterline
    (`compile_settlement.anchor_quay_run`, `quay_deck_rise_m`); extend the run
    or add the docks kit's shore piece by its mined pair when the slide is not
    enough.
28. A landing stage from a bank to a berth is laid by
    `worldgen.anchor_landing_run.lay_landing_run` (16k walk 2): the step piece
    at the bank, then the fewest deck pieces by their mined run pair, shifted
    along the bearing until the run ends within 1 m of the berth and the step
    piece's whole `footprintM` stands on ground >= water + 0.2 m (owner rule
    2026-09-25, 16k brief). Proven on Claywater in
    `worldgen/test_anchor_landing_run.py`.
29. A composite's landing plank runs OUT of the doorway (its axis on the
    measured doorway centre, its inner end under the house deck edge), never
    along the wall: BM&V lays `dockstrent02` along its swamp house as a boat
    landing, so its railed side crossed the door (16k walk 6; the composite
    `stilt/swamp-house-with-landing` is turned, `interiors_index`
    `approach_doorways` finds the wall beside an aligned doorway).
29a. **A branch that meets a wading track** (R91, Riverwalk west boards):
    end it in the family's step-down by its mined pair, never a deck end
    standing 0.9 m over the bed. Vanilla: `dockstrsol01` (its -y face) >
    `dockstepsdown01` (-x), `snap --by evidence` WITHOUT `--settle`, the
    place op `"wet": true`; the straight before it takes the ent02 > sol01
    family pair with `allow_terminal`. landingRule then closes the end
    (`wadeStep` row: step uid, depth, the way that ends there).
    The step joins `dockstrsol01`'s -y face, so the last `dockstrent02`
    before it must leave its -y face free: lay the run growing child north
    onto parent south (yaw turned 180), never the other way (audit10 c4: a
    sol01 snapped onto a +y end put the step back on top of the run). The
    step drops 1.79 m: use it only where the deck stands about 1.79 m over
    the ground at the foot; a lower drop is closed by the deck height, not
    the step. Read a deck's height from `describe` `floors[].zM` (the
    walked floor; dockstrent02 0.0 = the pivot), never `boundsM` max (the
    rail-post tops, +0.92: audit10 read a 0.40 m drop as 1.3 m).
29b. **A climb (a stair up a bank) is chosen by the mined pair's rise**
    (audit10 c5, border-road crossings): pieces = ceil((climb - top
    piece's tread span) / pair rise) + 1, the surplus buried at the foot.
    Timber: KotM `mudhuts/stairs02` (pair -x > +x, offset [-2.47, 0.03,
    2.92], both faces run AND terminal: `snap --by evidence
    --allow-terminal`; climbs toward its -x, yaw = bearing - 270). Read
    the treads off the mesh, not bounds: top tread pivot -0.29, bottom
    tread +1.6 m along at -3.51, 0.29 m a tread (3 pieces = 9.06 m of
    treads). Set the bottom piece's `y` by hand so the top tread meets the
    bank-top ground within 0.05 m. A run whose adjacent members rise more
    than 0.45 m (the controller step) is a CLIMB
    (`settlement_run_pads.climb_runs`, `rules.climb_uids`): it takes no
    run pad, and neither the compile's fit slope nor `wb check`'s
    slopeRule and footFloat judge it (row flag `climb`); walkwayRule and
    landingRule do. A run joint standing at a mined `run` pair's pose
    within its `offsetSpreadM` (+0.01 m, 1 deg) passes run-jointPair even
    though it crosses (stairs02's own pair crosses 0.234 m; wb.py
    `mined_pair_pose`); off that pose the penetration and overlap bars hold.
29c. **A rising run joint is set by the mined pair; a crossing's end height
    by grading the ground** (audit10 c5, Riverwalk lw13): never lift a
    flat crossing's end by a pair rise (it fails run-jointPair as
    crossing). A partly-wet run END takes a cut-only pad over its dry
    points down to the run's line (deck - sink; `cutOnly` in
    `pad_overlay`), never filling water. Two run pieces' faces meeting
    within 2 mm at a mined joint (coplanarRule, stairs02 0.0012 m) z-fight
    in the plugin's own pose too: offset the child 0.005 m along the
    joint's face normal, never exempt the joint.
30. Argonian pieces for a landing: HTBM `tamu_wooddock*` have only `double`
    joints in the record (no run pair). King of the Murkmire's plugin places
    its `argonia/blackwood` docks and walkways; the KotM set in
    `settlement-stilt-v1` (docks centre / end / corner / 3way / 4way) carries
    no mined turn pair, so its turns are geometry snaps walked by rule 25.

## G. Retaining walls along a building pad (decision 0101 R1)

A pad edge whose fill or cut exceeds 0.6 m is a retaining-wall run from
the building kit's wall family (`settlement_run_pads.RETAINING_WALLS`;
imperial: `stonewall` pieces and the `composite:farmhouse/stonewall-run-*`
composites). Author it as a `pieces` parcel (§ B) laid from the pad's
downhill edge; `wb.py check` reports every edge the run leaves uncovered as
`padRule`. A modular run never declares a pad of its own: it takes the run
pad the export derives, through the same writer (`pad_patch`).

A kit with no wall family (the Argonian mud kits, `route-spans-v1`) holds an
edge over 0.6 m and up to 1.2 m as a graded earth batter instead: the pad op
carries `batter: true` and the pad blends over a ramp twice the edge height
wide, at least 3 m (`settlement_run_pads.batter_blend_m`); over 1.2 m,
re-site (planner rulings 2026-09-27, lessons L64).

## H. Piled platforms seat by their deck

A dock, jetty or landing span on piles is seated by its DECK: deck = the
water surface + the piece's mined deck rise (0.3 m when none is mined); the
piles sink into the bed as deep as they need. Never seat it on its pile
foot: ground + `pivotAboveBaseM` lifts the deck by the piles' length
(integrate-landing: KotM docks at 7.6 m over the water). A co-placed door on
a run piece (BM&V bridge01's doorframe01) is the served building's, never
the span's threshold (lessons L65, L66).

---
name: placement-workbench
description: The tool manual for the headless placement workbench (tooling/placement-workbench/wb.py) over the frozen ground — every command (describe, place, snap, settle, mount incl. --hang, attach, group, measure, check, compile, render, export, bpy), its bars and its cost. The design procedure for a place is the place-build skill; use this one for how to run a wb.py command, read its output, or judge a contact, a seat or a door on the actual geometry.
---

# Placement workbench

> **Written against** (decision 0086 rule 4; `routing-audit` checks these):
> decisions 0085 (kit truth is mined; mined records are evidence), 0086,
> 0087, 0097 (agent-authored placement in a workbench; the record is the
> output; the `atM` run field); world 97 B3 (slope ladder), C8 (orientation), C9 (doors onto
> ways), C11a (dug-in), C14 (verticality); the `place-build` skill
> (the procedure; its step numbers are cited below);
> `tooling/placement-workbench/README.md`; the lane record
> `docs/phases/lanes/placement-workbench-lane.md` § Rounds (round 1 and 3
> reports); `docs/research/placement-settlements/building-depth-and-variety.md`
> §2 (the building-assembly layers and checks). If a cited record has
> moved, this skill is stale: report it.

This is the tool manual. What to read, what to design, when to render,
and how a place is published and walked is the `place-build` skill; its
step numbers are cited below. The mined records
(`kit-designed-sink.json`, `kit-mounts-mined.json`, the abuts section of
`kit-assemblies-mined.json`) are EVIDENCE you query with `describe` and
`evidence`; the pose you choose is yours and is recorded as such.

`W="python3 tooling/placement-workbench/wb.py <scene>.json"` (scenes live under
`tooling/placement-workbench/output/scenes/`, gitignored). Coordinates are
province metres, x east / z south (studio km x 1000). Faces are
east/west/north/south in the piece's own frame at yaw 0 (= +x/-x/+y/-y).
Every call prints JSON and a `[wb] <cmd> <s>` line; a place-and-check cycle
is 1-2 s; a render round is ONE Blender launch (`render --shots`) under
the job guard, whose slot governs its cores and memory.

## 1. Read before you place

- The design reading (record, promises, culture grammar, lessons, design
  index) is `place-build` step 0; the kit list and the piece per use come
  from its design brief (step 1). A fixture reads its
  `world/sources/sites/<slug>.json`.
- Memory: the job guard's slot governs memory; there is no manual check
  and no one-Blender-at-a-time rule.

## 2. Open the ground and site the place

    $W window --centre-km E S --half 150 --place-id <id>
    $W map                       # . <2 deg  + <3  o <6  # steeper  ~ wet  W deep >= 1 m  R road  r track
    $W scan <spec>.json --out tooling/.reports/16k/<place-id>/round-N/scan.json   # before siting any building

On a busy machine run `scan` and `apply` under the guard
(`bash tooling/repo-standards/job_guard.sh <lane> -- python3 tooling/placement-workbench/wb.py ...`):
the CPU watchdog pauses an unguarded scan (walk 9: a 10 s scan stopped twice
at machine CPU 98 %).

A building (a `place` with a `pad`) new or moved since HEAD fails
`scanFreshRule` unless a scan written after HEAD's layout commit holds its
asset and pose (0105 R31; README § Fresh scans).

Buildings with fit `direct`/`pad` need footprint cells under 2 deg, `stilt`
under 3 deg (97 B3, `compile_settlement.fit_slope_failure`); `plinth` and
`dug-in` are held by the ground delta instead. A building on ground no fit
takes can declare a pad (decision 0101: `place ... --pad [apronM=]
[datumM=] [floorMinM=]`, layout `"pad": {...}`): a `settlement-pad` patch
over its footprint plus 1.5 m, graded to the median ground, fill and cut
each <= 2.0 m; `settle` and `check` then read the patched ground. An edge
standing > 0.6 m off the ground needs a retaining-wall run of the kit's wall
family (imperial: farmhouse stonewall; mud kits have none, so their pad
stays within 0.6 m) laid along it, or `check` reports `padRule`. A hull
needs >= 1 m of water all round. Keep off roads (`R`/`r`) unless the piece is meant to meet one.

## 3. Describe every piece you will use

    python3 tooling/placement-workbench/wb.py - describe <asset>

Read: `sizeM`, `pivotAboveBaseM`, `manifest.fit` / `anchorClass` /
`designedSinkM`, `doorways` (record doorways with mesh probes; a
`-with-door` composite carries its leaf, so its doorway is closed mesh),
`openings`, `evidence` (mount pairs as child and parent, abuts pairs,
`endFaces`, `terminates`, `singleUse`, co-placements). For a pair:
`wb.py - evidence <parent> <child>`.

## 4. Lay it out

A place is one layout file applied whole (decision 0100; `place-build`
step 2). Each op is one mutating command below as JSON with the CLI's
argument names; the standing example is
`tooling/placement-workbench/fixtures/yard-b.layout.json`.

    python3 tooling/placement-workbench/wb.py round [SCENE] <place>.layout.json [--plan | --no-shots]
        [--walktable] [--full]   # apply + check + compile + shots (or the 2D plan) in ONE process;
        # output/apply/<scene>/summary.json: failures by rule (count, fix hint) and by uid;
        # rounds.jsonl beside it; --walktable only after publish; --full before export --write
    python3 tooling/placement-workbench/wb.py edit <place>.layout.json --uid UID --set at=[X,Z] yaw=D
    python3 tooling/placement-workbench/wb.py apply <place>.layout.json [--scene NAME]
        [--no-compile] [--allow-stale-ground] [--full]   # unchanged ops restored from the op cache
    $W scan <spec>.json --out <file>   # every candidate pose ranked: pad legality, paint, water, apron room
    $W check [--only UID,..] [--serial] [--full]   # pooled; unchanged pairs from the pair cache
    python3 tooling/placement-workbench/wb.py replay --scene NAME --out <place>.layout.json
    cd tooling/world-generation && python3 -m worldgen.render_blueprint --layout <layout>   # plan, 3 s; --labels for ids/deltas

`apply` stops at the first failing op (its index in the digest), writes
`output/apply/<placeId>.json`, and refuses when the place's blueprint was
exported on other chunk files (`authoredOn`). The commands, one per op or
for trying a pose by hand:

    $W probe <asset> --at X Z --yaw D   # try a pose without adding it: seat, ground, slope rule
    $W place <uid> <asset> --at X Z --yaw D --settle
    $W move <uid> [--forward M --right M | --dx M --dz M] [--turn D | --yaw D]
                  [--pitch D] [--roll D] --resettle
    $W swap <uid> <asset> [--keep base|pivot] --resettle      # a variant in the same pose
    $W path add <route-id> --points X Z X Z ... --width 4.3 --kind road
    $W doors                     # every measured doorway: threshold, facing, distance to a path

- Turn every building so its doorway faces the path it opens onto (97 C8,
  C9: threshold within 4 m of the way's centreline). `doors` gives the
  distance; move the path or the building, never argue with the number.
- Runs (walls, fences, docks, boardwalks): place the first piece, then
  `$W snap <next> <face> <prev> <face> --by evidence --settle` (the plugin's
  own pose for that pair, then the piece re-seated on its own ground as the
  runtime seats it), and measure. Evidence snap skips a face the plugins end
  runs on (`terminates`: a broken wall end); `--allow-terminal` overrides.
  Only where no mined pair exists, `--by geometry` (bounds faces together,
  then slid to exact touch). A run step with no evidence and no geometric
  fit is a `modular-runs` question, not a nudge.
- Mounted children (sconce on a wall, sign on a post):
  `$W mount <child> <parent> [--along M]`, which uses the mined band/points.
  A road board on its post (pair `yawBy: designer`) takes height and face from the pair and its bearing from you: `mount <board> <post> --yaw D`, D the bearing of the route leg toward that board's own `pointsTo` destination (`check` `sign.posts[].destinations[].bearingDeg`; a board's tip points yaw + 90 for the bmv medium/large boards), so two arms on one post never share a yaw. Put each arm on a mined socket with `mount <board> <post> --yaw D --socket H` (H from `sign.posts[].armSocketsM`, heights over the post base; roadsignpost 1.922, 2.033, 2.51, 2.787, 2.885; any other H is refused); never `--height` for a sign arm. A second arm takes a different socket of that post (a board of another size, whose own mined pair sits there, e.g. medium 1.92 m with large 2.51 m), never a hand height. With no mined pair, a child whose longest PLAN side is under 0.6 m and
  whose height is under 1.0 m (0102 decision 5 as amended 2026-09-26) may
  stand on its parent's top where it is placed when the op names the render
  round that approved it: `--unmined "reader-approved r2"` (layout
  `"unmined": "reader-approved r2"`). A yard-set member may carry the same
  `"unmined"` field on its `mount`ed row. The pose records
  `mountPair.kind: unmined` and the approval; `check` lists every unmined
  mount under `info`, that render round must shoot it, and `export` writes
  the member's own `mountPair` field (`{kind, mountedOn, n | yardSet |
  unmined}`, e.g. `{"kind": "unmined", "mountedOn": "b1-barrel", "unmined":
  "reader-approved r2"}`; `blueprint.assembly_failures` validates it), which
  the compile copies into the placement's `provenance.mountPair`; the
  member's `evidence` stays as authored.
- Hanging from a tree or any mesh (R53): `$W mount <child> <parent> --hang
  --unmined "reader-approved rN" [--along M --bearing D] [--min-h 1.8
  --max-h 4.0]`. Rays go straight up from rings round the target (the
  child where it stands, or `--along` m out from the parent's pivot on
  compass `--bearing`; 0.02 m rings out to 1 m, then 0.1 m, to 3 m) onto
  the parent's own mesh; a ray counts when the first surface over the child
  is a branch (a downward underside and its top within 0.6 m, or a
  one-sided upward top), and the child's hang point (its highest vertex
  within 0.05 m of its pivot axis) is seated on that top, which must stand
  `--min-h`..`--max-h` over the padded ground; the nearest such seat wins.
  Hanging pieces skip the unmined size caps; the approval stands. Proved
  on the mined Mud Mother lanterns on their Hist tree (3 plugin poses back
  within 0.008 m). The sick Greenspring Hist has no branch under 4 m
  (lowest about 6.9 m): pass `--max-h 12` there, or the default refuses by
  name. The pose records `mountPair: {kind: unmined, on: branch, hitM,
  hitOverGroundM, branch: closed|open}`; hangingRule stops failing it.
- A walkable deck (ramp, stair, boardwalk, bridge): `place --walkable`;
  walkRule walks its top instead of routing round it.
- A piece meant to stand in water (jetty post, fish trap, wreck): `place
  --wet` (R86). Water is never a `check` failure; every row reports
  `waterDepthM` (and `waterLevelM`, `topOverWaterM`, `wet` where water
  stands), and a row in water with `wet` false is your mistake to move.
- A part the plugins place on this shell at a fixed offset (a door, a
  window, a chimney): `$W attach <part> <shell> [--template ID]`, which uses
  the mined template (offset, turn, part scale).
- Chimney smoke is a runtime effect, not a kit piece: a placement of kind
  `"effect"`, assetId `"fx:smoke-column"`, kit `works-v1` (its manifest's
  `effectTextures` row names the vanilla puff atlas), mounted on its shell
  with `parentPlacementId` and a `mountOffsetM` at the chimney top in the
  shell's local frame (anchor class `fx`: no parent is a named runtime
  error; game-core `settlement/smokeColumn.ts` draws it). Not usable yet:
  farmhouse01/02 have no chimney in their mesh, so no shell carries a
  `chimney` socket, and the compile does not emit `effect` placements
  (lane effects r3 report, tooling/.reports/16k/fix2-effects-r3.md).
- Roll and mirror exist for trying a fit; export refuses both (the runtime
  turns a piece by yaw and pitch only).
- Water pieces (`anchorClass water`) settle on the recorded level; a
  landing stage runs from the dry shore to the hull (tip within 0.5 m of
  the wet edge and of the hull outline). A `walkable` water, piled or stilt
  piece settles on `place` with no `settle` flag (`measure.auto_settles`).
- A house on stilts (anchorClass water + `walkTopM`, e.g.
  `composite:stilt/swamp-house-with-landing`; `measure.deck_seated`) seats
  its deck at the plugin's waterline over the drawn water; 97 B3 reads its
  deck plane (0 when level) and `stiltRule` judges the bed per stilt foot
  (`check` row `stiltFeet`: foot-0..n from the mesh, each `embedM` = bed minus
  foot bottom, fail when a foot hangs over the bed or is buried past its own
  length). Its composite's landing plank is baked into the kit mesh (the
  template's pose, no per-placement override): site the HOUSE so the
  landing's outer edge rests on dry ground at deck height (`landingRule`
  row `landings[]`: `landDropM` within 0.2 m, `groundOverWaterM` > 0); that
  edge is its doorway for `doors`/pathReachRule (source `landing`). A
  parcel with a `walkTopM` that is no floor service carries `floorService`
  (its named cause) in its `check` row; "not seated" fails `floorServiceRule`.

## 5. Measure everything

    $W measure <a> <b>           # gapM (exact, FCL), intersecting, penetrationM (+ direction), patches
    $W ground <uid>              # heights under the footprint, delta, max slope, foot float
    $W check                     # every piece + every near pair + every door + quay reach, in one call
    $W openings <shell-uid>      # doorways to paths; every door and window face clear 1 m out
    $W signature                 # buildings sharing one shell + assembly (they read as copies)

Bars (the proving-ground gates): a run joint `gapM <= 0.03` and
`penetrationM <= 0.05`, or the pair stands at a mined `run` pair's pose
within its `offsetSpreadM` (`minedPair` on the pair row: the plugin's own
crossing passes); unrelated pieces never cross; `footFloatMaxM <=
0.3` for ground pieces (docks and climb-run members, row `climb`, exempt);
`slopeRule` null for every building and every non-climb run member; `padRule` null for every padded building (0101 R1);
`yOffRuntimeM` 0 after `settle` (the workbench seat IS the
runtime's `anchorPlacement`); doors within 4 m of a path. A rock (seat_rules
`ROCK_POLICY` tokens, or any `landscape/rocks/` piece whose sink the
plugins measured: rocks0N, rockm/l, rockpiles, wetrocks; not a cave mouth)
is judged by `rockSeatRule` only: slope, delta, yard sill and foot float
are skipped for it. It may embed to max(0.3 m, its plugin p75 base depth). A row with `runtimeY: null` and a
`seatError` (a piled run member wholly on dry ground) has no runtime seat:
move it onto its water or give it a ground fit.

The walk-packet rules (0102 decision 2, `workbench/rules.py`), all on the
PADDED ground, each listed by `apply` as `<rule>: ...` when it fails:

- Footprints (`measure_footprints`): the hull of a piece's lowest 1.5 m.
  A ground-anchored **pad**-fit shell whose designed sink buries that
  whole band (the KotM pod: tip 8.7 m down) is measured over the 1.5 m
  above its sink plane instead (`groundPlaneM`), so walkRule and
  `site --free` treat its ground ring as solid. Plinth shells are left
  out (planner ruling, 16k fix 2 r3): the farmhouses change by 5 %. A
  plinth deck (farmhouse01walkway) measured there becomes its whole
  deck (7 to 54 m2), which walls off its own doorway.
- `walkRule`: a 0.5 m grid over the place; every piece's footprint grown by
  the capsule radius (0.3 m) blocks, except `path`/`paint` pieces and
  `--walkable` decks (their top is the surface). Every edge walks at <= 30
  deg (97 C14). The step limit (ecctrl `floatHeight`, `CHARACTER_FLOAT_HEIGHT`,
  read live from `packages/game-core/src/physics/characterPhysics.ts`: 0.45 m
  on 2026-09-28, 0.18 m when ruling 1 below was written) applies ONLY where
  ground meets a walkable deck or deck meets deck; ground to ground is
  governed by the slope alone (planner ruling 1, 2026-09-26: 0.18 m over a
  0.5 m cell is 19.8 deg, so a step bar on every edge could never bind). A
  wet cell walks when its water stands at most 0.7 m over the padded ground
  or deck (0093: grounded under 0.77 m); deeper fails as `wading`. One
  search from the road terminal (the-street's first point, else
  `networkTerminals[0]`) to every doorway record of every placed building
  (the first free cell out along its facing) and every doorless parcel (a
  free cell within 1 m of its outline). The bound doorway is `door:<uid>`
  and is always a target; any other is `door:<uid>.<k>` (k its index in
  the record) and is skipped as `sealed` when a placed piece (not its own
  building, door, porch or steps; not a path) stands within 0.5 m in front
  of it; an unsealed doorway nobody can reach FAILS. Per target: `routeM`,
  `steepestDeg`, `largestStepM`, `wetCells`, `deepestWadeM`; a failure
  names the blocking cell and why (obstacle uid, slope deg, step m, wading
  m). The bound doorway is never exempted by sealing: a piece in front
  of it fails the walk. `export --write` writes the navmesh socket's data
  as the blueprint's `walkRoutes` (`rules.walk_routes`: schemaVersion 1,
  per reached target the route's polyline in province metres, `routeM`,
  `steepestDeg`, `largestStepM`, `deepestWadeM`; collinear cell steps
  dropped); the bundle export copies it onto the place. The walk grid is
  never written (planner ruling 1, 16k fix 2 round 3).
- `floorEdgeRule`: every building (a parcel with a doorway or a pad; not a
  retaining wall): every 0.25 m round its outline, the lowest mesh within
  0.3 m inside it over the ground below; over the fit's band (direct 0.15,
  plinth 0.60, pad 0.10 m) fails unless a retaining-wall piece stands under
  the sample. Only underside geometry within 1.0 m over the piece's own
  base is judged (planner ruling 2, 2026-09-26): a sample whose lowest mesh
  is higher (an eave, a lean-to roof, a dome's bulge) counts as `overhang`
  and is not a floor edge. `aboveBaseM` is that height for the worst
  sample.
- `pathReachRule`: a path END within 1.0 m of every bound door, its last
  leg within 45 deg of the door's facing; a path end within 1.0 m of every
  doorless parcel's outline (a declared opening). Every other unsealed
  doorway is walkRule's alone: it must be reachable, it needs no path end
  (planner ruling 6, 16k fix 2 round 3).
- `propSeatRule`: every dressing item (assembly members, unbound pieces):
  mounted, its exact gap to the parent <= 0.03 m; on the ground, its lowest
  foot point <= 0.03 m over the ground, its pose within 0.03 m of the
  runtime's seat, and a burial deeper than 0.03 m only on a sink with
  evidence (a `policy-fallback` sink is none) or, with no evidence, up to
  the ground's rise under its foot (`groundRiseM`: highest minus lowest
  ground at the foot samples; `burialAllowM` = that, capped at 0.15 m;
  planner ruling 3, round 3); deeper fails `uneven ground: move it`; a
  no-evidence sink over 0.03 m fails by name; a yard-set
  member within 0.5 m of its declared offset from the set's anchor. The
  tolerances are fixed (planner ruling 4, 2026-09-26): 0.03 m on every seat
  (the miner's contact) and 0.5 m on a yard-set member's stand. The
  no-evidence sink (`fallbackSinkM` in
  `tooling/asset-pipeline/pipeline/config/placement-policies.json`) is 0,
  contact, in every policy; a measured sink keeps its value. It reaches the
  seat only when the kit manifests are refreshed (`kit-build` step 4).
- `beachedRule` (R5) also reports `beachedProfile`: keel gap and bow height.

The walk-4 seat rules (owner 2026-09-28, `workbench/seat_rules.py`; each
failed on the defect the owner walked, `tests/test_walk4_wb.py`):

- `burialRule`: every shell and ground prop (not mounted, run, hull, piled,
  water, hanging or dug-in): its lowest mesh point under the padded ground
  straight below it. Allowed: max(designed, 0.15 m) + 0.03 m, where
  designed = (sink p50 + pivot over base) x scale when the sink has
  evidence (`plugin`, `mesh`, or taken from a `base:`/`part:`/`swap:` row);
  a policy sink designs nothing. Judged at the workbench pose (a piece whose
  op never settles it, at the runtime seat) AND at the place's last compiled
  pivot (`output/apply/<place>.compiled/`, when newer than the layout) when
  that stands > 0.03 m off: the Claywater stable reads 0.91 m under at the
  seat and 3.48 m under at the compiled pivot (2.57 m lower). A `place` op
  that carries a `pad` settles on it with no `settle` flag (the stable's op
  had none, so every rule skipped it).
- `hangingRule`: an unmounted piece whose asset hangs fails: the mined
  anchor class `hanging` (kit-mounts-mined `anchors`, plugin evidence), the
  manifest's `hanging`, a pivot within 0.15 m of its mesh top with the mesh
  at least 0.5 m (and 3x) below, or a mesh starting >= 1.0 m over its pivot
  (a part authored in its host's frame: histflower01 starts 5.85 m up).
  Greenspring at HEAD: b-minder-flower, sh-flower1, sh-flower2, sp-flower.
- `fixtureSeatRule`: every light (layer `light`, a manifest `light`
  record, or a lantern/candle/brazier/torch/sconce/lamp name). Mounted: its
  gap to the parent <= 0.05 m. Standing: its base (lowest point, at its
  plan centre) against the highest surface under it within 0.6 m over the
  base (ground, deck, floor, barrel top): at most 0.05 m over, at most
  0.03 m under (plus its designed sink on the ground when evidenced: a
  brazier's plugin 0.04 m). Judged at the compiled pivots too (the light
  and every surface under it at their compiled y) when the last compile
  moved either.
- `landingRule` (every water-edge walkable run; 16k § 16h part 1 "Landing
  stage reaches dry ground"): along the run's two farthest member ends, the
  deck 0.3 m inside the water end (further in, 0.1 m at a time, where the
  last metre is bare posts) stands 0.15-0.35 m over the water; inside the
  landward end it stands within 0.2 m of the ground 0.3 m past it, or a
  step piece (`step`/`stair`/`ramp`) within 1.0 m has its top within the
  controller step (0.45 m) of the deck and its foot on the ground; both ends
  over water is an open run; both ends dry (a crossing) judges EACH dry end
  by the same 0.2 m bar from the nearest member's `describe` floors zM (a
  step member's lowest tread), never bounds max; on every run the ground
  standing over 0.2 m above a member's deck along its axis fails (a deck
  run into a bank). Judged at the compiled pivots too: Claywater's
  landing reads 0.35 m / 0.05 m at the workbench seat and 3.36 m / 3.06 m at
  the compiled pivots (+3.01 m).
- `archwayRule` (walk 4 lane COMPILE): a parcel shell whose kit records its
  doorway in its own mesh with no door leaf (interiors
  `closedShellPromotedBy: own-geometry-door`) needs a piece named `door`
  within 2.5 m of a measured doorway; else it fails naming the plugin's
  door piece (the sidecar entrance, its esp link, the shell's row in
  `exterior-interior-links.json`, else the door every linked shell of its
  folder takes). Greenspring at HEAD: b-fam1, b-fam2 (kotm mudhut01:
  `kotm:argonia/mudhuts/door01` by family, 5 linked placements). Where the
  opening really is: `blender/examples/doorway_rays.py` (`ring` mode).
- `signRule` (walk 4 half; audit10 P1): every board hangs within 0.05 m of
  one of its post's mined arm sockets (`post_arm_heights`: the heights over the
  post base at which the plugins hang road boards on that post asset), the
  post and each arm lean under 1 deg, a post with two or more arms has a
  `pointsTo` destination per arm, and two arms never share a yaw within
  15 deg; the boards on one post differ in centre height
  by >= 0.25 m, never point within 15 deg of each other (a board points
  along its longest axis toward its tip, the end under half its other end's
  height), and each points within 15 deg of the route leg toward one of the
  post socket's `pointsTo` (best one-to-one match): a route id along that
  route toward its `to` end, a place id along the nearest route ending
  there toward that end, read 5 m on from the post in the published
  `routes.json`. `check` lists them under `sign.posts`. The board half
  judges each arm against the route of the destination it points at
  (`rules._arm_route`), the nearest way only when the post has no
  `pointsTo` (at a fork the nearest way is the other track).
- `padClearRule` judges pad-owning buildings only: a pad-owning prop
  (`measure.is_prop`) seats on the graded surface by design
  (`rules.pad_clear_targets`).

## 5b. Any other placement question: headless Blender (`wb.py bpy`)

When no command answers it (owner 2026-09-28), ask Blender directly, and
add the command to `wb.py` in the same lane:

    python3 tooling/placement-workbench/wb.py bpy <scene> <script.py> --out <result.json> \
        [--only UID,..] [--args A B ...]

The same Linux Blender 3.2.2 and scene assembly as `render`
(`render.scene_job`, the per-kit .blend cache): every posed piece's top
object is named by its uid and every object of its tree carries `wb_uid`;
a piece whose op never settles it is loaded at the runtime seat
(`seatedAtRuntime`); the padded ground on a 0.5 m grid is `ground`, water
`water`. The script runs with `api` (`workbench/bpy_api.py`) and `ARGS`;
whatever it puts in `RESULT` lands in `--out`. The API (points in the wb
frame: x east, y NORTH, z up; `ground_height` takes province x, z):
`objects_by_uid()`, `ground_height(x, z)`, `ray_cast(origin, dir,
filter=None|uid|'ground'|{...})`, `bounds(uid)`, `lowest_point(uid)`,
`contacts(uid, other)` (gap and crossing triangle pairs), `forget()` after
the script moves anything. A render needs `scene.render.engine = "CYCLES"`
and a light (the bpy scene has none; EEVEE needs a display and fails).
`blender/examples/studio_shot.py X Z YAW PITCH OUT.png [hideUids]` renders
the place from a walk frame's camera (route.json stand, compass yaw, pitch;
5.8 m follow arm, vfov 48): the piece behind a judge's finding, or none
(world vegetation), ~40 s. Cost (kit cache warm): Claywater 109 pieces,
6.6 s (5.0 s building the job, 0.8 s scene build, 0.5 s script);
Greenspring 120 pieces, 3.5 s. A kit's first launch builds its .blend
cache (Greenspring cold: 8.9 s scene build). The example
(`tooling/placement-workbench/blender/examples/branch_survey.py`):

```python
import math

tree = ARGS[0]
(lo, hi) = api.bounds(tree)
cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
rows = []
for bearing in range(0, 360, 15):                 # a ring of rays per bearing
    for r in (2.0, 3.0, 4.0, 5.0, 6.0, 7.0):
        x = cx + r * math.sin(math.radians(bearing))
        y = cy + r * math.cos(math.radians(bearing))
        g = api.ground_height(x, -y)               # province z = -y
        if g is None:
            continue
        hit = api.ray_cast((x, y, g + 0.05), (0, 0, 1), filter=tree)
        if hit and hit["normal"][2] < -0.2:        # a branch underside
            rows.append({"bearing": bearing, "r": r, "overGroundM":
                         round(hit["point"][2] - g, 2), "at": [round(x, 2), round(-y, 2)]})
            break                                   # the nearest on this bearing
RESULT["tree"] = tree
RESULT["lowestPoint"] = api.lowest_point(tree)
RESULT["branches"] = sorted(rows, key=lambda b: b["overGroundM"])
if len(ARGS) > 1:                                   # a piece against its host / the ground
    piece, other = ARGS[1], (ARGS[2] if len(ARGS) > 2 else "ground")
    RESULT["contact"] = api.contacts(piece, other)
    RESULT["pieceLowest"] = api.lowest_point(piece)
RESULT["pieces"] = len(api.objects_by_uid())
```

## 6. Render and look (Sonnet reader)

    $W render top                        # layout, footprints (cyan), paths (orange); no text (R8)
    $W render top --labels               # + piece ids, caption, px/m (never for the owner)
    $W render front --focus <uid>        # faces the doorway; red line = terrain cut
    $W render cutaway --focus <uid> --cut 0
    $W render iso | turntable [--focus <uid>]
    $W render --shots auto               # a round in ONE launch: top, a front per parcel on its
                                         # door side, isos from 45 and 225 deg; or a list
                                         # top,iso,iso:BEARING,front:UID -> output/renders/<scene>/round-N/
                                         # with manifest.json naming each shot's subject
    $W render joint --focus A B [--span 8]   # a joint, step or end: four LOW (14 deg) close
    $W render --shots "joint:A+B/8,joint:C/6"  # perspective shots from the quarter bearings,
                                         # 6-10 m span, camera held 1.2 m over the ground, one
                                         # 2x2 sheet each. The DEFAULT frame for every run joint,
                                         # junction, step-down, walk end and skirt edge: readers
                                         # answer UNSURE on 18 m isos (walk 6)
    python3 tooling/placement-workbench/wb.py render-interior <cell> [--day|--night] [--out PNG]
                                         # interior lighting sheet from the published bundle
                                         # (no scene): doorway + two corners x day (runtime
                                         # light model) / night (sources only); flame proxies;
                                         # -> tooling/.reports/16k/interior-renders/<cell>.png, ~40 s
    python3 tooling/placement-workbench/wb.py coplanar [--cell C ..|--all-cells] [--place ID ..] [--out J]
                                         # z-fighting: surfaces of two pieces on one plane (2 mm, 2 deg,
                                         # > 0.01 m2) in a published cell or place; a decal is exempt
                                         # only where its runtime applies the decal offset; exit 1 on a
                                         # hit, ~3 s a cell (worldgen/coplanar.py; `check` carries it)
    python3 tooling/placement-workbench/wb.py packet-shots <place-id> [--out DIR]
                                         # walk packet: contents.md + one --shots auto round from the
                                         # PUBLISHED bundle (read-back first), captions + manifest
                                         # stamped with HEAD and bundle sha256; the only packet pictures

Hand the PNG paths to a Sonnet `general-purpose` agent (read-only) with this
list: is each base on the red ground line (float / sunk, in metres from the
1 m grid); do run pieces meet with no gap or overlap; does each doorway face
a path and is the way to it clear; is anything inside another piece; do
mounted children touch their parent; is the hull in water and the stage
reaching it. UNSURE means re-render closer (`--span`), never guess.
Numbers first, pictures second: fix what `check` reports before rendering.

## 7. Bind, export, derive, compile

    $W bind <uid> parcel <parcel-id> | run <parcel-id> --index N | landmark <landmark-id>
    $W bind <uid> assembly <shell-parcel-id> --layer L --on parent|ground --evidence E
    $W export world/sources/blueprints/<place>.json --write
    python3 tooling/placement-workbench/wb.py whatchanged <place>.layout.json --base <walked rev>   # packet lines (0105 R35)

Export writes POSE fields only (`centreUV`, `yawDeg`, `assetRef`, run
`pieces[{asset, atM, yaw, yMeasured}]`, the shell's `assembly[{asset, atM,
upM, yaw, pitch, on, layer, evidence}]` (`blueprint.assembly_failures`),
landmark `position`, route `via`/`points`, and every seated ground piece's
`yMeasured`). **The pose record is the output (0097):** the compile writes
each `yMeasured` verbatim with `yFinal` (shells, landmarks, ground assembly
members, every run member; a run's riseM is read from its members' poses),
re-seats nothing, moves no measured quay, and derives a pad's grade from the
pose. The compiled record is checked by the same rules as the scene:
burial, landing and fixtureSeat judge the last compile's pivots too, and
`tests/test_walk4_compile.py` holds every compiled y to its workbench seat
within 0.02 m on Claywater and Greenspring.
Never hand-edit a pose in the JSON: move it in the workbench and export
again. Everything else (districts, prose, doors' interior claims) is the
blueprint skeleton of `place-build` step 2; `wb.py compile` runs the
derive passes and the compile. A compile finding about a pose goes back
to the layout file (`place-build` step 2).

## 7b. Building assembly (every inhabited building)

A building is an assembly, not a shell: the layer table, its evidence and
its checks are `docs/research/placement-settlements/building-depth-and-variety.md`
§2 (read it; do not restate it). The purpose card and the piece per
layer are decided in the design brief (`place-build` step 1); the
commands, per building:

1. Purpose card: read it from the design brief (layer 1).
2. The shell: its composite holds only the shell, the door its mod placed
   with it and a mined walkway or porch (§2 rules). Place, settle, turn the
   doorway to its path.
3. Every other layer is a piece bound with `bind ... assembly <shell
   parcel> --layer ...`: windows and shutters, roof detail, chimney, steps
   and porch where not composed, light, personal clutter, wear. Each cites
   its evidence: `attach` (a mined template), `mount` (a mined pair), or
   `measured` (a contact you measured, only where the source mod places no
   instance; say why in the scene note). Windows follow the planner's
   windows rulings (§4 of the research doc; cross-set panels only on
   measured geometry with a passing Sonnet check).
4. Structural layers (door to roof detail) must touch the shell as
   designed: `measure` each against the shell (gap <= 0.03 m, penetration
   only as designed). Dressing (light to wear) is settled on the ground or
   hung, never floating.
5. `openings <shell>`: every doorway on a path, every door and window face
   clear 1 m out. The minimum set (§2 checks): a door, a light, the
   personal clutter the purpose card implies, one roof detail.
6. Save a finished assembly as a prefab to reuse its rhythm, never its
   copy: `$W group save <name> --uids ... --anchor <shell>`, then
   `$W group place <name> --at X Z --yaw D --prefix b2- --parcel <id>`, then
   `swap` variants and move pieces so no two buildings share a
   `signature`.

## 8. Publish and hand over

`place-build` steps 5-6 (export, compile, publish this place only, the
walk packet); for the yard, `bash tooling/studio-loop/yard-publish.sh`.
`python3 tooling/placement-workbench/wb.py - walktable <place-id>` prints
the owner-walk table (every item, every time) with a `measured` column: the
rule numbers per item from the place's last `apply` (walk route m / steepest
deg / step m, floor-edge worst gap, keel gap and bow height, prop seat gap).
The packet reports these numbers; it never asks the owner to judge them. Prose goes through
`text-review` in a separate agent.

**The painted ways (rulings R84).** After any `path` op change, before and
after the publish:

    python3 tooling/placement-workbench/wb.py paint-check <place-id> [--preview] [--out J]   # < 2 s
    python3 tooling/placement-workbench/wb.py paint-look <place-id> X,Z ... [--preview] [--span 30]   # top-down, ~1 s a spot
    python3 tooling/placement-workbench/wb.py paint-look <place-id> --preview --scene <scene> \
        --eye NAME:EX,EZ>LX,LZ ...                                                            # eye-level Cycles, ~1 min a shot

`--preview` computes the paint the next publish ships from the exported
blueprint's routes (the exporter's own `ground_paint` + `clip_ground_paint`),
so a path fix is measured and looked at before the publish. `paint-check`
fails on a dangling end, a join under 50 deg, a door threshold more than
0.3 m from the paint's half-alpha edge, and paint on the province road;
all four at 0 before any packet. `paint-look` draws the land cover in the
studio's ground textures with the paint composited exactly as
`groundPaint.ts` does, building outlines grey and door thresholds cyan; hand
the pictures to one Sonnet reader with R84's look-list (ways meet ways,
doors and the road; no acute spurs; subtle but visible; no orange; no
darker doubled patches; the way out runs out along its track).

## Record as you go

A finding that cost more than one render round, and every compile
refusal, is a row in `place-build`'s `references/lessons/` (its step
8). Tool gaps also go to the lane doc's Rounds notes.

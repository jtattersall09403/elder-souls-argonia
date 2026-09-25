---
name: placement-workbench
description: The tool manual for the headless placement workbench (tooling/placement-workbench/wb.py) over the frozen ground — every command (describe, place, snap, settle, mount, attach, group, measure, check, compile, render, export), its bars and its cost. The design procedure for a place is the place-build skill; use this one for how to run a wb.py command, read its output, or judge a contact, a seat or a door on the actual geometry.
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
is 1-2 s; a Blender launch costs 40-50 s (measured, yard B: each kit it
uses is imported), so a render round is ONE launch (`render --shots`: 205 s
for yard B's 11 shots at 1024 px on the two job_guard cores).

## 1. Read before you place

- The design reading (record, promises, culture grammar, lessons, design
  index) is `place-build` step 0; the kit list and the piece per use come
  from its design brief (step 1). A fixture reads its
  `world/sources/sites/<slug>.json`.
- Memory: `grep '^anon' /sys/fs/cgroup/memory.stat` under 7 GiB before a
  render (one Blender at a time).

## 2. Open the ground and site the place

    $W window --centre-km E S --half 150 --place-id <id>
    $W map                       # . <2 deg  + <3  o <6  # steeper  ~ wet  W deep >= 1 m  R road  r track

Buildings with fit `direct`/`pad` need footprint cells under 2 deg, `stilt`
under 3 deg (97 B3, `compile_settlement.fit_slope_failure`); `plinth` and
`dug-in` are held by the ground delta instead. A hull needs >= 1 m of water
all round. Keep off roads (`R`/`r`) unless the piece is meant to meet one.

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

    python3 tooling/placement-workbench/wb.py apply <place>.layout.json [--scene NAME]
        [--no-compile] [--allow-stale-ground]   # fresh scene, every op, check + compile: 12 s (yard B)
    python3 tooling/placement-workbench/wb.py replay --scene NAME --out <place>.layout.json
    cd tooling/world-generation && python3 -m worldgen.render_blueprint --layout <layout>   # plan, 3 s

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
- A part the plugins place on this shell at a fixed offset (a door, a
  window, a chimney): `$W attach <part> <shell> [--template ID]`, which uses
  the mined template (offset, turn, part scale).
- Roll and mirror exist for trying a fit; export refuses both (the runtime
  turns a piece by yaw and pitch only).
- Water pieces (`anchorClass water`) settle on the recorded level; a
  landing stage runs from the dry shore to the hull (tip within 0.5 m of
  the wet edge and of the hull outline).

## 5. Measure everything

    $W measure <a> <b>           # gapM (exact, FCL), intersecting, penetrationM (+ direction), patches
    $W ground <uid>              # heights under the footprint, delta, max slope, foot float
    $W check                     # every piece + every near pair + every door + quay reach, in one call
    $W openings <shell-uid>      # doorways to paths; every door and window face clear 1 m out
    $W signature                 # buildings sharing one shell + assembly (they read as copies)

Bars (the proving-ground gates): a run joint `gapM <= 0.03` and
`penetrationM <= 0.05`; unrelated pieces never cross; `footFloatMaxM <=
0.3` for ground pieces (docks exempt); `slopeRule` null for every
building; `yOffRuntimeM` 0 after `settle` (the workbench seat IS the
runtime's `anchorPlacement`); doors within 4 m of a path.

## 6. Render and look (Sonnet reader)

    $W render top                        # layout, footprints (cyan), paths (orange), labels
    $W render front --focus <uid>        # faces the doorway; red line = terrain cut
    $W render cutaway --focus <uid> --cut 0
    $W render iso | turntable [--focus <uid>]
    $W render --shots auto               # a round in ONE launch: top, a front per parcel on its
                                         # door side, isos from 45 and 225 deg; or a list
                                         # top,iso,iso:BEARING,front:UID -> output/renders/<scene>/round-N/
                                         # with manifest.json naming each shot's subject

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

Export writes POSE fields only (`centreUV`, `yawDeg`, `assetRef`, run
`pieces[{asset, atM, yaw}]`, the shell's `assembly[{asset, atM, upM, yaw,
pitch, on, layer, evidence}]` (`blueprint.assembly_failures`), landmark
`position`, route `via`/`points`).
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
the owner-walk table (every item, every time). Prose goes through
`text-review` in a separate agent.

## Record as you go

A finding that cost more than one render round, and every compile
refusal, is a row in `place-build`'s `references/lessons.md` (its step
8). Tool gaps also go to the lane doc's Rounds notes.

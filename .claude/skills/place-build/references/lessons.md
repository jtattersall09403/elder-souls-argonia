# Lessons (the operative store; decision 0100 decision 4)

Seeded 2026-09-25 by 16k slice 1b: **this seeding is 16i item 0** (the
lesson reconciliation), done over world 96 §2, the retired
settlement skill's rules, the 16h check-in 1 causes (16h brief :279-324),
the check-in 2 rulings (:505-578), the check-in 3 diagnosis
(`tooling/.reports/16h/checkin3-diagnosis.md`, gitignored: its operative
content is copied into the rows below) and the workbench lane's open tool
gaps (`docs/phases/lanes/placement-workbench-lane.md` rounds 3-4). World
96 §2 keeps the history; this file keeps what is still in force.

**How to write here.** One row per lesson; a new finding that restates a
row edits that row. Rule = an imperative. Enforced by = the gate, test or
`check` rule, or `prose only: <slice that will mechanise it>`. Shot = the
render the reader checks it on (`plan`, `top`, `front`, `iso`; `walk` = only
the owner's walk shows it; `-` = not visual); `reader-checklist.md` is
regenerated from the rows with a shot. Source: owner walk, reader round,
compile refusal, or the record it came from.

## Record and grounding

| Id | Rule | Defect and cause | Enforced by | Shot | Source |
|---|---|---|---|---|---|
| L01 | Build every line of the promise ledger (`blueprint_promises --id`): each service, NPC role, destination, provision and socket is a placed thing or a written reason | Lilmoth promised `service-hub` in prose; its blueprint had one shop parcel (96 §2 Doors round) | `blueprint_promises` in `compile_settlement`; 97 E9/G22 (HARD from M3, WARN below) | - | 96 §2 |
| L02 | Put every tie and promise in a typed field; prose names a thing only if a typed field references it | ties written as prose were honoured by nothing (96 "What 16g taught"; §2 Gap plan B9) | `prose_links`, `place_obligations`, standard 12 | - | 96 §2 |
| L03 | Fix a record defect as a rule gap with a failing test before designing, never design round it | Claywater's record: `assetPlan` names `hlaalu-domestic` and `fences-wattle`, D2 on danger band 4 (97 A7), a ferry with no travel-services row (`tooling/.reports/16k/orient-plan-context.md` (d), (e)) | prose only: slice 1c (the test in `audit_place_semantics`) | - | 0100 decision 7 |
| L04 | Choose a piece on its measured size and the mined evidence, never its label; a piece whose pivot sits far from its geometry is dropped | a 55 m root house named for a three-person camp; pivots 4.6 m to 1,788 m off; the Imperial wall tower is wall height by design, the tall one is `mwimparchtowerbg01` (96 §2 Part 6, Round A; check-in 2 ruling 12) | `wb.py describe`; `measure_footprints` flags | - | 96 §2; owner walk 2 |
| L05 | One kit set per district for buildings and structures; the dressing pool is admitted everywhere; cultures layer, never blend | kits blended in one district; a district drawn round one prop (0041 Taste ledger :342) | `blueprint.KIT_SETS`, `DRESSING_KITS`; 97 C1, C1a | iso | 96 §2; 0041 |
| L06 | Write an accepted answer into the record the same day; prose describing a rejected option is a defect | the Licensed Stage still described the tent (0041 :351) | prose only: slice 1c (design.md review) | - | 0041 |

## Layout

| Id | Rule | Defect and cause | Enforced by | Shot | Source |
|---|---|---|---|---|---|
| L07 | Turn every building to its door's way with a written reason: door within 4 m of the way's centreline and facing it within 60 degrees; a piece's front is the side its author left open | axis-aligned squares with south doors (Round A); a radial farmhouse door 27 degrees off its wall (workbench round 3) | `door-on-way` HARD; `wb.py doors`; 97 C8, C9 | plan, top | 96 §2; reader round |
| L08 | No ruled lanes and no huts in columns; rings carry jitter (about 6 degrees, 2 m); each dwelling its own offset (5.5-6.5 m) and spacing (12-19 m) | Pusbottom's parallel lanes and 15 m columns; Nine-Trunks' exact nonagon (0041 :339-340) | 97 C8 (≤10 % within 5 degrees of one yaw, HARD); columns: prose only: slice for type 2 | plan, top | 0041 |
| L09 | Measure spacing between footprint centroids and density over the built hull; props are not buildings (`kind` building / structure / prop) | pivots 8-20 m off hulls; a works yard judged as a village (96 §2 Round A audit; 0041 :341) | `parcel-gap`, `built_hull_area_ha`, `parcel_kinds.py`; 97 C5, C5b, C6 | plan | 96 §2; 0041 |
| L10 | A trade contact is `worksWith` + `worksWithWhy`, held 0.5 m clear; `abuts` is for kit snap pairs only | a hoist against its rock mis-declared as a snap (0041 :345) | `WORKS_WITH_CLEAR_M`; 97 C5a | - | 0041 |
| L11 | Integrate the layers: a way touches only the building it ends at, no two ways duplicate a movement, a gate stands across its road, streets inside continue the province network | Round A layouts stacked layers (96 §2 Round A feedback) | `blueprint_integration`, `network-stitch` (HARD); 97 C3, C-stitch | plan | 96 §2 |
| L12 | A gate is named for the road it faces, sets the width through it, and cannot be walked round; its door faces the road's outside end | Lilmoth's "north" gate; Mazzatun's shoulder path at 42-58 degrees (0041 :332, :348-349; 96 §2 B8/G13) | `gate-door-outside`; spans rule; 97 C3, D3 | top, iso | 0041 |
| L13 | Design from the walking player's eye: approaches, a first-seen object taller than the canopy on its ray, the door one wants visible from the way; answer the 16 approach questions | a plan that read on the map was illegible on the ground (96 §2 Round A) | `approaches[]` schema; the 16 questions: prose only: slice 1c | iso | 96 §2 |
| L14 | What the eye wants gets a path: a quarter in plain view within 150 m is joined by a footpath unless the ground forbids it | Lilmoth's 500 m detour to the shore quarter (0041 :350) | prose only: slice 1c | plan | 0041 |
| L15 | Paths and worn ground run to every door | "no paths visible" at check-ins 1 and 2 (16h ruling 4) | 16k Gate row; G1 ground paint: prose only: slice 1c | top | owner walk 1, 2 |
| L16 | Enclosure follows culture: Imperial walls the gate and fences yards and fields; Argonians build no fence or wall unless the lore cites one (a closed ring of dwellings is the edge) | fences in Argonian places (0041 :344); breadth-bars enclosure minimum must be per culture (grounding audit §2 item 7) | `_fence_failures` HARD; 97 C10 | iso | 0041 |
| L17 | Where C2 and C4 want the same ground the Hist wins; the Hist is never cleared, built over or moved; Argonian places promise a shrine, not a temple | Lilmoth's commerce node (0041 :343); temples in Argonian places (:329) | 97 C4, C15; promise ledger R3; C15: prose only: slice for type 2 | top | 0041 |
| L18 | A solid mass stays a mass; a post that must be entered uses a piece with a baked leaf | guard tower, Ayleid stair block (0041 :330) | prose only: slice 1c | front | 0041 |

## Buildings, doors and composites

| Id | Rule | Defect and cause | Enforced by | Shot | Source |
|---|---|---|---|---|---|
| L19 | A building is an assembly: shell, door, porch or steps, windows, roof detail, chimney, light, personal clutter, wear, each piece citing a mined template, mount or measured contact | shells placed bare; check-in 2 "no windows" (ruling 8); building-depth §2 | `bind ... assembly`, `blueprint.assembly_failures`; `wb.py openings` | front | owner walk 2 |
| L20 | Meet the 0098 table and the breadth bars: minimum set per dwelling (door, light, roof detail, windows unless none by design, ≥ 5 personal clutter), pieces within 12 m, shells and top-shell share per tier; two houses on one shell differ on ≥ 3 axes; one assembly ≤ 3 times province-wide and never twice within 2 km | a template cap scoped to a region allowed 50 copies (96 §2 Variety) | `wb.py signature`; `breadth-bars.json` gate (16k § 1b) | front, iso | 0098 |
| L21 | A door exists only where an interior exists; a hollow shell with none is `interior: none`, has no door record, and its leaf is a static part; a door sits only on a derived doorway; an enterable building earns its interior with a medium-or-higher player purpose | check-in 2 ruling 5; the yard's `none` parcels still carry doors (open planner call); six KotM mud-hut shells enclosed with no interior kit (`test_interiors_index`, check-in 3 other checks) | `blueprint.validate_blueprint` door rules; `player_purpose.py`; 0081 decision 4 | - | owner walk 2; 96 §2 |
| L22 | A composite holds only the shell, the door its mod placed with it and a mined walkway or porch; everything else is authored per building | door part in the stilt hut's roof; mud hut door wrong (check-in 2 rulings 5, 6) | `composite-author` skill | front | owner walk 2 |
| L23 | Invert a mined relative yaw before copying it into a composite (mined yaw is clockwise, `import_composite` turns counter-clockwise), and run the composite's visual step before it ships | bamboo hut leaf turned 240 degrees off (config copied 120; `mud/hut-with-entrance` 153.74 and phitt marsh-house-03 also copy unchanged); the stilt house leaf 6.256 m off its doorway (stale interiors sidecar) (check-in 3 §4) | door-leaf test checks plan only: yaw gate prose only: 16k 1a | front | owner walk 3 |
| L24 | Seat a stilt or quay piece by its DECK at the designed clearance above its support (water where it covers the legs, else ground), from the plugin median (`deckClearanceM`, 0.35 m default); legs bury; a stilt piece on land is never water class | stilt hut, landing stage, boardwalk stood on their leg tips; later sunk to the ground by a water-class row (check-in 1 cause 1, check-in 2 ruling 5) | `placement-policies.json` `deckClearanceM`; `test_proving_ground` | front | owner walk 1, 2 |
| L25 | A dug-in piece's threshold is flush with the approach (designed sink = the measured sill) and its flanks are embedded by a terrain patch or the kit's own rock pieces | cave mouth hollow ends and a 6-12 inch step (check-in 2 ruling 9; 97 C11a) | gate sill `SILL_LIMIT_M`; flanks: prose only: item 0c | front | owner walk 2 |
| L26 | Build a cave mouth the vanilla way: `rockcaveentrance01` with an invisible `autoloadmarker01` door at its mined median pose, `interior: promised`, flanks as a ground raise | the yard's `doorcaveb` is a philscaves interior piece no plugin places outdoors; 91 AutoLoadDoor01 refs stand within 12 m of a cave static (check-in 3 §6) | prose only: the first type 5 slice (deferred, owner 2026-09-25) | front | owner walk 3 |
| L27 | Every placed piece has its collider published and attached | ferry raft and sign post walked through (check-in 1 cause 5) | the collider gate (`kit-build`) | walk | owner walk 1 |

## Runs and built ways

| Id | Rule | Defect and cause | Enforced by | Shot | Source |
|---|---|---|---|---|---|
| L28 | Snap pieces designed to connect face to face from the mined pairs; a chain always needs pairing evidence, a single piece none; walls, gates and towers are one run, never lone parcels; an open end takes the kit's end piece or faces a neighbour | the Imperial wall, gate and tower placed as three parcels (check-in 1 cause 2); Hlaalu bridge pieces chained 29 deep with no template (96 §2 Span kit) | `abuts-snap` 0.15 m / 5 degrees; `openModularEnds`; `snap --by evidence` | front, iso | owner walk 1; 96 §2 |
| L29 | Keep a run's joints level: adjacent run pieces seat at one datum | wall run ends off their joints by 3-6 cm: the runtime re-seats each run piece on its own footprint and discards the compile's run datum (check-in 3 §2) | no joint-height gate: prose only: 16k 1a | front | owner walk 3 |
| L30 | A built way (ramp, stair, boardwalk, bridge) is placed only as a run with both ends resolved; every raised deck has its visible stair; ramps ≤ 30 degrees | a lone ramp connected to nothing (check-in 2 ruling 11) | `openModularEnds`; 97 C14 HARD; `modular-runs` | iso | owner walk 2 |
| L31 | A landing stage reaches DRY ground: tip and the closing piece's foot at least 0.2 m above the local water; extend with 7.1 m straights or shift the run; close with the smallest drop piece whose drop covers deck minus dry ground, sunk by the recorded remainder; never pick a step piece by drop alone | the yard stage ended over ground under water; the bank never reaches the 18.60 m deck within 40 m (check-in 3 §7) | **deferred to the first water-village or works-and-landing slice** (type 3 or 7): `anchor_quay_run` + gate, owner ruling 2026-09-25 | front, iso | owner walk 3 |
| L32 | Choose a berth on the water it opens onto (connected body, extent, reach to main water) and put the anchor on the bank above it; a hull needs ≥ 1 m of water in its 2.5 m halo | a berth in an 882 m² closed pocket; a 0.9 m channel that was dry terrace (96 §2 Landing re-site) | `dock_dredge` verdict; `wb.py check` `_hull_water` | iso | 96 §2 |

## Dressing, clearance and ground

| Id | Rule | Defect and cause | Enforced by | Shot | Source |
|---|---|---|---|---|---|
| L33 | Author dressing in the layout as yard sets placed with `group place`, to 0098's numbers; nothing is placed by code at a building's foot and the compile never invents dressing | rubble ring and skirt band blocked the gateway and flashed (check-in 2 ruling 1); compile dressing with no host floated 0.47 m (check-in 1 cause 4); 97 C12's compile ring (3-6 pieces, `DRESSING_COUNTS`) is retired by 0100 decision 5 | `test_proving_ground` "no ring dressing"; unhosted template dressing dropped and counted | front, iso | owner walk 1, 2 |
| L34 | Every dressing piece stands on the ground or its host, or hangs from its mount pair; never floats | barrels floated 0.47 m (the plugin-sink defect, miner round 10) | `wb.py check` `footFloatMaxM` ≤ 0.3 | front | owner walk 1 |
| L35 | Clear vegetation with the place's own `vegetation-clearance` patches, graded (hard clear, fringe, kept discs); never re-run `compile_scatter` for a place | 783 plants inside built ground (96 §2 Rollout); a scatter bush 0.52 m from the farmhouse threshold because scatter gets no settlement clearance (check-in 3 §5) | 97 C13; scatter clearance: prose only: item 14 | front | owner walk 3; 96 §2 |
| L36 | Touch the ground only through typed per-place patches (pad, clearance, dressing-add); never re-carve the frozen array | 48 of 54 typed requests would have moved water (96 §2 16b) | `terrain_patches.py` invariants; 0081 decision 3 | - | 96 §2 |

## Build and publish

| Id | Rule | Defect and cause | Enforced by | Shot | Source |
|---|---|---|---|---|---|
| L37 | Compile last: fix, then run the chain; a hand edit after grading or compiling invalidates that step's receipt | four false "broken world" errors (96 §2 Rollout) | stage receipts; the exporter refuses | - | 96 §2 |
| L38 | Re-derive derived geometry (ways, footprints, districts, doors, terminals), never hand-correct it; run the derive passes to a fixed point | forgotten re-derives after a rebuild, three times in a session (96 §2; §3 "A derived route is regenerated") | `wb.py compile` runs the passes twice; validator drift check | - | 96 §2 |
| L39 | Never hand-edit a pose: change the layout file and `apply`; export writes the poses | poses edited in JSON were lost on the next export (0097) | `wb.py export` pose fields | - | 0097 |
| L40 | Read the numbers before the pictures: `check` and `compile` before every render | the first yard-B compile refused eight things `check` had passed (workbench round 3) | `wb.py check` calls the compile's own rules | - | workbench round 3 |
| L41 | Hand the owner every item with its coordinates, the full list every time | owner rule, 16h Part 1 state | `wb.py walktable` | - | owner walk 1 |

## Tooling gaps still open

| Id | Rule | Defect and cause | Enforced by | Shot | Source |
|---|---|---|---|---|---|
| L42 | Give the reader lit, framed shots; a black or unreadable image is re-rendered, never read | one reader view of a dark close-up came back black (workbench round 4) | prose only: 16k 1b multi-shot render | all | reader round |
| L43 | Author the whole layout in one file and render one Blender launch per round | yard B took 90 mutating calls and 32 renders for 18 placements (0100 evidence) | `wb.py apply`, `render --shots auto` (16k 1b) | - | workbench round 4 |
| L44 | Expect HTBM's boardwalk joint to penetrate 0.081 m (its own 15-degree joint) and the compile to slide a quay pose 0.025 m; neither is a layout defect | workbench round 4 Open row | open: no gate | - | workbench round 4 |

## Walk findings that are not layout

| Id | Rule | Defect and cause | Enforced by | Shot | Source |
|---|---|---|---|---|---|
| L45 | Route camera, flicker and flash findings to the runtime owner, not to the layout | camera swing when pulled in by a wall (look target not moved by the obstruction, check-in 3 §1); decal overlays z-fighting on 203 materials (§3); buildings flashing out for a frame (check-in 2 ruling 2) | runtime fixes 259b200a, 5d854e98 | walk | owner walk 2, 3 |
| L46 | Check that each placed piece is visible from the ground at its coordinates | the boardwalk was invisible at 4.273 / 5.739 (check-in 2 ruling 7) | `test_proving_ground` visibility row | walk | owner walk 2 |

## Superseded at seeding (kept here so no one revives them)

- 96 §1 step 7b (re-scatter the cleared chunks) → L35 (0081 decision 3).
- 96 §1 steps 9-10 (Round A, Rounds B-C, frame rate at Lilmoth) → the
  16k walk packet (SKILL step 6).
- 97 C12 compile-placed dressing ring → L33 (0100 decision 5).
- The 25 % template cap → L20 (0098).
- The retired settlement skill's exemplar table and `--fixture-replay` of the five
  2026-09-09 blueprints (retired; hand-off ruling 4).
- "2D blueprint phase, then 3D" → the plan read of the same layout
  (0100 decision 3).

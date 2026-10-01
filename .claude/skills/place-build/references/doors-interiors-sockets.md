# Doors, interiors and sockets (procedure)

> **Written against** decisions 0081 decisions 3–4 (the TES door model),
> 0062 decisions 3–4, 0103 (tier A interiors in 16k; every promise a
> placed socket) and 0102 decision 2 (`walkRule`). The deliverable items
> these came from are 16k § Carried backlog 16h items 11 and 18, 16i
> items 4, 5 and 9. If a cited record has moved, this file is stale.

Read at SKILL steps 1 (§ Interiors, § Sockets), 2 (the ops and the claim
run) and 5 (the gates).

## 1. Door records (16h items 11 and 18)

- **The door model is the TES one (0081), in two types (0104 decision
  4):** a `load` door moves the character into a separate interior cell
  and back; a `swing` door opens in place by animation (a barn door, a
  yard gate, a partition between two exterior or two interior spaces),
  toggles its collider, and has no cell. Both are `door` records with
  `doorType`. An open structure with no door at all (a deck, a gate
  arch, a shelter) has no door record and is walked through as exterior
  geometry. Skyrim marks the difference on the reference: a `DOOR` base
  with an `XTEL` teleport is a load door; without one it swings by its
  NIF's open/close controller sequences, and the mined door-links record
  carries `doorType` from that.
- **Swing doors are built in 16k (walk 4; owner 2026-09-28)**, never
  deferred to a later phase. The record (interior bundle `doors[]` entry,
  or a place door with `doorType: "swing"` plus a `swing` pose):
  `{id, doorType: "swing", assetId, kit, positionM, rotationDeg, scale,
  hinge: {pivotM, axis, openAngleDeg, openS, source, leafBoundsM?},
  initiallyOpen}`. The exporter (`worldgen/export_interior_bundle.py`,
  schemaVersion 2) writes one per interior DOOR reference with no XTEL,
  instead of a placement. The hinge is read from the door NIF, never
  guessed: the animated child node's translation is the pivot (the NIF
  root is not: farmhouse doors' roots sit mid-width) and the `Open`
  sequence's last key gives the axis, the signed angle and the duration
  (farmhouseanimdoor01 −92° over 1.0 s; impjaildoor01 +123°; the
  farmbtrapdoor02 lid +15° about x). `leafBoundsM` is present when the NIF
  also draws shapes that do not turn (impwooddoorsingle01's wall); only
  parts inside it turn. A NIF with no `Open` sequence falls back to the
  kit bounds' −x edge, 90° over 0.6 s. `initiallyOpen` is the reference's
  ONAM ("Open by Default", UESP Skyrim_Mod:Mod_File_Format/REFR).
- **Runtime contract** (`packages/game-core/src/interior/swingDoors.ts`):
  within 1.5 m the prompt reads Open or Close (`text.door.prompt-open`,
  `text.door.prompt-close`) through the interaction arbiter; `activate`
  toggles; the leaf turns about the hinge with an ease over `openS`; its
  collider is off while it moves and rebuilt at the leaf's pose at rest; a
  body in the arc it would sweep keeps it shut or open; it emits
  `door.open`/`door.close` on the typed sound bus (`packages/audio`). The
  load-door transition never sees a swing door (`loadDoorsOf`).
- **The loading line names the building:** a load door whose record
  carries `displayName` (the parcel's reviewed name, copied by the
  compile) shows "Loading {name}…" (`text.door.loading-named`); without
  one, "Loading…".
- **Asset-aware pairing (owner 2026-09-27; SKILL step 1 § Interiors):**
  an enterable shell is used only with the interior its author designed
  for it, built from assets we hold or can source (vanilla, Tropical
  first, or the mod pool); Creation Club, HearthFires, Dawnguard,
  Dragonborn and the SE resource pack are never ours. A store, barn or
  workshop with a load doorway gets its designed room like a house
  does; a shell with a load doorway and no such room anywhere is not
  placed.
- Every enterable shell and every entrance piece gets one door record,
  id `door.<placeId>.<parcelId>.<n>`, stable across compiles. **One
  entrance per piece** (owner 2026-09-07): the entrance is the kit
  index's ranked `entrance` (esp-door > assembly > door-piece > leaf >
  opening > open-front; `radial` stands anywhere on its ring); a second
  is never invented.
- Fields on every door record and in the bundle's `doors[]`:
  `interiorStatus` (`reserved` by default), `interiorClaim` (null, or
  the tier A claim below), `arrivalMarker` (the exterior point and
  bearing where the character stands after leaving), `streamingBoundary`
  (the slot where the exterior stops being simulated).
- **Reachability every compile:** the threshold within 4 m of a way
  (97 C9) and reached from the road terminal by `walkRule` (0102
  decision 2). A door with no id, or an entrance piece with no door
  record, fails the compile.
- A reserved door stays closed and shows the reserved-door message from
  `packages/text-catalogue` (the text is `text-review`ed in a separate
  agent).
- The bundle carries a `variants` slot (`LocalStateVariant`: placements
  shown or hidden by a world-state key, empty by default) and refuses an
  old-schema bundle with the version named.

## 2. Which shell, which cell (0103 decisions 1–2)

1. **Shells are chosen for their interiors; the plugin data is the
   manifest (decision 0114, R83).** A lived-in building (a service, a
   home, a workplace) takes a shell that a plugin's own load door links to
   a furnished cell (`world/sources/placement/exterior-interior-links.json`;
   a composite inherits its base shell's links). **No closed buildings**
   (owner 2026-09-30, 0114 rule 3, lessons L50): every building is either
   open (no doorway: an open front, shed, stall or tent walked into in the
   world, no door record; an unlinked shell whose way in is an `approach`
   or `open-front` opening, such as the BM&V swamp house, is open) or a
   linked shell opening onto its linked cell.
   A doored shell no plugin links is `hollow`, and hollow is a build error:
   `--claim` exits 3 and `place_gates` gate `interiors.closed` fails,
   naming the door. Swap it for a linked shell at design time. No culture
   pool, no size or label match ever lends a shell another shell's cell.

   **Shell-choice checklist** (one line per building in the brief's
   § Interiors, before the layout is written): (a) open structure with no
   doorway, or doored? (b) doored: the base shell's row in
   `exterior-interior-links.json` and its linked cells (none = choose
   another shell now); (c) the cell's use class serves the parcel;
   (d) the cell is not already held in the region (R4) unless the linked
   set is exhausted. A door is `reserved` on a linked shell only when no linked cell
   passes (rule 2), and `--claim` exits 3 naming it. The cell chosen is
   also held against repetition (0105 R4: no cell twice in a region unless
   the shell's linked set is exhausted, at most 3 in the province;
   `place_gates --claim-cells`, gate `interiors.variety`).
2. **The cell is picked from the shell's linked cells, deterministically.**
   The link is the interior: a linked cell bigger or taller than its shell
   is the modder's pairing and stands. A linked cell passes with at least
   one exterior load door per
   entrance (spare ones ship closed); the bundle passes the acceptance gate
   and misses nothing but clutter or furniture (planner ruling 2026-09-27,
   `bundle_sourcing`: missing pieces classed from the base record or
   `kit-interiors/absent-master-classes.json`). Rank: fewest clutter pieces
   still lacking a stand-in (`kit-interiors/substitutions/<cell>.json`),
   then a use class that serves the parcel (from the furniture mix: beds
   and a bar = inn, counter and stock = shop, altar = shrine, hearth and
   beds = dwelling; it ranks, never refuses), then the plugin's most-used
   cell, then id; a cell another building here holds is taken only when
   every passing cell is held. A stable (no plugin authors a stable
   interior) is an open-sided shell with no door record, walked into; a
   stable house (the keeper's home) is a dwelling and takes a linked shell
   (0105 R2). A door's `preferCell {cellId, why}` names the story's cell; it
   wins when it passes. A claim outside the shell's linked cells, or with
   too few doors, fails a test (`test_blueprint_interiors_claim.py`). An
   NPC socket authored in a cell (`interiorCell`) moves when its door stops
   claiming that cell: `--claim` names the orphan and the compile refuses it.
3. `blueprint_interiors.py --claim <blueprint>` writes the pick and its
   `why` on the door record (`interiorClaim`: `tier`, `cellId`, `plugin`
   or `pool`, `why`, `interiorLoadDoorRef`, `arrivalMarker`); the claim is
   never written by hand.
4. A kit's `interior: matched` (a sibling interior *mesh*) is not tier A.
   A shell with a matched mesh and no furnished cell is not used for a
   dwelling, shop, stable house or workplace (0105 R2); for a tier B or C
   interior its door stays `reserved` with `interiorShell: <mesh>` so
   Phase 12 furnishes it; `tileset` shells are Phase 12's on the same
   terms.
5. Mark the D0 safe interior the settlement owes (quests 20 §12) on its
   record. `acousticProfile` and `lightingProfile` stay typed empty slots.

## 3. The tier A cell, copied verbatim (0103 decision 3)

    python3 -m worldgen.export_interior_bundle --blueprint ../../world/sources/blueprints/<place-id>.json   # (worldgen)

- Every reference in the cell with its transform, mapped to published
  kit assets (the interior tileset, furniture, clutter, containers,
  lights). Actors and quest-flagged references are dropped and listed;
  books and notes keep their mesh and become item sockets with
  `contentPending`. A base object with no kit asset is listed as a gap,
  never faked.
- Lights are the plugin's light records (radius with the `XRDS` override,
  colour) and the cell's lighting (ambient, fog colour and range, from
  `XCLL` and its lighting template). If a field is missing, extend the
  reader; never guess a value.
- **Acceptance:** reference count equals placements plus listed drops plus
  substitutions, a stand-in's kit category equals the missing piece's class,
  and a missing architecture piece fails the export
  (the exporter's acceptance, `test_export_interior_bundle.py`). Interior kits are built and published through `kit-build`
  like any kit.
- **The hearth burns** (16k walk 6): the plugin's hearth fire is an MSTT
  effect (`FXfireWithEmbersLogs01`, `FXfireWithEmbersLight`) with no kit
  mesh; the exporter stands it in as the kit fire bed
  `fireplacewood01burning` (`HEARTH_FIRE_STAND_INS`, one per hearth), the
  one effect that is not a listed drop. Every other effect stays a drop.
- **A tilted piece keeps its plugin tilt** (16k walk 6): Skyrim composes a
  reference's rotation as `Rx(-x) Ry(-y) Rz(-z)` (z applied first, about
  the world axes; `game_rotation_deg`). The reverse order stood every
  board rotated (90, 90, 0) on edge, so the Lilmoth upper floors hung in
  the air as vertical planks. Pinned by `test_a_rolled_floor_board_lies_flat`.
- **Audit every exported cell** with `wb.py audit-interior <cell>` (exit 0):
  textures published, and no piece over 3 m (a shell, a wall) with its
  diffuse aliased to a `/lod/` copy (KotM's `ceramic01teal_dlod` is one
  flat colour, pixel std 3/255, and was the owner's "flat green walls"; a
  kit alias to a LOD copy is checked by its pixel spread before it is
  written, in the kit config's `textureNote`), no piece more than 5 cm from any support, stairs
  land at both ends, hearths lit, lit density. A red names the kit, the
  texture or the piece; fix it at its source.

## 4. The interior runtime contract (0103 decision 4)

What every published door must do; the code is
`packages/game-core/src/interior/` (its README has the file map).

- The action key at a door with a tier A claim → fade → the interior at
  its arrival marker; the interior's load door returns the character to
  the exterior threshold, within 0.5 m of the door's `arrivalMarker`.
- One bundle per cell (`apps/world-studio/public/province/interiors/<cellId>.json`,
  `schemaVersion` 1), streamed on approach to the door.
- Interior lighting from the bundle, no sun; the interior camera fades
  occluders at the near plane (16h item 24).
- Water state, time, ownership and world-state keys survive the
  transition (world 80 §63).
- The studio opens a cell directly: `$ES_TUNNEL_URL/?view=character&interior=<cellId>`.
- Interior navmesh bakes are 10b's; the record says so.

## 5. Sockets (0103 decisions 5–6)

`sockets[]` in the compiled settlement record and the bundle,
`socketsSchemaVersion` 2, exterior and interior alike. One entry per socket:
`id`, `kind`, `positionM`, `yawDeg`, `parcelId`, `interiorCell` (null
outside), `host` (the placement it sits on or in), the kind's data block
and a `why`.

| Kind | Data |
|---|---|
| `npc` | `rosterSlotId`, `role`, `schedule[]` of `{dayPhase, socketId}` pointing at `idle` sockets (work, home, evening; dayPhase from world 8a). Every roster slot has at least a work and a home socket; home may be a bed in a tier A cell |
| `idle` | `activity` (stand, sit, sleep, lean, work-at, fish, tend), `host` furniture when any; a `work-at` one carries `interact` |
| `station` | `stationClass` (vocabulary `stationClasses`), `interact` |
| `item` | `itemClass` from the vocabulary, `valueBand`, `why`, `contentPending` for text-bearing items |
| `container` | `containerClass` (barrel, chest, sack, crate, urn, basket, strongbox); `fillRule`: a blanket rule id (e.g. `blanket.household-barrel`) or `authored` with `lootTable` `{itemClasses[], valueBand, storyNote}` consistent with the place's story |
| `encounter`, `fauna`, `ambience`, `marker` | kind, danger band, zone |

- The vocabulary (kinds, item classes, container classes, fill rules,
  day phases, value bands) is one record,
  `world/sources/vocab/socket-vocabulary.json`; each item class names its
  asset source, so a socket never promises a thing no asset exists for.
  Never a second vocabulary.
- **Authored where the thing is placed.** A container or furniture piece
  placed by a yard set or an interior cell yields its socket
  automatically (class from the kit manifest category). The builder
  authors `npc`, `item`, `encounter` and non-obvious `container` data
  with `socket` ops in the layout, one row each in the design brief's
  § Sockets table.
- **Gates** (`compile_settlement`): every roster slot has work and home
  sockets; every container placement has a fill rule; every promised
  service has an `npc` socket at its parcel; every item class is in the
  vocabulary; every `npc`, `idle` and `container` socket is reachable by
  `walkRule` (its `socket:<id>` route; a ring dressing container is exempt
  while the workbench scene does not hold the ring). Inside a tier A
  bundle (`interior_walk`), a socket on host furniture (bench, bed, chest)
  is reached from a walk cell within 1.0 m of the host piece's own plan
  box; a bare marker needs its own cell.
- **Interact point (decision 0113).** A work socket is where the worker
  stands; `interact` `{kind, position, facing}` is where the player uses
  the job, written by `sockets.interact_point` (compile and interior
  exporter alike, same frame as `positionM`). `customer` when the host's
  file name carries a vocabulary `serviceSurfaces` family (counter, stall,
  market): across the host from the worker, 0.6 m past the host box's far
  face along the worker's facing, facing back at the worker. `station`
  for every other work socket (forge, anvil, rack, a free work spot): the
  worker's own position and facing. A new service surface is a
  vocabulary row, never a code change.
- The studio draws sockets as labelled markers with `?sockets=1`; inside
  a cell it draws that cell's sockets where the cell is shown, and an
  interact point is a small diamond joined to its socket's post.
- Phase 13 and 10b read `sockets[]`; they add no vocabulary.

## 6. The approach checklist (16i item 9)

The 16 questions of
`docs/research/placement-settlements/openworld-approach-and-wayfinding.md`
§5 are answered per approach in the design brief's § Approach (first-seen
landmark, gate across the road, door visible from the way, …). Each "no"
becomes a layout edit (a moved sign, a cleared sightline as a clearance
patch, a lantern) or a rule before the walk; the reader's Plan and Iso
rows check the answers that show in a picture.

## 7. Interior lighting (16k walk 5)

The plugin's lights and cell lighting are copied verbatim (§ 3),
including the cell's directional-ambient cube: the XCLL (or its LGTM
template's) DALC, exported as `lighting.ambientCube` (interior bundle
schema 4). The loader turns it into a LightProbe (`ambientCubeToSH` in
game-core `interior/bundle.ts`, SH bands 0–2), so a floor gets the cube's
+Y and a wall its side faces. **A cell is lit by its cube plus its
sources, with no fill.** The exporter applies one rule before it writes,
`worldgen/interior_light.py apply_light_rule`:

| Step | What | From |
|---|---|---|
| 1 | Every lit fixture (lantern, candle) whose kit asset has a mined LIGH and no plugin light within 1.0 m gets that light, `refId: fixture:<placement id>` | kit manifest `light` (radius, colour, `offsetM`) |
| 2 | A cell WITH a cube keeps its ambient at intensity 1 (`ambient.rule: ambient-cube`). Fallback only for a cell with no cube: the flat ambient is raised until the unlit five-face mean reaches `FILL_E` 0.15 (`ambient.rule: interior-light-floor`) | the cell's own DALC; else its ambient and directional colours |
| 3 | Each light's `fade` and `falloffExponent` set so the runtime curve follows Skyrim's point-light curve | `skyrim_curve` |

A hearth is the plugin's; a burning hearth piece gets its flame from the
fire module (fire.md), never from this rule. A cell with no light record
at all fails.

**Self-check** (1–2 s a cell, in the exporter's test run):
`python3 -m worldgen.interior_light <bundle.json ...>` (from
`tooling/world-generation`) samples the roofed standable floor on
`interior_walk`'s 0.5 m grid at 1.2 m eye height, with the loader's own
light model (`test_interior_light.py` pins the constants) against the
bars below. `--reached` keeps only nodes reached from the doors
(~95 s a cell, measured 2026-09-30); `--apply` applies the rule to a published bundle in place.

**The bars** (both from the same run). Dark: at most `MAX_DARK_FRACTION`
30 % of nodes under `DARK_E` 0.12. Source-led: `light_balance` gives the
share of each spot's E that comes from the cell's lights, and
`sourceLedFraction` (the fraction of the walked floor where that share is at
least 50 %) must be ≥ `MIN_SOURCE_LED_FRACTION` 0.70, else the cell is
`flat` (a failure with `--balance`, a flag without it). The judged half is
reader row 48. Measured 2026-09-30 on the cube with no fill: the eight tier
A cells read 83–100 % source-led, dark 1–14 %.
A light reference's XRDS radius counts only when positive and at least a
quarter of its LIGH's base radius (`export_interior_bundle.light_radius_units`):
KotM carries negative and sliver values (a 0.38 m Lilmoth hearth light).

**The renders** (reader row 48): `python3 tooling/placement-workbench/wb.py
render-interior <cell>` (~40 s a cell, one Blender launch) writes
`tooling/.reports/16k/interior-renders/<cell>.png` from the published
bundle: three views (from the doorway looking in, from two opposite
corners, each stepped in past a blocker), row `day` = the loader's light
model (records at fade × π with the range window, ambient unoccluded,
directional from above, no shadows, no bounces), row `night` = the sources
alone (ambient and directional off: the runtime lights an interior the same
at every hour, so this row shows what the cell's own lights reach), and a
flame proxy at every fire the loader burns (orange; magenta = a lit
fixture's fallback). `--day` / `--night` render one row. A reader judges
readable, warm, lit by its sources, not flat. The proxy shows where a flame
belongs, never that the studio draws it: "flames verified" for a cell means
a PASS from `node tooling/visual-look/flames.mjs interior <cellId> <xKm>
<zKm>` on the built site (`references/fire.md` § 3 step 4).

**Design the lighting first time** (decision 0109). A dim or flat tier A
cell is fixed with more sources, never a fill or a raised ambient. Every living zone of
a tier A cell (bed, table, hearth, work, store, door) gets ONE local low
source within 1.5 m of its furniture (the light below the furniture's floor
+ 2.5 m), on or beside it: `glazedcandles01` on a table, shelf, chest or
cupboard top in a Keeba (Argonian) hut, else on the floor beside it;
`candlehorntable01` on a table or counter, else `candlehornwall01`, else
`candlehornfloor01`, in a Lilmoth (Imperial) house. Hanging
`argonianlanterns04` go only over open floor with no furniture surface
under them, at most 1 per 30 m² of walkable floor: the overhead lanterns'
broad 1-(d/r)² falloffs overlap into an even warm wash that readers judge
flat (walk 5 round 3). Surplus lanterns come out greedily, cheapest
source-led loss first, while source-led stays ≥ 0.70 and dark under its bar.
A stair gets a source its own doorway view sees, or a floor horn beneath it.
The door zone gets its source within 1.5 m (plan) of the arrival marker,
its flame on a clear ray from the render's doorway eye (the `eyes` lines of
the last `render-interior` result) and 0.6 m off the door-to-hub line:
`candlehornwall01` on the wall beside the door in a Lilmoth house, a
`glazedcandles01` on a surface or mudmother `candle01` on the floor inside it
in a Keeba hut (door.py beside the scripts below, 2026-09-30).
Small flames need no fade calibration: after `skyrim_curve` a
`glazedcandles01` (r 1.82 m, the only table candle under 2.5 m) gives E 1.03
at 1 m, 20× the cube's +Y bar of 3 × 0.017, and every spot within 1.5 m of
any table candle is already source-led; a candle reads weak beside a
lantern because it carries 15–77 % of its own table's light, not because
its near field is dim (measured 2026-09-30, `interior_light` model).
Prefer the plugin's own fixture kinds (candles, candle-horns, lanterns)
placed where a resident would: on the table, beside the bed, on the hearth
wall, and beside the door on the inside. Write them in
`world/sources/placement/kit-interiors/additions/<cellId>.json` (shape and
refusals in its README; additions only add, never move or remove a plugin
reference), then re-export from `tooling/world-generation`:
`python3 -m worldgen.export_interior_bundle --plugin "King of the Murkmire.esp" --cell <cellId>`
(or `--blueprint <place>.json` for every claimed cell). Each fixture whose
kit asset carries a `light` gets it from the rule's step 1. Verify:
`light_balance` source-led ≥ 70 % and the render-interior readers pass
readable, warm, lit by its sources.

**The rule the 2026-09-29 additions used.** A zone already lit (a plugin
light within 2 m) gets nothing. Each table or desk gets a table candle whose
every contact vertex lands on its top (±2 cm, clear of clutter); each unlit
living zone gets its main light: in an Imperial house a wall candle-horn,
back flush (≤ 3 cm) on a flat wall at 1.75 m beside it, a floor horn only
where no wall or table is near, and a candle-horn chandelier over the widest
open floor when the ceiling takes its 3.55 m hang; in an Argonian hut a
mudmother `argonianlanterns04`, top on the ceiling, bottom ≥ 2 m above the
floor (the kit's `argonianlanterns03` is the same lantern on a 2.15 m cord and
sits in the 19 MB dungeon-root kit). Then the builder adds the spot that
raises source-led most, one at a time, to 72 % (Imperial: at least 12 pieces;
the Plantation storehouse to 1 lit fixture per 12 m²), capped at 1 lit fixture
per 12 m² in a hut. The 2026-09-30 round replaced that density with the
rule above (`rethin.py`: zone sources, then lantern thinning). The seats are
measured by ray cast before export, every contact on one surface ±2 cm and no
other piece's vertex inside the fixture's box
(`tooling/.reports/16k/interior-light-additions/`). Lit density is measured
on the floor the player can reach from the doors, one surface per storey (a
rug or table top is not floor).

**Seat every addition with the tool** (16k walk 6):
`python3 tooling/placement-workbench/wb.py seat-interior <cell> <assetId>
<zone|x,y,z> [--mount table|wall|floor|ceiling]` (~2.5 s; module
`workbench/interior_seat.py`, test `tests/test_interior_seat.py`) seats one
fixture on the published cell's geometry (its existing additions ignored)
and prints `pos`, `rotZDeg` and `lightPos` for the additions file. A zone is
a placement id or name substring; a point aims a wall seat at that height
and must stand in the room, not inside the wall. **A wall piece's front is
the side its mined light is on**: `back_axis` turns the side opposite the
kit manifest's `light.offsetM` to the wall, and `rear_extent` sets the back
flush ignoring a lone spike (candlehornwall01's 0.5 m mounting spike goes
into the wall). The walk-5 scripts read the back from vertex counts and
mounted every candlehornwall01 backwards, flame to the wall; check that
`lightPos` stands in the room before writing the row.

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

1. **Shells are chosen for their interiors.** A lived-in building (a
   service, a home, a workplace) takes a shell that a plugin links to a
   furnished cell (`world/sources/placement/exterior-interior-links.json`).
   Every building that looks enterable is enterable (R52, owner
   2026-09-28): a shell with a door and no link takes a cell from its
   culture pool by the same fit rule; a shell that fits no pool cell is
   cut for doored buildings; an open-fronted piece with no door record is
   walked into (R18). A door is
   `reserved` (its pool named) only for a tier B or C interior (a
   dungeon, a unique large interior; 0105 R2): a dwelling, shop, stable
   house or workplace door is never reserved; the builder re-shells to a
   linked shell, or, for a doorless hut, dresses the inside as exterior
   placements. A composite inherits its base shell's links. The cell
   chosen is also held against repetition (0105 R4: no cell twice in a
   region unless the shell's linked set is exhausted, at most 3 in the
   province; `place_gates --claim-cells`, gate `interiors.variety`).
2. **The cell is picked by the fit rule, deterministically,** from the
   shell's linked set: the cell's room plan (its biggest enclosing piece
   and what overlaps it, measured in that piece's own frame) is 0.6–1.7
   times the shell's `planAreaM2` × scale² (the parcel's `scale`, else the
   manifest's `placedScaleMedian`, the plugins' median placed scale; a
   composite is 1). The band is derived from measured pairs: vanilla
   farmhouse cells over their shells 1.03–1.25, King of the Murkmire pods
   over theirs 1.50–1.65 (interiors round 4). The cell has at least the
   shell's storeys and at least one exterior load door per entrance (spare
   ones ship closed); use class matches the parcel's `services` (from the
   furniture mix: beds and a bar = inn, counter and stock = shop, altar =
   shrine, hearth and beds = dwelling). A stable (no plugin authors a
   stable interior) is an open-sided shell with no door record, walked
   into; a stable house (the keeper's home) is a dwelling and takes a
   linked shell (0105 R2). Ties break on the plugin's own most-used
   cell for that shell. A claim outside the ratio, with too few storeys
   or doors fails a test. The rule is asset-aware (planner ruling
   2026-09-27, `bundle_sourcing`): a cell's missing pieces (a base in a
   master we do not hold, or a mesh the vault holds nowhere) are classed
   from the base record or `kit-interiors/absent-master-classes.json`; a
   cell missing any piece that is not clutter or furniture (architecture,
   a container, an unclassed base) does not fit, nor does one whose bundle
   fails the acceptance gate; fitting cells rank by how many clutter pieces
   still lack a stand-in (`kit-interiors/substitutions/<cell>.json`, the
   bundle's `substitutions[]`).
   A door's `preferCell {cellId, why}` names the story's cell; it wins when
   it fits, and a later parcel of the same shell takes the next free cell.
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
`schemaVersion` 1, exterior and interior alike. One entry per socket:
`id`, `kind`, `positionM`, `yawDeg`, `parcelId`, `interiorCell` (null
outside), `host` (the placement it sits on or in), the kind's data block
and a `why`.

| Kind | Data |
|---|---|
| `npc` | `rosterSlotId`, `role`, `schedule[]` of `{dayPhase, socketId}` pointing at `idle` sockets (work, home, evening; dayPhase from world 8a). Every roster slot has at least a work and a home socket; home may be a bed in a tier A cell |
| `idle` | `activity` (stand, sit, sleep, lean, work-at, fish, tend), `host` furniture when any |
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
- The studio draws sockets as labelled markers with `?sockets=1`.
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

The plugin's lights and cell lighting are copied verbatim (§ 3); Skyrim
lit them for its own eye adaptation, so under our ACES at exposure 1 a
KotM hut's template ambient reads black away from its hearth (walk 5:
median E 0.028, 96–99 % of the floor dark). The exporter applies one rule
before it writes, `worldgen/interior_light.py apply_light_rule`:

| Step | What | From |
|---|---|---|
| 1 | Every lit fixture (lantern, candle) whose kit asset has a mined LIGH and no plugin light within 1.0 m gets that light, `refId: fixture:<placement id>` | kit manifest `light` (radius, colour, `offsetM`) |
| 2 | Cell ambient `intensity` raised until the unlit five-face mean reaches `FILL_E` 0.15 (≈45/255 on an albedo-0.3 wall); `ambient.rule: interior-light-floor` | the cell's own ambient and directional colours |

A hearth is the plugin's; a burning hearth piece gets its flame from the
fire module (fire.md), never from this rule. A cell with no light record
at all fails.

**Self-check** (1–2 s a cell, in the exporter's test run):
`python3 -m worldgen.interior_light <bundle.json ...>` (from
`tooling/world-generation`) samples the roofed standable floor on
`interior_walk`'s 0.5 m grid at 1.2 m eye height, with the loader's own
light model (`test_interior_light.py` pins the constants). Bar: at most
30 % of nodes under `DARK_E` 0.12. `--reached` keeps only nodes reached
from the doors (~30 s a cell); `--apply` applies the rule to a published
bundle in place.

**Flat or lit by its sources.** Raising the ambient passes the dark bar but
can leave a room evenly grey. The same run reports `light_balance`: the
share of each spot's E that comes from the cell's lights, and
`sourceLedFraction`, the fraction of the walked floor where that share is at
least 50 %. Under 30 % the cell is `flat` (a failure with `--balance`, a
flag without it). The judged half is reader row 48, on renders of the cell
under the same light model. On 2026-09-29 all eight tier A cells measured
flat after the rule (0–4 % source-led, the fill at ambient ×4.8–8.2).

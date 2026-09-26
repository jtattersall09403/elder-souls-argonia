# Doors, interiors and sockets (procedure)

> **Written against** decisions 0081 decisions 3–4 (the TES door model),
> 0062 decisions 3–4, 0103 (tier A interiors in 16k; every promise a
> placed socket) and 0102 decision 2 (`walkRule`). The deliverable items
> these came from are 16k § Carried backlog 16h items 11 and 18, 16i
> items 4, 5 and 9. If a cited record has moved, this file is stale.

Read at SKILL steps 1 (§ Interiors, § Sockets), 2 (the ops and the claim
run) and 5 (the gates).

## 1. Door records (16h items 11 and 18)

- **The door model is the TES one (0081):** using a door moves the
  character into a separate interior cell and back. An open structure
  with no interior (a deck, a gate arch, a shelter) has no door record
  and is walked through as exterior geometry.
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
   A shell with no link is legal only for a building nobody enters
   (open barn, lean-to, store) or when the culture's pool has no linked
   shell; its door is then `reserved` with the pool named. A composite
   inherits its base shell's links.
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
   shrine, hearth and beds = dwelling). A parcel whose only service is
   `stable` is `reserved` with pool `stable` (no plugin authors a stable
   interior; Phase 12 tier B). Ties break on the plugin's own most-used
   cell for that shell. A claim outside the ratio, with too few storeys
   or doors fails a test.
3. `blueprint_interiors.py --claim <blueprint>` writes the pick and its
   `why` on the door record (`interiorClaim`, `tier: "A"`, cell id,
   plugin); the claim is never written by hand.
4. A kit's `interior: matched` (a sibling interior *mesh*) is not tier A.
   A shell with a matched mesh and no furnished cell keeps its door
   `reserved` with `interiorShell: <mesh>` so Phase 12 furnishes it;
   `tileset` shells are Phase 12's.
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
- **Acceptance:** reference count equals placements plus listed drops
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

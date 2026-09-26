# 0103 — Tier A interiors ship in 16k, and every promise a later phase fills is a placed socket

**Date:** 2026-09-26. **Owner rulings:** 2026-09-26 (this session): the
large majority of interiors are tier A and are delivered and testable in
the studio during 16k; every thing a place promises to a later system
(people, items, containers and their loot, encounters, ambience) is
placed as a socket with its data during place building, so later phases
"rattle through the records". **Amends:** 0062 decision 3 (tier A moves
from 16i, now 16k; Phase 12 keeps tiers B and C), 0099/0100 (the loop's
checklist rows), 0081 decision 4 (door record fields stand).

## Decisions

1. **Shells are chosen for their interiors.** A lived-in building (a
   service, a home, a workplace) takes a shell that a plugin links to a
   furnished cell (`world/sources/placement/exterior-interior-links.json`);
   a shell with no link is legal only for a building nobody enters (open
   barn, lean-to, store) or when the culture's pool has no linked shell,
   and then the door is `reserved` with the pool named. A composite
   inherits its base shell's links. A shell counts as unlinked only
   after the door links have been re-mined over the CURRENT pool (owner
   2026-09-26: the tracked record predates the KotM, BM&V and mudmother
   pools, so an older "no link" is a blind spot, not a fact); a shell
   still unlinked is cut or kept by the planner on the evidence (its
   plugin's placements and load doors), the cut list is small, and every
   culture pool must still reach its breadth bars with linked shells.
   **A shell is placed at its plugin's median placed scale** (planner
   2026-09-26, from interiors round 3: Mud Mother places its hut at
   1.9–2.3×, KotM its pods at 0.67–1.4×; at scale 1 the huts were half
   their intended size and no room could fit them). The kit manifest
   carries `placedScaleMedian` (n, p10, p90) from the plugin references;
   the workbench `place` op defaults to it; the fit ratio uses scale².
2. **The cell is picked by the fit rule, deterministically** (carried
   item 16i-4, whose text now lives in the 16k brief), from the shell's
   linked set: footprint ratio 0.6–1.5 measured on the cell's structural
   pieces only, storeys match (counted from floor heights), the cell's
   exterior-leading load doors equal the shell's entrances and pair with
   them by bearing around the centres (refused when counts differ or a
   pairing is over 60° off; the door record holds an arrival marker per
   exterior door and each exit returns to its own outside door),
   use-class matches the parcel's services; multi-storey and multi-room
   cells are legal and the walk rule runs inside the bundle from every
   arrival marker to every idle and container socket; ties break on the plugin's own most-used cell for
   that shell. The pick and its `why` are written on the door record
   (`interiorClaim`, tier A) by `blueprint_interiors.py` at skill step 2,
   never by hand.
3. **Tier A is copied verbatim from the plugin**, by an interior bundle
   exporter: every reference in the cell with its transform, mapped to
   published kit assets (the interior tileset, furniture, clutter,
   containers, lights); actors and quest-flagged references are dropped
   and listed; books and notes keep their mesh and become item sockets
   with `contentPending`. Lights come from the plugin's light records
   (radius, colour, the cell's ambient and fog). Acceptance: reference
   count equals placements plus the listed drops. Interior kits are built
   and published through `kit-build` like any kit.
4. **The interior runtime ships in 16k**: the door interaction (action key
   at a door with a claim → fade → the interior scene at its arrival
   marker; the interior's load door returns to the exterior threshold),
   the load contract (one bundle per cell, streamed on approach to the
   door), interior lighting from the bundle, the interior camera (16h
   item 24), all in `packages/game-core` behind injected hosts. The studio
   opens an interior directly with `?view=character&interior=<cellId>` for
   testing, and every door in a published place works.
5. **Sockets are a typed record the place compiles** (schemaVersion 1),
   exterior and interior alike: `sockets[]` in the compiled settlement
   record and the bundle, one entry per socket with `id`, `kind`,
   `positionM`, `yawDeg`, `parcelId`, `interiorCell` (null outside),
   `host` (the placement it sits on or in), the kind's data block and a
   `why`. Kinds and their data:
   - `npc`: `rosterSlotId`, `role`, `schedule[]` of `{dayPhase, socketId}`
     pointing at `idle` sockets (work, home, evening; dayPhase from world
     8a). Every roster slot has at least a work and a home socket; home
     may be a bed in a tier A cell.
   - `idle`: `activity` (stand, sit, sleep, lean, work-at, fish, tend),
     `host` furniture when any.
   - `item`: `itemClass` from the vocabulary, `valueBand`, `why`,
     `contentPending` for text-bearing items.
   - `container`: `containerClass` (barrel, chest, sack, crate, urn,
     basket, strongbox), `fillRule`: a blanket rule id (for example
     `blanket.household-barrel`: food and low-value misc, a small chance
     of one hidden gem) or `authored` with `lootTable`: `{itemClasses[],
     valueBand, storyNote}` consistent with the place's story.
   - `encounter`, `fauna`, `ambience`, `marker`: kind, danger band, zone.
   The vocabulary (kinds, item classes, container classes, fill rules,
   day phases, value bands) is one record,
   `world/sources/vocab/socket-vocabulary.json`, and each item class names
   its asset source, so a socket can never promise a thing no asset
   exists for (the asset-aware rule).
6. **Sockets are authored where the thing is placed.** A container or a
   piece of furniture placed by a yard set or an interior cell yields its
   socket automatically (class from the kit manifest category); the
   builder authors `npc`, `item`, `encounter` and non-obvious `container`
   data with `socket` ops in the layout and a § Sockets table in the
   design brief. Gates in `compile_settlement`: every roster slot has
   work and home sockets; every container placement has a fill rule;
   every promised service has an npc socket at its parcel; every item
   class is in the vocabulary; every `npc`, `idle` and `container` socket is a
   `walkRule` target that passed (an idle socket with host furniture
   counts as reached from within 1.0 m). The studio draws sockets as labelled markers with
   `?sockets=1` (dev-only export) so the owner can see them on a walk.
7. **The plan moves.** 16k's checklist rows for interiors, occupants,
   loot and ambience now gate on the socket record and, for interiors,
   on tier A cells shipped and enterable. Phase 12 keeps tiers B and C,
   the furnishing mine and the dungeon interiors. Phase 13 and 10b read
   `sockets[]`; they add no vocabulary of their own.

8. **The acceptance receipt freezes the new data too** (extends 0100
   decision 6): the hashes of the place's ground overlays, its `sockets[]`,
   its `walkRoutes` and every interior bundle its doors claim sit in the
   receipt beside the compiled record and the patches. The place-build
   skill's close step (8) writes them; the freeze gate compares them.

## Where it lands

The place-build skill (step 1 § Interiors and § Sockets, step 2 ops,
step 5 gates, the packet's "interiors to enter" list); the 16k brief;
`docs/phases/README.md` Phase 12/13 rows; 0062 addendum; world modules
70 (sockets) and 92 (roster) cross-references; the new vocabulary
record's README row.

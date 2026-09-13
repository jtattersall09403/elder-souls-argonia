# 0062 — Dungeons are places; interiors are a late phase; one queue, one rollout pass

**Date:** 2026-09-13. **Status:** accepted (owner, same day: "approved",
"make it happen", yes to reversing the 2026-09-04 dressing note and the
0042 §3 extraction ruling; the interleaved-queue idea withdrawn). Supersedes
0061 decisions 1, 2 and 5; 0034's per-packet list; the Phase 9 dressing
note in world 65; 0042 §3's placement of the renderer extraction.

## What the owner asked

Whether Phase 12 should exist at all, since dungeons are places; whether
to author dungeon places (site, identity, prose, purpose, quest links,
promises of what must be inside) with the general place work and build
their insides much later with dedicated research and a skill iterated on
exemplars until it runs unattended; how interiors are actually built with
Skyrim and mod kits and what shortcuts exist; whether Phase 15 needs to
run early; and that the owner stays hands-on for major cities and the
opening-scene places.

## Evidence (both reviewers, checked against the data)

- 327 of 827 catalogue records are dungeon-kind and already carry a typed
  interior block, entrance type, underwater access, purpose, slots and
  sockets; `worldgen.place_obligations` already projects delivery-bearing
  fields into typed obligations with an owner and a later manifest check.
- 571 building shells in the mined plugins link to a furnished interior
  cell (about 279,000 references; roughly 100,000 clutter, 12,000
  furniture); `esp_index` decodes every reference's transform. 481 are
  vanilla Skyrim buildings. No Argonian interior ships anywhere; the
  xanmeer tileset has zero placed examples.
- `dungeon-root-v1` is BM&V's cave kit: halls, corridors and rooms on 256
  and 512 unit modules. The mined "caves unsnapped, 40 % tilted" finding is
  vanilla Skyrim's cave shells, which we do not use for structure.
- Tropical Skyrim ships retextures for the cave and town-kit texture sets.
- Bethesda's interior authoring is a 3D grid of 128-unit modules with 90°
  yaw and local snap-to-reference frames; furniture records carry NPC-use
  markers; room bounds, lighting templates, locks, ownership and levelled
  containers are plugin data. Room-function furnishing rules are minable
  and were named as the undone follow-up of the interior mining research.

## Decisions

1. **Phase 12 is the interiors phase.** Every interior that must be
   assembled (dungeons of every family, hero interiors, settlement
   buildings with no furnished plugin cell) is built there, late in the
   queue, after 13 and before 12b and 14: a research chunk first, the
   furnishing mine, a chamber-graph compiler on the 16i load contract, then
   exemplars by hand through the tools, the `interior-build` skill promoted
   from every hand decision, unattended runs on two more, until it holds.
2. **Dungeon places are authored with every other place.** 16g fixes the
   promise vocabulary (room functions, loops, traversal demands,
   combat-space intents, anchor sockets, slot locations, light regime,
   lock class) and migrates all 327 records; 16j and Phase 15 author more.
   **Every family maps to a realisation recipe backed by a kit that
   exists;** a record whose family has none is re-typed, never promised.
3. **Building interiors split into tiers.** Tier A (a furnished cell a
   plugin links to the shell) ships verbatim in 16i with the door
   transition, the interior load contract and interior lighting. Tier B
   (assembled) is Phase 12's. Every door without an interior carries
   `interiorStatus: reserved`; it stays closed and shows a catalogue message.
4. **Three preferences relaxed to make Phase 12 small:** an interior need
   not match its shell's culture piece for piece (a retextured furnished
   vanilla cell behind an Argonian door is acceptable); assembled interiors
   are kit-bashed at chamber level from the mined furnished chambers, not
   built piece by piece; the dungeon share of the density budget is a
   lever (16g may re-type a delve to an exterior place).
5. **No early throwaway experiment.** The question it would have answered
   ("can we assemble a cave?") is answered by the kit data; the first
   Phase 12 exemplar is a modular root cavern.
6. **One queue, no parallel lines:** 16a–16j → 9 (thin swim first) → 10b
   (with the renderer extraction) → 10c → 13 → 12 → 12b → 14 → 15. Rollout
   waits until every system it rolls out exists; 15A/15B (0061) collapse
   back into one Phase 15 pass per packet. The 16j trial packet is packet
   one and is completed in 15.
7. **Phase 9 is movement only.** 16f builds the submerged band and wreck
   statics; a wreck is a catalogue place; the 9a swim slice is where the
   owner judges them.
8. **Phase 13 loses its strays:** discovery pointers to the packet brief
   pass, arrows and physical materials to 10b, seasonal foliage to 16f and
   Phase 10, froxel fog and eclipse states to 14 and P.
9. **The owner is hands-on for every major city and for the opening-scene
   places** (the prisoner tutorial in the marsh near Stormhold and Alten
   Corimont) in every phase; no skill runs unattended on them (world 96 §3).
10. **Chunking:** Phase 9 and 10c are chunked by named jobs at 16j and 10b
    close; 10b's navmesh chunk may run the day 16h lands; 13's data-model
    chunk and 12's research chunk are written when their phases are next in
    the queue; Phase 15 packets are chunks from the template 16j ships.
11. **Exemplar count for unattended rollout** is stated once, in world 96
    §3 (the 16i exemplar plus the 16j instance, or a Phase 15 packet's).

## Consequences

- Files: docs/phases/README.md (queue, §85.4, §86.0 rows, Phase 16, 12, 9,
  10b, 13, 14, 15, ID history), the 16e/16f/16g/16i/16j briefs and the
  Phase 16 plan, docs/PROGRESS.md (one-line rows in queue order), world 00-core
  glance, world 65/70/76/55/40/96, quests 20/25/90, the buildout register,
  decisions 0008/0034/0041/0057 status banners.
- The 2026-09-13 documentation audits' contradiction fixes (stale Phase 11
  and module-95 pointers, a deleted `refine_province` still recommended, the
  engineering-standards count, a duplicated CLAUDE.md rule, a non-existent
  npm script, a resolved CI note) landed in the same commit.
- `docs/phases/15-rollout/` (roadmap, packet template) is created by 16j.

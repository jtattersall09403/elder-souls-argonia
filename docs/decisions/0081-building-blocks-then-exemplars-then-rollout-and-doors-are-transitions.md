# 0081 — Building blocks, then exemplars, then rollout; interim owner check-ins inside a chunk; doors are transitions

**Date:** 2026-09-20. **Status:** accepted (planner, on the owner's
2026-09-20 instruction to review 16h/16i/16j as a set and design the
owner workflow). Amends the 16h plan of 2026-09-20 (same day) and the
16i/16j briefs of 2026-09-13; refines 0062 §3; resolves world 80 §63
against 0062.

**Superseded in part by [0099](0099-places-are-built-in-a-loop-until-the-skill-is-proven.md) (2026-09-25):** decision 1's flow from 16h part 2 on (exemplars in 16i, rollout in 16j) is replaced by the 16k place loop; 16h part 1, the door model and the three patch kinds stand.

## What the owner asked

Review the 16h, 16i and 16j briefs as one flow into Phase 15; make the
delivery agents use Sonnet subagents for visual ingestion; make
vegetation clearance and added scatter local patches; make every
interior decision aware of the TES door model; make the agents run lanes
in parallel; design the points at which the owner steers cheaply
("deliver 16x up to the next owner check-in"), between one and four per
chunk.

## Evidence

- The 16h brief of 2026-09-20 laid out the five exemplar places in its
  part 2 (plan sheets, pads, clearance, dressing) on the 2026-09-09
  blueprints, which 16i then re-authors; the owner would have steered
  layouts about to be discarded; the patches would have been emitted
  twice.
- The five blueprints are hollow (45 of 733 placements composites, all
  Lilmoth's; dressing one wicker chair) and pre-date the frozen ground:
  they are inputs to a redesign, not a base to patch.
- No exemplar covered a dungeon-kind place, although 327 of 580 records
  are dungeon-kind and 16j's packet must place them with entrance pieces
  and reserved doors.
- The vegetation patch machinery clears but cannot add (0070; the only
  additive path is a province re-run of `compile_scatter`).
- World 80 §63 asked the runtime for "seamless small huts and open
  structures" and "seamless cave mouths with deeper streamed cells"
  beside streamed interior cells; 0062 §3 made every door a reserved or
  claimed transition. The two were never reconciled.
- CLAUDE.md's feedback rule ("deliver the whole phase and have the user
  review at the end unless a mid-way steer would be hard to change
  later") already allows interim check-ins; the 16g lesson (vegetation
  cleared before the owner saw the plot) showed the exception is the
  rule for placement work.

## Decisions

1. **The three chunks are building blocks → exemplars → rollout.** 16h
   designs no place: kit truth, the runtime boundary, door records,
   renderable kinds, the three patch kinds, the route-structure exemplar
   set and the `kit-qa` skill, proved on off-world sheets, on gates first
   made to fail, on a **proving ground** (a scratch yard on real ground
   with one of everything, `fixture: true`, never exported to the shipped build,
   kept as a regression fixture; owner feedback 2026-09-20: nobody walks
   a place that is not yet designed) and on a handful of the road chunk's
   recorded structures. The five old blueprints are replayed only as a
   numeric fixture. 16i designs six exemplars (the five plus one dungeon-kind
   place) on paper, builds them once, walks them and writes skill v2
   from the sixth. 16j runs the skill unattended on one packet, closes
   the gaps in the skill, writes the Phase 15 roadmap and template.
   Phase 15 repeats 16j's rhythm per packet.
2. **Every chunk from 16h on is delivered in parts with one owner
   check-in per part, placed where a steer is a record edit.** 16h: two
   (kit truth sheets and the gate walk; the machinery standing on the
   route exemplars). 16i: three (six plans and door tables before any
   ground is touched; the walk; the second round and the skill). 16j:
   two (the packet on paper; the walk and the roadmap). A part may span
   more than one session; the check-in happens once, at the end of the
   part. The instruction is `deliver 16x part N`. The CLAUDE.md feedback
   rule is amended to name the check-ins a brief defines.
3. **Three local patch kinds are the only way a place touches the
   world after the freeze:** `settlement-pad` (terrain, 0059's grade
   pattern), `vegetation-clearance` by tier (trees and large plants from
   plots, ways, pads and a margin; groundcover survives between
   buildings and dies on hard surfaces; the fringe thins; `kept` names
   the shade and Hist trees), plus the new `dressing-add` (instances added
   locally by explicit list or by an overlay rule on a polygon, emitted
   through the same function the compiler uses, ordinals appended,
   `why` and `sources` on every patch). Each touches only its own tiles
   or chunks, carries a receipt with pre-patch counts and rebuilds
   nothing above `rederive_blueprints`.
4. **The door model is the TES one.** Interacting with a door moves the
   player into a separate interior cell and back to the door's exterior
   `arrivalMarker`; the exterior stops at the `streamingBoundary`; water
   state, time, ownership and world-state keys survive. Every enterable
   shell and every entrance piece has one door record (`door.<placeId>.<parcelId>.<n>`,
   `interiorClaim`, `interiorStatus`, `arrivalMarker`, `streamingBoundary`,
   reachability). An open structure with no interior (deck, gate arch,
   shelter) has no door record and is exterior geometry. "Seamless"
   interiors are struck from world 80 §63; a cave mouth is an entrance
   piece with a door. Tier A cells ship verbatim with their own placed
   lights and lighting template decoded from the plugin; fit-rule claims
   carry `evidence: fit-rule`; everything else is `reserved` with a
   reviewed message (0062 §3 stands).
5. **Sonnet subagents ingest images liberally under a prompt that names
   what to look at and the report format** (owner 2026-09-20); the
   planner's own six-image cap stays. The protocol lives in the `kit-qa`
   skill and every brief points at it.
7. **16i reconciles the first round before designing** (owner
   2026-09-20): every Phase 11 lesson, owner steer and interior-matching
   claim (world 96 §2, 0041's taste ledger, the rounds archive, the
   interiors research and the kits' interior index) is sorted kept /
   superseded / open in one memo; the open rows are ruled at 16i
   check-in 1. Ruling recorded now: a kit's `matched` interior mesh is
   not 0062's tier A unless a furnished plugin cell is linked; such a
   door is reserved with its shell recorded for Phase 12.
6. **A sixth exemplar of dungeon kind is chosen in 16i part 1** by
   measured criteria (not owner-guided; family with a recipe and a kit;
   entrance piece exists; near the likely 16j region; promises complete),
   so the packet has a pattern for entrance pieces, reserved doors and
   additive dressing at a mouth.

## Consequences

- Files: the 16h, 16i and 16j briefs rewritten whole; the Phase 16
  README §4 rows and §3; `docs/phases/15-rollout/README.md` (a sketch of
  the packet rhythm; 16j writes the roadmap and template); CLAUDE.md
  feedback rule; docs/phases/README.md § Phase 15 pointer; world 80 §63
  (edited by 16h); PROGRESS.md.
- The old 16h "part 3" items moved into 16h part 2 (machinery) or 16i
  (place design). Nothing was dropped; the coverage matrix rows D1–D13
  still map to 16h except D14, which is 16i/16j.

## Addendum 2026-09-25 (16k lane F): run pads are typed terrain patches

- A modular run that seats as one rigid chain over falling ground gets a `settlement-pad` terrain patch (`patch.pad.settlement.<placeId>.<runId>`, `terrain-patches.json` schema 2), emitted by the settlement export under each member more than 0.05 m over the ground and merged cumulatively (`worldgen/settlement_run_pads.py`).

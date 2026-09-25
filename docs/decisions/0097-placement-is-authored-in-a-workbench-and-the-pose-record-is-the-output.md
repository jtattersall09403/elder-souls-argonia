# 0097 — Placement is authored by an agent in a workbench; the pose record is the output; the mined records are evidence

**Date:** 2026-09-24. **Status:** accepted (owner idea 2026-09-24: "an agent
should place pieces the way a person does in Blender or the Creation Kit";
owner rulings the same day on windows and building depth, relayed by the
planner; delivered by the placement-workbench lane under 0087). Extends
0085 (kit truth is mined) and 0066 (read the record, never re-solve it) to
layout. The `placement-workbench` skill is its procedure (0086).

## What was decided

1. **The layout is authored, not solved.** An agent builds a place in the
   placement workbench (`tooling/placement-workbench/`): a headless scene
   over the frozen ground in which it places, snaps, settles and mounts kit
   pieces, measures every contact, renders and looks, and iterates. What it
   exports (`wb.py export`) is the blueprint's pose record. The compile
   realises that record unchanged, and the existing gates verify it.
   Determinism means only that the same record builds the same thing.
2. **The mined records are evidence, not rules that place.** The designed
   sink, the mount pairs, the abuts pairs and the co-placement templates
   are what the agent queries (`describe`, `evidence`) and may use
   (`snap --by evidence`, `mount`, `attach`). The chosen pose is the
   agent's, recorded with the evidence it used. A joint with no mined pair
   is snapped by geometry to measured contact.
3. **The workbench measures what the runtime does.** Its seat height is
   `anchoring.ts` `anchorPlacement` / `waterPlacementY` on the studio's
   streamed chunks. The 97 B3 slope rule reads the compile's survey. Gaps
   and crossings are exact mesh-to-mesh (FCL). A contact is the miner's
   0.03 m. A number from the workbench is the number the player stands on.
4. **Two schema fields carry authored poses.**
   - A `pieces` member may carry `atM: [x, z]` (metres in the parcel's
     frame) with its `yaw`. When every member does,
     `blueprint_footprints.lay_pieces` lays them as recorded, and no abuts
     step is solved.
   - A one-asset parcel may carry an `assembly`: the pieces an agent
     authored around its shell (`blueprint.assembly_failures`). Each one
     is `{asset, atM, yaw, pitch?, on: parent|ground, upM (on parent),
     layer, evidence}`. `compile_settlement.assembly_placements` realises
     each: a piece `on: parent` is a mounted child with its offset and
     turn relative to the shell (what `mountedTransform` composes); a piece
     `on: ground` is seated on the terrain by its own sink.
   - A run piece carries its own laid outline, and the export seats each
     one on it, not on the whole run's footprint.
   Written reason for all three: a pose checked by real contact in the
   workbench must not be re-derived from the evidence it was built from.
5. **A building is an assembly.** A composite holds only the shell, the
   door its mod placed with it, and a mined walkway or porch. Windows,
   shutters, roof detail, chimney, light, clutter and wear are authored
   per building as its `assembly` (building-depth-and-variety.md §2,
   owner 2026-09-24). Roll and mirror can be tried in the workbench but
   never exported: the runtime turns a piece by yaw and pitch only.
6. **Numbers decide; a Sonnet reader looks.** Every render carries its
   scale (the 1 m grid, a scale bar, the terrain cut line). A reader gets
   a list of what to look at. The gates are the numbers.

## Consequences

- 16i's exemplar places and 16j's rollout may be laid out in the
  workbench; the planner decides this per chunk. `settlement-build` stays
  the umbrella for everything after the export. *Superseded 2026-09-25:*
  16i and 16j are replaced by the 16k loop (0099), where the workbench is
  the method (0099 decision 5), a place is applied from one whole layout
  file (0100 decision 2) and `place-build` replaces `settlement-build`
  (0100 decision 1).
- The proof is `place.fixture.proving-ground-b`, built only with the
  workbench, the skill and Sonnet views. The lane doc's § Rounds compares
  it with the original yard for the owner.
- `python-fcl` is a new dependency for the tool, not the game
  (`tooling/placement-workbench/requirements.txt`).

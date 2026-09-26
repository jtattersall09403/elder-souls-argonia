# 0102 — A place carries its own ground, and hands over nothing it can check itself

**Date:** 2026-09-26. **Owner rulings:** the walk-packet feedback on
GitHub issue #1 (2026-09-26). **Supersedes:** the "pad grades wait for
the terrain chain" line in 0101 and in the 16k brief's Starting state;
the "known gaps" section of the walk packet as a form.

## The problem

Claywater Station's first walk packet asked the owner to judge things a
tool can measure (can you walk in, does the floor hang over a drop, is
the canoe beached, does the path reach the hut, do the lanterns stand on
the ground), listed eleven "known gaps" that were unfinished work, and
told the owner the buildings might float until the terrain chain
regraded their pads. The owner's ruling: the chain is never rerun for a
place; the builder verifies everything it can before a hand-off; a gap
needs a valid reason and there are very few.

## Decisions

1. **The frozen world is never rebuilt for a place.** No chain stage, no
   refreeze, no province republish. A place's levelled ground
   (`settlement-pad`) and its vegetation clearance travel **in the
   place's bundle** and are applied when the studio or game loads the
   terrain chunk or vegetation cell they touch: a runtime overlay over
   the frozen data, deterministic, cheap (a pass over the cells inside
   the overlay's box). `apply_terrain_patches` refuses the
   `settlement-pad` kind; `world/sources/terrain/terrain-patches.json`
   holds no place rows. The Python ground sampler the workbench and the
   checks use applies the same overlay maths; a fixture test holds the
   TypeScript and Python samples equal on Claywater's pads. On the
   owner's acceptance the overlays are frozen with the place (their hash
   is already in the receipt, 0100 decision 6). Phase 14 may bake
   accepted overlays into chunks; that is a later optimisation, not a
   dependency.
2. **Every check a tool can make is a `wb.py check` rule, shown failing
   first, and the walk packet reports its measurement instead of asking.**
   New rules this decision: `walkRule` (a route exists from the place's
   road terminal to every door threshold and every yard opening over the
   padded ground and the placed geometry, within the character
   controller's step and slope limits, and is exported as the navmesh
   socket's walkable-ways data); `floorEdgeRule` (no perimeter sample of
   a building's underside stands more than its fit band's gap above the
   padded ground unless a retaining run or pad fill is under it);
   `pathReachRule` (a path ends within 1.0 m of every threshold and
   opening, its last leg within 45° of the door's facing); `propSeatRule`
   (every dressing item's exact contact gap is within its policy row's
   band; yard-set members stand within the set's declared spacing).
   `beachedRule` already exists and its numbers go in the packet.
3. **A hand-off has no unfinished work.** The builder's inner loop runs
   until `check` has zero failures and the reader has zero NOs. A packet
   may list a gap only for one of four reasons, each named: (a) a system
   a later phase owns (people, animals, sound, interiors, runtime
   navmesh): the socket is in the data; (b) a judgement that needs the
   GPU studio (frame rate, shader look, motion); (c) an asset that exists
   nowhere after a completed sourcing search, with its register row;
   (d) a world-level call reserved for the owner. Anything else is work
   the slice finishes before posting.
4. **The inner loop's shape.** A round gathers every check failure and
   every reader NO, edits the layout once for all of them, runs one
   `apply` (seconds), one plan render, then at most one Blender round.
   Four render rounds is the ceiling. A finding that comes back after
   being fixed escalates to the planner (no third fix of the same thing);
   a round never touches a kit build or the frozen world; nothing is
   fixed one item at a time.
5. **Mined pairs are a prior for small things.** A mount not in the mined
   pairs is allowed when the child's longest side is under 0.6 m and the
   layout op names the render round that approved it
   (`"unmined": "reader-approved r2"`); the render round must shoot it.
   Lantern-on-barrel is the first case (owner 2026-09-26).
6. **The LOD gate is size-aware.** A one-tier model is legal when its
   longest side is under 1.5 m and its kind is dressing or clutter; the
   distance bands (0071 decision 3, 0075) cull it by size. Architecture
   shells keep the three-tier rule.
7. **Every building shows a light at its entrance at night**: a window
   glow facing the approach, or a mounted lantern or sconce within 2 m of
   the threshold. The reader checks it on the front shot; the compile
   fails a door with neither.
8. **The reader judges kit consistency**: a checklist row asks whether
   two shells read as one kit or as a deliberate pair; the owner is never
   asked.
9. **97 A7 is relaxed to ±2 bands** (owner 2026-09-26): the plot's +1
   relaxation was the practice; the rule now says so and the twelve
   records stand.
10. **The Drowning Gate ferry stays with Claywater's poler** (planner
    call at the owner's request). Reasons: the crossing is at Claywater's
    landing, so the poler is the only resident who can run it; Highwater,
    296 m off, keeps its own landing but no ferry service, which is also
    why the contrast rule excludes it as slice 2; the travel graph gains
    no edge and loses none; no quest provision names a Drowning Gate
    ferryman. Knock-on watched: if a later slice gives Highwater a ferry,
    97 :134 (same purpose within 500 m along one road) must be argued in
    its design brief.
11. **The packet carries pictures.** The plan render and up to four
    Blender shots are committed under `tooling/.reports/16k/<place>-walk-N/`
    and embedded in the issue post by repo blob link.

## Why not the alternatives

- Per-tile republish of the terrain under the pad (the incremental
  chain): still a chain stage, still a province file rewrite per place,
  and it is exactly what the owner ruled out three times.
- Asking the owner to judge measurable things: the walk is the scarce
  resource; it is for the look and feel only.

## Where it lands

CLAUDE.md golden rule; the place-build skill (steps 2, 4, 6 and § Never);
the 16k brief § Starting state and § The loop; world 97 A7; the
workbench manual; `references/lessons.md` and `reader-checklist.md`.

**Addendum 2026-09-26 (planner ruling 5, 16k fix 2 workbench round 2):** decision 5's small-mount bar is the child's longest PLAN side under 0.6 m and its height under 1.0 m (the 0.615 m tall candle lantern, 0.26 m in plan, is its first case); a yard-set member may carry the same `"unmined": "reader-approved rN"` field.

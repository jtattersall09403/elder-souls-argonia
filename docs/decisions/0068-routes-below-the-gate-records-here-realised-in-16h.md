# 0068 — Roads re-solved below the gate on the frozen ground; 16e records and compiles, 16h draws; one service graph (16e, 2026-09-15)

**Context.** The 16e brief inherited from the plan of 2026-09-11 had the
major roads repaired in place from a solve made above the freeze gate, a
grader that overwrote the terrain in two passes, ferry hulls and bridges
placed physically before the runtime that draws placed pieces was fixed
(16h: yaw sign, box colliders, anchoring to the highest sample), and the
rootworm network re-authored before the Hist trees it hangs on are placed
(16g). The owner reviewed the brief on 2026-09-15 and ruled on each.

**Decisions.**

1. **The major roads are re-solved below the freeze gate, on the frozen
   ground, by a new `solve_major_routes` stage.** `compile_society`'s roads
   (above the gate) are history: the frozen ground keeps the gentler
   corridors it was sculpted with, which is harmless, and the danger and
   culture fields stay as frozen. Nothing above 16e's ladder row runs
   again. The sequence is one way: solve → the choke points the best line
   still had to take, patched locally → paint. The router costs make it
   avoid steep ground, river beds (a reach polygon is a wall except at a
   recorded crossing) and marsh, and zigzag up long slopes on its own; a
   typed junction record fixes where named roads meet (first: the
   Gideon–Archon × Helstrom–Blackrose crossroads on dry ground at about
   3.20 E, 3.59 S). Minor routes are solved in 16g on the re-validated plot
   with the same gradient cost and are **never graded**.
2. **Grading is a patch author, rewritten from scratch.** One pass finds
   every choke point on the solved majors, decides patch-or-structure from
   the measured shape, emits all `route-grade` patches at once and hands the
   structure windows to the span author; a small apply step writes the
   graded array as a separate file the downstream stages read, so the
   router's ground is never overwritten and grading can never feed back
   into routing. A span longer than vanilla's longest whole bridge (52 m)
   is a routing failure, not a structure to build.
3. **16e owns records and compiled placements; 16h draws them.** Span
   records and placed pieces, ferry landings, berths and operator sockets
   are 16e's data; the 3D layer stays hidden until 16h's runtime can draw a
   placed piece where its record puts it (16h gains a `water` anchor class
   for hulls). Each exemplar's and packet's ferries are built with the
   place (16i, 16j). At 16e's check the owner walks roads and fords, uses a
   ferry through its landing socket, and reads spans, graded sections,
   crossings and services on the 2D map with hover text.
4. **One travel-service graph.** `travel-services.json` is the province's
   Morrowind-style service record (ferry, boat, rootworm; guide, cart and
   porter in the vocabulary for Phase 15); `ferry-crossings.json` folds into
   it; `root-transit.json` is carried in as placeholder stations and deleted
   with `compile_society`'s painter. The rootworm network is properly
   authored in **16g**, at the hero Hist nodes 16g places, with its quest
   ties finalised in the packet co-design loop (16j, Phase 15). A minimal
   talk-pay-arrive contract lives in `packages/`.
5. **The lane re-liner runs once**, after the water compile; the second
   chain entry goes. **No byte-identical two-run proof** for this chunk: the
   network is frozen when the owner accepts it; a plain second run must
   simply re-run nothing above 16e's row.
6. **Surviving old road paint is a defect to census and repaint** (the owner
   stands on it at 0.08 E, 2.97 S); a test keeps road texels within 5 m of a
   published line.

**Consequences.** The 16e brief is the specification; the 16g and 16h briefs,
the phases README (Phase 9 scope note, Phase 11 table, Phase 15 list), quests
20's root-transit note and 0061 §4 were reconciled in the same change.

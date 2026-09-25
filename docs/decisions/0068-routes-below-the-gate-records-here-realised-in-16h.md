# 0068 — Roads re-solved below the gate on the frozen ground; 16e records and compiles, 16h draws; one service graph (16e, 2026-09-15)

**Context.** The 16e brief inherited from the plan of 2026-09-11 had the
major roads repaired in place from a solve made above the freeze gate, a
grader that overwrote the terrain in two passes, ferry hulls and bridges
placed physically before the runtime that draws placed pieces was fixed
(16h: yaw sign, box colliders, anchoring to the highest sample); the
rootworm network was to be re-authored before the Hist trees it hangs on are placed
(16g). The owner reviewed the brief on 2026-09-15 and ruled on each.

**Decisions.**

1. **The major roads are re-solved below the freeze gate, on the frozen
   ground, by a new `solve_major_routes` stage.** `compile_society`'s roads
   (above the gate) are history: the frozen ground keeps its gentler
   sculpted corridors, which is harmless; the danger and
   culture fields stay as frozen. Nothing above 16e's ladder row runs
   again. The sequence is one way: solve → the choke points the best line
   still had to take, patched locally → paint. The router costs make it
   avoid steep ground, river beds (a reach polygon is a wall except at a
   recorded crossing) and marsh; it zigzags up long slopes on its own; a
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
   ferry through its landing socket; spans, graded sections,
   crossings and services are read on the 2D map with hover text.
4. **One travel-service graph.** `travel-services.json` is the province's
   Morrowind-style service record (ferry, boat, rootworm; guide, cart and
   porter in the vocabulary for Phase 15); `ferry-crossings.json` folds into
   it; `root-transit.json` is carried in as placeholder stations and deleted
   with `compile_society`'s painter. The rootworm network is properly
   authored in **16g**, at the hero Hist nodes 16g places, with its quest
   ties finalised in the packet co-design loop (16j, Phase 15). A minimal
   talk-pay-arrive contract lives in `packages/`.

   **Canoe services (2026-09-20).** A `canoe` serviceKind carries paid
   passage on the minor waterways: one station-run per connected chain of
   published minor channels, hull `canoe`, fare 2 gold. A chain earns a
   service when at least two of the places it terminates at are live, sited
   and no harbour city among them. Each run joins the existing web at an
   existing station on the run or by a transfer edge of 800 m or less (owner
   2026-09-20: a walk under a kilometre suits the province's scale); a chain
   that joins nowhere within that walk gets no service, which is why the
   Naga-Kur deeps stay remote.
5. **The lane re-liner runs once**, after the water compile; the second
   chain entry goes. **No byte-identical two-run proof** for this chunk: the
   network is frozen when the owner accepts it; a plain second run must
   simply re-run nothing above 16e's row.
6. **Surviving old road paint is a defect to census and repaint** (the owner
   stands on it at 0.08 E, 2.97 S); a test keeps road texels within 5 m of a
   published line.

7. **Calls made while delivering (2026-09-15).** Two height arrays:
   `refined-height-natural-f32.npy` (the frozen base plus the place
   patches; read by the water compile, the router and the grader) and
   `refined-height-f32.npy` (natural plus the route-grade patches; read by
   everything downstream), so grading can never feed back into routing.
   Route-grade patches live in their own file and are applied after every
   place patch; where two roads share a corridor the first patch wins and
   absorbs the later one. A walkable channel bank or marsh edge (at most
   30°) that no patch may move stays natural. A crossing's band is decided
   by width AND depth (a ford is never deeper than the small-draft line); a
   marsh is never a ferry crossing: a road over marsh is carried on a
   boardwalk deck or the router keeps it out of the marsh (deep marsh costs
   16× dry ground). A ferry berth is where the hull floats, found by walking
   from the landing into the water; the walk is the jetty length 16h
   places; a landing that never floats its hull demotes the service. The
   land-cover bake paints only lines the ladder produced.

8. **Roads attract roads; pins carry steers (owner 2026-09-16).** Roads are
   solved longest first and a built road's cells cost 0.35 of the ground
   to the roads after it, so shared corridors are one road that splits
   later. An owner steer on a road's line is a `pin` in `junctions.json`
   (one road, a measured dry gentle point in the described box, a `why`),
   never a hand-drawn line; a long bridge over dry ground is answered with
   a pin, not a structure.

**Consequences.** The 16e brief is the specification; the 16g and 16h briefs,
the phases README (Phase 9 scope note, Phase 11 table, Phase 15 list), quests
20's root-transit note and 0061 §4 were reconciled in the same change.

## Addendum 2026-09-25 ([0099](0099-places-are-built-in-a-loop-until-the-skill-is-proven.md))

The ferries (decision 3) and the landing ties (decision 4) assigned to 16i and
16j are built with each place in its 16k slice (the water village and waystation types), then in
the Phase 15 packets.

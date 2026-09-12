# Phase 16 — the frozen foundation and the place ladder

**Owner instruction:** `deliver 16a`, then `deliver 16b`, and so on to `deliver 16j`, one
fresh agent per chunk, an owner check between chunks. Each chunk is a brief in
this folder; PROGRESS.md carries the status. Decision
[0057](../../decisions/0057-phase16-terrain-once-water-once-places-on-a-frozen-world.md)
records why. This file is the plan: the owner's items, the ladder, the chunks,
the proof that every item has a chunk, then the decisions that the owner must give.

## 1. Where this came from

Between 2026-09-05 and 2026-09-10, Opus-led sessions delivered water round 2,
the Phase 11 exemplars, route spans and the vegetation ladder and reported
them complete. The owner's walk of the deployed build found the water visually
worse in places than a week earlier, the buildings "a total mess" and the
chain rebuilding the whole province and re-solving the water every time a
place moved. Five read-only audits on 2026-09-11 found the root causes; they
are the evidence behind every chunk here:

- [water runtime](../../research/phase16/audit-water-runtime.md) — the sea is
  animated but muted (swell re-pitched to 100 m at the old height budget,
  fetch capped at 160 m, detail normals drifting at 3 cm/s, horizon blend
  erasing the sea from 1.5 km); edges are three hard pixel discards.
- [hydrology data model](../../research/phase16/audit-hydrology-data-model.md)
  — no river or body entities, no stable ids, seasonality never recorded,
  plunge pools dug but unlinked, trees in rivers because the scatter sees
  depth only.
- [chain and terrain](../../research/phase16/audit-chain-and-terrain.md) — ten
  feedback edges; the local-patch machinery half exists; the "north border is
  below sea level" claim is false (north 99.7 % land); the all-Tamriel
  heightmap in the vault registers to our province at r = 0.83.
- [delivered settlements](../../research/phase16/audit-settlements-delivered.md)
  — the runtime rotates by **−yaw** (median 93° heading error); every piece
  collides as full bounding boxes (the invisible gate); anchoring to the
  highest terrain sample; the pad-graded terrain never shipped; no mount rule
  for lamps; 15 of 19 compiled kinds place nothing; no navigation runtime.
- [routers and unused context](../../research/phase16/audit-routers-and-context.md)
  — index gaps (fixed), the water row pointing at the retired model (fixed),
  the settlement skill and agent definitions reachable from nothing (fixed),
  decision 0041 at 2,713 lines in two must-read rows and the fluvial
  taxonomy research written and never consumed.

## 2. The owner's items, structured (nothing left out)

Ids are used by the coverage matrix in §6. Source: the owner's message of
2026-09-11 (deleted after this plan was written) and the mid-session
question on routers.

**A — Water as seen**
A1 Water regressed visually in places; keep what improved (rivers on slopes, foam, flow).
A2 Water Pro transfers are incomplete; audit which are done.
A3 Waterfalls promising, not there.
A4 The ocean is static in the deployed world (swell, whitecaps, shore break, shore foam and the rest); find out what happened.
A5 Hard or jagged edges, 2D hovering surfaces, water above land doming to the edge, gaps and breaks, harsh seams where water types meet and more to be found.
A6 Earlier lowland water was less buggy in position and edges; reconsider.
A7 Owner suggestions (flood fill, multiple elevations) may have over-complicated things; self-defeating owner decisions must be run past the owner.

**B — Semantic water data**
B1 The 2D map's water and wetlands are the wet-season high-water line; check its resolution for small streams.
B2 Derive always-wet vs seasonal.
B3 Rivers as end-to-end entities from source to sea, sections of different types, confluences.
B4 Waterfalls and rapids derived from the heightmap.
B5 Plunge pools sized and deepened by the fall at terrain-build time, downstream effects handled.
B6 Streams and rivers on slopes identified.
B7 Hierarchy: horizontal (ocean, ponds, lakes, pools, plunge pools, rivers, streams, creeks, backwaters, marsh kinds, by altitude), sloped (rapids, streams, rivers), vertical (waterfalls), each connected up- and downstream.
B8 Lowland standing water vs upland tarns and lakes, which may have outflows.
B9 Expand and improve the research already written.
B10 The terrain is built to enable every water feature before the water is compiled, with no later tweaks and no rebuilds.

**C — Terrain and process**
C1 Circular dependencies and repeated province rebuilds must end.
C2 Terrain once → water once → macro plot → meso → micro, per the owner's earlier write-up.
C3 Places may move at macro or meso level, be rewritten, swapped for another type, or cut; relax the place-count floor.
C4 Small local terrain edits at the micro stage without a province rebuild; establish feasibility.
C5 Cliffs are too smooth; research how games do ledges and jagged faces and build it into the terrain stage.
C6 Use Tropical Skyrim's better vertical-face textures.
C7 Land beyond the W, NW and N borders continues from the Tamriel heightmap, fades into the distance, with an invisible wall and a message; test the "100 % below sea level" and "126×126 puzzle piece" claims; choose the simplest reliable approach.
C8 No trees in rivers (wetland and drowned forest are fine).
C10 Fireflies, midges and dragonflies gather over real standing water and marsh, not over noise, once the water is frozen (owner, 2026-09-11).
C9 Ground cover (grass and the like) is far sparser in the deployed studio than before, e.g. in the jungle, and the denser version was better. Vary it sensibly: high density with taller, chunkier plants where that makes sense, and at least low grass nearly everywhere; find out how games usually do it. Bare textured heightfield does not look or feel good. (Owner, 2026-09-11, after the plan was written.)

**D — Buildings and settlements**
D1 The right kits, rules and snap points were not used.
D2 Hollow volumes rather than buildings.
D3 Placement and orientation all over the place.
D4 Doors misaligned.
D5 Pieces hovering, partly or wholly.
D6 Paths and ways not placed; "settlement navigation is not active" popup.
D7 Invisible walls: cannot walk through the Lilmoth gate, any gate, or open frames.
D8 No access to stilt-platform stairs.
D9 Nothing sunk into the ground; no flattening or raised pads as designed.
D10 Lamps hovering unsupported.
D11 A deep dive for everything else that is wrong.
D12 Decide whether the approach is flawed, unfollowed, or both.
D13 Kit visual QA off-world (the Lilmoth gate and wall): a one-off or short owner–agent loop that yields principles or skills, or an automated method; the plan must show the thinking.
D14 The exemplar places go end to end (including Phase 12 interiors) and produce a reusable, automatable process and skills; the owner stays hands-on for cities and the opening scenes.

**E — Tests and probes**
E1 Tests and probes did not catch any of this; they must pass when things are genuinely right and fail when they are not.
E2 Some agent visual ingestion is allowed under a proposal the owner approves.

**F — Places designed together**
F1 Lost City + the Made Ground are one place for blueprint, design and build; review quests and places for more such merges.
F2 Sets of nearby places that are designed and placed together without merging; define the kinds, review all places, reason about which sets qualify.

**G — Backlog and review**
G1 The "land beyond borders" backlog item is part of this plan (= C7).
G2 Review the whole polish backlog and pull forward what belongs here (grass coverage and the rest), so nothing complex is reopened later as "polish".
G3 Search for other bugs: code, logic, process, self-defeating owner decisions, records, docs, routing, tests and probes.
G4 Are the routers broken; is important context sitting unused?

**H — Form of the deliverable**
H1 A structured set of considerations, nothing left out (this section).
H2 Decomposed into sequenced, manageable chunks, a fresh agent each, owner testing between (§4).
H3 Slotted into the phase plan as the current work and integrated with the routers; a "deliver x" instruction (this file, PROGRESS.md, world/95 §86, CLAUDE.md step 1).

## 3. The ladder (the rule every chunk obeys)

```
16a hydrology graph  ──► 16b terrain once ──► 16c water once ──► 16d border apron
                                                   │
                                                   ▼
                              16e routes/grading/spans/ferries  ──► 16f vegetation
                                                   │
                                                   ▼
                    16g macro plot (places adapt) ──► 16h settlement runtime + kit QA
                                                   │
                                                   ▼
                              16i exemplars end to end ──► 16j rollout skill + trial packet
```

- **The ladder is the owner's earlier write-up, applied.** Macro → meso →
  micro is [world/97](../../world/97-placement-principles.md) Parts A–C
  (province → place, place → ground, ground → layout), the multi-scale
  pattern in [research/vegetation/openworld-vegetation-placement-architecture.md](../../research/vegetation/openworld-vegetation-placement-architecture.md)
  and the siting rules in [research/placement-settlements/openworld-place-distribution-and-siting.md](../../research/placement-settlements/openworld-place-distribution-and-siting.md).
  Phase 16 changes what those scales *read* (a frozen world), not the scales.
- **A rung is frozen before the next starts.** Its output carries a content
  hash; the rung below reads it and never writes it. The freeze gate for the
  base terrain (end of 16b) is the one gate the owner signs by walking.
- **Places adapt to the world.** A record that the frozen world cannot carry is
  moved, re-typed, rewritten or cut (owner, 2026-09-11: the floor on the
  number of places is relaxed). Only typed local patches (16b defines them,
  16h applies them for pads) may touch the ground after the freeze and a
  patch that would move a water level or a channel **fails**.
- **A gate is trusted only after it has failed on a real defect.** Every
  chunk's acceptance names the tests and probes it adds, with the defect that each one
  was shown to catch. Agents do not ingest screenshots outside the budget
  in §8.
- **Build only what is delivered (owner, 2026-09-12).** The chain
  (`tooling/world-generation/scripts/terrain-chain.sh`) carries a LADDER: a
  list, per chunk, of the stages that chunk has delivered, cumulative from
  16b. A plain run builds `--through` the highest delivered chunk
  (`DELIVERED_THROUGH` in the script) and SKIPS every stage a later chunk
  still owns, because those stages are the old code and are known to be
  wrong on the frozen world; running them only produces a build that is
  wrong in ways nobody is checking. Some of them also move the ground under
  the chunks being walked. When a chunk lands, its agent adds its stages to
  the ladder and bumps `DELIVERED_THROUGH` in the same commit; `--full` runs
  everything for someone who knows why. Published JSON a skipped stage would
  have written (routes, structures, settlements, pad receipts) is STALE
  against the current ground and is not judged at that chunk's check; the
  chain prints the skipped stages so the handoff can say so.
- **Owner check between chunks.** Every brief ends with a plain-English
  checklist with studio URLs. Nothing is marked done until that check passes
  or the owner explicitly accepts it as good enough.
- **Two agents share the tree.** Commit by pathspec; the chain lock in the
  vault is honoured; the province rasters must be still before any settlement
  compile (settlement-build skill §0).

## 4. The chunks

| Id | Chunk (brief) | Owner check | Needs owner rulings (§7) | Status |
|---|---|---|---|---|
| 16a | [Hydrology graph, gates policy, docs hygiene](16a-hydrology-graph-and-gates.md) — derive the typed water graph once; review it on the 2D map; the visual-ingestion proposal; split 0041; the gate policy | studio 2D layers: rivers, kinds, seasons, falls, pools | none (it *produces* the questions for 16b) | accepted by the owner 2026-09-11 ([ledger](../../research/phase16/16a-hydrology-graph-ledger.md), [0058](../../decisions/0058-the-hydrology-graph-is-the-water-record.md)) |
| 16b | [Terrain built once](16b-terrain-once.md) — re-freeze the sculpt, enable every water feature from the graph, cliffs, pits, deterracing, coast drama, chain reorder, local patches, freeze gate | walk the province: cliffs, fall sites, tarns, pits | 1–6 | delivered 2026-09-12, owner walk pending ([ledger](../../research/phase16/16b-terrain-once-ledger.md), [0059](../../decisions/0059-terrain-built-once-frozen-base-and-typed-patches.md)) |
| 16c | [Water once](16c-water-once.md) — compile on the frozen base; fix the runtime (ocean, edges, seams, hover, falls); probes that fail | walk 14 water sites + beach + open sea | 7 | todo |
| 16d | [Beyond-border apron and boundary](16d-border-apron-and-boundary.md) — stitched all-Tamriel slice, fade, wall, message | mountain viewpoint N, W, NW; walk to the edge | 8 | todo |
| 16e | [Routes, grading, spans and ferries on the frozen world](16e-routes-grading-spans-ferries.md) — grading as a patch stack, span pips, paint on the published line, ferries placed | walk three roads, two crossings, one ferry | 9 | todo |
| 16f | [Vegetation on the frozen water](16f-vegetation-on-frozen-water.md) — channel membership, rocks at falls and cliffs, grass coverage, rows, hanging roots, bare rock, mountain dressing | five region sites + one river + one fall | 10 | todo |
| 16g | [Macro plot on the frozen world](16g-macro-plot-places-adapt.md) — re-validate every record; move, re-type, cut; design groups; co-siting sets | the plot review report + the design-group list | 11 | todo |
| 16h | [Settlement runtime and kit QA](16h-settlement-runtime-and-kit-qa.md) — yaw sign, real colliders, anchoring, pads as patches, mounts, nav, stairs, composites, renderable kinds; the off-world kit loop | Lilmoth gate walk-through; the kit sheets | 12 | todo |
| 16i | [Exemplars end to end](16i-exemplars-end-to-end.md) — five places exterior + interior + approach + nav + dressing; owner walk; skill v2 | walk all five, inside and out | 13 | todo |
| 16j | [Rollout skill and trial packet](16j-rollout-skill-and-trial-packet.md) — one region packet through the skill unattended; automation-readiness gate; hand to Phase 15 | walk the packet | — | todo |

**Why this order.** Water depends on terrain; routes and vegetation depend on
water; places depend on all three; the settlement runtime must be correct
before exemplars are judged; the skill is proved last. 16d is small and
independent after 16c and gives the owner a visible win while 16e is big.
16h precedes 16i so the five exemplars are judged on a runtime that draws
them where the blueprint put them.

**What 16a needs from the owner: nothing.** 16b cannot start until rulings
1–6 in §7 are given; 16a's report is written to make those rulings easy.

## 5. What each chunk leaves behind (the shape of the repo afterwards)

- `world/sources/hydrology/hydrology-graph.json` (+ schema doc) — the water
  entities, read by carve, compile, scatter, routes, places. **Delivered
  (16a).** Note for 16b: the graph is solved on today's code's sculpt, not the
  vault file (which is the August array); the drainage solver was fixed
  (0058 choice 7), so 16b re-runs `compile_hydrology` and re-derives the
  graph on its frozen base and must land on the same `sourceHeightSha256`.
- `refined-height-frozen-f32.npy` + sha in the vault; `chain-manifest.sh`
  proving two forced runs identical; `terrain-chain.sh` in the §7 order of
  the chain audit.
- `world/sources/terrain/terrain-patches.json` and `apply_terrain_patches`
  + `patch_water` stages with failing invariants.
- `province/border-apron.*` and the boundary message in `packages/text-catalogue`.
- A `designGroup` field in the place catalogue and the design-group register.
- A settlement runtime that rotates by +yaw, collides with real shapes,
  mounts dressing, places ways and reports navigation honestly.
- `.claude/skills/settlement-build/` v2 and a `kit-qa` skill.
- Every absorbed polish-backlog row struck; the water handoff archived.

## 6. Coverage matrix (every item in §2 has a chunk)

| Item | Chunk(s) | How it is closed |
|---|---|---|
| A1 | 16c | keep-list measured before touching the renderer; regression probe per kept feature |
| A2 | 16c | the transfer ledger in the water audit §2 becomes the chunk's checklist |
| A3 | 16a, 16b, 16c | graph names the falls; terrain cuts knickpoints and bowls; renderer finishes the stack |
| A4 | 16c | audit §1 causes 1–5 (spectrum, drift, horizon blend, fetch cap, whitecap threshold) |
| A5 | 16c | audit §3 mechanisms 1–7, each with a numeric detector |
| A6 | 16a, 16c | the graph's levels are reviewed on the 2D map before the compile; lowland levels compared against the 8b-era rasters in git |
| A7 | 16a, §7 | rulings 3–5 |
| B1 | 16a | the Phase 3 wetlands/rivers overlay is the wet-season line; small-stream resolution measured and reported |
| B2 | 16a | `season` stored per reach and body |
| B3 | 16a | `River` entities with ordered reaches and tributary junctions |
| B4 | 16a | falls and rapids classified from the heightmap into reach kinds |
| B5 | 16a, 16b | `plunge-pool` bodies sized from the drop; bowls cut in 16b; downstream levels re-solved in the graph |
| B6 | 16a | `sloped-*` reach kinds |
| B7 | 16a | the reach and body kind vocabularies |
| B8 | 16a | `tarn-upland` vs `lake-lowland`, `altitudeBand`, outflow links |
| B9 | 16a | the fluvial geomorphology research becomes the derivation rulebook; 50-hydrology-climate updated |
| B10 | 16b | every graph feature has a terrain precondition checked at the freeze gate |
| C1 | 16b, 16e, 16h | the ten feedback edges closed per the chain audit §2; grading and pads become patches |
| C2 | all | §3 |
| C3 | 16g | the relaxed floor; move / re-type / rewrite / cut rules |
| C4 | 16b, 16h | `terrain-patches.json`, local re-flood, tile-only export; measured cost |
| C5 | 16b, 16f | benching below 110 m, side-projection cliff material, rock scatter on cliff bands (Skyrim's method) |
| C6 | 16b | Tropical Skyrim vertical-face slots (audit §5 list) |
| C7 | 16d | stitched all-Tamriel slice; both claims tested and answered in the chain audit §4 |
| C8 | 16f | channel membership from the graph, a hard gate |
| C10 | 16f | the air layer's density patches read the shipped wetness and body kinds (graph ids) instead of value noise; a test that a firefly patch centre stands over wet ground |
| C9 | 16f | measured against the pre-0048 bundles in git; the density ladder is not retuned, but the groundcover layer is — coverage floor nearly everywhere, height and clump variation by land cover, distance fade the way shipped games do it |
| D1 | 16h, 16i | composites per culture from the mined templates; connectors and fronts exported and checked on runtime transforms |
| D2 | 16h, 16i | zero-composite exemplars rebuilt as assemblies |
| D3 | 16h | the yaw sign; pivot plan offsets applied |
| D4 | 16h | doors bound to the mesh doorway, exported and checked |
| D5 | 16h | per-fit anchoring, stilt exemption removed, shipped-bundle replay gate |
| D6 | 16h | renderable-kind gate; ways, boardwalks, canals placed; navigation status honest |
| D7 | 16h | real collision shapes; ray-through-arch test |
| D8 | 16h | a placed stair per deck link; step-height test |
| D9 | 16h | pads as terrain patches, actually shipped, waiver removed |
| D10 | 16h | anchor class and parent placement for dressing |
| D11 | 16h | the audit §1–7 findings beyond the owner's list (dressing = one chair, 15 kinds place nothing, route structures never ground-audited, stilt audit blind) |
| D12 | 16h | answered in the audit: the rules were right and unfollowed at the runtime boundary (sign, boxes, anchoring) and unfollowed at compile (no composites outside Lilmoth) |
| D13 | 16h | the off-world assembly renderer and the owner–agent loop that ends in a `kit-qa` skill (§8) |
| D14 | 16i, 16j | end to end incl. interiors; the skill; the unattended trial packet. **Decided:** "later stuff" (Phase 13 fauna, encounters and loot; Phase 12b sound; 10c numbers) is *not* pulled into the exemplars — those compilers do not exist yet and 10b/10c must precede them (world/95 §86.0); the exemplars leave typed sockets and obligations for them instead |
| E1 | every chunk | acceptance names the gates added and the defect each failed on first |
| E2 | 16a, §8 | the proposal for the owner |
| F1 | 16g | `designGroup` with Lost City + Made Ground first; quest-place map reviewed for more |
| F2 | 16g | co-siting kinds and the reviewed list (seed: the fifteen asks in quests/25 §20e) |
| G1 | 16d | = C7 |
| G2 | §9 | every backlog row triaged into a chunk or left as genuine polish |
| G3 | audits, §7, 16a | the five audits; the re-ruling list; 16a's gate policy |
| G4 | done 2026-09-11 | router audit; index, rows and links repaired; 0041 split is 16a's |
| H1–H3 | this file | — |

## 7. Owner decisions — ALL GIVEN 2026-09-11

The owner approved every recommendation below on 2026-09-11, with these
additions, which are binding:

- **7 (the sea):** make ours essentially the Three.js Water Pro ocean demo —
  swell, noisy ripples riding on the swell, whitecaps, waves that change shape
  as they approach the shore (as real waves do), waves breaking on the beach
  with the foam that goes with it, "and all sorts of other things too". 16c's
  bar is that demo, not "moving".
- **8 (the apron):** stitched, on condition that the join is smooth — the
  province's terrain edges continue into the beyond-border land with no jagged
  edges, gaps or disconnects. 16d's acceptance test is that join.
- **9 (roads):** *minimal* grading as patches. Prefer re-routing to grading
  even when the road gets longer; use gradient costs so roads zigzag up long
  steep slopes as real roads do. Small graded patches are fine only where they
  cause no other issue and no circular dependency.
- **10 (position-seeded land-cover noise):** approved for now; the owner may
  re-rule once there is more to see.

The numbered list is kept so briefs can cite "ruling N".

1. **Which sculpt is the base?** Today's `sculpt.py` output differs from the
   August array the hydrology, routes and places were solved on (max 67.8 m,
   5.8 % of samples > 1 m). *Recommend:* re-freeze on **today's code** with
   the knickpoint and bowl edits of 16b and re-solve hydrology, society and
   the plot on it (16a/16g do this anyway). Pinning the August array means
   the code can never be run again.
2. **The 46 erosion pits** (near-sea-level bowls inside high terrain that
   render as deep mountain lakes). *Recommend:* fill all but the ones the
   graph can justify as tarns with an outflow; the graph review in 16a lists
   them by site so you can keep any you like.
3. **Re-rule 0047's "the level is the flood of the real terrain"** for
   terrain-moving consumers: the level is solved once into the graph and the
   carve realises it. *Recommend:* yes (decision 0057 §2).
4. **Re-rule 0049's "measure the shipped raster"** for consumers that move
   terrain (dock dredge, lane dredge, authored waterways): they read the
   graph's promised level. *Recommend:* yes.
5. **Retire the flood-fill / multiple-elevation lineage of 0045** as an
   anonymous per-compile population: standing water becomes a named entity
   set. *Recommend:* yes — this is the owner's own suspicion.
6. **Dock dredges and pads after the freeze:** typed local patches (allowed,
   bounded, failing on any water change) **or** hull classes decided from the
   frozen water with no dredging. *Recommend:* patches for pads and poling
   channels; **no dredging of natural water for a hull class** — a berth
   goes where the water already floats the hull, or the place's boats change
   (the Alten Corimont precedent, 2026-09-09).
7. **The sea's energy:** the swell was re-pitched to 100 m at the old height
   budget. *Recommend:* let 16c set `rmsHeightM` from wind and fetch and show
   you calm, breeze and storm at the beach; you pick the calm level.
8. **The apron:** stitched all-Tamriel slice (canon-shaped, credited) vs
   procedural continuation. *Recommend:* stitched.
9. **Roads and bridges:** keep the 2026-09-09 "no road grading" trial, or
   grade as a patch stack with channel invariants. *Recommend:* grade, as
   patches — the trial's answer was in the walk (roads did not read as roads
   on 30° hillsides).
10. **`rebake_landcover` becomes tileable** by position-seeded noise, which
    reshuffles ground paint you have reviewed. *Recommend:* yes, once, at
    the 16b freeze.
11. **The place floor:** relax from "580 of 580" to "every record either
    stands on ground the frozen world can carry or is cut/merged/re-typed",
    with the density budget (18–22 named POIs/km² in D0–D3) still a
    completion gate for Phase 15. *Recommend:* yes.
12. **Kit QA budget:** §8. *Recommend:* accept the proposal as written.
13. **Exemplar scope:** all five exemplars get interiors in 16i (Phase 12's
    exemplar slice pulled forward), or exteriors only. *Recommend:* interiors
    for the three built places (Lilmoth, Mazzatun, Nine-Trunks) and the
    licensed camp's one stage building; Wamasu Pond has none.

## 8. Visual ingestion and the kit QA loop (proposal for the owner, E2 / D13)

**Budget.** Agents may ingest at most **six** images per chunk, only from
tooling that renders to a file (`render_sheet`, the assembly renderer below,
`shot-deployed.mjs`), never from a live browser walk and only for a check a
number cannot express (does the arch read as an arch; does the fall read as
falling). Every ingested image is listed in the chunk's report with what was
judged and what number replaced it afterwards. Session memory already caps
self-ingested screenshots at about ten; this is tighter.

**The kit QA loop (16h).** Extend `pipeline/render_sheet.py` to render an
*assembly* — a list of `(assetId, positionM, yawDeg)` — from four fixed
cameras and a plan view, with the collider boxes drawn as wireframes. Then:

1. The agent renders the Lilmoth gate + wall + tower assembly and the three
   worst composites, applies the rules already written (connectors, fronts,
   doorways, mined templates) and hands the owner **one contact sheet per
   assembly** with the checks it ran.
2. The owner marks each sheet right or wrong in one sentence. Each "wrong"
   becomes a rule in `docs/world/97-placement-principles.md` §C and a check
   in `blueprint_integration.py`, never a per-piece fix.
3. Two rounds at most. After that the agent runs the assembly renderer on
   every composite in every kit, applies the rules and ingests only the
   sheets a rule flags — expected under a dozen.
4. The loop is packaged as a `kit-qa` skill so a rollout agent runs it
   without the owner.

This is the owner's "short iterative loop that yields principles or skills";
it costs the owner two sheet reviews, not hundreds of approvals.

**Owner amendments (2026-09-11), binding.** (a) Every image an agent renders
for judgement must actually show the thing being judged, legibly, under the
right conditions: framing, lighting, time of day and distance chosen so the
question can be answered from the shot. A shot that is illegible for any of
those reasons has spent budget on nothing and does not count as a check.
(b) Ingesting a shot from a live browser walk is not forbidden; it is the last
resort after the cheaper tooling renders, used when only the running scene
can answer the question.

## 9. Polish backlog rows absorbed (G2)

Struck from `docs/phases/P-polish/backlog.md` and owned here:

| Backlog row | Chunk |
|---|---|
| sculpt no longer reproduces the frozen base; August array | 16b (ruling 1) |
| 46 erosion pits | 16a lists, 16b fills (ruling 2) |
| coarse river routes climb out by the wrong exit (`lostStations`) | 16a (graph on the full-res or min-decimated terrain) |
| chain carve half fixed; `sculpt.py:94` still reads `routes.json`; byte-identical test never run | 16b |
| fast path not proven byte-identical | 16b |
| water full re-review (8b close) | 16c |
| hero-pool sim patches; FFT open-sea tier; algae constituent; rock dressing in surf; walk-mode SSR cost | 16c decides mount / defer with a measurement each; rocks → 16f |
| caustics, mist, barcode foam owner checks pending | 16c's owner check |
| fall lip is a straight terrain edge | 16b (lip notch from the graph) |
| two boat lanes run overland; class-raster extension above its cap; `Cannot read isReady` throw | 16c |
| `effect` category rejected by the registry; kit materials cannot blend; editor geometry ships in FX meshes | 16c (falls stack) |
| cliff rock renders blown-out white | 16b (cliff material) with 16c's light check |
| Tropical Skyrim vertical-face and marsh textures; un-tropicalised `peat_slope` slot | 16b |
| deterracing smoother; coastal geography drama; uplands too bare; trees on bare rock; plants in rows; hanging roots; boulder regions; waterfall side rocks; grass coverage | 16b (terrain), 16f (dressing) |
| repo size 1.9 GB, 35 MB per rebuild | 16b (fetch step lands with the freeze — several full rebuilds are coming) |
| tidal delta / deep river corridor thin classes | 16a (graph decides), 16f applies |
| routes: unauthored survivors churn; three "badly routed" ways are a resolution mismatch; `MAX_FILL_M` wrong lever; road raster paints the frozen line; `grade_settlement_pads` ignores structure windows; route structures emit no nav data; trestle foot ground fit; a crossing with no pier; pitch axis for whole bridges; router prefers the long way round | 16e |
| water crossings become ferries; `watercraft-v1` reaches nothing; navigable check measures the wrong water | 16e |
| macro plot: two records invalidated by the fields; licensed camp track overrun | 16g |
| stilt open-water share and quay flood-section rule scope | 16g (rule scope by measured ground) |
| corrupt-GLB export gate; settlement navigation; `test:placement` names files one by one | 16h |
| prose gate does not lint `docs/`; sourcing log lint hits | 16a (docs hygiene, with the 0041 split) |
| land beyond borders | 16d |

**The ambient-air particles** (fireflies, midges, dragonflies, pollen, leaf
fall — `packages/game-core/src/air/`) stay with the agent working on them
now: they read no terrain, water or region raster, so Phase 16 cannot break
them and their visibility fix is theirs. But their "over wet ground" placement
is value noise today, and that is scheduled: **16f deliverable 6** re-points
the density patches at the real wetness and channel data once 16c has shipped
it (item C10 in the matrix).

Left in the backlog as genuine polish: sky palette, moon glow, weather rows,
foliage translucency, combat rows, the female-character rows, the physics
mass scale (Phase 9), region tooltip reclassification.

## 10. Places designed together (F1, F2 — seed list for 16g)

- **Merge (`designGroup` with one blueprint):** `place.hist-heartland.lost-city`
  + `place.hist-heartland.xal-krona-making-ground` (73 m apart; the Made Ground
  is reached *through* the city after MQ29 — quests/25 §20e).
- **Co-siting sets (designed and placed together, separate blueprints):** the
  fifteen asks in `docs/quests/25-quest-place-map.md` §20e are the seed —
  lighthouse + wrecker beach (mutual sightline), pen-yard + the Dres rows,
  Giovesse lines + Castle Giovesse (the red macro-plot sightline), the survey
  + Vellum Estate fields, the broke column + the Blackwood Road bend, the
  drowned gallery + Blackrose's levee, Pusbottom barge + Lilmoth's sunken
  quarter, the empty steading's landing. 16g adds: every satellite slot in
  `type-recipes.json`, every ferry pair in `ferry-crossings.json` and any two
  records within 150 m whose prose names each other (`prose_links`).

## 11. Records and routing

- Status: PROGRESS.md row "16 — frozen foundation and place ladder", one
  line per chunk as it moves.
- Decisions: 0057 (this re-sequencing); each chunk records its non-obvious
  choices as a new numbered decision, never inside this file.
- Evidence: `docs/research/phase16/` (the audits; a chunk adds its
  measurement ledger there).
- Rules that change: `docs/world/50`, `60`, `65`, `96`, `97` are edited in
  place by the chunk that changes them (00-core rule: improve the modules).
- History: the water handoff, the gap plan and 0041's round log are
  provenance; 16a archives what is no longer live.

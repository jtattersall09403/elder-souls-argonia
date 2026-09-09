# Module 96 — The placement playbook (how a place gets built, and what we learned)

> The working process for Phase 11 Parts 6–8, kept as ONE document so the
> back-and-forth between the owner and the agents converges on a procedure we
> trust enough to automate for the long tail (Phase 15). Rules that are
> already binding live where they live (decision 0041, the blueprint README,
> the schema docstring); this module is the **route through them**, the
> **lessons** each round taught, and the **automation-readiness checklist**.
> Owner steers on taste go to 0041's Taste ledger; steers on *process* go
> here. Update it every round; prune it, do not append forever.

## 1. The loop, per place

The rules that the loop applies — siting, the slope ladder, spacing,
orientation, culture grammars, what enforces each — live in
[97-placement-principles.md](97-placement-principles.md) (binding). This
section is the route through them.

| Step | Tool / artefact | Gate before the next step |
|---|---|---|
| 1. Read the record | catalogue record + type recipe + lore dossier + quest rows and sockets that name the place; run `python3 -m worldgen.blueprint_promises --id <place-id>` | **the promise ledger IS the list of layout requirements** — every service, NPC role, travel destination, provision and socket in it is a thing that the layout must build |
| 2. Dossier the ground | `worldgen.site_dossier --id <slug> --x --z --radius` → `sites/dossiers/<slug>.{json,md}` | the dossier is cited in the design record |
| 3. Candidate sitings | 2–3 exact points, each measured (`ProvinceSurvey.sample`, `height_at` over the footprint ring, water depth at the dock line, route tie-in, sightlines) | one chosen, the others recorded with why they lost (`siting` block) |
| 4. Design | districts as **kit sets**, layout intent, signature feature, every socket placed, clearance | written in the design record `<id>.md` before any geometry. The `clearance` block is a **declaration**. It is applied later, in step 7b, by re-scattering the chunks it names |
| 5. Pieces on geometry | `assetRef` per parcel from `kit.json` sizes and the kit's `footprints.json`; kit `snapLogic` obeyed | no piece chosen from its name; no two kits blended in a district |
| 6. Orientation with a why | `centreUV` + `yawDeg` + `orientationWhy` on every parcel; footprint derived (`worldgen.blueprint_footprints --apply`) | the validator rejects an unexplained orientation |
| 6b. **Approach and wayfinding** | walk each `approaches[]` entry on the ground: `firstSeen`, the occlusion, the threshold, the sightline from the gate to the centre, the door of every socket building | the design record carries the "Approach and wayfinding" section and the 16-item checklist of [research/placement-settlements/openworld-approach-and-wayfinding.md](../research/placement-settlements/openworld-approach-and-wayfinding.md) §5, answered |
| 7. Validate, compile, render, export | `blueprint --check` → `compile_settlement` (0 errors) → `render_blueprint` → `export_blueprints` (studio view) | 0 errors; budget declared honestly |
| 7b. Re-scatter the cleared chunks | `compile_scatter --chunk <cx,cz>` for every cell in the compiled settlement's `clearance.affectedChunks` (or `--footprint`, which unions them in) | the built ground is bare in the compiled bundles rather than hidden at runtime; **all tiers in one compile**, or trees vanish on approach. The runtime groundcover ring reads the same declaration out of `province/blueprints.json` and needs no rebuild (principle [C13](97-placement-principles.md)) |
| 8. **Write the siting back** | `worldgen.apply_sitings` → overrides → `macro_plot` (pinned) → minor routes, waterways, hostility measure, studio exports | the dot, the paths and the waterways describe the place where it now is |
| 9. Owner Round A | the interactive blueprint view in World Studio + the design record's 2–4 questions | steers written to the Taste ledger as general rules |
| 10. Rounds B–C | massing renders, then the dressed walk. **Before Round B**: the 30-item building-rendering checklist in [research/rendering/building-placement-rendering-treatments.md](../research/rendering/building-placement-rendering-treatments.md) §3 (anchoring depth, LOD tiers with matched atlases, fade with haze, shadow pair sync, contact AO, base skirt, foundation clutter, collider budget, navmesh cut, door transitions, night windows, wetness) — the vegetation rounds' mistakes must not repeat on buildings. All 30 mechanisms are implemented; item 18's tested coarse `ground-control.png` footprint/yard pass is applied after the final water raster, before scatter | owner declares the exemplar good, explicitly; low/medium/high FPS at Lilmoth |

**The seed rule (2026-09-07).** The committed plot is the SEED of the plot
solve, not a by-product of it. `macro_plot` reads every record's committed
`positionM` and keeps it; it re-sites only the records whose committed cell is
no longer VALID under the current fields — water depth at the dot (a submerged
record needs real depth; a dry record must not now stand in open water), a
danger or region raster that has genuinely moved under the dot, a sightline the
new terrain blocks. Crowding, score and the old fit are never re-judged: the
scorer is globally sensitive, and a 0.55 m median terrain edit moved 342 of 579
records in a from-scratch solve. Records pinned by a Part 6 blueprint siting
are never re-judged at all (`pin_overrides` owns those dots). Every run reports
what it re-sited and why (`macro-plot.json` → `seeding`). A deliberate
province-wide re-plot is the owner's call and runs as
`python3 -m worldgen.macro_plot --resolve-all` (decision 0041).

**The write-back rule (owner 2026-09-05).** A place moved after the plot is
not moved until step 8 has run. The blueprint's chosen siting is the source
of truth for the position; `apply_sitings` is the only writer of
`macro-plot-overrides.json`; major-city anchors keep their owner-approved
dot (the blueprint's geometry sits around it).

## 1b. How this document stays current

Not by memory. Engineering standard 13 (`npm test`) fails when a blueprint,
design record or placement tool changes without this file or decision 0041
changing too. So every round of placement work ends by writing its lesson or
steer here (a row is enough) — the gate makes the omission visible before the
commit. Sourcing gaps are filled in the session they are found (CLAUDE.md
sourcing rule); the register only records outcomes.

## 2. Lessons so far (each one changed a tool or a rule)

| Round | Lesson | Where it now lives |
|---|---|---|
| Rollout 2026-09-09 | **A physical fact is measured, never read off a class raster.** Six independent systems each decided "is there water here" from `water-class.png` or the hydrology pass — type labels drawn over a superset of the wet area — and each was wrong in its own way: a berth passed a 10 m wet-join rule from 91 m away, the road grader cut 10,641 cells under the waterline, marsh depth was manufactured out of class membership, the province's land area was 7.14 km² short so every danger density read high, and a published boat lane between two cities ran 576 m over a headland the pass called "tidal" and the depth puts 5.28 m above the sea. Every physical-water question now goes through one accessor that **requires a season argument**, so the question cannot be asked without answering which season it is about | `water_report.ShippedWater.wet_grid(season)`; `ProvinceSurvey` delegates; decision 0049; `test_water_fact_invariants` asserts on the shipped rasters, not on code shape |
| Rollout 2026-09-09 | **A rule is scoped by measured ground, not by the label on the thing it judges.** The 15–30 % over-open-water rule fired on every `argonian-stilt` district, including two of Lilmoth's standing on an 11–13 m bench and a 19–23 m crest with zero water samples. Same shape as the row above, one level up | `compile_settlement` flood-band report: `applicable: false` with a reason, printed by name |
| Rollout 2026-09-09 | **The plot must honour every typed promise a record makes, not only the spatial ones.** With footprints, proximity and Tobler isolation all gated, the re-solve still put a hermitage that needs 40 m of relief on 28 m, a 40 m sinkhole in 2 m of water and a dive shaft on dry land — because `macro_plot` never read `terrainRequests[]`. A promise the plot could read and does not is a promise the terrain compiler discovers ten minutes later | `macro_plot` terrain-promise gate; `terrain_request_postconditions` remains the end-to-end proof |
| Rollout 2026-09-09 | **A settlement clears its own vegetation, and the clearing is graded.** The compiler had emitted `clearance` masks since the skeleton and nothing downstream read them, so 783 plants stood inside built ground; 97 C13 asserted an enforcement that did not exist. Exclusion is tested against the plant's own radius, not its origin — a wide fern's origin sits outside a footprint with its fronds inside | `settlement_clearance.py` + its TypeScript twin; `compile_scatter`; `Groundcover.tsx`; playbook step 7b |
| Rollout 2026-09-09 | **A stage that produces nothing the chain runs is a stage nobody runs.** `compile_settlement`, `export_settlement_bundle`, `settlement_ground_control` and the boat-lane repair all sat outside `terrain-chain.sh`, so a blueprint edit silently left the world unbuildable and the settlement ground paint was wiped by the next land-cover bake. Order is load-bearing: the paint goes between `rebake_landcover` (which rewrites the control raster) and `compile_scatter` (which reads it) | `scripts/terrain-chain.sh`; `compile_settlement --all` |
| Rollout 2026-09-09 | **A name in a typed field must be a name the world can produce.** 57 catalogue records asked to be sited on region classes no raster emits — `raised hammock` after its retirement, plus `upland plateau`, `interior wetland` and `naga-kur deep interior` (a culture zone mistaken for a landscape type). Each was a siting preference that silently did nothing | `test_catalogue.test_no_record_or_recipe_names_a_region_class_the_world_does_not_have` |
| Re-siting 2026-09-09 | A berth is not a point on a map, it is a point in water: the Licensed Stage's landing was sited on a macro raster that promised 0.9 m of channel where the shipped water has dry terrace, and no dredge can reach it. When a place moves to its water, the berth is chosen FIRST — a cell the compiled water already floats the hull in and that `dock_dredge` reports `dredged`, not `blocked` — and the anchor is then chosen on the bank above it. The internal layout may only ride along where the new bank runs the same way as the old one; every number in the record's prose is re-measured, never carried | `dock_dredge` verdict as siting evidence; `siting.candidates[].rejectedBecause` carries the berth's measured depth and gap |
| Landing re-site 2026-09-09 | Depth under the piles is necessary and is not the test: the Licensed Stage's first move put the berth in 0.60 m of water that turned out to be an 882 m² closed pocket on a 6.3 % reach, so the canoe could pole 60 m and stop. A berth is chosen on **the water it opens onto** — the connected body, its extent and whether it reaches the province's main water — and the anchor is then chosen on a bank the camp can stand on. When those are not the same ground, the landing becomes a satellite: a carry path joins them, the place boundary is cut to hold both, and nothing is built at the landing the landing does not need. `river` was missing from `WATER_CLASSES`, so a berth served by a natural reach was invisible to both the validator and the dredge | `province_network.WATER_CLASSES` (+ `river`); the berth table in `place.hist-heartland.sap-tapping-licensed.md`; `type-recipes.json` satellite slots read as the intended composition |
| Landing re-site 2026-09-09 | The dredge and the poling line are solved in the wrong order and one chain pass does not converge. `dock_dredge` cuts a trench along the line published BEFORE the chain; `compile_minor_waterways` then re-solves that line on the terrain the trench just changed, and at the Licensed Stage the new line diverged up to 9 m from the old one against a 6 m trench half-width, so one resampled approach point of 34 fell outside the cut and failed the depth promise at 0.36 m. Until the order is fixed, a moved berth needs `refine_province` run again after `apply_sitings` has re-published the line | logged for the water workstream; evidence in `place.hist-heartland.sap-tapping-licensed.md` § The berth and its channel |
| Review 2026-09-08 | A quest purpose is a socket and a socket is a quest purpose; a dock is a water terminal the channel ends at; every purpose is a ledger row a later phase must deliver | `socketRef`, dock terminals + `hullClass`, `purpose-ledger.json` |
| Gap plan B3 (2026-09-08) | Districts and combat rooms are shapes around the actual pieces and ways they contain, not boxes drawn over them; clipping a generated boundary never excuses a misplaced parcel | `blueprint_footprints --areas`, `combatSpaces[].aroundIds`, `district-containment` |
| Gap plan B7 (2026-09-08) | Placement invariants are a deployment gate, not a command a future agent must remember | Pages `placement-tests`; root `npm run test:placement` |
| Gap plan B8/G13 (2026-09-08) | A gate door faces the outside end of the road it spans; in an Argonian-stilt place, commerce is the first building node on the spine. Infer that spine from geometry (nearest track/boardwalk to the gate), not prose or a false `endsAt`; never apply the culture rule to another grammar | `blueprint_integration` `gate-door-outside` / `G13 first-node`; focused culture-scope mutation test |
| Gap-plan clean compile (2026-09-09) | A compact exterior works yard is not the above-ground housing fabric measured by the settlement density ladder, but it is not exempt from density either: name the physical form and hold it to its own measured band | `scaleGrounding.densityForm: works-yard`; `DENSITY_FORM_BAND` |
| Gap-plan clean compile (2026-09-09) | A route endpoint snapped to a gate edge can move by micrometres when its coordinates are written and read. Accept only centimetre-scale numeric drift; a visible gap is still a failed gate | `GATE_EDGE_ROUNDING_M`; integration pass/fail controls |
| Gap plan B9 (2026-09-09) | A promise written in prose is deliverable only when the same record links the named place, person, route, service, faction, item or socket through a typed field; the catalogue-to-blueprint-to-compiled chain stays hard-zero rather than accepting a debt list | `prose_links`; `place_obligations`; compiled delivery receipts |
| Water round 2 (2026-09-08) | Effect meshes (waterfalls, rapids, mist) are not kit content: they are authored for another renderer and `check_credits` has no registry rows for them. A fall is our path-traced geometry carrying the vanilla *textures* and Bethesda's measured stack rules; rock dressing along strips and lips is a scatter job with candidate positions exported by the runtime | decision 0047 addendum; `ChannelStrips.stripBoulderCandidates`; `waterfall-fx-textures` manifest |
| Review 2026-09-07 | A check that swallows its own failure is a check that is off; a canal needs a bound, a door needs a sightline; the claims in a round record are measured, not repeated | `canal-bound`, `door-sightline`, raise-on-failure in `_water_at` / `check_network_stitch` |
| Part 6 | The macro plot places by landform *class*; four of five plots could not carry the place as recorded (no standing water for a pond, a 47° hillside, 4.3 m of relief across a ring, no navigable water). The meso pass exists to measure; expect 60–150 m moves and write them back | `apply_sitings`; 0041 § Part 6 delivery record |
| Part 6 | Kits only combine pieces designed to combine, so a district is ONE kit set | `blueprint.KIT_SETS` |
| Part 6 | A piece is chosen on measured size, never on its label; the record's `assetPlan` can name kits that cannot serve the place (a 55 m root house for a three-person camp) | `assetRef`; the design record's "catalogue should change" list |
| Round A | Axis-aligned squares with south doors are not a layout. Real footprints, authored orientation, a why per building | `centreUV`/`yawDeg`/`orientationWhy`, `measure_footprints` |
| Round A | A static map with everything printed on it cannot be read. Review happens in an interactive view: zoom, hover, click, layers | World Studio blueprint view (`?bp=1`) |
| Round A | A sourcing gap is a job with an owner and a status, never a note | sourcing-gap register in `docs/research/placement-settlements/settlement-kit-sourcing-log.md` |
| Part 6 | Door reachability read a transposed grid cell and a 5.5 m slope raster; a compiler check nobody has watched fail is a check nobody has tested | `compile_settlement` door test on a 2 m local gradient |
| Round A | A kit piece's measured hull is about its PIVOT, and some source meshes put the pivot metres from the geometry (Mazzatun found HTBM/Ayleid hulls 4.6 m to 1,788 m off); such a piece cannot be placed by centre and is dropped, like a `nodeAmbiguous` one | `measure_footprints` flags; the design record says which pieces were dropped and why |
| Round A | Kit GLB node names were truncated at Blender's 63-char limit, so pieces shared nodes and could not be measured; short unique node names + extras-id matching | `build_kit.asset_node_name`, `measure_footprints.glb_asset_id_nodes` |
| Round A | The greedy plot cascades: pinning four records inside the solve moved 106 others. Pins are applied after the solve; the write-back is incremental | `macro_plot.pin_overrides`, `apply_sitings` |
| Round A feedback | Static maps could not be read; the studio view reuses the main map; every placed thing carries a plain-English why block (what, why here, why this spot, why with its neighbours, what it gives the player, how it uses the ground) that the click shows | blueprint `why` blocks; standard 13 keeps this file current |
| Review 2026-09-07 | An interior is the cell to which the mod's own door teleports, never a filename guess; the exterior door offset in the plugin is the derived entrance | `exterior-interior-links.json`, `mine_door_links`, esp-door doorways |
| Round A feedback | Layers must be integrated, not stacked: a way may only touch a building it ends at, ways may not run twice, a gate stands across its road, a door opens onto a way, a canal lies in water | `blueprint_integration` (compile-time errors) |
| Round A feedback | Streets are routed over the ground (A* on slope/water/buildings) unless the culture builds straight; ways are authored as waypoints with a why | `street_router --apply` |
| Round A feedback | A place is designed from the walking player's eye: approaches, first-seen landmarks, wayfinding, the door visible from the way. A plan that reads on the map can be illegible on the ground — no first-seen object, a gate beside the road, a door facing the swamp, a beacon shorter than the canopy | `approaches[]` (schema); [research/placement-settlements/openworld-approach-and-wayfinding.md](../research/placement-settlements/openworld-approach-and-wayfinding.md) and its 16-item pre-Round-A checklist (§5) |
| Round A feedback | Anything with an interior has a door, derived from what the kit ships; size is derived from lore (`scaleGrounding`) | interiors index + door rules; `scaleGrounding` |
| Round A feedback | The rules themselves are now one set: module 97, evidence-tagged, each with its enforcement; the loop applies 97, this file records how the loop went | `docs/world/97-placement-principles.md` |
| Round A feedback | Grading cannot fix a wrong line: routes are costed on gradient (a wall above the cap) and steep survivors get authored geometry (a stair, a bridge deck), listed in the grading report | `routes.grade_factor`, `reroute_majors`, `grade_routes`, `route-grading.md` |
| Round A feedback | Buildings will make every mistake plants made unless the rules are written first: per-asset anchoring mode, absolute LOD floors, matched atlases, fade with haze, shadow-pair sync, collider BUDGET, the CSM onBeforeCompile contract | research/rendering/building-placement-rendering-treatments.md §1 and its Round B checklist |
| Round A feedback | Streets inside a place are the province network continued: terminals name the real route, bearings match at the gate, the minor-route compiler ends at the declared entrance | `networkTerminals[]`, `network-stitch` |
| Part 6 | Blueprint-internal ids must be `<kind>.<slug>.<name>`; a blueprint *references* its catalogue id | standard 2 `references` option |
| Assemblies round | A building is an assembly, not a piece: the source authors' co-placement templates say which pieces snap together and where the door sits. Composites are authored per each kit's `snapLogic`, using only combinations the source authors made. The single pieces stay for ruins; a composite's doorway is inherited from its anchor part | `compose.parts` in the kit configs; `interiors_index` doorway join (`doorwaySource`); `kit-assemblies-evidence.md` § Composites |
| Assemblies round | A door may only sit on a DERIVED doorway (assembly offset or measured opening); a shell with neither cannot carry a door and is recorded as a sourcing gap rather than given a faked entrance. The doorway is drawn on the outline and drives the yaw reason | `blueprint.validate_blueprint` door rules (HARD); `export_blueprints` doorways; studio outline ticks |
| Assemblies round | Grading cannot climb what the ground refuses: a route still over its cap after gradient routing gets authored geometry as DATA (stair, stepped ascent, deck, bridge, lip step) compiled from measured piece rise/run. The grader exempts that span as it exempts a bridge | `route-structures.json`, `compile_route_structures`, `grade_routes` exemption, `route-structures-v1` kit |
| Phase 11 closeout | A stable route id does not preserve old chainage after the route is re-solved: carried structure windows past the current endpoint are dropped with measured endpoint evidence, crossing windows are clipped, and the compiled output directory is replaced as an exact set so stale way files cannot ship | `author_route_structures._reconcile_prior_windows`; `compile_route_structures.publish_route_outputs` and zero-span refusal |
| Assemblies round | A lane ends at the berth, not the plotted dot; the survey keeps the anchor-to-anchor lanes for siting so a moved berth does not re-plot the province. A water terminal is checked as "lands here" not "continues the bearing" | `lane-terminals.json`, `waterways-natural.json`, `network-stitch` water rule; minor waterways loaded as terminals |
| Doors round | A hollow prop reads as a room to a ray probe (game meshes are shells); enclosure needs walls whose FRONT faces the eye. Every real building then has a doorway from one of five evidences (opening, open front, baked leaf, mined placement, composed door part) and a linked interior kit that exists; the door is not a mesh that we place; it is the point around which the building is turned | `interiors_index` front-face criterion, doorway kinds, tileset-resolves test; `vanilla-farmhouse-int` / `vanilla-imperial-int` kits; `blueprint_footprints --orient`; `door-on-way` HARD |
| Doors round | The macro layer promised services and named people in prose, so nothing checked the blueprint built them — Lilmoth's record said `service-hub` and its blueprint had one shop parcel. The promise is now typed (`services[]`, derived from magnitude x culture x purpose) and the delivery is checked object by object | `catalogue.SERVICES`, `derive_services`, `blueprint_promises` in `compile_settlement`; 97 E9 / G22 |
| Review 2026-09-08 | A green service ledger can still drop the rest of a macro record. Every catalogue field is classified; every delivery-bearing semantic leaf keeps a stable obligation from catalogue through blueprint and later delivery manifests. Qualitative promises link their source path to concrete blueprint objects rather than copying the prose. `ownerFaction` is control, while `factionPresence.role: seat` is a separate promise | `place_obligations`, blueprint `macroEvidence[]`, catalogue `factionPresence[]`; B9a |
| Review 2026-09-07 | One canonical entrance per piece, ranked from the mod's own door link down; a piece's front is the side its author left open, and gates/walls face out | `entrance`, `provenance`, `front`, `piece_front.py`, gate/wall outward rule |
| Review 2026-09-07 | An enterable building earns its interior: every door carries a typed player purpose of medium tier or higher; flavour alone is decoration and stays outside | `player_purpose.py`, `playerPurpose[]` |
| Round A audit | A parcel is not one thing: a rack, an oven and a notice board were counted, spaced and judged as buildings, so a works yard read as a village. Every parcel now derives a `kind` (building / structure / prop) from the interiors index and the measured mesh; props are dressing, a stacked piece is not a second structure, and the dressing kit is admitted to every kit set | `parcel_kinds.py`; 97 C1a / C5b / G23; `DRESSING_KITS` |
| Round A audit | Spacing was measured between authored PIVOTS, which some pieces put 8–20 m from their own hulls; density was measured over a boundary that carried the approaches and the water; the canopy a beacon was held against was the region's tallest species rather than the trees on the ray | `parcel-gap` on footprint centroids; `built_hull_area_ha`; `_canopy_on_ray_m`; 97 C5 / C6 / D2 |
| Round A audit | "Designed to touch" covered kit snaps only, so a hoist against the rock it works had to be mis-declared as a snap. A trade contact is `worksWith` + `worksWithWhy`: exempt from the 8 m floor, and held 0.5 m CLEAR, because nobody authored those two pieces to join | validator `worksWith`; `WORKS_WITH_CLEAR_M`; 97 C5a / G24 |
| Round A audit | The prose linter read every hard-wrapped markdown line as a sentence, so "the road runs from" was reported as ending on a preposition (14 of 24 hits). Markdown is linted by paragraph, and a code span becomes a neutral word rather than nothing | `lint_prose.lint_markdown` |
| Review 2026-09-07 | Turning a building to its door is not the end of the move: the way clearance, the sightline and the spacing are re-run after every orient pass; the router bends the way before the building moves | `--orient` then `street_router --apply` then compile; the compile is the gate |
| Review 2026-09-08 | Walls and fences are routed over the ground like streets, in the wall's own module, standing in water only where the lore drives poles | `street_router` fence mode, `fences[].class/waterOk/gapAt` |
| Review 2026-09-08 | Pieces designed to connect are snapped face to face, never placed near each other: connectors are measured from the authors' co-placements and the mesh, and `abuts` is checked as a snap | `measure_connectors`, `<kit>.connectors.json`, `abuts-snap` |
| Assemblies round | The macro plot is more even than random (Clark–Evans R ≈ 1.8 per zone, target < 1): a report can only say so; fixing it is a re-solve that the owner must call | `plot_stats`, 0041 § Assemblies round |

## 3. Automation-readiness checklist (Phase 15 gate)

A place type may be rolled out without an owner round when ALL of these hold:

- [ ] two exemplars of the type have passed Round C with no steer that changed a rule;
- [ ] every steer from its rounds is a rule in the Taste ledger or a compiler check, none is a one-off edit;
- [ ] `apply_sitings` + compile + export run clean on the type's exemplars from the blueprint alone (the exemplar is a regression fixture);
- [ ] the type's siting grammar (which candidates, how measured, what wins) is written in the recipe, and the meso pass reproduces the exemplar's choice from it;
- [ ] the agent-as-reviewer experiment (0041) has matched the owner's verdict on one non-city instance of the type;
- [ ] no OPEN row in the sourcing-gap register for a piece the type needs.

Cities never leave the owner's hands (0041).

**A structure no piece fits is not published** (water round 2, 2026-09-09).
The 0047 re-carve produced short over-cap windows that no piece of their
family spans, so 38 authored structures compiled to zero pieces. They stay in
`world/sources/routes/route-structures.json`, because the debt is real and the
grader still needs their windows; they are kept out of the studio bundle,
because nothing is built there. The count prints every run — if it grows, the
families need a shorter piece, not a looser gate.

**A derived route is regenerated, never hand-corrected** (water round 2 close-out,
2026-09-09). When the terrain moves, a blueprint's derived routes, boardwalks
and canals drift past the 0.3 m tolerance and the validator names them. The fix
is `street_router --apply <file>` and `blueprint_footprints --apply`, not an
edit to the points — they are derived geometry and an edit only survives until
the next rebuild. Wamasu Pond needed exactly this after the sap-tapping chain.

## 4. Records and routing

- Process (this module) · taste steers → 0041 Taste ledger · per-place
  reasoning → `world/sources/blueprints/<id>.md` · per-round delivery →
  0041 round records · lessons that are really *rules* → the schema docstring
  or the linter, then a one-line pointer here.
- Router rows: [docs/README.md](../README.md) "Authoring or reviewing a
  settlement blueprint"; [world/README.md](README.md) module table.

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
| 1. Read the record | catalogue record + type recipe + lore dossier + quest rows and sockets that name the place | every socket and quest need is listed as a layout requirement |
| 2. Dossier the ground | `worldgen.site_dossier --id <slug> --x --z --radius` → `sites/dossiers/<slug>.{json,md}` | the dossier is cited in the design record |
| 3. Candidate sitings | 2–3 exact points, each measured (`ProvinceSurvey.sample`, `height_at` over the footprint ring, water depth at the dock line, route tie-in, sightlines) | one chosen, the others recorded with why they lost (`siting` block) |
| 4. Design | districts as **kit sets**, layout intent, signature feature, every socket placed, clearance | written in the design record `<id>.md` before any geometry |
| 5. Pieces on geometry | `assetRef` per parcel from `kit.json` sizes and the kit's `footprints.json`; kit `snapLogic` obeyed | no piece chosen from its name; no two kits blended in a district |
| 6. Orientation with a why | `centreUV` + `yawDeg` + `orientationWhy` on every parcel; footprint derived (`worldgen.blueprint_footprints --apply`) | the validator rejects an unexplained orientation |
| 6b. **Approach and wayfinding** | walk each `approaches[]` entry on the ground: `firstSeen`, the occlusion, the threshold, the sightline from the gate to the centre, the door of every socket building | the design record carries the "Approach and wayfinding" section and the 16-item checklist of [research/openworld-approach-and-wayfinding.md](../research/openworld-approach-and-wayfinding.md) §5, answered |
| 7. Validate, compile, render, export | `blueprint --check` → `compile_settlement` (0 errors) → `render_blueprint` → `export_blueprints` (studio view) | 0 errors; budget declared honestly |
| 8. **Write the siting back** | `worldgen.apply_sitings` → overrides → `macro_plot` (pinned) → minor routes, waterways, hostility measure, studio exports | the dot, the paths and the waterways describe the place where it now is |
| 9. Owner Round A | the interactive blueprint view in World Studio + the design record's 2–4 questions | steers written to the Taste ledger as general rules |
| 10. Rounds B–C | massing renders, then the dressed walk | owner declares the exemplar good, explicitly |

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
| Part 6 | The macro plot places by landform *class*; four of five plots could not carry the place as recorded (no standing water for a pond, a 47° hillside, 4.3 m of relief across a ring, no navigable water). The meso pass exists to measure; expect 60–150 m moves and write them back | `apply_sitings`; 0041 § Part 6 delivery record |
| Part 6 | Kits only combine pieces designed to combine, so a district is ONE kit set | `blueprint.KIT_SETS` |
| Part 6 | A piece is chosen on measured size, never on its label; the record's `assetPlan` can name kits that cannot serve the place (a 55 m root house for a three-person camp) | `assetRef`; the design record's "catalogue should change" list |
| Round A | Axis-aligned squares with south doors are not a layout. Real footprints, authored orientation, a why per building | `centreUV`/`yawDeg`/`orientationWhy`, `measure_footprints` |
| Round A | A static map with everything printed on it cannot be read. Review happens in an interactive view: zoom, hover, click, layers | World Studio blueprint view (`?bp=1`) |
| Round A | A sourcing gap is a job with an owner and a status, never a note | sourcing-gap register in `docs/research/settlement-kit-sourcing-log.md` |
| Part 6 | Door reachability read a transposed grid cell and a 5.5 m slope raster; a compiler check nobody has watched fail is a check nobody has tested | `compile_settlement` door test on a 2 m local gradient |
| Round A | A kit piece's measured hull is about its PIVOT, and some source meshes put the pivot metres from the geometry (Mazzatun found HTBM/Ayleid hulls 4.6 m to 1,788 m off); such a piece cannot be placed by centre and is dropped, like a `nodeAmbiguous` one | `measure_footprints` flags; the design record says which pieces were dropped and why |
| Round A | Kit GLB node names were truncated at Blender's 63-char limit, so pieces shared nodes and could not be measured; short unique node names + extras-id matching | `build_kit.asset_node_name`, `measure_footprints.glb_asset_id_nodes` |
| Round A | The greedy plot cascades: pinning four records inside the solve moved 106 others. Pins are applied after the solve; the write-back is incremental | `macro_plot.pin_overrides`, `apply_sitings` |
| Round A feedback | Static maps could not be read; the studio view reuses the main map; every placed thing carries a plain-English why block (what, why here, why this spot, why with its neighbours, what it gives the player, how it uses the ground) that the click shows | blueprint `why` blocks; standard 13 keeps this file current |
| Round A feedback | Layers must be integrated, not stacked: a way may only touch a building it ends at, ways may not run twice, a gate stands across its road, a door opens onto a way, a canal lies in water | `blueprint_integration` (compile-time errors) |
| Round A feedback | Streets are routed over the ground (A* on slope/water/buildings) unless the culture builds straight; ways are authored as waypoints with a why | `street_router --apply` |
| Round A feedback | A place is designed from the walking player's eye: approaches, first-seen landmarks, wayfinding, the door visible from the way. A plan that reads on the map can be illegible on the ground — no first-seen object, a gate beside the road, a door facing the swamp, a beacon shorter than the canopy | `approaches[]` (schema); [research/openworld-approach-and-wayfinding.md](../research/openworld-approach-and-wayfinding.md) and its 16-item pre-Round-A checklist (§5) |
| Round A feedback | Anything with an interior has a door, derived from what the kit ships; size is derived from lore (`scaleGrounding`) | interiors index + door rules; `scaleGrounding` |
| Round A feedback | The rules themselves are now one set: module 97, evidence-tagged, each with its enforcement; the loop applies 97, this file records how the loop went | `docs/world/97-placement-principles.md` |
| Round A feedback | Grading cannot fix a wrong line: routes are costed on gradient (a wall above the cap) and steep survivors get authored geometry (a stair, a bridge deck), listed in the grading report | `routes.grade_factor`, `reroute_majors`, `grade_routes`, `route-grading.md` |
| Part 6 | Blueprint-internal ids must be `<kind>.<slug>.<name>`; a blueprint *references* its catalogue id | standard 2 `references` option |

## 3. Automation-readiness checklist (Phase 15 gate)

A place type may be rolled out without an owner round when ALL of these hold:

- [ ] two exemplars of the type have passed Round C with no steer that changed a rule;
- [ ] every steer from its rounds is a rule in the Taste ledger or a compiler check, none is a one-off edit;
- [ ] `apply_sitings` + compile + export run clean on the type's exemplars from the blueprint alone (the exemplar is a regression fixture);
- [ ] the type's siting grammar (which candidates, how measured, what wins) is written in the recipe, and the meso pass reproduces the exemplar's choice from it;
- [ ] the agent-as-reviewer experiment (0041) has matched the owner's verdict on one non-city instance of the type;
- [ ] no OPEN row in the sourcing-gap register for a piece the type needs.

Cities never leave the owner's hands (0041).

## 4. Records and routing

- Process (this module) · taste steers → 0041 Taste ledger · per-place
  reasoning → `world/sources/blueprints/<id>.md` · per-round delivery →
  0041 round records · lessons that are really *rules* → the schema docstring
  or the linter, then a one-line pointer here.
- Router rows: [docs/README.md](../README.md) "Authoring or reviewing a
  settlement blueprint"; [world/README.md](README.md) module table.

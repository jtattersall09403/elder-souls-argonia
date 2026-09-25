# Research — Phase 16 audits (2026-09-11)

The five read-only audits that are the evidence behind every chunk of
[../../phases/16-foundation-and-places/README.md](../../phases/16-foundation-and-places/README.md).
All are `file:line` against commit `34bec0ed`; none of them changed anything.

| File | What it answers | Status |
| --- | --- | --- |
| [audit-water-runtime.md](audit-water-runtime.md) | Why the deployed sea looks static: swell, whitecaps, shore break, hard edges, hovering sheets, doming and seams, traced to the runtime code. | evidence |
| [audit-hydrology-data-model.md](audit-hydrology-data-model.md) | What water entities exist, where the level comes from, which stages feed terrain and water back into each other, and why trees stand in rivers. | evidence |
| [audit-chain-and-terrain.md](audit-chain-and-terrain.md) | The terrain chain's dependency graph and its feedback cycles, local patches, the border and the cliffs. | evidence |
| [audit-settlements-delivered.md](audit-settlements-delivered.md) | The shipped settlements measured against the rules: hollow buildings, wrong kits, orientation, doors, floating pieces, missing paths. | evidence |
| [audit-routers-and-context.md](audit-routers-and-context.md) | Whether the doc routers have broken and what important context sits unused; broken links across all 360 `.md` files. | evidence |
| [16a-hydrology-graph-ledger.md](16a-hydrology-graph-ledger.md) | 16a's measurements: which base, August vs today, the drainage-solver defect, the graph report, the wet-season line, the pit list for ruling 2, the delta answer, the gates. | ledger |
| [16b-terrain-once-ledger.md](16b-terrain-once-ledger.md) | The 16b gate and defect record (0059, 0060 §9): what moved, what was waived, the two-run proof. | ledger |
| [16c-water-once-ledger.md](16c-water-once-ledger.md) | 16c round 1 measurements: water once, the high-water line (0063). | ledger |
| [16c-round-2-ledger.md](16c-round-2-ledger.md) | 16c round 2: the owner's walk feedback and where each item landed. | ledger |
| [16d-ledger.md](16d-ledger.md) | The 1:1 registration that replaced the audit's, the apron build numbers, the gated tests, the beyond-border sea. | ledger |
| [16e-ledger.md](16e-ledger.md) | 16e routes, grading, spans and ferries on the frozen world (0068). | ledger |
| [16e-road-paint-census.md](16e-road-paint-census.md) | Generated census of road paint per material code on the shipped land cover (`worldgen.road_paint_census`). | evidence (generated) |
| [16f-ledger.md](16f-ledger.md) | 16f vegetation and dressing on the frozen water: evidence for the owner check. | ledger |
| [16g-ledger.md](16g-ledger.md) | 16g macro plot on the frozen world: evidence for the owner check. | ledger |
| [16g-mining.md](16g-mining.md) | 16g lane D read-only mining for part 2. | evidence |
| [16g-remedy-plan.md](16g-remedy-plan.md) | The reasoning behind `world/sources/sites/plot-remedies.json`, from the eight review packs. | plan (applied) |
| [16g-review/dunmer-north.md](16g-review/dunmer-north.md) | 16g plot review of `dunmer-north`, measured 2026-09-19. | evidence |
| [16g-review/hist-heartland.md](16g-review/hist-heartland.md) | 16g plot review of `hist-heartland`, measured 2026-09-19. | evidence |
| [16g-review/imperial-fringe.md](16g-review/imperial-fringe.md) | 16g plot review of `imperial-fringe`, measured 2026-09-19. | evidence |
| [16g-review/imperial-penal-south.md](16g-review/imperial-penal-south.md) | 16g plot review of `imperial-penal-south`, measured 2026-09-19. | evidence |
| [16g-review/mercantile-coast.md](16g-review/mercantile-coast.md) | 16g plot review of `mercantile-coast`, measured 2026-09-19. | evidence |
| [16g-review/naga-kur-deeps.md](16g-review/naga-kur-deeps.md) | 16g plot review of `naga-kur-deeps`, measured 2026-09-19. | evidence |
| [16g-review/pirate-freeholds.md](16g-review/pirate-freeholds.md) | 16g plot review of `pirate-freeholds`, measured 2026-09-19. | evidence |
| [16g-review/saxhleel-coast.md](16g-review/saxhleel-coast.md) | 16g plot review of `saxhleel-coast`, measured 2026-09-19. | evidence |
| [16h-ledger.md](16h-ledger.md) | 16h building blocks (part 1 from 2026-09-22): measurements, Sonnet reports, departures from the brief. | ledger |
| [16h-catalogue-wide-steps-audit.md](16h-catalogue-wide-steps-audit.md) | Which steps from 16h part 2 to Phase 15 run over a whole catalogue, measured counts, the sample-first shape for each, and the tools with no place selector. | evidence |
| [16h-handoff-2026-09-25.md](16h-handoff-2026-09-25.md) | The Codespaces migration hand-off: every lane's state at the 2026-09-24 cut, what was mid-flight, the line that relaunches it; open owner calls. | hand-off (history) |
| [16k-handoff-2026-09-25.md](16k-handoff-2026-09-25.md) | 16k hand-off at the planning session's close: the owner rulings the next session applies. | hand-off |

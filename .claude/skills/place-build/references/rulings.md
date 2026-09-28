# Place-build rulings, one row each (decision 0106)

This table is the ONLY home of the place rulings (0106, owner 2026-09-28): a
new ruling is a new row here, never a decision addendum or a lane report.
Orient reads the rows for the place's type and the gates they name, never
the lane reports (R39). A rule with no gate is the builder's to keep by hand.
Where a row's source is a 0105 addendum, its long text is in git at
`961a993f:docs/decisions/0105-setting-class-reserved-doors-lights-band-planned-variety.md`;
the code that enforces each is listed in 0105 § Where each lives.

| Rule | What it says | Enforced by | Source |
|---|---|---|---|
| R1 | A piece stands only in the setting its own plugin places it in (manifest `settingClass`), never judged from its name | `setting.class` | 0105 decision (owner 2026-09-28) |
| R2 | Reserved doors are for tier B/C interiors only; a dwelling, shop, stable house or workplace re-shells or is walked into | `interiors.reserved` | 0105 decision (owner 2026-09-28) |
| R3 | Every fixture within 200 m emits (16 nearest); no point in a place sees more than 16 | `lights.density` | 0105 decision (owner 2026-09-28) |
| R4 | § Variety per building; a cell repeats in a region only when the fit set is used up; 3 uses per province | `interiors.variety` | 0105 decision (owner 2026-09-28) |
| R5 | Prose never claims a world behaviour the runtime lacks (flood, tide, collapse) | text-review (no gate) | 0105 decision (owner 2026-09-28) |
| R6 | Per-dwelling dressing counts every placement within 12 m of the footprint except shells, pads, ground treatments, runs | `breadth.dressingPiecesPerDwellingWithin12mMin` | 0105 decision (owner 2026-09-28) |
| R7 | Type 10 stays; Argonian hanging lanterns hang where they look good; Phase 15 walk sample | reader pass | 0105 decision (owner 2026-09-28) |
| R8 | Renders carry no text (scale bar, north arrow); `--labels` for humans only | `test_render_blueprint` | 0105 decision (owner 2026-09-28) |
| R9 | Setting licence has two axes: interior/exterior (small dressing exempt) and social scale (keep exclusive) | `setting.class` | 0105 add. 1 (planner, wave 2) |
| R10 | A reserved door on a dwelling, work, storage or service parcel fails | `interiors.reserved` | 0105 add. 1 (planner, wave 2) |
| R11 | Window glows are emissive only; lit counts step 0/4/8/16 | lighting.ts tests | 0105 add. 1 (planner, wave 2) |
| R12 | Sink rows are measured on the master's ground; the mesh-sill fallback is flagged `fallback: true` | sink miner | 0105 add. 1 (planner, wave 2) |
| R13 | `wb round` writes the round folder and `waiting-on.json`; `ownerOkRule` guards accepted ops | `ownerOkRule` | 0105 add. 1 (planner, wave 2) |
| R14 | Small dressing = largest placed dimension under 1.2 m and no light | `setting.class` | 0105 add. 2 (planner, wave 2 close) |
| R15 | Water craft are class `vehicle`, exempt from axis (i) | `setting.class`, `sink.fallback` | 0105 add. 2 (planner, wave 2 close) |
| R16 | A village ruin takes the ruin pool plus its builders' (`builtBy`) | `setting.class` | 0105 add. 2 (planner, wave 2 close) |
| R17 | A type's `settingClass` is derived from its kind, never set by hand | `test_place_gates_0105` | 0105 add. 2 (planner, wave 2 close) |
| R18 | An open-fronted doorless piece its plugin places outdoors is walked into | `interiors_index` | 0105 add. 2 (planner, wave 2 close) |
| R19 | Sink miner: scaled refs divided by scale; a tree in water under 2 m counts as grounded | sink miner | 0105 add. 2 (planner, wave 2 close) |
| R20 | Manifest `lodLevels` is what the GLB carries | build_kit | 0105 add. 2 (planner, wave 2 close) |
| R21 | Prisons, jails, watchtowers are `keep` | `derive_setting_class` | 0105 add. 2 (planner, wave 2 close) |
| R22 | A ducal or fort ruin takes the keep pool | `derive_setting_class` | 0105 add. 2 (planner, wave 2 close) |
| R23 | A class licence needs 2 references; one reference is NOT_MEASURED on axis (ii) | setting-class miner | 0105 add. 2 (planner, wave 2 close) |
| R24 | A hand row the miner now measures is deleted | review | 0105 add. 2 (planner, wave 2 close) |
| R25 | The Riften stable sits at sink 0 (reviewed `assetPlacement` row) | policy row | 0105 add. 2 (planner, wave 2 close) |
| R26 | A `work` parcel takes a workplace cell | `blueprint_interiors` | 0105 add. 2 (planner, wave 2 close) |
| R27 | A doorless stable is walked into; the keeper lives elsewhere, and the brief says where | brief | 0105 add. 2 (planner, wave 2 close) |
| R28 | A porch face is a run end only when its plugin pairs it twice | abuts record | 0105 add. 2 (planner, wave 2 close) |
| R29 | A sick texture variant's sink goes through the miner | sink miner | 0105 add. 2 (planner, wave 2 close) |
| R30 | Every REQUEST row is closed: applied, or answered with the rule that refuses it | integrator | 0105 add. 2 (planner, wave 2 close) |
| R31 | A building op (a `place` with a `pad`) new or changed since HEAD must lie on a site scan newer than HEAD; a brief names the need, never the site | `scanFreshRule` (wb check) | 0105 add. 3 (method review r5) |
| R32 | Ledger runs are keyed by place and walk (`--walk N` on the orient start); an orient that would join an earlier walk's run is refused | `build_ledger.py` | 0105 add. 3 (method review r5) |
| R33 | The per-dwelling bar is R6's count over vanilla houses: 20 at M1-M3, 45 at M4-M5, 15 on an isolated farm | `breadth.dressingPiecesPerDwellingWithin12mMin` (breadth-bars.json) | 0105 add. 3 (method review r5) |
| R34 | A sourcing candidate in a brief cites its record row (setting class, sink, mounts) or is marked UNVERIFIED; a filename survey is a lead | brief review (no gate) | 0105 add. 3 (method review r5) |
| R35 | The packet's "What changed" lines come from `wb.py whatchanged` (layout diff, manifest names); packet prose is under R5 | `wb.py whatchanged` | 0105 add. 3 (method review r5) |
| R36 | A placed tree, architecture or piece 3 m or taller on the mesh-sill sink fallback is listed; the place is not green | `sink.fallback` | 0105 add. 3 (method review r5) |
| R37 | "Exhausted" is computed from the fit rule over the claim table, never read from the claim's `why` | `interiors.variety` | 0105 add. 3 (method review r5) |
| R38 | The density count adds published neighbours' fixtures within the band | `lights.density` | 0105 add. 3 (method review r5) |
| R39 | The skill stays at most 450 lines; rulings live here, one line each | `test_the_skill_is_lean` | 0105 add. 3 (method review r5) |
| R40 | 0105 decision 1 holds no premise as fact; the martial mapping is R17's | 0105 text | 0105 add. 3 (method review r5) |
| R41 | A shell that can claim a cell does; a doorless hut is walked into; a shell with a door and no cell is re-shelled, never reserved | `interiors.reserved` | 0105 add. 4 (briefs L16, L18) |
| R42 | Argonian lanterns hang on a Hist's branches by an unmined, reader-approved mount | reader pass | 0105 add. 4 (briefs L16, L18) |
| R43 | The R6 bar is met with causal dressing from the type's yard sets; light kinds at least 2 | `breadth.*` | 0105 add. 4 (briefs L16, L18) |
| R44 | A sick-variant piece's sink row is measured or a reviewed policy row | `sink.fallback` | 0105 add. 4 (briefs L16, L18) |
| R45 | An absent-master form is classed by where it sits in its cells (surface clutter, floor furniture or clutter, hung fixture) | `export_interior_bundle --class-absent-by-placement` | 0105 add. 4 (briefs L16, L18) |
| R46 | A `TREE` base is vegetation | `export_interior_bundle.piece_class` | 0105 add. 4 (briefs L16, L18) |
| R47 | A crate is clutter | `asset_taxonomy.classify` | 0105 add. 4 (briefs L16, L18) |
| R48 | A stand-in draws the same object, else the reference is a gap | `test_export_interior_bundle` | 0105 add. 4 (briefs L16, L18) |
| R49 | A form is a fixture only when every reference hangs within 0.3 m of a wall or shell face; else clutter | `support_of` (`WALL_REACH_M`) | 0105 add. 4 (briefs L16, L18) |
| R50 | A floor form with nothing on it is clutter | `class_by_placement` | 0105 add. 4 (briefs L16, L18) |
| R51 | A tier A cell may ship with a listed gap (`gaps[]` row) only when the missing piece exists nowhere after a completed search (0102's third reason) | `test_export_interior_bundle` (listed gaps) | brief-L20 (planner 2026-09-28) |
| R52 | Every building that looks enterable is enterable: a shell with a door and no plugin-linked cell takes a cell from its culture pool by the fit rule; a shell that fits none is cut from the pool for doored buildings; doorless open fronts are walked into (R18) | `interiors.reserved`, `blueprint_interiors` fit rule | owner 2026-09-28 (corrects 0103 decision 1) |
| R53 | `mount --unmined` branch-hang: ray up from the child's pivot to the parent mesh; hanging pieces are exempt from the 1.0 m cap; proved on the mined Mud Mother lantern pair within 0.1 m first | `wb.py mount` test | brief-L20 (planner 2026-09-28) |
| R54 | A spring house is a freestanding roofed piece from the mud/root pool licensed exterior, facing the path; its sink is measured or a reviewed row | `setting.class`, `sink.fallback` | brief-L20 (planner 2026-09-28) |
| R55 | A bulk reclassification is sample-checked (25 rows against real mesh surfaces, answers written first); more than 2 misses reverts it | sample protocol (no gate) | brief-L20 (planner 2026-09-28) |
| R56 | The Argonian culture pool is the linked cells of every Argonian-culture kit: the `KIT_SETS` sets sharing `cultureGroup` (mud, stilt, root) plus the kotm, bmv and htbm interior kits' shells (`CULTURE_INTERIOR_KITS`) | `blueprint_interiors.culture_shells` | brief-L22 (planner 2026-09-28) |
| R57 | Reusing a cell within a place or region is green only when the whole R56 fit set (ratio 0.6-1.7) for that shell is used; the gate computes it from the claim table and reports `fitSets` per door | `interiors.variety` | brief-L22 (planner 2026-09-28) |
| R58 | An `openShelter` (roofed piece on posts, no floor slab; `floorClass` on its `assetPlacement` row) is judged at its posts; the canopy may stand off the ground. `argoniantent02` is one | `floorEdgeRule` (`open_shelter_piece`) | brief-L22 (planner 2026-09-28) |
| R59 | A place's layout file is its source; no generator script writes it | `chain.sh` | brief-L22 (planner 2026-09-28) |

# Walk-3 rulings, one line each (decision 0105)

Orient reads this table, never the lane reports (0105 R39). The full text of
each rule is its numbered item in
[0105](../../../../docs/decisions/0105-setting-class-reserved-doors-lights-band-planned-variety.md);
where a gate or check enforces it, the gate is named. A rule with no gate is
the builder's to keep by hand.

| Rule | What it says | Enforced by |
|---|---|---|
| R1 | A piece stands only in the setting its own plugin places it in (manifest `settingClass`), never judged from its name | `setting.class` |
| R2 | Reserved doors are for tier B/C interiors only; a dwelling, shop, stable house or workplace re-shells or is walked into | `interiors.reserved` |
| R3 | Every fixture within 200 m emits (16 nearest); no point in a place sees more than 16 | `lights.density` |
| R4 | § Variety per building; a cell repeats in a region only when the fit set is used up; 3 uses per province | `interiors.variety` |
| R5 | Prose never claims a world behaviour the runtime lacks (flood, tide, collapse) | text-review (no gate) |
| R6 | Per-dwelling dressing counts every placement within 12 m of the footprint except shells, pads, ground treatments, runs | `breadth.dressingPiecesPerDwellingWithin12mMin` |
| R7 | Type 10 stays; Argonian hanging lanterns hang where they look good; Phase 15 walk sample | reader pass |
| R8 | Renders carry no text (scale bar, north arrow); `--labels` for humans only | `test_render_blueprint` |
| R9 | Setting licence has two axes: interior/exterior (small dressing exempt) and social scale (keep exclusive) | `setting.class` |
| R10 | A reserved door on a dwelling, work, storage or service parcel fails | `interiors.reserved` |
| R11 | Window glows are emissive only; lit counts step 0/4/8/16 | lighting.ts tests |
| R12 | Sink rows are measured on the master's ground; the mesh-sill fallback is flagged `fallback: true` | sink miner |
| R13 | `wb round` writes the round folder and `waiting-on.json`; `ownerOkRule` guards accepted ops | `ownerOkRule` |
| R14 | Small dressing = largest placed dimension under 1.2 m and no light | `setting.class` |
| R15 | Water craft are class `vehicle`, exempt from axis (i) | `setting.class`, `sink.fallback` |
| R16 | A village ruin takes the ruin pool plus its builders' (`builtBy`) | `setting.class` |
| R17 | A type's `settingClass` is derived from its kind, never set by hand | `test_place_gates_0105` |
| R18 | An open-fronted doorless piece its plugin places outdoors is walked into | `interiors_index` |
| R19 | Sink miner: scaled refs divided by scale; a tree in water under 2 m counts as grounded | sink miner |
| R20 | Manifest `lodLevels` is what the GLB carries | build_kit |
| R21 | Prisons, jails, watchtowers are `keep` | `derive_setting_class` |
| R22 | A ducal or fort ruin takes the keep pool | `derive_setting_class` |
| R23 | A class licence needs 2 references; one reference is NOT_MEASURED on axis (ii) | setting-class miner |
| R24 | A hand row the miner now measures is deleted | review |
| R25 | The Riften stable sits at sink 0 (reviewed `assetPlacement` row) | policy row |
| R26 | A `work` parcel takes a workplace cell | `blueprint_interiors` |
| R27 | A doorless stable is walked into; the keeper lives elsewhere, and the brief says where | brief |
| R28 | A porch face is a run end only when its plugin pairs it twice | abuts record |
| R29 | A sick texture variant's sink goes through the miner | sink miner |
| R30 | Every REQUEST row is closed: applied, or answered with the rule that refuses it | integrator |
| R31 | A building op (a `place` with a `pad`) new or changed since HEAD must lie on a site scan newer than HEAD; a brief names the need, never the site | `scanFreshRule` (wb check) |
| R32 | Ledger runs are keyed by place and walk (`--walk N` on the orient start); an orient that would join an earlier walk's run is refused | `build_ledger.py` |
| R33 | The per-dwelling bar is re-derived under R6's count from 0098's vanilla places | breadth-bars.json (open, see 0105 addendum 3) |
| R34 | A sourcing candidate in a brief cites its record row (setting class, sink, mounts) or is marked UNVERIFIED; a filename survey is a lead | brief review (no gate) |
| R35 | The packet's "What changed" lines come from `wb.py whatchanged` (layout diff, manifest names); packet prose is under R5 | `wb.py whatchanged` |
| R36 | A placed tree, architecture or piece 3 m or taller on the mesh-sill sink fallback is listed; the place is not green | `sink.fallback` |
| R37 | "Exhausted" is computed from the fit rule over the claim table, never read from the claim's `why` | `interiors.variety` |
| R38 | The density count adds published neighbours' fixtures within the band | `lights.density` |
| R39 | The skill stays at most 450 lines; rulings live here, one line each | `test_the_skill_is_lean` |
| R40 | 0105 decision 1 holds no premise as fact; the martial mapping is R17's | 0105 text |

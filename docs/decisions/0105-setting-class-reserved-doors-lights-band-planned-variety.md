# 0105 — Setting class, reserved doors, lights band, planned variety

**Date:** 2026-09-28. **Owner feedback:** the Claywater walk 3 and
Greenspring walk 1 reply, 2026-09-28 (transcribed in
`tooling/.reports/16k/walk3/owner-feedback.md`). **Planner rulings:** R1–R8
of the walk-3 fix round (Fable, 2026-09-28). **Amends:** 0103 decision 1
(the "no linked shell in the pool" exception for a lived-in building's
door) and the Phase 12 description (0062, 0103 decision 7); 0098's
"pieces within 12 m per dwelling" count (R6); the lights budget in
`packages/game-core/src/settlement/lighting.ts` (was the nearest 8 within
120 m).

## Owner's words (2026-09-28)

- "Candle sconces on farmhouse exteriors are interior pieces: wall-mounted
  lanterns instead, else a lantern on a barrel by the door."
- "Stone stables look like a castle stable; find a fitter small-outpost
  stable; may be a symptom of something bigger."
- "Stable door / four Greenspring house doors 'built in Phase 12': Phase 12
  is for complex hand-crafted interiors, not standard houses and stables;
  re-describe."
- "'Nearest 8 lights' is arbitrary: all within a few hundred metres emit;
  further ones look lit without emitting."
- "Repetition of KeebaHouseCrafter/Fisher interiors and mud hut exteriors:
  the skill must explicitly use and create variety (breadth of assets)."
- "Claywater ferryman 'poles across when the ford floods' but the water
  never rises: resolve (prose rewrite acceptable; keep the visual); this
  class of thing needs a rule."
- "Blueprints and iso bearing images too busy (overlapping text): no text;
  agents must be able to read them too."
- Calls: "type 10 stays; hanging lanterns wherever the builder judges they
  look good (artistic licence, visually checked); Phase 15 walk sample =
  major cities + early-game places + 1–2 of each place type."

## Decisions

1. **R1 Setting class.** A kit piece is placed only in the setting class
   its own plugin places it in: interior or exterior, and keep-or-castle,
   town, village, camp or ruin, read from the plugin's placement cells and
   worldspaces, never from the name. Candle sconces are interior pieces by
   this rule; the Morrowind-keep stone stable is a keep piece and never
   stands in a hamlet. The evidence is `settingClass` on the kit manifest
   row, mined by `worldgen.mine_setting_class` into
   `world/sources/placement/kit-setting-class.json` and refreshed onto the
   manifests through the kit-build path: `settings` names each licensed
   setting (interior, exterior) with its licensed classes (`wild` licenses
   the setting and no class), `n` and `sourceCells` are the evidence, and
   a piece its own plugin never places is `unplaced` and licensed nowhere. A place's class comes
   from its catalogue recipe (`type-recipes.json`): class `camp` is camp,
   `ruin` is ruin, `martial` is keep, the `major-city` and `free-port`
   families and `*-town` and `*-city` types are town, every other type is a
   village (`place_gates.place_setting_class`). Gate `setting.class`; a row
   with no `settingClass` is reported NOT_MEASURED and passes.
2. **R2 Reserved doors are legal only for tier B and C interiors**
   (assembled, non-plugin: dungeons, unique large interiors). A dwelling,
   shop, stable house or workplace door is never reserved: the builder
   re-shells to a shell with a linked furnished cell, or, for a doorless
   hut, dresses the inside as exterior placements and the hut is walked
   into. Phase 12 keeps only tiers B and C; standard houses, stables and
   workplaces are tier A in 16k and Phase 15 and never Phase 12.
3. **R3 The lights band.** Every fixture within 200 m of the player emits
   a point light, up to a performance cap of the 16 nearest; beyond the
   band the flame sprite and the emissive stay visible. The cap and band
   live once, as `LIGHTS_CAP` and `LIGHTS_ACTIVE_M` in `lighting.ts`. The
   cap is a place check rule: no point within a place may see more than 16
   fixtures within 200 m (gate `lights.density`, which reads both
   constants from `lighting.ts` and counts fire sockets, light-layer and
   LIGH-record pieces, as the runtime does). A lit window is no fixture
   (walk 3 ruling R11, 2026-09-28): its glow is the kit's emissive mask
   under the lamp clock, never a point light, and neither the runtime nor
   the gate counts it. The visible point-light count steps 0/4/8/16 only
   (zero-intensity padding, changed at the 1 s refresh), so three.js
   caches four shader programs per lit material; flame sprites draw to
   250 m (`FLAME_MAX_DISTANCE_M`).
4. **R4 Variety is planned and gated.** The design brief carries a
   § Variety listing, per building, the shell and the interior cell
   chosen, and the pool members rejected and why (used within 2 km, used 3
   times province-wide, no link). Gate `interiors.variety`: an interior
   cell used already in the same region (this place included) fails
   unless every cell linked to the door's shell is already used in the
   region and the claim's `why` says the set is exhausted; a cell is used
   at most 3 times province-wide, like a signature. Other places' cells
   are read from `interiorCellClaims` in
   `world/sources/placement/signature-claims.json`, written by
   `place_gates --id <place> --claim-cells` at the brief step.
5. **R5 Story never claims a world behaviour the runtime lacks** (a
   seasonal flood, a tide, a collapse): prose is checked against the
   record and the runtime before it is written, and a claim with no system
   behind it is rewritten to what the player can see.
6. **R6 The breadth-bar dressing count** is every placement within 12 m of
   the dwelling's footprint except shells, pads, ground treatments and
   modular-run pieces. 0098's vanilla numbers counted pieces, so the bar
   now counts the same thing (steps, annexes, fire sockets and props all
   count; the house shell, pads and runs do not).
7. **R7 Owner calls.** Type 10 stays on the type list. Argonian hanging
   lanterns hang wherever the builder judges they look good (branches,
   arches, eaves, posts), verified by the reader pass. The Phase 15 walk
   sample is every major city, the opening-scene places, and one or two
   of each place type.
8. **R8 Renders carry no text.** Renders for the owner and for readers
   carry a scale bar and a north arrow only; piece ids, bearings and
   captions appear only behind `--labels`.

## Addendum (walk 3 wave 2, 2026-09-28): planner rulings R9–R13

9. **R9 The setting-class licence has two axes** (refines R1).
   (i) Interior/exterior is strict for shells, structures and fixtures
   (lights, and any piece 1 m or more in some dimension); small dressing,
   under 1 m in every dimension (kit `sizeM` times the placed scale) and
   no light, is exempt from it. (ii) Social scale: `keep` is exclusive
   (keep pieces never stand in a village, camp or hamlet, and a keep takes
   only keep-licensed pieces); `town`, `village` and `camp` are one
   settlement pool; `ruin` pieces stand only at ruins. A piece whose plugin
   sets no location class (`wild` or unmeasured) is judged on axis (i)
   only. A place's own class is the `settingClass` field of its
   `world/sources/catalogue/type-recipes.json` row (the 16k types 1 and 2
   are `village`); first derived from the rule the gate held in code
   (camp, ruin and martial classes → camp, ruin, keep; major-city and
   free-port families and `-town`/`-city` types → town; else village).
10. **R10 A reserved door on a dwelling, workplace, shop or store parcel
    fails** the `interiors.reserved` gate (use bucket dwelling, work or
    storage, or a trader, shop, smith, lodging or stable service).
    Reserved is legal on tier B/C rows only (R2).
11. **R11 Window glows are emissive only, never a point light.** Lit
    counts step 0/4/8/16 (padded with zero-intensity lights) so the shader
    never recompiles; flame sprites are drawn to 250 m.
12. **R12 Sink rows are measured against the master's ground** when a
    plugin overrides a master reference; the lowest-vertex fallback is
    recorded as `fallback: true` and counted in the miner's report, never
    silently.
13. **R13 Method finding H (a brief generator marking the delta lines) is
    dropped for now:** the briefs share no lines with the type sheets.
    Finding G (the round hand-off state) is delivered: `wb round` writes
    the place's round folder by default, `--waiting-on` writes
    `waiting-on.json`, and the `ownerOkRule` check fails an op accepted at
    git HEAD (`ownerOk`) that changed without a `cause`.

## Addendum 2 (walk 3 wave 2 close, 2026-09-28): planner rulings R14–R30

These are planner rulings on the wave-2 lanes' recommendations (no owner
words were given for them).

14. **R14 Small dressing** (R9 axis i's exemption) is a piece whose largest
    dimension (kit `sizeM` times the placed scale) is under 1.2 m and that
    is no light (`SMALL_DRESSING_M`). This supersedes R9's "under 1 m in
    every dimension".
15. **R15 Vehicles and water craft are class `vehicle`**, exempt from
    axis (i): their mods place them by script. The craft are the
    `watercraft-v1` kit's hulls and oars (its config is the one list; the
    anchor, loose planks and wrecks are no craft); the setting-class miner
    writes `vehicle: true` on their rows and the manifests carry it.
16. **R16 A ruin place takes ruin-licensed pieces plus the pieces of the
    culture that built it:** a village-ruin type (burn-scar, drowned,
    plague-abandoned, Umbriel-stripped village, subsidence hamlet,
    rebuilt-elsewhere footprint) carries `builtBy: village` on its recipe
    row and takes the village pool too. `keep` stays exclusive; R22 opens
    it inside a keep-built ruin only.
17. **R17 A type's `settingClass` follows its kind** (the recipe's class,
    family and type), derived by `place_gates.derive_setting_class`,
    never set by hand: lairs, lone curiosities and wild shrines are
    `wild`; patrol shelters, beacons and holding pits `camp`; keeps,
    forts, prisons and watchtowers `keep` (the last two by R21; every
    other martial type `camp`); ruins
    `ruin`; cities, free ports and `-town`/`-city` types `town`; the rest
    `village`. A `wild` place admits every pool but the keep's. A test
    fails when a row differs from its derivation.
18. **R18 An open-fronted piece with no door that its own plugin places
    outdoors is walked into** (`interior: none`, `walkedInto: true`),
    never `shell` or `promised`: `interiors_index.walk_in_open_front`
    (the Riften stable `rtstables01`).
19. **R19 Sink miner, scaled and shallow-water references.** In the
    whole-population rule a scaled reference is divided by its scale and
    counts; a tree (a TREE base record at least 3 m tall) standing in
    water under 2 m deep counts as on the ground. The full run's
    unit-scale sample still never mixes scales.
20. **R20 Manifest `lodLevels` is the number of LOD levels the GLB
    actually carries** (read from the GLB as the runtime reads it);
    `lodRatios` stays the configured chain. The compile keeps throwaway
    probe kits out by their `probe-` kit id, never by the LOD count, so the
    222 alpha-tested rows built with one level (chickennest01 among them)
    are truthful and still placeable.
21. **R21 Prisons, jails, watchtowers and guard towers are `keep`**. This
    matches the setting-class miner, which already reads `LocTypeJail` and
    `LocTypeGuardTower` as keep. The types are `prison-ruin`,
    `reoccupied-prison` and `watchtower` (`KEEP_TYPES`).
22. **R22 A ducal or fort ruin takes the keep pool** (`builtBy: keep`,
    `KEEP_RUIN_TYPES`). `ducal-ruin` is the one such ruin-class type; the
    forts themselves (`abandoned-fort`) are already `keep`. The keep pool opens only inside that
    ruin place; everywhere else `keep` stays exclusive.
23. **R23 A class licence on axis (ii) needs at least 2 references.** A
    piece placed once holds its setting (axis i) but no class, and the
    gate reports it NOT_MEASURED on axis (ii) (`CLASS_MIN_REFS`,
    setting-class miner version 3; `genericwell01`, placed once at a keep).
24. **R24 A hand row the miner now measures is deleted.** The
    `histflower01/02-sick` rows in `placement-policies.json` were deleted once the
    sink miner resolved texture variants to their base's row.
25. **R25 The Riften stable sits at sink 0.** A reviewed `assetPlacement` row
    (`rtstables01`, designedSinkM 0.0) replaces the mesh-sill fallback (-0.91 m;
    RiftenWorld has no LAND), and the layout carries no hand `y`.
26. **R26 A `work` parcel takes a workplace cell.** `USE_CLASSES` gains
    `work: (smithy, workshop, storage)` (`blueprint_interiors.py`). Claywater's
    store hut is a `work` parcel and takes KeebaHouseSnailMinder.
27. **R27 The stable is walked into.** It has no door record. The keeper's home
    is the station house, and the design brief says so.
28. **R28 A shell's porch face is a run end only when the plugin pairs it in
    at least 2 placements**; otherwise it is optional. At Claywater the barn it
    was raised for is gone, so no place uses it yet.
29. **R29 The `histflower01-sick` sink goes through the miner.** Only its own row
    is re-mined; until the row lands, places use `histflower02-sick`.
30. **R30 Every REQUEST row is closed.** Each row is either applied or answered
    with the rule that refuses it.

## Where each lives

- Gates: `tooling/world-generation/worldgen/place_gates.py`
  (`setting.class` with R9's axes, `interiors.reserved`, `lights.density`,
  `interiors.variety`, the R6 count in
  `breadth.dressingPiecesPerDwellingWithin12mMin`), tests in
  `test_place_gates_0105.py` and `test_place_gates_breadth.py`; the place
  class in `type-recipes.json` (`settingClass`, `builtBy`, derived by
  `derive_setting_class` / `derive_built_by`, R16–R17, R21–R22).
- R23: `worldgen/mine_setting_class.py` (`CLASS_MIN_REFS`) and
  `place_gates.setting_failures` (the NOT_MEASURED line).
- R15: `worldgen/mine_setting_class.py` (`VEHICLE_KIT`, `NOT_VEHICLES`).
  R18: `pipeline/interiors_index.py` (`walk_in_open_front`). R19:
  `worldgen/mine_designed_sink.py` (`TREE_SHALLOWS_M`, `scaled_unit`).
  R20: `pipeline/build_kit.py` (`glb_lod_levels`, `apply_lod_levels`,
  also run by `placement_metadata --refresh-built-manifests`) and
  `worldgen/compile_settlement.py` (`PROBE_KIT_PREFIX`).
- R11: `packages/game-core/src/settlement/lighting.ts`. R12: the
  designed-sink miner (`worldgen/mine_designed_sink.py`; a reference
  outside its parent cell reads the ground and the water of the cell under
  its pivot, `refsOutsideCell`, `refsParentCellWater`). R13 (G):
  `tooling/placement-workbench/wb.py` (`round`, `owner_ok_rule`), its
  README § Round.
- Procedure: the `place-build` skill (step 1 piece choice, § Variety,
  § Interiors, prose, lanterns), `references/doors-interiors-sockets.md`
  §2, `references/reader-checklist.md` (social scale), lessons rows.
- Phase 12's description: `docs/phases/README.md`.

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
   worldspaces, never from the name. The evidence is `settingClass` on the kit manifest
   row, mined by `worldgen.mine_setting_class` into
   `world/sources/placement/kit-setting-class.json` and refreshed onto the
   manifests through the kit-build path: `settings` names each licensed
   setting (interior, exterior) with its licensed classes (`wild` licenses
   the setting and no class), `n` and `sourceCells` are the evidence, and
   a piece its own plugin never places is `unplaced` and licensed nowhere. A place's class is
   its catalogue recipe's `settingClass` (`type-recipes.json`), derived from
   its kind by R17 (`place_gates.derive_setting_class`); R17 maps the
   martial types (keep only for forts, prisons and watchtowers). Gate `setting.class`; a row
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
   count; the house shell, pads and runs do not). R33 names the classes:
   natural references (trees, rocks, wild plants: the frozen world's layer)
   and markers are excluded; crops, steps, porches, doors, smoke, fire and
   clutter count.
7. **R7 Owner calls.** Type 10 stays on the type list. Argonian hanging
   lanterns hang wherever the builder judges they look good (branches,
   arches, eaves, posts), verified by the reader pass. The Phase 15 walk
   sample is every major city, the opening-scene places, and one or two
   of each place type.
8. **R8 Renders carry no text.** Renders for the owner and for readers
   carry a scale bar and a north arrow only; piece ids, bearings and
   captions appear only behind `--labels`.

## Later rulings R9–R55: one table (decision 0106)

The four planner addenda that stood here (R9–R50) and every later ruling
are rows of [`.claude/skills/place-build/references/rulings.md`](../../.claude/skills/place-build/references/rulings.md),
the only home of the place rulings (0106: a ruling is a row, never an
addendum). Addenda 1–3 in full are in git at `961a993f` of this file.

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
- R31: `wb.py` (`scan_fresh_rule`), `workbench/scan.py` (`at`, grid);
  R32: `tooling/repo-standards/build_ledger.py` (`orient_walk`, `rekey`,
  `hand`); R35: `workbench/whatchanged.py`; R36–R38: `place_gates.py`
  (`sink_fallback_gate`, `fitting_cells`, `neighbour_fixtures`); R39:
  `tooling/repo-standards/test_place_build_skill.py`.
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

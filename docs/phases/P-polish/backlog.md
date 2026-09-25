# Polish backlog (Phase P — plan §86)

Rolling list for the general polish pass (docs/phases/README.md, "Phase P"). Add items
freely (owner or agents); one line each, with source and a concrete "done"
test. Remove items when shipped. This file is the single place deferred
cosmetic/feel work lives — do not park polish items in decision docs.

## Absorbed into Phase 16 (2026-09-11)

The terrain, chain, water, vegetation, route, plot and settlement rows that
used to sit in the table below are now owned by Phase 16's chunks; the list is
[the plan's §9](../16-foundation-and-places/README.md), and the evidence
behind each is in `docs/research/phase16/`. The bullet rounds further down
("Owner feedback round 2026-09-06", "Owner rulings 2026-09-09") are likewise
absorbed except where a bullet is genuine polish (sky palette, moon glow,
weather, foliage translucency, combat, characters, region tooltip). Do not
re-add an absorbed row here; act on it in its chunk.

| Item | Source | Done when |
|---|---|---|
| Test: `tooling/world-generation/worldgen/test_export_settlement_bundle.py:1091` asserts the checked-out `apps/world-studio/public/province/settlements.json` is exactly `0o644`; under the codespace umask it reads `0o666` and placement preflight goes red. The exporter already sets `0o644` on what it writes (`export_settlement_bundle.py:182`, and :1415 for kits; :1090 passes), so the file's mode on disk comes from the git checkout, not the exporter. Fix in the test: keep :1090 (the exporter's own write) and change :1091 to assert the published file is world-readable (`mode & 0o444 == 0o444`), or drop :1091 | 16k slice 1 Starting state (combat r7 `preflight --paths`, 2026-09-25) | the test passes on a checkout made under umask 0 and still fails if `_atomic_json` stops calling `os.chmod` |
| Water (sailing phase): dispersive iWave wake field — replace the 64 m non-dispersive `RippleSim` wave-equation patch with (or add beside it) a ~500–700 m camera-centred field convolved with Tessendorf's iWave kernel, so hull wakes disperse into the feathered Kelvin shape; bow + stern generators stamp swept paths (`RippleSim.addPath` / `FoamField.injectPath` already take segments); wake foam deposited where the field's `\|∇h\|` exceeds a break threshold into the persistent foam field (`render/FoamField.ts`) | Greenheck study §1.4, §3 row 9, §6 "Interaction, later boats" | a sailed hull leaves a Kelvin wake with a foam trail that persists and drifts; calm wakes cost nothing |
| Water (sailing phase): five-point buoyancy for hulls — sample the wave height at centre, bow, stern, port and starboard of the hull's bounding box (`surfaceWaveAt`, the CPU twin) and derive pitch/roll with separate height and rotation smoothing times; `rigidBody.ts` keeps single-point bobbing for crates | Greenheck study §1.8 "Buoyancy", §6 | a boat pitches into swell and rolls on a beam sea; crates unchanged |
| Water (sailing phase): water masking for dry hulls — render simplified invisible hull-interior mask meshes to a screen-space texture with an override material and discard water fragments (surface AND underwater fog) inside them, so a boat's hold and deck well stay dry | Greenheck study §1.8 "Masking", §6 | standing in a boat's well shows no water inside the hull from any angle |
| Water: symmetric impact-speed spray probes — emitters own probes in object-local space; each frame a probe crossing the DISPLACED surface from above fires a plume when the vertical convergence speed of probe and surface exceeds a threshold (~3.9 m/s). Symmetric, so a wave rising onto a rock, pier, mangrove root or the wading player produces the same plume as a hull falling onto still water; feeds `WaterEffects` billboards with bottom-fade | Greenheck study §1.5, §3 row 10, §4 (4), §6 | spray on rocks in surf and rapids and at waterfall lips once the Phase 10 rock scatter lands; a dropped crate and a wave on a piling look alike |
| Water: shoaling wave geometry — refract the deep-water bands toward the shore normal and steepen them by depth (Water Pro's per-vertex shoaling), so breakers read as waves rather than a rising level; 16c round 2 added oblique crests, energy scaling and a Stokes front only (owner: acceptable for now if it can be added later without disturbing anything) | [16c round-2 ledger §4](../../research/phase16/16c-round-2-ledger.md) | a breaker on the beach has wave shape: crests bend toward the shore and steepen before they break |
| Region raster reclassification (map tooltip coarse regions vs 8b water truth) | 8b round 5 §9 | tooltip region shapes match rendered water |
| **Weather/atmosphere: owner-reserved leftovers from the 8c close** — the owner closed 8c good-enough (2026-08-30) and will record the specific items here themselves | 8c close | owner has replaced this row with concrete items (or struck it) |
| Weather: mountaintop cap cloud (whiteout regime 3) — DISABLED 2026-08-30 (owner: hard square edges seen from ground level, a belt-mask raster-resolution artefact). Re-enable via `WHITEOUT_ENABLED` in `world-weather/express.ts` after rebuilding it properly (higher-res/softened mask sampling or a real cloud body) | owner request 2026-08-30 | cap cloud back on with no square edges from any camera |
| Weather: volumetric clouds high tier (takram three-clouds spike behind a flag — research doc §2.1 caveats: ECEF frame, postprocessing pipeline vs our envelope-pinned dome) | 8c deferred (0032) | storm anvils/cumulus read volumetric on the high tier, base tier unchanged |
| Weather: god rays / light shafts through canopy | 8c deferred (0032 §9) — needs Phase 10 canopy geometry first | sun shafts under the jungle roof at low sun |
| Weather: screen-space crepuscular god rays at cloud/mountain edges (GPU Gems 3 ch.13 radial blur; concrete recipe + template links in research doc §8.4) | 8c round 1 feedback, owner allowed deferral | visible rays past cloud edges/ridgelines at low sun, both canvases, no perf regression |
| Weather: rain-occlusion top-down depth map (Lagarde) + ground splash sprites | 8c deferred (0032 §6) — needs placed canopy/buildings to occlude under | drops vanish under real cover; splashes at hit points |
| Weather: screen-space lens droplets during squalls (third-person, tasteful) | 8c deferred | brief droplets on the camera in driving rain |
| Weather: thunder audio (distance-delayed crack + rumble tail) | 8c → module 57 (Phase 12b owns all audio) | flash→delayed thunder at 3 s/km |
| Physics mass-unit scale cleanup (ecctrl capsule ~0.25 units vs real-mass props) | 8b round 6 §5 | one consistent mass scale; Phase 9 boats depend on it |
| ~~Combat `10b`: shield parry uses the weapon parry~~ — **done 2026-08-31.** A shield now parries with its own shield-bash clips (Rim Parry's SHD set), on its own catch window, selected by `activeGuardAnimations`. Remaining owner taste question, if any: whether a *small* shield should parry differently from a tower shield | owner question 2026-08-30 (decision 0038) | shipped; row kept only until the owner has seen it |
| Kit rebuild: the underwater kit's 9 rocks still ship decimated levels against 0071 (`python -m pipeline.kit_lod_audit`: rock 9 assets, 8 with identical levels, distinct mesh levels 1:5, 2:3, 3:1). The CAUSE is fixed — `lodRatiosByCategory rock: []` is now in `pipeline/config/kits/underwater-v1.json` (16h lane C, 2026-09-22) — so only the artefact is stale | 16f round 5 (0075 §3–4); cause fixed 16h | rebuild + recompress underwater-v1 at the next kit build (deferred out of 16h only because a rebuild rewrites the published manifest the 16h placement-metadata lane is writing in the same tree); bytes only, no visible change |
| Chain order gate: eight `warn: order:` lines — stages that read an artefact a LATER stage in the same run rewrites, so they read the previous run's accepted output (`worldgen/chain_contracts.py` `WRITES` / `stale_ok`). `apply_terrain_patches` ← `province/route-structures.json` (16k carried 16h item 13 turns pads and windows into patches); `solve_major_routes` ← `refined/meta.json` and ← `routes/registry.json`; `grade_routes` ← `routes-minor.json` and ← `routes/route-structures.json`; `derive_crossings` ← the catalogue; `author_route_structures` ← `travel-services.json`; `rederive_blueprints` ← `province/places.json` (16h) | 16g deliverable 0b, 2026-09-19 | each edge closed when its owning stage is next touched (the 16k slice that takes carried 16h item 13 for the settlement one); `./scripts/terrain-chain.sh --check-contracts` prints no `warn: order:` line |
| `site_fields.sample().hydrology.heightAboveWaterTableM` is unusable as a wetness test: it reads −5 to −14 m at dots 200–300 m above sea level (`place.imperial-fringe.glenbridge` −9.23 m at 226 m elevation; `the-drowned-furrow` −5.65 m at 305.8 m), because the refined `water_level` raster is sampled planar-wise outside any water body. Any check written on this field cannot fail correctly. Mechanism: derive the height above the water table from the nearest recorded body/reach level along the drainage path, not a planar raster lookup. File: `tooling/world-generation/worldgen/site_fields.py` | [16g review, imperial-fringe.md:20, :309](../../research/phase16/16g-review/imperial-fringe.md) | a 200 m hilltop reads positive; a test in `worldgen/` asserts it; the two dots above read positive |
| `place.naga-kur-deeps.air-pocket-station-deeps` carries two live depths for one dot — the graded bake reads 1.6 m, `survey.recorded_depth_m` reads 7.75 m — so the compiled depth grid and the place record disagree and either number can be quoted. Mechanism: one reader (`record_depth_grid`, the compiled depth) feeds both the record and the bake check | [16g review, naga-kur-deeps.md:133, :143, :317](../../research/phase16/16g-review/naga-kur-deeps.md) | the record's depth equals the compiled depth at its dot, proved by a test over every place record carrying `recorded_depth_m` |
| `plotFacts.water.distanceM` is planar only: 45 of 120 imperial-fringe records name a water body 30 m or more above or below their dot (max +292 m at `castle-giovesse`), so "beside water" prose is written against a fact that the field cannot support (standard 12). Mechanism: report the level difference beside the distance in the fact block and let the plot solver's `nearWater` weight it | [16g review, imperial-fringe.md:19, :312](../../research/phase16/16g-review/imperial-fringe.md) | the fact block carries a level delta and no record's `nearWater` scores a body outside its vertical band |
| The chain contracts name no `.npy` array, so the cascade cannot see a stage that mutates the heightfield or the water rasters: every entry in `WRITES` (`tooling/world-generation/worldgen/chain_contracts.py:668`) is JSON or a directory, while `cascade_from` (:810) can only follow those, so `terrain_request_postconditions`, which reads arrays, can still only be placed by hand. Mechanism: every stage that writes an array declares it in `WRITES` (path form for the vault and `output/*.npy`), after which the order gate (:716) and the cascade each cover it. | decision 0080, 16g chain rework 2026-09-19 | `cascade_from('apply_terrain_patches')` includes `terrain_request_postconditions` by declaration, not by position |
| Terrain: the published terrain-request plan is republished only by a frozen stage (`terrain_requests`), so six requests withdrawn by 16g still stand in `apps/world-studio/public/province/refined/terrain-request-plan.json`; the postcondition gate reports them as `withdrawn` rather than failing (`worldgen/terrain_request_postconditions.py` `withdrawn_request_ids`). | 16g, 2026-09-19 | The plan is republished at the next refreeze and the postcondition report carries no `withdrawn` rows. |
| Preflight gate `rasters` and the standard-6 check in `npm test` are red on `main`: `apps/world-studio/public/province/rasters-manifest.json` reports group `refined` differing from the built rasters (e.g. `refined/ground-control.png`) because the rebuild was never published — the 16g rule holds `province:publish` for push day, so every preflight until then fails a gate unrelated to the diff under test. Mechanism: run `npm run province:publish` on push day, or teach the gate to tell "held for push day" apart from "forgotten" | vegetation lane preflight, 2026-09-21 | 16g/16h lane: the published manifest matches the built rasters, or the gate names the held-for-push-day state instead of failing |
| Vegetation: the shipped track-clearance receipt (`vegetation-patches-receipt.json`) is stale: it predates the round-1 16h stage fix that records `prePatchInstanceCount` and keeps `reRuns`, so it still reads "0 removed" although the shipped bundles are pruned (16h ledger §3 step 0). Mechanism: the next scatter run rewrites it | 16h part 1, 2026-09-23 | the shipped receipt carries `prePatchInstanceCount` per run and a non-zero removed count where hard-clear polygons had plants |
| Kits: assets under the 300-triangle floor in flora-province-v1 (41), groundcover-province-v1 (78), waterfall-fx-v1 (26) and 25 more in underwater-v1 still ship a one-tier ladder from the old skip rule; `plan_lod_levels` (16h round 4) fixes it at the next rebuild of each kit. Mechanism: `python3 -m pipeline.build_kit --kit <id>` then `kit_compress` | 16h part 1, 2026-09-23 | every published kit asset carries the full ladder (shared primitive where decimation collapses) and the runtime LOD-contract test walks all kits |
| Kits: the connectors sidecar (`*.connectors.json`, 16h lane C) records co-placement NEIGHBOURS, not joints: a 1 m window carries 61 "connectors" up to 5.1 m away. Audit the miner's rule before anything reads connectors as snap joints | 16h renderer lane, 2026-09-23 | a connector is a face-to-face contact between two pieces (the mesh-contact miner's `abuts` is the model), and the window carries only its wall |
| Build: both Vite build plugins resolve `outDir` with `join(root, outDir)` (`packages/basis-transcoder/plugin.mjs:49`, `packages/character-assets/plugin.mjs:86`), so an absolute `--outDir /tmp/x` lands inside `apps/world-studio/tmp/x`. Mechanism: `resolve(root, outDir)` in both | 16h tooling lane step E, 2026-09-23 | `vite build --outDir /tmp/x` writes to /tmp/x and the plugins' `closeBundle` outputs land beside it |
| Tooling: `mine_mounts.py` materialises every exterior and interior cell with all refs (`list(...)`, ~6 GiB peak); stream cells instead (16h ledger §6 row 6), output byte-identical | 16h tooling speed lane, 2026-09-23 | a full re-mine peaks under 2 GiB and `kit-mounts-mined.json` is unchanged by the refactor |
| Tooling: render stamps key on each kit GLB's `st_mtime_ns` and size (`tooling/asset-pipeline/pipeline/render_assembly.py:856-864` `assembly_stamp`), so any kit rebuild, even a byte-identical one, re-renders every template of that kit (635 kit-sheet PNGs over ten kits in part 1). Key the stamp on the GLB content hash | [16h catalogue audit](../../research/phase16/16h-catalogue-wide-steps-audit.md), 2026-09-23 note 1 | a no-op kit rebuild re-renders zero sheets; a changed GLB re-renders only its templates |
| Tooling: `mine_designed_sink.py` has no `--assets` selector (`:406-412`, only `--kits-dir`, `--complete-only`), so a golden sample cannot run on it, and its manifest writer rewrites whole manifests (once clobbered 64 sink values, 16h ledger §3 round 5). Add `--assets` like `mine_mounts.py:971`; the writer touches only the named fields | [16h catalogue audit](../../research/phase16/16h-catalogue-wide-steps-audit.md), 2026-09-23 note 1 | `--assets a,b` mines only those; a manifest diff after a run touches only the mined fields |
| Settlements: blueprint `whyNeighbours` prose carries hand-measured distances that go stale when a footprint moves. K12 C re-measured three in `world/sources/blueprints/place.fixture.proving-ground.json` (stilt stair 8 → 12 m, wall run 13/25 → 12/23 m, imperial house to mud hut 12 → 11 m). Mechanism: `compile_settlement` computes the edge gaps from the laid footprints (`blueprint_footprints`) and writes them into the compiled record; the prose names neighbours and reasons, never metres | 16h round 7, 2026-09-24 | no metre figure in any blueprint `whyNeighbours`; the compiled settlement carries each parcel's neighbour gaps, and a moved footprint changes them with no prose edit |
| Site build: `site:compose` prints `compose: kit sidecars 0.0 MB (0 B) of the kept kits` (`/tmp/wf/round6/k12/site_compose.log`) although two of the five kept kits, `waterfall-fx-v1` and `underwater-v1`, have `.connectors`/`.footprints`/`.interiors.json` in `apps/world-studio/public/kits/`. The count at `tooling/pages-site/compose.mjs:181` walks the composed `kits/` dir. Mechanism: trace where the composed site loses the sidecars (the copy or the prune) and make compose fail when a kept kit's sidecar is missing | 16h round 6, 2026-09-24 | the composed site carries every kept kit's sidecars, the line reports their size, and a test fails when one is removed |
| Sourcing: seven NIFs the mount miner needs are not in the vault (16h ledger row "M18 miner"): `_resourcepack/…/treebaldcypress02`, `treebaldcypressknee02`, `treewhiteelephantpalm02` (SSE `_ResourcePack.bsa`); `dlc02/…/dlc2telvannirootbridge01` (`Dragonborn.bsa`); `architecture/cyrodil/cyrlctavern`, `farmhouse/farmwall01`, `farmwallentrance02` (absent from the vault's LE `Skyrim - Meshes.bsa`). Mechanism: add the SSE vanilla, resource-pack and DLC archives to the vault with source and hash in the sourcing log, then re-run the mounts miner | 16h M18, 2026-09-24 | `meshesMissingIds` in `kit-mounts-mined.json` is empty after a full mounts run |
| Settlements: the base seam has no terrain blend. The base skirt (`packages/game-core/src/settlement/SettlementLayer.tsx` `treatmentMesh`) is one flat tone faded by vertex alpha, and the rock-pile ring (`apps/world-studio/src/vegetation/Groundcover.tsx`) only breaks the line; the ground texture never climbs the wall foot (`docs/research/rendering/building-placement-rendering-treatments.md` §2, 2026-09-23 state; option 1 of the 2026-09-23 seam research). Mechanism: that option, a terrain height-blend shader at the wall foot, delivered by the 16k slice that takes carried 16h item 25 (16k checklist Gate row "Ground-to-wall blend") | 16h K6 seam research, 2026-09-23; queued in K14, 2026-09-24 | at the check-in 2 yard walk's building feet the ground texture runs up onto the wall with no hard line, on every culture's kit, with no extra draw call |
| Tooling: no recorded timing for `interiors_index` (all 23 kits), a full `mine_mounts`, `rederive_blueprints` per place and `export_settlement_bundle` (absent from 16h ledger §6 and `tool-timings.jsonl`, 18 runs). Run each once under `memwatch.sh` and record seconds and peak anon | [16h catalogue audit](../../research/phase16/16h-catalogue-wide-steps-audit.md), 2026-09-23 | four rows with seconds and peak memory in 16h ledger §6 / `tool-timings.jsonl` |
| Site: `apps/stats-lab` (stats-lab lane, 0088) is not in the Pages site; `tooling/pages-site/compose.mjs` is Phase 16's (16k's) file while 16k runs. Add the lab (built with `base: "./"`, so any subpath works) as one more composed app | stats-lab lane round 3, 2026-09-24 | the deployed site links the lab and `npm run site:compose` builds it |
| Determinism: `npm test` standard 6 is red at HEAD on `tooling/asset-pipeline/pipeline/vault_inventory.py:559,563` (`time.time()` feeds `elapsed`, which `render_md` writes into the generated inventory, so two runs differ). Mechanism: print the timing to stderr only and keep it out of the written record, or allowlist it in `tooling/repo-standards/allowlist-determinism.json` with that reason | 16k lane E docs sweep, 2026-09-25 (`node tooling/repo-standards/check.mjs`; introduced by 4eed107c) | `check.mjs` reports no standard 6 line |
| Combat: foot-driven attack motion reads the clip's ground track on the unscaled clock (`footAnchoredVelocity(state, actionTime)`: actionTime × playbackRate) while the pose plays on the class clock (`anim/clipTiming` in `SkyrimFighter`), so the feet slide by the class's speed error wherever speedScale differs from its moveset reference (dagger 0.74: the track is read 26 % behind the pose; the heavy two-handers' ×0.85 swing adds the same error in the swing) | combat-sandbox lane round 2, 2026-09-24: passing `attackClipTiming(attack)` fixed the clock but failed `riposte-stab` (dagger riposte into SWORD_IDLE: weapon tip 0.97 m in one frame, pelvis yaw snaps at 3.633 s) and moved 238 baked reaches by up to ±0.37 m; reverted | one clock for pose and track (`footAnchoredVelocity` takes the clip timing, `weaponReachBake.ts`'s motion line moves with it, weapon-reach re-baked), with `riposte-stab`, the `attacks` and `reach` groups green |
| Combat: the player's attack step shoves enemies — the player's foot-driven attack travel has no contact stop, so a forward-stepping attack (DW_POWER_LEFT at 1.0 m) pushes the enemy's capsule a metre back before the contact window opens; enemies already stop at `ENEMY_CONTACT_STOP_DISTANCE` (`enemyStep.ts`) | combat-sandbox lane round 3, 2026-09-24: `dual-wield-attack` telemetry, warden head x 0.37 → 1.82 m during the swing | the player's forward track stops at the same contact distance, with `dual-wield-attack` passing at 1.0 m and the attacks group green |
| Tooling: a partial reference build drops the female hurtbox — `python3 -m pipeline.build_races --only dunmer-male` rewrites `rig-skyrim-humanoid.animations.json` without `hurtbox.female` (only a female reference build writes it) | combat-sandbox lane round 3A, 2026-09-24: restored by hand from HEAD | `build.py` carries the existing female block forward when no female reference is built, with a test |
| Combat: a crossfade from an airborne-support clip into a grounded one switches floor correction off while the controller lags a slope (swim exit onto a ramp: 4.6 cm mesh penetration; a landing on a ramp would do the same) | combat-sandbox lane round 5, 2026-09-24: swim-cross run 3 | floor correction stays on through such a crossfade, with swim-cross passing on a ramp exit and the airborne group green |
| Contracts: `WaterSample.immersion`'s doc (packages/contracts/src/index.ts:350) does not say what the query position means; WaterWorld reads it as the TOP of a 1.7 m body column (callers sample at feet + 1.7 m) | combat-sandbox lane round 5, 2026-09-24 (0093 §3) | the doc comment says so |
| Tooling: three readers of `Tropical Skyrim.esp` hold records mined from v1.0; the vault's `extracted/` took v1.1 on 2026-09-24 (update readme: "Fixed objects that still had snow on them", tree collision fixed) | Tropical apply, 2026-09-24 (sourcing log, Tropical Skyrim section) | re-run `tooling/world-generation/worldgen/asset_registry.py` (reads the plugin at :118), `worldgen.mine_groundcover` and `worldgen.mine_micro_siting` on a sample first, diff against the v1.0 records (the v1.0 plugin is `extracted/Tropical Skyrim.esp.v1_0`), then run once |
| Bootstrap: snapshot `mod-sources/tropical-skyrim-33017` (`tooling/bootstrap/snapshot-manifest.json`:971–999) predates the 2026-09-24 vault changes (v1.1 plugin and two trunk meshes, `*.v1_0` copies, `textures/cubemaps/glacierice_e.dds`, `Readme-v1_1-update.txt`, `extra_1000016119.bin`) | Tropical apply, 2026-09-24 | re-snapshot that one folder (and its `.archives` part) in the next R2 push so a fresh machine gets the same files |
| Tooling: decision 0098 §2 rule 2 (no snow, frost, ice or Nord-motif texture) is checked only by filename over each family's own texture folder (`docs/research/archive/building-depth-2026-09/rule2-texture-flags.tsv`); a mesh sampling `textures/landscape/snow*` or an `*ice`/`*snow` map passes unseen | Tropical apply, 2026-09-24 (breadth doc §2) | `build_kit` (or `vet_kit`) reads each built piece's resolved texture paths and fails the kit when one matches snow, frost, ice, glacier or the flagged Nord-motif list, unless a `textureAliases` entry re-points it |


`worldgen/test_blueprint.py::test_live_dir_validates` was red on the five 2026-09-09 blueprints; since 16h part 1 (2026-09-23) those blueprints are fixture replays and the test reads their `fixtureWaived` findings from the published bundle (decision 0085 §5), so the known-red register is empty and 16i's re-authoring clears the waivers themselves.
## Combat (added 2026-08-31, from the parallel combat pass — decision 0040)

- **Foot-anchored locomotion is player-only** (round 7, 0040 §36). Locked-on
  strides (1.35×) and the crouch move on their clips' own feet; enemies
  still drive their strides through the controller with cadence scaling.
  Extending the same rule to enemies is a small change once the owner has
  judged the feel on the player.

- **A bow downloads a sword's moveset.** `BOW_ANIMATIONS` borrows the
  one-handed set for the clumsy bash a bow makes when swung, so the `bow`
  animation pack has to depend on `oneHanded` (and through it `criticals`) —
  about 3 MB an archer fetches for a fallback swing. The fix is to let a weapon
  declare that it has no melee and have the combat FSM refuse the input, the
  way it already refuses a guard with a bow raised, rather than borrowing
  clips. Touches the non-optional melee fields of `WeaponAnimationProfile`.
- **Visual scenarios that open with an input pressed inside one sampling
  interval fail intermittently.** Several scenes press their first cue 0.05-0.15 s
  in, which is fewer than the three rendered samples the animation-path check
  demands of a run, so their opening idle is a coin flip under machine load
  (`light-chain`, `guard-defense`, `roll` and `greatsword-locomotion` were all
  seen flipping in round 4; the first three were widened one at a time). The
  proper fix is a harness-level lead-in — a fixed offset applied to every cue
  and every scenario duration — rather than nudging scenes as they are noticed.
  Done when a full suite run passes twice in a row on a loaded machine with no
  per-scene timing tweaks left in the file for this reason.
- **`heavy-chain` ground-correction overshoot.** The grounding solve moves the
  actor at 2.03 m/s against a 2.0 limit. Pre-existing rather than introduced by
  round 4 — it measures 2.096 on the commit that round branched from, and the
  HEAVY_2 re-measure improved it — so it wants its own look rather than being
  folded into an unrelated pass. Done when the gate passes without raising the
  threshold.
- **Per-weapon riposte clips — dagger stabs, sword lunges** (round 7, 0040
  §34). `RIPOSTE_STAB` is the dagger class's riposte; the one-handed sword
  keeps the authored CQC02 lunge; the battleaxe keeps its swing. Left: the
  other ten Rim executions (below) as each family gets a moveset.
- **Light-attack reach against a guard moved with the guard clip's origin**
  (round 6). Before the guard clips were recentred, the player's LIGHT_1
  registered on a guarding enemy at 1.74 m; after, only at 1.2 m (not at 1.54
  or 1.74). The recentring moved the guard mesh 18 cm *toward* the attacker,
  so by geometry it should have got easier. Something else in the hit
  registration — the measured contact window being a time window rather than
  a swept volume is the suspect — depends on where the target stands. Worth
  one focused look with the weapon-volume overlay before any reach tuning.
- **A swing critical's anchor release steps the weapon tip** (round 6). At
  the end of `greataxe-riposte` the world weapon tip moves 0.37 m in one frame
  while every pose-relative bone step is a centimetre: the capsule is released
  from the critical's anchor, not the pose. The scene's limit is 0.4 for now;
  the fix is in the release, not the limit.
- **The remaining ten per-weapon executions.** The greatsword and battleaxe now
  have their own; Rim Parry ships thirteen (dagger, mace, spear, four shield
  variants, unarmed, dual and the one-handed one we already had). The blocker is
  gone — `measure-contact-windows.mjs --critical` is validated against the
  hand-audited one-handed execution and its header documents the four-step
  procedure — so each additional family is now roughly an hour, gated on that
  family having a moveset at all. Not urgent: nothing else has a moveset yet.
- **Per-weapon backstabs are assembled, not authored.** Vanilla has exactly one
  back-facing paired killmove (the 1hm one we use); its per-weapon killmoves are
  front-facing finishers, and the "backstabs for all weapon types" mods re-point
  existing killmoves through an ESP rather than shipping new animation. Round 4
  therefore assembles them: a thrusting class plays its own execution, a
  swinging class plays its own opening light attack, and both use a shared
  from-behind victim reaction (`movesets/criticals.ts`). Revisit only if a
  genuine per-weapon back-facing paired source turns up.
- **Contact windows for the one-handed set.** The measuring tool is fixed and
  now reproduces the calibrated LIGHT_1/LIGHT_2 windows to within a frame, and
  the two-handed set has been re-measured off it. LIGHT_3, HEAVY and HEAVY_2 on
  the one-handed set still differ from what it measures; those are
  owner-calibrated feel and were left alone. Worth one deliberate comparison
  playtest rather than a silent retune.
- **Two-handed heavy chains are unaffordable.** `heavy` into `heavy2` costs
  about 130 stamina against a 100 bar, so `GREATSWORD_HEAVY_2` and
  `GREATAXE_HEAVY_2` are built, wired and unreachable (recorded as animation
  exclusions). Either the chain should be affordable or the second heavy should
  not be chain-only — an owner/10c call, not a quiet stamina retune.
- **Poise numbers are provisional** (module 76 §121.3 says so explicitly).
  `poisePerArmourRating` is the one most likely to move; the debug panel's
  Poise switch and the HUD bar exist to make the comparison cheap.
- **Enemy AI does not plan for honest feet** (2026-09-04, round 6, 0040 §28).
  Swings now carry the body along the clip's whole sole track — the
  one-handed HEAVY_2 steps back 0.58 m in its wind-up, the HEAVY pivots 1.8 m
  to the right — and `weaponTactics` still decides attack range from the
  authored `range` alone, so an enemy inside its lunge threshold can commit a
  swing whose feet walk it out of reach. Fix in the AI, not the feet: fold the
  track's displacement at contact into the effective range per attack.
- **Locked-on speed now follows the strafe clips** (round 6, 0040 §29; was
  "still scrub slightly at full stick"). Locked-on WALK / WALK_BACK / strafes
  move at their authored ~0.7–0.9 m/s behind the "Locked-on speed follows the
  strafe clips" switch (default on); off restores the 3.0 m/s locked walk with
  scaled cadence. Owner to judge which stays; if the slow one, sourcing faster
  strafe clips is the way to a quicker locked pace, not a speed number.

## Owner feedback round (2026-09-06) — the water bullets below are absorbed into chunk 16c (plan §9); struck, kept for the record

Sky, water, weather, geography, camera, terrain dressing and combat items the
owner raised in one pass. Not triaged/sized yet — treat as raw backlog.

- **Sunrise/sunset sky palette has a greenish tinge.** Sunrise starts nice but
  transitions to darker, too-red/greenish colours; sunset does the reverse
  (greenish first, nice colours after). Owner wants a tropical palette
  throughout the transition — pinks, purples, coral, coral-orange, golden —
  and not too red either.
- **Tropical Skyrim has better vertical-face textures and marsh textures**
  than ours — see the mod's own screenshots (staticdelivery.nexusmods.com
  mods/110, images 33017-1 and 33017-5). Worth a texture-swap pass on cliff
  faces and marsh ground.
- **Glow around moons** — reference: the "Elysium" three.js showcase thread
  on discourse.threejs.org (t/55541) has an example of moon glow to draw on.
- **Rivers on slopes still don't render well** — there's already research on
  this in docs, but it hasn't been successfully implemented.
- **Water/player interaction physics is weak** compared to the Wallace-based
  three.js water demo referenced elsewhere in this backlog (row 1) — same
  interactive quality is wanted, plus foam/particle splashes on impact and
  fast movement (three-nebula or ShaderParticleEngine again as candidates).
- **Ocean waves breaking on the beach** — no surf/break effect currently;
  Babylon.js forum thread on realistic beach surf has ideas worth stealing
  (forum.babylonjs.com t/58664 post 11).
- **Study "Three.js Water Pro" — Dan Greenheck's dev blogs** (and any video
  transcripts findable) as a reference for our water rework generally.
- **Coastal geography needs the same treatment mountains got** — more drama
  and variety in coastline shape, following whatever process improved
  mountain geography.
- **Weather should be local, not province-wide** (clouds, rain) — owner isn't
  sure this is actually needed; flag for a design call before building it.
- **~~Land beyond the province's north/west borders is empty~~ → absorbed into 16d.** Continue the
  all-Tamriel heightmap past our edges so terrain reads as continuing
  smoothly into the distance (fading/hazing over a horizon distance), while
  still hard-blocking the player from walking past the province boundary
  (invisible wall + a message).
- **Replace rain with a more realistic effect** — reference:
  boytchev.github.io/etudes/threejs/ghosts-in-the-rain.html or similar;
  drops should bounce off / flow around surfaces realistically.
- **Rain-patch edges are too hard** — weather patches passing over the
  player are fine, but the boundary of a rain patch is a visible sharp edge;
  wants softening.
- **Lowland mist/sea-fog has a visible hard straight edge** when viewed from
  altitude in the mountains on a clear day, making the coastline look
  artificially squared off. (Possibly the same raster-mask root cause as the
  disabled mountaintop cap cloud, row 19 above.)
- **Mountain cap cloud — try again properly**, this time perhaps as real
  volumetric clouds; reference: "Universal Planetary Volumetric Cloud
  Atmosphere Engine" thread (discourse.threejs.org t/89553). Related to the
  disabled whitebout regime-3 cloud row above (row 19) — same underlying ask.
- **Foliage between camera and player should go translucent** when it
  occludes the player, the way BOTW/TOTK handle camera-blocking vegetation.
- **Water ripples leak between unconnected pools** — CLOSED 2026-09-07: the
  body-isolating ripple simulation kept from the overhaul (`render/RippleSim.ts`
  + `rippleIsolation.ts`) blocks land and unrelated bodies; owner check pending.
- **Volumetric mist that pools in valleys**, visible from outside the valley,
  lit with real colour shining through and scattering/dispersing — owner
  recalls a specific Reddit post with a good reference example, to be found
  again.
- **Running attacks** — nice to have if suitable animations can be sourced;
  not a blocker if not.
- ~~**Trees/plants look stark growing straight out of bare rock in mountainous
  terrain.**~~ ABSORBED into 16f, delivered 2026-09-16 (woody layers gated off the cliff classes; an under-canopy litter mask in `ground-tint.png` alpha blends rock to litter under trees; [ledger](../../research/phase16/16f-ledger.md)). Consider terrain texture painting so ground under trees in rocky
  areas reads as "rock with leaves and dirt on it" rather than bare rock.
- ~~**Small plants/bushes sometimes read as placed in ordered rows/grids**~~ ABSORBED into 16f, delivered 2026-09-16 (measured: a single giant tree stood on a jittered grid, now clumped; a bearing-peak check joined the scatter tests),
  looking cultivated rather than wild — placement jitter/distribution needs
  a look.
- ~~**Hanging root tree decorations are still appearing**~~ ABSORBED into 16f, delivered 2026-09-16 (the vines and moss hung in the air because the composition accepted an older collision frame than the kit ships; fixed at the root, every piece now touches its trunk).
- ~~**Consider more rock/boulder placement outside the uplands/mountains**~~ ABSORBED into 16f, delivered 2026-09-16 (the Rockpark stones dressing zone on the Gideon–Soulrest coast; lowland boulders at 3 /ha on firm covers; candidates for Phase 15 in the ledger) —
  candidate lowland areas for a maze-like boulder region (climbable rocks of
  varying size, with nooks/crannies for loot), similar to boulder regions in
  other open-world games. Needs a map survey for viable spots plus research
  into what such regions usually contain.
- **Weapon movesets are still coarse** (vanilla's three broad categories:
  one-handed, greatsword, greataxe/hammer). Source more granular per-weapon
  animation sets from a highly-rated mod within those categories.
- **Dual wielding** — not yet decided/scoped, raised as an open question.
- ~~**Uplands/mountains feel too bare on terrain dressing**~~ ABSORBED into 16f, delivered 2026-09-16 (dead shrubs, tundra shrubs, mountain flowers, logs and stumps at the vanilla calibration; rock piles and cliff pieces; rock grass on mountain rock). Needs research: what dressing is appropriate, what's available
  in our current assets/mods/vanilla, and how other open-world games dress
  mountain terrain.
- **Deterracing could be smoother** — visible terracing artefacts remain.
- ~~**Grass coverage**~~ ABSORBED into 16f, delivered 2026-09-16 (measured at five sites before and after; floors per region and land cover; the ring rebuilt).
- ~~**Waterfall sides need rocks.**~~ ABSORBED into 16f, delivered 2026-09-16 (2–4 wet boulders against each side of every fall's lip and a ring round the plunge pool, from the cascade record). Sheet edges read wrong where they meet bare
  terrain; scatter boulders tight against every compiled cascade lip/side
  (`water-meta.json` `cascades[]`) in the Phase 10 scatter compiler. Varden
  recipe, research/rendering/waterfalls-realtime.md §6.
- **The argonian-stilt open-water share is applied to districts that stand on
  dry high ground.** `flood_band_report` (worldgen/compile_settlement.py) asks
  every `argonian-stilt` district to put 15–30% of its buildings over open
  water. Lilmoth's `council-crown` (the 11–13 m bench) and `hist-court` (the
  crest at 19–23 m) measure 0 open-water, 0 flood-band and 0 wet-season samples
  on almost every building, so the rule cannot be satisfied where the record
  puts them: it is the rule's scope, not the placement, that is wrong. Both are
  registered as settlement-owned rows in
  `world/sources/settlements/settlement-warning-known-red.json`; the register
  reports them by name on every export and fails if either quietly starts
  passing. The fix is a rule-scope decision (which district kinds, or which
  measured ground, the share applies to) and wants an owner steer.
- **`works-quays-flood-section` is applied to works that stand nowhere near
  water.** Same function, same shape of defect: `flood_band_report` asks every
  parcel whose `use` is in `FLOOD_SECTION_WORK_USES` to touch open water, the
  flood band or wet-season inundation. That is a quay rule. The licensed
  tapping camp (`place.hist-heartland.sap-tapping-licensed`) is a works camp on
  a jungle terrace at 30.7–32.7 m whose own siting record measures the nearest
  canoe water at 370 m and berths the landing separately; its stage, deck,
  stair and mule line all measure 0/0/0 and cannot ever pass. Four
  settlement-owned rows are registered in
  `world/sources/settlements/settlement-warning-known-red.json`. The fix is the
  same rule-scope decision as the bullet above — which uses, or which measured
  ground, a flood-section rule applies to — and wants the same owner steer.
- **The licensed camp's province track ends about 25 m past the camp.**
  `track.hist-heartland.sap-tapping-licensed` (713 m,
  `apps/world-studio/public/province/routes-minor.json`) was routed to the
  terminal `entryUV` (3448.0, 4500.8) that the blueprint declared before the
  camp's berth and anchor moved on 2026-09-09. Its last 30 m run south down the
  camp's eastern flank, and the camp track then runs back north to the stair, so
  the two lines sit within about 3 m of each other for roughly 12 m and read as
  one path drawn twice. Every gate passes (the entry point is exactly on the
  route and the bearings are 13° apart), so this is a look, not a red. The fix
  is to move `terminal.sap-tapping-licensed.track-head`'s `entryUV` to where the
  road first reaches the camp and re-run `worldgen.compile_minor_routes`; that
  is a chain stage, so it belongs to whoever holds the chain lock.
- **One ground slot still reads the un-tropicalised vanilla texture.** From
  2026-09-09 every vanilla texture in the asset pipeline resolves through
  Tropical Skyrim by default (owner ruling; see
  [90-asset-strategy §74.1a](../../world/90-asset-strategy.md)). The ground-material
  table is the one place left that does not: `build_ground_materials.py` slot
  `peat_slope` pulls `textures/landscape/frozenmarshdirtslopes01.dds` from the
  vanilla BSA (`kind="bsa"` — the table's only such slot) and hue-shifts it
  with tint `(14, 1.08, 1.0)` to fake the tropicalisation. Tropical ships that
  exact file. The consistent fix is `kind="ts"` with the tint dropped, but the
  tint came out of an owner-reviewed ground round and every ground change needs
  a look, so it wants an owner call plus a `build_ground_materials` re-run and
  a terrain recompile.
- **`grade_settlement_pads` does not exempt route-structure windows.** — ABSORBED into 16e, delivered 2026-09-15 (16e: pads consume the shared exclusion-window module (16h applies it)); evidence in [the 16e ledger](../../research/phase16/16e-ledger.md).
- **The "three badly routed ways" are not badly routed. The fault is a** — ABSORBED into 16e, delivered 2026-09-15 (16e: the pip is absorbed by the rewritten grader at 1.83 m sampling); evidence in [the 16e ledger](../../research/phase16/16e-ledger.md).
- **Gap plan B2's `MAX_FILL_M` hypothesis is measurably wrong — do not raise** — ABSORBED into 16e, delivered 2026-09-15 (16e: MAX_FILL_M left at 6 m; grading is a patch author); evidence in [the 16e ledger](../../research/phase16/16e-ledger.md).
- **DONE 2026-09-09 (owner ruling): the water solve no longer suppresses a
  crossing.** Both mechanisms below are deleted, not made structure-aware —
  `ROAD_MAX_DEPTH_M`/`POOL_MIN_KEEP_RELIEF_M` and the `road_cap`/`road_reject`
  block are gone from `standing_water._evaluate`; `FORD_DEPTH_M`, the `ford`
  station array and `solve(..., roads=)` are gone from `channels.py`.
  Measured on the shipped vault, roads-only (`placement-at-carve.npz`,
  full-res cells of 1.83 m): standing bodies put 10 major-road cells over
  0.3 m before, 3,798 after, in 45 patches spanning 35–250 m at 0.9–3.3 m;
  the channel network puts 2,755 major-road cells in its own width, of which
  1,246 over 0.5 m in 12 crossings 16–108 m wide at 1.2–2.0 m. The 33 other
  river crossings stay under 0.5 m — natural fords. Guard test:
  `test_water.py::test_a_bridged_river_keeps_its_depth_under_the_crossing`
  and `::test_a_lake_a_road_runs_through_keeps_its_level`. The chain must be
  re-run from `refine_province` before this shows in the shipped water, and
  `roadCellsDeepInWater` (6,198 today, 5,511 of it SEA) will rise.
  **Still open, and now load-bearing: nothing authors those crossings.**
  `author_route_structures.author()` reads only the grader's over-cap gradient
  stretches (`:553`, `:640`) — no water input at all — and `grade_routes`
  excludes every wet sample from the stretches it emits (`:534-538`,
  `:720-732`), so a water crossing can never become a structure. There is no
  `ford`/`ferry`/`causeway` kind in `compile_route_structures.KIND_ROLE`
  (`:149-150`), the longest deck piece runs 13.3 m (`:114-116`), and the
  1.2 m `MIN_STRUCTURE_RISE_M` floor would drop a flat water span anyway.
  So each of the 45 + 12 crossings needs either a hand-authored ferry/ford
  record (registry row + crossing place, per `compile_minor_waterways`
  `:377-390`) or a sourced pier/trestle kit and a water-reading author pass.
  `grade_routes.py:63-67` claims fords and bridges "are derived from measured
  wet-season depth" — false; only a `crossingM` tally is.
- ~~**The water solve still treats a bridged crossing as ground that must stay
  dry**~~ (found 2026-09-09 alongside the paint-under-spans fix in
  `worldgen/routes_raster.py`; kept for the evidence). Two places rasterised
  every route/track line with no structure filter and then suppressed the
  water the bridge exists to cross:
  * `worldgen/standing_water.py:260-265` — `road_cap = g + ROAD_MAX_DEPTH_M`
    (0.30 m, `:49`) and `road_reject` delete or cap any pool a way touches;
    the `roads` mask comes from `placement_cells(..., kinds=("roads",))`
    (`:89-131`), which excludes boardwalks only.
  * `worldgen/channels.py:450-459` — a section whose width touches a road
    becomes a ford station, clamped to `FORD_DEPTH_M` 0.3 m (`:107`, applied
    `:294-296`). A river an authored bridge spans is shallowed under its deck.

  Mechanism, not just theory: sampling `refined/flood-wet.png` along the 205
  bridge/deck windows (4 m abutment inset) leaves 85 major and 111 minor span
  samples still standing over published water — the suppression is what keeps
  the rest dry. **The ordering is the real problem**: both run inside
  `refine_province` off the frozen `carve-inputs` network, before grading, so
  they cannot read `route-structures.json` without a second pass or a promotion
  cycle. Fixing it is a chain-ordering job, not a one-line filter.
  Related false positive: `worldgen/compile_water.py:755-770` reports
  `road/trackCellsInWater`, which will count legitimate bridge crossings as
  defects once the above is fixed.
- **The road raster paints the frozen line; everything else measures the** — ABSORBED into 16e, delivered 2026-09-15 (16e: the road raster paints the published line (routes_raster.rasterize_roads)); evidence in [the 16e ledger](../../research/phase16/16e-ledger.md).
- **Route structures emit no navigation data.** — ABSORBED into 16e, delivered 2026-09-15 (16e: every structure emits a walkSurface record); evidence in [the 16e ledger](../../research/phase16/16e-ledger.md).
- **Seasonal foliage response** (re-homed here from 16f by the owner, 2026-09-16; decision 0062 item 8): one uniform, the clock's season scalar the water already reads, drives a per-role dryness response in the T1–T3 vegetation materials (grass, forbs and floodplain trees dry and yellow in the dry season; the evergreen jungle roof barely moves), the response per role stated in `palettes.json`'s conventions and applied through the same material hook the wind uses (re-applied after CSM's `setupMaterial`). Renderer-only; nothing else depends on it. Owner check: the floodplain at both seasons.
- ~~**The terrain chain finds integration defects one run at a time.**~~ — ABSORBED into 16f (deliverable 16: `terrain-chain.sh --check-contracts` with a per-stage `READS` list), owner 2026-09-16. Every stage's unit tests were green on 2026-09-15 and the 16e chain still failed twice in a row, each time on a downstream stage's assumption about an upstream artefact (`terrain_request_postconditions` bound the water to the final terrain hash after the natural/graded split; `paint_route_overlays` assumed every station has a `positionM`). The chain stops at the first failure by design, so each one costs a run. Mechanism: a `terrain-chain.sh --check-contracts` pass that, before any stage runs, loads every artefact each enabled stage declares it reads (a per-stage `READS` list in `chain_stages`, the same list the fingerprint uses) and validates shape, required fields and hash bindings against the current files, printing every mismatch as one list; a new stage declares its reads or fails the pass. Owner asked for this on 2026-09-16.

- **A 16e router test is red outside the gate** (found 2026-09-16 during 16f): `worldgen/test_solve_major_routes.py::test_a_gradable_step_costs_earthworks_and_a_cliff_is_a_wall` asserts `routes.grade_factor(2.0, 5.48, 8.0, gradable_m=8.0) < 60` and the code returns 91.2; the file is not in `test:placement`'s explicit list; preflight never sees it. Either the round-3 earthworks cost or the test's bound is wrong; the roads are accepted as they stand (owner 2026-09-16: nothing earlier is rebuilt), so the fix is a test-or-constant decision for the next agent who touches the router; the file then joins the gate.
- ~~**Cross-pool texture precedence in the kit build**~~ — DONE 2026-09-22 (16h lane C): a kit states `texturePoolPrecedence` (most-wanted pool first) and `build_kit.assemble` fills contested vanilla texture paths in that order instead of dict order, printing `contested texture <path> -> <pool>` per substitution; `flora-province-v1` declares tropical > bmv > depths > vanilla and `underwater-v1` depths > shores > sirenroot > jokerine > htbm > bmv > vanilla. A precedence row naming a pool the kit sources nothing from fails the build.

- ~~**Vegetation: occlusion culling and a far tier for the ground ring**~~ — DONE in 16f round 2 (2026-09-18, decision 0071): a terrain-horizon occlusion test per 32 m cell at each rebuild (`packages/game-core/src/render/terrainOcclusion.ts`); the ground ring steps mesh → card → sparser card with dithered crossfades to a far radius per preset.
- ~~**Underwater band: a 4 m kelp scattered into 1 m of water**~~ — DONE in 16f round 2 (2026-09-18): the depth floor now measures the top of the piece above the bed (`sizeM[2] − pivotAboveBaseM`, which the kit writes as one quantity under two names, `vet_kit.py:199`), so shells and small pieces keep their shallows; the shipped bundles carry it after the round-2 chain run.

## Owner rulings 2026-09-09 — ways over water, and how roads choose their line

- **Alten Corimont is served by shallow-draft boats.** Its harbour measures 2.4 m
  where a keeled hull wants 3.0 m, and the owner's ruling is that this is the
  world, not a defect: "2.4 m frankly sounds fine to me. Let's just say that
  it's served by shallower bottomed boats. They have to come quite a long way up
  some presumably shallower water areas to get there from the sea anyway." So the
  record's hull class changes to match the water, which is a decision about what
  sails there — not the forbidden move of lowering a class to make a check pass.
  Done when: the record declares a hull its harbour can float, its prose says so,
  and `test_navigable_roles_sit_on_navigable_water` passes without an exemption.
  **Done 2026-09-09**: `macro_plot.NAVIGABLE_HULL_CLASS["neutral-free-port"]`
  is `small-draft` (the type has exactly one record, Alten Corimont), and the
  record's prose says "water a shallow-draft hull can reach" / the siting
  constraint reads "navigable water for a shallow-draft hull". The test passes
  (`pytest worldgen/test_macro_plot.py -k navigable`, 1 passed).
- **The navigable check measures the wrong water.** — ABSORBED into 16e, delivered 2026-09-15 (16e: crossings and berths read the water record (derive_crossings, travel_services)); evidence in [the 16e ledger](../../research/phase16/16e-ledger.md).
- **`watercraft-v1` is built but reaches nothing.** — ABSORBED into 16e, delivered 2026-09-15 (16e: the hull at each berth is placed by 16h from travel-services.json berth records); evidence in [the 16e ledger](../../research/phase16/16e-ledger.md).
- **The "57 water crossings" number was never reproducible — CLOSED 2026-09-09.**
  It appeared in three docs with no script, test or report behind it, and its
  lake/river split was inverted against `water-meta.json`'s own
  `roadCellsDeepBy` (sea 5795 / lake 919 / river 1348). Replaced by
  `python3 -m worldgen.water_crossings`, which writes
  `world/sources/routes/water-crossings.json` and can be re-run by anyone:
  52 major-network crossings (31 river, 21 lake), 63 on tracks, deepest 1.48 m.
  The ferry/ford/span decisions are `world/sources/routes/travel-services.json`.
- **The router should take the long way round rather than bridge a gorge.** — ABSORBED into 16e, delivered 2026-09-15 (16e: solve_major_routes prices crossings from the record; a span over 52 m is a red in the ledger); evidence in [the 16e ledger](../../research/phase16/16e-ledger.md).
- **Water crossings become ferries, and a ferry is talk-and-teleport.** — ABSORBED into 16e, delivered 2026-09-15 (16e: derive_crossings + travel-services.json; talk-and-arrive is the packages contract); evidence in [the 16e ledger](../../research/phase16/16e-ledger.md).
- **CORRECTION, and it matters for what may be built.** An earlier note here
  argued a long viaduct was implausible because "this province has no polity
  that built one". That is wrong. Black Marsh **was an Imperial province**:
  the Blackwood Road, Fort Swampmoth, Blackrose prison and Lilmoth's own
  surviving Imperial gate are all in the records. Imperial engineering on this
  scale is attested, so a ruined or half-drowned viaduct is good content. The case
  against the 390 m span is that the ROAD was routed badly, not that the empire
  could not have built it.
- **A whole authored bridge cannot follow a slope, because the placement
  contract carries yaw only.** `compile_route_structures` emits `posM` and
  `yawDeg`; there is no pitch axis, so a vanilla landscape bridge can only be
  laid flat. On today's 204 crossings that restricts the monolith rule to 3.
  The median window fall is 3.9 m, so a flat deck would meet the lower road that
  far in the air. Adding a `pitchDeg` to the placement record and honouring it
  wherever route structures are rendered would make **~46** crossings a single
  authored arch with its own parapet instead of a chain. Do the renderer and the
  record together; a field no consumer reads is worse than none (standard 12).
  Evidence is in decision 0051 call 4.
- **One crossing has no piece to stand on.** — ABSORBED into 16e, delivered 2026-09-15 (16e: the pier-less crossing is re-authored by the crossing-aware span author); evidence in [the 16e ledger](../../research/phase16/16e-ledger.md).
- **The character sheets label their donor NPCs with editor ids, because the
  vault has no string tables.** `Skyrim.esm` is a localised plugin, so every
  NPC's `FULL` field is a four-byte string id (Dravin's is 61944).
  `Skyrim_English.STRINGS` and its `.DL`/`.IL` siblings are not in the asset
  vault, nor is the `Skyrim - Interface.bsa` that would carry them. Measured
  2026-09-10. So `apps/combat-sandbox/scripts/render-character-sheet.mjs` shows
  `Kharag Gro Shurkul` where the game shows `Kharag gro-Shurkul`. One donor
  (`EncWarlockIce03BossHighElfM`) has no name at all. This is a **sourcing gap**:
  the missing input is those three files from a Skyrim install. Once they are in
  the vault the fix belongs in `pipeline/npc_records.py`, which already parses
  the record: read `FULL`, resolve it, carry the name in the roster. The renderer
  then labels the card from the roster. The format is a uint32 count, a uint32
  data size, then `(stringId, offset)` pairs into a null-terminated blob.
- **Elven, dwarven and ebony still read OPEN at the neck on the shipped GLBs.**
  Struck for the other six: after decision 0056 rebuilt every piece per sex and
  per weight, re-measured 2026-09-11 by
  `tooling/asset-pipeline/scripts/measure-neck-seam.py` against three builds per
  sex, iron, studded and ebony-female close **exactly** (rim on the neck to
  0.00 mm, the embedded body loop), steel and glass close on every build but the
  extremes, and dwarven closes at weight 100. What is left:
  - **elven**, −18.2 mm (male, weight 15) to −4.3 mm (female, weight 100). Its
    raised gorget is an authored opening that sits 33–56 mm *above* the neck
    ring, so the head rather than the neck is what has to hide the rim. Nothing
    magenta shows on the evidence sheet, so this is a margin, not a visible
    hole — but it is the one cuirass that is negative on every build of both
    sexes, and it is flagged on the sheet for eyes.
  - **dwarven**, −6.1 mm to −4.4 mm on the two lighter female builds. This is
    Bethesda's own fit, now restored: the male opening is 1.4 mm inside the
    maximum-weight male neck by design. The residual is the female gorget at low
    weight.
  - **ebony male**, −10.7 mm at weight 15 falling to −4.5 mm at weight 65. A
    vanilla asymmetry rather than a pipeline one: `ebony/f/cuirass_0` embeds
    `femalebody_0`'s neck loop bit-for-bit, and `ebony/m/cuirass_1` embeds
    `malebody_1`'s, but `ebony/m/cuirass_0` embeds neither — it measures 0.0618
    off `malebody_0`, where every other exact pair measures 0.000002. Worth
    confirming against a second copy of the archive before treating it as ours.

  All three are authored-opening cases, which the build gate is deliberately
  silent about (a neck tapers, so a wider ring higher up it fits; see
  `validate_neck_rings`). The verdict for them is the line-of-sight measurement
  above and the picture beside it: `docs/evidence/races/armour-neck-check.png`
  and `armour-neck-check.measured.json`.

- **Studio load: the two 4033² ground rasters** (`refined/ground-control.png` 19.1 MB, `chunks/normal-grad.png` 17.8 MB) are the bulk of every 3D load. Measured 2026-09-13: lossless WebP is 14.5 / 13.7 MB (−24 %); a 2017² control map would be a quarter the size but changes the paint the owner reviewed. Mechanism: `rebake_landcover` / `compile_chunks` write WebP, `ChunkTerrain` loads it; check decode time in the browser before switching. The load-order fix of 2026-09-13 (tiles prefetched before the textures; character mode split out of the map/fly bundle; settlements and water not fetched while the ladder hides them) is in; this is the remaining size lever.

- **Compiled level vs the graph's wet-season level (found by 16d part A, 2026-09-15).** For tarn `body.200-770` the compiled/graph `levelM` is 289.71 while the graph's `wetSeasonLevelM` is 290.2: the compiled level equals `levelM`, not `wetSeasonLevelM`, although 0063 says the compiled level *is* the high-water line. Mechanism to check: `compile_water` reads `levelM` where a body carries a distinct `wetSeasonLevelM`. Either the vocabulary (16a graph fields) or the compile is off by that field; owner's 16c walk decides which. File: `worldgen/compile_water.py`, `hydrology-graph.json` bodies with `wetSeasonLevelM != levelM`.

- **The compiled `ocean` label is the sea MASK, not the ocean body (16c defect, found by the 16f sea-classification audit, 2026-09-18).** `worldgen/compile_water.py:1565` writes entity label 1 on `sea & wet`, where `sea` is `standing_water.sea_mask` — ground below 0 that reaches the ocean, i.e. connectivity plus height. Every sea-mask texel no body record claims therefore ships as `body.ocean`. Measured on `water-id.png`: 56.4 ha of ocean-labelled water lies more than 300 m from deep sea by geodesic distance through water, 17.4 ha beyond 500 m, none beyond 1 km; the deepest penetration is 717 m, all of it shallow tidal creek. `compile_water.py:1774-1780` repeats the reading, because the class raster's `sea3` gate outranks the body's own kind (115 coast texels stand over a lagoon, 87 over a pond, 65 over a swamp). Fix, if ever wanted: label only the texels the graph's ocean body claims; gate the class on the entity kind rather than `sea3`. Above the freeze gate. **Owner 2026-09-18 (16f round 3): no refreeze is planned, ever; accepted as it is.** What the over-reach costs, so nobody reopens it by accident: 56 ha of shallow tidal creek within 700 m of the open sea carries the sea's class (tide, fetch and swell terms, all of which a tidal creek physically has anyway, at short fetch) and is dressed under water by the `ocean` sea-bed bands (pebbles, shells, wet rocks) instead of the river-bed ones; nothing on land, no level, no extent and no route reads it. A below-gate label patch could relabel those texels without a refreeze, but it would edit the frozen water rasters for a cosmetic 0.1 % of the province and is not worth the risk to the freeze.

- **Clearance stamping is one-directional, so a rock PAIR can overlap (found by 16f, 2026-09-16).** `scatter._blocked` tests only the stamped disc of the rock that was placed first, so two rocks are held apart by the larger one's footprint rather than by the sum of the two. Measured on a synthetic 55 boulders/ha mountain hectare: `rockl02` and `rockl03` land 9.41 m apart where the sum of their footprint half-diagonals (× 0.8) wants 9.93 m. Mechanism: make `_blocked` take the candidate's own clearance and test `dist < stamp_radius + own_radius` — a one-line change with a province-wide density consequence, so it needs a re-bake and a look, not a quiet fix. Files: `worldgen/scatter.py` `_blocked` / the stamp push in `scatter_chunk`; the test that documents the limit is `worldgen/test_rock_layers.py::test_no_rock_stands_inside_another`.

- **`Vegetation.tsx` pass one is the larger half of a rebuild now that the meshes are pooled (16f round 3, 2026-09-18).** Measured at the jungle after decision 0072 §8: fill 16–18 ms, bucketing 18–21 ms steady (43–53 cold) on this VM under contention. Pass one samples the streamed ground (`groundHeightM`) and the occlusion cache per instance for ~5.6k drawn plus every culled one. Mechanism if the owner's walk still hitches every 16 m: re-ground per 32 m cell from a cached per-chunk height patch and cull by chunk-level distance before the per-instance loop; or move the bucket pass to a worker. Numbers first: the owner's console prints `vegetation rebuild … ms`.
- **Flora collider trimesh cost is instrumented, not yet measured (16f round 3).** `__STUDIO_VEG_COLLIDERS_DEBUG__` and the console line `flora colliders rebuild N ms, N bodies, N trimeshes in N ms` report each ring rebuild; the software-rendered probe on this VM runs at ~0.6 fps and never walked the 1.5 m that triggers one. If a rebuild spends more than ~20 ms in `ColliderDesc.trimesh` on the owner's machine, the fix is a cached collision proxy per rock species (a convex decomposition or a decimated collision mesh exported by the kit builder), never the manifest box.


- **`packages/character-assets/files/weapons/scimitar.glb` is an orphan copy of `steel-scimitar.glb` (found by weapons-lane round 1 stream M, 2026-09-18).** Same 59,332 bytes, same mtime, tracked since Phase 7 (`37e8e855`); no arsenal item, manifest entry, config or source file names it (only `steel-scimitar` appears in `arsenal.items.json`, `weapon-reach.json` and `weapon-records.json`). It ships 58 KB of dead weight in every download. Fix: delete the file, then `npm run test:pipeline` and `packages/character-assets/verify.mjs` to confirm nothing resolved it.

- **Weapon GLBs ship raw (weapons lane round 1, decision 0077 §6, 2026-09-19).** All 82 files under `packages/character-assets/files/weapons/` are Blender glTF binaries with JPEG textures and no meshopt; standard 16 says what ships is compressed. Fix: one pass of `pipeline/kit_compress.py` (or a weapon twin of it) over the weapon set, the startup budget measured before and after, `weapon-reach.json` re-baked if geometry changes.

- **27 graph bodies are missing from the compiled water bundle (16g round C, 2026-09-19).** `apps/world-studio/public/province/water/water-meta.json` carries an entity for 2,253 of the 2,280 bodies in `world/sources/hydrology/hydrology-graph.json`; the 27 absentees include `body.1290-3508` (the Blackrose lake, areaM2 59,075), `body.1626-3332` (212,464), `body.877-2565` (17,998), `body.2789-2031` (13,631), `body.1562-2446`, `body.753-3381`, `body.1195-552`, `body.98-2505`, `body.1378-171`, `body.58-659`, `body.948-2364`, plus 16 more under 1,100 m². One of the 27 (`body.1290-3508`) carries `realisedBy` and is read through it; the other 26 have no redirect and no cell or polygon geometry in the graph at all (a body row carries only `deepestCell` and `bboxCells`), so nothing below the gate can reconstruct them. Mechanism: the water compile's entity list must equal the graph's body set — add a test that every graph body with `areaM2` at or above the compile's own threshold has an entity in the bundle, then fix the compile when water is next unfrozen (owner call: above the freeze gate). Done when that diff is empty.

- **`test_mine_mounts.py::test_the_record_holds_the_golden_set` is a registered known red (decision 0053; owner: miner lane).** The M16 mounts record classes `bmv:landscape/trees/cedartree3` as `wall`; the golden set expects `water`. The row in `worldgen/known_red.py` matches that one entry; remove it when the next full mounts run lands (kit-mining skill), or fix the golden expectation if the run shows `wall` is right.
- **Region 14 ships under the vegetation ladder (owner 16f, measured by 16g on 2026-09-19).** `test_vegetation_ladder.py::test_delivered_ladder` reads a delivered ratio of 1.24 against the target 1.40 (70.3 stems/ha over 157.6 ha). The shipped bundle is not thinned: the three chunks whose dominant region is 14 carry 26,995 instances against 9,676 at `ff71bdda`, when the ladder was last measured, so this is a palette re-base rather than attrition. The 16g track clearance is not the cause either — of its 8,911 removals only 139 fall in those chunks; the 4,897 m of track crossing region 14 can hard-clear about 2.0 ha. Mechanism: rebuild the flora kit for the region and re-run `python3 -m worldgen.compile_scatter`, or re-base `vegetation_ladder.TARGET_RATIOS` from the shipped bundle with the measurement written down. Done when `test_vegetation_ladder.py` is green. Status: re-based 2026-09-20; owner confirms on the walk.

- **`apply_vegetation_patches` decodes and re-encodes each bundle instance in Python (measured 2026-09-20).** The province stage costs ~8-16 worker-seconds per chunk: 162 chunks took 1,310 s on 2 workers and removed 0 instances, so nearly all of that is decode/encode of bundles it then writes back unchanged. Mechanism: vectorise the decode and encode, holding positions and species as numpy arrays for the whole chunk instead of looping per instance, so a chunk costs well under a second. File: `tooling/world-generation/worldgen/apply_vegetation_patches.py`. Done when the province stage runs in under 60 s on 3 workers.

- **The character body stutters slightly while walking although the world is smooth (owner 2026-09-22, jungle walk during the vegetation performance lane).** The owner's report: the world renders smoothly but the player body jerks slightly during walking. Suspect: a fixed-step position or an animation mixer delta written without interpolation to the render frame. Owner call: this is character/controller work (`PlayerMovementController` / `EcctrlAdapter`), not the vegetation lane. Evidence: [vegetation renderer lane brief § Next agent, item 2](../lanes/vegetation-renderer-lane.md).

- **CI placement-tests job is hollow: `worldgen/test_blueprint.py` skips entirely on the runner (75 skipped) because footprints derive from the untracked `output/kits/*.kit.json`; CI validates nothing there while local preflight does.** Decide: track the kit footprints as a record (like `kit-interiors`) or drop the job. Evidence: run 35762257145 log; commit 0170d847 report. Owner: the next 16k slice.

- **`waterways-minor.json` is stale against the catalogue and the blueprint set: republish it (a water compile; Fable or an owner-authorised agent).** The crash is gone: the authored row `waterway.hist-heartland.nine-trunks` was retired with its blueprint on 2026-09-24 (16h ledger § Gate fixes). `compile_minor_waterways.run(write=False)` now differs from the published file in 6 channels dropped (the Lilmoth and wamasu-pond blueprint berths, and the sap camp landing), 3 added (`wamasu-pond-adult`, `manned-toll-tower`, `lilmoth` from the record) and 6 changed (Blackrose lake lanes after its reseat; nine-trunks now solved from the record); `test_minor_waterways.py::test_shape_matches_routes_minor_and_serves_live_plotted_places` and `::test_boat_stations_are_channelled_or_explained` stay red until it is republished. The two decisions that rode with it are made (planner 2026-09-24): the authored `waterway.hist-heartland.sap-tapping-licensed.landing` row is retired too (in git at `f1e87b10`), and the two `patch.poling.*` channels in `world/sources/terrain/terrain-patches.json` stay as frozen channel shapes (decision 0059). The 2026-09-24 dry run (130 channels against 133 published) also changes `blackrose-drowned-hist`, `lake-divers-yard` (channel to crossing), `rose-flooded-passage` (the Blackrose reseats), `air-pocket-station-deeps` and `drowned-village-lake-deeps` (0.02 km and 0.01 km longer; not traced to a row), and drops `lilmoth-divers-yard` (not traced to a row). Stage order (0080): the compile reads blueprint docks (`compile_minor_waterways.py:214`), so 16i's places change this output again.

- **Studio ambience wiring: the world studio does not play the soundscape that `packages/audio` already supports (sound-prep lane, 2026-09-24).** The runtime exists (decision 0095): an injected `AudioManager` over the three.js backend, the pure `selectAmbience` over the clock, weather, region and canopy fields, and positional emitters. The files exist too: 391 files in `packages/audio/files`, including the Morthal marsh and coast region sets, rain, thunder, water and waterfalls (decision 0094). `apps/world-studio` wires none of it. What to do, in order:
  - add the Vite plugin (`audioFiles`, with `sharedBase` if the sandbox already ships the files);
  - create the manager on the studio camera, unlock on every gesture and call `update()` from the frame scheduler;
  - build the inputs from `dayPhaseAt`, `seasonState`, `weatherSampleAt`, the region raster and `LocalClimate.canopy`;
  - call `setAmbience` / `setAcousticState` when an input changes band;
  - add one `addEmitter` per river, rapid, shore or waterfall, moved to the feature's nearest point;
  - add a `&audio=0` URL switch.
  The full checklist is the sound-prep lane's studio handoff, copied into `docs/phases/lanes/sound-prep-lane.md` § Handoffs. Owner: the 16k checklist row "Ambience and footstep surfaces" gates only the ambience zone as data (a socket, not a gate on this wiring); the wiring is Phase 12b's unless a slice takes it (apps/world-studio is Phase 16's while 16k runs). Done when: the studio at a marsh coordinate plays the night crickets and frogs, swaps to the day set at noon, drowns in rain in a downpour and muffles underwater; `stats()` stays within 4 beds + 4 emitters + 12 one-shots.

# Polish backlog (Phase P — plan §86)

Rolling list for the general polish pass (module 95, "Phase P"). Add items
freely (owner or agents); one line each, with source and a concrete "done"
test. Remove items when shipped. This file is the single place deferred
cosmetic/feel work lives — do not park polish items in decision docs.

| Item | Source | Done when |
|---|---|---|
| **Regions: tidal delta (3.8 ha) and deep river corridor (10.3 ha) are the two thinnest classes left.** Raised hammock (0.05 ha, zero places) was retired for this in [decision 0050](decisions/0050-retire-the-raised-hammock-region-class.md); these two are 75x and 200x larger and DO hold places (4 and 1), so they are not the same defect — but the same measure (`worldgen.vegetation_ladder.region_area_ha`) says they are thin enough that their vegetation ladder needs the wider THIN_RATIO_TOLERANCE. Decide whether the hydrology should be producing more delta and corridor, or whether these are the right size for a 37 km2 province | measured 2026-09-09 while retiring class 10 | owner decides: either the thresholds move (a hydrology re-solve, chain-owner sequenced) or the sizes are accepted and `THIN_SAMPLE_CLASSES` records that as the answer rather than as a workaround |
| Routes: after the 0047 terrain re-carve the majors re-routed (10 stretches on stormhold-thorn alone) and `author_route_structures` stopped on 22 new survivors — 21 minor tracks whose LAST 2-20 m step 1.0-1.6 m at "the junction end" (branchmont, hutan-tzel, sings-for-the-pipes, tear-road-stage, tearmouth, the-dres-rows, the-north-cut, the-salt-and-shell, the-white-pans, wolk-market, fort-swampmoth, giovesse-lines, glenbridge, mile-house-of-the-eagle, the-drowning-gate, the-hollow-pass-station, the-pass-shelter, ixtaxh-xanmeer, dead-water-village, chasecreek, corimont-tradehouse; none within 30 m of a river) plus stormhold-thorn (sentence added 2026-09-08, needs text-review). Root cause is in `grade_routes.grade`: a track's final approach lies inside the road's LOCKED bench shoulder, so the road's 30 deg bench face is left as a step under the track instead of the track grading through it. Each rebuild produces a different survivor set (the evening run of 2026-09-08 orphaned 20 stored structures across 5 vanished ways and raised 20 newly unauthored ones plus a region with no piece family), so the authoring tables chase the ground. The stage no longer stops the chain for it — it emits the geometry with `unauthored: true` and a CI test holds the debt — but the churn itself is the defect | 0047 compiler delivery 2026-09-08 | `grade_routes` lets a later way grade through an earlier way's shoulder (never its flat width) on its last ~20 m; a rebuild on unchanged sources produces the same survivor set, and `author_route_structures` reports zero unauthored |
| Terrain: `sculpt_province` no longer reproduces the frozen base — it is deterministic (two 2026-09-08 re-runs byte-identical) but differs from the August `heightfield-sculpted-f32.npy` the hydrology/routes/places were solved on (max 67.8 m, 5.8 % of samples > 1 m; sculpt.py changed in 1d9d168/7e93d7d). `terrain-chain.sh` therefore must not start at sculpt without re-running `compile_hydrology` + `compile_society` and re-plotting; the 2026-09-08 water run restored the August file and ran from `refine_province`; the same day a default `terrain-chain.sh` run re-sculpted it again (the skip check reran the stage because `sculpt_province.py` had changed) — restored from `/tmp/vault-pristine` and a durable copy kept as `heightfield-sculpted-august-2026.npy` in the vault heightfield dir; until the owner call, run the chain `--from refine_province` | 0047 compiler delivery 2026-09-08 | owner call: re-freeze the base on today's sculpt (full chain incl. hydrology, re-plot) or pin the sculpt code to the August output; either way `--from sculpt_province` reproduces the vault byte for byte |
| Terrain: the August sculpt has 46 near-sea-level pits inside > 60 m terrain (34,933 samples; e.g. 4,867 samples at 6.60 E / 0.90 S floor −7.8 m under a 110 m rim; 0.51 E / 4.74 S; 2.73 E / 0.35 S) that are NOT in the raw heightfield — erosion sinks. Under 0047 a river that runs into one is pooled to its spill (`forcedBasins` in the water census), so they render as deep mountain lakes; whether they should exist is a sculpt question | 0047 compiler delivery 2026-09-08 (`standing_water.pool_channels` report) | sculpt fills or explains each pit; `forcedBasins` in `water-meta.json` stats drops to what the owner accepts as lakes |
| Hydrology: a few coarse river routes climb out of a hollow by the wrong exit or over a spur the full-res terrain has no way through (`lostStations`/`lostSites` in the water census; 5 stations on one reach after the 2026-09-08 carve) — the coarse 5.5 m D8 on the decimated terrain misses 1–2-sample gorges. The water stops there (no trench, no water) and restarts downstream | 0047 compiler delivery 2026-09-08 | route rivers on the full-res (or min-decimated) terrain in `compile_hydrology`; `lostStations` == 0 |
| Chain: **the carve's half is FIXED, 2026-09-09** (`worldgen/carve_routes.py`). `refine_province` fed itself its own output — it carved along the published `routes.json` and `routes-minor.json`, which `reroute_majors` and `compile_minor_routes` then rewrote from that ground; two `--force --from refine_province` runs on identical sources moved 147 of the 1809 published files. The carve now reads frozen copies in `apps/world-studio/public/province/carve-inputs/` (majors seeded from `routes-natural.json`, the pre-repair solver output), which no chain stage rewrites; `python3 -m worldgen.carve_routes --promote` is the deliberate act that recarves for today's networks, and `refine_province` prints the drift until someone takes it. `worldgen/test_chain_settles.py` holds it in a second. **STILL OPEN (a)** `sculpt.corridor_and_anchor_mask` (`sculpt.py:113`) still reads `routes.json` — left deliberately, because editing `sculpt.py` changes `sculpt_province`'s code fingerprint and would leave the chain permanently wanting to re-derive the frozen base terrain (row above); the sculpt's output never moves, so the cycle is broken in practice. **(b)** the byte-identical acceptance test has NOT been run: no full province build was permitted in the session that made the fix | chain speed-up 2026-09-08; carve fixed 2026-09-09 | swap `ROUTES_JSON` for `carve_routes.carve_source` in `sculpt.py` in the SAME commit that re-freezes the sculpt; and run two forced province builds on unchanged sources and confirm identical bytes with `scripts/chain-manifest.sh` |
| Repo size: `.git` is **1.9 GB** (1.13 GiB packed) and every terrain rebuild commits ~35 MB of regenerated province rasters (`ground-control.png` alone is 19 MB). Rollout by region packet (Phase 15) multiplies this. GitHub's own guidance is under 1 GB, and the Pages build needs the data present at build time — so the fix is a fetch step (release artefact or vault pull) rather than a `.gitignore` | water round 2 close-out, 2026-09-08 | generated province data is fetched by the build rather than committed, and `git count-objects -vH` stops growing with each rebuild |
| **Water: full re-review of all water systems** (rivers, waterfalls, shore/sea lapping, marsh wetness, underwater, perf) — owner closed 8b as good-enough, explicitly **not perfect**; re-review and polish as a set at Phase P | 8b close (owner 2026-08-28) | owner walks a river source→sea + a beach + a marsh and signs off, remaining niggles fixed |
| Water: hero-pool interactive sim patches at select POIs — the bounded local pool solver (`LocalWaterPatch.ts`, `displacementRegistry.ts`) is compiled and wired to the query but nothing selects a patch or renders it since the overhaul's hero-pool surface was retired (0046); needs a field-grid renderer for the patch heights | 8b deferred (0025); 0046 | a hero pool ripples/reflects at full sim quality |
| Water: FFT open-sea tier for Topal Bay horizon — `spectralOcean.ts` + `render/SpectralOceanTextures.ts` are compiled but unmounted; mount as a high-tier displacement/normal source for the field material beyond the surf band (its per-frame atlas re-upload must be revision-gated first) | 8b deferred (0025); 0046 | open-sea swell quality on high tier, no perf regression |
| Water: projected bed caustics — DELIVERED 2026-09-07: the terrain receiver caustics were wired but gated to zero inside the province by a support flag only the retired data could set; fixed at the root and retuned (`render/groundWetness.ts`, `caustics.ts`); `window.__STUDIO_CAUSTICS__ = 0|1|40` exaggerates/disables for checking; owner visual check pending | 8b deferred (0025); 0046 | moving caustics on shallow beds in sun |
| Water: waterfall mist — DELIVERED, then rebuilt twice under 0047 (`70c8172`, `4be351a`): the whole fall stack is now piece-stacked bodies on the traced path with the vanilla textures, and mist is `render/WaterfallMist.ts` (4–8 cards, 10–40 basin discs, one skirt per fall). The 2026-09-07 particle work it superseded is history, not a live row; owner visual check of a free fall and a chute cascade still pending | 8b round 7; 0046; 0047 addendum | owner signs off a free-fall and a chute cascade |
| Water: "barcode" foam artefacts — root cause fixed 2026-09-07 (world-position rotation by local flow direction removed, commit a3bf122); owner sweep pending | 8b round 7; 0046 | none visible in a province sweep |
| Asset pipeline: `worldgen/asset_taxonomy.py:42` puts `effect` and `water` in `NON_CONTENT_CATEGORIES`, so no `meshes/effects/*` mesh gets a registry row and `pipeline.build_kit` rejects it outright (`… is not in the asset registry`). The waterfall audit had to build against a throwaway registry in `/tmp`. Any FX mesh we want to place as world content (waterfall sheets, mist cards, rapids planes, steam) is blocked on this | [waterfall vault audit](research/rendering/waterfall-assets-vault-audit.md) §6.5, 2026-09-08 | an `effect` category exists that the registry keeps and `build_kit` accepts, with the marker/LOD exclusions unchanged; `python3 -m pipeline.build_kit --kit waterfall-fx-v1` runs with no registry override |
| Asset pipeline: kit materials cannot express alpha **blend**, and sidedness is guessed. `build_kit.py:412` derives `doubleSided` from the asset *category* (foliage only) and `blender/build_kit.py:637` sets `alphaTest = doubleSided`, so glTF only ever gets OPAQUE or MASK. Every Skyrim FX NIF declares `NiAlphaProperty SRC_ALPHA/INV_SRC_ALPHA` blend and a double-sided shader flag; the first waterfall build exported 67/67 materials OPAQUE. The `BSEffectShaderProperty` greyscale/gradient slot (`GradWhiteWater*.dds` etc.) is dropped too — 18 of 31 resolved textures never reach a material | [waterfall vault audit](research/rendering/waterfall-assets-vault-audit.md) §6.2/§6.3, 2026-09-08 | sidedness and blend mode are read from the NIF's shader/alpha properties, and a BLEND material round-trips to glTF `alphaMode: BLEND` |
| Asset pipeline: editor-only geometry ships inside converted FX meshes — `EditorMarker` (fxmistlow01, fxsplashlargechurnnorapids), `boundPush`, and the 12–19 flat `CurrentPlane` quads inside every `fxwaterfallbody*` NIF — all export as real shapes with real triangles | [waterfall vault audit](research/rendering/waterfall-assets-vault-audit.md) §6.4, 2026-09-08 | the kit builder drops shapes named `EditorMarker`/`CurrentPlane*`/`boundPush` (or the kit config can name shapes to drop), and `droppedShapes` records them |
| **Water: a fall's lip is a straight terrain edge, not a notch** — the sheet's crest is drawn across `cascade.lip` for the full compiled `widthM`, so its top is a straight line where the reference's is a gap between rocks. The shader's 0.6 m crest feather is ~4 px on a 16 m fall; the difference is the compiler's lip geometry, not the shading | water round 2 close-out, 2026-09-09 | a fall's crest is as irregular as the rock it leaves |
| **Two published boat lanes run overland for longer than anyone carries a hull** — measured 2026-09-09 on the shipped rasters with `dock_dredge.dredge_lanes`: `route.boat.soulrest-lilmoth` runs 576 m (from 3054 E / 6926 S) and 178 m (3545 E / 6682 S) over ground standing 0-1 m above mean sea level, and `route.boat.blackrose-lilmoth` 124 m at 3142 E / 6026 S. The province's own declared portages run 11-89 m, so these are not carries — the coastal sail lane is hugging the beach instead of standing off it. NOT dredgeable and NOT demotable: dredging a 576 m trench across a foreshore for a sailed coaster would be a fake, and lowering the hull class rewrites what the catalogue and the quests say calls there. It is lane GEOMETRY, solved before grading in `compile_society` / the Phase 4 lane solver, which the water compiler does not own. Every other shallow metre of every lane IS now dredged (986 shallow samples with water over them, cut to the canoe's 0.6 m) | water round-2 leftovers, 2026-09-09; red test `test_water_invariants::test_every_published_boat_lane_carries_a_hull_or_declares_a_portage` | that test is green: no published lane crosses more than `dock_dredge.LANE_PORTAGE_MAX_M` of dry ground |
| **The class raster's extension can still exceed its own height cap where the WET mask itself is block-scaled** — `compile_water` builds the 1345 class grid by taking the block MAXIMUM of the 1.83 m wet mask, so one wet sample on a steep bank labels a 5.48 m cell whose own ground is metres higher. Measured 2026-09-09 after the extension gained its 2 m rise cap: 1 577 cells (0.047 km2) classed and standing more than 2 m above water at their seasonal maximum lie beyond the extension radius entirely, so the cap cannot reach them. Wet cells must keep a class (the superset contract), so the fix is resolution, not gating: either class at the wet mask's own resolution or record the block's water level so the consumer can tell a cliff-side river cell from a labelled cliff | water round-2 leftovers, 2026-09-09 | no classed cell stands more than 2 m above water at its own seasonal maximum, measured at the wet mask's resolution |
| **Terrain/light: cliff rock renders as blown-out near-white** — brighter than the whitewater in front of it, which inverts the reference (near-white water against grey rock). Found while judging waterfall frames: "until the cliff stops rendering as snow, no width or crest work will make that frame look like the target". This is the terrain material and the light rig, not water | water round 2 close-out, 2026-09-09, agent read of `artifacts/water-fall-25m.png` | a grey cliff reads darker than the water falling down it |
| Chain: a local carve's fast path is not PROVEN byte-identical, only measured — the fast path is delivered and auto-selected (2026-09-09: a one-dock edit costs 313 s against the full chain's 438 s, and touches 21 published files, all local to the dredged chunk). The acceptance test the brief asked for — byte-identical against a full run — cannot be met while the chain itself moves 147 files on unchanged sources (row above). Measured instead, from one restored state: the fast path changed 21 files, the full chain 76, and the 55 extra include `routes.json`, which a dock's hull class cannot move. The fast path is the tighter answer of the two, not the looser one | water round 2 close-out, 2026-09-09 | the feedback-edge row above is fixed, then `chain-manifest.sh` reports zero differences between a fast run and a full run on the same edit |
| Water: walk-mode SSR cost reduction + further DPR/rtScale tuning | 8b perf rounds | steady frame rate on owner's machine in dense water areas |
| Water (sailing phase): dispersive iWave wake field — replace the 64 m non-dispersive `RippleSim` wave-equation patch with (or add beside it) a ~500–700 m camera-centred field convolved with Tessendorf's iWave kernel, so hull wakes disperse into the feathered Kelvin shape; bow + stern generators stamp swept paths (`RippleSim.addPath` / `FoamField.injectPath` already take segments); wake foam deposited where the field's `\|∇h\|` exceeds a break threshold into the persistent foam field (`render/FoamField.ts`) | Greenheck study §1.4, §3 row 9, §6 "Interaction, later boats" | a sailed hull leaves a Kelvin wake with a foam trail that persists and drifts; calm wakes cost nothing |
| Water (sailing phase): five-point buoyancy for hulls — sample the wave height at centre, bow, stern, port and starboard of the hull's bounding box (`surfaceWaveAt`, the CPU twin) and derive pitch/roll with separate height and rotation smoothing times; `rigidBody.ts` keeps single-point bobbing for crates | Greenheck study §1.8 "Buoyancy", §6 | a boat pitches into swell and rolls on a beam sea; crates unchanged |
| Water (sailing phase): water masking for dry hulls — render simplified invisible hull-interior mask meshes to a screen-space texture with an override material and discard water fragments (surface AND underwater fog) inside them, so a boat's hold and deck well stay dry | Greenheck study §1.8 "Masking", §6 | standing in a boat's well shows no water inside the hull from any angle |
| Water: symmetric impact-speed spray probes — emitters own probes in object-local space; each frame a probe crossing the DISPLACED surface from above fires a plume when the vertical convergence speed of probe and surface exceeds a threshold (~3.9 m/s). Symmetric, so a wave rising onto a rock, pier, mangrove root or the wading player produces the same plume as a hull falling onto still water; feeds `WaterEffects` billboards with bottom-fade | Greenheck study §1.5, §3 row 10, §4 (4), §6 | spray on rocks in surf and rapids and at waterfall lips once the Phase 10 rock scatter lands; a dropped crate and a wave on a piling look alike |
| Water compiler: algae constituent — greenwater swamps are in the quality matrix but the colour model carries only silt and tannin; compile a green (phytoplankton) constituent from class, low flow and warmth into the class raster (a free channel or a new one) and read it in the surface albedo/absorption, the underwater fog and the crest transmission tint so one constituent set drives all three | Greenheck study §1.7, §6 "Marsh, blackwater, greenwater" (compiler owned by another agent 2026-09-08) | a still warm marsh basin reads green above and below the waterline; sea, rivers and blackwater unchanged |
| Water: dressing for the owner's judgement — rock scatter in surf zones and stream beds (Phase 10 scatter job) so the water has something to break on, refract and foam behind | Greenheck study §2 (9), §6 "Dressing" | rocks in the surf at the reviewed beach and boulders in a rapid, both foaming via the field |
| Region raster reclassification (map tooltip coarse regions vs 8b water truth) | 8b round 5 §9 | tooltip region shapes match rendered water |
| **Weather/atmosphere: owner-reserved leftovers from the 8c close** — the owner closed 8c good-enough (2026-08-30) and will record the specific items here themselves | 8c close | owner has replaced this row with concrete items (or struck it) |
| Weather: mountaintop cap cloud (whiteout regime 3) — DISABLED 2026-08-30 (owner: hard square edges seen from ground level, a belt-mask raster-resolution artefact). Re-enable via `WHITEOUT_ENABLED` in `world-weather/express.ts` after rebuilding it properly (higher-res/softened mask sampling or a real cloud body) | owner request 2026-08-30 | cap cloud back on with no square edges from any camera |
| Weather: volumetric clouds high tier (takram three-clouds spike behind a flag — research doc §2.1 caveats: ECEF frame, postprocessing pipeline vs our envelope-pinned dome) | 8c deferred (0032) | storm anvils/cumulus read volumetric on the high tier, base tier unchanged |
| Weather: god rays / light shafts through canopy | 8c deferred (0032 §9) — needs Phase 10 canopy geometry first | sun shafts under the jungle roof at low sun |
| Weather: screen-space crepuscular god rays at cloud/mountain edges (GPU Gems 3 ch.13 radial blur; concrete recipe + template links in research doc §8.4) | 8c round 1 feedback, owner allowed deferral | visible rays past cloud edges/ridgelines at low sun, both canvases, no perf regression |
| Weather: rain-occlusion top-down depth map (Lagarde) + ground splash sprites | 8c deferred (0032 §6) — needs placed canopy/buildings to occlude under | drops vanish under real cover; splashes at hit points |
| Weather: screen-space lens droplets during squalls (third-person, tasteful) | 8c deferred | brief droplets on the camera in driving rain |
| Weather: thunder audio (distance-delayed crack + rumble tail) | 8c → module 57 (Phase 12b owns all audio) | flash→delayed thunder at 3 s/km |
| Vegetation: BM&V Berkian `landscaping/` plant set (tree ferns, cycads, giant lilies, pitcher plants, club-rush) unusable — the NIFs reference textures by an absolute `textures/g:/berkians folder/…` path; `pipeline/build_kit.py` copies the file to that literal path and Wine/Blender cannot open a `g:` directory, so the meshes convert white. Fix = rewrite texture paths inside the NIF (or alias by basename before import), then re-audition on a sheet | 2026-09-08 variety pass ([audit §5](research/vegetation/regional-variety-audit-2026-09-08.md)) | `treefern_huge` renders textured on `pipeline.render_sheet` |
| Physics mass-unit scale cleanup (ecctrl capsule ~0.25 units vs real-mass props) | 8b round 6 §5 | one consistent mass scale; Phase 9 boats depend on it |
| ~~Combat `10b`: shield parry uses the weapon parry~~ — **done 2026-08-31.** A shield now parries with its own shield-bash clips (Rim Parry's SHD set), on its own catch window, selected by `activeGuardAnimations`. Remaining owner taste question, if any: whether a *small* shield should parry differently from a tower shield | owner question 2026-08-30 (decision 0038) | shipped; row kept only until the owner has seen it |
| Docs: `docs/research/placement-settlements/settlement-kit-sourcing-log.md` carries 34 hard prose-lint hits and two soft density breaches (`generaliser` 4.4/1k against a 4.0 ceiling, `the-only` 1.2/1k against 0.8) in its pre-2026-09-09 sections, measured by `lint_prose --md` during the round-12 text review. `npm test` only gates `--strict` over the catalogue, so no doc under `docs/` has ever been linted | flora kit round 12, 2026-09-09 | the sourcing log passes `python3 -m worldgen.lint_prose --md` with zero hard hits, and the owner decides whether `--md` over `docs/` becomes a gate |

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

## Owner feedback round (2026-09-06)

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
- **Waterfalls**: no waterfall effect yet. Research a three.js waterfall
  approach (discourse.threejs.org t/21564) plus particle splashing and better
  foam; candidate particle libs are three-nebula (github creativelifeform,
  maybe its "gravity" preset) or ShaderParticleEngine (github squarefeet).
  Check the Elysium discourse thread too for combining these with Unity
  waterfall tutorials.
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
- **Land beyond the province's north/west borders is empty.** Continue the
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
- **Trees/plants look stark growing straight out of bare rock in mountainous
  terrain.** Consider terrain texture painting so ground under trees in rocky
  areas reads as "rock with leaves and dirt on it" rather than bare rock.
- **Small plants/bushes sometimes read as placed in ordered rows/grids**,
  looking cultivated rather than wild — placement jitter/distribution needs
  a look.
- **Hanging root tree decorations are still appearing** despite believing
  they'd been disabled.
- **Consider more rock/boulder placement outside the uplands/mountains** —
  candidate lowland areas for a maze-like boulder region (climbable rocks of
  varying size, with nooks/crannies for loot), similar to boulder regions in
  other open-world games. Needs a map survey for viable spots plus research
  into what such regions usually contain.
- **Weapon movesets are still coarse** (vanilla's three broad categories:
  one-handed, greatsword, greataxe/hammer). Source more granular per-weapon
  animation sets from a highly-rated mod within those categories.
- **Dual wielding** — not yet decided/scoped, raised as an open question.
- **Uplands/mountains feel too bare on terrain dressing** compared to the
  lowlands. Needs research: what dressing is appropriate, what's available
  in our current assets/mods/vanilla, and how other open-world games dress
  mountain terrain.
- **Deterracing could be smoother** — visible terracing artefacts remain.
- **Grass coverage** — open question on whether/how much grass coverage
  exists currently and whether it needs improving.
- **Waterfall sides need rocks.** Sheet edges read wrong where they meet bare
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
  [90-asset-strategy §74.1a](world/90-asset-strategy.md)). The ground-material
  table is the one place left that does not: `build_ground_materials.py` slot
  `peat_slope` pulls `textures/landscape/frozenmarshdirtslopes01.dds` from the
  vanilla BSA (`kind="bsa"` — the table's only such slot) and hue-shifts it
  with tint `(14, 1.08, 1.0)` to fake the tropicalisation. Tropical ships that
  exact file. The consistent fix is `kind="ts"` with the tint dropped, but the
  tint came out of an owner-reviewed ground round and every ground change needs
  a look, so it wants an owner call plus a `build_ground_materials` re-run and
  a terrain recompile.
- **`grade_settlement_pads` does not exempt route-structure windows.**
  `grade_routes` reads `world/sources/routes/route-structures.json` and leaves
  every authored window's ground alone (`grade_routes.py:157,173`), because a
  structure stands on the ground it was measured on. `grade_settlement_pads.py`
  reads no such thing: where a settlement pad overlaps a structure window it
  moves that ground after the author has measured it and before
  `compile_route_structures` re-measures it. Since 2026-09-09 both modules take
  one measurement (`compile_route_structures.measure_window`), so the compiler
  now raises with a named cause instead of laying a deck on a grade the cap
  forbids — but the honest fix is for the pad grader to take the same exclusion
  windows the route grader takes. Cheap: it is the same window list, read from
  the same path.
- **Three route ways cannot be closed by authoring, because the line is wrong,
  not the ground** (measured 2026-09-09, blocking
  `test_no_shipped_route_structure_is_unauthored`).
  * `track.dunmer-north.riverwalk` — the catalogue records Riverwalk as a
    boardwalk village "strung along a channel because the channel is the
    street", reached from a trunk boat lane. Its access track runs 4,912 m and
    **starts at 349.6 m of altitude and ends at 32.8 m**; 488 of its 2,241
    samples are over the 12 deg track cap, and the structure author gives it 22
    windows covering **62% of the way**, including four stepped ascents of 31 to
    45 m of descent at up to 73 deg. A channel-side boardwalk village is not
    reached over a 317 m mountain. Writing a `why` sentence for it would be
    fiction under standard 12; the fix is the router or the siting.
  * `route.road.helstrom-blackrose` — a trunk road from -1.1 m to -2.5 m that
    crosses a 35 m hill at chainage 2,280 m, leaving 117 of 3,357 samples over
    the 8 deg road cap and **23 authored structures**, most of them near-zero
    end-to-end rise (a "bridge" over 18 to 130 m of surface roughness). Twenty
    three spans on one trunk road is the "staircase province" the Phase 11 gap
    plan warned about; it wants a routing look, not 23 sentences.
  * `route.road.soulrest-blackrose` — the same fault on the same corridor: a
    3,560 m trunk road between -4.8 m and 10.9 m with 62 of 1,680 samples over
    the 8 deg road cap and 4 authored windows, one of them a 355 m "bridge"
    carrying 8.4 m. Both Blackrose approaches fail the same way, which points at
    the corridor rather than at either road.
  The other 41 unauthored ways were authored on 2026-09-09 (sentences written
  against their place catalogue records and reviewed by a separate agent under
  the `text-review` skill); they sat at 14–19% window coverage with 1–5
  structures each and are ordinary authored geometry. After that pass
  `test_no_shipped_route_structure_is_unauthored` is red on **49 structures
  across these 3 ways only**, down from 116 across 44.
- **Gap plan B2's `MAX_FILL_M` hypothesis is measurably wrong — do not raise
  it.** B2 asked whether raising `grade_routes.MAX_FILL_M` from 6 m to 8 m
  would clear most over-cap windows before anyone authored them. Measured
  2026-09-09 by calling `grade_routes.grade()` (pure, writes nothing) on the
  ungraded snapshot at five values, 4 s per pass:

  | MAX_FILL_M | survivor ways | ways with stretches | over-cap stretches | over-cap m | cells filled >6 m |
  | --- | --- | --- | --- | --- | --- |
  | 6 | 38 | 43 | 112 | 1693 | 0 |
  | 8 | 38 | 40 | 98 | 1347 | 202 |
  | 10 | 37 | 38 | 94 | 1243 | 250 |
  | 14 | 37 | 38 | 94 | 1243 | 250 |
  | 20 | 37 | 38 | 94 | 1243 | 250 |

  The curve is flat from 10 m on: going to 20 m of made ground buys **one** way
  out of 38. The survivors are bench-limited (`need > r_max`: no 30 deg bench
  fits inside `MAX_SHOULDER_M`), not fill-limited, so the fill cap is not the
  lever. Raising it would bury 250 cells under more than 6 m of embankment and
  leave the authoring debt where it is. The lever, if one is wanted, is the
  shoulder budget or the routing, not the fill.

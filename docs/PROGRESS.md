# Build progress

Single source of truth for where we are in the build sequence
([world/95-build-sequence.md](world/95-build-sequence.md) §86). Read this file
first, then open only the master-plan sections the active phase needs.

## Protocol (all agents)

1. **Trust the repo over this file.** Before building on a phase marked done,
   spot-check its evidence (run the gates, check `git log`). Before anything
   else, run `git status` — a dirty tree means a previous agent stopped mid-work or is currently working.
2. **Starting work:** in one commit *before* the work itself, make the **whole
   file** consistent — set the phase row to `in progress` with a one-line
   current task **and** rewrite *Waiting on user* and *Next up* to match. Those
   two sections are what go stale: a row reading `in progress` while *Next up*
   still advertises the same phase as upcoming is the contradiction to avoid.
3. **Work in small commits.** Every commit should leave `npm test` and
   `npm run typecheck` green from the repo root.
4. **Finishing a milestone:** flip the row to `done` with one line of evidence,
   in the same commit as the finishing work — and refresh *Waiting on user* and
   *Next up* in that same commit, per rule 2.
5. **Crash recovery:** if a row says `in progress` but no agent is running, use
   `git status`, `git log -5` and the gates to decide whether to finish, redo or
   revert the partial work; then correct this file.
6. **Keep this file under ~80 lines.** Detail belongs in `docs/decisions/` or
   phase docs, not here. Prune rows for long-finished phases into one line each.

## Status

| Milestone (plan §86) | Status | Evidence / current task |
|---|---|---|
| 0 — source, era, credits foundation | done | decisions 0001–0004; credits list (root README, 0023; reviewed for completeness, notices consolidated, 0024); plan revised & renamed |
| 1a — monorepo migration, CI, deployed sandbox | done | owner playtest PASS 2026-08-22; gates green from root; Pages live |
| 1b — package boundaries and contracts | done | packages/contracts + apps/game shell + apps/world-studio; inventory/items extraction deferred to Phase 7 (plan §86) |
| 2 — province source ingest | done | anchors owner-approved 2026-08-22; conditioning/sea-level decided (0005); scale ×3 (0006); major-city road network required (§88) + candidate edges registered; community map archived w/ hash |
| 3 — province hydrology and region graph | done | owner-approved 2026-08-22 (sea/salinity/flood corrections applied; lake region class added); stats in hydrology-meta.json |
| 4 — danger, cultures, transport | done | owner-approved 2026-08-23: strong terrain, jungle region, 8 culture zones, danger model, road/boat/root graphs, climate profiles, access model (0007), lore dossiers |
| 5 — World Studio foundation | done | owner flyover gate PASS 2026-08-23 (shape/size/feel/mist approved); map+13 layers, 3D fly/orbit, click-to-spawn, reproducible URLs. (Correction 2026-08-24: chunk overlays/probe framework were NOT built at Phase 5; character-mode HUD + debug hooks now cover part of that, rest tracked in module 85) |
| 6 — province terrain (scope extended from basin to whole province at gate, 0008 addendum) | done | owner province gate PASS 2026-08-24 (6 gate rounds; bmv-v1 materials, de-terracing, north/south distinctness, mountain belts, shore types, tint slider, lanes, Blackrose channels). refine_province + 256 chunks x3 LODs in vault (chunks-manifest.json) |
| L — lore extrapolation loop (parallel workstream, module 45) | done | Packets 1–3 done (Opus, 2026-08-24): ~140-page UESP sweep, 15 new dossiers + 12 extended, gap register (~50 gaps), 4E-201 province synthesis, 10 quest-plan deltas (proposed, not applied). **Complete 2026-08-24**: 39 files (~405 kB) — full sweep, gap register ZERO open (5 DEFER technical, 7 MYSTERY intentional), per-settlement Hist placement (Phase 11 unblocked), settlement register, guilds, ecology/encounter/loot feed, 4E-201 synthesis w/ owner decisions + trauma directive woven in. 4 non-blocking Round-2 owner questions (owner-questions.md). Round-2 decisions accepted; quest-plan deltas D1-D16 APPLIED to docs/quests/ (consistency greps clean; 6 application notes in quest-plan-deltas.md). Workstream closed — future lore gaps route via module 45 process |
| 6b — province rescale + mountain relief + naturalness (0015; plan §86 Phase 6b) | done | owner walk review PASS 2026-08-25 ("absolutely perfect"). ×1/×1; sculpt stage (uplift+erosion, 651 m summit, ~257 m median belt relief, cliff benches, talus); province de-terraced + micro-undulation; classifiers recalibrated; triplanar + belts 100/280/440; fly-speed slider; 8 standing probes (test_sculpt.py). **Owner: re-review terrain feel after the water phases (8b) land** |
| 7a — physical character integration | done | owner playtest PASS 2026-08-24. Packages extracted (0013): game-core/character/character-assets, consumed by both apps; studio character mode (grounded movement only — full sandbox parity is Phase 10b, moved from 7b by 0017) on Rapier heightfield chunks (0014) behind PlayerMovementController; desktop/touch/gamepad parity; env-query contract implemented; actor registry; capability profiles + anchor-spawn validation. Feedback rounds fixed: live support plane, unified fly/walk chunk terrain + vertical-scale slider, grounded coyote debounce, gradient-map lighting (no chunk seams), FIX_INTERNAL_EDGES colliders. All gates + 33 visual probes + e2e probe green |
| N — quest-plan cast/lore/deliverability/fun review (parallel workstream, decision 0018) | done | 2026-08-25 (Opus): new `docs/quests/35-cast.md` — depth tiers, six character rules, canon naming system, rewritten principal cast (3 new: Never-Writes-Twice, Spills-The-Ink, Ahnjazzi; 2 renamed), named recurring cast for all 12 faction lines, 6 cross-line faces, oddities roster, C4 texture kit. New lore dossier `topics/labour-and-bondage.md` — **the Owing**, the province's coerced-labour institution (closes the Chainbreakers' shapeless target and the open Archein gap; `washed-out` NPC variant is free canon signposting). Cult method re-grounded on the canon **Mnemic Egg**; Hierem/Synod file moved into the main quest; Marsh Charter re-anchored on the Four Winds, Sunken Archive on folk-literacy magic + the Conclave of Baal; Nisswo *shunatei* critique of the cult added. **Delivery tiers D-A/D-B/D-C** + conversion table; all 9 chase/escort/crowd/riot beats converted. **Boredom test** added; ~12 read-and-talk quests rewritten; Act II verb-variety rule (§21b); Thorn and Umbriel lines diversified. Acceptance criteria 28–33 + cast/deliverability validator sections. **2026-08-26**: cast model realigned to UESP-mined Morrowind structure (desks/arguments, shared places + shadow networks — Owing brokerage as Camonna Tong analogue; no travelling cross-line faces); research doc `docs/research/quests-and-cast/morrowind-cast-structure.md`; 0018 addendum. **2026-08-26 (2)**: main quest sharpened (decision 0026) — visceral no-lore-assumed stakes (dead clutch, empty throne), villain leads the opening attack + Dagoth-Ur-style dreams, handler purged at Act III (Caius beat), **three player-intent endings** (CUT cult overlord / CLAIM the Scalded Throne / MEND and walk away), main line cut 32→23 quests, all boat-vs-boat pursuit replaced by manhunts, fan-favourite coverage table + LQ31 whodunit, and the **quest–world co-design loop** added to Phases 11/15 (quests 90 §65b; world 95). **2026-08-28**: full quest-plan QA review + same-day repair (decision **0030**, CLOSED — 56 findings across 9 passes: fun, cast, assets, scripting/open-world, lore, consistency, guardrails, world-bones fit, new **tier-protection hard rule** 40 §30b). Highlights: count fixed to 24; Many-Root line fully redesigned; guardrails re-marked hard-rule/strong-default/target + agents-use-own-reasoning rider; 35-cast split (35 rules / 36 roster); final boss switched to **Xal-Krona** on in-vault rigs (research/quests-and-cast/last-warden-boss-options.md); rootworm permanently never-seen; Umbriel + Varieties-of-Faith dossiers ingested |
| 8a — world time, natural light and sky | done | owner gate PASS 2026-08-26 after 8 feedback rounds (decisions 0020/**0021** = full defect→fix history; research doc §8–8d). world-time package (calendar/sun/moons/stars, verified phase cycle); physical light rig with **envelope-pinned dome** (CPU Preetham twin `preethamCpu.ts` + `skyScreenModel.ts`; whiteout/black-gap class caught by `npm test`); directional twilight (Earth shadow, Belt of Venus, magnitude-staged stars); moon-aware night floors; owner-locked defaults warmth 1.0, stars ×0.5 (~3300); CSM shadows w/ contact bias; walk+fly city markers; HUD compass. Deferred: beyond-border land apron (module 55 §98b + research doc) |
| 8b — water renderer and interaction | done | owner CLOSED 2026-08-28 (good-enough, **not perfect** — full water-systems re-review + polish queued in [polish-backlog.md](polish-backlog.md), Phase P). 7 rounds; full defect→fix history in decision 0025. Province W-field water surface, rivers/marsh/estuary/coast/underwater, buoyancy + Rapier water query, monotone slope rivers, shore surf, waterfall shading |
| 8c — weather and atmosphere | done | owner CLOSED 2026-08-30 (good-enough, **not perfect** — owner will record leftovers in [polish-backlog.md](polish-backlog.md) for Phase P). 5 rounds; full defect→fix history in decision [0032](decisions/0032-phase8c-weather-implementation-shape.md). Deterministic synoptic machine + regional expression, fair-weather coverage ladder on the calendar, rain (real-time clock, PRECIP_LAYER), wind→waves, wetness, lightning; mist/fog/cap-cloud regimes with fog colour DERIVED from the real sun/sky/moon and a dome fog march (banks visible against open sky); visibility = local weather (one number renders and publishes); **GAME_TIME_SCALE = 30** in world-time. 406 tests incl. the extended envelope proof |
| 10 — asset deep catalogue, kits, vegetation machinery (scope widened + flora ecology pulled from 13; decision 0034) | done | **Owner CLOSED 2026-09-04** ("tested and working"): trunk solidity round 10 passed (capsule sets fitted to real wood geometry, collider budget by count over a 20 m ring, correct far-tier cards, third LOD ring); full history in [decision 0036](decisions/0036-phase10-placement-decisions.md). Leftovers go to [polish-backlog.md](polish-backlog.md) |
| 11 — settlement/location system, exemplar-first (0034) | in progress | Per [0041](decisions/0041-phase11-settlement-decisions.md). DONE 2026-09-02: Part 0 (dossier/scour tooling, catalogue+blueprint schemas, compiler skeleton, renderers, 5 kits + ~15 sourced mods); Parts 1–2 (349-type taxonomy+recipes; 8-region catalogue derived, reconciled, enriched w/ relations); 5-critic adversarial review (all pass-with-fixes) + 4-region repair (rebalanced to the corrected 466–596 budget, strict fields, interior root-kit ruling, Xal-Krona lair + canon gap places). **Critique round CLOSED 2026-09-02** by the verify/wrap agent (outcome table + open items in [0041](decisions/0041-phase11-settlement-decisions.md) § Critique round OUTCOME): asset-aliases.json live so assetPlan typos are impossible; four over-budget zones rebalanced; all 236 poi countBands re-derived from actuals and the band-sum test replaced by per-type + per-ZONE budget tests; strict flipped (the five fields are simply required); 1001 socket ids normalised so standard 2 is green; per-region naming register + signature asset pool in the catalogue README. **800 records: 527 live, 272 deferred, 1 cut**, inside the 467–596 envelope. Mechanical critique smells all at zero (visual twins 121→0, region-constant vibe fields 8→0, empty vibe fields 1026→0, duplicate names 14→0, socket-less tier-0/1 40→0); re-measure with `python3 -m worldgen.critique_sample`. **Part 4 step 2 (owner feedback round) DONE 2026-09-03** — schema v2, route registry, plot rules, anchor nudges, region repair (566 live / 247 deferred), text review; touchpoint ③ open. **Touchpoint ① CLOSED 2026-09-03** — owner rulings + 3 commissioned reviews recorded in 0041 § Touchpoint ① (soft ceilings/hard floors, both strongholds plotted, dungeon ruling province-wide, D4–D5 call KEPT w/ Part 3 thinning directive, no asset purchases needed but dunmer+root kits must be BUILT before Part 6, prison-south lore coherent). Text-quality workstream commissioned (0043, docs/text/). **Part 3 macro plot DONE 2026-09-03**: all 527 live records plotted deterministically (`worldgen.macro_plot`; record in 0041 § Part 3 delivery record; report `world/sources/sites/macro-plot.md`). Visual vibe sheets rendered for the owner (`output/sheets/vibe/`, untracked). **Part 3b minor routes DONE** (owner question; `worldgen.compile_minor_routes`, 186 tracks/footpaths/boardwalks from the plot; 0041 § Part 3b). **Part 4 step 1 DONE 2026-09-03**: cold review (docs/research/phase11/phase11-plot-review.md) → 11 mechanical fixes applied, re-plotted; World Studio plotted-places layer live (`?cat=1`, minor tracks `tracks=1`). **Touchpoint ② closed, ③ handed to the owner** (see Waiting on user). **Round 4 DONE 2026-09-04** (second feedback list; 0041 § round 4): province-wide generaliser ceilings + set-level convergence rules (0 hard hits, generalisers 13.5 → 1.3/1k words), network-role consistency with cuts, wider road clearance, hostility rebalance on/off route, quest total reconciled (550–740), Part 5 exemplar proposal written. **Round 3 DONE 2026-09-04** (0041 § round 3): studio quest filters/minimap/route clicks/minor waterways; prose linter (npm-test gate, zero hard hits) + third text pass seeded from Morrowind; 240 consistency findings resolved (terrainRequests, typed siting); hostility-frequency report + gap fills; quest skeleton as data (715 rows, docs/quests/index generated); vault kits. Touchpoint ③ round 3 handed to the owner. **Round 5 DONE 2026-09-04** (0041 § Part 5 decision + round 5): the 'trying too hard' class → style guide §2.8, five hard + six soft linter rules, `text-review` skill, twelve reviewer agents over every live record/quest row/string (677 hard hits → 0, place records in reference register, no second person). **Part 5 DECIDED** from the vegetated chunks: Lilmoth, Nine-Trunks, Mazzatun, The Standing Charge, The Licensed Stage. **Part 6 MESO DONE** for all five: dossiers, 2–3 candidates each, designs, blueprints (kit sets, measured assetRefs, stable ids) validating + compiling 0 errors + rendered; Round A packet handed to the owner (`docs/research/phase11/phase11-part6-round-a.md`). **Round A follow-up DONE 2026-09-05** (owner list; 0041 § Round A follow-up): `apply_sitings` write-back (moved places move their dot, paths, waterways; incremental, pins applied after the solve); real footprints from the kit meshes + every parcel authored as centre/piece/yaw/why (footprint derived, validator-enforced); interactive blueprint view in World Studio (`?bp=1&blueprint=<slug>`); both sourcing gaps filled from the vault + gap register (G3 licence board OPEN); placement playbook = world module 96; zero-relative + soft-idiom bans (hard linter rules, 0 hits); kit node-name truncation root-caused, 13 kits rebuilt. All five blueprints re-authored, compiling clean. **Round A feedback DONE 2026-09-05** (0041 § Round A feedback): blueprint schema v2 (why blocks, approaches, scale grounding, ways as waypoints routed by `street_router`, fences, stacksOn/abuts/spans, interiors from the kits, `networkTerminals` stitched to the province roads), seven compile-time integration checks, **module 97 placement principles** (evidence-tagged; 15 owner sense-check items; §G gaps, nine closed), research (mined settlement-form evidence, online sources, approach & wayfinding, building rendering treatments + Round B checklist), studio view on the base map with whys on click + `?bpground=1`, markers from data, route grading + gradient routing (35 steep survivors need authored geometry), standard 13, fill-now sourcing (G3 done), `docs/research/` reorganised into ten folders, Fable-plans/Opus-delivers model policy. All five blueprints re-authored in full, audited against 97, compiling clean. **Round A is with the owner again** (see Waiting on user). **Assemblies round DONE 2026-09-05** (0041 § Assemblies round): 14 composite assemblies per kit snap rules, doorways joined from the mined templates (9 → 22 of 75 enclosed pieces), doors only on derived doorways (HARD) and drawn in the studio, five blueprints re-authored on the composites; 35 steep routes covered by authored stairs/decks (`route-structures-v1`, 162 structures, survivors 0), chain rebuilt; Lilmoth's lanes end at the quay, minor channels loadable as terminals; §G G1/G3/G4/G5/G6 closed. **Doors + promise rounds DONE 2026-09-06** (0041 § Doors round, § Promise ledger; 97 E5/E9): hollow props demoted by a front-face criterion, 49 of 49 buildings with an interior have a derived doorway and a linked interior kit (two vanilla interior kits built), doors only on derived doorways and facing their way (HARD), `--orient` turns a building from its door; typed `services[]` on 149 records + `blueprint_promises` ledger as a compile gate, all five blueprints 0 errors with every promise met (Lilmoth gained seven service buildings). Round B massing NOT started — gated on the owner approving a place in Round A. Freeze stays gated on 10b/10c |
| 12 — dungeon/interior system, exemplar-first (0034) | todo | may interleave with 11 |
| 9 — swimming, climbing, boats (re-slotted after the placement exemplars; 0034) | todo | player craft only — ferry/fast travel is Morrowind-style world content (Phase 11); thin swim slice may pull earlier; boats may slip. **The swim slice BUILDS the underwater set dressing** (submerged scatter band, wreck/submerged-ruin statics, one wreck place) on its exemplar — owner 2026-09-04, world 95 Phase 9 / 65 |
| C — parallel combat workstream (sandbox; feeds 10b) | implementation complete: round 10 playtest pending | **Round 10 (2026-09-06):** shared shoulder-view default; sensor-only arrow flight with swept-tip contact on posed skin; crosshair/lock-on ballistic aiming; string nock tracking, drawing-hand constraint and sourced quiver fetch; looping foot-anchored bow strides; animated-mesh culling fix; 1.55× locked stride rate and sourced backward runs. `npm test`, typecheck and all 11 ranged/locked locomotion scenarios pass on the deployment snapshot. Owner requested deployment for playtesting. Details and earlier rounds: [0040](decisions/0040-animation-packs-and-combat-parallel-pass.md). |
| 10b — full portable-sandbox parity in studio (was 7b; moved 2026-08-25, decision 0017) | todo | Scene orchestration extraction (§53), inventory/equipment UI, enemies/targeting, bow, navmesh; combat-space probes then validate + freeze the 11/12 exemplar packets; **incl. fixes to shared combat internals** (owner 2026-08-29: good-enough, not perfect — specifics at kickoff) |
| T — text quality (parallel workstream, decision [0043](decisions/0043-text-quality-workstream.md)) | done | 2026-09-03: `docs/text/` shelf built — binding [style guide](text/style-guide.md) (house rules, the Morrowind voice, per-surface rules), [eight culture registers](text/culture-registers.md), [review process](text/review-process.md). Voice derived from ~50 UESP Morrowind dialogue/book pages; every rule cites its page. Closes the three unbuilt stages of quests 60 §45e. Spelling: **British**, owner ruling 2026-09-03 (Morrowind's own text is American; recorded in the style guide) |
| S — stats, progression and character-systems **design** (parallel workstream, module 76; decision 0019) | done | **Four owner rounds, all closed** — shape ([0031](decisions/0031-workstream-s-round1-shape.md)), design + numbers ([0033](decisions/0033-workstream-s-design-and-numbers.md)), round-3 corrections ([0035](decisions/0035-workstream-s-round3-attributes-and-pace.md)), and the round-4 QA rulings ([0037](decisions/0037-workstream-s-round4-qa-rulings.md)): practice discount cut, kill-based class-weighted armour accrual, repeat-target damping removed, lockpick wear, **poise reinstated on the DS1 model**, pace target restated. Live artefacts: **module 76 §116–129** (the spec), decisions 0019/0031/0033/0035/0037, `tooling/stats-sim/` (**19 invariants, all holding**, including a Morrowind known-answer test) and one evidence packet; the workstream's five working papers are archived under `docs/research/archive/workstream-s/` and the tuning history is `tooling/stats-sim/FINDINGS.md`. Phase 10c implements it |
| 10c — stats and progression implementation (module 76; decision 0019) | todo | Implements workstream S in `packages/game-core` incl. the semantic-authoring compiler (ladder refs → numbers; extended to loot/traps). After 10b, **before packet freeze and Phase 13** — content in 11/12 authors semantically without it (0019 4th amendment; 0034) |
| 13 — fauna ecology, encounters, fixed loot (exemplar-first; flora half moved to Phase 10 by 0034) | todo | |
| 12b — province soundscape (module 57; polish tier — 0023, hardened by 0034) | todo | runs in the P window **after 13** (authors creature calls/ambience *from* the ecology data); must land before 14 locks budgets; may pull earlier |
| P — general polish pass (rolling backlog, added 2026-08-28) | in progress | Water completion beyond candidate1af32a3: loading699c355 and particle-radiance55d2ebc hotfixes deployed; full native bank/terrain topology, bounded adaptive LOD, spectral weather response and local displacement simulation in progress. All original/deferred/follow-up requirements remain tracked in [water-completion-audit.md](research/rendering/water-completion-audit.md); no full-quality acceptance claimed. Original tide/season amplitudes retained. Other polish stays in [polish-backlog.md](polish-backlog.md). |
| 14 — streaming and deployment | todo | |
| 15 — rollout by region packet (recast from "expansion by watershed" by 0034) | todo | opens by drafting the packet roadmap for owner sign-off |

## Waiting on user

**Fresh agent continuing water work: start with [water-handoff.md](research/rendering/water-handoff.md).**
It identifies the live version, local checkpoints, complete checklist, next
actions, verification gaps and release safeguards. Update it alongside work.

Water completion pass is active: owner requests all deferred water upgrades,
including open-sea quality and bounded near/far runtime costs, implemented and
deployed before review. The earlier candidate is not the completion gate.
See [the review guide](research/rendering/water-quality.md).
Release coordination: the water agent will commit only water-owned paths and
will coordinate against current branch/Actions state before deployment;
combat changes remain separately owned and must not be overwritten.
Latest verified deployment: `93904c2`, Actions `34047707975`, live bundle
`index-IZqpLs8B.js` (17:11UTC). It includes the HDR particle fix, interaction simulation,
caustics, spectral waves, bounded rendering, confluence query fix and bubbles.
Public water metadata still matches the original `1af32a3` overhaul: **the
final hydraulic/native/adaptive/gradient data is not deployed**. Never promote
older diagnostic bundles or bypass combat asset verification.

All requirements and follow-up defects remain in
[the acceptance checklist](research/rendering/water-completion-audit.md),
including the new live zigzag/unsupported-water repro3840m E/1120m S.
That location is seasonal standing wetland water, not a nearby native ribbon;
final checks must cover both rendering paths and physical wet/swimming queries.
Current compiler blockers: coherent pool ownership/spill domains, exact
carver-authored rivulet footprints, and bounded connected-reach feasibility.
Pool/route/terrain changes require a fresh coherent audit; stale cached pool
occupancy must not justify further cutting. Preserve original retaining banks,
authored tidal/seasonal ranges and every actual carved channel.
Compiler source checkpoint passes86 focused Python tests; unresolved final
hydraulic constraints remain explicit and no diagnostic assets are promoted.
Strict preservation audit restored244 breached original rims and1,103
unnecessary submerged floor cuts: all423,268 originally wet impoundment samples
retain identical spill potential/coverage and their original planes. Latest
coherent checkpoint still has356 channel constraints. See the handoff for
authoritative inputs and the retaining-support/artificial-anchor work next.

Local rendering follow-up fixes finest-LOD owner strips using exact partitions
and one-sided vertex fields; zigzag equal/different-head coverage tests pass.
The artifact gate now checks actual vertex-interpolated heights and all three
named repro neighbourhoods. Shared edge stitching, stage-aware refinement and
accurate mixed-batch memory accounting are in progress; production budget
regressed during development and must pass before promotion. Exact ownership
requires the final native-coverage data contract, not legacy continuous rasters.
Following the owner's usage request, use focused tests and short failure
summaries during iteration; reserve full gates for a coherent release candidate.

Latest deployed runtime checkpoint: matched sparse terrain-gradient support; real-time transport
separate from accelerated wave phase; bounded full-interval ripple/particle
motion; gravity-consistent waterfall spray; gradual shared wave-energy response;
native fragment clipping also for standing/coastal shores. Tests/types pass17:06
(708 game-core tests; final-artifact gate intentionally skipped without final
data), airborne passes again. Actual GPU3m/s ripple transport agrees at60/2.5FPS;
32 shoreline-depth cases pass. Full/mip gradient pixels and disposal pass.
Fly loading retains macro terrain until detail exists: local scene had15 actual
ground meshes/1.103M triangles with compiled material by45s; this is loading
evidence, not instantaneous startup or hardware-FPS proof. Missing optional
manifests get real dev/preview404s; malformed data still rejects. Runtime bundle
matches the Actions artifact and public metadata hash is unchanged. Final
matching data, remaining fixes and visual acceptance remain pending.

- **Phase 11 Part 7 Round A — second look, in the studio** (2026-09-05). Read
  [research/phase11/phase11-part6-round-a.md](research/phase11/phase11-part6-round-a.md)
  (what changed since your first look, the per-place questions) and, for the
  sense check you asked for, the closing list of
  [world/97-placement-principles.md](world/97-placement-principles.md) (15
  decisions) plus [research/phase11/phase11-round-a-audit.md](research/phase11/phase11-round-a-audit.md)
  §7 (principles that fought each other in practice). In the deployed studio:
  tick **Blueprints** (or `?bp=1&blueprint=lilmoth` etc.), click things for
  their whys; in walk mode tick **bp ground** to walk the outlines. Also check
  the road on foot where it climbs (route grading; the 35 survivors are listed
  in `world/sources/sites/route-grading.md` with their remedies). Answer per
  place; Round B (massing) starts on the first place you approve, against the
  Round B rendering checklist in
  [research/rendering/building-placement-rendering-treatments.md](research/rendering/building-placement-rendering-treatments.md) §3.
  **Since your first look** (assemblies round, 0041 § Assemblies round): huts
  now carry their doors as one assembly and every door sits on a doorway the
  kit really ships (gold/blue-green ticks on the outlines); steep roads show
  hatched stair/deck spans in the routes layer; Lilmoth's boat lanes reach the
  quay. **Three calls for you:** (a) the province plot is *more even than
  random* (Clark–Evans R ≈ 1.8 per zone, hand-placed worlds ≈ 0.5) — fixing it
  is a re-solve that moves places, so say whether to run it before or after
  the exemplars; (b) the Imperial gate tower and the Ayleid stair block measure as solid
  masses with no opening or door anywhere in their source, so they now stand
  as masses (no interior) — say if either must be enterable, which means a
  different piece; (b2) Argonian records no longer promise a `temple` (the
  Hist court is the sacred ground; Lilmoth, Stormhold, Thorn, Helstrom and
  Archon changed) — confirm; (c) the hostile-or-clearable floor sits at 55.5 % against a hard
  55 % — any hostile cut needs a matching promotion, against the
  Round B rendering checklist in
  [research/rendering/building-placement-rendering-treatments.md](research/rendering/building-placement-rendering-treatments.md) §3.
  **A fresh agent continues from here**: start with PROGRESS, 0041 § Round A
  feedback, module 96 §1 and module 97.

- **Combat round 10 visual acceptance:** playtest the deployed sandbox after publication. Check gentle upward shots, locked-on hits, arrows sticking to visible surfaces without floating beside bodies, quiver fetch and full-draw geometry, sustained movement with the bow drawn, idle visibility and backward running. Shoulder view and 1.55× locked stride rate are now defaults. Automated gates pass; visual acceptance remains with the owner.

- **8c polish leftovers** — the owner closed 8c good-enough and will record
  the leftover items in [polish-backlog.md](polish-backlog.md) themselves
  (Phase P). Nothing is blocked on this.
- **Workstream S — closed after the round-4 QA review** (2026-08-30): the
  owner's rulings are folded in ([0037](decisions/0037-workstream-s-round4-qa-rulings.md))
  and the harness holds 19/19 including the Morrowind known-answer test.
  Nothing is blocked on a reply.
- **6b terrain-feel re-review** — owner closed 8b (2026-08-28) without
  explicitly confirming the terrain-feel re-check that was bundled into that
  pass. Confirm it's fine, or drop issues into
  [polish-backlog.md](polish-backlog.md); nothing is blocked on it.

(There is no "next up" section: the first `todo` row above is what's next.
Phase-ordering rationale lives in the plan §86, not here.)

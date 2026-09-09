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
| 10 — asset deep catalogue, kits, vegetation machinery (scope widened + flora ecology pulled from 13; decision 0034) | done | **Owner CLOSED 2026-09-04** ("tested and working"): trunk solidity round 10 passed (capsule sets fitted to real wood geometry, collider budget by count over a 20 m ring, correct far-tier cards, third LOD ring); full history in [decision 0036](decisions/0036-phase10-placement-decisions.md). **Vegetation went province-wide 2026-09-07 as a side effect of the terrain chain (`1b79517`), accepted by the owner 2026-09-08 and recorded in 0036 with a regional-variety widening (39 → 65 species).** Leftovers go to [polish-backlog.md](polish-backlog.md). **2026-09-09: the between-region density ladder was re-based and gated ([0048](decisions/0048-vegetation-density-ladder.md)) — the jungle held at its shipped level by owner constraint, every other class re-based around it, 51% fewer trees province-wide. PENDING: the flora kit rebuild and `compile_scatter` have NOT been run, so `test_vegetation_ladder::test_delivered_ladder` is red on purpose until they are.** |
| 11 — settlement/location system, exemplar-first (0034) | in progress | Per [0041](decisions/0041-phase11-settlement-decisions.md). Parts 0–5 done 2026-09-02/04 (taxonomy, 800-record catalogue, macro plot, minor routes, studio layers, text workstream, five exemplars chosen); Part 6 meso + Round A packet (2026-09-04/05); Round A follow-up, feedback, assemblies, doors and promise rounds (2026-09-05/06) — all recorded in 0041 round by round. **Review 2026-09-07** (0041 § Review 2026-09-07): every round claim checked against the code; fixes landed (studio labels/outlines, standard 13 as a real gate, prose linter in `npm test`, canal/door sightline/built-kit rules, two hut interior kits, road-grading rim fix, agent definitions for the model policy); what is still open is the batch plan in [research/phase11/phase11-gap-plan.md](research/phase11/phase11-gap-plan.md). Round B massing is batch B1 of that plan (not blocked on a Round A approval; blocked only on the water pass in the studio scene files). Freeze stays gated on 10b/10c | **Gap-plan QA + owner asks 2026-09-09** (0041, [0048](decisions/0048-vegetation-density-ladder.md)): gap-plan claims re-audited against the code — prose gate was blind to quests, B3 drift guard untestable, two modules with no live consumer, and six wrong numbers, all fixed. Vegetation: tree-density ladder re-based so the jungle is actually the densest canopy (jungle held at the owner's approved level, others scaled to it, ~-51% province-wide); flora kit 81->108 and groundcover kit 7->34 assets; grass given a region axis; every region has >=2 plants no neighbour carries. Colliders: leaf cards no longer fitted as solid wood (mangrove 4.4x->1.27x of trunk girth, worst tree 10.9m->2.08m) and silhouette-fallback plants (bamboo/banana) made walk-through. Places: typed footprintRadiusM on all 350 types derived from BUILT GROUND, typed proximity on 72 types read from their own siting prose, isolation measured as Tobler climb effort not plan distance; dry-run re-solve 580/580, zero siting violations, median nearest-neighbour 85->136 m. **Held on the water pass:** `macro_plot --resolve-all` + `apply_sitings`, and `compile_scatter` + vegetation export — both must run against final water (B5 timing); `test_delivered_ladder` is intentionally red until the scatter rollout.
| 12 — dungeon/interior system, exemplar-first (0034) | todo | may interleave with 11 |
| 9 — swimming, climbing, boats (re-slotted after the placement exemplars; 0034) | todo | player craft only — ferry/fast travel is Morrowind-style world content (Phase 11); thin swim slice may pull earlier; boats may slip. **The swim slice BUILDS the underwater set dressing** (submerged scatter band, wreck/submerged-ruin statics, one wreck place) on its exemplar — owner 2026-09-04, world 95 Phase 9 / 65 |
| C — parallel combat workstream (sandbox; feeds 10b) | done: measured reach + bow/race corrections | All 35 melee weapons and 245 attacks measured from mounted geometry and sourced motion. Bow sight uses a 5° elevation, locked aim centres once then detaches to mouse input, and stationary bow turns pivot around a planted sole. Ten playable bodies use distinct Skyrim-authored NPC FaceGen, FaceTint, skin/hair colour and body-weight data. Mixed FaceGen transforms are normalized, bodies match `NAM7` weight, beast races use their own textures, translucent overlays retain alpha, and ordinary enemies no longer receive a test tint. Root tests/typecheck, all ranged/lock visual scenes and close/full-body inspection of every race pass. See [0040](decisions/0040-animation-packs-and-combat-parallel-pass.md) round 13 and [FaceGen pipeline research](research/combat-and-systems/skyrim-facegen-runtime-pipeline.md). |
| 10b — full portable-sandbox parity in studio (was 7b; moved 2026-08-25, decision 0017) | todo | Scene orchestration extraction (§53), inventory/equipment UI, enemies/targeting, bow, navmesh; combat-space probes then validate + freeze the 11/12 exemplar packets; **incl. fixes to shared combat internals** (owner 2026-08-29: good-enough, not perfect — specifics at kickoff) |
| T — text quality (parallel workstream, decision [0043](decisions/0043-text-quality-workstream.md)) | done | 2026-09-03: `docs/text/` shelf built — binding [style guide](text/style-guide.md) (house rules, the Morrowind voice, per-surface rules), [eight culture registers](text/culture-registers.md), [review process](text/review-process.md). Voice derived from ~50 UESP Morrowind dialogue/book pages; every rule cites its page. Closes the three unbuilt stages of quests 60 §45e. Spelling: **British**, owner ruling 2026-09-03 (Morrowind's own text is American; recorded in the style guide) |
| S — stats, progression and character-systems **design** (parallel workstream, module 76; decision 0019) | done | **Four owner rounds, all closed** — shape ([0031](decisions/0031-workstream-s-round1-shape.md)), design + numbers ([0033](decisions/0033-workstream-s-design-and-numbers.md)), round-3 corrections ([0035](decisions/0035-workstream-s-round3-attributes-and-pace.md)), and the round-4 QA rulings ([0037](decisions/0037-workstream-s-round4-qa-rulings.md)): practice discount cut, kill-based class-weighted armour accrual, repeat-target damping removed, lockpick wear, **poise reinstated on the DS1 model**, pace target restated. Live artefacts: **module 76 §116–129** (the spec), decisions 0019/0031/0033/0035/0037, `tooling/stats-sim/` (**19 invariants, all holding**, including a Morrowind known-answer test) and one evidence packet; the workstream's five working papers are archived under `docs/research/archive/workstream-s/` and the tuning history is `tooling/stats-sim/FINDINGS.md`. Phase 10c implements it |
| 10c — stats and progression implementation (module 76; decision 0019) | todo | Implements workstream S in `packages/game-core` incl. the semantic-authoring compiler (ladder refs → numbers; extended to loot/traps). After 10b, **before packet freeze and Phase 13** — content in 11/12 authors semantically without it (0019 4th amendment; 0034) |
| 13 — fauna ecology, encounters, fixed loot (exemplar-first; flora half moved to Phase 10 by 0034) | todo | |
| 12b — province soundscape (module 57; polish tier — 0023, hardened by 0034) | todo | runs in the P window **after 13** (authors creature calls/ambience *from* the ecology data); must land before 14 locks budgets; may pull earlier |
| P — general polish pass (rolling backlog, added 2026-08-28) | in progress | **Water round 2, 2026-09-08 ([0047](decisions/0047-water-one-physical-model.md))**: owner review of the 2026-09-07 rescue failed most inland sites; root causes measured (levels painted by masks not floods, half-texel raster misregistration, season lift gated on dry-season data, coarse-cell carving, slopes declared waterfalls). Delivering: `worldgen/channels.py` + full-res flood compile + signed-depth raster, whitewater strips / cliff-only falls / terrain-cut shorelines / visible river flow in the renderer, invariant tests + one-session probe, vegetation rollout record, **terrain-chain speed-up (incremental stage skipping + parallel chunk stages; runs after the current chain completes)**, Water Pro transfers (0047 study §6), waterfall rework on vanilla textures + stack rules (0047 addendum). Sea, caustics, underwater, interaction and the deep basin passed and are kept. **Delivered 2026-09-08 evening** — every item measured in the [evidence ledger](research/rendering/water-round2-evidence.md): a sea-draining river reaches the sea, a fall may land in a body, a fall must be a cliff (16 cascades, all 74–88°, two ramps demoted to strips), plunge pools scoured by their own drop, hovering edges 32 → 1 (pinned), the two gates that could not fail on their own defect rewritten, the probe teleports (17 sites in 31 min), route structures fully authored (38 sentences), and the prose linter's two blind surfaces closed. Remaining water rows in [polish-backlog.md](polish-backlog.md); the authored local-hydrology contract is the next water piece |
| 14 — streaming and deployment | todo | |
| 15 — rollout by region packet (recast from "expansion by watershed" by 0034) | todo | opens by drafting the packet roadmap for owner sign-off |

## One session picks this up (2026-09-09)

Two sessions were running in one working copy and are now consolidated into
one. Everything below is committed; nothing is half-written. Work it in this
order — the reasons are dependencies, not preference.

1. **Finish the chain optimisation.** A one-dock edit cost a **461 s** full
   province rebuild, and we paid it repeatedly last night. The fast path (patch
   the graded heightfield with the local carves, rebuild only the tiles they
   touch, `compile_water` stays whole at 68 s) and a **chain lock** are in
   flight; the acceptance test is a **byte-identical diff against a full run**
   for the same edit. Do this first because everything after it rebuilds.
   Two more cases worth taking while you are there: a compile-only change (the
   wetted width moved no ground yet still took a full chain) should not
   invalidate the terrain, and grading is cumulative on the carve, so a grader
   change needs `--from refine_province` when a stored pre-grade heightfield
   would let it start at `grade_routes` and save 220 s.
2. **Close the water leftovers** — [water-handoff.md](research/rendering/water-handoff.md)
   § what is left. Falls' crest and drawn width are settled; open are the
   6.5 km² of class raster that is dry in every season, 876 of 3,071 major-lane
   cells under a canoe's 0.6 m, and the `CLASS_EXT_PX` radius question.
3. **Phase 11's gap fill** — [phase11-gap-plan.md](research/phase11/phase11-gap-plan.md).
   **B13 carries the paused session's whole plan** (the per-consumer season
   design, the marsh-credit deletion, the single accessor, the D1 hostility
   floor, what is queued against water); **B12** is the grader change that was
   reverted with its acceptance test.
4. **The rollout that is held, in this order**: `macro_plot --resolve-all` +
   `apply_sitings`, then `compile_scatter` and the vegetation export. The plot
   moves records, so the scatter must follow.
   `test_vegetation_ladder::test_delivered_ladder` is intentionally red until
   it runs.
5. **Place spacing and tree density** ride on 4 — both were re-based last night
   (decision 0048, the flora kit 81 → 108 assets, groundcover 7 → 34) and are
   waiting on the same rollout.

**Before splitting into two sessions again**, move to separate git worktrees:
almost every collision was one session's *uncommitted* work breaking the
other's *runs*. One blocker first — the asset vault resolves relative to the
checkout, so a worktree looks for it in the wrong place; `ES_VAULT_ROOT` is the
override and nothing uses it.

## Waiting on user

Measured weapon reach is ready for deployed playtest (0040, round 13). Bow corrections remain delivered.

**Water round 2 — ready for your review.** Every number is in the
[evidence ledger](research/rendering/water-round2-evidence.md), one row per
item you raised. In the deployed studio
(`https://jtattersall09403.github.io/elder-souls-argonia/studio/`):

- **The waterfalls** are the change to look at. Two of the twenty were long
  51° hillsides wearing a curtain of water; the sixteen that remain are all
  74–88° cliffs, drawn at the width of the water rather than the width of the
  trench, with their crest following the rock and their plunge pools scoured
  by their own drop. Stand at the gorge fall: `?view=character&x=2.53&z=0.32&t=12:00`
- **The marsh season**: `?view=character&x=1.50&z=5.28&t=09:00`, then `&wet=1`
  and `&wet=-1`.
- **The lowland river**: `?view=character&x=1.85&z=4.89&t=12:00`
- **The sea, calm and storm** — worth a fresh look, the wave model changed:
  `?view=fly3d&cam=orbit&x=6.16&z=5.07&t=12:00`, and the same with `&w=storm`.
- **The beach**: your coordinate was 40 cm out into the sea; the sand starts
  20 m east at `?view=character&x=6.12&z=1.638&t=12:00`.

One question for you when you have looked: our falls read warm ivory rather
than neutral white, and that is the world's midday sun at your locked warmth
of 1.0, not the water. Say if you want white water against grey rock.

- **Phase 11 — review of 2026-09-07 closed; next: "Phase 11: deliver gap-filling plan".**
  Both passes are recorded in [0041 § Review 2026-09-07](decisions/0041-phase11-settlement-decisions.md)
  (claim ledger; the second pass: one entrance and a derived front per piece,
  player purposes on every door, six tool defects fixed, eight principle
  decisions, gates sourced, Lilmoth re-laid to 0 compile errors) and the
  batch plan is [research/phase11/phase11-gap-plan.md](research/phase11/phase11-gap-plan.md).
  All the owner's Round A rulings are applied and in the Taste ledger; the
  Round A owner-eye review is [research/phase11/phase11-round-a-owner-eye-review.md](research/phase11/phase11-round-a-owner-eye-review.md).
  Check in the deployed studio when convenient: far names fade and hide
  behind hills; "bp ground" outlines sit on the ground; each building shows
  one red door tick and no yaw stub.

- **Combat:** measured reach, bow corrections and distinct Skyrim FaceGen races are complete; deploy for owner review. Phase 10b remains the separate studio-integration step.

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

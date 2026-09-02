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
| N — quest-plan cast/lore/deliverability/fun review (parallel workstream, decision 0018) | done | 2026-08-25 (Opus): new `docs/quests/35-cast.md` — depth tiers, six character rules, canon naming system, rewritten principal cast (3 new: Never-Writes-Twice, Spills-The-Ink, Ahnjazzi; 2 renamed), named recurring cast for all 12 faction lines, 6 cross-line faces, oddities roster, C4 texture kit. New lore dossier `topics/labour-and-bondage.md` — **the Owing**, the province's coerced-labour institution (closes the Chainbreakers' shapeless target and the open Archein gap; `washed-out` NPC variant is free canon signposting). Cult method re-grounded on the canon **Mnemic Egg**; Hierem/Synod file moved into the main quest; Marsh Charter re-anchored on the Four Winds, Sunken Archive on folk-literacy magic + the Conclave of Baal; Nisswo *shunatei* critique of the cult added. **Delivery tiers D-A/D-B/D-C** + conversion table; all 9 chase/escort/crowd/riot beats converted. **Boredom test** added; ~12 read-and-talk quests rewritten; Act II verb-variety rule (§21b); Thorn and Umbriel lines diversified. Acceptance criteria 28–33 + cast/deliverability validator sections. **2026-08-26**: cast model realigned to UESP-mined Morrowind structure (desks/arguments, shared places + shadow networks — Owing brokerage as Camonna Tong analogue; no travelling cross-line faces); research doc `docs/research/morrowind-cast-structure.md`; 0018 addendum. **2026-08-26 (2)**: main quest sharpened (decision 0026) — visceral no-lore-assumed stakes (dead clutch, empty throne), villain leads the opening attack + Dagoth-Ur-style dreams, handler purged at Act III (Caius beat), **three player-intent endings** (CUT cult overlord / CLAIM the Scalded Throne / MEND and walk away), main line cut 32→23 quests, all boat-vs-boat pursuit replaced by manhunts, fan-favourite coverage table + LQ31 whodunit, and the **quest–world co-design loop** added to Phases 11/15 (quests 90 §65b; world 95). **2026-08-28**: full quest-plan QA review + same-day repair (decision **0030**, CLOSED — 56 findings across 9 passes: fun, cast, assets, scripting/open-world, lore, consistency, guardrails, world-bones fit, new **tier-protection hard rule** 40 §30b). Highlights: count fixed to 24; Many-Root line fully redesigned; guardrails re-marked hard-rule/strong-default/target + agents-use-own-reasoning rider; 35-cast split (35 rules / 36 roster); final boss switched to **Xal-Krona** on in-vault rigs (research/last-warden-boss-options.md); rootworm permanently never-seen; Umbriel + Varieties-of-Faith dossiers ingested |
| 8a — world time, natural light and sky | done | owner gate PASS 2026-08-26 after 8 feedback rounds (decisions 0020/**0021** = full defect→fix history; research doc §8–8d). world-time package (calendar/sun/moons/stars, verified phase cycle); physical light rig with **envelope-pinned dome** (CPU Preetham twin `preethamCpu.ts` + `skyScreenModel.ts`; whiteout/black-gap class caught by `npm test`); directional twilight (Earth shadow, Belt of Venus, magnitude-staged stars); moon-aware night floors; owner-locked defaults warmth 1.0, stars ×0.5 (~3300); CSM shadows w/ contact bias; walk+fly city markers; HUD compass. Deferred: beyond-border land apron (module 55 §98b + research doc) |
| 8b — water renderer and interaction | done | owner CLOSED 2026-08-28 (good-enough, **not perfect** — full water-systems re-review + polish queued in [polish-backlog.md](polish-backlog.md), Phase P). 7 rounds; full defect→fix history in decision 0025. Province W-field water surface, rivers/marsh/estuary/coast/underwater, buoyancy + Rapier water query, monotone slope rivers, shore surf, waterfall shading |
| 8c — weather and atmosphere | done | owner CLOSED 2026-08-30 (good-enough, **not perfect** — owner will record leftovers in [polish-backlog.md](polish-backlog.md) for Phase P). 5 rounds; full defect→fix history in decision [0032](decisions/0032-phase8c-weather-implementation-shape.md). Deterministic synoptic machine + regional expression, fair-weather coverage ladder on the calendar, rain (real-time clock, PRECIP_LAYER), wind→waves, wetness, lightning; mist/fog/cap-cloud regimes with fog colour DERIVED from the real sun/sky/moon and a dome fog march (banks visible against open sky); visibility = local weather (one number renders and publishes); **GAME_TIME_SCALE = 30** in world-time. 406 tests incl. the extended envelope proof |
| 10 — asset deep catalogue, kits, vegetation machinery (scope widened + flora ecology pulled from 13; decision 0034) | in progress | **Round 9 DELIVERED 2026-09-01, awaiting owner playtest** (record: round-9 section atop [decision 0036](decisions/0036-phase10-placement-decisions.md)). Canopy PASSED at round 7. Round-8 walk-through root-caused: the dominant cause was the collider BUDGET, not the shape — 96 instances within 45 m against up to 1,411 solids in a thicket, so cover ran out ~12 m out while the rebuild waited for 12 m of walking. Budget now counted in colliders (2,500) over a 20 m ring, with `coveredRadiusM` reported honestly and rebuild at 55% of it. Shape: `trunk_chain` moulds a capsule chain to the real trunk volume for EVERY tree (axis-tracking, foliage-rejecting; ≤16 shapes/species), and composite parts can be marked `solid` so the giants' buttress roots collide. Base radii still match the 50 signed-off capsules. |
| 11 — settlement/location system, exemplar-first (0034) | in progress | **KICKED OFF 2026-09-02** per [decision 0041](decisions/0041-phase11-settlement-decisions.md) (plan revised same day: sequencing split, forward-compat contracts, door-reachability rule, static perf budgets, non-uniform density). Current task: Part 0 items 1/2/6a + catalogue schema, fan-out per plan. Packet freeze stays gated on 10b probes + 10c numbers. NOTE: a parallel agent owns tree-collider solidity (Phase 10) — keep off vegetation-collider files |
| 12 — dungeon/interior system, exemplar-first (0034) | todo | may interleave with 11 |
| 9 — swimming, climbing, boats (re-slotted after the placement exemplars; 0034) | todo | player craft only — ferry/fast travel is Morrowind-style world content (Phase 11); thin swim slice may pull earlier; boats may slip |
| C — parallel combat workstream (sandbox; feeds 10b) | round 4 delivered, awaiting owner playtest | **Round 2 delivered 2026-08-31** on the owner's 15-item feedback list (record: [0040](decisions/0040-animation-packs-and-combat-parallel-pass.md) round-2 section). First-person bow camera, bow zoom under lock-on, arrow flight model rebuilt (weathercocking + damping), per-weapon hit and parry volumes from measured mesh geometry (`combat/hitVolume`), riposte queueing, split hitbox debug switches, inventory item panel + paper doll + declarative armour hiding, poise surfaced in item stats, **contact-window measuring tool root-caused and fixed** (non-idempotent world-matrix build) with two-handed windows and per-family parry windows re-measured off it, and the parry mod's own clips on greatsword/shield plus a new battleaxe parry. Round 1 = the animation-pack split, crouch, shield block, poise, two-handed movesets. **Round 3 (same day): the execution blocker cleared** — the critical audit tool was root-caused (three modelling errors), now reproduces the hand-audited one-handed riposte to within a frame under `critical-known-answer.test.mjs`, and the greatsword and battleaxe have their own executions. Head hidden (not shrunk) in first person, camera on the eye. Still **not available: per-weapon backstabs** (no back-facing source exists in vanilla or any mod). **Round 3 (2026-09-01, four owner goals):** crouch now lowers the *navigation* capsule (shrinks upward, soles pinned — `physics/stanceCapsule`); **attack movement taken from the feet** rather than an authored lunge (`locomotion/footAnchoredMotion`, measured into each clip's `groundTrack` at build time; reversible from the debug panel); **weapon-aware enemy AI** (`ai/weaponTactics` — ranges/aggression/circling derived from the weapon, a separate intent set and real ballistic aiming for bows) with six new archetypes pickable in the sandbox; **per-weapon backstabs** assembled from each weapon's execution plus a from-behind victim stagger. Gates green; `visual:check` passes for criticals, defense, attacks, evasion, locomotion and ranged. **Round 4 (2026-09-01, the owner's playtest list):** hitbox timing root-caused twice over — the class speed factor now scales the *clip* as well as the gameplay timing (`AttackSpec.timeScale`; a dagger cut during its wind-up and a mace during its recovery), and the measuring tool now selects a clip's *fastest* contact phase rather than its longest (it had been measuring the settle on both two-handed opening swings and the one-handed second heavy). Parry catch windows re-measured across each family's raise+bash clip *pair* (`--parry` mode) — shield, greatsword and battleaxe were all catching during the raise. `criticalStyle` per weapon class: an axe backstabs by swinging its own light attack, because it has no point. Directional blocking (`guardCovers`). Archer given a body (armour coverage is by primary biped slot; boots were deleting the whole body), a working shoot/withdraw FSM — both states were emitted by the AI and never implemented — and a turn rate. Shield wardens now block (`WeaponTactics.guarding` reads the off hand). Bow no longer held string-forward (`OFF_HAND_NODE_HALF_TURN` — a fact about the node, not about shields). One owner for `mesh.visible` (`actors/meshVisibility`). Inventory sized by `window.visualViewport`; gamepad B no longer backsteps out of the menu; healing draught and lockpick have real icons from a new `clutter` pipeline set. Enemies take attack movement from their feet too. **Not delivered:** per-weapon riposte clip selection (`pipeline.audition` cannot build its candidate GLB) — polish backlog. Gates green; `visual:check` passes for criticals, defense, attacks, evasion, locomotion and ranged
| 10b — full portable-sandbox parity in studio (was 7b; moved 2026-08-25, decision 0017) | todo | Scene orchestration extraction (§53), inventory/equipment UI, enemies/targeting, bow, navmesh; combat-space probes then validate + freeze the 11/12 exemplar packets; **incl. fixes to shared combat internals** (owner 2026-08-29: good-enough, not perfect — specifics at kickoff) |
| S — stats, progression and character-systems **design** (parallel workstream, module 76; decision 0019) | done | **Four owner rounds, all closed** — shape ([0031](decisions/0031-workstream-s-round1-shape.md)), design + numbers ([0033](decisions/0033-workstream-s-design-and-numbers.md)), round-3 corrections ([0035](decisions/0035-workstream-s-round3-attributes-and-pace.md)), and the round-4 QA rulings ([0037](decisions/0037-workstream-s-round4-qa-rulings.md)): practice discount cut, kill-based class-weighted armour accrual, repeat-target damping removed, lockpick wear, **poise reinstated on the DS1 model**, pace target restated. Live artefacts: **module 76 §116–129** (the spec), decisions 0019/0031/0033/0035/0037, `tooling/stats-sim/` (**19 invariants, all holding**, including a Morrowind known-answer test) and one evidence packet; the workstream's five working papers are archived under `docs/research/archive/workstream-s/` and the tuning history is `tooling/stats-sim/FINDINGS.md`. Phase 10c implements it |
| 10c — stats and progression implementation (module 76; decision 0019) | todo | Implements workstream S in `packages/game-core` incl. the semantic-authoring compiler (ladder refs → numbers; extended to loot/traps). After 10b, **before packet freeze and Phase 13** — content in 11/12 authors semantically without it (0019 4th amendment; 0034) |
| 13 — fauna ecology, encounters, fixed loot (exemplar-first; flora half moved to Phase 10 by 0034) | todo | |
| 12b — province soundscape (module 57; polish tier — 0023, hardened by 0034) | todo | runs in the P window **after 13** (authors creature calls/ambience *from* the ecology data); must land before 14 locks budgets; may pull earlier |
| P — general polish pass (rolling backlog, added 2026-08-28) | todo | backlog: [docs/polish-backlog.md](polish-backlog.md) — non-blocking cosmetic/feel leftovers from closed phases land there, owner adds freely |
| 14 — streaming and deployment | todo | |
| 15 — rollout by region packet (recast from "expansion by watershed" by 0034) | todo | opens by drafting the packet roadmap for owner sign-off |

## Waiting on user

- **Phase 10 trunk solidity — NOT yet passing** (owner, 2026-09-02): a
  separate parallel agent is finalising the tree-collider fixes; Phase 11
  agents must not touch vegetation-collider files. Original round-9 ask
  below stands for that workstream:
- **Phase 10 round-9 playtest** (deployed 2026-09-01) — trunk solidity.
  If this passes, Phase 10 closes; leftovers go to
  [polish-backlog.md](polish-backlog.md). On foot, DEPLOYED build, walk
  mode, in the jungle (~3.3 km E / 4.2 km S):
  1. **Walk into everything.** The big new trees, the giants' buttress
     roots, and ordinary trees, palms, willows and boulders too. The main
     cause turned out not to be the shape at all: the game was only ever
     making the nearest **96** things solid, and a thick patch of jungle
     has over a thousand within range — so solid cover ran out about 12 m
     from you, while the game only refreshed the set after you had walked
     12 m. You were spending much of your time standing outside the solid
     set entirely. That is fixed, and it explains why it felt arbitrary.
  2. **The shape is now moulded to each trunk**, for every tree, not just
     the new ones — a chain of shapes that follows the trunk up its real
     curve and taper, instead of one upright cylinder at the base. The
     giants' buttress roots are solid now too; they had no collision at
     all before.
  3. **Any thin air?** The opposite failure would be bumping into nothing.
     Please say if you feel invisible walls anywhere, especially near
     leaning trunks and the buttress roots.
  4. **How does it RUN?** This is the change most likely to cost frames —
     please give an FPS read on each quality setting in thick jungle.

  Known gaps, unchanged: only six exemplar areas have plants; the rest of
  the province is bare on purpose.

- **Combat round-5/6 (workstream C): the parry ruling, and the battleaxe.**
  In the sandbox, not the world.

  **The parry hitbox is now active for the whole of the second parry
  animation — the catch — and for nothing else**, on every weapon and shield,
  as you ruled. It is derived from the clips rather than written down per
  family, so it cannot drift again. **This makes parrying much more forgiving
  than it was**: a one-handed catch goes from 0.2 s to 0.7 s and a greatsword's
  from 0.16 s to 1.1 s. That is a big change to the feel and the main thing to
  judge — too easy, too hard, or right, for weapon, shield and greatsword.

  **The battleaxe ripostes with its own swing**, on your ruling to accept a
  swing-specific contact rule. Its family's authored execution contains no chop
  that actually lands — every phase of it that reaches a torso is a forward
  drive — so its own swing is the honest stand-in, exactly as it already is for
  its backstab. Warhammers, halberds and one-handed axes and maces get the same.
  Worth a look at whether the axe visibly connects.

  Also fixed underneath: **the victim of a paired critical now stays put.** It
  was a physics body, so the attacker arriving at its authored distance shoved
  it away — every riposte and backstab in the game was landing further out than
  the distance it was measured to.

  **The sword and dagger stab is still not shipped.** It was built twice and
  passed all three of its own scenarios both times; what stops it is that
  swapping the one-handed execution knocks the *greatsword* riposte out, for a
  cause that is not understood yet — the greatsword's numbers and its whole
  animation pack are byte-identical to the passing state. Rather than ship
  something that turns a passing check red, it is reverted with every measured
  number recorded and the one remaining diagnostic written down in
  [polish-backlog.md](polish-backlog.md).

- **Combat round-4 playtest (workstream C).** In the sandbox, not the world.
  Everything below is on your last list.

  **Weapon hitboxes — the big one.** Two separate causes were found and
  fixed, so please re-check *every* weapon, light and heavy, first and
  chained. What should now be true everywhere: the hitbox is off during the
  wind-up, on through the visible swing, and off again during the recovery.
  Specifically the ones you called out: the dagger (it was cutting during its
  wind-up), the one-handed axe and mace second heavy (cutting during their
  recovery), and the two-handed sword and axe first light and first heavy
  (only cutting after the swing had finished).

  **Parry volumes.** Shield, two-handed sword and two-handed axe were all
  catching while the guard was still coming *up*. They now catch during the
  parry itself. **This is a feel judgement and I need your call**: too easy,
  too hard, or right, for each of the three? The battleaxe in particular
  catches from the moment the axe is fully up, because its guard sweeps
  across and past your body in about a tenth of a second — if that feels
  generous, say so.

  **Backstabs.** A one-handed axe or mace, and a two-handed axe or hammer,
  now backstab by swinging their own attack instead of stabbing with a blade
  they do not have. The two-handed sword backstab should now actually
  register when it visibly connects.

  **Enemy picker.** The archer has a body, fires its bow, and can turn and
  back away to keep its distance — none of that existed. The shield enemy
  should now block as well as parry: expect it to block a light attack and
  dodge a heavy.

  **Blocking.** You can no longer block anything that hits you from outside
  roughly the front 140 degrees. Try getting hit in the back while guarding.

  **Bow.** It is held the right way round now — the curve toward you, the
  string away — in both first and third person. In first person your head
  should be gone rather than in the way.

  **Inventory.** On the phone, in and out of full screen, all four edges
  should be visible. The health potion and lockpick have proper icons. On the
  pad, B should close the inventory and nothing else. Taking your cuirass off
  should show the body underneath and keep showing it.

  **Enemy feet.** Enemies take their swing movement from their feet now, as
  you approved for the player.

  **One thing I did not do.** You asked for a stabbing riposte on the
  one-handed sword and the dagger, and a swinging one on the two-handed axe.
  The mod does ship a separate execution for every weapon and they are all
  already downloaded — but the tool for *looking* at them before choosing is
  broken, and picking one blind would have been a guess. It is written up in
  the polish backlog with what needs fixing first.

  **Also known, not fixed:** arrows fired straight up are still a little
  tumbly (you said leave it for polish, so it is in the backlog).

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

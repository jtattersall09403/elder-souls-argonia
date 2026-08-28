# Build progress

Single source of truth for where we are in the build sequence
([world-gen-master-plan.md](world-gen-master-plan.md) §86). Read this file first,
then open only the master-plan sections the active phase needs.

## Protocol (all agents)

1. **Trust the repo over this file.** Before building on a phase marked done,
   spot-check its evidence (run the gates, check `git log`). Before anything
   else, run `git status` — a dirty tree means a previous agent stopped mid-work.
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
| 8b — water renderer and interaction | in progress | round-5 DEPLOYED 2026-08-28 (0025 = full log): standing-vs-flowing physics (pools need slope <5.5 %; steep centrelines carry cascade film — gorge sheets/blob-chains gone), pond-clamped river ribbons (the walked-through bulge, owner was right), whole-component pools + feathered masks (square edges), normalised flow speeds, barcode-wake advection rule, mossy-rock steep-slope audit (TS dirt_cliff 36; nothing painted under water), delta bars sand, wetter heartlands (peat compaction −0.35 m), walk water draw 3 km, pushable crates, water-class in map tooltip + walk HUD. Awaiting owner playtest round 5 |
| 8c — weather and atmosphere | todo | |
| 9 — swimming, climbing, boats | todo | |
| 10 — asset catalogue and kits | todo | |
| 10b — full portable-sandbox parity in studio (was 7b; moved 2026-08-25, decision 0017) | todo | Scene orchestration extraction (§53), inventory/equipment UI, enemies/targeting, bow, combat-space probes against real kits. Deferred past the riskier world systems; must precede 11–13 |
| S — stats, progression and character-systems **design** (parallel workstream, module 76; decision 0019) | in progress | Research + mapping inventory done (docs/research/stats-progression-*, 4 docs); **owner round 1 presented 2026-08-26** (12 questions + accept/veto list, [owner-round1](research/stats-progression-owner-round1.md)) — blocked on owner answers. Then: detail axes in module 76 → numbers packet → tooling/stats-sim harness → round 2. Run-book: module 76 §103.1 (self-contained — "deliver workstream S" is enough). Skeleton is owner-chosen: **Morrowind chassis, Souls combat layer** (§103.0) — the work is the mapping exercise (seams, Skyrim-item→chassis taxonomy, keep/drop by sourceable movesets, completeness sweep). Docs + owner decisions only, no code; **exactly two batched owner rounds**. Must conclude before 10c |
| 10c — stats and progression implementation (module 76; decision 0019) | todo | Implements workstream S in `packages/game-core`, wrapping today's tuning as the neutral baseline. After 10b, **before 11–13**: fixed danger (0004) means every enemy and every loot item is authored as an absolute number, so the scale must exist first |
| 11 — causal locations and settlements | todo | |
| 12 — dungeons and interiors | todo | |
| 12b — province soundscape (module 57; was 8d, re-sequenced by 0023: polish tier, riskier unknowns first) | todo | may run earlier if convenient (only needs 8a); hard requirement: before Phase 13 authors creature calls/ambience |
| 13 — ecology, encounters, fixed loot | todo | |
| 14 — streaming and deployment | todo | |
| 15 — expansion by watershed | todo | |

## Waiting on user

- **Owner visual playtest of 8b water** on the deployed Pages studio
  (fly + walk + underwater + wet season + crates; checklist given in chat
  2026-08-26). Owner also asked to re-review terrain feel (6b) once the
  water phases land — can be combined with this playtest.

- **Workstream S owner round 1** — 12 batched stat-system decisions + 5
  accept/veto findings, presented in chat 2026-08-26 and recorded in
  [research/stats-progression-owner-round1.md](research/stats-progression-owner-round1.md)
  (each has a recommendation; "accept all" is a valid answer). Any agent can
  resume from module 76 §103.1 step 5 once answers are in.

(There is no "next up" section: the first `todo` row above is what's next.
Phase-ordering rationale lives in the plan §86, not here.)

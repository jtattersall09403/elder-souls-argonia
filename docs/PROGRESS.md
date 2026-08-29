# Build progress

Single source of truth for where we are in the build sequence
([world/95-build-sequence.md](world/95-build-sequence.md) §86). Read this file
first, then open only the master-plan sections the active phase needs.

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
| 8b — water renderer and interaction | done | owner CLOSED 2026-08-28 (good-enough, **not perfect** — full water-systems re-review + polish queued in [polish-backlog.md](polish-backlog.md), Phase P). 7 rounds; full defect→fix history in decision 0025. Province W-field water surface, rivers/marsh/estuary/coast/underwater, buoyancy + Rapier water query, monotone slope rivers, shore surf, waterfall shading |
| 8c — weather and atmosphere | in progress | **round 3 DEPLOYED 2026-08-29, awaiting owner playtest.** All 5 round-2 feedback points fixed at root cause (defect→fix log: decision [0032](decisions/0032-phase8c-weather-implementation-shape.md) Round 3): fog volumes LOCAL (belt clings to the massif, summits above cloud, clear days clear, sea-fog/mist banks you look AT), rain finally visible (billboards were half-culled + contrast; probe screenshot verified), region visibility renders (climate-vis raster), sunset/sunrise cloud colouring, storm seas 0.35–6× + faster + wind-scaled surf. 22/22 probe scenarios + 402 tests green. Run-book: top of 0032 |
| 10 — asset deep catalogue, kits, vegetation machinery (scope widened + flora ecology pulled from 13; decision 0034) | in progress | **started 2026-08-29** (runs parallel to the 8c playtest). Current task: §86.0b data-file rule mining (plugin readers → placement/grass/region statistics) + the semantic asset registry sweep, ahead of an owner decision pack on placement/palettes |
| 11 — settlement/location system, exemplar-first (0034) | todo | may start once the S schema is accepted (semantic authoring); packet freeze gated on 10b probes + 10c numbers |
| 12 — dungeon/interior system, exemplar-first (0034) | todo | may interleave with 11 |
| 9 — swimming, climbing, boats (re-slotted after the placement exemplars; 0034) | todo | player craft only — ferry/fast travel is Morrowind-style world content (Phase 11); thin swim slice may pull earlier; boats may slip |
| 10b — full portable-sandbox parity in studio (was 7b; moved 2026-08-25, decision 0017) | todo | Scene orchestration extraction (§53), inventory/equipment UI, enemies/targeting, bow, navmesh; combat-space probes then validate + freeze the 11/12 exemplar packets; **incl. fixes to shared combat internals** (owner 2026-08-29: good-enough, not perfect — specifics at kickoff) |
| S — stats, progression and character-systems **design** (parallel workstream, module 76; decision 0019) | done | **Three owner rounds, all closed** — shape ([0031](decisions/0031-workstream-s-round1-shape.md)), design + numbers ([0033](decisions/0033-workstream-s-design-and-numbers.md)), and the round-3 corrections ([0035](decisions/0035-workstream-s-round3-attributes-and-pace.md)): the attribute model rebuilt on Morrowind's actual formulas (keep the score, drop the roll), levelling pace calibrated against Morrowind's documented one, D0 corrected back to "safe ground", sneak openers to ×8 for bows. Live artefacts: **module 76 §116–129** (the spec), decisions 0019/0031/0033/0035, `tooling/stats-sim/` (**19 invariants, all holding**, including a Morrowind known-answer test) and one evidence packet; the workstream's five working papers are archived under `docs/research/archive/workstream-s/` and the tuning history is `tooling/stats-sim/FINDINGS.md`. Phase 10c implements it |
| 10c — stats and progression implementation (module 76; decision 0019) | todo | Implements workstream S in `packages/game-core` incl. the semantic-authoring compiler (ladder refs → numbers; extended to loot/traps). After 10b, **before packet freeze and Phase 13** — content in 11/12 authors semantically without it (0019 4th amendment; 0034) |
| 13 — fauna ecology, encounters, fixed loot (exemplar-first; flora half moved to Phase 10 by 0034) | todo | |
| 12b — province soundscape (module 57; polish tier — 0023, hardened by 0034) | todo | runs in the P window **after 13** (authors creature calls/ambience *from* the ecology data); must land before 14 locks budgets; may pull earlier |
| P — general polish pass (rolling backlog, added 2026-08-28) | todo | backlog: [docs/polish-backlog.md](polish-backlog.md) — non-blocking cosmetic/feel leftovers from closed phases land there, owner adds freely |
| 14 — streaming and deployment | todo | |
| 15 — rollout by region packet (recast from "expansion by watershed" by 0034) | todo | opens by drafting the packet roadmap for owner sign-off |

## Waiting on user

- **8c round 3 playtest** — deployed 2026-08-29. Check: ① your clear-day URL
  (x=2.44 z=6.22, force clear): no fog band in the sky anywhere, looking up
  or at the mountains — the mountain cloud now clings to the mountains
  themselves, only on cloudy/rainy days, and the very tallest summits poke
  up above it (fly to the border mountains under overcast to see the cloud
  sea from above) ② rain clearly visible at your downpour spot (and
  everywhere it rains) ③ force "sea fog" / "dawn mist": fog sits WHERE it
  belongs (coast/estuaries; basins at dawn) — stand outside it and you can
  look AT the bank; inland stays clear ④ hazy air now varies by region
  (murky marsh lowlands ~the authored figures, crisp mountain air, long
  views from summits), breathing a little with the weather ⑤ sunset/sunrise:
  clouds catch gold-to-red toward the sun, soft pink away from it, high
  wisps stay lit after the sun sets ⑥ storm seas: much bigger spectrum —
  calm days near-flat, squalls ~6× wave energy, waves faster, breaking on
  the shore harder and quicker (watch a beach in force:squall vs clear)
  ⑦ nothing regressed from round 2 (night clouds, storm ladder, lightning
  gates, wet season). Defect→fix log: decision 0032 Round 3.
- **Workstream S — light sanity check (non-blocking)**: three owner rounds are
  folded in and the harness holds 19/19 including a Morrowind known-answer
  test. Nothing is blocked on a reply; the summary is decision
  [0035](decisions/0035-workstream-s-round3-attributes-and-pace.md) and the
  pace/economy numbers are in `tooling/stats-sim/FINDINGS.md`.
- **Phase 10 — vanilla `Skyrim.esm` is not in the vault** (only the three BSAs
  are). It is wanted for mining Bethesda's own scatter rules (REGN object
  tables, GRAS density params) as a checklist. Owner action, ~250 MB, needs
  your Steam login: `! ~/tools/DepotDownloader/DepotDownloader -app 72850
  -depot 72851 -manifest 430694959351693705 -username <you> -filelist
  /tmp/esm-filelist.txt -dir ~/workspace/elder-souls-dev/elder-scrolls-asset-pipeline/skyrim-source`
  (filelist written by the phase agent). **Not blocking** — BM&V's authored
  Black Marsh is the primary and more relevant mining source.
- **6b terrain-feel re-review** — owner closed 8b (2026-08-28) without
  explicitly confirming the terrain-feel re-check that was bundled into that
  pass. Confirm it's fine, or drop issues into
  [polish-backlog.md](polish-backlog.md); nothing is blocked on it.

(There is no "next up" section: the first `todo` row above is what's next.
Phase-ordering rationale lives in the plan §86, not here.)

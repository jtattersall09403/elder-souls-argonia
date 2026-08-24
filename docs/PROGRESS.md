# Build progress

Single source of truth for where we are in the build sequence
([world-gen-master-plan.md](world-gen-master-plan.md) §86). Read this file first,
then open only the master-plan sections the active phase needs.

## Protocol (all agents)

1. **Trust the repo over this file.** Before building on a phase marked done,
   spot-check its evidence (run the gates, check `git log`). Before anything
   else, run `git status` — a dirty tree means a previous agent stopped mid-work.
2. **Starting work:** set the phase row to `in progress` with a one-line current
   task, and commit that change before the work itself.
3. **Work in small commits.** Every commit should leave `npm test` and
   `npm run typecheck` green from the repo root.
4. **Finishing a milestone:** flip the row to `done` with one line of evidence,
   in the same commit as the finishing work.
5. **Crash recovery:** if a row says `in progress` but no agent is running, use
   `git status`, `git log -5` and the gates to decide whether to finish, redo or
   revert the partial work; then correct this file.
6. **Keep this file under ~80 lines.** Detail belongs in `docs/decisions/` or
   phase docs, not here. Prune rows for long-finished phases into one line each.

## Status

| Milestone (plan §86) | Status | Evidence / current task |
|---|---|---|
| 0 — source, era, credits foundation | done | decisions 0001–0004; CREDITS.md; plan revised & renamed |
| 1a — monorepo migration, CI, deployed sandbox | done | owner playtest PASS 2026-08-22; gates green from root; Pages live |
| 1b — package boundaries and contracts | done | packages/contracts + apps/game shell + apps/world-studio; inventory/items extraction deferred to Phase 7 (plan §86) |
| 2 — province source ingest | done | anchors owner-approved 2026-08-22; conditioning/sea-level decided (0005); scale ×3 (0006); major-city road network required (§88) + candidate edges registered; community map archived w/ hash |
| 3 — province hydrology and region graph | done | owner-approved 2026-08-22 (sea/salinity/flood corrections applied; lake region class added); stats in hydrology-meta.json |
| 4 — danger, cultures, transport | done | owner-approved 2026-08-23: strong terrain, jungle region, 8 culture zones, danger model, road/boat/root graphs, climate profiles, access model (0007), lore dossiers |
| 5 — World Studio foundation | done | owner flyover gate PASS 2026-08-23 (shape/size/feel/mist approved); map+13 layers, 3D fly/orbit, click-to-spawn, reproducible URLs. (Correction 2026-08-24: chunk overlays/probe framework were NOT built at Phase 5; character-mode HUD + debug hooks now cover part of that, rest tracked in module 85) |
| 6 — province terrain (scope extended from basin to whole province at gate, 0008 addendum) | done | owner province gate PASS 2026-08-24 (6 gate rounds; bmv-v1 materials, de-terracing, north/south distinctness, mountain belts, shore types, tint slider, lanes, Blackrose channels). refine_province + 256 chunks x3 LODs in vault (chunks-manifest.json) |
| L — lore extrapolation loop (parallel workstream, module 45) | done | Packets 1–3 done (Opus, 2026-08-24): ~140-page UESP sweep, 15 new dossiers + 12 extended, gap register (~50 gaps), 4E-201 province synthesis, 10 quest-plan deltas (proposed, not applied). **Complete 2026-08-24**: 39 files (~405 kB) — full sweep, gap register ZERO open (5 DEFER technical, 7 MYSTERY intentional), per-settlement Hist placement (Phase 11 unblocked), settlement register, guilds, ecology/encounter/loot feed, 4E-201 synthesis w/ owner decisions + trauma directive woven in. 4 non-blocking Round-2 owner questions (owner-questions.md). Round-2 decisions accepted; quest-plan deltas D1-D16 APPLIED to docs/quests/ (consistency greps clean; 6 application notes in quest-plan-deltas.md). Workstream closed — future lore gaps route via module 45 process |
| 6b — province rescale + mountain relief (0015; plan §86 Phase 6b) | todo (queued after Phase 7 feedback fixes) | ×1 horizontal / ×1 vertical, classifier-threshold re-tune, orogeny + erosion in the border ranges, carved passes + reachability/POI-shelf probes, mountain materials; all terrain-feel gates on foot (0015) |
| 7 — physical character integration | done | owner playtest PASS 2026-08-24. Packages extracted (0013): game-core/character/character-assets; studio character mode on Rapier heightfield chunks (0014) behind PlayerMovementController with desktop/touch/gamepad parity; env-query contract implemented; actor registry; capability profiles + anchor-spawn validation. Feedback rounds fixed: live support plane, unified fly/walk chunk terrain + vertical-scale slider, grounded coyote debounce, gradient-map lighting (no chunk seams), FIX_INTERNAL_EDGES colliders. All gates + 33 visual probes + e2e probe green |
| 8 — water renderer and interaction | todo | |
| 9 — swimming, climbing, boats | todo | |
| 10 — asset catalogue and kits | todo | |
| 11 — causal locations and settlements | todo | |
| 12 — dungeons and interiors | todo | |
| 13 — ecology, encounters, fixed loot | todo | |
| 14 — streaming and deployment | todo | |
| 15 — expansion by watershed | todo | |

## Waiting on user

- Nothing — Phase 7 closed; Phase 6b (0015) is next, for a fresh agent.

## Next up

**Phase 6b** (after the Phase 7 playtest feedback is resolved): decision 0015
+ plan §86 Phase 6b — rescale to ×1 horizontal / ×1 vertical, re-tune
slope/distance classifier thresholds to preserve region character, then the
orogeny pass (uplift + erosion in the border ranges, carved passes,
reachability/POI-shelf probes, mountain materials/triplanar). Terrain feel is
judged on foot in character mode from now on (0015). Then Phase 8 (water
renderer; the env-query WaterSample is sea-level-only until then). Quest plan
provisions bind Phases 11+.

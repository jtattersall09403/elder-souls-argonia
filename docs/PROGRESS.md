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
| 5 — World Studio foundation | done | owner flyover gate PASS 2026-08-23 (shape/size/feel/mist approved); map+13 layers, 3D fly/orbit, click-to-spawn, reproducible URLs; chunk overlays + probe framework mature with Phase 6 |
| 6 — reference watershed terrain | in progress | pass 1 compiled: 12×11 km basin refined (channels, region detail noise, canon Blackrose lake+island+3 feeders), flyable, splat-textured. Owner gate feedback 2026-08-23: texturing too coarse + too vanilla → ground-material system redesigned (decision 0011, research recorded). Pass 2 progress: 0011 implemented and reworked on owner render feedback — 30-material library (Rainforest tropical + Aendemika Bitter Coast + CC0 + vanilla), full-res (~5.5 m) control map, contour-following water-edge gradients, wetlands mud-first, roads painted, organic authored-region borders, crop extended to coast+island, poke-through fixed, default ×5 (0006 addendum). Round 3 on owner feedback: 31 materials (+trunk road), crop includes Soulrest+coast, 3D city markers, road wear classes, person-scale height micro-relief, macro climate tint (climatology researched: docs/research/black-marsh-climatology.md), ×5 confirmed. BM&V textures uploaded+mined (module 90 §74.1b): `bmv-v1` material set live as default, `aendemika-v1` selectable in the fly HUD for A/B — owner to pick. Part1 (meshes+plugins) uploaded & catalogued. Remaining: portage resolutions (module 60 §45), collision/LOD/chunking, wet-season flood states, river water rendering (Phase 8) |
| 7 — physical character integration | todo | |
| 8 — water renderer and interaction | todo | |
| 9 — swimming, climbing, boats | todo | |
| 10 — asset catalogue and kits | todo | |
| 11 — causal locations and settlements | todo | |
| 12 — dungeons and interiors | todo | |
| 13 — ecology, encounters, fixed loot | todo | |
| 14 — streaming and deployment | todo | |
| 15 — expansion by watershed | todo | |

## Waiting on user

- Phase 6 gate: owner will fly the deployed studio (no shot batches needed)
  once pass 2 texturing is live — judging terrain detail/shape, the Blackrose
  lake site and the new ground materials. Vertical scale settled (×4, 0006);
  texture-source rulings settled (0011: Rainforest approved, Vanaheimr
  rejected as cold-climate).

## Next up

Phase 6: compile the Blackrose basin at high detail (quest-aware: Blackrose
city sites, canon lake-with-three-rivers, corridor roads, portage
resolutions). Stormhold/AC opening region is the designated second packet
(0009). Quest plan lives in docs/quests/ — provisions bind Phases 11+.

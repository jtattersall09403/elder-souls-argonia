# Side lanes (decisions 0074, 0087)

A **side lane** is a workstream that runs beside the world build, in the
same checkout, on folders no active Phase 16 chunk touches. It exists so the
owner is not idle while a chunk runs. The world build keeps its one queue
([phases README §86](../README.md)); a lane never reorders it.

## Rules

- **Own a folder list and stay in it.** The lane brief names the folders it
  edits and the folders it must never touch. Anything outside both lists is a
  question for the owner, not a judgment call.
- **Commit by pathspec, never `-a`.** Shared files (`docs/PROGRESS.md`, the
  decisions index, root `README.md` credits) are committed as your own hunk
  via the index-blob protocol: patch a copy of `git show HEAD:<file>`,
  `git hash-object -w`, `git update-index --cacheinfo`, commit with nothing
  else staged, then re-apply your hunk to the working tree.
- **Small commits, preflight before each.** Preflight runs over the whole
  tree, so a half-done lane fails the other lane's gate; keep the tree green
  between commits and never leave a red change uncommitted for long. The
  review before it covers only your files: `npm run preflight -- --paths
  <your pathspec...>` (decision 0087 §3).
- **Decision numbers:** take the next free number at the moment of writing
  and check the index again before committing; two lanes have collided before.
- **One owner playtest per round**, listed in plain English at the end of
  the round, with the exact command or URL to open.
- **Never `pkill -f`**, never restart a dev server you did not start.
- **No fixed number of lanes** ([0087](../../decisions/0087-opus-decides-when-delegated-no-lane-cap-review-by-pathspec.md) §2).
  A new lane runs only if its folders are disjoint from every running lane
  and chunk, it shares no catalogue writer with them (whole-file writers
  clobber each other), its heavy jobs go through `job_guard.sh` (next rule:
  the slot count there is the machine-wide cap on concurrent heavy jobs), and
  the planner judges the clash risk with the other lanes acceptable.
- **The machine's CPU is guarded twice** (owner rulings 2026-09-25, after
  two codespace crashes at 97-100 % CPU with four lanes on 4 cores).
  Every heavy job (kit builds, Blender, miners, compiles, preflight,
  `npm test`) runs as `bash tooling/repo-standards/job_guard.sh <lane> --
  <command...>`: it waits (up to 30 min, then exits 75) until the 1-min
  load is under nproc - 1, the current directory's volume and the `/tmp`
  cache volume each have over 3 GB free and memory is under memwatch's
  ceiling, takes one of max(1, floor(nproc/2) - 1) machine-wide slots and
  runs the job under `memwatch.sh` with `nice -n 10 ionice -c3 taskset` on
  the upper half of the cores (2-3 on the codespace), leaving cores 0-1 to
  the editor tunnel and the Claude CLI. Behind it, `cpu_watchdog.sh`
  (started by `on-start.sh`, no agent involved) pauses the heaviest
  processes while the whole machine is above 85 % CPU, continues them one
  at a time once it is calm, and kills stale `rtk` filters and orphaned
  Blender, miner, kit-build and test workers (log
  `/tmp/es-jobs/watchdog.log`; `cpu_watchdog.sh --status` lists what it
  holds stopped). Preflight gates and workspace test runs are capped at
  `ES_JOBS`, default max(1, floor(nproc/2)), and pinned the same way to the
  upper half of the cores (`tooling/repo-standards/jobs.mjs`), and `npm run preflight -- --paths` runs only the gates its files touch.
  A lane never runs two heavy jobs at once; the planner launches at most
  floor(nproc/2) heavy lanes at a time (two on the 4-core codespace); light
  lanes (docs, reads) run freely.
- **No agent polls with `sleep`** (owner 2026-09-25: the time audit found
  21 agent-hours of lane leads sleeping on their builders). The shell guard
  refuses `sleep` from every session, subagents included. Waiting is
  job_guard's own wait, `run_in_background` (the harness wakes you when the
  job exits) or a subagent's hand-back. A slow builder is the defect: fix it
  at the source (scoped gates, sampled mines, cached builds). The sleep
  guard stays as a backstop, never as the fix.
- **A crashed session's lanes resume from their transcripts.** The
  SessionStart hook runs `tooling/repo-standards/lane_resume.py --brief`;
  relaunch each lane it lists with `lane_resume.py --packet <agent-id>` as
  the brief (same agent type; printing the packet claims the lane so no
  other session relaunches it), and `--dismiss <agent-id>` a lane judged
  finished or obsolete.

## Lanes

| Lane | Brief | Owns | Never touches | Status |
|---|---|---|---|---|
| Combat sandbox (was Weapons) | [combat-sandbox-lane.md](combat-sandbox-lane.md), [weapons-lane.md](weapons-lane.md) | `apps/combat-sandbox/**`; `packages/game-core/src/{equipment,combat,anim,locomotion,inventory,core,actors,ai,perception,fx}/**`; `packages/character/**`; `packages/character-assets/**`; `tooling/asset-pipeline` character/weapon configs; `packages/text-catalogue` combat and sandbox strings | `apps/world-studio/**`, `world/**`, `tooling/world-generation/**`, `scripts/terrain-chain.sh`, `packages/game-core/src/{settlement,stats}`, `packages/contracts` (read only) | round 7 closes in 16k slice 1, then parked; round 8 and weapons round 2 are picked up at Phase 10b ([0099](../../decisions/0099-places-are-built-in-a-loop-until-the-skill-is-proven.md) §9) |
| Vegetation renderer | [vegetation-renderer-lane.md](vegetation-renderer-lane.md) | `apps/world-studio/src/vegetation/Vegetation*.tsx` (not `Groundcover.tsx`); `packages/game-core/src/vegetation/**`; `packages/game-core/src/fx/{lodFade,windSway}.ts`; `packages/game-core/src/render/terrainOcclusion.ts`; `docs/research/vegetation/renderer-rewrite-*.md`; the decision record and its addenda; `docs/world/65-vegetation-scatter.md` (round 2); this brief; PROGRESS.md (index-blob) | `world/**`, `tooling/world-generation/**`, the vegetation bundle format and scatter, `Groundcover.tsx`, `packages/game-core/src/water/**`, settlements, the character controller, `ChunkTerrain.tsx` (read only), rasters | closed 2026-09-21 ([0082](../../decisions/0082-vegetation-cells-are-built-once-and-the-gpu-picks-the-rung.md)); rounds 0–2 delivered, owner walk pending |
| Stats lab | [stats-lab-lane.md](stats-lab-lane.md) | `packages/game-core/src/stats/**`; `apps/stats-lab/**`; `tooling/stats-sim` (read, retired at the end); new decision records; § Phase 10c pointers | 16h's folders; the combat-sandbox lane's folders (`apps/combat-sandbox`, `game-core/src/{combat,equipment,anim,locomotion,inventory,core,actors,ai,perception,fx}`) | rounds 1–5 delivered; parked; the owner test opens Phase 10c (0099 §9) |
| Sound prep (Opus lead, 0087) | [sound-prep-lane.md](sound-prep-lane.md) | `tooling/audio-pipeline/**`; `packages/audio/**`; new decision records; root README § Credits when a mod pack is sourced | 16h's folders; the combat-sandbox lane's folders | rounds 1–3 delivered 2026-09-24 ([0094](../../decisions/0094-audio-ships-as-opus-webm-sets-read-from-the-plugin-loops-crossfade-at-runtime.md), [0095](../../decisions/0095-audio-runtime-is-an-injected-manager-over-an-engine-interface-fed-by-typed-sound-events.md)); open: app wiring (handoffs), the mud footsteps call |
| Placement workbench (Opus lead, 0087) | [placement-workbench-lane.md](placement-workbench-lane.md) | `tooling/placement-workbench/**`; `.claude/skills/placement-workbench/`; `docs/research/placement-workbench/**`; the second yard (`world/sources/blueprints/place.fixture.proving-ground-b.json`, `world/sources/sites/proving-ground-b.json`); the `atM` and `assembly` hunks in `worldgen/{blueprint,blueprint_footprints,compile_settlement,export_settlement_bundle}.py`; kit rows it needs, through the `kit-build` skill; decision 0097 | the combat-sandbox, stats-lab and sound lanes' folders; every other 16h file | in progress 2026-09-24 (Opus lead, 0087) |
| Breadth research (read-only) | [building-asset-breadth.md](../../research/placement-settlements/building-asset-breadth.md), [building-depth-and-variety.md](../../research/placement-settlements/building-depth-and-variety.md) | new research files or sections under `docs/research/placement-settlements/` | every code, data and kit folder | light lane beside 16k (0099 §9): feeds the breadth bars and per-type pools; no builds |

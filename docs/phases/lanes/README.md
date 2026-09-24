# Side lanes (decision 0074)

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
  between commits and never leave a red change uncommitted for long.
- **Decision numbers:** take the next free number at the moment of writing
  and check the index again before committing; two lanes have collided before.
- **One owner playtest per round**, listed in plain English at the end of
  the round, with the exact command or URL to open.
- **Never `pkill -f`**, never restart a dev server you did not start.
- **At most two lanes** beside the world build at once (owner review load
  and the subscription limit are the constraint).

## Lanes

| Lane | Brief | Owns | Never touches | Status |
|---|---|---|---|---|
| Combat sandbox (was Weapons) | [combat-sandbox-lane.md](combat-sandbox-lane.md), [weapons-lane.md](weapons-lane.md) | `apps/combat-sandbox/**`; `packages/game-core/src/{equipment,combat,anim,locomotion,inventory,core,actors,ai,perception,fx}/**`; `packages/character/**`; `packages/character-assets/**`; `tooling/asset-pipeline` character/weapon configs; `packages/text-catalogue` combat and sandbox strings | `apps/world-studio/**`, `world/**`, `tooling/world-generation/**`, `scripts/terrain-chain.sh`, `packages/game-core/src/{settlement,stats}`, `packages/contracts` (read only) | in progress 2026-09-24 (Opus lead, 0087); status in PROGRESS.md |
| Vegetation renderer | [vegetation-renderer-lane.md](vegetation-renderer-lane.md) | `apps/world-studio/src/vegetation/Vegetation*.tsx` (not `Groundcover.tsx`); `packages/game-core/src/vegetation/**`; `packages/game-core/src/fx/{lodFade,windSway}.ts`; `packages/game-core/src/render/terrainOcclusion.ts`; `docs/research/vegetation/renderer-rewrite-*.md`; the decision record and its addenda; `docs/world/65-vegetation-scatter.md` (round 2); this brief; PROGRESS.md (index-blob) | `world/**`, `tooling/world-generation/**`, the vegetation bundle format and scatter, `Groundcover.tsx`, `packages/game-core/src/water/**`, settlements, the character controller, `ChunkTerrain.tsx` (read only), rasters | closed 2026-09-21 ([0082](../../decisions/0082-vegetation-cells-are-built-once-and-the-gpu-picks-the-rung.md)); rounds 0–2 delivered, owner walk pending |
| Stats lab | [stats-lab-lane.md](stats-lab-lane.md) | `packages/game-core/src/stats/**`; `apps/stats-lab/**`; `tooling/stats-sim` (read, retired at the end); new decision records; § Phase 10c pointers | 16h's folders; the combat-sandbox lane's folders (`apps/combat-sandbox`, `game-core/src/{combat,equipment,anim,locomotion,inventory,core,actors,ai,perception,fx}`) | in progress 2026-09-24 (Opus lead, 0087) |
| Sound prep (Opus lead, 0087) | [sound-prep-lane.md](sound-prep-lane.md) | `tooling/audio-pipeline/**`; `packages/audio/**`; new decision records; root README § Credits when a mod pack is sourced | 16h's folders; the combat-sandbox lane's folders | in progress 2026-09-24 (Opus lead, 0087); round 1 delivered ([0094](../../decisions/0094-audio-ships-as-opus-webm-sets-read-from-the-plugin-loops-crossfade-at-runtime.md)) |

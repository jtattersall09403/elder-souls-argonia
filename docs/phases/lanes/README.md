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
| Weapons | [weapons-lane.md](weapons-lane.md) | `apps/combat-sandbox/**`; `packages/game-core/src/{equipment,combat,anim,locomotion}/**`; `packages/character/**`; `packages/character-assets/**`; `tooling/asset-pipeline` character/weapon configs; `packages/text-catalogue` weapon strings | `apps/world-studio/**`, `world/**`, `tooling/world-generation/**`, `scripts/terrain-chain.sh`, `packages/contracts` (read only) | planned 2026-09-18; status in PROGRESS.md |

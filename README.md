# Elder Souls: Argonia

A fan-made, non-commercial, standalone total-conversion-style Skyrim project:
the vibe and world-design values of TES III Morrowind, Dark Souls-like combat,
Breath-of-the-wild climbing, extensive swimming, sailing and underwater
exploration — set in Tamriel's Black Marsh and played **in the browser**.

Built with Three.js / React Three Fiber / Rapier, deployed to GitHub Pages by
GitHub Actions — playable combat sandbox at
[the Pages root](https://jtattersall09403.github.io/elder-souls-argonia/), the
province map/flyover at
[/studio/](https://jtattersall09403.github.io/elder-souls-argonia/studio/). Assets derive from locally-owned Skyrim data and credited
community mods (see [docs/CREDITS.md](docs/CREDITS.md)); source archives never
enter this repository.

## Layout

- `apps/combat-sandbox/` — playable combat/character proving ground (deployed
  at the Pages root)
- `apps/world-studio/` — province map/inspection app (deployed at `/studio/`)
- `apps/game/` — integrated game shell (grows as the world build progresses)
- `packages/contracts/` — small stable cross-system interfaces
- `world/sources/` — registered world-generation inputs and provenance
- `tooling/asset-pipeline/` — Python/Blender pipeline turning owned Skyrim data
  into game-ready GLBs (sources live in a local vault via `ELDER_SOULS_ASSET_ROOT`)
- `tooling/world-generation/` — offline world extractors/compilers
- `docs/` — start at [docs/README.md](docs/README.md);
  [docs/world-gen-master-plan.md](docs/world-gen-master-plan.md) is the plan for
  the province-scale world; [docs/PROGRESS.md](docs/PROGRESS.md) is where we're up to

## Develop

```bash
npm ci
npm test            # all workspaces
npm run typecheck
npm run dev         # combat sandbox dev server
```

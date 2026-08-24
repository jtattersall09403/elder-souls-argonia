# CLAUDE.md — apps/combat-sandbox

App-scoped guidance. Repo-wide rules live in the root CLAUDE.md; this file adds
only what is specific to the sandbox. Keep it lean.

## What this is

The **combat + character proving ground** for Elder Souls: Argonia. Souls-like
melee combat, character/animation/physics/input systems are proved fun and
good-looking here before being extracted into shared packages consumed by the
real game (master plan Part VIII). It must always stay independently runnable.

## Sandbox-specific rules

- **Semantic animations only.** Game code references states (`IDLE`, `ROLL`,
  `LIGHT_1`, …), never Bethesda filenames. Reskinning a clip is a pipeline rebuild.
- **Working on animations? Read the playbook first:**
  [docs/animation-quality-playbook.md](docs/animation-quality-playbook.md).
  Skip it entirely if you aren't touching animations.
- **Recordings are for the owner's eyes, on purpose.** Run
  `npm run visual:record -- <group>` only when *how it looks* is the deliverable
  and the owner is going to watch it. Record the affected group, not all scenes,
  hand over the absolute path to `review.html` plus the specific question you
  want answered, and stop. Details:
  [docs/validation/animation-recordings.md](docs/validation/animation-recordings.md).

## Assets

Game assets are built from owned Skyrim data by `tooling/asset-pipeline`
(reading a local asset vault via `ELDER_SOULS_ASSET_ROOT`) and copied into
`packages/character-assets/files/` — versioned there and served/copied into
every consuming app by that package's vite plugin, so a clean GitHub Pages
checkout works. Generated data manifests live beside the code in
`packages/game-core/src/**/generated/`. To rebuild/replace, see
[docs/assets/rebuilding-the-character.md](docs/assets/rebuilding-the-character.md).

## Commands

Run from this directory (or from the repo root with `-w @elder-souls/combat-sandbox`):

```bash
npm run dev         # playtest
npm run typecheck   # tsc -b
npm test            # vitest
npm run build       # tsc -b && vite build

# Animation only. Both take scenario ids or group names (blank = all scenes).
# Measured 2026-08-24: a group ≈ 2 min incl. build; the full 33-scene suite
# ≈ 7 min. Run the affected group for animation/movement changes; run the
# full suite only for cross-cutting refactors.
npm run visual:check  -- locomotion  # fast probes, no video — run freely
npm run visual:record -- locomotion  # recordings for the owner to watch
```

## Map

Start at [docs/README.md](docs/README.md). Explore filenames from there.

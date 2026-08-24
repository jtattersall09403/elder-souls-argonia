# 0013 — Phase 7 package extraction shape

**Date:** 2026-08-24 · **Status:** accepted

Phase 7 extracts the combat sandbox's portable systems into shared packages
(deferred from Milestone 1b until the world studio became a second consumer).
The master plan's §59 target tree sketches ~20 fine-grained packages
(physics/locomotion/combat/character/animation/input/inventory/items/…);
we deliberately land **three coarser packages along the real seams instead**:

- **`@elder-souls/game-core`** — the entire framework-free game layer (the old
  `src/game`: combat, anim, equipment, inventory, actors, io, ai, fx, physics
  boundary, validation) plus its zustand stores. One package, wildcard subpath
  exports (`@elder-souls/game-core/<module>`), raw-TS source like `contracts`.
- **`@elder-souls/character`** — the R3F/Rapier/ecctrl layer: `SkyrimFighter`,
  hurtbox/armour/arrow attachments, `EcctrlAdapter`, and `PlayerBody` (the one
  canonical player ecctrl config, now shared by sandbox and studio).
- **`@elder-souls/character-assets`** — the ~35 MB of tracked runtime GLBs and
  icons, with a small vite plugin that serves them in dev and copies them into
  each consuming app's `dist/`, so apps share one copy in git.

**Why not §59's fine-grained tree yet:** the internal import graph of
`src/game` is dense (equipment↔combat↔anim↔actors); slicing it into ~10
packages now means ~10 package.json/tsconfig boilerplates and heavy
cross-package churn with exactly two consumers. Packages split further when a
consumer needs a slice without the rest (e.g. `items` for a server-side loot
compiler). §59 remains the direction, not the current layout.

**Other calls made here:**
- The 2.2 MB animation manifest stays a bundled JSON import inside game-core
  (both apps need it at boot; revisit at Phase 14 if bundle size matters).
- `HurtboxBone` moved into game-core (`combat/hurtbox.ts`) to break the one
  game→view import (`stuckArrows` → `SkeletalHurtbox`).
- Vite-specific `import.meta.env.BASE_URL` usage in shared components is
  behind `@elder-souls/character`'s `assetUrl()`.
- `PlayerMovementController` gained `steer()` (smooth free-roam facing) so the
  studio explorer drives ecctrl only through the adapter; CombatScene's direct
  handle access remains declared migration debt (§53).
- The extracted `FollowCamera`/`ExplorerLocomotion` replicate the sandbox's
  free-roam constants; CombatScene keeps its inline combat-entangled copy
  until its scene orchestration is reworked. Retune both sides together.

# 0024 — Credits review: three shipped animation mods were missing from README; third-party notices consolidated to repo root

**Date**: 2026-08-26 · **Status**: accepted (routine gap fix, no owner ruling needed)

## What was wrong

A full audit (background research over `docs/`, `world/sources/`, package
manifests and the generated animation manifest) found the root
[README.md](../../README.md) § Credits and third-party sources — the single
list decision [0023](0023-soundscape-polish-tier-and-credits.md) designates as
the up-front, complete list — was missing three Nexus mods that are actually
shipped in the combat sandbox's git-tracked runtime animation manifest
(`packages/game-core/src/anim/generated/rig-skyrim-humanoid.animations.json`):
**Dynamic Dodge Animation** (`ROLL`), **Rim Parry and Execution** (parry,
riposte, criticals, death) and **Backstab animation for sneak killmove SE**
(backstab). All three were correctly documented with full author/version/file-ID
provenance in `apps/combat-sandbox/docs/assets/animation-source-audit.md` and
`tooling/asset-pipeline/docs/mod-animation-ingestion.md` — they just never got
copied into the README. Root cause: the process in module 90 §73 said to
"maintain" a credits list but didn't say *where that happens relative to
ingestion*, so the propagation step was easy to skip.

Separately, `apps/combat-sandbox/THIRD_PARTY_NOTICES.md` only documented
`ecctrl` and was scoped to one app, while `three`, `@react-three/fiber`,
`@react-three/drei`, `@react-three/rapier`, `zustand`, `react`/`react-dom` (all
MIT) and `@dimforge/rapier3d-compat` (Apache-2.0, a direct `world-studio`
dependency not used at all by combat-sandbox) were undocumented anywhere. The
README pointed at that file as if it were the full picture.

## What changed

- Added the three animation mods to README § Credits, "In use now".
- Replaced `apps/combat-sandbox/THIRD_PARTY_NOTICES.md` with a root-level
  [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) covering runtime npm
  dependencies across all apps/packages (it's a monorepo with shared
  dependencies; a per-app file under-covers by construction). Updated the two
  places that pointed at the old path.
- Tightened the "record it before relying on it" instruction in root
  CLAUDE.md and module 90 §73 to say explicitly: the README credit line is
  added in the same change that ships the asset, not deferred to a later
  audit — a pipeline provenance doc is necessary but not sufficient.

## What wasn't changed

Left the "Planned" section as-is (it correctly summarizes candidate pools by
pointer rather than listing every candidate — no drift found there). Left a
minor URL inconsistency for "Depths of Skyrim" across three planning docs
(`docs/world/90-asset-strategy.md` §76, `docs/quests/70-assets.md` A10,
`docs/world/99-sources.md` ^A6) unresolved — it's an uningested candidate, not
a credits gap, and resolving which Nexus page is current needs a live check at
ingestion time, not a guess now.

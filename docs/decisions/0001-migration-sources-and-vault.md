# 0001 — Migration sources and asset vault (Phase 0 discovery)

**Date:** 2026-08-22 · **Status:** accepted

## Discovered VM layout

`/home/analyticalplatform/workspace/elder-souls-dev/` contains:

| Checkout | Remote | Branch at discovery | State |
|---|---|---|---|
| `elder-souls-argonia` | `jtattersall09403/elder-souls-argonia` | `main` | canonical repo (this one) |
| `ecctrl-souls-combat` | `jtattersall09403/ecctrl-souls-combat` | `enemy-health-bars` @ `0cdfd02` | clean; **15 commits ahead of origin/main, 0 behind**; branch pushed |
| `elder-scrolls-asset-pipeline` | *(local-only git, no remote)* | `races-and-inventory` @ `309fb23` | clean; 5 commits ahead of local `main` |

Tracked content is small and clean: sandbox 377 files / 39 MB (includes runtime
GLBs in `public/`), pipeline 58 files / 4.3 MB (code, config, JSON manifests
only). Multi-GB directories (`skyrim-source/` 3.0 GB, `output/` 710 MB,
`build/` 396 MB, sandbox `artifacts/` 2.6 GB) are all gitignored and stay out.

## Decisions

1. **Migrate from the local branches**, not remote `main`: `enemy-health-bars`
   for the sandbox, `races-and-inventory` for the pipeline. Both are strictly
   ahead of their mains with clean trees, so they are the authoritative states.
2. **Import with history** via `git subtree add` from the local checkouts, into
   `apps/combat-sandbox` and `tooling/asset-pipeline`. Source checkouts are
   never modified.
3. **Asset vault:** proprietary Skyrim/mod archives and bulky intermediates live
   outside this repo. Interim vault location is the existing
   `../elder-scrolls-asset-pipeline/skyrim-source/` tree; the pipeline reads its
   root from **`ELDER_SOULS_ASSET_ROOT`** (defaulting to that path is
   acceptable locally, but CI and clean clones must build the apps without it).
4. After migration is verified, the sibling checkouts become frozen references;
   nothing in this repo may import from `../` paths (CI-enforced from 1a).

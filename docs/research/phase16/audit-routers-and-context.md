# Audit — routers, orphans and unused context (2026-09-11)

Read-only audit for the Phase 16 plan, answering the owner's "have the
routers broken, and is important context sitting unused?" All 360 `.md`
files' relative links were resolved; findings below are the ones that matter.
Items marked FIXED were repaired in the planning session of 2026-09-11.

## 1. Broken links

| File | Target | Fault |
|---|---|---|
| `docs/decisions/0045-reversible-water-overhaul.md` | `../research/rendering/water-completion-audit.md`, `water-local-fluid-and-gpu-budgets.md`, `water-bankfull.md` | moved to `docs/research/archive/water-overhaul-2026-09/` by 0046 — FIXED |
| `docs/research/archive/water-overhaul-2026-09/water-bankfull.md`, `water-handoff.md` | `../../../tooling/.../WATER_REPAIR_HANDOFF.md`, `.../CONFLUENCE_GATE.md` | wrong depth and file gone — archive, left with a note |
| `apps/combat-sandbox/docs/research/archery-ballistics.md`, `docs/architecture/movement-speed-tuning.md` | `../../src/game/combat/ballistics.ts`, `io/input.ts`, `combat/tuning.ts`, `components/SkyrimFighter.tsx` | code moved to `packages/` (0013/0038) — combat area, queued for the combat workstream |

Directory links with no README: all ten folder rows in
`docs/research/README.md`, `world/sources/sites/README.md → dossiers/`.

## 2. Orphans that are load-bearing

| Path | Why it matters |
|---|---|
| `docs/decisions/0056-*.md` | latest decision; missing from the index — FIXED |
| `.claude/skills/settlement-build/SKILL.md` | the repeatable Phase 11 path; linked from nothing — FIXED (docs/README row) |
| `.claude/agents/deliver.md`, `research.md` | the mandated subagent definitions; named as backticks only — FIXED |
| `packages/game-core/src/water/README.md`, `settlement/README.md`, `terrain/README.md` | runtime contracts a water / settlement / terrain agent needs; unreachable — FIXED (docs/README rows) |
| `docs/research/placement-settlements/settlement-type-recipes.md` | per-type recipe digest; one backtick mention at `0041:1099` — FIXED (research README) |
| `docs/research/phase11/promise-ledger-round-1.md`, `phase11-asset-gap-check.md`, `phase11-critique/README.md` + briefs | reachable only by listing the directory |
| `docs/research/quests-and-cast/last-warden-boss-options.md`, `combat-and-systems/third-person-bow-aim-camera.md` | quest/asset and combat references, unlinked |
| `tooling/asset-pipeline/prototypes/pynifly/README.md` | the proved headless NIF pipeline; unlinked |
| `docs/world-gen-master-plan.md` | 14-line stub redirect since 0010 — deleted |

## 3. Index gaps

`docs/decisions/README.md`: 0041, 0054, 0056 missing; 0050 listed twice with
two titles; 0034/0035 and 0044–0050 out of order; 0025 carries no
supersession marker although 0046/0047 retired that model. FIXED.

## 4. Stale routing

| Router | Row | Why stale | Replacement |
|---|---|---|---|
| `docs/README.md:43` | water row → decision 0025 | 0025 is the retired 8b shape; 0047/0049 are current | point at 0047 + 0049, 0025 as history — FIXED |
| `docs/research/rendering/water-handoff.md:15-29` | state table "2026-09-08 evening", two rows "in progress" | contradicted by the same file (probe fix applied, suites gate the deploy, hovering 0) | rewrite when 16c starts; the plan links the audit instead |
| `docs/README.md:67` | "Picking up Phase 11 … batches still open" | B3, G-items, B14 DONE; B1 delivered 2026-09-09 | rewritten to point at Phase 16 — FIXED |
| `docs/PROGRESS.md` Phase 11 row | ~1,300-word round log in a status cell | history belongs in 0041 | pruned — FIXED |
| `docs/PROGRESS.md` / `deploy-pages.yml:33-36` / handoff | "klass block carries no extPx / extRiseM" | false against the shipped `water-meta.json` | corrected in the plan; the workflow comment is 16c's |

## 5. Context size of routed reads

| Router row | Lines |
|---|---|
| Session start (CLAUDE.md + PROGRESS + 00-core + docs/README) | 582 |
| "Continuing water work" | 494 |
| "Authoring a settlement blueprint" (97 + blueprints README + 96 + 0041 + Round A packet) | 4,002 |
| "Picking up Phase 11" (gap plan + 0041) | 3,770 |

Oversize: `0041` at 2,713 lines (live rule ≈ lines 1–165, 872–1051, 2417–2521,
2582+; round log 1052–2416 → archive); `phase11-gap-plan.md` 1,057 (most
batches DONE); `world/sources/sites/prose-lint.md` 850 generated lines.
Splitting 0041 is chunk 16a's first job.

## 6. Unused context

Consumed (code cites it): mountain-terrain-synthesis, approach-and-wayfinding,
kit-assemblies-evidence, building-placement-rendering-treatments,
water-edges-and-shore-waves. **Written and never consumed:**
`settlement-type-recipes.md` (digest of `type-recipes.json`),
`promise-ledger-round-1.md` (the ledger method), `third-person-bow-aim-camera.md`,
and — the one that matters most for Phase 16 —
`world-terrain/tropical-fluvial-geomorphology.md`, whose channel/wetland/lake
taxonomy is exactly the owner's hierarchy and has no implementation
(see [audit-hydrology-data-model.md](audit-hydrology-data-model.md) §6).
`beyond-border-distant-lands.md` is correctly marked deferred (55 §98b) and is
now chunk 16d.

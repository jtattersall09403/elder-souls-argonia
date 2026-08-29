# 0023 — Soundscape is polish-tier (8d → 12b); mod sound packs allowed; credits move to the root README

**Date**: 2026-08-26 · **Status**: accepted (owner rulings on reviewing
decision 0022) · Amends 0022.

## 1. The soundscape phase moves from 8d to 12b — riskier unknowns first

Owner: sound "is more like polish for me… there are riskier things/bigger
unknowns we need to test first" (a silent build is playable; an unproven water
renderer is not). Checked against the dependency table: nothing hard-depends
on the audio layer except **Phase 13**, which authors creature calls and
settlement/ecology ambience into the sound tables. So the phase becomes
**12b** — after water, weather, traversal, vegetation/kits, parity, stats,
settlements and dungeons; immediately before its only consumer. It still
needs only 8a's clock, so it may be pulled earlier if the queue allows.
*(Addendum 2026-08-29, decision 0034: hardened further — 12b now runs in the
Phase P window **after** Phase 13, authoring creature calls/ambience **from**
the ecology data rather than 13 writing into pre-built tables; the hard edge
is now "before Phase 14 locks budgets".)*
Consequences applied: the module-57 "no place approved silent" rule is
softened (pre-12b approvals may run silent; *final* regional acceptance in
Phase 15 packets includes sound); 00-core glance/acceptance, module 95
sequence + dependency rows, module 85/90 references, PROGRESS row all updated.

## 2. Skyrim sound mods are legitimate sources, with credits

Owner: mod sound packs join the normal sourcing pool under the standard
mod-asset rule (module 90 §71/§73) — take the assets, record a credits entry,
no permission bureaucracy. The audit's stricter research stance ("design
references only") survives only as a *preference*: favour packs that are the
author's own work over visible repackages of commercial SFX libraries, and
vanilla where it's good enough. Modules 57 §107 / 90 §74.4 and the research
doc carry the ruling.

## 3. Credits live in the project root README, up front

Owner: "credits should go in the project root readme so we're really up front
about what we're using." `docs/CREDITS.md` is deleted; its full content now
lives in the root README under **Credits and third-party sources**, and all
references (router, 00-core acceptance, module 90, quests 70, pipeline
docstrings) point there. The in-game credits list is still generated from
that section plus the asset registry.

# 0006 — Provisional province scale: ×3 horizontal

**Date:** 2026-08-22 · **Status:** provisional (cheap to change until Phase 6
detail terrain lands; owner may override)

The raw heightfield extent is 7.37 km × 7.37 km (Skyrim map scale). Chosen
horizontal multiplier: **×3 → ~22 km × 22 km**, giving:

- roughly 4–5× Skyrim's playable area — reads as a province, supports fixed
  regional danger zones with real travel commitment, boats/rootworm transit
  become meaningfully faster than walking;
- still tractable for browser streaming and for detailed build-out of one
  reference watershed;
- walking pace ~1.4 m/s → ~4.5 h to cross on foot naively, comparable to
  Morrowind's exploratory feel with faster travel unlocking over time.

Mechanics: horizontal only (heights stay in true metres; slopes flatten by ×3,
appropriate for marsh). Implemented as `metresPerSample` metadata scaling in
generated outputs — no resampling, no code constants. Vertical exaggeration for
*visual* relief in previews stays a renderer concern.

Revisit trigger: Phase 6 streaming budgets or owner travel-time feedback.

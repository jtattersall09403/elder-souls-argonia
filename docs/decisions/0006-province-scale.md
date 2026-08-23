# 0006 — Provisional province scale: ×3 horizontal

**Date:** 2026-08-22 · **Status:** confirmed (owner approved the province's
size and feel at the Phase 5 flyover gate, 2026-08-23)

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

Confirmed at the flyover gate; revisit only if Phase 6+ streaming budgets force it.

**Vertical scale: ×4 (DECIDED at the Phase 6 basin gate, 2026-08-23).** The
owner judged ×4 correct on the refined basin (net ×4/3 ≈ 1.33 slope
exaggeration vs the raw Skyrim-scale source — modest and conventional).
Convention: world data stays in TRUE metres; the ×4 vertical scale is a
geometry transform applied wherever terrain becomes mesh/collision (studio
flyover default slider = 4 = canonical; production terrain compilers apply it
at Phase 6 pass 2+). Water surfaces scale with heights (sea stays y=0).

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

**Vertical scale (open, Phase 6):** at the flyover the owner judged ×6 preview
exaggeration "reasonably like a real world". Expected: ×3 horizontal scaling
flattens slopes 3×, and games conventionally exaggerate relief ~2× anyway
(×6 preview ≈ ×2 effective vs the source). Phase 6 detailed terrain should
therefore evaluate baking ~×1.5–2 vertical scale into compiled heights (plus
micro-relief), with the flyover default exaggeration raised to ×4 meanwhile.

# 0012 — Portage resolution policy (boat-lane land hops)

**Date**: 2026-08-23 · **Status**: accepted (Phase 6 pass 2; module 60 §45
requires every macro boat-lane land hop to be resolved during watershed
refinement)

## Decision

When a Phase 4 boat lane crosses land inside a refined watershed, the
refinement pass resolves the hop deterministically
(`worldgen.refine_watershed.resolve_portages`, fed by the ordered lane paths
compile_society now persists in `waterways.json`):

- **Hop ≤ 450 m with mean ground < 3 m above water → carved canoe channel**
  (bed −1.2 m, ~8 m half-width). Lore basis: the interior swamp's canoe
  channels and local water knowledge (§16 traversal grammar) — swamp folk
  cut short channels rather than carry boats.
- **Anything longer or higher → a real portage feature**: recorded in the
  basin's `portages.json` (lane, position, length, ground) for Phase 11 to
  realise as a boardwalk/drag-path, and painted into the land cover as a
  worn track so the ground reads used.

Blackrose basin outcome: 8 hops, all short and low → all carved as canoe
channels; 0 boardwalk portages (its lanes hug the coast and lake).

## Why

Boat travel is the province's road network (§37); an unresolved land hop
would break every lane crossing it. The 450 m / 3 m thresholds keep carving
plausible (a canoe channel through a levee or mudbank) while pushing anything
that would gouge visible terrain into placed features instead.

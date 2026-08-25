# 0015 — Province scale ×1, vertical ×1, drama moves into the data (Phase 6b)

**Date:** 2026-08-24 · **Status:** accepted (owner-directed) · Supersedes the
scale choices in [0006](0006-province-scale.md)

## The decision

1. **Horizontal scale: ×1** (was ×3). The province returns to the raw source
   extent: **7.37 km × 7.37 km ≈ 54 km², ~34 km² land — almost exactly
   Skyrim's playable land area.** Correction on the record: 0006 described
   ×3/22 km as "4–5× Skyrim"; at Skyrim's usually-cited ~37 km² it was
   actually ~8× Skyrim's land (~13× with our sea). The owner flew the 22 km
   province and judged it oversized once the numbers were established; a
   Skyrim-sized, Morrowind-dense map is the goal. Trade-off accepted
   knowingly: 0006's travel-commitment rationale (danger zones far apart,
   boats meaningfully faster) is weakened; density, mist, low visibility and
   slow early travel carry that load instead, as Morrowind proved.
2. **Vertical exaggeration: ×1** (was ×5). Terrain drama belongs **in the
   height data**, not in a render-time multiplier. The ×5 was tuned from the
   flyover; on foot it reads absurdly steep (owner, 2026-08-24). At ×1
   horizontal, slopes are natively 3× steeper than they rendered at ×3, and
   Phase 6b's mountain-relief pass supplies the rest. The slider remains a
   studio inspection tool; canonical/default is 1.
3. **Terrain feel is tuned and gated on foot.** "Walk the province"
   (character mode) is the authoritative view for judging relief, scale and
   exaggeration; the flyover is secondary. Aerial views systematically
   under-read steepness — this is why ×5 was over-tuned.
4. **Mountain relief is built in a new Phase 6b orogeny pass** (plan §86
   Phase 6b): uplift confined to masks over the border-mountain belts,
   fluvial-erosion carving for valleys/ravines/cliff bands, carved road
   passes, explorability and POI-shelf probes, mountain material/texture
   work. Target summit feel ≈ a proper tall mountain (Skyrim's Throat of the
   World renders ~1,100–1,300 m); at ×1/×1 that means raising true summit
   heights from today's ~126 m into the high hundreds of metres — the exact
   number is an owner gate decision on foot, and perceived drama should come
   primarily from local relief contrast (deep valleys beside peaks), not
   summit altitude alone.

## Mechanics

**Addendum 2026-08-24 (6b implementation):** summit target defaulted to
**650 m** (`sculpt.SUMMIT_TARGET_M`, one constant — owner retunes at the walk
review); drama is delivered mainly as local relief (~257 m median valley-ridge
contrast in the belts). Two classifier recalibrations were forced by
de-quantising the source's shelf-and-wall lowland and are documented at the
constants: wetland ceiling 8→9.5 m (`hydrology.WETLAND_MAX_ELEV`) and a
grey-closing lowland-context gate (gorge floors ≠ marsh). The near-empty
tidal/salt-marsh classes of the approved world turn out to have been an
artefact (the whole coast sat on one quantised 2 m shelf — no land existed
below 1.5 m); 6b reveals a real tidal fringe, presented to the owner as a
correction, not a regression.

Heights stay true metres (0003/0006 convention, unchanged). The horizontal
scale is metadata + a small set of `RAW_M`-style constants in
`tooling/world-generation/worldgen/` (never resampled, so reverting is
lossless); at ×1 ground resolution returns to 1.83 m/sample. Classifier
thresholds that were implicitly tuned at ×3 slopes/distances (wetland slope,
rocky-soil slope, distance-to-sea bands, route costs) must be re-tuned in 6b
so the owner-approved region character is preserved — verified against
before/after region/soil/flood fraction stats, not by eye. The published
rasters/chunks keep ×3/×5-era values until Phase 6b lands.

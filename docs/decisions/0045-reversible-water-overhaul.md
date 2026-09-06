# 0045 — Reversible, terrain-constrained water

2026-09-06. Owner commissioned a comprehensive water rework and allowed implementation choices to supersede earlier water prescriptions. The quality contract is [water-quality.md](../research/rendering/water-quality.md); this does not close the owner's visual review.

“First class” means water belongs to its geography, reads coherently from walking height and underwater, responds proportionately to weather and contact, and agrees with physics. A feature checklist or a particular ocean algorithm is not the acceptance criterion. Preserve the existing tidal and seasonal ranges, light-stack integration, reflections, light shafts and underwater surface optics.

The principal defects were structural: dry-ground heights blended into the water field; coarse drainage climbing over refined terrain; incompatible raster origins; a camera-following grid joining unrelated inland levels; and interaction displacement crossing land. The replacement separates supported water from ground, solves flat standing water and nonascending channel profiles on native terrain, and uses body-isolated inland tiles plus explicit channel ribbons. A sparse, bounded channel-bed overlay repairs existing bed sills without overwriting source terrain. Rendering, terrain queries and colliders consume the same corrected grid. Routing intention is frozen from the original terrain; physical bank caps must be measured on the corrected triangles. Reusing original heights for both roles can overestimate a bank after a neighbouring bed corner is lowered.

Reusable loading, terrain caching, materials, shared capture/composite, ripples, particles, contact emission and buoyancy now live in `packages/game-core`. Studio code supplies time, weather, lighting, terrain and debug wiring. Both quality tiers use the same semantic and physical model. Caustics modulate directly lit submerged terrain; a receiver reconstruction fallback is available to consumers without that terrain integration.

New compiled assets are isolated under `province/water/v2/`. `?water=legacy` selects retained studio rendering and original terrain/water assets on reload. That is a visual comparison switch, not a bit-for-bit rollback of shared core fixes. Reverting the water implementation commit(s) restores the previous code completely; the pre-water baseline is `0b67e12`. Never delete the legacy directory or overwrite original assets until the owner accepts removal of this safety net.

## Completion-pass addendum — implementation in progress

The owner reopened the first candidate and explicitly commissioned deferred
ocean/hero-pool improvements and high-framerate walk/fly delivery. The complete
[acceptance ledger](../research/rendering/water-completion-audit.md) governs
closure; earlier minimum-film and point-only geometry gates are insufficient.
Flowing reaches use their semantic depth targets subject to real pool/shore
and bank constraints. A bank cap below the routed bed is an unresolved
constraint, not permission to fabricate bed+3cm as a cap. Sparse native
diagonal choices must be identical in terrain rendering, collision and queries.

The local pass adds deterministic spectral cascades with frequency-filtered
render levels and a persistent bounded displacement simulation. A shared
native-ground/interactive-field GPU data atlas is being implemented to keep
exact bank clipping without expanding province water into tens of millions of
triangles. This is runtime data, not new bitmap art. Physical queries retain
the same native terrain authority. Capacity bounds must not silently remove
visible water. [Local fluid and GPU notes](../research/rendering/water-local-fluid-and-gpu-budgets.md)
record the optical/compatibility choices; final data, performance, visual and
deployment gates remain open.

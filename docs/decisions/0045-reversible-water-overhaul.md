# 0045 — Reversible, terrain-constrained water

2026-09-06. Owner commissioned a comprehensive water rework and allowed implementation choices to supersede earlier water prescriptions. The quality contract is [water-quality.md](../research/rendering/water-quality.md); this does not close the owner's visual review.

“First class” means water belongs to its geography, reads coherently from walking height and underwater, responds proportionately to weather and contact, and agrees with physics. A feature checklist or a particular ocean algorithm is not the acceptance criterion. Preserve existing low-water limits, light-stack integration, reflections, light shafts and underwater surface optics. Owner correction (2026-09-06): upper tidal/seasonal limits may increase to fill the full terrain-authored water footprint at peak stage.

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


### Independent high/low stages (2026-09-06)

Previously the wet-season amplitude also determined dry-season drawdown and
high tide also set low tide. A larger upper bound therefore changed both
ends. Optional compiled `stageRange` now records four positive magnitudes:
`tidalAmplitudeM`, `seasonalAmplitudeM`, `lowTideAmplitudeM`,
`drySeasonAmplitudeM`. It takes precedence over the legacy flood-state file
and is shared by the CPU clock, renderer bounds and terrain-shore protection.
Legacy bundles retain their previous behaviour. Geometry compilation uses the
same maximum stage and an inaccessible access value above that maximum;
the old fixed 2 m sentinel would incorrectly admit unreachable terrain when
upper stages increased. No new amplitudes have been selected for production.

The [bankfull investigation](../research/rendering/water-bankfull.md) separates
underfilled native channels from distance-only mud painting on valley sides.
Final acceptance needs connected whole-area coverage, including standing water;
river-station statistics alone cannot establish that result.

### Original drainage and route feasibility (2026-09-06)

Raw local film heights do not determine flow direction at a receiving pool:
an upstream reach may need to backwater before entering it. The25 recorded
direction discrepancies were reviewed against immutable pool planes and
authored drainage.24 restore authored flow;4328 retains authored inflow into
pool4329. Its orientation ordering marker never supplies a physical height.
Exact evidence lives in the durable routing audit.

Route proposals may use the existing semantic channel radius, as automatic
routing already does, while preserving endpoints and not crossing a higher
original saddle. Original-pool sampling relocations remain limited to two
native intervals. Candidate costs can consider immutable excavation floors and
fixed receiving heads; they never authorise a cut or waive fresh global
geometry and original-water preservation checks.

The next accepted semantic-width group resolves17 further channels with no
new failures and preserves original pool planes, spill potential and wet
fringes. Repairs may remove extensions that earlier repairs created on
originally dry ground; exact changed indices and immutable wet-mask evidence
are recorded separately from original water preservation.

Peak-footprint evidence now comes from an exact replay of the natural terrain
carvers. The replay must use the saved natural boat lanes: current lanes were
later moved to berth terminals. Road grading is a subsequent signed terrain
delta. The read-only diagnostic refuses to publish carving provenance unless
its natural result matches the saved ungraded heightfield exactly. Carve
depths and Gaussian tails are evidence for footprint interpretation, not an
automatic instruction to flood every modified terrain sample.

Connected repair components may adjust calculated incident river heads up to
fixed original-pool junctions. Holding all valid neighboring river heads at
their earlier solution can exclude feasible bounded repairs. Coincident
routed points impose the same equality in the proposal and global solver.
Existing indexed deeper cuts do not make a routine proposal infeasible merely
by remaining present: the per-vertex limit still forbids additional excavation
there, and no old exception grants deeper cuts elsewhere. Fresh domains and
original-water preservation remain the acceptance authority.

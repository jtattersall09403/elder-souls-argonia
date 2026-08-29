# 0017 — Full sandbox parity in the studio moves from Phase 7b to Phase 10b

**Date**: 2026-08-25 · **Status**: accepted (owner, 2026-08-25: 7b looks
deliverable and isn't needed by the riskier stages they want to test next)

## Decision

The phase formerly called **7b — remaining character integration** (everything
intended to be portable from the combat sandbox, usable by the player in the
world studio) is resequenced to **Phase 10b**, running after the asset
catalogue and kits (Phase 10) and before settlement authoring (Phase 11).
Phase 7a (extraction of the portable *core* plus grounded movement) is
unaffected and stays done. References to "Phase 7b" anywhere in the repo mean
Phase 10b.

## Why there, and not earlier or later

- **Nothing between depends on it.** Phases 8a (light/sky), 8b (water), 8c
  (weather), 9 (swim/climb/boats) and 10 (kits) need Phase 7a's movement and
  the environment-query contract, both of which shipped. Deferring costs them
  nothing.
- **Risk ordering.** Light, water, swimming, climbing, boats and the asset
  pipeline are where the unknowns are. Parity work is well-understood
  refactoring against a known target — the right thing to do *after* the risky
  systems have moved the target for the last time.
- **One merge instead of two.** The scene-orchestration extraction (§53) lands
  against a `packages/character` that already carries swim, climb and boat
  modes, rather than being merged before Phase 9 and reconciled after it.
- **Better measurements.** Combat-space probes (§69: capsule/hurtbox
  clearance, roll corridors, weapon sweeps, paired-critical space, lock-on
  sight lines) run against Phase 10's production kits, materials and collision
  instead of placeholder ground.
- **Hard floor at Phase 11.** It cannot slip further: settlement and dungeon
  authoring is gated on "combat spaces and critical-animation clearance
  validated" (00-core acceptance), and Phase 13 (fixed populations, encounter
  sockets, fixed loot, arrows) is impossible without enemies, targeting, bow
  and inventory. *(Addendum 2026-08-29, decision 0034: relaxed to a
  **freeze-gate** — 11/12 exemplar authoring may start before 10b under
  semantic authoring; a packet freezes only once 10b's probes pass. The
  Phase 13 dependency stands.)* Placing it after Phase 12 would mean authoring the first
  production dungeon blind to combat.

## Consequences

- Phase 9's "stat/spell/equipment modifiers" deliverable lands as a **thin
  contract with defaults**, since the equipment systems and UI now arrive
  later; Phase 9 must not block on them.
- **Standing drift risk**: the sandbox remains the only place combat runs for
  longer. Mitigation is the existing package rule (decision 0013) — new
  portable behaviour lands in `packages/`, never directly in
  `apps/combat-sandbox` — plus both apps' gates staying green. An agent that
  finds itself adding portable combat/inventory code to the sandbox app is
  doing Phase 10b work early and should say so.
- Phase 7a's deliverable list in Module 95 is annotated with what actually
  shipped (the portable core), so the phase description matches the gate that
  passed.

# 0093 — Swimming is a movement mode behind the controller boundary, fed by the water query the world already has

**Date:** 2026-09-24. **Status:** accepted (combat-sandbox lane round 5,
under 0087's delegation). The thin swim of Phase 9a, movement only, proved in
the sandbox so the studio adopts it rather than rebuilding it.

## Decisions

1. **The water comes in through the existing contract.** The runtime takes a
   `WaterSampler = Pick<WorldWaterQuery, "sample">` (`@elder-souls/contracts`)
   on its host. The sandbox passes a flat pool (`flatPoolSampler`); the studio
   passes its `WaterWorld` unchanged when it adopts the runtime (10b). No
   second water model.
2. **Swim is a mode of `PlayerMovementController`** (`setMovementMode`,
   optional so existing controllers compile). Ecctrl has no buoyancy and
   rewrites gravity every frame, so in swim mode the adapter switches ecctrl
   off and drives the body itself: no gravity, velocity from the stick, a
   damped spring holding the chest at the surface. Grounded mode restores
   ecctrl untouched.
3. **Entering and leaving** use the sample's immersion with hysteresis, the
   water sampled at the top of the 1.7 m body column (feet + 1.7 m), which is
   what `WaterWorld` means by the query point: swim at 0.62 (water 1.05 m deep,
   chest under), back to grounded under 0.45 (0.77 m) with the feet on ground.
   The adapter keeps driving the body until ecctrl's first enabled frame, so
   the handover never leaves it undriven.
4. **Speed is the stats model's** `swimSpeed(athletics)` (1.60 m/s at the
   reference Athletics 50). A sprint-swim multiplier is an owner call not yet
   made; sprinting swims at normal speed until it is.
5. **Vanilla's rules for the body.** Five in-place vanilla clips (idle,
   forward, back, left, right), forward at the vanilla slow rate and doubled at
   full stick; the weapon is put away on entry, as Skyrim's swim state forces;
   no attacks, guard, dodge or jump in the water (a draught may be drunk: owner call pending); a carried torch goes out
   (0091's `submerged` hook) without being used up.
6. **Breath is left for 9a proper**: the HUD state carries `swimming` and
   `submergedSeconds` for the breath bar to read; diving and underwater
   swimming wait for the same.

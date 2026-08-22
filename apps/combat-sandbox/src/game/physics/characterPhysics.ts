export const CHARACTER_CAPSULE_HALF_HEIGHT = 0.42;
export const CHARACTER_CAPSULE_RADIUS = 0.3;
export const CHARACTER_FLOAT_HEIGHT = 0.18;
export const CHARACTER_BODY_CENTER_HEIGHT = CHARACTER_CAPSULE_HALF_HEIGHT + CHARACTER_CAPSULE_RADIUS + CHARACTER_FLOAT_HEIGHT;
export const CHARACTER_MODEL_OFFSET = -CHARACTER_BODY_CENTER_HEIGHT;
export const CHARACTER_RAY_RADIUS = CHARACTER_CAPSULE_RADIUS / 2;

// Locomotion and combat deliberately use different volumes. Ecctrl's compact
// capsule is tuned for stairs, suspension, and navigation; weapon contact must
// cover the full rendered actor, including the upper torso and shoulders.
export const CHARACTER_COMBAT_HURTBOX_RADIUS = 0.34;

export function combatHurtboxHalfHeight(targetHeight: number) {
  return Math.max(0, targetHeight / 2 - CHARACTER_COMBAT_HURTBOX_RADIUS);
}

export function combatHurtboxCenterOffset(targetHeight: number) {
  return targetHeight / 2 - CHARACTER_BODY_CENTER_HEIGHT;
}

// Ecctrl's grounded threshold is its suspension target plus this forgiveness.
// Keep it small so the controller can prepare its spring without reporting a
// landing while the visible soles are still noticeably above the support.
export const CHARACTER_RAY_HIT_FORGIVENESS = 0.015;
export const CHARACTER_SPRING_K = 92;
// A density-1 Rapier capsule at these dimensions weighs about 0.3506 kg, so
// 2 * sqrt(km) is about 11.36. Slightly rounding up prevents the suspension
// from bouncing the rendered feet through the floor after a fast descent.
export const CHARACTER_DAMPING_C = 11.5;

export const JUMP_IMPULSE_DURATION = 1 / 60;

export const BASE_JUMP_VELOCITY = 5.2;
// Increasing velocity by sqrt(gravityScale) preserves the apex height while
// shortening the ascent. A stronger fall scale gives the arc a decisive drop.
export const JUMP_GRAVITY_SCALE = 3;
export const JUMP_VELOCITY = BASE_JUMP_VELOCITY * Math.sqrt(JUMP_GRAVITY_SCALE);
export const FALLING_GRAVITY_SCALE = 4;
// The runtime maps the manifest's authored takeoff out-point onto this window.
// Keep animation source timing in the generated animation manifest, not here.
export const JUMP_START_DURATION = JUMP_VELOCITY / (9.81 * JUMP_GRAVITY_SCALE);
// The authored launch needs longer than the short high-gravity ascent to read
// as a continuous anticipation and take-off. This is visual-only: it neither
// delays the impulse nor locks movement/gameplay through the extra tail.
export const JUMP_LAUNCH_ANIMATION_DURATION = 0.46;
export const JUMP_LAND_DURATION = 0.42;

export function jumpApexHeight(velocity: number, gravityScale: number, gravity = 9.81) {
  return velocity * velocity / (2 * gravity * gravityScale);
}

export function jumpApexTime(velocity: number, gravityScale: number, gravity = 9.81) {
  return velocity / (gravity * gravityScale);
}

/**
 * Field of view of the ordinary follow camera, in degrees.
 *
 * Shared rather than repeated: the aim camera widens away from it and back, and
 * two copies of the number would drift the moment either is tuned.
 */
export const BASE_FIELD_OF_VIEW = 48;

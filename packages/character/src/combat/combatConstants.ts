/** Seconds the "enemy felled" message stays up. */
export const ENEMY_FELLED_MESSAGE_DURATION = 1.8;
/** The player's combat hurtbox body name; weapon sensors report contacts by it. */
export const PLAYER_HURTBOX_NAME = "player-hurtbox";

/**
 * How long a blade-on-body contact waits for an active parry catch to claim
 * the same swing. A handful of physics steps: long enough to lose the sensor
 * race gracefully, far too short to act as invulnerability.
 */
export const PARRY_HIT_GRACE_SECONDS = 0.12;

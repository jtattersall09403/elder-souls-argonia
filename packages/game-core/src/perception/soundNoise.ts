import type { SoundEvent } from "@elder-souls/audio";
import type { NoiseEvent } from "./noise";

/**
 * What the stealth service hears of a sound event (decision 0092 §3, 0095):
 * the perception step subscribes to the same `SoundEventBus` the speakers
 * play from, so an enemy hears exactly what was sounded, muted or not. The
 * table is the sound lane's handoff; audio stays free of game-core because
 * the mapping lives here.
 *
 * A roll has no vanilla sound of its own and plays the landing thump; the
 * caller says whether the actor is rolling, so the thump is heard as a roll
 * (0.5), not as a jump landing (0.7). Events with no noise (a draw, a hit, a
 * stroke) return null: the struck enemy is engaged by the blow itself.
 */
export function noiseForSound(event: SoundEvent, context: { rolling: boolean }): NoiseEvent | null {
  switch (event.type) {
    case "movement.footstep":
      return event.gait === "sneak" ? "walkSneaking" : event.gait;
    case "movement.land":
      return context.rolling ? "roll" : "jumpLanding";
    case "combat.swing":
      return "attackSwing";
    case "combat.block":
    case "combat.parry":
      return "blockHit";
    default:
      return null;
  }
}

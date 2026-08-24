type Sound = "swing" | "hit" | "guard" | "parry" | "roll" | "heal" | "death";

// Sound effects are disabled; kept as a no-op so combat/UI call sites don't
// need to change if audio is reintroduced later.
class CombatAudio {
  unlock() {}

  play(_sound: Sound) {}
}

export const combatAudio = new CombatAudio();

# perception — who notices whom

Decision 0092. Pure rules; the caller supplies what the world knows.

| File | Holds |
|---|---|
| `detection.ts` | `perceive` (Morrowind's Elusiveness against spot score × direction × light, compared, never rolled) and `stepAwareness` (unaware → suspicious → engaged, versioned `AwarenessState`). |
| `noise.ts` | `NOISE_LOUDNESS` per player event and `noiseHeard` (linear falloff over 15 m). |
| `soundNoise.ts` | `noiseForSound`: the `NoiseEvent` a sound event is heard as (the sound lane's table; a landing thump while rolling is a roll). |

The combat runtime feeds both from `character/src/combat/stealthStep.ts`: a
Rapier ray for line of sight, the carried light or the host's ambient light,
the loudest of the player's own sound events since the last step, heard off the
session's `SoundEventBus` (decision 0095). Per-creature perception numbers live
on `EnemyArchetype.perception` (placeholders until Phase 10c's D-ladder).

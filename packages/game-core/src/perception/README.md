# perception — who notices whom

Decision 0092. Pure rules; the caller supplies what the world knows.

| File | Holds |
|---|---|
| `detection.ts` | `perceive` (Morrowind's Elusiveness against spot score × direction × light, compared, never rolled) and `stepAwareness` (unaware → suspicious → engaged, versioned `AwarenessState`). |
| `noise.ts` | `NOISE_LOUDNESS` per player event and `noiseHeard` (linear falloff over 15 m). |

The combat runtime feeds both from `character/src/combat/stealthStep.ts`: a
Rapier ray for line of sight, the carried light or the host's ambient light,
the loudest player event of the frame. Per-creature perception numbers live
on `EnemyArchetype.perception` (placeholders until Phase 10c's D-ladder).

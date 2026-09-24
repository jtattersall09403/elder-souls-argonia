# Combat runtime (`@elder-souls/character`, `src/combat/`)

The encounter as one mountable component: the player's rig, stance, camera,
lock-on and bow; the enemies, their AI step and their bodies; hit resolution
wiring; hit-stop, shake and the HUD feed. Extracted from the combat sandbox's
`CombatScene.tsx` on 2026-09-24 (combat-sandbox lane round 0) so the sandbox,
the world studio and the game run the same code. The rules it calls
(`resolveHit`, movesets, AI scoring, ballistics) live in
`@elder-souls/game-core`; this module is the R3F/Rapier layer that drives them.

## Mounting it

```tsx
<Physics timeStep={1 / 60} interpolate>
  <YourGround />
  <CombatRuntime settings={settings} publish={setHud} layout={layout} />
</Physics>
```

| Prop | What the host provides |
|---|---|
| `settings` | `CombatRuntimeSettings` (`host.ts`): started, reset token, enemy count and archetype, debug draws, skill switches, pools. Read on render and through a ref in the frame loop. |
| `publish` | Receives `Partial<CombatHudState>` every 50 ms (and on damage). The runtime owns no store. |
| `layout` | `EncounterLayout`: player start and yaw, enemy spawn points, in the host's world. Defaults to the sandbox arena. |
| `onArrowSample` | Optional; every simulated arrow step (probes). |
| `lightEnvironment` | Optional `(worldPosition) => LightEnvironment`: whether a carried light is under water there (decision 0091); a torch put out by water is not used up. When absent the runtime asks `water`; with neither, dry. |
| `water` | Optional `WaterSampler` (`game-core/physics/waterSampler`, the `sample` half of the contracts' `WorldWaterQuery`): where the player swims (decision 0093). The sandbox passes its pool (`flatPoolSampler`); the studio passes its `WaterWorld` (10b). With it the player loads the `swim` animation pack and the HUD carries `swimming` and `submergedSeconds`. Absent means no swimming. |
| `visualScenario` | Optional scripted validation scene (`game-core/validation`); writes `window.__COMBAT_VISUAL_SCENARIO__` telemetry (`visualTelemetry.ts`). |

What else the host must supply (Phase 10b's adoption list for
`apps/world-studio/src/character/CharacterMode.tsx`):

- a Rapier `<Physics>` world with ground colliders under `layout`, and no other
  camera controller: the runtime drives the default R3F camera;
- the character assets served by the `@elder-souls/character-assets` vite plugin;
- the game-core stores it reads today: the inventory (`useInventoryStore`,
  loadout and worn armour), the race store (`usePlayerBuild`), the arrow store,
  and the `input` reader (attached on mount). These are existing module
  singletons in game-core, not new ones; injecting them is 10b's pass;
- pausing: the runtime stops its own clock while the inventory is open; the host
  pauses `<Physics>` itself.

## Files

| File | Holds |
|---|---|
| `CombatRuntime.tsx` | The component: refs, callbacks, reset, the frame loop for the player, camera and HUD. |
| `enemyStep.ts` | One enemy's frame: status ticks, facing, the AI intent and the tactical state machine. An enemy that is not engaged chooses nothing (decision 0092). |
| `stealthStep.ts` | Stealth's frame (decision 0092), run before the enemies' steps: each enemy's sight (a Rapier ray the runtime supplies) and hearing fed to `game-core/perception`, its awareness advanced; the sneak-attack multiplier and the HUD's detection readout. |
| `enemyRuntime.ts` | `EnemyRuntime` (Fighter plus body/view handles), spawn defaults. |
| `enemyBow.ts` | An archer's aim solve and loose. |
| `EnemyActor.tsx` | An enemy's Ecctrl body, actor, reticle, health bar and hit volumes. |
| `HeldObjectHitbox.tsx` | The weapon and parry sensors, and the capsule fallback hurtbox. |
| `aimRig.ts`, `locomotionHelpers.ts`, `combatConstants.ts` | Aim camera numbers, planted-pivot and locked-clip helpers, shared names. |
| `host.ts`, `visualTelemetry.ts` | The host contract and the validation telemetry type. |
| `LockOnReticle.tsx`, `ActorHealthBar.tsx`, `BackstabZoneIndicator.tsx`, `ViewConeIndicator.tsx`, `AnalogueSpeedLimiter.tsx`, `useCarriedAssetWarmup.ts` | Small view pieces. |

## Rules

- The player moves through `PlayerBody`/`EcctrlAdapter`; nothing here imports
  ecctrl for the player beyond the handle type. Enemies still use `Ecctrl`
  directly (their own controller swap is 10b's).
- Every player-visible line is a `text.combat.*` catalogue entry.
- A new system that joins the encounter (stealth, swimming, carried light) adds
  a step module beside `enemyStep.ts` and a field on the host contract; it does
  not grow `CombatRuntime.tsx`'s frame loop.

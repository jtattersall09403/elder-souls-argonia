# Ashen Ring — ecctrl Souls combat prototype

A compact browser combat sandbox built on [ecctrl](https://github.com/pmndrs/ecctrl), React Three Fiber, Three.js, and Rapier. It is designed to run on desktop browsers, touch devices, and standard Gamepad API controllers including the GameSir X2s Type-C.

## Play

**[Play Ashen Ring in your browser](https://jtattersall09403.github.io/ecctrl-souls-combat/)**

The Pages build is published from `main`. Desktop and mobile browsers load the same URL.

## Included combat systems

- lock-on camera and unlocked orbit camera
- stamina-gated attacks, sprinting, blocking, parrying, and dodging
- roll invulnerability frames, attack windup/active/recovery phases, hit-stop, and camera shake
- one-handed straight-sword three-hit light chain, two-hit heavy chain, parry riposte, and positional backstab
- guard stability, chip damage, guard break, hit reactions, healing, death, and reset
- one enemy with spacing, approach, telegraph, active attack, recovery, stagger, parried, and death states
- equip/unequip state with a data-defined weapon moveset
- pipeline-built Skyrim character with semantic combat and locomotion clips
- keyboard/mouse, responsive touch UI, and GameSir/Nintendo-layout controls

## Controls

| Action | Desktop | Mobile touchscreen | Mobile + GameSir X2s |
| --- | --- | --- | --- |
| Move | WASD or arrow keys | Left virtual stick | Left stick |
| Camera | Drag the right side | Drag the right side | Right stick |
| Light attack | Mouse 1 | R button | R |
| Heavy attack | R key | ZR button | ZR |
| Guard | Mouse 2 | L button | L |
| Parry | F or Mouse 3 | ZL button | ZL |
| Dodge | Tap Space | Tap B | Tap B |
| Sprint | Hold Space while moving | Hold B while moving | Hold B while moving |
| Jump | J | A button | Left-stick click (L3) |
| Lock on/off | Q | R3 button | Right-stick click (R3) |
| Use Estus | H | X button | X |
| Equip/unequip sword | E | → button | D-pad right |
| Backstab | Light attack close behind enemy | R close behind enemy | R close behind enemy |
| Riposte | Light attack after a successful parry | R after a successful parry | R after a successful parry |

Gamepad mappings use standard Gamepad API **physical button positions**. The GameSir X2s Type-C uses Nintendo-style ABXY caps; the bottom face button is displayed as B.

Queue the next light or heavy input during the current swing to continue its
chain at the active-to-recovery boundary. Each combo step has its own animation,
timing, stamina cost, and damage.

## Development

Requires Node 22+.

```bash
npm install
npm run dev
```

The dev server listens on `0.0.0.0:8081`. Use `http://localhost:8081/`.

Validation:

```bash
npm test
npm run typecheck
npm run build
```

Animation work has two extra tools, both scoped to a scenario group:

```bash
npm run visual:check  -- locomotion  # fast automated probes, no video
npm run visual:record -- locomotion  # recordings for a human to watch
```

Recording exists so animation changes can be judged by eye; it is not a gate.
See [`docs/validation/animation-recordings.md`](docs/validation/animation-recordings.md).

## Project layout

`src/game/` holds framework-free combat logic, split by concern so it can be tested in isolation and ported without React/Three.js:

| Folder | Contents |
| --- | --- |
| `core/` | Shared types, the HUD-facing zustand store, and the fixed-timestep loop helper |
| `combat/` | Weapon movesets and tuning, the `Fighter` actor model, shared hit resolution, player intent, and the combat event bus |
| `ai/` | The enemy utility-AI intent scorer |
| `anim/` | Semantic animation commands/manifests, weapon sockets, grounding metadata, and lock-on math |
| `physics/` | Navigation capsule, independent combat-hurtbox geometry, and jump tuning |
| `io/` | Keyboard/mouse/gamepad/touch input controller |
| `fx/` | Audio synthesis and camera shake |

Framework-free modules keep colocated tests. `src/components/` contains the
React Three Fiber view layer (`CombatScene`, `SkyrimFighter`, `Arena`, `Hud`)
that reads this state.

## Extending weapons and movesets

Combat data lives in `src/game/combat/weapon.ts`. `WeaponDefinition` separates
timing, stamina, damage, reach, arc, lunge, hit-stop, semantic animations, and
weapon socket transforms from the combat controller. Add source clips through
the asset pipeline and rebuild the semantic manifest/GLB; no enemy-AI or input
rewrite is required.

The arena, HUD, input adapter, animation model, and combat rules are separate components so the controller and combat package can be moved into another Three.js setting. `src/game/combat/fighter.ts` and `resolveHit.ts` are the actor model and hit-resolution rules shared by the player and the enemy; `intent.ts` and `events.ts` are the seams for swapping the input source or the audio/camera/HUD side effects when this is ported into a larger project.

## GitHub Pages

The workflow at `.github/workflows/deploy-pages.yml` runs unit tests and the
complete automated production animation capture before it can publish `dist`.
The required project-owner qualitative review remains the pre-merge acceptance
gate because agents and CI do not decide whether motion looks right. In repository
**Settings → Pages**, select **GitHub Actions** as the source.

The required `public/character-dunmer-combat.glb` and
`public/weapon-steel-sword.glb` are versioned deployment inputs. `npm run
assets` verifies both before each build, so Pages does not silently publish a
scene with missing local-only assets or a character GLB/manifest hash mismatch.

## Asset attribution

See the root [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) for
runtime npm dependency licenses and the root
[README § Credits](../../README.md#credits-and-third-party-sources) for game
asset/mod sources. Runtime character and weapon asset provenance is
documented under `docs/assets/`.

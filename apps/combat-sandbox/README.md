# Ecctrl Souls combat prototype

A compact browser combat sandbox built on [ecctrl](https://github.com/pmndrs/ecctrl), React Three Fiber, Three.js, and Rapier. It is designed to run on desktop browsers, touch devices, and standard Gamepad API controllers including the GameSir X2s Type-C.

## Play

**[Play the sandbox in your browser](https://jtattersall09403.github.io/elder-souls-argonia/)**

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
- vanilla Skyrim sound (decision 0095): swings, hits, blocks, draws, the bow, footsteps on the arena's stone and in the pool, swimming and a burning torch; sound starts after the first click or key press

## Controls

| Action | Desktop | Mobile touchscreen | Mobile + GameSir X2s |
| --- | --- | --- | --- |
| Move | WASD or arrow keys | Left virtual stick | Left stick |
| Camera | Drag the right side | Drag the right side | Right stick |
| Light attack | Release Mouse 1 before 0.3 s | R button | R |
| Heavy attack | Hold Mouse 1 for 0.3 s | ZR button | ZR |
| Guard | Mouse 2 | L button | L |
| Parry | Hold Mouse 2, then press Mouse 1 | ZL button | ZL |
| Dodge | Tap Space | Tap B | Tap B |
| Sprint | Hold Space while moving | Hold B while moving | Hold B while moving |
| Jump | Left or right Shift | A button | A button |
| Lock on/off | Q | R3 button | Right-stick click (R3) |
| Use Estus | H | X button | X |
| Equip/unequip weapon | Tab | → button | D-pad right |
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

The sandbox is composition, tooling and debug UI; everything the game needs
lives in packages:

| Where | Contents |
| --- | --- |
| `packages/game-core/src/` | Framework-free rules with colocated tests: `combat/` (resolve step, fighter, bows, poise, intent, events), `equipment/` (classes, movesets, arsenal), `ai/`, `anim/`, `locomotion/`, `physics/`, `io/` (input), `fx/`, `inventory/`, `actors/`, `validation/` (visual scenarios) |
| `packages/character/src/` | The rendered character (`SkyrimFighter`, hurtboxes, `PlayerBody` behind `EcctrlAdapter`) and the combat runtime in `combat/` (see its README) |
| `apps/combat-sandbox/src/` | `App.tsx`, `components/CombatScene.tsx` (arena, lights, runtime wiring), `Hud.tsx` (debug panel), `sandboxStore.ts` (the debug store the runtime reads as `settings`), inventory and picker UI |

## Extending weapons and movesets

A weapon class, moveset and arsenal item are data in
`packages/game-core/src/equipment/` (`weaponClasses.ts`, `movesets/`,
`arsenal.ts`); see that folder and the weapons lane brief
(`docs/phases/lanes/weapons-lane.md`). Add source clips through the asset
pipeline and rebuild the semantic manifest/GLB; no AI or input rewrite is
required. Hit resolution is `combat/resolveHit.ts` (order in
`combat/README.md`).

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

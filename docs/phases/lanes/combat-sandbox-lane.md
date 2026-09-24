# Combat sandbox lane (decision 0087; Opus lead)

Successor to the [weapons lane](weapons-lane.md) on the same folders, widened
(2026-09-24). Moves the sandbox's runtime into a package once, then builds the
owner's feedback, off-hand items, a stealth slice and a thin swim into it, each
shaped for the later systems (stealth, magic, lanterns, Phase 9 swim, climb and
boats, factions) rather than for the sandbox.

## Folders

- **Owns:** `apps/combat-sandbox/**`;
  `packages/game-core/src/{combat,equipment,anim,locomotion,inventory,core,actors,ai,perception,fx}/**`;
  `packages/character/**`; `packages/character-assets/**`;
  `packages/text-catalogue` (combat and sandbox strings); this brief and the
  weapons brief; new decision records; one note in
  [phases README § Phase 10c](../README.md).
- **Never touches:** 16h's folders (`tooling/world-generation`,
  `tooling/asset-pipeline` outside character/weapon configs,
  `packages/game-core/src/settlement`, `world/`, `apps/world-studio`,
  `tooling/pages-site`, root `package.json`/`README.md`,
  `docs/phases/16-*`); the stats lab's `packages/game-core/src/stats` and
  `apps/stats-lab` (read only).

## Rounds

| Round | What | Status | Record |
|---|---|---|---|
| 0 | Runtime out of `CombatScene.tsx` into `packages/character/src/combat/` with an injected host; debug store into the app | delivered 2026-09-24 | [0089](../../decisions/0089-the-combat-runtime-is-a-package-with-an-injected-host.md) |
| 1 | Every built weapon and shield in the starting pack; HUD weapon label from the loadout | delivered 2026-09-24 | this row |
| 2 | Owner feedback: Strength in bow damage, "range position" label, two-hander swing phase ×0.85, timing panel, sword crit effect, curves default | planned | |
| 3 | Off-hand items: dual wield, torches, carried light | planned | |
| 4 | Stealth slice: detection service, awareness states, sneak-attack band | planned | |
| 5 | Thin swim: swim mode behind an injected water sampler | planned | |

Round 1 notes: the pack is `STARTING_SUPPLIES` (arrows, draughts, picks) plus
`STARTING_ARMOURY_IDS` (every key of `ARSENAL_WEAPONS`, `ARSENAL_SHIELDS` and
`ARMOUR_IDS`), so a weapon built by the pipeline is in the owner's hands on the
next load with no list to edit. The carry limit is sized to the pack (+20 %).

## Gates

`npm test`, `npm run typecheck`, `npm run visual:check -w
@elder-souls/combat-sandbox -- <group>` for the groups a round touches (the
whole suite for cross-cutting rounds), then `npm run preflight -- --paths
<the round's files>` and a pathspec commit. Full reports per round in
`/tmp/lanes/combat/round-N.md`.

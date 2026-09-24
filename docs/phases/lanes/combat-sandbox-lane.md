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
| 2 | Owner feedback: Strength in bow damage, "range position" label, two-hander swing phase ×0.85, timing panel, sword crit effect, curves default | delivered 2026-09-24 | notes below |
| 3 | Off-hand items: dual wield, torches, carried light | delivered 2026-09-24; full visual suite 58/58 (notes) | [0091](../../decisions/0091-the-off-hand-holds-a-shield-a-weapon-or-a-light.md) |
| 4 | Stealth slice: detection service, awareness states, sneak-attack band | planned | |
| 5 | Thin swim: swim mode behind an injected water sampler | planned | |

Round 1 notes: the pack is `STARTING_SUPPLIES` (arrows, draughts, picks) plus
`STARTING_ARMOURY_IDS` (every key of `ARSENAL_WEAPONS`, `ARSENAL_SHIELDS` and
`ARMOUR_IDS`), so a weapon built by the pipeline is in the owner's hands on the
next load with no list to edit. The carry limit is sized to the pack (+20 %).

Round 2 notes:

- **Arrow calibration, no Strength on bows** ([0090](../../decisions/0090-arrow-damage-is-calibrated-to-a-masters-warbow-headshot.md),
  planner ruling): `DAMAGE_PER_JOULE` 0.5 → 0.57, so a master's full-draw
  daedric warbow headshot (daedric war arrow) on the hollow warden lands 165.1
  point-blank and 161.0 at 20 m, the body shot 82.5. The sandbox reads the
  stats model's `marksmanModifiers`/`meleeModifiers`; `combat/skillScalars.ts`
  is gone; the weapon class picks the melee skill (`equipment/weaponSkill.ts`).
- **Swing ×0.85.** `WeaponClassProfile.swingSpeedScale` 0.85 on greatsword,
  greataxe, halberd and warhammer scales active and recovery of the five melee
  attacks, wind-up unchanged; `AttackSpec.timeScale` is `{ windup, swing }`
  and the clip clock is two segments split at the wind-up (`anim/clipTiming`,
  used by `SkyrimFighter`, `attackProgressTime`, the reach bake). Criticals
  keep one scale (their paired timing is a fraction of the action). Baked
  reach moved on those four classes only (65 attacks, within ±0.08 m).
- **Sword trait.** `critChance` effect, 10 % for ×1.5, on straight sword,
  rapier and katana (Skyrim's Bladesman first rank: 10 %, the critical adding
  about half the base damage). The roll is the caller's (`HitContext.critRoll`;
  scenes pass 1). Spears, pikes and staves: none.
- **Timing panel** (debug panel, "Attack timings"): light and heavy wind-up /
  active / recovery per melee class from `classTimingTable()`; the signed table
  is [skyrim-weapon-records-fit.md §(c)](../../research/combat-and-systems/skyrim-weapon-records-fit.md).
- **Curves at start: left off.** With them on at the default skill 10 the
  `attacks` group fails 3 of 7 (heavy-chain and greataxe-chain run out of
  stamina for the next swing; offense-outcomes leaves the enemy alive at 0.46×
  damage), the same failure 0076 §3 recorded.
- The HUD's strings are catalogue entries (`SANDBOX_HUD_TEXT`); the debug panel
  is `DebugPanel.tsx`.
- **Found, queued:** foot-driven attack motion reads the ground track on the
  unscaled clock while the pose plays on the class clock; the fix fails
  `riposte-stab` (backlog row "Combat: foot-driven attack motion").

Round 3 notes (part A, pipeline): packs `dualWield` (DW_IDLE, DW_ATTACK_LEFT,
DW_POWER_LEFT, DW_POWER_DUAL) and `torch` (TORCH_POSE, TORCH_GUARD_ENTER,
TORCH_GUARD, TORCH_GUARD_HIT) from vanilla clips, built with `build_races --only
dunmer-male`; the rig and all 13 older packs byte-identical (md5). The torch is
built from `meshes/weapons/torch/torch.nif` (`config/weapons/lights.json`): the
handle, the additive GlowAddMesh and the `AttachLight` node; the two particle
systems do not convert. Torch01's LIGH values ride in `lights.items.json`. The
light's brightness (`CARRIED_LIGHT_CANDELA` 6) is the lane's guess: the record
has no absolute intensity.

Round 3 notes (part B, runtime):

- **Inventory.** `equipItem(inventory, id, "offHand")` puts a one-handed melee
  weapon in the left hand; new refusals `not-one-handed` and `needs-two` (the
  same weapon in both hands needs two). A two-handed weapon or a bow clears
  the off hand; the only copy moves between hands. Torches (`equipment/lights.ts`,
  from `generated/lights.items.json`) are stackable misc items, three in the
  starting pack. Right-click in the inventory sends a weapon or torch to the
  off hand. Every inventory string is a catalogue entry (`INVENTORY_TEXT`).
- **Controls.** `intent.offHandPresses`: desktop taps (light) or holds past
  0.3 s (power) the guard button; pad and touch press guard (light) and parry
  (power). Desktop is "no gamepad and a fine pointer", read in the runtime,
  because `io/input.ts` was outside this round's files.
- **Dual wield.** `movesets/dualWield.ts`: `offLight`, `offPower`,
  `dualPower` on the DW clips, contact windows measured with
  `measure-contact-windows.mjs --hand off`; `AttackSpec.hand` arms one sensor
  per hand (`player-offhand-weapon`) and each hand lands once per attack with
  its own weapon's numbers. DW_IDLE is the combat idle. No guard, no parry.
- **Off-hand mount** (`scripts/probe-off-hand-mount.mjs`): the `Shield` node
  with `OFF_HAND_NODE_HALF_TURN`, as shields and bows. The grip sits 0.116 m
  from the left hand bone (the main grip sits 0.096-0.122 m from the right),
  so the brief's "within 5 cm of the hand bone" cannot hold for any mount on
  that node. The rig has no left hip node; stowed off-hand weapons stay on it.
- **Torch.** Guard and hit on Skyrim's torch block clips; carried, the left arm
  takes TORCH_POSE as an overlay (`SkyrimFighter.leftArmOverlay`, 0.2 s
  blend): in `torch-carry` the arm's local rotations match the pose exactly
  (0.0 degrees) through WALK. `CarriedLight` is a point light on the torch's
  `AttachLight` node; the glow mesh renders additively with the NIF's view
  falloff; burning out removes one torch and announces it.
- **Visual.** Full suite 57/58 after part B; `dual-wield-attack` then failed
  because DW_POWER_LEFT's forward step shoves the warden a metre back before its
  contact window at the 1.0 m staging, and a dagger cannot reach from the sword
  scenes' 1.37 m. The lead re-staged it with two swords at 1.37 m (Skyrim's
  canonical pair): pass. The player's foot-driven attack travel pushing an
  enemy's capsule is queued (polish backlog, "Combat: the player's attack step
  shoves enemies").

## Gates

`npm test`, `npm run typecheck`, `npm run visual:check -w
@elder-souls/combat-sandbox -- <group>` for the groups a round touches (the
whole suite for cross-cutting rounds), then `npm run preflight -- --paths
<the round's files>` and a pathspec commit. Full reports per round in
`/tmp/lanes/combat/round-N.md`.

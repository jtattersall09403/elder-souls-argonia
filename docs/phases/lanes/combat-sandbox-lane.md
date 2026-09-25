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
| 4 | Stealth slice: detection service, awareness states, sneak-attack band | delivered 2026-09-24 | [0092](../../decisions/0092-stealth-is-a-detection-service-the-runtime-feeds.md) |
| 5 | Thin swim: swim mode behind an injected water sampler | delivered 2026-09-24; full suite 61/61 | [0093](../../decisions/0093-swimming-is-a-movement-mode-behind-the-controller-boundary.md) |
| 6 | Off-hand gesture into `io`, dual-wield combat actions; `sneak-swing` scene; owner-overridable defaults | delivered 2026-09-24 | notes below |
| 7 | Audio wired: the injected sound-event bus and AudioManager replace the `combatAudio` stub; combat, bow, draw, footstep, jump, swim events; torch emitter; stealth hears the bus; `sneak-heard` scene | delivered 2026-09-24 | notes below |

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

Round 4 notes: `perception/detection.ts` (Morrowind's Elusiveness against spot
× direction × light, compared not rolled; three awareness states) and
`perception/noise.ts` are pure with their expected answers written first; the
runtime feeds them per enemy per frame (`stealthStep.ts`: a Rapier ray for line
of sight, the carried light or the ambient-light slider for light, the player's
walk/run/sprint/landing/roll/swing/block noises). Unaware enemies idle and take
no intent, suspicious ones turn to the last place they saw or heard the
player. The first unseen blow takes the stats model's sneak table (the
backstab animation on an unaware enemy resolves as light1 × the table, never
the critical on top): iron dagger at Sneak 50 on the warden, 61.1 after armour.
Debug: "Enemies start unaware", Sneak skill (with the opener readout), Ambient
light; a detection meter in the HUD; view cones with the weapon-volume switch.
Visual: 53/53 across stealth, attacks, criticals, defense, offhand, ranged,
reactions, locomotion, evasion.

Round 5 notes: pack `swim` (five in-place vanilla clips; all older GLBs
md5-identical); `physics/waterSampler.ts` (`Pick<WorldWaterQuery, "sample">`,
`flatPoolSampler`), `locomotion/swim.ts` (pure, tests first), an optional
`setMovementMode`/`swim` on `PlayerMovementController` that `EcctrlAdapter`
implements by switching ecctrl off and driving the body (the studio compiles
unchanged); a pool west of the arena. `swim-cross`: worst chest-to-surface
error 1.8 cm, weapon away the whole swim, out onto the deck grounded. The
water also puts the torch out through the round-3 hook. Speed 1.60 m/s (stats
`swimSpeed` at Athletics 50); sprint-swim and heal-in-water: defaults set in round 6.

Round 6 notes: the input controller makes `offLight` / `offHeavy` from the
guard control (desktop tap/hold of Mouse 2, pad and touch guard/parry press);
the runtime no longer guesses the device. Dual wield's attacks run as the
`offLight`, `offPower` and `dualPower` combat actions, which the enemy AI reads
as the light and heavy they cost. `sneak-swing` (stealth group): a crouched
Sneak-50 steel sword light1 on an unaware warden facing sideways lands 57.14
(24 × 3 through armour 39), no backstab.

Round 7 notes (audio, decisions 0094/0095, the sound lane's handoff):

- **Wiring.** The sandbox composes a `SoundEventBus` and an `AudioManager`
  (listener on the scene camera, `useSandboxAudio.ts`; unlock on every
  gesture; the arena's sets prefetched and pinned outside validation) and
  hands the runtime `sounds`, `soundEmitters` and `groundContact` (stone);
  `audioFiles()` ships `packages/audio/files/` with the sandbox build.
  `fx/audio.ts` and `CombatEventBus`'s unused `sound` event are gone.
- **What fires.** A swing as each attack's blade goes live (player and
  enemy); hits by weapon family on the struck body's cuirass (flesh, light
  armour, plate); blocks and parries by what took the blow (a shield by its
  material's weight, a torch as a light shield); draw/sheathe; bow nock, pull
  and release; an arrow sticking in the ground; jump and landing; the roll
  and backstep thump; splash and one stroke sound per stroke cycle; the lit
  torch as an emitter. Light or heavy is one rule, `materialWeightClass`
  (weight scale 0.9 and up is heavy: Skyrim's split for every shared
  material). Heal and death have no event (no vanilla set shipped).
- **Footsteps.** One per foot plant, player and enemies: a foot plants when
  it becomes the lower of the two posed foot bones (`anim/footPlant`, 2 cm
  hysteresis; the manifest has no contact times). Surface from
  `footstepSurface`, wading in the pool from the water's depth.
- **Stealth.** The perception step subscribes to the bus and hears the
  player's own events through `perception/soundNoise` (the handoff table; a
  thump while rolling is a roll). Footsteps are now pulses at each plant
  rather than a noise every frame; suspicion takes the maximum, so the
  design's thresholds are unchanged.
- **Headless check.** Scenes count sound events by type
  (`soundEvents` telemetry, `scripts/lib/visual-sounds.mjs`); expected counts
  written before the run on the attacks and stealth groups. New scene
  `sneak-heard`: crouched 3 m behind an unaware warden, a swing at the air
  turns it suspicious (0.32 heard against the 0.2 threshold). Attacks and
  stealth 11/11; with the swing's noise withheld from the stealth feed,
  `sneak-heard` fails.

Defaults the owner can override (set in round 6):
- Sprint-swim: the sprint input swims at 1.4 × the swim speed and drains
  stamina at the ground sprint's rate; at 0 stamina it stops until the input
  is let go (`SWIM_SPRINT_MULTIPLIER`, `locomotion/swim.ts`).
- Draughts are usable in the water (`swimmingIntent`, `combat/intent.ts`).
- Torch brightness 6 cd (`CARRIED_LIGHT_CANDELA`, `character/src/CarriedLight.tsx`).

## Gates

`npm test`, `npm run typecheck`, `npm run visual:check -w
@elder-souls/combat-sandbox -- <group>` for the groups a round touches (the
whole suite for cross-cutting rounds), then `npm run preflight -- --paths
<the round's files>` and a pathspec commit. Full reports per round in
`/tmp/lanes/combat/round-N.md`.

## Closed (2026-09-24, after round 7)

Reopen with: "reopen the combat-sandbox lane: round 8 from the lane doc's open calls".
Round 7's owner call: listen in the sandbox (swings, hits, blocks, footsteps on
stone and in the pool, the bow, the torch) and say what sounds wrong.
Owner playtest calls still open: sign the speed table (debug panel timing
panel); the warbow headshot calibration (0090); skill curves on or off at start;
the three defaults above (sprint-swim 1.4×, draughts in water, torch 6 cd) and
round 6's two small calls (the parry chord fires no off-hand attack; an
exhausted sprint-swim stays off until the input is released); the dual-wield
idle's off blade lying across the body; the torch's look.

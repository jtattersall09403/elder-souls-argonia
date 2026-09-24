# 0091 — The off hand holds a shield, a weapon or a light; carried light is one system for torches, lanterns and light spells

**Date:** 2026-09-24. **Status:** accepted (combat-sandbox lane round 3, under
0087's delegation; the owner's side backlog named dual wield and torches,
0074 §2).

## Context

The off hand was typed as the shield slot in eight places (`Loadout.offHand:
ShieldDefinition`, the inventory's equip profile, guard, packs, AI tactics,
the parry volume, the slot label). Dual wield, torches, and later lanterns and
a spell in the hand all need the slot, and a torch that inherited shield
numbers, the shield pack and the parry volume would be wrong in ways no test
catches.

## Decisions

1. **`OffHandItem` is a discriminated union**: `ShieldDefinition` (`kind:
   "shield"`), `OffHandWeapon` (a one-handed `WeaponDefinition` with `kind:
   "weapon"`) and `TorchDefinition` (`kind: "torch"`). Every variant carries
   `id`, `label` and `visual`, so any renderer mounts it the same way; every
   other question goes through one resolver per question keyed on `kind`
   (`activeGuardProfile`, `activeGuardAnimations`, `loadoutAnimationPacks`,
   `loadoutTactics`). A spell in the hand joins as its own kind.
2. **Dual wield is Skyrim's control scheme on our buttons.** With a weapon in
   the off hand there is no block or parry: the guard control attacks with the
   off hand (tap light, hold power, the same 0.3 s threshold as the main hand),
   the main hand keeps its light chain, and the main hand's heavy becomes the
   both-blades power attack. Only one-handed melee classes go in the off hand;
   the same item in both hands needs two of it.
3. **A torch guards, badly, and lights.** Its guard uses Skyrim's torch block
   clips and a low stability; carried, the left arm takes Skyrim's one-frame
   torch pose as an overlay on the left-arm bones only (Skyrim's bone switch),
   off while guarding.
4. **Carried light is one system** (`game-core/src/fx/carriedLight.ts`,
   pure; `@elder-souls/character` `CarriedLight`, rendered at the item's
   `AttachLight` node). A `LightSourceSpec` is colour, radius, burn time
   (null never burns out), flicker and what puts it out; `CarriedLightState`
   is versioned and serialisable (standard 17). The torch is Skyrim's Torch01
   LIGH record, mined: 240 s, 512 units, 250/190/131, flicker. A lantern is a
   spec with no burn time; a light spell is a spec with the spell's duration.
   Water puts a torch out without using it up through an injected
   `submerged` input, which Phase 9's water sampler (lane round 5) feeds;
   burning out uses the item up. Stealth reads the same light as the target's
   `lightLevel` (lane round 4).
5. **The flame is the NIF's glow mesh, not its particles.** Torch.nif's two
   particle systems do not convert; the torch keeps the NIF's own additive
   glow mesh (GlowAddMesh, torch_g, vertex alpha and view falloff) and its
   `AttachLight` node, the handle is alpha-tested as the NIF's alpha property
   says, and the flicker lives in the light and the glow's opacity.

## Consequences

- The runtime's player loadout reads `offHand.kind`; enemies keep shields
  only until an archetype asks for more.
- `CombatRuntimeHost` gains a light-environment hook; the studio passes its
  water sampler when it adopts the runtime (10b).

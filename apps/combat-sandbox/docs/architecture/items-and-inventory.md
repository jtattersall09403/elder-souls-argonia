# Items and inventory

Three layers, with hard seams between them. The seams are the point: the rules
are what the real game keeps, and the sandbox's look is not.

```
packages/game-core/src/equipment/   what an item IS      (class x material -> stats)
packages/game-core/src/inventory/   what carrying MEANS  (rules + a view model)
src/ui/inventory/     what it LOOKS like   (layout + one stylesheet)
```

## Items are generated, not written

An arsenal of 53 weapons, shields and bows, 35 pieces of armour and 48 arrows is
`(class × material)` resolved against what the pipeline actually built. Hand-writing a stat block per item does not
survive a game's worth of content.

- **`weaponClasses.ts`** — how a kind of weapon *fights*: reach, speed, power,
  stamina, and how much of a blow you can put it between yourself and an
  attacker. Absolute where it must agree with an authored clip; relative
  otherwise.
- **`materials.ts`** — how *good* it is: damage, weight, guard, value,
  requirements, tier. One entry restats every item made of it.
- **`arsenal.ts`** — joins them to the generated manifest. The pipeline says
  what it built (id, class, material, sheath socket, asset, icon, measured
  size); this says what that means to the game.

Adding a weapon is one line of `pipeline/config/weapons/arsenal.json`. Adding a
tier is one entry in the material table.

`STRAIGHT_SWORD` is unchanged by construction: steel sits at the middle of every
material scale and `straightSword` at the middle of every class scale, so it
resolves to exactly the numbers the combat sandbox was tuned against.

- **`armour.ts`** — the same two axes for what you wear: a *slot* (cuirass,
  gauntlets, boots, helmet) says what kind of protection it is and roughly what
  it weighs, a material says how good it is. Armour rating rides the same
  `guardScale` a shield does, so a material is worth the same at stopping a blow
  on either side of the equipment split.

### Bows and arrows

A bow class carries a `ranged` profile — draw weight, power stroke, limb mass,
cadence — and that profile *is* what the bow does. There is no bow damage
number anywhere. See
[research/archery-ballistics.md](../research/archery-ballistics.md) for the
model and the real-world figures it is calibrated against.

Arrows are `shaft × material`: the shaft (flight, war, hunting, blunt) is a
physical archetype, the material is what the head is made of. Four kinds of iron
arrow share one GLB, because the shaft is composed by the game rather than built
— adding "flight arrows" cost nothing in download size.

Arrows occupy an `ammo` slot and are the one stackable equippable: what is
nocked is what is worn. An empty quiver lowers the bow, because standing in a
first-person aim with nothing to shoot is a dead end.

Which hand holds a thing is a class property (`heldSocket`): a bow is drawn with
the right hand and held in the left, which on this skeleton is the node Bethesda
calls `Shield`.

### Wearing armour

Armour is skinned to the same rig the bodies are, so a piece is not a prop on a
bone: it is rebound onto *this* actor's skeleton and parented beside the body
meshes. `packages/game-core/src/actors/armourMounting.ts` does that, and it is deliberately
plain three.js — an actor, a paper doll, a shop preview and a cutscene rig all
mount armour with the same call.

What a piece hides is read from the NIF's own dismember partitions at build time
(`coversBipedSlots`) and matched against the body's per-mesh slots in the race
roster (`meshBipedSlots`). Coverage is therefore a set intersection derived from
the art, never a hand-kept list, and a renamed body mesh cannot silently leave a
forearm poking through a gauntlet. Covered meshes are hidden rather than removed,
so unequipping is free and the actor's fitted bounds do not change shape.

**Pipeline invariant:** importing an armour NIF *adds* bones to the armature for
any skin partition the rig lacks, and Bethesda's meshes contain truncated names
(`NPC R Pauldro` for `NPC R Pauldron`). `build_armour.py` snapshots the rig's
bones before the first import and folds strays back onto it, because a piece
exported with a joint the actor's skeleton does not have cannot be worn at all.

### Guard stability

`stability` is the Souls stat: the share of a hit's stamina load a guard soaks.
`WEAPON_STABILITY_BAND` and `SHIELD_STABILITY_BAND` are a **contract, enforced**
rather than hoped for — material scaling can otherwise push a heavy weapon past
the top of the weapon band and into shield territory, which quietly removes the
reason to carry a shield.

### Movesets

A class names the moveset it fights with. Only `oneHanded` is built; a class
whose set does not exist yet borrows it, is flagged `provisional`, and shows an
amber dot in the inventory. That is a content gap made visible, not a bug.

## The rules know nothing about rendering

`inventory.ts` is pure functions over an immutable `Inventory`. That is what
makes the same model usable by React, a save file, an undo stack and eventually
a networked session, and it keeps the rules testable with no renderer near them.

Equipping resolves the conflicts equipping creates: a two-handed weapon takes
the off hand with it, a shield cannot be raised while one is held, and losing
the last of something takes it off. A refusal comes back **with a reason**, so
the UI can say why instead of a click doing nothing.

## `view.ts` is the seam

`buildInventoryView` hands the UI a finished, filtered, sorted description of
one screen — tabs with counts, cells, worn slots, encumbrance, armour rating,
why a thing cannot be equipped — and no game types at all. A different skin, a
controller-first layout or a console renderer consumes the same object, and none
of them can accidentally become the place a rule lives.

If you find yourself importing `registry.ts` or `inventory.ts` from `src/ui`,
the seam has been broken.

## Reading an item

`itemStats.ts` turns an item into worded stat lines, and the view model carries
them on every cell. Which stats a kind of item *has* is a property of the item,
not of how it is drawn, so a controller layout, a shop screen and a compare
tooltip all get the same list — and every figure is derived from the data combat
uses, so there is no second set of display numbers to drift.

The card itself is Morrowind's: a bordered panel with the whole stat block. It
floats beside the cursor on a pointer device and docks to the bottom of the
screen on a touch one, where there is no cursor to sit beside.

One rule covers all three platforms: **select, then act**. A pointer inspects by
hovering, so a click can equip outright. A finger and a D-pad cannot hover, so
the first tap or press selects and the second equips. `useInventoryCursor` gives
the keyboard and the pad the cursor they need — the inventory is a DOM screen,
so the gamepad the rest of the game polls never reaches it otherwise.

## Re-skinning

`src/ui/inventory/InventoryScreen.tsx` is layout only: it names semantic parts
(`inv-window`, `inv-grid`, `inv-cell`) and nothing else. The whole look is
`inventory.css`, keyed off `[data-inventory-theme]`. A second theme is a second
block in that file plus a new value for the `theme` prop.

The current skin keeps the Morrowind silhouette — tiled ornamental frame,
centred title, encumbrance bar over a paper doll, black grid with worn items
framed and first — and is modern where that costs nothing.

The paper doll renders the **production actor**, not a preview path. A doll that
renders its own way is a doll that can silently disagree with the game about
what you are holding.

## Icons

The pipeline renders each item's icon in the same pass that builds its GLB: a
small orthographic three-quarter view on a transparent background, framed to the
item's *projected* extent so a long thin sword fills its cell instead of sitting
as a sliver in an empty tile. Items with no built art draw a lettered tile
rather than a hole.

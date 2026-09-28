# Claywater walk 4 and Greenspring walk 2

**What went wrong last time.** Both places came up as bare cleared
ground with a black box following you. The site build had left out the
candle-flame picture the lanterns need, so the whole place layer gave up
without saying why. That is fixed. The build now refuses to publish a
place with a missing file, and if a place ever fails to load, a red line
at the top of the screen says what is missing.

Both places are on the deployed studio. You do not need to run anything.

## Claywater Station (walk 4)

**Start here:** https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=0.319&z=3.032&t=12

Your walk-3 points, one line each:
- **Stable:** the castle stable is gone. It is now the small Riften
  farm stable, a roofed stall block you walk into, beside the road:
  https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=0.335&z=3.088&t=12
- **Porch lights:** no indoor candle sconce hangs outside any more.
  The station house and the stable each have a candle lantern hung on a
  post beside them.
- **Lights:** every lamp and fire within 200 m of you now gives off
  light, up to 16 at once, and not only the nearest 8. Come at night
  to see it: https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=0.319&z=3.032&t=22
- **Doors:** every door opens into a furnished room now. None waits for
  Phase 12 any more. Phase 12 is only for dungeons and large one-off
  interiors. The stable has no door: you walk in.
  - Station house: https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=0.317&z=3.066&t=12&interior=DawnstarBrinasHouse
  - Ferryman's pod house: https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=0.313&z=3.006&t=12&interior=KeebaHouseFisher
  - Family hut: https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=0.338&z=2.974&t=12&interior=KeebaHouseCrafter
  - Store hut: https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=0.335&z=2.983&t=12&interior=KeebaHouseSnailMinder
- **Ferry text:** the ferryman no longer talks about floods, because
  the water never rises. The raft and the jetty stay as they were.
- **Two-storey house:** no two-storey house stands here. The stable
  keeper lives in the station house, which has one storey and one door.
- **Doors that swing open inside a house** (rather than loading a
  room): not built yet. They are a named job for the game-runtime phase
  (10b), together with the interiors phase (12).
- **Pictures:** they carry no text now, only a scale bar and a north
  arrow.

## Greenspring (walk 2)

**Start here:** https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=4.747&z=1.859&t=12

- **Sick Hist tree:** the same tree, sick: its bark is ash grey, its
  leaves are faded with olive-yellow patches, and it now sits down in the
  ground like the other trees. The red flowers round the shrine are a
  dull, dimmed version too:
  https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=4.743&z=1.876&t=12
- **Lanterns in its branches:** not hung yet. Hanging a lantern from a
  branch needs a new placing tool, which is the first job of the next
  round.
- **Doors:** all six houses open into furnished rooms, and no two
  houses in the village share a room:
  - Lodge: https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=4.768&z=1.853&t=12&interior=KeebaHouseFisher
  - Herald's house: https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=4.759&z=1.838&t=12&interior=KeebaHouseCrafter
  - Tree-minder's house: https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=4.764&z=1.865&t=12&interior=KeebaHouseElder
  - Spring-keeper's house: https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=4.720&z=1.881&t=12&interior=LilmothPlantationStorehouse
  - Family hut: https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=4.735&z=1.839&t=12&interior=LilmothGlassworksOverseerHouse
  - East family hut: https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=4.774&z=1.825&t=12&interior=LilmothIronworksOverseerHouse
- **Spring house:** the closed shed is now an open-sided Argonian tent
  over the spring, turned to face the path.
- **Night:** https://jtattersall09403.github.io/elder-souls-argonia/studio/?view=character&x=4.747&z=1.859&t=22

<details><summary>Every change, as the tool lists it</summary>

Claywater:
- Added vanilla:architecture/riften/rtstables01 (stable) at [334.6, 3087.6].
- Added bmv:architecture/phitt/aldredanyia/signpost (b1-post) at [320.4, 3065.6].
- mount (b1-lamp): placed differently (its layout ops changed).
- vanilla:clutter/hay/haymound01 (sty-hay): moved 49.1 m west; turned 58 degrees clockwise.
- vanilla:clutter/horsetrough/horsetrough01 (sty-trough): moved 47.2 m west; turned 148 degrees clockwise.
- vanilla:clutter/firewood/firewoodpilelarge01 (sty-wood): moved 17.2 m north; turned 49 degrees anticlockwise.
- mudmother:gv_meshes/argoniannest/carapaceoven (ahy-oven): replaced mudmother:gv_meshes/argoniannest/carapaceoven with vanilla:clutter/woodfires/cookingstand01.
- Added vanilla:clutter/bucket01 (b1-bucket) at [317.2, 3063.4].
- Added kotm:argonia/clutter/saxhleelmetalpot01 (b5-pot) at [334.6, 2958.0].
- vanilla:architecture/farmhouse/stonewall/stonewallendl01 (b2w-s1): moved 2.9 m north-west.
- Added snap (b2w-w4).
- vanilla:clutter/barrel02 (b2-barrel): moved 12.0 m west.
- Added bmv:architecture/phitt/aldredanyia/signpost (b2-post) at [326.4, 3085.6].
- mount (b2-lamp): placed differently (its layout ops changed).
- Added hist-village-cookpot (hist-village-cookpot).
- Added hist-village-stores (hist-village-stores).
- Added imperial-station-porch (imperial-station-porch).
- path (route.claywater-station.stable-path): placed differently (its layout ops changed).
- Removed vanilla:architecture/farmhouse/farmhouse02 (b2).
- Removed attach (b2-stair).
- Removed mwkeep:tesak1243/mwimperialarchitecture/architecture/keep/exterior/stables/mwimparchstableendl01 (st1).
- Removed snap (st2).
- Removed vanilla:architecture/farmhouse/fencewoven01 (fw1).
- Removed vanilla:architecture/farmhouse/fencewoven01 (fw2).
- Removed path (route.claywater-station.paddock-path).

Greenspring:
- kotm:argonia/mudhuts/mudhut01 (b-fam1): placed differently (its layout ops changed).
- kotm:argonia/mudhuts/mudhut01 (b-fam2): placed differently (its layout ops changed).
- kotm:argonia/mudhuts/shed (b-shed): replaced kotm:argonia/mudhuts/shed with mudmother:gv_meshes/argoniannest/argoniantent02; moved 2.1 m west; turned 180 degrees anticlockwise.
- histtree:skyfall/sleeping tree overhaul/ancient sleeping tree (hist): replaced histtree:skyfall/sleeping tree overhaul/ancient sleeping tree with histtree:skyfall/sleeping tree overhaul/ancient-sleeping-tree-sick; moved 1.0 m south.
- histtree:skyfall/sleeping tree overhaul/histflower02 (b-minder-flower): replaced histtree:skyfall/sleeping tree overhaul/histflower02 with histtree:skyfall/sleeping tree overhaul/histflower02-sick.
- mudmother:gv_meshes/argoniannest/argoniancandle01 (b-fam1-candle): moved 0.6 m north.
- mudmother:gv_meshes/argoniannest/woventable01 (b-fam1-table): replaced mudmother:gv_meshes/argoniannest/woventable01 with kotm:argonia/clutter/basketcontainer.
- mudmother:gv_meshes/argoniannest/basketsmall01 (b-fam1-basket): moved 0.6 m north-west.
- vanilla:clutter/firewood/firewoodpilesmall01 (b-fam2-wood): moved 0.4 m south.
- Added vanilla:clutter/woodfires/campfire01burning (b-fam2-fire) at [4743.0, 1842.0].
- mudmother:gv_meshes/argoniannest/paintedurn01 (b-shed-urn1): moved 3.1 m north-west.
- mudmother:gv_meshes/argoniannest/paintedurn01 (b-shed-urn2): moved 1.9 m north.
- mudmother:gv_meshes/argoniannest/argoniantotem01 (sh-totem1): moved 0.4 m south-east.
- mudmother:gv_meshes/argoniannest/argoniantotem01 (sh-totem2): moved 0.8 m south-west.
- histtree:skyfall/sleeping tree overhaul/windchimehavok (sh-chime): moved 0.8 m south-west.
- histtree:skyfall/sleeping tree overhaul/histflower01 (sh-flower1): replaced histtree:skyfall/sleeping tree overhaul/histflower01 with histtree:skyfall/sleeping tree overhaul/histflower02-sick; moved 1.2 m west.
- histtree:skyfall/sleeping tree overhaul/histflower02 (sh-flower2): replaced histtree:skyfall/sleeping tree overhaul/histflower02 with histtree:skyfall/sleeping tree overhaul/histflower02-sick.
- mudmother:gv_meshes/argoniannest/argoniancandle01 (sh-candle1): moved 0.8 m south-west.
- mudmother:gv_meshes/argoniannest/argoniancandle01 (sh-candle2): moved 0.8 m east.
- mudmother:gv_meshes/argoniannest/paintedurn01 (sp-urn): moved 3.7 m north-west.
- histtree:skyfall/sleeping tree overhaul/histflower01 (sp-flower): moved 2.0 m north-east.
- Added hist-village-stores (hist-village-stores).
- Added hist-village-cookpot (hist-village-cookpot).
- Added hist-village-nets (hist-village-nets).
- Removed vanilla:architecture/whiterun/wrclutter/wrherbdryingrack01 (b-herald-rack).
- Removed mudmother:gv_meshes/argoniannest/carapaceoven (b-fam2-oven).

</details>

## Two questions

1. **How busy round each house?** The bar is 20 pieces of clutter
   within 12 m of a house's door. A typical house now has 21 at both
   places (Claywater's family hut has 13). Is that right, too busy, or
   too bare?
2. **Round pod houses share rooms between places.** We now have 96
   Argonian rooms to draw on, but the round pod house fits only three of
   them, so Claywater and Greenspring share two rooms (the Fisher and
   Crafter houses).
   Is that acceptable for pods, or should pods be used less so their
   rooms stay rare?

**Pictures** below: for each place a view from above, two angled views
and one at night.

**How to reply:** walk each place and send one message per place,
saying what looks wrong, or "looks right" when a place is done.

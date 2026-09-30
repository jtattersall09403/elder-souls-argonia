# Walk packet 7: your walk-6 notes, fixed

Every point from your walk-6 notes is dealt with below, in your order, except one small lump at Riverwalk (see Riverwalk). Studio base: `https://jtattersall09403.github.io/elder-souls-argonia/studio/`. Add `?view=character&x=..&z=..&t=..` (x and z in km; `t=12` noon, `t=22` night). `&interior=<room>` opens a room from its door, and `&sockets=1` shows sockets.

## Speed-up work

- **Where the time went:** one lane read the last session's logs. Three changes came out of it:
  - at most 8 helper agents run at once;
  - one code review per round, not several;
  - small, fully written-out jobs now go to a cheaper, faster helper (Sonnet 5.5).

## Interiors

- **Is there a list that says which room goes with which building?** Yes. Each Skyrim mod's own data links a building's door to its room, and that link is now the only source. We no longer match rooms to buildings by size. The link table covers 56 mod files and 319 buildings.

## Feedback on the inbox message

- **"Submerged things fail" check:** removed. Builders now decide on purpose what stands in water and mark it. Every check reports the water depth, so a mistake still shows.
- **Are work sockets also where you "use" the job?** They are now. Each work spot records where you stand to use it: across the counter to buy, or at the bench itself to craft.
- **Riverwalk boardwalk corner you could not walk round:** the fake corner is gone. The walk now turns only on a proper crossroads piece. A new tool walks every boardwalk joint and fails any rail across the way.
- **Boardwalk not taking a sensible path to the island:** it now runs straight across the cove, 104 m, from flat ground. A side branch leaves a crossroads piece and ends in steps down into the shallows. Those steps sit under the water, as the original Skyrim piece was made, so from afar the branch may look as if it just stops.
- **Description did not match the picture:** the picture was an old render of an earlier design. Walk pictures now come only from the published build. The tool refuses to take them if the build and the design disagree.

## Feedback from the walk

- **/webgpu/ black screen and red banner:** the cause was ground cover writing past the space it had reserved. That is fixed. If the graphics device is ever lost, the view now rebuilds itself. Two big start-up pauses (map pictures read on the main thread) now load in the background. Checks for your Mac are in the Volumetrics section below.
- **Greenspring paths:** the bright orange dirt is gone. Paths use a soft stone texture and a trodden-mud texture, and the country footpaths nearby are toned down to match. Overlapping paths are merged into one surface, so nothing blinks. The small paths at the corner now meet the larger path at a natural angle, and the loose end is joined up. Look at `x=4.75&z=1.865&t=12`.
- **Path paint not fading with distance:** it now fades out between 120 and 180 m.
- **Paint not reaching front doors:** it now reaches every front door, and a tool measures this.
- **Path stopping at 4.71 km E, 1.88 km S:** it now carries on along the country footpath. Look at `x=4.71&z=1.88&t=12`.
- **The spring:** the pool now behaves like our other shallow water, with wading, splashes and wet footsteps. Walk into it at `x=4.72&z=1.87&t=12`.
- **Trees turning into flat cards too close:** tall trees now stay full 3D to at least 130 m, and light trees to about 210 m (they switched at 35 to 52 m before). Look from `x=4.74&z=2.01&t=12`.
- **Big bushes detailed only to 50 m:** plants 2.5 m and taller now stay full detail to 200 m. The dense tall marsh grass now shows to 145 m. It is thinner far away, so it costs little. Look from the same spot, `x=4.74&z=2.01&t=12`.
- **Campfire flames inside the logs:** every fire is now sized from where its flame starts to above its fuel. The campfire now burns well above its logs. Look at `x=4.74&z=1.84&t=22`.
- **Lantern and torch flames too small:** these are bigger. The Argonian hanging cage lanterns now carry a flame about a third of the cage's height, where before there was a speck. Agents now have a close-up picture tool. Each new kind of fault it finds is added to the list for every later check. The tool caught the cage-lantern flame this round.
- **Leftover bridge at 4.71 km E, 1.80 km S:** that bridge and every other leftover bridge, deck and span across the province are gone. Only steps on steep roads remain. Look at `x=4.71&z=1.80&t=12`.
- **Round hut with a tall rectangular house inside (4.84 km E, 1.92 km S):** no mod gives the round Argonian hut a room, so that hut no longer offers "enter". The mess inside that room had three causes, all fixed at the source: a flat colour swatch used as wall texture, tilted pieces turned in the wrong order, and small items left hanging a few centimetres in the air. Every room a place uses is now checked by a tool before you see it.
- **Room at 4.87 km E, 1.89 km S with no flames:** flames were drawn, but daytime brightness scaled them to nothing. They now draw after that step, as outdoors. Enter at `x=4.87&z=1.89&t=22`.
- **Stair stutter:** the drawn body jumped a whole step while the physics body climbed smoothly. It now eases up each step. Walking and running speeds are unchanged. Try any staircase indoors.
- **No sockets indoors (4.87 km E, 1.91 km S):** sockets were hidden with the outside world whenever you went in. Fixed. Enter at `x=4.87&z=1.91&t=22&sockets=1`.
- **Fire glow pulsing in a pattern:** the flicker used two repeating waves. It is now random, with the odd gust. Watch any fire for half a minute.
- **Hut at 4.82 km E, 1.96 km S with the wrong room:** the same round hut as above, so it no longer offers "enter". The fix is at the source: rooms come only from the mod's own door link.
- **Shadow flicker on the Claywater porch post:** the sun's shadow direction changed every frame, so edges crawled. It now moves in tiny steps a few seconds apart. Look at `x=0.328&z=3.040&t=12`.
- **Flickering corner in the farmhouse:** floor coverings (hay, rugs) sat at exactly the same depth as the floor. They now use the same small offset as outdoors. A new tool finds any two surfaces lying on top of each other, in places and in rooms, and every build must pass it before you see it. Count now: 0 in all three places and in all four rooms they use.
- **Claywater minor paths:** fixed the same way as Greenspring's. Look at `x=0.33&z=3.04&t=12`.
- **Claywater main road painted over:** the road is no longer repainted.
- **White-out leaving a room by day:** the eye adjustment restarted from indoor brightness and eased slowly. It now settles in about 2 seconds at any game speed. Leave any room at midday.
- **Argonian hut with an upstairs that could not fit (0.34 km E, 2.98 km S):** these pod huts now open only into the rooms their own mod made for them. Your earlier ruling stands: a mod's own pairing is trusted even when the room is bigger than the shell. Enter at `x=0.34&z=2.98&t=12`.
- **Riverwalk plank rotated so its rail blocks the house:** it is turned so the rail no longer blocks the door. Look at `x=7.22&z=0.517&t=12`.
- **Riverwalk boardwalk to the island:** see the inbox-message points above. Walk it from `x=7.21&z=0.52&t=12` to the island around `z=0.63`.
- **Boardwalk starting on a steep bump:** the walk now starts on flat ground. A small lump in the ground beside the start, at about 7.211 km E, 0.523 km S, is still there. The fix is ready, but it needs an agent to change a shared workbench file, and the permission system refused that. **Allowed?**
- **Lantern blocking the house doorway (7.22 km E, 0.52 km S):** it now hangs beside the doorway. A check fails any lamp in any doorway.
- **Stilt house offering "enter" into an unrelated hut room:** no mod gives that house a room, so it shows no prompt now.
- **Tents hovering:** tents now sit on their canvas edge. The worst gap is half a centimetre. Look at the island tent.
- **Landing and rafts:** unchanged.

## Volumetrics (on /webgpu/ only)

GPU fog and light effects are built, only in the new graphics build: `https://jtattersall09403.github.io/elder-souls-argonia/webgpu/?view=character&x=4.75&z=1.86&t=6`. Morning mist fills valleys and burns off by noon, steam rises off water at dawn, fog lies on marshes at dusk and sea fog forms along coasts. Light shafts fall through gaps in the tree crowns. Lamps glow softly in mist, and windows cast dusty beams indoors. Smoke is lit by the sun, so by day it is pale, not charcoal grey. Checks only your Mac can do (send the console if anything looks wrong):

1. Load /webgpu/ and watch the console for any red line, especially "device lost" or "offset is out of bounds".
2. Time the load from click to walkable, and say whether it still stutters.
3. At dawn near water or a valley (the link above, 06:00), check that the mist shows and the frame rate holds.
4. At noon in a forest, check for light shafts when looking toward the sun.
5. At night by the Claywater lanterns (`x=0.33&z=3.04&t=22`), check that the glows are soft and round.
6. By day inside a house with windows, check for a beam with dust in it.
7. By day at a chimney, check that the smoke is pale.
8. Open the performance HUD and note the milliseconds the volumetrics take (target 1 ms or less on high).

## Your calls

- **Riverwalk lump:** may an agent make the small shared-file change that flattens it? **Allowed?**
- **Riverwalk crossroads:** the crossroads' east arm ends open over the water with no rail, like Skyrim's own docks. Keep it open, or rail it?
- **Greenspring round huts:** the three round huts are now closed buildings, because no mod gives that hut a room. Should those homes be swapped for a building that has its own room, so you can go in?

## Pictures

Riverwalk house door and lantern; a boardwalk joint; the campfire and cage-lantern flame sheets; a room checked by the new tool; lantern glow, valley mist and window beams on /webgpu/.

## How to reply

Reply on issue #1: one line per point with the address you were at, plus your three calls. Say "looks right" when done.

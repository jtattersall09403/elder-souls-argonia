# Feel: type × region × record

The one home for type feel (standard 18); type sheets link here. Feel is
never a property of the type alone. Black Marsh holds border mountains,
upland hills, tidal deltas, salt marsh, river corridors, rootland and
interior swamp, fringe marsh, seasonal floodplain, firm lowland, lakes,
tropical jungle and mangrove (the classes in
`tooling/world-generation/worldgen/regions.py`). A shrine in cloud-wet
upland forest and a shrine in a mangrove creek are the same type and two
different places.

## The method

Choose the palette by [palette-and-breadth.md](palette-and-breadth.md): the type sets the grammar, the region sets the families, siblings set what must differ.

1. Type: what the place is FOR (the rows below, region-free).
2. Region: what it is made of, how water and weather behave, what grows,
   what the light and air do ([design-intent.md](design-intent.md) § Intent
   item 4 names the records, by path).
3. Record: who is here and why, at what age and in what state of repair.
4. Feel = the type's purpose, expressed in the region's materials, water,
   vegetation, weather and light, by the record's people. Write it as the
   § Intent mood words and three images; every lever in the mood table is
   then chosen in the region's terms (a "lit threshold" is a resin torch
   under dripping eaves in one region and a lantern on a dry stone step in
   another).

## What each type is for (region-free)

Lore paths are under `world/sources/lore/`; links are written from here.

| Type | What it is for, and its feel | Classic levers | Lore | Failure to avoid |
|---|---|---|---|---|
| Village | a lived-in home, built of what the region grows; wary of strangers; rebuilt rather than made to last | the Hist tree (or the reason for none) as first-seen silhouette and heart; totems at the way in; paths only where feet go daily; signs of the region's food and trade; hearth fire at night | [material-culture](../../../../world/sources/lore/topics/material-culture.md):15-24, :30-33, :286-304; [hist-placement](../../../../world/sources/lore/topics/hist-placement.md):95 | a tidy grid; materials foreign to the region without a story; no tree and no reason |
| Water village | a home on the water, not beside it; precarious, busy at the waterline | platforms over the water; a boat at every house; the way in by water or walkway; half-sunk, mended pieces; lights doubled in the water at night | [material-culture](../../../../world/sources/lore/topics/material-culture.md):26-29, :47-50, :262-266; [secondary-settlements](../../../../world/sources/lore/regions/secondary-settlements.md):47 | pads on dry land; decks ending in air; keeled or sailed boats (foreign) |
| Camp | provisional; purposeful or furtive; exposed | one fire as heart and night beacon, with its flame; gear that names the trade; seen from the way it watches; trampled ground | [labour-and-bondage](../../../../world/sources/lore/topics/labour-and-bondage.md):73-75; [middle-argonia](../../../../world/sources/lore/regions/middle-argonia.md); [04-camp](types/04-camp.md) | a permanent look; smoke with no flame; no reason to be here |
| Shrine | sacred and still, tended or abandoned; for Sithis the decay is the point | a narrowed approach; a marked threshold; the object of devotion lit and framed from the approach; offerings that show who tends it | [sithis-nisswo-shadowscales](../../../../world/sources/lore/topics/sithis-nisswo-shadowscales.md):31, :123-129, :182; [blackwood-and-gloommire](../../../../world/sources/lore/regions/blackwood-and-gloommire.md):66; [secondary-settlements](../../../../world/sources/lore/regions/secondary-settlements.md):24 | a tidy temple; decay cleaned up; nothing tended |
| Works | labour and extraction; the product in view; often foreign, often failing | the resource and product seen first; stains, spoil and runoff; worn paths between work points; tools mid-use; an overseer's post | [foreign-powers](../../../../world/sources/lore/topics/foreign-powers.md):20-22, :127-128; [labour-and-bondage](../../../../world/sources/lore/topics/labour-and-bondage.md):24 | a generic boulder standing for ore; no product; clean ground |
| Crossing | a passage the water or terrain threatens; tolled and watched | the obstacle must be crossed, not walked round; a keeper or toll point at the start; signs facing the walker; lights at both ends at night | [blackwood-and-gloommire](../../../../world/sources/lore/regions/blackwood-and-gloommire.md):17, :30-31; [waters](../../../../world/sources/lore/regions/waters.md); [labour-and-bondage](../../../../world/sources/lore/topics/labour-and-bondage.md):134; [material-culture](../../../../world/sources/lore/topics/material-culture.md):34-36 | deck ends into water or air; a crossing over nothing |
| Dungeon mouth, ruin | older than anyone; threatening; pulls the player in; built on someone's bones | the mouth as the dark centre of the silhouette; the region's growth swallowing the stone; signs of who went in lately | [material-culture](../../../../world/sources/lore/topics/material-culture.md):37-46; [lost-peoples](../../../../world/sources/lore/topics/lost-peoples.md):127-135; [murkmire](../../../../world/sources/lore/regions/murkmire.md):22, :68; [middle-argonia](../../../../world/sources/lore/regions/middle-argonia.md):87-88 | a doorway with no mass; clean stone; nothing that pulls the walker in |
| Road station | shelter on a hard road; a welcome with a wary edge | a light seen from the road at night; a roof against the region's weather; a board facing the road | [01-road-station](types/01-road-station.md) | a place the walker passes without noticing |

## Worked examples (one type in several regions)

Sources used in every example: region class rows in
[20-province-design.md](../../../../docs/world/20-province-design.md) §16
(rows exist for tidal delta, seasonal floodplain, deep river corridor,
rootland, interior swamp; none for upland hills or border mountains);
`CLIMATE` in `tooling/world-generation/worldgen/regions.py` (humidity, mist,
rain, visibility, canopy per class); `regionFrequencies` and `seasons` in
`world/sources/climate/weather-states.json`; `byRegionClass` in
`world/sources/flora/palettes.json` and `world/sources/flora/groundcover.json`;
dossiers under `world/sources/lore/regions/`. Each example is a worked
reading of the records, not a prescription.

**(a) Shrine, upland hills or border mountains.** Ground: bare and wet rock
under leaf litter (`palettes.json` class 1 is mostly `wet-rock` and `rock`
layers; class 2 adds `canopy`, `understory`, `gap-thicket`). Water: showers
and orographic rain, mist 0.3 to 0.4, visibility 1000 to 1200 m
(`CLIMATE`); weather mix `uplands & mountains`: clear-humid 3, storm 1,
ground-mist 1, dry-haze 1. Vegetation: aspen, cedar and alder on the hills,
dwarf juniper and pine on the border mountains (`palettes.json` T1 stems).
Material: stepped ruin stone, grave-stakes of wood. Light and air: cloud-forest language is allowed on the high
border mountains, never frost ([50-hydrology-climate.md](../../../../docs/world/50-hydrology-climate.md) §33.1). Lore
anchor: Glenbridge, a village round a ruined xanmeer of Sithis in the south-east
hills of Blackwood ([blackwood-and-gloommire.md](../../../../world/sources/lore/regions/blackwood-and-gloommire.md):66),
where the decay is the god's work. Mood: sacred, worn. Images: from afar a
stepped mass over the canopy; at the threshold grave-stakes ([sithis-nisswo-shadowscales.md](../../../../world/sources/lore/topics/sithis-nisswo-shadowscales.md):123-129);
at the heart the lit object of devotion. Fires at night: record silent.

**(b) Water village, mangrove forest or tidal delta.** Ground: mudflat and
sandbar under tidal shallows (§16 tidal delta row: braided channels,
mudflats, sandbars, brackish pools, mangroves). Water: much, moving with
the tide, in view from every house; weather `coastal`: clear-humid 3,
sea-squall 2, monsoon-downpour 2, ground-mist 1, storm 1; `CLIMATE` class
14: humidity 0.95, mist 0.6, tidal storms, visibility 150 m, canopy 0.8;
class 3: visibility 500 m, canopy 0.2. Vegetation: mangrove trees, fan and
beach palms (`palettes.json` classes 14 and 3). Material: reed weave on
wooden stilts (§16: docks, stilts, fisheries, elevated stores;
[material-culture.md](../../../../world/sources/lore/topics/material-culture.md):26-29). Light and air:
dim under the mangrove canopy, wet haze. Lore anchors: a wall of mangroves
screens the Lilmoth approach ([murkmire.md](../../../../world/sources/lore/regions/murkmire.md):22-23); Alten
Meerhleel is a floating village on the same coast ([murkmire.md](../../../../world/sources/lore/regions/murkmire.md):68-69). Mood: hidden, precarious. Images: from afar a
gap in the mangrove wall with smoke above it; at the threshold the first
stilt landing and moored boats; at the heart the central platform with its
hearth.

**(c) Crossing, seasonal floodplain or deep river corridor.** Ground: stony
ford floor and flood bank; the Claywater ford is a shallow stony crossing a
walker can wade and a cart cannot
(`world/sources/catalogue/places-imperial-fringe.json`,
`place.imperial-fringe.claywater-station` `why.siteAdvantages`). Water: dry
season has flood states low, dry-haze enabled and some shallow crossings
open; wet season has flood states high, monsoon and storm weights doubled,
boats favoured (`weather-states.json` `seasons`). The Onkobra runs fast white water near Gideon
([waters.md](../../../../world/sources/lore/regions/waters.md):27). Vegetation: willow, aspen and jungle trees
with rock (`palettes.json` class 9); class 5 adds cypress. Material: wet
stone grey and weathered timber against mud brown and thatch gold (the same
record's `vibe.palette`). Light and air: `CLIMATE` class 9 humidity 0.8, mist
0.5, visibility 600 m, canopy 0.15; dry-haze appears in the `firm lowland &
floodplain` mix. In the wet season the crossing shuts: roads there are
closed in monsoon ([blackwood-and-gloommire.md](../../../../world/sources/lore/regions/blackwood-and-gloommire.md):17). Mood: wary,
neighbourly. Images: from afar the station roof over the bank; at the
threshold the exposed ford stones and a toll board; at the heart the landing
and the well facing each other over the water. Exposed-bank form: record
silent.

**(d) Works, firm lowland or fringe marsh.** Ground: red clay bank on firm
ground at the water's edge (Onkobra Clay Pits: "a red gash in a green bank";
`place.imperial-fringe.onkobra-clay-pits` `vibe`, classes firm lowland and
seasonal floodplain; Claywater's classes are firm lowland, fringe marsh,
seasonal floodplain). Water: a spring or channel within a cart of the road;
weather `firm lowland & floodplain`: clear-humid 3, ground-mist 1,
monsoon-downpour 1, dry-haze 1; `CLIMATE` class 11 humidity 0.7, mist 0.3,
visibility 900 m, canopy 0.35; class 8 humidity 0.9, mist 0.6, visibility
350 m. Vegetation: emergent giant and canopy trees and fan palms on firm
ground (`palettes.json` class 11), cypress and willow in the fringe marsh
(class 8). Material: raw and fired clay, reed drying racks, a stone furnace
built at Imperial expense (same `vibe.materials`). Light and air: furnace
soot and woodsmoke; red clay is the Onkobra delta's mark
([waters.md](../../../../world/sources/lore/regions/waters.md):27). Mood: busy, oppressive where bonded labour
works it (the Bonded Shed of the Onkobra, `place.imperial-fringe.bonded-shed-of-the-onkobra`). Images: from afar a red bank and a
soot-black hood; at the threshold the path turning into red ground; at the
heart the pots drying in ranks and the seconds wall. Night light: record
silent.

**(e) Dungeon mouth, rootland deep marsh or interior swamp.** Ground:
hummocks and pools with poor sight lines (§16 interior swamp row); in
rootland, root paths and organic topography (§16 rootland row). Water:
standing and black; `CLIMATE` class 6 humidity 1.0, mist 0.9, constant
drip, visibility 120 m, canopy 0.95; class 7 visibility 200 m, canopy 0.65;
weather `marsh`: ground-mist 3, clear-humid 2, monsoon-downpour 2, storm 1.
Vegetation: cypress, tall mushrooms and fungal floor in rootland, cypress,
jungle tree and mangrove in interior swamp (`palettes.json` classes 6 and
7). Material: stepped Ayleid or Argonian xanmeer stone; the sealed variant is
"a small, entirely intact stepped meer with one stair-throat and warm air
coming out of it" (`place.hist-heartland.sealed-xanmeer-living`
`vibe.silhouette`, `world/sources/catalogue/places-hist-heartland.json`). Lore anchor: every major
settlement sits on someone else's bones
([lost-peoples.md](../../../../world/sources/lore/topics/lost-peoples.md):127-135); xanmeers are stepped pyramids
with traps ([material-culture.md](../../../../world/sources/lore/topics/material-culture.md):37-46). Mood: threatening,
pulling. Images: from afar a stepped mass or a gap in the growth; at the
threshold the stair-throat with warm air; at the heart the dark interior.
Night light: record silent.

A type or region with no example is designed from the method; the builder
adds its example at slice close.

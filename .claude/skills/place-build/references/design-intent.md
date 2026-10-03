# Design intent and the walk-through

Read at step 1a, before the first row of the design brief. Gates prove a
place is built correctly; they cannot prove it is the place the record
describes. That is decided here, in words, before any piece is chosen, and
checked at step 4b against pictures.

## The record is an intent, not a parts list

The record's `why`, `vibe` and hooks describe a place someone lives in. Read
them as a story: who is here, what they do, what they fear, what the player
should take away. A noun in the record ("ore outcrop", "hearth", "toll
post") is a made thing with a purpose; it is delivered when a walker can see
and recognise it, never when a placement id with that label exists. If no
piece can carry it, source one (the sourcing rule); then change the layout;
the record is rewritten down only for one of decision 0102's four reasons,
named beside the line (step 5b).

## § Intent (design.md, first section)

Answer every question in a sentence or two. "N/A" needs a reason.

1. Purpose: what is this place for, in the words a local would use? Who
   lives, works, worships, hides or died here; what do they do all day; what
   do they need from outside, and how does it arrive?
2. Mood: two or three words (the table below, or your own). For each, the
   levers that carry it and where in the place they sit.
3. Three images the player keeps: one from afar, one at the threshold, one
   at the heart or the reward. Name the pieces that make each.
4. Region, palette and climate, derived from the records, never assumed.
   Black Marsh is many geographies: a highland cloud-forest shrine, a
   mangrove water village and a dry-season river crossing share nothing but
   the province. Read, by path:
   - the place record's `regionClasses` and setting fields
     (`world/sources/catalogue/places-*.json`);
   - each class's row in the region taxonomy
     ([20-province-design.md](../../../../docs/world/20-province-design.md) §16):
     settlement forms, routes, materials, movement;
   - its climate and atmosphere
     ([50-hydrology-climate.md](../../../../docs/world/50-hydrology-climate.md) §33.1;
     [55-light-sky-time.md](../../../../docs/world/55-light-sky-time.md), atmosphere
     per region class; `CLIMATE` in `tooling/world-generation/worldgen/regions.py`)
     and its weather mix (`world/sources/climate/weather-states.json`
     `regionFrequencies`: which states, how often, how wet);
   - its vegetation and ground cover (`world/sources/flora/palettes.json`
     `byRegionClass`, `world/sources/flora/groundcover.json`);
   - the region's lore dossier (`world/sources/lore/regions/`) and the kit by
     region ([material-culture.md](../../../../world/sources/lore/topics/material-culture.md)
     "kit by region").
   From those, write the palette in concrete nouns: ground, water (how much,
   still or moving, in view or not), vegetation, building material, light,
   air (mist, haze, rain, heat). Where a place spans classes (a fringe of
   two), say which one each part of the place sits in.
5. The ground you inherit: the site dossier's soil, paint and slope against
   that palette. If they disagree (bare upland rock under a place whose
   region is floodplain mud), say how placed assets carry the region's read
   (core rule 6: placed assets carry the terrain's identity) and what
   remains an owner call in the walk packet.
6. Day, night, rain: what is lit at night and why (fire where people are; a
   dead place is dark on purpose); what rain does here (roofs, shelter,
   puddles); what the walker hears (water, insects, work, voices).
7. Age and wear: how old, what is mended, what is failing, what was
   abandoned. Argonians build to be replaced, not to last; foreign stone
   sinks and rots.
8. The promises as story beats: each record promise as a moment the player
   meets, in walking order (feeds the walk-through).
9. What this place must not repeat from the places already built nearby.

## Mood and its levers

| Mood | Levers that carry it |
|---|---|
| Welcoming | light visible from the approach at night; an open threshold; a hearth seen from the door; food, smoke, seating; paths worn to the door |
| Wary | a watch point that sees the approach before you see it; a narrow way in; totems or warnings at the edge; doors facing inward |
| Threatening | a dark mass at the centre of the silhouette; no light, or the wrong light; bones, stakes, broken things on the way in; water you must wade |
| Sacred | a narrowed approach; a marked threshold; the object of devotion framed and lit from the approach; offerings showing who tends it; stillness, still water |
| Worn / decaying | patches and repairs on old frames; sagging roofs; half-sunk and rotten pieces; overgrowth through the made thing |
| Prosperous | goods stacked and displayed; boats moored; fresh repairs; more light; variety of trade |
| Busy | clutter at every work point; tools mid-use; paths between work points; several fires |
| Lonely | one structure against a wide view; long sightlines with nothing in them; one light |
| Hidden | seen late, from close; screened by reeds, roots or mangrove; the way in is not the obvious way |
| Oppressive (penal, debt labour) | a single overseer's view of all work; enclosures; the product taken away, the workers' shelter meagre |

Levers in every place: the silhouette and first-seen object; sightlines and
the reveal; density and clutter; wear and repair; light and fire at night;
water and sound; scale against the player (an Argonian stands about 1.8 m);
enclosure and openness; the paths feet would wear; signs of life (nets,
drying racks, smoke, eggs, laundry, food).

## § Walk-through (design.md, second section)

Walk the main approach in your head as the player, before layout, and write
it as six stages. Per stage: what is seen, the mood word it serves, the
pieces that carry it, and the feel-check camera (eye X,Z looking at X,Z).

1. Far (300 to 150 m): the silhouette against sky and trees; the first-seen
   object (taller than the trees, or lit at night, or smoking).
2. Approach: the path; what is revealed when; what guides the walker
   (smoke, light, a sign facing them, sound, a wider path).
3. Threshold: the moment the walker is "in": a gate, a dock step, a change
   of ground, the first made thing at hand height.
4. Heart: where life happens: the hearth, the altar, the work face, the
   market, the landing.
5. Reward: what pays for entering: an interior, loot with provenance, a
   view, a clue to the story.
6. Exit: the way on, and what is seen when leaving; nothing dead-ends.

Answer the approach questions of world 97 §5
([openworld-approach-and-wayfinding](../../../../docs/research/placement-settlements/openworld-approach-and-wayfinding.md))
inside these stages. Walking it catches
function too: every sign faces a walker on a path; every deck, stair and run
ends on ground, a landing or a ladder down to the water; every door is
reached by a way a foot can take; every promised thing in the far and
approach stages is actually in view from the camera named.

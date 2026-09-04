# Phase 11 Part 6 — Round A packet: sitings and layouts for the five exemplars (2026-09-04)

The five exemplars (decision 0041 § Part 5 decision) each have a site dossier,
two or three exact candidate sitings, a chosen ground, a high-level design and
a draft blueprint that validates, compiles with zero errors and renders. This
is Round A of the hands-on loop (0041 § Part 7): **you steer siting and
layout on maps**; nothing is built in the world yet, and regenerating a map
takes seconds.

## What to open

| Exemplar | Map (PNG) | Design record (the reasoning, the questions) |
|---|---|---|
| Lilmoth (city) | `tooling/world-generation/output/blueprint-maps/place.mercantile-coast.lilmoth.png` | `world/sources/blueprints/place.mercantile-coast.lilmoth.md` |
| Nine-Trunks (Hist village) | `…/place.hist-heartland.nine-trunks.png` | `world/sources/blueprints/place.hist-heartland.nine-trunks.md` |
| Mazzatun (stone village on a slope) | `…/place.dunmer-north.mazzatun.png` | `world/sources/blueprints/place.dunmer-north.mazzatun.md` |
| The Standing Charge (wamasu pond) | `…/place.naga-kur-deeps.wamasu-pond-adult.png` | `world/sources/blueprints/place.naga-kur-deeps.wamasu-pond-adult.md` |
| The Licensed Stage (sap camp) | `…/place.hist-heartland.sap-tapping-licensed.png` | `world/sources/blueprints/place.hist-heartland.sap-tapping-licensed.md` |

The maps are drawn over the real terrain: shaded relief, contours, water in
blue, the place boundary as a white dashed line, districts as tinted areas
(one colour per kit set), buildings as boxes coloured by how they sit on the
ground (direct, plinth, pad, stilt, dug-in), doors as dots with an arrow for
the way they face, landmarks as stars, quest sockets as crosses, fight spaces
as red dashed boxes. Scale bar bottom left. The maps live in a gitignored
output folder on this machine; open them from the IDE.

## Where each one ended up, in one line

- **Lilmoth** sits on the east face of its anchor hill: four tiers in 400 m
  (crest with the Hist court, a bench with the council, the tidal flat with
  the lighter quay, the drowned quarter beyond). Six districts, one of them
  (Pusbottom) fully parcelled so you can judge the grain.
- **Nine-Trunks** moved 149 m to a knoll: the plotted ground had over four
  metres of fall across the ring, which the no-grading rule forbids. The
  ring is nine trunk-houses 22.6 m apart around a 51 m clearing.
- **Mazzatun** moved 120 m onto a measured rock bench: the plotted point was
  a 47-degree hillside. Three terraces, top to bottom: the labourers' pens,
  the half-built stone works, the staging ground by the stream.
- **The Standing Charge** moved 69 m onto the one closed pond within 600 m;
  the plotted point had no standing water at all.
- **The Licensed Stage** moved 117 m to the one bank whose water floats a
  loaded canoe, so the licence can be read from the water as the record says.

## The decisions that are yours (each design record has the full version)

**Lilmoth**
1. Drowned quarter shallow-and-underfoot (1–10 m, off your own walkway) or
   deep-and-expeditionary (15–25 m, a boat trip out)?
2. Keep a legible Imperial north gate, or half-swallow it so the city has
   grown across the old wall line?
3. Pusbottom density: a warren, as drawn (about 20 houses per hectare), or
   opened out?
4. Climbing: only through the authored walkways and stairs, or free on the
   piles and house sides? Hard to reverse once quest gates are authored.

**Nine-Trunks**
1. No kit piece spans between two trunks, so the houses are grown *into* the
   nine trunks (34–56 m tall, a real skyline). Accept, or source a bare Hist
   trunk mesh and go back to low huts (a sourcing job and a delay)?
2. Foreign canvas outside the gate for the visiting delegations, or bare
   rented decks in the interior kit?
3. Ring tightness: trunks 22.6 m apart. This number becomes the default for
   all 27 tribal villages.
4. Accept the 149 m move.

**Mazzatun**
1. A finished pyramid (the smallest static is 34 × 22 m and swallows the
   whole shelf) or a building site of rising courses, as drawn?
2. Keep the Hist 55 m below the city with the conduits climbing the cliff,
   or move the sibling Hist record up to the stream head so the city
   encircles it?
3. Pens visible on arrival (a statement) or behind the rise (a reveal)?
4. Haul road cut as a switchback, or stone hoisted while the player climbs?

**The Standing Charge**
1. Pond depth: 2.5 m (a swimmable fight with a dive to the cache) or knee
   deep (a wading duel)? The blueprint assumes deep.
2. Charged water lethal, or heavy damage over time? This sets the pattern for
   all 38 beast lairs.
3. Killing it: a quiet change (lantern out, poles left) or a loud one (the
   detour abandoned on the map, travel times drop for the zone)?
4. Are the offering-makers right and the hunter wrong, or is the shrine
   superstition and the stand simply old?

**The Licensed Stage**
1. Tree size: the 54 m hero Hist (a landmark above the canopy) or the 22 m
   tree (a camp that stays hidden)?
2. Tent (seasonal) or mud hut (permanent) for the one dwelling?
3. Licence readable from the boat, or only after landing and climbing?
4. How much jungle to clear: the draft clears about 190 m². This is the
   first frame-rate data point for a place inside closed canopy.

## Things found on the way (no action needed from you unless you disagree)

- **Sourcing gaps, shown as gaps:** no bare Hist trunk column that stands
  alone (Nine-Trunks); no focal object for an Argonian underwater shrine
  (Lilmoth's sunken shrine sits in an empty hollow-ruin cell for now).
- **Catalogue records that should change** once you confirm the sitings
  (positions, plot facts, a pool request for the pond, a rock-shelf request
  for Mazzatun, asset plans that named kits which cannot serve the place):
  listed at the end of each design record; not edited yet, because the text
  reviewers were rewriting those files at the same time.
- **Compiler fixes made on the way:** door reachability was sampling the
  wrong grid cell (row and column swapped) and reading a coarse slope raster
  (a terrace lip read as 40°); parcels can now state their orientation; a
  district is one packaged kit set; every placed object has a stable id.

## How to feed back

Reply in plain words, per place, against the numbered questions, plus
anything the map makes you want to move ("the quay should be further south",
"too many houses", "wrong side of the river"). Every steer is written into the
Taste ledger (0041) as a general rule, so a comment on one village fixes all
27. Round B (massing: buildings compiled and rendered from the player's eye)
starts on whichever place you approve first; Lilmoth is the natural first
because you are involved in all cities.

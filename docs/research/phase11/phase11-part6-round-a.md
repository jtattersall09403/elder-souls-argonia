# Phase 11 Part 6 — Round A packet: sitings and layouts for the five exemplars (2026-09-04)

The five exemplars (decision 0041 § Part 5 decision) each have a site dossier,
two or three exact candidate sitings, a chosen ground, a high-level design and
a draft blueprint that validates, compiles with zero errors and renders. This
is Round A of the hands-on loop (0041 § Part 7): **you steer siting and
layout on maps**; nothing is built in the world yet, and regenerating a map
takes seconds.

## What to open

**The interactive view (owner request 2026-09-05).** In World Studio tick
**Blueprints** in the layer row, or open `?bp=1&blueprint=lilmoth` (also
`nine-trunks`, `mazzatun`, `wamasu-pond-adult`, `sap-tapping-licensed`).
Wheel zooms, drag pans, hover names a thing, click opens its details (a
building's use, piece, ground fit, orientation and the reason for it; a
district's kit set; a candidate siting's why). Layers can be hidden with the
checklist; labels appear once you zoom past three pixels per metre. With
nothing selected the side panel shows the place's causal model and budget.

Buildings are drawn as their real measured outlines, turned to the
orientation the design record gives a reason for. The static PNG maps in
`tooling/world-generation/output/blueprint-maps/` still exist as a
by-product but are not the review medium.

| Exemplar | Studio link | Design record (the reasoning, the questions) |
|---|---|---|
| Lilmoth (city) | `?bp=1&blueprint=lilmoth` | `world/sources/blueprints/place.mercantile-coast.lilmoth.md` |
| Nine-Trunks (Hist village) | `?bp=1&blueprint=nine-trunks` | `world/sources/blueprints/place.hist-heartland.nine-trunks.md` |
| Mazzatun (stone village on a slope) | `?bp=1&blueprint=mazzatun` | `world/sources/blueprints/place.dunmer-north.mazzatun.md` |
| The Standing Charge (wamasu pond) | `?bp=1&blueprint=wamasu-pond-adult` | `world/sources/blueprints/place.naga-kur-deeps.wamasu-pond-adult.md` |
| The Licensed Stage (sap camp) | `?bp=1&blueprint=sap-tapping-licensed` | `world/sources/blueprints/place.hist-heartland.sap-tapping-licensed.md` |

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

- **Sourcing gaps: both filled** (2026-09-05) from assets we already hold: a
  bare trunk column for the Nine-Trunks ring (Tropical Skyrim's giant trunk,
  scaled to about five metres across) and a set of carved Argonian totems for
  Lilmoth's sunken shrine. A sourcing-gap register with a status column now
  exists so a gap can never be quietly left.
- **The moved places have moved on the map** (positions, plot facts, the
  minor paths and waterways re-run) via the new write-back tool; the other
  catalogue changes the designs ask for (a pool request for the pond, a
  rock-shelf request for Mazzatun, asset plans naming kits that cannot serve
  the place) wait for your confirmation of the sitings.
- **Compiler fixes made on the way:** door reachability was sampling the
  wrong grid cell (row and column swapped) and reading a coarse slope raster
  (a terrace lip read as 40°); parcels can now state their orientation; a
  district is one packaged kit set; every placed object has a stable id.

## What changed since your first look (2026-09-05)

- **Click shows the whys.** Every building, district, landmark and dock opens
  with six plain-English paragraphs: what it is, why it is in the place, why
  this exact spot, why it sits with its neighbours, what it gives the player,
  how it uses the ground. Then the orientation and its reason. Missing text
  shows in red.
- **The map is the studio map**, zoomed in, with the neighbouring places and
  routes drawn as context. In walk mode, tick "bp ground" (or `?bpground=1`)
  to see the outlines painted on the ground and walk them.
- **Layers are integrated by the compiler**: a way only touches a building it
  ends at, no path is drawn twice, a gate stands across its road, every door
  opens within four metres of a way, canals lie in water. Streets are routed
  over the ground by a cost search unless the culture builds straight.
- **Doors and interiors** are derived from what the kits ship: a piece that
  encloses a room has a door on its real doorway side and names the interior
  kit that will fill it.
- **Full detail**: every district parcelled; fences and walls drawn; each
  place's size derived from lore (the design record's "Size grounding").
- **Approaches**: each design record has an "Approach and wayfinding" section
  describing what a walking or paddling player sees, in order, from each
  direction, and a 16-item checklist with answers.
- **The principles** these designs follow are now one document,
  [world/97-placement-principles.md](../../world/97-placement-principles.md);
  its closing list has fifteen decisions for your sense check. The audit of
  the five blueprints against it is
  [phase11-round-a-audit.md](phase11-round-a-audit.md).

## How to feed back

Reply in plain words, per place, against the numbered questions, plus
anything the map makes you want to move ("the quay should be further south",
"too many houses", "wrong side of the river"). Every steer is written into the
Taste ledger (0041) as a general rule, so a comment on one village fixes all
27. Round B (massing: buildings compiled and rendered from the player's eye)
starts on whichever place you approve first; Lilmoth is the natural first
because you are involved in all cities.

# Record coherence (step 5b; decision 0117)

One version of the truth per place. The catalogue record is the only thing
the 2D map popup (`places.json`, by `export_places`) and the builders read,
so the record must agree with itself, with the world around it, with every
quest that uses it, with lore and with what is built. This protocol checks
all five at once and fixes them in ONE change set. It runs at step 5b of
every build and in every fix round that touched the place or its record.

## 1. The packet (one file the readers read)

    cd tooling/world-generation
    python3 -m worldgen.record_coherence --place <place-id>
    python3 -m worldgen.record_coherence --all-built   # every built place

writes `tooling/.reports/16k/<place>/coherence-packet.md`: the record with
line numbers, routes passing within 3 km, neighbours within 5 km and the
nearest towns by line and by route, the travel-services rows, every quest
anchored at or naming the place in full plus the quests they depend on or
share cast with, the lore dossiers that bear, the compiled place's summary
(kits, doors, interiors, sockets, travel station) and the gate's current
failures. Readers read this file and nothing else unless a claim needs a
source checked.

## 2. The readers (five, one dimension each, in parallel)

A Workflow of five cheap readers (Sonnet, low effort), one per dimension,
each told to look only at its own dimension. Where no Workflow is
available, one Sonnet reader per place answers the five dimensions as five
separate NO lists (walk 8 ran this way: 1.5 to 3 min per place):

| Dimension | Asks |
|---|---|
| internal | Do the record's fields agree with each other: prose (`why`, `vibe`, `hook`, pressures, notes), `playerPurpose`, stance, magnitude, interiors, contents, sockets, travel station? |
| world | Is every place, route, water body, distance and direction the prose names true on the map: the routes really pass, the neighbours really neighbour, the coast or river really is there? |
| quests | Is every quest anchored at or naming the place true to the record and the world, and is the quest set still consistent with itself (dependencies, shared cast, other places' quests that name this one)? |
| lore | Does the record agree with the dossiers in `world/sources/lore/` (UESP for gaps, era policy 0002)? |
| built | Does the compiled place hold what the record and the quests promise, and does the record name what is built (a feature the prose promises that is not built, a built feature the record never mentions)? |

Reader prompt (fill the dimension and the packet path):

> Read `<packet>` only. Your dimension is <dimension>: <asks>. Return a NO
> list, one row per contradiction: `file:line` of the claim, the claim
> quoted, the evidence against it (`file:line` or the packet section). No
> fixes, no style comments, no rows outside your dimension. If you find
> none, return `NONE` and the sections you checked.

Full notes go to `tooling/.reports/16k/<walk>/coherence/<place>-<dimension>.md`.

## 3. The synthesis (one Opus agent, one change set)

One Opus agent reads every NO list for the place and decides ONE change
set. It reasons over every record the fix touches, including places and
quests no reader flagged: a quest re-premised is checked against the
quests that depend on it and share its cast; a neighbour that names this
place is edited with it; a travel-services row or route relation moves with
the prose. Fix the record to the world and the build, never the world to
the prose; a quest is edited only so that the whole quest set stays
consistent (never fix one quest by breaking another). Prose is written
against the record (standard 12) and the style guide's "Before you write".

A feature the record or a quest needs that is not built is a layout
request (uid-level op) for the place round, never a rebuild here.

Then: apply the change set, `export_places`, `blueprint_promises --write`,
`place_gates --id <place>` green (`record.coherence`,
`record.consistency`, `promises`), and ONE `text-review` in a separate
agent over every edited prose row. Never one issue at a time.

## 4. The gate (`record.coherence`, place_gates)

What a tool can measure, under 5 s: every place, city and route name in
the record's prose and its quests' text resolves to an id and is related
to the place (dependsOn, toll, travel link, within 5 km, or an endpoint of
a route passing within 3 km); every route named passes within 3 km;
"between A and B" needs a route A–B within 3 km; a quest premise naming a
feature (channel, ferry, well, spring, Hist tree, toll, ...) finds it in
the record, the build or the water within 3 km. The readers cover what
the gate cannot (direction, era, tone of purpose, built form).

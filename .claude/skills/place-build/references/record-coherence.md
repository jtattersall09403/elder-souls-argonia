# Record coherence (step 5b; decision 0117)

One version of the truth per place. The catalogue record is the only thing
the 2D map popup (`places.json`, by `export_places`) and the builders read,
so the record must agree with itself, with the world around it, with the
scene as built, with every quest that uses it, with lore and with what is
built, and a change set that fixes one place must leave every other place,
quest and route as coherent as it found them. This protocol checks all six
at once and fixes them in ONE change set. It runs at step 5b of every build
and in every fix round that touched the place or its record.

## 1. The packet (one file the readers read)

    cd tooling/world-generation
    python3 -m worldgen.record_coherence --place <place-id>
    python3 -m worldgen.record_coherence --all-built   # every place with a published bundle

writes `tooling/.reports/16k/<place>/coherence-packet.md`: the record with
line numbers, routes passing within 3 km, neighbours within 5 km and the
nearest towns by line and by route, the travel-services rows, every quest
anchored at or naming the place in full plus the quests they depend on or
share cast with, the lore dossiers that bear, the compiled place's summary
(kits, doors, interiors, sockets, travel station), the gate's current
failures, and **§ Scene**:

- where each structure stands, read from the bundle against the frozen
  water record: `land` (the mainland), `islet` (dry ground cut off by
  water), `water` (with its depth and the nearest dry ground);
- placements by class (structure, run piece, clutter, light) and where;
- every run (plank walk, dock, landing): pieces, length, and what each end
  touches (land, islet or water, and the structure within 15 m);
- the frozen vegetation within 200 m that the place's own clearance keeps,
  by species and by the plants prose names (mangrove, palm, reed, fern ...).

Readers read this file and nothing else unless a claim needs a source
checked. Prose about where things stand or what grows is written from
§ Scene, never from the region class (Riverwalk's "cove in mangrove
forest" came from the plotter's region label; 20 mangroves stand within
200 m, walk 9).

## 2. The readers (six, one dimension each, in parallel)

A Workflow of six cheap readers (Sonnet, low effort), one per dimension,
each told to look only at its own dimension. Where no Workflow is
available, one Sonnet reader per place answers the dimensions as separate
NO lists (1.5 to 3 min per place):

| Dimension | Asks |
|---|---|
| internal | Do the record's fields agree with each other: prose (`why`, `vibe`, `hook`, pressures, notes), `playerPurpose`, stance, magnitude, interiors, contents, sockets, travel station? |
| world | Is every place, route, water body, distance and direction the prose names true on the map: the routes really pass, the neighbours really neighbour, the coast or river really is there? |
| scene | Does every claim about where things stand and what grows match § Scene: which buildings are on land, in the water or on the islet, what each plank walk joins, what grows within 200 m? |
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

Edit JSON records through a parser or the Edit tool on exact strings, never
by character-offset splicing (a splice deleted 966 lines in walk 8).

## 4. The change-set check (the `set` reader)

A record another place's round already made coherent can be broken by the
next place's change set (owner, walk 9). Before the change set is accepted:

    python3 -m worldgen.record_coherence --changed

lists every place and quest record that differs from HEAD, re-grades each
touched place, the places the touched quests anchor at, and every place
whose relations or prose name a touched place, and writes
`tooling/.reports/16k/changeset-packet.md` (each touched record before and
after, each re-graded place with its HEAD status). It fails when a touched
place record or a built place is red, or a record green at HEAD is red now. Then a seventh reader,
`set`, reads that packet:

| Dimension | Asks |
|---|---|
| set | Does this change set leave every other place, quest and route it touches as coherent as before: does any after-text contradict a record that was not edited, or undo a fit an earlier round made? |

Its NO rows go back to the synthesis, which revises the one change set and
re-runs `--changed` until green and `NONE`.

Then: `export_places`, `blueprint_promises --write` (re-confirm each
edited prose row against § Scene), `record_coherence --receipt`,
`place_gates --id <place>` green (`record.coherence`, `record.regression`,
`record.consistency`, `promises`), and ONE `text-review` in a separate
agent over every edited prose row. Never one issue at a time.

## 5. The gates (place_gates)

`record.coherence`, over this place and every other built place every
round: every place, city and route name in the record's prose and its
quests' text resolves to an id and is related to the place (dependsOn,
toll, travel link, within 5 km, or an endpoint of a route passing within
3 km); every route named passes within 3 km; "between A and B" needs a
route A–B within 3 km; a quest premise naming a feature (channel, ferry,
well, spring, Hist tree, toll, ...) finds it in the record, the build or
the water within 3 km; a plant the record's prose says grows there has at
least 5 frozen instances within 200 m that the place's clearance keeps,
60 for a stand ("mangrove forest", "reed beds"); building-material uses
("reed thatch", the `materials` and `palette` fields) are not plants.

`record.regression`: every place record's status is held in the tracked
receipt `world/sources/catalogue/coherence-receipt.json`; the gate fails
on any record green in the receipt at HEAD and red in the working tree,
and refreshes the receipt, so a rollback is a visible line in the commit.
The readers cover what the gates cannot (direction, era, tone of purpose,
built form).

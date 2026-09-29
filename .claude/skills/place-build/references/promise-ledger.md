# The promise ledger and the record's prose (place-build step 0 item 3)

Moved from SKILL.md step 0 (2026-09-29); SKILL.md keeps one line per rule. Source: 0104 decisions 3–6, 0105 R5, lessons L02, L06.

`blueprint_promises --write` generates the **promise ledger**
`world/sources/placement/promises/<place-id>.json` (0104 decision 3): one
row per promise (service, NPC role, travel operator, quest provision,
catalogue socket bucket, D0 safe interior), each with a stable `promise.`
id, its source record and field, and its text. **It is the checklist you
start from, work through and end on**: every row is filled by a placed
thing carrying `fills: [that id]` (0104 decision 4) or carries an
`unfilled` block with one of 0102's four reasons; the compile fails
otherwise (0104 decision 5). The catalogue record is the row in
`world/sources/catalogue/places-<zone>.json`; the plot is
`world/sources/sites/macro-plot.json`; the quest provisions are the
place's rows in `docs/quests/20-world-provisions.md` and
`docs/quests/25-quest-place-map.md`; the lore is the dossiers the design
index names for the culture and type.
**Read the prose too, sceptically.** The record's `why`, `vibe` and
description carry intent the typed fields do not; build to it. Where it
contradicts the dossier, the typed fields or an asset fact, the typed
field and the ground win and the prose is corrected (lessons L02, L06).
No line of prose claims a world behaviour the runtime lacks (0105 R5:
a flood, a tide, a rising ford, a collapse); a claim with no system
behind it is rewritten to what the player can see.
**Two-way (0104 decision 6):** a promise the world cannot keep (an item
class no asset shows, a service the ground or culture forbids, an
interior no plugin furnishes) is neither left hanging nor faked: file a
REQUEST row changing the source record to the nearest thing the world
can keep, design on the corrected record, list the prose for the batch's
one `text-review`, and log it in the brief's § Record corrections. A
change to a quest's premise or a place's purpose is an owner call.

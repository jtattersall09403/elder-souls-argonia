# The promise ledger and the record's prose (place-build step 0 item 3)

Moved from SKILL.md step 0 (2026-09-29); SKILL.md keeps one line per rule. Source: 0104 decisions 3–6, 0105 R5, lessons L02, L06.

`blueprint_promises --write` generates the **promise ledger**
`world/sources/placement/promises/<place-id>.json` (0104 decision 3): one
row per claim of the record the build can keep or contradict, each with a
stable `promise.` id, its source record and field, and its text. Filled
rows: service, NPC role, travel operator, quest provision, catalogue
socket bucket, D0 safe interior, the principal `interior`, a promised
`underwaterAccess`, the `travelStation`. Confirmed rows: `prose` (each
`why`, `vibe`, purpose hook and quest-opportunity line) and `quest` (each
quest in `world/sources/quests/` whose `settlement` or `anchorPlaces`
names the place). The entity map is `docs/world/98-data-model.md`. **It is the checklist you
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

## Record = built (place-build step 5b; owner walk 7)

Walk 7 found Riverwalk's record promising "8–20 structures, every one
enterable", an underwater way in and a village "strung along a channel"
at a "northern trunk", while the built place was a plank walk from a
coast spit to an islet. The ledger then carried only the typed fields,
so nobody re-read the prose against the build. Now every claim is a row,
and the builder closes each one before the walk:

1. Re-read the record against the built place: every prose row, the
   interior block, `underwaterAccess`, `travelStation`, `services`,
   `classification.magnitude`, `sitingPrefs.hardConstraints`.
2. Where the place differs, edit the RECORD in the same change, fields
   and prose (the builder holds this authority, 0104 decision 6): the
   magnitude to the band the counted buildings fall in
   (`breadth-bars.json`), `underwaterAccess: none` when no underwater
   way in was built, an added feature (an islet shrine) written into
   `vibe`, a site fact (coast, not a channel) written into `why`. Move the
   place a little only where no placement rule breaks; never re-derive
   the plot.
3. Review every quest row that anchors here (`world/sources/quests/`):
   edit a premise the change makes untrue, then run
   `python3 -m worldgen.export_quest_index` (worldgen). A change to a
   quest's purpose is an owner call.
4. Re-run `blueprint_promises --write`, then set each prose and quest
   row's `confirmed: {"sha": <the sha the gate prints>, "note": <what in
   the built place keeps it>}`. An edited text voids its confirmation.
5. Run `export_places` (the map popup is derived from the record) and
   list every edited line for the batch's `text-review`.

Gates: `promises` (every row filled, excused or confirmed) and
`record.consistency` (the counted buildings sit in the record's
magnitude band) fail until this is done.


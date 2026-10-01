# 0116 — The record is the built place: the promise ledger holds every claim of the record, prose and quest rows are confirmed against the build, and two gates hold it

Status: accepted (16k walk 7, 2026-10-01). Extends 0104 decisions 3, 5
and 6. Owner, walk 7: "the end goal is for each place's 2D map, place
record and built 3D place to all be 100% consistent with each other".

## Context

Riverwalk's record promised "about 8–20 structures, every one enterable",
a principal interior entered from under the water and a village strung
along a channel at a "northern trunk". The built place is a coast spit, a
plank walk and an islet stage, and the record never named the islet. The
ledger (0104 decision 3) held only the typed promises (services, NPCs,
operators, provisions, socket buckets, the safe interior), so the prose,
the interior block, `underwaterAccess`, `travelStation` and the quests
anchored on the place were on nobody's checklist.

## Decisions

1. **The ledger holds every claim the build can keep or contradict.**
   `blueprint_promises` adds rows of kind `interior` (the principal
   interior), `underwaterAccess` (a dive way in; `surface-swim` is the open
   water and is no row), `travelStation`, `prose` (each `why`, `vibe`,
   purpose hook and quest-opportunity line) and `quest` (each quest record
   whose `settlement` or `anchorPlaces` names the place). The first three
   are filled like any promise.
2. **Prose and quest rows are confirmed, not filled.** The builder re-reads
   each against the built place and sets `confirmed: {sha, note}` (sha = the
   first 12 hex of the text's sha256; note = what in the place keeps it).
   An edited text voids its confirmation; the regenerated ledger keeps
   only matching ones. Schema: `packages/world-schema/schemas/promises.v1.schema.json`.
3. **Two gates.** `promises` fails an unconfirmed or stale prose or quest
   row; `place_gates` gate `record.consistency` fails a settlement whose
   counted buildings fall outside its record magnitude's band in
   `breadth-bars.json`. The map popup (`places.json`) is derived from the
   record by `export_places`, so it needs no gate of its own beyond
   `test_export_places.py`.
4. **The builder edits the record, not the other way round.** Place-build
   step 5b: whatever the build changed is written into the record in the
   same change, the anchored quests are reviewed, and the edited prose
   goes to the batch's `text-review` (0104 decision 6 made routine).
5. **No closed buildings** is gate `interiors.closed` (0114 rule 3).

## Consequences

- Every built place's ledger carries confirmed prose and quest rows;
  Greenspring, Claywater Station and Riverwalk were reviewed and their
  records corrected on 2026-10-01.
- The procedure, checklist and gates are in
  `.claude/skills/place-build/references/promise-ledger.md` § Record = built,
  rulings R92 and R93, lessons L80 and L81; the entity map is
  `docs/world/98-data-model.md`.

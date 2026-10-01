# 0117 — Record coherence: a place record agrees with itself, the world, its quests, lore and the build, checked by five readers, fixed in one change set, gated by `record.coherence`

Status: accepted (16k walk 8, 2026-10-01). Extends 0116 (the record is the
built place) from the build to the world around it. Owner, walk 8: one
version of the truth per place, read by the 2D popup and the builders,
consistent within the record, with routes, neighbours and geography, with
the authored quests, with lore and with what is built; reached
efficiently, never one issue at a time.

## Context

Riverwalk's record said it sat "half-way along the coast lane between
Stormhold and Alten Corimont". Both cities lie inland, 3 to 4.5 km west,
and the boat lane that links them is the Shadowfen channels, 3.2 km away.
Its quest LV40 premised a channel the built cove does not read as. 0116's
`record.consistency` checked only the magnitude band, and the promise
ledger's prose rows were confirmed by the builder alone against the build,
never against the map, the quests or lore. Readers on all three built
places then found the same class of defect on Claywater and Greenspring
(entrance counts, services nobody staffs, relations that contradict
themselves).

## Decisions

1. **One protocol at place-build step 5b and in every fix round that
   touches a record, a quest or the build**
   (`.claude/skills/place-build/references/record-coherence.md`):
   `worldgen.record_coherence --place <id>` writes one reader packet;
   five readers (internal, world, quests, lore, built) return NO lists
   with file:line; ONE Opus synthesis decides one change set across the
   record, the quests and every other record the change touches, applies
   it, re-runs `export_places` and `blueprint_promises`, then one
   `text-review`. The record is fixed to the world and the build, never
   the reverse; a quest is changed only so the whole quest set stays
   consistent.
2. **Gate `record.coherence`** (`place_gates`, under 1 s): every place,
   city and route name in the record's prose and its anchored quests'
   text resolves to a catalogue or registry id and is related to the place
   (a relation, within 5 km, or an endpoint of a route passing within
   3 km); a named route passes within 3 km; "between A and B" needs a route
   A–B within 3 km; a quest premise naming a feature finds it in the
   record, the build or the water within 3 km. It was shown red on
   Riverwalk before the fix (`test_record_coherence.py`).
3. **What the gate cannot measure stays with the readers** (direction,
   era, built form against purpose). A defect class the readers find twice
   on different places becomes a gate check under 0106's cost rule.

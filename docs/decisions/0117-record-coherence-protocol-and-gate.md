# 0117 — Record coherence: a place record agrees with itself, the world, the scene, its quests, lore and the build, checked by six readers, fixed in one change set that breaks no other record, gated by `record.coherence` and `record.regression`

Status: accepted (16k walk 8, 2026-10-01; scene and set rules from walk 9,
2026-10-01). Extends 0116 (the record is the built place) from the build to
the world around it. Owner, walk 8: one version of the truth per place,
read by the 2D popup and the builders, consistent within the record, with
routes, neighbours and geography, with the authored quests, with lore and
with what is built; reached efficiently, never one issue at a time. Owner,
walk 9: coherent means the whole set of places and quests stays coherent,
and a later place's edits must not undo a fit an earlier round made.

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

After that round Riverwalk still said "the houses stand along the plank
walk, which serves as the village street" (the houses stand on the shore;
the walk joins the shore to an islet with a tent and the ferry stage) and
"cove in mangrove forest" (20 mangroves within 200 m, none by the houses).
The packet described the compiled place by kits, doors and sockets, never
by its scene, so neither the readers nor the synthesis could see either
claim was false. The round also edited five neighbouring records to fit,
and nothing stopped a later place's round from editing them again.

## Decisions

1. **One protocol at place-build step 5b and in every fix round that
   touches a record, a quest or the build**
   (`.claude/skills/place-build/references/record-coherence.md`):
   `worldgen.record_coherence --place <id>` writes one reader packet;
   six readers (internal, world, scene, quests, lore, built) return NO
   lists with file:line; ONE Opus synthesis decides one change set across
   the record, the quests and every other record the change touches. The
   record is fixed to the world and the build, never the reverse; a quest
   is changed only so the whole quest set stays consistent.
2. **The packet carries the scene**: each structure on land, islet or
   water (the bundle's placements against the frozen water record's dry
   components; the mainland is the component touching the window edge),
   placements by class, each run's length and what its ends touch, and
   the frozen vegetation within 200 m that the place's own clearance
   keeps. Prose about where things stand or what grows is written from it.
3. **A change set is accepted only when it leaves the set coherent**:
   `record_coherence --changed` re-grades every place and quest record
   that differs from HEAD, the places those quests anchor at and every
   place whose relations or prose name a touched place; it fails on a red
   touched or built record or a record green at HEAD and red now. The
   `set` reader reads its before/after packet and answers whether any
   other place, quest or route is less coherent than before.
4. **Gates** (`place_gates`):
   - `record.coherence`, over the place and every built place every
     round: every place, city and route name in the record's prose and
     its anchored quests' text resolves to a catalogue or registry id and
     is related to the place (a relation, within 5 km, or an endpoint of a
     route passing within 3 km); a named route passes within 3 km;
     "between A and B" needs a route A–B within 3 km; a quest premise
     naming a feature finds it in the record, the build or the water
     within 3 km; a plant the record's prose says grows there (the nouns
     proved by flora palette species: mangrove, palm, reed, cypress,
     willow, fern, moss, kelp ...) has 5 kept instances within 200 m, 60
     for a stand ("forest", "beds", "grove"); building-material fields
     and uses are not plants. Red on Riverwalk before each fix
     (`test_record_coherence.py`).
   - `record.regression`: the tracked receipt
     `world/sources/catalogue/coherence-receipt.json` holds every place
     record's status; the gate fails on a record green in HEAD's receipt
     and red in the tree, and refreshes the receipt so a rollback shows in
     the commit. The whole catalogue grades in about 2.5 s.
5. **What the gates cannot measure stays with the readers** (direction,
   era, built form against purpose). A defect class the readers find twice
   on different places becomes a gate check under 0106's cost rule.

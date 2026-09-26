# The Phase 15 packet template (procedure written at the 16k loop's exit)

> From 16j item 8, carried into 16k § Carried backlog (decision 0099).
> `docs/phases/15-rollout/packet-template.md` is written from this list at
> the loop's exit, from what the loop's places actually needed; until then
> this is the spec it must meet.

A rollout packet is a region's places **and** its route structures and
ferry berths; leaving one `pending: packet` is a failed gate, not a note.
The template carries:

1. **The rhythm per packet:** the place skill run per place (steps 0–6),
   the owner's walk per packet, one fix round per walk, the same exit as a
   16k slice. Minor types built from the per-type template decision
   recorded at the loop's exit.
2. **The skill calls** in order: `place-build` per place, `kit-build`,
   `modular-runs`, `composite-author`, `kit-mining` for kit gaps,
   `text-review` in a separate agent for prose.
3. **Scoped runs only:** every per-packet stage runs with the `--places`
   selector (16j item 7b); full runs happen only at freeze. A run with
   `--places` leaves every other place's output byte-identical.
4. **Record reads:** per field, the record that supplies it (graph id,
   `water-meta` id, route line, `designedSinkM`, plugin link); a hand
   decision that turned out to be a missing field is closed in the
   record's schema, not in prose.
5. **The four Argonian village forms** from King of the Murkmire's
   spacing, as bands in `world/sources/catalogue/type-recipes.json` with
   `sources` naming the KotM set: mud compound, platform stilt,
   Hist-centred, dock hamlet
   (`docs/research/placement-settlements/king-of-the-murkmire-adoption-plan.md`
   § 2, § 3.3).
6. **The owed list** as a typed record on the packet: assembled
   interiors at its reserved doors (Phase 12); fauna, encounters, loot
   (13, reading `sockets[]`); navmesh and combat-space probes (10b);
   balance (10c); streaming budgets (14).
7. **The density declaration** against plan ruling 11's budget (a
   Phase 15 completion gate: declare the packet's number, do not chase
   it) and the co-design quest pass (quests 90 §65b).
8. `ownerGuided` records (major cities, the opening scenes) never enter
   an unattended packet.

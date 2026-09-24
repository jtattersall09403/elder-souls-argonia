# Phase 15 — rollout by region packet (sketch, 2026-09-20; 16j writes the roadmap and the template)

**What Phase 15 is.** The province beyond the exemplars, built one region
packet at a time with the recipe 16i wrote and 16j proved, once every
system a packet needs exists (decision 0062 §6: after 9, 10b, 10c, 13,
12, 12b and 14). The 16j trial packet is packet one, authored in 16j and
completed here. Status lives in PROGRESS.md; the order lives in
`roadmap.md` (16j drafts it, the owner signs it); each packet is a chunk
from `packet-template.md`.

**Files in this folder (after 16j):** `roadmap.md` (ordered packets,
scope, types, owed structures, owner-guided flags), `packet-template.md`
(the brief every packet copies), one brief per packet as it opens.

## The rhythm every packet follows (the 16j rhythm, decision 0081)

1. **On paper** (`deliver packet N part 1`): the packet's places from the
   16g record; the co-design quest pass (quests 90 §65b); skill v2's plan
   steps unattended per place; the route structures and berths the packet
   owes; plan sheets with door tables; **owner check-in 1** (plans; a
   steer is a record edit).
2. **Built and completed** (`deliver packet N part 2`): steers as
   rules; patches applied locally; compile, export, publish once; then
   the owed systems applied *in the packet* with their own skills:
   assembled interiors at reserved doors (Phase 12's skill), fauna,
   encounters and fixed loot (13), navmesh and combat-space probes (10b),
   balance against compiled numbers (10c), streaming budgets (14), the
   soundscape (12b); **owner check-in 2** (the walk).
3. **Freeze**: the packet's density declared against ruling 11's budget;
   quest briefs and placements consistent; the packet marked done in
   PROGRESS.md; nothing above `rederive_blueprints` re-runs.

Every catalogue run in a packet follows the CLAUDE.md golden rule "Prove
on a sample, validate on a fresh batch, scale once", and every per-packet
stage (re-derive, export, vegetation patches, ground control) runs with
the `--places` selector 16j item 7b adds, full runs only at freeze
([16h catalogue audit](../../research/phase16/16h-catalogue-wide-steps-audit.md)).

Major cities and the opening-scene places (`ownerGuided: true`) are their
own packets with extra rounds; no skill runs unattended on them (0062 §9).
A type whose automation-readiness box is open (world 96 §3) gets an
owner round on its first instance in a packet, then rolls out.

## What is still to decide (16j answers these in the roadmap)

- Packet size: three to six places proved in 16j; whether larger packets
  hold once the skills run clean.
- Whether the plan check-in can be dropped for packets where every type is
  automation-ready and no owner-guided place is present (the owner
  decides at the 16j check-in 2).
- The order: contiguous regions along the road legs, opening-scene
  packets first for the playable start, or by quest milestone.

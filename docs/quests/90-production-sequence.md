# Post-world-generation production sequence (Q0–Q6)

> Module of the quest/narrative master plan (see [README](README.md)).

# Part XIII — Post-world-generation production sequence

## 65b. QW — the quest–world co-design loop (runs *inside* world Phases 11–15, before the exit gate)

*(Added 2026-08-26, owner directive. Quests and world-building feed each other:
what settlements exist determines who can give quests; what quests need
determines what gets placed — "clear the bandit camp west of town" requires a
bandit camp west of town. The main quest and faction lines already publish
their needs as per-quest provisions, so the world build can consume them
directly. The gap is the 60–80 regional/local quests, most of which are not yet
designed. This loop closes it, region by region, without pulling full quest
production forward.)*

For **every region packet** in world Phases 11 (settlements), 12 (dungeons),
13 (ecology/loot) and each Phase 15 expansion cycle:

1. **World drafts first.** The world agent drafts the region's settlement set,
   routes and POI skeleton from the lore registers and causal rules, as the
   phase already specifies.
2. **Quest-brief pass.** A quest-design agent then runs the **novelty check**
   against [55-quest-index.md](55-quest-index.md) (shape tags, collision test,
   the region's shape budget, the standing coverage gaps) and drafts the
   region's local quests **to brief level only** — premise, cast (per 35-cast rules), choice,
   S/M/L + delivery tier, and a provision list — using LQ-table entries where
   they exist and authoring new ones to the region's texture targets. Briefs
   may **request placements**: a camp overlooking a route, a flooded cellar, a
   toll on the crossing, a shrine off the map. No dialogue, no implementation.
3. **Reconcile and freeze.** The quest index gains the packet's rows in the
   same change; The world agent places what the briefs request
   (or the two agents negotiate substitutes), registers the sockets/IDs, and
   the packet freezes with briefs and placements consistent. New requirements
   discovered later go through the packet's change process, not ad hoc.

   **The packet change process:** design amendments to a frozen packet are a
   quest-agent role, recorded in the brief, its 55-index row, and a one-line
   decision note; physical/asset amendments use the world agent's existing
   amendment authority (0027 §3 / [20-world-provisions.md](20-world-provisions.md));
   canon-form failures and deadlocks escalate to the owner.
   **Tie-break:** world feasibility and the packet's POI/performance budget
   win — briefs request within budget, and conflicts the two roles cannot
   resolve become named questions in the packet's owner review.
4. **Main quest and factions**: their sites in the region are confirmed
   against the published provision tables in the same pass — a check, not a
   redesign.

**This loop does not require a separate agent.** A phase agent told "deliver
the next phase" performs both roles in sequence (world drafting, then brief
drafting) or spawns a subagent for the brief pass — either is fine. What is
mandatory is the **artifacts and the gate**: a region packet without its
quest-brief set is incomplete, and world plan 95 Phase 11 states this as a
completion gate.

**Per-packet quotas** (owner directive 2026-08-26; derivation in
[../research/placement-settlements/morrowind-content-density.md](../research/placement-settlements/morrowind-content-density.md)):
brief counts follow the settlement magnitude ladder — M5 ≈ 35–60 quests
originating at maturity (staged across waves; Milestone 1 share per the
content targets), M4 10–20, M3 3–8, M2 1–3, M1 0–2 — and the packet's POI set
meets the 18–22/km² (D0–D3) density budget with route spacing ≤300 m. The
briefs also assign each unmarked POI its diegetic pointer (rumour, note,
sightline) for the Phase 13 feed — and **every brief passes the asset check**
(70-assets §51): each physical element cites an A/V code, a vault asset, or a
named sourcing job; anything uncited is flagged `ASSET-RISK` with a fallback
staging (light, sound, text, placement) before the packet freezes. At build
time the world agent holds the **amendment authority** of
[20-world-provisions.md](20-world-provisions.md) — substitute the furniture,
preserve the function, protect the canon forms, write it back. The quota and
density numbers are planning priors and completion gates at packet scale, not
rigid per-hectare quotas — the same footing as 10-political-frame's
demographic priors.

The loop's outputs (briefs + placements) are exactly what Q4 later turns into
production quests, so no work is thrown away. Owner review of a region packet
covers both halves at once: the place, and what will happen there.

## 66. Q0 — Narrative mapping and modular documentation

After the world exit gate:

- split this strategy into modular docs for main quest, factions, local quests, lore and assets;
- map every proposed quest location to final semantic world IDs;
- replace working place assumptions with the accepted map;
- confirm D0–D5 progression;
- inventory missing interiors, routes, sockets and assets;
- freeze working IDs and name style guides.

No production dialogue yet.

## 67. Q1 — Minimal narrative runtime and inspector

Implement:

- quest state machine;
- typed conditions/actions;
- journal;
- topic dialogue;
- faction reputation/rank;
- sparse local state overlays;
- save/load;
- validators;
- World Studio narrative debugger;
- the **content-format spec**: journal-entry voice and tense, dialogue-topic
  naming conventions, dialogue length norms, book/rumour/letter formats, and
  reward bands (gold by tier, item power by tier);
- **one fully-written exemplar quest, owner-approved, before Q2 begins** — the
  reference every later quest is written against.

Use tiny synthetic quests first.

## 68. Q2 — Opening production pilot

Build MQ01–MQ05 as retained final content (merged numbering, 2026-08-26 —
MQ01 now spans processing and the attack):

- prisoner processing straight into the attack (villain seen, clutch dead);
- witness choice;
- Veiled Reed recruitment and the first dream;
- first affected-Hist investigation;
- convoy visit to Helstrom, including the Hall of the Scalded Throne.

This tests dialogue, evidence, local state, swimming, climbing, combat, transport and recurring actors.

## 69. Q3 — Treasure-hunt pilot and two faction slices

Implement:

- MQ06–MQ10;
- first 3–4 Night-Reed quests;
- first 3–4 Shadowscale quests;
- 6–8 standalone quests in the opening/southern packet.

These test investigation, heist routes, faction progression and world separation.

## 70. Q4 — Regional narrative packets

For each accepted watershed/region:

1. finalise local faction presence;
2. assign 8–15 authored local quests — the **Milestone-1 wave**; later waves
   fill toward the 0027 density ladder. Each quest runs 80 §65's per-quest
   workflow as this step's inner loop;
3. add relevant main/faction stages;
4. write rumours/books;
5. validate world IDs and difficulty;
6. owner playtest;
7. approve packet.

## 71. Q5 — Full faction lines and main Acts II–IV

Build institution by institution, keeping one coherent line in review at a time. Do not author all factions in parallel without shared style and validation. Order of production follows the depth tiers: the four deep lines complete first; the four standard lines then land their Milestone 1 arcs (6–8 quests each, wave-2 entries deferred); DQ01–DQ04 from Part IX-B are authored in this phase as pacing relief between faction lines.

## 72. Q6 — Lost City, endings and postgame

Only after:

- D5 traversal is stable;
- Lost City kit/streaming is production-ready;
- Wamasu boss works;
- all main political evidence states are implemented;
- ending simulations pass.

Then build MQ29, MQ31–MQ32 (merged numbering: Lost City with the Warden, sanctuary confrontation, epilogue) and regional epilogues.


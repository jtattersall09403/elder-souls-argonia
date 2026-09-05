# 0027 — Content density matched to Morrowind; co-design loop hardened into a gate

**Date:** 2026-08-26 · **Status:** accepted · **Scope:** `docs/quests/`,
`docs/world/95-build-sequence.md`, `docs/research/placement-settlements/morrowind-content-density.md`

## 1. Density targets (owner directive: same quests/km², POIs/km² and quests-per-city as Morrowind)

Researched from UESP (category-member counts via the API, faction/city pages,
OpenMW cell measurements) — evidence and derivation in
[../research/placement-settlements/morrowind-content-density.md](../research/placement-settlements/morrowind-content-density.md).
Headline numbers: Vvardenfell ≈ 20 km² of land carrying **≈ 410 named places
(~20 POIs/km²)** and **≈ 400 base-game quests (~20/km²)**, with quests
concentrated at settlements (Vivec ~90–100, Balmora/Ald'ruhn ~45–55 each,
villages 3–8) and the wilderness carrying POIs rather than quests. Our province
is **~37 km² of land** (1345 px @ 5.48 m/px, 32% ocean) — 1.5–2× Vvardenfell.

**Binding targets** (world plan 95 Phase 11 density budget; quotas in quests 90
§65b):

- **18–22 named POIs/km²** in D0–D3 authored land; **8–12** in D4–D5
  (landmark-heavy, quest-light — Red Mountain's own pattern); province total
  ≈ 550–750 named places at maturity;
- **route spacing**: something named within ≤300 m of travel along every road
  and boat lane; a new visible landmark per ~minute of walking;
- **quests per settlement by magnitude class**: M5 ≈ 35–60 (Helstrom top),
  M4 10–20, M3 3–8, M2 1–3, M1 0–2;
- **mature finite-quest target raised from 300–350 to ≈ 450–550**
  (~15–20/km²); Milestone 1 unchanged at ~170–210. The standalone-quest row
  in 00-overview's table rises to 250–330 at maturity;
- **all settlement structures enterable, all settlement NPCs named**
  (Morrowind's standard; Phase 11/12 must budget interiors accordingly);
- **diegetic discovery**: no quest markers means every unmarked POI needs at
  least one in-world pointer (rumour, note, corpse, grave-stake, sightline) —
  added to Phase 13's deliverables and the QW-loop briefs.

Sanity check: the per-settlement ladder summed across the settlement register
(≈ 480–560) agrees with the per-km² figure — the targets are consistent from
both directions.

## 2. The co-design loop is now a completion gate

Owner asked whether a fresh "deliver the next phase" agent will run the
quest–world co-design loop automatically. Made it so structurally rather than
hopefully: world plan 95 Phase 11 now states **a region packet without its
quest-brief set and density budget is not done and must not be marked done in
PROGRESS**; quests 90 §65b states the loop **does not require a separate
agent** — one phase agent wears both hats in sequence, or spawns a subagent;
the artifacts and the gate are what is mandatory. PROGRESS's Phase 11/13/15
rows carry pointers so the fresh agent's first read routes them in.

## 3. Addendum (same day) — asset feasibility and amendment authority

Quests must only specify what we can source (vanilla / vault incl. Beyond
Skyrim Black Marsh & Vvardenfell pools / 70-assets §52–53 candidates / new
Nexus jobs). Every co-design brief now passes the 70-assets §51 five-question
check, citing an A/V code or sourcing job per physical element (else
`ASSET-RISK` + staging fallback). The **delivering world agent has explicit
authority to amend a quest's physical specifics** when sourcing fails —
preserve the quest's function (sockets, approaches, stakes, choice), protect
canon-defining forms (stilt/reed, mud/wattle, xanmeers, grave-stakes — these
are sourcing obligations or owner escalations, never silent swaps), write the
amendment back into docs/quests/ in the same packet, and credit substituted
assets per the standing sourcing rules. Recorded in 20-world-provisions
(primary), 90 §65b and 70-assets §51.

## 4. Addendum (same day) — mod assets preferred over vanilla

Owner directive: prefer mod assets over vanilla where both are available,
because Skyrim's own assets were built for a cold Nordic province and a
different culture, while setting-specific mods were built for our use case.
Preference order now recorded in **world module 90 §71** (primary), mirrored in
quests 70-assets §51 and the substitution rule in 20-world-provisions:

1. the **Black Marsh half of Black Marsh & Valenwood** (§74.1b) and the
   **Argonian Xanmeer Tileset** (§74.2) — the house style;
2. other Argonia-appropriate mod sources (A-codes, §75–§79);
3. **vanilla** — retained as first choice for *culturally neutral* props and
   wherever skeleton/animation compatibility is the point, but no longer the
   default merely because it is closest to hand.

A vanilla asset used in an Argonian-reading role carries a one-line note
explaining why no mod source served; those notes are the backlog for a later
upgrade pass. The V-code families remain valid and still carry much of the
load — what changed is the tie-break, not the catalogue.

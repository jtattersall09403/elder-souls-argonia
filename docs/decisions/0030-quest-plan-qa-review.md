# 0030 — Quest-plan QA review: findings register (APPLIED)

**Date:** 2026-08-28 · **Status:** **CLOSED — all findings applied or
dispositioned 2026-08-28, same day. Nothing in this file is outstanding; it is
kept as the defect→fix history (0021/0025 convention). Do not treat any
finding below as a to-do.** ·
**Scope:** `docs/quests/` (all), decisions 0026–0028, cross-refs into
`docs/world/95`, `76`, `90`, `world/sources/lore/` and the compiled province
data

**How it closed:** the owner answered the batched taste round (answers folded
into the fixes); five repair agents (disjoint file ownership) plus a
reconciliation pass applied everything. Deliberate deviations from the fixes
as originally written:

- **A9 resolved by replacement, not a spike:** the Last Warden is now an
  ancient **Xal-Krona (Argonian Behemoth)** on the vanilla werewolfbeast rig
  with in-vault BM&V meshes — evidence in
  `docs/research/quests-and-cast/last-warden-boss-options.md`; the Mihail wamasu is deferred
  to an optional overworld legendary (FG03/LQ12 rows annotated).
- **D23 exceeded:** owner raised the bar — the whole Many-Root line was
  redesigned, not two quests.
- **I50:** owner chose an `essential` data-flag blacklist (unmarked topics are
  fair game), not a curated whitelist pool.
- **A8:** rootworm never-seen is a **permanent design rule** (owner), not a
  fallback awaiting upgrade.
- **A45 (D1 scarcity):** handled by the §12 authored-halo sentence; no quest
  retags.
- **I53 amended by owner:** no NPC is invincible — every NPC is player-
  killable; essential deaths show the doom-warning message (30 §23); faction
  lines simply may never *require* a protected principal's death.
- **H47/rootworm network:** the network is Pass-1 placeholder by design;
  re-authoring is now an explicit Phase 11 deliverable (world 95) and all
  root-transit quests/rewards are marked provisional until then.

Owner-requested holistic QA of the quest plan, with focus on the 2026-08-26
work (endings, allegiance reward tracks, quest cut, quest index, density).
Nine review passes: fun/Morrowind-ness, factions/cast, assets,
scripting/open-world/builds, lore, cross-doc consistency, guardrails/pipeline,
world-bones geographic fit (§H), and the tier-protection rule (§I — new owner
hard rule, stated 2026-08-28: nothing breaks the main quest; faction lines may
break each other with telegraphing; side quests break nothing above them).
**Overall verdict: structurally sound — every reviewer independently concluded
the fixes are targeted edits, not redesign.** This file is the fix worklist;
line numbers refer to the 2026-08-28 working tree.

## A. Highest priority (fix before any quest production)

1. **Off-by-one quest count.** "23 core quests" is arithmetically **24**
   (32 − 5 merged − 3 moved; both 30's table and the 55 index hold 24 rows).
   Stated in 30-main-quest:231, 00-overview:38/47, quests README:44, 0026:58.
   *Owner call: accept 24, or cut/merge one more.*
2. **MQ11/MQ12/MQ19 briefs vanished.** Their rows claim the briefs "survive
   verbatim… provisions unchanged", but the full briefs + P-codes exist only in
   git history — world agents cannot build their provisions.
   30-main-quest:251-252,259; 50-side-quests:44-48. *Restore the three full
   rows into 50-side-quests.*
3. **Shape budget is mathematically incompatible with settlement quotas.**
   16 shapes × max 2 per region = 32 primary-shape slots, but Helstrom's quota
   is 35–60 quests (55-quest-index:71-73 vs 90:50-52, 80:190). *Scale the
   budget with packet size (e.g. ≤~20% of a packet's briefs, never consecutive
   at M/L) or make it per-wave.*
4. **Traversal-fallback gaps on the mandatory Eye path** (violate acceptance
   criterion 25): MQ16's routes are all water-or-climb (30:256); MQ23's
   lead-driven route selection can force a non-swimmer onto the fully drowned
   chain (30:263); MQ13's three portals declare no dry approach (30:253).
   *Declare degraded fallbacks per row; make MQ23's route player-chosen at a
   stated cost.*
5. **`eyeCustody` underspecified.** MQ23/MQ29 require Eye use with no stated
   mechanism when custody is `reed`/`cult`; `shared` is referenced by no quest.
   *Add a custody-handoff table to §20; define or delete `shared`.* (30:209-214
   vs 263, 269.)
6. **Tier-4 lock semantics unstated.** Whether `trackLockedAtTierFour`
   constrains ending availability or only tier-5 rewards is unspecified, and
   `reed`/`independent` locks map to no single ending family. Also: lock
   *triggers* are not all player-legible commitment acts ("legitimacy evidence
   assembled", standing 65+ accrue passively — a player could lock
   unintentionally, against §24b rule 2's telegraph requirement). *Add a
   lock→ending compatibility note and make each tier-4 gate an explicit opt-in
   act.* (30:209, 437-443, 464-505.)
7. **Main-quest rows declare no S/M/L or D-tiers** — the flagship line fails
   the plan's own validators (80:212, criteria 24/32); a future implementing
   agent cannot tell D-B from D-C. *Add per-row declarations; MQ25/MQ27 prose
   "delivery rules" become explicit D-B tags.*
8. **Rootworm has no asset source at all** — yet RW01/RW02/RW04, TG06, LQ07,
   MQ27 treat it as on-screen; no candidate in §78 or the BM&V pool. *Flag
   `ASSET-RISK` (0027 §3) with a never-fully-seen staging fallback (tunnel
   mouth, displaced water, audio, animated-root flank) + a named sourcing job
   (Mihail worm/serpent releases; BM&V snakes as re-skin base).*
9. **Last Warden = single un-ingested source.** Mihail's Wamasu (Nexus SE
   158860) is real and animation-complete but sits on a custom skeleton (the
   hardest conversion class), is the shared finale of every ending (+FG03,
   LQ12), and its audio must be replaced on ingest (mod credits CDPR for
   sounds). *Schedule an early conversion spike (skeleton + one attack clip)
   well before Lost City production; note audio obligation in 70-assets.*

## B. Guardrails and pipeline (owner's over-restriction concern — confirmed)

10. **Two-tier rule voice.** The load-bearing hard rules (no new art, no
    scaling, chase/escort conversions, canon grounding, traversal fallbacks)
    are correctly absolute. But taste heuristics are written in the same voice
    and wired into the same validators: per-region S/M/L ratio gates (80:172),
    "every quest declares a reversal" (80:188 — 00-overview allows reversal OR
    memorable), cast micro-quotas (80:201, 207), "no two characters share a
    register" (60:124-125), "≥1 new shape per packet" (finite lifespan).
    *Adopt a three-word vocabulary — **hard rule / strong default / target** —
    and re-mark the taste tier; validate ratios province-wide with tolerance.*
11. **Mandatory-read chain ≈ 40–48k tokens for one village quest** (~2.5×
    sensible). Biggest lever: split 35-cast — rules/naming/tiers/texture-kit
    (~5k) stay mandatory; rosters (§55–57) become lookup-only. Mark 00-overview
    §2–3 lookup-only; add a README route for "authoring one local quest brief".
12. **Under-specified process:** no dialogue/journal/topic/reward-band format
    spec exists before Q2 writes "retained final content" (*add to Q1: format
    spec + one owner-approved exemplar quest*); the "packet change process"
    (90:35-36) is invoked but never defined (*design amendments = quest-agent
    role, recorded in brief + index + decision note; canon-form failures =
    owner escalation*); QW loop has no deadlock tie-break (*world feasibility
    and POI/perf budget win*); Q4's "8–15 local quests" predates 0027 (*label
    as Milestone-1 wave*).
13. **Validator realism:** glossary validator (80:193) references a glossary
    artifact no module defines (and must not force topics onto deliberately
    opaque wonder content — give entries an `opaque` flag returning folk
    speculation); free-text chase-vocabulary matching (80:214) will
    false-positive on aftermath quests — gate on structured fields; label the
    non-static checks (seeded twists, blind-read distinctness) as LLM-critic
    checks, not regex validators.

## C. Scripting / open-world / builds (medium)

14. MQ22's on-screen consequences (raid/arrest/endangered intermediary) have
    no SCENE/STATE provisions at the consequence sites (30:262); its
    state-debug list also uses `reedTrust`/`rootTrust` vs §20's
    `veiledReedTrust`/`unboundRootTrust`, and omits the new track variables.
15. MQ09's "flooding maintenance tunnels" implies live water-level change the
    local-state vocabulary doesn't permit — author as pre-built flooded state
    variant + survival timer, or extend the allowed swap list (30:249).
16. MQ18: 12–16 attendees turning hostile breaches the 6-active-actor ceiling
    exactly at combat start, and the only declared escape is underwater —
    add a blown-cover despawn swap (≤6 hostiles) and a second escape (30:258).
17. MQ27 guide-leads must not swim/climb (00-overview:302) — state
    teleport-past-segment or routes authored to avoid the verbs (30:267).
18. **The Act II race must be stage-triggered, never clock-triggered** — add
    one binding sentence covering Collector appearances, lens-frame loss and
    the second withdrawal (30:250, 296-299).
19. Cuts-the-Old-Knot at MQ01 needs scene protection + a named fail-forward
    successor for MQ31 (30:241, 271; §23 forbids bare essential flags).
20. Speech-build safety: guarantee ≥1 recoverable source for MQ31 speech
    evidence and Warden-weakening evidence (quarry's notes, MQ26, archivist).
21. Stronghold: author 3 phase layers + 4 allegiance overlay sets (3+4 pieces,
    12 combinations by composition); skin re-evaluates at phase checkpoints
    only (30:507-520 vs 20-prov:29).
22. LOW: MQ25 pull-through-the-door mechanic + default survivor set; MQ20
    dead-handler one-liner; tier-5 off-screen services as a fixed authored
    menu; "memorial" throne state mapped to no ending; Reed tier-3 writs need
    toll-point/restricted-door world provisions registered in 20.

## D. Factions, side quests, cast (fun layer strong; targeted fixes)

23. **Many-Root fails the dramatic-register minimum** — no combat/stealth/
    traversal set piece in a deep Milestone-1 line (40:258-269 vs acceptance
    27). *Give two quests physical centrepieces and certify like NI05/LW04.*
24. **Ahnjazzi appears in person at Archon in RS07** (40:293) against her
    defining never-leaves-Soulrest rule — replace with her letter read aloud.
25. Desk-count shortfalls vs §60.2: Night-Reed 2 desks (deep line needs 3–5);
    UW and RW 2 desks with no declared canon exception (35-cast:487-495,
    685-702).
26. **SA08 is the one unconverted chase left** ("canal pursuit path",
    40:213) — convert to breach-points/static-lair intercept, tag D-B.
27. Marsh Charter's mandatory pick-a-desk anchors to FG05 which is W2 —
    re-anchor to an M1 quest or pull FG05 forward (35-cast:523).
28. Canon check: Alisanne Dupre was Listener at **Bravil** (Rasha led
    Cheydinhal) — correct the epithet before it propagates (40:110).
29. Index housekeeping: Salt-Teeth ST01–ST05 missing from 55 index; Thorn
    breaches the shape budget (3× primary RECKONING + a RECKONING-dominant
    line); LQ25/LQ03 same-reversal collision; DQ06 mistagged HAUNTING; TG07
    reversal described two incompatible ways (40:155 vs 35-cast:502); UW04
    cross-ref garbled; coverage-gap list wrong on PREDATOR and Murkmire;
    Status legend with no Status column.

## E. Lore (no HIGH findings — grounding is strong)

30. **Opening image mislabelled canon.** "Withdrawal → clutch dies that
    night" is CANON_DERIVED, not explicit (canon ties egg death to the
    *egg-connection* severed via Mnemic Egg; post-Duskfall silence caused no
    die-off). Reword MQ01's parenthetical + 60:66-68; make the cult's harvest
    interference the explicit cause; add the silence-vs-severance note to
    hist-and-sap.md. (30:241.)
31. **Umbriel flight path unsourced** — prisons.md:57-60 load-bears MQ09's
    undead with no tier tag; the L15 Umbriel dossier is an admitted backlog
    item. Write it (and fetch L33 *Varieties of Faith*, cited by four rows but
    never ingested — 99:44).
32. Hedge-slippage: §16 "canonically empty" drops canon's "if it existed at
    all"; §24.2 "Shadowscale writ law still points" is vestigial by 4E 201 —
    ground in the canon oath "By the Throne of Aphicles" instead; Hall of the
    Scalded Throne is project invention — mark at first mention; split the
    Valerie Marie credit (king's-jewel half is canon); cite spore-call to its
    actual dossier.

## F. Assets (beyond A8/A9 — catalogue hygiene)

33. Ripper eels: BM&V's `morayeel.nif` (slaughterfish skeleton) is already in
    the vault — add to 70-assets and cite in TG10.
34. Mnemic Egg prop: no §54 row — re-materialled chaurus egg pod / spriggan
    sac with emissive sap; pure material work.
35. CLAIM regalia: no code; name A03 re-materialled as royal regalia + A19
    finery, or open a sourcing job (nothing jarl-Nordic).
36. Tribal armour cited against A04 (weapons-only) — cite V05 chitin/bonemold
    re-materials as base, wamasu-hide as texture variant.
37. MQ16/MQ26 guardians unnamed — A08 crocodile / BM&V dreugh (dreugh fits
    the submerged observatory). UW04 bone country → scaled vanilla
    dragon/mammoth skeletons. A15 is an LE-only mod — note BM&V as primary.

## G. Naming/reference hygiene (one small pass)

38. `FAST boat.stormhold_helstrom` contradicts its own AC–Helstrom route
    description — rename before world registration (30:245).
39. `shadowscale.safehouse_mainquest` vs `shadowscales.safehouse_ruin` —
    one namespace form (30:263 vs 40:122).
40. Stale merged-ID references: "MQ27–28" twice (30:189, 267), "MQ29–MQ32"
    span (90:146).
41. Never-Writes-Twice "(runs MQ03→MQ31)" reads as handler-from-MQ03 —
    reword "in the Reed office from MQ03; acting handler MQ20→MQ31" (30:182,
    35-cast:268).
42. Stronghold reservation exists only on the quest side — name it in world
    95 Phase 11 deliverables.
43. Cult tier-3 "gold faucet" (daril trade) is unbounded — bound it (finite
    stocked fences / caps), consistent with fixed-economy discipline (30:462).

## H. World-bones fit (second pass, owner criterion 2026-08-28)

Rule applied: quests must fit the geography being built; prefer changing the
quest over the world. ~46 demands checked against world modules **and**
compiled data (hydrology/society/water/routes/root-transit meta): 28
supported, 13 plausible, 4 MEDIUM conflicts, 5 LOW advisories, **no HIGH** —
no phantom islands/coasts, and the ~20 underwater-demand quests are genuinely
supported (40% wet surface, 33.6% coast, depths to 25.5 m, underwater POIs a
binding acceptance criterion).

44. **LQ15 sits on a road that doesn't exist** — owner decision 2026-08-22:
    no direct Gideon–Helstrom edge (settlement-anchors.json:214; routes.json
    confirms). *Re-site to the Gideon→Crossroads trunk leg or the Crossroads
    junction itself.* (50:68, 55:152.)
45. **D1-tagged exteriors vs a near-empty band-1 field** — danger band 1 is
    0.6% of land, but RS01/FG01/LQ02/LQ03/MQ03 tag whole exteriors D1 under
    20-prov:150-155's direct mapping. *Retag D1–D2, or add one sentence to
    §12: D1 sites anchor to settlement aprons/guarded corridors and Phase 11
    may author local band-1 halos (same mechanism as D0).*
46. **Bramman's river (Soulrest→Blackrose) absent from the boat graph** —
    promised to Reed-Sail/Salt-Teeth (20-prov:180) but no such water lane in
    society-meta/waterways. *Amend the row: hidden navigable channel,
    deliberately NOT a scheduled lane; navigability verified at watershed
    refinement (0012 mechanism).*
47. **Gideon rootworm terminus not in the built root network** (four stations:
    helstrom, north-shadowfen, naga-deeps, east-estuary). *Declare Gideon a
    seasonal wintertide migration stop, never a standing station; no quest may
    require year-round Gideon root transit.* (20-prov:188.)
48. LOW: tribal tier-4 "fast-travel nodes nobody else has" contradicts the
    semi-public Helstrom station (LQ07 fare + waiting hall) — reword to
    "restricted Waykeeper network beyond the Helstrom hub" (30:490); TG06
    should name its station pair (helstrom ↔ east-estuary) or it implies
    D4/D5 traversal for guild-tier players (40:154); Murkwood "the forest
    that ever moves" → one fixed hidden site, movement off-screen between
    visits (20-prov:181 vs :258-267); MQ14/LQ17 plausibly the same Archon
    lighthouse — declare reuse-with-state or a second minor light (30:254,
    50:70); TG10 must not lean on visible tidal range (built amplitude 0.5 m).

Clean: AC–Helstrom guarded waterway is real in the data (0.92–0.94 water
fraction, 0012 portage mechanism); Helstrom D0-inside-D5 is engineered
as designed; Thorn and Murkmire are in-province with canon terrain; MQ23's
two chains both have terrain classes to live in; no quest requires canal
locks; all named canon provisions have settlement-register placements.

## I. Tier protection (owner hard rule 2026-08-28)

Rule: tier 0 (main quest) may not be broken by anything; tier 1 (faction
lines) may break each other with the §29 telegraph; tier 2 (side/local) may
not break tiers above, especially invisibly. Found: the rule is currently
upheld only by scattered ad-hoc prose, and the authoring system (55 novelty
rule, 90 §65b brief spec, 80 §63 validators) never asks what a quest touches
or in which tier direction it writes.

49. **Blackrose archive wing double-claimed with destructive outcomes** —
    BC02 works the same wing MQ09 mines; BC06 endings can disperse the heirs
    and burn the ledger class. *Declare the wing + confiscation-ledger record
    tier-0-protected; every BC end-state preserves them; author the BC-first
    acknowledgement + degraded-route mapping in MQ09's row.* (30:249 vs
    40:377-381.)
50. **DQ02 can delete tier-0 knowledge** — its memory-removal mechanic
    (journal entry + topic access genuinely removed) could take MQ31 speech
    evidence or a triangulation lead. *Draw from a curated pool of
    non-load-bearing topics only; validator: no quest removes/consumes a
    topic or evidence id owned by a higher tier.* (50:105.)
51. **Nobody owns the branch-state variables** — nothing states who may write
    §20's variables; threshold-gated `rootTalkStanding` invites village/
    Many-Root content to push a player past `trackLockedAtTierFour` with no
    main-quest act. *Ownership rule: §20 variables are written by tier-0
    stages only; other content keeps its own reputation, which tier 0 may
    read; tier-4 locks require an explicit opt-in act (ties to A6).* SA10/
    UW05/TG11's province-shaking publications need declared non-effects on
    `publicKnowledge`/`coverIntegrity`.
52. **No tier check in the authoring system** — today a brief that kills a
    main-quest principal or grants `unboundRootTrust` passes every stated
    check. *Adopt the §30b encoding: canonical tier rule in 40-factions §30b;
    a `touches` declaration (shared NPCs/LOCs/STATEs/items/variables,
    read-or-write) in the 90 §65b brief spec; a write-direction validator in
    80 §63; protected flags on the C1 roster (35 §55) and main-quest LOC/
    STATE ids (20); one added step in 55 §47c's checklist.* Proposed text is
    in the tier-review report; ≤10 lines.
53. **C1 principals doubling as faction desks are killable by tier-1 rules**
    — Ei-Tuja (Nisswo desk), Kaska-Meen (Many-Root desk) vs §53.5's "every
    line has a desk that can die, leave or turn". *A C1 serving as a desk is
    kill/exile-protected inside that line (its mortal desk must be someone
    else); faction finales may change a shared principal's office, never
    their existence, each change mapping to a declared main-quest state.*
54. **80:203 contradicts the cast design** — "no character appears in another
    line's quest table" is violated by the deliberate C1 cross-links. *Scope
    the check to C2; the C1 protected registry becomes the exception list.*
55. **MQ27 expedition options vs faction end-states** — RS10/MR10/RW05 can
    gut groups whose contributions MQ27/MQ05 lean on, with no declared
    behaviour. *One availability condition per option; guarantee ≥2 options
    plus the independent route in all world-states; the Helstrom rootworm
    terminus survives every RW end-state.* (30:267, 40:83/296/269/417.)
56. LOW: generalise the two existing ad-hoc protections (Walks-Against-
    Current, MQ23's no-faction-dependency) into the registry; SS08's Reed
    desk gets zero-coupling to `veiledReedTrust`; BC06's Owing reform scoped
    as Gideon-charter local so it doesn't collide with the Reed tier-4
    mechanic; §23 gains one sentence extending fail-forwards to deaths caused
    by other lines.

Clean: tier-1-vs-tier-1 mutual exclusion is already telegraphed and
validator-backed (§29, §24b rule 2, 80:174/180); the Eye is runtime-protected;
the consequence budget structurally prevents province-scale faction damage.

## What was checked and found clean

Ending architecture (three families + variants, earned over Act-I-seeded
opponents) internally consistent and canon-honest at §18d/§24.2; reward-track
research genuinely supports the four ladders and every gate points at a live
quest that supports it; boat-vs-boat fully purged (TA02/RS02/LW04/MQ10 all
converted); density numbers agree across 00/90/README/0027/world 95/76 from
both directions; all cited A/V codes exist; 12 spot-checked L-codes resolve;
the Owing is correctly layered as flagged extrapolation; the fan-favourite
coverage table maps to real quests; Act II verb-variety rule holds; delivery
conversions applied everywhere except SA08.

## Owner answers (batched taste round, 2026-08-28 — all applied)

1. Quest count: **24 accepted**; number corrected everywhere (0026 addendum).
2. Many-Root: **whole line must be interesting, not just two quests** — full
   redesign shipped in 40-factions §36.
3. Guardrail vocabulary: **accepted**, plus an explicit rider that agents must
   use their own reasoning (docs/quests/README.md standing rules); 35-cast
   split into rules (35) + lookup roster (36).
4. Swimming: **universal core traversal** — consumables (potions/scrolls/
   items) cover any build; dry alternates required only for boats/climbing
   (criterion 25 rewritten).
5. Locks: **accepted** — explicit opt-in acts; gate rewards/backers only,
   never sanctuary endings.
6. Shared principals: **keep cross-links**; all NPCs killable with the doom
   message; faction lines never require those deaths.
7. DQ02: **keep mechanic**, `essential`-flag blacklist.
8. Rootworm: **never seen, permanently**. Boss: **switched to the Xal-Krona**
   (see deviations above).

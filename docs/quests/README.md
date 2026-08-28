# Quest & narrative master plan (modular)

The strategy for _The Eye and the Root_ main quest, factions, side content,
writing and narrative runtime. **Production quest implementation begins only
after the world-generation exit gate** ([20-world-provisions.md](20-world-provisions.md) §15);
until then this plan's job is to tell the world build what to provide.

## Who reads what

| You are… | Read |
|---|---|
| **Any world-generation agent** (terrain, settlements, POIs, dungeons, routes, danger, ecology) | [20-world-provisions.md](20-world-provisions.md) — handoff contract, provision tags, danger tiers (incl. the D↔danger-band mapping), location packet, consequence budget, exit gate. Then the quest tables for whatever region/city you're building: [30-main-quest.md](30-main-quest.md), [40-factions.md](40-factions.md), [50-side-quests.md](50-side-quests.md) each carry per-quest **World-generation provision** columns — those are requirements. |
| Anyone needing the story/design picture | [00-overview.md](00-overview.md) — summary, content targets, frozen decisions, design rules (cost tiers, dramatic register, wonder budget, **cast rules, delivery tiers, the boredom test**), acceptance criteria. |
| **Authoring any new quest** | [55-quest-index.md](55-quest-index.md) — **mandatory before writing a brief**: one line per existing quest, the shape taxonomy, the novelty/collision rule, per-region shape budgets, and the current coverage gaps. Update it in the same change. |
| **Writing any named NPC** — main quest, faction, local, texture | [35-cast.md](35-cast.md) — **the rules, mandatory before naming anybody** (~5k tokens): depth tiers, the six character rules (Morrowind desk model, UESP-mined), the canon naming system, the texture kit, validation. Then [36-cast-roster.md](36-cast-roster.md) — **lookup-only**: the principal cast, per-faction desks, shared places, oddities — consult only the lines/places your brief touches. |
| **Authoring one local/texture quest brief** | The minimal chain: [55-quest-index.md](55-quest-index.md) in full; [00-overview.md](00-overview.md) §1 + §4; [35-cast.md](35-cast.md) rules; [70-assets.md](70-assets.md) §51; [20-world-provisions.md](20-world-provisions.md) §11–12 tags. |
| Political/cultural framing for places or NPCs | [10-political-frame.md](10-political-frame.md) (+ the lore dossiers, per the CLAUDE.md lore rule). |
| Writing, dialogue, lore-confidence layers | [60-writing-and-lore.md](60-writing-and-lore.md). |
| Asset planning/ingestion | [70-assets.md](70-assets.md) (A/V codes cited by every quest). |
| Narrative runtime design (post-gate) | [80-technical-architecture.md](80-technical-architecture.md), [90-production-sequence.md](90-production-sequence.md). |
| Source/credit lookups (L/C codes) | [99-sources-credits.md](99-sources-credits.md). |

## Standing rules

- **Rule strengths.** Every rule in these docs carries one of three strengths
  (marked where it matters; unmarked imperatives are strong defaults):
  - **Hard rule** — protects a real constraint (engine, assets, canon, tier
    protection). Never depart. The hard rules are: no new art; no level
    scaling; the delivery-tier conversions (no free-roaming chase/escort/
    simulated crowd); canon grounding; the traversal-fallback rule; race
    completability; and tier protection (canonical text: 40-factions §30b).
  - **Strong default** — depart only with a recorded one-line reason.
  - **Target** — an aim: report against it, don't block on it.

  To future agents, from the owner: these documents are guidance written by
  predecessors, not gospel — you are expected to apply your own reasoning.
  When your judgement and a strong default or target disagree, follow your
  judgement and record why in one line. Only hard rules are non-negotiable.
- Quest tables cite lore as L-codes and assets as A/V-codes — resolve them in
  [99-sources-credits.md](99-sources-credits.md) and [70-assets.md](70-assets.md).
- The world build honours per-quest provisions; the narrative build never
  demands dynamic geography (consequence budget in 20).
- This plan was reviewed and integrated with the world plan on 2026-08-23
  (decision 0009): danger tiers mapped to the built danger field, the old
  standalone danger-map image superseded by the generated danger layer, and
  the rootworm opening route registered in world data.
- A cast, lore, deliverability and fun review landed on 2026-08-25
  (decision [0018](../decisions/0018-cast-lore-deliverability-review.md)):
  added [35-cast.md](35-cast.md); introduced the Owing
  (`world/sources/lore/topics/labour-and-bondage.md`); grounded the cult's method
  on the canon Mnemic Egg; re-anchored the Marsh Charter and Sunken Archive on
  canon; and converted every chase, escort and crowd beat in the plan into a
  cheap pattern.
- The main quest was sharpened on 2026-08-26 (decision
  [0026](../decisions/0026-main-quest-sharpened.md)): visceral newcomer-legible
  stakes and the 60 §45d no-lore-assumed rule; the villain seen in the opening
  hour and heard in recurring dreams; the handler purged mid-game; **three
  player-intent ending families** (CUT / CLAIM / MEND) replacing the old five;
  the core line cut to 24 quests (count corrected 2026-08-28, decision 0030);
  boat pursuits replaced by manhunts; and the
  **quest–world co-design loop** (90 §65b) binding region packets to
  local-quest briefs before placement freeze.
- Content density is pinned to Morrowind's (decision
  [0027](../decisions/0027-morrowind-density-targets.md), evidence in
  `docs/research/morrowind-content-density.md`): 18–22 named POIs/km² in
  settled regions, ≤300 m route spacing, quests-per-settlement by magnitude
  class, mature quest target raised to ≈450–550, all settlement structures
  enterable — and the co-design loop is a **phase completion gate**, runnable
  by one agent wearing both hats.
- Each side of the main quest now pays (decision
  [0028](../decisions/0028-allegiance-reward-tracks.md), research in
  `docs/research/tes-quest-and-faction-rewards.md`): four **allegiance reward
  tracks** of five tiers each (30 §24b) — cult power with corprus-style
  trade-offs, Reed access and informants, the tribes' welcome and safe routes,
  and the Eye-and-crown; stack tiers 1–3, lock 4–5; one phased stronghold
  re-skinned by allegiance. And [55-quest-index.md](55-quest-index.md) is
  **mandatory reading before authoring any quest** — shape taxonomy, novelty
  rule, coverage gaps.

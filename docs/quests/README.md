# Quest & narrative master plan (modular)

The strategy for _The Eye and the Root_ main quest, factions, side content,
writing and narrative runtime. **Production quest implementation begins only
after the world-generation exit gate** ([20-world-provisions.md](20-world-provisions.md) §15);
until then this plan's job is to tell the world build what to provide.

## Who reads what

| You are… | Read |
|---|---|
| **Any world-generation agent** (terrain, settlements, POIs, dungeons, routes, danger, ecology) | [20-world-provisions.md](20-world-provisions.md) — handoff contract, provision tags, danger tiers (incl. the D↔danger-band mapping), location packet, consequence budget, exit gate. Then the quest tables for whatever region/city you're building: [30-main-quest.md](30-main-quest.md), [40-factions.md](40-factions.md), [50-side-quests.md](50-side-quests.md) each carry per-quest **World-generation provision** columns — those are requirements. |
| Anyone needing the story/design picture | [00-overview.md](00-overview.md) — summary, content targets, frozen decisions, design rules (cost tiers, dramatic register, wonder budget), acceptance criteria. |
| Political/cultural framing for places or NPCs | [10-political-frame.md](10-political-frame.md) (+ the lore dossiers, per the CLAUDE.md lore rule). |
| Writing, dialogue, lore-confidence layers | [60-writing-and-lore.md](60-writing-and-lore.md). |
| Asset planning/ingestion | [70-assets.md](70-assets.md) (A/V codes cited by every quest). |
| Narrative runtime design (post-gate) | [80-technical-architecture.md](80-technical-architecture.md), [90-production-sequence.md](90-production-sequence.md). |
| Source/credit lookups (L/C codes) | [99-sources-credits.md](99-sources-credits.md). |

## Standing rules

- Quest tables cite lore as L-codes and assets as A/V-codes — resolve them in
  [99-sources-credits.md](99-sources-credits.md) and [70-assets.md](70-assets.md).
- The world build honours per-quest provisions; the narrative build never
  demands dynamic geography (consequence budget in 20).
- This plan was reviewed and integrated with the world plan on 2026-08-23
  (decision 0009): danger tiers mapped to the built danger field, the old
  standalone danger-map image superseded by the generated danger layer, and
  the rootworm opening route registered in world data.

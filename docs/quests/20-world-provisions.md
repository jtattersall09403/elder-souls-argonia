# World-generation handoff contract

> Module of the quest/narrative master plan (see [README](README.md)).
> **This is the file world-generation agents read**: it defines what the
> world build must provide for quests, per phase.

## How world-generation agents must use this document

A world-generation agent should **not** implement production quests, dialogue graphs or faction runtimes during the current world build. It should read the relevant quest rows and ensure that the final world contains the locations, routes, interiors, sockets, state variants and assets those quests will need.

Every quest below has an explicit **World-generation provision**. Those provisions are requirements for Phases P2–P15 of the existing world-generation plan.

During world generation, preserve:

- stable semantic IDs for every required city district, settlement, interior, dungeon, water body, route and portal;
- causal location records explaining why each place exists;
- danger tier and traversal capability assumptions;
- alternate approaches for stealth, water, climbing, boats, combat or social access where specified;
- named-NPC home/work/scene sockets without finalising the NPC dialogue;
- evidence, document, container, corpse and fixed-loot sockets;
- finite local state variants, normally no more than two or three;
- combat, boss, camera and paired-animation clearance;
- underwater volume, air-pocket and submerged-portal data;
- streaming dependencies and performance budgets;
- source, lore and asset references.

Do not create speculative cross-system TypeScript contracts solely because this document mentions a future feature. The repository’s existing rule remains: a shared contract lands when a second real consumer exists.


---
## 10. Existing world-generation phases

| Code | Existing phase | Quest-relevant responsibility |
|---|---|---|
| P2 | Province source ingest | Canonical/community anchors, stable region/city IDs, coordinate placement. |
| P3 | Hydrology and region graph | Water bodies, depth/current classes, wetland topology and route constraints. |
| P4 | Danger, cultures and transport | D0–D5 danger, cultural/demographic fields and macro road/boat/rootworm graph. |
| P5 | World Studio foundation | Spawn links, overlays and later quest-debug integration points. |
| P6 | Reference terrain | Final local terrain, banks, channels, collision, LOD and vista composition. |
| P7 | Physical character integration | Combat, inventory, interaction, camera and capability assumptions. |
| P8 | Water renderer/interaction | Swimming depth, buoyancy, underwater visibility and water-contact effects. |
| P9 | Swimming, climbing and boats | Aquatic/climb routes, docks, moving craft, passengers and root transit. |
| P10 | Asset catalogue and kits | Semantic asset records, collision/material metadata and kit compilers. |
| P11 | Causal locations and settlements | Districts, buildings, routes, scene sockets and location backstories. |
| P12 | Dungeons and interiors | Interior graphs, portals, alternate entrances, traps and streamed cells. |
| P13 | Ecology, encounters and fixed loot | Fixed NPC/creature populations, combat sockets, evidence and item provenance. |
| P14 | Streaming and deployment | Chunk dependencies, local state variants, performance budgets and asset packaging. |
| P15 | Expansion by watershed/region | Final regional authoring and owner acceptance of quest-ready world packets. |

## 11. World-provision tags

| Tag | Meaning |
|---|---|
| LOC | Stable location/district/interior IDs and causal record. |
| APP | At least two meaningful approaches or solution routes. |
| FAST | Fast-travel, rootworm, ferry or scheduled-boat node. |
| WATER | Swimmable/wadeable/underwater volume with authoritative depth/current. |
| CLIMB | Climbable surfaces, ledges or rooftop route. |
| BOAT | Dock, navigable corridor, boarding/disembarkation or moving craft. |
| STEALTH | Occlusion, patrol routes, hiding places, trespass zones and non-combat path. |
| SCENE | Small staged-scene anchor, actor marks and camera-safe composition. |
| STATE | Finite local state variants; normally no more than two or three. |
| EVIDENCE | Document, corpse, object, footprint or dialogue-evidence sockets. |
| COMBAT | Validated encounter space and retreat/camera clearance. |
| BOSS | Boss arena, traversal lock and recovery/exit path. |
| NPC | Named-NPC home/work/schedule sockets and successor/fail-forward support. |
| LOOT | Fixed, causally grounded reward/container/item placement. |
| PORTAL | Exterior/interior or submerged portal with stable identity. |
| PERF | Explicit streaming, actor-count, draw-call or water-performance budget. |

### Traversal-feature fallback rule

Nearly every quest in this plan leans on swimming, diving, boats or climbing — the engine features with the highest remaining delivery risk in a Three.js build. Therefore: **any quest whose only listed approaches require WATER, BOAT or CLIMB must also define a degraded fallback approach** (walk, social, combat or fastTransit) in its provision packet. The fallback may be slower, more dangerous or less rewarding, but it must exist, so that quest production never blocks on traversal-feature maturity and a regression in one traversal system never soft-locks a questline. Validators enforce this (Section 63).

## 12. Danger tiers

| Tier | Meaning | Quest-placement rule |
|---|---|---|
| D0 | Safe city/interior | Helstrom streets, civic buildings, faction headquarters; ordinary crime can occur but no ambient lethal ecology. |
| D1 | Managed marsh | Inhabited channels, causeways, work camps and guarded waters used in opening hours. |
| D2 | Outer wild | Predators, bandits and environmental hazards that a new but prepared character can survive. |
| D3 | Dangerous regional wilderness | Substantial combat/traversal capability expected; main quest enters during middle acts. |
| D4 | Severe approach country | Specialist equipment, route knowledge, allies or strong character capability expected. |
| D5 | Deep core | Fixed endgame danger around Helstrom basin and Lost City; accessible early but not made safe by scaling. |

### Mapping to the built danger field (review addition, 2026-08-23)

The world compile produces a **danger band field 1–5** (owner-approved;
`worldgen/society.py`, decision 0007). The quest tiers map as:

| Quest tier | World data |
|---|---|
| D1–D5 | danger bands 1–5 of the compiled field, directly |
| **D0** | **not a field band** — an authored *location property* of settlement interiors and safe buildings, applied during Phase 11 city/settlement authoring (a "safe interior" flag over the local area) |

Special case (canon + quest requirement): **Helstrom's interior is D0 while the
field around it stays band 5** — the danger model deliberately gives Helstrom
no safe halo; its walls/gates are the boundary, realised in city authoring.
Other major cities get their D0 interiors from the same authoring pass; their
surrounding field already reads bands 1–2.

## 12b. Canon-supplied locations and systems the plan claims

These are canon places and mechanisms the quest lines above depend on. None
requires invention — their character is already written — so the world build
should place them as named provisions rather than rediscover them. (Lore:
extrapolation/settlement-register.md; topics/hist-placement.md;
topics/ecology-encounters-loot.md; topics/guilds-and-orders.md;
extrapolation/quest-plan-deltas.md D8/D16.)

| Place / system | Canon character | Serves |
|---|---|---|
| **Hissmir** (S Shadowfen) | Pilgrimage xanmeer; Trials of the Burnished Scales; **Root Stewards who cannot refuse a comer**; Fish Boon Feast | League of Open Water (LW01), Many-Root Conclave |
| **Glenbridge** (SE Blackwood) | Village around a ruined Sithis xanmeer whose Nisswo read its decay as the god's sermon; the voriplasm-sorcerer Rectavius sealed beneath | Nisswo of the Turning Path |
| **Teeth of Sithis** (Murkmire) | Largest Sithis temple; still tended by the Clutch of Nisswo | Nisswo (NI05) |
| **Deepmire, "the Refuge"** | Cursed plateau even locals avoid; the tribes' shelter of last resort; xanmeers and swamp-leviathan bones; site of the province's **Umbriel memorial** | Umbriel Witness Society; a D4/D5 space that is not the Lost City |
| **Stonewastes** (Blackwood) | Hist in the town centre, a xanmeer keep, and the **Four Winds** hereditary defenders | Marsh Charter — a canon-native martial tradition |
| **Alten Meerhleel** (Murkmire) | Port built to trade with outsiders; tribes placated with a **Teeba-Enoo court** | League of Open Water, Reed-Sail |
| **Bramman's river** (Soulrest→Blackrose) | Concealed navigable mangrove channel a fleet once sailed | Reed-Sail Compact / Salt-Teeth |
| **Murkwood** | The forest that ever moves; located only by the **Conclave of Baal at Stormhold** reading the Elder Scrolls with an ancient tablet | Sunken Archive, artifact quests |
| **White Rose Prison** (W burn country) | Abandoned, structurally sound, full of Argonian dead whose bones must be brought to the dirt | Blackrose Chainbreakers (BC05) |
| **The Archon Shadowscale facility** | Closed 4E 187; standing, sealed; the Cheydinhal Listener wanted it back | The Empty Cradle (SS01) |
| **The great Root Talk at Helstrom**, month of Hist-Tsoko | Owner decision Q2; extends the canon Root Talk into an occasional convocation — an occasion, not a council | Main quest, Many-Root Conclave, Nisswo |
| **Grave-stakes (xul-vaat)** province-wide interactable | Each carries the dead one's whole life story; pulling one raises a **bog blight** | Every line — the province's signature diegetic system |
| **Wamasu electrify the water around them** | Canon: the beast "curs[ed] all the water to deadly convulsions" | Encounter design; swimming systems |
| **Miregaunts return when killed, loot with provenance** | "Part of the land"; the midsection cavity may hold a relic "taken in to protect or imprison it" | Fixed-danger guardians, Phase 13 |
| **Wintertide rootworm migration south to Gideon** | Canon-named; red clay marks the stop | Rootworm Waykeepers; seasonal fast travel |
| **Fort Swampmoth**, held but not by the Empire | Canon fort, never located; placed on the Blackwood Road | Border content, Marsh Charter |
| **Cyrodilic Collections, refounded at Gideon** | Its museum was never built | A foreign presence Argonians can argue with rather than fight |

## 13. Quest-ready location packet

Before narrative implementation begins, every substantial quest location should expose a compact machine-readable packet equivalent to:

```ts
interface QuestWorldProvision {
  locationId: string;
  regionId: string;
  dangerTier: "D0" | "D1" | "D2" | "D3" | "D4" | "D5";

  exteriorAreaIds: string[];
  interiorCellIds: string[];
  portalIds: string[];
  waterBodyIds: string[];
  routeIds: string[];

  approaches: Array<{
    id: string;
    modes: Array<
      "walk" | "swim" | "dive" | "climb" | "boat" |
      "stealth" | "social" | "combat" | "fastTransit"
    >;
    capabilityProfile?: string;
  }>;

  sceneSockets: string[];
  npcHomeWorkSockets: string[];
  evidenceSockets: string[];
  containerSockets: string[];
  encounterSockets: string[];
  bossSocket?: string;

  localStateVariants: Array<{
    id: string;
    changedRefs: string[];
  }>;

  requiredAssetIds: string[];
  streamingDependencies: string[];
  performanceBudgetId: string;

  causalLocationRecordId: string;
  loreSourceRefs: string[];
}
```

The actual shared TypeScript contract should be introduced only when world runtime and narrative tooling both consume it.

## 14. Static-world consequence budget

The main quest and factions may alter:

- actor presence, schedule and disposition;
- guard/patrol faction;
- services and fast-travel availability;
- doors, barricades and access permissions;
- banners, clutter, evidence and notices;
- local light/audio/particle presentation;
- occupants of a dungeon or headquarters;
- a small number of damaged/cleaned/abandoned variants;
- letters, rumours, memorials and ending scenes.

They should not require:

- changed river courses;
- simulated province-wide floods;
- dynamic settlement construction;
- strategic army simulation;
- hundreds of simultaneous actors;
- procedurally relocating cities;
- completely different dungeon geometry per branch.

## 15. World-generation exit gate for narrative production

Production quest coding should begin when:

- province coordinates, major cities and region IDs are stable;
- D0–D5 danger geography is accepted;
- macro road, boat and rootworm transport exists;
- Helstrom and at least one representative outer city are final-world playable;
- character, inventory, combat, interaction, swimming and climbing are integrated;
- water queries and underwater portals work;
- the asset catalogue and core kits are sufficiently populated;
- one production Xanmeer dungeon compiles and streams;
- causal location records and quest sockets are available;
- World Studio can spawn at any final-world location and report IDs/state.

---

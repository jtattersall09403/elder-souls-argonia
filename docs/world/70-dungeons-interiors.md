# Part VII — Dungeons, interiors and encounters (§47–50)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.

> **Before authoring any interior or kit assembler (the 16k slice that takes carried 16i items 4–5 for tier A building interiors, Phase 12 for every assembled interior), read the
> measured evidence, not just this plan:**
> [research/placement-settlements/mined-interior-assembly-and-settlement-form.md](../research/placement-settlements/mined-interior-assembly-and-settlement-form.md)
> — per-kit snap module (128 units ≈ 1.82 m, but *statistical*: town kits lift
> 14–23×, cave shells 0.9× i.e. not snapped at all), yaw quantised to 90°,
> chamber sizes (p50 ≈ 20 × 14 m), clutter density (lived interiors carry
> 10–20× a dungeon's), and settlement form (buildings ~15 m apart everywhere;
> Black Marsh settlements sit 3.9 m from water and 79 m from a road, Skyrim's
> the other way round). Tables:
> [`world/sources/placement/`](../../world/sources/placement/README.md)
> (`bmv-interior-assembly.json`, `*-settlement-form.json`). It also records
> what could **not** be mined — no facade-facing signal, no ceiling clearance,
> and **no shipped Argonian interior anywhere**, so the Xanmeer kit's grammar
> has to be derived rather than copied.

## 47. Argonia dungeon families

| Family | Spatial grammar | Common water/traversal features |
|---|---|---|
| Xanmeer complex | monumental axes, geometric plazas, ritual rooms, hydraulic lower levels, collapse layers | flooded lower strata, drains, vertical chambers, hidden water entrance |
| Root cavern | organic branching, shafts, tight roots opening into large chambers | submerged roots, climb routes, air pockets, rootworm links |
| Flooded natural cave | hydrology-shaped passages, sumps, sediment chambers | swim loops, siphons, changing water levels |
| Smuggler or pirate den | dock, storage, lookout, escape route, defended choke | concealed channel, boat escape, underwater cache |
| Kothringi/Lilmothiit site | historical settlement or ritual layer altered by plague and swamp | submerged streets, old wells, scavenged structures |
| Barsaebic Ayleid/Nedic ruin | foreign geometric architecture adapted by later occupants | water intrusion, collapsed drains, reused chambers |
| Imperial fort/prison/estate | rectilinear planned construction with subsidence | flooded cells, broken drainage, canal access |
| Abandoned plantation | surface parcels, labour spaces, stores, manor and cellars | irrigation channels, flooded cellar, escape tunnel |
| Hist sanctum | root-centred sacred geometry and restricted approach | ritual pools, root climbs, dream spaces |
| Sinkhole ruin | surface collapse exposing buried structure | underwater shaft, vertical return loop |

Each family has major and minor variants. Major sites use agent-authored graphs and reveal sequences.

**Entrances are decoupled from geology (owner ruling, 2026-09-02).** Every
entrance teleports to an interior cell (the Morrowind/Skyrim model), so the
province's lack of rock — the Phase 11 terrain scour found almost no natural
caves — constrains only what the *surface entrance* looks like, never the
dungeon behind it. Underground interiors are fully canon in this ground
(ESO Murkmire's delves are mud burrows, root caverns and xanmeer
under-vaults; the Barsaebic Ayleid layer is subterranean). Derive entrance
types as their own small vocabulary and vary them deliberately: trapdoors
and cellar doors, hollow trunks and root-mouths, underwater entries in
river banks and pools, sinkhole lips, mud burrows, xanmeer stair-throats,
well shafts, grave-cut entries — each type carrying its own discovery cue
and traversal demand (a dive entry gates on breath, a hollow trunk on
finding it). The catalogue's entrance choice is siting data; the interior
family is chosen independently of it.

**Owner clarification (touchpoint ①, 2026-09-03): this ruling is
province-wide, not a marsh special case.** In *every* region, a dungeon's
interior is a teleport-to cell behind its entrance (the Morrowind/Skyrim
model). Dungeons can and often should have *exteriors* too — a ruin above
the vault, a fort above the cells — where lore suits. The entrance/exterior
vocabulary must be derived per region so it fits that region's ground and
culture (a Dunmer plantation's cellar door, an Imperial fort's sally gate,
a coastal wreck's hull breach — not just marsh trapdoors and root-mouths).

## 48. Interiors are promised with the places; the promise vocabulary (16g, decision 0062)

A dungeon-kind place (`interior.kind` delve, dungeon, warren or complex;
327 records) is sited, named and given its purpose with every other place.
What must be *inside* it is a set of typed **promises** on the record's
`interior` block, fixed here so the 16k slices and Phase 15 author more in the same
words and Phase 12 builds every interior against them. The binding schema
is `worldgen/catalogue.py` (`interior`, schemaVersion 3); this section is
the design statement and the two never disagree. The earlier
`InteriorProgram` sketch is retired into it: `circulationGraph`,
`lootLogic`, `encounterLogic` and `kitConstraints` are Phase 12's chamber
graph, 13's loot and encounter compilers and the recipe table, not record
fields.

**The block.** Beside the shipped fields (`kind`, `family`, `sizeBand`,
`wetFraction`, `entranceCount`, `exteriorShell`, `programRef`):

- `verticalRelationship` — below | behind | within | above-and-below |
  across-water. On every record with an interior, buildings included.
- `roomFunctions[]` — the ordered reveal, from the closed list `entrance`,
  `antechamber`, `gauntlet`, `gallery`, `cache`, `boss`, `captive`, `shrine`,
  `workshop`, `barracks`, `flooded-gallery`, `nursery`, `archive`,
  `hearth`, `cistern`, `sump`, `stair-shaft`, `root-throat`, `drain`,
  `cell-block`, `counting-room`, `dock-cavern`, `lookout`, `ossuary`,
  `dream-chamber`, `collapse`, `midden`. At least `entrance` plus one; the
  list is what the family needs, not a menu every record fills.
- `loop` — none | shortcut-back | second-entrance | vertical-return |
  water-loop. A second entrance on the record implies second-entrance.
- `traversal` — `{swimM, diveM, climbM, breathGated, current
  (none|mild|strong), darkFraction}`: what the body must do, in metres and
  booleans, so a capability profile (module 75 §52) can answer "can I".
- `combatSpaces[]` (≤ 3) — `{scale: duel|smallGroup|largeGroup|boss,
  footing: dry|wade|swim|mixed, clearance: tight|standard|generous}`; the
  §49 blueprint is compiled from these intents in Phase 12.
- `anchorSockets[]` — `{id: socket.<place-slug>.<kind>[-n], kind, whereInInterior,
  provision?}` with kind from `boss`, `boss-chest`, `captive`, `cache`,
  `shrine`, `escape`, `evidence`, `scene`, `station`; `provision` names the
  `quest.provision.*` id it answers. These are the pins the quest and loot
  compilers address; a quest-required socket is written from the quest
  plan, never invented.
- `light` — daylit | torchlit | bioluminescent | dark | mixed.
- `lock` — none | simple | hard | unpickable-key | quest-sealed
  (the unpickable-lock class and the spell-as-alternate-key pattern of the
  buildout register live on this field).
- every `contents.*[]` slot carries `whereInInterior` — entrance |
  threshold | main | deep | boss | hidden | flooded | above.

**Rules.** (1) A promise is something the interior *can* say, never must:
a captive socket on every delve is the sameness the province must not
have; `test_catalogue` fails two dungeon-kind records of one family within
2 km that agree on more than three of the axes {room set, loop, light,
lock, combat scales, traversal profile, socket kinds} (97 A6's ≥ 3-axes
rule applied to the promises). (2) Every family maps to a realisation
recipe in `world/sources/catalogue/interior-recipes.json` backed by a kit
in `apps/world-studio/public/kits/` or a built kit in
`tooling/asset-pipeline/output/kits/` with its source, hash and credit; a
family with no recipe is re-typed or sourced, never promised (0062). (3)
The promises project to record-only obligations (`worldgen.place_obligations`,
owner `phase-12`); the 16k slice that takes carried 16i item 4 (the first to emit a delivery
manifest) writes the manifest verifier. (4) Entrances stay decoupled from geology
(§47); the entrance type on the record is siting data and picks the first
room's kind (a `stair-throat` opens on a `stair-shaft`, an
`underwater-entry` on a `flooded-gallery`).

Exterior generation creates foundations, doors, cave mouths, wells, drains
and underwater portals consistent with the promises. The runtime **must**
support (nothing below exists yet: the 16k slice that takes carried 16i item 5 builds the load contract, Phase 12
the rest; AI-state preservation across portals is build-out work):

- streamed interior cells for large buildings and dungeons;
- seamless small huts and open structures;
- seamless cave mouths with deeper streamed cells;
- portals that preserve water state, time, ownership and AI state.

## 49. Combat spaces as semantic geometry

Dense roots, trees and water can create poor combat conditions accidentally. The blueprint format should make combat spaces explicit:

```ts
interface CombatSpaceBlueprint {
  boundary: Polygon;
  intendedScale: "duel" | "smallGroup" | "largeGroup" | "boss";
  footing: FootingProfile;
  waterDepthRange: Range;
  rollClearance: number;
  weaponSweepClearance: number;
  cameraClearance: number;
  lockOnVisibility: VisibilityRequirement;
  criticalAnimationClearance: number;
  retreatRoutes: RouteId[];
  ambushRoutes: RouteId[];
  climbConnections: ClimbRouteId[];
}
```

Tight spaces remain available when deliberately specified.

## 50. Encounter placement follows ecology and motive

**Loot and enemies are authored per record and fixed — never a levelled list,
never a container whose contents depend on character level** (00-core rule 9, decision
0004). Every encounter socket names a fixed group; every container names
its contents.

An encounter socket needs:

- habitat or faction cause;
- schedule or trigger;
- approach routes;
- retreat and pursuit boundaries;
- relationship to water and climbing;
- nearby civilian or trade activity;
- evidence and foreshadowing;
- fixed enemy group definition;
- world-state variants.

Creatures occupy territories. Bandits exploit routes. Soldiers defend assets. Ritual groups use culturally meaningful spaces.

---


# Part XI — Asset strategy and candidate sources (§71–80)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.

## 71. Asset strategy under the no-new-art constraint

The project can build a large world through:

- vanilla Skyrim meshes, textures, animations and sounds processed through the existing asset pipeline;
- mod assets from the permitted source pool;
- modular composition and instancing;
- material variants derived from existing source material;
- generated terrain and water meshes;
- shader effects, particles and procedural placement;
- kit-based interior and settlement assembly.

No workflow should depend on future bespoke modelling or texture painting.

For this personal total-conversion-style project, the asset-management rule should be simple: **retain a source link and the credits that need to appear in the final credits list**. Avoid creating a legal/permissions bureaucracy inside the codebase.

## 72. Asset registry

```ts
interface AssetRecord {
  assetId: AssetId;
  sourceProject: string;
  sourcePage: string;
  sourceVersion?: string;
  sourceArchiveHash?: string;
  sourceFilePaths?: string[];
  creditRefs: string[];
  category: AssetCategory;
  cultureTags: CultureId[];
  biomeTags: BiomeId[];
  dimensions: Vec3;
  collisionProfile: CollisionProfileId;
  physicalMaterials: MaterialAssignment[];
  climbProfile?: ClimbSurfaceProfileId;
  lodSet?: LodSetId;
  snapPoints: SnapPoint[];
  sockets: AssetSocket[];
  generatorTags: AssetTag[];
}
```

The registry exists to make generation, physics, performance and credits reliable. It is not intended to become a heavyweight compliance ledger.

## 73. Source and credits process

Keep this deliberately lightweight:

1. record the mod/source project name and URL;
2. record the author/project names that should be credited;
3. optionally record archive version/hash where it helps reproducibility;
4. record which semantic asset IDs came from that source;
5. maintain one generated `CREDITS`/third-party-reference list from those records.

All mods listed in this document are assumed available for this personal project. There should be no per-asset permission gate, permission-evidence workflow or agent-time spent repeatedly re-checking usage terms unless a genuinely new source is introduced later.

## 74. Available foundations

### 74.1 Vanilla Skyrim and DLC/Creation content

High-value source families:

| Source family | Direct world uses |
|---|---|
| Hjaalmarch/Morthal | marsh ground, reeds, dead trees, fog, wetland clutter, poor-road composition |
| Riften and Ratway | docks, pilings, timber waterfronts, canals, sewers, rough urban interiors |
| Fishing content | nets, fish, traps, rods, boats, dock clutter and catches |
| Caves and mines | natural caverns, mine supports, smuggler dens, roots and underground routes |
| Imperial and Nordic forts | frontier forts, prisons, checkpoints and ruined colonial infrastructure |
| Farms and estates | plantations, storehouses, fences, mills and fringe agriculture |
| Ships and shipwrecks | coastal wrecks, river obstructions, salvage and pirate sites |
| Solstheim/Dragonborn | fungi, giant roots, Telvanni organic forms, ash/Dunmer border culture |
| Blackreach | glowing fungi, subterranean water, deep-cavern lighting and scale |
| Dawnguard/Falmer cave material | selected underground infrastructure and organic clutter |
| Ruins and tombs | later cultural reuse, crypts and generic structural components |

### 74.2 Argonian Xanmeer Tileset

[Argonian Xanmeer Tileset — Modder's Resource](https://www.nexusmods.com/skyrimspecialedition/mods/181193) contains 85 modular meshes covering structural and damaged Xanmeer components.[^A1] The kit is available for this project.

Direct uses:

- Xanmeer exterior shells;
- corridors and chambers;
- roofs, floors, stairs and monumental transitions;
- broken and collapsed variants;
- hydraulic and flooded complexes;
- ruin fragments for exterior dressing;
- modular dungeon families.

Record the source page and required author credits in the normal credits list; no separate permission-evidence subsystem is needed.

## 75. High-priority architecture and settlement candidates

All candidates in Sections 75–79 are available for use in this personal project. Preserve their source URLs and author/project credits in the credits list; asset selection can focus on visual usefulness, technical compatibility and reproducible builds.

| Candidate | Useful material |
| --- | --- |
| [Mud Mother Grove — Argonian Mud Hut](https://www.nexusmods.com/skyrimspecialedition/mods/146557) | Argonian mud-hut shell, interior composition, local props and settlement visual language |
| [Marsh-Rest — Argonian Themed Player Home](https://www.nexusmods.com/skyrim/mods/50111) | Argonian dwelling/interior composition, mixed props and waterside home ideas |
| [Xalfek — An Argonian Home](https://www.nexusmods.com/skyrim/mods/55595) | Compact Argonian home and interior arrangement |
| [Darkwater Den](https://www.nexusmods.com/skyrim/mods/52630) | Jungle-swamp cave home, clutter, textures and organic interior composition |
| Roots of the Sleeping Tree and similar organic homes | Root rooms, living-tree circulation, organic architecture and furniture ideas |
| Glimmergrove and bioluminescent cave homes | Glowing plants, cave homes, pools and underground settlement composition |
| Wares of Tamriel and Argonian cultural-prop projects | baskets, ceramics, tools, fishing goods, ritual props and trade clutter |
| Argonian bone/wood weapon resources | spears, fishing weapons, shields, bone tools and hunting equipment |

## 76. Flora, terrain and underwater candidates

### 76.0 Ground/landscape textures (terrain splat palette)

Vetted 2026-08-23 with permissions verified — full shortlist, vanilla keep-list
and ruled-out list in
[docs/research/black-marsh-ground-texture-sources.md](../research/black-marsh-ground-texture-sources.md)
(don't re-research; system design is decision 0011). Top sources: **ambientCG
and Poly Haven CC0 PBR sets** (black mud, puddled shallows, wet clay, mud+leaf
litter, moss), **A Cathedralist's PBR Landscape** (SSE 137333, open
permissions, full PBR marsh/river family), **Cathedral Landscapes** (SSE
21954, share-alike), plus the retained vanilla wet/mossy set (frozenmarsh
grass/dirtslopes, rivermud/riverbottom, reachmoss, hue-shifted
fallforestleaves). Owner rulings 2026-08-23: **Project Rainforest approved**
(use wherever it's the best fit; CC0/open-mod sources first, Rainforest for
gaps); **Vanaheimr – Marsh rejected** (cold-climate set — Black Marsh is
canonically hot tropical swamp, module 50 §33.1).

| Candidate | Useful material |
| --- | --- |
| [Depths of Skyrim — An Underwater Overhaul](https://www.nexusmods.com/skyrim/mods/98331) and SSE versions | underwater grass, seaweed, kelp, coral, fish, treasure, wreck and submerged-POI dressing |
| [Project Rainforest SE](https://www.nexusmods.com/skyrimspecialedition/mods/20636) | tropical vegetation, lily-pad replacements, red earth/rock material ideas, rain and jungle ambience |
| [Hoddminir Plants and Trees](https://www.nexusmods.com/skyrim/mods/38651) | broad plant/tree resource pool, including waterside and temperate species according to selected files |
| [WOODLAND Flora Overhaul](https://www.nexusmods.com/skyrimspecialedition/mods/48926) | trees, shrubs and broad vegetation variation |
| Enhanced Landscapes marsh pines/oaks resources | distinctive wetland tree silhouettes |
| Cathedral, Renthal and EEK flora families | mushrooms, ferns, reeds, shrubs, flowers and tree variants |
| [Cave Roots 4K](https://www.nexusmods.com/skyrimspecialedition/mods/32565) | improved cave and mine root textures |
| [Exist's Caves — PBR Retexture](https://www.nexusmods.com/skyrimspecialedition/mods/131152) | cave PBR textures with a stated CC BY-SA 4.0 licence |
| Vanilla Solstheim and Blackreach flora | roots, fungi and bioluminescent cave dressing |

## 77. Boats, ferries and water-transport candidates

| Candidate | Direct reusable value |
| --- | --- |
| [Sailboats — Script Free Sailing Expanded SSE](https://www.nexusmods.com/skyrimspecialedition/mods/40057) | six small boat classes, rowboats, sailboats, raised/furled sail states, storage and passenger concepts |
| [L.V.X. Magick's — Boats](https://www.nexusmods.com/skyrimspecialedition/mods/36149) | nine boat types, row/sail/Nordic variants, cargo themes, raised/lowered sails, fishing and construction concepts |
| [Skyrim Ferries](https://www.nexusmods.com/skyrimspecialedition/mods/109843) | rowboats, rafts, city ferries, logistics-aware route placement, simple point-to-point ferry interaction |
| [Rowboats of Skyrim](https://www.nexusmods.com/skyrimspecialedition/mods/35341) | rowboat models and rowing/interaction references |
| Nord Boats and Ships / ThatShipGuy resources | longboats, rowboats and larger ships for ports and coast |
| Vanilla Skyrim ships, rowboats, wrecks and fishing assets | base hulls, oars, docks, nets, cargo and wreck dressing |

The boat gameplay code should be original project code built around Rapier and `WorldWaterQuery`. Existing Skyrim scripts provide interaction and design references; permitted meshes and animation states can enter the asset catalogue.

## 78. Creature and fauna candidates

| Candidate | Direct reusable value |
| --- | --- |
| [Wamasu — Mihail Monsters and Animals](https://www.nexusmods.com/skyrimspecialedition/mods/158860) | wamasu model, textures, animations, effects and encounter reference |
| [Guars — Mihail Monsters and Animals](https://www.nexusmods.com/skyrimspecialedition/mods/44491) | guar variants, pack/mount/cargo forms and animations; includes Black Marsh-associated variants |
| [Scuttlers and Bantam Guars](https://www.nexusmods.com/skyrimspecialedition/mods/143604) | small domestic and wild fauna, animations and settlement life |
| [Sea of Spirits](https://www.nexusmods.com/skyrimspecialedition/mods/4781) | sharks, dreugh, whales, narwhals and other aquatic creature assets/behaviours |
| Bloedzuigers / giant-leech projects | large leech body and animation base for deep-marsh hazards |
| Mihail frogs, giant snakes, crocodilian creatures and centipedes | amphibian, reptile and invertebrate variety |
| Insect and dragonfly resources | ambient swarms, disease vectors and food-web detail |
| Vanilla slaughterfish, insects, fish, mudcrabs and chaurus families | baseline aquatic and invertebrate animation/material sources |

Creature assets provide models and animations. Habitat, behaviour, statistics, fixed danger and population rules remain game-owned data.

## 79. Ruin, cave, fort and dungeon candidates

| Candidate | Useful material |
| --- | --- |
| [Creation Club Ayleid Ruin Resources](https://www.nexusmods.com/skyrimspecialedition/mods/83999) | extra pieces for the Update 1.6 Ayleid kit, original and modified structural assets |
| [Balamath — Ayleid Ruin Dungeon](https://www.nexusmods.com/skyrimspecialedition/mods/84000) | example of multi-zone dungeon assembly and non-linear variant using Bethesda's Ayleid kit |
| [Fort Castellum SE](https://www.nexusmods.com/skyrimspecialedition/mods/23438) | ancient Imperial tileset demonstration, fort and dungeon block combinations |
| [The Psychedelic Caves](https://www.nexusmods.com/skyrimspecialedition/mods/150288) | bioluminescent plants, mushrooms, crystals and unusual cave composition |
| Vanilla cave, mine, fort, prison and sewer kits | natural caves, smugglers, colonial infrastructure and flooded interiors |
| Vanilla Ayleid Update 1.6 content where owned | Barsaebic Ayleid structures and dungeon pieces |
| Beyond Skyrim Bruma Ayleid material | high-quality Ayleid architecture and textures |

## 80. Asset acquisition priorities

1. Ingest the Xanmeer kit and record its source/credits entry.
2. Build the vanilla Skyrim semantic catalogue.
3. Ingest one Argonian current-settlement kit.
4. Acquire waterside flora, tree and underwater vegetation sets.
5. Acquire small-boat and ferry assets.
6. Acquire a compact creature foundation: wamasu, guar, small reptiles/amphibians, insects and aquatic fauna.
7. Acquire Ayleid/Nedic/Imperial historical-layer kits.
8. Expand clutter, tools, fishing, ritual and market assets.
9. Add specialised cave and bioluminescent assets.
10. Fill gaps only after the reference watershed exposes them.

---


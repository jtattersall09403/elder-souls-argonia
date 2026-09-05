# Part II — Black Marsh as a province-scale world (§11–16)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.

## 11. The central macro identity: an unconquered hydrological heart

Black Marsh lore repeatedly supports a province whose foreign-controlled or foreign-accessible zones cluster along borders, coasts and dependable waterways while the interior remains difficult to enter, govern and map. The Third Edition *Pocket Guide* presents the heartland as effectively inviolate, and *The Argonian Account* repeatedly shows Imperial roads, bridges and drainage schemes failing against water, mud and living swamp.[^L1][^L2][^L4]

This produces a strong world structure:

| Macro zone | Physical character | Cultural/political character | Fixed danger |
|---|---|---|---|
| Border and coastal fringe | Firm ground, ports, engineered drainage, navigable estuaries, surviving roads | Imperial, merchant, Dunmer and mixed influences; Argonian adaptation of imported structures | Accessible starting and mid-game spaces with local high-danger pockets |
| Transition wetlands | Flood-prone roads, broken bridges, braided channels, plantations, estates, reclaimed forts | Mixed communities, contested authority, failed colonial projects, active trade and raiding | Moderate to high, dependent on route knowledge and season |
| Rootlands and deep marsh | Flooded forest, deep channels, unstable ground, dense canopy, giant roots, limited external infrastructure | Hist-centred tribes, local transport systems, limited outsider presence | High and fixed |
| Inner heart and Helstrom approaches | Sparse mapped routes, extreme ecology, ancient ruins, strong Hist influence, difficult retreat | Deep cultural and spiritual centres with minimal external control | Highest fixed regional danger |

These zones form hydrological and cultural gradients. Rivers, watersheds and historical corridors define their shapes.

Foreign infrastructure should show a visible life cycle:

1. surveyed and imposed;
2. adapted to local conditions;
3. damaged by flooding and biological growth;
4. partially abandoned;
5. reused by local communities, criminals or creatures;
6. submerged, buried or absorbed into the landscape.

This gives the Imperial fringe the same thematic role that Imperial towns and forts perform on Vvardenfell: a legible external system occupying only part of a much older place.

## 12. Fixed difficulty and natural access progression

The game should have no player-level input in world generation, enemy selection or container contents.

### 12.1 Required technical prohibition

These systems must not receive `playerLevel`:

- encounter population;
- creature variant selection;
- faction equipment selection;
- dungeon enemy replacement;
- loot-table selection;
- chest quality;
- regional hazard strength;
- boss statistics;
- route hazard selection.

CI can enforce this through dependency rules and tests.

### 12.2 Place-based danger

Each region and location carries a fixed `DangerProfile`:

```ts
interface DangerProfile {
  ecologyThreat: number;
  factionThreat: number;
  diseaseThreat: number;
  toxinThreat: number;
  navigationComplexity: number;
  waterCurrentThreat: number;
  drowningThreat: number;
  visibilityThreat: number;
  remoteness: number;
  recoveryScarcity: number;
  nightMultiplier: number;
  seasonalModifiers: SeasonalDangerModifier[];
}
```

Values describe the place. Quest outcomes, weather, migration and faction conflict may change them through explicit world events.

### 12.3 Fixed loot

A location's rewards derive from:

- original purpose;
- historical occupants;
- current occupants;
- trade links;
- local resources;
- degree of isolation;
- difficulty of access;
- quest and faction state.

A submerged Barsaebic archive can contain rare fixed artefacts from the start. A low-level player can reach it through exceptional planning, temporary water-breathing magic, stealth and risk. The reward remains the same.

### 12.3b Reward for effort — what exploration pays (owner directive, 2026-09-01)

If a player puts effort into reaching an interesting, hard-to-get-to place,
the place must pay them for it. **Approximately proportionately**: harder,
riskier, more remote, more subtly signposted → better reward. Approximate is
the word — an easy find occasionally out-paying a hard one is fine; a hard
climb ending in nothing is not. Every reward still needs a causal story
(§12.3, module 40 §32): someone left it, grew it, hid it, or died with it.

**Hard-to-reach place types** (non-exhaustive — placement agents extend the
list from the terrain itself): mountaintops and high saddles; ravine and
canyon dead ends; clearings deep in jungle, drowned forest or deep marsh;
secret coves and sea caves; islands and lake islets; spaces behind
waterfalls; sinkholes and collapsed ground; high ledges and roofs of xanmeer
ruins reached by climbing; canopy platforms and great root crowns; underwater
grottoes, air pockets and flooded cellars; mist-locked hollows;
storm-exposed headlands; the far side of dangerous water or a D4/D5 band
crossed early.

**Reward types** (vary them — loot is only one):

- fixed loot: a chest, cache, or corpse with goods (provenance per §12.3);
- a fun POI that is itself the find — a shrine with a strong blessing, an
  abandoned camp, a hermit, a wrecked boat, an odd machine;
- a guardian fight: a challenging habitat-grounded creature or foe whose
  body or hoard pays out;
- a quest hook: a letter on a body, a journal, a map fragment, a strange
  object — starting a side line that ends in a real prize;
- a unique or rich resource node (rare ingredient, vakka stone, pearl bed);
- teaching: a skill book, a trainer, an inscription;
- a vista that reveals landmarks — diegetic map knowledge (a named place
  seen from here becomes findable);
- a practical refuge: safe rest spot, dry cache, fresh water in salt country;
- a shortcut unlock back (a lowered root-bridge, an openable gate) — the
  reward is the loop itself;
- a lore vignette — environmental storytelling with a small prize in it.

**Binding rules for placement phases (11–15):**

1. Every *notable* hard-to-reach landform in a region packet carries a
   reward. Notable = the terrain visibly invites the attempt (a summit you
   can see, a ravine that keeps going, a cove off the lane). Finding these
   is a terrain query (local maxima, dead ends, enclosed clearings,
   off-route islands), not a vibe.
2. The packet's density budget declares its reward coverage alongside its
   POI budget (module 95, Phase 11 deliverables).
3. The orphan validator (module 40 §32) rejects both directions: a
   flagged hard-to-reach landform with nothing at it, and a rich reward
   with neither effort nor cause behind it.
4. Discovery stays diegetic — no markers; the harder the find, the more it
   may rely on the terrain itself as the only pointer
   ([morrowind-content-density.md](../research/placement-settlements/morrowind-content-density.md) §5.3).

### 12.4 Natural unlocking

The deep world becomes increasingly survivable through:

- greater health, stamina and resistances;
- better armour and lower effective equipment burden;
- swimming skill and speed;
- breath duration or Argonian physiology;
- water-breathing and fast-swim spells;
- climbing stamina and route knowledge;
- boats and boat upgrades;
- alchemy against disease, poison and insects;
- faction allies and local guides;
- discovery of rootworm, ferry and ritual transit;
- map knowledge and safe resting places;
- better combat capability.

This gives progression a geographic expression. A player can see or hear about places long before surviving them.

## 13. Era must be frozen before detailed world authoring

Black Marsh changes greatly across eras. The state of Imperial control, Dunmer relations, the Knahaten Flu's aftermath, the Shadowscales, the An-Xileel, the Argonian invasion of Morrowind, Lilmoth and Umbriel all depend on date.[^L5]

The source schema needs:

```ts
interface CanonDatum<T> {
  value: T;
  era: EraRange;
  confidence: SourceConfidence;
  sources: SourceId[];
  spatialTolerance?: number;
  authorNotes?: string;
}
```

Recommended confidence values:

```ts
type SourceConfidence =
  | "CANON_FIXED"
  | "OFFICIAL_MAP_DERIVED"
  | "GAME_DERIVED"
  | "LORE_INFERRED"
  | "COMMUNITY_CONSENSUS"
  | "PROJECT_REFERENCE"
  | "AGENT_AUTHORED"
  | "GENERATED";
```

The build can retain multiple era layers during research. Production settlement states should use one frozen era configuration.

## 14. Canonical settlement anchors and community-map priors

Major settlement coordinates should be registered first from official maps, game-derived maps and lore. Where those sources disagree, use tolerance polygons rather than pretending to false precision. The heightmap supplies topography around those anchors; hydrology, political history and settlement function then determine the detailed site.

| Anchor | Broad mapped position | World-generation role | Required caution |
|---|---|---|---|
| **Gideon** | Western/southwestern border near Cyrodiil | Major frontier city, road/river interface, estates, Imperial and Argonian layers | City state differs by era; local terrain must reconcile map position with Blackwood/Gideon depictions |
| **Soulrest** | Southwestern coast/Topal Sea side | Port, trade, fishing, piracy, naval and estuarine access | Source detail is sparse; preserve map anchor and mark invented detail clearly |
| **Blackrose** | Southern or south-central interior/coastal lowland | Ancient city, prison and penal/fortified history, dangerous surrounding marsh | Prison and city layers require era separation |
| **Lilmoth** | Southeastern coast at Oliis Bay | Major port and external gateway, half-sunken Imperial districts, cosmopolitan and mercantile layers | Umbriel and An-Xileel consequences are era-specific |
| **Archon** | Eastern/southeastern coast | Eastern port or regional city, coastal and deep-marsh interface | Sparse source detail needs high confidence discipline |
| **Helstrom** | Central interior | Deep-heart city and principal hero location | Canon gives importance and position with limited layout detail; use intensive agent authoring |
| **Stormhold** | North/northwest | Northern city and Shadowfen/river-network anchor | ESO and later-map states need era tagging |
| **Thorn** | Northeastern frontier | Morrowind-facing city, trade/war/slavery frontier, delta or river access | Political and demographic state depends strongly on era |
| **Alten Corimont** | Northern/eastern route system in ESO-era material | Port/trade or secondary regional anchor | Treat importance as era-specific |

The province compiler should never shift these cities simply to improve procedural spacing. It should solve surrounding hydrology, roads, districts and satellite settlements around them. Official, game-derived and community maps must remain separate source layers.[^L12]

### 14.1 Community Inkarnate map as a settlement and route prior

The supplied community map — [**Black Marsh / Argonian State 4E 231**](https://www.reddit.com/media?url=https%3A%2F%2Fpreview.redd.it%2Fa-map-of-black-marsh-i-made-in-inkarnate-i-find-the-v0-7jo2gib84ox71.jpg%3Fauto%3Dwebp%26s%3D89a43ee168eaae73e9a350667e1fe2a46f273749) — is a useful **secondary planning prior** for relative settlement placement, settlement prominence and candidate overland graph connections.[^C2]

Its role is deliberately narrow:

- use its major-city positions as another check on the fixed anchors above;
- use the icon hierarchy as an **ordinal size/prominence prior**, not an exact population model;
- use named secondary settlements and forts as candidate locations where they fit lore, geography and the final hydrology;
- use its faint road network as **suggested graph edges between places**, not as fixed road geometry;
- do **not** inherit its rivers, coast detail, marsh boundaries, forests or local landscape wholesale;
- do **not** require every named minor settlement to survive into the final world;
- allow province-scale hydrology and ecology to move, replace, split or remove the map's minor roads and waterways.

The map's strongest reusable location layer is approximately:

**Major/prominent anchors:** Gideon, Stormhold, Helstrom, Thorn, Archon, Blackrose, Soulrest and Lilmoth.

**Useful secondary-settlement candidates:** Blankenmarsh, Glenbridge, Alten Corimont, Bright Throat, Rockguard, Chasecreek, Riverwalk, Branchmont, Rockpoint, Greenglade, Riverbridge, Seafalls, Greenspring, Alten Markmont, Creekford, Crossroads, Greenwillow, Rockgrove, Blacktower, Alten Meirhall and Moonmarch, plus named forts such as Fort Blankenmarsh, Fort Dusklight, Fort Saltsaber and Fort Moonmarch.

The road lines suggest high-level graph ideas such as:

- a **Gideon → Murkmire/Alten Corimont → Stormhold** western/northern connection;
- **Stormhold → Rockpoint → Helstrom** as one possible northern-to-heartland chain;
- **Helstrom → Greenglade/Riverbridge → eastern coast/Archon** as a candidate eastward chain;
- **Helstrom → Alten Markmont/Greenspring/Crossroads → Blackrose** as a candidate southward chain;
- **Crossroads/Greenwillow/Rockgrove → Soulrest** as a southwestern branch;
- **Blackrose → Alten Meirhall → Lilmoth** as a southeastern branch.

These should be stored as `suggestedConnection` edges with low-to-medium confidence. The route compiler can then decide whether each final connection is a dry road, levee track, boardwalk, ferry, river route, mixed-mode journey or no longer sensible after hydrology is solved.

This community map is **not complete** and is not the landscape blueprint. The final province should contain many additional waterways, settlements, camps, hidden sites, routes and ecological structures generated from lore and causal world logic.

## 15. Minor settlements also need reasons to exist

Minor locations can be generated after the following questions have answers:

1. What resource, route, ritual, refuge or political need caused the location to form?
2. Why is this exact site preferable to nearby alternatives?
3. Who founded it?
4. Who controls it now?
5. How has water changed it?
6. What does it exchange with the wider region?
7. What danger does it manage or exploit?
8. What visible evidence communicates its history?
9. What would cause abandonment, growth or conflict?
10. Which assets express those facts?

This applies to a three-hut camp and a major city.

## 16. A region taxonomy for generated Argonia

The generator can use internal ecological classes independent of political names:

| Region class | Physical grammar | Traversal grammar | Settlement grammar |
|---|---|---|---|
| Tidal delta | Braided channels, mudflats, sandbars, brackish pools, mangroves | Boats, tides, shallow crossings, unstable banks | Docks, stilts, fisheries, elevated stores, ferries |
| Coastal lagoon | Sheltered water, barrier islands, reed beds, salt influence | Canoes, skiffs, short coastal sails, wading | Port villages, salt/fish production, watch posts |
| Deep river corridor | Large navigable channel, natural levees, oxbows | Fast boat travel, narrow dependable foot corridors | Trade towns, ferry hubs, estates, forts |
| Flooded forest | Shallow water beneath canopy, roots, fallen trunks | Wading, swimming, root bridges, climbing | Raised villages, tree/root structures, small docks |
| Interior swamp | Pools, hummocks, winding channels, poor sight lines | Local knowledge, canoe channels, difficult retreat | Small dispersed Hist-centred communities |
| Seasonal floodplain | Large wetness variation, temporary lakes and channels | Route availability changes by season or weather | Seasonal platforms, movable structures, causeways |
| Raised hammock | Stable local high ground inside wetlands | Foot hub, defensible camp, landmark | Valuable settlement, shrine, tomb, fort or refuge site |
| Rootland | Giant Hist/root influence, organic topography, unusual chemistry | Root paths, climbing, submerged passages, ritual transit | Hist settlements, sacred sites, restricted outsider access |
| Northern transition | Firmer ground and Morrowind-facing wetlands | Denser foot and road network, mixed water travel | Border towns, Dunmer interaction, defensive sites |
| Western frontier | Red clay, drainage works, roads, estates and Imperial remnants | Engineered routes with variable survival | Mixed settlements, plantations, forts, administrative ruins |
| Deep sink basin | Permanently flooded depressions, dark water, low oxygen | Diving, boats, limited dry refuge | Submerged ruins, creature territories, specialist camps |
| Karst/root cavern belt | Sinkholes, caves, subterranean rivers | Swimming, climbing, underground navigation | Cave communities, hidden transit, dungeons |

Each class modifies terrain, hydrology, asset weights, danger, sound, visibility and movement.

**Ground materials (`RegionGrammar.materialPalette`) are two-level** (decision
0011): worldgen compiles a per-texel semantic **land-cover class** (waterline
mud, riverbank, reed bed, hummock top, peat bank, leaf litter, path…) from the
hydrology/soil/route fields, and each region's palette maps those classes to
**concrete textures** from a global ~40–60-texture library — so the same land
cover resolves differently north vs south, and palettes blend at region
borders. Research grounding and the runtime representation live in
[docs/research/](../research/rendering/skyrim-morrowind-landscape-texture-granularity.md)
(granularity, [rendering](../research/rendering/webgl-terrain-many-material-splatting.md),
[texture sources](../research/rendering/black-marsh-ground-texture-sources.md)).

---


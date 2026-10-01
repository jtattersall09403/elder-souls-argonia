# Bog Iron Workings — design (16k walk 9, type 7 works; the type's first slice)

Builder: place-type-7 lane, 2026-10-01. The layout file `bog-iron-workings.layout.json`
is the source (0105 R59). Round folders: `tooling/.reports/16k/place.imperial-fringe.bog-iron-workings/round-N/`.

## Site

### The choice (type 7: works or landing)

Type 7 candidates were the 49 active `works` records (no `landing` type is
active in the catalogue: the 20 landings carry ferry-stage or transit types).
Ranked on three things: the causal record, the quest rows that anchor there,
whether the works' own machinery exists in the vault.

| Place | Zone | Quest rows | Machinery in the vault | Why not / why |
|---|---|---|---|---|
| **Bog Iron Workings** (`place.imperial-fringe.bog-iron-workings`) | imperial-fringe | LF67 (anchored) | the vanilla smelter (`furniture/smeltermarker`, Skyrim.esm `CraftingSmelterMarker1`, placed outdoors at Skyrim's mines; King of the Murkmire places it as `SmelterSTATIC`) and King of the Murkmire's forge set (`oaristys/forge`: coal pile, iron ore stack, ore bucket, iron ingots) | chosen: a works whose process the kits can show end to end (ore, fuel, furnace, iron); LF67 needs a place feature (the seep's deep end) the frozen water already holds; depends on no unbuilt place; supplies the Cold Forge |
| Archon Bonded Row | saxhleel-coast | 5 | none (bonded warehouse: Imperial shells) | stands on Archon's quay: depends on a type-8 city not yet built |
| The White Pans | dunmer-north | LD57, LD91 | none: no salt-pan piece exists (saltpile only) | the pans themselves would be invented |
| Silyanorn Diggings | dunmer-north | 3 | Ayleid ruin, scaffold | depends on Stormhold (type 8); the diggings are a ruin entered sideways (type 5 ground) |

Contrast rule: Claywater (type 1) stands 1.76 km south-west in the same zone;
this is a different type and an Argonian works, not a road station.

### The record (`world/sources/catalogue/places-imperial-fringe.json`)

- **why:** bog iron forms itself here; a road that eats iron pays for it;
  diggers from three villages work one season a year and think the work
  shameful; the seep is being worked out; would be abandoned without ceremony.
- **vibe** (edited at 5b, § Record changes): a squat clay furnace and its
  charcoal bed on a bench above the seep, a mud hut beside them.
- **contents:** n1 the season's diggers (D2, few); c1 something in the deep end
  of the seep (D3; was mis-filed as an npc slot, § Record changes).
- **sockets:** `scene.bog-iron-workings.the-mound`, `evidence...the-stained-boots`,
  `post...ore-digger`. **interior:** one door, a dwelling, S1.
- **relations:** supplies the Cold Forge; reached via Cartwright's Cross and the Mile House.
- Promise ledger: `world/sources/placement/promises/place.imperial-fringe.bog-iron-workings.json`, 21 rows.

### The ground (`world/sources/sites/dossiers/bog-iron-workings.{json,md}`)

- Plotted anchor 2004, 2599 at 15.5 m, slope 6.6°, 0.23 m over the water table: no
  level cell for a hut pad there.
- A level bench at x 1975-2000, z 2525-2545 (20.6 m, under 1.3° on the scan);
  east of it the ground falls 4-6° to x 2020, then a steep bank to the seep.
- The seep: `body.1117-1397` (marsh-deep, perennial, level 15.28 m). Its north lobe
  reaches z 2542 at x 2032-2044; its deep end, 1.5 m of water, lies at 2040, 2556.
- A puddle at 1988-1992, 2520-2524 (level 20.5 m) keeps the hut pad 1.5 m off it.
- Ways: the Rim road (`route.road.gideon-stormhold`) runs east-west at z 2508.7;
  three minor routes share one line along the seep's west shore at z 2607
  (`track.road.glenbridge-the-road-nisswo-house` and two more); none ends here.

### Quest provisions

- **LF67 Bog Iron, Deeper Pools** (skeleton, tier 3): the diggers stopped working
  the deep end of the seep without saying why. Needs: the seep's deep end (frozen
  water, 1.5 m), the crew (n1, a `witness` purpose on their hut), the thing in
  the pools (c1, fauna socket at the deep end).

### Lore read

- `world/sources/lore/topics/material-culture.md:53-57`: after Duskfall the
  Argonians almost never work metal; bog iron is an attested Argonian material (UESP Lore:Black Marsh).
  The record's "they consider the work shameful" follows from it.
- `world/sources/lore/topics/fauna-hazards.md:109`: bog iron among the province's minerals.
- `material-culture.md` § Building and 97 Part F `argonian-mud`: the crew's hut is a mud pod.

### Nearby places

Keeps-The-Lower-Water lodge 95 m north-west, Red Cart Yard 201 m north-west,
Lower Onkobra Paddies 205 m west; none built. Claywater (1.76 km) is the only
built place in the zone: its signatures are held in the claims register; the hut
here takes a different dressing set and cell use.

## Brief

### The calls the ground forces

1. **The workings stand on the bench above the seep's north end**, 60 m north of
   the plotted anchor (§ siting): the anchor has no level cell and stands on the
   water table.
2. **The way comes up from the seep track**, not the Rim road: the network-stitch
   rule refuses a footpath or track continuing a major road. The three
   minor routes along the seep's west shore are the place's natural network.
   The way runs 15 m along that line, then climbs north beside the water.
3. **The furnace floor is a pad** (apron 5 m, batter): the bench falls 4-6° there,
   and every prop of the yard stands on the levelled floor.

### Rows

| Thing | Purpose | Kit piece (measured) | Rule or lore |
|---|---|---|---|
| Diggers' hut `b-hut` | the crew sleeps and keeps its stores; witness purpose for LF67 | `composite:mud/kotm-house-pod` 13.6 × 14.9 m, pad (apron 1.5, east 3.0), door facing 110° onto the way's end | record interior (dwelling, one door); R83 linked cell |
| The furnace `bl-furnace` | the bloomery: it takes ore and charcoal and gives the bloom | see § Kit change; parcel piece on a 5 m pad | record vibe; R1 |
| Charcoal and fuel | charcoal heap, woodpile, chopping block | kit pieces, § Kit change | sitingPrefs "a drying rack for peat fuel": the racks had no exterior licence (R1), so fuel stands as stacks |
| Ore carry | hand cart, ore cakes heaped and in a bucket, full baskets by the furnace | `handcart02`, `kotm:oaristys/forge/orestack_iron` ×2, `orebucket_iron`, `basketfull`, `basket02`, `bucket01` | record why.siteAdvantages |
| Iron | the bloom's iron stacked by the furnace foot | `kotm:oaristys/forge/ingotsiron01` | record rewardProfile materials |
| Crew stores | jars, sacks, crate, pail, small woodpile by the hut door | yard set `works-crew-stores` | 0098 clutter per dwelling |
| Cookfire | the crew's evening fire on the floor | `campfire01burning`, `saxhleelmetalpot01`, `paintedurn01` | R43 two light kinds |
| The way | track 2.5 m from the seep track to the hut door | path op | 97 C3; network stitch |
| Furnace path | footpath 1.2 m from the way to the furnace mouth | path op | pathReachRule; the furnace's front faces it |
| Lights | candle by the hut door; the cookfire | `argoniancandle01`, `campfire01burning` | 97 C16 (lit entrance within 2 m) |

### Interiors

| Door | Shell | Cell | Why |
|---|---|---|---|
| `door.imperial-fringe.bog-iron-workings.1` | `composite:mud/kotm-house-pod` (base `smpodext02`) | `KeebaHouseSnailMinder` (preferCell) | the shell's linked set is Crafter, Fisher, SnailMinder (Treeminder fails the bundle gate). Crafter already serves three places (R4 cap); SnailMinder reads as a working crew house (three beds, spit and cooking stand, a huge woodpile; the claim classes it a smithy). All three are used in the region, so the repeat is excused (R37). |

Rejected shells: `kotm mudhut02` (KeebaHouseElder): its load door stands 6.7 m up
with a 5.2 m spread across placements; `mudmother mudhut01`: its linked cell's
load door is a Dragonborn Telvanni door 8.5 m off a 6 m hut.

### Variety

Shells 1 (one dwelling: the M1 works record holds one building). Signature:
pod + crew stores (`works-crew-stores`), unlike any claimed pod set.

### Approach (openworld-approach §5, short)

One approach, from the seep track: the water shows first through the reeds,
then the furnace at the top of the rise, then the hut (`approaches[]`).
One way, no raised level, the furnace the one landmark.

### Sockets and quests

npc n1 (work at the furnace, evening at the cookfire, night in the cell's bed
`08095F78`); fauna c1 at the deep end (2040, 2556, D3); markers: hut door
(entrance), scene the-mound (the furnace floor), evidence the-stained-boots (by
the hut door), post ore-digger (bank head over the seep).

### Creative register

1. The furnace and its charcoal are the place's one landmark: no shrine, no sign.
2. The process reads in a line: ore up from the seep, cart, furnace, fuel, crew.
3. The crew's hut turns its back on the road; its door faces the work.

## Kit change (works-v1)

The first layout stood the static `clutter/smelter/smelter01` and its
`smelter01coal01` bed: both are unplaced in Skyrim (n 0, no setting licence,
mesh-sill sinks), so `setting.class` and `sink.fallback` were red. Skyrim
places its smelter as the furniture NIF `furniture/smeltermarker`
(`CraftingSmelterMarker1`, 25 references, exterior town and wild); King of
the Murkmire places the same mesh as `SmelterSTATIC`. Added to `works-v1`
with King of the Murkmire's `oaristys/forge` iron set (ore stack, ore bucket,
iron ingots; the coal pile too). The first build shipped the NIF's hidden
preview skeleton and body (a mannequin and marker cards in the look sheet):
`pipeline/blender/build_kit.py` now drops every shape the NIF hides (the
HIDDEN flag on it or a node above it) and lists it in `droppedShapes`; the
smelter went from 27,083 to 1,174 triangles. Five other works pieces
lost their trigger, ragdoll and anchor helpers. The drying racks
(`wrherbdryingrack01`, interior only) are gone; fuel is the woodpile.

## Record changes (5b)

- `rewardProfile.kinds`: `trade-access` removed (no trader or market; the hook
  says visitors take the iron, they do not buy it).
- `contents.npcs[n2]` ("D3 something in the deeper pools") moved to
  `contents.creatures[c1]` (apex-ambusher, D3, single): it is the LF67 creature.
- `assetPlan`: `stockade-scaffold`, `vanilla-farmhouse` (not an Argonian kit),
  `landmark-civic` replaced by what is built: `mud-mother-grove`, `works-props`,
  `argonian-props`, `argonian-lights`, `clutter`.
- `vibe`: silhouette, palette, materials, signatureFeature, condition and
  approach rewritten to the built place (no orange water, no boot-boards, no
  stain: the runtime draws none of them, R5).

## Lessons this slice

See the report `tooling/.reports/16k/walk9/place-type-7.md` § Lessons; rows filed
as REQUEST rows in `tooling/.reports/16k/place.imperial-fringe.bog-iron-workings/requests.jsonl`.

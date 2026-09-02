# Settlement asset inventory — what we can actually build with

**Phase 11, Part 0 item 6a** (decision [0041](../decisions/0041-phase11-settlement-decisions.md)).
Survey only — nothing here has been downloaded, extracted or kitted; that is item 6b.

**Machine-readable twin:** [`world/sources/placement/settlement-asset-inventory.json`](../../world/sources/placement/settlement-asset-inventory.json)
(`schemaVersion: 1`, registered in `tooling/repo-standards/data-registry.json`).

**Who reads this:** anyone writing catalogue records in Parts 1–2. Write the
*vibe* and *asset plan* fields against the families below, so the province is
designed for the breadth we own rather than for assets we lack. If a place you
are inventing needs something in the [Gaps](#gaps) list, either pick a
different signature or flag it as a 6b sourcing request — do not assume it will
appear.

Underlying data: the semantic asset registry (`world/sources/assets/`, 27,929
rows — **query it, never read it**), the vault filesystem, module 90 §71–§80,
and `world/sources/lore/topics/material-culture.md`.

---

## 1. The two-culture rule (binding)

Canon gives **two Argonian building cultures that are never blended in one
settlement**, plus a dead monumental layer and a foreign layer:

| Culture | Reads as | Where | Our best assets |
|---|---|---|---|
| **Shadowfen mud/wattle** | wattle-and-daub over an exposed log skeleton; round lumpy shells; walls that sweat; ground-level | Shadowfen, inland/north | ~3 monolithic hut shells — **our weakest family** |
| **Murkmire reed/stilt** | woven reed on wooden stilts; platforms ascending from ground to hover over water, linked to one another | Murkmire, deltas, coasts | shackkit + passerelles walkway kit + stockade scaffolding + docks — **our strongest family** |
| **Xanmeer (ancient, dead)** | stepped stone pyramids, stone bridges, mazelike interiors. Stone is a moral error post-Duskfall, so *no modern Argonian building may read as stone* | province-wide ruin, densest deep interior | Xanmeer Tileset (interiors), 11 monumental statics, Ayleid kit |
| **Imperial / foreign stone-timber** | cut stone, mortar, sawn timber, slate; foundations that sank | west/north-west fringe, Topal ports, road corridors | vanilla farmhouse + five city kits + forts — very deep |

A fifth bucket, **culturally neutral** (containers, rope, fire, fish gear, generic
furniture), is used everywhere. **Dunmer/Telvanni organic forms are tempting and
off-limits inland** — they are for Thorn and the Morrowind border only.

---

## 2. Building families

| Family | Culture | Pieces | Where it lives | Palette words | Condition variants | Have? |
|---|---|---|---|---|---|---|
| **Round mud-hut shells** — `hutexterior` (11.6 m round), `hutdecking` (14.7 m on a raised deck), `argonianhouse`, `swamp house`, orc huts, + windows/steps/doorframe | mud | 19 | BM&V `meshes/architecture/huts/`, `/argonianhouse.nif`, `/swamp house.nif` | wet ochre mud, sun-baked tan, dark log skeleton, moss streaks | intact only | **archived** |
| **Modular plank/thatch shack kit** — 3.64 m walls, 6 frame forms, 11 roof pieces, **20 broken pieces** | reed/stilt | 58 | vanilla `meshes/architecture/shackkit/` | weathered driftwood grey, tarred plank, straw thatch | intact / ruined / half-collapsed | **yes** |
| **Stilt & waterside shells** — `stilthouseext`, 5 Dagon Fel shacks each with an interior, `housetall01` (3-storey, 16.8 m), tree house + rope ladders, awnings | reed/stilt | 30 | BM&V `architecture/stilthouse`, `sheogorad/dagon fel`, `stroti/tree house` | dark wet timber, silvered plank, amber lantern | intact | **archived** |
| **Imperial farmhouse & civic** — farmhouse01–06 (12.8–23.8 m) + **destroyed variants**, longhouse (31 m), inn (+2 destroyed), well, windmill, woven fences, full basement interior kit, five city kits | Imperial | 2,495 | vanilla `architecture/{farmhouse,whiterun,solitude,riften,markarth,windhelm,winterhold,orclonghouse}` | grey slate, lime plaster, dark stained timber | intact / destroyed | **yes** |
| **Fort, curtain wall & gate** — Griffon Fortress (walls, bastions, towers, gates, thronehall, chapel, crypt), Newcastle 1024-unit walls, Rochester houses + ruins, Seaview coastal castle (136) | Imperial | 481 | BM&V `griffon fortress`, `architecture/{newcastle,rochester,largecastle,seaview}` | dressed ashlar, damp green base course, half-timber ochre | intact / ruined | **archived** |
| **Dunmer / Telvanni organic** — tower, pods, gourdhouse, gazebos, ramps, roots; Velothi, Daedric, Ashlander hut, silt strider | foreign only | 288 | BM&V `architecture/phitt/*`, `telvanni/*`, `vvardenfell/*` | chitin brown, fungal ochre, ash grey | intact / ruined | **archived** |
| **Market, tents & awnings** — 4 market stands, city stalls, imperial/nord tents, orc awnings | neutral | 42 | vanilla + BM&V | sun-faded canvas, dyed cloth | intact | **yes** |

> **Free win:** Tropical Skyrim ships tropicalised repaints of the vanilla
> farmhouse and all five city kits **under vanilla filenames**. Retexturing the
> whole Imperial family for a hot province costs nothing. It contains **no
> architecture meshes** — only textures.

---

## 3. Walkways, docks, bridges, fences

| Family | Pieces | Highlights | Have? |
|---|---|---|---|
| **Elevated walkway kit** (BM&V `citebosmer/passerelles`) | 59 | straights at 64/128/256/512 units flat and rising (h32/h64/h128), **45° and 90° curved arcs at three radii**, T/X/Y junctions, stair links, end caps, plus a 20.7 m kiosk platform with barriers | archived |
| **Stockade scaffold & plank bridges** (vanilla) | 72 | scaffold bases 0–4-sided with supports, bridges at 6.6 / 9.3 / 12.0 / **17.5 m**, free walls, gate, barricade, lean-to, pikes | yes |
| **Docks & piers** (vanilla Solitude 17 + BM&V Dagon Fel 12 + jets 5) | 34 | straights, corners, 3-way/4-way, entrances, steps-down, **11.5 m mooring columns**, rope runs, cleats, ramps, damaged pilings | mixed |
| **Bridges** | 24 | vanilla stone arches at 23.4 / 42.1 / **52.2 m**; 9 plank/scaffold bridges; Ayleid stone bridges | yes |
| **Fences & enclosures** | 40 | **woven wattle fence** (Bethesda's most-placed fence, 757 uses — the most Argonian-reading vanilla mesh we own), dry-stone runs, stockade pikes/gate, phitt plank fence, **mushroom fences with slope-following and broken variants** | mixed |

The passerelles kit is the single most valuable family in this inventory: it is
a real *curving, climbing, branching* walkway system, which is exactly canon's
"platforms that sometimes extend high into the air, connecting to one another
and ascending from ground to hover above water and marsh."

Everything snaps on a **3.64 m module** (half-module 1.82 m), which matches the
mined snap module in `bmv-interior-assembly.json`.

---

## 4. Xanmeer and the ruin layer

| Family | Pieces | What it is | Have? |
|---|---|---|---|
| **Argonian Xanmeer Tileset** | 85 | **9 exterior** (wall, half-walls, corner, floor, half-floors, 9.3 m stairs, gazebo) · **27 interior** (1/2/3/4-way hallways, deadend, ramp, stairs, rooms, balconies, roofs, partitions) · **24 furniture** (covered beds, benches, bookshelves, braziers on/off, sconces on/off, doors, planter, table, 4 rubble walls) · **25 props** (chests basic/boss, urns 1–4 and pots each with a **broken twin**, deco, bannister, column, animated *chompy* trap) | **yes, extracted** |
| **Monumental pyramid silhouettes** | 11 | 9 whole mesoamerican temple statics (largest **67.7 × 65.1 × 36.4 m**), 2 composable pyramid halves | archived |
| **Drowned / underwater ruins** | 17 | 8 submerged building shells (one with an interior), 8 ruin fragments, a nautilus | archived |
| **Barsaebic Ayleid kit** | 231 | 85 exterior + 110 interior pieces, plus the `abx_` ring complex (outer/inner circles, gated ring walls with snap variants, spiral stairs, long bridge, well, screens) and 6 manny_gf pieces | archived |

**Era discipline:** Barsaebic Ayleid and xanmeer are *different historical
layers*. Do not use them interchangeably (00-core: historical layers stay
distinguishable).

---

## 5. Props, light and signage

| Family | Pieces | Notes |
|---|---|---|
| **General clutter & containers** | ~3,300 | barrels, crates (59), sacks, baskets (106), pottery (31 Oaristys pieces), jars, bowls, firewood, hay, bones and skulls (137), books, alchemy, rugs, tapestries, toys, treasure. Genuinely neutral — this is the family that narrates *who lives here* (POI recipe slot ③). |
| **Totems & ritual props** | 23 (+56 animal bones) | 6 generic wood/mud totems, skull totem + skull-totem torch, 3 stone totems, 5 skeleton totems, bone wand, drum. **No crocodile-skull totem, no plumage totem, and zero grave-stakes anywhere in any pool.** |
| **Fishing & waterside work** | ~60 | fishing net, pole, herring, 2 hanging food racks, **5 racked-boat statics** (9.6 m, heavily placed in BM&V), shipwreck boards, cargo. Thin for a fish-and-salt economy. |
| **Light fixtures** | 45 | **8 tiki torches** (incl. skull and deer-skull variants) are our best tropical/tribal read; 9 paper and metal lanterns with on/off pairs; 4 bone lanterns; xanmeer brazier + sconce (lit/unlit); campfires and candle lanterns. Bioluminescent flora from the Phase 10 kit is the distinctive alternative. |
| **Signage** | ~500 | **256 blank/named hanging inn-sign variants** (Jokerine's resource) + Riften/Solitude shop sets + 74 vanilla + signposts, sign columns, sign ropes. All lettering is Imperial/Nord. |
| **Landmarks & civic curiosities** | ~110 | gallows (6, with stairs and trapdoors — the Owing's enforcement furniture), 19 wayshrine pieces, 3 kinds of well, `azura_tree02` (BM&V's most-placed "architecture" asset, 523 uses — our best **Hist stand-in**), arena and panorama pieces, modular stair kit, cave mouths and mine rails. |

**Signage design note:** since all our lettering is Imperial, Argonia's own
wayfinding should lean **pictographic** — totems, hung objects, painted glyph
boards from the *blank* sign resource — with lettered signs reserved for the
Imperial fringe. That is a lore-correct answer to an asset constraint, not a
compromise.

**Light note:** the vanilla pool has exactly **one** mesh classified as a light
(the torch). Source-game illumination is engine light records plus a fixture
mesh, so every lantern and campfire we place needs *our* renderer to supply the
emitter — and it lands in the per-settlement static budget report.

---

## 6. Boats

| Family | Pieces | Notes |
|---|---|---|
| Hulls | 15 | Nord great ship / trade ship (+beached) / rowboat, Breton caravel / carrack / jolly boat, merchant ship, ghost ship, rowboat (+2 broken), Imperial hull + masts |
| Shipboard dressing | ~270 | BM&V's `randomresourceships-beds` set: beds, cabinets, food, toys, garden, jewellery |

**Every hull we own is keeled and sailed — i.e. foreign by canon.** Canon
Argonian craft are rafts, canoes and twin-hulled platform canoes: poled,
paddled or tail-driven, no keels; a sail marks a hull as Dunmer, Imperial or
Kothringi-derived. We own **zero rafts and zero canoes**. Moored boats are one
of the commonest props in a marsh settlement, so this gap shows everywhere.

---

## 7. Breadth we own — the honest summary

**We can build well today:** stilt and boardwalk villages, docks and ferry
stages, platform settlements that climb, Imperial stone-timber towns and
plantations, forts and toll castles, ruined and drowned variants of most of the
above, xanmeer *interiors*, Barsaebic Ayleid ruins, camps and markets, and
richly dressed interiors of any culture.

**We cannot yet build:** a *varied* Shadowfen mud village, a monumental xanmeer
skyline, a mooring that reads Argonian, a grave-stakes field, a working
saltern/fishery/kiln that reads as itself, or a Hist tree.

Rough counts of what is in hand: **8** distinct building shells/kits · **~3,000**
modular wall/roof pieces · **165** walkway and dock pieces · **~3,300** props ·
**~500** signage pieces · **130** landmark statics · **15** hulls.

---

## 8. Gaps <a id="gaps"></a>

| # | Gap | Severity | What it constrains | Module 90 candidates |
|---|---|---|---|---|
| 1 | **No modular mud-hut kit** — one of two canon cultures rests on ~3 monolithic shells, which fails the ≤25 %-per-template anti-sameyness quota on its own | critical | all Shadowfen / inland settlement design | §75 **Mud Mother Grove (SSE 146557)**, Marsh-Rest (50111), Xalfek (55595), Darkwater Den (52630) |
| 2 | **No stepped-pyramid xanmeer exteriors** — 9 exterior pieces, and the 11 monumental statics have no interiors and no variation | critical | every xanmeer, the deep-interior landmark layer, the province's most distinctive skyline | §79 CC Ayleid Ruin Resources (83999), Fort Castellum (23438), BS Bruma Ayleid |
| 3 | **No Argonian cultural props** — zero grave-stakes; no crocodile-skull or plumage totems, reed mats, turtle-shell dishes, seed dolls, frog pipes, chime sets | high | POI recipe slot ③ for every Argonian place; grave-stakes fields as a type | §75 Wares of Tamriel / Argonian cultural-prop projects, bone/wood resources |
| 4 | **No rafts or canoes** | high | every waterside settlement, mooring, ferry stage, raft village | §77 Skyrim Ferries (109843), Rowboats of Skyrim (35341), Sailboats (40057), L.V.X. Boats (36149) |
| 5 | **No Hist tree asset** | high | every Hist-centred settlement grammar; the ~10 hero Hist kickoff hook | compose from `azura_tree02` + `flora-province-v1`; else §75/§76 Roots of the Sleeping Tree, Hoddminir (38651) |
| 6 | **Thin working/industrial props** — no fish-drying racks, salterns, kilns, reed-cutting gear | medium | the *works* taxonomy branch; economic legibility | §75 Wares of Tamriel; vanilla fishing Creation content |
| 7 | **No causeway family** — canon's flexible buoyant timber causeway and stone-flagged causeway have no asset | medium | inter-settlement links, marsh legs of the eight-city road network | compose from passerelles + stockade (no download) |
| 8 | **Fixtures without emitters** | low | night legibility, static budget report | n/a — renderer work |
| 9 | **BM&V is still archived** — 12.8k meshes in `Data1.rar`, 24.6k textures in `Data2.rar`; only `extracted-ground/` is unpacked | blocking for 6b only | nothing in Parts 1–4 | selective extraction against `extract-list.txt` |

### Sourcing order for item 6b

1. **Mud Mother Grove (SSE 146557)** — closes the critical mud-culture gap (§80 priority 3).
2. **Marsh-Rest (50111) + Xalfek (55595)** — a second and third Argonian dwelling form, plus interior props.
3. **Selective BM&V extraction** — unlocks the house style: hut kit, passerelles, Dagon Fel docks, totems, tiki torches, monumental pyramids, drowned ruins.
4. **Skyrim Ferries (109843)** and/or **Rowboats of Skyrim (35341)** — rafts and small craft.
5. **CC Ayleid Ruin Resources (83999)** — monumental stone massing (§80 priority 7).
6. **Wares of Tamriel / Argonian cultural-prop projects** (§80 priority 8).
7. **Darkwater Den (52630)**, Glimmergrove / bioluminescent homes — organic interiors and a distinctive Argonian light language.

Credits for anything downloaded go into root `README.md` § Credits **in the same
change** (module 90 §73).

---

## 9. Where things live (vault map)

```
$ELDER_SOULS_ASSET_ROOT -> ~/skyrim-source   (symlinked as tooling/asset-pipeline/skyrim-source)
  Data/                                   vanilla BSAs + Skyrim.esm/Update.esm      HAVE
  mod-sources/xanmeer-tileset-181193/extracted/   Meshes/Architecture/xanmeer (89 MB) HAVE
  mod-sources/tropical-skyrim-33017/extracted/    1.4 GB; textures/architecture/*     HAVE
tooling/asset-pipeline/black-marsh-mod-source/    (gitignored, never commit)
  Data1.rar  1.3 GB   12.8k meshes                                              ARCHIVED
  Data2.rar  7.7 GB   24.6k textures                                            ARCHIVED
  extracted-ground/   51 MB landscape textures                                  extracted
  plugins/            Black Marsh.esm / North.esp / Valenwood.esp               HAVE
world/sources/assets/registry-*.jsonl     27,929 tagged rows — QUERY, never read
tooling/asset-pipeline/output/kits/       flora-province-v1, groundcover-province-v1
                                          (no settlement kit exists yet — item 6b)
```

Query the registry rather than grepping archives:

```bash
cd tooling/world-generation
python3 -m worldgen.asset_registry query --pool bmv --category architecture --contains hut
python3 -m worldgen.asset_registry query --pool xanmeer
```

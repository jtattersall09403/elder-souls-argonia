# Settlement asset inventory — what we can actually build with

**Phase 11, Part 0 item 6a** (decision [0041](../decisions/0041-phase11-settlement-decisions.md)).
Survey only — this agent downloaded nothing; item 6b owns downloads and ran concurrently.

> **Revised twice on 2026-09-02.** Round 2 swept the whole vault after owner
> feedback that round 1 under-searched. **Round 3 folds in item 6b's completed
> sourcing pass** (`commits cc15ae4, b5d824e`). **Six of nine gaps are now
> closed and five kits are built** — see [§0](#round2). Earlier conclusions are
> superseded wherever they disagree.
>
> **Companion doc:** [settlement-kit-sourcing-log.md](settlement-kit-sourcing-log.md)
> records what item 6b downloaded, registered, kitted **and rejected**. Read its
> skip table before proposing any new download — 11 mods have already been
> opened and ruled out.

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

## 0. Where we stand <a id="round2"></a>

### Round 3 — after item 6b's sourcing pass

**Eight further pools were sourced**, and the picture is now good:

| Gap | Status | Closed by |
|---|---|---|
| Mud-hut variety | **CLOSED** | HTBM's two bamboo huts (+interiors) + Mud Mother Grove + BM&V — three form sources clear the 25 %-per-template quota |
| Xanmeer **massing** | **CLOSED** | Ayleid Ruins Building Kit — 85 exterior pieces (blocks, quad blocks, stairs, statue walls, bridges, towers) |
| Xanmeer **ornament** | **CLOSED** | HTBM's 57-piece xanmeer set — feathered-serpent and serpent-sigil statues, goddess, gargoyle, runic stone, totems, skull stack |
| Argonian props | **CLOSED** | Mud Mother Grove + HTBM's wicker family + xanmeer urns/pots |
| Hist tree | **CLOSED, two variants** | Mud Mother Grove (27×28×22 m) **and** Skyfall (18.4×24.2×16.3 m) + Hist flowers + LOD |
| Rafts | **CLOSED** | `ferryraft01` (a real poled raft), `plank_ferry_swamp_01/03`, two flat-bottomed Cyrodiilic ferries |
| Canoes | **CLOSED** | `canoe1.nif` — the only genuine canoe mesh on Nexus, either domain |
| Drowned/underwater layer | **NEWLY SERVED** | SIRENROOT's walkable submerged rubble + caustics; Depths of Skyrim reef flora |

**Five kits are built:** `settlement-mud-v1`, `settlement-stilt-v1`,
`settlement-imperial-v1`, `ruin-monumental-v1`, `underwater-v1`.

**Still open — and all three are unsourceable, so treat them as design
constraints, not pending deliveries:**

1. **Working/industrial props** (saltern, kiln, reed-cutting gear) — the largest
   remaining gap; *nothing exists on Nexus*. Works sites must be distinguished
   by **layout and dressing**, not bespoke props. Write Part 1 descriptions
   accordingly.
2. **Twin-hulled platform canoes and reed boats** — canon Tide-Born craft; do
   not exist anywhere. Kitbash two hulls + a passerelle deck, or drop the form.
   **Owner steer wanted.**
3. **True grave-stakes** — no staked-dead mesh exists. Skyfall's four rock
   cairns and rune circle plus HTBM's totems are the working substitute.

Three corrections to my own earlier rounds: **Here There Be Monsters was wrongly
called "an index, not a source"** — 6b took it and it is the biggest single win
of the phase; **BM&V extraction is no longer a blocker** (`RarSource` pulls
single members on demand in ~0.1 s); and the **owner ruled the "no porting to
other games" clauses approved**, which unblocked the Ayleid kit and the canoe.

> ⚠️ **One unresolved conflict.** 6b registered **Darkwater Den** as a pool, but
> its README forbids use of Elianora-original meshes in "any PUBLIC WORK under
> ANY CIRCUMSTANCES" and we deploy publicly. The owner's porting ruling doesn't
> obviously cover a blanket public-work ban. Recorded in 0041's owner Q&A —
> **until it's ruled on, don't write an asset plan that needs `eli*.nif`**; the
> rest of the vault covers the same clutter roles.

### Round 2 — what the full-vault sweep changed

Round 1 surveyed the asset registry and the two big pools but did not walk every
vault directory. In the meantime the concurrent item-6b agent landed **seven
mods**. Sweeping the whole vault changed five of the nine gaps:

| Round 1 said | Round 2 finds |
|---|---|
| **No Hist tree asset** (high) | **CLOSED.** `HistTree.nif` (167 KB) ships in Mud Mother Grove with a matching `fxHistMist01.nif` atmosphere effect. |
| **No Argonian cultural props** (high) | **CLOSED except grave-stakes.** Mud Mother Grove supplies totem, Sithis shrine, skull, bone, two bone-chime assemblies, drum, woven furniture, baskets, painted pottery, shell and chitin pieces, a carapace oven and a fish rack. |
| **No modular mud-hut kit** (critical) | **PARTIALLY CLOSED, downgraded to medium.** A real Shadowfen aesthetic now exists — but as whole shells, so *variety* is the problem, not existence. |
| **No stepped-pyramid xanmeer massing** (critical) | **DOWNGRADED to medium — round 1 misread the geometry.** The 9 "exterior" pieces are a *terrace kit*; stacking terraces of decreasing footprint **is** a stepped pyramid. What is missing is ornamental frontage, not massing. |
| **No rafts or canoes** (high) | **CONFIRMED FULLY OPEN.** Both boat mods that landed are keeled, oar-rowed Nord clinker hulls. This is now the top sourcing job. |

Plus three findings round 1 missed entirely:

- **Permissions are unrecorded** on the three mods that matter most — and
  **Darkwater Den (52630) is outright blocked** for us (see §10).
- **The vault has no Skyrim DLC** — no Dawnguard, Hearthfire or Dragonborn
  BSAs. Module 90 §74.1 assumes we have them. The real loss is Hearthfire's
  modular buildable-homestead timber kit.
- **Two of the landed mods contribute ~nothing**: Marsh-Rest (50111) is a
  plugin with *zero* meshes; Xalfek (55595) is re-bundled third-party clutter
  with a generic Nord shack. Round 1 ranked Marsh-Rest #2 to source — wrong.

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
| **HTBM bamboo village set** — `bamboohut01/02` each **with a matched interior** + door, `stilthouseplatform` (Kothringi), **11-piece Tamu dock/plank family incl. 3 broken planks**, wicker chair/sofa/table/basket/chest, stone wall arch/curve/pillar, awnings | reed/stilt | 37 | `htbm` pool → `.../architecture/villages/` | golden bamboo, woven wicker straw, weathered dock plank, palm thatch | intact + 3 broken planks | **yes** |
| **Mud Mother Grove Argonian set** — `MudHut01` + matched interior, `RoundFloor01`, `ThatchRoofing`, 2 Argonian tents, 2 platforms, `ArgonianBridge` (459 KB, the mod's largest asset) + bridge start, archway sticks, **7 fence pieces** (Argonian ×3, Snake ×3, Woven) | mud | 20 | `mod-sources/mud-mother-grove-146557/extracted/Meshes/GV_Meshes/ArgonianNest/` | wet ochre mud, sun-baked daub, grey thatch, lashed stick, woven reed | intact | **yes ⚠ permissions unread** |
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
| **Argonian Xanmeer Tileset** | 85 | **9 exterior — a TERRACE KIT** (floor slab 3.63 m, half-floors, wall 3.63 m, half-walls, corner 4.10 m, **monumental stair 9.30 m run / 4.75 m rise**, gazebo). Stack terraces of decreasing footprint and this *is* a stepped pyramid; the stair rise matches one terrace height · **27 interior** (1/2/3/4-way hallways, deadend, ramp, stairs, rooms, balconies, roofs, partitions) · **24 furniture** (covered beds, benches, bookshelves, braziers on/off, sconces on/off, doors, planter, table, 4 rubble walls) · **25 props** (chests basic/boss, urns 1–4 and pots each with a **broken twin**, deco, bannister, column, animated *chompy* trap) | **yes, extracted** |
| **Monumental pyramid silhouettes** | 11 | 9 whole mesoamerican temple statics (largest **67.7 × 65.1 × 36.4 m**), 2 composable pyramid halves | archived |
| **Drowned / underwater ruins** | 17 | 8 submerged building shells (one with an interior), 8 ruin fragments, a nautilus | archived |
| **Barsaebic Ayleid kit** | 231 | 85 exterior + 110 interior pieces, plus the `abx_` ring complex (outer/inner circles, gated ring walls with snap variants, spiral stairs, long bridge, well, screens) and 6 manny_gf pieces | archived |

| **Ayleid Ruins Building Kit** (classic 90667) | 195 | **85 EXTERIOR monumental pieces** — blocks, quad blocks, stairs, statue walls, bridges, towers — plus 110 interior modules. This is the massing. | **yes** |
| **HTBM xanmeer ruin set** | 108 | **The ornament nothing else had:** `serpentstatue`, `serpentstatue_feathered`, `serpentsigilstatue` (+gold), `serpentsigilstone`, `statuegoddess`, `gargoyle01` (+gold), `runicstone`, `skullstack01`, `totem01–03`, `skeletontotem01–04`, 3 Hawaiian deity statues. Plus `1mjyaztecbuilding1–9`, `redruin1–4`+gate, pillars, free walls, `3mjyunderwaterruins1–8`, and a macabre set (crucified skeletons, shackles, torture racks) | **yes** |
| **CC Ayleid Ruin Resources** (SSE 83999, in vault) | 68 | **INTERIOR ONLY** — every mesh sits under `/interior/`. Corridor/hall kit (~15), raised floors and platforms, 3 wall-hugging stairs, **6–7 bridges incl. curved and ramped facade spans**, a stepped *dais* (room-scale, not a terrace), furniture, **a puzzle set: `ARPuzzlePillar` + six school `magicstone` pieces**, traps, ledge screens, rubble | **yes, clean permissions** |

**Era discipline:** Barsaebic Ayleid and xanmeer are *different historical
layers*. Do not use them interchangeably (00-core: historical layers stay
distinguishable).

**Round-3 update:** both halves are now closed — the Ayleid kit supplies the
monumental massing and HTBM supplies the Mesoamerican-idiom ornament. Combine
three sources per site and keep the era discipline: decide whether a given ruin
is *Barsaebic Ayleid* or *xanmeer* and dress it consistently.

**Round-2 correction on the xanmeer exterior.** Round 1 called this a critical
gap; that was a misreading. Nine pieces sound thin until you notice they are
*exactly* the vocabulary for one terrace — slab, perimeter wall, corner, and a
monumental flight whose rise equals a terrace's height. What we genuinely lack
is **ornamental frontage**: carved facades, roof combs, sculpted stairways and
the stone causeway bridges canon puts between pyramids. So our xanmeers will
read as **clean geometric terracing** rather than ornate Mesoamerican relief.
Design to that; it is a look, not a blocker.

CC Ayleid Ruin Resources landed in the vault expecting to fill this and does
**not** — but its curved bridges, raised platforms and puzzle pillars are close
to the ESO Xanmeer interior look and directly serve canon's trap brief (the
bijum door release, the tutan-wei pulley puzzle). Catalogue it as a xanmeer
*interior* extension.

---

## 5. Props, light and signage

| Family | Pieces | Notes |
|---|---|---|
| **General clutter & containers** | ~3,300 | barrels, crates (59), sacks, baskets (106), pottery (31 Oaristys pieces), jars, bowls, firewood, hay, bones and skulls (137), books, alchemy, rugs, tapestries, toys, treasure. Genuinely neutral — this is the family that narrates *who lives here* (POI recipe slot ③). |
| **Skyfall Hist set** | 19 | `ancient sleeping tree` (**second hero Hist**, 18.4×24.2×16.3 m), `histflower01/02`, **`rockcairn01–04` + `rune circle`** (8.1×9.0 m — our grave-stake substitute), `windchimehavok` (pairs with Mud Mother Grove's bone chimes for the *chime-maker*), lanterns, light pedestal, incense, 3 forsworn staves re-purposable as tribal markers |
| **Argonian cultural props** (Mud Mother Grove) | 30 | **Ritual:** `ArgonianTotem01`, `SithisShrine`, `ArgonianSkull01`, `ArgonianBone01`, **`ArgonianBoneChime01/02`** (137 KB and 109 KB — substantial hanging assemblies, and a direct fit for the canon *chime-maker* office), `Drum01`. **Woven/reed:** woven chair, table and fence, 2 baskets, pillow. **Pottery:** painted urn, cup, 3 plates. **Shell/chitin:** shell half, chitin chair, **carapace oven**. **Fishing:** fish rack, clam. **Soft:** 3 wall hangings, banner. **Storage:** 3 shelf types. |
| **Totems & ritual props** (generic) | 23 (+56 animal bones) | 6 generic wood/mud totems, skull totem + skull-totem torch, 3 stone totems, 5 skeleton totems, bone wand, drum. Still **no grave-stakes anywhere in any pool** — the one Argonian prop sub-family Mud Mother Grove does not cover. |
| **Fishing & waterside work** | ~60 | fishing net, pole, herring, 2 hanging food racks, **5 racked-boat statics** (9.6 m, heavily placed in BM&V), shipwreck boards, cargo. Thin for a fish-and-salt economy. |
| **Argonian lights** (Mud Mother Grove) | 6 | `ArgonianLanterns01` (220 KB, likely a hung cluster) through `04`, plus 2 candles. Preferred over tiki torches and paper lanterns for Argonian settlements. **No unlit variants** — a day/night swap must be authored, unlike the xanmeer sconce/brazier pairs. |
| **Light fixtures** (general) | 45 | **8 tiki torches** (incl. skull and deer-skull variants) are our best tropical/tribal read; 9 paper and metal lanterns with on/off pairs; 4 bone lanterns; xanmeer brazier + sconce (lit/unlit); campfires and candle lanterns. Bioluminescent flora from the Phase 10 kit is the distinctive alternative. |
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

| Skyrim Ferries (109843, in vault) | 89 files ≈ **5 hulls** | `common_rowboat_inialta`, **`plank_ferry_*` incl. `_swamp_01–06`**, `rowboat_ferry_*`, 2 `river_ferry_*`, 2 `volkihar_ferry_*`. The 89 files are **per-location placed instances with route baked in**, not 89 boats |
| Rowboats of Skyrim (35341, in vault) | 3 | `shiprowboat01`, `shiprowboatanim01` (bobbing), **`ShipOar01`** standalone oar |

### Round 3 — the native-craft gap is closed

| Hull | Pool | Note |
|---|---|---|
| **`canoe1.nif`** | `canoe` | **The only genuine canoe mesh on Nexus**, either domain. ⚠ Registered under category `creature` (it lives under `meshes/actors/` as a rideable rig) — a category filter will hide it |
| **`ferryraft01.nif`** (+ no-collision variant) | `ferryraft` | An actual **poled raft** |
| `plank_ferry_swamp_01`, `_03` | `ferries` | Keel-less plank rafts. ⚠ `_02/04/05/06` are **editor markers with no geometry — do not place them** |
| 2 flat-bottomed Cyrodiilic ferries + rowboat | `sbot` | Imperial-fringe read |
| `shipoar01` ×3 forms | `canoe` | Paddle / punt-pole prop |

6b swept both Nexus domains and *opened* the credible candidates rather than
trusting descriptions. The finding, stated plainly: **the Nexus boat scene is
almost entirely retextures of one vanilla keeled rowboat** — `canoe`, `dugout`,
`punt`, `skiff`, `coracle` and `barge` return *zero* mod names. The six
keel-less or flat-bottomed hulls above are everything that exists, and they are
all now in the vault.

**Unsourceable:** twin-hulled platform canoes and reed boats. Canon gives the
Tide-Born "large twin-hulled canoes, with living platforms spanning the space
between the hulls" — no such asset exists anywhere. Kitbash two hulls plus a
passerelle deck, or drop the form. **Owner steer wanted.**

**Also dead:** Tropical Skyrim ships **no boat or ship meshes and no boat
textures** — its only "ship" file is a Whiterun building panel. Background
moorings use the sourced hulls.

### Round 2's assessment (superseded above)

**Every hull we own is keeled, planked and oar-rowed — i.e. foreign by canon**,
and round 2 confirmed this *including* the two boat mods that just landed.
Canon Argonian craft are rafts, canoes and twin-hulled platform canoes: poled,
paddled or tail-driven, no keels; a sail marks a hull as Dunmer, Imperial or
Kothringi-derived. We own **zero rafts, zero dugout canoes, zero coracles, zero
poled punts**. Moored boats are one of the commonest props in a marsh
settlement, so this gap shows everywhere — it is now the **top sourcing job**.

Two salvage points: **`ShipOar01`** is a re-purposable paddle or punt-pole prop,
and **`shiprowboatanim01`** is the pattern for moored-boat bobbing motion.

> **Owner eyeball wanted:** `plank_ferry_swamp_01–06`. A "plank ferry" for a
> swamp *might* read as a flat-bottomed poled punt (usable) or as an obvious
> Nord rowboat (not). One look settles it.

---

## 7. Breadth we own — the honest summary

**We can build the province.** Stilt, boardwalk, bamboo and mud villages;
docks, ferry stages and moorings with *native* craft; Imperial stone-timber
towns, plantations, forts and toll castles; xanmeer with both monumental massing
and carved ornament; Barsaebic Ayleid ruins; drowned villages the player can
swim into and stand in; camps and markets; Hist groves with two distinct hero
trees; and richly dressed interiors of any culture.

Counts in hand: **18** building shells/kits · **~3,070** modular wall/roof
pieces · **183** walkway and dock pieces · **~3,330** props · **~500** signage ·
**240** landmark statics · **30** hulls (of which **6** keel-less/flat-bottomed)
· **247** underwater pieces · **2** Hist trees · **5** built kits.

**Round over round.** Round 1 named five critical/high gaps and under-searched.
Round 2's vault sweep closed two and downgraded one. Round 3's completed
sourcing pass closed four more, added the underwater layer, and — just as
usefully — **proved the three remaining gaps have no Nexus answer at all**, so
nobody needs to go looking again.

---

## 8. What's still open <a id="gaps"></a>

Only three things, and none of them can be bought. Treat them as **design
constraints to write around**, not pending deliveries.

| Gap | Why it can't be closed | What to do instead |
|---|---|---|
| **Working/industrial props** — saltern, kiln, reed-cutting gear | 6b's sweep found nothing on Nexus. The vault has one fish rack and one carapace oven | Distinguish works sites by **layout, arrangement, fire, stock and the stockade/scaffold family** rather than bespoke props. Part 1 should write *works* descriptions this way from the start |
| **Twin-hulled platform canoes / reed boats** | Do not exist on either Nexus domain | Kitbash two hulls + a passerelle deck, or drop the Tide-Born boat form. **Owner steer wanted** |
| **True grave-stakes** | No staked-dead mesh exists anywhere | Skyfall's 4 rock cairns + rune circle, HTBM's totems and skull stack, stockade pikes. A staked-dead *field* can be built from these |

Plus two administrative items:

- **Darkwater Den permissions conflict** — see §9; don't depend on `eli*.nif`.
- **No Skyrim DLC in the vault** — Hearthfire's modular homestead timber kit is
  the one genuinely missing building kit. Extractable if the owner owns the DLC.

Everything else from rounds 1–2 is closed: mud-hut variety, xanmeer massing and
ornament, Argonian cultural props, Hist trees, rafts, canoes, the drowned layer,
and BM&V extraction (no longer a blocker — `RarSource` reads members on demand).

### Notes for whoever builds with these kits

- **Kit pieces snap to the 3.64 m grid around a *centred* pivot.** `vet_kit`'s
  ~30 "pivot above base" findings are expected, not defects — that check was
  written for bottom-anchored flora. **The settlement compiler must place kit
  pieces by grid transform, never by the flora bottom-anchor path.**
- `plank_ferry_swamp_02/04/05/06` are **editor markers with no geometry**.
- `canoe1` is registered under category **`creature`** (it lives under
  `meshes/actors/`); category filters will hide it.
- SIRENROOT and Depths borrow textures from the Ayleid and `sbot` pools via
  `build_kit`'s sibling-texture-pool table — without it they export as grey
  slabs, and the lending pools must stay credited.
- **HTBM's 768 armour and 256 creature meshes** (Kothringi, Xanmeer, Legion,
  Naga) are a **Phase 13** resource. Phase 13 mines *this vault pool*, not Nexus.
- Argonian **equipment** candidates live in
  [90-asset-strategy §75.1](../world/90-asset-strategy.md) — recorded, not
  sourced (out of Phase 11 scope). Cross-reference; don't duplicate.

---

## 9. Permissions — two things needing the owner <a id="permissions"></a>

**① Darkwater Den (52630) is unusable for us.** Its `README.txt` states the
Elianora-original models "are not allowed to be used or reverse-engineered for
any PUBLIC WORK under ANY CIRCUMSTANCES". We ship publicly on GitHub Pages, so
every `eli*.nif` is off-limits. Catalogue it **reference-only, do not ship**.
Its interesting pieces (`treeofwolene4`, the Angilla forest throne, the
Morrowind urn) must be re-sourced from their upstream packs, not lifted.

**② "No porting to other games" — RULED ON 2026-09-02: APPROVED.** The owner
ruled these clauses acceptable — we are a standalone Skyrim conversion for
private personal use, credited as such. This unblocked the **Ayleid Ruins
Building Kit** and the **canoe**, i.e. two of the then-open gaps. Every
registered pool is credited in root `README.md` and checked mechanically by
`python3 -m worldgen.check_credits`. The original concern, for the record:

**②(historic) "No porting to other games" needed an owner ruling.** Several otherwise-ideal
sources carry that clause — the **Ayleid Ruins Building Kit** (Skyrim/Morrowind
only), **Argonian Funerary Masks**, and **Script Free Ship Sailing**. Our project
runs in a *browser engine* rather than in Skyrim, so the clause is arguably
tripped. This is not an agent's judgement to make, and it bites on two of our
remaining gaps: the biggest monumental-stone kit on Nexus, and the only genuine
canoe mesh.

**Cleanest terms found:** Argonian Xanmeer Tileset · CC Ayleid Ruin Resources
(not sold + credit Sarthes Arai) · Stroti's resources · Tamira's New Plants ·
RoboBirdie's packs · Oaristys/Tony67 Modder's Resource Pack · Ships and boats of
Tamriel.

**One cross-check flag:** BM&V bundles `meshes/architecture/swamp house.nif`,
which this inventory catalogues (observed 47× in BM&V's own worldspace).
A Nexus mod of the same name (`skyrim:89966`) was ripped from the commercial
game *Sniper: Ghost Warrior 2*. **If they are the same asset it is unusable —
verify before relying on it.**

---

## 9b. Nexus research — headline findings

Research only; nothing was downloaded *by this agent*. Item 6b then acted on
it — where the two disagree, **the sourcing log wins**, because 6b downloaded and
opened the meshes while this was description-level research. Full candidate
tables live in the JSON under `nexusResearch`. Four findings worth knowing:

- **No true Argonian mud-hut modular kit exists on Nexus.** ESO/Murkmire ports
  don't exist (ZeniMax assets aren't permitted) and Beyond Skyrim: Argonia has
  released no public assets. **The mud culture will be kitbashed, permanently** —
  plan for that rather than waiting for a kit.
- **No dugout, outrigger, twin-hulled, reed or raft-village asset exists**
  either. Exactly *one* genuine canoe mesh was found on all of Nexus. That gap
  is bound by **permissions, not availability**.
- **No banyan or mangrove pack exists** — matching the repo's Phase 10 finding.
- ~~**Here There Be Monsters** is an index, not a source.~~ **WRONG — corrected
  in round 3.** 6b took it and it is the biggest single win of the phase: 1,579
  meshes of purpose-built Black Marsh content. Its credits list is still a useful
  bibliography, but the mod itself is now a first-class pool.

*Method note for future asset hunts:* Nexus's **v2 GraphQL API**
(`api.nexusmods.com/v2/graphql`, same `apikey:` header) supports a `mods` query
filtering on `nameStemmed`, `description`, `uploader`, `author` and
`categoryName`. It works from this VM where plain page fetches 403, and is far
faster than web search. Filters must be a **flat** dict, one domain at a time.
`modFileContents` (mesh-filename search) returns nothing for Skyrim — not indexed.

---

## 9. Where things live (vault map)

```
$ELDER_SOULS_ASSET_ROOT -> ../elder-scrolls-asset-pipeline/skyrim-source
                            (symlinked as tooling/asset-pipeline/skyrim-source)
  Data/          BASE GAME ONLY — Meshes/Textures/Animations BSAs + Skyrim.esm,
                 Update.esm.  NO Dawnguard / HearthFires / Dragonborn / Sounds.
  mod-sources/
    xanmeer-tileset-181193/       85 nif — terrace kit + interiors + props   HAVE
    tropical-skyrim-33017/        1.4 GB — textures only; NO arch meshes,
                                  NO boat meshes, NO boat textures            HAVE
    mud-mother-grove-146557/      62 nif — mud huts, props, HIST TREE   HAVE ⚠perms
    cc-ayleid-ruin-resources-83999/  68 nif — INTERIOR only          HAVE (clean)
    skyrim-ferries-109843/        89 files ≈ 5 hulls                  HAVE ⚠perms
    rowboats-of-skyrim-35341/     3 nif                                      HAVE
    htbm-35933/                   1,579 nif — bamboo huts, wicker, Tamu docks,
                                  xanmeer ornament; + Phase 13 armour/creatures
    ayleidkit-90667/              195 nif — 85 EXTERIOR monumental pieces
    histtree-116792/              19 nif — 2nd hero Hist, flowers, cairns
    canoe-67727/                  canoe1.nif + oars
    ferryraft-89948/              ferryraft01.nif — a real poled raft
    sbot-41653/                   flat-bottomed ferries, wrecks, ship interiors
    depths-26913 (+174995 fixes)/ reef/bed flora for the drowned layer
    sirenroot-70917/              walkable submerged rubble + caustics
    xalfek-55595/                 72 nif — re-bundled 3rd-party, low value
    marsh-rest-50111/             1 file (an .esp) — NO ASSETS
    darkwater-den-52630/          124 nif — ⛔ DO NOT SHIP (permissions)
    aendemika-59713, project-rainforest-20636, cc0-ground-textures,
    community-maps, all-tamriel-heightmap-573, tamriel-worldspaces-118678,
    lore/, api/, archives/                        (ground textures, maps, meta)
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

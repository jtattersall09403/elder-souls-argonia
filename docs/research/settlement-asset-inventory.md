# Settlement asset inventory — what we can actually build with

**Phase 11, Part 0 item 6a** (decision [0041](../decisions/0041-phase11-settlement-decisions.md)).
Survey only — this agent downloaded nothing; item 6b owns downloads and ran concurrently.

> **Revised 2026-09-02 (round 2)** after owner feedback that round 1 under-searched.
> The full-vault sweep changed the picture substantially — see
> [§0 What round 2 changed](#round2). Round 1's conclusions are superseded
> wherever the two disagree.

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

## 0. What round 2 changed <a id="round2"></a>

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

| **CC Ayleid Ruin Resources** (SSE 83999, in vault) | 68 | **INTERIOR ONLY** — every mesh sits under `/interior/`. Corridor/hall kit (~15), raised floors and platforms, 3 wall-hugging stairs, **6–7 bridges incl. curved and ramped facade spans**, a stepped *dais* (room-scale, not a terrace), furniture, **a puzzle set: `ARPuzzlePillar` + six school `magicstone` pieces**, traps, ledge screens, rubble | **yes, clean permissions** |

**Era discipline:** Barsaebic Ayleid and xanmeer are *different historical
layers*. Do not use them interchangeably (00-core: historical layers stay
distinguishable).

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

**We can build well today:** stilt and boardwalk villages, docks and ferry
stages, platform settlements that climb, Imperial stone-timber towns and
plantations, forts and toll castles, ruined and drowned variants of most of the
above, xanmeer interiors *and* terraced exteriors, Barsaebic Ayleid ruins,
camps and markets, richly dressed interiors of any culture — and now a genuine
**Shadowfen mud culture**, the **Argonian prop language** (totems, bone-chimes,
woven goods, painted pottery, shell and chitin) and a **Hist tree**.

**We still cannot build:** a mooring that reads Argonian (no rafts or canoes),
a grave-stakes field, an *ornate* monumental xanmeer frontage, or a working
saltern/kiln that reads as itself. Mud-hut *variety* is thin — the culture
exists on about four whole shells.

Rough counts in hand: **13** building shells/kits · **~3,070** modular
wall/roof pieces · **172** walkway and dock pieces · **~3,330** props ·
**~500** signage · **132** landmark statics · **20** hulls · **1** Hist tree.

**Round over round:** of round 1's five critical/high gaps, vault contents
**closed two** (Hist tree, Argonian props), **partially closed one** (mud kit),
**downgraded one** on re-reading the geometry (xanmeer exteriors), and
**confirmed one fully open** (rafts/canoes). Two new gaps appeared: unrecorded
permissions on the mods we now depend on, and no Skyrim DLC in the vault.

---

## 8. Gaps <a id="gaps"></a>

| # | Gap | Status after round 2 | Severity | Candidates |
|---|---|---|---|---|
| 1 | **Rafts and canoes** — every hull is a keeled, oar-rowed Nord clinker craft, *including* both boat mods that just landed | **CONFIRMED FULLY OPEN — now the top job** | high | Ships and boats of Tamriel (SSE 41653) — barges + river ferries, the only flat-bottomed hulls found, and permissions-clean; Vicn's raft rig (SSE 109321); Script Free Ship Sailing (LE 67727) has the *only* genuine canoe mesh but restrictive terms |
| 2 | **Permissions unrecorded** on Mud Mother Grove, Xalfek and Skyrim Ferries; **Darkwater Den outright blocked** | **NEW** | high | not an art job — see §10 |
| 3 | **Mud-hut variety** — the culture now exists, but on ~4 whole shells, none modular | **PARTIALLY CLOSED**, was critical | medium | Stroti's Stilt House (LE 61824, clean terms, splittable); Orcish Hut Kit (LE 52289); Bosmer City Kit (LE 66036) |
| 4 | **Ornamental monumental frontage** — the terrace kit can *mass* a pyramid; carved facades, roof combs, sculpted stairways and stone causeway bridges are what is missing | **DOWNGRADED**, was critical | medium | Ayleid Ruins Building Kit (LE 90667) — 250+ pieces with an explicit *Exteriors* subset, the biggest on Nexus, **but LE-only and Skyrim/Morrowind-only terms**; Desert Ruins Tileset (SSE 185420) |
| 5 | **Grave-stakes / burial markers** — zero in any pool; the grave-singer's staked dead are canon and a place type | **remaining sub-gap** of the closed props gap | medium | Hovels of Hagravens (SSE 166188) "pointy sticks" — the only lead found; Skyfall's Hist cairns and rune circle |
| 6 | **No Skyrim DLC in the vault** — no Dawnguard, Hearthfire or Dragonborn BSAs | **NEW** | medium | owner-owned DLC extraction. Real loss = Hearthfire's modular homestead timber kit |
| 7 | **No causeway family** — canon's buoyant timber and stone-flagged causeways | unchanged | medium | compose from passerelles + stockade (no download) |
| 8 | **Thin working props** — salterns, kilns, reed-cutting gear | mostly unchanged (Mud Mother Grove adds one fish rack) | medium | Wicker Set (LE 66282); CS' Fishing Nets (SSE 96720) |
| 9 | **BM&V still archived** — 12.8k meshes in `Data1.rar` | unchanged | blocking for 6b only | selective extraction |
| 10 | **Hist tree** | **CLOSED** | resolved | authoring problem now, not sourcing — one mesh for ten hero Hist |
| 11 | **Argonian cultural props** | **CLOSED** except grave-stakes | low | — |
| 12 | Fixtures without emitters; Tropical Skyrim has no arch meshes | unchanged | low | — |

### Corrected sourcing order for item 6b

0. **Read and record the Nexus Permissions tabs** for Mud Mother Grove (146557),
   Skyrim Ferries (109843) and Xalfek (55595); mark Darkwater Den (52630)
   do-not-ship. Not an art job — but the province's visual plan now leans on
   Mud Mother Grove, whose terms nobody has read.
1. **A raft / canoe / poled-punt source** — the only round-1 gap the vault did
   not move at all.
2. **Skyfall's Sleeping Hist Tree Overhaul (SSE 116792)** — *new in round 2*.
   Even though the Hist gap is closed, this brings LOD, **mesh variants**
   (dead-leafless, purple-glow) that solve the one-mesh-for-ten-hero-Hist
   problem, hanging tribal lanterns, and carved cairns and a rune circle that
   double as our best grave-marker substitute. Lore-correct: the vanilla
   Sleeping Tree *is* a Hist sapling.
3. **Selective BM&V extraction** — unchanged, still the biggest single unlock.
4. **More mud/tribal hut forms** — downgraded from round 1's #1.
5. **Grave-stakes / burial markers.**
6. **Ornamental monumental frontage** — downgraded from round 1's critical.
7. **Skyrim DLC** if the owner owns it (Hearthfire above all).
8. **Working-infrastructure props.**

Credits for anything downloaded go into root `README.md` § Credits **in the same
change** (module 90 §73).

---

## 9. Permissions — two things needing the owner <a id="permissions"></a>

**① Darkwater Den (52630) is unusable for us.** Its `README.txt` states the
Elianora-original models "are not allowed to be used or reverse-engineered for
any PUBLIC WORK under ANY CIRCUMSTANCES". We ship publicly on GitHub Pages, so
every `eli*.nif` is off-limits. Catalogue it **reference-only, do not ship**.
Its interesting pieces (`treeofwolene4`, the Angilla forest throne, the
Morrowind urn) must be re-sourced from their upstream packs, not lifted.

**② "No porting to other games" needs an owner ruling.** Several otherwise-ideal
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

Research only; nothing was downloaded. Full candidate tables with mod IDs,
authors, contents, permissions and confidence live in the JSON under
`nexusResearch`. Four findings worth knowing before you plan anything:

- **No true Argonian mud-hut modular kit exists on Nexus.** ESO/Murkmire ports
  don't exist (ZeniMax assets aren't permitted) and Beyond Skyrim: Argonia has
  released no public assets. **The mud culture will be kitbashed, permanently** —
  plan for that rather than waiting for a kit.
- **No dugout, outrigger, twin-hulled, reed or raft-village asset exists**
  either. Exactly *one* genuine canoe mesh was found on all of Nexus. That gap
  is bound by **permissions, not availability**.
- **No banyan or mangrove pack exists** — matching the repo's Phase 10 finding.
- **Here There Be Monsters – Sign of Cipactli (SSE 35933)** is a full Black
  Marsh worldspace, but it is a compilation of ~80 other people's resources.
  Treat its credits list as a **verified bibliography** of exactly the assets a
  Black Marsh builder needs, and go to the originals — never to it.

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
    tropical-skyrim-33017/        1.4 GB — textures only, no arch meshes     HAVE
    mud-mother-grove-146557/      62 nif — mud huts, props, HIST TREE   HAVE ⚠perms
    cc-ayleid-ruin-resources-83999/  68 nif — INTERIOR only          HAVE (clean)
    skyrim-ferries-109843/        89 files ≈ 5 hulls                  HAVE ⚠perms
    rowboats-of-skyrim-35341/     3 nif                                      HAVE
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

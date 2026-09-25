# King of the Murkmire: adoption plan by build stage (research, 2026-09-24)

KotM (Nexus SSE 190459, pancake0723, v1.0.2) is a 2,292-mesh, 726-texture pool with 88 furnished
interiors, 120 load doors and 29,746 placed exterior refs, but three facts gate "use everything":
(1) 692 of its 2,292 meshes name at least one texture found neither in its archive nor in
vanilla Skyrim (1,971 refs, 1,791 after the vault's Ayleid kit), and 4,897 of its 56,974 placed
model refs point at DLC, Creation Club and `_ResourcePack` archives the vault does not hold (the
mud huts and the Ayleid ruins among them); (2) its archive ships no sound except 1,175 voice files the author
forbids, and no creature animation; (3) the raw pool is 1.65 GB, which cannot all ship under the
900 MB site gate.

Evidence files (scripts and outputs): `/tmp/wf/buildings/kotm/` (`census.py` plugin census;
`an2`–`an8`, `tex`, `tris.py` measurements with `.out` files; `interiors.txt`; `dialogue.tsv`,
`books.txt`, `npc_names.txt`); Nexus metadata `/tmp/wf/buildings/kotm_nexus.json`, description
`/tmp/wf/buildings/kotm_desc_clean.txt`. Vault root `V` =
`../elder-scrolls-asset-pipeline/skyrim-source/mod-sources/king-of-the-murkmire-190459/`.

## Reconciliation

| Live doc | Claim | Verdict |
|---|---|---|
| `docs/research/placement-settlements/settlement-kit-sourcing-log.md:204` | "none is extracted yet"; `mwkeep` statistics only | SUPERSEDED: `V/extracted/meshes` + `textures` hold 3,018 files (2,292 meshes + 726 textures, `find -type f`, 2026-09-24; 372 MB + 1,281 MB); the `kotm` pool is registered (`asset_registry.py:324`, uncommitted) with 2,096 rows (`world/sources/assets/registry-kotm.jsonl`, untracked). Edit this row |
| `building-depth-and-variety.md` §3 rows :143, :146, :153 | "BSA not extracted; owner decision" | SUPERSEDED (ruled 2026-09-24, :276); the mud-hut row now needs the texture blocker of §5.1 below |
| `docs/phases/README.md:434–437` (Phase 12) | "Nothing Argonian ships an interior. Every xanmeer interior and every hut interior is tier B" | CONTRADICTED: KotM ships 62 furnished dwelling/shop cells (18 of them Argonian huts) and 8 furnished xanmeer cells (`interiors.txt`) |
| `docs/phases/README.md:477–478` (Phase 12 research) | "xanmeer connect geometry derived from the meshes, since no placed example exists" | CONTRADICTED: 8 xanmeer interior cells, 22,082 refs (`an7.out`) |
| `docs/world/90-asset-strategy.md` §78 | wamasu "custom Megalania-derived skeleton needs a conversion spike" | CONFIRMED and extended: KotM's wamasu rides the sabre-cat rig (`meshes/mihail monsters and animals/sabrecat/wamasu/skeletonwamasu.nif`) |
| root `README.md:224–229` | KotM credited for `mwkeep` statistics only | INCOMPLETE: every asset family taken needs its origin credit (§4.3) |
| 16h brief Part 2 item 27 | "plus the KotM sets … extract its archive first" | meshes and textures DONE; `sound/` (voice), `scripts/`, `source/`, `seq/`, `lodsettings/` not extracted (§4.1) |

Single doc for the writer to edit afterwards: the sourcing log row 204 (status, blockers, sub-rows
per origin); the Phase 12 lines above go to the phases README in the same change.

## 1. Inventory

Counts are BSA entries (`pipeline.build_kit.BsaSource`, 4,636 names: meshes 2,292, textures 726,
sound 1,175, scripts 224, source 217, seq 1, lodsettings 1) and folder listings of `V/extracted`.
Plugin counts are own records of `King of the Murkmire.esp` read with `worldgen.esp_index`
(`census.py`): REFR 77,584, CELL 16,114, LAND 15,931, NAVM 4,359, STAT 2,126, INFO 1,335,
ACHR 1,275, NPC_ 439, DIAL 409, ARMO 198, TREE 156, CONT 100, FACT 99, WEAP 98, LCTN 97, BOOK 87,
ACTI 82, SNDR 75, FURN 71, FLOR 59, MSTT 52, GRAS 36, RACE 35, QUST 31, DOOR 29. Masters:
Skyrim, Update, Dawnguard, HearthFires, Dragonborn, ccBGSSSE001-Fish, ccBGSSSE037-Curios,
ccBGSSSE025-AdvDSGS.

| Category | Folder (meshes/…) | Meshes | Notes and measured placement |
|---|---|---|---|
| Mud huts + attachments | `argonia/mudhuts` | 38 (+8 `lod`) | mudhut01–03, smpodext01–02, lizardhouse, manorext, shed, door01–02, window01–02, mudhutchimney, overhang, stairs, tamu docks; 18 already in `settlement-mud-v1.json` (uncommitted) |
| Thatch/plank houses, docks | `argonia/blackwood` | 91 (+18 `lod`) | house1–5, thatchhouse01–08, roundhut01–03 (+`int` shells), hausneu01–03, shiveringhouse_02, house04/05platform, stable, windmill, walkways, plank walls, docks* |
| Stockade, scaffold, ways | `argonia/stockades` | 45 | walls, gate, tower, scaffold bases/tops, bridges (short to extra-extra-long), ramp, stairs |
| Xanmeer exterior + stone | `argonia/xanmeer` (+`exterior` 34, `detail` 33, `rubble` 37, `roots` 14, `traps` 8), `architecture/xanmeer` 101, `denoffen/architecture/argonian` 37 | 17 + 126 + 101 + 37 | xanmeerbase01–02, templewall01–03, pyramid, tower01–02, dwellingruin01, wall pieces, statues, sconces; Denoffen `fen_az` modular stone (226 refs) |
| Xanmeer interior tileset | `argonia/xanmeer/interior` 54, `rooms` 2, `bridges` 2, `furniture` 6; `architecture/xanmeer/interior`, `props`, `furniture` | 64 + part of 101 | placed in 8 interior cells |
| Ruins, other cultures | `argonia/ayleidruins/exterior` 71, `argonia/imperialruins` 24 (+10 lod), `tesak1243` 168 | 263 | Ayleid all textures absent (§5.1); `tesak1243` = 133090 variants (§5.3) |
| Lilmoth set | no folder of its own: Lilmoth's 17 located cells place `blackwood` shells (house4 19, shiveringhouse_02 17, house1 17, house2 5, house04platform 3; `an2.out`) and 133090 docks/walls | — | reference only (§3.7) |
| Hist and shrine | `argonia/trees/hist trees` 40; `argonia/xanmeer/detail` (argonian_statue01, snakestatue01, pedestal, sconces) | 40 + 33 | histtree01–03, hist_root01–11, histgland01–03 (+dead/roots), histflower01–02 |
| Clutter and dressing | `argonia/clutter` 77, `argonia/furniture` 34, `argonia/food` 5, `argonia/argonianeggs` 6, `argonia/jboydswhaleparts` 7, `oaristys` 54, `loliceptresource` 27, `caen` 26, `creationclub/bgssse037` 35, `issgard` 9 | 280 | saxhleel fences, lanterns 01–02, tapestries, scale tents 01–03, hanging feathers, amber dolls, baskets, beehive, burners; rustic furniture set |
| Flora and landscape | `argonia/trees` 79, `trees/greguire` 89, `trees/cypressdebris` 28, `trees/3d lods` 16, `landscape` 51, `plants` 11, `ztree's` 8, `argonia/stalactites` 7, `argonia/lod` 40 | 329 | cypress1–5, bamboo, undergrowth, waterweed, willow, date palm; exterior top refs `argonia/trees/greguire` 3,278, cypress3 1,048 (`_kotm_census.txt`) |
| Boats (dressing now) | `argonia/blackwood/boat01–03`, `argonia/clutter`+`furniture/shiprowboat01`, `argonia/clutter/shiprowboatanim01`, `argonia/tradeship` 4, `blackwood/shipplank02` | 11 | placed exterior: boat01 16, boat02 10, boat03 4, shiprowboat01 3, shipeectradeship01 4, gangway shipplank02 21; all five hulls carry `bhkCollisionObject`; tris 896 / 1,008 / 7,676 / 5,484 / 54,709 (`tris_sample.txt`) |
| Boats (sailable later) | same hulls; scripts `kotmsailsystemscript.pex`, `kotmferryscript.pex` (BSA, design reference) | — | script names only (`kotmsailsystemscript`, `kotmferryscript`, `qf_kotmferrysystem`); code never read or used |
| Interiors and furnishing | plugin | 88 cells | 62 dwelling/shop (9,253 refs), 8 xanmeer (22,082), 9 Hist-root caves (8,027), 5 Imperial (4,852), 2 Ayleid (3,483), 2 ship cells (142); 120 exterior load doors → 83 cells (`an7.out`, `an8.out`) |
| Flooded / underwater caves | plugin | 24 cells | 24 interiors carry the has-water flag (XCLW 0.0); 7 also place water-plane statics: HuluxinoagRoots, LilmothRoots, MugsumpColdrootBurrow, MugsumpRootsInt01, SpirelandsHistTreeRoots, TeethofSithisInt02, TsofeerCavernInterior (`an2.out`) |
| Creatures | `mihail monsters and animals` 63, `skinwalker21 creatures` 33, `actors/argonianbehemoth`, `actors/swampskeletons` | 98 | 14 mesh families, each in a folder named for the vanilla rig it rides (sabrecat, horker, chaurus, chaurus hunter, death hound, dragon, mudcrab, rabbit, slaughterfish, troll); 12 custom `skeleton*.nif`; **0 `.hkx` files in the BSA**; 35 own RACE records |
| NPC heads, outfits, armour, weapons | `actors/character` 315 (facegen 183, fins/assets 132), `argonianwarriorarmour` 24, `son6of6tredis` 57, `shadowscale` 37, `armor` 18, `clothes` 22, `argonianweapons` 16, `bogblightmask` 7, `tribunal robes and masks` 3, `bobmods` 1, `weapons` 1, `argonia/an-wamasu` 62 | 563 | 198 ARMO, 98 WEAP records |
| Sounds and music | `sound/voice/king of the murkmire.esp` | 1,175 `.fuz` | voice only, forbidden (§5.2); 75 SNDR, 8 SOUN, 4 MUSC, 1 MUST records name files NOT in the archive |
| Textures | `textures/` | 726 | 1,281 MB: actors 263, mihail 169, landscape 157, argonia 148, skinwalker21 110, architecture 86 |
| Scripts | `scripts/` 224 `.pex`, `source/scripts` 217 | — | design reference only (quests, ferry, sail system, amber crafting, xanmeer barrier) |
| Worldspace / LAND | plugin | 16,033 ext cells, 15,931 LAND | `ArgoniaWorld` (`0x8d2dd32`) on DaSplatfestGurl's Tamriel Worldspaces (credits); evidence only |

## 2. How the mod's own world uses them (reference, never a copy)

Settlement form, from the plugin's located exterior cells (`an3.out`; houses = shells within the
location's cells; "dressing" = containers, furniture, misc, lights and clutter-path statics):

| Place | Cells | Refs | Houses | Extent (m) | Nearest-house spacing, median (m) | Dressing within 10 m per house, median (range) | Form |
|---|---|---|---|---|---|---|---|
| Lilmoth | 17 | 2,018 | 61 | 290 × 232 | 8.5 | 1 (0–15) | plank houses on and off platforms, dense street grid |
| Seekhat-Yol | 5 | 569 | 7 | 174 × 116 | 20.4 | 6 (4–12) | thatch on platforms (house04/05platform) |
| Keeba Hollow | 3 | 448 | 15 | 116 × 116 | 1.5 | 5 (2–9) | mud hut + pod annex compounds (mudhut02 + smpodext02 + chimney) |
| Root-Whisper | 7 | 643 | 12 | 173 × 173 | 25.5 | 1 (0–4) | roundhuts beside xanmeer bases, widest spacing |
| Alten Meerhleel | 2 | 220 | 9 | 102 × 57 | 5.4 | 3 (1–12) | plank dock hamlet |
| Huluxinoag | 3 | 234 | 3 | 115 × 113 | 19.5 | 7 (5–8) | camp: thatch on platforms |

Lessons: the three tribal villages have 7–15 houses, not 40; spacing splits cleanly by form
(compound huts 1.5 m apart, platform houses about 20 m, ritual/xanmeer villages about 25 m);
dressing is concentrated per house (5–7) in tribal villages and near zero in Lilmoth's street
grid, where it moves indoors (Lilmoth dwelling and shop cells hold 49–394 refs, `interiors.txt`). Windows are
pieces: window01/02 on 19 of 22 huts
(`docs/research/archive/building-depth-2026-09/windows-architecture.md:22`).

Docks and boats: 227 dock-piece refs (docksend 50, docksendnopost 33, tamu_wooddock01/02 39,
mwimparchdock* 55; `an6.out`). Within 8 m of a hull the mod places basketcontainer 27,
docksend 21, gangway plank 18, saxhleelfence02 14, stairs01/02 34, cutlog01 13, tamu docks 26,
firewood piles 9, water lilies 6. No oar, net or rope within 8 m of any hull.

Dungeons (`an7.out`): xanmeers are the largest cells (Ixtaxh 4,658 refs, Teeth of Sithis East
4,632) with 139 actors across 8 cells, mostly ancient Argonians (47), frogs (19) and voriplasms
(11); Hist-root caves hold 165 actors over 9 cells; every xanmeer and every Hist-root cave but Keeba
Roots carries the has-water flag. Exterior actors (`an2`/`an4`): 737, of which frogs 99,
crocodiles 42, snails 67, naga 25, river trolls 13, kotu gava 23, jimasu 9, swamp stalkers 8,
wamasu 5, swamp leviathans 3.

## 3. Stage plan

Re-keyed 2026-09-25 to the 16k place loop (0099): 16h part 2, 16i and 16j
were superseded; their items are carried into the 16k backlog under their
original numbers, the exemplars were dropped, and each place type takes
its KotM families when a slice first builds it.

### 3.1 Carried 16h part 2 items in the 16k backlog (kits, templates, dressing mine, dressing-add)

- **Kits** (item 27): `settlement-mud-v1` keeps its 18 KotM pieces but cannot build them until
  §5.1 lands (`argonia/mudhuts`: 71 absent texture refs over 30 meshes; mudhut02 uses
  `textures/_resourcepack/landscape/desertcracked01_d.dds`, found nowhere on this VM). New
  `settlement-plank-v1` from `argonia/blackwood` shells, platforms, walkways and plank walls (its
  lore read against reed weave, `world/sources/lore/topics/material-culture.md:26`, "woven from reeds, on wooden stilts", is the first check);
  `docks-v1` + blackwood docks* and tamu_wooddock*; `enclosure-v1` + stockade walls/gate/tower;
  `route-structures-v1` + stockade bridges, scaffold stairs, ramp; `ruin-monumental-v1` +
  xanmeer exterior, templewall (after §5.2), Denoffen stone; a shared `dressing-argonian-v1`
  from `argonia/clutter`, `furniture`, `food`, eggs, whale parts.
- **Assembly templates**: add a `kotm` set (worldspace `ArgoniaWorld`) to `mine_assemblies`
  (`kit-assemblies-mined.json` holds vanilla, bmv-blackmarsh, bmv-valenwood, htbm only), then
  `mine_mounts` and `mine_abuts`; `kit-designed-sink.json` already names KotM (64 matches).
  Sample first: mudhut02 compound, house04platform + thatchhouse, xanmeerbase + roundhut, dock
  end + boat01, with the expected template written before the run.
- **Dressing mine** (item 26): include the `kotm` set; its tribal medians above are the first
  per-family evidence for Argonian dwellings.
- **Boats as dressing** (item 10 hulls, item 15 `dressing-add`): boat01/02/03, shiprowboat01 at
  berths and beaches, seated by the hull-waterline datum of `mine_designed_sink`, collision from
  the NIF; co-placed set = gangway plank, dock end, basket container, cut logs, fence. boat01/02
  need `textures/argonia/curse of immortals/boatdecor01.dds` (absent; source Akavir Curse of the
  Immortals, SSE 107667). tradeship (54,709 tris) only as a distant anchored hull.

### 3.2 Per place type in the 16k loop (was 16i's six exemplars)

| Type (was the 16i place) | KotM families | Layout lesson from §2 |
|---|---|---|
| 8 town or city (Lilmoth) | plank houses on platforms, docks, stockade, boats | our ruling (lilmoth.md § 4E 201: "wholly Argonian stilt town") rejects KotM's Imperial-industrial Lilmoth; take its 8.5 m street spacing and dock density, not its content |
| 2 Hist village (was Nine-Trunks) | mud compound huts, Hist set, roundhuts | Keeba compounds (1.5 m) round a Hist; Root-Whisper's 25 m ritual spacing near the xanmeer |
| dropped with the Mazzatun exemplar; a later Dunmer place (was Mazzatun) | stockade scaffolds and bridges, xanmeer stone | stacked scaffold runs as mined templates |
| 4 camp or hold (was the tapping camp) | scale tents 01–03, saxhleel fences, lanterns, Hist gland | Huluxinoag camp: 3 shells, 7 dressing per shell |
| 3 water village (was Wamasu pond) | mud huts, tamu docks, boats | Alten dock hamlet 5.4 m |
| 5 dungeon entrance (was the sixth, root cavern / flooded cave) | Hist-root cave composition | 9 cells, 8,027 refs; water plane in 7 of 24 wet cells |

Tier A interiors (carried 16i items 4–5): the 18 Argonian hut cells behind KotM hut shells (Keeba 5, Root-Whisper 6,
Seekhat 7) are the first Argonian tier A candidates; copy furniture and clutter only, drop ACHR,
quest items, notes and books (0062 tier A; 00-core rule 6 covers the rest).

### 3.3 The loop's exit and Phase 15 (rollout)

Village packets pick house forms by grammar: `argonian-mud` = KotM compound (hut + pod + chimney
+ windows); `argonian-stilt` = platform thatch/plank (Seekhat); Hist-centred = roundhut +
xanmeer base (Root-Whisper); dock hamlet = Alten. The census medians enter `type-recipes.json`
as bands with `sources` naming the KotM set, beside BM&V and vanilla.

### 3.4 Phase 12 (interiors, furnishing mine)

Add KotM to `mine_door_links` / `exterior-interior-links.json` (0 KotM rows today) and
`interiors_index`; 120 exterior load doors → 83 cells give shell↔cell pairs (door02 on
shiveringhouse_02 26, house4 16; door01 on mudhut02 4; xanmeer door2load on xanmeerbase02 4;
`an8.out`). The furnishing mine takes the 62 dwelling cells (9,253 refs); the chamber library
takes the 8 xanmeer cells (first placed xanmeer interior grammar) and 9 Hist-root caves. Both
`xanmeer-interior-v1` and `dungeon-root-v1` gain pieces; flooded caves = the 24 wet cells, water
plane at the mined level (Phase 12's "a flooded cave is that grid with a water plane").

### 3.5 Phase 9 (swim, boats)

9a judges the 7 water-plane caves as swim-through references; 9b makes the 4 small hulls
sailable (buoyancy datum = the mined waterline; collision already in the NIF). KotM ships no
rowing or sailing clip (0 `.hkx`); `shiprowboatanim01.nif` is a mesh-level animation only.

### 3.6 Phase 12b (soundscape)

Nothing audible ships from KotM. Its records are the reference: the cypress-swamp bed layers
vanilla loops by time of day (AMBrFrogsForestCypress01–07, AMBrCricketsCypressDay01–09,
Morning01–04, Night01–07, cicadas; `an4.out`) over `Skyrim - Sounds.bsa`, which the sound-prep
lane already converts. Its frog loops (`vossa satl/*.wav`, naturenorth.com) and creature SFX
(`Sound/fx/Skinwalker21 Creatures/…`, `mihail*.esp/…`) are not in the archive: source them from
the original creature mods (credits list) and the naturenorth page, licence checked per file.

### 3.7 Phase 13 (creatures, encounters)

Pipeline need: vanilla creature behaviour clips for the rigs KotM rides (sabrecat, horker,
chaurus, chaurus hunter, death hound, dragon, mudcrab, rabbit, slaughterfish, troll) retargeted
onto each custom skeleton; today's manifest is humanoid only
(`tooling/asset-pipeline/output/rig-skyrim-humanoid.animations.json`). Bone-name parity between
each `skeleton*.nif` and its vanilla rig is unmeasured: measure first on frog, wamasu, voriplasm.

| KotM creature | Rig | Our record (`creatures.json`) | Keep? |
|---|---|---|---|
| frog (mihail) | rabbit | death-hopper (HTBM frog) | second variant |
| wamasu | sabrecat | wamasu (HTBM) | candidate replacement |
| voriplasm 01/02 | horker | voriplasm (BM&V slug re-material) | replace: dedicated mesh |
| crocodile | slaughterfish | crocodile (BM&V) | variant |
| swamp leviathan/stalker | snowy sabrecat | swamp-leviathan (BM&V gehenoth) | variant; no UESP Online page |
| river troll | snow troll | none | add: UESP Online:River Troll |
| Argonian behemoth | werewolf | none | add: UESP Online:Argonian Behemoth (Murkmire) |
| naga | own race | lamia/medusa via rivnaga | NPC race: Lore:Naga-Kur |
| guar, alit | death hound / dog | guar | alit keepable: UESP Lore:Alit "native to Morrowind and Black Marsh" |
| kotu gava (meganeura) | chaurus hunter | kotu-gava: swarm, `none` by design | drop the mesh (UESP Lore:Bestiary K) |
| giant snail, jimasu, megalania | horker / sabrecat | none | drop: no UESP page |
| giant centipede, giant snake | chaurus / dragon | kaj-thux | giant snake a kaj-thux candidate |
| arachas (6 races) | frostbite spider | none | drop: Witcher-derived, 0 NPCs |

Fixed danger: KotM's exterior counts (§2) are a density prior; placement follows our region
dossiers and Phase 13's contrast set.

### 3.8 Quests, text and lore

Corpus: 1,244 dialogue responses (13,715 words) in 409 DIAL topics; 87 books (47,581 words);
31 QUST; 439 own NPC_ (261 unique names); 99 factions (`dlg.py` output, `dialogue.tsv`,
`books.txt`, `npc_names.txt`). 29 of the 87 book titles match a UESP Lore/Online page by exact
name (Tribes of Murkmire, A History of Lilmoth, The Sharper Tongue: A Jel Primer, Keshu: From
Egg to Adolescence, …); the Keshu, Blackwater War and Improved Emperor's Guide series are ESO or
older canon under other page names; the notes, letters and journals (about 25) are the mod's
own. Cite UESP for canon books, never the mod. Use:
register and idiom reference for Saxhleel speech (Jel words, Hist and tree-minder talk).
Location: keep the extracted corpus OUT of the public repo (it republishes the author's prose;
`world/sources/` is also linted player text); store it in the vault at
`elder-scrolls-asset-pipeline/derived/text/king-of-the-murkmire/` (done 2026-09-24) and commit only a short findings note under `docs/research/lore/`.

Canon and era conflicts (0002, dossiers first):

- Lilmoth: "The Lilmoth you see today is mostly Imperial, from the Third Era, crammed full with
  wooden buildings made in the wake of the Umbriel Crisis" (`dialogue.tsv`,
  LilmothYusikGenericBranchTopic) plus Imperial industry cells (Ironworks, Glassworks, Oliis
  Iron Foundry, Silver Refinery, Imperial Imports) contradict `world/sources/lore/lilmoth.md`
  § Lilmoth in 4E 201 (OWNER DECISION Q4). Drop.
- "Blackrose Ruins" (LCTN, 4 cells, 274 refs) conflicts with our live Blackrose (16g call 2,
  `blackrose.md`). Drop.
- Umbriel in 4E 48 (25 mentions) agrees with UESP Lore:Lilmoth. Keep as corroboration only.
- Canon names already in our records (Bright-Throat 64, Root-Whisper 24, Alten Meerhleel 35,
  Teeth of Sithis 28, Ixtaxh 18, Vakka-Bok, Xul-Thuxis 8, Keel-Sakka 40, Pusbottom 95): UESP
  pages exist (Online:…, Lore:Keel-Sakka River); keep ours.
- Never reuse (no UESP page, KotM inventions): Keeba Hollow, Seekhat-Yol, Huluxinoag, Ree-An-Wo,
  Xocei-Tluthek, Loreisian, Feren Tarn, Wajeem-Krona, Coldroot Burrow, Mugsump, Hajsetha-Tzel,
  Bonestrewn Grove, Genoag, Dragonthorn, Nightbloom Manor, The Lady Padomay, Tsonashap-Uxith,
  the Grimy Rind, the Greasy Sleeper, the 261 NPC names (0 overlap with our 498 today).

### 3.9 Phase P / 14 (LOD, impostors, budgets)

KotM ships LOD meshes (`blackwood/lod` 18, `mudhuts/lod` 8, `xanmeer/lod` 7, `imperialruins/lod`
10, `trees/3d lods` 16, `argonia/lod` 40, `textures/lod` 42): feed them to the 0075 ladder as
rungs. LOD0 triangles: thatch/plank houses 4,486–10,556, mud huts 512–1,430, lizardhouse 3,875,
xanmeerbase 29,878/44,212, histtree01 38,018, tradeship 54,709 (`tris_sample.txt`). Lilmoth's
61 shells at about 8k each are about 0.5 M triangles at LOD0 against the 0084 frame budget of
about 4 M.

## 4. Pipeline work, once

1. **Extraction**: meshes + textures done. Extract `scripts/` + `source/` to the vault only
   (design reference). Never extract `sound/voice`.
2. **Registry**: `registry-kotm.jsonl` rows have no origin field and 1,111 of 2,096 are `misc`
   (only 4 `tree` for 246 `argonia/trees` rows). Add `origin` per path prefix (table below) and
   rerun the taxonomy on a 25-asset sample first.
3. **Credits** (root README, same change as the first kit): KotM plus each origin shipped. From
   the Nexus page § Assets (76 credit lines), folder → origin:
   `architecture/xanmeer` NorthwindBlue and DarthVitrial (SSE 181193); `tesak1243` Tesak1243
   (SSE 133090); `denoffen` Fenruss, Den of Fen (SSE 167214); `argonia/trees/greguire` Greguire,
   The Whalestone Isles (SSE 141581); `gkb*` Ga-Knomboe Boy, GKB Green Trees (LE 19268), GKB Waves
   (SSE 19077); `argonia/trees/hist trees` skyfall515, Sleeping Tree Overhaul (SSE 116792);
   `ztree's`, hoddminir flowers elinen and Ztree (LE 38651, 55158); `plants/tamira` Tamira (LE
   22018); `tamu_*` tamu75 (LE 63982); `argonia/ayleidruins` Ayleid Ruins Kit (LE 90667; its
   authors list) + Elbethien, Cambodian Ayleid Ruins (Oblivion 46232); `pyramid` Growlf (Oblivion
   14286); `1mjyaztecbuilding*` mjy, The Mysterious Island (LE 27747); `templewall*` mega3d,
   Mayan Temple Walls (fab.com); `mihail monsters and animals` MihailMods (SSE 120998, 79064,
   44491, 158860, 29655, 99847; LE 88150, 88055) + riverbord (SSE 121331); `skinwalker21
   creatures` Skinwalker21 (SSE 103584, 109174, 98488, 86261) + anopelao96 (SSE 90788);
   `argonianwarriorarmour` gUISTASSI and cipherid (SSE 96624); `son6of6tredis` (LE 95661) +
   SassiestAssassin (SSE 96559); `shadowscale` (SSE 79717); `argonianweapons` MetalMonsterFNV
   (SSE 67137); `weapons/flatbows_flarescale` Muoviori (SSE 40028); `bobmods/macuahuitl`
   hrodebehrt1 and Bella (SSE 46353); `armor/ominous` GolinskiPRH (SSE 63149);
   `armor/toughened_traveler` QuarantineCouture and dimon99 (SSE 54471); `clothes/bandages`
   raccoondance (SSE 98659); `actors/character assets/argonianfins` KabuNouveau (SSE 65428);
   `tribunal robes and masks` Natterforme (SSE 4937); `actors/swampskeletons` ChakraSSE (SSE
   151282), CharderoTheLupe (SSE 150679); `argonia/jboydswhaleparts` Jboyd4 and
   RustyShackleford69 (SSE 30859); `oaristys` Oaristys (LE 16525; SSE 137706); `loliceptresource`
   lolikyonyu (LE 62733); `caen` Caenraes (SSE 129029); `creationclub/bgssse037/…/pancake`
   pancake0723 (SSE 114512); boat textures stalker992 (SSE 107667). Unresolved by folder name,
   to confirm from mesh texture paths before shipping: `argonia/blackwood` houses (m150 Blackwood
   Inn LE 65897, RoboBirdie Shivering Isles House LE 94814, jet4571/Elianora LE 58262 are the
   credited candidates; their absent `mb/*` and `shivering_buildings` textures point at the first
   two), `argonia/an-wamasu`, `prvti`, `issgard`, `bogblightmask`,
   `actors/argonianbehemoth`.
4. **Budget** (`kit_compress.py`, compose.mjs fail 900 MB / warn 750 MB; site 561 MB with every
   kit, 0073): the whole pool is 1,653 MB raw, about 660 MB at the measured 0.40 kit ratio
   (556 → 222 MB). Architecture + dressing folders are about 420 MB raw (about 170 MB shipped).
   Ship per kit, only placed pieces, and measure each kit; creature and actor textures (542 MB
   raw) wait for Phase 13 and Phase 14's streaming host.
5. **Sourcing log**: row 204 rewritten, plus one sub-row per origin shipped (hash, credit,
   licence note) and OPEN rows for §5.1 and the boat texture.

## 5. Risks

1. **Archives the vault lacks** (`tex.out`, `an5.out`). 1,971 absent texture refs over 692
   meshes; by prefix:
   `creationclub/_shared` 647, `_resourcepack/landscape` 588, `creationclub/bgssse001` 154,
   `creationclub/bgssse037` 72, `dlc02` 95+, `argonia/terrain` 34, `mihail…/mudcrab` 22, and
   small sets the author did not pack (`mb/haus2`, `mb/wood`, `architecture/shivering_buildings`,
   `akavir/chinaland`, `praedythxvi`); `igsresources` 180 resolve from the vault's
   `ayleid-ruins-building-kit-90667`. Placed model
   refs absent: 4,897 of 56,974 on 208 models (`_resourcepack/landscape` 2,836,
   `creationclub/_shared` 1,567, `dlc01`/`dlc02` 210, `_byoh` 145). The vault's `Data/` holds
   only the four Skyrim BSAs; the manifest has 0 `dlc01`/`dlc02`/`_byoh` paths. Hit: all 189
   Ayleid meshes, 30 mud-hut meshes, 184 tree meshes. Fix: the owner's AE/CC/DLC archives into
   the vault (same class as the pending Dragonborn door, 16h brief § Decisions for the owner (2026-09-24)).
2. **Licence**: voice "not allowed to be used for anything under any circumstances" (Nexus
   page); the page asks addon makers "please don't make use of AI in it at all" and the earlier
   terms read "free mods that use no AI"
   (`docs/research/archive/building-depth-2026-09/vault-buildability.md:73–75`): the owner's
   permission must name AI-assisted use explicitly. Also: Witcher-derived `oaristys/the witcher`
   (1 mesh, 0 placed) and the arachas races; Mayan Temple Walls from Fab (36 templewall refs,
   commercial marketplace licence); ESO book texts (ZeniMax); creature SFX the §78 note already
   flags as CDPR-credited; A Clear Map of Skyrim is CC BY-NC-SA.
3. **Duplicates**: same-name files differ from the vault originals (md5 by file name, 2026-09-24): xanmeer
   tileset 107 shared (20 identical), `mwkeep` 190 (13), Ayleid kit 136 (0), Hist overhaul 9 (2),
   Tropical 42 (10). KotM's `mwimparchwall01` swaps `stonewall01/02` for `stonetrim02`/`floor01`
   textures; `mine_assemblies.PLUGIN_PATH_POOLS` maps KotM's `tesak1243/` refs onto 133090's
   originals, so mined statistics and shipped materials may describe different files. Keep KotM
   copies as `kotm:` ids; retire nothing: mud grammar needs ≥ 4 templates per region and KotM
   adds about 8 (`building-depth-and-variety.md:198`); Mud Mother `mudhut01` and KotM `mudhut01`
   share a stem only.
4. **Canon/era**: §3.8 (Lilmoth, Blackrose, invented names).
5. **Performance**: §3.9; the tradeship and xanmeer bases need their LOD rungs before any
   distant placement.

## Recommendations

1. Owner call first: bring the AE `_ResourcePack.bsa`, CC (Fish, Curios, S&S and `_shared`) and
   Dawnguard/Dragonborn/HearthFires BSAs into the vault; this unblocks mud huts, Ayleid ruins and
   trees (§5.1). Until then build only the pieces whose textures resolve (`tex.out`).
2. Owner call: confirm the KotM permission covers AI-assisted development (§5.2).
3. Brief edits (applied 2026-09-24 to the 16h/16i/16j briefs; since 0099
   they are carried 16k backlog items under the numbers below):
   1. 16h item 27: KotM kit list of §3.1; "extract its archive first" → "meshes and textures
      extracted 2026-09-24; `settlement-mud-v1` KotM pieces blocked on §5.1".
   2. 16h item 26: dressing mine sets = vanilla, BM&V, HTBM, **kotm**; first sample = Keeba
      compounds and Seekhat platforms.
   3. 16h items 10/15: KotM hulls as berth and beach dressing with the §2 co-placed set; boat01/02
      after the SSE 107667 texture download.
   4. 16h "Record reads": add the `kotm` set to `mine_assemblies`, `mine_mounts`, `mine_abuts`,
      `mine_door_links`, sample-first.
   5. 16i part 1 item 2 (no paper-plan phase since 0100 §3; read per type in
      the slice's design brief): the §3.2 table per type; Lilmoth plan cites lilmoth.md Q4 against
      KotM's Lilmoth.
   6. 16i tier A (carried items 4–5): 18 KotM Argonian hut cells as candidates, furniture and clutter only.
   7. The loop's exit and Phase 15 template: the four KotM village forms as `type-recipes.json` bands.
   8. Phase 12 (phases README :434–437, :477–478): replace both claims with the KotM counts;
      add KotM's 62 dwellings, 8 xanmeers, 9 root caves and 24 wet cells to the mines.
   9. Phase 9 brief (written at 16k's exit, carried 16j item 9): the 4 small hulls and 7 water-plane caves.
   10. Phase 12b: KotM cypress layering as a table reference; creature SFX and frog loops a
       sourcing job.
   11. Phase 13: add river troll and Argonian behemoth to `creatures.json`; replace voriplasm;
       frog, wamasu, crocodile, leviathan as variants; drop kotu gava mesh, snail, jimasu,
       megalania, arachas; first job a bone-parity check on three skeletons.
   12. Quests/text: corpus to the vault's `derived/text/king-of-the-murkmire/` (done), findings note in `docs/research/lore/`, the
       never-reuse list in `docs/quests/86-never-reuse-names.md` (done).
   13. Phase P/14: KotM LOD meshes as ladder rungs; per-kit download line in each kit build.

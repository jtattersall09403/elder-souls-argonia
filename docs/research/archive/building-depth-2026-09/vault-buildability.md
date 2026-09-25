# What the vault can build: building families, pieces, composition (2026-09-24)

Headline: every house composite we ship is shell + door leaf only (build config
`tooling/asset-pipeline/pipeline/config/kits/*.json`; 13 composites, none adds a porch, window,
chimney or awning). The vault holds the missing layer: vanilla porches (`farmhouse0Nwalkway`),
BM&V Aldredanyia windows and overhangs, Dagon Fel awnings and chimneys, Jet's 235-piece modular
farmhouse kit, and King of the Murkmire's (KotM) Argonian huts, which it composes with windows,
chimneys, pod annexes, stairs and stilt platforms. None of that is in any kit.

## Reconciliation
- Live doc: `docs/research/placement-settlements/settlement-asset-inventory.md` §2 + JSON twin
  `world/sources/placement/settlement-asset-inventory.json`. That is the one doc to edit.
- Confirmed: §2 "Round mud-hut shells ... + windows/steps/doorframe" (BM&V `architecture/huts/exterior`, 11 files);
  §2 "5 Dagon Fel shacks each with an interior"; §3 3.64 m / 64-unit snap.
- Contradicted/superseded: §1 "~3 monolithic hut shells — our weakest family" and §9b "No true
  Argonian mud-hut modular kit exists on Nexus": KotM (SSE 190459, uploaded 2026-09-02) ships 9 mud
  shells + 3 annex pods + 22 thatch/plank houses with windows, chimneys, overhangs and platforms.
- Missing from the inventory: Jet's farmhouse kit (BM&V `architecture/jets/*`, 292 meshes);
  BM&V `small house/smallhouseext` (61 Black Marsh placements, most-placed BM&V house);
  `cyrfarmhouse01–03` (35 placements); Phitt Aldredanyia `house01–04`.
- `settlement-kit-sourcing-log.md:204` records KotM as "statistics only: no mesh taken". The
  census below shows it is the richest Argonian village source in the vault; that row needs a decision.

## Family table
Legend: Y = yard (16h proving ground, K14 table /tmp/k14_yard_table.txt); E = 16i exemplar family
(Lilmoth = imperial + mud; Nine-Trunks = mud + root; Mazzatun = stilt + works; tapping camp = works + root + mud;
Wamasu Pond = mud + works + docks; sixth = a dungeon, not chosen yet), from `world/sources/blueprints/retired/place.*.json`.

| Family (source path) | Shells (distinct forms) | Attachable pieces | Authors compose? (mined evidence) | Buildable house forms | In vault, in no kit |
|---|---|---|---|---|---|
| Vanilla farmhouse (`architecture/farmhouse`) **Y, E Lilmoth** | farmhouse01–06, farmhouse05/06destroyed01–02, inn01 (+destroyed01–02), smith01, farmlonghouse01, lumbermill01, farmhousewindmill: 11 intact | farmhouse01–04walkway (porch decks; 25 placements, 0 alone), farmhouseldoor01, farmhousedoor01, farmhouseanimdoor01–02, walkway kit 27 (walkway01–02, bend01–03, c/cend/cwall/cwallend/cwallgate, ramp01, stairs1/3/4/8/15), stonewall 17 (incl. terrace set), fencewoven01–02, farmwell01, farmbannerpost01, ivy01–03. Windows are modelled into the shell (`farmwindowinterior01.dds` on 01/02/05) | YES. Vanilla group farmhouse02 + farmhouse02walkway + 2× farmhouseldoor01 + walkwaystairs8 (n=3); farmhouse01 + walkway (8 of 11 placements); farmhouse04 + walkway + ivy03; inn01 + walkwaystairs4 (8) | ~15 (11 shells; 4 take a porch) | farmhouse03–06, inn01, smith01, farmlonghouse01, lumbermill01, windmill, walkway02–04, the walkway kit, stonewall terrace set, ivy, farmwell01. **Our composite `farmhouse01-with-door` drops `farmhouse01walkway`** although the kit lists it |
| Vanilla city houses (`whiterun/wrbuildings`, `solitude`, `solitude/farms`, `riften`, `windhelm`, `markarth`) | ~80 bespoke shells, each placed 1–3× (wrhousewind01–04, wrhousestores01–02, wrhouseshack01–02, sfarmhouse01–03, rtfarmhouse01–02, whvalunstrad ×37 pieces …) | wrshuttersingle01/double01/doublespaced01/triple01, sfarmporch01–03, sfarmhousesteps01, sfarmhousesilo, sfarmshed01, rtchimney01, rtplayerhousedeck01, rtmjolldeck01–02, wrjorvaskr01backporch01; windows modelled in (`wrwindows01`, `swindow01`, `riftenwindows02` + glow maps) | Whole meshes; shutters and chimneys hung on them | ~80, but each is one named Nord landmark | all of them |
| Vanilla shack kit (`architecture/shackkit`) **E stilt** | modular, no shell | 58: shackwall01–05, shackwalll01–02, shackwallr01–02, shackwalltop01, **shackwalltopwindow01, shackwallwindow01–02**, shackwalldoor01, 13 frames, 13 roof (mid01–05, corner01–02, side01–04), 20 broken | YES. BM&V group shackframebend01 + 2× roofside01 + 2× wall01 + walldoor01 + framelend01 + wall03 + wall04 (8 parts, n=8); vanilla 69 templates | unbounded (bays × corners × roof) | 50 of 58, incl. every window and the door wall (`settlement-stilt-v1` holds 8) |
| Vanilla orc longhouse (`architecture/orclonghouse`) | orclonghouse01: 1 | orcawning01, orcawningfull01, orcawninghalf01, 3 partitions, orcdoor01 | YES (awning + partitions, n=3–9) | 1 (+ awnings reused by HTBM) | all but orcawninghalf01 |
| Jet's farmhouse kit (BM&V `architecture/jets/farmhouse` 235, `jets/riften` 19, `jets/whiterun` 38) | modular, no shell | outsidewall01–05 a–d/door/end/enddoor, extwallwd01–08 a–d/door, wdfreewall01–08, outsidefound01door/corpost/wall, outsideroofcenter/end ×4/lcorner, crossbeam a–c(+bent), farmfireextbase/extension/topcap (exterior chimney stack), farmfreefireplace, floors (base/loft/top/deck/stone), farmstairs, farmrailing, porch set ×2 (floor full/half, roof full/half, front/back/lower posts, railing long/narrow/endpost, steps 3/6/9/12), vaulted ceilings. Textures are the vanilla farmhouse set (WoodWall01, Thatch02/03, StoneWall02) | Designed to (64-unit snap, per its Nexus page). No placement evidence in the vault: BM&V places 2 `jets` pieces; the author's sample plugin (`ArchitectureTest.esp`) is not in the vault | unbounded | the whole kit. Whether a–d are window variants is unverified (no window texture in the shape set) |
| BM&V mud huts (`architecture/huts`) **Y, E Lilmoth, Nine-Trunks, tapping camp, Wamasu** | hutexterior, hutdecking: 2 | doorframe01, window01–03, windowbox01, steps01–03, bridge01; interior hutinterior, door01, woodburner | Shell + 2× doorframe01 + ruinswooddoorload01 (n=11). Windows: 0 placements. steps02: 12 placed, 9 alone | 2 | window01–03, windowbox01, steps01/03, bridge01 |
| Mud Mother Grove (`GV_Meshes/ArgonianNest`) **E mud** | MudHut01 (+IntNew): 1; ArgonianTent01–02 | ThatchRoofing, RoundFloor01, ArchwaySticks(+Col), ArgonianPlatform(+Small), ArgonianBridge(+Start), 7 fences, WallHanging01–03, Banner01 | Plugin places 4× MudHut01 with wall hangings; its door is `dlc2telmithryndoor01` (Dragonborn DLC, not in the vault) | 1 (+2 tents) | ArchwaySticksCol, WallHanging01–03, Banner01, ArgonianFenceEnd, snakefence02–03, woven fence (no geometry) |
| **KotM mud huts** (`KotM BSA: argonia/mudhuts`) | mudhut01–03, smpodext01–02, lizardhouse, manorext, shed: 8 | window01–02, door01–02, smpodextdoor, **mudhutchimney**, **overhang01–05**, stairs01–02, mudlump01–02, floor01–02, tamu docks; interiors mudhutint01–03, smpodint01–02, manorint | YES (proximity census, 10 m): 6 mudhut02 → 12 window02, 11 window01, 9 smpodext02 annex, 8 door01, 5 chimney; 7 smpodext02 → 12 window02, 10 window01, 6 chimney | ~16 (8 shells × annex/chimney) | all (no kit; mesh use not yet decided) |
| **KotM thatch/plank houses** (`argonia/blackwood`) | thatchhouse01–08, house1–5, hausneu01–03, roundhut01–03, shiveringhouse_02, stable, watchtower01, windmill: ~24; interiors for house1–3, hausneu01–03, roundhut01–02, shiveringhouse | house04platform, house05platform (stilt decks), doorframe(b), shackdoor, housewindow, housepartion01–05, housepartionwall(wide)(window), plankwall01a–03a, walkway01–07, walkwaystairs, wall01, walldoor01, docks ×11, crane01–03 | YES: 15 house04platform → 27 saxhleelfence02, 12 doorframe, 9 shackdoor, 9 buntingline01, 7 stairs01, 5 thatchhouse07; 20 house4 → 23 plankwall02a, 20 door02 + doorframe, 13 stairs02, 11 dock ends | ~24 shells; ×2 on/off platform | all |
| KotM Saxhleel dressing (`argonia/clutter`, 78) | none | saxhleelfence01–02, scalefence01–05, scaletent01–03, saxhleellantern01–02, saxhleeltapestry01–02, hangingfeathers01–03, tamwindchime01, buntingline01, wallbasket01–06, vossasatl01–03, firewoodpile ×4, woodchoppingblock, beehive | the exterior dressing around every KotM house above | n/a | all |
| KotM Denoffen stone (`denoffen/architecture/argonian`, 37) | modular | fen_az wall linear/open (4 open variants), roof_01/02 linear/corner/inner, toptrim, pillar/pillarbase, stairs linear/round | placed (16 roof corners, 12 roof linear) | modular stone; xanmeer idiom, not a modern house (stone rule) | all |
| HTBM bamboo (`Villages/Argonian`, `Villages/Kothringi`) **Y (dock), E Mazzatun** | BambooHut01–02 (+_Int), StilthousePlatform, Swamp House: 4 | BambooHutDoor01, orcawning01/full01/half01, stonewall arch/curve01–02/pillar, Tamu dock/plank/pole 12, fireplace_si, shivering_stairs | Shell + door only (n=8, 9); Swamp House + fireplace_si + dock (n=4) | 3 | orcawning01, orcawningfull01, wickersofa01, Swamp House (rip flag, inventory §9) |
| BM&V stilt house (`architecture/stilthouse`) **Y, E Mazzatun** | stilthouseext: 1 | stilthousedooranim | Shell + door | 1 | none |
| BM&V Phitt Aldredanyia (`architecture/phitt/aldredanyia`) | house01–04: 4 | window, overhang01–05, foundation, pillar, pole, banner, lightpost, paperlanternsquare(off), signpost | YES: house03 + overhang05 + up to 11× window (n=4–27); house02 + 7 windows (n=11); house04 + overhang03 + 3 windows (n=8) | 4 | house01, house02, house04, overhang01–04, foundation. Kitted `composite:phitt/marsh-house-03` carries 4 of the 8 windows mined at n=14 |
| BM&V Dagon Fel (`sheogorad/dagon fel`, `architecture/phitt/dagonfel`) | shack01–05 (each + interior), housetall01–02, nordhouse01, tower (+int): 9 | shackdoor, **shackawninglarge/small**, **chimneysmall/tall**, window01–02, doorframe, wallstraight/corner/end/updown, skyway, shackhook, lanternhook, overhang01–05 | YES: shack02 + shackawninglarge + shackdoor (n=11); shackawninglarge never alone (12/12) | 9 | every building piece (only its docks are kitted, `docks-v1`) |
| BM&V small house (`architecture/small house`) | smallhouseext: 1 | smallhousedoor, smallhouseint | shell + interior + door (n=9–18); 61 placements in Black Marsh | 1 | all |
| BM&V Cyrodiil farmhouses (`architecture/cyrfarmhouse01–03`) | 3 + cyrwindmill01 | none | whole; 35 placements in Black Marsh | 3 | all |
| BM&V citebosmer houses (`citebosmer/houses`) **E root** | housetronc001, housechamp001, housegland001: 3 | balcony/access 14, doors 4, windows 12 (et/rc) | YES: housegland001 + 29 window + door (n=12–29) | 3 | kitted (`settlement-root-v1`, 42) |
| Hlaalu (`HlaaluArchitecture/Custom`, `Hammerfell`) | house01, housetall01, tradehome, tower00–08 stack | largewindow00, entrance00, baseentrance00–01, roof, dome | resource only, no placement plugin | ~6 | Seaview window02, Winterhold/Ruins 8 |
| Imperial keep (`mwimperialarchitecture/keep`) **Y (wall run), E Lilmoth** | keep01–02, guardtower01–02 | walls, towers, arrowslits, ledges, docks, stables | KotM places 318 refs | fortification, not houses | none |
| Xanmeer (tileset 9 exterior; KotM `argonia/xanmeer/exterior` 34) | KotM dwellingruin01, tower01–02, pyramid | wallpiece01–05, wallsmall01–04, xanmeercurvedwall01–03, wallmural01, obelisk | placed in KotM | ruin dwellings only | the KotM set |

Not in the vault: Hearthfire modular homestead (BM&V places 47 `_byoh` refs it cannot resolve;
no DLC BSA in `skyrim-source/Data`). Stroti mushroom house (hovelmud) has window-on/off shells, but
it is a Telvanni idiom and off-limits inland (inventory §1).

## Method notes
- Vanilla piece lists: `skyrim-source/manifest-skyrim-meshes.txt`. BM&V: `black-marsh-mod-source/manifest-data1.txt`.
  KotM: BSA namelist via `pipeline/bsa.py`. Mod folders: directory listing.
- Co-placement: `kit-assemblies-mined.json` sets vanilla/bmv-blackmarsh/bmv-valenwood/htbm (groups, templates,
  pieceUse). That miner skips non-structural refs (vanilla 227,013; BM&V 130,942), so the clutter
  layer around houses is not mined anywhere.
- KotM and Mud Mother Grove: a one-off 10 m proximity census from `worldgen.esp_index`
  (/tmp/wf/buildings/_kotm_census.txt). These are counts, not snap templates.
- farmhouse01 as built: 20.05 × 10.04 × 10.58 m, 2,376 triangles, 8 textures incl. farmwindowinterior01,
  no dropped shapes (`apps/world-studio/public/kits/settlement-imperial-v1.kit.json`).

## Online sources
- Jet4571 & Elianora, "Building kits and other items" (Nexus skyrim 58262), via the Nexus API: 383 meshes,
  "235 farmhouse kit parts ... All building parts snap at 64 units", 19 Riften porch parts, a modular dock kit.
  "The farmhouse kit is not meant to be used with the vanilla farm kit". Its samples ship in ArchitectureTest.esp.
  Rules: nifs stay at their paths, credit plus a link, no porting to another game without permission. https://www.nexusmods.com/skyrim/mods/58262
- pancake0723, "King of the Murkmire" (SSE 190459): 4E 201 Keel-Sakka delta, Lilmoth and four villages. "any assets that are
  mine or adapted by me from free-to-use resources are free for use in your mods if they are released
  for free and do not make use of AI"; assets by other authors need those authors' permission. https://www.nexusmods.com/skyrimspecialedition/mods/190459
- "Real 3D Walls and Actual Windows – Farmhouses" (Nexus skyrim 97799) / "Actual Windows – Farmhouses" (59519) replace vanilla farmhouse
  windows with transparent ones. So the vanilla farmhouse window is a painted interior card. https://www.nexusmods.com/skyrim/mods/97799
- Winking Skeever, modder's resources list (credits for 58262; Cyrodiil Farmhouse Tileset; Windows Resource Pack). https://winkingskeever.com/list-of-skyrim-modders-resources/
- Burgess & Purkeypile, GDC 2013 modular kits: already digested in `docs/research/placement-settlements/kit-level-design-and-layout-generation.md` §1.

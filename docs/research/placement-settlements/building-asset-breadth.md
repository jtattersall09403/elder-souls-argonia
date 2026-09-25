# Building asset breadth: what we hold, what we use, how to make settlements varied (research, 2026-09-24)

Headline: our kits use 106 of the 2,028 vanilla exterior architecture pieces (5 %) and 263 of
BM&V's 2,461 (11 %). The vault holds about 500 King of the Murkmire (KotM) exterior pieces that
have not been extracted. The cheapest breadth is inside the vault, not on Nexus. Tropicalising is
a texture swap only, so it is honest just for families whose silhouette carries no Nordic sign.
The 25 % template cap should give way to a per-building signature rule measured against vanilla
tier numbers (§3).

Method and raw data: /tmp/wf/buildings/x/. Mesh lists come from `manifest-skyrim-meshes.txt`, the
BM&V manifest (`_bmv_meshes.txt`), the KotM BSA listing (`_kotm.txt`) and directory walks of each
mod folder. Kit membership comes from every config in `pipeline/config/kits/`
(x/kitpieces.json). Tier variety was measured with x/variety.py and x/variety2.py over
Skyrim.esm + Update.esm and Black Marsh.esm + Black Marsh North.esp, using
`mine_settlement_form_stats.collect` (building = pieces within 8 m; settlement = 4 or more
buildings within 45 m).

## Reconciliation

| Live doc | Claim | Verdict |
|---|---|---|
| building-depth-and-variety.md §3, row "Hlaalu resource: none" | no kit | **CONTRADICTED.** `hlaalu-domestic` is a built kit: 68 Hlaalu pieces, plus Phitt house03, overhang05 and window (config `hlaalu-domestic.json`, culture `imperial`) |
| building-depth-and-variety.md §1 cause 4 and §6 item 4 | "`settlement-mud-v1` took none of BM&V's … steps" | PARTIAL. steps01–03 and bridge01 are kitted, in `route-spans-v1`, not in the mud kit |
| building-depth-and-variety.md §5, Decisions 2 | the cap counts assemblies | CONFIRMED as the planner ruling. Superseded as a metric by §3 below |
| settlement-asset-inventory.md §7 | "18 building shells/kits · ~3,070 modular wall/roof pieces" | SUPERSEDED by §1's counts |
| settlement-asset-inventory.md §9 (vault map) | pool list | STALE. It omits KotM 190459, morrowind-hlaalu 157997, morrowind-imperial-keep 133090, the three Reimperialized pools and hovelmud 63329 |
| settlement-asset-inventory.md §2 "Free win" | Tropical repaints "the farmhouse and all five city kits" | CONTRADICTED. Changed diffuse maps: Whiterun 46, Solitude 28, Riften 12, farmhouse 9, Windhelm 1, Markarth 0; 180 of its architecture files are vanilla copies (§2) |
| settlement-kit-sourcing-log.md:160 | "Mud-hut / dwelling variety **closed** … clear the 25 %-per-template quota" | CONTRADICTED. Mud has 3 shells (inventory §0, corrected 2026-09-24) |
| settlement-kit-sourcing-log.md:99 | Hovelmud "not a mud hut", skipped | CONFIRMED. It is also a duplicate (§5) |
| 97-placement-principles.md:131 | "no template above ~25 % of its family in a region" | Proposed replacement in §3 |

Single doc to edit: this file (`building-asset-breadth.md`) owns breadth and counts. The
inventory's §2/§7/§9 and the depth doc's §3 should each shrink to a pointer here. The sourcing log
keeps its per-mod rows and gets its line 160 corrected. 97:131 takes the §3 rule once the owner
accepts it.

## 1. Piece-level inventory of exterior building assets held

Columns: shells = whole buildings; attach = porches, walkways, steps, walls-with-openings,
windows, shutters, chimneys, awnings, trim, doors, fences and terraces belonging to the family;
dmg = destroyed or broken states; used = pieces in any kit config today.

### 1a. Vanilla (Skyrim - Meshes.bsa, exhaustive over architecture/ and the dungeon exterior folders; interiors, LOD and Windhelm `tempassets` excluded)

| Family (folder) | Ext. pieces | Shells | Attach | Dmg | Dressing/fx in family | Used | Black Marsh read (§2) |
|---|---|---|---|---|---|---|---|
| Farmhouse (`architecture/farmhouse`) | 84 | 11: farmhouse01–06, farmlonghouse01, inn01, smith01, lumbermill01, windmill | 65: walkway01–04, walkway kit 28, stonewall/terrace 18, doors 4, ivy 3, fern 2, fencewoven 2, farmwell 1, bannerpost 1, waterwheel 2 | 7 (farmhouse×4, inn×2, rubble) | ivy, fern | 19 | honest |
| Solitude (`architecture/solitude`) | 133 | 13 named houses (bryling, erikur, evette san, styrr, vittoria vici, winking skeever, radiant raiment, bits and pieces, apothecary, blacksmith, house for sale, thalmor house and barracks); farm set 3 sfarmhouse; about 10 civic (blue palace, castle, bards college ×4, nine divines, mausoleum, embassy, east empire co.) | farm set 8 (sfarmporch×3, steps, shed, shedwall, silo, millfan); lighthouse×2, lumbermill, sawwaterwheel, windmill, well×2; patio walls 12; castle walls 8; doors 17 | 3 (styrr, vittoria, well) | clutter 30: market stall×3+top, banners, planters, signposts, lightpost, festival ropes, lighthouse fire on/off | 0 | honest (Imperial) |
| Riften (`architecture/riften`) | 162 | about 17 timber shells (rtfarmhouse×2, snowshod, playerhouse, orphanage, pawned prawn, bunkhouse, blackbriar manor and chalet, goldenglow, fishery, meadery×2, warehouse, blacksmith, stables, beebarb, mjoll) + 5 "city" twins | decks 10, docks 18, canal and plaza set about 30, walls 19, market stall×3, rtchimney01, fireplace×2, lamppost | 0 | leaves×4, gravestones×4 | 1 | honest (timber on water) |
| Whiterun (`architecture/whiterun`) | 259 | about 20 bespoke (wind×4, stores×2, shack×2, greymane, breezehome, bannered mare, blacksmith, meadery+warehouse, stables, jorvaskr, temple, hall of the dead, guardhouse, castle, towers) | shutters 4, trellis 5, market stands 4, stable kit 6, scaffold 14, farm fence 16, city walls 40, terrain bases 45, doors 9, lod window glow 1 | 5 | wrclutter 76 (mostly castle and interior) | 16 | shells Nordic; attachments honest |
| Windhelm | 204 | stone-quarter blocks, grayquarter×6, valunstrad chunks 37, palace, temple, docks set, market×4 | whfxwindowglow01–04, frames 3, flags 5, doors 11 | 2 | braziers, snow piles | 0 | Nordic (whfxwindowglow fx only) |
| Markarth | 227 | cliff-carved Dwemer-Reach houses about 10 + keep/temple chunks | stairs, balconies, bridges, market stall set 3 | 0 | hanging braziers | 0 | Nordic/Dwemer |
| Winterhold 38, High Hrothgar 86, Sovngarde 30, Sky Haven 67 | 221 | unique landmarks | — | rubble | — | 0 | off-culture |
| Orc longhouse | 13 | 1 | awnings 6, partitions 4, doors 2 | 0 | — | 0 | shell no; awnings honest (HTBM already ships copies) |
| Shack kit | 58 | modular: frames 12, roofs 11 | walls 13 (window×3, door×1) | broken 20 | — | 8 | honest |
| Docks (`architecture/docks`) | 17 | modular | all | 0 | — | 17 | honest |
| Tents | 4 | imperial L/S, nordic L/S | — | 0 | — | 0 | imperial honest |
| Falmer hut 2, hagraven house 3 (+fence 5, sticks, poles), giant camp 16 | 30+ | creature cultures | — | — | — | 0 | off-culture |
| Imperial fort exterior (`dungeons/imperial/exterior`) | 75 | modular: bldg corner, icorner, mid, straight and second storey (31), tower shell 12, towers 5 | walls 7 incl. gate, impextwindow01 (+dark), stairs 3, bridge, lighthouse, support, arch | rubble 6, blocks 6, floor chunks 2 | — | 0 | honest stone |
| Imperial fort, ice and Helgen variants | 85 | duplicates with snow or burn | — | — | — | 0 | excluded (snow) |
| Imperial tower 19 + stable kit 9 + clutterkits 86 | 114 | tower modules; stable modules | impwell, free wall and arch, pillars | rubble 20 | — | 1 | honest |
| Nordic ruin exterior (`dungeons/nordic/exterior`) | 124 | nordwelling ext 22, temple ext about 35, towers 8 | walls 15, stairs | rubble 8 | magic stones 5 | 10 (route-spans) | Nordic |
| Dwemer exterior (facades 73, roads 30, platforms 21) | 124 | modular | bridges, lifts | rubble 15 | — | 0 | off-culture |
| Stockade (`clutter/stockade`) | 72 | modular palisade, scaffold, tower, lean-to | bridges 8, gate, stairs | barricade stages | — | 27 | honest |
| Mines exterior (scaffolding 46, clutter 10, rockcliffmineentrance 2) | 58 | scaffold modules | rail ramps | — | beams, planks | 13 | honest |
| Landscape bridges | 4 | — | 4 spans | — | — | 4 | honest |
| **Total** | **2,028** (28 folder families) | | | | | **106** | |

The named families, located:
- Wells (6): farmwell01, swell (+destroyed), swellcastle01, rtplazawell01, impwell01, genericwell01 (kitted).
- Mills (14): farmhouse lumbermill01 + waterwheels 2, farmhousewindmill + fan, wrfarmhousewindmill, swindmill, sfarmhousemillfan, slumbermill01 + ssawwaterwheel, mrkmill set, and `clutter/lumbermill` 6.
- Lighthouses (4 + fire): slighthouse01 ×2 (city and farm), impextlighthouse01, impexticelighthouse01, slighthousefire on/off.
- Market stalls (17): wrmarketstand×4, t_marketstand01, smarketstall×3 + top, rtmarketstall + door, mrkmarketstall set 3, whmarketstall×2, plus carts 7.
- Camps: tents 4, woodfires 15, civil-war camp 35 (banners, cot, table, maps), bandit poles 7.
- Shrines: altar shrines 10 (Nine Divines), standing stones 18. There is no wayshrine mesh in vanilla.
- Animal pens: stable kits (Whiterun 6, Imperial 9), stables at Riften, Windhelm and Solitude, horsetrough01, hay 10. No coop or pen mesh exists; the fence families serve.
- Towers: impexttower + shell 17, imptower 19, whshorttower, rtcivilwartower, mrkcwexttower, cwtower, stockadetower, wrscafguardtower ×5, nortowerruins.
- Dressing families: clutter/common 124, containers 15, firewood 5, hay 10, carts 7, signage 74, blacksmith 8, woodfires 15. FX: fxsmokechimney01/02, fxsmokelargeclose01, fxambwindowglow01, whfxwindowglow01–04, wrlodwindowglow01.

### 1b. BM&V (Data1.rar; exterior only; vanilla-city overrides counted once)

| Family | Pieces | What | Used |
|---|---|---|---|
| Jet's farmhouse kit `jets/farmhouse` | 235 | walls 9 + corner post; wall-with-door 3; window walls a–d 32 + door 8; crossbeams 6; floors, lofts and decks about 14; log beams about 8; exterior fireplace and chimney stack 7; railing and post; stairs; foundation walls about 5 | 0 |
| Jet's misc, whiterun, riften | 85 + 38 + 19 | dock, misc and city add-ons | 6 (docks) |
| citebosmer houses / passerelles / trees | 107 / 59 / 15 | root houses, balconies, windows; walkway kit | 81 / 59 / 15 |
| Phitt Aldredanyia | 18 | house01–04, window, overhang01–05, foundation, lightpost, lanterns, pillar, pole, signpost, banner | 3 |
| Dagon Fel (`sheogorad/dagon fel` + `phitt/dagonfel`) | 71 + 65 | shack01–05, housetall01–02, nordhouse, awnings L/S, chimney small/tall, window01–02, doorframe, docks 13, lanterns, hammocks | 13 (docks) |
| Mud huts `huts/exterior` | 11 | hutexterior, hutdecking, doorframe01, window01–03, windowbox01, steps01–03, bridge01 | 6 (+doorframe in the composite) |
| Stilt house (Stroti) | 8 | stilthouseext, door, grill | 2 |
| Small house, Cyrodiil farmhouse, log cabin, manor (shack01), orc hut | 2 + 3 + 2 + 1 + 1 | smallhouseext + door; cyrfarmhouse01–03; cabinexterior + door; manorext; orchut01ext | 0 |
| Exterior chimney kit `architecture/fireplace` | 13 | chimneyb×4, chimneyfull, caps long/short, chimenytop, fireplace a/b | 0 |
| `imp/` Morrowind "common" Imperial house kit | 26 (6 exterior) | house_main_build, house_bay, ex_common_window_#, ex_entrance_#, ex_nord_door_#, little_roof | 0 |
| `architecture and structures` | 16 | ivy corners, whiterunchimneyedited, window, whiterunstables | 0 |
| Tents 10, market stand 4, gallows 6 | 20 | camp and civic | 0 |
| Rochester houses | 32 | English medieval houses and ruin | 0 |
| newcastle walls | 35 (+35 duplicate under `stroti/`) | curtain wall | 23 |
| Seaview 71, Griffon Fortress 14 buildings, bshighrock 71, largecastle 9 | 165 | Breton castles | 0 |
| Stroti tree house 46, old mill 23, dragonstone manor 23 | 92 | Nordic-rustic | 0 |
| Mushroom house 33, mushroomtower 31, Phitt daedric/dw/ashlands/stronghold/velothi/ruins 102 | 166 | Telvanni and Dunmer | 0 |
| Redoran | 13 | compound wall | 4 |
| **Total** | **2,461** | | **263** |

### 1c. Other vault pools

| Pool | Exterior building pieces | Used | Not yet used worth having |
|---|---|---|---|
| KotM 190459 (BSA **not extracted**, 0 nifs on disk) | mudhuts 38: mudhut01–03, lizardhouse, manorext, shed, smpodext01–02, door×2, window×2, overhang×5, stairs×2, mudhutchimney, floors, mudlump×2, tamu docks 4 (+ interiors 7). blackwood 107: thatchhouse×8, house×5 + platform×2 + under, hausneu×3, roundhut×3, shiveringhouse, watchtower, windmill + fan, stable, walkway×7 + stairs, plankwall×5, wall/walldoor, housepartition set, housewindow, docks 13, lumber waterwheels, watertower×2, sign/signinn. argonia/clutter 77: scalefence×5, scaletent×3, saxhleelfence×2, saxhleellantern×2, townlantern, wallbasket×6, hangingfeathers×3, tamwindchime, buntingline, beehive, ladder. denoffen 30 (Argonian-Aztec stone modular: walls, roofs, trims, pillars, stairs). xanmeer 148, imperialruins 34 | 0 | all; provenance per folder first (Recommendations 1) |
| HTBM 35933 villages + ruins | 37 + 108 | 65 (whole pool, incl. Hist roots) | shiveringcamp_×2, shivering_stairs (Kothringi camp); **not** `swamp house` (below) |
| Mud Mother Grove 146557 | 62 | 57 | — |
| Hlaalu 157997 | 127 | 68 | Sheogorad hall set 10 (interior); the rest duplicate mwkeep or are Nordic |
| mwkeep 133090 | 164 | 88 | 76 interior and extras |
| Reimperialized 134616 / 133861 / 134592 | 177 / 171 / 178 | 0 | only `fort/windows` impwindow01/02 + dark + moss (6); the rest re-paths mwkeep |
| Ayleid kit 90667 | 195 | 28 | ruin layer, out of scope here |
| Hovelmud 63329 | 79 (34 Stroti mushroom house + clutter) | 0 (no pool) | none (§5) |
| Xalfek 55595, Darkwater Den 52630 | 72, 121 | 0 | interior clutter only; no exterior building |

Held vs used, exterior building pieces: vanilla 2,028 / 106; BM&V 2,461 / 263; the other pools
about 1,050 (net of duplicates) / 306; KotM about 500 / 0.

Provenance flags, which sit outside the owner's author permissions:
- `swamp house.nif` ships in both BM&V (`architecture/swamp house.nif`) and HTBM (`villages/kothringi/swamp house`). Nexus skyrim 89966 says a mesh of that name was taken from *Sniper: Ghost Warrior 2* (inventory §9). A commercial-game rip is not covered by any mod author's permission. Keep it out of every kit until the two meshes are compared.
- KotM `blackwood/shiveringhouse_#` reads as a Shivering Isles (Oblivion) building. Verify its source before use, as for any Bethesda asset from another game.

## 2. "Tropicalised": the mechanism and the rule

What the pipeline does (measured):
1. **Tropical Skyrim overlay, on by default.** `build_kit.vanilla_texture_roots` (build_kit.py:232–250) puts `mod-sources/tropical-skyrim-33017/extracted` ahead of the vanilla BSA for every pool's vanilla-backed textures. The only way out is `untropicalisedReason`, which `test_tropical_default.py` enforces (owner ruling 2026-09-09). It swaps textures under vanilla filenames and changes no meshes. The vault holds all four Nexus files of skyrim 33017; the v1.1 update and the one-texture fix were applied to `extracted/` on 2026-09-24 (sourcing log, Tropical row).
2. **`textureAliases` per kit.** A kit re-points a texture to another of the same material:
   - `clutter/stockade` planks and posts go to farmhouse woodwall01 and woodpost02 (stilt, works, enclosure and route-structures kits).
   - DLC Telvanni paths go to BM&V Bosmer bark in `dungeon-root-v1`.
3. **Nothing else exists.** No building moss, tint or palette mechanism exists. Decision 0011's palette is terrain-only (groundMaterial.ts `uTint`). Moss on buildings comes only from moss baked into repainted textures (wrmossalpha01, smoss01) or from placed ivy/moss pieces.

What Tropical Skyrim actually repaints (measured 2026-09-24 against Skyrim - Textures.bsa; a diffuse map counts as changed when its luminance correlation with vanilla is below 0.8 or its mean colour shifts by more than 8; per-file rows in [diffuse-classes.tsv](../archive/building-depth-2026-09/diffuse-classes.tsv)). It changes 108 of the 1,238 vanilla architecture and dungeon textures. 180 of its 368 architecture files are byte- or pixel-identical copies of vanilla (Whiterun 34 + 26 pixel-identical, Solitude 33 + 9, Riften 20 + 9, farmhouse 2 pixel-identical, dungeon root 13, caves 2). Its "Nordic ruins retextured as Ayleid" is 3 ridgedstone maps; `textures/dungeons/nordic` is untouched. Project Rainforest SE (skyrimspecialedition 20636, file 74798) adds repaints where Tropical has none.

| Family | Vanilla files / diffuse | Tropical files | Tropical diffuse changed | Project Rainforest diffuse changed | Union |
|---|---|---|---|---|---|
| architecture/whiterun | 171 / 90 | 172 | 46 | 2 | 46 |
| architecture/solitude | 124 / 63 | 124 | 28 | 0 | 28 |
| architecture/riften | 56 / 29 | 56 | 12 | 0 | 12 |
| architecture/farmhouse | 58 / 29 | 13 | 9 | 0 | 9 |
| architecture/windhelm | 208 / 108 | 2 | 1 | 6 (whstreetstone01, whroughground*, whdirtbrick…) | 7 |
| architecture/markarth | 117 / 60 | 1 (a normal map) | 0 | 0 | 0 |
| architecture/winterhold, highhrothgar, sovngarde, skyhaventemple, falmer hut, tents, edgetrim | 164 / 84 | 0 | 0 | 0 | 0 |
| dungeons root, ridgedstone | 90 / 46 | 19 | 3 (ridgedstone02a/05/06) | 5 | 5+ |
| dungeons/caves | 41 / 25 | 18 | 11 | 12 | 13 |
| dungeons/nordic, imperial, dwemerruins, mines, riften, ships, azurasstar | 203 / 109 | 0 | 0 | 0 (its 192 files there are vanilla copies) | 0 |
| clutter/stockade | 8 / 4 | 0 | 0 | 0 | 0 |

Still no repaint anywhere in the vault: Markarth, Winterhold, High Hrothgar, Sovngarde, Sky Haven Temple, Falmer hut, tents, Windhelm beyond its 7 ground and street maps (101 of 108 diffuse), Nordic ruins, Imperial forts, Dwemer ruins, mines, Riften dungeons, ships and the stockade planks. The only full Markarth, Windhelm, Winterhold and fort repaints found are SCO Tropical Edition (skyrim 69382) and New Windhelm summer and tropical edition (skyrim 63649); neither is in the vault (owner question, 16h § Owner check-ins).

**Rule** (decision 0098 §2; rule 2 as amended by the planner 2026-09-24): tropicalise by texture, never by mesh. A vanilla family is honest in Black Marsh only if all three hold:
1. Its silhouette carries no Nord signifier: no carved dragon gables, no snow-scaled Nord stone massing, no burial, Dwemer or Akaviri architecture.
2. No texture it samples carries snow, frost, ice or a Nord-painted motif, unless Tropical repaints it or a `textureAliases` entry points it at a same-material texture that carries none. Neutral stone, timber, thatch and plaster pass unrepainted.
3. Its material is on the Part F grammar row it serves.

A family that fails 1 stays out whatever the texture. A texture that fails 2 gets an alias or a repaint, or the pieces that sample it stay out.

Textures that fail rule 2, by filename in each family's own texture folder (diffuse maps only; [rule2-texture-flags.tsv](../archive/building-depth-2026-09/rule2-texture-flags.tsv)). Snow shared from `textures/landscape` by a snow-dressed mesh is not in these counts; the kit build has to read each mesh's texture paths for that.

| Family | Diffuse | Fail rule 2 (snow, frost, ice, Nord motif) |
|---|---|---|
| architecture/farmhouse | 29 | 0 (arkaybanner01 is a Divines banner, not Nord) |
| architecture/solitude | 63 | 3: sdragonhead01, sdragontile01, sbanner01 (thalmorsbanner01 is not Nord) |
| architecture/riften | 29 | 0 |
| architecture/whiterun | 90 | 7: wrdragoncarvings01, wrdragontile01, wrdragontileblack01, wrchbanner01, wrcitybanner* ×3 |
| architecture/windhelm | 108 | 1: sonsofskyrimfancybanner |
| architecture/markarth | 60 | 1: mrkbanner01 |
| architecture/winterhold, highhrothgar, sovngarde | 54 | 3: winterholdbanner01, hhdragoncol01, sovngardebanner01 |
| architecture/tents | 4 | 2: smallnordtent, largenordtent01 |
| dungeons/imperial | 24 | 4: impextdecals01ice, impwall05ice, impextwall01ice, impextrubble01ice |
| dungeons root | 46 | 12: hallmural* ×11 (Nord burial-hall animal murals), dragonrunealphabet |
| dungeons/nordic | 14 | 7 dragon and wolf door, statue and stone maps |
| dungeons/caves | 25 | 10 icecave* and icefrozen* |
| dungeons/ships | 18 | 1: shipdragonmetal01 |
| dungeons/mines, riften, dwemerruins | 51 | 0 |
| clutter/stockade | 5 | 2: stockadeplanks01snow, stockadewood01snow |

Verdicts under the amended rule:

| Family | Material | Rule 1 (silhouette) | Rule 2 (textures) | Verdict | Change from the first rule |
|---|---|---|---|---|---|
| Farmhouse set, walkways, terraces, wells, mills | thatch, timber, plaster, dry stone | pass | pass | **honest** (imperial) | now passes on its own textures; the first rule's "13 repainted" was 9 changed |
| Solitude farm set; Solitude named houses | plaster, timber, slate | pass | pass, except pieces sampling sdragonhead01, sdragontile01 or sbanner01 | **honest** (imperial; named houses one-off) | now passes; 35 of its 63 diffuse were never repainted |
| Riften timber houses, decks, docks, canals | plank, shingle, piles over water | pass | pass | **honest** (imperial waterside quarter) | now passes; 17 of 29 diffuse were never repainted |
| Shack kit, stockade and scaffold, docks, mines scaffolding | plank, log, thatch | pass | pass, except the two stockade `*snow` maps | **honest** (stilt, works) | the stockade alias becomes optional, not required |
| Imperial fort exterior, tower, stable kit | ashlar | pass | pass, except the 4 `*ice` maps (the ice variants stay out) | **honest** (imperial) | unchanged |
| Imperial tents | canvas | pass | pass | **honest** | now passes (Tropical repaints no tent) |
| Whiterun attachments (shutters, trellis, stands, fences, scaffold, stable kit) | timber | pass | pass, except pieces sampling the dragon or banner maps | **honest** | now passes; 44 of 90 diffuse were never repainted |
| Caves, dungeon root stone, mines, Riften dungeons | rock, masonry, timber | pass | pass, except the ice-cave maps and the hall murals | **honest** (interiors and cave mouths) | now passes |
| Whiterun shells | timber, slate | carved dragon gables | dragon tiles | **Nordic** | unchanged |
| Windhelm, Winterhold, High Hrothgar, Sovngarde, Nord tents | Nord ashlar | snow-scaled Nord massing | textures mostly neutral | **Nordic** | unchanged (rule 1) |
| Markarth | Dwemer-cut rock | Dwemer-Reach massing | pass except mrkbanner01 | **Nordic/Dwemer** | unchanged (rule 1); its stone textures now pass for aliasing |
| Nordic ruin exterior (incl. the 9 `nortmpextplat*` in route-spans-v1) | Nord burial stone | knotwork, dragon heads | 7 motif maps | **Nordic** | unchanged |
| Dwemer exterior, Sky Haven (Akaviri), orc longhouse shell, Falmer/hagraven/giant | — | culture-specific | — | **off-culture** | unchanged |

Markarth is settled (planner, 2026-09-24): it is Dwemer-carved stone and stays out on rule 1 (silhouette); its neutral stone textures passing rule 2 does not reopen that.

Families that now pass which the first rule, measured strictly, failed: farmhouse, Solitude farm set and named houses, Riften, Whiterun attachments, imperial tents, and the stockade and shack kits without their alias. Families that still fail do so on rule 1, not on texture.

## 3. Variety: what the games deliver, and the metric to replace the 25 % cap

Measured distinct building forms per settlement (x/variety-*-classified.json). Only buildings
whose main piece classifies as dwelling, work, civic or storage count; walls and trees are
dropped. Shell = the largest-volume piece; signature = the set of distinct pieces in the building.

| Set, tier (buildings) | n | Buildings p50 | Distinct shells p50 (max) | Top shell share p50 | Distinct signatures p50 | Top signature share p50 |
|---|---|---|---|---|---|---|
| Skyrim 4–6 | 39 | 5 | 2 (6) | 0.50 | 3 | 0.50 |
| Skyrim 7–12 | 11 | 9 | 6 (10) | 0.29 | 8 | 0.18 |
| Skyrim 13–25 | 5 | 20 | 13 (18) | 0.19 | 16 | 0.14 |
| Skyrim 26+ | 2 | 42 | 26 | 0.30 | 32 | 0.22 |
| BM&V Black Marsh 4–6 | 9 | 6 | 3 (5) | 0.50 | 3 | 0.50 |
| BM&V 7–12 | 7 | 9 | 4 (5) | 0.43 | 5 | 0.33 |
| BM&V 13–25 | 2 | 22 | 8 | 0.71 | 14 | 0.64 |
| BM&V 26+ | 5 | 67 | 19 (24) | 0.21 | 28 | 0.19 |

- Skyrim buys variety with bespoke shells: a village of 20 has 13 different buildings. Every city
  house is its own mesh (BK §3). Vanilla houses carry 19.5–69.5 pieces within 12 m (depth doc §1).
- BM&V's Black Marsh is the sparse counter-example the owner is reacting to. Its villages repeat
  one shell 43–71 % of the time.
- Morrowind varied the *style set per town*: Hlaalu, Redoran, Telvanni or common, each a
  numbered series of whole-building statics (ex_hlaalu_b_01 upwards; Project Tamriel "Exterior
  Modding Tutorial"). Morrowind.esm is not in the vault, so per-town counts are unmeasured.

Why the 25 % cap is the wrong metric:
1. It is scoped to a family in a region, not to what the player sees. 25 % of 200 mud houses
   allows 50 copies of one assembly, and nothing stops ten of them standing in one view.
2. At the smallest tier it is stricter than the source games: Skyrim and BM&V hamlets run
   50 %. At the village tier it is looser than Skyrim: 29 % at 7–12 buildings, 19 % at 13–25.
3. It says nothing about "alive": a unique shell with no porch, light or clutter passes.

Replacement metric, per settlement, checked at blueprint export:

| Check | Hamlet (4–6) | Village (7–12) | Town (13–25) | City (26+) |
|---|---|---|---|---|
| Distinct dwelling signatures ÷ dwellings | ≥ 0.75 | 1.0 | 1.0 | ≥ 0.9 |
| Distinct shells (the culture's reachable count sets the ceiling) | ≥ 2 | ≥ 4 | ≥ 6 | ≥ 8 per culture quarter |
| Top shell share among dwellings | ≤ 0.5 | ≤ 0.35 | ≤ 0.25 | ≤ 0.2 |
| Two buildings on one shell differ on ≥ 3 axes (porch/steps, openings, roof detail, condition, trade dressing, yaw/mirror) | yes | yes | yes | yes |
| Pieces within 12 m per dwelling, p50 | ≥ 15 | ≥ 20 | ≥ 25 | ≥ 40 |
| Minimum set per dwelling: door, light, roof detail, windows (unless "none by design", depth doc §4), ≥ 5 personal clutter | yes | yes | yes | yes |
| Non-dwelling share (work + civic + storage), 97:425 bands | per 97 | per 97 | per 97 | per 97 |

Province-wide: a full signature appears at most 3 times in the province and never twice within
2 km. This replaces "~25 % … in a region" and keeps "≥3 axes within 2 km".

Where the numbers come from: shell and share rows are the Skyrim p50s rounded to be at least as
strict at village tier and above. Dressing rows sit at or below the vanilla 19.5–69.5 range,
because marsh houses stand closer to water. A signature is the sorted list of pieces with
condition variants; the workbench computes it when exporting.

Reachability per grammar (shells, before assemblies):
- argonian-mud: 3 now; about 11 with KotM mudhuts (mudhut01–03, lizardhouse, manorext, shed, smpodext01–02) plus BM&V's 2.
- argonian-stilt: 3 + shack kit (unbounded); about 20 more with KotM blackwood.
- argonian-root: 3. It meets the table only through assemblies (balconies, access, windows, lianas).
- imperial: farmhouse 9 + Solitude farm 3 + cyrfarmhouse 3 + smallhouse + Riften about 17 + Jet (unbounded) + Hlaalu.
- dunmer-hlaalu: Hlaalu about 6 + Dagon Fel 7.

## 4. Candidate mods not in the pool (only where the vault lacks the form)

The vault lacks three forms:
1. Reed-woven (not plank) Argonian walls. KotM thatch houses may cover this; verify after extraction.
2. An Argonian communal hall. KotM lizardhouse and manorext may cover this.
3. Imperial colonial town houses with arcade or veranda. Solitude, Hlaalu and BM&V `imp/` cover it in part.

The Nexus sweep (v2 GraphQL; queries in x/nx.py) found no Argonian or tropical building resource
beyond what we hold, confirming sourcing-log:147–154. Candidates:

| Mod | Nexus | Adds | Size | Terms (owner would ask) | Why |
|---|---|---|---|---|---|
| FYX – 3D Shack Kit Walls / Roofs (Yuril) | SSE 67123 / 67488 | replacement meshes: real 3D boards on the 58-piece shack kit; uses riftencanalplanks01, which Tropical repaints | small | none stated; ask | lifts the stilt kit's main family without new forms |
| Keep and Middle Class Houses (kiko) | SSE 137960 | 7 town houses + 6 chimneys + a keep, with sample esp | 1.3 GB | "free to use … for any mods or projects", credit optional | Imperial town tier beyond farmhouses; lore fit (European townhouse) needs a look |
| Cyrodiil Farmhouse Tileset (Beyond Skyrim) | LE 48582 | 7 models: small/medium/large farmhouse or inn with interiors, and a windmill | 9 MB | Beyond Skyrim resource, credit | the vault holds 3 (BM&V cyrfarmhouse01–03); adds the inn and windmill in the Cyrodiilic idiom |
| Stroti's Stilt House, optional split file | LE 61824 | stilthouse split into hut and platform | 1 MB | "not … in paid mods" | lets the one BM&V stilt house stand on our own decks |
| Tropical Lands Assets – Cathnoquey | SSE 33446 | only 2 architecture nifs; kapok, palm and bamboo flora | 429 MB | "free to use any and all", credit | flora lead only, no building breadth |

Not candidates:
- Houses – A Resource Pack (SSE 124384): 15 SketchFab models with mixed per-object credits.
- Orcish Hut Kit (LE 52289): off-culture.
- Hearthfire: the owner's DLC. Jet's kit covers modular farmhouses (depth doc §3).

## 5. Redundant vault families (retire)

- **Hovelmud 63329: retire.**
  - It is Stroti's Mushroom House (34 pieces) plus Oaristys and Lor clutter.
  - BM&V ships the same set twice (`architecture/mushroom house` 33, `stroti/mushroom house` 33).
  - Its form is Telvanni, off-culture inland (sourcing-log:99). It is registered as no pool (build_kit.py:287–311).
- **Mud Mother Grove 146557: retire the hut, keep the pool.**
  - It is a separate mod from Hovelmud. Its one dwelling (`mudhut01`) has an interior (`mudhut01intnew`, used by `mudmother-hut-int`, 64 pieces) but no windows. Its load door is a Dragonborn mesh the vault lacks (depth doc T6).
  - Once KotM is extracted, KotM's mudhuts cover the form with windows, doors, chimney and six interiors.
  - The pool still supplies 57 pieces across 6 kits that nothing else in the vault provides: a hero Hist tree, bone chimes, Sithis shrine, totem, lanterns ×4, carapace oven, platforms, ArgonianBridge, fences 7, tents 2.
  - Retire `mudhut01`, `mudhut01intnew` and the `mudmother-hut-int` shell once the KotM mud interiors are kitted. Keep the props.
- **Reimperialized ×3: redundant.** 526 meshes re-path the mwkeep set. Keep only the 6 `fort/windows` impwindow pieces (moss variants), or none.
- **Other duplicates.** The Hlaalu `morrowindimperialfort/` 32, KotM `tesak1243` 168, KotM `stockades` 45 and KotM `ayleidruins` 121 duplicate mwkeep, vanilla stockade and the Ayleid kit. Do not kit them twice.
- **BM&V's vanilla-city copies** (whiterun 112, solitude 106, windhelm 55, markarth 53, riften 38, winterhold 15): use the vanilla originals.

## Sources

- Vault: skyrim-source/manifest-skyrim-meshes.txt; /tmp/wf/buildings/_bmv_meshes.txt; /tmp/wf/buildings/_kotm.txt; mod-sources/* walks; tropical-skyrim-33017/extracted.
- Repo: tooling/asset-pipeline/pipeline/build_kit.py:232–331, test_tropical_default.py, config/kits/*.json; tooling/world-generation/worldgen/mine_settlement_form_stats.py; docs/world/97-placement-principles.md:131, :749–762.
- Nexus API v1/v2: SSE 33446, 137960, 124384, 67123, 67488; LE 48582, 61824, 52289, 58651, 38550.
- Web: https://wiki.project-tamriel.com/wiki/Exterior_Modding_Tutorial ; https://www.tamriel-rebuilt.org/content/hlaalu-interior-style-guide ; https://www.nexusmods.com/skyrimspecialedition/mods/67123 ; https://www.nexusmods.com/skyrimspecialedition/mods/137960 ; https://www.nexusmods.com/skyrim/mods/48582 ; https://www.nexusmods.com/skyrim/mods/61824 ; https://www.nexusmods.com/skyrimspecialedition/mods/33446
- UESP (via depth doc): Lore:Xanmeer; Lore:The Improved Emperor's Guide to Tamriel/Black Marsh.

## Recommendations

1. **Extract KotM first.**
   - `pipeline/bsa.py` BSAArchive can unpack `King of the Murkmire.bsa` to `extracted/`. Register pool `kotm` in build_kit.py `dir_pools` and in `asset_registry.POOLS`.
   - Record provenance per folder: `argonia/mudhuts`, `blackwood` and `clutter` are the author's own until shown otherwise; `tesak1243` is mwkeep; `denoffen`, `ayleidruins` and `1mjy` are third-party; `shiveringhouse` is to be verified.
   - Then run `mine_assemblies` on `King of the Murkmire.esp` for mudhut and blackwood templates, sample first per `kit-mining`.
   - Evidence: §1c, 0 nifs on disk.
2. **Kit plan, in this order:**
   1. `settlement-mud-v1` gains:
      - KotM mudhuts (30 exterior pieces) and its 6 interior shells;
      - BM&V hut window01–03, windowbox01 and steps01–03;
      - KotM clutter: scalefence, scaletent, saxhleelfence, saxhleellantern, townlantern, wallbasket, hangingfeathers, tamwindchime, buntingline.

      Retire the Mud Mother hut (§5).
   2. `settlement-stilt-v1` gains the other 50 shack pieces. Once the lore check against material-culture.md:21–24 passes, it also gains KotM blackwood (thatchhouse×8, house×5 + platforms, roundhut×3, walkways 8, plankwall×5, partitions + windows, watchtower, stable, watertower×2, docks 13). Add the FYX mesh upgrade if the owner obtains permission.
   3. `settlement-imperial-v1` gains:
      - farmhouse03–06, inn01, smith01, farmlonghouse01, the 6 destroyed variants, walkway01–04 and the 28-piece walkway kit, the 14 remaining terraces, ivy×3, farmwell01;
      - the Solitude farm set (sfarmhouse×3, porch×3, steps, shed, silo, windmill, lighthouse, lumbermill);
      - cyrfarmhouse01–03, smallhouseext, Jet's farmhouse kit 235, the BM&V `imp/` exterior 6, the BM&V chimney kit 13, wrshutter×4 and imperial tents 2.
   4. New `settlement-imperial-town-v1`: Riften timber houses 17 + decks 10 + riften docks 18 for the Imperial waterside quarter (Lilmoth, Gideon ports), and Solitude named houses 13 as one-off landmark shells.
   5. New `fort-imperial-v1`: vanilla impext 75 + tower 19 + stablekit 9, the second fort language beside mwkeep, with impwindow moss ×6.
   6. `hlaalu-domestic`: add Dagon Fel shack01–05, housetall×2, awnings, chimneys, window01–02 and doorframe for Thorn only.
   7. Shared `dressing-v1`: fxsmokechimney01/02, fxsmokelargeclose01, whfxwindowglow01–04, fxambwindowglow01, lampposts, and the vanilla farmhouse dressing set from depth doc §6 item 7.

   Credits go in root README § Credits in the same change.
3. **Rule check on existing kits.** route-spans-v1 carries 9 `nortmpextplat*` plus dragonbridge01, and route-structures-v1 carries wrcastlestairs01 with its platform. Both fail §2 rule 1 (Nordic burial and castle silhouettes). The planner decides whether to swap them for imperial-fort bridge and stair pieces.
4. **Brief edits:**
   - 16h part 2: replace the A6 "~25 % template" check with §3's table, and have the workbench's repetition-signature command (depth doc §6 item 6) compute the signature defined in §3.
   - 16h part 2: add "extract and register KotM" as the first step.
   - 16h part 2: add the Mud Mother hut retirement to the yard rebuild, where the mud hut becomes KotM mudhut02 per depth doc §6 item 7.
   - 16i: the part-1 paper plans list, per settlement, its tier row from §3 and the shells it draws on. The acceptance checks gain the dressing-per-dwelling and signature rows.
5. **Corrections to apply with the edit:**
   - depth doc §3 Hlaalu row and §1 cause 4;
   - sourcing-log:160;
   - inventory §2 "Free win", §7 counts, §9 vault map;
   - 97:131 once the owner accepts §3.
6. **Owner questions:**
   - (a) Accept the §3 table in place of the 25 % cap.
   - (b) Allow Solitude's named houses and Riften's timber houses as Imperial-quarter shells.
   - (c) Ask the FYX author and kiko for permission.

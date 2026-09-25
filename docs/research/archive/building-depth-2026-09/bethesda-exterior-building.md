# How Bethesda builds a Skyrim exterior building (research, 2026-09-24)

Headline: vanilla Skyrim's lived-in town and farm houses are NOT kit-bashed. Each is one authored shell
mesh, with windows (glow maps), shutters, chimney, trim and ivy modelled or baked into it. The
modular kits are for dungeons, forts, ruins and shacks. What makes a house read as inhabited is
the dressing placed around the shell: 20 to 70 separate refs within 12 m of each house.

## Reconciliation
- docs/research/placement-settlements/kit-level-design-and-layout-generation.md covers the GDC 2013
  talk for dungeon kits (grid, 128 snap, footprints). This research agrees with it. That doc
  has nothing on exterior houses, so the new section belongs there.
- docs/research/placement-settlements/kit-assemblies-evidence.md and world/sources/placement/kit-assemblies-mined.json
  mine structural pieces only (vanilla macro: structuralRefs 16454, nonStructuralRefsSkipped 227013).
  Dressing around houses has never been mined. This research fills that gap; its method is in section 5.
- docs/research/placement-settlements/settlement-asset-inventory.md:130 lists BM&V round mud huts with "+ windows/steps/doorframe"
  as a separate family. BM&V follows the vanilla pattern: a shell plus separate accessories.

## 1. Single mesh or kit-bash, per family (vault manifest + BSA reads)
| family | construction | evidence |
|---|---|---|
| Farmhouse | 9 whole shells (farmhouse01-06, farmlonghouse01, inn01, smith01) + attachable walkways (farmhouse01-04walkway) + walkway kit (28: walkway*, walkwaystairs1/3/4/8/15) + terrace-wall kit (18: stonewall*, stonewallterrace*) + ivy01-03, fern01-02, fencewoven01-02, 5 destroyed variants | 91 placed houses in Tamriel from 9 shells (farmhouse01 x20, 05 x14, inn01 x13, 06 x10, 02 x8, smith01 x8, 03 x7, 04 x7, longhouse x4). Nodes L2_Ivy and L1_Posts are baked in; the glass is farmwindowinterior01_m.dds inside the mesh |
| Whiterun | one bespoke mesh per building (wrhousewind01-04, wrbreezehome01, wrhousegreymane01, wrhousestores01/02, wrjorvaskr01...), each with its own *lod twin | wrhousewind01 textures wrwindows01_g, wrwoodlattice01_g, wrtrims01 are all in the shell. Separate shutters wrshuttersingle01/double01/doublespaced01/triple01 sit in wrclutter (19 + 6 refs near houses) |
| Solitude | one mesh per named house (sbryling house, serikur house, sstyrrshouse...), each placed once; farm shells sfarmhouse01-03 + sfarmporch01-03 + sfarmshed01 | the sbryling house nodes are "Chimeny", "L2_Shutters", "L2_nails01"; textures swindow01_g, smoss01 |
| Windhelm | stone-quarter house blocks (whstonequarterhouses01, whgrayquarter01-06) + ~37 city chunks whvalunstrad1-37 | whstonequarterhouses01 is a 2 MB single mesh with whwindowmapsglow_g; separate window glows whfxwindowglow01-04 |
| Riften | one mesh per house (rtfarmhouse01/02, rtsnowshodhouse01, rtplayerhouse01...) + deck/dock kit (riften/docks 18) + rtchimney01 | rtfarmhouse01 has a "WindowGlow" node, riftenwindows02_g and shinyglass_e |
| Markarth | cliff-carved house meshes (mrkogmundshouse01-04, mrkendonshouse01/02...) + stair, balcony and bridge pieces | 218 loose nifs, mostly unique chunks; no window textures (stone slits) |
| Orc stronghold | orclonghouse01 single mesh + awning kit (orcawning* 6) | 5 textures, one shell |
| Shacks | TRUE modular kit, 58 pieces: shackframe* 12, shackwall* 13 incl. shackwallwindow01/02, shackwalltopwindow01, shackwalldoor01; shackroof* 11; shackbroke* 20 | 30 shack anchors carry 86.8 refs within 12 m, most of them shack pieces |
| Imperial fort | modular exterior kit dungeons/imperial/exterior (75) + exteriorice (78): impextbldg*, impextwall01-05, impextwindow01, impexttowershell* | kit |
| Nordic ruin exterior | modular: norextwall*, nortmpextplat*, nordwelling01-04extbase* + extcourt* + extcourtawin01 | kit |
| Docks | modular: architecture/docks 17 (dockstr*, dockcolstr*, dockstepsdown*) + riften/docks 18 | kit |
| Raven Rock | not in the vault (no DLC meshes in manifest-skyrim-meshes.txt: 0 lines under meshes/dlc0*) | not checked |

Snapping rules (CK wiki "Bethesda Tutorial Layout Part 1"): "Snap To Grid" 128 and "Snap To Angle" 45 for the Nordic
kit, and other kits may differ. Pieces are named by kit, sub-kit, size, part and exit (NorRmSmWallSideExSm01).
GDC 2013 (gamedeveloper.com): a character is 128 units tall; snap is half the footprint; the pivot is the ground-plane centre;
"footprint is the full bounds of the piece"; sub-kit footprints are multiples of each other. The talk covers
interior dungeon kits only; it says nothing on exterior houses. A Nexus farmhouse resource (jet4571, 58262) snaps at 64.

## 2. What makes a house read as inhabited
Windows are in the shell as a glow-map (_g) texture. The CK Emittance region FXLightRegionInvertLightsWhiterun
lights them at night only (Frontier "The Window Trick"). For distance, a *lod mesh + wrlodwindowglow01
(wrlodwindows01.dds) is used; static LOD supports only its own emit (DynDOLOD Glow LOD). Snow and moss come from
the Material Object directional shader (CK wiki "Material Object") plus baked moss alpha (wrmossalpha01_n, smoss01).
Dressing mined within 12 m (full table: /tmp/wf/buildings/vanilla-house-surroundings.json):
- farmhouse (24.7 refs per house): barrel01, firewood piles large/medium/small, farmbench01, walkwaystairs4/8, fencewoven02,
  fxsmokelargeclose01, bucket01, haymound01, potato/leek/clover crops, rail/wall lean markers (NPC idles).
- whiterun (19.5): wrshuttersingle01, fxsmokechimney01/02, wrbrazier01, stable platforms, lavender and leek plots.
- solitude (47.8): candlelanternwithcandle01, ssighpost02 (shop signs), sropefestivalline01, crates, kettle01, garden crops, hanging moss.
- riften (22.1): rtchimney01 + fxsmokechimney02, rtleaves01/02, gourds, lanterns, chairs and benches.
- windhelm (69.5) and markarth (59.4): fxsmokechimney01/02, fxfirewithembers, hanging braziers, sawhorses, snow drifts.

## 3. Variety per family
Farmhouse: 9 shells give 91 placements, and the variety comes from walkways, terraces, destroyed states and dressing.
City houses: variety comes from one bespoke mesh per building (Solitude 12 houses, 12 meshes). Shacks: 58 pieces make
every shack unique.

## 4. Exact piece names: windows / shutters / trim / chimneys / porches
- Windows (separate pieces): shackwallwindow01, shackwallwindow02, shackwalltopwindow01, impextwindow01(+dark),
  nordwelling01extcourtawin01. Window light: whfxwindowglow01-04, wrlodwindowglow01. Every other family has its windows in the shell.
- Shutters: wrshuttersingle01, wrshutterdouble01, wrshutterdoublespaced01, wrshuttertriple01. Solitude shutters are baked in (L2_Shutters).
- Trim: whdockdoortrim, whstormcloaksfancybannertrim01, whframestone1/2, whframewood. Otherwise in the shell (wrtrims01, strims01, whstonetrim01).
- Chimneys: rtchimney01 (the only vanilla chimney mesh). Smoke: fxsmokechimney01/02, fxsmokelargeclose01. The mod Farmhouse Chimneys
  (Nexus skyrim/51330, SE 8766) exists because vanilla farmhouses have none.
- Porches, decks and awnings: sfarmporch01-03, sfarmhousesteps01, wrjorvaskr01backporch01, wrcastlestonetower01porch,
  mrktempleporchl01/c01/r01, rtblackbriardeck01, rtplayerhousedeck01, rtsnowshoddeck01/02, rtmjolldeck01/02, rtmercerdeckf01,
  orcawning01/full01/half01, farmhouse01-04walkway + walkway kit.

## 5. Method
Mesh lists: manifest-skyrim-meshes.txt. Textures and nodes: pipeline/bsa.py reading Skyrim - Meshes.bsa
(/tmp/wf/buildings/vanilla-nif-strings.txt). Dressing: worldgen.mine_assemblies.collect(accept=all) on Skyrim.esm+Update.esm,
all worldspaces, 282,388 refs; every ref within 12 m horizontal and 15 m vertical of a house anchor.

## Sources
- https://www.gamedeveloper.com/design/skyrim-s-modular-approach-to-level-design (GDC 2013, Burgess & Purkeypile)
- http://blog.joelburgess.com/2013/04/skyrims-modular-level-design-gdc-2013.html (transcript; the fetch failed, socket closed)
- https://www.slideshare.net/slideshow/gdc2013-kit-buildingfinal/17728576
- https://book.leveldesignbook.com/process/blockout/metrics/modular
- CK wiki via ck.uesp.net/w/api.php: "Bethesda Tutorial Layout Part 1", "Material Object", "Static", "Bethesda Tutorial Optimization"
- https://frontierskyrim.wordpress.com/2015/04/04/the-window-trick/
- https://dyndolod.info/Help/Glow-LOD
- https://www.nexusmods.com/skyrim/mods/58262 (jet4571 building kits, 64-unit snap)
- https://www.nexusmods.com/skyrim/mods/51330 , https://www.nexusmods.com/skyrimspecialedition/mods/8766 (Farmhouse Chimneys)
- https://steamcommunity.com/groups/SkyrimCKPublic/discussions/0/540743212905300107 ("many interior roof pieces but few complete exterior sets")
- https://wiki.project-tamriel.com/wiki/Exterior_Guidelines (403; search snippets only)
- UESP: Lore:Architecture and Skyrim:Architecture do not exist (API query "missing")

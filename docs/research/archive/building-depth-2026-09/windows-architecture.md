# Windows as architecture (check-in 2 item 8, part 2)

HEADLINE: Skyrim puts windows INTO the building mesh for every inhabited vanilla family (a painted, glow-masked pane in the mesh). Separate window pieces are the exception: fort window blocks, shack window-wall panels, and Whiterun shutters as dressing. The mods split. Mods whose plugins place windows on their houses: KotM mud huts, the Phitt marsh house, the BM&V Valenwood tree houses. Mods that ship windows their plugins never place: the BM&V hut, the Bosmer house-window sets, Hlaalu. Mods with no window pieces at all: HTBM bamboo, Mud Mother Grove. Lore says Shadowfen mud huts HAVE windows.

## Reconciliation
- Live docs on this topic:
  - 16h brief § Owner check-ins item 8 (docs/phases/16-foundation-and-places/16h-settlement-runtime-and-kit-qa.md:500-502). This is the single doc to edit: it asks for the rule.
  - settlement-root-v1.json snapLogic.houses. It claims each house form "takes" its own `housetroncwindowet/rc00x`, `housechampwindow00x` and `windowet/rc` set.
  - hlaalu-domestic.json composite `marsh-house-03` (house03 + overhang05 + 4 `window` at mined offsets).
  - docs/research/placement-settlements/kit-assemblies-evidence.md:180-218, :688.
  - world/sources/lore/topics/material-culture.md:18-24.
  - docs/research/rendering/building-placement-rendering-treatments.md item 17 (night glow; rendering, covered by windows.md).
- Confirmed:
  - marsh-house-03 is the working pattern for rule (b).
  - material-culture.md:18-20 (mud huts have windows).
- Contradicted, PARTIAL: the root-kit snapLogic.
  - The house*window* pieces are authored in the shell's own frame. HouseTroncWindowET001 centre is (-4.4,-10.1,1.85) m, HouseChampWindow001 is (-6.7,0,1.5) m, both at the wall. So they fit at offset 0.
  - No BM&V plugin ever places them: kit-mounts-mined.json anchors show n 0, evidence "unplaced".
  - The plugin windows these houses with the generic `phitt/aldredanyia/window` instead. Templates: housegland001 bmv-valenwood:t0442/t0443 (n 29) and t0542/t0543 (n 14); housechamp001 t1197-t1200 (n 3). housetronc001 has no template.
- Prior report /tmp/wf/checkin2/windows.md, claim "BM&V, HTBM and KotM huts have no windows at all": PARTIAL.
  - True of the hut meshes.
  - FALSE as architecture for KotM: its plugin places window01/02 on 19 of 22 huts.
  - BM&V ships Window01-03 for its hut, but no plugin defines a base object for them.

## Evidence files
- Vanilla mesh scan (raw texture strings per NIF, Meshes.bsa): /tmp/wf/checkin2/vanilla-window-scan-raw.json (tool tools/vanilla_windows.py + inline raw scan)
- Plugin ref counts + nearest building within 15 m: /tmp/wf/checkin2/esm-windows-<plugin>.json (tool tools/esm_windows.py)
- Full vault NIF listing (every mod folder + BSA namelists): /tmp/wf/checkin2/vault-mod-nif-listing.txt
- BM&V meshes extracted from Data1.rar: /tmp/wf/checkin2/bmvx/ (lists bmv-extract-list*.txt)
- Shape bounding spheres: tools/nifsphere.py

## (1) Vanilla families (Skyrim - Meshes.bsa + Skyrim.esm)
| family | NIFs with a window texture in the building mesh | separate pieces the CK places (ext refs, where) | verdict |
|---|---|---|---|
| farmhouse (architecture/farmhouse) | 9 of 36: farmhouse01-06, farmlonghouse01, inn01, smith01 (`farmwindowinterior01` + `_m` glow mask) | none | (a) modelled |
| Whiterun (wrbuildings) | 32 of 68 (`wrwindows01` + `_g`, `wrwoodlattice01`) | wrshuttersingle01 17, double01 6, triple01 3, doublespaced01 2; all in WhiterunWorld, median 4.9-7.3 m from wrhouse*; dressing over modelled windows | (a) modelled + dressing |
| Solitude | 31 of 87 (`swindow01/02/03` + `_g`) | none | (a) |
| Windhelm | 23 of 187 (`whwindowmaps` + glow) | whfxwindowglow01 9 refs (glow FX over wharetino etc.) | (a) + glow FX |
| Riften | 28 of 109 (`riftenwindows02` + `_g`, `shinyglass_e`) | none | (a) |
| Markarth | 41 of 218 (`mrkinnwindows01`) | none | (a) |
| Winterhold | 14 of 38 (`winterholdwindow01/02`) | none | (a) |
| Imperial forts (dungeons/imperial/exterior, exteriorice) | towers only: impexttower01(+dark), impexticetower01 | impextwindow01 32, impextwindow01dark 12, impexticewindow01dark 17; median 3.3-4.7 m from impext blocks | (b) separate fort window block |
| shacks (architecture/shackkit) | 0 of 55 structural | shackwallwindow01 6, shackwallwindow02 11, shackwalltopwindow01 8; window WALL PANELS that replace a plain wall; templates vanilla:t0354/t0355 (on shackroofside01, n 7), t0588 (shackframerend02, n 5); shackwallwindow02 neverAlone | (b) kit variant panel |
| Nordic ruins (dungeons/nordic/exterior) | 0 of 124 | none | none by design (barrows) |
| Orc longhouse, Falmer hut, tents | 0 of 17, 2, 4 | none | none by design |
Vanilla never uses case (c), a window painted onto a flat wall with no geometry. Every modelled window is its own shape with a pane texture and usually a glow mask.

## (2) Every building family we hold (kits + vault)
Y = in the yard; E = in a 16i exemplar (L Lilmoth, N Nine-Trunks, M Mazzatun, T tapping camp, W Wamasu Pond, 6 = the dungeon-kind sixth).

| family (kit) | Y/E | windows in mesh | window pieces placed by the source plugin | window pieces available in the vault (path, count) | lore | rule |
|---|---|---|---|---|---|---|
| vanilla farmhouse01/02 (settlement-imperial) | Y, L | yes (Farmhouse01:14) | n/a | modelled | foreign Imperial, windows normal | (a) keep; fix glow (windows.md) |
| BM&V hutexterior, composite hut-with-entrance (settlement-mud) | Y, N | none (4 shapes: walls, roof, 2 beams) | none: no BM&V plugin defines a base for them; 11 hutexterior refs, 0 windows | bmv `architecture/huts/exterior/Window01, Window02, Window03, WindowBox01` (4; same wood01/woodend01 textures as the hut, + window.dds/shutter01.dds; each piece is centred on its own pivot, 1.6-2.4 m across) | Shadowfen mud huts have windows ("dry excreta mixed into the sealing at the edges of windows", UESP Lore:The Improved Emperor's Guide to Tamriel/Black Marsh; material-culture.md:18-20) | same set, no placement data: an owner or planner call. Either (b-geometry): add the 4 pieces and place them on the measured wall. Or (c-in-vault): switch to the KotM family |
| Mud Mother Grove mudhut01 (settlement-mud) | N 9, M 4, T 1 | none (mudhut01.dds only) | none; ArgonianLakeHouse.esl has no window base | none in its set (62 NIFs listed) | as above: mud huts have windows | (c) within the vault: KotM mudhut02 + smpodext02 + window01/02 |
| KotM argonia/mudhuts (not in a kit) | none | none (mudhut02 and smpodext0x use desertcracked01_d only) | window01 10 ext, window02 12 ext (ArgoniaWorld). 21 of 22 sit 3.4-7.1 m from a hut. Windows on mudhut02 5/6, smpodext02 7/7, smpodextdoor 5/6. 2-5 windows per hut | `King of the Murkmire.bsa::meshes/argonia/mudhuts/window01.nif, window02.nif` (2; amber pane + hut mud texture) | Murkmire / Argonian mud | (b) mount by mined template, once KotM is added to mine_assemblies sets |
| HTBM bamboohut01/02 (settlement-stilt) | L 36 shells | none (bamboo01, wicker03, thatch03, woodrough08) | none; the HTBM plugin defines no window base | none in HTBM (18 NIFs in villages/argonian). Nearest in the vault: bmv huts/exterior Window02/03 (shutters), bmv phitt/dagonfel window01/02 (hinged shutters). Both cross-set | Murkmire reed weave on stilts; UESP silent on windows | (a) accept as woven reed form, or owner call on a cross-set piece. The vault has candidates; no sourcing gap |
| BM&V stilthouseext (settlement-stilt) | Y, L | none (riftencanalplanks only) | none (4 refs, 0 windows) | vanilla shackkit shackwallwindow01/02, shackwalltopwindow01 (3; planks, not the same texture); bmv phitt/dagonfel window01/02 (2) | Murkmire, silent | (a) accept, or owner call on a cross-set piece |
| vanilla shackkit pieces (settlement-stilt) | none | none | yes: shackwallwindow01/02 + topwindow01, 25 ext refs, templates t0354/t0355/t0588 | vanilla `architecture/shackkit/shackwallwindow01, 02, shackwalltopwindow01` (3) | n/a | (b) add to settlement-stilt beside shackwalll01/r01 |
| BM&V Dagon Fel shack01-05 (not in a kit) | none | yes, `screen.dds` screen window in all 5 | window01 17 ext (Black Marsh North) at median 2.4 m, on shackanwinglarge 12 and shackdoor 5 | bmv `architecture/phitt/dagonfel/window01, window02` (2) | Dunmer Dagon Fel form (topic6) | windowed alternative already in BM&V, if a plank house is wanted |
| Phitt marsh house03 (hlaalu-domestic) | none | none (box) | `aldredanyia/window` 319 ext, templates t0012-t0015 (n 27) | bmv `architecture/phitt/aldredanyia/window` (1, glassamber) | Dunmer / foreign | (b) done: composite marsh-house-03 |
| Hlaalu house01/tower* (hlaalu-domestic) | none | none (dlc2rrbulwark, dtceiling, bronzecopper) | none; resource ships no plugin; largewindow00 unplaced (mounts n 0) | hlaalu `HlaaluArchitecture/Custom/largewindow00`, `Seaview/window02`, `Objects/dbstainglassframe01` (3) | Dunmer | (b-geometry): largewindow00 is the set's own piece but has no placement data; owner call |
| BM&V tree houses tronc/champ/gland (settlement-root) | none | none (bark0143, boisebenenoir) | yes, via `aldredanyia/window`: Valenwood.esp 153 ext, 94 on housegland001, 13 housetronc001, 8 housechamp001 | own sets in kit, authored in the shell frame (offset 0): housetroncwindowet001-008 / rc001-005, housechampwindow001-007, houseglandwindowet001-003 / rc001 (bmv, 24); plus aldredanyia/window | root kit is Bosmer-derived | (b) templated: gland t0442/t0443, champ t1197-t1200 with `window`. Or (b-pivot): the own-set pieces at offset 0 |
| mwkeep walls/keep/towers (imperial-keep) | Y (wall run), L | none | none; arrowslit01/02 unplaced (KotM pool plugin places 318 mwimparch refs, 0 slits) | mwkeep `mwimparcharrowslit01, 02` (2, in kit). Reimperialized `architecture/Fort/Windows/impwindow01, 01dark, 02 (+Moss)` (6 per mod × 2 mods). Placed 3+3 ext by Abandoned Prison near mwimparch pieces and 21 int by Frostmoth. Vanilla impextwindow01 (32 ext) | Imperial prisons/forts (prisons.md) | curtain walls: (a) by design. Keep/tower: (b) Reimperialized impwindow once its plugins are mined |
| Ayleid blocks, HTBM aztec buildings, xanmeer (ruin-monumental, xanmeer-interior) | M, 6 | none (0 of 195 Ayleid, 0 of 85 xanmeer, aztec none) | none; cc arwindow01 unplaced | cc-ayleid `ARwindow01` (1) | xanmeer: stepped pyramid, mazelike interior (Lore:Xanmeer, material-culture.md:32-35) | (a) by design |
| mudmother tents, platforms; works/docks/route/enclosure (stockade tower etc.) | N, W, T | none | none | n/a | open or utility forms | (a) not dwellings |
| dungeon-root (cave mouth doorcaveb) | Y, W, 6 | none | none | n/a | cave | (a) by design |
| Hovelmud mushroom house (not in a kit) | none | pane is a separate shape: mushroomextwindowon (Glow, glassbottles) / off | 0 refs found (house exterior also 0; reader finds no exterior placement) | stroti `mushroom house/mushroomextwindowon, off` (2) | Telvanni-ish, not Argonian | not a candidate |
| DMArgonianHaus robobirdie_shackext (not in a kit) | none | yes (farmwindowinterior01, modelled) | n/a | modelled | Shivering Isles house | a windowed Argonian-home shell already in the vault (xalfek-55595) |

No family needs a Nexus candidate. Every gap has window pieces in the vault. What blocks them is the designed-to-combine rule for cross-set pieces, not a missing asset.

## Licence notes for the in-vault candidates
- KotM 190459 description: "Any assets made or adapted from modder's resources by me are free to use". Voice assets are forbidden. The credits list 60+ resource authors, and the mudhut pieces' origin is not named, so record the provenance of each asset before use. The sourcing log row (settlement-kit-sourcing-log.md:204) registers KotM for placement statistics only.
- Hlaalu 157997: "free to use these assets in your mods ... with proper credit".
- Reimperialized 134592: the description gives no asset permission line (API description).
- cc-Ayleid 83999: free with credit, not for sale.

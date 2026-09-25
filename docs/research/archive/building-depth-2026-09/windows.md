# Topic 8, windows (check-in 2 item 8)

Headline: only farmhouse01 in the yard carries window geometry, and it ships as an unlit dark pane: the build drops its glow map, and the runtime night glow keys on material names that no exterior window material has.

## (a) Vanilla / mod meshes (parsed with /tmp/wf/checkin2/tools/nifmat.py; full scan /tmp/wf/checkin2/scan-kits.txt)
- farmhouse01.nif shape `Farmhouse01:14`: BSLightingShaderProperty type 2 (Glow), SLSF2 Glow_Map, SLSF1 External_Emittance, emissive (1,1,1) x 3.0, no NiAlphaProperty, textures FarmWindowInterior01.dds (mean RGB 40/39/31), _n, and slot 3 FarmWindowInterior01_m.dds = the glow mask (pane-shaped white blobs, /tmp/wf/checkin2/farmwindowinterior01_m.png). Glass is opaque; the glow is a masked emissive, not alpha.
- Separate glow meshes exist only for cities: wrlodwindowglow01.nif, whfxwindowglow01-04.nif, fxambwindowglow00.nif (BSEffectShaderProperty, alpha blend 0x100d). None of these are in any of our kits. List: /tmp/wf/checkin2/windows-manifest.txt.
- Day/night in Skyrim: External_Emittance scales the emissive by the reference's XEMI emittance (a region), per DynDOLOD "Glow LOD" help page (dyndolod.info/Help/Glow-LOD). Not measured in Skyrim.esm here.
- BM&V HutExterior.nif: 4 shapes (HutWalls, HutRoof, 2 WoodBeam), no window shape. stilthouseext.nif: 2 plank shapes, none.
- HTBM bamboohut01/02.nif: 9 shapes each, no window shape; one alpha-TESTED fringe shape (`OrcAwningFull01:1`, flags 0x12ec).
- mwkeep (Morrowind Imperial Keep, 88 NIFs in imperial-keep kit): no window, glow or alpha shape.
- BM&V ships windows as separate NIFs for the Bosmer tree houses (housetronc/housechamp/housegland window*, texture vitre_verte, opaque, no glow); kit-mounts-mined.json anchors them "unplaced", n 0.
- Hovelmud (Stroti mushroom house) ships an on/off pair: mushroomextwindowon.nif (Glow shader, emissive x5, External_Emittance) and mushroomextwindowoff.nif (plain).

## (b) Build
- blender/build_kit.py:59 treats `_m`, `_g` as non-diffuse; :76-94 rebuild_material clears all nodes and wires only the diffuse; no Emission input is ever set. Result: settlement-imperial-v1.glb material `Farmhouse01:14.Mat` has image farmwindowinterior01, no emissiveTexture, no emissiveFactor (measured). The glow map is lost before glTF export; kit_compress never sees it.
- Glow-map detection by suffix would fail anyway: vanilla puts the glow in slot 3 under an `_m` name.
- Alpha: only doubleSided (foliage-category) assets get alpha (blender/build_kit.py:93, :101; build_kit.py:857-882); every other NiAlphaProperty (HTBM fringe test 0x12ec, GV nest pieces blend 0x10ed) ships OPAQUE.

## (c) Runtime
- SettlementLayer.tsx:576 `windowMaterial = /window|glow/i.test(material.name)`. Across 3,985 kit materials only 7 match, all interior/works/wrecks; Farmhouse01:14.Mat does not. The night branch never fires on any exterior building.
- materials.ts:108 adds the glow to `diffuseColor` (albedo), so even a matched material stays dark at night (albedo x night light). It is also unmasked (whole material).
- materials.ts:130 night is a hard 0/1 step at 19:00/06:00, not the Module 55 clock phase (55-light-sky-time.md:63 dayPhase).
- Far merged meshes reuse the same material (SettlementLayer.tsx:604), so every tier would glow once the material does.

## Doc contradiction
research/rendering/building-placement-rendering-treatments.md §2 state (lines 86-98) lists items 15, 19, 21 as missing or partial and implies item 17 (night windows, line 435) is done. The measurements above show it is inert.

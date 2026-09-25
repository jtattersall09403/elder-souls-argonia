# Building depth and variety: what a Skyrim building is made of, and how we assemble ours (research, 2026-09-24)

Headline: a Skyrim house reads as lived-in because of two layers we do not ship. The shell carries
modelled detail: windows lit by a glow map, shutters, trim, ivy. Around it sit 20 to 70 separate
pieces within 12 m: porch, steps, door, lantern, smoke, firewood, barrels and crops. Each of our
13 house composites is a shell and a door leaf only. The one shell with modelled windows
(farmhouse01) loses its glow map in the kit build. The vault already holds most of the missing
layer.

Report keys used below. They are the inputs to this doc and are not kept in the repo; their
numbers are quoted where they are used.
- BK: Bethesda exterior building, /tmp/wf/buildings/bethesda-exterior-building.md.
- LV: Black Marsh architecture, /tmp/wf/buildings/argonian-architecture.md.
- VB: what the vault can build, /tmp/wf/buildings/vault-buildability.md.
- MP: modder practice, /tmp/wf/buildings/modder-practice-assembly.md.
- W: windows, /tmp/wf/checkin2/windows.md.
- T6: the Argonian hut door, /tmp/wf/checkin2/topic6-argonian-hut.md.

## Reconciliation

| Live doc | Covers | Verdict |
|---|---|---|
| [kit-level-design-and-layout-generation.md](kit-level-design-and-layout-generation.md) §1 | GDC 2013 dungeon kits | CONFIRMED. It says nothing on exterior houses (BK Reconciliation). This doc is the house half; §1.3 needs a one-line pointer here |
| [kit-assemblies-evidence.md](kit-assemblies-evidence.md) "How to author the composites" | mined structural templates | CONFIRMED. Its item 3 (BM&V house03 + overhang + 4–12 windows) is still in no kit (LV Reconciliation) |
| [settlement-asset-inventory.md](settlement-asset-inventory.md) §0, §1, §2, §9b | families and gaps | CONTRADICTED. §1 "two-culture rule (binding)" predates the three-kit ruling. §0 "Mud-hut variety CLOSED" counts HTBM bamboo huts, a stilt-kit form (LV Reconciliation). §1 "~3 monolithic hut shells" and §9b "no true Argonian mud-hut modular kit exists on Nexus" are superseded by King of the Murkmire (KotM) (VB Reconciliation). Jet's kit, smallhouseext, cyrfarmhouse01–03 and Phitt house01–04 are missing (VB Reconciliation). **This is the one doc to edit for counts and gaps.** |
| [settlement-kit-sourcing-log.md](settlement-kit-sourcing-log.md):204 | KotM is "placement evidence only", its BSA not extracted | STANDS until the owner decides (Decisions, item 1) |
| docs/research/rendering/building-placement-rendering-treatments.md §2 (lines 86–98), item 17 | night windows implied done | CONTRADICTED: inert on every exterior (W "Doc contradiction") |
| 16h brief § Owner check-in 2, item 6 ("doors BUILT IN (most are)") | the hut door | FALSE: 0 of 17 Argonian hut shells has a door in the mesh (T6 headline) |
| [world/sources/lore/topics/material-culture.md](../../../world/sources/lore/topics/material-culture.md) §Building | canon materials per kit | CONFIRMED. It has no "openings" line; the windows rule below belongs there (LV Reconciliation) |
| docs/world/97-placement-principles.md Part F | culture grammars | CONFIRMED. No row states a facade requirement or a form count (LV Reconciliation) |

This file is new because no live doc covers per-building assembly (MP Reconciliation). The two
contradicted docs above are corrected in place, not here.

## 1. The finding in plain English

**What a Skyrim building is made of.**
- Lived-in houses are single authored meshes. Windows, shutters, trim, chimney breast and ivy are
  modelled into them (BK §1). Farmhouses: 9 shells give 91 placements. Each city house is its own
  mesh; Solitude has 12 houses from 12 meshes (BK §3).
- Windows are a glow-map texture on the shell. A region lights them at night and a separate LOD
  glow mesh carries them at distance (BK §2; W (a)).
- A house reads as inhabited from what surrounds it. Vanilla averages within 12 m of a house
  (BK §2):

  | Family | Pieces per house |
  |---|---|
  | farmhouse | 24.7 |
  | Whiterun | 19.5 |
  | Riften | 22.1 |
  | Solitude | 47.8 |
  | Markarth | 59.4 |
  | Windhelm | 69.5 |

  The pieces are the walkway or porch, steps, the door, chimney smoke, firewood, barrels, benches,
  crops, lanterns, signs and hanging moss.
- True modular exterior kits exist only for shacks, forts, Nordic ruins and docks (BK §1). The
  shack kit is the one vanilla wall kit with window pieces: shackwallwindow01/02 and
  shackwalltopwindow01 (BK §4).
- Mods follow the same pattern: a shell plus separate accessories. Two examples:
  - BM&V's Phitt house03 carries overhang05 and up to 11 `window` pieces (n = 4–27).
  - KotM's mudhut02 carries window01/02, a pod annex, a chimney and stairs (10 m census).
  (VB family table.)

**Why ours read flat.** Five causes, each measured:
1. Every house composite is shell + door leaf. None of the 13 adds a porch, window, chimney or
   awning (VB headline).
2. `farmhouse01-with-door` drops `farmhouse01walkway`, although the kit lists it and vanilla
   pairs the two on 8 of 11 placements (VB family table, vanilla farmhouse row).
3. The farmhouse window is in the mesh but ships unlit:
   - build_kit.py:59 and :76–94 wire only the diffuse, so the glow mask (slot 3, named `_m`) is
     lost before export (W (b)).
   - SettlementLayer.tsx:576 matches `window|glow` on material names. No exterior material matches.
   - materials.ts:108 adds the glow to the albedo (W (c)).
4. `settlement-mud-v1` took none of BM&V's hut windows or doorframe variants. Steps01–03 and bridge01 are kitted, in `route-spans-v1`, not in the mud kit (corrected 2026-09-24).
   `hutexterior` is a closed drum at every height (LV §4; T6 Evidence).
5. The dressing around houses has never been mined:
   - The assemblies miner skips non-structural refs: 227,013 vanilla and 130,942 BM&V (VB method
     notes).
   - Dressing refs within 10 m of a building, p50: 2 in vanilla, 0 in BM&V Black Marsh
     (settlement-form-evidence.md § Dressing references). The BM&V figure is the mod's sparseness,
     not a target.
   - The owner cut code-placed dressing at a building's foot (16h brief, check-in 2 item 1). The
     dressing must therefore be authored.

## 2. The assembly model to adopt

A building is an **assembly**. An agent authors it in the placement workbench
(docs/phases/lanes/placement-workbench-lane.md) and exports it as blueprint poses, which the
compile realises unchanged. The layers, in the guides' order (MP §1):

| # | Layer | Evidence the agent queries | Contact rule |
|---|---|---|---|
| 1 | purpose card (who lives here, what trade) | place record, quests `20-world-provisions.md` | none |
| 2 | shell, door sill at grade | `kit-designed-sink.json` | sill to ground within one step, else steps (MP §3) |
| 3 | door | the mod's DOOR ref at the mined fixed offset (T6 rec 2b); the composite template's `isDoor` | door leaf in the shell's opening |
| 4 | porch, walkway, steps | `kit-assemblies-mined.json` templates (farmhouse0Nwalkway; KotM house04platform) | mined offset; walkway meets the ground |
| 5 | windows and shutters | modelled: none needed. Pieces: templates (shackwallwindow on shackroofside, n = 7+7; Phitt `window` on house03, n up to 27) or `kit-mounts-mined.json` | on the wall plane, penetration only as designed |
| 6 | roof trim, overhang, awning | templates (Phitt overhang05; Dagon Fel shackawninglarge 12/12 never alone) | mined offset |
| 7 | chimney and smoke | templates or census (KotM mudhutchimney 5 of 6 mudhut02); fxsmokechimney01/02 | on the roof surface |
| 8 | lantern or light | mounts record; vanilla candlelanternwithcandle01, KotM saxhleellantern01/02 | sat, sunk or hung, never floating (MP §1 step 7) |
| 9 | personal clutter at the door | the dressing mine (below) | settled; scale 0.5–1.5 |
| 10 | town clutter between houses | the dressing mine | fractal clusters, staggered |
| 11 | wear: ivy, moss, destroyed variants | farmhouse ivy01–03, farmhouse05/06destroyed, shackbroke* | per the purpose card |

Rules:
- **Layers 3 to 7 are structural.** Each piece cites a mined template or mount record, or a
  measured mesh contact where the source mod places no instance. The last case is an owner
  decision (Decisions, item 4). This applies the golden rule that pieces combine only as designed.
- **Layers 8 to 11 are dressing.** Their evidence is a new dressing mine. It reuses the BK §5
  method: `mine_assemblies.collect(accept=all)`, every ref within 12 m horizontal and 15 m
  vertical of a house anchor, 282,388 refs over Skyrim.esm and Update.esm. It adds BM&V, KotM and
  HTBM. Its output is statistics per family (which pieces, how many, how far out), not snap
  templates. The draft table is /tmp/wf/buildings/vanilla-house-surroundings.json.
- **A composite stays the unit only where the source author placed the parts together every
  time.** Examples: shell + door + walkway; KotM mudhut02 + smpodext02 + smpodextdoor + door01
  (T6 table). Everything else is authored per building, so two houses on one shell differ.
- **Checks per building** (MP §3):
  - contacts measured on every piece;
  - no coincident duplicates;
  - each door faces a path;
  - every window face clear of neighbours and terrain by at least 1 m;
  - a minimum set present: door, light, at least N personal clutter pieces, one roof detail;
  - no two houses in a settlement share a signature.
- **Workbench gaps that block this** (MP §3; wb.py:331–414): place and move take yaw and uniform
  scale only, with no pitch, roll or mirror. There is no group or prefab (pack-in) command, no
  variant swap, no front-face or openings check, and no repetition signature.

## 3. Per building family: what exists, what variety is reachable, what is missing

"In vault, no kit" means sourcing work inside the vault: add the pieces to a kit. A Nexus
candidate is named only for a true gap.

| Family (grammar) | Exists now in a kit | Reachable from the vault | Missing: vault or true gap |
|---|---|---|---|
| Vanilla farmhouse (imperial) | farmhouse01, 02 (`settlement-imperial-v1`) | 11 intact shells; farmhouse01–04walkway; walkway kit 27; stonewall terrace 17; fencewoven, farmwell01, ivy01–03; destroyed variants. About 15 forms with porches (VB) | In vault: every piece in the previous column. Shutters wrshutter* (4) sit near Whiterun houses 19 + 6 times (BK §1). The only chimney mesh is rtchimney01; vanilla farmhouses have none by design (BK §4). No gap |
| Vanilla city houses (imperial civic) | none | ~80 bespoke shells, each a named Nord landmark (VB) | Not a source of repeatable forms. Take shutters, sfarmporch01–03, sfarmhousesteps01 and rtplayerhousedeck01 as add-ons only |
| Jet's farmhouse kit (imperial) | none | 235 + 19 + 38 pieces at a 64-unit snap. Walls with door variants, roofs, exterior chimney stack, porch set, stairs, railing (VB). Forms unbounded | In vault. No placement evidence (the author's sample plugin is absent). Window variants a–d are unverified (VB). Licence: nifs stay at their paths, credit plus link, no port to another game without permission (VB online sources) |
| BM&V Cyrodiil farmhouse (imperial) | none | cyrfarmhouse01–03; 35 placements in Black Marsh (VB) | In vault |
| BM&V small house (imperial or mixed) | none | smallhouseext with interior and door; 61 Black Marsh placements, the most-placed BM&V house (VB) | In vault |
| Vanilla shack kit (stilt) | 8 of 58 (`settlement-stilt-v1`) | all 58, including the window walls and shackwalldoor01; 69 vanilla templates; forms unbounded (VB) | In vault: 50 pieces |
| BM&V stilt house, HTBM bamboo (stilt) | stilthouseext; bamboohut01/02 (one form) | the same plus orcawning01/full01 as HTBM places them (VB) | Neither has a window shape (W (a)) |
| KotM thatch and plank houses (stilt) | none | about 24 shells, two stilt decks (house04/05platform), housewindow, a partition wall with window, walkways, docks. About 48 forms on or off a platform (VB) | BSA not extracted; owner decision. Its lore fit to reed weave (material-culture.md:21–24) is unchecked |
| BM&V mud huts (mud) | hutexterior, hutdecking (`settlement-mud-v1`, composite `mud/hut-with-entrance`) | window01–03, windowbox01, steps01/03, bridge01 (VB) | In vault. BM&V places the windows 0 times (VB), so the fit is measured, not mined |
| Mud Mother Grove (mud) | mudhut01 | ArchwaySticks, WallHanging01–03, Banner01, fences (VB) | Its load door `dlc2telmithryndoor01` is a Dragonborn mesh, not in the vault. This comes from the owner's DLC archive, not Nexus (T6 rec 1) |
| KotM mud huts (mud) | none | mudhut01–03, smpodext01–02, lizardhouse, manorext, shed; window01–02, door01–02, mudhutchimney, overhang01–05, stairs; six interiors. About 16 forms (VB) | Owner decision (item 1). The census counts are not snap templates yet: extract the BSA and mine them (VB method notes) |
| BM&V Phitt Aldredanyia (mud or stilt, marsh house) | `composite:phitt/marsh-house-03` with 4 of 8 windows | house01–04, window, overhang01–05, foundation, lightpost, paper lantern (VB) | In vault: house01, 02, 04 and overhang01–04 |
| BM&V citebosmer houses (root) | housetronc, housechamp, housegland; 15 window inserts (`settlement-root-v1`) | balconies and access 14, doors 4 (VB) | The kit's own window inserts have no placements (`kit-mounts-mined.json`: `housechampwindow003`, `004` "unplaced", n 0). The 29 placed windows on housegland001 are Phitt's `window` (`kit-assemblies-mined.json` template `bmv-valenwood:t0442`, count 29). There is no fourth root form in the vault; forms 4+ come from assemblies |
| BM&V Dagon Fel (dunmer-hlaalu vernacular) | docks only | shack01–05 with interiors, housetall01–02, tower; shackawninglarge/small, chimneysmall/tall, window01–02, doorframe (VB) | In vault |
| Hlaalu resource (dunmer-hlaalu) | `hlaalu-domestic` (built kit, 68 Hlaalu pieces plus Phitt house03, overhang05 and window; corrected 2026-09-24, [building-asset-breadth.md](building-asset-breadth.md)) | house01, housetall01, tradehome, tower stack, largewindow00, dome. Resource only, no placement plugin (VB) | In vault. The Dres set is a recorded gap (97 Part F, dunmer-hlaalu row) |
| Orc longhouse | none | orclonghouse01 + awnings (VB) | Awnings are reused by HTBM; the shell is off-culture |
| Imperial keep (imperial fort) | walls in the yard | keep01–02, guard towers, arrowslits (VB) | Fortification, not houses |
| Xanmeer (stone) | tileset 9 | KotM dwellingruin, tower, pyramid, wallpieces; Denoffen modular stone 37 (VB) | Owner decision (item 1) |
| Hearthfire homestead | none | none | Not in the vault (VB; MP vault evidence). It needs the owner's Hearthfire DLC archive. It is not needed: Jet's kit covers modular farmhouses |

No row needs a new Nexus download. Two families depend on archives the owner already owns and
the vault lacks: the Dragonborn door and Hearthfire.

## 4. Windows rule per family

Canon puts windows on the commoner Shadowfen mud hut: "dry excreta mixed into the sealing at the
edges of windows" (UESP Lore:The Improved Emperor's Guide to Tamriel/Black Marsh; LV headline).
No canon source makes an Argonian dwelling windowless (LV (1)+(2)).

| Family | Rule | Evidence |
|---|---|---|
| Vanilla farmhouse, city houses, cyrfarmhouse, smallhouseext | **modelled**. Fix the build and runtime so the glow mask is an emissive map, and add shutters as mounted pieces where Whiterun places them | W (a), (b), (c); BK §4 |
| Vanilla shack kit | **pieces**: shackwallwindow01/02 and shackwalltopwindow01 as the templates place them | LV §4 (mined 7+7) |
| Jet's kit | **unverified**: check whether a–d variants carry openings before use | VB |
| BM&V mud huts | **pieces, measured fit**: window01–03 and windowbox01. The lore requires windows; the source never placed them | LV headline; VB |
| KotM mud huts, pods | **pieces**: window01/02, 12 + 11 around 6 huts | VB |
| KotM thatch houses | **pieces**: housewindow, housepartionwallwindow | VB |
| Phitt Aldredanyia | **pieces**: `window`, as mined (house03 up to 11, house02 7, house04 3) | VB |
| citebosmer root houses | **pieces**: Phitt `window` as mined on housegland001 (n 29). The kit's own inserts only by measured fit | `bmv-valenwood:t0442`; `kit-mounts-mined.json` |
| Dagon Fel, Hlaalu | **pieces**: window01–02; largewindow00 | VB |
| HTBM bamboo hut, BM&V stilt house, Mud Mother mudhut01 | **none in the source**. They need pieces or a different shell before they can stand as dwellings. The ESO prior gives Murkmire stilt huts branch window frames | W (a); LV §3 |
| Xanmeer, dungeons, tents | **none by design**: sealed mazes that ward traps and hide the Hist | UESP Lore:Xanmeer; LV (1)+(2) |
| Imperial keep | arrowslits in the mesh | VB |

Night light for opaque window pieces comes from the vanilla glow effect meshes, mounted as the
cities mount them: whfxwindowglow01–04 and fxambwindowglow00 (W (a)). They are in no kit.

## 5. Variety required vs reachable, per culture

The requirement:
- Variety is measured per settlement against the bars in
  [0098](../../decisions/0098-variety-is-measured-per-settlement-not-by-a-template-cap.md)
  (shells, top-shell share, pieces within 12 m, dressing breadth per tier), recorded as data in
  `world/sources/placement/breadth-bars.json` (16k § 1b). The earlier ~25 % template cap per
  family and region is retired by 0098.
- Two instances within 2 km differ on at least 3 axes.
- Source: 97-placement-principles.md Part A, "anti-sameyness" (line ~131); LV §4.
- No doc sets a form count per tier (LV §4).
- Tiers: `settlement` spans lone and homestead up to major city (settlement-type-recipes.md § Size).
- A city needs civic and work buildings as well as dwellings. Vanilla 26+ settlements are 5 %
  dwelling and 21 % work; BM&V Black Marsh 26+ are 15 % dwelling (settlement-form-evidence.md
  § Building family mix).

| Grammar (97 Part F) | Forms now (LV §4) | Reachable shells | Reachable assemblies (layers 4–7 add at least 3 axes) | Meets the requirement |
|---|---|---|---|---|
| argonian-mud | 3 + 2 tents, 0 windows | BM&V 2 + Mud Mother 1. With KotM: +8 | without KotM, 3 shells × windows, steps, hangings. With KotM, about 16 | Only with assemblies. With KotM, comfortably |
| argonian-stilt | 2, bamboo 1, shack 8 pieces | stilthouse, bamboohut, the full shack kit. With KotM: +24 | the shack kit is unbounded | Yes once the shack kit is complete, if its plank reads fit the grammar |
| argonian-root | 3 + kiosk | 3 (no fourth in the vault) | 3 × balconies, access, windows, lianas | Only if A6 counts assemblies |
| imperial | 2 | farmhouse 11, cyrfarmhouse 3, smallhouse 1, Jet unbounded | farmhouse × walkway × shutters × ivy × destroyed | Yes |
| dunmer-hlaalu | `hlaalu-domestic` (68 Hlaalu pieces) | Hlaalu ~6, Dagon Fel 9 | awnings, chimneys, windows | Yes; Dagon Fel joins `hlaalu-domestic` (16h part 2 item 33) |
| argonian-stone | tileset | ruin forms only | n/a (monument) | n/a |

The rule's wording decides the root row: does "template" in A6 mean the shell or the assembly?
(Decisions, item 2.)

## 6. Brief edits for 16h part 2 and 16i (the planner applies them)

1. **Building-assembly procedure.** Add §2's layer table, rules and checks to the
   placement-workbench skill (lane round 2, not yet written) as a "building assembly" chapter.
   MP Reconciliation names that skill as the single home.
2. **Composite rule** (16h check-in 2, items 5 and 6):
   - Replace "prefer assets whose doors are BUILT IN (most are)" with "the shell plus the DOOR the
     mod placed with an XTEL, at its mined fixed offset, is the unit" (T6 rec 2).
   - Add: a composite holds only parts the source author placed with that shell on every mined
     instance (door, and walkway or porch where mined). Windows, shutters, chimney, light and
     clutter are authored per building in the blueprint.
   - Update composite-author SKILL.md §1–2 to match.
3. **Kit-build windows** (16h part 2 runtime):
   - Carry the glow mask (slot 3, whatever its suffix) as the glTF emissive texture.
   - Ship NiAlphaProperty as alpha.
   - The runtime lights emissive from the material flag, not the name, as emission not albedo,
     masked, on the Module 55 dayPhase.
   - Mark building-placement-rendering-treatments.md item 17 not done until then.
   - Evidence: W (b), (c).
4. **Kit additions** (kit-build job, one config per kit):
   - `settlement-imperial-v1`: farmhouse03–06, inn01, smith01, farmlonghouse01; walkways 01–04 and
     the walkway kit; ivy01–03, farmwell01, fencewoven01–02; wrshutter* ×4; cyrfarmhouse01–03;
     smallhouseext.
   - `settlement-stilt-v1`: the other 50 shack kit pieces.
   - `settlement-mud-v1`: BM&V hut window01–03, windowbox01, steps01/03.
   - `settlement-root-v1`: Phitt `window` if it is not already there.
   - Dagon Fel into the existing `hlaalu-domestic` kit (16h part 2 item 33), not a new kit.
   - Glow effect meshes whfxwindowglow01–04 and fxambwindowglow00 in a shared kit.
   - Credits in the root README in the same change.
5. **Dressing mine.** Add a `kit-dressing-mined.json` step (sample first per `kit-mining`) using
   the BK §5 method over vanilla, BM&V, KotM and HTBM. It is evidence only; nothing is placed by
   code (check-in 2, item 1).
6. **Workbench commands** before the yard rebuild: pitch, roll and mirror; group/prefab; swap;
   openings (front face and window clearance); a repetition signature (MP §3).
7. **Yard: the two houses rebuilt as assemblies** (16h check-in table rows at brief:1100 and :1102).
   - Imperial house: farmhouse01 + farmhouse01walkway + farmhouseldoor01 + walkwaystairs + ivy03,
     then the vanilla farmhouse dressing set (barrel01, firewood piles, farmbench01, bucket01,
     crops, smoke; BK §2), windows lit.
   - Mud hut: KotM mudhut02 + smpodext02 + smpodextdoor + door01 + window01/02 + mudhutchimney +
     stairs if the owner approves KotM. Otherwise BM&V hutexterior + window01–03 + doorframe01 +
     steps02 at measured contact, labelled "fit measured, not mined".
   - The check-in rows gain "windows visible; lit after dusk; porch and dressing present".
8. **16i part 1 paper plans.** Each building in each exemplar lists its assembly layers and the
   evidence for each. Exemplar kit lists:
   - Lilmoth: imperial (row 4 kit) and mud.
   - Nine-Trunks: mud and root.
   - Mazzatun: stilt (full shack kit) and works.
   - Tapping camp: works, root and mud.
   - Wamasu pond: mud, works and docks.
   - Source: VB legend, from the retired blueprints. The 16i § The story calls Nine-Trunks "the
     stilt village" and Mazzatun "the stepped stone town", so the planner reconciles the grammar
     per place before part 1.
9. **16i acceptance** gains two checks:
   - per settlement, no two houses share a signature, and each culture meets A6;
   - every dwelling has windows unless §4 rules "none by design".
10. **Corrections outside the briefs:**
    - settlement-asset-inventory.md §0, §1, §2, §9b (Reconciliation above);
    - material-culture.md §Building gains an "openings" line (§4);
    - the §1.3 pointer in kit-level-design-and-layout-generation.md.

## Decisions for the owner

1. **Can we use King of the Murkmire meshes?** The sourcing log (line 204) allows its placement
   evidence only. Its terms: the author's own assets are free for free mods that use no AI;
   assets by other authors need those authors' permission (VB online sources). Using it means
   extracting the BSA and checking the provenance of each asset. It is the largest single unlock
   for mud and stilt variety: about 8 mud shells and about 24 thatch or plank houses, all with
   windows, chimneys and platforms.
   **RULED 2026-09-24 by the owner:** usable; the owner holds permission from every mod author
   in the pool (Jet's kit included).
2. **What counts as a "template" in the A6 25 % cap: the shell or the assembly?** Counting
   assemblies lets root and mud meet the cap from the vault as it is.
   **Ruled by the planner 2026-09-24:** the 25 % template cap counts ASSEMBLIES (shell,
   attachments and dressing), not shells (16h brief, part 2 planner rulings).
3. **Can we take the Dragonborn door from the owner's DLC archive?** It is the door Mud Mother's
   mudhut01 needs (T6 rec 1).
4. **Can a piece go where its own mod never placed it,** if it comes from the same mod folder and
   its mesh contact is measured? Examples are BM&V hut windows (0 placements) and the citebosmer
   window inserts (n 0). The golden rule reads plugin data first.
   **Ruled by the planner 2026-09-24:** a piece may sit where its mod never placed it when it
   is fitted on measured geometry in the workbench and passes a visual check (16h brief, part 2
   planner rulings).

## 7. Sources

Online (checked by the input reports):
- GDC 2013 modular level design (Burgess, Purkeypile): https://www.gamedeveloper.com/design/skyrim-s-modular-approach-to-level-design ; https://www.slideshare.net/slideshow/gdc2013-kit-buildingfinal/17728576
- GDC 2016 Fallout 4 modular kits: https://archive.org/stream/GDC2016Burgess/GDC2016-Burgess_djvu.txt ; https://80.lv/articles/building-huge-open-worlds-modularity-kits-art-fatigue
- Creation Kit wiki: https://ck.uesp.net/wiki/Bethesda_Tutorial_Layout_Part_1 ; https://ck.uesp.net/wiki/Bethesda_Tutorial_Layout_Part_2 ; https://ck.uesp.net/wiki/Bethesda_Tutorial_Clutter ; CK pages "Material Object", "Static"
- Window glow: https://frontierskyrim.wordpress.com/2015/04/04/the-window-trick/ ; https://dyndolod.info/Help/Glow-LOD
- Tamriel Rebuilt exterior guides (archived): https://web.archive.org/web/2023/https://www.tamriel-rebuilt.org/content/tutorial-exterior-modding-guide ; https://web.archive.org/web/2023/https://www.tamriel-rebuilt.org/content/guidelines-exterior-showcases
- Project Tamriel Exterior Guidelines (archived): https://web.archive.org/web/2025/https://wiki.project-tamriel.com/wiki/Exterior_Guidelines
- Beyond Skyrim level design: https://wiki.beyondskyrim.org/wiki/Arcane_University:Level_design
- Level Design Book: https://book.leveldesignbook.com/process/blockout/metrics/modular ; https://book.leveldesignbook.com/process/env-art ; https://ianlondon.github.io/posts/modular-level-kit-geometry/
- Procedural buildings: https://dl.acm.org/doi/10.1145/1141911.1141931 ; https://www.sidefx.com/tutorials/building-generator/ ; https://falloutck.uesp.net/wiki/PackIn
- Nexus: https://www.nexusmods.com/skyrim/mods/58262 (Jet's kits) ; https://www.nexusmods.com/skyrimspecialedition/mods/190459 (KotM) ; https://www.nexusmods.com/skyrim/mods/97799 (Actual Windows) ; https://www.nexusmods.com/skyrimspecialedition/mods/8766 (Farmhouse Chimneys) ; https://winkingskeever.com/list-of-skyrim-modders-resources/
- ESO prior: https://www.gamereactor.eu/esos-murkmire-expansion-designed-to-show-argonian-culture/ ; https://forums.elderscrollsonline.com/en/discussion/673522/argonian-structures-for-the-luxury-furnisher (search extract)

UESP (API): Lore:Argonian; Lore:Black Marsh; Lore:Xanmeer; Lore:The Improved Emperor's Guide to
Tamriel/Black Marsh; Lore:Lilmoth; Lore:Stormhold; Lore:Gideon; Lore:Kothringi; Lore:Tum-Taleel;
Online:Stormhold; Online:Concept Art/Murkmire; Online:Argonian Furnishings; Skyrim:Construction.
UESP has no Lore:Architecture or Skyrim:Architecture page (BK Sources).

Repo records: world/sources/placement/kit-assemblies-mined.json (template bmv-valenwood:t0442);
kit-mounts-mined.json; docs/research/placement-settlements/settlement-form-evidence.md; the
placement-workbench lane brief.

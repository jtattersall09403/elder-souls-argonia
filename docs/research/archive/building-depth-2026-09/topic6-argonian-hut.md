# Topic 6: an Argonian hut whose door comes with it (read-only research, 2026-09-24)

HEADLINE: Of the 17 Argonian hut shells mined from the plugins, none has a door modelled into the mesh. Every hut that has an interior uses a separate DOOR record (the load door the mod places), and each hut uses one door at a fixed offset. Only the HTBM bamboo hut's mesh has a real doorway opening. The ruling's "most are built in" is FALSE for this pool.

## Reconciliation
- Live docs: 16h brief § Owner check-in 2 item 6 (docs/phases/16-foundation-and-places/16h-settlement-runtime-and-kit-qa.md:492-496); the settlement-mud-v1 snapLogic.assemblies text (tooling/asset-pipeline/pipeline/config/kits/settlement-mud-v1.json); the kit table in world/sources/lore/topics/material-culture.md:272-277; the kit-assemblies-mined.json gaps.shellsWithoutDoor list (every hut composite has `why: ""`).
- Contradicted: brief:493-494 "prefer assets whose doors are BUILT IN (most are)". Confirmed: the mud-v1 snapLogic line calling `hutexterior` "an unbroken drum" (ray cast: closed at every height).
- The one doc to edit: the brief's item 6. The rule becomes "the shell plus the door the mod places at its mined fixed offset is the unit". A composite is legitimate only when it is exactly that pair.

## Evidence
Plugin scan: /tmp/wf/checkin2/huts_mine.py, output /tmp/wf/checkin2/huts-plugin-evidence.json (nearest DOOR ref within 12 m of each exterior shell placement; `*` = the door carries XTEL, i.e. it is a load door).
Doorway test: /tmp/wf/checkin2/openings.py (horizontal rays from the plan centre at 12/25/40 % of height against the raw kit GLB LOD0; any escape = an opening).
KotM compounds: /tmp/wf/checkin2/kotm_sets.py. Door-frame sign check: /tmp/wf/checkin2/yawcheck.py.

| asset id | mod | size m (unit scale) | tris | doorway in mesh | plugin door (placements, door id) | interior |
|---|---|---|---|---|---|---|
| mudmother:gv_meshes/argoniannest/mudhut01 | Mud Mother Grove 146557 | 5.93x6.47x5.09 (placed at 1.39, 2.3) | 2529 | none (closed) | 4/4 load door `dlc02/.../dlc2telmithryndoor01` (Dragonborn; NOT in the vault, 0 dlc02 entries in Skyrim - Meshes.bsa) | 00MudHut01; kit mudmother-hut-int |
| bmv:architecture/huts/exterior/hutexterior | BM&V (Black Marsh.esm) | 11.62x11.62x7.18 (placed at 1.3) | 3680 (composite 16141) | none (closed) | 11/11 `ruinswooddoorload01` at a median 7.7 m, **0 XTEL**: a dressing door, not an entrance | none mined |
| htbm:.../villages/argonian/bamboohut01, 02 | HTBM 35933 | 8.17x8.22x5.83 | 7138 (composite 8149) | yes, a 30 deg arc at compass bearing ~300 | 17/17 load door `bamboohutdoor01` at 2.83 m, relative yaw 120 on every placement | 16 cells CIPHTBMHutInterior*; kit htbm-hut-int |
| bmv:architecture/bamboohut01 (same mesh) | BM&V | same | same | same | 0/11 (BM&V places it without a door) | none |
| KotM meshes/argonia/mudhuts/mudhut02 + smpodext02 | King of the Murkmire 190459 (BSA not extracted) | 13.48x13.96x12.25 (placed at 0.53-0.79); pod 13.56x13.92x13.88 | 512; 852 | not tested | 15/15 load door `argonia/mudhuts/door01`; each hut is a compound of mudhut02 + smpodext02 + smpodextdoor + door01 + window01/02 + chimney + stairs/overhang | 5 cells KeebaHouse*; never door-mined (KotM is missing from exterior-interior-links.json plugins) |
| KotM argonia/mudhuts/lizardhouse | KotM | 11.65x18.74x14.2 | 3875 | not tested | 0/1 | none |
| xalfek:dmargonian/robobirdie_shackext | DMArgonianHaus 55595 | not measured | not measured | not tested | 1/1 load door vanilla `farmhouseldoor01` | 0DMarArgonianHaus (farmhouse set) |
| bmv:architecture/phitt/dagonfel/shack01, 02 | BM&V (Black Marsh North.esp) | 9.69x10.01x6.96; 6.49x8.82x6.46 | 3312; 2220 | not tested | 0/24 | none; Dunmer Dagon Fel form, not Argonian |
| bmv:architecture/stilthouse/stilthouseext | BM&V | 11.26x17.75x10.75 | 8196 | n/a (stilts) | 0/4 | none |
| mudmother argoniantent01, 02 | Mud Mother | 8.2x7.0x5.96; 6.1x5.3x4.3 | 2388; 1509 | open tent | 0/1 each | none |
- Marsh Rest (ArgonianHome.esp) places no exterior hut. Vanilla Skyrim has no Argonian hut.
- No rendered sheets exist for any of these exteriors: sheets pass 2 rendered 0 sheets (docs/research/phase16/16h-ledger.md:288-289).

## Defect found on the way: the door-link miner rotates by the wrong sign
- tooling/world-generation/worldgen/mine_door_links.py:322-323 (door_offset) and :181-182 (_box_gap) rotate by maths-convention -yaw.
- mine_assemblies.py:285-296 documents that rot.z is a clockwise heading, and says the other sign gives "a ring of the right radius and the wrong bearings".
- Measured on the 17 HTBM placements: the file's convention gives a sideDeg spread of 19-350 deg (exterior-interior-links.json bamboohut rows). The clockwise convention gives 299-300 on all 17, and the mesh opening measures ~295-300. radiusM and yawDeg are unaffected.
- The yard's door thresholds depend on sideDeg: interiors_index.py:92-95 and :137 read it (K5).

## Lore (world/sources/lore/topics/material-culture.md)
- :18-20 Shadowfen = mud huts, wattle-and-daub over a log skeleton.
- :21-24 Murkmire = reed weave on stilts.
- :272-277 four kits that never blend; :299-301 the interior forbids reed and daub.
- Sources cited there: Lore:Argonian; The Improved Emperor's Guide to Tamriel/Black Marsh.

## Recommendations
1. Yard mud-hut slot. Swap `composite:mud/hut-with-entrance` for the pair Mud Mother itself places: `mudhut01` at plugin scale 1.39 plus its load door at the mined fixed offset. Its form is the canon Shadowfen mud hut, it is 2529 tris against 16141, and its interior kit exists.
   - Blocker: the door `dlc2telmithryndoor01` is a Dragonborn mesh that is not in the vault. This is a sourcing job (the owner's Dragonborn BSA), recorded as OPEN in the sourcing log until the mesh is fetched.
   - If the owner rules the door stays out, the yard shows `composite:stilt/bamboohut01-with-door` instead. It is the only hut with a real doorway, it matches the plugin on 17/17 placements, and it is labelled as a stilt-kit piece.
2. Rule for choosing huts in 16i:
   (a) The shell's kit matches the region (material-culture.md:272-277).
   (b) The entrance is the shell plus the DOOR the mod placed with an XTEL, at a fixed offset (spread ≤ 0.2 m on ≥ 2 placements).
   (c) Every mud-kit and stilt-kit hut with an interior was built this way, so "built in" is not a filter. Reject dressing doors (no XTEL, as on hutexterior) as entrances.
   (d) Where the door has no interior, it is a static part (brief:489-491).
   (e) Prefer the shell whose mesh has a measured opening when two candidates tie.
3. Fix mine_door_links.py:181 and :322 to the clockwise convention (mine_assemblies.py:295), re-mine, and re-run interiors_index. Add a test: HTBM bamboohut sideDeg is constant across its 17 placements.
4. Add KotM to the door-link mine and extract its mudhuts/ folder from the BSA. Its 15 mud huts are the only Shadowfen mud huts that come with windows and five interiors, which also bears on finding 8 (windows). Check KotM's reuse permissions first, because the sourcing log registers it as "statistics only" (settlement-kit-sourcing-log.md:204).
5. Give the gaps.shellsWithoutDoor entries in kit-assemblies-mined.json a written `why` (they are all empty).

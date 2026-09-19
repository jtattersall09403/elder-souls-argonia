# Polearm and blade mod inventory (weapons lane round 1, stream S)

Exact contents of the four downloaded source mods, so later streams can name
real files. Downloaded 2026-09-18 with the owner's Nexus key; archives, hashes
and extracted roots recorded in the ignored vault
`../elder-scrolls-asset-pipeline/skyrim-source/mod-sources/SOURCES.json`.
**No clip is chosen or judged here** — selection is the next stream's job.

| Mod | Nexus | File id | Archive size | sha256 (first 16) | Extracted root (under `mod-sources/extracted/`) |
| --- | --- | --- | --- | --- | --- |
| Animated Armoury (DAR) 2.3 | SSE 35978 | 236456 (MAIN) | 35,126,679 | `57ef2ddf08cea13ba` | `animated-armoury-2.3/AnimatedArmouryDAR SSE/Data` |
| Animated Heavy Armory 2.4.2 | SSE 51100 | 223848 (MAIN, FOMOD) | 30,395,460 | `d0e23122d8d38e53` | `animated-heavy-armory-2.4.2/` (branch dirs, see below) |
| Skyrim Spear Mechanic SE 3.0 DAR | SSE 25146 | 145670 (MAIN) | 2,788,307 | `d2e714645e59cd1c` | `spear-mechanic-3.0` |
| Black Marsh Import 0.1 | Skyrim LE 48551 | 1000085609 (MAIN) | 146,078,265 | `ce26f99282dfbf23` | `black-marsh-import-0.1/ArgonianImport` |

Both BSAs were unpacked in place with `pipeline.bsa` so `meshes/` sits beside
the plugin: `PrvtI_HeavyArmory.bsa` (181 files) and `SkyrimSpearMechanic.bsa`
(4 files). Animated Armoury ships everything loose; Black Marsh Import ships
neither archive nor plugin.

## (a) Plugins and animation layout

| Mod | Plugin(s) used | Animation system |
| --- | --- | --- |
| Animated Armoury | `NewArmoury.esp` (the only plugin in the archive) | DAR `Meshes/actors/character/animations/DynamicAnimationReplacer/_CustomConditions/<n>/` (14 folders) plus `_1stperson/...` (10 folders). `_CustomConditions/AnimatedArmoury Folders.txt` is the author's own priority key. |
| Animated Heavy Armory | `001 Heavy Armory - Plugin/PrvtI_HeavyArmory.esp` | DAR folders `613` (quarterstaff), `620` (shortspear), `611` (pike), each with a `_1stperson` twin, in FOMOD branches `010`/`011`/`012`. |
| Spear Mechanic | `SkyrimSpearMechanic.esp` | DAR folders `100/200/201/300/301/400/401` + `_1stperson` `100/200/300/400`. |
| Black Marsh Import | none | none (raw meshes). |

FOMOD: `animated-heavy-armory-2.4.2/fomod/ModuleConfig.xml` offers 100+ options;
only these branches are ours — `000 Heavy Armory Meshes` (meshes + BSA),
`001 Heavy Armory - Plugin`, `010 Animations for Quarterstaffs`,
`011 Animations for Shortspears`, `012 Animations for Spears and Tridents`.
Everything else is levelled-list / enchantment / perk-description patches for
third-party mods and is not needed. Spear Mechanic and Animated Armoury are
listed by that mod as recommended companions, not as required patch files, so no
extra file was taken.

DAR conditions key on a keyword on the equipped weapon (`IsEquippedRightHasKeyword`).
DAR `_CustomConditions` under `actors/character/animations` apply to **every
humanoid actor, player and NPC alike**; only the `_1stperson` twin is
player-only. So each row below is one moveset for both.

| Mod | Folder | Condition (keyword → type) | Slot family | 3rd/1st clip count |
| --- | --- | --- | --- | --- |
| AA | 10 | `NewArmoury.esp` 0x000801 `WeapTypeRapier` | 1hm | 50 / 27 |
| AA | 11 | 0x0e457e `WeapTypePike` | 2hm (greatsword) | 71 / 36 |
| AA | 12 | 0x0e4580 `WeapTypeHalberd` | 2hw (battleaxe) | 64 / 33 |
| AA | 13 | 0x0e4581 `WeapTypeQtrStaff` | 2hw | 71 / 36 |
| AA | 14 | 0x19aab4 `WeapTypeClaw` (right hand, 1hm left) | 1hm + dw | 56 / 56 |
| AA | 16 | vanilla `WeapTypeMace` OR 0x2b65bc `AltMace` | 1hm | 30 / — |
| AA | 17 | vanilla `WeapTypeDagger` / `AltDagger`, not claw/cestus | 1hm | 35 / — |
| AA | 18 | 0x31bd77 `WeapTypeWhip` | 1hm | 41 / 28 |
| AA | 19 | 0x344733 `WeapTypeKatana`, something in left hand | 1hm | 22 / 29 |
| AA | 20 | `WeapTypeKatana`, left hand empty (drawn) | 1hm, full locomotion + male/female `mt_sprintforward` | 59 / — |
| AA | 29/30 | claw in left / in both hands | dual-wield (`dw*`) | 27+28 / 34+28 |
| AA | 31/32 | whip in left / both hands | dual-wield | 26+24 / 12 |
| AHA | 613 | `PrvtI_HeavyArmory.esp` 0x1bb978 `WeapTypeQuarterstaff` | 2hw | 71 / 36 |
| AHA | 620 | 0x1bb97f `WeapTypeShortspear` | 1hm | 74 / 22 |
| AHA | 611 | 0x1bb976 `WeapTypePike` AND NOT 0x1bb979 `WeapTypeGlaive` | 2hm | 71 / 36 |
| SSM | 100 | `SkyrimSpearMechanic.esp` 0x000d62 `WeapTypeSpear` OR 0x00d4c9 `WeapTypeJavelin` | 1hm | 74 / 22 |
| SSM | 200 | spear + left hand empty/magic (`IsEquippedLeftType` 0,12–16) | 1hm + `mag_*`/`sneak*` two-hand grip | 132 / 4 |
| SSM | 201 | same, weapon drawn | sprint (`mt_sprintforwardsword`, `magic_sprintforward`) | 2 / — |
| SSM | 300/301 | javelin, not sneaking / sneaking | `1hm_blockbash*`, `shd_blockbash*` (the throw) | 4+4 / 4 |
| SSM | 400/401 | `HasPerk` 0x0b1940 + spear/javelin | `1hm_equip`/`unequip` (back sheath) | 2+1 / 2 |

## (b) Clips per weapon type

Filenames are the vanilla slot they replace (DAR is a same-name replacer), so
"slot" and "file name" are the same string. Counts are the folder counts above.

| Type | Source | Base | Attacks | Block/bash | Idle/equip | Locomotion | Recoil/stagger |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rapier | AA 10 | 1hm | `1hm_attackleft/right`, `attackpower`, `attackpower{left,right,fwd,bwd}`, `attackforwardsprint`, `attackpowerforwardsprint`, 16 `{run,walk}{fwd,bwd,left,right}attack{left,right}`, 5 `1hm_sneakattackpower*`, `Sneak_1hmattack(intro)` | `dw1hm1hmblockbash(intro/power)` | `1hm_Equip`, `1hm_unequip`, `1hm_idle`(+`idleOld`), `dw1hm1hmidle` | `1hm_turn{left,right}{60,180}` | — |
| pike | AA 11 | 2hm | `2hm_attackleft/right`, `attackpower`, `attackpower{left,right,forward,bwd}`, `AttackPower3SlashCombo`, sprint pair, 16 run/walk attacks, `sneak_2hmattack` | `2hm_blockanticipate/blockidle/blockHit(A/B)/blockbash(intro/Power)` | `2hc_equip`, `2hc_unequip`, `2hm_idle` | full `2hm_{run,walk}*` set + turns + `2hm_sprintforwardsword` | `2hm_recoil{left,right,timed}`, 5 `2hm_staggerback*` |
| halberd | AA 12 | 2hw | `2hw_attackleft/right`, `attackpower{left,right}`, sprint pair, 16 run/walk attacks | `2hw_blockanticipate/blockidle/blockHit(A/B)/blockbash(intro/Power)` | `2hw_equip`, `2hw_unequip`, `2hw_idle` | full `2hw_{run,walk}*` + turns + `2hw_sprintforwardsword` + arm blends | `2hw_recoilleft`, 5 `2hw_staggerback*` |
| quarterstaff | AA 13 **and** AHA 613 (two independent sets) | 2hw | AA 13 adds `2hw_attackpower`, `attackpowerbwd`, `attackpowerforward`, `attackpowerLeft/Right` over the halberd set; AHA 613 is the same 71-file shape | same as halberd | `2hw_equip/unequip/idle` | full `2hw` locomotion | `2hw_recoil{Left,right,timed}`, 5 staggers |
| katana | AA 19 (off-hand busy) + AA 20 (empty off-hand) | 1hm | 19: `attackleft/right`, `attackpower(bwd/fwd)`, 16 run/walk attacks. 20 adds `1hm_attackpower{left,right}`, sprint pair | 20: `1hm_blockanticipate/blockIdle/blockHit(A/B)/blockbash(intro/power)` | 20: `1hm_equip`, `1hm_Idle` | 20: full `1hm_{run,walk}*`, turns, `mt_sprintforwardsword`, male+female `mt_sprintforward` | 20: `1hm_recoil{Left,Right,timed}` |
| claw | AA 14 (right), 29 (left), 30 (both) | 1hm + `dw` | 14: full 1hm attack set + 5 sneak power; 29/30: `dw1hm1hm_attackright`, `dw1hm1hm_powerattack`, `dw1hm1hm_specialattackpower`, `dw_attackpower{left,right,forward,back,stab}`, `dw_attackpowerknifeslashcombo`, 8 `dw{run,walk}*_attackright` | `1hm_blockbash(intro/power)`, `1hm_blockhit(a/b)`, `1hm_blockidle`; `dw1hm1hmblockbash*`, `dw1hm1hmblockidle`, `dw1hm1hmmovingblockidle` | `dag_equip`, `dag_unequip`, `1hm_idle`, `dw1hm1hmidle(1hm)` | turns; 1st-person `1hm_1stp_walk/run/turn*` | `1hm_recoil{left,right,timed}`, `dw_recoilright`, `dw_recoiltimed` |
| spear | SSM 100 (+200 two-hand grip) | 1hm | `1hm_attackleft/right`(+`intro`), `attackpower`, `attackpower{left,right,fwd,bwd}`, sprint pair, 32 `{run,walk}*attack{left,right}(intro)`, 5 sneak power | 200 only: `1hm_blockanticipate/blockbash(intro/power)/blockhit(a/b)/blockidle` | `1hm_Idle`, 400: `1hm_equip`/`unequip` | `1hm_{run,walk}{forward,backward,left,right,...}`, turns; 200 adds `mag_*`, `sneak*`, `mrh_idle`/`mlh_idle` | `1hm_recoil{left,right,timed}` |
| javelin (SSM extra) | SSM 300/301 | 1hm | throw is `1hm_blockbash`, `1hm_blockbashpower`, `shd_blockbash`, `shd_blockbashpower` | — | 400 equip pair | — | — |
| shortspear | AHA 620 | 1hm | same 74-file shape as SSM 100 (attack + intro variants, 32 moving attacks, 5 sneak power) | — (uses vanilla) | `1hm_Idle` | `1hm_{run,walk}*`, turns | `1hm_recoil{left,right,timed}` |
| half-pike | AHA — none of its own | 2hm | `WeapTypeHalfPike` records also carry `WeapTypePike`, so they play folder 611 (the pike set) | see pike | see pike | see pike | see pike |
| poleaxe | AHA — none of its own | 2hw/2hm | `WeapTypePoleaxe` records also carry `WeapTypeHalberd`; AHA ships **no** halberd folder, so vanilla battleaxe motion unless AA 12 is used | — | — | — | — |
| trident | AHA — none of its own | 2hm | `WeapTypeTrident` records also carry `WeapTypePike` → folder 611 | see pike | see pike | see pike | see pike |

Pike/spear/trident/half-pike sets are **2hm (greatsword-based)**;
halberd/quarterstaff are **2hw (battleaxe-based)**; rapier, katana, claw,
shortspear, SSM spear and javelin are **1hm-based**. There is no bespoke
"thrust" base: the thrust is authored inside the 1hm/2hm slots.

## (c) Meshes and textures

No mod ships a separate first-person weapon mesh; Skyrim reuses the world
`.nif`. Only Spear Mechanic ships weapon textures of its own.

| Type | Mesh folder (under the extracted root) | Count | Textures referenced | Resolved in vanilla `Skyrim - Textures.bsa` | Unresolved |
| --- | --- | --- | --- | --- | --- |
| rapier | `Meshes/weapons/NewArmoury/Rapier/*.nif` | 15 | 91 | 78 | 13, all `textures/dlc01/*` |
| pike | `.../NewArmoury/Pikes` | 18 | 127 | 102 | 25 (dlc01/dlc02) |
| halberd | `.../NewArmoury/Halberds` | 16 | 130 | 102 | 28 (dlc01/dlc02) |
| quarterstaff | `.../NewArmoury/QuarterStaffs` | 17 | 79 | 58 | 21 (dlc) |
| katana | `.../NewArmoury/Katana` | 12 | 134 | 105 | 29 (dlc) |
| claw | `.../NewArmoury/Fists` (`*Claw.nif` + `*ClawLft.nif`) | 30 | 119 | 95 | 24 (dlc) |
| bound FX | `.../NewArmoury/Bound` | 7 | — | — | — |
| whip (not in scope) | `.../NewArmoury/Whips` | 29 | — | — | — |
| shortspear | `meshes/prvti/<material>/<material>shortspear.nif` | 20 | 187 | 153 | 34 (dlc) |
| spear / half-pike | `meshes/prvti/<m>/<m>spear.nif`, `<m>spearnew.nif` | 40 | 250 | 198 | 52 (dlc) |
| halberd / poleaxe | `meshes/prvti/<m>/<m>halberd.nif` | 12 | 143 | 100 | 43 (dlc) |
| trident | `meshes/prvti/<m>/<m>trident.nif` | 12 | 149 | 118 | 31 (dlc) |
| quarterstaff (AHA) | `meshes/prvti/<m>/<m>staff.nif`, `<m>quarterstaff.nif` | 13 | 100 | 78 | 22 (dlc) |
| glaive (AHA) | `meshes/prvti/<m>/<m>glaive(new).nif` | 11 | 77 | 74 | 3 (dlc) |
| spear/javelin (SSM) | `meshes/weapons/SkyrimSpearMechanic/{Spear,Javelin,Projectile}_*.nif` | 33 | 43 | 33 | 10: 3 Riekling + 5 dlc, plus `ElderSpear(_n).dds` which the mod itself ships in `textures/weapons/SkyrimSpearMechanic/` |

Measured with `pipeline.build._referenced_textures` against
`skyrim-source/Data/Skyrim - Textures.bsa`. **Every unresolved texture is a
`textures/dlc01|dlc02` path**: the vault holds only the three base-game BSAs, so
Dawnguard/Dragonborn-material variants (dragonbone, stalhrim, dawnguard,
draugr-DLC, Riekling) cannot be textured today. Base-game materials (iron,
steel, elven, glass, ebony, orcish, dwarven, daedric, nordic, silver, imperial,
forsworn, falmer, nordhero, akaviri/blades) are fully covered. Filling that gap
means adding the DLC BSAs to the vault — a sourcing job for whoever ships a
DLC-material weapon, recorded here because nothing else records it.

## (d) Plugin WEAP records

Mined with the generalised `pipeline/weapon_records.py`
(`records_for_models(plugin_paths, models)`, also exposed as
`python3 -m pipeline.weapon_records --plugin <esp> --models <paths...>`; the
arsenal path and its tests are unchanged, `npm run test:pipeline` = 212 passed).

| Type | Record | dmg | wt | value | speed | reach | crit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rapier | `IronRapier` / `EbonyRapier` | 5 / 11 | 6 / 12 | 25 / 720 | 1.3 | 1.35 | 10 / 13 |
| pike | `IronPike` / `EbonyPike` | 11 / 19 | 13 / 19 | 54 / 1553 | 1.2 | 1.7 / 1.75 | 10 / 12 |
| halberd | `IronHalberd` / `EbonyHalberd` | 14 / 21 | 17 / 23 | 55 / 1585 | 0.9 | 1.7 | 10 / 14 |
| quarterstaff | `IronQStaff` / `EbonyQStaff` | 10 / 17 | 15 / 20 | 30 / 865 | 1.0 | 1.5 | 5 / 9 |
| katana | `IronKatana` / `EbonyKatana` | 8 / 14 | 7 / 13 | 25 / 720 | 1.0 | 1.0 | 5 / 8 |
| claw | `IronClaws` / `EbonyClaws` | 5 / 11 | 3 / 7 | 10 / 720 | 1.3 | 1.0 | 0 |
| shortspear | `ShIronShortspear` / `ShEbonyShortspear` | 7 / 13 | 12 / 18 | 32 / 800 | 0.9 | 1.3 | 4 / 7 |
| trident | `ShIronTridentSpear` / `ShEbonyTridentSpear` | 14 / 22 | 17 / 24 | 59 / 1750 | 0.7 | 1.6 | 9 / 14 |
| poleaxe/halberd (AHA) | `ShIronHalberd` | 15 | 18 | 57 | 0.75 | 1.5 | 8 |
| glaive (AHA) | `ShSteelGlaive` | 15 | 18 | 110 | 0.8 | 1.75 | 8 |
| quarterstaff (AHA) | `ShSteelStaff` / `ShDLC2NordicStaff` | 12 / 15 | 12 / 14 | 43 / 500 | 1.1 | 1.3 | 5 / 7 |
| spear (SSM) | `SSM_Spear_0_Iron` / `SSM_Spear_8_Daedric` | 6 / 13 | 13 / 16.5 | 15 / 750 | 1.1 | 1.3 | 3 / 7 |
| javelin (SSM) | `SSM_Javelin_0_Iron` | 4 | 10.4 | 15 | 1.2 | 1.0 | 1 |

Record counts per keyword: AA rapier 19, pike 23, halberd 20, quarterstaff 21,
katana 21, claw 52, whip 55. AHA shortspear 22 (each also `WeapTypeSpear`),
half-pike 15 (also pike), poleaxe 12 (also halberd), trident 12 (also pike),
glaive 7, quarterstaff 14, halberd 12. SSM spear 12, javelin 12.
`prvti/<m>/spear.nif` alone has no record — AHA's half-pikes point at
`<m>spearnew.nif`.

## (e) Black Marsh Import — five weapons

Not an installable mod: no `.nif`, no `.esp`, no `.mtl` (the OBJs name
`mtllib` files the archive does not contain). Five `.obj` + 15 `.tga`
(diffuse/normal/specular each; the knife's normal is `bone_knife_normals.tga`,
not `_nm`). Model units differ per file, so the long-axis extent below is a
within-file silhouette measure only, not a game scale; class is read from the
author's own names (mod page: "Obsidian Warhammer, Bone Talon Dagger, Silver
Jagged Katana, Steel Great Cleaver").

| Weapon (author's name) | OBJ | verts / faces | extent (long axis) | Textures | Vanilla class it is shaped like |
| --- | --- | --- | --- | --- | --- |
| Bone Talon Dagger | `bone_knife.OBJ` | 939 / 922 | 49.1 (blade ≈4× width) | `bone_knife_diff/_normals/_spec.tga` | dagger |
| Steel Great Cleaver | `iron_cleaver.obj` | 440 / 870 | 105.6 (width 33.6 — broad blade) | `cleaver_diff/_nm/_spec.tga` | greatsword / battleaxe-weight cleaver |
| Obsidian Warhammer | `obsidian_warhammer.obj` | 2726 / 1969 | 15.9 (own unit scale) | `warhammer_diff/_nm/_spec.tga` | warhammer |
| Silver Jagged Katana | `silver_jagged_katana.obj` | 687 / 724 | 90.0 (width 6.9 — long thin blade) | `katana_diffuse/_nm/_spec.tga` | katana (→ one-handed family) |
| wooden ball club | `wooden_ballclub.obj` | 520 / 518 | 2.2 (own unit scale) | `wooden_ballclub_diff/_nm/_spec.tga` | mace / club |

The fifth weapon is the ball club; the mod page lists only four by name.

## (f) Permissions, as stated on the mod pages

- **Animated Armoury (35978, NickNak)** — "Permissions wise, anyone is ok to do
  anything they want with this mod, rework it, translate it, reanimate it, use
  the source code (I suck at coding); whatever floats your boat. No need to ask,
  just give credit please." Credits on the page include Felisky384 (DAR).
- **Animated Heavy Armory (51100, Dreadflopp)** — the API description carries
  **no** permission statement; it states the mod is "a standalone version of
  PrivateEye's Heavy Armory", so the mesh upstream is PrivateEye.
- **Skyrim Spear Mechanic SE (25146, Ashingda)** — no permission statement in
  the description; it credits BouBoule201288, NickaNak, Bubbajones_ya,
  KeyboardKing and "nikikuriton — Original author of the Elder Spear".
- **Black Marsh Import (48551, artiedee)** — no permission statement. The page says the
  author plans more weapons and needs someone else to implement them, which
  reads as an offer, not as a licence.

**Open before any of these assets ships (gap, not a deferral):** the Nexus v1
API does not expose the page's permission box. Plain page fetches are 403 from
this VM, so three of the four permission positions are unverified. Read the
permission box for 51100, 25146 and 48551 (and PrivateEye's Heavy Armory
upstream) and add the credit lines to root `README.md` § Credits in the same
change that ships the first converted asset.

## Round 1 meshes (stream M): what was built from Animated Armoury

28 weapons from Animated Armoury 2.3 are now in the arsenal, built by the same
`pipeline.build_weapons` batch that builds the vanilla 53 and installed beside
them in `packages/character-assets/files/weapons` (+ `weapon-icons`).

Seven new classes, each supplying its length and sheath socket:
`rapier` 1.1 m (WeaponSword), `katana` 1.05 m (WeaponSword), `claw` 0.45 m
(WeaponDagger), `pike` 2.5 m, `spear` 2.1 m, `halberd` 2.2 m and
`quarterstaff` 1.6 m (all four WeaponBack). Materials are iron, steel, elven
and ebony — the four the mod textures entirely from the base game, so nothing
new ships in `textures/`.

Meshes taken, under `Meshes/weapons/NewArmoury/` in the extracted root:
`Rapier/<Material>Rapier.nif`, `Katana/<Material>Katana.nif`,
`Fists/<Material>Claw.nif` (the right hand; `*ClawLft` is the mirrored
off-hand copy of the same item, not a second item), `Pikes/<Material>Pike.nif`,
`Halberds/<Material>Halberd.nif` and `QuarterStaffs/<Material>Staff.nif` —
note the quarterstaff files are named `...Staff.nif`, not `...QuarterStaff.nif`.
The mod ships **no** spear mesh, so the spear class is the pike NIF built to the
shorter spear length; each spear row carries that in a `note` field.

How a modded mesh reaches the builder: an arsenal item may now carry
`"root": "<vault-relative data root>"`. The NIF is then resolved
case-insensitively under that root (mod archives are mixed case, our paths are
lower-cased) instead of `Skyrim - Meshes.bsa`. Each texture the NIF references
is looked for under that root first and in `Skyrim - Textures.bsa` otherwise. Items without `root` take the vanilla path unchanged. All 98
textures the 28 meshes reference resolved (0 unresolved), all from the vanilla
archive.

| id | class | GLB bytes | sizeMeters (x × y × z) | icon |
| --- | --- | --- | --- | --- |
| `iron-rapier` | rapier | 45,828 | 0.21467 × 0.13115 × 1.1 | yes |
| `steel-rapier` | rapier | 60,164 | 0.2501 × 0.03114 × 1.1 | yes |
| `elven-rapier` | rapier | 106,356 | 0.24044 × 0.03451 × 1.1 | yes |
| `ebony-rapier` | rapier | 132,088 | 0.15762 × 0.04792 × 1.1 | yes |
| `iron-katana` | katana | 104,488 | 0.10175 × 0.05901 × 1.05 | yes |
| `steel-katana` | katana | 226,060 | 0.0941 × 0.06336 × 1.05 | yes |
| `elven-katana` | katana | 120,584 | 0.08581 × 0.03106 × 1.05 | yes |
| `ebony-katana` | katana | 151,136 | 0.07617 × 0.07219 × 1.05 | yes |
| `iron-claw` | claw | 98,172 | 0.45 × 0.21297 × 0.20696 | yes |
| `steel-claw` | claw | 112,748 | 0.45 × 0.09368 × 0.12455 | yes |
| `elven-claw` | claw | 199,752 | 0.45 × 0.16195 × 0.26336 | yes |
| `ebony-claw` | claw | 209,484 | 0.45 × 0.12422 × 0.15001 | yes |
| `iron-pike` | pike | 286,116 | 0.13763 × 0.06977 × 2.5 | yes |
| `steel-pike` | pike | 169,112 | 0.28039 × 0.12329 × 2.5 | yes |
| `elven-pike` | pike | 246,996 | 0.2902 × 0.06815 × 2.5 | yes |
| `ebony-pike` | pike | 193,908 | 0.104 × 0.05723 × 2.5 | yes |
| `iron-spear` | spear | 286,124 | 0.11561 × 0.05861 × 2.1 | yes |
| `steel-spear` | spear | 169,108 | 0.23553 × 0.10356 × 2.1 | yes |
| `elven-spear` | spear | 247,000 | 0.24377 × 0.05724 × 2.1 | yes |
| `ebony-spear` | spear | 193,912 | 0.08736 × 0.04807 × 2.1 | yes |
| `iron-halberd` | halberd | 323,456 | 0.38631 × 0.064 × 2.2 | yes |
| `steel-halberd` | halberd | 242,016 | 0.37509 × 0.11319 × 2.2 | yes |
| `elven-halberd` | halberd | 283,828 | 0.31699 × 0.05997 × 2.2 | yes |
| `ebony-halberd` | halberd | 207,864 | 0.44981 × 0.06694 × 2.2 | yes |
| `iron-quarterstaff` | quarterstaff | 273,720 | 0.05185 × 0.04536 × 1.6 | yes |
| `steel-quarterstaff` | quarterstaff | 97,700 | 0.06394 × 0.06032 × 1.6 | yes |
| `elven-quarterstaff` | quarterstaff | 127,912 | 0.18803 × 0.08247 × 1.6 | yes |
| `ebony-quarterstaff` | quarterstaff | 67,176 | 0.06208 × 0.06208 × 1.6 | yes |

5.44 MB of GLB + icon added to the tracked runtime assets. The GLBs are raw
glTF binary with JPEG textures, exactly as the existing 53 weapons are: weapon
GLBs have never gone through `pipeline/kit_compress.py` (that is the kit path),
so these match their neighbours rather than introducing a second convention.

## Round 1b meshes (stream M2): Animated Heavy Armory and Black Marsh Import

The owner cleared mods 51100 and 48551 for use on 2026-09-19 (permissions read
on the Nexus pages). Eleven more items are in the arsenal, built by the same
`pipeline.build_weapons` batch and installed beside the other 81 in
`packages/character-assets/files/weapons` (+ `weapon-icons`). No new class was
needed: every one of them is an existing class at its existing length.

| id | class | material | GLB bytes | sizeMeters (x × y × z) | record |
| --- | --- | --- | --- | --- | --- |
| `iron-trident` | pike | iron | 195,004 | 0.41753 × 0.10661 × 2.5 | ShIronTridentSpear |
| `elven-trident` | pike | elven | 347,520 | 0.42513 × 0.13371 × 2.5 | ShElvenTridentSpear |
| `ebony-trident` | pike | ebony | 312,800 | 0.47102 × 0.0991 × 2.5 | ShEbonyTridentSpear |
| `iron-halfpike` | spear | iron | 131,104 | 0.23762 × 0.06618 × 2.1 | ShIronSpear |
| `steel-halfpike` | spear | steel | 253,844 | 0.16408 × 0.06154 × 2.1 | ShSteelSpear |
| `elven-halfpike` | spear | elven | 184,712 | 0.26069 × 0.0708 × 2.1 | ShElvenSpear |
| `bone-talon-dagger` | dagger | bone | 510,728 | 0.106 × 0.42 × 0.02654 | authored from `SteelDagger` |
| `steel-great-cleaver` | greatsword | steel | 558,352 | 0.4514 × 1.42 × 0.09179 | authored from `SteelGreatsword` |
| `obsidian-warhammer` | warhammer | obsidian | 760,452 | 0.29735 × 1.3 × 0.16883 | authored from `GlassWarhammer` |
| `silver-jagged-katana` | katana | silver | 554,188 | 0.08065 × 1.05 × 0.02594 | authored from `SilverSword` |
| `wooden-ball-club` | mace | wood | 673,524 | 0.2215 × 0.11569 × 0.8 | authored from `IronMace` |

4.49 MB of GLB + icon added. All 81 existing manifest and record
entries are byte-identical (diffed; only `source.minedAt` moved).

### Animated Heavy Armory: what the mod actually ships

`<material>trident.nif` at the `pike` length and `<material>spearnew.nif` (the
half-pike) at the `spear` length, from the `000 Heavy Armory Meshes` branch's
`meshes/prvti/<material>/`. **The mod ships no steel trident and no ebony
half-pike**, so those two items do not exist — three tridents (iron, elven,
ebony) and three half-pikes (iron, steel, elven), not four of each. Checked by
listing every `*trident.nif` and `*spearnew.nif` under `meshes/prvti/`; the
materials that do carry a trident beyond these are all DLC ones the vault
cannot texture (dragonbone, nordic, stalhrim, redguard) or higher tiers outside
this round (daedric, glass, dwarven, orcish, silver). All 65 textures the six
NIFs reference resolved, every one from the vanilla archive.

Their WEAP records (`ShIronTridentSpear`, `ShIronSpear` and friends) come from
`PrvtI_HeavyArmory.esp`, which the FOMOD puts in a **sibling** branch
(`001 Heavy Armory - Plugin`) rather than under the mesh root. An arsenal item
may therefore now carry an explicit `"plugin"` (a vault-relative plugin file)
which `weapon_records.mine()` prefers over scanning the `root` for plugins.

### Black Marsh Import: the OBJ path

This mod is a modder's resource: five Wavefront OBJ meshes with loose TGA
diffuse/normal/specular maps, no NIF, no MTL and no plugin. Two things were
added for it.

**An OBJ item.** An arsenal entry may declare `"obj"` instead of `"nif"`, with a
`"textures"` map naming the diffuse, normal and specular files (all relative to
the same `root`). The host converts each TGA to PNG with Pillow, capping the
longest side at 1024 (`MAX_MOD_TEXTURE`): glTF cannot carry a TGA; Blender's own
TGA reader returns no image data for these files; the maps are authored at
2K–4K where every vanilla weapon here textures off 512–1024. Blender then
imports the OBJ with `wm.obj_import`, wires one Principled material from the
PNGs, then runs the same scale-to-length, icon render and manifest emission the
NIF path runs, so the GLB and the manifest entry are indistinguishable
downstream. The raw TGAs never leave the build directory.

**An authored record.** With no plugin there is no Bethesda record to read, so
these five carry a `"record"` block in `arsenal.json` copied wholesale from a
named vanilla record of the same class and material tier, plus `"recordFrom"`
naming it. `mine()` emits them with `kind: "AUTHORED"` and
`source: {"kind": "authored", "note": "no plugin ships with this mod",
"takenFrom": "<EditorID>"}`. Nothing is invented. Each record states the
copied provenance in its own `source` block. The source of each: `SteelDagger` (bone is tier 2,
as steel is), `SteelGreatsword`, `GlassWarhammer` (obsidian *is* volcanic glass;
vanilla has no tier-5 warhammer, since Nord Hero ships no hammer), `SilverSword`
(there is no vanilla katana; silver's own one-handed blade is the same tier and
the nearest class) and `IronMace` (wood is tier 1, as iron is).

Three new `MaterialProfile` rows carry them: `wood` (tier 1), `bone` (tier 2)
and `obsidian` (tier 5), in `packages/game-core/src/equipment/materials.ts`.

**Skyrim Spear Mechanic (25146) contributes no mesh in this round.**

### Open: the five OBJ icons need a visual check

A Sonnet pass over the rendered 160 px icons read `wooden-ball-club` as correct
and flagged the other four: `silver-jagged-katana` as a flat slab with no blade
silhouette, `obsidian-warhammer` as a banded rod with no visible head,
`bone-talon-dagger` as a sheath-like form with a metal hook, plus
`steel-great-cleaver` as a thin blade with an odd stacked-disc hilt. None showed
magenta, scrambled UVs or inverted-normal faces; every OBJ does carry `vt`
and `vn` data. So this is not a missing-texture or missing-UV failure. It may
equally be a 160 px icon of an unfamiliar LE-era mesh being over-read. **Look at
these four in the studio or at full size before relying on them**; if they are
genuinely wrong the cause is in the mesh or the icon camera, not in the
texturing.

## Round 1 selections (stream P, 2026-09-18)

Five animation packs were built from Animated Armoury 2.3 and installed:
`pike` (folder 11), `halberd` (12), `quarterstaff` (13), `rapier` (10) and
`claw` (14, right-hand set). Each mirrors its base pack's semantics under its
own prefix wherever the folder authors a file of the same vanilla name. It
inherits the rest through `requires`: `pike` from `greatsword`, `halberd` and
`quarterstaff` from `greataxe`, `rapier` and `claw` from `oneHanded`. The
config is `pipeline/config/animations/humanoid-1h-combat.json`; every source
goes through `localOverrides` under an `aa_<pack>_<file>` key. The selected
paths are recorded in the vault `SOURCES.json` under mod 35978.

### The Havok class decides what can be used

Part of this mod is stored as `hkaInterleavedUncompressedAnimation` rather than
the spline-compressed form. PyNifly raises `No hkaSplineCompressedAnimation
found in HKX file` on those files. **Scan the class before naming a file.** Round 1b
adds a converter, `pipeline/hkx_interleaved.py` (see Round 1b below). The five
substitutions round 1 made are kept as built. Five semantics therefore play a
spline-compressed sibling from the same folder rather than the uncompressed file
that carries their vanilla name:

| Semantic | Used | Instead of | Why that file |
| --- | --- | --- | --- |
| `PIKE_IDLE` | `11/2hm_idle_OLD.hkx` | `11/2hm_idle.hkx` | the mod's earlier take on the same pike stance |
| `PIKE_HEAVY` | `11/2hm_attackpowerright.hkx` | `11/2hm_attackpower.hkx` | the folder's other standing power attack |
| `QUARTERSTAFF_HEAVY` | `13/2hm_attackpower.hkx` | — | named for the 2hm slot but placed in the quarterstaff folder, so it is a staff motion |
| `QUARTERSTAFF_HEAVY_2` | `13/2hw_attackpowerbwd.hkx` | `13/2hw_attackpowerLeft.hkx` | a backward power attack as the heavy follow-up |
| `RAPIER_IDLE` | `10/1hm_idleOld.hkx` | `10/1hm_idle.hkx` | the mod's earlier take on the same rapier stance |

`PIKE_RUN` stays out. The pike inherits `GREATSWORD_RUN`. Round 1 shipped **no
katana pack**. Folders 19 and 20 are uncompressed throughout bar a single sprint
attack, so the mod's katana meshes arrived with no moveset the importer could
read; a katana fell to the one-handed pack. Round 1b converts those files and
ships the pack (see Round 1b below).

### What shipped

| Pack | Requires | Clips | GLB bytes |
| --- | --- | --- | --- |
| `pike` | `greatsword` | 17 | 2,165,876 |
| `halberd` | `greataxe` | 13 | 1,790,792 |
| `quarterstaff` | `greataxe` | 13 | 1,715,864 |
| `rapier` | `oneHanded` | 8 | 1,154,060 |
| `claw` | `oneHanded` | 9 | 1,259,136 |

The semantics each pack publishes, which a moveset references by name:

- `pike`: `PIKE_IDLE`, `PIKE_WALK`, `PIKE_WALK_BACK`, `PIKE_STRAFE_LEFT`,
  `PIKE_STRAFE_RIGHT`, `PIKE_SPRINT`, `PIKE_LIGHT_1`, `PIKE_LIGHT_2`,
  `PIKE_LIGHT_3`, `PIKE_HEAVY`, `PIKE_HEAVY_2`, `PIKE_GUARD_ENTER`,
  `PIKE_GUARD`, `PIKE_GUARD_HIT_A`, `PIKE_GUARD_HIT_B`, `PIKE_EQUIP`,
  `PIKE_UNEQUIP`.
- `halberd`: `HALBERD_IDLE`, `HALBERD_SPRINT`, `HALBERD_LIGHT_1`,
  `HALBERD_LIGHT_2`, `HALBERD_LIGHT_3`, `HALBERD_HEAVY`, `HALBERD_HEAVY_2`,
  `HALBERD_GUARD_ENTER`, `HALBERD_GUARD`, `HALBERD_GUARD_HIT_A`,
  `HALBERD_GUARD_HIT_B`, `HALBERD_EQUIP`, `HALBERD_UNEQUIP`.
- `quarterstaff`: `QUARTERSTAFF_IDLE`, `QUARTERSTAFF_SPRINT`,
  `QUARTERSTAFF_LIGHT_1`, `QUARTERSTAFF_LIGHT_2`, `QUARTERSTAFF_LIGHT_3`,
  `QUARTERSTAFF_HEAVY`, `QUARTERSTAFF_HEAVY_2`, `QUARTERSTAFF_GUARD_ENTER`,
  `QUARTERSTAFF_GUARD`, `QUARTERSTAFF_GUARD_HIT_A`,
  `QUARTERSTAFF_GUARD_HIT_B`, `QUARTERSTAFF_EQUIP`, `QUARTERSTAFF_UNEQUIP`.
- `rapier`: `RAPIER_IDLE`, `RAPIER_LIGHT_1`, `RAPIER_LIGHT_2`,
  `RAPIER_LIGHT_3`, `RAPIER_HEAVY`, `RAPIER_HEAVY_2`, `RAPIER_EQUIP`,
  `RAPIER_UNEQUIP`.
- `claw`: `CLAW_IDLE`, `CLAW_LIGHT_1`, `CLAW_LIGHT_2`, `CLAW_LIGHT_3`,
  `CLAW_HEAVY`, `CLAW_HEAVY_2`, `CLAW_GUARD`, `CLAW_GUARD_HIT_A`,
  `CLAW_GUARD_HIT_B`.

Four packs are above the round's 1.2 MB expectation, counting a megabyte as a
million bytes; only `rapier` is under it. The pike pack carries its
own five-clip locomotion set and the haft packs carry four guard clips each.
Those clips account for the extra bytes.

### Contact windows, measured

`node scripts/measure-contact-windows.mjs --blade <L> <CLIP>` from
`apps/combat-sandbox`, on the installed manifest and pack GLBs. Fractions of
the clip's own playback span.

| Clip | Blade m | Start | End | Peak tip m/s |
| --- | --- | --- | --- | --- |
| `PIKE_LIGHT_1` | 2.5 | 0.310 | 0.387 | 19.5 |
| `PIKE_LIGHT_2` | 2.5 | 0.310 | 0.387 | 19.5 |
| `PIKE_LIGHT_3` | 2.5 | 0.628 | 0.722 | 22.0 |
| `PIKE_HEAVY` | 2.5 | 0.337 | 0.444 | 20.9 |
| `PIKE_HEAVY_2` | 2.5 | 0.316 | 0.444 | 23.8 |
| `HALBERD_LIGHT_1` | 2.2 | 0.383 | 0.480 | 55.0 |
| `HALBERD_LIGHT_2` | 2.2 | 0.310 | 0.387 | 17.7 |
| `HALBERD_LIGHT_3` | 2.2 | 0.441 | 0.553 | 23.2 |
| `HALBERD_HEAVY` | 2.2 | 0.531 | 0.628 | 40.9 |
| `HALBERD_HEAVY_2` | 2.2 | 0.480 | 0.565 | 51.8 |
| `QUARTERSTAFF_LIGHT_1` | 1.6 | 0.343 | 0.419 | 25.5 |
| `QUARTERSTAFF_LIGHT_2` | 1.6 | 0.339 | 0.403 | 31.7 |
| `QUARTERSTAFF_LIGHT_3` | 1.6 | 0.615 | 0.722 | 15.9 |
| `QUARTERSTAFF_HEAVY` | 1.6 | 0.397 | 0.510 | 12.1 |
| `QUARTERSTAFF_HEAVY_2` | 1.6 | 0.490 | 0.687 | 11.4 |
| `RAPIER_LIGHT_1` | 1.1 | 0.256 | 0.425 | 6.8 |
| `RAPIER_LIGHT_2` | 1.1 | 0.331 | 0.400 | 6.3 |
| `RAPIER_LIGHT_3` | 1.1 | 0.240 | 0.353 | 8.9 |
| `RAPIER_HEAVY` | 1.1 | 0.451 | 0.569 | 30.5 |
| `RAPIER_HEAVY_2` | 1.1 | 0.464 | 0.571 | 25.8 |
| `CLAW_LIGHT_1` | 0.45 | 0.394 | 0.500 | 15.2 |
| `CLAW_LIGHT_2` | 0.45 | 0.406 | 0.500 | 16.5 |
| `CLAW_LIGHT_3` | 0.45 and 1.0 | — | — | no sweep in reach |
| `CLAW_HEAVY` | 0.45 | 0.458 | 0.528 | 19.9 |
| `CLAW_HEAVY_2` | 0.45 | 0.419 | 0.475 | 16.4 |

`CLAW_LIGHT_3` (`1hm_attackpower`) reports no window at either 0.45 m or 1.0 m:
the claw stays inside the target box for most of the clip, but its tip speed
crosses the sweep threshold of about 5 m/s in single frames, so no phase
survives the minimum-duration filter. The motion is a lunge, so the contact
belongs on the body motion. Measured with the same sampler at 1.0 m: the tip
reaches its furthest forward travel, 0.719 m ahead of the pelvis, at 0.633 s of
the 1.433 s clip, a fraction of **0.442**. It stays within reach from 0.047 to
0.913. At
0.45 m the furthest point is 0.857 m at fraction 0.465, in reach from 0.349 to
0.703. Set the contact on that arrival rather than on a swept arc.

## Round 1b: the katana (stream K, 2026-09-19)

The blocker above is gone. `tooling/asset-pipeline/pipeline/hkx_interleaved.py`
reads `hkaInterleavedUncompressedAnimation` and rewrites it spline-compressed.
PyNifly's importer parses only the spline class, so it can now read folders 19
and 20. The katana pack is built and installed.

### The converter

Interleaved data is a flat, frame-major array of `hkQsTransform` (48 bytes:
translation, rotation, scale, each padded to 16): index
`frame * numberOfTransformTracks + track`. The reader walks the same packfile
structures PyNifly already parses (sections, local and virtual fixups), finds
the interleaved object, reads the array and fills PyNifly's own
`AnimationData` in the shape its spline decompressor produces. Bone names,
annotations and the `hkaAnimationBinding` fields are read with the same code
`anim_skyrim._parse_animation_hkx` uses; that block is inline in PyNifly, so it
is copied into `_read_names_and_binding` with a comment naming its origin.
Nothing in PyNifly is modified. Writing is PyNifly's own
`write_skyrim_animation`, which B-spline-fits the per-frame arrays, so the rest
of the pipeline sees an ordinary Skyrim SE spline clip.

Both pointer sizes are handled; Animated Armoury's files are 8-byte SE
packfiles. The CLI is
`python3 -m pipeline.hkx_interleaved --src <dir-or-file> --dst <dir>`. A
directory converts the `.hkx` files at its root; it does not walk into `male`
or `female`.

**Folder 20 converted whole: 59 files, 6.3 s.** Outputs live in the vault at
`…/extracted/animated-armoury-2.3/converted-spline/20/`, recorded with their
SHA-256 in the vault `SOURCES.json` under mod 35978 (`converted`). A second run
produced byte-identical output for all 59 files. Folder 19's
`1hm_attackforwardsprint.hkx` was not needed.

Every conversion is checked by reloading the output through
`anim_skyrim.load_skyrim_animation` and comparing it against the interleaved
source: frame count, track count, duration, bone names and the binding must
match exactly; the per-frame curves must survive the spline fit. Across the
59 files the worst error was **0.00029 Skyrim units of translation** (tolerance
0.01) and **0.104° of rotation** (tolerance 0.5°). The clip that the pack's
first light attack uses, `1hm_attackright`, is 40 frames × 107 tracks at
1.3000 s, with errors of 0.00010 units and 0.094°.

`pipeline/test_hkx_interleaved.py` builds a minimal two-track, three-frame
interleaved packfile in memory, so the decoding tests, the frame-major
indexing, the ragged-count rejection, the round trip and the determinism check
run without the vault. One further test converts folder 20's
`1hm_attackright.hkx`; it is skipped when Animated Armoury is absent.

### The pack

`katana` requires `oneHanded` and publishes the twelve semantics below,
mirrored from the one-handed entries exactly as `rapier` and `claw` were. **1,482,348 bytes.**
The sheathe is inherited (the folder authors no unequip), as are the parry, the
criticals and all locomotion but the sprint.

| Semantic | Source in folder 20 |
| --- | --- |
| `KATANA_IDLE` | `1hm_Idle.hkx`, looping |
| `KATANA_LIGHT_1` | `1hm_attackright.hkx` |
| `KATANA_LIGHT_2` | `1hm_attackleft.hkx` |
| `KATANA_LIGHT_3` | `1hm_attackpower.hkx` |
| `KATANA_HEAVY` | `1hm_attackpowerright.hkx` |
| `KATANA_HEAVY_2` | `1hm_attackpowerleft.hkx` |
| `KATANA_GUARD_ENTER` | `1hm_blockanticipate.hkx` |
| `KATANA_GUARD` | `1hm_blockIdle.hkx`, looping |
| `KATANA_GUARD_HIT_A` | `1hm_blockHitA.hkx` |
| `KATANA_GUARD_HIT_B` | `1hm_blockHitB.hkx` |
| `KATANA_EQUIP` | `1hm_equip.hkx` |
| `KATANA_SPRINT` | `mt_sprintforwardsword.hkx`, looping |

Before installing, all twelve pre-existing pack GLBs were rebuilt and compared.
Every one is md5-identical to the installed copy, so the converter changed
nothing but its own pack.

### Contact windows, measured

`node scripts/measure-contact-windows.mjs --blade 1.05 <CLIP>` from
`apps/combat-sandbox`, on the installed manifest and pack GLB. Fractions of the
clip's own playback span.

| Clip | Blade m | Start | End | Peak tip m/s |
| --- | --- | --- | --- | --- |
| `KATANA_LIGHT_1` | 1.05 | 0.356 | 0.425 | 45.4 |
| `KATANA_LIGHT_2` | 1.05 | 0.375 | 0.500 | 37.7 |
| `KATANA_LIGHT_3` | 1.05 | — | — | no sweep in reach |
| `KATANA_HEAVY` | 1.05 | 0.745 | 0.783 | 47.0 |
| `KATANA_HEAVY_2` | 1.05 | 0.375 | 0.429 | 52.2 |

`KATANA_LIGHT_3` reports no window, the same result `CLAW_LIGHT_3` gives from
the same vanilla name. `1hm_attackpower` is a lunge rather than a swept arc.
Re-run at 0.9, 1.2 and 1.4 m it still finds none, so the cause is the motion
rather than the reach. Its contact belongs on the body motion, as the claw's
does. Setting it is a tuning decision, not made here.

# Place asset-deliverability audit (Phase 11, Part 4)

Owner ask (2026-09-04): *"place descriptions call for dwellings built into
canyon walls, root galleries and all sorts. Were these written asset-aware?"*
This audits every **place** (buildings, structures, terrain-attached forms,
interiors) against what the vault can actually build. Creatures and items are
out of scope. Machine-readable verdicts:
`tooling/world-generation/output/asset-deliverability.json` — the per-region
fix agents consume that file, not this prose.

## 1. What we can actually build

**Built kits** (`tooling/asset-pipeline/pipeline/config/kits/`): flora, ground-
cover, hlaalu-domestic, imperial-keep, ruin-monumental, settlement-imperial,
settlement-mud, settlement-stilt, underwater. **Not built:**
`settlement-root-v1` and `settlement-dunmer-v1` (both Part 6 prerequisites,
decision 0041 touchpoint ①), and — new finding — **`dungeon-root-v1`**, the
interior kit the province's signature dungeon family silently assumes.

**Pools** (21, `world/sources/assets/registry-*.jsonl`, ~28k meshes). The ones
that decide place deliverability:

| Pool | What it delivers for places |
|---|---|
| vanilla Skyrim | 2,828 architecture + 3,130 dungeon-kit: caves 983, nordic 593, mines 521, imperial fort 435, dwemer 350, riften 150, ship 100; shackkit 58, farmhouse 159, docks, tents; forge/anvil/smelter/racks |
| BM&V (12,001) | `citebosmer` 271 — trunk-houses with interiors, balconies, lianas, giant trees, and a **full modular elevated-walkway system** (straights, junctions, 45°/90° curves, ramps); `telvanni`/`mushroomtower` 31 incl. root pieces; `philscaves` 54 modular cave; Stroti tree-house 106 and old-mill 40; huts, stilthouse, dockhouses, forts, gallows, windmill |
| Xanmeer Tileset (85) | Argonian terrace/interior kit, urns, containers |
| Ayleid Ruins Building Kit (195) + CC Ayleid (68) | monumental dressed stone, exterior and interior |
| HTBM Cipactli | `histroots01-06`, `histramp`, `histtree`, aztec/mayan blocks, underwater ruins, statuary, bamboo huts, `deadwhale`/`cipactlibones` |
| Mud Mother Grove (62) | mud shell, hero Hist, ritual/woven props, Argonian lights |
| Sirenroot + Depths of Skyrim | drowned ruin blocks, underwater dressing |
| Ships & Boats of Tamriel, Skyrim Ferries, RowBoats, canoe/ferry-raft | 51 hulls, plank ferries, rafts, poled craft |
| Tropical Skyrim (869) | flora only — **no architecture and no boats** |

**Permanent gaps** (`settlement-asset-inventory.json`): staked-dead markers,
working/industrial props (saltern, kiln, reed-cutting), buoyant causeways,
twin-hulled/reed craft, light emitters, no Skyrim DLC in the vault.

**Headline correction to the pessimistic reading.** Grown/root/canopy
architecture is **not** an art problem: BM&V's Bosmer tree-city gives
trunk-houses and a modular canopy walkway system, and HTBM gives Hist root
masses. It is a *kit-building* problem — the pieces exist, unpackaged.

## 2. Type verdicts (237 poi-scope types in `type-recipes.json`)

| Verdict | Count |
|---|---|
| deliverable | 198 |
| deliverable-if-rewritten | 30 |
| deliverable-with-sourcing (kit must be built first) | 8 |
| not-deliverable | 1 |

The 198 clean types are those whose whole `assetPlan` resolves to families
already in the vault and whose `summary`/`slots.props` promise nothing beyond
them; they are not listed individually (see the JSON). Everything else:

| Type | Verdict | Reason / fix |
|---|---|---|
| `battlefield-ground` | deliverable-if-rewritten | Carries the permanent grave-stakes gap. Describe stakes as plain driven poles (stockade pieces) plus cairns/totems. |
| `bereaved-village` | deliverable-if-rewritten | Carries the permanent grave-stakes gap. Describe stakes as plain driven poles (stockade pieces) plus cairns/totems. |
| `boatwright-yard` | deliverable-if-rewritten | Hull-on-stocks and steaming pits have no asset. Hull statics propped on scaffold; steaming pit as a dressed fire pit. |
| `bog-blight-ground` | deliverable-if-rewritten | grave-stakes gap; a pulled stake is the whole premise. Plain driven poles from the stockade pieces; one lying on the ground is a rotated instance. |
| `bog-iron-bloomery` | deliverable-if-rewritten | Carries gap.working-infrastructure (no kiln/saltern/reed-cutting meshes). Kitbash from vanilla smelter/forge/racks/carts and describe the works in those terms. |
| `bone-carriers-camp` | deliverable-if-rewritten | Carries the permanent grave-stakes gap. Describe stakes as plain driven poles (stockade pieces) plus cairns/totems. |
| `bone-repatriation-waystation` | deliverable-if-rewritten | Carries the permanent grave-stakes gap. Describe stakes as plain driven poles (stockade pieces) plus cairns/totems. |
| `bubble-spire-exit` | not-deliverable | A 'spire of hardened root and bubble' matches no mesh in any pool. REDEFINE the type: either a Telvanni pod/tower silhouette retextured to root, or retire the spire and make it a ground-level root-mouth terminus. |
| `cantemiric-velothi-site` | deliverable-with-sourcing | 43 northern records point at BM&V Velothi/Telvanni pieces that are not yet packaged as settlement-dunmer-v1 (decision 0041 touchpoint ① prerequisite). Build settlement-dunmer-v1 from the 288 BM&V Velothi/Telvanni pieces (Part 6 prerequisite). |
| `causeway` | deliverable-if-rewritten | The buoyant/flood-riding read has no asset (gap.causeway). Deliver as lashed-log and plank causeway on piles (passerelles + bridges + stockade); drop visible buoyancy. |
| `clay-pit-and-kiln` | deliverable-if-rewritten | No kiln mesh exists. Read the kiln from the vanilla smelter plus drying racks and fuel stacks. |
| `crystal-diggings` | deliverable-if-rewritten | 'Headgear' (pithead winding gear) has no mesh. Use vanilla mine scaffolding and a shored tunnel mouth instead of winding gear. |
| `dunmer-frontier-holding` | deliverable-with-sourcing | 43 northern records point at BM&V Velothi/Telvanni pieces that are not yet packaged as settlement-dunmer-v1 (decision 0041 touchpoint ① prerequisite). Build settlement-dunmer-v1 from the 288 BM&V Velothi/Telvanni pieces (Part 6 prerequisite). |
| `field-margin-city` | deliverable-with-sourcing | 43 northern records point at BM&V Velothi/Telvanni pieces that are not yet packaged as settlement-dunmer-v1 (decision 0041 touchpoint ① prerequisite). Build settlement-dunmer-v1 from the 288 BM&V Velothi/Telvanni pieces (Part 6 prerequisite). |
| `freed-worker-shelter` | deliverable-if-rewritten | Carries the permanent grave-stakes gap. Describe stakes as plain driven poles (stockade pieces) plus cairns/totems. |
| `gorge-wall-dwelling` | deliverable-if-rewritten | 'Dwellings cut into a gorge wall' implies an excavated facade kit we do not have. Doors/cave mouths set into the face plus shells built against it; interiors are cells. |
| `hammock-crown-terrace` | deliverable-if-rewritten | Carries the grave-stakes gap. Terraces from scaffold/stockade; stakes as plain driven poles. |
| `hist-grove-capital` | deliverable-with-sourcing | Depends on the unbuilt settlement-root-v1 for its grown dwellings. Build settlement-root-v1 before Part 6 (already a decision 0041 prerequisite). |
| `hist-less-refuge` | deliverable-if-rewritten | Carries the permanent grave-stakes gap. Describe stakes as plain driven poles (stockade pieces) plus cairns/totems. |
| `hist-village` | deliverable-if-rewritten | Carries the permanent grave-stakes gap. Describe stakes as plain driven poles (stockade pieces) plus cairns/totems. |
| `horwalli-waterworks` | deliverable-if-rewritten | Weirs and level basins have no mesh. Channel and basin as terrain/water; ayleid/xanmeer blocks for the built edges. |
| `houseboat-flotilla` | deliverable-if-rewritten | Built on twin-hulled platform canoes, which 6b's sweep proved unsourceable. Rewrite to keeled hulls moored abreast with lashed plank platforms between them. |
| `leviathan-bone-field` | deliverable-if-rewritten | No enterable rib-cage shell exists. Ribs as exterior landmark (HTBM deadwhale/cipactlibones); dwelling under, not inside. |
| `mass-grave-memorial` | deliverable-if-rewritten | grave-stakes gap. Cairns + totems substitute. |
| `morrowind-veterans-holding` | deliverable-with-sourcing | 43 northern records point at BM&V Velothi/Telvanni pieces that are not yet packaged as settlement-dunmer-v1 (decision 0041 touchpoint ① prerequisite). Build settlement-dunmer-v1 from the 288 BM&V Velothi/Telvanni pieces (Part 6 prerequisite). |
| `necropolis-village` | deliverable-if-rewritten | Carries the permanent grave-stakes gap. Describe stakes as plain driven poles (stockade pieces) plus cairns/totems. |
| `paddy-works` | deliverable-if-rewritten | Sluice gates and bunds have no dedicated mesh. Bunds from terrain; sluices kitbashed from vanilla dock/gate boards. |
| `plague-abandoned-village` | deliverable-if-rewritten | Carries the permanent grave-stakes gap. Describe stakes as plain driven poles (stockade pieces) plus cairns/totems. |
| `portage-slipway` | deliverable-if-rewritten | No greased slipway asset. Plank-and-roller slipway kitbashed from dock timber and scaffold. |
| `prison-ruin` | deliverable-if-rewritten | Carries the permanent grave-stakes gap. Describe stakes as plain driven poles (stockade pieces) plus cairns/totems. |
| `raft-village` | deliverable-if-rewritten | Same buoyancy problem as causeway. Lashed platforms moored to piles; no visible float motion. |
| `rebuilt-stilt-city` | deliverable-if-rewritten | Carries the permanent grave-stakes gap. Describe stakes as plain driven poles (stockade pieces) plus cairns/totems. |
| `root-hollow-gallery` | deliverable-with-sourcing | The province's signature dungeon family has no interior kit; its assetPlan lists azura-tree + hist-variants, which are tree meshes. Build dungeon-root-v1 (Part 6 prerequisite): philscaves/vanilla cave shell retextured to root, dressed with HTBM histroots01-06 + histramp and Telvanni root pieces. Repoint assetPlan. |
| `salt-pans` | deliverable-if-rewritten | No saltern asset; the pans are terrain and water, not meshes. Deliver pans as compiler-authored terrain/water geometry with fence, rake and store dressing. |
| `shipyard` | deliverable-if-rewritten | gap.working-infrastructure: no slipway or hull-on-stocks asset. Kitbash stocks/slipway from dock and scaffold pieces with an SBoT hull raised on them. |
| `shunned-daedric-ruin` | deliverable-with-sourcing | 43 northern records point at BM&V Velothi/Telvanni pieces that are not yet packaged as settlement-dunmer-v1 (decision 0041 touchpoint ① prerequisite). Build settlement-dunmer-v1 from the 288 BM&V Velothi/Telvanni pieces (Part 6 prerequisite). |
| `siege-earthworks` | deliverable-if-rewritten | Earthworks are terrain, not meshes. Compiler-authored banks and ditches; scaffold and fort pieces for the battery. |
| `wild-rootworm-burrow` | deliverable-with-sourcing | Same missing root-interior kit; a worm bore has no dedicated asset. Same dungeon-root-v1 kit; entrance from cave-mouth pieces ringed with hist roots. |
| `works-town` | deliverable-if-rewritten | Carries gap.working-infrastructure (no kiln/saltern/reed-cutting meshes). Kitbash from vanilla smelter/forge/racks/carts and describe the works in those terms. |

## 3. Interior families (`catalogue.py INTERIOR_FAMILIES`, 14)

| Family | Verdict | Tileset |
|---|---|---|
| `xanmeer-complex` | deliverable | Xanmeer Tileset + Ayleid kits + CC Ayleid interior |
| `flooded-cave` | deliverable | vanilla caves (983) + BM&V philscaves + Sirenroot/Depths water dressing |
| `smuggler-den` | deliverable | vanilla caves + riften wood + dock/clutter |
| `ayleid-nedic-ruin` | deliverable | Ayleid Ruins Building Kit + CC Ayleid |
| `imperial-fort` | deliverable | vanilla imperial fort (435) + Morrowind Imperial Keep |
| `shipwreck` | deliverable | vanilla ship kit (100) + SBoT hulls |
| `sinkhole-ruin` | deliverable | vanilla caves + Ayleid/xanmeer blocks |
| `dwelling` | deliverable | vanilla shack/farmhouse interiors, bamboo-hut `_int`, BM&V house interiors |
| `civic-hall` | deliverable | vanilla/BM&V interiors, Hlaalu, Imperial Keep |
| `burrow-warren` | deliverable-if-rewritten | vanilla mines + caves retextured to mud; no dedicated mud-burrow tileset — describe as shored earth, not sculpted burrow |
| `abandoned-plantation` | deliverable-if-rewritten | farmhouse + Hlaalu interiors + vanilla cellar; no field-processing interior props (working-props gap) |
| `kothringi-lilmothiit-site` | deliverable-if-rewritten | no Kothringi/Lilmothiit kit exists anywhere; deliver as scavenged/overbuilt Ayleid + vanilla cave, and keep the culture in the *dressing*, never the architecture |
| **`root-cavern`** | deliverable-with-sourcing | **no kit** — needs `dungeon-root-v1` (philscaves/vanilla cave shell + HTBM histroots + Telvanni root pieces) |
| **`hist-sanctum`** | deliverable-with-sourcing | same missing kit, plus the hero-Hist meshes for the centre |

## 4. Records with undeliverable claims (all 818 catalogue records scanned)

96 records flagged. Per region (flagged / total):

| Region | Flagged | Total |
|---|---|---|
| hist-heartland | 44 | 113 |
| naga-kur-deeps | 18 | 67 |
| imperial-fringe | 10 | 123 |
| dunmer-north | 8 | 141 |
| mercantile-coast | 7 | 140 |
| imperial-penal-south | 6 | 73 |
| saxhleel-coast | 3 | 101 |
| pirate-freeholds | 0 | 60 |

By claim: grave-stakes 41, grown-root-architecture 34, rootworm-bore 8,
buoyant-motion 6, kiln/saltern works 5, cliff-carved dwelling 3, giant-bone
dwelling 2, bubble-spire 1, hull-house 1. Each flagged record carries its
nouns and a concrete fix in the JSON's `records` map.

Two of these are **text-only** fixes (buoyant motion, cliff-carved facades);
the two big ones (grave-stakes, grown root) are *kit* fixes that leave most of
the prose standing once the kits are built and the wording is disciplined.

## 5. Categories to retire or redefine

1. **`bubble-spire-exit` — REDEFINE or retire.** The only genuinely
   unbuildable type. Nothing in any pool reads as a spire of hardened root and
   bubble. Either retexture a Telvanni pod/tower silhouette, or drop the spire
   and make the rootworm terminus a ground-level root-mouth.
2. **Root interiors are a category, not an exception.** `root-hollow-gallery`,
   `wild-rootworm-burrow`, the `root-cavern` and `hist-sanctum` interior
   families and 34 records all assume a root-walled interior. Their current
   `assetPlan` points at *tree* meshes, which cannot make a walkable interior.
   Build `dungeon-root-v1` and repoint them — do not retire them; the pieces
   exist.
3. **`kothringi-lilmothiit-site` should be redefined** as *reused* architecture
   plus culture-carrying dressing. No vanished-people kit exists and none can
   be sourced.
4. **The `works` branch needs its props re-derived** (shipyard, salt-pans,
   paddy-works, clay-pit-and-kiln, portage-slipway, bog-iron-bloomery,
   works-town): the industry must be described in vanilla forge/smelter/rack/
   cart/scaffold terms, or as terrain, not as dedicated machinery.
5. **Nothing that promises visible buoyancy survives.** Rafts, causeways and
   flotillas are static geometry; keep "lashed, moored, low to the water".

## 6. Sourcing shortlist

Nothing needs buying — this is packaging work, not acquisition. In priority
order:

| # | Job | From | Delivers |
|---|---|---|---|
| 1 | build `dungeon-root-v1` | BM&V philscaves + vanilla caves; HTBM `histroots01-06`, `histramp`; Telvanni `tel_ext_root_01/02`, `tel_root_03`; `treegiantrootbase01` | root-cavern, hist-sanctum, root galleries, rootworm burrows |
| 2 | build `settlement-root-v1` | BM&V `citebosmer` trunk-houses + `pass*` walkway system; Stroti tree-house; HTBM hist roots; Argonian props | the interior's grown dwellings (decision 0041 prerequisite) |
| 3 | build `settlement-dunmer-v1` | 288 BM&V Velothi/Telvanni/Redoran pieces | 43 northern records (decision 0041 prerequisite) |
| 4 | build a `works-v1` prop set | vanilla smelter/forge/anvil/grindstone/tanning rack/ore cart/mine scaffold + Mud Mother Grove fish rack and carapace oven | the whole works taxonomy branch |
| 5 | facade-front tagging | the ~25 placed meshes | correct building orientation at compile time |

Nexus ids for everything referenced here are in
`world/sources/assets/registry-summary.json`; BM&V is ModDB
(black-marsh-valenwood) and stays archived by design.

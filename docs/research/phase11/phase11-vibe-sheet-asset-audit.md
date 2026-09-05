# Phase 11 — vibe-sheet asset audit: tropicalisation, farmhouse overuse, Gideon's fort kit

Answers three owner notes on the Part 4 vibe sheets (2026-09-03). Read-only
audit; **no catalogue or kit file was changed**. Everything below is a proposal
for the lead agent to apply.

> **STATUS 2026-09-03 — partly applied.** S1/S2 sourced and kitted, T1/T2
> implemented and the two vanilla-backed kits rebuilt, aliases and inventory
> families added. See
> [settlement-kit-sourcing-log.md](../placement-settlements/settlement-kit-sourcing-log.md) entry 2 for
> what shipped and what is still open (the record-level alias swaps D1 /
> change-list items 4–7, the vibe-sheet re-render, and the pantile gap).

Inputs: `output/sheets/vibe/README.md` + `_frames/*/sheet.md` (which kit asset
each frame is), `world/sources/catalogue/asset-aliases.json`,
`world/sources/placement/settlement-asset-inventory.json`,
`tooling/asset-pipeline/pipeline/config/kits/*.json`, the vault's
`mod-sources/tropical-skyrim-33017/extracted`, and all 799 live catalogue
records (527 of which carry a plotted `plotFacts.regionClass`; the rest are
interiors/underwater records with no plotted landform — treated as lowland,
which is what Black Marsh is almost everywhere).

## 1. What Tropical Skyrim actually covers

**Tropical Skyrim (Nexus classic 33017, Soolie) ships NO architecture meshes.**
`extracted/Meshes/` contains only `Landscape`, `Plants`, `Terrain`, `actors`,
`effects`, `interface`. Architecture tropicalisation is **texture-only**, under
vanilla filenames, in six directories:

| tropical texture dir | files | what it retextures |
|---|---|---|
| `architecture/farmhouse` | 13 | farmhouse01 diffuse, roof01, thatch02/03, stonewall01/02, stonefloor01, woodwall01(+n), woodpost02, woodwalkway01, ivy01 — i.e. **every exterior-read surface** of the farmhouse set (13 of vanilla's 58; the other 45 are interior/banner/LOD) |
| `architecture/riften` | 56 | Riften plank/shingle/stone — the **dock** set's main texture source |
| `architecture/solitude` | 124 | Solitude stone/wood — the dock set's second source, plus farmhouse trim |
| `architecture/whiterun` | 172 | Whiterun city kit (walls, roofs, market stalls) |
| `architecture/markarth` / `windhelm` | 1 / 2 | negligible |
| `landscape/roads` | 11 | incl. `bridge01.dds` — the vanilla stone bridges |
| `dungeons/caves` + ridgedstone | 25 | cave/ruin stone |

Texture dirs each vanilla-backed alias actually references (read out of the
NIFs in `Skyrim - Meshes.bsa`, not guessed):

| alias | vanilla texture dirs used | tropical covers? |
|---|---|---|
| `vanilla-farmhouse` / `stables-yard` | `architecture/farmhouse` (520 refs), `architecture/solitude` (14) | **YES — full** |
| `docks-piers` | `architecture/riften` (52), `architecture/solitude` (34) | **YES — full** |
| `bridges` | `landscape/roads` | **YES** |
| `fences-wattle` | `architecture/farmhouse` + `clutter/stockade` | **PARTIAL** (wattle/stone yes, stockade no) |
| `signage-blank` | `clutter/signage` (147), `farmhouse`/`riften`/`whiterun` (54) | **PARTIAL** (posts/brackets yes, sign boards no) |
| `market-tents` | `architecture/tents` (8 files), city marketstalls (riften/whiterun/markarth) | **PARTIAL** (city stalls yes, the 4 tents no) |
| `vanilla-shackkit` | `clutter/stockade` (136), `dungeons/ships` (62) | **NO** |
| `stockade-scaffold` | `clutter/stockade` (264), farmhouse (16), riften (10) | **NO** (8 texture files) |
| `clutter`, `fishing-props`, `lights-general`, `bones-scatter`, `landmark-civic`, `boats-keeled`, `tents-hide`, `guar-pens`, `azura-tree` | `clutter/*`, `dungeons/*`, mostly BM&V | **NO** (small props; low visual salience) |

## 2. Lowland vs mountain use of vanilla-backed aliases

Mountain = `plotFacts.regionClass` ∈ {`border mountains`, `upland hills`};
everything else (and unplotted) is lowland. Counts are alias uses across all
live records.

| alias | lowland | mountain | unplotted | total | tropical variant exists? |
|---|---|---|---|---|---|
| `clutter` | 367 | 117 | 266 | 750 | no (prop-level, low priority) |
| `stockade-scaffold` | 150 | 50 | 109 | **309** | **NO — flagged** |
| `market-tents` | 96 | 33 | 68 | 197 | partial |
| `lights-general` | 96 | 38 | 62 | 196 | no (low priority) |
| `fences-wattle` | 101 | 21 | 64 | 186 | partial |
| `landmark-civic` | 85 | 45 | 52 | 182 | no (mostly BM&V) |
| `docks-piers` | 92 | 9 | 81 | 182 | yes — **not applied** |
| `vanilla-farmhouse` | 76 | 39 | 48 | **163** | yes — **not applied** |
| `signage-blank` | 55 | 21 | 50 | 126 | partial |
| `vanilla-shackkit` | 65 | 7 | 41 | **113** | **NO — flagged** |
| `boats-keeled` | 19 | 3 | 31 | 53 | no |
| `fishing-props` | 28 | 2 | 20 | 50 | no |
| `azura-tree` | 37 | 1 | 3 | 41 | n/a (BM&V) |
| `bridges` | 22 | 3 | 12 | 37 | yes — not applied |
| `guar-pens`/`tents-hide`/`bones-scatter`/`stables-yard` | 1 | 1 | 3 | 5 | n/a |

**Headline:** 1290 lowland + 910 unplotted alias uses run on un-tropicalised
vanilla textures today. Only **42 live records sit in `border mountains`** at
all (dunmer-north 12, imperial-fringe 25, pirate-freeholds 5) — so the
tropicalised look should be the **default**, and plain vanilla the exception.

The four that matter visually (whole buildings, not props):
`vanilla-farmhouse` **163**, `vanilla-shackkit` **113**, `stockade-scaffold`
**309**, `docks-piers` **182**.

### The build already has the mechanism

`pipeline/build_kit.py` fills a kit's textures per pool, "a pool's own textures
win, full stop", plus an explicit `textureAliases` escape hatch. Because
Tropical ships **vanilla filenames**, the fix is one config key, not a new kit
family:

> **Proposal T1** — add a kit-config key `textureOverlayPools: ["tropical"]`
> that inserts the tropical pool's texture sources *ahead of* the vanilla ones
> for pool `vanilla`. Set it on `settlement-imperial-v1`,
> `settlement-stilt-v1`, `settlement-mud-v1` and any future vanilla-backed kit.
> Zero record edits; deterministic; the un-overlaid build stays reproducible.
>
> **Proposal T2** — for the 8 un-covered `clutter/stockade` files (which carry
> `vanilla-shackkit` **and** `stockade-scaffold`, 422 uses), add
> `textureAliases` re-pointing `stockadeplanks01`/`stockadewood01`/
> `stockadeextra01` at Tropical's `architecture/farmhouse/woodwall01` and
> `woodpost02`. This is re-pointing an existing texture, not making art. If the
> tiling reads badly, source instead (see §5, "weathered plank" candidates).
>
> **Proposal T3** — mountain exception: add alias `vanilla-farmhouse-highland`
> (same family, un-overlaid kit) and apply it to the **16 farmhouse uses in
> `border mountains`** only. Upland hills in Black Marsh are still hot and wet
> (module 50 §33.1) and should stay tropicalised.

## 3. "Vanilla farmhouse in Archon, Alten Corimont AND Gideon" — verdict

**Not intentional, and worse than the owner saw.** `vanilla-farmhouse` is used
by **163 records in all eight regions**: imperial-fringe 45, dunmer-north 35,
mercantile-coast 29, imperial-penal-south 17, pirate-freeholds 16,
saxhleel-coast 14, hist-heartland 4, naga-kur-deeps 3. It is the catalogue's
**de-facto province-common building**, which is exactly what the signature-pool
table was written to prevent — and saxhleel-coast's own README row lists
`farmhouse` under **avoid**, yet 14 of its records (Archon included) use it.

The three flagged places today:

| place | region | assetPlan |
|---|---|---|
| Archon | saxhleel-coast | `vanilla-farmhouse`, `docks-piers`, `bmv-fort`, `vanilla-shackkit`, `bmv-stilthouse`, `passerelles-walkway`, `market-tents`, `argonian-lights`, `clutter`, `signage-blank` |
| Alten Corimont | pirate-freeholds | `vanilla-farmhouse`, `docks-piers`, `boats-keeled`, `market-tents`, `clutter`, `signage-blank`, `stockade-scaffold`, `vanilla-shackkit` |
| Gideon | imperial-fringe | `vanilla-farmhouse`, `bmv-fort`, `landmark-civic`, `signage-blank`, `clutter`, `market-tents`, `bridges`, `barsaebic-ayleid` |

**Proposal D1 — split the alias three ways so "Imperial-ish building" stops
being one asset.** All three resolve to the same inventory family
(`arch.imperial.farmhouse-civic`) but to different *kit slices*, so the sheets
and the compiler read differently:

| region | replace `vanilla-farmhouse` with | what it means on screen |
|---|---|---|
| `saxhleel-coast` (Archon) | **drop it** → `docks-piers` (tropicalised Solitude/Riften stone) + `bmv-stilthouse` + `vanilla-shackkit` + a new `imperial-customs-stone` slice (farmhouse `stonewall`/`stonefloor` pieces only, **no thatch shells**) | the sheet's own story: an Imperial **stone quay** with Argonian reed-and-stilt on top; no Nord thatch cottage anywhere |
| `pirate-freeholds` (Alten Corimont) | `vanilla-farmhouse-warehouse` — farmhouse **gable/warehouse shells only** (`farmlonghouse01`, `farmhouse05/06 destroyed01/02`), tropicalised, + `stockade-scaffold` + `boats-keeled` salvage | built out of other people's cargo: broken/patched big shells and ship timber, never an intact cottage |
| `imperial-fringe` (Gideon) | `imperial-civic` — a **real Imperial fort/civic kit** (§4), not farmhouses | masonry, a courthouse tower, tiled roofs; the Colovian border town it is written as |

This also restores the README's `avoid` columns: saxhleel-coast keeps its "no
farmhouse" rule, and the farmhouse family retreats to the two regions whose
signature pool legitimately names it (imperial-penal-south, dunmer-north farm
side) plus the pirate warehouse slice.

## 4. Gideon: the Morrowind-Imperial fort question

**What `bmv-fort` is today:** `arch.imperial.fort-wall` = BM&V's *griffon
fortress* (~80), *newcastle* (57), *rochester* (63), *largecastle* (9),
*seaview* (272). That is **medieval-European/Nordic castle**, not Imperial
Cyrodiil and not Morrowind-Imperial. It is also `status: have-unextracted` — no
kit is built from it yet, which is why the Blackrose sheet had to substitute
Ayleid ring-wall pieces. So Gideon is currently *Nordic-thatch + Nordic-castle*.

**Recommended source — the mod the owner means:**

| mod | Nexus | author | what to take | permissions |
|---|---|---|---|---|
| **Morrowind Imperial Keep Set (Remodeled)** | SSE **133090** | Tesak1243 | 171+ meshes: Imperial keep walls, towers, gates, battlements, 6 animated doors — the Morrowind Imperial fort language | modder's resource; **use with credit, not in paid mods**. No-porting-style clauses are acceptable per decision 0041 Q&A item 4. Confirm the page text at download time. |
| **Morrowind Hlaalu Architecture** | SSE **157997** | Angelio (uploaded by Kai4304) | premade Hlaalu house, prebuilt towers/walls/roofs, modular pieces with collision (no doors). Built *on* 133090 and retextured | modder's resource, credit required |

Both confirmed live via `api.nexusmods.com/v1/games/skyrimspecialedition/mods/{id}.json`
(published, available, category 82 = modder's resources).

**Verdict:** yes — **133090 is a better Gideon than the farmhouse set**. It
gives the squat courthouse tower and Imperial masonry the sheet's caption
already asks for, and it is *culturally* right for a Black Marsh/Morrowind
border province in a way Whiterun-adjacent thatch never is. Take it as the
Gideon/Blackrose civic-and-fort kit; keep `bmv-fort` for the **penal** south
(Blackrose's blunt robbed-stone fortress reads fine as generic castle) so the
two Imperial regions stop sharing one silhouette.

**Red pantile roofs** (README's noted gap): 133090/157997 are Morrowind-Imperial
slate/stone, not Cyrodiil pantile. Nothing in the vault covers it. Candidates,
in order — all need a permissions read before download:

| candidate | Nexus | note |
|---|---|---|
| Cyrodiil Farmhouse Tileset | classic **48582** | Beyond-Skyrim-affiliated; 4 models + windmill, interiors; permissions explicitly allow use-with-credit, retexture, mesh edits and porting. **Thatch, not tile** — good for the Colovian *rural* fringe, not the roofs |
| Rally's City Roofs | SSE **20896** | roof-tile texture work over vanilla city meshes — a cheap tile *texture* route |
| Better Towns Textures | classic **46121** | makes Falkreath read as an imperial town with stone walls + tiled roofs |
| The Imperial City of Cyrodiil by M7 | classic **64576** | location mod, not a resource — reference only |

**Recommendation:** ship Gideon on 133090 (+157997 for the domestic tier) and
treat red pantile as a **texture** problem, not a mesh one — i.e. try Rally's
City Roofs / Better Towns Textures over the keep-set roofs before sourcing a
whole new tileset. If the owner wants a true Cyrodiil town, the Beyond Skyrim:
Cyrodiil resource releases (Colovian/Nibenese tilesets) are the next lead; none
surfaced as a standalone SE resource in this search.

## 5. Concrete change list (for the lead agent)

**Kit/build (no record edits):**
1. `textureOverlayPools: ["tropical"]` on `settlement-imperial-v1`,
   `settlement-stilt-v1`, `settlement-mud-v1` + the key in `build_kit.py`. (T1)
2. `textureAliases` for the 3 `clutter/stockade` diffuse+normal pairs → Tropical
   `farmhouse/woodwall01`, `woodpost02`. (T2)
3. Re-render the eight vibe sheets from the overlaid kits before the next owner
   review — the current sheets show the *grey vanilla* farmhouse, which is a
   large part of why they read as Skyrim.

**Alias registry (`asset-aliases.json` + inventory families):**
4. Add `vanilla-farmhouse-highland` → `arch.imperial.farmhouse-civic`
   (un-overlaid). Apply to the 16 `border mountains` farmhouse records only.
5. Add `vanilla-farmhouse-warehouse` → same family, warehouse/destroyed slice.
   Apply to pirate-freeholds' 16 farmhouse records.
6. Add `imperial-customs-stone` → same family, stone-only slice. Apply to
   saxhleel-coast's 14 farmhouse records (Archon first); remove
   `vanilla-farmhouse` there entirely to honour the README `avoid` row.
7. Add `imperial-civic` → **new** family `arch.imperial.morrowind-keep`
   (pool `mwkeep`, SSE 133090). Apply to imperial-fringe's 45 farmhouse
   records, Gideon first.

**Sourcing (owner's Nexus premium key; record source + SHA256 + README credit
in the same change, per the golden rule):**

| # | mod | id | take | licence |
|---|---|---|---|---|
| S1 | Morrowind Imperial Keep Set (Remodeled) | SSE 133090 | full mesh set → new pool `mwkeep`, kit `settlement-imperial-civic-v1` | credit; no paid mods |
| S2 | Morrowind Hlaalu Architecture | SSE 157997 | house/tower/wall/roof modules → same kit, domestic tier | credit |
| S3 | Rally's City Roofs *or* Better Towns Textures | SSE 20896 / classic 46121 | tile-roof textures for the pantile gap | check page |
| S4 | Cyrodiil Farmhouse Tileset | classic 48582 | optional rural Colovian shells for imperial-fringe hamlets | credit; porting allowed |

**Docs to update when applied:** catalogue README signature-pool table
(imperial-fringe → `imperial-civic`; the saxhleel-coast farmhouse violation),
world module 90 §74.1a (Tropical is architecture-**texture**-only; how the
overlay works), and the vibe-sheet README's Gideon/Alten Corimont/Archon text.

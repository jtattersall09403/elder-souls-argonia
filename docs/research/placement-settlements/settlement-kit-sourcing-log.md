# Settlement kit sourcing log — Phase 11 Part 0 item 6b

**Delivered 2026-09-02** against decision
[0041](../../decisions/0041-phase11-settlement-decisions.md) Part 0 item 6b, from
the gap list in [settlement-asset-inventory.md](settlement-asset-inventory.md)
(that file and its JSON twin are owned by the inventory agent — this log records
only what was *downloaded, registered and kitted*).

Archives live in the vault (`mod-sources/archives/`), never in git. Every pool
below is credited in the root [README](../../../README.md) § Credits and checked
mechanically by `python3 -m worldgen.check_credits`.

## What was downloaded

| Mod | Nexus | Version | sha256 (first 16) | Pool | Verdict |
|---|---|---|---|---|---|
| Mud Mother Grove — An Argonian Mud Hut (GeminiVoid) | SSE 146557 | 1.5.1 | `7ac552437eeac11f` | `mudmother` | **the find of the pass** — 62 meshes incl. `MudHut01`, `ThatchRoofing`, `RoundFloor01`, woven furniture/fences, tents, carapace oven, fish rack, totem, bone chime, Sithis shrine and **`HistTree` (27 × 28 × 22 m)** |
| Skyrim Ferries (Mharlek1; meshes by yamadori) | SSE 109843 | 1.4.1 | `2fb9aae7ba870042` | `ferries` | 89 meshes; `plank_ferry_swamp_01/03` + `rowboat_ferry_swamp_01` are our first keel-less hulls. **Caution:** `plank_ferry_swamp_02/04/05/06` are editor markers with no geometry |
| RowBoats and Oars of Skyrim (PraedythXVI) | SSE 35341 | Final | `9edfe3ebe786a00f` | `rowboats` | 3 meshes (rowboat, animated rowboat, oar) — keeled, so **Imperial fringe only** |
| Creation Club Ayleid Ruin Resources (SarthesArai) | SSE 83999 | 1.0 | `03f9203f14744f48` | `ayleidcc` | 68 meshes, **all interior modules** — does *not* close the stepped-pyramid exterior gap |
| Xalfek — An Argonian Home (DexMods) | SSE 55595 | 1.0 | `e341443b7de89f1a` | `xalfek` | 72 interior prop/furniture meshes (bundled modder resources) |
| Darkwater Den (Elianora) | classic 52630 | 1.2 | `60a2ec29e6348b13` | `darkwater` | 123 organic-interior clutter meshes (bundled modder resources) |
| Marsh-Rest (Konrann) | classic 50111 | 1.01 | `bea64fc2e213a1e8` | *none* | **Downloaded, deliberately not registered:** ESP-only player home built entirely from vanilla assets. It contributes no meshes, so it gets no pool and no credit line. |

Full metadata (file ids, sizes, hashes, upload names) is cached in the vault at
`mod-sources/api/<modId>-mod.json` / `-files.json`.

## Gap status after this pass

| # | Gap | Status |
|---|---|---|
| 1 | No modular mud-hut kit | **closed enough for v1** — one mud shell plus thatch, deck, fences, tents, furniture and props that read as one culture. Still a *shell*, not a modular wall kit; instance variety must come from dressing and rotation |
| 2 | No stepped-pyramid xanmeer exteriors | **still open** — CC Ayleid is interior-only. Check the vault's own xanmeer mod before buying anything else |
| 3 | No Argonian cultural props | **largely closed** — totem, bone chime, painted urn, pottery, woven furniture, carapace oven, fish rack, Sithis shrine. **Grave-stakes remain absent** |
| 4 | No rafts or canoes | **closed for rafts, open for canoes** — 2 poled plank rafts + 1 swamp rowboat. No dugout or twin-hulled platform canoe |
| 5 | No Hist tree asset | **closed** — `mudmother:gv_meshes/argoniannest/histtree` |
| 6 | Thin working/industrial props | **partly** — fish rack and carapace oven only; no saltern, kiln or reed-cutting gear |
| 9 | BM&V archived | **not a blocker** — `RarSource` pulls single members from `Data1.rar`/`Data2.rar` on demand (~0.1 s each), so no bulk extraction was needed or done |

## The kits

Three configs, not one, because
[material-culture.md](../../../world/sources/lore/topics/material-culture.md)
forbids blending the building cultures in a settlement — separate kits make the
blend impossible by construction rather than by a placement rule:

| Kit | Culture | Assets | GLB |
|---|---|---|---|
| `settlement-mud-v1` | Shadowfen mud/wattle | 33 | 19.2 MB |
| `settlement-stilt-v1` | Murkmire reed/stilt (passerelles + shackkit) | 26 | 14.0 MB |
| `settlement-imperial-v1` | Imperial/foreign stone-timber | 11 | 8.1 MB |

Configs: `tooling/asset-pipeline/pipeline/config/kits/settlement-*-v1.json`.
Outputs land in `tooling/asset-pipeline/output/kits/` (gitignored — rebuild with
`python3 -m pipeline.build_kit --kit <id>`).

### Vet results, and how to read them

`python3 -m pipeline.vet_kit output/kits/<kit>.kit.json` is clean apart from:

- **one untextured material** on `argonianbonechime01` (an anonymous sub-mesh);
- ~30 **"pivot above base"** findings across all three kits. These are
  **expected and not defects**: `vet_kit` was written for flora, which is
  bottom-anchored to terrain. Architecture kit pieces snap to the 3.64 m grid
  around a *centred* pivot — a dock straight and a passerelle section are
  *supposed* to have their origin mid-height. The settlement compiler must place
  kit pieces by grid transform, never by the flora bottom-anchor path.

Excluded after vetting, with reasons recorded in each config's description:
`wovenfence01` and `argonianbonechime02` (no renderable geometry),
`chitinchair01` (needs Dragonborn DLC textures the vault does not hold),
`plank_ferry_swamp_02/04/05/06` (editor markers).

## Rounds 2–5 (owner-driven, 2026-09-02)

Owner rulings that unblocked this: **"no porting to other games" clauses are
APPROVED** — we are a standalone Skyrim conversion for private personal use,
credited as such. Owner **selectivity directive**: take only what closes a
recorded gap or beats what we hold; every mod taken is a permanent
credit/provenance/pipeline liability. "Nice but redundant" is a skip.

### Sourced (registered as pools, credited in root README)

| Mod | Nexus | Ver | sha256 (16) | Pool | Why it earned its place |
|---|---|---|---|---|---|
| **Here There Be Monsters — Sign of Cipactli** (Araanim) | SSE 35933 | 2.92 | `c44da49e52ae68d4` | `htbm` | **The find of the whole pass.** 1,579 registered meshes incl. purpose-built *Black Marsh* content: Argonian bamboo huts + interiors + door, wicker furniture family, Kothringi stilt platform and Tamu wood dock/plank family, and a 57-piece xanmeer ruin set with the ORNAMENT the Ayleid kit lacks (feathered-serpent and serpent-sigil statues, goddess statue, gargoyle, runic stone, totems, skull stack) |
| **Ayleid Ruins Building Kit -Resources-** (Imperial Society) | classic 90667 | 001 | `5f465b70c2f04cca` | `ayleidkit` | 85 **exterior** monumental pieces — blocks, quad blocks, stairs, statue walls, bridges, towers. Unblocked by the clause ruling |
| **Skyfall's Sleeping Hist Tree Overhaul** (Skyfall515 et al.) | SSE 116792 | 1.4 | `1b7f3e3149f2db87` | `histtree` | A second hero-Hist mesh (18×24×16 m) + Hist flowers, **rock cairns and a rune circle** — the closest thing to grave-stakes anyone has |
| **Script free ship sailing** (ElstarTomas; canoe by FrankFamily) | classic 67727 | 2.3 | `f13d0875fcc258bf` | `canoe` | `canoe1.nif` — the only genuine canoe mesh located anywhere. Unblocked by the clause ruling |
| **Solitude (ghost) Ferry** (Syntia) | classic 89948 | 1.1.00 | `5345ab860dbd0d3a` | `ferryraft` | `ferryraft01.nif` — an actual poled raft. The owner's lead paid off, though the mod is not what its name suggests |
| **Ships and boats of Tamriel** (ThatShipGuy) | SSE 41653 | 1.2 | `1bd5c3fac0d5c032` | `sbot` | The two **flat-bottomed Cyrodiilic ferries** + rowboat for the Imperial fringe; wrecks and ship interiors as a bonus. Also supplies Bretic textures other pools reference |
| **Depths of Skyrim** (TheBlackpixel) + **Mesh fixes** (Gobsnek) | SSE 26913 + 174995 | 1.1.7 / 1.0.0 | `45256b8e537d48e1` / `81b0e11d6b49e9d1` | `depths` | Reef/bed flora for the drowned layer. **The 174995 fixed meshes are overlaid over the base at unpack time**, so the pool only ever exposes the corrected versions |
| **SIRENROOT — Deluge of Deceit** (Everglaid) | SSE 70917 | 1.30 | `c1ba1454928262e3` | `sirenroot` | Free-standing broken/hollow ruin blocks and **walkable rubble floors** — a submerged ruin the player can stand in — plus water-caustic meshes |

### Evaluated and skipped (all downloaded and opened — verdicts are from mesh lists, not descriptions)

| Mod | Nexus | Verdict |
|---|---|---|
| **Hovelmud** (owner lead) | SSE 63329 | **Not a mud hut.** It is Stroti's *Mushroom House* kit — fungal/Telvanni idiom, which material-culture puts off-limits inland, and BM&V already bundles the same Stroti mushroom material |
| Sailboats — Script Free Sailing EXPANDED | SSE 40057 | 8 hulls, all keeled and sailed. The canoe the research promised is **not** in v2.0 — it is in 67727, which we took |
| Boats — Operational Animated Travel (owner lead) | SSE 110882 | 3 unique meshes, all vicn "boat carrier" rigs around the vanilla rowboat. It is a travel-script mod |
| Cyrodiil Ship and boat resource | classic 59426 | Rowboat + 2 broken variants + an Imperial ship — all superseded by SBOT |
| L.V.X Magick's — Boats (owner lead) | SSE 36149 | 31 meshes, but every one is a variant/retexture of the vanilla keeled rowboat plus sailboats. A rowboat "construction kit" is the only novel item; noted as a fallback if a custom hull is ever needed |
| Various Immersive Rowboats | SSE 98215 | 3 vanilla-path replacers |
| Of Ships and Boats | SSE 57673 | 578 MB for 4 meshes, all large ships |
| DK's Lore-Friendly Ships and Boats Vol. 1 | classic 75965 | 4 Nord ships; SBOT is the same author's superset |
| Underwater Treasure (owner lead) | SSE 17267 | **ESP only, zero meshes.** Design note worth routing to the quest side: it scatters underwater chests across sea, rivers and lakes as pure diegetic discovery with no markers — exactly the §12.3b "reward for effort" pattern for our drowned layer |
| Wreck of the Crown Petone (owner lead "northern Argonian settlement") | classic 86156 | Mislabelled: a Jokerine NPC/quest mod on a vanilla shipwreck. No reusable statics |
| Marsh-Rest (round 1) | classic 50111 | ESP-only, vanilla assets |

### The systematic boat sweep

Swept Nexus v2 GraphQL over both game domains for raft, canoe, punt, skiff,
barge, coracle, dugout, boat, ship, rowboat and fishing boat, ranked by
endorsements, then **downloaded and opened the six credible shortlist entries**
rather than judging from descriptions. Conclusion, stated plainly:

- **The Nexus boat scene is almost entirely retextures and replacers of one
  vanilla keeled rowboat.** `canoe`, `dugout`, `punt`, `skiff`, `coracle` and
  `barge` return *zero* mod names in either domain.
- The only genuinely keel-less or flat-bottomed hulls in existence, all now in
  the vault: `canoe1` (67727), `ferryraft01` (89948), the two Cyrodiilic
  ferries (41653), and `plank_ferry_swamp_01/03` (109843).
- **Twin-hulled platform canoes and reed boats do not exist.** That sub-gap has
  no Nexus answer and needs an owner steer if it must be closed.

**Tropical Skyrim tropicalised-boat check (owner idea, free):** it ships **no
boat or ship meshes and no boat textures at all** — the only "ship" file in the
whole mod is `textures/architecture/whiterun/wrshippanel01.dds`, a building
panel. The free-win does not exist; background moorings must use the sourced
hulls. (Consistent with the inventory's note that Tropical Skyrim contains no
architecture meshes, only textures.)

### Blocked, recorded rather than skipped silently

- **Both r/skyrimmods threads are unreachable from this VM.** `reddit.com`,
  `old.reddit.com`, `api.reddit.com` and the `.json` endpoint all return 403,
  from the fetch tool and from curl, for both the "Best mods for Argonians" and
  "Looking for Argonian based mods" threads. Covered the *intent* instead with a
  ~60-term Nexus API sweep plus a web search of the thread's contents. If the
  owner wants them covered literally, they will need to paste the text.
- **"Argonian Exports" (Steam Workshop 189297755, ServoBilly)** — removed from
  the Workshop for guideline violations; renders only for its uploader. No Nexus
  mirror exists under the mod name, the vessel name ("Saxheel") or the author.
  Payload was ~2 props (an Argonian urn, an "earthen door") we already better.

### What the Argonian mod scene actually contains

Worth recording so nobody sweeps it again: **essentially all of it is race,
body, texture, hair, tail, follower and armour content.** Architecture and props
exist in exactly three places — the Xanmeer Tileset (held), Mud Mother Grove
(held) and Here There Be Monsters (now held). Equipment finds were recorded to
[90-asset-strategy §75.1](../../world/90-asset-strategy.md) rather than sourced,
per the owner's Phase-11 scope rule.

### Gap status after rounds 2–5

| # | Gap | Status |
|---|---|---|
| 1 | Mud-hut / dwelling variety | **closed** — Mud Mother Grove's mud shell + HTBM's two bamboo huts + BM&V's shells now clear the 25 %-per-template quota |
| 2 | Xanmeer exteriors and ornament | **closed** — Ayleid kit for massing (blocks/stairs/statue walls), HTBM for ornament (serpent statues, goddess, gargoyle, runic stone, pyramids) |
| 3 | Grave-stakes / burial markers | **substitute found, exact asset still absent** — Skyfall's rock cairns and rune circle. No staked-dead mesh exists on Nexus |
| 4 | Argonian cultural props | **closed** — Mud Mother Grove + HTBM wicker family + xanmeer urns/pots |
| 5 | Hist tree | **closed with variants** — two distinct hero-Hist meshes (Mud Mother Grove, Skyfall) + flowers + LOD |
| 6 | Working/industrial props | **still open** — a fish rack and carapace oven only. No saltern, kiln or reed-cutting gear exists |
| 7 | Rafts / canoes | **closed for rafts and canoes** (canoe1, ferryraft01, 2 ferries, 2 plank rafts); **twin-hulled platform canoes and reed boats remain impossible to source** |
| — | Drowned / underwater layer | **newly served** — reef flora, walkable submerged rubble, water caustics |

## Pipeline changes this required

- `pipeline/bsa.py` now reads **BSA v105** (SSE): 24-byte folder records and
  LZ4-frame blocks. Three of the seven mods ship v105 archives, so this was a
  root-cause fix rather than an unpack-by-hand workaround. Adds an `lz4`
  dependency, imported only on the v105 path.
- `pipeline/build_kit.py` resolves extracted-directory pools from one table
  instead of an `if` per mod.
- `pipeline/bsa.py` also reads **v103** (Oblivion-era) archives, which some
  classic-Skyrim mods still ship.
- `pipeline/build_kit.py` gained a **sibling-texture-pool** table: SIRENROOT is
  a Creation Club *Ayleid* resource whose ruin blocks reference CC texture paths
  it does not ship but our two Ayleid pools do, and Depths of Skyrim references
  Bretic ship textures that SBOT ships. Without it those pieces export as grey
  slabs. Both pools are credited in every case.
- Mud Mother Grove's `Data/` wrapper is **flattened at unpack time**. Nested
  layouts silently export every material untextured, because Blender resolves a
  NIF's texture paths relative to the folder above `meshes/` — this cost a full
  rebuild to find and is now written into the pipeline README.

---

# Entry 2 — Phase 11 Part 4: the Imperial civic tier (Gideon) and tropicalisation

**Delivered 2026-09-03**, against the findings in
[phase11-vibe-sheet-asset-audit.md](../phase11/phase11-vibe-sheet-asset-audit.md) §4 (S1,
S2) and §5 (T1, T2). Answers the owner's note that Gideon, Archon and Alten
Corimont all read as the same Nordic thatch village.

## What was downloaded

| Mod | Nexus | Version | Archive sha256 | Pool | Verdict |
|---|---|---|---|---|---|
| Morrowind Imperial Keep Set (Remodeled) (Tesak1243) | SSE 133090 | 1.0 | `d22974919cdd3d6cea25f2b0b0851f2cb636a7569b7c3d1f8ae7b34c8584b9c0` | `mwkeep` | **164 meshes, all architecture.** A complete Morrowind-Imperial fort language: curtain walls with gate/corner/destroyed variants, wall stairs, big+small stackable towers (base/shaft/top), two keep blocks, guard towers, foundations, plaza, low stone yard walls, ledges and steps, river bridges and stone docks, stables, civic clutter, rubble variants, plus interior hall/room/spiral-stair modules and 8 animated doors |
| Morrowind Hlaalu Architecture (Angelio, uploaded by Kai4304) | SSE 157997 | v2.0 | `c32811d704f25d33fe421e20d1258a965232c6fafc530a2f99d95c1f74c8cad7` | `hlaalu` | **127 meshes.** Premade and modular Hlaalu houses, a base/middle/top tower stack, yard/street walls with broken variants, steps, awnings, fences, stone blocks, small bridges, dockside cranes and lamp posts. Bundles other credited resources (Tamriel-Rebuilt-style walls, Oaristys props) and a `MorrowindImperialFort/` folder that duplicates 133090 |

Permissions checked via `/v1/games/skyrimspecialedition/mods/{id}.json`: both
`published` + `available`, both category 82 (modder's resources), credit
required, no clause forbidding use in a public non-commercial work. Archives
live in the vault at `mod-sources/morrowind-imperial-keep-133090/` and
`mod-sources/morrowind-hlaalu-157997/`; both ship a `Data/` wrapper, flattened
at unpack time so `meshes/` and `textures/` are siblings (the failure mode
recorded in entry 1).

## Kits built

| Kit | Pieces | GLB | Notes |
|---|---|---|---|
| `imperial-keep` | **88** of 164 | 20.6 MB | Exterior silhouette set only — interior hall/room modules and the animated doors are left in the pool for a later interiors pass. 0 textures missing, 0 conversion failures |
| `hlaalu-domestic` | **68** of 127 | 21.1 MB | The `Ruins/`, `Winterhold/`, `Seaview/`, `Sheogorad Ressource/` and `Redoran/` folders are Nordic or interior filler and are excluded. 0 textures missing, 0 conversion failures |

Neither kit is tropicalised: the sets are Morrowind slate-and-ashlar, which
reads correctly in a hot climate, and the damp/vine pass belongs to scatter.

New inventory families `arch.imperial.morrowind-keep` and
`arch.imperial.hlaalu-domestic`; new catalogue aliases `imperial-keep` and
`hlaalu-domestic`. **Applying them to records is a separate job** — the
catalogue's imperial-fringe records still name `vanilla-farmhouse` (audit
proposal D1 / change-list item 7).

## Tropicalisation — the mechanism (audit T1/T2)

Tropical Skyrim ships **no architecture meshes**; its tropicalisation of the
farmhouse/dock/bridge/city sets is textures under **vanilla filenames**. So the
fix is a build-config key, not a parallel kit family:

- **`textureOverlayPools: ["tropical"]`** (new, `pipeline/build_kit.py`) inserts
  the overlay pool's own texture directory **ahead of the vanilla fallback** in
  every pool's search order. A pool's *own* textures still win, so a sourced mod
  keeps its authored look and only the pieces that would have fallen back on
  vanilla art get tropicalised; for the `vanilla` pool itself that is the whole
  kit. Deterministic, zero catalogue edits, and removing the key rebuilds the
  un-overlaid kit byte-for-byte.
- **`textureAliases`** (existing key) re-points the shack kit's four
  `clutter/stockade` plank/wood diffuse+normal files — which Tropical does not
  cover, and which 422 alias uses depend on — at Tropical's farmhouse
  `woodwall01`/`woodpost02`. Re-pointing an existing texture, not new art.

Applied to and rebuilt: **`settlement-imperial-v1`** (farmhouse + Solitude dock
family) and **`settlement-stilt-v1`** (vanilla shack kit). `settlement-mud-v1`
was **not** overlaid — it contains no vanilla-pool assets, so the key would be a
no-op. There is no `bridges` kit yet; the vanilla bridge meshes are aliased in
the catalogue but not yet in any kit, so tropicalising them is deferred to
whichever kit first carries them.

**Mountain variant:** no `vanilla-farmhouse-mountain` alias was added. Only 42
live records sit in `border mountains`, nothing in the pipeline consumes a
second kit id, and the un-tropicalised look is simply the **same kit built
without `textureOverlayPools`** — i.e. it is a build variant, not an asset
family. Add the alias only when a compiler actually needs to select between two
built GLBs.

## Still open from the audit

- Red Cyrodiil pantile roofs (audit §4) — treat as a texture problem; Rally's
  City Roofs / Better Towns Textures not yet evaluated.
- The record-level alias swaps (audit D1, change-list items 4–7).
- **Done 2026-09-03:** the vibe sheets were re-rendered from the overlaid kits
  (Gideon rebuilt on `imperial-keep` + `hlaalu-domestic`; Archon's farmhouse
  dropped; Alten Corimont tropicalised). The montage step is now a committed
  tool — `tooling/asset-pipeline/pipeline/vibe_sheet.py` with the frame/caption
  spec in `pipeline/config/vibe-sheets.json` — so the sheets are reproducible
  rather than one-off.

## Entry 3 — the three kits the deliverability audit named (2026-09-04)

**Nothing was downloaded.** All three are *packaging* jobs against pools already
in the vault, exactly as
[place-asset-deliverability-audit.md](place-asset-deliverability-audit.md) §6
predicted. No new pool, so no new credit line is due; BM&V (ModDB), Here There
Be Monsters — Curse of Cipactli (SSE 35933) and Mud Mother Grove (SSE 146557)
are already credited in the root README.

| Kit | Assets | Built from | Delivers |
|---|---|---|---|
| `dungeon-root-v1` | 124 | BM&V `philscaves` (46) + `citebosmer` **interior** modules (41) + `telvanni` root/interior (12); HTBM Hist roots (15); Mud Mother ritual/light (10) | `INTERIOR_FAMILIES` **`root-cavern`** and **`hist-sanctum`** outright; backs `dwelling` / `civic-hall` inside grown-root settlements |
| `settlement-root-v1` | 140 | BM&V `citebosmer` trunk-houses (42) + the **complete** `passerelles` walkway system (52) + `kiosque` (8) + host trees (15); HTBM roots (7); Mud Mother props (17) | `hist-grove-capital`, `hist-village` canopy tiers, `hammock-crown-terrace`, every elevated walkway |
| `works-v1` | 85 | vanilla forge/smelter/racks/carts/mine timbers/stockade scaffold/water wheels/dock + Mud Mother oven, racks, fences | the whole works taxonomy branch (`shipyard`, `salt-pans`, `paddy-works`, `clay-pit-and-kiln`, `portage-slipway`, `bog-iron-bloomery`, `works-town`, `crystal-diggings`) |

**Each set is packaged in its OWN snap logic**, written into the new `snapLogic`
key of each kit config (ignored by the builder, read by whoever lays pieces
out). The three that matter:

- **`passerelles`** encodes its grid in its filenames: `passl<len>[h<rise>]<d|i>01`
  — `len` and `rise` are Bethesda units, `d`/`i` the two authored handrail sides,
  which must stay consistent along a run. Measured against the built manifest:
  `l64/128/256/512` → 1.07 / 1.98 / 3.80 / 7.44 m of deck (3.03 m wide), `h64` →
  +0.92 m, `h128` → +1.82 m. Arcs come in three fixed radii (448 / 576 / 1280 u)
  and chain only with their own radius; `passl256h64startd01` is the authored
  start of a climb.
- **`citebosmer` interiors** stack by storey code — `rc` ground, `et` upper, `ss`
  basement — one floor shell per storey with `intwall`/`intwindow` panels
  substituted round the perimeter and the `gland` trapdoor family as the stair.
  `15v`/`45v` are the champ house's authored wall tilts: pick one family per shell.
- **`philscaves`** is a two-tier Morrowind-style cave set (`small` and `srooms`)
  that butts end-to-end at open faces; cross tiers only through `srooms/connect`.

**Two build fixes were needed.** (1) BM&V's Telvanni pieces UV Dragonborn paths
(`textures/dlc02/architecture/telvannitower/*`) and **the vault holds no DLC**, so
all twelve exported grey; `dungeon-root-v1` `textureAliases` redirects those (plus
two Earrindo and two Stroti wood paths BM&V also fails to ship) to BM&V's own
Bosmer bark `eressea/architecture/citesylvestrepactevert/bark0143`. That *is* the
audit's "retexture the Telvanni silhouette to root", done as a config alias rather
than new art. All three kits now report **zero missing textures**. (2)
`housetroncbalcon001` carries no exportable geometry (editor marker) and is
excluded; `housetroncbalcon15v001` is the usable trunk balcony.

`works-v1` is tropicalised (`textureOverlayPools: ["tropical"]` + the same
`clutter/stockade` alias redirect as `settlement-stilt-v1`) because nearly every
piece is vanilla-backed. The two root kits are **not** — they contain no
vanilla-pool assets, so the overlay would be a no-op.

**Still not deliverable, and not sourceable:** kiln, saltern, sluice-gate,
pithead winding gear and hull-on-stocks meshes. `works-v1` is the agreed
substitution vocabulary for them (audit §5.4) — smelter+coal+firewood reads as
the kiln, `walkwaycwallgate01/02` as the sluice, scaffold + `minewoodbeam`
rollers + dock steps as the slipway. Place prose must be written in those terms.
Grave-stakes remains a permanent gap. `settlement-dunmer-v1` (shortlist #3) is
**not** built — still a Part 6 prerequisite.

Registered as inventory families `arch.argonian-root.dungeon-interior`,
`arch.argonian-root.settlement` and `prop.neutral.works-and-industry`; catalogue
alias slugs `dungeon-root`, `settlement-root`, `works-props` now point at them,
and `worldgen.catalogue` gained a check that every alias **target** exists in the
inventory (slug presence alone was checked before, so dangling targets survived).


## 2026-09-04 — orphan pools and the boat/dock/xanmeer-interior round

Three mods sat in the vault with no `Pool` row, so nothing in the world could
reach them and a sourcing sweep could not see them. All three registered,
credited in the root README with archive sha256s, and their extracted trees
normalised to Bethesda data roots (`meshes/` at the root of `extracted/`; the
FOMOD and resource wrappers moved to `fomod-source/` / `resource-source/`
siblings, which is why `build_kit`'s `dir_pools` needs no special case):

| Pool | Mod | Meshes | Outcome |
|---|---|---:|---|
| `sailboats` | Sailboats — Script Free Sailing EXPANDED SSE (SSE 40057, Araanim) | 8 | eight keeled sailing hulls incl. furled-sail variants → `watercraft-v1` |
| `impships` | Cyrodiil Ship and boat resource (classic 59426, Markus Liberty/Tellmann, Beyond Skyrim) | 5 | galleon hull + separate masts + rowboat with two broken variants; **closes the shipyard hull-on-stocks gap** |
| `boatsanim` | Boats — Operational Animated Travel (SSE 110882, Enneal; Vicn meshes) | 4 | registered and credited, **not kitted**: an editor marker is baked into each hull |

`impships` duplicates meshes BM&V already bundles from the same resource; the
kit takes BM&V's copies because those carry plugin dimensions, and both sources
are credited.

| `vanilla-farmhouse-int` | vanilla Skyrim, `meshes/architecture/farmhouse/interior/` (already credited; no download) | 76 | the interior tileset against which the farmhouse shells were authored — cottage (`farmint`), second cottage (`farmint2`), inn, longhouse-with-loft and the `farmb` cellar, plus the two exterior load doors. Built 2026-09-05 to satisfy the owner rule that a building with an interior needs a door to a LINKED interior kit; `interiors_index.TILESET_RULES` already named it |
| `vanilla-imperial-int` | vanilla Skyrim, `meshes/dungeons/imperial/` rooms/halls/doors (already credited; no download) | 65 | the walkable Imperial fort/keep interior, not a cave set: small and large room grids, their corridor tiers and the hinged/load doors. Serves the `vanilla:architecture/imperial/`, `mwkeep:` and `hlaalu:` shells. Solitude's interior set was rejected — Nordic city-house grammar behind an Imperial or Hlaalu front |
| `htbm-hut-int` | Here There Be Monsters — Curse of Cipactli (already credited; no download), `Architecture/Villages/` | 9 | BUILT 2026-09-07. The bamboo huts' own `_Int` rooms — the halves their author made to sit inside `bamboohut01`, `bamboohut02` and the Kothringi hut — with the hut door leaf and the mod's wicker furniture. A 2026-09-07 audit found the five blueprints naming these meshes as 36 parcels' interiors while no kit config packaged them, so the door link they promised could not be loaded; `interiors_index.TILESET_RULES` now names the kit |
| `mudmother-hut-int` | Mud Mother Grove (already credited; no download), `GV_Meshes/ArgonianNest/` | 24 | BUILT 2026-09-07. `MudHut01IntNew`, the room authored to sit inside `mudhut01`, with the indoor shelving, floor seating, hearth, pottery, lights and wall cloths from the same folder; everything `settlement-mud-v1` already packages is left out. Same audit: 14 parcels named the mesh, no kit built it |

Kits built this round: `docks-v1` (47), `watercraft-v1` (45),
`xanmeer-interior-v1` (68); and, 2026-09-05, `vanilla-farmhouse-int` (76) and
`vanilla-imperial-int` (65); and, 2026-09-07, `htbm-hut-int` (9) and
`mudmother-hut-int` (24). Full set-by-set reasoning, including what was
deliberately skipped, is the "Packaging decisions 2026-09-04" table in
[world/sources/assets/README.md](../../../world/sources/assets/README.md).

Tooling fix in the same pass: `pipeline/vault_inventory.py` only recognised a
rigged actor when its skeleton sat in a creature *sub*-folder, so HTBM's 91-mesh
`actors/` set — the richest rigged-creature pool we own, with 30+ skeletons —
reported as unrigged clutter. Fixed; four `creatures.json` entries moved onto
authored HTBM rigs (frog/toad for `death-hopper`, `Wamasu` for wamasu and
haynekhtnamet, `SeaDrake` for sea-drake).

No House **Dres** architecture exists in the vault: BM&V's `trdata` tree is
landscape only, and the Dunmer sets present are Telvanni, Redoran, Velothi and
stronghold. Thorn's Dunmer quarter keeps `hlaalu-domestic`.


## Interior kits from the door manifest (2026-09-07)

Built from `world/sources/placement/exterior-interior-links.json` (see
[exterior-interior-linking-in-skyrim-mods.md](exterior-interior-linking-in-skyrim-mods.md)),
so each kit's pieces are the models the mod's own interior cells place, never a
guess from a filename.

| Kit | Pieces | Evidence | Note |
| --- | --- | --- | --- |
| `htbm-hut-int` | 15 | HTBM cells `CIPHTBMHutInterior01`–`17` + `…GreatHouse`, linked to `bamboohut01/02` | added the vanilla hearth, brazier, hay, barrel and cellar trapdoor the mod's hut cells actually place |
| `mudmother-hut-int` | 64 | `ArgonianLakeHouse.esl` cell `00MudHut01`, linked to `mudhut01` | was 24 pieces of the pool's own dressing; the cell places 60 distinct models, including woven furniture, a Sithis shrine, a fish rack and vanilla sacks/beams |
| `bmv-treehouse-int` | 16 | `Valenwood.esp` cell `01treeint`, linked to `housegland001`, `housechamp001`, `kiosk01` | NEW. The grown tree-house interior family; no new pool, so no new credit line |

True gaps (a shell we use for which the mods ship **no** interior at all):
`XanmeerResources.esp`, `igs_tileset_ayleid.esp` and `Mudmound.esp` are
resource packs with **no placements**, so nothing in them can be linked. The
xanmeer and Ayleid exteriors keep the fallback path rule and warn.
`DarkwaterDen.esp` and `ArgonianHome.esp` have load doors, but they open out of
a cave mouth and a rock face rather than a building shell, so there is no
exterior mesh to which the interior can attach.

## Sourcing-gap register

Every asset gap found by any agent, in any phase, gets a row here the moment it
is found — so a gap can never be quietly left. **A gap is filled in the same
session it is found, unless a reason for deferring it is recorded in its row**
(owner ruling 2026-09-05): the register is a record of work done, not a backlog.
`OPEN` means nobody has looked
yet or the search is unfinished; `SOURCED` means a piece is in a kit config,
built, credited and hashed; `NO SOURCE FOUND` means the vault and Nexus were
both searched and the thing genuinely does not exist as an asset, in which case
the design must change to something we can deliver.

| # | Gap | Found by | Candidate chosen | Status | Date |
|---|---|---|---|---|---|
| G1 | Stand-alone Hist **trunk column** (3–8 m across, 15–30 m tall, no dwelling built in) that stands alone and accepts walkways/tap lines — for Nine-Trunks and every future grove or ruined-trunk composition. Everything held was a whole tree with a crown (HTBM Hist 64 × 45 × 54 m, Mud Mother Grove Hist 27 × 28 × 22 m) or the 206 m `treegiant01` host with its 44 m `treegiantrootbase01` flare | Phase 11 Part 6 | **`tropical:landscape/trees/anvilgianttrunk`** — 10.52 × 10.52 × 56.39 m, 784 tris, crownless column; with `anvil_palm_trunk` (17.94 × 16.61 × 33.74 m) as the stouter buttressed form and `anvil_root01` (14.43 × 10.30 × 6.20 m) as the authored root-flare skirt. Same author, same set, already composited together in `flora-province-v1`. Rejected on measurement: BM&V `vurt1bark`/`vurt2bark` (20.9 × 9.2 × 13.6 / 14.3 × 22.8 × 17.9 m — fallen, not columns), `gkbtreeaspenlog1`, `treepinestump` (both under 5 m) | **SOURCED** — vault, no download needed; joined `settlement-root-v1` | 2026-09-05 |
| G2 | Focal object for an **Argonian underwater shrine** (sunken shrine to Xhon-Mehl the Fisher, Lilmoth's drowned quarter): a statue/altar/idol reading Argonian — not Imperial, not Daedric, not Sithis (the mud kit's `sithisshrine` is the wrong Argonian culture for Murkmire) — that survives submersion | Phase 11 Part 6 | **`htbm:…/architecture/ruins/xanmeer/totem02`** — 0.40 × 0.49 × 2.07 m standing carved totem, the focal idol; plus `totem03` (1.11 × 1.29 × 1.56 m squat altar-height idol block), `runicstone` (1.19 × 0.65 × 1.14 m inscribed marker) and `serpentsigilstatue` (1.38 × 0.44 × 0.63 m serpent-sigil plaque). All four carry HTBM's own `architecture/xanmeer` textures, i.e. the Argonian ruin set. Rejected: `statuegoddess` and `totem01` carry `here there be monsters - the call of cthulhu` textures (different culture); `serpentsigilstone` is a 0.14 m decal; `serpentstatue` is a 0.62 m cube. All four picks are opaque stone, so submersion raises no alpha/foliage problem | **SOURCED** — vault, no download needed; joined `underwater-v1`, and they are also the dry-land shrine dressing for `settlement-stilt-v1` | 2026-09-05 |
| G3 | A **nailed notice / licence board** readable at arm's length (the countersigned tapping licence on the Licensed Stage rail; every future toll post, price list and register board — Alten Corimont's nailed-up price list is the same need) | Round A follow-up 2026-09-05 (Licensed Stage redesign) | **`bmv:advertising_board`** — 1.56 × 1.39 × 2.47 m, 1,894 tris: a freestanding roofed notice pane on two posts, whose posted papers are part of the authored mesh (`infopanel_papers` / `advertising_board_papers.dds`), so no paper has to be jammed onto a blank board. Pane centre sits ~1.6 m up — eye height, readable at arm's length. Its `meshes/architecture/Advertising Board readme.txt` records it as built from scratch (inspired by Stroti's Oblivion miscellaneous resource), panel/paper/metal/post textures by its author, roof from vanilla Riften shingles, window/wood-end/stall-roof from Beyond Skyrim: Bruma — i.e. a bundled modder's resource inside the already-credited BM&V pool. Rejected on measurement: `bmv:manny_gf/alikr/manny_gf_cont_alikrnoticeboard` is a 0.68 × 0.46 × 2.19 m single-`Box001` container proxy with no board geometry; `bmv:architecture/phitt/additional/board` (3.39 × 0.24 × 2.91 m) is a Dunmer painted broadsheet hoarding (`TamikaVineyards01`), wrong culture and too large for arm's length; the Jokerine blank inn signs (0.25 × 1.40 × 1.43 m panel, 0.28 × 1.87 × 3.98 m on-post) are hanging *shop* signs with no paper — nailing a `note01` to one would be a composite nobody authored; vanilla `clutter/signage` is shop/road signs only and `roadsignpost` (0.26 × 0.24 × 3.64 m) is a bare post. | **SOURCED** — vault, no download needed; joined `works-v1` (assetRef `bmv:advertising_board`) | 2026-09-05 |
| G4 | A **covered Ayleid stair or gateway that ships a door** — Mazzatun's stair throat, the way down into the xanmeer and every future stepped-pyramid entrance. `ayleidkit:…/exterior/arstairscenter01` measures as an enclosed flight with an inside, but no mined assembly in any of Skyrim, BM&V, Valenwood or HTBM puts a door part against it. `ruin-monumental-v1` ships no composite that does. The interiors index therefore derives no doorway. Under the 2026-09-05 ruling the throat may not carry a door at all | Stream A2, Phase 11 Part 7 doors pass 2026-09-05 | not a gap: the piece is massing, measured | **CLOSED — no door piece needed.** Re-measured 2026-09-05 with the front-face criterion: `arstairscenter01` never had an inside. Its ring of "walls" is the outside of a solid stair block seen from within (`frontFaceFraction` 0.00), so it is now `interior: none` — massing, which is correct for a stepped throat. Mazzatun's stair throat is a solid rather than a room and needs no door | 2026-09-05 |
| G5 | An **Imperial keep guard tower with a shipped door** — Lilmoth's north gate tower and every future Imperial gatehouse that a player is meant to enter. `mwkeep:…/mwimparchguardtower01` is a tileset piece with an inside; the MW Imperial Architecture set was mined with no door part placed against it in any worldspace we hold | Stream A2, 2026-09-05 | no download: the doors were in the meshes | **CLOSED — entrance derived from the shell's own mesh.** `mwimparchguardtower01` re-measured as a closed prop (`frontFaceFraction` 0.00) with no door evidence, so it is `interior: none`. The pieces of the set that ARE buildings now carry doorways found by the leaf pass — the shut door is modelled into the shell: `mwimparchkeep01`, `mwimparchkeep02` and the `towerbg`/`towersm` bases and tops. The stables (`mwimparchstableendl01`, `mwimparchstableendr01`, `mwimparchstablestraight01`) carry `open-front` entrances, their mouths measured at 2.1 m | 2026-09-05 |
| G6 | A **BM&V stilt-house shell with a shipped door** — Lilmoth's council hall and the Pus-house tower, plus the whole stilt-village family beyond them: `bmv:architecture/stilthouse/stilthouseext` is the only large stilt hall that we hold and derives no doorway | Stream A2, 2026-09-05 | no download: BM&V ships `stilthousedooranim` | **CLOSED — entrance measured, no design change.** `bmv:architecture/stilthouse/stilthouseext` carries two `open-front` entrances (6.10 m at bearing 225°, 5.35 m at 142.5°): the hall's veranda side is the way in. The first probe missed them because the plan centroid of a house-plus-veranda lands on the deck, outside the room; the one-metre retry lattice stands the eye inside the hall and reads them. `composite:stilt/stilthouse-with-door` was also authored (shell + `stilthousedooranim`, the only other architectural mesh in that folder, at the shared origin). The council hall keeps its size | 2026-09-05 |
| G7 | A **Bosmer kiosk or market stall with a shipped door**, or a decision that a kiosk has no interior at all — Lilmoth's tariff bell and quay lamp both use `bmv:…/passerelles/kiosque/kiosk01`, which the index reads as enclosed but to which no assembly fits a door | Stream A2, 2026-09-05 | no download: `kioskaccesd01`, `kioskaccesi01` | **CLOSED — the set ships its own way in.** `bmv:…/passerelles/kiosque/` contains `kioskaccesd01` and `kioskaccesi01`, access thresholds authored in `kiosk01`'s own frame. Measured, their plan centres sit in the kiosk's two ring gaps to within 0.11 m and 0.02 m of the wall radius, heads 2.61 m above its floor — a fit, not a name match. `kiosk01` now derives two `door-piece` doorways; `composite:root/kiosk-with-access` / `composite:stilt/kiosk-with-access` package the three pieces as the set intends. No owner call needed: a kiosk is entered | 2026-09-05 |
| G8 | The **hut interiors the blueprints already promised were never packaged**: 50 parcels across the five blueprints named `htbm:…/villages/argonian/bamboohut01_int`, `bamboohut02_int` and `mudmother:…/mudhut01intnew` as their doors' interiors, but those meshes sat in no kit config and no built kit, so nothing could be loaded behind the door | Interiors audit 2026-09-07 | no download: both meshes' pools (HTBM, Mud Mother Grove) are already credited and hashed; the `_int` rooms are the halves their own authors made to fit the shells | **BUILT** — `htbm-hut-int` (9 pieces: three `_Int` rooms, `bamboohutdoor01`, five wicker furnishings) and `mudmother-hut-int` (24: `mudhut01intnew` plus the indoor shelving, seating, hearth, pottery, lights and wall cloths from the same folder). `interiors_index.TILESET_RULES` now names both, so the shells resolve to a kit rather than to a loose mesh id | 2026-09-07 |

G3 needed no purchase either: BM&V is already a registered pool and already
credited, and its README credit line was extended in the same change to name the
notice board. The pick was made from a throwaway probe kit,
`pipeline/config/kits/probe-notice.json`, built over all eight candidates;
`works-v1` was rebuilt (86 assets, 37.0 MB) and `vet_kit` reports nothing
against the board (pivot 0.04 m above base, so it stands where it is placed).

Neither of G1/G2 needed a Nexus purchase: both mods were already in the vault, both
already have `Pool` rows, and both are credited in the root README (Tropical
Skyrim SSE-classic 33017, Soolie; Here There Be Monsters — Sign of Cipactli SSE
35933, Araanim, v2.92 — archive sha256s recorded with those mods' original
rows above and in `mod-sources/SOURCES.json`). The credit lines were extended in
the same change to name the new files.

**How the picks were made.** A throwaway probe kit,
`pipeline/config/kits/probe-gapfill.json`, was built with every candidate from
both gaps so each was measured as actual geometry — bounding box, triangle
count, alpha mode — rather than judged on its filename. The rejections above are
all measurement or texture-set findings, not guesses. Culture was decided by
reading each NIF's own texture references: a mesh that asks for
`architecture/xanmeer/…` belongs to the Argonian set; one that asks for
`the call of cthulhu/…` is a borrowed piece from a different mod in the same
author's series and does not read Argonian at all. Delete `probe-gapfill.json`
if a later pass finds it unhelpful; it is documentation of the choice, not a
shipping kit.

**How a blueprint references them.** By registry `assetRef` id, exactly as
written in the kit configs:

| Purpose | `assetRef` | Kit | Placement note |
|---|---|---|---|
| Hist trunk column | `tropical:landscape/trees/anvilgianttrunk` | `settlement-root-v1` | uniform scale ≈ 0.35–0.5 for the 3–8 m × 15–30 m brief (0.45 → 4.7 m across × 25 m tall); origin at the base, +Z up, so it sits on the ground plane with no offset |
| Stout/buttressed trunk | `tropical:landscape/trees/anvil_palm_trunk` | `settlement-root-v1` | ≈ 0.3 for a short heavy bole (5.4 m × 10 m) |
| Root flare at a trunk base | `tropical:landscape/trees/anvil_root01` | `settlement-root-v1` | same scale as the trunk it skirts |
| Shrine focal idol | `htbm:here there be monsters - curse of cipactli/architecture/ruins/xanmeer/totem02` | `underwater-v1` | scale 1; 2.07 m tall reads at swimming eye height |
| Altar block / secondary idol | `htbm:…/xanmeer/totem03` | `underwater-v1` | scale 1 |
| Inscribed marker stone | `htbm:…/xanmeer/runicstone` | `underwater-v1` | scale 1 |
| Serpent-sigil plaque | `htbm:…/xanmeer/serpentsigilstatue` | `underwater-v1` | flat piece; set against a wall or slab, not free-standing |

The full snap and scaling rules live where a kit agent will look for them: the
`trunkColumns` entry in `settlement-root-v1.json`'s `snapLogic`, and the
`underwater-v1.json` description.

## Later rows

### 2026-09-05 — phitt Aldredanyia marsh house (BM&V), stream A1

**Outcome: CLOSED, no download needed.** The kit-assembly mine
([kit-assemblies-evidence.md](kit-assemblies-evidence.md)) found the strongest
authored assembly in the whole mod set on a house form no kit of ours carried:
`house03` with `overhang05` and four `window` pieces, all placed at the same
offsets 27 times. Checked against the registry first, per the asset-aware rule:
all three meshes are already in the `bmv` pool
(`bmv:architecture/phitt/aldredanyia/{house03,overhang05,window}`), from Black
Marsh and Valenwood, which is already downloaded, hashed and credited in the
root README. Nothing to source.

Kit chosen by reading the kit descriptions against the pieces' own culture:
`hlaalu-domestic` (the Dunmer/Imperial-fringe domestic tier under the Imperial
keep masonry). `settlement-imperial-v1` was rejected — it is the vanilla
farmhouse and Solitude dock layer, whereas Phitt's Aldredanyia set is neither. The
three pieces are added as single assets and as
`composite:phitt/marsh-house-03`; the kit's `snapLogic.assemblies` records that
they are never composited with the Hlaalu or Hammerfell pieces, which are
separate authored systems.

**Left open:** `house03` has no door piece in the mine, so the composite still
reads as a shell with no doorway. Its entrance is not a repeated authored
placement anywhere in Black Marsh, so there is nothing to measure; a door will
have to be chosen by design when the form is first placed.

### 2026-09-07 — road-spanning gates, walls and fences (`enclosure-v1`)

**Owner ruling 2026-09-07:** *"I don't believe there is only one road-spanning
gate available to us across vanilla + Tropical Skyrim + all the mods we have.
Just because something isn't in the built kits doesn't mean it isn't available.
Source and resolve."* He was right. Nothing was downloaded — every piece below
was already in the vault and already credited; what was missing was that anyone
had **measured** it.

**Method.** Directory reads of every architecture tree in the registries (never
a keyword search of mesh files), then two throwaway probe kits
(`probe-enclosure`, `probe-enclosure2`, 119 pieces) built with
`pipeline.build_kit`, then an aperture measurement on the built GLBs: for each
piece, horizontal rays are fired through it along its short axis at 4 cm
lateral steps and at 0.3 / 1.0 / 1.8 / 2.2 / 3.0 / 4.0 m above its own ground
plane, and the widest run of rays that passes clean is its **clear span at that
height**. A gate that only clears its width at ankle height is a shut gate, and
the numbers say so. Pass marks are module 97 C3: road/spine 4.3 m, track 2.5 m,
footpath 1.2 m, nothing under 1.3 m for two characters abreast.

#### Candidates, measured

Clear span is the width held from 0.3 m to 2.2 m unless noted.

| Piece | Pool | Clear span | Height | Class | Verdict |
|---|---|---|---|---|---|
| `newcastle/wall/1024/1024wallgate01` | bmv | **5.52 m** | 20.03 m | **spine** | **chosen** — the only modular curtain-wall gate in the vault that clears a 4.3 m road |
| `newcastle/wall/1024/1024arch01` | bmv | **8.96 m** | 17.30 m | **spine** | **chosen** — free-standing triumphal arch, spans a way with no wall |
| `architecture/whiterun/wrcitywalls/wrwallmaingate01` | vanilla | 15.23 m | 26.09 m | spine | rejected — a unique Whiterun city façade 10.8 × 22.7 m, not a module; its "opening" is the courtyard mouth |
| `architecture/windhelm/whgate3` | vanilla | 8.09 m | 13.64 m | spine | rejected on culture — Windhelm's grey Nordic masonry, and Tropical ships no retexture for it |
| `architecture/riften/rtnorthgate01` | vanilla | 4.60 m | 18.19 m | spine | rejected — unique Riften piece 13 × 15 m with its own bridge geometry; nothing joins it |
| `hlaalu/hammerfell/misc walls/stonewallgatearc001` | hlaalu | 4.53 m | 8.00 m | **spine** | already kitted in `hlaalu-domestic` — the Dunmer/Hammerfell arch, and it passes the spine |
| `newcastle/wall/1024/1024wallgate02` | bmv | 2.28 m | 20.03 m | track | **chosen** as the postern in the same wall |
| `redoran/custom/redoranwallgate` | bmv | 3.52 m | 10.11 m | track | **chosen** — the Dunmer compound gate |
| `ruins/legion/redruingate` | htbm | 3.92 m | 14.30 m | track | **chosen** — the ancient/ruined gate |
| `dungeons/imperial/exterior/impextwallgate01` (and the Helgen twin) | vanilla | 4.05 m | 8.12 m | track | rejected on culture — vanilla Nordic fort masonry; module 90 §74.1a-bis makes `mwkeep` the province's Imperial language |
| `mwkeep/exterior/walls/mwimparchwallgate01` | mwkeep | 3.20 m | 13.06 m | track | already kitted in `imperial-keep`; **track class, not a road gate** — this is why the province looked gateless |
| `hlaalu/hammerfell/trgmlcwallenterb` | hlaalu | 3.16 m | 3.73 m | track | already kitted in `hlaalu-domestic` |
| `ruins/legion/0mjy_aztecportal` | htbm | 3.13 m | 4.34 m | track | **chosen** — but 0.11 m thick: a frame set into a mass, never free-standing |
| `ayleidruins/exterior/ararch01 / 02 / 03` | ayleidkit | 2.96 m | 20.79 / 19.29 / 15.06 m | track | **chosen** — a graded set of free-standing arches for a processional way |
| `architecture/solitude/spatiowallentrance` | vanilla | 4.08 m | 11.39 m | track | rejected — a Solitude-specific wall entrance that only meets Solitude's own curved wall |
| `hlaalu/winterhold/whcitygate02tgc` | hlaalu | 3.72 m | 21.30 m | track | rejected — one 44 m unique piece, gate and wall fused; nothing modular to run off it |
| `architecture/farmhouse/walkway/walkwaycwallgate01` | vanilla | 6.69 m | 10.13 m | spine | kept where it is (`works-v1`, read as a sluice gate); see "what to re-place" below |
| `villages/argonian/stonewallarch01` | htbm | 1.72 m | 5.39 m | footpath | **chosen** — the only enclosure piece authored in an Argonian idiom |
| `gv_meshes/argoniannest/archwaysticks` | mudmother | 1.57 m | 2.73 m | footpath | already kitted in `settlement-mud-v1` |
| `clutter/stockade/stockadewallwalkway01` | vanilla | 1.33 m | 2.68 m | footpath | **chosen** as a sally port under the palisade walk |
| `wrfarmfence/wrfencestrgate01` | vanilla | 1.41 m (1.13 m at waist) | 1.51 m | footpath | **chosen** — the field gate, not a road gate |
| `clutter/stockade/stockadegate01` | vanilla | 2.28 m at 0.3 m, **0.20 m at 1.0–2.6 m** | 4.23 m | none | **chosen only as a SHUT gate** — the leaf is modelled closed; a player cannot walk through it |
| `newcastle/wall/512/512wallgate01` | bmv | **0.24 m** | 20.03 m | none | rejected on geometry — same defect, leaf modelled shut |
| `dungeons/imperial/portculliskit/portimpgate01` | vanilla | 0.28 m | 5.41 m | none | rejected — the portcullis grate itself, an animated part with no frame |
| `architecture/markarth/mrkfrontwallintgate01` | vanilla | 0.64 m | 9.83 m | none | rejected on geometry — the arch is filled by its own gate mass |
| `architecture/riften/rtmaingate01`, `walls/rtsouthgate01` | vanilla | 0.00 m | — | none | rejected — door leaf and wall block, not openings |
| `architecture/solitude/smaingate` | vanilla | 2.60 m at 1.0 m, 0.08 m above | 29.68 m | none | rejected on geometry — the lintel drops below head height across the span |
| `phitt/stronghold/entrance`, `fort00/01` | bmv | 1.81 m / ≤0.83 m | — | footpath / none | rejected as gates — the stronghold pieces are building shells, not wall runs |
| `largecastle/1sov castlegatehouse` | bmv | 1.76 m | 7.03 m | footpath | rejected — the passage closes to 0 m above 2.2 m; a low gatehouse tunnel |
| `xanmeer/exterior/xanmeer_exterior_wall`, `wallstraight` (htbm) | xanmeer, htbm | 0.00 m | — | — | wall modules with no gate anywhere in either set — recorded as a **standing gap**: the Xanmeer tilesets have no authored gate, and one may not be faked from two wall halves |

#### Wall, palisade and fence runs chosen

| Family | Run pieces | Module | Co-placement evidence |
|---|---|---|---|
| newcastle curtain wall (imperial/civic) | `1024wall01/02`, corners 2/3/4-way, `1024wallround01`, towers `01a/01b`, `1024wallstair01`, `512wall01a/02`, `512pillar01`, `256wall01/02`, `256wallendcap`, ledge run, `ramp01`, `1024wallslope256`, guardhouse + its door | 14.57 / 7.28 / 3.64 m, 20.03 m tall | none mined (the set's cells are outside the placement mine) — module taken from the measured geometry |
| Whiterun farm fence (imperial rural) | `wrfencebasestr01`, `wrfencestr01`, `wrfencebaseend01`, `wrfencebasecor01`, `wrfencecor01`, `wrfencebase4way01`, `wrfence4way01`, `wrfencebasesupport01` | footing chains at 3.64 m; rail sits 1.17 m above the footing | vanilla:t0045 (19), t0460/t0461 (6 each), t0287 (8) — the one composite in the kit |
| Redoran compound (dunmer) | `redoranwall`, `redoranwallcorner`, `redoranwalldivider` | 3.64 m, 8.88 m tall; corner 5.46 m | none mined; measured |
| Argonian village wall | `stonewallcurve01/02`, `stonewallpillar01` | 4.44 / 5.13 m curved, 2.49 m tall | none mined; measured |
| stockade palisade (neutral/frontier) | `stockadewallstraight01`, `wallcornerin01`, `wallcornerout01`, `stockadetower01`, `stockadebarricade01`, `stockadepike01` | 6.01 m, 4.19 m tall | vanilla:t0134/t0288 chain the scaffold, not the wall; the wall module is measured |

#### What was built

`enclosure-v1` (55 assets, one composite), tropicalised, with the same
`clutter/stockade` texture aliases `works-v1` uses. It is deliberately a
**cross-culture vocabulary kit with per-family snap rules** rather than six
additions to six settlement kits: enclosure is rare and cultural (module 97
C10), it is placed by the route/terminal side of the compiler rather than by a
district, and keeping the six families in one config with an explicit
never-mix rule is the only place a future agent will look for "what gate goes
on this way". No family is mixed with another; the rule is written into
`snapLogic`.

#### Two pieces held out of the kit (2026-09-07)

`bmv:architecture/newcastle/buildings/guardhouse` and its loose
`newcastle/door/guardhousedoor` were built into the first cut and are now
removed. The guardhouse is a **building** with a matched interior
(`guardhouseint`), not an enclosure piece; the interiors probe derives no
doorway from its shell (the ring at 1.1 m matches the wall all the way round),
and the door is a separate mesh authored at its own origin, dead centre of the
guardhouse's plan, so nothing in the geometry says where its author hung it.
The placement mine holds no newcastle cells, so there is no template to read it
off either. Composing the two would be guessing, which the kit rule forbids.
A gatehouse for the newcastle wall is therefore a **sourcing gap**: either mine
the mod's own cells for the door offset, or take a gatehouse from a set that
ships one whole.

**Plugin-link decision (2026-09-08): solid mass.** The exhaustive
`worldgen.mine_door_links` output includes both `Black Marsh.esm` and `Black
Marsh North.esp` (and records their archive hashes), but its `shells` table has
no `01randomhouse`, `newcastle/buildings/guardhouse`, or
`newcastle/door/guardhousedoor` row. In other words, neither shipped plugin
ever supplies the exterior-door `XTEL` link needed to locate that loose leaf
on this shell. The similarly named `guardhouseint` mesh is evidence that an
interior model exists, not evidence of an enterable placed assembly. We keep
the shell available only as a non-enterable building mass and keep both it and
the loose door out of `enclosure-v1`; a future enterable use needs a new,
source-backed door placement rather than a guessed composite.

#### Blueprints re-placed onto the kit

`place.dunmer-north.mazzatun` spanned BOTH its ways with
`vanilla:architecture/farmhouse/walkway/walkwaycwallgate02`, the Nordic timber
walkway gate — a farm sluice piece read as a city gate. Both are now
**`bmv:architecture/redoran/custom/redoranwallgate`** (3.52 m clear at track
class, 10.11 m to the parapet), which passes the 3 m haul road and the 2.5 m
ridge track alike. Mazzatun is Xit-Xaht, an **Argonian** tribe, and the kit's
Argonian family clears 1.72 m — a footpath, not the cart ways these gates
carry — so the Argonian idiom has no gate for this job anywhere in the vault.
That stays a standing gap. The Redoran reading is the record's own: the
Xit-Xaht raid their Dunmer neighbours for labour, and the masonry across the
road is taken the same way the people are. Reasoning and the old→new pieces are
in the Mazzatun design record §13.

## 2026-09-09 — flora kit: understory breadth (OPEN, blocker named)

Decision 0048 raised every region class to at least six distinct understory
species, but could not give nine of fourteen classes a species of their *own*.
The reason is not a shortage of meshes; it is that **the built flora kit is
full**. `flora-province-v1.glb` ships 81 assets and the palettes already place
78 of them; the three spare are trees.

The held stock exists and is named in the registries:
`bmv:landscape/trees/reedlarge1 / reedmed1 / reedsmall1 / reedsmall2` (four
unused reed sizes against the single `vurt_reeds` doing all the work),
`bmv:landscape/plants/espfernbraken01–06st` and `espfernbrakencluster01–06`
(twelve bracken variants against one `braken` in use),
`bmv:landscape/plants/bigshrub(colorful)`, `bigshrub-b(colorful)` and
`bigshrub-c(colorful)` (three colour variants against the one `bigshrub2` in use),
`bmv:landscape/trees/gkblillipad` (a second lilypad),
`depths:landscape/grass/tbp_seaweed01/02/06`,
`depths:landscape/grass/waterkelptall02/03`,
`vanilla:landscape/grass/watercoralgrass01`,
`vanilla:landscape/plants/kelpshortstatic01`,
`vanilla:plants/floraswampfungalpod01/02` and `floramushroom01–06`.

**Why it is open rather than done in the same session.** Adding any of them is
not a data edit: each needs a row in `pipeline/config/kits/flora-province-v1.json`
with a reviewed `placement` object, then `python3 -m pipeline.build_kit --kit
flora-province-v1` (Wine + Blender + PyNifly) and `python3 -m pipeline.vet_kit`,
then `compile_scatter`. Several of the candidates have no measured
`sizeM` in the registry at all (`reedlarge1` records 0,0,0), so the placement
policies cannot be written from the record as it stands. They need the kit
build's own measurement, which is the same run. That is a pipeline job to
sequence with the scatter rollout, not a deferral of judgement.

`worldgen/test_vegetation_ladder.py::test_palette_species_are_all_in_the_shipped_flora_kit`
fails if a palette reaches for a species the kit does not carry, so this cannot
be half-done by accident.

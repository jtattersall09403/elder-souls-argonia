# Settlement kit sourcing log — Phase 11 Part 0 item 6b

**Delivered 2026-09-02** against decision
[0041](../decisions/0041-phase11-settlement-decisions.md) Part 0 item 6b, from
the gap list in [settlement-asset-inventory.md](settlement-asset-inventory.md)
(that file and its JSON twin are owned by the inventory agent — this log records
only what was *downloaded, registered and kitted*).

Archives live in the vault (`mod-sources/archives/`), never in git. Every pool
below is credited in the root [README](../../README.md) § Credits and checked
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
[material-culture.md](../../world/sources/lore/extrapolation/topics/material-culture.md)
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
[90-asset-strategy §75.1](../world/90-asset-strategy.md) rather than sourced,
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
[phase11-vibe-sheet-asset-audit.md](phase11-vibe-sheet-asset-audit.md) §4 (S1,
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

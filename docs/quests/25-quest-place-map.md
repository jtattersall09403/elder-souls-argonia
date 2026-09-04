# Quest ↔ place map

> Module of the quest/narrative master plan (see [README](README.md)).
> **The join between the quest plan and the province.** Every provision the
> quest docs declare is listed here against the catalogue record(s) that satisfy
> it; every quest-required place carries the quest id back, in
> `questHooks.tierOwnership`. Written by the co-design pass of 2026-09-04
> (decision [0041](../decisions/0041-phase11-settlement-decisions.md)
> § Part 4 step 2, point 2 of the loop).

## 20a. How the two halves are joined

- **The quest side declares provisions.** Each row of
  [30](30-main-quest.md)/[40](40-factions.md)/[50](50-side-quests.md) carries a
  *World-generation provision* column with ids of the form `LOC helstrom.archive`,
  `STATE opening.camp`, `BOSS lost_city.last_warden`.
- **The world side answers with place ids.** Every such provision becomes a
  machine id `quest.provision.<slug>` (tag dropped, dots and underscores → dashes:
  `LOC helstrom.archive` → `quest.provision.helstrom-archive`) written into
  `questHooks.provisions` on the catalogue record(s) that satisfy it.
- **`questHooks` shape** (`world/sources/catalogue/places-*.json`):
  `{ provisions: [], tags: [], opportunity: string|null, tierOwnership: string|null }`.
  `tags` are the §11 vocabulary (`LOC`/`APP`/`WATER`…); `opportunity` is the
  region agent's one-line "what a quest could do here" prose, kept because it is
  the *places → quests* direction and nothing else records it; `tierOwnership`
  reads `"<quest or line id> · tier-N"`, semicolon-joined when several claim one
  place, lowest tier first.
- **City interiors are not dots.** Provisions naming a district, office or hall
  inside a major city (`helstrom.archive`, `gideon.continuity_office`,
  `lilmoth.tidal_palace`, …) resolve to the *city* record. Districts and
  interiors are Part 5/6 grain (exemplar, then meso) and Phase 12 for the
  interiors themselves; the provision is satisfied when the city packet is
  authored, not before.

## 20b. Provisions → places

`plotted` = the answering record is live and has a position from
`worldgen.macro_plot`. `new` / `promoted` records are live but unplotted until
the lead re-runs the plot.

### Main quest (tier-0)

| Provision (quests 30) | Place(s) | Plotted | Note |
|---|---|---|---|
| `LOC opening.work_barge` | `pirate-freeholds.opening-work-barge` | yes | |
| `opening.work_camp`, `STATE opening.camp` | `pirate-freeholds.opening-work-camp` (+ barge) | yes | the clutch is at the camp |
| *(the Hist that withdraws, MQ01)* | `pirate-freeholds.upriver-hist-village` | **new** | gap closed — the start region had no Hist at all |
| `LOC stormhold.river_station` | `dunmer-north.stormhold`, `dunmer-north.the-last-landing` | yes | Reed office is city grain; the station is the head of navigation |
| `LOC shadowfen.hist_settlement_01`, `STATE hist01` | `dunmer-north.hutan-tzel`, `dunmer-north.hatching-pools` | yes | |
| `LOC helstrom.*` (inner_city, scalded_throne, archive, archive_map_room, veiled_reed_office, closed_council, root_archive) | `hist-heartland.helstrom` | yes | city grain, Part 5 |
| `FAST boat.corimont_helstrom` | `pirate-freeholds.alten-corimont`, `hist-heartland.helstrom`, `hist-heartland.bubble-spire-open-helstrom` | yes | lane must exist in `world/sources/routes/registry.json` |
| `LOC stormhold.floating_auction_house` | `dunmer-north.the-standing-bid` | **new** | gap closed |
| `LOC shadowfen.cult_safehouse_01`, `STATE cult_cell01` | `dunmer-north.the-quiet-landing` | **new** | gap closed |
| `LOC blackrose.archive_wing` | `imperial-penal-south.blackrose-prison` | yes | tier-0 protected |
| `STATE blackrose.tunnels` | `imperial-penal-south.rose-flooded-passage`, `imperial-penal-south.drowned-gallery` | yes | |
| `LOC soulrest.salvage_market` | `mercantile-coast.soulrest`, `.soulrest-breaking-yard`, `.soulrest-divers-yard` | part | divers' yard **promoted** |
| `poi.wreck_eye_lens` | `mercantile-coast.alessian-hull` | yes | |
| `LOC lilmoth.pusbottom` | `mercantile-coast.lilmoth`, `.pusbottom-barge`, `.lilmoth-divers-yard` | part | barge **promoted** |
| `LOC archon.lighthouse` | `saxhleel-coast.archon-lighthouse`, `.portdun-mont` | **promoted** | the lighthouse was in the deferred reserve — a tier-0 provision with no live place |
| `STATE hist02` | `mercantile-coast.ashroot-village`, `imperial-fringe.fenmarch-village`, `naga-kur-deeps.wild-hist-rogue-deeps` | yes | one per candidate lead |
| `LOC dungeon.eye_observatory`, `STATE observatory` | `saxhleel-coast.lagoon-submerged-xanmeer` | yes | six terraces under still water, entered through the tower top |
| `LOC cult.sermon_house`, `STATE sermon_house` | `hist-heartland.the-cut-circle` | **new** | gap closed |
| `LOC gideon.continuity_office`, `STATE handler` | `imperial-fringe.gideon` | yes | city grain |
| `LOC cult.black_sap_lab`, `STATE lab` | `hist-heartland.sap-collection-facility-daedric` | yes | **amendment**: root/cave hybrid, not a stilt house — the pools, cages and water exit survive |
| `MQ23` route chains | `hist-heartland.root-gallery-helstrom-underway`, `.rootworm-station-helstrom`, `saxhleel-coast.east-estuary-rootworm-station`, `hist-heartland.guide-camp-gate-side` | yes | |
| `MQ27` staging + shelters | `hist-heartland.guide-camp-gate-side`, `.guide-camp-far-shelter`, `.refuge-station-interior` | yes | |
| `LOC dungeon.lost_city`, `LOC lost_city.root_sanctuary` | `hist-heartland.lost-city` | yes | tier-0 |
| `BOSS lost_city.last_warden` | `hist-heartland.xal-krona-making-ground` | yes | Xal-Krona (decision 0030) |
| `MQ32` epilogue sockets | `hist-heartland.helstrom`, `pirate-freeholds.opening-work-camp`, `mercantile-coast.lilmoth`, `imperial-fringe.gideon` | yes | |

### Ex-main, now regional (tier-2)

| Provision | Place(s) | Plotted |
|---|---|---|
| `LOC gideon.survey_estate` (MQ11) | `imperial-fringe.the-vellum-estate`, `.the-abandoned-survey` | yes |
| `LOC thorn.border_archive` (MQ12) | `dunmer-north.thorn` | yes |
| `poi.slave_road_memorial` (MQ12) | `dunmer-north.the-pen-yard`, `.the-dres-rows` | yes |
| `STATE identity_case` (MQ19) | `hist-heartland.nine-trunks`, `.cut-and-carried`, `.hist-less-refuge-wild` | yes |

### Faction-named provisions (tier-2)

| Provision | Place(s) | Plotted |
|---|---|---|
| `LOC shadowscales.safehouse_ruin` / `.safehouse_mainquest` | `saxhleel-coast.archon-shadowscale-sanctuary` | yes |
| `LOC dungeon.empty_cradle` (SS03) | `dunmer-north.murkwater-shadowscale-ground` | yes |
| `LOC soulrest.night_reed_den` (TG01) | `mercantile-coast.soulrest-quay-tradehouse` | yes |
| `LOC lilmoth.pusbottom_vault` (TG08) | `mercantile-coast.lilmoth`, `.villa-cellars` | yes |
| `LOC lilmoth.tidal_palace` (TG10) | `mercantile-coast.lilmoth` | yes |
| `LOC blackwood.stonewastes` (FG08) | `imperial-fringe.stonewastes` | yes |
| `LOC murkmire.teeth_of_sithis` (NI05) | `mercantile-coast.teeth-of-sithis` | yes |
| `LOC shadowfen.hissmir` (LW01) | `dunmer-north.hissmir` | yes |
| `LOC deepmire.refuge` (UW04) | `naga-kur-deeps.deepmire-refuge` | yes |
| `LOC whiterose.prison_ruin` (BC05) | `mercantile-coast.white-rose-prison`, `imperial-penal-south.rose-bone-waystation` | part (waystation **promoted**) |
| `LOC gideon.hist_garden` (MR03) | `imperial-fringe.gideon`, `.twyllbek-ruins` | yes |

### Canon-supplied places and systems (quests 20 §12b)

All twenty-three rows now have a place. `quest.provision.canon.*` ids, except
where a region agent had already coined one (Hissmir, Teeth of Sithis,
Stonewastes, White Rose, Deepmire, the Archon facility, the stronghold and the
Reed writ points keep their existing ids).

| §12b row | Place(s) |
|---|---|
| Hissmir | `dunmer-north.hissmir` |
| Glenbridge (+ Rectavius sealed beneath) | `imperial-fringe.glenbridge`, `.glenbridge-sermon-xanmeer` |
| Teeth of Sithis | `mercantile-coast.teeth-of-sithis` |
| Deepmire, "the Refuge" | `naga-kur-deeps.deepmire-refuge` |
| Stonewastes / Four Winds | `imperial-fringe.stonewastes` |
| Alten Meerhleel + Teeba-Enoo court | `mercantile-coast.alten-meerhleel`, `.teeba-enoo-court` |
| Bramman's river (hidden channel, not a lane) | `mercantile-coast.bramman-screen`, `.screen-watch`, `.bramman-river-ferry`, `imperial-penal-south.bramman-head` |
| Murkwood + the Conclave of Baal | `imperial-penal-south.murkwood-verge`, `dunmer-north.stormhold` |
| White Rose Prison | `mercantile-coast.white-rose-prison` |
| The Archon Shadowscale facility | `saxhleel-coast.archon-shadowscale-sanctuary` |
| The great Root Talk at Helstrom | `hist-heartland.root-talk-ground`, `hist-heartland.helstrom` |
| Grave-stakes (*xul-vaat*) | `hist-heartland.necropolis-dead-tenders`, `mercantile-coast.necropolis-village-murkmire`, `naga-kur-deeps.necropolis-nightbound`, + both bog-blight grounds |
| Wamasu electrify the water | `dunmer-north.the-charge-pond`, `hist-heartland.wamasu-pond-nest`, `naga-kur-deeps.wamasu-pond-adult` |
| Miregaunts return when killed | `hist-heartland.miregaunt-ward-approach`, `naga-kur-deeps.miregaunt-ward-open` |
| Wintertide rootworm to Gideon (seasonal only) | `imperial-fringe.gideon-rootworm-terminus` |
| Fort Swampmoth, held but not by the Empire | `imperial-fringe.fort-swampmoth`, `.swampmoth-town` |
| Cyrodilic Collections refounded at Gideon | `imperial-fringe.collections-dig`, `.onkobra-field-station` |
| The Owing (gangs, ledger offices, hiring halls) | `pirate-freeholds.corimont-hiring-yard`, `imperial-fringe.the-quiet-pit`, `.the-turned-out`, `dunmer-north.the-north-holding-pit`, `imperial-penal-south.cordon-cellars`, `.scandal-holding-pit`, `mercantile-coast.hereguard-plantation` |
| `washed-out` NPC material variant | `pirate-freeholds.corimont-hiring-yard`, `dunmer-north.the-dres-rows`, `imperial-fringe.the-vellum-estate` |
| The player stronghold site | `imperial-fringe.the-empty-steading`, `pirate-freeholds.rockpoint` |
| Reed writ enforcement points | eleven toll/crossing/customs records — see `quest.provision.reed-writ-enforcement-point` |
| Root-transit network (Pass-1 → re-authored) | `hist-heartland.rootworm-station-helstrom`, `saxhleel-coast.east-estuary-rootworm-station`, `imperial-fringe.gideon-rootworm-terminus`, `hist-heartland.bubble-spire-open-helstrom`, `.bubble-spire-collapsed` (**promoted**, the hidden/damaged station RW03 needs) |

### Faction-line and standalone anchors

Lines and local quests whose provisions name no `LOC` id get an *anchor*:
`quest.provision.<qid>-anchor` on the record(s) the brief will be built at.
Written for **BC01/03/04, TA02/03, SA01/05/07, RW01/03/04, TG02/03/04/06,
RS01/04/05/06/08, FG01/02/03/07/09, NI01/07, MR01/02/04/05/06/07/09, LW04,
SS02/06, UW03, ST04**, for **LQ01–LQ31** and for **DQ01–DQ08** — 149 provision
ids in all, on 186 records. Query them with:

```bash
python3 - <<'PY'
import json, glob
for f in glob.glob('world/sources/catalogue/places-*.json'):
    for r in json.load(open(f))['places']:
        q = r['questHooks']
        if q['provisions']: print(r['id'], q['tierOwnership'], q['provisions'])
PY
```

## 20c. Questline → anchor places (the reverse view)

| Line | Home / spine places |
|---|---|
| Main quest | `pirate-freeholds.opening-work-barge` → `.opening-work-camp` → `.upriver-hist-village` → `dunmer-north.stormhold` → `.hutan-tzel` → `hist-heartland.helstrom` → `dunmer-north.the-standing-bid` → `.the-quiet-landing` → `imperial-penal-south.blackrose-prison` → `mercantile-coast.soulrest`/`.lilmoth` → `saxhleel-coast.archon-lighthouse` → `.lagoon-submerged-xanmeer` → `hist-heartland.the-cut-circle` → `imperial-fringe.gideon` → `hist-heartland.sap-collection-facility-daedric` → `.lost-city` → `.xal-krona-making-ground` |
| Shadowscales (SS) | `saxhleel-coast.archon-shadowscale-sanctuary`, `dunmer-north.murkwater-shadowscale-ground`, `mercantile-coast.tempering-ground`, `saxhleel-coast.archon` |
| Night-Reed (TG) | `mercantile-coast.soulrest-quay-tradehouse`, `.villa-cellars`, `.lighter-flotilla`, `.lilmoth`, `imperial-fringe.slough-point` |
| Marsh Charter (FG) | `imperial-fringe.stonewastes`, `.westfield-village`, `.fort-swampmoth`, `.the-broke-column`, `saxhleel-coast.shell-beast-shallows`, `.contested-bank` |
| Sunken Archive (SA) | `mercantile-coast.xhon-mehl-shrine`, `imperial-fringe.gideon-synod-outstation`, `dunmer-north.the-permit-dig`/`.the-outer-silyanorn`/`.the-whispers-dig`, `imperial-penal-south.murkwood-verge` |
| Nisswo (NI) | `mercantile-coast.teeth-of-sithis`, `.necropolis-village-murkmire`, `imperial-fringe.glenbridge`, `hist-heartland.pilgrim-camp-sap-road` |
| Many-Root (MR) | `hist-heartland.root-talk-ground`, `.sap-tapping-licensed`, `.harmed-hist-tapped`, `.officeholder-tree-minder-house`, `dunmer-north.hatching-pools`, `imperial-fringe.twyllbek-ruins` |
| Reed-Sail + Salt-Teeth (RS/ST) | `mercantile-coast.oliis-ferry-stage`, `.screen-watch`, `.quinrawl-anchorage`, `pirate-freeholds.channel-pirate-anchorage`, `dunmer-north.boom-keepers-lodge`, `imperial-penal-south.three-gate-toll` |
| League of Open Water (LW) | `saxhleel-coast.archon`, `dunmer-north.hissmir`, `mercantile-coast.lilmoth` |
| Chainbreakers (BC) | `pirate-freeholds.corimont-hiring-yard`, `imperial-penal-south.chainbreaker-shelter`, `.rose-outworks`, `.rose-bone-waystation`, `mercantile-coast.white-rose-prison`, `dunmer-north.the-freed-rows`/`.the-dres-rows` |
| Thorn Ash-Reed (TA) | `dunmer-north.thorn`, `.andalen-plantation`, `.waits-for-the-promise` |
| Umbriel Witness (UW) | `naga-kur-deeps.deepmire-refuge`, `mercantile-coast.sunkfoot`, `saxhleel-coast.umbriel-shore-memorial` |
| Rootworm Waykeepers (RW) | `hist-heartland.rootworm-station-helstrom`, `saxhleel-coast.east-estuary-rootworm-station`, `hist-heartland.bubble-spire-collapsed`, `.root-gallery-collapsed-nine` |

## 20d. Gaps closed by this pass

**Four records added** (all `provenance: quest-required`, unplotted until the
next macro plot):

| Id | Why it had to exist |
|---|---|
| `place.pirate-freeholds.upriver-hist-village` ("Nine Bends") | MQ01's stakes are a Hist withdrawing and a clutch dying, and the whole start region had no Hist |
| `place.dunmer-north.the-standing-bid` | MQ07 needs a floating auction with a public floor, a private office and an under-deck mooring; nothing plotted was one |
| `place.dunmer-north.the-quiet-landing` | MQ08/MQ22's cult safehouse — marsh house, cellar shrine, concealed water exit, and the `raided` state the middle act refers back to |
| `place.hist-heartland.the-cut-circle` | MQ18's sermon house: a room for 12–16 attendees with no street door and a water exit |

**Eight records promoted** out of the deferred reserve:
`saxhleel-coast.archon-lighthouse` (MQ14/LQ17 — a tier-0 provision with no live
place, the worst find of the pass), `hist-heartland.bubble-spire-collapsed`
(RW03), `mercantile-coast.xhon-mehl-shrine` (SA01),
`mercantile-coast.soulrest-divers-yard` (MQ10), `mercantile-coast.pusbottom-barge`
(MQ13/LQ09), `mercantile-coast.mirtis-plantation` (DQ04),
`imperial-penal-south.rose-bone-waystation` (BC05),
`pirate-freeholds.trunk-road-tradehouse` (LQ28). Reserved relation edges were
restored on promotion.

Live records: **566 → 578**, every region inside its budget, well under the
596 ceiling. No deferrals were taken to offset: the plot and relation graph are
about to be re-run anyway, and cutting mild fill is a fullness decision the
owner is holding open (touchpoint ③ question (a)).

## 20e. Move-a-dot proposals (applied as `sitingPrefs` edits)

Fifteen edits, made now because moving a dot costs nothing before anything is
built. They take effect at the **next** `python3 -m worldgen.macro_plot` run.

| Place | The ask | Why |
|---|---|---|
| `saxhleel-coast.archon-lighthouse` | see both the legal channel and the smugglers' gap from one spot | MQ14 sets two accounts against each other; the player must be able to check both |
| `saxhleel-coast.padomaic-wrecker-beach` | within sight of the lighthouse | a false light only works if it can be mistaken for the true one |
| `dunmer-north.the-pen-yard` | on the old slave road within sight of `the-dres-rows` | MQ12's memorial argument and the people it is about, one walk apart |
| `hist-heartland.hist-less-refuge-wild` | off every route and out of any settlement's sightline | MQ19's subject must be somewhere neither claimant would look |
| `imperial-fringe.the-abandoned-survey` | on the omitted corridor's line, ≤600 m from the Vellum Estate's fields | MQ11's answer is standing in the corridor, not in anyone's papers |
| `mercantile-coast.alessian-hull` | within a boat-hour of Soulrest, on ground the market has a live claim on | MQ10's four claimants need standing |
| `hist-heartland.guide-camp-far-shelter` | on the first day's march from the gate, not deep in D5 | MQ27's shelters must read as a chain |
| `imperial-penal-south.drowned-gallery` | under the levee toward the Rose, landward mouth outside the walls | MQ09's second entrance |
| `dunmer-north.murkwater-shadowscale-ground` | same water as Murkwater, far enough that the village can deny watching | SS03's premise is deniability |
| `imperial-fringe.the-broke-column` | overlooking the Blackwood Road at a bend, channel exit behind | LQ15/FG07 want the ambush sightline as the actual problem |
| `hist-heartland.xal-krona-making-ground` | at the deep end of the Lost City approach, reached *through* the city | the boss should not be findable before MQ29 |
| `mercantile-coast.pusbottom-barge` | off the sunken quarter, water side of the stilts | Pusbottom reachable without entering Lilmoth |
| `saxhleel-coast.lagoon-submerged-xanmeer` | tower top clear of the water | MQ16's dry approach and its dive are the same building |
| `imperial-fringe.the-empty-steading` | own landing, one land approach | a stronghold you can see approached |
| `pirate-freeholds.rockpoint` | within sight of the trunk road but off it | the stronghold reads as a claim on the road, not a hideout |

## 20f. The rule, from now on

1. **Every new quest names its places by catalogue id** in its brief and in its
   `anchorPlaces` (and `settlement`) in
   [world/sources/quests/](../../world/sources/quests/README.md). "A village in Shadowfen" is not
   a place; `place.dunmer-north.hutan-tzel` is.
2. **Every quest-required place carries the quest id back** — set
   `questHooks.tierOwnership` to `"<qid> · tier-N"` in the same change. A place
   with no owner is free for anyone; a place owned by tier 0 or 1 may not be
   written by a lower tier ([40-factions.md](40-factions.md) §30b).
3. **A provision with no place is a build item, not a note.** Close it by
   promoting a deferred record or adding one, in this document's table, in the
   same pass that finds it.
4. **Never hand-write positions.** Site a place by editing `sitingPrefs` and
   re-running `python3 -m worldgen.macro_plot`.
5. **The validator cross-checks, and it is live.**
   `python3 -m worldgen.quests --check` (from `tooling/world-generation`, run in
   `npm test` by `worldgen/test_quests.py`) asserts that every quest row's
   `anchorPlaces` and `settlement` resolve to **live** catalogue records, that
   every `registries/quests.json` entry has a data row and the reverse, and that
   the §47c shape budget holds. `--sync` then writes `questHooks.tierOwnership`
   back onto those records from the data (`"<CODE> · tier-N"`, lowest tier
   first), keeping and reporting any ownership string it cannot explain —
   **stop hand-editing `tierOwnership`**. Still owed to this document: every
   provision id declared in 30/40/50 appearing on at least one live record.

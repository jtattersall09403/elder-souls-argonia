# 16g Lane D — read-only mining for Part 2

Read-only. Nothing tracked was edited; the two query scripts live in `/tmp`
(`/tmp/mine16g.py`, `/tmp/mine2.py`) and their key output is pasted below.
Era 4E 201 (decision 0002). Lore dossiers first, UESP only for gaps.

## Reconciliation — what already documents this

| Topic | Live doc that owns it | This lane's effect |
|---|---|---|
| Named waters and what they constrain | `world/sources/lore/regions/waters.md` (§"Named waters", §"What this constrains") | **Confirmed, not superseded.** Section 1 only *lands* those names on graph ids; the attested text stays the single source. Edit that file only to add a `graphCandidate` column if the owner wants the join recorded in lore. |
| Which kit delivers which interior family | `docs/research/placement-settlements/place-asset-deliverability-audit.md:100–160` and `docs/world/90-asset-strategy.md` §71/§74 kit tables | **Contradicts the brief's premise** (see §2): both families already have a verdict and a kit. No new doc; if anything changes, edit the audit's family table, nowhere else. |
| Cast → place | `docs/quests/36-cast-roster.md` (prose) and `world/sources/catalogue/places-*.json` (`notableNpcSlots`) | Section 3 is the *join*, which exists nowhere. The writer should add the `castRef`/slot join to the catalogue records, not to a third doc. |
| Opening and stronghold | `docs/quests/25-quest-place-map.md:45–47`, `docs/research/quests-and-cast/opening-hours-and-start-area.md:116` | **Supersedes** that line: the opening *does* now have records (§4). `opening-hours-and-start-area.md:116` is stale and must be corrected by the writer. |

---

## Section 1 — attested names landed on graph entities

Frame. `worldgen/scale.py:32-34`: `AUTHORED_UV_EXTENT_M = 4034 × 1.82784 =
**7373.5 m**` (the brief's "7,412 m" is not a figure this repo holds — the
1345-cell hydrology raster edge is 7375.3 m, `scale.py:44`). Anchor metres =
`u|v × 7373.5`. Graph coordinates (`sourceEastM/mouthSouthM`, centrelines) are
already world metres; `bboxCells`/`deepestCell` are **full-res** cells
(max 4033) so metres = cell × 1.82784.

Anchors (`world/sources/anchors/settlement-anchors.json`), east/south metres:
stormhold 2654/737 · thorn 6194/590 · gideon 1416/3094 · helstrom 3466/2802 ·
archon 5161/4645 · blackrose 2360/6415 · lilmoth 3611/6385 · soulrest 518/6530 ·
alten-corimont 3834/1143.

### 1.1 Attested name → candidate graph entity

| Attested name | Canon placement (source) | Candidate | Geometric evidence | Confidence |
|---|---|---|---|---|
| **Onkobra River** | source near Topal Bay, flows **east** through the Gideon region into the interior (`waters.md:28`; Lore:Onkobra River) | `river.352-503` (+ `river.316-530`, `river.246-561` as its Gideon feeders) | 59 m from the Gideon anchor; src (1186,3018) → mouth (1932,2760): flows **east**, strahler 2 | medium |
| Onkobra, second (Shadowfen) reach | "a second Onkobra reach south of Alten Corimont" (`waters.md:28`) | `river.775-223` / `river.740-188` | 160 m / 48 m from Alten Corimont, both flowing east-north | low |
| **Panther River** | rises in Cyrodiil's Nibenay, crosses the **west** border, forks by Greenspring and **Helstrom** (`waters.md:29`) | `river.487-510` → `river.490-536` → `river.619-579` chain | `river.487-510` src (1970,1351) runs 1784 m east to (2672,2798); `river.619-579` ends 381 m from Helstrom; three strahler-2/3 links in one chain | medium |
| **Keel-Sakka River** | Murkmire, inland from Lilmoth past Bright-Throat Village (`waters.md:30`) | `river.720-110` (id `river.720-1110`) | src (3434,4454) → mouth (3950,6088), 2184 m, strahler 2, passes 424 m from Lilmoth **inland**; its sea link is `river.731-1121` (464 m from Lilmoth, mouth to ocean) | medium-high |
| **Oortrel River** | named only as a Middle-Argonia feeder; "a free river for us to route" (`waters.md:31`) | free — suggest `river.688-455` or `river.654-540` (strahler 3 / accum 6.4 and 5.0 into the Helstrom basin) | no attested geometry to satisfy | free choice |
| **Red Bramman's river** | narrow winding river, mangrove-screened mouth on the Bay near **Soulrest**, navigable inland to **Blackrose** (`waters.md:32`) | `river.292-1189` | the province's only long interior→sea river in the south-west: 4660 m, strahler 2, accum 6.77, src (1400,3561) near Gideon, mouth (1603,6522) **between** Blackrose (764 m) and Soulrest (924 m), passing 729 m from Blackrose | **high** |
| **Soulrest's river** | starts just south of the city, drains to the sea and runs **north-east** into the interior (`waters.md:36`) | `river.253-1134` (accum 6.64) with `river.95-1018` / `river.52-1091` as its sea mouths | src (934,5962) is south-east of and inland from Soulrest, flows to (1389,6220); the nearest sea-mouth rivers to Soulrest are `river.52-1091` (593 m) and `river.53-1209` (248 m), both tiny | **ambiguous — see 1.5** |
| **The Blackrose confluence** (three rivers: NE near Murkwood, S toward Oliis Bay, W from eastern Blackwood) (`waters.md:34`) | lake `body.1290-3508` + `river.383-1037` (E/NE), `river.398-1023` (NE→SW), `river.442-1006` (NW→SE) | lake is `lake-lowland`, 59,075 m², level 1.60 m, centre (2357,6411) — **5 m from the Blackrose anchor**. The three named rivers approach at 158 / 822 / 899 m | lake **high**, rivers medium |
| **Stormhold's border river** | a mighty river forming the Morrowind border, practically outside the walls (`waters.md:35`) | `river.889-484` | the province's largest: strahler 3, accum 12.67, 4950 m, src (1883,210) → sea (4877,2656); passes **283 m** from Stormhold and 241 m from Alten Corimont; carries three `vertical-fall` reaches near Stormhold | **high** |
| **Archon's estuary** | a river estuary feeding the provincial centre, north of the city (`waters.md:37`) | `river.879-763` | strahler 2, sea mouth (4822,4186) — **571 m north** of Archon (4645 south); `river.865-897` is the southern alternative (499 m) | medium-high |
| **Lake Blackwood** | north of Gideon, floods the marshland north-east of the city (`waters.md:38`) | `body.819-2283` (lake-lowland, 16,986 m², level 17.75, centre 1499/4153) — **but that is SOUTH of Gideon**; the north-east candidate is `body.1189-2027` (marsh-deep, 21,265 m², level 21.57, centre 2199/3714) | no lake-lowland exists north of Gideon | **gap — see 1.5** |
| **Oliis Bay / Tikmak** | south-east coast, Lilmoth at its mouth (`waters.md:26`) | ocean + the Lilmoth-side lagoons `body.2183-3354`, `body.2321-3388`, `body.2392-3320` | the graph models all salt as one `body.ocean`; bays are *named regions of it*, not entities | naming-only |
| **Topal Bay**, **Southern Sea**, **Padomaic Ocean** | `waters.md:25,27,28` | `body.ocean` (19.06 km², level 0) | one ocean body; all three are labels on its west/south/east faces | naming-only |
| **Murkwood** | mobile forest; located only by the Conclave of Baal (Lore:Murkwood) | `place.imperial-penal-south.murkwood-verge` (catalogue) — **no** graph entity | deliberately unfixed | n/a |
| **Deepmire** | Umbriel-memorial refuge (Lore:Murkmire) | `place.naga-kur-deeps.deepmire-refuge` | catalogue, not hydrology | n/a |
| **Norg-Tzel**, **Solstice** | islands off/south of the coast (`waters.md:27`) | **no island exists in the graph or the heightfield** within the 7.37 km cut | outside the province cut | **gap** |
| Hutan-Tzel, Rockguard, Greenspring (Panther landmarks) | `waters.md:29` | catalogue records exist (`place.hist-heartland.greenspring`) | — | n/a |

UESP was **not** needed: every name in the brief is already carried by
`waters.md` with its page cited in that file's header (Lore:Onkobra River,
Lore:Panther River, Lore:Keel-Sakka River, Lore:Middle Argonia, Lore:Oliis Bay,
Lore:Topal Bay, Lore:Southern Sea, Lore:Padomaic Ocean, Lore:Soulrest,
Lore:Blackrose, Lore:Stormhold, Lore:Archon, fetched 2026-08-24). No new
mountain, pass or named marsh appears there; none is invented here.

### 1.2 Every river with strahler ≥ 2 or accumKm2 ≥ 4 (29 of 101)

```
id                  S  accKm2    lenM    srcE    srcS    mthE    mthS mouth           nearestAnchorToMouth  dM
river.889-484       3   12.67    4950    1883     210    4877    2656 sea/estuary     helstrom            1419
river.866-498       1   12.62     538    4295    2903    4751    2733 confluence      helstrom            1287
river.862-498       1   12.31      46    4685    2733    4729    2733 confluence      helstrom            1265
river.818-403       3   11.90     819    3972    1910    4487    2212 confluence      helstrom            1180
river.793-396       1    6.91     177    4213    2278    4350    2173 confluence      helstrom            1085
river.292-1189      2    6.77    4660    1400    3561    1603    6522 sea/estuary     blackrose            764
river.754-412       3    6.76    1209    3577    1938    4136    2261 confluence      helstrom             862
river.253-1134      1    6.64     774     934    5962    1389    6220 confluence      soulrest             924
river.688-455       3    6.38     861    3374    3182    3774    2497 confluence      helstrom             434
river.383-1037      1    5.82     860    2458    6291    2102    5688 confluence      blackrose            771
river.398-1023      2    5.36     780    2826    5282    2184    5612 confluence      blackrose            822
river.671-523       1    5.35     300    3786    3106    3681    2870 confluence      helstrom             226
river.654-540       1    4.98     538    3396    3413    3588    2963 confluence      helstrom             202
river.802-277       1    4.71    1054    4712     950    4400    1521 confluence      alten-corimont       680
river.619-579       3    4.71    2020    2667    1965    3396    3177 confluence      helstrom             381
river.518-583       1    4.30      52    2793    3204    2842    3199 confluence      helstrom             739
river.490-536       2    4.12     857    2047    2623    2689    2941 confluence      helstrom             789
river.487-510       2    2.43    1784    1970    1351    2672    2798 confluence      helstrom             793
river.731-1121      2    2.07     453    3961    5776    4010    6149 sea/estuary     lilmoth              464
river.720-1110      2    2.06    2184    3434    4454    3950    6088 confluence      lilmoth              450
river.442-1006      2    1.97    1286    2168    4745    2426    5518 confluence      blackrose            899
river.431-409       2    1.83    1419    1455    1389    2365    2245 confluence      helstrom            1233
river.483-972       2    1.78    1587    2639    3944    2650    5332 confluence      blackrose           1122
river.0-574         2    1.55     894     446    2590       2    3149 sea/estuary     gideon              1415
river.56-553        2    1.29    1638     682    2223     309    3034 confluence      gideon              1108
river.415-513       2    1.10     592    1778    2661    2278    2815 confluence      gideon               906
river.879-763       2    1.07    1057    4641    3561    4822    4186 sea/estuary     archon               571
river.0-211         2    1.02    1570    1126     813       2    1159 sea/estuary     gideon              2397
river.352-503       2    0.84     986    1186    3018    1932    2760 confluence      gideon               615
```

Mouth census: 30 of 101 rivers end at the sea (`form: estuary`), 71 at a
confluence. **No river in the graph has a lake or marsh body as its mouth.**

### 1.3 Bodies ≥ 1 ha (74 of 2,280; top 25 shown, full list reproducible from `/tmp/mine16g.py`)

```
body.2442-1212  marsh-deep   1,428,675 m2  lvl 0.00  E3733 S1671  near alten-corimont  537
body.1209-3032  swamp        1,073,807     lvl 0.84  E2664 S5383  near blackrose      1076
body.1626-3332  swamp          212,464     lvl 0.31  E2726 S6009  near blackrose       547
body.200-770    tarn-upland    109,805     lvl 289.71 E495 S1258  near gideon         2053
body.3525-81    swamp          107,751     lvl 0.00  E6510 S505   near thorn           327
body.1571-570   lake-lowland   103,781     lvl 7.45  E3199 S802   near stormhold       548
body.1571-1249  marsh-deep      89,335     lvl 0.66  E2980 S2242  near helstrom        741
body.1787-344   lake-lowland    71,855     lvl 7.55  E3371 S663   near alten-corimont  668
body.1789-698   marsh-deep      59,660     lvl 1.19  E3180 S1338  near alten-corimont  683
body.1290-3508  lake-lowland    59,075     lvl 1.60  E2357 S6411  near blackrose         5   <- the Blackrose lake
body.973-3292   marsh-fringe    47,439     lvl 1.62  E1808 S5993  near blackrose       694
body.1999-999   lake-lowland    44,118     lvl 9.14  E3585 S1816  near alten-corimont  718
body.221-1650   tarn-upland     42,888     lvl 35.24 E451  S3074  near gideon          964
body.763-3395   marsh-fringe    38,852     lvl 1.81  E1357 S6127  near soulrest        931
body.1284-3448  swamp           37,028     lvl 1.36  E2168 S6400  near blackrose       192
body.2435-2152  swamp           34,907     lvl 1.54  E4395 S3859  near archon         1098
body.1277-865   lake-lowland    33,727     lvl 29.20 E2345 S1585  near stormhold       902
body.1183-3666  marsh-fringe    28,769     lvl 4.00  E2117 S6679  near blackrose       359
body.1703-3069  swamp           27,714     lvl 1.41  E3099 S5643  near lilmoth         901
body.2879-340   tarn-upland     25,803     lvl 227.71 E5317 S664  near thorn           880
body.805-3530   mudflat         25,265     lvl 0.00  E1495 S6441  near blackrose       865
body.315-3637   marsh-fringe    24,971     lvl 5.02  E583  S6673  near soulrest        157
body.926-2458   marsh-deep      24,179     lvl 1.93  E1718 S4637  near gideon         1573
body.1373-544   tarn-upland     23,197     lvl 30.71 E2512 S1018  near stormhold       315
body.1189-2027  marsh-deep      21,265     lvl 21.57 E2199 S3714  near gideon          999
```

Kind census over all 2,280 bodies: marsh-fringe 735, marsh-deep 674, swamp 656,
pond 82, mudflat 28, pool 24, backswamp 22, **lagoon 20**, tarn-upland 16,
plunge-pool 15, **lake-lowland 7**, ocean 1.

### 1.4 `vertical-fall` reaches (all 18) and lagoons (all 20)

```
reach.1163-145   river.889-484   311.44->292.60  E2127 S265   stormhold  708
reach.1375-169   river.889-484   119.74-> 40.41  E2513 S309   stormhold  451
reach.1392-180   river.889-484    24.99->  0.00  E2544 S328   stormhold  424
reach.950-322    river.594-111   417.97->399.56  E1737 S589   stormhold  930
reach.1195-548   river.594-111   107.65-> 67.15  E2185 S1002  stormhold  539
reach.1166-783   river.487-510    64.34-> 50.55  E2131 S1431  stormhold  869
reach.794-765    river.431-409   270.85->262.62  E1452 S1398  stormhold 1372
reach.835-840    river.431-409   199.15->186.79  E1526 S1535  stormhold 1382
reach.363-591    river.0-211     318.21->295.27  E664  S1080  stormhold 2020
reach.2590-659   river.802-277   119.58->  0.00  E4734 S1204  alten-corimont 901
reach.2994-423   river.1117-137  208.61->188.31  E5472 S774   thorn      745
reach.2681-79    river.894-0     110.84->105.83  E4901 S144   thorn     1368
reach.495-1312   river.159-446   257.18->244.06  E906  S2398  gideon     863
reach.615-1132   river.388-398   406.20->398.53  E1124 S2070  gideon    1065
reach.59-659     river.0-211     243.94->236.21  E108  S1205  gideon    2297
reach.57-1205    river.0-420     252.84->237.64  E104  S2202  gideon    1586
reach.99-2504    river.29-842     55.54-> 46.69  E180  S4577  gideon    1930
reach.90-2525    river.29-842     31.46->  0.00  E165  S4615  soulrest  1947
```

Falls cluster in the northern/western uplands. **Neither Lilmoth, Archon,
Blackrose nor Helstrom has a fall within 3 km** — a waterfall-dressing brief has no feature there to dress.

Lagoons (all 20, all at level 0.00, i.e. tidal): `body.2811-2151` (20,260 m²,
archon 676), `body.930-3449` (19,795, blackrose 637), `body.2834-1825` (17,136,
archon 1426), `body.2822-1398` (10,110, helstrom 1626), then seventeen under
2,600 m². **Thirteen of the twenty are on the Archon/east coast; the entire
Oliis Bay / Lilmoth shore holds only three tiny ones** (`body.2183-3354` 1,002 m²,
`body.2392-3320` 541, `body.2321-3388` 515).

### 1.5 Honest ambiguities

1. **Lake Blackwood has no candidate.** Canon puts it *north* of Gideon
   (`waters.md:38`); the graph's only lake-lowland near Gideon is
   `body.819-2283`, 1,062 m **south**. The north-east candidate
   `body.1189-2027` is a `marsh-deep`, not a lake. Either the name lands on a
   marsh (acceptable — "Lake Blackwood floods the marshland", the dossier wording),
   or a body is authored. **This needs a decision.**
2. **The Blackrose lake has `inflow: []` and `outflow: null`,** and no river in
   the graph declares `mouth.bodyId = body.1290-3508`. The three-river
   confluence required by `waters.md:34` is *geometrically* present (three
   rivers within 900 m) but is **not recorded as a topological confluence**.
   Either the connection is authored into the graph or the claim stays prose
   only. **This needs a decision.** It is the same class of defect as the
   0065/0066 rule "the compile realises the graph".
3. **Soulrest's river:** the big inland river near Soulrest (`river.253-1134`,
   accum 6.64) ends at a *confluence*, not at the sea; the sea-mouths near
   Soulrest are all under accum 0.35. The dossier wants one river that both drains to
   the sea and runs north-east inland. `river.292-1189` satisfies that better
   than anything named for Soulrest — but it is also the only candidate for Red
   Bramman's river. **One river may have to carry both names, or the Soulrest
   river is a distinct short one.**
4. **Norg-Tzel and Solstice are outside the cut.** No island geometry exists.
5. Oliis Bay's "small rivers along its northern coast leading deeper toward
   Middle Argonia" (`waters.md:26`) is satisfied by `river.731-1121` and
   `river.720-1110` only; there is no third.

---

## Section 2 — the brief's premise is FALSE: both families already have kits

**VERIFIED FALSE: "the two families with nothing in the vault".** Both are
already sourced; one already has a *built* kit.

| Family | Vault evidence | Audit verdict |
|---|---|---|
| `ayleid-nedic-ruin` | `world/sources/assets/registry-ayleidkit.jsonl` — 195 meshes (85 exterior, **110 interior**: 29 widerooms, 18 pithalls, 17 clutter, 13 widehalls, 12 narrowhalls, 6 crystals, 6 floorraised, 5 rubble, **2 doors**, 2 secret tunnel). `registry-ayleidcc.jsonl` — 68 meshes, **all interior** (59 interior + 7 puzzle + 2 traps), incl. beds, chairs, tables, benches, bridges, retractable stairs, secret walls | **`deliverable`** — `place-asset-deliverability-audit.md:106`, "Ayleid Ruins Building Kit + CC Ayleid" |
| `kothringi-lilmothiit-site` | `registry-htbm.jsonl` (Here There Be Monsters, SSE 35933) holds a **Kothringi stilt platform**, the Kothringi hut variant with its authored `_Int` room, plus the Tamu wood dock/plank family (`settlement-kit-sourcing-log.md:86,427`) | **`deliverable-if-rewritten`** — audit:114, "no Kothringi/Lilmothiit kit exists anywhere; deliver as scavenged/overbuilt Ayleid + vanilla cave; keep the culture in the *dressing*, never the architecture"; audit:154 repeats it as a redefinition |

Built kits already on disk (`tooling/asset-pipeline/output/kits/`):
`ruin-monumental-v1.{glb,kit,connectors,footprints,interiors}.json` (ayleidkit +
ayleidcc, `90-asset-strategy.md:260`), `xanmeer-interior-v1` (68 pieces, ayleidcc,
`90-asset-strategy.md:267`), `htbm-hut-int` (15 pieces incl. the Kothringi hut
interior, `90-asset-strategy.md:256`).

**Recommendation: source nothing.** Downloading an Ayleid tileset would
duplicate 263 meshes we hold and have already built into two kits; the
Lilmothiit "kit" does not exist for anyone to download — the fox-folk have no
attested architecture at all; the audit has already ruled the culture goes
in the dressing.

Ranked shortlist, recorded only so the next agent does not re-run this search:

**`ayleid-nedic-ruin` — nothing to add (all three already held or credited)**
1. *Ayleid Ruins Building Kit -Resources-* (Imperial Society, **classic** Nexus 90667) — **already in the vault**, `sourcing-log.md:87`, with its recorded hash. Recommendation: use it; do not re-download.
2. *Creation Club Ayleid Ruin Resources* (SarthesArai, SSE 83999) — **already in the vault**, `sourcing-log.md:20`, with its recorded hash. Recommendation: already built as `xanmeer-interior-v1`.
3. *Balamath — Ayleid Ruin Dungeon* (SSE 84000) — a dungeon, not a resource; `90-asset-strategy.md:503` already lists it as an **assembly reference only**. Recommendation: read its layout, take no assets.

**`kothringi-lilmothiit-site` — nothing suitable exists**
1. *Here There Be Monsters — Sign of Cipactli* (Araanim, SSE 35933) — **already held and credited**; its Kothringi stilt platform + bamboo-hut `_Int` rooms are the only purpose-built Kothringi architecture in the mod scene. Recommendation: this is the answer; the audit's "reused architecture + culture in the dressing" is correct.
2. Vanilla Forsworn / Falmer camp architecture (hide tents, bone totems, stick huts) — the engine's own stone-age vocabulary. **Not currently in the vault:** `registry-vanilla.jsonl` (15,045 meshes) returns 41 `forsworn` paths that are **all armour/clothing**, 0 `falmerhut`, 0 `bonechime`, and 8 `tent` paths of which only 3 are architecture (imperial/nordic tents). Recommendation: if a primitive shell is wanted, this is a **vault re-ingest** job, not a Nexus download.
3. Nothing else. No Lilmothiit resource exists on Nexus; searches return only armour and clutter. **Say plainly: there is no fox-folk or Kothringi building kit to buy, and there never was.**

No Nexus download was made and no API key was used or echoed.

---

## Section 3 — cast roster joined to place slots

### 3.1 Principal cast C1 (`36-cast-roster.md` §55)

Sex is stated in the roster only where the pronoun fixes it; blank = not stated.

| Name | Race | Sex | Faction | Home place (prose) | Catalogue id | Slot |
|---|---|---|---|---|---|---|
| **Nesh-Deeka** (`:20`) | Argonian (Jel name) | F | Veiled Reed | Alten Corimont, mid-40s | `place.pirate-freeholds.*` Alten Corimont record | **no slot** |
| **Holds-the-Reed** (`:44`) | Argonian, *lukiul* | M | Veiled Reed (Director) | Gideon-born; the state's offices at Stormhold | `place.dunmer-north.stormhold` | no slot (Stormhold's four are vicecanons / Conclave reader / Collections alcove-keeper / tunnel overseer) |
| **Never-Writes-Twice** (`:61`) | Argonian | F | Veiled Reed | Reed offices | — | **no slot** |
| **Spills-The-Ink** (`:82`) | Argonian | M | Veiled Reed | Reed records office | — | **no slot** |
| **Ei-Tuja, "the Third Answer"** (`:98`) | Argonian (Jel) | M | Nisswo of the Turning Path | Helstrom debating house | `place.hist-heartland.helstrom` | no exact slot; nearest is `"the assembly's speaking-elder"` |
| **Kaska-Meen** (`:115`) | Argonian (Jel) | F | Many-Root Conclave | Helstrom Tree-Minder | `place.hist-heartland.helstrom` | **`"the grove's senior tree-minder"`** |
| **Sings-Over-Stone** (`:129`) | Argonian | — | Helstrom archive | Helstrom | `place.hist-heartland.helstrom` | no slot |
| **Opens-the-Last-Door / "the Collector"** (`:147`) | Argonian (sap-poisoned) | — | Unbound Root | itinerant recruiter | `place.hist-heartland.cult-raid-camp-unbound` | **`"the camp's speaker, who does not give a name"`** (fits) |
| **Cuts-the-Old-Knot** (`:171`) | Argonian | F | Unbound Root (leader), ex-Reed | sanctuary; MQ01 raid | `place.hist-heartland.sap-collection-facility-daedric` / `.lost-city` | no slot |
| **Walks-Against-Current** (`:198`) | Argonian | M | Reed-Sail Compact / Waykeepers | pilot, itinerant | — | no slot |
| **Ahnjazzi** (`:212`) | Khajiit (Ta'agra) | — | independent underwriter | one desk, **Soulrest harbour** | `place.mercantile-coast.soulrest` | no slot |
| **The Last Warden** (`:233`) | Xal-Krona (Argonian Behemoth) | — | Hist-made | lost city | `place.hist-heartland.lost-city` (`BOSS lost_city.last_warden`, `25-quest-place-map.md:16`) | no slot |

### 3.2 Recurring cast C2 by line (`§56`) and shared places (`§57`)

| Name | Race | Sex | Faction line | Home place (prose) | Catalogue id | Slot |
|---|---|---|---|---|---|---|
| Ux-Teeba "the Last" | Argonian | M | Empty Cradle | dies at SS01; grave-stake | `place.dunmer-north.murkwater-shadowscale-ground` | no slot (record has `[]`) |
| Ohl-Katta | Argonian, Black-Tongue *deelith* | F | Empty Cradle | Kota-Vimleel territory, Murkmire | `place.saxhleel-coast.archon-shadowscale-sanctuary` (the only other Kota-Vimleel hit) | `npc.archon.retired-ku-vastei` — **near-fit, not exact** |
| Rasha | Argonian (canon-named) | M | Dark Brotherhood | rented dockside guesthouse, **Archon** | — | **no slot** |
| Iiran-Vekh "the Second Knife" | Argonian | M | Empty Cradle | Shadow-born, SS04 | — | no slot |
| Deep-In-Her-Cups | Argonian (inherited translated name) | F | Night-Reed | Soulrest dockside tavern den | `place.mercantile-coast.soulrest` | no slot |
| "the Eel-Keeper" | Argonian | M | Lilmoth civic / Night-Reed nemesis | Lilmoth canals, Pusbottom | `place.mercantile-coast.lilmoth` | no slot |
| Tsuun-Wai | Argonian | F | Night-Reed | Lilmoth fence (TG05) | `place.mercantile-coast.lilmoth` | no slot |
| Silt ★ | — | F | Night-Reed | — | — | no slot |
| Sails-By-Morning | Argonian (translated) | F | Night-Reed | Archon den | — | no slot |
| Ka-Deelith Ushu | Argonian | F | Four Winds | **Stonewastes** | `place.imperial-fringe.stonewastes` | near-fit: `"the four captains"` |
| Halvar the Damp | **Nord** (epithet) | M | Marsh Charter | old guild hall, **Alten Corimont** | `place.dunmer-north.hissmir` is the only "guild hall" hit — **wrong region; gap** | **no slot** |
| Yeel-Nakka | Argonian | F | Marsh Charter | Charter surgeon | — | no slot |
| Brother Iulus Cato | **Imperial** | M | Sunken Archive | **Conclave of Baal, Stormhold** | `place.dunmer-north.stormhold` | **`"the Conclave of Baal's reader"`** |
| Xul-Nasha | Argonian | F | Sunken Archive | Archive wet-and-dry collection rooms | — | no slot |
| Magister-Adjunct Tarien Loryn | **Imperial** (College of Whispers) | F | Sunken Archive | Murkmire | — | no slot |
| Curator Aulus Pell | **Imperial** | M | Cyrodilic Collections | Collections house, **Gideon** | `place.imperial-fringe.gideon` | **`"the Collections chapter-agent"`** |
| Little-Bell | Argonian (translated) | F | Nisswo | her Lilmoth house | `place.hist-heartland.nisswo-rest-house-interior` | **`"the nisswo of this house"`** |
| Zaxeel of the Jade Mask | **Naga** (Sul-Xan) | M | Sul-Xan splinter | NI05 | `place.imperial-fringe.the-silent-halls` (Sul-Xan-held broken xanmeer) | near-fit: `"the warden who counts the gems"` |
| Hana-Vei | Argonian | F | Nisswo (itinerant) | moves | — | no slot, by design |
| Root-Herald Ixo-Vaal | Argonian | M | Many-Root Conclave | neutral council grove | `place.hist-heartland.greenspring` | **`"the root-herald who trades with Helstrom"`** |
| Sap-Speaker Miril-Tei | Argonian (Miredancer) | F | Many-Root Conclave | — | — | no slot |
| Tuwul of Gloommire | Argonian | F | Many-Root Conclave | Gloommire; claim on Gideon's city garden | `place.imperial-fringe.gideon` | her rival claimant is the slot `"the gardens' Hist-minder"` |
| Route-Keeper Sesha-Ku | Argonian | — | Reed-Sail Compact | Compact hall, Soulrest working quay | `place.mercantile-coast.soulrest` | no slot |
| Captain "Salt" Ma'ren ★ | **Khajiit** | F | free water / ST arc | a cove | — | no slot |
| the toll-holder at the Chain | — | — | Owing brokers | a crossing (RS08) | `place.imperial-penal-south.manned-toll-tower` | record has `[]` — **empty slot list, a place to put her** |
| Delegate Anseia Martius | **Imperial** (Nibenese) | F | League of Open Water | League hall, **Gideon** | `place.imperial-fringe.gideon` | no slot |
| Hisska | Argonian, Hist-less | F | League of Open Water | Gideon civic registry | `place.imperial-fringe.gideon` | no slot |
| Advocate Oshu-Kai | Argonian | M | League nemesis | Gideon | `place.imperial-fringe.gideon` | no slot |
| Never-Sold | Argonian (chosen name) | F | Blackrose Chainbreakers | above a boat-shed, Blackrose city | `place.imperial-penal-south.blackrose` | near: `"toll compact's outside voice"` |
| Ussa-Rekh "the Broker" | Argonian | M | Chainbreakers (BC03) | his office | `place.imperial-penal-south.blackrose-prison` | **`"Chainbreaker envoy camped on the causeway"`** is the *other* side |
| Grave-Singer Ossu | Argonian | F | Chainbreakers | carries the bones (BC05) | — | no slot |
| Third-Born Xeekh | Argonian, prison-born | M | Rose hierarchy | Blackrose Prison | `place.imperial-penal-south.blackrose-prison` | **`"third-generation Rose family head"`** |
| Vicecanon Neetra-Sei | Argonian | F | Thorn Ash-Reed Accord | the magistracy, Thorn — and her boat | Thorn record | fits the Thorn magistracy slot family |
| Andas Verano | **Dunmer** | M | Thorn Accord | Dunmer quarter militia, Thorn | Thorn record | no slot |
| Field-Holder Uxa-Meen | Argonian | F | Thorn Accord | saltrice fields under Owings | `place.dunmer-north.andalen-plantation` (near-fit) | **`"the field-holder who takes the crop and will not go in"`** |
| Keeps-The-Count | Argonian (translated) | F | Umbriel Witness Society | Society archive room, Lilmoth | `place.mercantile-coast.lilmoth` | no slot |
| **Old Nusa** | Argonian | F | Umbriel Witness Society | **Deepmire** | `place.naga-kur-deeps.deepmire-refuge` | **`"Old Nusa, who is bored of Umbriel and will say so"`** — the only *named* slot in the catalogue |
| Still-Wet | — | — | Umbriel Witness Society | Deepmire/Lilmoth | `place.naga-kur-deeps.deepmire-refuge` | near: `"the youngest caretaker…"` |
| Neexa-Tul | Argonian (Jel), 50s | F | Umbriel Witness Society | the descendants' room | — | no slot |
| Handler Ki-Ossa | Argonian | F | Rootworm Waykeepers | **Helstrom terminus** | `place.hist-heartland.rootworm-station-helstrom` | **`"the Waykeeper who prices the line"`** |
| Waykeeper Tuxo | Argonian | M | Rootworm Waykeepers | RW03 | `place.dunmer-north.the-wild-mouth` | near: `"the Waykeeper who has reported it three times"` |
| Dravyna Andalen | **Dunmer**, 3rd-gen Argonia-born | F | crystal trade | counting house, **Stormhold** | `place.dunmer-north.stormhold` | near: `"the tunnel overseer"` |
| **Oleen-Tei / "Tibus Oleen"** | Argonian (two names) | M | the ex-Archein brokerage | never one place | — | **no slot — the shadow-spider has no post, by design** |
| "the Wet Consort" | troupe | — | none | festival circuit (Thtithil-Gah) | — | no slot, by design (ambience) |

The §58 oddities roster (11 entries, `:594–610`) is anchored to *types*, not to
named individuals; each already has a catalogue home (Stillrise →
`place.dunmer-north.stillrise-village`, slots `"the array-keeper"` /
`"the villager who wants it broken"`; the falling mage → no record).

**Headline: 47 named cast members, 11 of which fill a slot verbatim or near
verbatim; 472 slot entries exist across 309 live records.** The cast fills
under 3% of them — a generator has to write the other ~460.

### 3.3 Slot counts over live records (status ∉ {cut, deferred}; 580 live of 827)

| region | slot entries | records carrying slots |
|---|---|---|
| dunmer-north | 140 | 84 |
| imperial-fringe | 93 | 60 |
| hist-heartland | 77 | 55 |
| mercantile-coast | 60 | 44 |
| naga-kur-deeps | 34 | 20 |
| imperial-penal-south | 30 | 17 |
| pirate-freeholds | 21 | 15 |
| saxhleel-coast | 17 | 14 |
| **total** | **472** | **309** |

### 3.4 What a generator needs (naming forms per region)

The five attested name forms (`35-cast.md` §54) with their signals: **Jel**
(interior/tribal/marsh-born — rooted, untranslated); **translated Tamrielic**
verb-clause (city Argonians and outward-facing offices — a working name used with *ojel*); **nickname/epithet** (criminals, sailors, soldiers); **chosen name**
(`EXTRAPOLATED` from Chukka-Sei — lukiul returning, freed debtors, converts);
**foreign-inflected** (Nibenese / Dunmeris / Ta'agra). Hard caps: **≤ ⅓ of any
cast list may be Verb-the-Noun**, no two in one quest share it; **reed, root,
water, stone and shadow each once** in the principal cast; name form must match
politics or the mismatch is deliberate and discoverable; Argonia-born foreigners
drift toward Jel.

Per-region register (`world/sources/catalogue/README.md:160–171`) — these govern
**place** names and the generator must keep person-names consistent with them:

| region | register | avoid |
|---|---|---|
| hist-heartland | definite-article abstract noun naming a *condition*; hyphenated verb-names for people-places | Imperial anything; stone; reed |
| naga-kur-deeps | the same idiom pulled harsh and physical; counts and stakes | anything bright or dressed; Imperial signage |
| saxhleel-coast | hyphenated-verb at its purest — over half are a clause | Dunmer; farmhouse; fort |
| mercantile-coast | trade register: exonyms and compass compounds, verb-names surviving in the Argonian quarter | "The" as an opener (5 uses only) |
| pirate-freeholds | sailor's shorthand, shoutable across water | ceremony; long names; verb-clauses |
| imperial-penal-south | administrative register from a long-dead cordon/ledger | Argonian verb-names outside Argonian records |
| imperial-fringe | two registers side by side — Colovian possessives vs Argonian verb-names | mixing the two *within* one name |
| dunmer-north | Velothi/House names on the Morrowind side, Argonian verb-names on the marsh side, English compounds on the road | Imperial civic kit; anything coastal |

### 3.5 `population-priors.json` shape (five lines)

1. Keys: `$schema`, `confidence` (`COMMUNITY_CONSENSUS`), `note`,
   `provinceHeadline`, `zones`, `cultureZoneMap`.
2. `provinceHeadline` is eight integer percentages: argonian 72, dunmer 10,
   imperial 8, khajiit 5, nord 2, bosmer 2, altmer 1, redguard 1.
3. `zones` has **seven** zones (stormhold, thorn, helstrom, gideon, soulrest,
   archon, blackrose-lilmoth), each the same eight race keys.
4. Shares **do not sum to 100** by design (`note`: rounded community estimates),
   so a generator must normalise before sampling.
5. `note` is binding: "location-specific causal history overrides these priors
   (plan §82)" — a record's own `why`/`occupants` beats the zone share.
   Extremes: helstrom argonian 97; soulrest khajiit 19; gideon imperial 22;
   stormhold dunmer 22; blackrose-lilmoth bosmer 10.

---

## Section 4 — opening-scene places and stronghold candidates

### 4.1 The opening ring (all three exist and are `active`)

`25-quest-place-map.md:45–47,151` maps the MQ01 provisions as follows.

| Provision | Catalogue id | Name | positionM (E,S) | Nearest anchor |
|---|---|---|---|---|
| `LOC opening.work_barge` | `place.pirate-freeholds.opening-work-barge` | **The Roll** | 3947.6, 991.9 | Alten Corimont (3834,1143), 190 m |
| `opening.work_camp`, `STATE opening.camp` | `place.pirate-freeholds.opening-work-camp` | **Gang Ground** | 3837.9, 954.7 | Alten Corimont, 188 m |
| the Hist that withdraws (MQ01) | `place.pirate-freeholds.upriver-hist-village` | **Nine Bends** | 3422.2, 1094.0 | Alten Corimont, 414 m |

There is **no prisoner-tutorial cell**: MQ01 is explicitly "*processing on a
penal work barge near Alten Corimont*", an Owing gang and not a prison
(`30-main-quest.md:253`). The *vastei* ("ku-vastei", the change/redress
concept) appears in the catalogue only at `place.dunmer-north.murkwater`
(`"the retired ku-vastei"`) and `place.saxhleel-coast.archon-shadowscale-sanctuary`
(`npc.archon.retired-ku-vastei`) — **neither is an opening-scene place**. If the
brief means a *vastei* prisoner tutorial, that scene does not exist in the plan.

The Roll: class `works/labour/work-gang-camp/dredging` M1; interior
`building/dwelling/S1`, wetFraction 0.0, 2 entrances, exteriorShell true;
water `body.2442-1212` (marsh-deep, level 0, 33.4 m away); owner
`faction.the-owing-brokers`; hostility guarded → hostile at `quest.mq.01 ≥ 30`
→ neutral at `≥ 60`; importanceTier 0; discovery `none`. Gang Ground: M2
muster-yard/owing, dangerBand 3, sockets `scene.opening.camp-night`,
`scene.opening.clutch-dies`, `scene.opening.choose-a-witness`,
`evidence.opening.dead-clutch`, `mark.opening.hatching-shed`,
`mark.opening.root-route`. Nine Bends: settlement/tribal-village/hist-village/
speaking-hist M3, socket `scene.opening.tree-withdraws`, evidence
`evidence.opening.harvest-cut`.

**Stale doc:** `docs/research/quests-and-cast/opening-hours-and-start-area.md:116`
still says that the start itself has no record and the opening is currently
unplotted ground. That is now false — three records exist. The writer must fix
that line (defect queued under the CLAUDE.md "defect found" rule).

Distances are all within 500 m of the Alten Corimont anchor, so the opening ring
sits in one tile band — good for the streaming budget; note that Stormhold
(2654,737) is **1,200 m** from the barge, so "the opening ring near
Stormhold/Alten Corimont" is really an Alten Corimont ring only.

### 4.2 The two stronghold candidates

Exactly **two** live records carry `quest.provision.player-stronghold-candidate`.
They are the two named in the brief, both `classification.type =
"claimable-steading"`, both `status: abandoned`.

| | `place.imperial-fringe.the-empty-steading` | `place.pirate-freeholds.rockpoint` |
|---|---|---|
| name | The Empty Steading | Rockpoint |
| classification | settlement / homestead / claimable-steading / (no variant) / **M1** | settlement / homestead / claimable-steading / **derelict** / **M2** |
| interior | kind **`delve`**, family `abandoned-plantation`, S1, wetFraction 0.2, **2 entrances**, exteriorShell true, `schemaVersion: 1` | kind **`building`**, family `dwelling`, **S2**, wetFraction 0.2, **1 entrance**, exteriorShell true, **no `schemaVersion`** |
| positionM | **2015.2, 4466.3** (Gideon 1416/3094 → 1,491 m SE) | **3583.5, 1428.5** (Alten Corimont 3834/1143 → 380 m S) |
| plotFacts | firm lowland, **dangerBand 4**, route 60.6 m, water 120.8 m (`body.1167-2444`, marsh-deep, level 10.55), score 4.381 | firm lowland, dangerBand 3, **route 216.9 m**, water 29.5 m (`body.2442-1212`, marsh-deep, level 0.0), score 2.679 |
| why.founding | "A river station built by a family who left for Leyawiin in the last bad flood and did not return." | "A rival landing founded downriver to undercut Alten Corimont's list, which failed because the bar below it will not take a laden hull. Its last owner sold his cut stone back upriver and went to Stormhold." |
| why.siteAdvantages | "A firm bank at a channel junction with its own landing, a walled yard and a well." | "A stone-footed landing, a warehouse shell and a defensible bank, all standing, on ground with no owner on any ledger." |
| questHooks | `player-stronghold-candidate`; opportunity "Three separate offices must sign before the steading changes hands · a deed, a well and a landing to whoever finishes the paperwork"; tierOwnership "LF32 · tier-3; player · tier-1" | `player-stronghold-candidate`, `rival-landing`; opportunity "an intact landing with no owner invites a claim, in a zone where Alten Corimont answers claims"; tierOwnership "LP20 · tier-3; player · tier-1" |
| hostility / tier | baseline **hostile**, clearable **true**, respawn slow; importanceTier **3**; discovery rumour | baseline **neutral**, clearable false, respawn none; importanceTier **1**; discovery road |
| sockets | `scene.the-empty-steading.the-yard`, `evidence…the-open-door`, `marks…stronghold-site`, **no station** | `scene.rockpoint.first-claim`, `evidence.rockpoint.dredging-survey`, **`station.boat.rockpoint-landing`**, `mark.rockpoint.mooring-rings` |

### 4.3 Other live records that are a reoccupied xanmeer or an abandoned river station

| id | status | type | positionM | founding (abridged) |
|---|---|---|---|---|
| `place.imperial-fringe.the-silent-halls` | ruined | broken-xanmeer | 1598.4, 4290.9 | "A Merethic xanmeer opened long ago and **taken over by the Sul-Xan**" — the only genuinely *reoccupied* xanmeer; already hostile-held, so it is a clearance target, not a steading |
| `place.naga-kur-deeps.sealed-xanmeer-vakka-deeps` | active | sealed-xanmeer | 1993.3, 4948.9 | "A xanmeer whose vakka mechanisms still work" — sealed, not reoccupied |
| `place.imperial-fringe.castle-giovesse` | ruined | ducal-ruin | 1006.2, 2777.4 | Cyrodiilic ducal seat by Gideon's north gate; a *castle*, not a river station |
| `place.mercantile-coast.mirtis-plantation` | abandoned | derelict-plantation | 3303.8, 5535.6 | Burned in the 3E 427 uprisings — the closest third stronghold candidate in spirit, but carries no stronghold provision |
| `place.hist-heartland.xal-meeruth-station` | abandoned | (station) | — | abandoned station; carries no stronghold provision and an empty slot list |

No other live record combines "abandoned river station" with a claimable
posture. **The candidate set really is two, with no equivalence between them.** One
is a hostile delve at dangerBand 4 a long way from any city, the other is a
neutral, road-discovered, boat-stationed landing 380 m from Alten Corimont with
a `station.boat` already socketed.

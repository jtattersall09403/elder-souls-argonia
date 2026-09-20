# 16g ledger: the macro plot on the frozen world

Evidence for the 16g owner check (brief:
[16g](../../phases/16-foundation-and-places/16g-macro-plot-places-adapt.md)).
Every number here was measured on the shipped files. The decisions are in
[0078](../../decisions/0078-places-adapt-to-the-frozen-world.md) and
[0080](../../decisions/0080-the-chain-runs-by-dependency-not-position.md); the
reasoning behind the remedies is in [16g-remedy-plan.md](16g-remedy-plan.md).

## State (2026-09-20)

- 16g was delivered on the frozen world on 2026-09-19. The owner walked it on
  2026-09-20, accepted the plot review (the moves, merges and cuts below) and
  made four calls; the follow-up round the same day closed all four.
- **Places.** 567 live records sited, 567 of 567; the thirteen that could not
  be sited were cut, so the register's 13 `homeless` rows are gone. Its four
  `promise-unmet` rows remain, open owner calls on records that are sited but
  stand on ground their terrain promise does not meet (see § Queued).
- **Travel.** 39 stations and 24 services, including 6 dugout-canoe runs
  (owner 2026-09-20: an 800 m join walk is acceptable; naga-kur-deeps
  stays deliberately remote). Craft split: boat 12, dugout-canoe 6,
  swamp-rowboat-ferry 4, native-plank-ferry 1, rootworm 1.
- **Roster.** 498 entries covering all ten races (altmer 1, orc 1); 35 written
  cast members homed on live sited records, 10 unplaced with reasons.
- **Text.** 153 water and land names reviewed on 2026-09-19 (25 changed).
  The roster names were reviewed the same day (about 96 changed).
- **Ground.** The minor tracks are repainted onto the ground (the
  `rebake_landcover` ordering defect is fixed).
- **Owner calls closed.** Pirate-freehold prose adjusted, the zone unchanged;
  Blackrose's centre goes to the lake island in 16h; the stronghold is
  Rockpoint, the Empty Steading cut and LF32 re-pointed; 48 quests re-pointed
  off the cut places.
- **New gates.** Quest anchors must be live and sited in both directions.
  No place reference may dangle anywhere under `world/sources/`.

## History

| date | event |
|---|---|
| 2026-09-18 | reconcile pass: routing audit, gates as found |
| 2026-09-19 | step 1, the plot reads the water record |
| 2026-09-19 | step 2 paused; root causes found |
| 2026-09-19 | resume; 329 typed remedy rows authored |
| 2026-09-19 | roster and hydrology names generated |
| 2026-09-19 | text review: names 25/153, roster about 96/474 |
| 2026-09-19 | interior promises pass |
| 2026-09-19 | plot review written |
| 2026-09-19 | final chain run: 567 of 580 sited |
| 2026-09-19 | 16g closed |
| 2026-09-20 | owner walk: plot review accepted, four calls |
| 2026-09-20 | follow-up: thirteen unsited records cut |
| 2026-09-20 | follow-up: 48 quests re-pointed off them |
| 2026-09-20 | follow-up: canoe runs added, 39 stations |
| 2026-09-20 | follow-up: 35 cast homed, altmer and orc added |
| 2026-09-20 | follow-up: minor tracks repainted onto the ground |
| 2026-09-20 | follow-up: pirate-freehold prose adjusted |
| 2026-09-20 | follow-up: two new reference gates added |

The reconcile pass found three stale Starting-state claims, all corrected in
the brief the same day: `macro_plot` could not run at all, because 16d purged
`ProvinceSurvey.wetlands`/`flood` and `free_ground` read them before solving;
the hero Hist already carried a `heroHist` block on 12 records, so
`histCommunion` is that block with a `status` rather than a second one; and
four built kits sat unpublished under `tooling/asset-pipeline/output/kits/`.

The 2026-09-19 pause turned up four root causes worth keeping. The survey
preferred a dead `refined/height-natural-rg.png` from 2026-09-09, so every
height and slope sampled since 16b read about 17 m low (deleted; the survey
reads `height-rg.png`, the natural array). `record_depth_grid` gave a body its
maximum depth at every pixel (now the compiled depth). Prose lore ties had no
typed form (`sitingPrefs.nearWater` and `minDepthM` added). A homeless record
kept its stale dot (cleared). The eight review packs under `16g-review/` were
measured before the height fix, so their distance, water-kind and relation
rows stand and their slope, clearance and terrain-promise rows do not.

**Reasoning not recorded at the time.** The plot review below was written on
2026-09-19 with its per-section reasoning left blank. A remedy row that
records a reason has been folded into the section; for the status-change, re-type,
re-reference, city-layout, density and Clark-Evans sections nothing was ever
written; those blanks have been removed rather than invented.

## Owner calls and outcomes

| call | 2026-09-20 ruling | what was done |
|---|---|---|
| pirate-freeholds zone water identity: all 21 records key to `body.2442-1212`, a 143 ha marsh sheet, while every prose line and the Alten Corimont dossier say river | the zone stays; adjust the prose | 13 sentences across 8 records rewritten to side-channels and backwaters of the river country |
| Blackrose "built in a lake": the centre is 109 m from its lake while the gate is on its road | the centre goes on the island in the middle of the lake, in 16h's city pass | queued to 16h; the harbour station meanwhile is `place.imperial-penal-south.intact-fort` (0 m from the lake, 69.9 m from the lane, 3.76 m) |
| the stronghold: `the-empty-steading` (approach, no landing) against `rockpoint` (landing, no approach) | the Empty Steading is cut with the unsited thirteen; the stronghold is Rockpoint | Empty Steading cut, `reservedFor: player-stronghold` moved to Rockpoint, LF32 re-pointed |
| opening ring danger: `opening-work-camp` has no D4/D5 place within 250 m but band-4 ground on 22 of 24 bearings | read as places, not ground bands | no move |

## Plot review

Measured on the final chain run: live records 580, plotted 567, dead route
fraction 0.095, seeding mode `seeded-from-committed`. The thirteen unplotted
records were cut on the owner walk the next day.

### Moves by region

| region | moved | median m | p90 m | max m |
|---|---|---|---|---|
| naga-kur-deeps | 3 | 285.3 | 391.8 | 418.5 |
| saxhleel-coast | 1 | 261.4 | 261.4 | 261.4 |

Four records moved at all, each because its terrain promise stopped being
deliverable where it stood. The move found each of them better ground without
meeting the promise outright, so all four also carry a `promise-unmet` row in
`world/sources/sites/plot-homeless-accepted.json`, still open for the owner.

| id | type | from | to | m | why |
|---|---|---|---|---|---|
| `place.naga-kur-deeps.dead-water-village` | hist-village | 3380.6, 5716.6 | 2991.3, 5870.1 | 418.5 | dry-rise:heightClass clearance -0.26 < 1.40; held on its own committed dot at 3238.0, 5771.4 within 600 m so the re-plot could seat it on better ground without carrying it out of the deeps |
| `place.naga-kur-deeps.air-pocket-station-deeps` | air-pocket-station | 2541.6, 5184.7 | 2547.1, 4899.5 | 285.3 | pool:depthM 2.4 < 6.0 |
| `place.saxhleel-coast.archon-lighthouse` | lighthouse | 5332.7, 4455.4 | 5075.0, 4411.5 | 261.4 | islet:waterRelation clearance -0.06 < 2.00; the lighthouse was homeless and belongs on the Archon headland at 5122, 4823, with the wrecker beach and the gap reef in sight |
| `place.naga-kur-deeps.naga-village-settled` | naga-village | 1066.5, 5897.5 | 934.9, 5897.5 | 131.6 | dry-rise:waterRelation clearance -0.32 < 1.40 |

### Status changes and re-types

No record changed status. No record changed type in the solve;
`the-drowned-furrow` was re-typed to `ducal-ruin` by a remedy row, the upland
recipe of its own family, rather than cut.

### Merges (design groups)

Registered in `world/sources/catalogue/design-groups.json`, spread measured
anchor to member. Each group is a set of records that read as districts of one
place rather than as neighbours (remedy plan, regions dunmer-north,
hist-heartland, imperial-fringe and imperial-penal-south).

| designGroup | members | ids |
|---|---|---|
| `group.gandranen` | 2 | `place.dunmer-north.gandranen-library`, `place.dunmer-north.gandranen-ruins` |
| `group.helstrom` | 3 | `place.hist-heartland.guide-camp-gate-side`, `place.hist-heartland.helstrom`, `place.hist-heartland.rootworm-station-helstrom` |
| `group.lost-city` | 2 | `place.hist-heartland.lost-city`, `place.hist-heartland.xal-krona-making-ground` |
| `group.gideon` | 2 | `place.imperial-fringe.bonded-shed-of-the-onkobra`, `place.imperial-fringe.gideon` |
| `group.blackrose-siege-works` | 2 | `place.imperial-penal-south.akaviri-works`, `place.imperial-penal-south.rebellion-earthworks` |
| `group.rose-cordon` | 2 | `place.imperial-penal-south.plague-cordon`, `place.imperial-penal-south.rose-supply-town` |

### Re-references

No route reference changed in the solve. The 49 unresolved reference strings
were handled by remedy rows: 27 resolved through one shared resolver
(`worldgen/route_reference.py`) and 22 dropped.

### The city layouts

| id | gate | centre | gate to centre m | way m | polygon ha | footprintRadiusM | positionM == centre |
|---|---|---|---|---|---|---|---|
| `place.dunmer-north.stormhold` | 2656.8, 737.5 | 2706.0, 781.0 | 65.7 | 67.1 | 15.9 | 230.0 | yes |
| `place.dunmer-north.thorn` | 6193.6, 589.5 | 6248.0, 616.0 | 60.5 | 65.2 | 15.9 | 230.0 | yes |
| `place.hist-heartland.helstrom` | 3419.0, 2771.9 | 3190.0, 2805.0 | 231.3 | 246.5 | 16.1 | 230.0 | yes |
| `place.imperial-fringe.gideon` | 1417.5, 3095.4 | 1551.0, 3069.0 | 136.1 | 160.3 | 15.7 | 230.0 | yes |
| `place.imperial-penal-south.blackrose` | 2360.7, 6418.5 | 2123.0, 6215.0 | 312.9 | 334.3 | 15.6 | 230.0 | yes |
| `place.mercantile-coast.lilmoth` | 3610.9, 6385.6 | 3597.0, 6325.0 | 62.1 | 66.0 | 15.4 | 225.0 | yes |
| `place.mercantile-coast.soulrest` | 518.2, 6533.6 | 528.0, 6424.0 | 110.0 | 113.4 | 16.0 | 230.0 | yes |
| `place.pirate-freeholds.alten-corimont` | 3912.5, 1115.9 | 3927.0, 1177.0 | 62.8 | 121.6 | 5.9 | 140.0 | yes |
| `place.saxhleel-coast.archon` | 5162.7, 4647.3 | 4917.0, 4609.0 | 248.7 | 261.7 | 15.9 | 230.0 | yes |

### Density per zone

| zone | named | fine-tempo | landmark | destination | land km² | per km² | D0–D3 n / per km² (18–22) | D4–D5 n / per km² (8–12) | gate |
|---|---|---|---|---|---|---|---|---|---|
| dunmer-north | 127 | 78 | 15 | 34 | 7.6 | 16.8 | 114 / 15.1 | 13 / 1.7 | out |
| hist-heartland | 116 | 45 | 25 | 46 | 9.0 | 12.9 | 33 / 3.7 | 83 / 9.2 | out |
| imperial-fringe | 120 | 93 | 12 | 15 | 7.0 | 17.2 | 107 / 15.4 | 13 / 1.9 | out |
| imperial-penal-south | 44 | 14 | 10 | 20 | 0.9 | 47.1 | 34 / 36.4 | 10 / 10.7 | out |
| mercantile-coast | 65 | 22 | 8 | 35 | 3.5 | 18.5 | 58 / 16.5 | 7 / 2.0 | out |
| naga-kur-deeps | 40 | 8 | 12 | 20 | 2.6 | 15.4 | 16 / 6.2 | 24 / 9.2 | out |
| pirate-freeholds | 31 | 7 | 3 | 21 | 0.8 | 38.9 | 28 / 35.1 | 3 / 3.8 | out |
| saxhleel-coast | 37 | 12 | 5 | 20 | 1.7 | 21.5 | 33 / 19.2 | 4 / 2.3 | out |

Province total named live records of the three layers at the close: 580
(gate 550–750: ok).

### Clark-Evans

Median R = 1.143; every zone but hist-heartland comes out evener than random.

| zone | n | area km² | mean NN m | expected m | R |
|---|---|---|---|---|---|
| dunmer-north | 126 | 7.56 | 150.5 | 137.3 | 1.096 |
| hist-heartland | 116 | 8.98 | 149.1 | 174.7 | 0.853 |
| imperial-fringe | 118 | 6.96 | 142.1 | 131.0 | 1.085 |
| imperial-penal-south | 39 | 0.93 | 134.4 | 104.1 | 1.291 |
| mercantile-coast | 63 | 3.51 | 157.6 | 144.8 | 1.088 |
| naga-kur-deeps | 39 | 2.6 | 201.4 | 176.2 | 1.143 |
| pirate-freeholds | 31 | 0.8 | 134.2 | 96.5 | 1.391 |
| saxhleel-coast | 35 | 1.72 | 158.9 | 132.3 | 1.201 |

## Names of the water and the land

**Reviewed 2026-09-19 (25 of 153 changed; the review notes are in the
History).** Record: `world/sources/hydrology/names.json`. Text:
`packages/text-catalogue/src/generated/hydrology-names.ts`, keyed
`text.hydrology.name.<entityId>`. Checks: `python3 -m worldgen.hydrology_names
--check` and `worldgen/test_hydrology_names.py`.

The reviewing agent worked against style guide 1.3, 1.5, 1.6 and 2.5–2.8,
`ai-writing-tells.md`, quests 35 and 54, plus the per-region naming register in
`world/sources/catalogue/README.md`; attested names were not touched. Four
defect classes came out of it: portentous abstraction in the hist-heartland
register (eighteen names had drifted into virtue nouns where the register asks
for a definite-article condition); twinned and near-identical names (three
Consents, two Promises, the Still Hour against the Second Stillness, plus the
saxhleel-coast family of five "-Mouth" names); a clause share below the
saxhleel-coast register row, which reads "at its purest, over half the names
are a clause" while only 4 of 13 were (owner ruling applied: the README row
wins over the one-third cap, which is a cast-list rule, so eight of 13 are now
clauses); and names that did not describe the feature their `why` names. No
"whispering", "forgotten" or "ancient" was present. The check now reads its
shares per register (`CLAUSE_SHARE_MIN = {"saxhleel-coast": 0.5}`, every other
register held to `CLAUSE_SHARE_DEFAULT_MAX = 1/3`). Both directions were
made to fail on purpose before being trusted.

Counts: attested 15, extrapolated 136, catalogue-joined 2 | rivers 29, bodies
90, falls 18, peaks 10, passes 2, sea regions 4. Extrapolated per register:
dunmer-north 31, hist-heartland 31, imperial-fringe 27, imperial-penal-south
11, mercantile-coast 10, naga-kur-deeps 14, pirate-freeholds 1,
saxhleel-coast 13.

Five of the 25 changes, as a sample:

| before | after | why |
|---|---|---|
| The Sunken Patience | The Standing Fen | virtue noun for "holds its level all year" |
| The Slow Consent | The Inner Pan | one of three Consents |
| The Green Silence | The Closed Canopy | the `why` is closed canopy |
| Broad-Mouth Bight | Opens-To-The-Sea | one of five "-Mouth" names; also the clause share |
| The Great Falling | The Great Fall | the portentous gerund |

Attested names the review did not touch: the Panther River
(`river.487-510`, `river.490-536`, `river.619-579`), the Stormhold River
(`river.889-484`, alias the border river), the Onkobra River
(`river.352-503`), the Keel-Sakka River (`river.720-1110` inland,
`river.731-1121` at its mouth), the Bramman (`river.292-1189`), the Archon
Estuary (`river.879-763`), Lake Blackwood (`body.1189-2027`), Blackrose Lake
(`body.1284-3448`, the compiled lake; the graph's `body.1290-3508` is marked
`realisedBy` it. That body never compiles. It is one of the 27 in the
P-polish backlog row, so the name moved onto the shipped body,
owner 2026-09-20), Oliis Bay (`sea.oliis-bay`, alias Tikmak), Topal Bay, the
Southern Sea and the Padomaic Ocean. The full 153-row table is the record
itself and is not duplicated here.

Candidates not landed (catalogue waters with no body close enough to join):
`Charge Pond` (dunmer-north; nearest body `body.2673-71`, 371 m), `Bare Lake`
(imperial-penal-south; nearest `body.1602-3188`, a 327 m² swamp 144 m away),
`The Singing Ponds` (imperial-penal-south; the record carries no anchor).

## Roster

**Reviewed 2026-09-19.** `world/sources/registries/npcs.json` is generated:
`python3 -m worldgen.npc_roster --apply` writes one record per live
`notableNpcSlots` post under world 92 §84; `--check` proves the rule holds.

The review fixed the pools (`name_forms.py`) and one form-choice table
(`npc_roster.py`) and re-ran `--apply`; the file itself was never hand-edited.
About 96 of the then 474 names changed. Six defect classes: composed
translated names that were not translations (a blind verb by object
cross-product gave 78 of the 94 translated names clauses no translator would
produce, so `TRANSLATED_VERBS`/`TRANSLATED_OBJECTS` were replaced by
`TRANSLATED_COMPOSED`, which gives every verb its own objects); an attested
name rebuilt from the stems (**Deem-Ra**, from Lore:Argonian Names, against the
module's own rule, so the stem `Deem` became `Deesh` and 14 names were
respelt); five authored translated clauses that read as gravitas rather than as
a plain or comic literal translation; sex-wrong foreign names (the Imperial
nomen pool could hand the feminine *Faustina* to a man, while the unsexed Khajiit
pool put the male honorific *Dar'* on a woman, so Khajiit is now keyed by sex);
wrong Dunmer forms (*Rethan* is an estate name, while *Mavon* and *Sindri* are
not female given forms); and repetition across places (three names turned on
The-Small-Debt, one remains).

| before | after | why |
|---|---|---|
| Prices-The-Season-Price | Prices-The-Salvage | the verb and its object were the same word |
| Meets-The-Damp-Lot | Meets-The-Season-Boat | a factor meets hulls, not lots |
| Deem-Ra | Deesh-Ra | Lore:Argonian Names rebuilt from the stems |
| Dar'Jeen (female) | Dar'Jeen (male) | Dar' is a male honorific |
| Holds-The-Long-Patience | Waits-It-Out | grand, where the form is plain or comic |

### Counts, measured on the shipped `npcs.json` 2026-09-20

| | |
|---|---|
| records | 498 |
| cast joins | 11 from §3 of `16g-mining.md`, plus 35 homed on 2026-09-20 |
| cap repairs (a blocked pick taken to the next pool item) | 152 |

By race: argonian 421, imperial 42, dunmer 18, khajiit 9, bosmer 2, nord 2,
orc 1, altmer 1, breton 1, redguard 1. By name form: jel 299, translated 100,
foreign 77, epithet 18, chosen 4. By sex: 260 male, 238 female.

**Race coverage.** The roster had no Altmer and no Orsimer. Two generated
posts close that: an Altmer alchemist licensed to Lilmoth's dock quarter
(lore/lilmoth.md, where the An-Xileel restricted unlicensed foreigners to the
docks) and an Orsimer smith on Gideon's Leyawiin road (lore/gideon.md, where
the Gideon-Leyawiin trade route reopened in 2E 582). Neither needed a
`CAST_JOIN` row: the race word in the slot text forces the race, so the
generator still authors the identity.

**The generator is additive** (npc_roster 4b, 2026-09-20). The first attempt
renamed 12 already-published entries, because `NamePicker` drew from pools
consumed in walk order and an inserted slot shifted every later draw. An id
already in `npcs.json` now keeps its name, name form, race and sex exactly. Every
registered name is reserved before the first draw, so a new slot can only
take what is left. `test_inserting_a_slot_never_renames_a_published_entry`
holds the rule. The re-apply added 35 entries and changed no identity.

### Written cast

The mining pass found no catalogue slot for 45 written cast members. On
2026-09-20 a slot post was authored for 35 of them on the live sited record
that holds them, with the written name fixed through `CAST_JOIN` in
`worldgen/npc_roster.py`. Race or sex marked *inferred* was read off the name's
form or the character's institution, not stated by the source; the owner may
overrule any of them by editing the `CAST_JOIN` row.

| Cast member | Homed on | Slot role |
|---|---|---|
| Nesh-Deeka | `place.pirate-freeholds.alten-corimont` | the Veiled Reed's field handler for the freeholds |
| Holds-the-Reed | `place.dunmer-north.stormhold` | the Director of the Veiled Reed |
| Never-Writes-Twice | `place.dunmer-north.stormhold` | the Reed officer who files the honest report |
| Spills-The-Ink | `place.dunmer-north.stormhold` | the Reed records clerk who wants a posting |
| Xul-Nasha | `place.dunmer-north.stormhold` | the Archive's keeper of the wet-and-dry collection rooms |
| Tarien Loryn | `place.dunmer-north.stormhold` | the College of Whispers magister-adjunct in the guest laboratory (race inferred: imperial) |
| Dravyna Andalen | `place.dunmer-north.stormhold` | the crystal-trade counting house's Argonia-born Dunmer principal |
| Halvar the Damp | `place.pirate-freeholds.corimont-hiring-yard` | the Charter's hiring-floor captain (race inferred: nord) |
| Yeel-Nakka | `place.pirate-freeholds.corimont-hiring-yard` | the Charter's surgeon |
| Sings-Over-Stone | `place.hist-heartland.helstrom` | the archivist who keeps the years (sex inferred: female) |
| Ei-Tuja | `place.hist-heartland.helstrom` | the nisswo interpreter at the debating house |
| Ahnjazzi | `place.mercantile-coast.soulrest` | the marine underwriter whose desk never moves |
| Deep-In-Her-Cups | `place.mercantile-coast.soulrest` | the keeper of the harbour den |
| Route-Keeper Sesha-Ku | `place.mercantile-coast.soulrest` | the Reed-Sail Compact's route-keeper at the waterfront hall (sex inferred: female) |
| Walks-Against-Current | `place.mercantile-coast.soulrest` | the free pilot who takes divers out to the wrecks |
| the Eel-Keeper | `place.mercantile-coast.lilmoth` | the canal warden who keeps the ripper eels |
| Tsuun-Wai | `place.mercantile-coast.lilmoth` | the fence who is bad at fencing |
| Silt | `place.mercantile-coast.lilmoth` | the young climber that the chapter sends up walls |
| Keeps-The-Count | `place.mercantile-coast.lilmoth` | the Society's archive-room keeper (sex inferred: male) |
| Still-Wet | `place.mercantile-coast.lilmoth` | the one who claims to remember Umbriel (sex inferred: male) |
| Neexa-Tul | `place.mercantile-coast.lilmoth` | the keeper of the descendants' room behind a Pusbottom chandlery (sex inferred: female) |
| Rasha | `place.saxhleel-coast.archon` | the Morag Tong's desk at a rented dockside guesthouse (race inferred: khajiit) |
| Sails-By-Morning | `place.saxhleel-coast.archon` | the fence-den patron who holds nothing overnight |
| Ka-Deelith Ushu | `place.imperial-fringe.stonewastes` | the ka-deelith of the Four Winds hall (sex inferred: male) |
| Anseia Martius | `place.imperial-fringe.gideon` | the League delegate at the hall, a devout Dibellan |
| Hisska | `place.imperial-fringe.gideon` | the clerk of the civic registry |
| Advocate Oshu-Kai | `place.imperial-fringe.gideon` | the advocate at the courthouse |
| Tuwul of Gloommire | `place.imperial-fringe.gideon` | the Gloommire claimant who attends the hearing on the city Hist |
| Never-Sold | `place.imperial-penal-south.blackrose` | the Chainbreaker patron who audits ledgers above a boat-shed |
| Oleen-Tei | `place.imperial-penal-south.blackrose` | the magnate who signs himself Tibus Oleen |
| Iiran-Vekh | `place.dunmer-north.murkwater` | the adult Shadow-born who wants to build boats |
| Sap-Speaker Miril-Tei | `place.mercantile-coast.hammock-village-murkmire` | the Miredancer sap-speaker honoured for her sap-poisoning |
| Cuts-the-Old-Knot | `place.hist-heartland.cult-raid-camp-unbound` | the leader of the Unbound Root |
| Vicecanon Neetra-Sei | `place.dunmer-north.thorn` | the vicecanon of the magistracy, who hears hard cases afloat |
| Andas Verano | `place.dunmer-north.thorn` | the head of the Dunmer quarter's militia hall |

The other 10 have no live sited record to hold them and stay unplaced:

| Cast member | reason unplaced |
|---|---|
| The Last Warden | its place is `dungeon.lost_city`, which has no catalogue record |
| Ux-Teeba the Last | dies in SS01; he holds no standing post |
| Ohl-Katta | Kota-Vimleel territory is not a catalogue record |
| Zaxeel of the Jade Mask | `murkmire.teeth_of_sithis` is not a catalogue record |
| Hana-Vei | itinerant by design: appears only at the nisswo line's own points |
| Captain Salt Ma'ren | her desk is "the pirate cove", which no single live record names |
| the toll-holder at the Chain | the Chain is not a catalogue record |
| Grave-Singer Ossu | itinerant: grave-singers travel to the dead |
| Waykeeper Tuxo | the hidden RW03 station is not a catalogue record |
| the Wet Consort | a travelling troupe; ambience, not a person with a post |

## Promises

The world 70 §48 interior promise vocabulary, filled on all 327 dungeon-kind
records and the 155 buildings by `worldgen.migrate_interior_promises`, with the
quest-asked pins added by `worldgen.quest_promises`. The family realisation
recipes are `world/sources/catalogue/interior-recipes.json`; the schema is
`worldgen/catalogue.py` at schemaVersion 3.

Loop distribution after the 2026-09-19 precedence (vertical entrance first,
then standing water, then a second entrance, then size): none 125,
second-entrance 82, water-loop 57, shortcut-back 41, vertical-return 22.

§48 rule 1 forbids two dungeon-kind records of one family within 2 km agreeing
on more than three of the seven promise axes. 292 pairs came out of the
derivation. The defaults pass (light, an optional room, clearance, the S2 loop)
and then a varied FACT on the higher-sorting record of each stubborn pair
(owner ruling 2026-09-19: one size band up, or one more entrance above S1, then
the exterior shell) brought that to 49. 83 records had a fact changed, recorded
on the record itself as `interior.factsVariedForVariety`, so the pass is
idempotent and the list regenerates; everything derived from the changed fact
(room cap, swim distance, clearance, loop, socket set) was recomputed from it.
The per-record list lives in the records and is not duplicated here.

The 49 pairs that remain are listed one by one in `worldgen/test_catalogue.py`
(`KNOWN_SAMENESS_PAIRS`) with each pair's shared facts. They need a change to
`dangerTier`, `hostility` or `wetFraction`, which are world facts rather than
defaults, so they are held for hand review. **Queued to Phase 12**, the
interiors phase that realises these promises against the records authored here
(decision 0062); the row is in § Queued.

## Queued

| item | owner | evidence |
|---|---|---|
| four `promise-unmet` rows still open in `plot-homeless-accepted.json`: `place.naga-kur-deeps.dead-water-village` (dry-rise:heightClass clearance -0.26 < 1.40; also the naga-deeps rootworm terminus, so the dot is load-bearing for the rootway), `place.naga-kur-deeps.naga-village-settled` (dry-rise:waterRelation clearance -0.32 < 1.40), `place.naga-kur-deeps.air-pocket-station-deeps` (pool:depthM 2.4 < 6.0), `place.saxhleel-coast.archon-lighthouse` (islet:waterRelation clearance -0.06 < 2.00) | the owner: drop the promise, re-type, or refreeze | the register, rows dated 2026-09-19 |
| the water bundle is missing 27 graph bodies | 16c backlog row; the owner call is still open | 16g brief § Owner check |
| ~~the Blackrose lake is realised as `body.1284-3448` while the remedy plan names `body.1290-3508`~~ SETTLED 2026-09-20: the lake is `body.1284-3448`, the id the compiled water record carries; the graph's intended `body.1290-3508` is unrealised (`realisedBy` it) and sits in the 27-bodies backlog row. Remedies, records and the attested name all moved | closed | remedy plan § Owner calls |
| the canoe stations' travel promises are unrealised until their landing parcels exist | 16h | `travel-services.json`, 6 dugout-canoe runs |
| `province:publish` of the repainted `refined/` rasters | the next push day | the tracks were repainted 2026-09-20 |
| four re-pointed authored tracks re-laid | the next `compile_minor_routes` run | remedy plan § Departures |
| 10 written cast members with no live sited record | Phase 12 or a later places pass | § Roster above |
| 49 sameness pairs needing a `dangerTier`, `hostility` or `wetFraction` change | Phase 12 | `KNOWN_SAMENESS_PAIRS` |

## Close (2026-09-19, walked 2026-09-20)

- 329 typed remedy rows applied (`world/sources/sites/plot-remedies.json`).
- Minor networks: 171 tracks (121.9 km) and 134 waterway channels (55.9 km).
- One travel-service graph with road edges, transfer edges, berth walks
  (`jettyM`) and body-following hops; a harbour station per city (nine, in
  `world/sources/routes/harbour-stations.json`, Gideon's the bond-ferry
  landing station); a rootworm network in `rootworm-stations.json`.
- Design groups registered in `world/sources/catalogue/design-groups.json`.
- The known-red register is empty; six withdrawn requests are classified
  `withdrawn` until the next refreeze.
- The chain runs by dependency: receipts, `--check-stale`, cascade (0080).

### Checks, verbatim (2026-09-19)

```
$ python3 -m worldgen.hydrology_names --check
153 names: attested 15, catalogue 2, extrapolated 136 | body 90, pass 2, peak 10, reach-fall 18, river 29, sea-region 4
$ python3 -m pytest -q -p no:cacheprovider worldgen/test_hydrology_names.py
13 passed in 0.13s
$ python3 -m worldgen.npc_roster --check
0 problem(s)
$ python3 -m pytest -q -p no:cacheprovider worldgen/test_npc_roster.py worldgen/test_registries.py
40 passed in 1.49s
$ npx vitest run --root packages/text-catalogue
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

`--emit-text` and `--publish` were re-run, so
`packages/text-catalogue/src/generated/hydrology-names.ts` and
`apps/world-studio/public/province/hydrology-names.json` carry the reviewed
names.

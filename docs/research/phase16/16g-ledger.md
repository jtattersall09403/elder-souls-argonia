# 16g ledger — the macro plot on the frozen world

Evidence for the 16g owner check (brief:
[16g](../../phases/16-foundation-and-places/16g-macro-plot-places-adapt.md)).
Every number here was measured on the shipped files. Sections are filled in
delivery order; the decision record carries the calls.

## 0. The reconcile pass (delivery step 0, 2026-09-18)

- Routing audit over the brief: every Starting-state claim held except
  three, corrected in the brief the same day: `macro_plot` could not run at
  all (16d purged `ProvinceSurvey.wetlands`/`flood`; `free_ground` read
  them and raised before solving), so the record-reads port is the
  prerequisite of every other deliverable; the hero Hist already carry a
  `heroHist` block on 12 records, so `histCommunion` is that block with a
  `status`, not a second one; four built kits sit unpublished in
  `tooling/asset-pipeline/output/kits/` (`hlaalu-domestic`,
  `vanilla-farmhouse-int`, `vanilla-imperial-int`, `watercraft-v1`).
- Gates as found: the seven red files 12 failed / 38 passed;
  `test_record_reads` green with seven rows; `quests --check` green;
  `travel_services --check` green (28 stations, 19 services, 16 active);
  **`route_registry --check` RED** (two rows: `route.track.mercantile-coast.coast-road`
  carries a confidence value outside the vocabulary;
  `route.road.alten-corimont-stormhold`, now class `track`, has no geometry
  in `routes.json` because it is laid by this chunk's minor-route run).
- `water-crossings.json`: 19 fords, 15 spans, no ferry-band crossing on
  the major network (so the "NO SERVICE lake crossings" question is about
  lanes and stations, not road crossings).
- The chain: `[16g]` row mid-list before the terrain tiles, the bake, the
  apron and the scatter; `travel_services` before the minor waterways.

## 12. Names of the water and the land (lane output, unreviewed)

Record: `world/sources/hydrology/names.json` (153 entries). Text:
`packages/text-catalogue/src/generated/hydrology-names.ts`, keyed
`text.hydrology.name.<entityId>`. Checks: `python3 -m worldgen.hydrology_names
--check` and `worldgen/test_hydrology_names.py`. **Not yet run through the
`text-review` skill** — this table is the reviewer's one list.

Counts: attested 15, extrapolated 136, catalogue-joined 2 | rivers 29, bodies 90, falls 18, peaks 10, passes 2, sea regions 4.
Extrapolated per register: dunmer-north 31, hist-heartland 31, imperial-fringe 27, imperial-penal-south 11, mercantile-coast 10, naga-kur-deeps 14, pirate-freeholds 1, saxhleel-coast 13.

| name | kind | register | grounding | why |
|---|---|---|---|---|
| Aralen Tarn | body `body.1072-121` | dunmer-north | extrapolated | a border tarn held at 339 m |
| Ashenis Lake | body `body.1571-570` | dunmer-north | extrapolated | the largest lake on the Morrowind side, 10.4 ha |
| Coldspill Tarn | body `body.805-583` | dunmer-north | extrapolated | a tarn that spills 26 m to its floor |
| Dravanen Tarn | body `body.1002-335` | dunmer-north | extrapolated | the deepest of the border tarns, 58 m to its floor |
| Galonen Lake | body `body.1787-344` | dunmer-north | extrapolated | a 7.2 ha lake on the northern flats |
| Hlaanen Tarn | body `body.654-453` | dunmer-north | extrapolated | a tarn on the high western wall |
| Hleranis Lake | body `body.1277-865` | dunmer-north | extrapolated | a lowland lake held at 29 m |
| Menaren Backwater | body `body.1293-692` | dunmer-north | extrapolated | the backswamp behind the border channel |
| Rethanen Tarn | body `body.2879-340` | dunmer-north | extrapolated | an eastern upland tarn at 228 m |
| Sadrelen Tarn | body `body.1178-42` | dunmer-north | extrapolated | a border tarn on the northern wall |
| Salt Gate | body `body.3433-520` | dunmer-north | extrapolated | the one tidal lagoon on the north-east shore |
| Swallows-The-Border | body `body.2442-1212` | dunmer-north | extrapolated | the province's largest single water, 143 ha of deep marsh on the border |
| Thornmire | body `body.3525-81` | dunmer-north | extrapolated | the 10.8 ha swamp under Thorn |
| Uvenen Tarn | body `body.824-179` | dunmer-north | extrapolated | the highest water in the province at 507 m |
| Velasen Tarn | body `body.1373-544` | dunmer-north | extrapolated | an upland tarn above the Stormhold approach |
| Ashanen Height | peak `site.scour.border-mountains.summit-006` | dunmer-north | extrapolated | the corner crown where the north and west walls meet |
| Dranoth Height | peak `site.scour.border-mountains.summit-004` | dunmer-north | extrapolated | the northern wall where it turns east |
| Gaverin Knoll | peak `site.scour.firm-lowland.summit-010` | dunmer-north | extrapolated | a knoll standing 82 m over firm lowland |
| Hasmeren Height | peak `site.scour.border-mountains.summit-011` | dunmer-north | extrapolated | the eastern end of the northern wall |
| Kuldrenen Peak | peak `site.scour.border-mountains.summit-003` | dunmer-north | extrapolated | the highest ground in the province at 652 m |
| Low Kandril | peak `site.scour.upland-hills.summit-007` | dunmer-north | extrapolated | a lone hill 99 m above the Thorn flats and only 94 m above the sea |
| Velanen Height | peak `site.scour.border-mountains.summit-001` | dunmer-north | extrapolated | the second prominence of the northern border wall |
| Dralenen Fall | fall `reach.950-322` | dunmer-north | extrapolated | an 18.4 m drop at 418 m, the highest fall in the province |
| Guarfoot Fall | fall `reach.794-765` | dunmer-north | extrapolated | an 8.2 m step on the upper western river |
| Half-Step Fall | fall `reach.2681-79` | dunmer-north | extrapolated | the shallowest fall in the province at 5 m |
| Kelmenen Fall | fall `reach.1163-145` | dunmer-north | extrapolated | an 18.8 m drop high on the border river |
| Lowstep Fall | fall `reach.1166-783` | dunmer-north | extrapolated | a 13.8 m step on the western chain |
| Marenen Fall | fall `reach.2994-423` | dunmer-north | extrapolated | a 20.3 m drop in the eastern uplands |
| Stormhold Stair | fall `reach.1392-180` | dunmer-north | extrapolated | the last 25 m drop before the estuary at Stormhold |
| Sundered Stair | fall `reach.1195-548` | dunmer-north | extrapolated | a 40.5 m drop, the second deepest in the north |
| Varanen Leap | fall `reach.1375-169` | dunmer-north | extrapolated | a 79.3 m drop, the deepest fall on the border river |
| The Charged Pond | body `body.2520-1193` | hist-heartland | catalogue | the catalogue record The Charged Pond (places-hist-heartland.json) stands 66 m from this pool |
| The Deep Keeping | body `body.1789-698` | hist-heartland | extrapolated | 6 ha of deep marsh on the northern approach |
| The Green Silence | body `body.1822-2663` | hist-heartland | extrapolated | swamp under closed canopy |
| The High Mire | body `body.1954-2136` | hist-heartland | extrapolated | swamp perched at 31.8 m, the highest in the heartland |
| The Kept Promise | body `body.2507-1964` | hist-heartland | extrapolated | swamp held at 7.3 m all season |
| The Long Forbearance | body `body.2435-2152` | hist-heartland | extrapolated | 3.5 ha of swamp east of the heart |
| The Open Water | body `body.1999-999` | hist-heartland | extrapolated | the heartland's one true lake, 4.4 ha and 9.9 m deep |
| The Salt Breath | body `body.2822-1398` | hist-heartland | extrapolated | a tidal lagoon a kilometre inside the eastern shore |
| The Second Stillness | body `body.1468-2233` | hist-heartland | extrapolated | the twin pan east of The Still Hour |
| The Slow Consent | body `body.1661-2338` | hist-heartland | extrapolated | swamp held at 8.7 m in the inner basin |
| The Small Grace | body `body.2899-881` | hist-heartland | extrapolated | the smallest lagoon on the eastern shore |
| The Still Hour | body `body.1461-2269` | hist-heartland | extrapolated | a deep marsh pan west of the heartland road |
| The Sunken Patience | body `body.1029-2301` | hist-heartland | extrapolated | deep marsh that holds its level all year |
| The Thin Edge | body `body.2848-1068` | hist-heartland | extrapolated | fringe marsh where the heartland meets the coast |
| The Tidal Mercy | body `body.2834-1825` | hist-heartland | extrapolated | 1.7 ha of lagoon that fills and empties twice a day |
| The Turned Back | body `body.2245-1351` | hist-heartland | extrapolated | a backswamp cut off behind its own channel |
| The Unasked | body `body.2365-2042` | hist-heartland | extrapolated | swamp nobody crosses on the eastern flats |
| The Wide Waiting | body `body.1571-1249` | hist-heartland | extrapolated | 8.9 ha of deep marsh held at half a metre |
| The Dry Crossing | pass `pass.stormhold-thorn` | hist-heartland | extrapolated | the one rise on the Stormhold-Thorn trunk that falls away on both sides |
| The Great Falling | fall `reach.2590-659` | hist-heartland | extrapolated | a 119.6 m drop, the deepest fall in the province |
| The Brief Meeting | river `river.862-498` | hist-heartland | extrapolated | 46 m of channel joining two great flows |
| The Broad Consent | river `river.818-403` | hist-heartland | extrapolated | 11.9 km of catchment in one third-order channel |
| The Carried Debt | river `river.754-412` | hist-heartland | extrapolated | a third-order river carrying the northern uplands south |
| The Falling Promise | river `river.802-277` | hist-heartland | extrapolated | the river that carries the province's deepest fall |
| The Gathering | river `river.688-455` | hist-heartland | extrapolated | a third-order river drawing 6.4 km of catchment together |
| The Given Word | river `river.654-540` | hist-heartland | extrapolated | a short feeder that never fails |
| The Joining | river `river.866-498` | hist-heartland | extrapolated | the reach where the eastern catchment meets the border river |
| The Last Consent | river `river.793-396` | hist-heartland | extrapolated | the final feeder before the border river's great confluence |
| The Long Impatience | river `river.431-409` | hist-heartland | extrapolated | 1.4 km of whitewater falling out of the western hills |
| The Quiet Answer | river `river.671-523` | hist-heartland | extrapolated | a 300 m feeder on the Helstrom approach |
| The Short Turning | river `river.518-583` | hist-heartland | extrapolated | a 52 m link that turns the whole flow east |
| the Panther River | river `river.487-510` | hist-heartland | attested · Lore:Panther River | the chain that crosses the western border and runs down to Helstrom |
| the Panther River | river `river.490-536` | hist-heartland | attested · Lore:Panther River | the chain that crosses the western border and runs down to Helstrom |
| the Panther River | river `river.619-579` | hist-heartland | attested · Lore:Panther River | the chain that crosses the western border and runs down to Helstrom |
| the Stormhold River (alias the border river) | river `river.889-484` | hist-heartland | attested · Lore:Stormhold | the province's largest river, running the Morrowind border and passing 283 m from Stormhold |
| Bell Tarn | body `body.692-1779` | imperial-fringe | extrapolated | an upland tarn on the Gideon watch road |
| Cloudcatch Tarn | body `body.564-1042` | imperial-fringe | extrapolated | a tarn at 408 m, in cloud most mornings |
| Cold Mere | body `body.221-1650` | imperial-fringe | extrapolated | 4.3 ha of upland water at 35 m |
| Drowned Field | body `body.877-2565` | imperial-fringe | extrapolated | deep marsh over ground that was once worked |
| Highmere | body `body.200-770` | imperial-fringe | extrapolated | the largest upland tarn in the province, 11 ha at 290 m |
| Holds-The-Flood | body `body.926-2458` | imperial-fringe | extrapolated | 2.4 ha of deep marsh that takes the seasonal rise |
| Hollow Tarn | body `body.635-1651` | imperial-fringe | extrapolated | a tarn sunk in its own bowl at 73 m |
| Lake Blackwood | body `body.1189-2027` | imperial-fringe | attested · Lore:Blackwood | Lake Blackwood floods the marshland north-east of Gideon, so the name lands on the marsh-deep body that does the flooding, not on a lake basin |
| Lower Mere | body `body.819-2283` | imperial-fringe | extrapolated | the lake-lowland basin a kilometre south of Gideon |
| Marius' Lake | body `body.835-2593` | imperial-fringe | extrapolated | 2.1 ha of lowland lake on the southern fringe |
| The Black Tarn | body `body.34-1253` | imperial-fringe | catalogue | the catalogue record The Black Tarn (places-imperial-fringe.json) stands 23 m from this tarn |
| Vantius' Pool | body `body.278-2618` | imperial-fringe | extrapolated | a shallow upland tarn at 63 m |
| Blackwood Rise | pass `pass.gideon-blackwood-road` | imperial-fringe | extrapolated | the crest the Blackwood road climbs before it drops into the marsh |
| Low Warden | peak `site.scour.upland-hills.summit-009` | imperial-fringe | extrapolated | the inland outlier of the western wall |
| Marcher's Peak | peak `site.scour.border-mountains.summit-002` | imperial-fringe | extrapolated | the western border's highest crown at 590 m |
| Warden's Head | peak `site.scour.border-mountains.summit-000` | imperial-fringe | extrapolated | the greatest prominence in the province, 289 m over its own ground |
| Border Fall | fall `reach.57-1205` | imperial-fringe | extrapolated | a 15.2 m drop at the western edge |
| Broad Fall | fall `reach.59-659` | imperial-fringe | extrapolated | the widest fall in the province, 14 m from bank to bank |
| Hanging Fall | fall `reach.835-840` | imperial-fringe | extrapolated | a 12.4 m drop off an undercut lip |
| Long Fall | fall `reach.90-2525` | imperial-fringe | extrapolated | a 31.5 m drop to sea level |
| Mill Fall | fall `reach.495-1312` | imperial-fringe | extrapolated | a 13.1 m drop below the old mill ground |
| Shallow Fall | fall `reach.615-1132` | imperial-fringe | extrapolated | a 7.7 m drop on a narrow upper channel |
| Stepped Fall | fall `reach.363-591` | imperial-fringe | extrapolated | a 22.9 m drop in three steps |
| Upper Long Fall | fall `reach.99-2504` | imperial-fringe | extrapolated | the 8.9 m step above Long Fall on the same river |
| Burnt Mill Brook | river `river.0-574` | imperial-fringe | extrapolated | the brook that reaches the west edge below the old mill ground |
| Carries-Them-Down | river `river.56-553` | imperial-fringe | extrapolated | 1.6 km of whitewater dropping off the western wall |
| Cassian's Water | river `river.0-211` | imperial-fringe | extrapolated | a second-order river leaving the province at its western edge |
| Wainwright's Run | river `river.415-513` | imperial-fringe | extrapolated | the run the Gideon carters follow east |
| the Onkobra River | river `river.352-503` | imperial-fringe | attested · Lore:Onkobra River | the east-flowing river rising 59 m from the Gideon anchor |
| Blackrose Lake | body `body.1290-3508` | imperial-penal-south | attested · Lore:Blackrose | the lake-lowland basin 5 m from the Blackrose anchor |
| Common Ground, Unsurveyed | body `body.1209-3032` | imperial-penal-south | extrapolated | 107 ha of swamp the prison survey never finished |
| Lot Fourteen | body `body.1362-3680` | imperial-penal-south | extrapolated | a lagoon that kept its lot number |
| Lot Twenty-One | body `body.1523-3455` | imperial-penal-south | extrapolated | a lagoon that kept its lot number |
| Open Reckoning | body `body.973-3292` | imperial-penal-south | extrapolated | 4.7 ha of fringe marsh left off every ledger |
| Quarantine Ground | body `body.930-3449` | imperial-penal-south | extrapolated | 2 ha of lagoon, the holding water of the old cordon |
| Stores Backwater | body `body.984-3515` | imperial-penal-south | extrapolated | the backswamp behind the old supply landing |
| Surveyor's Waste | body `body.1284-3448` | imperial-penal-south | extrapolated | 3.7 ha of swamp written off in the same ledger |
| The Ninth Cordon Flats | body `body.1183-3666` | imperial-penal-south | extrapolated | 2.9 ha of fringe marsh the ledgers numbered |
| The Outer Lot | body `body.877-3568` | imperial-penal-south | extrapolated | the westernmost lagoon of the cordon shore |
| Tidewater Cordon | body `body.1096-3812` | imperial-penal-south | extrapolated | a small lagoon inside the old cordon line |
| The Transport Run | river `river.383-1037` | imperial-penal-south | extrapolated | the channel that carried the prison transports inland |
| Careening Mud | body `body.805-3530` | mercantile-coast | extrapolated | 2.5 ha of mudflat a hull can be laid over |
| Chandler's Flat | body `body.1851-3468` | mercantile-coast | extrapolated | fringe marsh behind the chandlers' shore |
| Eastmarsh | body `body.1626-3332` | mercantile-coast | extrapolated | 21 ha of swamp east of the Lilmoth road |
| First Basin | body `body.2183-3354` | mercantile-coast | extrapolated | the westernmost of the three Lilmoth lagoons |
| Inner Soundings | body `body.1899-3025` | mercantile-coast | extrapolated | swamp deep enough to sound at 4.6 m |
| Middlemarsh | body `body.763-3395` | mercantile-coast | extrapolated | 3.9 ha of fringe marsh between the two ports |
| Second Basin | body `body.2321-3388` | mercantile-coast | extrapolated | the middle of the three Lilmoth lagoons |
| Soulrest Outflats | body `body.315-3637` | mercantile-coast | extrapolated | 2.5 ha of fringe marsh outside Soulrest |
| Third Basin | body `body.2392-3320` | mercantile-coast | extrapolated | the easternmost of the three Lilmoth lagoons |
| Westreach Flats | body `body.182-3242` | mercantile-coast | extrapolated | fringe marsh at the province's western reach |
| the Keel-Sakka River | river `river.720-1110` | mercantile-coast | attested · Lore:Keel-Sakka River | the inland reach that passes 424 m from Lilmoth |
| the Keel-Sakka River | river `river.731-1121` | mercantile-coast | attested · Lore:Keel-Sakka River | its sea mouth, 464 m from Lilmoth |
| Oliis Bay (alias Tikmak) | sea region `sea.oliis-bay` | mercantile-coast | attested · Lore:Oliis Bay | the bay at whose mouth Lilmoth sits |
| Topal Bay | sea region `sea.topal-bay` | mercantile-coast | attested · Lore:Topal Bay | the south-west water off the Soulrest coast |
| First Stake | body `body.1785-2769` | naga-kur-deeps | extrapolated | the northern of three swamp pans counted together |
| Nine-Teeth Pool | body `body.1299-2644` | naga-kur-deeps | extrapolated | a deep marsh pan on the northern edge of the deeps |
| Second Stake | body `body.1801-2830` | naga-kur-deeps | extrapolated | the middle of three swamp pans counted together |
| The Black Throat | body `body.992-2622` | naga-kur-deeps | extrapolated | deep marsh 3.9 m to its floor |
| The Bone Yard | body `body.610-3266` | naga-kur-deeps | extrapolated | shallow swamp that gives up what falls in it |
| The Drowned Count | body `body.486-3253` | naga-kur-deeps | extrapolated | 2 ha of swamp held at 3.2 m |
| The Held Under | body `body.845-2758` | naga-kur-deeps | extrapolated | a backswamp at 0.34 m, never draining |
| The Skinning Pool | body `body.1592-2879` | naga-kur-deeps | extrapolated | deep marsh 3.4 m to its floor |
| The Wide Kill | body `body.1703-3069` | naga-kur-deeps | extrapolated | 2.8 ha of shallow swamp |
| Third Stake | body `body.1828-2760` | naga-kur-deeps | extrapolated | the eastern of three swamp pans counted together |
| The Dragging | river `river.483-972` | naga-kur-deeps | extrapolated | 1.6 km of channel that barely falls |
| The Short Count | river `river.253-1134` | naga-kur-deeps | extrapolated | 774 m of channel carrying 6.6 km of catchment |
| The Slow Take | river `river.442-1006` | naga-kur-deeps | extrapolated | 1.3 km of clearwater through the inner swamp |
| Three-Stakes Run | river `river.398-1023` | naga-kur-deeps | extrapolated | whitewater falling south-west into the deeps |
| the Bramman (alias Red Bramman's river) | river `river.292-1189` | naga-kur-deeps | attested · Lore:Soulrest | the province's one long interior-to-sea river in the south-west, its mouth between Soulrest and Blackrose and navigable inland, as the dossier describes |
| the Southern Sea | sea region `sea.southern-sea` | naga-kur-deeps | attested · Lore:Southern Sea | the open water along the southern coast |
| No-Bottom | body `body.1912-542` | pirate-freeholds | extrapolated | 1.1 ha of deep marsh whose floor nobody has poled |
| Broad-Mouth Bight | body `body.2708-2773` | saxhleel-coast | extrapolated | a lagoon open wide to the sea |
| Deep-Mouth Basin | body `body.2698-2822` | saxhleel-coast | extrapolated | a small lagoon 4.7 m to its floor |
| Drinks-The-Rain | body `body.2768-2033` | saxhleel-coast | extrapolated | 2.1 ha of fringe marsh that swells in the wet season |
| Drops-Away-Quickly | body `body.2834-2585` | saxhleel-coast | extrapolated | the deepest lagoon in the province at 6.5 m |
| Holds-The-Whole-Tide | body `body.2811-2151` | saxhleel-coast | extrapolated | the largest lagoon in the province at 2 ha |
| Least-Mouth Basin | body `body.2847-2309` | saxhleel-coast | extrapolated | the smallest lagoon of the Archon shore |
| Low-Branch Water | body `body.2436-2699` | saxhleel-coast | extrapolated | swamp under the lowest canopy on the coast |
| Shallow-Step Ground | body `body.2789-2031` | saxhleel-coast | extrapolated | fringe marsh stepped down to the shore |
| Slack-Water Ground | body `body.2587-2077` | saxhleel-coast | extrapolated | swamp held at 5 m where the flow stops |
| Small-Mouth Basin | body `body.2596-2692` | saxhleel-coast | extrapolated | a lagoon with a narrow opening to the sea |
| Thin-Mouth Bight | body `body.2639-2290` | saxhleel-coast | extrapolated | the shallowest lagoon of the eastern shore |
| Two-Rope Bight | body `body.2578-2663` | saxhleel-coast | extrapolated | a lagoon two ropes wide at its mouth |
| Waits-For-The-Tide | body `body.2508-2288` | saxhleel-coast | extrapolated | 1.6 ha of swamp that rises with the sea |
| the Archon Estuary | river `river.879-763` | saxhleel-coast | attested · Lore:Archon | the estuary mouth 571 m north of Archon |
| the Padomaic Ocean | sea region `sea.padomaic-ocean` | saxhleel-coast | attested · Lore:Padomaic Ocean | the open water east of Archon |

Candidates NOT landed (catalogue waters with no body close enough to join):
`Charge Pond` (dunmer-north; nearest body `body.2673-71`, 371 m),
`Bare Lake` (imperial-penal-south; nearest `body.1602-3188`, a 327 m2 swamp 144 m away),
`The Singing Ponds` (imperial-penal-south; the record carries no anchor).

---

## 11. Roster (lane output, unreviewed)

`world/sources/registries/npcs.json` is now generated: `python3 -m
worldgen.npc_roster --apply` writes one record per live `notableNpcSlots`
post under world 92 §84. `--check` proves the rule holds. **The names below have
not been through the `text-review` skill.** They are here so a reviewer can
read a spread of them without opening a 474-entry file.

### Counts

| | |
|---|---|
| records | 474 (472 slot posts + the two principals, who hold no slot) |
| cast joins | 11, all from §3 of `16g-mining.md` |
| cap repairs (a blocked pick taken to the next pool item) | 152 |

By region: dunmer-north 141, imperial-fringe 93, hist-heartland 77,
mercantile-coast 60, naga-kur-deeps 34, imperial-penal-south 30,
pirate-freeholds 22, saxhleel-coast 17.

By race: argonian 403, imperial 41, dunmer 17, khajiit 8, bosmer 2, breton 1,
nord 1, redguard 1. By name form: jel 289, translated 94, foreign 71,
epithet 16, chosen 4. By sex: 221 female, 253 male.

### Sample — 40 names across every region and form

| name | form | race / sex | region | the post (noun phrase; the record holds the full slot text) |
|---|---|---|---|---|
| Field-Holder Uxa-Meen | jel | argonian / female | dunmer-north | the field-holder |
| Tsono-Tei | jel | argonian / female | dunmer-north | the eldest caretaker |
| Neras Sendas | foreign | dunmer / male | dunmer-north | the Dunmer claimant's factor |
| Swims-The-Loose-Plank | translated | argonian / male | dunmer-north | the vicecanons' surveyor |
| Cuts-The-Turning-Tide | translated | argonian / male | dunmer-north | the keeper of the notched post |
| Velas Telvayn | foreign | dunmer / male | dunmer-north | the landlord's grandson |
| Walks-Out | chosen | argonian / female | dunmer-north | the assessor from the ex-managers' family |
| Two-Boats | epithet | argonian / male | dunmer-north | the captain |
| Begins-Again | chosen | argonian / female | dunmer-north | the runaway |
| Three-Rings | epithet | argonian / female | dunmer-north | the hoist crewman |
| Zaxi-Vei | jel | argonian / male | hist-heartland | the chime-maker |
| Nesh-Meen | jel | argonian / female | hist-heartland | the deelith |
| Holds-The-Long-Season | translated | argonian / female | hist-heartland | the hideout's broker |
| Opens-the-Last-Door | translated | argonian / male | hist-heartland | the camp's speaker |
| Knows-The-Whole-Quay | translated | argonian / female | imperial-fringe | the fire-watcher |
| Holds-The-Key-To-The-Shed | translated | argonian / male | imperial-fringe | the four corner-holders |
| Marcina Faustina | foreign | imperial / female | imperial-fringe | the heir |
| Sergia Gemellus | foreign | imperial / female | imperial-fringe | the ghost whom the city calls Tavia |
| Long-Shanks | epithet | argonian / male | imperial-fringe | the keeper |
| Deem-Vakka | jel | argonian / female | imperial-fringe | the fair-reeve elected for the week |
| Kaska-Wai | jel | argonian / male | imperial-fringe | the water-holder |
| Hook-Thumb | epithet | argonian / male | imperial-fringe | the four captains |
| Signs-The-Sealed-Crate | translated | argonian / male | imperial-penal-south | speaker |
| Ussa-Rekh | jel | argonian / male | imperial-penal-south | Chainbreaker envoy camped on the causeway |
| Khazir | foreign | khajiit / male | imperial-penal-south | the one person |
| Third-Born Xeekh | epithet | argonian / male | imperial-penal-south | third-generation Rose family head |
| Tavynu Dalomax | foreign | dunmer / female | imperial-penal-south | island-core castellan |
| Meets-The-Season-Price | translated | argonian / female | imperial-penal-south | Rose liaison |
| Low Ossu | epithet | argonian / female | imperial-penal-south | Night-Reed fence working out of a tent |
| Reeh-Rekh | jel | argonian / male | imperial-penal-south | deck-master at the village's south end |
| Argues-The-Sealed-Crate | translated | argonian / female | mercantile-coast | the one customs clerk |
| Buys-The-Quay-Rent | translated | argonian / male | mercantile-coast | Marsh Charter factor |
| Titus Venatius | foreign | imperial / male | mercantile-coast | raft-quarter speaker |
| Zabhila | foreign | khajiit / female | mercantile-coast | field-holder |
| Slow Xeekh | epithet | argonian / female | mercantile-coast | keeper of the working defences |
| Bent-Spine | epithet | argonian / male | mercantile-coast | Night-Reed fence |
| Xuth-Moro | jel | argonian / male | mercantile-coast | valuer |
| Kaska-Moro | jel | argonian / male | mercantile-coast | third-Hist tree-minder (neutral broker) |
| Bux-Jei | jel | argonian / female | naga-kur-deeps | the nisswo |
| Vees-Duun | jel | argonian / male | naga-kur-deeps | the ka-deelith |

### Cast without a slot — for Fable, not invented here

The mining pass found no catalogue slot for these written cast members, so the
generator made none. Each needs either a slot in the record that already holds
them or a written reason they are placeless: Nesh-Deeka, Holds-the-Reed
(both kept as entries, homed on their place with no slot index),
Never-Writes-Twice, Spills-The-Ink, Ei-Tuja, Sings-Over-Stone,
Cuts-the-Old-Knot, Walks-Against-Current, Ahnjazzi, The Last Warden,
Ux-Teeba the Last, Ohl-Katta, Rasha, Iiran-Vekh, Deep-In-Her-Cups,
the Eel-Keeper, Tsuun-Wai, Silt, Sails-By-Morning, Ka-Deelith Ushu,
Halvar the Damp, Yeel-Nakka, Xul-Nasha, Tarien Loryn, Zaxeel of the Jade Mask,
Hana-Vei, Sap-Speaker Miril-Tei, Tuwul of Gloommire, Route-Keeper Sesha-Ku,
Captain Salt Ma'ren, the toll-holder at the Chain, Anseia Martius, Hisska,
Advocate Oshu-Kai, Never-Sold, Grave-Singer Ossu, Vicecanon Neetra-Sei,
Andas Verano, Keeps-The-Count, Still-Wet, Neexa-Tul, Waykeeper Tuxo,
Dravyna Andalen, Oleen-Tei, the Wet Consort.

## 13. Text review of names and roster

Reviewed by a separate agent under the `text-review` skill, against style
guide 1.3, 1.5, 1.6 and 2.5–2.8, `ai-writing-tells.md`, quests 35 54 and the
per-region naming register in `world/sources/catalogue/README.md`. Names whose grounding
is attested were not touched.

### Set 1 — `world/sources/hydrology/names.json`, 25 of 153 names changed

Defect classes found:

1. **Portentous abstraction in the hist-heartland register.** The register
   asks for a definite-article *condition* ("The Held Breath", "The Lit Fen").
   Eighteen names had drifted into virtue nouns: patience, consent (three
   times), promise (twice), grace, mercy, forbearance, silence, impatience.
2. **Twinned pairs and near-identical names.** The Slow/Broad/Last Consent,
   The Kept/Falling Promise, The Still Hour/The Second Stillness; the
   naga-kur-deeps pair The Short Count and The Drowned Count; the
   saxhleel-coast "-Mouth" family of five (Small-, Thin-, Deep-, Broad-,
   Least-Mouth).
3. **The saxhleel-coast clause share.** Its README row is the register "at its
   purest — over half the names are a clause", but only 4 of 13 were clauses.
   Owner ruling applied: the README row wins over the one-third cap, which is
   a cast-list rule. Eight of 13 are now clauses.
4. Names that did not describe the feature their `why` names (Low-Branch Water
   is under the canopy, not a branch of water; Broad-Mouth Bight is about the
   sea, not a mouth).

No "whispering", "forgotten" or "ancient" was present; capitalisation already
followed 1.3.

The check now reads its shares from the register rows rather than one global
cap: `CLAUSE_SHARE_MIN = {"saxhleel-coast": 0.5}` with every other register
held to `CLAUSE_SHARE_DEFAULT_MAX = 1/3`
(`tooling/world-generation/worldgen/hydrology_names.py`). Both directions were
made to fail on purpose before being trusted: a minimum of 0.95 on
saxhleel-coast produced its error, as did a 0.5 minimum on hist-heartland.
`test_hydrology_names.py` now carries both tests.

| before | after | why |
|---|---|---|
| The Sunken Patience | The Standing Fen | virtue noun for "holds its level all year" |
| The Slow Consent | The Inner Pan | one of three Consents |
| The Green Silence | The Closed Canopy | the `why` is closed canopy |
| Broad-Mouth Bight | Opens-To-The-Sea | one of five "-Mouth" names; also the clause share |
| The Great Falling | The Great Fall | the portentous gerund |

### Set 2 — `world/sources/registries/npcs.json`, about 96 of 474 names changed

Fixed in the pools (`name_forms.py`) and one form-choice table
(`npc_roster.py`), then `--apply` re-ran; the file itself was not hand-edited.

1. **Composed translated names were not translations.** The fallback took a
   blind verb x object cross-product, so 78 of the 94 translated names were
   clauses no translator would produce: "Prices-The-Season-Price",
   "Meets-The-Damp-Lot", "Opens-The-Open-Shed", "Swims-The-Cold-Morning",
   "Hires-The-Quay-Rent". `TRANSLATED_VERBS`/`TRANSLATED_OBJECTS` are replaced
   by `TRANSLATED_COMPOSED`, which gives every verb its own objects; the
   diagonal walk and the dedupe are unchanged.
2. **An attested name reproduced.** The Jel pool composed **Deem-Ra**, a name
   from Lore:Argonian Names, against the module's own rule that its stems
   never rebuild an attested name. The stem `Deem` became `Deesh` (14 names
   respelt).
3. **Grand translated clauses.** Five authored ones read as gravitas rather
   than as a plain or comic literal translation.
4. **Sex-wrong foreign names.** The Imperial nomen pool held the feminine
   *Faustina* and could hand it to a man; the Khajiit pool was unsexed, so
   *Dar'Jeen* (a male honorific) sat on a woman. Khajiit is now keyed by sex
   like the other foreign pools.
5. **Dunmer forms.** *Rethan* is an estate name, and *Mavon* and *Sindri* are
   not female Dunmer given forms.
6. **Repetition across places.** Three names turned on The-Small-Debt; one
   remains.

| before | after | why |
|---|---|---|
| Prices-The-Season-Price | Prices-The-Salvage | the verb and its object were the same word |
| Meets-The-Damp-Lot | Meets-The-Season-Boat | a factor meets hulls, not lots |
| Deem-Ra | Deesh-Ra | Lore:Argonian Names rebuilt from the stems |
| Dar'Jeen (female) | Dar'Jeen (male) | Dar' is a male honorific |
| Holds-The-Long-Patience | Waits-It-Out | grand, where the form is plain or comic |

### Checks, verbatim

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
names. Nothing committed.

## 10. Promises (lane output, unreviewed)

The world 70 §48 interior promise vocabulary, filled on all 327 dungeon-kind
records and the 155 buildings by `worldgen.migrate_interior_promises`, with the
quest-asked pins added by `worldgen.quest_promises`. The family realisation
recipes are `world/sources/catalogue/interior-recipes.json`; the schema is
`worldgen/catalogue.py` at schemaVersion 3.

Loop distribution after the 2026-09-19 precedence (vertical entrance first,
then standing water, then a second entrance, then size): none 125,
second-entrance 82, water-loop 57,
shortcut-back 41, vertical-return 22.

### Facts varied for variety

§48 rule 1 forbids two dungeon-kind records of one family within 2 km agreeing
on more than three of the seven promise axes. 292 pairs came out of the
derivation. The defaults pass (light, an optional room, clearance, the S2 loop)
and then a varied FACT on the higher-sorting record of each stubborn pair
(owner ruling 2026-09-19: one size band up, or one more entrance above S1, then
the exterior shell) brought that to 49.

These 83 records had a fact changed to make them a different place rather
than a differently-lit copy of the neighbour. The change is recorded on the
record itself as `interior.factsVariedForVariety`, so the pass is idempotent
and this list can be regenerated. Everything derived from the changed fact —
room cap, swim distance, clearance, loop, socket set — was recomputed from it.

| Place | Fact varied |
|---|---|
| `dunmer-north.feeds-the-north` | sizeBand S1 -> S2; exteriorShell -> True |
| `dunmer-north.hackwing-wall` | sizeBand S1 -> S2; exteriorShell -> True |
| `dunmer-north.murkwater` | entranceCount 1 -> 2 |
| `dunmer-north.the-drawdown-flats` | sizeBand S1 -> S2 |
| `dunmer-north.the-first-count` | sizeBand S1 -> S2 |
| `dunmer-north.the-guar-ground` | sizeBand S1 -> S2; exteriorShell -> True |
| `dunmer-north.the-high-wrappings` | sizeBand S1 -> S2; exteriorShell -> True |
| `dunmer-north.the-north-cut` | sizeBand S0 -> S1; exteriorShell -> True |
| `dunmer-north.the-permit-dig` | sizeBand S1 -> S2; exteriorShell -> True |
| `dunmer-north.the-salt-ledge` | sizeBand S1 -> S2; exteriorShell -> False |
| `dunmer-north.the-stormhold-falls-chamber` | sizeBand S1 -> S2; exteriorShell -> True |
| `dunmer-north.the-whispers-dig` | sizeBand S1 -> S2; exteriorShell -> False |
| `dunmer-north.the-wild-mouth` | sizeBand S1 -> S2; exteriorShell -> True |
| `dunmer-north.went-down-slowly` | sizeBand S1 -> S2 |
| `dunmer-north.zuuk` | entranceCount 1 -> 2; exteriorShell -> False |
| `hist-heartland.bubble-spire-collapsed` | sizeBand S1 -> S2; exteriorShell -> True |
| `hist-heartland.burn-scar-village-ash` | sizeBand S0 -> S1; exteriorShell -> False |
| `hist-heartland.canopy-crossing-rope-basin` | sizeBand S1 -> S2; exteriorShell -> True |
| `hist-heartland.climbable-ruin-roof-terrace` | sizeBand S1 -> S2; exteriorShell -> True |
| `hist-heartland.collapsing-pinnacle-interior` | entranceCount 1 -> 2 |
| `hist-heartland.drowning-narrows-current` | sizeBand S0 -> S1; exteriorShell -> True |
| `hist-heartland.hackwing-roost-wild` | sizeBand S0 -> S1; exteriorShell -> True |
| `hist-heartland.hammock-crown-ancestor` | sizeBand S1 -> S2; exteriorShell -> True |
| `hist-heartland.legendary-deep-medusa-wood` | entranceCount 1 -> 2 |
| `hist-heartland.miregaunt-ward-approach` | sizeBand S0 -> S1; exteriorShell -> True |
| `hist-heartland.root-gallery-collapsed-nine` | sizeBand S1 -> S2; exteriorShell -> True |
| `hist-heartland.root-gallery-drowned-stair` | sizeBand S1 -> S2; exteriorShell -> True |
| `hist-heartland.root-gallery-kept-light` | sizeBand S1 -> S2; exteriorShell -> True |
| `hist-heartland.root-gallery-lantern-hollow` | sizeBand S1 -> S2; exteriorShell -> True |
| `hist-heartland.rootworm-burrow-dead` | sizeBand S1 -> S2 |
| `hist-heartland.rootworm-burrow-live` | entranceCount 1 -> 2; exteriorShell -> True |
| `hist-heartland.sap-touched-miredancer` | entranceCount 3 -> 4; exteriorShell -> True |
| `hist-heartland.squatted-ruin-home-hollow` | sizeBand S1 -> S2; exteriorShell -> True |
| `hist-heartland.tended-xanmeer-pilgrim-way` | sizeBand S1 -> S2 |
| `hist-heartland.umpholo-mission` | entranceCount 2 -> 3; exteriorShell -> False |
| `hist-heartland.voriplasm-chamber-sealed` | entranceCount 1 -> 2 |
| `hist-heartland.waiting-vigil-village` | entranceCount 3 -> 4; exteriorShell -> True |
| `hist-heartland.wamasu-wallow-struck-ground` | sizeBand S0 -> S1; exteriorShell -> True |
| `hist-heartland.whitewater-reach-panther` | sizeBand S0 -> S1; exteriorShell -> True |
| `hist-heartland.wisp-lure-basin` | sizeBand S0 -> S1; exteriorShell -> True |
| `imperial-fringe.collections-dig` | sizeBand S1 -> S2; exteriorShell -> True |
| `imperial-fringe.orma-tactile-ruin` | entranceCount 1 -> 2; exteriorShell -> False |
| `imperial-fringe.rufios-landing` | sizeBand S1 -> S2 |
| `imperial-fringe.silver-mouth` | sizeBand S1 -> S2; exteriorShell -> False |
| `imperial-fringe.sink-field` | sizeBand S0 -> S1; exteriorShell -> True |
| `imperial-fringe.the-cold-lights` | sizeBand S1 -> S2; exteriorShell -> True |
| `imperial-fringe.the-drowned-furrow` | sizeBand S1 -> S2; exteriorShell -> True |
| `imperial-fringe.the-empty-steading` | sizeBand S1 -> S2; exteriorShell -> False |
| `imperial-fringe.the-niben-crystal-workings` | sizeBand S1 -> S2; exteriorShell -> False |
| `imperial-fringe.the-quiet-pit` | sizeBand S1 -> S2 |
| `imperial-fringe.the-second-empire-locks` | sizeBand S1 -> S2 |
| `imperial-fringe.the-white-throat` | sizeBand S1 -> S2 |
| `imperial-fringe.vanins-signal` | sizeBand S0 -> S1 |
| `imperial-penal-south.cordon-cellars` | entranceCount 2 -> 3; exteriorShell -> False |
| `imperial-penal-south.drawdown-flat` | sizeBand S1 -> S2; exteriorShell -> True |
| `imperial-penal-south.intact-fort` | entranceCount 2 -> 3; exteriorShell -> False |
| `imperial-penal-south.kothringi-ruin-basin` | entranceCount 2 -> 3; exteriorShell -> False |
| `imperial-penal-south.lilmothiit-quarry` | entranceCount 2 -> 3; exteriorShell -> True |
| `imperial-penal-south.natural-dive-shaft` | entranceCount 2 -> 3; exteriorShell -> True |
| `imperial-penal-south.rose-outworks` | entranceCount 2 -> 3; exteriorShell -> False |
| `mercantile-coast.alessian-hull` | sizeBand S1 -> S2; exteriorShell -> True |
| `mercantile-coast.insular-jungle-village` | entranceCount 2 -> 3; exteriorShell -> False |
| `mercantile-coast.naga-village-oliis` | sizeBand S1 -> S2; exteriorShell -> False |
| `mercantile-coast.rockpark` | entranceCount 3 -> 4; exteriorShell -> False |
| `mercantile-coast.root-gallery-murkmire` | entranceCount 3 -> 4; exteriorShell -> True |
| `mercantile-coast.sacked-customs-suburb` | entranceCount 2 -> 3; exteriorShell -> False |
| `mercantile-coast.stripped-village-north` | sizeBand S1 -> S2; exteriorShell -> False |
| `mercantile-coast.whitebone-reef` | sizeBand S1 -> S2; exteriorShell -> True |
| `naga-kur-deeps.air-pocket-station-deeps` | entranceCount 1 -> 2; exteriorShell -> True |
| `naga-kur-deeps.art-and-destroy-site-deeps` | entranceCount 1 -> 2 |
| `naga-kur-deeps.drifting-village-wet-mooring` | sizeBand S1 -> S2; exteriorShell -> True |
| `naga-kur-deeps.legendary-deep-feather-serpent` | entranceCount 1 -> 2 |
| `naga-kur-deeps.leviathan-bone-field` | sizeBand S1 -> S2; exteriorShell -> False |
| `naga-kur-deeps.raft-village-lashed` | sizeBand S1 -> S2; exteriorShell -> True |
| `naga-kur-deeps.root-whisper-village` | entranceCount 1 -> 2 |
| `naga-kur-deeps.sinkhole-mouth-deeps` | entranceCount 1 -> 2 |
| `naga-kur-deeps.wreck-submerged-barge` | sizeBand S1 -> S2; exteriorShell -> True |
| `pirate-freeholds.rim-snowline-hermitage` | sizeBand S1 -> S2; exteriorShell -> True |
| `saxhleel-coast.gap-reef` | entranceCount 2 -> 3; exteriorShell -> True |
| `saxhleel-coast.jungle-root-hollow` | sizeBand S1 -> S2; exteriorShell -> True |
| `saxhleel-coast.mangrove-air-pocket` | sizeBand S1 -> S2; exteriorShell -> True |
| `saxhleel-coast.outer-reef` | sizeBand S1 -> S2; exteriorShell -> True |
| `saxhleel-coast.terrace-village-ridge` | sizeBand S1 -> S2; exteriorShell -> False |

The 49 pairs that remain are listed one by one in
`worldgen/test_catalogue.py` (`KNOWN_SAMENESS_PAIRS`) with each pair's shared
facts. They need a change to `dangerTier`, `hostility` or `wetFraction` — world
facts, not defaults — so they are held for review rather than forced.

## 2. Plot review

Live records 580; plotted 567; homeless 13; typed-siting violations 8 (closing pass needs the solve result — see report); dead route fraction 0.095; seeding mode `seeded-from-committed`.

### Moves by region

No record moved.

Fifteen largest moves:

No record moved.

Reasoning: _(to be written by hand)_

### Status changes

No status changed.

Reasoning: _(to be written by hand)_

### Re-types

No record changed type.

Reasoning: _(to be written by hand)_

### Merges (design groups)

| designGroup | members | ids |
|---|---|---|
| `group.gandranen` | 2 | `place.dunmer-north.gandranen-library`, `place.dunmer-north.gandranen-ruins` |
| `group.helstrom` | 3 | `place.hist-heartland.guide-camp-gate-side`, `place.hist-heartland.helstrom`, `place.hist-heartland.rootworm-station-helstrom` |
| `group.lost-city` | 2 | `place.hist-heartland.lost-city`, `place.hist-heartland.xal-krona-making-ground` |
| `group.gideon` | 2 | `place.imperial-fringe.bonded-shed-of-the-onkobra`, `place.imperial-fringe.gideon` |
| `group.blackrose-siege-works` | 2 | `place.imperial-penal-south.akaviri-works`, `place.imperial-penal-south.rebellion-earthworks` |
| `group.rose-cordon` | 2 | `place.imperial-penal-south.plague-cordon`, `place.imperial-penal-south.rose-supply-town` |

Reasoning: _(to be written by hand)_

### Re-references (reachedVia / travelServiceEdges)

No route reference changed.

Reasoning: _(to be written by hand)_

### The city layouts

| id | gate | centre | gate→centre m | way m | polygon ha | footprintRadiusM | positionM == centre |
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

Reasoning: _(to be written by hand)_

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

Province total named live records of the three layers: 580 (gate 550–750: ok).

Reasoning: _(to be written by hand)_

### Clark–Evans

Median R = 1.123; zones evener than random: dunmer-north, imperial-fringe, imperial-penal-south, mercantile-coast, naga-kur-deeps, pirate-freeholds, saxhleel-coast.

| zone | n | area km² | mean NN m | expected m | R |
|---|---|---|---|---|---|
| dunmer-north | 126 | 7.56 | 150.5 | 137.3 | 1.096 |
| hist-heartland | 116 | 8.98 | 149.1 | 174.7 | 0.853 |
| imperial-fringe | 118 | 6.96 | 142.1 | 131.0 | 1.085 |
| imperial-penal-south | 39 | 0.93 | 134.4 | 104.1 | 1.291 |
| mercantile-coast | 63 | 3.51 | 157.6 | 144.8 | 1.088 |
| naga-kur-deeps | 39 | 2.6 | 198.0 | 176.2 | 1.123 |
| pirate-freeholds | 31 | 0.8 | 134.2 | 96.5 | 1.391 |
| saxhleel-coast | 35 | 1.72 | 161.9 | 132.3 | 1.224 |

Reasoning: _(to be written by hand)_

## 3. Close (2026-09-19)

- 16g delivered on the frozen world: 567 of 580 records sited, 240 typed
  remedies applied (`world/sources/sites/plot-remedies.json`; the reasoning is
  in [16g-remedy-plan.md](16g-remedy-plan.md), the rulings in decisions
  [0078](../../decisions/0078-places-adapt-to-the-frozen-world.md) items 8-12
  and [0080](../../decisions/0080-the-chain-runs-by-dependency-not-position.md)).
- Thirteen records stand in `world/sources/sites/plot-homeless-accepted.json`,
  the only homeless a seeded run tolerates.
- Minor networks: 171 tracks (121.9 km) and 134 waterway channels (55.9 km).
- One travel-service graph with road edges, transfer edges, berth walks
  (`jettyM`) and body-following hops; a harbour station per city (nine, in
  `world/sources/routes/harbour-stations.json`, Gideon's the bond-ferry
  landing station); a rootworm network in `rootworm-stations.json`.
- Design groups registered in `world/sources/catalogue/design-groups.json`,
  spread measured anchor to member.
- Interior promises refreshed (sameness pairs 198 down to 27) and the NPC
  roster re-applied (474 records).
- The known-red register is empty; six withdrawn requests are classified
  `withdrawn` until the next refreeze.
- The chain runs by dependency: receipts, `--check-stale`, cascade (0080).
- Backlog: the water bundle is missing 27 graph bodies (a 16c defect); the
  Blackrose lake is realised as `body.1284-3448`.

**Owner calls taken this round.** The pirate-freeholds zone water identity;
Blackrose's centre onto its lake (realised in 16h); the stronghold reserved at
the Empty Steading (reversible); the opening ring read as places.


## 0b. Pause point (2026-09-19) and the resume plan

Paused mid-step-3 at the owner's request (a session restart). Committed:
`faeede90` (step 1) and `dd5bfe4d` (step 2). Root causes found on the way:
the survey preferred a dead `refined/height-natural-rg.png` from
2026-09-09, so every height and slope sampled since 16b read about 17 m
low (deleted; the survey reads `height-rg.png`, which is the natural
array); `record_depth_grid` gave a body its maximum depth at every pixel
(now the compiled depth); prose lore ties had no typed form
(`sitingPrefs.nearWater` and `minDepthM` added); a homeless record kept
its stale dot (cleared). The second `--resolve-all` on the corrected
ground sites 579 of 580 (homeless: `place.imperial-fringe.the-stone-talkers-watch`).
The eight review packs under `16g-review/` were measured before the
height fix: their distance, water-kind and relation rows stand; their
slope, clearance and terrain-promise rows do not. Two lanes were mid-edit
at the pause and are uncommitted on disk: the fast-travel mechanism
(`travel_services.py`, the harbour and rootworm authored inputs) and the
minor networks (`compile_minor_routes/waterways`, the registry tracks).
Resume order: remedies per region into `plot-remedies.json` → promises
refresh and roster re-apply → text review → the chain run
`--from apply_sitings --through 16g` → gates → docs close → owner check.

# Province terrain scour — candidate sites

schemaVersion 1 · seed 1109 · 1172 candidate sites · with viewshed scores

Regenerate: `cd tooling/world-generation && python3 -m worldgen.terrain_scour`

## Authored-land area (Part 1 sizes the catalogue on this)

- **Authored land: 33.52 km²** (of a 54.4 km² bounding square).
- Open sea 16.46 km² · lakes 3.31 km² · deep river/channel 1.1 km².
- Of the authored land, 2.94 km² is shallow marsh (waded, poled, built on).
- authored land = province bounding square minus open water, where open water = ocean region + lake region + any cell with published water depth > 0.5 m. Shallow marsh (<= 0.5 m) counts as authored land: it is waded, poled and built on.

At module 95's Phase 11 fine-tempo density of 18–22 named POIs/km² over D0–D3 ground, 33.52 km² implies roughly 603–737 records if that rate applied everywhere; the D4–D5 rate of 8–12/km² pulls the real total down, and density is a per-region average with a causal shape, never a spread (0041, Part 3).

## Candidates by landform class

| landform | n | what it is |
| --- | --- | --- |
| `summit` | 52 | prominent local high point |
| `saddle` | 80 **(capped)** | pass between two highs |
| `ridge-end` | 80 **(capped)** | spur nose, ground falling away on most sides |
| `cliff-bench` | 79 | flat shelf against a rock face |
| `ravine` | 90 **(capped)** | incised cut, 4-12 m deep, steep walls |
| `gorge` | 60 **(capped)** | deep incision, > 12 m, steep walls |
| `box-canyon` | 60 **(capped)** | incised ground closed on most sides |
| `enclosed-clearing` | 6 | flat room ringed by higher land |
| `island` | 42 | land body separated by open water, 0.4-60 ha |
| `islet` | 50 **(capped)** | rock or bar under 0.4 ha |
| `flood-high` | 41 | dry rise in the flood plain |
| `confluence` | 30 | three or more channels meeting |
| `oxbow` | 18 | meander loop |
| `river-mouth` | 17 | channel meeting the sea |
| `waterfall` | 60 **(capped)** | > 5 m of channel drop in 45 m |
| `spring-head` | 49 | upstream terminus of a channel above 12 m |
| `cove` | 70 **(capped)** | sheltered inlet off the sea |
| `natural-harbour` | 13 | sheltered deep water with a landable shore |
| `headland` | 34 | promontory with water on most sides |
| `isthmus` | 60 **(capped)** | neck of land between two waters, 30-260 m |
| `land-bridge` | 50 **(capped)** | neck of land under 30 m — a crossing |
| `water-narrows` | 60 **(capped)** | channel pinch under 120 m — a chokepoint |
| `ford` | 60 **(capped)** | shallow narrow crossing with easy banks |
| `sinkhole` | 11 | closed depression with a rim |

## Candidates by region class

| region | n |
| --- | --- |
| border mountains | 260 |
| firm lowland | 196 |
| lake & standing water | 172 |
| rootland deep marsh | 110 |
| upland hills | 104 |
| fringe marsh | 90 |
| tropical jungle | 71 |
| interior swamp | 51 |
| mangrove forest | 39 |
| seasonal floodplain | 26 |
| ocean | 23 |
| coastal lagoon & salt marsh | 16 |
| deep river corridor | 9 |
| tidal delta | 5 |

## Candidates by danger band

D0: 47 · D1: 6 · D2: 164 · D3: 544 · D4: 202 · D5: 209

## Score spread (the supply's character)

- visibility p5/p50/p95: 0.057 / 0.190 / 0.428
- concealment p5/p50/p95: 0.448 / 0.925 / 1.000
- effort-to-reach p5/p50/p95: 0.088 / 0.305 / 0.625

## How to use this

This is *supply*, not a plan. Part 1 derives demand; Part 3 matches the two and records why each dot won its site. Caps are per class — a capped class means the province has more of that landform than the sweep reports, so raise the cap rather than assuming scarcity.

Every site can be surveyed in full with:

```
python3 -m worldgen.site_dossier --id <name> --x <x> --z <z> --radius 400
```

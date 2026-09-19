# Province terrain scour — candidate sites

schemaVersion 1 · seed 1109 · 1142 candidate sites · with viewshed scores

Regenerate: `cd tooling/world-generation && python3 -m worldgen.terrain_scour`

## Authored-land area (Part 1 sizes the catalogue on this)

- **Authored land: 33.77 km²** (of a 54.4 km² bounding square).
- Open sea 16.86 km² · lakes 0.55 km² · deep river/channel 3.21 km².
- Of the authored land, 1.33 km² is shallow marsh (waded, poled, built on).
- authored land = province bounding square minus open water, where open water is MEASURED: any cell whose published water depth exceeds 0.5 m. The ocean/lake/river split names which body each of those wet cells belongs to. Shallow marsh (<= 0.5 m) counts as authored land: it is waded, poled and built on, and so does `namedWaterThatIsNotDeepKm2` — ground the region raster calls ocean or lake where the water bake finds ankle depth or none.

At module 95's Phase 11 fine-tempo density of 18–22 named POIs/km² over D0–D3 ground, 33.77 km² implies roughly 607–742 records if that rate applied everywhere; the D4–D5 rate of 8–12/km² pulls the real total down, and density is a per-region average with a causal shape, never a spread (0041, Part 3).

## Candidates by landform class

| landform | n | what it is |
| --- | --- | --- |
| `summit` | 54 | prominent local high point |
| `saddle` | 80 **(capped)** | pass between two highs |
| `ridge-end` | 80 **(capped)** | spur nose, ground falling away on most sides |
| `cliff-bench` | 68 | flat shelf against a rock face |
| `ravine` | 90 **(capped)** | incised cut, 4-12 m deep, steep walls |
| `gorge` | 60 **(capped)** | deep incision, > 12 m, steep walls |
| `box-canyon` | 60 **(capped)** | incised ground closed on most sides |
| `enclosed-clearing` | 9 | flat room ringed by higher land |
| `island` | 60 **(capped)** | land body separated by open water, 0.4-60 ha |
| `islet` | 50 **(capped)** | rock or bar under 0.4 ha |
| `flood-high` | 70 **(capped)** | dry rise in the flood plain |
| `confluence` | 12 | three or more channels meeting |
| `oxbow` | 8 | meander loop |
| `river-mouth` | 10 | channel meeting the sea |
| `waterfall` | 60 **(capped)** | > 5 m of channel drop in 45 m |
| `spring-head` | 39 | upstream terminus of a channel above 12 m |
| `cove` | 70 **(capped)** | sheltered inlet off the sea |
| `natural-harbour` | 17 | sheltered deep water with a landable shore |
| `headland` | 14 | promontory with water on most sides |
| `isthmus` | 60 **(capped)** | neck of land between two waters, 30-260 m |
| `land-bridge` | 50 **(capped)** | neck of land under 30 m — a crossing |
| `water-narrows` | 60 **(capped)** | channel pinch under 120 m — a chokepoint |
| `ford` | 60 **(capped)** | shallow narrow crossing with easy banks |
| `sinkhole` | 1 | closed depression with a rim |

## Candidates by region class

| region | n |
| --- | --- |
| border mountains | 298 |
| firm lowland | 266 |
| rootland deep marsh | 111 |
| upland hills | 106 |
| fringe marsh | 90 |
| interior swamp | 77 |
| mangrove forest | 52 |
| lake & standing water | 48 |
| tropical jungle | 42 |
| ocean | 18 |
| seasonal floodplain | 17 |
| coastal lagoon & salt marsh | 7 |
| deep river corridor | 6 |
| tidal delta | 4 |

## Candidates by danger band

D0: 40 · D1: 11 · D2: 150 · D3: 626 · D4: 167 · D5: 148

## Score spread (the supply's character)

- visibility p5/p50/p95: 0.068 / 0.212 / 0.450
- concealment p5/p50/p95: 0.383 / 0.852 / 1.000
- effort-to-reach p5/p50/p95: 0.099 / 0.316 / 0.601

## How to use this

This is *supply*, not a plan. Part 1 derives demand; Part 3 matches the two and records why each dot won its site. Caps are per class — a capped class means the province has more of that landform than the sweep reports, so raise the cap rather than assuming scarcity.

Every site can be surveyed in full with:

```
python3 -m worldgen.site_dossier --id <name> --x <x> --z <z> --radius 400
```

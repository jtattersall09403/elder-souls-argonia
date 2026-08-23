# Part XII — Demographics and community expectations (§81–84)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.

## 81. Demographic fields

Demographics should be generated from:

- era;
- region and tribe territory;
- proximity to ports, borders and dependable roads;
- settlement purpose;
- faction control;
- migration and slavery history;
- disease history;
- current conflict;
- Hist access;
- local economy;
- route centrality.

```ts
interface DemographicPrior {
  id: DemographicPriorId;
  era: EraRange;
  region?: RegionId;
  settlementType?: SettlementTypeId;
  populationShares: Record<PopulationGroupId, Range>;
  confidence: SourceConfidence;
  sourceUrl: string;
  sourceImageHash?: string;
  author?: string;
  methodology?: string;
  notes?: string;
}
```

A deep Hist settlement and a port city should have different populations even at similar size.

## 82. Reddit demographic charts: supplied community priors

The referenced r/ElderScrolls demographic maps have now been supplied directly for eight population groups. They should be ingested into the source registry as **community-authored demographic priors**, not treated as canonical census data. Their strongest value is spatial: they encode a coherent fan interpretation of where outsider populations are concentrated and therefore provide useful priors for settlement populations, cultural mixing, architecture, trade, faction presence and encounter generation.

The attached charts give the following province-wide headline shares:

| Population group | Chart headline share |
|---|---:|
| Argonian | 72% |
| Dunmer | 10% |
| Imperial | 8% |
| Khajiit | 5% |
| Nord | 2% |
| Bosmer | 2% |
| Altmer | 1% |
| Redguard | 1% |

These rounded headline values total 101%, so they must be treated as approximate community estimates. No missing race should be inferred to have exactly zero population merely because a chart was not supplied.

The charts divide Black Marsh into seven broad spatial zones identifiable by their nearest labelled settlement anchors. The supplied percentages are:

| Chart zone / nearest anchors | Argonian | Dunmer | Imperial | Khajiit | Nord | Bosmer | Altmer | Redguard |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Stormhold / northern-western border | 75% | 22% | 2% | 2% | 7% | 2% | 2% | 2% |
| Thorn / northeastern-east zone | 75% | 20% | 2% | 1% | 3% | 1% | 1% | 1% |
| Helstrom / deep central interior | 97% | 1% | 1% | 1% | 1% | 1% | 1% | 1% |
| Gideon / western frontier | 70% | 3% | 22% | 6% | 1% | 1% | 1% | 3% |
| Soulrest / southwestern coast | 60% | 1% | 13% | 19% | 1% | 5% | 1% | 1% |
| Archon / southeastern-east coast | 79% | 15% | 5% | <1% | <1% | <1% | <1% | <1% |
| Blackrose–Lilmoth / southern zone | 80% | 3% | 7% | 6% | <1% | 10% | 3% | 1% |

Because the source graphics use rounded values independently by race, the rows are not expected to sum cleanly to 100%. The zone boundaries should be stored as traced community-map polygons or raster masks with source confidence metadata rather than being silently promoted into canonical political borders.

The pattern is useful and broadly reinforces the world architecture proposed here:

- **Helstrom/deep interior:** overwhelmingly Argonian. This strongly supports the deep-marsh core as culturally local, difficult for outsiders to penetrate and structurally unlike the peripheral cities.
- **Stormhold and Thorn:** large Dunmer minorities, with the northern edge also showing the strongest Nord presence. This supports a visibly Morrowind-facing northern frontier shaped by trade, migration, conflict and older slavery relationships.
- **Gideon:** the strongest Imperial concentration in the supplied set. This supports making the western fringe one of the clearest places to show imported Imperial infrastructure, estates, engineered roads/causeways and the remains or continuation of colonial institutions.
- **Soulrest:** the most mixed supplied zone and by far the strongest Khajiit concentration, alongside substantial Imperial and Bosmer minorities. Its settlement/economic grammar should therefore support maritime and overland trade, migration and mixed neighbourhoods.
- **Blackrose–Lilmoth:** still strongly Argonian but with notable Bosmer, Imperial, Khajiit and Altmer presence. This provides a basis for a cosmopolitan southern-waterway/coastal layer while retaining a Saxhleel majority.
- **Archon:** Argonian-majority with a substantial Dunmer minority and smaller Imperial presence, supporting an eastern coastal contact zone with a distinct social history from the western Imperial fringe.

These distributions should influence probability priors for ordinary NPC populations and culturally derived content, while **location-specific causal history remains authoritative**. A Dunmer trading enclave, Imperial expedition, Bosmer hunting party or Khajiit merchant flotilla can exist outside its statistically common zone when its reason for being there is explicit. Likewise a Hist-bound settlement inside a mixed region may remain almost entirely Argonian.

For source provenance, record the eight supplied image hashes:

| Population group | Supplied image SHA-256 |
|---|---|
| Argonian | `0b7b57ffa2034c05aa9733c75ee5a171645adaa017bf91b4b34aff3fc1b2cccb` |
| Dunmer | `73fd7908ba0f403624c7441f4d91c2ddee6a105246931bff104c200cb60c697d` |
| Imperial | `fabd0a31bbfcf295932f190f582331202efce6018b055ad66996715e528f427c` |
| Khajiit | `6f5cb1cfea7b8d5f131b28f4432980204382ffba93df75a3fcc4aef5a2c1c696` |
| Nord | `abc8974ede41c118a582ab2d8dbf8aae8b6bec1c4c3a2309c490587b4d2e1f95` |
| Bosmer | `4a35b259553f8f10ec62471f698437cd547f96bc7475368c2d0b45bbbc942679` |
| Altmer | `8812bf7375fbbecbf7f9af3a4db2656346735dfcb74b0000600d40603368470b` |
| Redguard | `c239a8ad42e812b99c11bfe211a36bd6ae016969d417ab5aaf60f045a4b340e8` |

If the original Reddit post is later located, add its author, URL, publication date, claimed era and methodology without changing the image-derived data unless the source itself corrects it.

## 83. Qualitative community themes

Available Reddit-linked discussions, fan projects and Black Marsh design discussions show recurring interest in:

- a province that feels alien and biologically distinct;
- deep Hist involvement;
- tribal and cultural variety among Argonians;
- dangerous interior marshes;
- underwater exploration;
- unusual transport and navigation;
- visible failed Imperial colonisation;
- ancient Xanmeers and lost peoples;
- varied landscapes beyond one continuous green swamp;
- the opportunity to play an Argonian in a homeland designed around amphibious capability.

This is a qualitative synthesis. It is not a representative survey. The design aligns well with those themes while retaining source confidence and fixed gameplay requirements.

## 84. Demographic design implications

- Deep rootlands should be overwhelmingly Saxhleel and culturally local in eras where lore supports that state.
- Ports and border cities can have mixed populations shaped by trade, occupation, slavery, migration and political history.
- Current tribes require distinct demographic and social rules.
- Historical peoples appear through archaeology after their disappearance.
- Small outsider expeditions need visible logistical support and motives.
- Demographic fields should affect architecture, language, services, factions, clothing, boats, food, religion and quest structure.

---


# Mangrove & coastal-gradient ecology — real-world grounding (Phase 10 round 4)

Why this doc: the owner requires the mangrove-forest region and the coastal
vegetation gradient to be grounded in real ecology/geomorphology, not only in
the mined mod evidence. This records the findings and the exact mapping onto
our fields. Consumers: `worldgen/regions.py` (class 14), `worldgen/build_palettes.py`
(palette 14 + coastal gradient), `worldgen/scatter.py` (coast/salt knobs).

## 1. Where mangroves occur (siting)

- **Sheltered, low-energy tropical/subtropical coasts**: estuaries, deltas,
  lagoons, tidal creeks, lee shores, mudflats. NOT exposed high-energy open
  coasts, sand beaches or rock. Shelter is a hard establishment requirement —
  mangroves attenuate waves but cannot colonise under them
  ([Coastal Wiki: Mangroves](https://www.coastalwiki.org/wiki/Mangroves),
  [ScienceDirect topic: Mangrove](https://www.sciencedirect.com/topics/earth-and-planetary-sciences/mangrove)).
- **Substrate**: fine muds/silts from riverine sediment deposition; densest
  stands in deltas/estuaries with regular deposition and moderate salinity
  gradients (Coastal Wiki).
- **Saline water**: mangroves are facultative halophytes — salt is their
  competitive advantage, not a need; hence they lose to freshwater swamp
  forest where salinity drops (up-estuary handover).
- **Intertidal elevation**: roughly between mean sea level / low-water and
  the spring high-tide line — they *stand in shallow water* at high tide.

**Field mapping** (`regions.py`): tidal flag (elevation ≤ tidal max, salinity
present) ∧ salinity ≥ 0.30 (geodesic-through-water salinity already encodes
shelter/estuary reach) ∧ near-sea band ∧ low slope (mudflat, not bank) ∧
soil ≠ rock ∧ NOT facing open sea (exposure = e^(−dist_to_open_sea/1200 m),
same construction as `climate-weather.png`'s storm channel). Class extends a
few tens of metres into shallow water (z ≥ −2 m) adjoining mangrove land so
the fringe genuinely stands in the intertidal.

## 2. Zonation (seaward → landward)

Controlled by hydroperiod (flooding duration/frequency) + soil salinity;
boundaries follow topographic/tidal-inundation contours, so edges are lobed
along creeks, never straight
([Coastal Wiki](https://www.coastalwiki.org/wiki/Mangroves); RS zonation
surveys, [ResearchGate tbl](https://www.researchgate.net/figure/Mangrove-canopy-height-formation-type-canopy-cover-and-dominant-species-derived-from_tbl2_275333292)).

| Zone | Real analogue | Our layer band |
|---|---|---|
| Pioneer/seaward fringe | Rhizophora/Avicennia at the water's edge, prop roots, the "wall" read from the sea | waterline trees, shore −25…+8 m, standing in 0–1.2 m water |
| Interior | dense closed canopy, low species diversity, root-cluttered, dark, near-bare understory (light + hypersaline soil suppress seedlings) | canopy band shore 0…90 m, root clusters, epiphyte moss, minimal shrub tier |
| Landward transition | transitional species → salt marsh / swamp forest / palms | palms + shrubs shore 60…160 m; beyond, class 4/3/7 take over |

## 3. Physical structure numbers

- **Belt width**: cross-shore belts are typically tens to a few hundred
  metres; >500 m belts are the global upper half, deltas reach km scale
  ([PMC: wave attenuation & green belts](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11968402/),
  [PMC: mangrove growth in flood-protection design](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10995189/)).
  → class-14 band capped at ~700 m from the sea.
- **Canopy height**: mostly 5–25 m (global RS products; tallest American
  stands ~40–60 m are exceptional) — our BM&V mangrove meshes at 0.7–1.15×
  native sit inside that.
- **Canopy gaps/dieback**: gaps 10–1000 m², modal 40–60 m², round/elliptic;
  lightning gaps ~300–2000 m²
  ([Moreton Bay gap study](https://www.sciencedirect.com/science/article/abs/pii/S0272771418301343),
  [Lassalle 2022](https://zslpublications.onlinelibrary.wiley.com/doi/full/10.1002/rse2.289)).
  → canopy uses the shared 90 m glade field (a 0.1 glade fraction ≈ tens of
  m² gaps) with high patchiness; gaps stay bare-ish (no lush gap-thicket tier
  — regrowth in mangal is more mangrove, not pioneer scrub).
- **Tidal creeks**: real mangals are threaded by creek networks — our
  hydrology's minor rivers and the delta class provide these; mangrove lines
  the channels (also canon: Bramman's mangrove-screened river,
  `world/sources/lore/regions/waters.md`).

## 4. Coastal influence as a gradient (all coasts, not just mangal)

Salt spray/soil salinity and marine climate grade over ~0.5–2 km inland:
salt-tolerant strand species (palms, succulents, kelp in the shallows) mix in
near any coast; salt-intolerant inland species (cypress, willows, ferns,
fungi, bamboo) thin toward the shore. Mapped as a per-layer response to a
**distance-to-coast field** (`coast_m`, derived from the ocean mask):
`factor = 1 + gain · e^(−(coast/half_width)²)`, gain positive for
salt-tolerant, negative for intolerant, half-widths 600–1000 m. Beaches stay
bare via ground-cover rules (bare sand/mud carries no grass — mined rule R10),
not via this gradient.

## 5. Canon anchors (lore golden rule)

- "Wall of mangroves about ten miles from Lilmoth, nigh-impenetrable … like
  thousands of giant spiders with their legs interlocked" —
  `world/sources/lore/regions/murkmire.md`, `topics/fauna-hazards.md` § Flora
  (UESP: Murkmire lore / Tender to the Mane).
- Mangrove-screened river mouth near Soulrest (Red Bramman, 1E 1033) —
  `topics/history-timeline.md`, `regions/waters.md`.
- Climate envelope: Black Marsh's south coast is tropical monsoonal
  (docs/research/black-marsh-climatology.md) — inside the real mangrove
  envelope (frost-free, high rainfall), so no climate gate is needed beyond
  the existing tidal/salinity fields.

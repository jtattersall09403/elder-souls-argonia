# Tropical fluvial geomorphology — rules for carving the mountain→wetland→coast journey

Research notes for the worldgen water pipeline (D8 drainage, depression fill, wetland/tidal/salinity/soil
masks, heightfield carving at 1.8 m/px). Everything is expressed as **rules over our fields**:
`A` = drainage area (km²), `S` = local channel slope (m/m), `z` = elevation (m), `d_coast` = distance to
coast, plus salinity / soil / wetland masks. Sources at the bottom; inline tags like [LM53] refer to them.

## 0. Scale mapping (read first)

Real hydrology at our literal scale gives streams, not rivers: A = 6 km² is a brook ~3–5 m wide
(regional curves, [B15]). Like Morrowind, the province compresses geography ~10–20×, so we keep
**real relative structure** (exponents, ratios, sequence of zones) but apply a **width multiplier**
so hierarchy tiers read correctly in-game. Suggested carved bankfull widths: minor 3–6 m,
medium 8–16 m, major 24–48 m, tidal/mouth reach 50–120 m. Depth and floodplain follow from the
ratios below, so the multiplier only needs applying once, to width.

## 1. River continuum: channel types from mountain to coast

Real controls: slope and drainage area select the channel type (Montgomery–Buffington channel-reach
classification [MB97]); discharge (∝ area) sets size (Leopold–Maddock hydraulic geometry [LM53]).

### 1.1 Hydraulic geometry (the sizing law)

Downstream (bankfull) relations, humid climates [LM53], [B15]:

- Width `W ∝ Q^0.5`, depth `D ∝ Q^0.4`, velocity `V ∝ Q^0.1` (exponents sum to 1).
- With `Q ∝ A^~0.8` in humid tropics, in terms of our field: **`W = k_w · A^0.4`, `D = k_d · A^0.3`**.
- Real coefficients (US humid regions, A in km², metres): `W ≈ 2.8·A^0.40`, `D ≈ 0.23·A^0.29` [B15].
  Use these for *ratios*, then scale W per §0.
- Useful derived ratios: width/depth ≈ 8–12 in mountain streams, 12–25 in meandering lowland
  reaches, 5–10 (deep, narrow) in blackwater/peat channels, >30 in tidal mouths.

### 1.2 Channel-type selection rules ([MB97] slope classes + tropical planform literature)

| Zone (carve this) | Occurrence rule | Channel form | Valley / cross-section | Bed material |
|---|---|---|---|---|
| Colluvial gully | `A < 0.1 km²`, `S > 0.10` | Discontinuous trickle, debris | Notch in hillside, no floodplain | Boulders, colluvium |
| Cascade / waterfall reach | `S > 0.065`, `A 0.1–1` | Tumbling whitewater, falls at knickpoints | **V-gorge**, walls 30–45°, valley ≈ 2–4× channel width | Bedrock + boulders |
| Step-pool mountain stream | `S 0.03–0.065`, `A 0.5–3` | Alternating 0.5–2 m rock steps and plunge pools (pool spacing ≈ 1–4 channel widths) | Narrow V, small terraces on bends | Boulder/cobble steps, gravel pools |
| Plane-bed upland creek | `S 0.015–0.03` | Straightish gravel run, riffles | Terraced valley, floodplain 2–6× W | Gravel/cobble |
| Pool–riffle / early meandering | `S 0.002–0.015`, `A > 2` (scaled) | Sinuosity 1.2–1.5, alternating pools (outer bends) and riffles (crossings) | Open valley, floodplain 5–10× W | Gravel → sand |
| Meandering lowland river | `S < 0.002`, low elevation, alluvial/clay soils | Sinuosity > 1.5; **point bars** (inner bend, sand, gentle slip-off slope), cut banks (outer bend, steep, 1–3 m), **levees** (0.5–2 m high, 1–4× W wide, sloping away from channel), **backswamps** beyond levees, **oxbows** in the meander belt | **Broad floodplain**, width ≈ meander-belt ≈ 10–20× W | Sand/silt bed, mud banks |
| Anastomosing / blackwater peat channel | `S < 0.0005`, peat/organic soil mask, wetland mask | Multiple stable interweaving channels around vegetated islands; narrow, **deep** (W/D 5–10), near-still | No levees to speak of; channel inset in flat peat plain | Peat, sunken logs, sand lenses |
| Tidal reach | `d_coast` small, salinity > 0, `z` < high-tide level | Funnel widening exponentially toward mouth (width can double every ~1–2 km real scale); bidirectional flow | Flat; fringed by mangrove/mudflat | Mud |

Carving depths: use `D` from §1.1; pools 1.5–2× reach depth; plunge pools 2–3×. Cross-sections:
V-shaped in bedrock zones, trapezoidal in gravel zones, asymmetric (deep outer / shelving inner) on
meander bends, rectangular-ish with steep peat banks in blackwater reaches, wide parabolic in tidal mud.

## 2. Water character: blackwater / whitewater / clearwater ([AW], [SIOLI], [RC])

| Type | Catchment rule (our fields) | Colour & clarity | Chemistry / feel | Examples |
|---|---|---|---|---|
| **Whitewater** (silt-laden) | Headwaters in the **mountain belt** (young, erodible slopes); any river whose upstream area includes high-erosion cells | Opaque café-au-lait / beige-brown | Neutral pH, nutrient-rich; fertile floodplains, most farmland/settlement | Amazon/Solimões, Madeira [AW] |
| **Blackwater** (tannin) | Headwaters **entirely in lowland sandy-podzol or peat cells** (no mountain contribution) | Dark tea/coffee; transparent but stained; near-black over depth | Acid (pH 4–5), nutrient-poor ("River of Hunger" [RC]); sparse settlement, sunken-log beds | Rio Negro [AW]; SE Asian peat-swamp rivers |
| **Clearwater** | Headwaters on old hard rock (low-erosion uplands), no peat, no silt source | Blue-green tint, high clarity, rocky bed visible | Low sediment, moderate nutrients | Tapajós, Xingu [AW] |

Rule for us: classify each river reach by **upstream soil composition** — any mountain/erosive
fraction > ~20% ⇒ whitewater; else peat/sandy fraction > ~50% ⇒ blackwater; else clearwater.
Where a blackwater tributary meets a whitewater trunk, keep a visible two-tone mixing zone
(the "meeting of waters" runs km downstream in reality [AW]) — a strong landmark.

## 3. Wetland taxonomy and terrain signatures ([WET], [KEDDY])

Position along the gradient: **fen/marsh fringe on mountain-foot seeps → riverine swamp + backswamp
along lowland rivers → raised peat bog domes in interfluves → freshwater marsh around the lake →
brackish marsh → mangrove at the coast.**

| Wetland type | Occurrence rule | Standing water & micro-relief signature |
|---|---|---|
| **Swamp** (forested, seasonally flooded) | Wetland mask ∩ within floodplain of a river (behind levees) or lake fringe; mineral/alluvial soil | 0–1 m seasonal water; hummock-and-hollow micro-relief (±0.3 m); buttressed trees standing in water; water stained brown |
| **Marsh** (herbaceous) | Wetland mask, alluvial soil, open (lake edges, deltas, tidal fringe) | 0–0.5 m permanent water, reeds/grasses; flat; open sightlines |
| **Backswamp** | Floodplain cells **beyond the levee**, lower than levee crest, between river and valley wall | Shallow (0.2–1 m) still water/mud, poor drainage, seasonal lakes; the classic "trackless" zone |
| **Bog** (raised, rain-fed, acidic) | Peat-soil mask on **interfluves** (locally high, low `A`, far from channels); rainfall-fed only | Domed peat rising 1–8 m above surroundings (SE Asian peat domes [PSF]); black acid pools in hollows; **drains outward**: blackwater streams radiate off the dome |
| **Fen** (groundwater-fed, less acid) | Peat/organic soil at **slope toes and valley margins** where groundwater emerges (mountain-foot belt) | Wet sedge lawn on gentle slope, thin sheet flow, no dome |
| **Oxbow lake** | Cut-off meander loop inside meander belt of medium/major rivers | Crescent lake, width ≈ old channel W, depth ≈ old channel D (2–5 m), length ≈ one bend (5–15× W); ringed by swamp |
| **Pond / floodplain lake** | Depression-fill cells in floodplain or peat plain | 0.5–2 m deep, tens of m across; black in peat, turbid in alluvium |
| **Tidal mudflat / salt marsh** | Salinity mask ∩ intertidal `z` band ∩ low wave exposure | Bare mud at low tide, dendritic **tidal creek networks** (see §4.3) |

## 4. River mouths and the coast

### 4.1 Delta vs estuary (Galloway triangle simplified [GAL], [BOS], [BRO])

Morphology = balance of **river sediment flux vs wave energy vs tidal energy**:

- **River sediment supply ≫ marine reworking ⇒ delta** with multiple distributaries (birds-foot
  /lobate, Mississippi-style) — requires a *whitewater* (sediment-laden) river and a **sheltered**
  coast. Our bay coast is sheltered ⇒ low wave energy ⇒ the biggest sediment-rich river **should
  build a delta**: 2–5 distributaries, marsh/mangrove between them, delta plain ~flat at sea level.
- **Low sediment (blackwater/clearwater) or exposed coast ⇒ single estuary mouth**: one drowned,
  funnel-shaped channel widening seaward, no protrusion. Blackwater rivers essentially never build
  deltas (nothing to build with).
- **High tidal range ⇒ tide-dominated mouth**: estuarine funnel with elongate mid-channel islands
  parallel to flow (Fly River style [BOS]). Use for the second-largest mouth if variety is wanted.

Game rule: `sediment_class == whitewater AND wave_exposure == sheltered` ⇒ delta;
otherwise ⇒ estuary funnel; add tidal bars if the funnel is wide.

### 4.2 Coast type by wave exposure / sediment / slope

| Coast type | Rule |
|---|---|
| **Mangrove shore** | Sheltered (bay-interior), muddy sediment, gentle slope (<~1%), tropical ⇒ default for our bay |
| **Sandy beach** | Moderate–high wave exposure + sand supply (near sandy-sediment river mouths, outer bay headland gaps) |
| **Rocky cove / cliff** | High wave exposure + steep coastal slope (where mountain spurs reach the sea); pocket beaches between headlands |
| **Open mudflat** | Sheltered + high tidal range + silt supply, seaward of mangrove fringe |

### 4.3 Mangrove zonation (seaward → landward bands) ([MZ], [AND])

1. **Pioneer fringe** on open mud: sparse low trees, pneumatophore "pencil-root" fields (Avicennia/Sonneratia analogue).
2. **Stilt-root wall**: dense prop-root forest lining channels and the forest front (Rhizophora analogue) — near-impassable on foot; boats use tidal creeks.
3. **Inner mangrove**: firmer mud, knee-roots, more open.
4. **Back-mangrove / transition**: brackish palms and ferns, hummocky ground, grading to freshwater swamp.
Band widths at game scale: ~20–80 m each. Zonation is set by flooding frequency, i.e. by `z` within the intertidal band — map bands directly to elevation slices.

**Tidal creeks**: dendritic networks incised in mudflat/mangrove, blind-ending landward; depth 0.5–2 m,
width tapering 10 m → 1 m; drainage density high (spacing ~50–150 m at our scale). Carve with a
separate small-scale D8 pass restricted to the intertidal mask.

## 5. Lakes and ponds — how common, where ([KEDDY], [WET])

Lowland tropical wet landscapes are **lake-rich**, but almost all lakes are small and floodplain-made:

| Lake type | Where (rule) | Typical size (game scale) | Frequency |
|---|---|---|---|
| Oxbow | Meander belts of medium/major rivers | 100–600 m long crescents | 1 per 2–5 meander wavelengths along mature reaches — dozens province-wide |
| Backswamp / flood-basin lake | Behind levees, floodplain lows | 50–400 m irregular blobs | Common; clusters |
| Blackwater bog pool | Peat dome hollows | 10–80 m | Scattered clusters |
| Structural / big inland lake | Regional basin (ours is given) | km-scale | 1 |
| Mountain tarn | High headwater bowls (`z` high, `A` small) | 30–150 m | Rare (0–3); tropical mountains at 650 m have few true tarns — justify with springs/landslide dams |
| Lagoon | Behind coastal barrier / between delta lobes | 100–800 m, brackish | 1–3 |

## 6. Master cheat sheet

| Type | Occurrence rule (our fields) | Carve (game-scale W × D, section, floodplain) | Water look | Bed |
|---|---|---|---|---|
| Mountain cascade | `S>0.065`, headwater | 2–4 m × 0.5 m; V-gorge 2–4× W; falls at knickpoints | White, foaming, fast, clear | Bedrock/boulder |
| Step-pool stream | `S 0.03–0.065` | 3–6 m × 0.5–1 m (pools 1.5 m); narrow V | Clear, turbulent | Boulder steps, gravel |
| Gravel creek | `S 0.015–0.03` | 4–8 m × 0.8 m; trapezoid; floodplain 2–6× W | Clear/slightly milky, brisk | Gravel |
| Pool–riffle river | `S 0.002–0.015`, `A` medium | 8–16 m × 1–1.5 m; asymmetric on bends; floodplain 5–10× W | Green-clear or milky per §2, moderate | Gravel→sand |
| Meandering major river | `S<0.002`, whitewater class | 24–48 m × 2–4 m; deep outer/shelving inner; levees 1–2 m; floodplain 10–20× W with oxbows + backswamp | Opaque tan, slow (0.3–1 m/s) | Sand bed, mud banks |
| Blackwater channel | `S<0.0005`, peat catchment | 6–20 m × 2–4 m (deep for width); steep peat banks, no levees | Near-black tea, glassy, ~still | Peat, logs |
| Tidal river / estuary | Salinity>0, intertidal `z` | Funnel 40 → 120 m × 3–5 m; mud banks | Turbid brown-green, bidirectional | Mud |
| Delta distributary | Whitewater mouth, sheltered coast | 15–40 m × 2–3 m, 2–5 branches | Turbid, slow | Mud/sand |
| Swamp | Floodplain ∩ wetland mask | 0–1 m water over hummocky ground | Brown-stained, still | Muck, roots |
| Marsh | Open wetland, alluvial soil | 0–0.5 m water, flat | Murky green-brown | Mud |
| Bog pool | Peat dome hollows | 10–80 m wide, 1–2 m deep | Black, acid, mirror-still | Peat |
| Oxbow lake | Meander belt | Crescent, old-channel W × 2–5 m | Blackish-green, still | Mud/organic |
| Mangrove creek | Intertidal mask | 1–10 m × 0.5–2 m dendritic | Turbid, tide-driven | Soft mud |
| Mountain tarn | High bowl, `A` small | 30–150 m × 3–10 m | Clear, cold-looking | Rock/gravel |

## Sources

- [LM53] Leopold & Maddock 1953, *Hydraulic geometry of stream channels* (USGS PP-252) — https://www.semanticscholar.org/paper/ffaed02dacd712b44bd9e7f7d43b717197ed7922 ; navigability summary https://pubs.usgs.gov/wsp/1539w/report.pdf
- [B15] Bieger et al. 2015, regional bankfull regression curves (USA), JAWRA — basis for `W≈2.8·A^0.40` coefficients
- [MB97] Montgomery & Buffington 1997, *Channel-reach morphology in mountain drainage basins*, GSA Bull. — slope-class thresholds (cascade/step-pool/plane-bed/pool-riffle)
- [SINGH] Singh 2003, downstream hydraulic geometry theory — https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2003WR002484
- [AW] Amazon Waters, river types — https://en.aguasamazonicas.org/waters/river-types/blackwater-rivers
- [SIOLI] Ponce, *Andes, Hylean, and Craton* (Sioli classification) — https://ponce.sdsu.edu/andes_hylean_craton.html
- [RC] Rainforest Cruises, Amazonian river types — https://www.rainforestcruises.com/guides/amazonian-river-types-blackwater-whitewater-clearwater
- [GAL] Galloway 1975 ternary diagram, quantified in Pani & Nienhuis — https://essopenarchive.org/users/569558/articles/1113473
- [BOS] Bosboom & Stive, *Coastal Dynamics* §2.7.3 delta classification — https://geo.libretexts.org/Bookshelves/Oceanography/Coastal_Dynamics_(Bosboom_and_Stive)/02:_Large-scale_geographical_variation_of_coasts/2.07:_Process-based_classification/2.7.3:_Classification_of_deltas
- [BRO] Broaddus et al. 2022, delta morphology from sediment flux balance, GRL — https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2022GL100355
- [MZ] Mangrove zonation & tidal sorting — https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2024.1368156/full ; genus distribution dataset https://www.nature.com/articles/s41597-024-03134-1
- [AND] Andaman creek zonation study — https://www.researchgate.net/publication/315459794
- [WET] Rainforest rivers/lakes/swamps overview — https://worldrainforests.com/06-rainforest-rivers-lakes-swamps.html
- [KEDDY] Keddy, *Wetland Ecology* (swamp/marsh/bog/fen definitions; standard taxonomy)
- [PSF] SE Asian peat swamp forests / peat domes (Page et al. lineage; domes rise metres above floodplain, shed blackwater radially)

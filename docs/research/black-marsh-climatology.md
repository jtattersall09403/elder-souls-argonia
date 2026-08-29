# Black Marsh macro-climatology: lore + real-world model (researched 2026-08-23)

The macro climate model for the province — canon-grounded, filled out with
real-world wetland climatology, and reduced to raster formulas over fields we
already compute. Module 50 §33.1 binds the summary; this doc is the detail
and the citations. Consumers: texture palettes, foliage, weather-state
frequencies, mist, flood cycle, disease/insects.

## 1. Canon anchors (UESP)

- **Tropical, hot, humid, monsoonal-wet baseline** — "the region's tropical
  climate…" ([Lore:Black Marsh](https://en.uesp.net/wiki/Lore:Black_Marsh),
  citing The Argonian Account); climate "similar to neighbouring Blackwood…
  though with denser vegetation."
- **Seasonal flooding is canon**: rivers "seasonally flood several feet";
  roads devoured by fast-growing grass; goods rot; travel defaults to boats
  (The Argonian Account via Lore:Black Marsh).
- **Mist/miasma is an identity trait**: "misty, mephitic inland bayous",
  interior air "poisonous" ([PGE3 Argonia](https://en.uesp.net/wiki/Lore:Pocket_Guide_to_the_Empire,_3rd_Edition/Argonia));
  disease/insect load is canon ([Tips for Black Marsh Travel](https://en.uesp.net/wiki/Lore:Tips_for_Black_Marsh_Travel)).
- **Coastal zonation is canon**: mangrove walls near Lilmoth and Soulrest
  (The Infernal City; PGE3); Lilmoth has palms, bamboo, rice plantations,
  glowing lucan mold, rainforest north of its gate ([Lore:Lilmoth](https://en.uesp.net/wiki/Lore:Lilmoth)).
- **Topography gradients are canon**: Murkmire "slopes down from the interior
  uplands of the north… fades into the ocean", a drowned coastline
  ([Online:Murkmire](https://en.uesp.net/wiki/Online:Murkmire)); Morrowind's
  Deshaan plain slopes down into Black Marsh — the N/NW border is a rising,
  *drying* gradient ([Lore:Deshaan](https://en.uesp.net/wiki/Lore:Deshaan)).
  Topal Bay is "placid" (sheltered); the Padomaic coast is open ocean; tides
  are moon-driven in lore ([Lore:Topal Bay](https://en.uesp.net/wiki/Lore:Topal_Bay)).
- **Soil palette hooks**: white limestone + dark topsoil interior (Infernal
  City); red clay around Gideon/Blackwood (Lore:Black Marsh).
- **Calendar**: Tamriel's 12 months ([Lore:Calendar](https://en.uesp.net/wiki/Lore:Calendar));
  the Argonian seasonal cycle has canonical names — Vakka, Xeech, Sisei …
  Nushmeeko, Saxhleel, Xulomaht ([Lore:The Seasons of Argonia](https://en.uesp.net/wiki/Lore:The_Seasons_of_Argonia)).
  No source fixes Black Marsh's rain timing, so a tropical summer monsoon
  with Rain's Hand onset is canon-compatible.

## 2. Real-world analogue findings

- **Wet/dry partitioning**: Everglades ~70–80% of rain in the wet season
  ([NPS](https://home.nps.gov/ever/planyourvisit/wetseason.htm)); Bangladesh
  shows a strong *spatial* gradient (~1,000→2,800 mm) within one province
  ([climate profile](https://www.climatecentre.org/wp-content/uploads/RCCC-Country-profiles-Bangladesh_2024_final.pdf)).
- **Flood pulse lags rain by 1–2 months and more downstream**: Tonlé Sap
  rises ~1.5 m → ~9 m, area ×5–6, peaking Aug–Oct
  ([HESS 2022](https://hess.copernicus.org/articles/26/609/2022/));
  Pantanal pulse travels north→south over months, micro-topography ×
  inundation duration builds the habitat mosaic
  ([IOPscience](https://iopscience.iop.org/article/10.1088/1748-9326/ab4ffe)).
- **Coastal vs inland**: maritime damping of temperature swings; sea breeze
  carries humidity/showers 10–30 km inland; **two fog regimes** — advection
  sea fog on coasts vs radiation/valley fog inland on clear calm nights over
  wet ground, pooling in low terrain, burning off after dawn
  ([NWS fog tutorial](https://www.weather.gov/lmk/fog_tutorial)). Ground
  mist therefore *peaks in the dry/recession season* — gameplay-gold.
- **Altitude**: lapse ~6.5 °C/km; orographic rain maxes on windward
  *mid-slopes*; rain shadow on the lee; tropical montane cloud forest belt
  descends to ~500–700 m on small coastal ranges (mass-elevation effect)
  ([Britannica](https://www.britannica.com/science/cloud-forest-ecology)).
  The lee-side aridity *explains Deshaan in-fiction*.
- **Salinity zonation**: estuary salinity ~35→5 ppt within ~13 km upriver,
  mangroves zoned along it ([MDPI Ruvu estuary](https://www.mdpi.com/2073-4441/17/23/3404)).
  Canonical coast→interior ladder: mangrove → brackish marsh/mudflat →
  freshwater marsh/reed → swamp forest → terra-firme rainforest → foothill
  forest → cloud forest → crag.

## 3. The field model (implementable now)

Inputs we already have: `v` (N–S coord), `dCoast` (from the ocean mask),
`elev` + aspect, `salin`, `wet` (TWI/wetlands), plus a global season scalar
`s(t)` ∈ [−1 dry … +1 wet] and a flood lag map. Derived macro fields:

| Field | Formula sketch | Drives |
|---|---|---|
| T temperature | `30°C − 3.5·v − 6.5·elev_km`, swing damped by `exp(−dCoast/20km)` | palettes, foliage, (frost only above ~3.5 km-equivalent peaks) |
| H humidity | `0.55 + 0.3·wet + 0.2·exp(−dCoast/15) − alt term + 0.15·s` | palettes, vegetation density, disease |
| M mist | radiation term `wet·calm·dryNightBias` (inland basins, dawn, dry season) + advection term `exp(−dCoast/8)` (sea fog up estuaries) + cloud-belt term `bell(elev, 600–1500 m)` | fog/visibility, three distinct mist looks |
| R rain amplitude | `0.5 + 0.3·windward + 0.2·exp(−dCoast/40)` | weather frequencies, grass regrowth |
| X storm exposure | `exp(−dCoast/10)` on open-ocean coasts, low in the placid bays, plus orographic term | sea squalls, coastal wrecks |
| F flood | amplitude `wet·√flowAccum·R(upstream)`, phase lagging `s(t)` 1–2 months, later downstream | FloodBasin seasonal states, tides added where `salin` high |

Season names for states: Dry (Vakka/Xeech/Sisei) → Rain onset (Rain's Hand /
Hist-Deek) → Monsoon (Second–Last Seed) → Flood peak (Hearthfire–Frostfall)
→ Recession + heaviest dawn mist (Saxhleel/Xulomaht).

## 4. What varies where (our province)

- **South/east coast & delta**: hottest but smallest swing; mangrove →
  brackish → rice/palm fringe; sea squalls on the Padomaic side, calm bays;
  sea fog up estuaries; flood peaks latest, tide-compounded. Palette:
  blue-grey silt, bright saline greens, white sand/limestone.
- **Interior river-swamp basins** (Blackrose): max wet/humidity/radiation
  mist — the canonical "misty mephitic bayou"; biggest seasonal inundation
  change; near-daily dawn ground mist in recession. Palette: saturated dark
  greens, black water, peat browns.
- **NW border (Shadowfen-ish, toward Deshaan)**: the dry pole — rain shadow,
  far from coast; muted olive/grey-greens, dry haze, wide diurnal swing,
  best visibility; fen/scrub opens up. Fits Stormhold's "gateway" role.
- **Border mountains**: windward mid-slope rain max; low cloud-forest belt
  (~400–550 m-equivalent) with frequent orographic cap cloud — clearing on
  settled days, and always attached to the massif (8c round 3); dry rocky
  lee (explains
  Morrowind-side aridity). Cool mossy greens → mist-grey crag. Cold allowed
  here only (climate exception, module 50).
- **Deep interior jungle (Helstrom ring)**: all maxima coincide — permanent
  dusk, heat shimmer, spores, bioluminescent nights, miasma; that
  coincidence IS the in-fiction impenetrability.

## Status of implementation

The first slice is live: the basin's `ground-tint.png` (refine_watershed)
applies coastal/wetness/latitude palette drift to terrain albedo. Phase 8a's
air raster now ships too: `climate-air.png` (compile_hydrology) bakes R =
humidity (the §3 H formula, minus the runtime seasonal term, blended with
per-class climate), G = mist propensity, B = canopy closure — see the
`climateAir` block in `hydrology-meta.json`. Next slices (8c weather, Phase
13 ecology): the remaining fields + the season scalar, per the tables above.

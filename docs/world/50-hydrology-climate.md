# Part V — Province-scale hydrology and climate (§33–37, incl. §33.1)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.

## 33. Hydrology is the primary world generator

For Argonia, terrain and water must be solved together. The macro prior should be imported from the [All Tamriel Heightmap](https://www.nexusmods.com/skyrimspecialedition/mods/573) and/or the dedicated 30.9 MB [Argonia worldspace in Tamriel Worldspaces](https://www.nexusmods.com/skyrimspecialedition/mods/118678?tab=files).[^G1][^G2] The compiler then conditions lowlands, preserves intentional basins, resolves flow and creates the channels that drive ecology and settlement.

Province-wide fields should include:

| Field | Consumers |
|---|---|
| Elevation | terrain, visibility, water, settlement foundations |
| Slope and curvature | routes, climbing, erosion, buildings |
| Flow direction | rivers, water VFX, boats, debris |
| Flow accumulation | river hierarchy, wetlands, bridges |
| Groundwater/wetness | mud, vegetation, building stability |
| Flood frequency | settlement layout, road survival, dynamic water |
| Tidal influence | estuaries, salinity, mudflats, boat access |
| Salinity | vegetation, creatures, water appearance |
| Soil/peat stability | foundations, roads, ruins, fire |
| Sediment/turbidity | water shading and ecology |
| Water depth | swimming, boats, wading, underwater access |
| Current velocity | movement, particles, boats, AI |
| Canopy density | visibility, ecology, performance |
| Navigability | boat graph and transport services |

## 34. Province hydrology pipeline

1. Georeference the All Tamriel / Argonia heightmap source and coast.
2. Register canonical settlement and water anchors with tolerances.
3. Remove sampling artefacts while retaining meaningful basins.
4. Define sea level, tidal zones and large lakes.
5. Resolve drainage and flow accumulation.
6. Insert lore-required or map-required river constraints.
7. Generate river hierarchy, distributaries and abandoned channels.
8. Generate floodplains, peat basins, wetlands and groundwater fields.
9. Model estuarine salinity and tidal reach.
10. Derive soil stability and sediment transport.
11. Derive ecological regions.
12. Refine channels at watershed and local scales.
13. Generate runtime water meshes, depth fields and flow maps.
14. Validate every channel connection from headwater to receiving basin.

The full province receives a coarse hydrological solution immediately. Detailed meshes and local refinements expand by watershed.

### 33.1 Climate, atmosphere and light

Climate is a first-class macro layer alongside hydrology, because Black Marsh's
identity is as much air as water: heat, humidity, mist, rot and gloom.

**Canonical climate (binding, owner-confirmed 2026-08-23):** Black Marsh is
**hot, humid, swampy tropical/subtropical** — monsoonal wet, never cold in
the lowlands (UESP Lore:Black Marsh via the [province dossier](../../world/sources/lore/black-marsh-province.md):
"tropical climate defeats cultivation"). No frozen/boreal/cold-marsh visual or
asset language in the wetland province floor: cold-climate texture/asset sets
are ruled out on sight (e.g. Vanaheimr – Marsh), and borrowed cold-biome
assets (Skyrim frozen-marsh textures etc.) must be re-tinted/re-dressed to
read tropical before shipping. Exception (owner 2026-08-23): the high border
mountains may cool with altitude — montane/cloud-forest language is allowed
there when those regions are built, but never frost at the marsh floor.

- **Macro fields (Phase 3/4 data):** each ecological region class carries a
  climate profile — humidity, mist propensity, rain regime, characteristic
  visibility. These drive fog density, ambient palettes, insect/disease
  intensity and encounter sight-lines long before detailed rendering exists.
- **Macro climate model (researched + lore-grounded, 2026-08-23):** climate
  varies with coast distance, latitude, elevation/aspect, salinity and
  wetness via six computable fields (temperature, humidity, mist, rain
  amplitude, storm exposure, flood pulse with downstream lag) — the full
  model, canon citations, seasonal calendar (Argonian season names) and
  per-area expectations live in
  [docs/research/world-terrain/black-marsh-climatology.md](../research/world-terrain/black-marsh-climatology.md).
  First implemented slice: the basin ground-tint colormap (palette drift by
  coast/wetness/latitude). Weather frequencies, foliage and flood states must
  consume the same fields when they land (Phases 8a/8c/13, module 55).
- **"Steaminess":** low ground mist, heat shimmer over water, drifting spore
  and pollen particles are biome-driven atmospheric VFX tied to the climate
  profile, concentrated in jungle, rootland and stagnant-water classes.
- **Time, light, sky and weather are their own first-class system** —
  **[Module 55](55-light-sky-time.md) (§93–98)**: the world clock and calendar,
  sun/moon ephemeris and phases, star field, physically-valued light rig,
  aerial perspective/haze, mist regimes and the weather state machine. This
  module owns the *fields*; module 55 owns everything that consumes them over
  time. The semantic climate data must exist from the province passes so all
  later systems consume one source; the season scalar `s(t)` used above is
  produced by module 55's clock (§94).

## 35. Causal landscape example

A major river creates sediment deposition. Deposition creates natural levees. Levees supply relatively stable ground. A path follows the levee. A village grows where a tributary, levee and fishery meet. Its dock occupies a navigable bank. Reeds occupy slower backwater. An older ruin in the former floodplain becomes partially submerged. Smugglers use an abandoned channel to bypass the landing.

One hydrological relationship explains terrain, routes, settlement, ecology, ruins and encounters.

## 36. Flood states as world mechanics

A flood basin can expose a runtime contract:

```ts
interface FloodBasin {
  id: FloodBasinId;
  meanLevel: number;
  currentLevel: number;
  seasonalAmplitude: number;
  tidalAmplitude: number;
  surgeProfile: SurgeProfileId;
  inundationMask: FieldRef;
  connectedWaterBodies: WaterBodyId[];
}
```

Changing levels can alter:

- shallow crossings;
- mudflats and sandbars;
- submerged ruin entrances;
- boardwalk access;
- boat channels;
- predator territories;
- vegetation state;
- caches and salvage;
- interior water depth;
- route risk.

Dynamic changes should be bounded, readable and reproducible from world state.

**Phase 8b note (owner question 2026-08-23, answered):** the wet/dry season
transition needs no re-authored textures — the land-cover water-edge gradient
already encodes the progression (silt → shallows → wet bank → mud → damp
fringe), so the renderer animates the *water level* (flood-states data) and
adds a shader "wetness band" that darkens/wets the strip between the current
and recent waterline, sampling the same flood data. Seasonal texture
*swapping* is not planned; seasonal vegetation states are Phase 13.

## 37. Routes follow hydrology

The route solver evaluates:

- slope;
- dry-ground probability;
- flood frequency;
- soil stability;
- bridge span;
- boardwalk cost;
- current and depth;
- boat capability;
- cultural route preferences;
- existing infrastructure;
- faction control;
- danger;
- desired journey experience.

An Imperial route may choose causeways, drainage and bridges. A local route may use tributaries, roots, seasonal shallows and canoes. Their geometric differences communicate culture.

---


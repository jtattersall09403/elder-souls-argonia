# Research — world terrain, hydrology and routes

Evidence and rules for the shape of the province: relief, rivers, coast, climate and the routes across them.

| File | What it answers | Status |
| --- | --- | --- |
| [tropical-fluvial-geomorphology.md](tropical-fluvial-geomorphology.md) | How the mountain→wetland→coast journey is carved, as rules over our fields (drainage area, slope, salinity), plus the scale-compression mapping and carved channel widths. Read by `worldgen/fluvial.py`. | live design input |
| [black-marsh-climatology.md](black-marsh-climatology.md) | The province macro-climate: canon anchors plus real wetland climatology reduced to raster formulas (temperature, rain, flood cycle, mist). Read by `worldgen/landcover.py`, `refine_province.py`, `packages/world-time`. | live design input |
| [mangrove-coastal-ecology.md](mangrove-coastal-ecology.md) | Where mangroves may sit (sheltered low-energy coasts only) and the coastal vegetation gradient, mapped onto region class 14. Read by `worldgen/regions.py`, `build_palettes.py`, `scatter.py`. | live design input |
| [tropical-shoreline-materials.md](tropical-shoreline-materials.md) | Tropical-correct sea floor, riverbed and shore materials: taxonomy, texture inventory, gaps, and the assignment spec for the landcover compiler. | live design input |
| [mountain-terrain-synthesis.md](mountain-terrain-synthesis.md) | How to make dramatic-but-plausible mountains by editing a heightmap, and how to de-terrace province-wide without erasing water features. Read by `worldgen/sculpt.py`. | live design input |
| [beyond-border-distant-lands.md](beyond-border-distant-lands.md) | How shipped games build fake land past the playable border, and the plan for our world-edge horizon (the quick procedural ring was rejected). | live design input |
| [place-water-facts-vs-shipped-water.md](place-water-facts-vs-shipped-water.md) | Why 42 of 103 place records have no water near them; which water representation is authoritative and the root causes. Diagnosis only. Read by `worldgen/audit_place_semantics.py`, `catalogue.py`. | evidence |
| [route-spans-and-crossing-costs.md](route-spans-and-crossing-costs.md) | Why bridges are long — measured: the routers are not the cause, `author_route_structures` is. Read before changing any routing cost. | evidence |
| [rivers-on-slopes-and-cascades.md](rivers-on-slopes-and-cascades.md) | How shipped games build sloped river surfaces, and the Phase 8b fix for bed staircases and foam crusts on our one-heightfield architecture. | research reference |
| [offshore-islands-feasibility.md](offshore-islands-feasibility.md) | Whether to add offshore islands: yes for estuary/lagoon islets, no for a barrier chain, measured against our bathymetry. | research reference |

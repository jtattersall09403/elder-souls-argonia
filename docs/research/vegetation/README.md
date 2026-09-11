# Research — vegetation

How much vegetation, of what, where it stands and how it is anchored. Feeds the scatter compiler and the flora palettes.

| File | What it answers | Status |
| --- | --- | --- |
| [vegetation-density-design.md](vegetation-density-design.md) | The design synthesis for density: legibility, local-geography dependence, within-region variance, mod reference. Read by `worldgen/scatter.py`, `compile_scatter.py`. | live design input |
| [tropical-vegetation-ecology-targets.md](tropical-vegetation-ecology-targets.md) | Real ecology numbers per stratum and per landscape type (stem densities, canopy, spatial pattern) with a game-translation table. Read by `worldgen/build_palettes.py`, `vegetation_ladder.py`. | live design input |
| [vegetation-composition-rules.md](vegetation-composition-rules.md) | How the source authors compose and anchor models (pivot offsets, co-occurrence) — the fix for floating vines and trees on tiptoes. Read by `worldgen/composition.py` and the studio vegetation runtime. | live design input |
| [mod-vegetation-micro-siting.md](mod-vegetation-micro-siting.md) | Where each species stands relative to the waterline, how density falls off away from shore, and how a dressed pool is structured ring by ring. Read by `worldgen/build_palettes.py`, `scatter.py`. | live design input |
| [openworld-vegetation-placement-architecture.md](openworld-vegetation-placement-architecture.md) | The macro→meso→micro placement pattern AAA open worlds use, how they dress water features, and the black-foliage/shadow fixes. Read by `worldgen/scatter.py`, `compile_scatter.py`. | research reference |
| [regional-variety-audit-2026-09-08.md](regional-variety-audit-2026-09-08.md) | Measured species variety per region. Its density figures are per dominant chunk and mis-attribute neighbours' trees. | superseded in part (2026-09-09) by `worldgen.vegetation_ladder.measure_delivered_by_region` |

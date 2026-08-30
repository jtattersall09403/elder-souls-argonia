# How dense, and how varied: the three inputs to vegetation density

> Deep ecology evidence (per-stratum densities, zonation ring widths, edge/gap
> numbers, per-landscape game targets) now lives in
> [tropical-vegetation-ecology-targets.md](tropical-vegetation-ecology-targets.md);
> this doc keeps the design synthesis (legibility, variance, mod reference).

**Phase 10, 2026-08-30.** Owner brief: density "should be local-geography
dependent — dense jungle areas much denser than open grass, mountain forest
denser than non-forested, and even within an area sensible variation so it's
not all just samey", grounded in (a) good open-world game design, (b) what
Black Marsh & Valenwood actually does, and (c) what is realistic for our
geography, climate and hydrology.

Those three pull in different directions, which is the useful part.

## (a) Game design: density fights legibility, and our navigation cannot pay

The design literature is consistent that realistic foliage density is bought
at the cost of readability. Witcher 3 and Horizon are dense and beautiful and
consequently *need* waypoint markers, because foliage blends and landmarks
stop standing out; Breath of the Wild is comparatively barren on purpose, and
that negative space is what lets you see a distant tower and want to walk to
it.[^lynch][^legibility]

That is decisive for us rather than merely interesting. Our world is
Morrowind-shaped: no quest markers, directions given in words, and a
[diegetic discovery feed](../world/95-build-sequence.md) that expects players
to *find* things. Kevin Lynch's paths / edges / districts / nodes / landmarks
are the vocabulary that navigation runs on, and vegetation is the main thing
that can erase all five. So:

- **negative space is a feature, not a shortfall** — glades, open runs and
  water margins are what make a canopy silhouette or a xanmeer roofline
  legible from a distance;
- **density is a directional tool**: shifts in thickness establish routes and
  frame vistas as surely as a wall does;
- Bethesda's own wayfinding heuristic (Joel Burgess, GDC level-design
  roundtable) is that designers should go **one step past what feels too
  obvious**, because subtlety fails and the fix is usually an ugly UI marker.

**Design conclusion:** a moderate *mean* with a high *variance* beats a high
uniform density. Thick where thickness is the experience, genuinely open where
the player needs to see.

## (b) What Black Marsh & Valenwood actually does

Measured from 186k placed references
([mining](shipped-world-placement-rules.md), `world/sources/placement/`):

| | Black Marsh | Valenwood |
|---|---|---|
| median density, dressed cells | ~100 /ha | ~15 /ha |
| **coefficient of variation across dressed cells** | **3.09** | **2.33** |
| density correlation at 58 m | 0.31 | 0.50 |
| at 117 m | 0.14 | 0.31 |
| at 175 m | 0.09 | 0.19 |
| at ≥233 m | ≤0.06 | ≤0.10 |
| open-space radius, p50 / p75 / p95 | 10.2 / 21.1 / 31.5 m | 10.4 / 18.7 / 31.7 m |

Three things worth copying:

1. **Variation dwarfs the mean.** Standard deviation is *three times* the mean
   density between neighbouring dressed cells. "Samey" is not what the source
   looks like, and a compiler that places its authored density evenly would be
   less varied than the reference by a wide margin.
2. **Variation is short-ranged.** Half the correlation is gone by ~60 m and
   effectively all of it by ~200 m. Thickets and glades are things you walk
   through in tens of seconds, not biome-scale bands.
3. **Both worlds agree on gap size.** Median open space is ~10 m and the
   biggest gaps ~30 m, in swamp and forest alike — a stable, human-scaled
   number that reads as "a clearing you could fight in".

## (c) What is realistic for a tropical swamp

| System | Real stem density |
|---|---|
| tropical peat swamp forest (Kalimantan, restored secondary) | **1,200–1,825 trees/ha**[^peat] |
| mangrove, SE/E Asia, stems >5 cm | 195–2,209 /ha, **mean 765**[^mangrove] |
| small trees <10 cm dbh, Brazilian open forest | ~7,500 /ha[^small] |
| mangrove canopy fractional cover | 0.17–0.96 — the low end *is* the gaps[^gapfrac] |

The headline: **nature is an order of magnitude denser than any game does
it.** Real swamp forest carries 1,200+ stems per hectare where our provisional
palettes place 50–90 objects and the reference mod places ~100. There is
therefore **no realism argument for being sparse** — a game tree stands in for
several real stems, and groundcover carries the understory. What limits us is
the browser and the player's ability to navigate, not botany.

Realism does supply the *shape* of the variation, though, and it agrees with
(b): tropical wetland structure is patchy by mechanism. Hummock-and-hollow
microtopography, treefall gaps, salinity and flooding-depth zonation, and
mangrove zonation by tidal exposure all produce short-range mosaics, not
uniform cover. Canopy cover measured between 0.17 and 0.96 in a single
mangrove system is exactly the coefficient of variation the mod reproduces by
hand.

Our own fields already encode the drivers: `regions.CLIMATE` gives humidity,
canopy closure and a rain regime per region class, the hydrology gives water
depth and flood frequency, and the Phase 10 rebalance ties marsh to
saturation. Density should be a function of those, not a per-region taste
call — which is what makes "jungle denser than open grass, mountain forest
denser than bare mountain" fall out rather than being asserted.

## The synthesis we build to

1. **Grade the mean by climate and hydrology, not by preference.** A region's
   authored density tracks its humidity and canopy closure; the ladder is
   checked by a test rather than eyeballed.
2. **Make the variance as large as the mean.** Target the mod's coefficient of
   variation (~2–3) rather than a smooth field, via a shared openness field
   plus per-species patchiness.
3. **Tune the variation's wavelength to the measurement**: ~90 m for glades
   and ~190 m for whole-stand shifts, from the correlation table above — not
   the 140/340 m first guessed.
4. **Keep the gaps human-scaled**: median open space ~10 m, largest ~30 m, so
   clearings read as places and are big enough to fight in.
5. **Push the dense end hard where it does not cost legibility** — under
   closed canopy, in the deep marsh, away from routes and vistas — because
   realism says that end is nowhere near real density yet.
6. **Protect sightlines** where navigation depends on them: water margins,
   routes and the approaches to landmarks stay open (this is the same
   clearance machinery the compiler already has, pointed at a different
   purpose — a Phase 11 job once routes and POIs exist).

## Sources

[^lynch]: Kevin Lynch, *The Image of the City* (1960) — paths, edges,
    districts, nodes, landmarks; the standard level-design framing, e.g.
    [The Level Design Book](https://book.leveldesignbook.com/) and
    [Realism and Legibility in Open-World Level Design](https://www.gamedeveloper.com/design/realism-and-legibility-in-open-world-level-design).
[^legibility]: [Realism and Legibility in Open-World Level Design](https://www.gamedeveloper.com/design/realism-and-legibility-in-open-world-level-design)
    (Game Developer) — dense realistic foliage vs BotW's negative space, and
    the marker dependency that follows; [Dealing With Navigation & Players'
    Behavior](https://80.lv/articles/dealing-with-navigation-players-behavior)
    (80.lv) — density shifts as route-making, Burgess's "one step past too
    obvious".
[^peat]: [Carbon stocks, emissions, and aboveground productivity in restored
    secondary tropical peat swamp forests](https://link.springer.com/article/10.1007/s11027-018-9793-0)
    (Mitigation and Adaptation Strategies for Global Change) — 1,200–1,825
    trees/ha across plots.
[^mangrove]: [Mangrove biomass estimation using canopy height and wood density
    in the South East and East Asian regions](https://www.sciencedirect.com/science/article/abs/pii/S0272771420306685)
    — 195–2,209 stems/ha, mean 765 ± 102.
[^small]: [Density of forest components separated by forest type](https://www.researchgate.net/figure/Density-individuals-per-hectare-of-forest-components-separated-by-forest-type-a_tbl1_222327300)
    — small trees <10 cm dbh, ~4,900–7,500/ha by forest type.
[^gapfrac]: [Estimating mangrove forest density using gap fraction method](https://www.researchgate.net/publication/327391263_ESTIMATING_MANGROVE_FOREST_DENSITY_USING_GAP_FRACTION_METHOD_AND_VEGETATION_TRANSFORMATION_INDICES_APPROACH)
    — canopy fractional cover 0.17–0.96 within one system; low values are
    openings and gaps.

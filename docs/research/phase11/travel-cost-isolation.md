# Measuring isolation as effort, not as plan distance

**What this is for.** The typed isolation gates (`proximity.minFromClassM` in
`world/sources/catalogue/type-recipes.json`) were straight-line distances on
the map. The prose from which they were authored is not about the map:
`lone/hermit-hut` says "deliberately far from everything; the effort-to-reach
IS the design". This note records the standard models that already exist for
that, which one we took and why the others were rejected. The implementation is
`tooling/world-generation/worldgen/travel_cost.py`; its tests are
`worldgen/test_travel_cost.py`.

## The known solutions

Slope-dependent travel cost is long-settled ground in archaeology and GIS
least-cost-path work. Three models are in general use.

| model | form | anisotropic? | notes |
| --- | --- | --- | --- |
| **Tobler's hiking function** (1993) | `W = 6·exp(−3.5·|S + 0.05|)` km/h, `S` = rise/run | yes | peak speed on a −2.86 % downhill, not on the flat. The default in GRASS, ArcGIS Path Distance vertical-factor tables (Tripcevich 2009) and R `movecost`. An off-path variant multiplies `W` by 3/5. |
| **Naismith (1892) / Langmuir corrections** | 1 h per 5 km + 1 h per 600 m ascent, with descent corrections | no (as usually stated) | the mountaineering rule of thumb; coarser, with a linear ascent charge rather than a curve |
| **Irmischer & Clarke off-path** | `(0.11 + 0.67·exp(−(|S|·100 + 2)²/(2·30)²))·3.6` km/h | no | calibrated for cross-country walking; symmetric in slope |

The literature is explicit about two gotchas. Both bit us:

* **units.** `S` is a rise/run ratio, not degrees. Published cost tables are
  often given as "hours to cross one metre", so multiply by the cell size.
* **extrapolation.** Tobler is fitted to walking. Past roughly 45° the curve is
  extrapolation and it explodes: an unclamped 67° rim face in our own height
  raster charged 778,920 equivalent flat metres for 125 plan metres.

## What we took, and why

**Tobler, symmetrised, normalised to flat-ground speed.**

* **Tobler over Irmischer–Clarke** because Irmischer–Clarke is symmetric in
  slope and therefore cannot charge ascent, which is the entire point: a
  hermitage 250 m *above* a village is the case we are trying to measure.
* **Tobler over Naismith** because Naismith is a linear rule of thumb with no
  terrain curve. Tobler is what the GIS tooling and the archaeological
  literature actually use.
* **Symmetrised** by putting the two endpoints in a canonical order and
  averaging the two traverse directions. A siting gate is a property of a
  *pair*; if it were one-way, which record the solver reached first would
  change the answer. That asymmetry was a bug fixed in this same system on
  2026-09-09 (`related_pair`).
* **Normalised to `W(0) = 5.036 km/h`**, giving the unit *equivalent flat
  metres* (EFM): the distance you could have walked on the flat in the time
  the traverse takes. On flat ground EFM equals plan metres exactly, so the
  authored floors (600 m and the rest), which were calibrated as plan distance
  over flat marsh, keep both their number and their calibration. This is what
  stops the change being a blanket loosening.
* **Clamped at a 100 % gradient**, so a cliff costs `exp(3.5)` = 33× flat
  rather than an astronomical number. Past 45° the traverse is a climb rather
  than a walk, so the model does not apply.
* Tobler's **off-path 3/5 factor** applies to every approach we measure, so it
  is constant and cancels in the normalisation. It is named in the module so
  that a later reader does not add it a second time.

## What we rejected

**A landcover or water-depth difficulty factor.** Standard practice adds a
terrain factor (1.2–2.0 for rough ground or wading) on top of the slope curve.
Black Marsh's *baseline* ground is flooded marsh, so such a factor would
multiply nearly every pair province-wide and become exactly the blanket
loosening the owner banned. Slope is the signal that actually separates a rim
climb from a marsh walk here, so slope is what we measure.

**A full least-cost solve.** The gate asks "how far apart are these two
places", not "what route would a traveller take". Sampling the straight line
at the survey's own 5.48 m grid pitch is deterministic and instant. It cannot
smuggle a route decision into a siting decision. (`ProvinceSurvey.effort_to_reach`
remains the separate, cruder screening score for route/anchor/danger; it is
not this.)

## Sources

- [Tobler's Hiking Function tutorial (Tripcevich)](https://www.academia.edu/11747552/ArcGIS_Tutorial_Toblers_Hiking_Function)
- [Appendix E: Tobler's Hiking Function tutorial](https://www.academia.edu/7256398/Appendix_E_Toblers_Hiking_Function_Tutorial)
- [movecost: anisotropic slope-dependent cost surfaces and least-cost paths (R)](https://github.com/ElsevierSoftwareX/SOFTX_2019_230)
- [Anisotropic cost surfaces and least-cost paths (MapAspects)](http://www.mapaspects.org/courses/gis-and-anthropology/weekly-class-exercises/week-9-anisotropic-cost-surfaces-and-least-cost-/)
- [Applying Tobler's hiking function to planetary traverse modelling](https://www.sciencedirect.com/science/article/pii/S0094576524007501)

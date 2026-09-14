# 16c round 2 — measurement ledger (2026-09-14)

Round 1's ledger is [16c-water-once-ledger.md](16c-water-once-ledger.md).
This page records round 2: the owner's walk feedback, where each item landed,
then the numbers the final run printed. Decisions:
[0064](../../decisions/0064-waterfalls-are-the-vanilla-kit.md) (falls),
[0065](../../decisions/0065-the-compile-realises-the-graphs-classification.md)
(the compile realises the graph's classification). Re-run the numbers rather
than trust this page.

## 1. The owner's feedback, and where each item landed

| Owner item | Fix | Evidence |
|---|---|---|
| The sea does not move; no whitecaps, no waves breaking | Estuary standing wave to 0, along-shore crest phase, one surf-energy knob, a Stokes front on the swash | §4; polish row for full shoaling geometry in [P backlog](../../phases/P-polish/backlog.md) |
| The whole sea foams at once, in a pulse | The sea is classed coast or estuary rather than lake; the estuary standing blend is 0 | [0065](../../decisions/0065-the-compile-realises-the-graphs-classification.md) §2b, §3; §4 |
| Wet ground has jagged edges, straight lines, triangular spikes | The band faded over 8 cm of height where there is no surf, which draws an iso-contour of the compiled level. Its depth guard also spanned under two of the raster's 0.12 m steps. It now fades over a hand's depth (`WET_BAND_SOFT_M` 0.35 m), the contour is broken by the band's own noise. The guard now spans five steps. The level is also read with a not-buried weighting | §4; `groundWetness.test.ts` "the band fades over a hand's depth" |
| A horizontal bar along the coast seen from the air | The same band collapsing to a one-pixel dark line at distance; it now fades out over 350–1200 m | §4 |
| No interaction effects at all in sloped water | The strip fragment replaces the field's foam block wholesale, so it used neither the contact rings nor the ripple crest although both were in scope. Both are folded into the whitewater now. Fast water also gets its own churn: a bow wave on the upstream face of a body standing in it and a wake tearing away downstream (`esContactRush`), so standing still in a torrent is not glassy | `waterMaterial.test.ts` "wading into a chute", "fast water churns around a body standing still in it" |
| The 2D map named a body where the world has no water | `bodyAt` took "the smallest bounding box containing the pixel"; the swamp it named spans 2.7 x 1.8 km and 706 bodies sit inside that box. The tooltip now reads the compiled entity raster and says plainly when there is no water at the point | `hydrographIndex.test.ts` (the owner's case fails on the pre-fix code) |
| Water plates hovering in the air off banks ("shards") | Compile: wetline bound, speck drying, plus `levee` patches on perched channel banks | 0065 §2f, §5, §6; §2 rows "hovering texels", "specks dried" |
| An inland pool rising and falling like the ocean (1.83/4.84) | The sea is the graph's ocean, grown only through unowned cells; inland water gets no salinity, no ocean fetch | 0065 §2a, §3; §2 row "bodies drawn as sea" |
| The season toggle changes nothing | The check site had no graph body under it; moved to `body.1703-3069` at 3.11/5.61 | 0065 §8; brief "Owner check" |
| The gorge fall: a ribbon, a seam at the lip, thin mist, no pool surface | Falls rebuilt from the kit; the plunge bowl is drawn as the pool's water, never stamped | [0064](../../decisions/0064-waterfalls-are-the-vanilla-kit.md); 0065 §7 |
| Sloped streams too shallow, broken into pieces, too thin to wade | Steep water is bankfull: the profile level over the full trench width | 0065 §4; §2 row "walls" |
| Mountain lakes should feel clearer underwater | Turbidity scaled by the graph's altitude band and water class; renderer absorb floor | 0065 §3; §4 |
| A hard seam where a river meets a lake at 0.11/3.04 (0.52 m wall) | Mouth ramp over the last 40 m to the receiving body's level | 0065 §5; §2 row "mouth stations ramped" |
| Dragonflies and midges sitting wrong over water | Ambient-air water gate on depth plus lift, with a patch band for hover species | §4 |
| The studio URL carries a layer parameter that should not be there | `App.tsx` writes `layer=` only when it differs from the default set | §4 |
| Terrain calls (dry beds, perched channels) | `levee` and `bed-cut` patches authored from the census | 0065 §6; round-1 ledger §4 |
| The chain does not run end to end | Fixed; see round-1 ledger §7 | [16c-water-once-ledger.md §7](16c-water-once-ledger.md) |
| "The compiler shouldn't be re-deriving classification" | The full audit of what round 1 re-derived, with the replacement rules | [0065](../../decisions/0065-the-compile-realises-the-graphs-classification.md) |
| "Why bother having the browser probes at all" | Kept: the probe is what caught a duplicated shader uniform this round, which stopped the water material compiling altogether — no measurement over the rasters can see that. It is a pre-deploy check, not a per-commit gate | §5 |
| "Two place terrain requests" — expected to wait | No action: the places adapt to the frozen world in 16g; the postcondition stays known-red until then | §5 |

## 2. The compile numbers

Measured on the final chain run of 2026-09-14, on the patched ground.

| Measure | round 1 | round 2 |
|---|---|---|
| bodies realised (from the graph's rasters) / dry / flooded in box / second pass | 2,185 / 1 / n/a / n/a | 2,224 (2,193 level + 31 sea) / 4 / 28 / 28 |
| hovering edges | 161 | 429 |
| hovering texels (over 0.5 m above a dry neighbour) | 4,240 | 1,240 |
| speck pieces | n/a | 1,050 |
| lateral leaks dried / specks dried | n/a | 3,221 / 648 |
| graph extent cells dry on the frozen ground | n/a | 26,631 |
| carve cuts joined / of them a backwater trench | n/a | 6,023 / 4,463 |
| hollows the carve connected, flooded to the body's level | n/a | 10,149 over 76 bodies |
| mouth stations ramped | n/a | 380 (max 1.587 m) |
| walls where two waters meet (`waterStepCells`) | 13,439 | 2,863 |
| perched stations / runs | 582 / 90 | 973 / 40 |
| stations with a bed above their promise | 25 at 5 sites | 0 |
| bodies drawn as sea | 17 | 0 |
| wet fraction | n/a | 0.4251 |
| fetch median over the sea | n/a | 60 km |
| class fractions | n/a | coast 32.0% · estuary 0.9% · river 1.6% · lake 2.4% · marsh 19.4% |
| strips / cascades | n/a | 149 / 18 |
| drawn width vs the trench (strip points, median) | 0.40 | 0.992 |
| compile time | n/a | about 220 s |

## 3. Gates added this round

Each gate was run with `ES_WATER_DIR` pointing at a scratch re-run of the
round-1 compiler, to prove it can fail (measured 2026-09-14).

| Gate | What it holds | Failed on the round-1 rasters |
|---|---|---|
| `test_steep_water_is_drawn_bankfull` | a steep station's water spans the trench | `reach.2681-79` wetted 2.31 m against a 6.06 m trench |
| `test_every_graph_body_above_the_sea_is_drawn_at_its_recorded_level` | a body above the sea is itself, at its level | 11 graph bodies drawn as something else (`body.2508-2288`, a 1.34 m swamp, drawn as `body.ocean` at 0; `body.2435-2152`, a 1.54 m swamp, drawn as a reach at 0) |
| `test_the_sea_is_coast_or_estuary_never_lake` | no lake class on the ocean | 10.2 % of the ocean's texels classed lake or marsh |
| `test_salinity_only_on_the_graphs_tidal_water` | fresh water carries no tide | 15.3 % of fresh texels carried salinity |
| `test_plunge_bowls_are_the_fields_water` | a plunge bowl is drawn, not stamped | 17 of 18 plunge bowls stamped 255 |
| `test_hovering_texels_are_under_the_floor` | no water plate stands over dry ground | 4,024 hovering texels (the floor is set after the levee patches) |
| `test_inland_water_carries_no_open_sea_fetch` | only open water gets the open-sea fetch bonus | passes on the round-1 rasters only because that swamp WAS the ocean entity; it failed on the run-4 rasters at 59,530 m of fetch on a sea-level marsh arm, fixed by restricting the bonus to open water more than 150 m from shore |
| `test_site_110_3040_river_meets_its_lake_at_the_lakes_level` | no step at a river mouth | re-keyed to the last non-join strip point; round 1 stood 0.52 m over the lake |

## 4. The renderer changes

- **The whole-sea pulse.** `STANDING_BY_CLASS` estuary drops 0.3 to 0. The
  whitecap-fraction pulse ratio measures ×1.13 at standing 0, against ×1.35
  at 0.3 and ×1.62 at 0.45; the gate threshold is ×1.25.
- **Oblique crests.** `ALONG_SHORE` at 75 m wavelength, 0.9 rad off the shore
  normal, drifting 0.045 rad/s, so crests arrive at an angle and run along
  the beach instead of landing flat.
- **One surf-energy knob.** `surfEnergyScale(wind, fetch)` = seaRms / 0.22,
  clamped 0.6 to 3.5, replaces `surfWindScale`; the same number drives swell,
  breaking and foam, so a windward beach and a lee shore differ by their
  fetch alone.
- **Shore swell profile.** cos + 0.3 cos 2θ + 0.12 cos 3θ, with a swash skew
  of 0.6 + 0.25(E − 1) clamped 0.35 to 0.9: a steeper front face at higher
  energy (a Stokes front), so a breaker leans forward.
- **`groundWetness`.** The level is sampled with a not-buried weighting;
  plain bilinear walked the wet threshold up to 2.5 m inside a single texel,
  which is what made the jagged edge. The band fades out with
  1 − smoothstep(350, 1200 m), which removes the dark line along the far
  coast.
- **Underwater clarity.** An absorb floor of (0.045, 0.028, 0.022) plus
  turbidity × (0.6, 0.8, 1.15). Turbidity 0 sees about 20 m, 0.2 about 7 m,
  0.5 about 3 m, so the graph's altitude scaling (0065 §3) is visible.
- **Ambient air over water.** A water gate on depth plus lift at or above
  0.15 m, with a patch band of (0.40, 0.62) for hovering species; patch size
  44 m for midges, 48 m for dragonflies.
- **Studio URL.** `App.tsx` writes `layer=` only when the set differs from
  the default; the season labels are renamed.

## 5. What the owner should know, in plain English

- **"The chain doesn't run end to end" is fixed.** The chain is the sequence
  of build steps that turns the source data into the world the studio loads.
  A step had drifted out of step with the others, so a full run from scratch
  did not reproduce the committed result. It does now; the detail is in
  round-1 ledger §7.
- **What the browser probes are for.** They are cheap automatic checks that
  load the world in a headless browser and measure a handful of numbers (how
  much foam, how deep you can see, whether water is hovering). They exist so
  that a future change that quietly breaks one of these things fails a test
  instead of waiting for you to spot it on a walk. If a probe turns out to be
  slow rather than cheap, it is cut rather than kept: that call is pending the
  final run.
- **The two terrain requests for places are expected to wait.** Two places
  want the ground changed under them. Nothing is placed until 16g, so those
  requests sit until then rather than being applied to a frozen base twice.

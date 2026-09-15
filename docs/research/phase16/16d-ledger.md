# 16d ledger — the land beyond the border, the wall, the record reader (2026-09-15)

Decision [0067](../../decisions/0067-the-apron-is-the-tamriel-map-at-one-to-one.md);
brief [16d](../../phases/16-foundation-and-places/16d-border-apron-and-boundary.md).

## Measurements that changed the plan

| Claim | Measured | Consequence |
|---|---|---|
| audit §4: map registers at 8 px/cell, r = 0.83, (11960, 17752) | false match; whole-map NCC at factor 4 gives r = 0.9966 at PNG (row 3393, col 11788), 32 px/cell, PNG south-up | no fit, no scale search; the apron is the map continued |
| "north/west continue as land" | map ends 16.4 km N, 6.2 km S, 21.5 km W, 8.5 km E; N 78–88 % land to 3 km then sea; W 39–60 % land to 10 km | reach is the map's edge; the sea is drawn over the apron below 0 |
| haze | `climate-vis` visibility p50 0.96 km, p95 2.0 km | nothing past 10 km visible; no fade needed |
| units | metres = 0.017093·u − 91.745, rmse 3.05 m vs the raw ESP heightfield | B1 asserts it (r > 0.99) |

## The apron build (`build_border_apron`, 30 s, byte-identical on re-run)

| Number | Value |
|---|---|
| seam, ring-0 inner edge vs province edge, all LODs (decoded) | max 0.0054 m |
| edge Δ (`DEFAULT_HEIGHTS` − map) north p50 / max | 111.2 / 529.9 m |
| west p50 / max | 138.1 / 340.6 m |
| south p50 / max | 1.3 / 15.9 m |
| east p50 / max | 14.1 / 23.7 m |
| triangles (ring 0 at LOD 1 everywhere + rings 1 + 2) | 8.99 M (the runtime draws ring 0 mostly at LOD 4: ~0.56 M) |
| near paint texels dithered to the province edge | 1,460,401 of 1329² |

Gates in `test_border_apron.py`, each shown failing first: the LOD 2/4 inner-edge
copy (0.27 m off without it), the LOD-1 edge equality (0.01 m off), ring-0 outer
linearisation (1.66 m off), ring-1 outer linearisation (57 m off — the brief's
"coincide at every knot" wording could not fail and was tightened to "the whole
finer edge lies on the line"), the h_apron edge identity, the paint seam (61.9 %
without the dither, ≥ 95 % required), the manifest file list.

## Part A (the reader and the purge)

Thirteen tests that execute an unported consumer are gated by
`requires_delivered`: nine in `test_compile_settlement.py` (16h), three in
`test_site_survey.py` (16g: dossier and scour), one in `test_minor_waterways.py`
(16e). The 0066 gate was shown red on a planted `.wetlands` read. Twelve
allowlist rows remain (`terrain_request_postconditions` is exempt: it samples
its own compile). Eleven worldgen tests were red before this chunk and remain
so (stale plot facts and exports: `test_committed_water_facts`,
`test_water_fact_invariants`, three export tests, one blueprint fixture) —
16g's, none in the deploy gates. Found in passing: tarn `body.200-770` compiles
at `levelM` 289.71 while the graph's `wetSeasonLevelM` is 290.2 (backlog).

## Part C and D

Four cuboid walls outside `[0, 7369.85]²`, −200…1100 m, 50 m thick; the message
`text.system.province-edge` reviewed by a separate agent (unchanged). The water
renderer and its CPU twin draw the sea at y = 0 over the apron's far tile
beyond the province; the pre-16d edge-texel rule stays for a build without an
apron. The chain run of 2026-09-15 left every water raster byte-identical.

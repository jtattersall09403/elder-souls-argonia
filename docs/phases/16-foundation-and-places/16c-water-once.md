# 16c — The water, compiled once and the renderer fixed

**Goal.** Compile the water once on the frozen base from the graph, make it
read-only to everything below and fix the runtime defects the owner saw:
the muted sea, the jagged and hovering edges, the domes and gaps, the seams
between water types and the unfinished falls. Probes that fail on these
defects ship with the fixes.

Needs ruling 7 (sea energy) and 3–5 already given for 16b.

## Read

- README.md §3; [research/phase16/audit-water-runtime.md](../../research/phase16/audit-water-runtime.md)
  in full (the ledger §2, mechanisms §3, root causes §6).
- `research/rendering/water-pro-greenheck-study.md` §6, `waterfalls-realtime.md`,
  `waterfall-assets-vault-audit.md` §6; decision 0047 §6 (transfers) and its
  addendum (falls stack); `packages/game-core/src/water/README.md`.
- `worldgen/compile_water.py`, `channels.py` (carve only), `water_report.py`.

## Deliver

1. **Compile once from the graph**: `compile_water` reads
   `hydrology-graph.json` for levels, bodies, seasons and kinds, floods
   nothing province-wide, publishes the same schema-2 rasters plus the graph
   ids in `water-meta.json` (`reaches[]`, `bodies[]`, `cascades[]` keyed by
   graph id — stable across compiles). `patch_water` is its local twin.
   `sourceHeightSha256` must equal the frozen sha; the runtime validates
   `schemaVersion` (it does not today).
2. **The sea** (A4, root causes 1–5; ruling 7 sets the bar at the Water Pro ocean demo — swell, ripples on the swell, whitecaps, shoaling wave shapes, breaking waves and beach foam): `rmsHeightM` from wind and fetch; an
   unbounded coarse fetch channel (the 160 m cap goes); still-water drift
   from the weather wind at phase speed; whitecap threshold from the
   spectrum's crest statistic; horizon blend pushed out and capped; walk-mode
   `farExtentM` ≥ the blend end. Show the owner calm / breeze / storm at the
   beach for ruling 7.
3. **Edges and seams** (A5, mechanisms 1–7): discards folded into coverage;
   owner mask baked from the wetted width; cliff guard on the raster's own
   gradient; buried floor from the LOD error in flight; the out-of-raster sea
   plane joined; one lighting path for field, strips, sheets and plunge bases
   (or a measured join under 5 %).
4. **Falls** (A3): finish the stack on the graph's cascades (lip notch from
   16b, mist, side rocks handed to 16f), the `effect` category and blend
   materials in the pipeline (backlog rows), editor geometry dropped.
5. **Keep list** (A1): before touching the renderer, capture numeric
   baselines for rivers on slopes, foam drift, river flow, caustics, underwater,
   interaction and assert they do not regress.
6. **Lowland levels** (A6): compare the graph's lowland levels against the
   8b-era rasters in git history at the owner's three marsh sites; where the
   old edges were better, say why in numbers and fix the graph rule, not the
   pixels.
7. **Probes that fail** (E1): an open-coast site with a two-frame motion
   metric; an edge-transition-width metric at the beach and a strip; a
   dome/hole census on the far grid; the low-tier hard fail replaced by a
   recorded field and one high-tier site; the tautological tests in
   `water.test.ts` rewritten against stated floors. Each shown failing on the
   pre-fix build.
8. Backlog rows: `isReady` throw, the two overland lanes (re-lined, never
   dredged — ruling 6), the class extension above its cap, the hero-pool /
   FFT / algae rows each get a mount-or-defer decision with a measurement.

## Acceptance

- One `compile_water` run; `patch_water` proven local; graph ids in the meta;
  every gate in item 7 green and proven failable; `npm run test:water` gates
  the deploy (it does; keep it so).
- Owner walk passes at the 14 round-2 sites plus the beach and the open sea.

## Owner check

Walk each (`?view=character&…`) and say what is wrong in one line each:
- beach `x=6.12&z=1.638`: is the sea moving: swell arriving, some
  whitecaps, waves breaking on the sand, foam at the edge? Try `&w=storm`.
- fly `?view=fly3d&cam=orbit&x=6.16&z=5.07`: does the sea reach the horizon
  without a hard ring or a flat grey plate?
- lowland river `x=1.85&z=4.89`: clean banks, flow, foam drifting downstream?
- marsh `x=1.50&z=5.28&t=09:00` with `&wet=1` and `&wet=-1`: level rises and
  falls with no floating plates or domes?
- gorge fall `x=2.53&z=0.32`: one fall, a deep pool, mist, no flat sheet?
- mountain stream `?view=fly3d&cam=orbit&x=1.75&z=1.74`: white water down the
  slope, no floating patches, no gap ring around the stream?
- mountain lake `orbit x=0.38&z=1.44`: flat, clean edges, no belts?
- the old hovering-water site `x=4.57&z=3.87&t=10:00`: dry mud, no sheet.

## Gotchas

- `probe-water.mjs` forces the low tier; the owner's machine runs high.
- Keep-list first, fixes second; the owner said some things got better.
- Do not re-add any water-suppressing mechanism for roads (owner 2026-09-09).

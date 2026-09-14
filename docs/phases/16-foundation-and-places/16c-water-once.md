# 16c — The water, compiled once and the renderer fixed

**Goal.** Compile the water once on the frozen base from the graph, make it
read-only to everything below and fix the runtime defects the owner saw:
the muted sea, the jagged and hovering edges, the domes and gaps, the seams
between water types, prevent any hard jarring edges, the issues with sections of water having sudden dry gaps in them, sections of water suddenly having a totally different block of water texture in a small disconnected-looking patch within them, strange visual artefacts like hovering 2d water surfaces above land (if any remain) and any other physical impossibilities, jagged bits of isolated water on land near the edges of rivers/streams disconnected from the main stream, plus the unfinished falls. Probes that fail on these
defects ship with the fixes.

Needs ruling 7 (sea energy) and 3–5 already given for 16b.

## Starting state (read this before anything else; audit 2026-09-13)

- **Round 2 (2026-09-14): decision [0065](../../decisions/0065-the-compile-realises-the-graphs-classification.md) — the compile realises the graph's classification; round-1 rasters re-derived the sea by connectivity. Read 0065 before touching `compile_water.py`.**
- **The graph is on the approved ground; do not re-derive it.** Its
  `sourceHeightSha256` is the sha of `heightfield-shaped-f32.npy`, the
  shaped ground that the graph is solved on (0059). It equals the value in
  `world/sources/terrain/freeze.json` after the 2026-09-13 owner-corrections
  run (`4d81cd…`). The carved frozen base has a different sha by
  construction (`refined-height-frozen-f32.npy`, `4a74a0…` in freeze.json;
  the 16b ledger's `90052f7…` is the 2026-09-12 round-2 value, before that
  rerun). Read every sha from `freeze.json`, never from prose. The owner
  has checked 16a and 16b and approved them: 16c delivers what they promise.
- **Nothing has been compiled on the frozen ground.** `worldgen/compile_water.py`
  still reads `channels-pass1.npz` and re-runs `standing_water.solve_bodies`
  with a 200 m lateral flood; it never imports the graph. The tracked
  `water-meta.json` carries `sourceHeightSha256 3852377…` (round-1 ground),
  not the frozen sha in `freeze.json`; `ladder.json` hides water; an orphan
  `water/natural/water-meta.json` with a third sha has no reader (delete it).
- **The flood-fill question, in one sentence:** the flood solver runs once,
  inside `hydrology_graph derive`; the compile fills to the graph's levels
  and never re-solves or re-floods the province; `patch_water` re-floods
  only a typed patch's window (`chain-footprint.json`). 0025's "one physics
  for all levels" and 0047's priority flood are that one solve, not a
  licence to re-flood per compile.
- **Water is compiled once.** The chain script lists `compile_water` twice
  (before `reroute_lanes` and after `export_web_chunks`); this chunk leaves
  one entry, with `reroute_lanes` on 16e's ladder row and `patch_water` on
  16b's (already there).
- **Red gates you inherit:** eight `test_water_invariants.py` probes are red
  on the ground-only build and two site probes are pinned to old-world
  coordinates (16b brief § "16c (water once)"); make each green against the
  graph or replace it with a graph-keyed probe, never delete. The 16b
  ledger's freeze-gate leftovers (`freeze-gate-known.json`: a trench bed
  1.5 m over its promise, a shoulder under its seal, ground over a body's
  level) and the `reach.59-1203` demote-or-clamp call are yours.
- **What "good" looked like (the keep list, with numbers):**
  [research/archive/water-round-2-2026-09/water-round2-evidence.md](../../research/archive/water-round-2-2026-09/water-round2-evidence.md)
  — lowland river 1.85/4.89 flow 0.71 m/s; mountain stream 1.75/1.74 flow
  1.48 m/s over 249 strip chains; the gorge fall 131.4 m at 87.6° into a
  7.92 m pool; 16 cascades at 74–88°; hovering edges 32 → 0; marsh 1.50/5.28
  −0.60 m dry with the 1.4 m lift; falls at 0.43 of open sun; sheet alpha
  0.89–0.91; mist 4–8 cards / 10–40 discs. The renderer file map is
  `packages/game-core/src/water/README.md` (strips in `ChannelStrips.ts`,
  streaks in `whitewaterStreaks.ts`, `FoamField.ts`, `WaterfallSheets.ts`,
  `WaterfallMist.ts`, `PlungeBase.ts`, `caustics.ts`, the interaction
  stack). The transfer ledger with done/not-done verdicts is
  [audit-water-runtime.md](../../research/phase16/audit-water-runtime.md) §2;
  the Water Pro study is a technique reference, not a spec; its §6 has
  no completion marks.
- **The standard:** ruling 7 (plan §7) — the Water Pro ocean demo for the
  sea; the graph (0058) for every level, season and kind; 0060 for profiles,
  pools and the coast; 0047's signed-depth contract for the runtime. Every
  other water document is history or research (world 60 §38 names the live
  set).
- **Stale pointers to fix in this chunk, in code:** `worldgen/known_red.py`,
  `terrain_request_postconditions.py` and `test_export_settlement_bundle.py`
  name the archived `water-handoff.md` as `KNOWN_RED_DOC` (point at the
  plan §9 or the backlog); `probe-water.mjs:4` and `waterProbe.ts:41` cite
  "sites per archive water-handoff" (cite this brief).

## Read

- README.md §3; [research/phase16/audit-water-runtime.md](../../research/phase16/audit-water-runtime.md)
  in full (the ledger §2, mechanisms §3, root causes §6).
- `research/rendering/water-pro-greenheck-study.md` §6 (technique reference),
  `waterfalls-realtime.md` (its 45° fall floor is history: the graph's rule
  is ≥ 3 m over a face ≥ 70°), `waterfall-assets-vault-audit.md` §6 (wins on
  unit scale and fades); decision 0047's two addenda (the falls stack);
  `packages/game-core/src/water/README.md`; the 16b brief's "read this
  before 16c" block and the 16b ledger §9; `world/sources/hydrology/README.md`.
- `worldgen/compile_water.py`, `channels.py` (carve only), `water_report.py`.

## Deliver

1. **Compile once from the graph** (a rewrite, not an extension — see the
   starting state): `compile_water` reads `hydrology-graph.json` for
   levels, bodies, seasons and kinds, floods nothing province-wide,
   publishes schema-2 rasters plus the graph ids in `water-meta.json`
   (`reaches[]`, `bodies[]`, `cascades[]` keyed by graph id — stable across
   compiles). `patch_water` is its local twin over `chain-footprint.json`.
   `sourceHeightSha256` must equal the frozen sha; the runtime validates
   `schemaVersion` (it does not today). Before rewriting, run the old
   compiler once on the frozen ground purely to take the keep-list readings
   (item 5) on this ground.
2. **The sea** (A4, root causes 1–5; ruling 7 sets the bar at the Water Pro ocean demo — swell, ripples on the swell, whitecaps, shoaling wave shapes, breaking waves and beach foam): `rmsHeightM` from wind and fetch (replacing `waves.ts` `rmsHeightM 0.185`);
   an unbounded coarse fetch channel (`fetchSaturationM 60` and
   `SHORE_SWELL.fetchM 60` go; `uSurfShoreMax 160` is the surf band, not
   the fetch cap); still-water drift
   from the weather wind at phase speed; whitecap threshold from the
   spectrum's crest statistic; horizon blend pushed out and capped (`horizonBlend startM/endM/maxBlend`;
   target `horizonBlendWeight(2000) < 0.2`); walk-mode `farExtentM` (3000
   today) ≥ the blend end. Show the owner calm / breeze / storm at the
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
   interaction on the frozen ground (item 1's one old-compiler run), compare
   them with the round-2 evidence numbers in the starting state; assert
   they do not regress.
6. **Lowland levels** (A6): compare the graph's lowland levels against the
   8b-era rasters (gitignored since b9b7f76c; check out a commit ≤ 4b5beab0
   to read them) at the marsh site 1.50/5.28 and two more lowland sites the
   owner names at the 16b walk (ask; do not guess); where the old edges were
   better, say why in numbers and fix the graph rule, not the pixels.
7. **Probes that fail** (E1): an open-coast site with a two-frame motion
   metric; an edge-transition-width metric at the beach and a strip; a
   dome/hole census on the far grid; the low-tier hard fail (`probe-water.mjs:39` forces `wq=low`, the exit at
   `:858`) replaced by a recorded field and one high-tier site; the
   tautological tests in `water.test.ts` (audit §5: lines 24–31, 44–48,
   205–207) rewritten against stated floors. Each shown failing on the
   pre-fix build.
9. **Life over the water reads the water level** (owner 2026-09-13):
   `packages/game-core/src/air/ambientAir.ts` places dragonflies and midge
   clouds by height above *ground*; over a body they must hover by height
   above the **water surface** (the season-aware signed depth this chunk
   ships), so a cloud over a 2 m deep pond sits 0.5 m over the water, not
   2.5 m up. Fix the sampling here, since this chunk owns the water query
   the air layer reads; 16f moves the *where* (patch centres) and keeps the
   *how high* from here. Test: every dragonfly and midge patch centre over a
   standing body samples its height from the surface, shown failing on the
   ground-based rule.
8. The absorbed rows (plan §9; the backlog no longer carries them):
   `isReady` throw, the two overland lanes (re-lined on the graph in 16e's
   `reroute_lanes`, never dredged — ruling 6), the class extension above its
   cap, the hero-pool / FFT / algae rows each get a mount-or-defer decision
   with a measurement, recorded in this chunk's ledger.


### Added by 16a (2026-09-11)

- **A river through a body is the body.** Where a reach is
  `horizontal-backwater` (inside a lake, pond or lagoon), the body's surface
  owns the water: no channel ribbon, no ribbon edge, no separate level inside
  the body's extent; the river's flow field continues through the body as a
  velocity on the body surface; the channel geometry starts again at the
  body's outflow reach. This single rule covers the "some of it river, some
  of it lake" seams the owner sees; a probe that finds two surfaces in one
  body's extent fails.
- **Seasons come from the graph.** `season`, `wetSeasonLevelM` and
  `drySeasonLevelM` per reach and body replace the per-cell response; a
  seasonal reach dries only above the first perennial point (the graph
  guarantees perennial flows downstream), so no river stops and restarts.
- **Overlays retired.** The map's `flood` and `flood-wet` layers are
  regenerated from the graph's levels (or removed if the season layer says
  the same thing); the two river layers collapse to the hydrograph one.
  Nothing the owner ticks on the 2D map may describe water the 3D world no
  longer has.
## Acceptance

- **The chain ladder** (plan §3): this chunk's stages are `compile_water`
  (the rewritten compiler, ONE entry in the script) and
  `terrain_request_postconditions`; `patch_water` shipped in 16b and stays
  on its row. Confirm the 16c row in `tooling/world-generation/scripts/terrain-chain.sh` and bump
  `DELIVERED_THROUGH` to this chunk in the delivering commit; until then a
  plain chain run skips them and their published JSON is stale.

- One `compile_water` run; `patch_water` proven local; graph ids in the meta;
  every gate in item 7 green and proven failable; `npm run test:water` gates
  the deploy (it does; keep it so).
- Owner walk passes at the fourteen round-2 sites plus the beach and the open
  sea. The fourteen (from the archived round-2 handoff, verbatim intent):
  1 old hovering-water site `x=4.57&z=3.87&t=10:00` dry mud; micro-jagged
  shore edges everywhere gone (root cause, not per site); 2 lowland river
  `x=1.85&z=4.89` continuous, flat to both banks, flow, foam drifting; 3 marsh
  `x=1.50&z=5.28&t=09:00` rises and falls with `&wet=1` / `&wet=-1`, no plates
  or domes; 4 former dry bed `x=2.66&z=0.90` a swimmable river, no holes;
  5 river above the fall `x=2.47&z=0.30` full, no uphill belts; 6 the gorge
  fall `x=2.53&z=0.32` one coherent fall into a deep pool, no sheet on the
  face; 7 the deep-basin lake passes and the hovering patch at 1.59/4.25 is
  gone; 8 the "big waterfall" slopes at fly `x=1.827&z=2.093` and
  `x=1.816&z=1.810` render as steep streams, not falls; 9 mountain stream
  orbit `x=1.75&z=1.74` white water on the slope, no floating patches;
  10 sea calm and storm at orbit `x=6.16&z=5.07` (`&w=storm`), underwater and
  caustics keep passing; 11 beach `x=6.10&z=1.64` spawn on sand, foam at the
  edge; 12 mountain lake orbit `x=0.38&z=1.44` flat, clean edges, no belts;
  13 interaction and speed keep passing; 14 every probe fails on a real
  defect and is cheap.

## Owner check

**What you will see at this check** (plan §3, build only what is delivered): the ground plus the water: rivers, lakes, the sea, falls. Still no plants, roads, bridges or buildings.


Walk each (`?view=character&…`) and say what is wrong in one line each:
- beach `x=6.12&z=1.638`: is the sea moving: swell arriving, some
  whitecaps, waves breaking on the sand, foam at the edge?
- beach in a storm `x=6.12&z=1.638&w=storm`: waves arrive obliquely and break
  bigger; the sea never foams all at once.
- fly `?view=fly3d&cam=orbit&x=6.16&z=5.07`: does the sea reach the horizon
  without a hard ring or a flat grey plate?
- lowland river `x=1.85&z=4.89`: clean banks, flow, foam drifting downstream?
- seasonal swamp `x=3.11&z=5.61&t=09:00` with `&wet=-1`: the water drops
  0.28 m and exposes a band of mud; `&wet=1` is the line.
- inland pool `x=1.83&z=4.84`: a still swamp at 0.84 m, no swell, no tide.
- gorge fall `x=2.53&z=0.32`: a kit-built fall with a crest, a skirt, mist and
  spray; the pool has a surface.
- sloped stream `?view=fly3d&cam=orbit&x=1.75&z=1.74`: it fills its channel
  bank to bank, one continuous surface; walking into it makes ripples.
- mountain lake `orbit x=0.38&z=1.44`: flat, clean edges, no belts.
- the old hovering-water site `x=4.57&z=3.87&t=10:00`: dry mud, no sheet.

## Gotchas

- `probe-water.mjs` forces the low tier; the owner's machine runs high.
- Keep-list first, fixes second; the owner said some things got better.
- Do not re-add any water-suppressing mechanism for roads (owner 2026-09-09).

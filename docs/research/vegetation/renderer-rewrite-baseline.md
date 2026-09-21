# Vegetation renderer rewrite — round-0 baseline (2026-09-20)

The starting point for the [vegetation renderer lane](../../phases/lanes/vegetation-renderer-lane.md)'s
measurements. Decision: [0082](../../decisions/0082-vegetation-cells-are-built-once-and-the-gpu-picks-the-rung.md).
Rounds 1 and 2 re-run the same probe and put their rows under § Later rounds.

## How it was measured

`node apps/world-studio/scripts/probe-frame-work.mjs <x> <z>`: starts its
own dev server, loads the character view at the site, waits for the
vegetation debug hook, records 20 s (long tasks and the vegetation stats),
then reloads 200 m along +x and records again. Round 0 extended its readout
with chunks, instances, draws, triangles, culled, occluded, the bucket/fill
split and a count of `vegetation rebuild` console lines.

What the fields mean (Vegetation.tsx): `rebuildMs.*` is the **last rebuild
only** (CPU ms summed over its slice of frames; `elapsedMs` is
wall clock); `bucket` is pass one (per-instance distance, occlusion, ground
sample, rung choice) and `fill` is pass two (buffer refill); `instances` is
the emitted copies after culling; `draws` is the number of instanced meshes
with a count; `culled` and `occluded` are per-rebuild instance counts.

This VM has no GPU (SwiftShader): main-thread ms are ratios only, counts are
exact. The owner's machine measured the same jungle rebuild at 34–39 ms
total (16f ledger §16), against tens of seconds here.

## Jungle (x 4.02, z 4.61), the owner-walk site

| Row | Long tasks (n / max / total ms) | Last rebuild total / bucket / fill ms | Frames / elapsed ms | Chunks | Instances | Draws | Triangles | Culled | Occluded |
|---|---|---|---|---|---|---|---|---|---|
| initial | 5 / 10 689 / 11 876 | 27 900 / 27 743 / 157 | 618 / 36 370 | 25 | 24 853 | 191 | 2 587 128 | 110 908 | 26 387 |
| +200 m | 1 / 66 / 66 | 1 373 / 1 139 / 234 | 647 / 53 548 | 25 | 31 986 | 227 | 2 707 168 | 97 375 | 12 817 |

Readings:

- **Pass one is the rebuild.** Bucket is 99 % of the initial rebuild and
  83 % of the walking one. It is the per-instance CPU pass over every loaded
  chunk (about 135 k source instances here: emitted + culled + occluded),
  which is exactly what 0082 removes; fill (the buffer refill) is small.
- **The frame queue hides the hitch, not the work.** The walking rebuild
  spans 647 frames; the one long task in that window is 66 ms. Every 16 m of
  travel still costs a full pass.
- **Draw count to beat: 191–227** at chunk ring 2 in the densest region.
  Under multi-draw the cell design gives one draw per species part; the
  Firefox fallback count is reported beside it in round 1.
- **Culled dominates emitted.** Roughly three source instances are rejected
  for every one emitted, most beyond their species' draw distance. In the
  cell design those never leave the CPU either: a cell beyond a rung's band
  has that rung off; a cell's buffers are built once.
- The initial-row long tasks are page load (kit decode, first terrain), not
  the vegetation rebuild.

## Coast (x 6.12, z 1.638) and upland (x 0.93, z 0.92)

Not measured, by owner call 2026-09-20: the jungle is the densest site
with the most species, so a renderer that meets its numbers meets them
everywhere; the lane measures the jungle site only, in every round. (The
first run at these two sites timed out on the probe's 30 s second page load
under SwiftShader; the probe now waits up to 180 s and records a failed row
instead of aborting, for whoever runs it elsewhere.)

## Culling micro-benchmark (node v22, this VM, median of 50)

| Instances | Per-instance sphere cull (what `perObjectFrustumCulled` does) | 400 cell spheres |
|---|---|---|
| 20 000 | 0.59 ms | 0.02 ms |
| 80 000 | 2.60 ms | 0.002 ms |
| 160 000 | 5.30 ms | 0.002 ms |

Per-instance culling is off in the cell design; cells are culled in the
gating loop (0082 §4).

## Later rounds

Rows added by round 1 with the same probe: draws, gating-loop ms, long tasks
over 200 m, rebuild count while walking (target zero). **Round 2 changed no
numbers** — it removed the old path, the `?veg=` flag and the probe's `VEG`
switch, so there was nothing new to measure and no probe was run. The
judgement left is the owner's walk (PROGRESS.md § Waiting on user).

### Round 1 (2026-09-21), `VEG=cells probe-frame-work.mjs 4.02 4.61`, SwiftShader

(Round 2 removed the `VEG` switch: the probe now measures the cell renderer,
there being no other.)

By owner call (2026-09-21), only the `VEG=cells` run was taken this round;
the old-path run is on record from round 0 (draws 191–227) and was not
re-run.

| Run | Window | readyMs | Long tasks (n / max / total ms) | Cell built / rebuilt lines | Instances | copiesTotal | Draws | drawsFallback | Batches | Triangles | Culled | Occluded | gatingMs / gatingMaxMs | maskMs | rebuildMs.total | cellsPending |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cells, before | site | 160 714 | 4 / 4 498 / 5 034 | 0 / 0 | 82 049 | 458 655 | 92 | 82 049 | 529 | 16 230 252 | 376 606 | 345 | 0.6 / 3.5 | 0.3 | 110.8 | 0 |
| cells, before | site+200 m | 174 940 | 3 / 302 / 444 | 2 / 2 | 100 100 | 430 980 | 95 | 100 100 | 497 | 26 736 089 | 330 880 | 97 | 0.7 / 3.5 | 0.1 | 204.5 | 14 |
| cells, after the tile-gating fix | site | 201 578 | 11 / 472 / 3 535 | 1 / 1 | 56 885 | 461 877 | 161 | 56 885 | 569 | 3 958 534 | 404 992 | 4 991 | 0.8 / 201.3 | 0.0 | 175.2 | 0 |
| cells, after the tile-gating fix | site+200 m | 149 710 | 3 / 12 427 / 13 071 | 0 / 0 | 50 528 | 430 982 | 171 | 50 528 | 497 | 3 960 257 | 380 454 | 581 | 1.0 / 5.5 | 0.1 | 102.9 | 0 |

`Culled` keeps its name but counts copies gated off this frame, not
instances: it is not comparable with the pre-0082 figure.

**The draw, instance and triangle numbers are now measured.** Both windows
reached a steady or near-steady readout: draws are 92 (site) and 95
(site+200 m), well under the round-0 old-path figures of 191–227 and under
the ≤227 target. Two cells rebuilt in the +200 m window (both `kit`
reasons, alongside 7 of the 12 total rebuilds at that window's snapshot),
so the zero-rebuild-on-movement target is not yet met; `gatingMaxMs` is 3.5
in both windows, above the 0.5 ms target. `cellsPending` at 14 in the
+200 m window shows the frame-work queue still draining cell builds when
the readout ran.

**After the tile-gating fix** (hierarchical cell-then-58 m-tile gating,
materials owned per batch key, mask anchored per focus chunk, kit arrival
dirtying only the cells that skipped a species):

- **Submitted triangles fall from 16.2–26.7 M to 3.96 M** in both windows,
  against the round-0 old-path figure of 2.6–2.7 M. The cell renderer now
  submits about 1.5× the old path's vertex load rather than 6–10×; the
  remaining gap is one 58 m tile of margin per gate boundary, plus the near
  rungs that are never frustum-culled because they cast shadows.
- **Rebuilt and built lines in the +200 m window are 0** — walking 200 m
  rebuilds nothing. (The two `kit` rebuilds in the "before" row came from the
  underwater kit arriving and dirtying every cell; a kit arrival now dirties
  only the cells that skipped one of its species.) The cumulative
  `cellRebuilds` counters of 13 and 7 are all `kit`, all from before the
  window opened.
- **Draws 161 and 171**, under the ≤ 227 target and the round-0 old-path
  191–227.
- **`gatingMaxMs` is 5.5** in the steady +200 m window. The 201.3 at the site
  is the first gating pass after the initial fill, inside a window the probe
  itself reports as `steady: false`; the per-frame `gatingMs` is 0.8–1.0. It
  is still above the 0.5 ms target and stays open for round 2.
- `occluded` is now an instance count (4 991 and 581), not a texel count, so
  it is comparable with the old path again.

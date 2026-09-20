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

Rows added by rounds 1 and 2 with the same probe: draws, gating-loop ms,
long tasks over 200 m, rebuild count while walking (target zero).

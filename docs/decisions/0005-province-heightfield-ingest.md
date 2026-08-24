# 0005 — Province heightfield ingest and provisional scale

**Date:** 2026-08-22 · **Status:** accepted (rescale factor still open;
interior conditioning and sea level decided — see below)

## What was ingested

Tamriel Worldspaces **Argonia.esp** (Nexus SSE mod 118678, file 498168; hash in
`world/sources/README.md`), parsed by our own minimal TES5 reader
(`tooling/world-generation/worldgen/esp.py`) — no Bethesda tooling needed.

Facts extracted:

- 15,876 LAND cells, full 126×126 block (cells −62..63 on both axes);
- stitched grid 4033×4033 samples, 1.83 m/sample at raw Skyrim scale
  (0.01428 m/unit, 4096-unit cells) → **7.37 km × 7.37 km** raw extent;
- heights −85.7 m … +121.9 m; worldspace default water level = 0 exactly,
  matching our sea-level convention (decision 0003); 37% of samples below sea
  level (open sea east/south + interior depressions);
- relief matches lore maps: border mountains west/northwest, central-southern
  upland, lowland marsh basin through the middle, coast east and south.

Float32 grid + meta cached in the vault next to the esp; downsampled preview
rasters (1345², 8-bit and 16-bit PNG) committed to
`apps/world-studio/public/province/`.

## Open: horizontal rescale

7.4 km is Skyrim-map scale, far below the province feel the master plan wants.
The heightfield is a **shape prior, not a scale authority**: a horizontal
scale multiplier (candidates ×3–×6) will be chosen at the start of Phase 3
hydrology, informed by owner feedback on travel-time feel. Until then no code
may bake in a metres-per-sample constant outside the generated meta files.

## Decided at owner review (2026-08-22)

- **Interior conditioning: strong** (revised from mild 2026-08-23 after the
  owner reviewed both live) — land above 12 m keeps 25% of its excess,
  weighted by the interiorness mask (no change within ~10% of map edges).
  Peaks drop ~100 m → ~34 m. Implemented in `worldgen/condition.py`; the whole
  Phase 3/4 chain compiles on this terrain.
- **Sea level stays at 0 m** (owner-confirmed after fine-slider review).
- **Anchor positions corrected** by the owner and terrain-verified (coastal
  snapping, Gideon in the measured western pass; see
  `world/sources/anchors/settlement-anchors.json` notes). A
  Soulrest–Blackrose–Lilmoth suggested corridor is registered.

## Resolved context: central hill mass vs lore's low marsh heart

The heightfield has a genuine hill mass **south of Helstrom** (region roughly
u 0.42–0.57, v 0.46–0.66: mean 41 m, 22% above 60 m, peaks ~101 m). Lore (PGE3,
The Argonian Account) reads the interior as low inundated morass. There is no
independent alternative source — the All Tamriel Heightmap Beta06 archive
contains two 16-bit PNGs of the *same* terrain family the Argonia worldspace
was derived from, and Beyond Skyrim: Argonia has released no worldspace. The
prior is therefore reshapeable: Phase 3 hydrological conditioning (master plan
§33 step 3 already includes basin preservation) can soft-compress interior
elevations while keeping border mountains and coastline. Amplitude of that
compression (remove the hills vs keep reduced rootland rises) is an owner
decision at Phase 3 start. The world studio has a preview toggle for this
("Interior relief": mild keep=0.5/threshold 20 m, strong keep=0.25/threshold
12 m, edge-protected by an interiorness mask) — preview only; the real
transform lands in the hydrology compiler.

## Also decided

The All Tamriel Heightmap Beta06 archive is downloaded and registered as a
cross-border context source, but the dedicated Argonia worldspace is the
primary macro prior (finer local detail, already clipped to the province).

**Addendum 2026-08-23 (Phase 6 gate):** owner switched interior conditioning
back to **mild** (threshold 20 m, keep 0.5) from strong — taller interior
relief. `worldgen/condition.py` and the studio preview default both updated;
all downstream compiles (hydrology, society, refinement, chunks) re-run.

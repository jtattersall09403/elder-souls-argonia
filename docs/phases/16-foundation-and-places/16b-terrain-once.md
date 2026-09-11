# 16b — The terrain, built once

**Goal.** Re-freeze the base terrain on a build that *enables every feature
the hydrology graph names*, closes the chain's feedback edges, adds the
typed local-patch stage, gives cliffs their realism and materials and
proves the base reproducible byte for byte. After this chunk the base
heightfield moves only through typed patches.

Needs rulings 1, 2, 3, 5, 6, 10 (plan §7).

## Read

- README.md §3, §7; decision 0057.
- [research/phase16/audit-chain-and-terrain.md](../../research/phase16/audit-chain-and-terrain.md)
  §1–3, §5–7 in full.
- `scripts/terrain-chain.sh` (the order), `worldgen/sculpt.py`,
  `refine_province.py` (`carve_to_profile`, `apply_local_carves`),
  `recarve_local.py`, `footprint.py`, `grade_settlement_pads.py`,
  `rebake_landcover.py`, `carve_routes.py`; polish-backlog rows this chunk
  absorbs (plan §9).
- `research/world-terrain/mountain-terrain-synthesis.md` (what the sculpt
  already does) and the cliff section of the chain audit §5.

## Deliver

1. **Chain reorder** to the audit §7 order: `sculpt_province` (corridor mask
   from the frozen `carve-inputs/`, `sculpt.py:94` → `carve_routes.carve_source`
   in the same commit) → `compile_hydrology` → `derive_hydrology_graph` →
   `refine_province_base` (no blueprints, no dock or lane dredge, no authored
   waterways, no typed terrain requests inside it) → **freeze gate**. Every
   place-derived carve moves to `apply_terrain_patches` (item 4).
2. **Terrain that enables the water.** From the graph's
   `terrainPrecondition`s: trench profiles per reach kind, plunge bowls sized
   from the drop, lip notches (the "straight terrain edge" backlog row), tarn
   bowls, weirs, knickpoints where ruling 1 allows falls on major rivers, plus
   the erosion pits filled or kept per ruling 2. A `test_terrain_preconditions.py`
   that reads the frozen array and the graph and fails on any unmet
   precondition — shown failing before the carve lands.
3. **Cliff realism** (C5, C6): lower `BENCH_MIN_Z`, noise-varied bench
   spacing (heightfield; no overhangs — say so in the record); a dedicated
   cliff material slot sampled only on the triplanar side projections with its
   own tile and normal map from the Tropical Skyrim candidates (chain audit
   §5 list) and the `peat_slope` slot moved to Tropical; the blown-out cliff
   albedo measured against the fall-site light. Rock scatter on cliff bands
   is 16f (it is vegetation-stage placement) — leave the cliff band raster for it.
4. **Local patches**: `world/sources/terrain/terrain-patches.json` (schema v1
   per the audit §3), `apply_terrain_patches` from
   `refined-height-frozen-f32.npy` in id order, `patch_water` (bounded
   re-flood at the frozen level), `compile_chunks --footprint` /
   `export_web_chunks --changed` wired; the six invariants as tests, each
   **failing** on an injected bad patch. Grading (16e) and pads (16h) will
   use this stage; here it ships with the dock/poling/typed-request carves
   converted to patches and applied once.
5. **Deterracing and coast** (backlog rows): measure the remaining terrace
   steps and report; coastal drama is a bounded sculpt pass on the shore band
   with the same freeze — do it here or record the owner's "not now".
6. **`rebake_landcover` tileable** (ruling 10): position-seeded noise,
   cached distance transforms; one province-wide bake at the freeze.
7. **Reproducibility**: two forced runs on unchanged sources, `chain-manifest.sh`
   zero differences; `test_chain_settles.py` extended; the frozen array's
   sha recorded in the vault and in `province/meta.json`.
8. **Repo size**: the generated province rasters move behind a fetch step
   (release artefact or vault pull) so the rebuilds this phase needs stop
   committing 35 MB each; Pages still builds.
9. Re-solve `compile_hydrology`, `compile_society` and re-derive the graph on
   the frozen base (ruling 1); do **not** re-plot — 16g does that on the
   frozen world.


### Added by 16a (2026-09-11) — things 16b inherits, none of them optional

- **The base.** The vault's `heightfield-sculpted-f32.npy` is the August
  array; today's `sculpt_province` is deterministic and differs (max 92.5 m,
  6.3 % of samples > 1 m). Re-freeze = run today's sculpt, then
  `compile_hydrology` (the solver's loop fix is in), then
  `hydrology_graph derive`; the graph's `sourceHeightSha256` must equal
  the frozen base's sha. The 16a graph was derived on exactly that output.
- **Pits.** The base has no river-trapped depressions; the refine stages
  make them. Freeze gate: `forcedBasins == 0` after the terrain stages, with
  every accepted body corresponds to a graph body (measured, authored or
  appended by the extension rule). No pit is filled by hand.
- **Coastal terrace steps.** The graph flags falls with
  `fall.suspect = "coastal-terrace-step"`: a low bank (< 15 m) dropping
  straight into the sea or a lagoon, the source heightmap's quantised shelf,
  not relief (e.g. `reach.2349-983` at 4.29 km E 1.80 km S: −0.05 m beside
  13.5 m in one step). Deterrace those banks into a slope; the freeze gate
  requires zero suspect falls on the re-derived graph. Only real relief
  makes a waterfall; nothing is cut to add one (owner, 2026-09-11).
- **Authored bodies.** `world/sources/hydrology/authored-bodies.json` (the
  Blackrose lake) is dug to its `terrainPrecondition`; its three feeder
  channels are authored waterways this chunk carves and appends to the graph
  under the extension rule (`origin: "terrain-stage"`).
- **Overlays.** After the freeze, regenerate the studio's `hydro-*.png` and
  `refined/flood-wet.png` from the frozen pass plus the `hydrograph-*.png`
  from the re-derived graph, in the same commit; the map's hillshade then
  matches the graph lines.
## Acceptance

- Freeze gate: precondition test green on the frozen array; two-run identity;
  the chain's `--list` shows the new order; no stage after the gate writes
  the frozen array.
- The patch invariants proven failable; the converted carves applied.
- Owner walk passes.

## Owner check

- Walk the province gate sites you signed off in 6b (`?view=character&x=0.93&z=0.92&t=12:00`
  and your own favourites) — does the ground still feel right?
- Stand under a cliff (the gorge at `x=2.53&z=0.32`): does the rock face
  read as rock with ledges rather than smooth grey and is it darker than the
  water in front of it?
- Visit two fall sites the graph named and one tarn: is there a bowl, a lip,
  a basin — before any water is drawn there?
- The pits you kept: are they where you expected?

## Gotchas

- `--allow-sculpt` has destroyed the frozen base twice; the freeze must be
  content-addressed and the chain must refuse to overwrite a frozen array
  whose sha is recorded.
- Do not run the chain while another agent holds `chain.lock`.
- Every material change is owner-reviewed ground; batch them into the one walk.

# 16d — The land beyond the border and the wall you cannot cross

**Goal.** The province's north, north-west and west edges continue as land
into the distance, fading at the horizon, from the real all-Tamriel
heightmap; the south and east stay sea; the character is stopped at the
playable border by an invisible wall with a catalogue message.

Ruling 8 (2026-09-11): stitched, **on condition that the join is smooth** — no jagged edge, gap or disconnect where the province meets the apron. That condition is the acceptance test.

## Starting state (2026-09-14, written by the closing 16c agent)

- **16c is delivered** (decision 0063, `research/phase16/16c-water-once-ledger.md`):
  `DELIVERED_THROUGH="16c"`; the chain's water stages are `compile_water`
  (once) and `terrain_request_postconditions`. Water schema 3: the compiled
  level is the high-water line, the tide and season only fall from it, the
  sea's energy comes from wind and the compiled directional fetch. Beyond
  the raster the water rasters CLAMP TO THEIR EDGE (a sea border carries the
  sea outward, a land border buried ground) — the apron meets that, never a
  hard plane at y = 0.
- **The chain does not run end to end today** (ledger §7): `compile_hydrology`
  drifts by 3 river cells from the pass on which the shaped ground was
  frozen, so `shape_province` refuses; run `terrain-chain.sh --from compile_water` (or
  from your new stage) until that root cause is found. Find it first: it
  is a 16b hygiene defect. Never `--refreeze`.
- **The owner's 16c batch is open**: dry beds at 5 sites and 90 perched
  channels (ledger §4) may become typed terrain patches; if they land before
  16d, `apply_terrain_patches` + `compile_water --footprint` re-run.
- **Nothing of the apron exists**: no `build_border_apron` module, no
  `province/border-apron.*`. A procedural ring (`DistantLands.tsx`, commit
  6bcf4172) was built and deleted for a sea gap and flat grey
  (`research/world-terrain/beyond-border-distant-lands.md` §1); ruling 8 is
  stitched, so do not rebuild it procedurally.
- **The ladder row is reserved and empty** (`[16d]=""`, already in
  `LADDER_ORDER`); add the stage name, bump `DELIVERED_THROUGH`, add a
  `hiddenLayers` entry in `apps/world-studio/public/province/ladder.json`
  if the studio gets an apron layer.
- **The source raster exists and registers** (audit-chain-and-terrain §4:
  8 px per cell, r = 0.826, match at (11960, 17752)); the edge fractions
  are measured there (north 0.997 land, west 0.611, NW 1.000, south 0.000,
  east 0.003) — do not re-measure. No neighbour plugin exists.
- **The credit already exists** (root README, Transbot9 mod 573); item 4 is
  "add the file hash to that line", not a new credit.
- **No boundary wall or clamp exists** (`apps/world-studio/src/provinceScale.ts`
  exports extents only); this part is blank slate.
- Red today for 16d: nothing. Keep: the aerial haze uniforms in
  `apps/world-studio/src/sky/aerial.ts`. Delete: nothing.

## Read

- [research/phase16/audit-chain-and-terrain.md](../../research/phase16/audit-chain-and-terrain.md)
  §4 — the measured edge fractions (north 99.7 % land; the "below sea level"
  claim was the south and east), the registration of
  `all-tamriel-heightmap-573/…/TamrielBeta_10_2016_01_prepped.png` against our
  province (8 px per cell, r = 0.826) and the fit.
- [research/world-terrain/beyond-border-distant-lands.md](../../research/world-terrain/beyond-border-distant-lands.md)
  (how shipped games do it; the runtime shape), `world/55` §98b.
- `worldgen/extract_province.py`, `export_web_chunks.py`, the studio's
  terrain mount (`packages/game-core/src/terrain/README.md`), the haze
  uniforms in `apps/world-studio/src/sky/`.

## Deliver

0. **The chain runs from the freeze gate** (decision 0066; owner 2026-09-14:
   layers are added onto what is built, never rebuilt from the sculpt). In
   `tooling/world-generation/scripts/terrain-chain.sh`: a plain run starts at
   `apply_terrain_patches`; before it, a `verify_freeze` step hashes the three
   frozen arrays and `hydrology-graph.json` against
   `world/sources/terrain/freeze.json` (seconds) and refuses on any
   mismatch; the six stages above the gate run only under `--refreeze`
   (which then walks the whole chain and re-records the shas). The
   fingerprint skip (`chain_stages.py`) stays for every stage below the gate.
   Delete the header's "edit `sculpt.py` and everything does" sentence; a
   frozen stage's code changing is caught at the next deliberate refreeze,
   which is the point. Test: a plain run with a deliberately edited
   `compile_hydrology.py` runs nothing above the gate and passes
   `verify_freeze`; a plain run against a vault array with one changed
   sample refuses at `verify_freeze`. The 16c ledger §7 drift (three river
   cells, fixed 2026-09-14) is the defect this closes for good.

## Acceptance

- **The chain ladder** (plan §3): this chunk's stages are `build_border_apron` (new). Add them
  to the ladder in `tooling/world-generation/scripts/terrain-chain.sh` and bump `DELIVERED_THROUGH`
  to this chunk in the delivering commit; until then a plain chain run skips
  them and their published JSON is stale.

- `npm test`, typecheck green; deployed and walkable.

## Owner check

**What you will see at this check** (plan §3, build only what is delivered): the ground, the water and the beyond-border land. No plants, roads or buildings.


- From the northern mountains (`?view=character&x=0.93&z=0.92&t=12:00`) look
  north and west: does the land go on into haze rather than ending in sea?
- Fly high (`?view=fly3d&cam=orbit&x=0.5&z=0.5`): any hard edge, step or
  colour change at the border?
- Walk to the western edge (`?view=character&x=0.05&z=3.0&t=12:00`): are you
  stopped and is the message right?
- From the beach at `x=6.12&z=1.638` look out to sea: still sea, no land.

## Gotchas

- Do not extrapolate where the raster has data; do not stitch a `.esp` that
  does not exist (the vault holds only Argonia's).
- The apron is backdrop: no water, no vegetation, no places on it.

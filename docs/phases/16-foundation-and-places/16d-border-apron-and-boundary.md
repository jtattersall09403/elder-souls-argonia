# 16d — The land beyond the border and the wall you cannot cross

**Goal.** The province's north, north-west and west edges continue as land
into the distance, fading at the horizon, from the real all-Tamriel
heightmap; the south and east stay sea; the character is stopped at the
playable border by an invisible wall with a catalogue message.

Ruling 8 (2026-09-11): stitched, **on condition that the join is smooth** — no jagged edge, gap or disconnect where the province meets the apron. That condition is the acceptance test.

## Starting state (2026-09-14, written by the closing 16c agent)

- **16c round 2 is delivered** (decisions [0063](../../decisions/0063-water-once-the-line-is-high-water.md),
  [0064](../../decisions/0064-waterfalls-are-the-vanilla-kit.md),
  [0065](../../decisions/0065-the-compile-realises-the-graphs-classification.md);
  [round-2 ledger](../../research/phase16/16c-round-2-ledger.md)):
  `DELIVERED_THROUGH="16c"`; the chain's water stages are `compile_water`
  (once) and `terrain_request_postconditions`. Water schema 3: the compiled
  level is the high-water line, the tide and season only fall from it, the
  sea's energy comes from wind and the compiled directional fetch. Beyond
  the raster the water rasters CLAMP TO THEIR EDGE (a sea border carries the
  sea outward, a land border buried ground) — the apron meets that, never a
  hard plane at y = 0.
- **A routine chain run starts at the freeze gate. That is now the
  script's own behaviour** (decision 0066; delivered by 16c, so the
  deliverable that asked for it is struck from §Deliver below). A plain
  `./scripts/terrain-chain.sh` runs `verify_freeze` (under a second: the
  three frozen arrays and `hydrology-graph.json` against
  `world/sources/terrain/freeze.json`) and then starts at
  `apply_terrain_patches`; the six rungs above the gate print
  `skipped (above the freeze gate)` and rebuild only under `--refreeze`,
  which re-records the shas and which the owner walks. `--from` naming an
  above-gate stage is refused. Your apron stage goes below the gate like
  every other; add it to `STAGES` and to the `[16d]` ladder row.
- **The 16c ledger §7 drift is fixed** (a routing correction was snapped to
  the grid row beside the river's last cell): `compile_hydrology` reproduces
  the frozen pass byte for byte again, proven by re-deriving and comparing
  the shas. You do not need `--from` to work around it. You do not need
  to re-run it at all — the gate checks it by hash.
- **The owner's 16c terrain batch is closed, as typed patches**
  (`world/sources/terrain/terrain-patches.json`, authored by
  `python3 -m worldgen.author_terrain_patches water-corrections`, which is
  cumulative and must stay so): five `bed-cut` patches for the approved dry
  beds and `levee` patches for the perched channel banks and body rims. The
  census that authors them is measured on the PATCHED ground, so re-author
  after any run that moves the water and let it converge; never author from
  a single pass's census alone (it drops the patches that already worked).
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

0. ~~The chain runs from the freeze gate~~ — **delivered by 16c**
   (2026-09-14): `worldgen/verify_freeze.py` plus the gate handling in
   `scripts/terrain-chain.sh`, proved by a plain run over a deliberately
   edited `compile_hydrology.py` that ran nothing above the gate and left
   `hydrology-pass1.npz` untouched. Nothing to do here; the Starting state
   above records the behaviour you inherit.

0b. **The record reader every later chunk ports to** (decision
   [0066](../../decisions/0066-downstream-stages-read-the-signed-record-never-re-solve-it.md)).
   *(Reconstructed 2026-09-14 by the closing 16c agent: commit a7a5ed16
   deleted this brief's Deliver content while rewriting the other chunks.
   16e, 16f and 16g already cite this reader by name, so the work was
   orphaned. The scope below is that commit's own message — "16d builds the
   graph-keyed record reader on ProvinceSurvey and deletes its
   flood/tidal/salinity fields" — plus the reader those briefs
   already cite. If anything here surprises you, put it to the owner first.)*
   One shared answer to "what water is at this point", keyed to the graph:
   `ProvinceSurvey.water_at(eastM, southM)` returning the body or reach id,
   its recorded `kind`, `levelM` and `season`, plus `reach(id)` and
   `body(id)` accessors; depth is the only value still sampled, from the
   compiled signed-depth raster at that id's extent. `water_report.ShippedWater`
   already loads `water-id.png` and `entities[]` and has `entity_at` — build
   on it rather than a second loader. Then DELETE `ProvinceSurvey.flood`,
   `.tidal` and `.salinity` (`worldgen/site_fields.py`) and the
   `hydro-flood` / `hydro-wetlands` / `hydro-salinity` PNG reads behind them,
   so every module still taking its water from the pre-graph Phase 3 pass
   breaks at once rather than carrying on with the wrong water. 16d does NOT empty
   `worldgen/record-reads-allowlist.json` (13 rows today; each chunk deletes
   its own rows as it ports — 16j requires it empty); 16d only provides the
   reader for their port. A row naming a module 16d itself touches
   goes in this chunk. Test: `test_record_reads` still passes, the reader
   answers the graph's kind at a body cell, a reach cell and dry ground. A
   module that reads a deleted field must fail to import.

1. **`worldgen/build_border_apron.py`**: cut the neighbour slice from the
   all-Tamriel raster around the registered match, out to ≥ 40 km, fit scale
   and offset **on the shared border ring** (not globally), C0-join to the
   frozen edge rows (sample our real edge heights), decay authored ridge
   profiles only where the raster itself ends, keep the sea to the south and
   east. Output a coarse height raster + a low-res mesh per mode
   (`province/border-apron.*`), vertex-coloured by the same gradient method,
   never a flat material. The 671 MB source PNG never enters the repo.
2. **Runtime**: one static mesh per mode, `castShadow/receiveShadow = false`,
   with the shared aerial haze, no colliders, a separate draw outside the province chunks; a fade so
   there is no visible far edge.
3. **The boundary**: an invisible wall at the playable border in the
   character mode (Rapier) and the message from `packages/text-catalogue`
   (style-guided, text-reviewed) when the character reaches it; the same
   boundary exported as a typed constant that `apps/game` reuses.
4. **Credits**: the all-Tamriel heightmap (Nexus 573) is already credited in
   the root README; add the source PNG's SHA-256 to that line in the same
   change (no second credit block).
5. Tests: the apron's edge ring equals the frozen edge heights within 0.5 m;
   the apron carries no colliders; the message key exists; the wall stops a
   probe walk. The equality test shown failing on an unjoined apron first.

## Record reads (decision 0066)

The apron reads the frozen edge rows and the registered raster; it derives
no class. Its one record decision (sea to the south and east) is the
measured edge fraction in the chain audit §4 — cite it, do not re-measure.
Nothing on the apron reads the graph and nothing should.

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

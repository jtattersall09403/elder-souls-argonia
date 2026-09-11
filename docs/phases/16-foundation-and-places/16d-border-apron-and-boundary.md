# 16d — The land beyond the border and the wall you cannot cross

**Goal.** The province's north, north-west and west edges continue as land
into the distance, fading at the horizon, from the real all-Tamriel
heightmap; the south and east stay sea; the character is stopped at the
playable border by an invisible wall with a catalogue message.

Ruling 8 (2026-09-11): stitched, **on condition that the join is smooth** — no jagged edge, gap or disconnect where the province meets the apron. That condition is the acceptance test.

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
4. **Credits**: the all-Tamriel heightmap (Nexus 573) credited in the root
   README with hash in the same change.
5. Tests: the apron's edge ring equals the frozen edge heights within 0.5 m;
   the apron carries no colliders; the message key exists; the wall stops a
   probe walk. The equality test shown failing on an unjoined apron first.

## Acceptance

- `npm test`, typecheck green; deployed and walkable.

## Owner check

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

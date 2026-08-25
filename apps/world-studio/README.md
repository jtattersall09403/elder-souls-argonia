# World Studio

Province map, 3D flyover and physical-character mode for inspecting generated
world data. Deployed at `/studio/` on the Pages site; dev server shares tunnel
port 8081 with the combat sandbox (run one at a time).

- **Map view**: terrain with toggleable generated layers (rivers, wetlands,
  routes, waterways, rootways, danger, cultures, regions, mist, flood, soil,
  watersheds, salinity), anchor markers, sea-level and relief controls, and a
  hover tooltip reporting region / danger / culture / climate per pixel.
- **3D flyover**: double-click the map (or "Fly the province"). Terrain is
  the same streamed chunk data the character mode uses (identical sampling and
  splat material, LOD follows the camera), so relief judged from the air is
  ground truth; the old coarse drape mesh remains only as a fallback while the
  chunk manifest loads. Fly (pointer-lock WASD, E/Q, Shift ×4) or orbit;
  exaggeration slider and a log-scale flight-speed slider (running pace →
  fast skim, `?spd=`). Terrain *feel* is judged on foot, not from here
  (decision 0015).
- **Physical character mode (Phase 7a)**: "Walk the province" (map) or "Walk
  here" (fly HUD). The combat sandbox's character (`@elder-souls/character` +
  `@elder-souls/game-core`) walking the real terrain: Rapier heightfield
  colliders per chunk from `public/province/chunks/` (LOD-1 grids; the
  vertical-scale slider applies here too — colliders, meshes and environment
  queries re-scale in lockstep, canonical ×1 per decision 0015), chunked LOD
  render meshes sharing the same data and splat material
  (`src/groundMaterial.ts`), the sandbox's grounded ecctrl movement behind
  `PlayerMovementController`, its follow camera, and keyboard/touch/gamepad
  input parity. The HUD is the live environment-query probe: position, chunk,
  ground material, region, water depth, speed. WASD moves, hold Space to
  sprint, J jumps. Combat, inventory/equipment, enemies, targeting and the bow
  arrive with **Phase 10b** (full sandbox parity — moved from 7b, decision
  0017); swimming and climbing with Phase 9.
- **World time, natural light and sky (Phase 8a, module 55)**: both 3D modes
  are lit by one system (`src/sky/`) — the deterministic world clock
  (`packages/world-time`), a Preetham sky dome on a physical lux scale,
  sun/moon lights with cascaded shadow maps, ACES tone mapping with
  eye-adaptation exposure, throttled sky IBL, an aerial-perspective haze
  driven by `province/climate-air.png` (humidity/mist/canopy), the thirteen
  canonical constellations + Southron pole star + drifting Serpent, and
  Masser/Secunda as lit spheres (correct phase by construction). The
  **time panel** (top right in 3D views) scrubs time/date, sets the run rate,
  and jumps to named region light presets; every material/kit review from now
  on is lit by a named region+time preset (decision 0016). Debug state:
  `window.__STUDIO_SKY_DEBUG__` (sun altitude, exposure, moon phase, env
  bakes…). Implementation choices: decision 0020.
- **Reproducible URLs**:
  `?view=fly3d&cam=fly|orbit&x=<km>&z=<km>&ex=<n>&spd=<m/s>&mats=<set>` and
  `?view=character&x=<km>&z=<km>&race=<raceId>&profile=<capabilityProfileId>`,
  plus world time on both: `&t=<HH:MM>&d=<month>-<day>` (1-based month),
  `&rate=<world-min/s>` (0 = paused, the default), `&lat=<deg>` (debug
  latitude override), `&smsize=<px>` (shadow-map size for headless probes).
- **Ground-material sets**: terrain texture palettes are versioned under
  `public/textures/ground/<set>/` (registry: `index.json`; built by
  `worldgen.build_ground_materials`). The fly HUD shows a selector when more
  than one set exists — for A/B comparison and instant revert of palette
  experiments. Material ids/names must stay aligned across sets.

Data comes from `public/province/` (built by `tooling/world-generation` — see
its README for the compile pipeline) and `world/sources/anchors/`. Terrain
chunks are RG16 PNGs + `chunks-web-manifest.json` written by
`worldgen.export_web_chunks` (committed — CI and Pages never see the vault).

## Validation

- `npm test` — data-contract tests (anchors, chunk manifest coverage) + the
  light-rig unit tests (`src/sky/lightRig.test.ts`).
- `node scripts/probe-sky.mjs` (from `apps/combat-sandbox`) — fixed-instant
  sky/light probe: pins the named region presets at exact WorldInstants,
  asserts sun altitude/day phase/moon phase/exposure via
  `__STUDIO_SKY_DEBUG__` **plus a scene light census** (leaked CSM cascade
  lights are what broke the first 8a gate — decision 0021), checks screen
  brightness bands, and screenshots each preset into `artifacts/`. Covers
  **both fly and character views** — the two canvases wire lights/shadows
  differently and fly-only probes masked walk-mode defects. Slow under
  software GL. `scripts/diagnose-sky.mjs` is the deeper one-off variant
  (dumps every light/material) for debugging light regressions.
- `node scripts/probe-character.mjs` (from `apps/combat-sandbox`, which owns
  the playwright dep) — headless end-to-end probe of character mode against a
  production build: boots the page, waits for the HUD, walks/sprints, asserts
  distance travelled and settle altitude, and screenshots. Slow under software
  GL (~2–5 min); not a CI gate.
- In character mode the page exposes `window.__STUDIO_CHARACTER_DEBUG__`
  (player Y, grounded, CPU ground height vs physics raycast, collider list)
  for probes to compare the environment query against the live Rapier world.

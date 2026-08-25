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
- **Reproducible URLs**:
  `?view=fly3d&cam=fly|orbit&x=<km>&z=<km>&ex=<n>&spd=<m/s>&mats=<set>` and
  `?view=character&x=<km>&z=<km>&race=<raceId>&profile=<capabilityProfileId>`.
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

- `npm test` — data-contract tests (anchors, chunk manifest coverage).
- `node scripts/probe-character.mjs` (from `apps/combat-sandbox`, which owns
  the playwright dep) — headless end-to-end probe of character mode against a
  production build: boots the page, waits for the HUD, walks/sprints, asserts
  distance travelled and settle altitude, and screenshots. Slow under software
  GL (~2–5 min); not a CI gate.
- In character mode the page exposes `window.__STUDIO_CHARACTER_DEBUG__`
  (player Y, grounded, CPU ground height vs physics raycast, collider list)
  for probes to compare the environment query against the live Rapier world.

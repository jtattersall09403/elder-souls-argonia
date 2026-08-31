# Elder Souls: Argonia

A fan-made, non-commercial, standalone total-conversion-style Skyrim project:
the vibe and world-design values of TES III Morrowind, Dark Souls-like combat,
Breath-of-the-wild climbing, extensive swimming, sailing and underwater
exploration — set in Tamriel's Black Marsh and played **in the browser**.

Built with Three.js / React Three Fiber / Rapier, deployed to GitHub Pages by
GitHub Actions — playable combat sandbox at
[the Pages root](https://jtattersall09403.github.io/elder-souls-argonia/), the
province map/flyover at
[/studio/](https://jtattersall09403.github.io/elder-souls-argonia/studio/). Assets derive from locally-owned Skyrim data and credited
community mods (full list in [Credits and third-party sources](#credits-and-third-party-sources)
below — we are deliberately up-front about everything we use); source archives
never enter this repository.

## Layout

- `apps/combat-sandbox/` — playable combat/character proving ground (deployed
  at the Pages root)
- `apps/world-studio/` — province map/inspection app (deployed at `/studio/`)
- `apps/game/` — integrated game shell (grows as the world build progresses)
- `packages/contracts/` — small stable cross-system interfaces
- `packages/game-core/`, `packages/character/`, `packages/character-assets/` —
  the portable combat/character/game systems and asset manifests shared by the
  apps (decision 0013)
- `packages/world-time/`, `packages/world-weather/` — deterministic world
  clock/calendar/ephemeris and province weather state (pure data, no rendering)
- `world/sources/` — registered world-generation inputs and provenance
- `tooling/asset-pipeline/` — Python/Blender pipeline turning owned Skyrim data
  into game-ready GLBs (sources live in a local vault via `ELDER_SOULS_ASSET_ROOT`)
- `tooling/world-generation/` — offline world extractors/compilers
- `tooling/stats-sim/` — balance-simulation harness for the stats/progression design
- `docs/` — start at [docs/README.md](docs/README.md); the province-scale world
  plan is [docs/world/00-core.md](docs/world/00-core.md) (universal core, read
  in full) plus the modules routed by [docs/world/README.md](docs/world/README.md);
  [docs/PROGRESS.md](docs/PROGRESS.md) is where we're up to

## Develop

```bash
npm ci
npm test            # all workspaces
npm run typecheck
npm run dev         # combat sandbox dev server
```

## Credits and third-party sources

Running list of external work used by this fan-made, non-commercial project.
One line per source; entries are added when a source is actually ingested or
its code is adapted (owner policy: credits live here, up front — decision
0023). The final in-game credits list is generated from this list plus the
asset registry.

### In use now

- **ecctrl** (Erdong Chen / pmndrs) — character controller used by the combat
  sandbox, MIT.
- Skyrim vanilla assets (Bethesda) — processed via `tooling/asset-pipeline` for
  this non-commercial fan project; source archives stay out of the repo.
- **The Elder Scrolls V: Skyrim** game data — `Skyrim.esm` / `Update.esm` from
  the owner's own legally-purchased Steam copy, installed to the local asset
  vault (2026-08-31) and never redistributed. Read offline only, for asset
  names/dimensions and for *statistics* about placement (`REGN`, `GRAS`,
  reference distributions — see
  [the cross-check](docs/research/vanilla-skyrim-esm-placement-crosscheck.md));
  no plugin content or authored location is copied, and the only Bethesda data
  that reaches a build is what the pipeline bakes from the owner's copy.
- Full runtime npm dependency licences: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **UESP (en.uesp.net)** — lore reference for all canon dossiers (wiki content
  CC-BY-SA; we cite page names, no wiki text ships in the game).
- **Dynamic Dodge Animation** (Nexus SSE mod 79598, lSmoothl, v1.5) — source
  of the combat sandbox's `ROLL` animation (DMCO base `MCO_DodgeForward2.hkx`).
- **Rim Parry and Execution** (Nexus SSE mod 114366, SHADOWPQ, v1.1) — source
  of `PARRY`/`PARRY_FOLLOW_THROUGH`, `RIPOSTE`, `RIPOSTED_HIT1`,
  `CRITICAL_KNOCKDOWN`, `CRITICAL_DEATH`, `DEATH` and `GUARD_HIT_A/B`, and of
  the per-family parries: `GREATSWORD_PARRY`, `SHIELD_PARRY` and
  `GREATAXE_PARRY` (with their follow-throughs).
- **Backstab animation for sneak killmove SE** (Nexus SSE mod 74453, Ichaflash
  original / rhonjhonson uploader, v1) — source of `BACKSTAB`/`BACKSTABBED`.
- **Tamriel Worldspaces — Argonia worldspace** (Nexus SSE mod 118678, author
  SqueeblySplat; derived from Transbot9's heightmap) — province macro terrain
  prior.
- **Transbot9 — All Tamriel Heightmap** Beta06 (Nexus SSE mod 573, CC BY-NC
  4.0) — cross-border context terrain.
- **ambientCG** (ambientcg.com, CC0) — ground textures in the terrain
  material library (Ground024/025/026/040/050/051/054).
- **Poly Haven** (polyhaven.com, CC0) — ground textures in the terrain
  material library (mud_forest, aerial_mud_1, mud_cracked_dry_riverbed_002;
  8b shoreline additions: coast_sand_05, aerial_beach_01,
  ganges_river_pebbles).
- **Tropical Skyrim — A Climate Overhaul** (Nexus classic Skyrim mod 33017,
  Soolie) — tropical landscape ground textures in the terrain material
  library (beach, ocean floor, river gravel/bed/mud, tropicalised moss
  rocks + mountain slabs); grass and plant meshes/textures in the flora and
  groundcover kits (ferngrass, grassfern, grassplant, marsh grass, cattail,
  man fern — Phase 10); owner-preferred source for later tropical
  flora/creature needs (module 90 §74.1a).
- **Project Rainforest SE** (Nexus SSE mod 20636, sa547; credits incl.
  LorSakyamuni's TW3 Landscape Resource and Vurt's SFO) — tropical ground
  textures in the terrain material library (owner-approved 2026-08-23).
- **Landscape – Aendemika of Vvardenfell** (Nexus Morrowind mod 59713) —
  Bitter Coast swamp ground set in the terrain material library
  (bank/scum/muck/mud/moss/undergrowth/grass/scrub/rock).
- **Argonian Xanmeer Tileset — Modder's Resource** (Nexus SSE mod 181193,
  DarthVitrial, v1.1) — the Argonian ruin/interior architecture kit: 85 meshes
  (exterior shells, hallway and room modules, roofs, stairs, furniture, urns
  and pots, the animated mouth-door), catalogued in the Phase 10 asset
  registry and the source of the Xanmeer kit grid.
- **Black Marsh & Valenwood** (https://www.moddb.com/mods/black-marsh-valenwood;
  itself bundling many credited modder resources — see its page) — ground
  textures in the `bmv-v1` terrain material set; mesh pool for later phases.
- **WaterThreeJS** (https://github.com/achrefelouafi/WaterThreeJS, MIT,
  © achrefelouafi) — Gerstner wave model + CPU fixed-point surface sampler,
  shore/contact foam, underwater fog/god-ray shading and the scene-RT frame
  pipeline, adapted into the Phase 8b water renderer
  (`packages/game-core/src/water/`, `apps/world-studio/src/water/`).
- **SeedOcean** (https://github.com/reed-soul/SeedOcean, MIT, © reed-soul) —
  the flow-map data contract (RG direction / B speed / A shore) adopted by
  `worldgen/compile_water.py`; no code vendored.
- **three.js `Water2` / Valve** — dual-phase flow-map advection technique
  (Vlachos, SIGGRAPH 2010) used for river ripple normals (three.js MIT,
  already in THIRD_PARTY_NOTICES).
- **webgl-water / threejs-water** (MIT, © 2011 Evan Wallace, © 2026 Yong Su —
  https://github.com/jeantimex/threejs-water) — the ping-pong wave-equation
  ripple simulation adapted for the interactive water patch around the
  player (`apps/world-studio/src/water/RippleSim.ts`).

### Planned (recorded before ingestion; move up when used)

- **Narrative asset pool** — 25 mods (A01–A25) and 12 vanilla families
  (V01–V12) catalogued with URLs in
  [docs/quests/70-assets.md](docs/quests/70-assets.md); move entries here as
  ingested.
- **Fan-story inspirations** — Matthew Aaron Evans (Eye treasure-hunt core)
  and named Eye-interpretation contributors, per
  [docs/quests/99-sources-credits.md](docs/quests/99-sources-credits.md).
- **Ground-texture mod pool** (vetted in
  [docs/research/black-marsh-ground-texture-sources.md](docs/research/black-marsh-ground-texture-sources.md)):
  A Cathedralist's PBR Landscape (SSE 137333), Cathedral Landscapes (SSE
  21954, share-alike) — candidates for PBR-map upgrades in Phase 8+.
- Water rendering reference held for a later tier (MIT): ABYSSAL ocean
  (spectral FFT open-sea) — see
  [docs/research/water-rendering-threejs.md](docs/research/water-rendering-threejs.md).
- **Sound sources** (module 57/90 §74.4): vanilla Skyrim sound library;
  Skyrim sound-mod packs credited per mod as ingested; Sonniss GDC
  royalty-free bundles and CC0 Freesound for tropical ambience gaps.
- Community priors: Inkarnate Black Marsh map ("Argonian State 4E 231", Reddit)
  and r/ElderScrolls demographic maps — planning priors only, hashes in the
  master plan §82.

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
- `world/sources/` — registered world-generation inputs and provenance
- `tooling/asset-pipeline/` — Python/Blender pipeline turning owned Skyrim data
  into game-ready GLBs (sources live in a local vault via `ELDER_SOULS_ASSET_ROOT`)
- `tooling/world-generation/` — offline world extractors/compilers
- `docs/` — start at [docs/README.md](docs/README.md);
  [docs/world-gen-master-plan.md](docs/world-gen-master-plan.md) is the plan for
  the province-scale world; [docs/PROGRESS.md](docs/PROGRESS.md) is where we're up to

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
- Full runtime dependency licences: see `apps/combat-sandbox/THIRD_PARTY_NOTICES.md`.
- **UESP (en.uesp.net)** — lore reference for all canon dossiers (wiki content
  CC-BY-SA; we cite page names, no wiki text ships in the game).
- **Tamriel Worldspaces — Argonia worldspace** (Nexus SSE mod 118678, author
  SqueeblySplat; derived from Transbot9's heightmap) — province macro terrain
  prior.
- **Transbot9 — All Tamriel Heightmap** Beta06 (Nexus SSE mod 573, CC BY-NC
  4.0) — cross-border context terrain.
- **ambientCG** (ambientcg.com, CC0) — ground textures in the terrain
  material library (Ground024/025/026/040/050/051/054).
- **Poly Haven** (polyhaven.com, CC0) — ground textures in the terrain
  material library (mud_forest, aerial_mud_1, mud_cracked_dry_riverbed_002).
- **Project Rainforest SE** (Nexus SSE mod 20636, sa547; credits incl.
  LorSakyamuni's TW3 Landscape Resource and Vurt's SFO) — tropical ground
  textures in the terrain material library (owner-approved 2026-08-23).
- **Landscape – Aendemika of Vvardenfell** (Nexus Morrowind mod 59713) —
  Bitter Coast swamp ground set in the terrain material library
  (bank/scum/muck/mud/moss/undergrowth/grass/scrub/rock).
- **Black Marsh & Valenwood** (https://www.moddb.com/mods/black-marsh-valenwood;
  itself bundling many credited modder resources — see its page) — ground
  textures in the `bmv-v1` terrain material set; mesh pool for later phases.

### Planned (recorded before ingestion; move up when used)

- **Narrative asset pool** — 25 mods (A01–A25) and 12 vanilla families
  (V01–V12) catalogued with URLs in
  [docs/quests/70-assets.md](docs/quests/70-assets.md); move entries here as
  ingested.
- **Fan-story inspirations** — Matthew Aaron Evans (Eye treasure-hunt core)
  and named Eye-interpretation contributors, per
  [docs/quests/99-sources-credits.md](docs/quests/99-sources-credits.md).
- **Argonian Xanmeer Tileset — Modder's Resource** (Nexus mod 181193) — Xanmeer
  architecture kit.
- **Ground-texture mod pool** (vetted in
  [docs/research/black-marsh-ground-texture-sources.md](docs/research/black-marsh-ground-texture-sources.md)):
  A Cathedralist's PBR Landscape (SSE 137333), Cathedral Landscapes (SSE
  21954, share-alike) — candidates for PBR-map upgrades in Phase 8+.
- Water rendering references (MIT): WaterThreeJS, SeedOcean,
  jeantimex/threejs-water, ABYSSAL ocean.
- **Sound sources** (module 57/90 §74.4): vanilla Skyrim sound library;
  Skyrim sound-mod packs credited per mod as ingested; Sonniss GDC
  royalty-free bundles and CC0 Freesound for tropical ambience gaps.
- Community priors: Inkarnate Black Marsh map ("Argonian State 4E 231", Reddit)
  and r/ElderScrolls demographic maps — planning priors only, hashes in the
  master plan §82.

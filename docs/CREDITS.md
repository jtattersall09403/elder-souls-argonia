# Credits and third-party sources

Running list of external work used by this project. Keep one line per source;
add entries when a source is actually ingested or its code is adapted. The final
in-game credits list is generated from this file plus the asset registry.

## In use now

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

## Planned (recorded before ingestion; move up when used)

- **Narrative asset pool** — 25 mods (A01–A25) and 12 vanilla families
  (V01–V12) catalogued with URLs in
  [quests/70-assets.md](quests/70-assets.md); move entries here as ingested.
- **Fan-story inspirations** — Matthew Aaron Evans (Eye treasure-hunt core)
  and named Eye-interpretation contributors, per
  [quests/99-sources-credits.md](quests/99-sources-credits.md).

- **Argonian Xanmeer Tileset — Modder's Resource** (Nexus mod 181193) — Xanmeer
  architecture kit.
- **Ground-texture mod pool** (vetted in
  [research/black-marsh-ground-texture-sources.md](research/black-marsh-ground-texture-sources.md)):
  A Cathedralist's PBR Landscape (SSE 137333), Cathedral Landscapes (SSE
  21954, share-alike) — candidates for PBR-map upgrades in Phase 8+.
- Water rendering references (MIT): WaterThreeJS, SeedOcean,
  jeantimex/threejs-water, ABYSSAL ocean.
- Community priors: Inkarnate Black Marsh map ("Argonian State 4E 231", Reddit)
  and r/ElderScrolls demographic maps — planning priors only, hashes in the
  master plan §82.

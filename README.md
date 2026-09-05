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
  `GREATAXE_PARRY` (with their follow-throughs); the per-family executions
  `GREATSWORD_RIPOSTE` and `GREATAXE_RIPOSTE`; and `BACKSTABBED_FORWARD`, the
  victim half of a two-handed backstab.
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
  flora/creature needs (module 90 §74.1a). **Phase 10 round 7:** its Anvil
  giant-tree pieces (`anvil_palm_trunk`, `anvilgianttrunk`, the
  `anvil_palm foliage` crowns and `anvil_root01` buttress flare) are the
  jungle roof — assembled into two composite trees by the kit builder. The
  geometry and textures are Soolie's; only the arrangement is ours. **Phase 11:** it is
  also our architecture **texture overlay** — Tropical ships no architecture
  meshes, but retextures the vanilla farmhouse/dock/bridge/city sets under
  vanilla filenames, so kits declare `textureOverlayPools: ["tropical"]` and
  the vanilla-backed settlement pieces build hot-and-wet instead of Nordic
  grey (`settlement-imperial-v1`, `settlement-stilt-v1`). **Phase 11 Part 6:**
  the same trunk-only pieces (`anvilgianttrunk`, `anvil_palm_trunk`,
  `anvil_root01`) also join `settlement-root-v1` as the stand-alone Hist trunk
  column — the one thing no other tree asset we hold could be, every other Hist
  mesh being a whole tree with a crown.
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
  Its bundled **advertising/notice board** resource (`advertising_board.nif`,
  built from scratch by its author after Stroti's Oblivion miscellaneous
  resource; roof shingles from vanilla Riften, window/wood-end/stall-roof from
  Dark Creations' Beyond Skyrim: Bruma — per the mesh's own readme) is the
  nailed licence/notice board in the `works-v1` kit.
- **Mud Mother Grove — An Argonian Mud Hut** (Nexus SSE mod 146557,
  GeminiVoid, v1.5.1) — the Shadowfen mud/wattle building culture: round mud
  hut shell and thatch roofing, round deck, woven furniture and fences, tents,
  carapace oven, fish rack, painted pottery, totem, bone chime, Sithis shrine
  and **the Hist tree** (`settlement-mud-v1` / `settlement-stilt-v1` kits,
  registry pool `mudmother`).
- **Skyrim Ferries — Free movement 1 button boat water travel** (Nexus SSE mod
  109843, Mharlek1; ferry meshes by yamadori, v1.4.1) — poled plank rafts and
  small ferry craft, the first keel-less hulls in the province
  (`plank_ferry_swamp_*`, `rowboat_ferry_swamp_01`; pool `ferries`). Meshes
  only — none of the mod's scripts are used.
- **RowBoats and Oars of Skyrim** (Nexus SSE mod 35341, PraedythXVI, Final) —
  rowboat and oar for the Imperial/foreign fringe (`settlement-imperial-v1`;
  pool `rowboats`).
- **Creation Club Ayleid Ruin Resources** (Nexus SSE mod 83999, SarthesArai,
  v1.0) — 68 Ayleid ruin meshes catalogued for the Barsaebic ruin layer
  (pool `ayleidcc`; interior modules only — see the settlement asset
  inventory).
- **Xalfek — An Argonian Home** (Nexus SSE mod 55595, DexMods, v1.0; itself
  bundling many credited modder resources — see its page) — Argonian interior
  props and furniture, catalogued in the asset registry (pool `xalfek`).
- **Darkwater Den** (Nexus classic Skyrim mod 52630, Elianora) — downloaded,
  then **withdrawn unused**: its licence forbids Elianora-original meshes in
  any public work, and this project deploys publicly. No pool, no kit uses
  it; listed here only so the provenance trail stays complete.
- **Here There Be Monsters - Sign of Cipactli** (Nexus SSE mod 35933, Araanim,
  v2.92; itself bundling many credited modder resources — see its page) — the
  richest Black Marsh asset set we have found: the Argonian bamboo-hut forms
  and wicker furniture, the Kothringi stilt platform and Tamu wood dock/plank
  family, and the xanmeer ruin ornament (mesoamerican pyramids, feathered
  serpent and serpent-sigil statues, goddess statue, gargoyle, runic stone,
  totems). **Phase 11 Part 6:** four of those xanmeer statics — `Totem02`,
  `Totem03`, `RunicStone` and `SerpentSigilStatue` — join `underwater-v1` as the
  Argonian sunken-shrine set (the drowned shrine to Xhon-Mehl the Fisher at
  Lilmoth); they were chosen over the mod's `StatueGoddess` and `Totem01`
  because those two carry Call-of-Cthulhu textures and read as a different
  culture. Its creature content is **not** ingested — that is a Phase 13 job.
- **Morrowind Imperial Keep Set (Remodeled)** (Nexus SSE mod 133090,
  Tesak1243, v1.0; modder's resource, use with credit) — the Morrowind-Imperial
  civic and military language behind the `imperial-keep` kit (88 exterior
  pieces of the 164 shipped): curtain walls with gate/corner/destroyed
  variants and wall stairs, big and small stackable towers, two keep blocks,
  guard towers, foundations, plaza, low stone yard walls, ledges and steps,
  river bridges and stone docks, stables, and the well/flagpole/pedestal civic
  clutter plus rubble condition variants. Sourced Phase 11 to stop Gideon and
  the imperial fringe reading as Nordic thatch. Archive
  `Morrowind Imperial Keep Set-133090-1-0-1730675084.rar`, sha256
  `d22974919cdd3d6cea25f2b0b0851f2cb636a7569b7c3d1f8ae7b34c8584b9c0`.
- **Morrowind Hlaalu Architecture** (Nexus SSE mod 157997, Angelio, uploaded
  by Kai4304, v2.0; modder's resource, use with credit; itself bundling many
  credited modder resources — see its page) — the domestic tier under that
  masonry, behind the `hlaalu-domestic` kit (68 of 127 pieces): premade and
  modular Hlaalu houses, a base/middle/top tower stack, yard and street walls
  with broken variants, steps, awnings, fences, stone blocks, small bridges,
  dockside cranes and lamp posts. Built on 133090 and retextured, so it reads
  as the same town. Archive
  `Morrowind Hlaalu Architecture-157997-v2-0-1759663700.7z`, sha256
  `c32811d704f25d33fe421e20d1258a965232c6fafc530a2f99d95c1f74c8cad7`.
- **Ayleid Ruins Building Kit -Resources-** (Nexus classic Skyrim mod 90667,
  Imperial Society) — the 85-piece exterior monumental-stone subset (blocks,
  quad blocks, stairs, statue walls, bridges, towers, columns) behind the
  `ruin-monumental-v1` kit.
- **Skyfall's Sleeping Hist Tree Overhaul** (Nexus SSE mod 116792, Skyfall515,
  ToosTruus and Clofas, v1.4) — a second hero-Hist tree mesh, Hist flowers,
  rock cairns and rune circle (our grave-stake stand-ins) and a wind chime.
- **Script free ship sailing** (Nexus classic Skyrim mod 67727, ElstarTomas;
  canoe model by FrankFamily, v2.3) — the dugout canoe and oars: the only
  genuine canoe mesh we located anywhere.
- **Solitude (ghost) Ferry** (Nexus classic Skyrim mod 89948, Syntia, v1.1) —
  the poled ferry raft (`ferryraft01`) and its plank pieces.
- **Ships and boats of Tamriel** (Nexus SSE mod 41653, ThatShipGuy/DeviantKaled,
  v1.2) — the Cyrodiilic city ferry, river ferry and rowboat for the Imperial
  fringe and the Topal ports, plus wreck and ship-interior dressing.
- **Sailboats - Script Free Sailing EXPANDED SSE** (Nexus SSE mod 40057,
  Araanim, v2.0; extends ElstarTomas' *Script free ship sailing* and uses
  DeviantKaled's lore-friendly ship/boat resources, both credited on its page)
  — eight sailing hulls (Nord longboat, Breton sailboat, Elven sailboat, each
  with a furled-sail variant, plus two rowboats) for the keeled foreign craft
  in the port and pirate-anchorage families (pool `sailboats`,
  `watercraft-v1`). Meshes only — its Papyrus scripts are not used. Archive
  `Sailboats SSE-40057-2-0-1621552064.7z`, sha256
  `2e2919e5ff6b2d66cc4055efd305db11e5e920f465e95bf09b513e0892642d82`.
- **Cyrodiil Ship and boat resource** (Nexus classic Skyrim mod 59426, Markus
  Liberty / Tellmann for Beyond Skyrim, v1; collision work by Tamira and
  1shoedpunk; released as a modder's resource, use with credit) — the
  Cyrodiilic galleon shipped as a **bare hull plus a separate mast assembly**
  (`imperialship01base` / `imperialship01masts`) and a rowboat with two broken
  variants. The hull-without-masts is our answer to the shipyard
  `hull-on-stocks` gap (pool `impships`, `watercraft-v1`). Archive
  `Imperial styled Ship and boats Resource-59426-001.zip`, sha256
  `aca684ec9ef1a7825e17785f4ff119a7ae16bf1399f829074db78de9d04a3f29`.
- **Boats - Operational Animated Travel** (Nexus SSE mod 110882, Enneal,
  v1.6.2; boat-carrier meshes from Vicn's resource, with DeviantKaled's
  assets credited on its page) — the animated boat-carrier hulls
  (`boatcarrierdefault`, `boatcarrierferry`, `boatcarrier02`), the only
  moored/travelling hulls we own that carry their own `NiControllerSequence`
  motion. Catalogued as pool `boatsanim` but **not packaged into a kit**: each
  hull ships with an untextured editor marker baked into the mesh, and
  stripping it would mean editing the author's geometry (kit notes in
  `watercraft-v1`). Meshes only — none of its Papyrus ferry scripts is used.
  Archive `Boats - Operational Animated Travel-110882-1-6-2-1740141743.7z`,
  sha256 `07f7ebace706d0f8f169f5bc1b76435f297aa9631a3962a2781aa93e6ef64583`.
- **Depths of Skyrim - An Underwater Overhaul** (Nexus SSE mod 26913,
  TheBlackpixel, v1.1.7) — reef and sea-bed flora (coral at three scales,
  seaweed, algae, kelp, driftwood) for the drowned layer, used with the
  corrected meshes from **Depths of Skyrim - Mesh fixes** (Nexus SSE mod
  174995, Gobsnek, v1.0.0) overlaid.
- **SIRENROOT - Deluge of Deceit** (Nexus SSE mod 70917, Everglaid, v1.30) —
  the free-standing broken/hollow ruin blocks and walkable rubble floors that
  give a submerged ruin a standable interior, plus water-caustic meshes.
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

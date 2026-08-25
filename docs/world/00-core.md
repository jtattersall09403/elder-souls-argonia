# World generation — core principles (read this IN FULL, every session)

This is the universal short version of the world-generation master plan. Every
world-gen agent reads all of it (~4k tokens); the full detail lives in the
modules listed in [README.md](README.md) — read the ones your task touches.

## What we are building

A province-scale Black Marsh / Argonia for a browser-played, standalone
total-conversion-style Skyrim fan game: Morrowind's geographic coherence,
regional distinctiveness, cultural density and exploratory character; Dark
Souls combat; BotW climbing; deep swimming/underwater play; sailable boats;
fixed regional danger. Production model:

> canonical maps & lore anchors → province terrain & hydrology → regional
> ecology/culture/danger/transport fields → causal semantic world graph →
> agent-authored important places → deterministic asset compilers → gameplay
> and performance validation → streamed runtime world bundles

Three simultaneous scales: (1) whole-province production data from day one,
(2) one retained reference watershed at full detail (the Blackrose basin,
decision 0008), (3) small disposable laboratories.

## The rules that bind every task

1. **Every location has a causal reason to exist** — geography, hydrology,
   ecology, history, culture, politics, economics, individual motive. Causes
   determine layout, occupants, encounters, loot and state of repair. A
   location without a causal record is a validation failure. (Module 40.)
2. **The world never receives the player's level.** Danger, populations and
   loot are fixed by place, era and explicit world state (decisions 0004,
   0007). Capability and knowledge open depth; the world never softens.
3. **Hydrology first.** Water is the province's primary structure; terrain and
   water are solved together; routes, settlements and ecology follow from
   drainage. (Module 50; climate fields are a first-class layer, §33.1, and
   **time/light/sky/weather is its own first-class system, Module 55** — one
   deterministic world clock, light and air derived from the climate fields.)
4. **Ground everything in lore** (CLAUDE.md golden rule): dossiers in
   `world/sources/lore/` first, extend from UESP when thin, cite pages,
   respect era 4E 201 (decision 0002). Community material is a prior.
5. **Quests bind the world build**: the per-quest world provisions in
   [docs/quests/20-world-provisions.md](../quests/20-world-provisions.md) are
   requirements on every phase; Milestone-1 provisions must exist before
   narrative production (acceptance rule).
6. **No new art — ever — and terrain identity comes from placed assets** (§9):
   the base heightfield is coarse; rocks, vegetation, kits, clutter and water
   carry the perceived detail. No new models, textures or **animations**: every
   visual and every clip comes from vanilla Skyrim or a mod, via the asset
   pipeline. A gap is a **sourcing job** — check the vault and Module 90's
   candidate tables (§71 procedure, §74.3 animation gaps), research the mod
   scene, download with the owner's Nexus premium key, record source + credits
   + hash. Take mods' assets, never their SKSE/Papyrus code. Mod *worlds* (e.g.
   Black Marsh & Valenwood, §74.1b) are asset pools and references to learn
   from — never lift-and-shift their authored places as ours; we build our own
   world.
7. **Region grammar drives everything** (§16): each ecological region class
   changes movement, visibility, settlement forms, routes, encounters,
   materials, sound and danger — not just colours. Materials/asset choices
   link to region classes (RegionGrammar.materialPalette).
8. **Conventions**: metres, Y-up, sea level y=0 (0003); **×1 horizontal
   (~7.4 km province, ≈ Skyrim's land area) and ×1 vertical** (decision 0015,
   supersedes 0006; single source of truth
   `tooling/world-generation/worldgen/scale.py`); heights stored in true
   metres always; deterministic compilers with fixed seeds; stable semantic
   IDs for everything quests or code may reference.
9. **Agents read measurements; the owner is the visual authority.** Validate
   with probes/stats/screenshots-by-tooling; pause at studio gates for owner
   review (Module 85). **Terrain scale/relief/exaggeration is judged and
   gated on foot ("Walk the province"), never from the flyover** (0015).
   Update PROGRESS.md per its protocol.

## Acceptance rules (Part XIV — binding)

**World identity:** deep interior physically/culturally/mechanically distinct;
Imperial/foreign influence concentrated where geography and history support
it; visible ecological and cultural variation; major settlements follow
era-appropriate source maps; Hist influence spatial and systemic; waterways
are the primary structure; all eight major cities connected by the road
network (legs may be flood-damaged/bridged/ferried, never absent); canon exit
roads (Blackwood Road, Tear road) but closed playable edges; the world
satisfies the quest plan's Milestone-1 provisions before narrative production.

**World causality:** every POI has a causal model; layout and content derive
from it; occupants have motives and logistics; loot has provenance; roads and
waterways connect real needs; historical layers stay distinguishable.

**Gameplay:** no player-level scaling anywhere; deep areas stay fixed high
danger; darkness, weather and tides are calendared world state and no visual
work is approved under placeholder light (Module 55); swimming/breath/climbing/boats create access progression; Argonian
physiology materially changes underwater play; underwater POIs throughout
appropriate regions; large logical surfaces climbable by default; combat
spaces and critical-animation clearance validated.

**Technology:** ecctrl stays behind the controller adapter; Rapier is
authoritative physics; rendering and gameplay sample the same water data;
world bundles deterministic and versioned; apps consume packages, never each
other; the studio uses the same runtime packages as the game.

**Assets:** no bespoke art assumed; vanilla Skyrim + permitted mod pool via
semantic kits and deterministic compilers; simple source-and-credits records
(docs/CREDITS.md); reproducible pipeline builds.

## Phases at a glance (status: docs/PROGRESS.md; detail: Module 95)

0 sources/era/credits · 1 monorepo+contracts · 2 province ingest ·
3 hydrology+regions · 4 danger/cultures/transport · 5 World Studio ·
6 province terrain · 6b rescale+mountain relief+naturalness (0015, after 7a) ·
7a physical character · 8a world time/natural light/sky (0016) ·
8b water renderer · 8c weather/atmosphere · 9 swim/climb/boats ·
10 asset catalogue+kits · 10b full sandbox parity in studio (was 7b, 0017) ·
10c stats+progression (0019; design workstream S runs in parallel from now) ·
11 causal locations+settlements ·
12 dungeons+interiors · 13 ecology/encounters/loot · 14 streaming+deploy ·
15 expansion by watershed. Statuses live only in PROGRESS.md.

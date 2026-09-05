# World-generation master plan (modular)

**Every world-gen agent reads [00-core.md](00-core.md) in full, every session**
(~4k tokens: goals, binding rules, acceptance criteria, phase glance). Then use
this router for the modules your task touches. Section numbers (§NN) cited
across the repo resolve via the map below.

| Your task touches… | Module (sections) |
|---|---|
| Design judgement — "would Morrowind do it this way?" | [10-vvardenfell-lessons.md](10-vvardenfell-lessons.md) (§1–10) — the Morrowind models: §4 transport graphs, §5 settlement causation (Phase 11), §8 dungeon graph grammars (Phase 12); §9: terrain identity comes from placed assets, not heightfield detail |
| Province macro structure, danger/access philosophy, era, settlement anchors, region taxonomy | [20-province-design.md](20-province-design.md) (§11–16) — §16 region grammar is the semantic backbone |
| Turning lore into systems: infrastructure decay, drifting settlements, rootworms, Hist, tribes, pirates, disease, fauna, ecology | [30-lore-systems.md](30-lore-systems.md) (§17–27) — §26 disease/toxins/insects and §27 deep-marsh biology are the Phase 13 ecology source |
| Causal location records, agent blueprints, review loop, orphan validation | [40-causal-authoring.md](40-causal-authoring.md) (§28–32) |
| Filling 4E 201 canon gaps: sweep → gap register → tiered extrapolation ("headcanon") | [45-lore-extrapolation.md](45-lore-extrapolation.md) — standing workstream, state in `world/sources/lore/extrapolation/` |
| Terrain, rivers, flood, wetness, salinity, climate fields | [50-hydrology-climate.md](50-hydrology-climate.md) (§33–37, §33.1) — orogeny/relief research: [mountain-terrain-synthesis](../research/mountain-terrain-synthesis.md) |
| Time of day, calendar, sun/moons/stars, natural light, sky, haze/mist, weather | [55-light-sky-time.md](55-light-sky-time.md) (§93–98) — the world clock and everything lit by it; §98b beyond-border horizon (deferred — research: [beyond-border-distant-lands](../research/beyond-border-distant-lands.md)) |
| Ambient sound, region soundscapes, positional emitters, footsteps/impacts, reverb, underwater audio | [57-audio-soundscape.md](57-audio-soundscape.md) (§105–108) — the world heard; music/score is out of world-build scope; research: [ambient-audio-soundscape-threejs](../research/ambient-audio-soundscape-threejs.md) |
| Water rendering, swimming, underwater play, boats, climbing | [60-water-traversal.md](60-water-traversal.md) (§38–46) — incl. the reference water repos to adapt. Any swim/climb/boat *animation* need: the sourced-clip gap table is [90 §74.3](90-asset-strategy.md); the light stack it renders under is Module 55 |
| Vegetation/scatter density, instancing, groundcover, impostors, wind | [65-vegetation-scatter.md](65-vegetation-scatter.md) (§109–112) — the placed-asset detail layer and its performance architecture; research: [vegetation-scatter-instancing-threejs](../research/vegetation-scatter-instancing-threejs.md) |
| Dungeon families, interiors, combat spaces, encounters | [70-dungeons-interiors.md](70-dungeons-interiors.md) (§47–50) |
| Navmesh baking, enemy/NPC movement, ambient marks/patrols/territories | [72-navigation-ai.md](72-navigation-ai.md) (§113–115) — what the world bakes and validates for AI movement; research: [navmesh-ambient-ai-threejs](../research/navmesh-ambient-ai-threejs.md) |
| Anything touching combat/character/inventory/physics contracts | [75-combat-compatibility.md](75-combat-compatibility.md) (§51–57) — incl. §51.1: the sandbox systems are not frozen; §53 scene orchestration (Phase 10b); §54 physical materials → footstep audio; §57 NPC/creature swimming (Phase 9) |
| Character statistics, attributes, skills, progression, levelling, birthsigns, the fixed-danger power scale | [76-stats-progression.md](76-stats-progression.md) — **§116–129 is the decided design** (attributes, 27 skills, *vastei* levelling, combat/defence math, magic, crafting, rest/death, the D0–D5 ladder and the NPC schema); §100–104 is the workstream and what Phase 10c ships |
| Repo layout, packages, bundles, CI/deploy, asset vault | [80-repo-architecture.md](80-repo-architecture.md) (§58–65) |
| Studio modes, spawn, diagnostic layers, probes, visual evidence | [85-world-studio.md](85-world-studio.md) (§66–70) |
| Finding/reusing assets: vanilla families + vetted mod candidates (architecture, flora, boats, creatures, ruins) + ingestion order | [90-asset-strategy.md](90-asset-strategy.md) (§71–80) — check before hunting new sources |
| Populations, cultures mix, demographic priors | [92-demographics.md](92-demographics.md) (§81–84) — read when deciding how many people live in a settlement (Phase 11) |
| Phase deliverables in detail, three-scales model, sequencing rationale | [95-build-sequence.md](95-build-sequence.md) (§85–87) |
| **Building a place** (Phase 11 Parts 6–8 and the Phase 15 long tail): the per-place loop, the write-back rule, lessons per round, the automation-readiness checklist | [96-placement-playbook.md](96-placement-playbook.md) |
| Resolving [^..] citations from any module | [99-sources.md](99-sources.md) |

Acceptance rules (old Part XIV, §88–92) live in **00-core** — they bind
everything. The quest plan ([../quests/](../quests/README.md)) binds via its
20-world-provisions module. Status is only in [../PROGRESS.md](../PROGRESS.md).

## Section map for old “§NN” references

§1–10 → 10 · §11–16 → 20 · §17–27 → 30 · §28–32 → 40 · §33–37, §33.1 → 50 ·
§38–46 → 60 · §47–50 → 70 · §51–57 → 75 · §58–65 → 80 · §66–70 → 85 ·
§71–80 → 90 · §81–84 → 92 · §85–87 → 95 · §88–92 → 00-core (acceptance) ·
§93–98, §98b → 55 (added 2026-08-25, decision 0016) · §100–104 → 76 (decision 0019) ·
§105–108 → 57 · §109–112 → 65 · §113–115 → 72 (added 2026-08-26, decision 0022) ·
§116–129 → 76, the decided stat design (added 2026-08-29, workstream S step 5).

Editing rule: these modules ARE the master plan — improve them in place (same
authority as before; record non-obvious changes in docs/decisions/).

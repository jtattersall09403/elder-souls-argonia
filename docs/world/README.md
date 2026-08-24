# World-generation master plan (modular)

**Every world-gen agent reads [00-core.md](00-core.md) in full, every session**
(~4k tokens: goals, binding rules, acceptance criteria, phase glance). Then use
this router for the modules your task touches. Section numbers (§NN) cited
across the repo resolve via the map below.

| Your task touches… | Module (sections) |
|---|---|
| Design judgement — "would Morrowind do it this way?" | [10-vvardenfell-lessons.md](10-vvardenfell-lessons.md) (§1–10) — incl. §9: terrain identity comes from placed assets, not heightfield detail |
| Province macro structure, danger/access philosophy, era, settlement anchors, region taxonomy | [20-province-design.md](20-province-design.md) (§11–16) — §16 region grammar is the semantic backbone |
| Turning lore into systems: infrastructure decay, drifting settlements, rootworms, Hist, tribes, pirates, disease, fauna | [30-lore-systems.md](30-lore-systems.md) (§17–27) |
| Causal location records, agent blueprints, review loop, orphan validation | [40-causal-authoring.md](40-causal-authoring.md) (§28–32) |
| Filling 4E 201 canon gaps: sweep → gap register → tiered extrapolation ("headcanon") | [45-lore-extrapolation.md](45-lore-extrapolation.md) — standing workstream, state in `world/sources/lore/extrapolation/` |
| Terrain, rivers, flood, wetness, salinity, climate/atmosphere/weather/light | [50-hydrology-climate.md](50-hydrology-climate.md) (§33–37, §33.1) |
| Water rendering, swimming, underwater play, boats, climbing | [60-water-traversal.md](60-water-traversal.md) (§38–46) — incl. the reference water repos to adapt |
| Dungeon families, interiors, combat spaces, encounters | [70-dungeons-interiors.md](70-dungeons-interiors.md) (§47–50) |
| Anything touching combat/character/inventory/physics contracts | [75-combat-compatibility.md](75-combat-compatibility.md) (§51–57) |
| Repo layout, packages, bundles, CI/deploy, asset vault | [80-repo-architecture.md](80-repo-architecture.md) (§58–65) |
| Studio modes, spawn, diagnostic layers, probes, visual evidence | [85-world-studio.md](85-world-studio.md) (§66–70) |
| Finding/reusing assets: vanilla families + vetted mod candidates (architecture, flora, boats, creatures, ruins) + ingestion order | [90-asset-strategy.md](90-asset-strategy.md) (§71–80) — check before hunting new sources |
| Populations, cultures mix, demographic priors | [92-demographics.md](92-demographics.md) (§81–84) |
| Phase deliverables in detail, three-scales model, sequencing rationale | [95-build-sequence.md](95-build-sequence.md) (§85–87) |
| Resolving [^..] citations from any module | [99-sources.md](99-sources.md) |

Acceptance rules (old Part XIV, §88–92) live in **00-core** — they bind
everything. The quest plan ([../quests/](../quests/README.md)) binds via its
20-world-provisions module. Status is only in [../PROGRESS.md](../PROGRESS.md).

## Section map for old “§NN” references

§1–10 → 10 · §11–16 → 20 · §17–27 → 30 · §28–32 → 40 · §33–37 → 50 ·
§38–46 → 60 · §47–50 → 70 · §51–57 → 75 · §58–65 → 80 · §66–70 → 85 ·
§71–80 → 90 · §81–84 → 92 · §85–87 → 95 · §88–92 → 00-core (acceptance).

Editing rule: these modules ARE the master plan — improve them in place (same
authority as before; record non-obvious changes in docs/decisions/).

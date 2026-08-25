# World source data

Registered, provenance-tracked inputs to world generation. Bulky raw archives
stay in the asset vault (`ELDER_SOULS_ASSET_ROOT`); this directory holds small
derived registrations (anchors, tolerances, hashes, confidence metadata).

## Registered sources

| Source | Where | SHA-256 |
|---|---|---|
| Tamriel Worldspaces — Argonia (Nexus SSE mod 118678, file 498168) | vault `mod-sources/tamriel-worldspaces-118678/Argonia-118678-1-0-0-1714930521.zip` | `d14637601c6ca353467b67415830a893b2294f9caac46394d52cd14173690a70` |
| All Tamriel Heightmap Beta06 (Nexus SSE mod 573, file 2028, CC BY-NC 4.0) | vault `mod-sources/all-tamriel-heightmap-573/Tamriel10_2016-573-Beta06.7z` | `e32b1faf3c1f3545a2858cc5edcb4b69beca5d67a75548f6a4aa25fbe85b8ca9` |
| Community Inkarnate map "Black Marsh / Argonian State 4E 231" (Reddit; secondary prior only, master plan §14.1) | vault `mod-sources/community-maps/black-marsh-inkarnate-4e231.jpg` (2048×1536) | `e7a0be7821adf26bfc89f0f9a22d6ec5c02128c6b1d7e1bc80c1a38f1508dcb3` |
| UESP wiki extract, Morrowind + Black Marsh (6,299 pages, wikitext JSONL; from owner's corpus) | vault `mod-sources/lore/uesp_morrowind_blackmarsh_extract.jsonl.xz` | `b1a1641c3e755dfdd6e1ba7a8a2a6827edd22f1586411c242b02603f5495cb78` |

Extraction cache (float32 heightfield + meta) sits next to the extracted esp in
the vault; the browser preview raster is committed at
`apps/world-studio/public/province/`. Extractor: `tooling/world-generation/`.

- [anchors/settlement-anchors.json](anchors/settlement-anchors.json) — canonical
  settlement anchors as fractional positions over the heightfield, with
  tolerances and confidence. Owner-approved; refined at visual gates.
- [lore/](lore/README.md) — per-location canon dossiers (UESP-sourced) feeding
  generation and later quest/dialogue authoring.
- [climate/weather-states.json](climate/weather-states.json) — province weather
  states, seasonal calendar and lighting notes (plan §33.1).
- [sky/star-catalogue.json](sky/star-catalogue.json) — the authored night sky:
  the Thirteen Patrons with canon star counts, guardian planets, the Southron
  pole star and the Serpent's wander parameters (module 55 §95). Consumers: the
  Phase 8a sky renderer; validated by `packages/world-time` tests.
- [regions/authored-overrides.json](regions/authored-overrides.json) —
  owner-authored region polygons applied over rule-based classing (e.g. the
  central tropical jungle).
- [demographics/population-priors.json](demographics/population-priors.json) —
  community demographic priors by zone (plan §82).

General lore citations live in the master plan's source register; per-location
canon lives in `lore/`.

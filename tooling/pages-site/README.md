# pages-site — composing the GitHub Pages artefact

`compose.mjs` builds `site/` (gitignored) from the two app builds: combat
sandbox at the root path, world studio under `/studio/`. The deploy workflow
(`.github/workflows/deploy-pages.yml`) runs it as `npm run site:compose`
after `npm run build`.

**Rule (decision 0073):** the artefact carries only what the shipped ladder
can display. GitHub Pages publishes at most 1 GB; the raw compose measured
999 MB on 2026-09-18 with ~430 MB of architecture kits that
`province/ladder.json` hides until 16h. The script derives the excluded set
at build time — a kit ships iff shipped code or a record of a shown layer
names `kits/<id>` — so un-hiding a layer ships its kits again with no list
to edit. Gates fail the build on an unknown ladder layer, a named kit that
is missing, a surviving reference to an excluded file, a "chain-only" raster
something now reads, or a site over 900 MB (warning over 750 MB).

Run it locally after `npm run build` to see the size and the kept/excluded
sets; prove a pruned site with
`apps/world-studio/scripts/probe-deployed-requests.mjs --url …` against a
static server rooted so that `site/studio` is at
`/elder-souls-argonia/studio/`.

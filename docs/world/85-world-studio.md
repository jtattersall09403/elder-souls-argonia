# Part X — World Studio and measurement-led inspection (§66–70)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.

## 66. The World Studio application

`apps/world-studio` should be a permanent developer application. It uses the same world-runtime, water, physics, character and asset packages as the game.

Required modes:

| Mode | Purpose | Status |
|---|---|---|
| Overworld map | Inspect province layers and choose a spawn point | Phase 5 ✓ |
| First-person fly | Fast visual inspection without collision | Phase 5 ✓ |
| Orbit/survey | Inspect settlements, terrain and hydrology from above | Phase 5 ✓ |
| Physical character | Test actual movement, combat, swimming and climbing | Phase 7a ✓ grounded movement (`?view=character&x&z&race&profile`; HUD = live environment-query probe; swimming/climbing land with Phase 9; combat, inventory, enemies and bow with Phase 10b) |
| Boat | Test channels, currents, docks and clearance | Phase 9 |
| Underwater free camera | Inspect submerged routes and entrances | done (8b): fly camera dives (Q/C, floor −80 m; `?alt=` start altitude) |
| Diagnostic render | Show collision, IDs, normals, depth, flow and LOD | partial: character HUD reports chunk/LOD/material; `window.__STUDIO_CHARACTER_DEBUG__` exposes collider/raycast probes |
| Sky and light | Scrub time of day/date/season, pick weather, compare regional light presets | Phase 8a ✓ time panel + `t/d/rate/lat` URL params + 4 region presets + `probe-sky.mjs` fixed-instant screenshots (`__STUDIO_SKY_DEBUG__`); weather selector lands with 8c |
| Soundscape | Hear region/time/weather ambience at any spawn; hot-reload sound tables for tuning by ear; voice/memory probe | Phase 12b (module 57; was 8d, 0023) |

**Lighting control is a studio requirement, not a nicety** (module 55 §93): a
time-of-day scrubber, date/season field, weather selector and named region
light presets ("Blackrose basin, dawn mist"; "Padomaic coast, storm noon";
"cloud-forest belt, clear afternoon"), all captured in the reproducible URL.
From Phase 8a onward, ground materials, kits, settlements and dungeons are
reviewed under the light of their own region and hour, and screenshot probes
pin a fixed `WorldInstant` so A/B comparisons are lit identically every run.

## 67. Spawn workflow

The full map should allow:

- click-to-spawn;
- search by settlement, POI, bundle, coordinate or blueprint ID;
- choosing mode and capability profile;
- choosing water/flood state;
- choosing time and weather;
- choosing generation seed or approved world version;
- copying a reproducible URL.

Example:

```text
/world-studio?x=42110&z=-18300&mode=character&profile=baselineArgonian
  &flood=wet-season&bundle=helstrom-approach-v12&layers=water,collision
```

## 68. Diagnostic map layers

- canonical settlement anchors;
- source-map alignment;
- elevation and contours;
- slope and curvature;
- flow direction and accumulation;
- water depth and current;
- flood frequency;
- tides and salinity;
- wetness and soil stability;
- canopy and biome;
- culture and faction influence;
- demographics;
- fixed danger;
- foot routes;
- boat routes;
- swim graph;
- climbing surfaces;
- combat spaces;
- interior portals;
- chunk/LOD boundaries;
- draw-call and triangle density;
- source confidence and provenance.

### 68a. The plotted place catalogue (delivered — Phase 11 Part 0 item 5; Part 4 medium)

The 2D map view carries a **"Places (Phase 11 plot)"** layer: `?cat=1` (or the
tick beside the layer list). It reads `apps/world-studio/public/province/places.json`,
written by `python3 -m worldgen.export_places` (from `tooling/world-generation`)
as a projection of every *sited* `world/sources/catalogue/places-<region>.json`
record — re-run it after any catalogue change (`test_export_places` fails when
it is stale). One dot per place: **colour = region zone** (the
`society.CULTURES` palette, embedded in the export so studio and Python
pictures agree), **size = importance tier** (0 largest), **dashed pale outline
= ruined / abandoned / drowned**. Filters: region, tier, class, danger tier,
density layer, **hostility stance**, **purpose primary/impact**, **interior
kind and family**, the **dungeon-like** shortcut (interior kind ∈ delve /
dungeon / complex / warren), the **underwater-entrance** shortcut (entrance
`underwater-entry` or `underwaterAccess ≠ none` — those dots also carry a
dashed **cyan ring**), and text search on name/id. Hover shows name · type ·
tier; click opens the record with its five `why` fields and `whySiteWon`
prominent, the schema-v2 blocks (**player purpose** + hook, **stance** with
owner and one-line "→ hostile when …" flips, **interior**, **contents** as one
short line per creature / NPC / loot slot, **travel station** with destinations
by name, and **quest linkage**: `questHooks.provisions` — free prose, not ids —
and `tierOwnership`) and a **Fly here** button (the map's click-to-spawn).
Everything round-trips through the URL: `pr`, `pt`, `pc`, `pd`, `pl`, `ps`
(stance), `pp` (purpose), `pi` (impact), `pk` (interior kind), `pf` (interior
family) as comma lists, `pdg=1` / `puw=1` (the two shortcuts), `pq` (search),
`place` (selected id — implies the layer on), `tracks=1` (minor land tracks),
`sites=1` (terrain-scour candidate-sites underlay). Both panels collapse to a
one-line header and sit at the bottom corners so the map stays visible. Types:
`PlottedPlacesBundle` (schemaVersion **2**) / `MinorTracksBundle` in
`packages/contracts`. Code: `apps/world-studio/src/places/`.

### 68b. Clickable routes and waterways (Phase 11 Part 4 step 2)

Under the place dots, `apps/world-studio/src/routes/` draws every route line
and makes it clickable. Roads (`routes.json`) always; minor land tracks
(`routes-minor.json`) with `tracks=1`; boat lanes (`waterways.json`) and minor
channels (`waterways-minor.json`, tolerated absent) with **`water=1`** — water
in cyan, land in tan, minor lines dashed. Clicking a line opens a bottom-centre
details panel: id, name, class, mode, from/to, length km, and for lines whose
`id` is in the route registry also confidence, sources, notes and aliases;
minor routes with no registry id show their derived fields only. The registry
is not read by the browser: `python3 -m worldgen.export_routes` projects
`world/sources/routes/registry.json` to
`apps/world-studio/public/province/routes-index.json` (`RoutesIndexBundle` in
`packages/contracts`, registered in `tooling/repo-standards/data-registry.json`;
`test_export_routes` fails when it is stale) and the layer joins on `id`. URL:
`water=1`, `route=<id>`.

### 68c. Blueprint view (Phase 11 Part 7)

`?bp=1` (or the tick beside the layer list) opens a full-screen viewer over one
settlement blueprint — the interactive answer to the static `render_blueprint`
sheets, which the owner read as "a lot of stuff jumbled on top of each other"
(2026-09-05). Wheel zooms, drag pans, `+` / `-` zoom and `0` refits.

**Backdrop (round 2, owner ask 2026-09-05):** the `map` layer is the SAME
coloured province map the 2D map screen paints — the shared loader and painter
live in `apps/world-studio/src/map/provinceMap.ts` (used by `App.tsx` too), so
there is one map, not a copy — cropped to the blueprint's exported `contextM`
box, with the neighbouring plotted places and the road / boat-lane / track /
channel network drawn over it from the same bundles PlacesLayer and RoutesLayer
read. It is a 1345-px raster at ~5.5 m per pixel, so at settlement zoom it is
coarse *by construction*: it answers "where is this and what is around it", and
the exported hillshade crop (`terrain`) stays underneath as the finer read of
the ground. Then clearance, districts (tinted by kit set), roads /
canals / boardwalks at their real width, parcels as their real footprints with a
door tick and a yaw stub, landmarks, docks, combat spaces, quest sockets and the
siting candidates (chosen filled, rejected hollow). Fences, walls, palisades and
hedges each have their own line style, a dredged `channel` differs from a cut
`canal`, a selected way shows its authored `via` waypoints and a tick where it
attaches to each `endsAt` parcel, a selected gate highlights the way it `spans`,
and approaches enter as arrows that flash their `firstSeen` object on hover.

**Click → the whys.** The details panel leads with the record's plain-English
`why` block under fixed headings (What it is · Why it is in this place · Why this
spot · Why it sits with its neighbours · What it gives the player · How it uses
the ground), then which way it faces and the reason, then ids / piece / ground
fit collapsed below. A way or combat space shows its one-sentence `why`. **An
unwritten why shows in red as "not yet written"** — the gap is visible, never
hidden. With nothing selected the panel shows the causal model, the approaches
(sequence and wayfinding), `scaleGrounding`, the budget and the quest provisions. Each class has a
checkbox, and **labels only draw at or above 3 px per metre**, so nothing piles
up when zoomed out. Feed: `python3 -m worldgen.export_blueprints` writes
`apps/world-studio/public/province/blueprints.json` (everything in world metres)
plus a hillshade crop per blueprint under `province/blueprints/<id>.png`;
`schemaVersion` 2 carries the whys, approaches, scaleGrounding, fences,
`via`/`routing`/`endsAt`, `spans`, `interior` and `contextM`, all optional on the
way in so a half-authored blueprint still exports;
`test_export_blueprints` fails when the JSON is stale. URL: `bp=1`,
`blueprint=<id or slug>`, `bpsel=<object id>`, `bphide=<layers>`. Code:
`apps/world-studio/src/blueprints/`.

## 69. Agent-readable probes

Coding agents should receive JSON, CSV and compact HTML reports. Useful probes include:

### Hydrology

- disconnected river segments;
- uphill flow;
- unhandled sinks;
- channel/terrain intersections;
- discontinuous water surfaces;
- implausible flood islands;
- salt/freshwater inconsistencies;
- settlement clean-water access.

### Traversal

- ground connectivity by capability profile;
- swim-volume continuity;
- water/shore transition failures;
- climb-route gaps;
- ledge top-out clearance;
- route duration distributions;
- escape-route availability;
- boat depth and bridge-clearance failures.

### Combat

- capsule and hurtbox clearance;
- roll corridor width;
- weapon sweep collision;
- paired-critical animation space;
- lock-on sight line;
- camera collision;
- enemy navigation access;
- water depth during encounter.

### Settlement

- flood exposure by district;
- access to docks, water and routes;
- orphan parcels;
- inaccessible doors;
- overlapping foundations;
- social-space capacity;
- viewshed and landmark reveal;
- causal-model completeness.

### Rendering and performance

- triangle and draw-call counts;
- visible instance counts;
- texture memory;
- water pass cost;
- shader variant count;
- chunk load latency;
- LOD popping distances;
- overdraw;
- mobile GPU budget estimates.

### Underwater

- entrance connectivity;
- breath-distance profiles;
- air-pocket spacing;
- current difficulty;
- visibility and lighting;
- return-route availability;
- loot and encounter accessibility by race/spell profile.

## 70. Visual evidence workflow

Automated tooling should create:

- orthographic maps;
- fixed camera sets;
- route fly-throughs;
- before/after captures;
- short videos for water and movement;
- contact sheets;
- depth, normal, object-ID and collision renders.

The user remains the visual authority. Agent reports should link each finding to an exact teleport URL and capture.

---


# Part X — World Studio and measurement-led inspection (§66–70)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.

## 66. The World Studio application

`apps/world-studio` should be a permanent developer application. It uses the same world-runtime, water, physics, character and asset packages as the game.

Required modes:

| Mode | Purpose |
|---|---|
| Overworld map | Inspect province layers and choose a spawn point |
| First-person fly | Fast visual inspection without collision |
| Orbit/survey | Inspect settlements, terrain and hydrology from above |
| Physical character | Test actual movement, combat, swimming and climbing |
| Boat | Test channels, currents, docks and clearance |
| Underwater free camera | Inspect submerged routes and entrances |
| Diagnostic render | Show collision, IDs, normals, depth, flow and LOD |

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


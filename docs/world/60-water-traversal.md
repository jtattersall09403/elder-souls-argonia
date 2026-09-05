# Part VI — Water rendering, swimming, boats and climbing (§38–46)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.
>
> **Water rendering depends on the light stack** (module
> [55](55-light-sky-time.md), Phase 8a — decision 0016): sun direction and
> colour, sky IBL, exposure and the aerial-perspective term drive reflection,
> specular, refraction and underwater scattering, and moon phase drives tidal
> amplitude. Build water (8b) against that system, not against placeholder
> lights.

## 38. One authoritative water model

The project should expose one gameplay-facing water query:

```ts
interface WaterSample {
  waterBodyId: WaterBodyId | null;
  surfaceHeight: number;
  surfaceNormal: Vec3;
  flowVelocity: Vec3;
  depth: number;
  immersion: number;
  turbidity: number;
  salinity: number;
  temperature: number;
  hazardIds: HazardId[];
}

interface WorldWaterQuery {
  sample(position: Vec3, time: number): WaterSample;
  emitInteraction(event: WaterInteractionEvent): void;
}
```

Rapier and gameplay systems use this CPU-accessible query. The renderer consumes the same hydrology, wave and interaction data.

The advanced water repositories already contain valuable buoyancy, wake, interaction and underwater techniques. Those algorithms can be adapted while Rapier remains the authoritative rigid-body system. This prevents duplicate object simulation and GPU-readback coupling.

> **As shipped (Phase 8b, decision 0025 — see
> [research](../research/rendering/water-rendering-threejs.md)):** `WorldWaterQuery` +
> `WaterSample` live in `packages/contracts`; the CPU model (wave table with
> GLSL twin, moon tide, season level, raster samplers, buoyancy) in
> `packages/game-core/src/water/`; the compile in
> `worldgen/compile_water.py` (province W surface + flow + class rasters,
> standing probes in `test_water.py`); the renderer in
> `apps/world-studio/src/water/` (one continuous camera-following surface,
> `MeshPhysicalMaterial` + `onBeforeCompile` on the 8a CSM/PMREM/aerial
> stack, scene-RT refraction/SSR, underwater blit pass, two quality tiers,
> browser probes in `scripts/probe-water.mjs`). Deferred to later phases:
> per-body `WaterBody` records (§40 — Phase 11 needs them for POIs), hero
> pools (§39.3), FFT open-sea tier (§39.4), projected caustics on the bed,
> per-body `rendererProfile` beyond the class rasters.

## 39. Rendering stack

### 39.1 WaterThreeJS base techniques

WaterThreeJS is MIT-licensed, WebGL2-based Three.js code with analytic Gerstner waves, screen-space reflections, depth-based refraction and absorption, shoreline/contact foam, underwater fog, god rays, caustics and CPU-mirrored wave sampling for buoyancy.[^W1]

Useful components:

- analytic surface function and normal;
- SSR with sky fallback;
- Beer–Lambert colour and underwater absorption;
- Fresnel/GGX surface shading;
- detail-normal cascades;
- contact foam and wakes;
- immersion detection;
- CPU wave sampling and buoyancy concepts;
- underwater post-processing.

### 39.2 SeedOcean reference architecture

SeedOcean is MIT-licensed and provides river, lake, pool, coast and open-ocean modes, a `FlowMap` contract, persistent foam, wake textures, buoyancy currents, underwater effects, quality modes and a WebGL2 fallback.[^W2]

Useful components:

- directional river flow and spline/ribbon approach;
- shared flow-map data for surface movement and shore foam;
- bounded-water abstractions;
- wake and buoyancy interfaces;
- headless design API ideas;
- quality-tier structure.

Its WebGPU-first path does not define the game baseline. The WebGL2 path and data contracts remain directly relevant.

### 39.3 Local interactive simulation

`jeantimex/threejs-water` ports Evan Wallace's bounded water simulation to Three.js. It uses a GPU wave equation, caustics, reflections/refractions, buoyancy and object displacement.[^W3]

Use pooled local patches for:

- hero temple pools;
- flooded dungeon chambers;
- close-range splash interaction;
- falling bodies or objects;
- ritual pools;
- highly visible small water surfaces.

### 39.4 Open-water high tier

ABYSSAL provides a WebGL2 spectral FFT ocean with JONSWAP/TMA spectra, multiple cascades, persistent foam, caustics, underwater rendering and buoyancy.[^W4]

Use it as a high-quality reference for Topal Bay and exposed coasts. Mobile and mid-tier settings should use fewer cascades or analytic waves.

## 40. Water-body semantics

```ts
interface WaterBody {
  id: WaterBodyId;
  kind: "river" | "creek" | "marsh" | "lake" | "estuary" | "coast";
  surfaceBase: number;
  depthField: FieldRef;
  flowField: FieldRef;
  discharge: number;
  turbidity: number;
  sedimentColour: ColourId;
  salinity: number;
  waveExposure: number;
  floodBasinId?: FloodBasinId;
  navigability: NavigabilityProfile;
  ecologyId: EcologyProfileId;
  rendererProfile: WaterRendererProfileId;
}
```

Visual profiles:

| Water class | Surface and underwater character |
|---|---|
| Fast river | Directional advection, coherent downstream ripples, bank/rock foam, suspended sediment |
| Deep swamp pool | Low bulk velocity, small ripples, dark absorption, debris, algae and insects |
| Shallow marsh | Visible mud or vegetation bed, tiny wind waves, wakes from wading and creatures |
| Estuary | Current plus tide, broader wind waves, brackish colour, boat wakes and mudflats |
| Coast/Topal Bay | Long swell, local chop, foam, horizon handling, full underwater optics |
| Hist pool | Site-specific clarity, particles, sap or ritual visual effects driven by lore state |

## 41. Shared render-pass architecture

Large numbers of separate reflector/refractor objects would be expensive. The runtime should capture scene colour and depth through shared passes, then render all visible water using shared buffers and per-water-body data.

Recommended frame structure:

1. opaque scene colour/depth;
2. optional reduced-resolution reflection data or SSR source;
3. all visible water surfaces with shared shader variants;
4. underwater composite when immersed;
5. particles, foam decals, splashes and post-processing.

Rivers use ribbon meshes. Marshes and lakes use connected polygon surfaces. Coasts use camera-centred meshes or clipmaps. Local ripple patches allocate from a small pool near the player.

## 42. Water quality tiers

| Feature | High | Medium | Mobile/performance |
|---|---|---|---|
| Reflections | half-resolution SSR with more steps | reduced-step SSR | short SSR plus environment fallback |
| Refraction | depth-aware scene refraction | simplified depth refraction | absorption and shallow-bed approximation |
| Waves | spectral or dense analytic field | analytic multi-band waves | compact Gerstner field |
| River detail | multi-scale flow normals and foam | flow normals and bank foam | one flow layer and sparse foam |
| Local ripples | several pooled patches | one or two patches | nearest hero surface |
| Caustics | dynamic projected pattern | reduced resolution | selected hero sites |
| Underwater | volumetrics, particles, Snell window | reduced steps | fog, absorption and light shafts |
| Foam | persistent/contact/shore | simplified contact/shore | bank and wake masks |

The semantic water model remains identical across tiers.

## 43. Swimming modes and player capability

The current `PlayerMovementController` handles grounded movement, position, velocity, facing and jumping. Argonia needs a broader locomotion contract while preserving ecctrl as the current grounded adapter.[^R4]

```ts
type LocomotionMode =
  | "grounded"
  | "airborne"
  | "surfaceSwim"
  | "submergedSwim"
  | "climb"
  | "boat"
  | "rootwormTransit";

interface AvatarLocomotion {
  mode(): LocomotionMode;
  position(out: Vec3): Vec3;
  velocity(out: Vec3): Vec3;
  setIntent(intent: LocomotionIntent): void;
  setFacing(direction: Vec3, locked: boolean): void;
  teleport(target: SpawnTarget): void;
  capabilities(): TraversalCapabilityProfile;
}
```

Capability fields include:

- surface and submerged swim speed;
- acceleration and turning;
- breath capacity;
- water-current resistance;
- dive depth tolerance;
- stamina cost;
- equipment drag and buoyancy;
- climb stamina;
- climb speed;
- grip and material modifiers;
- jump and gap capability;
- racial and spell effects.

Argonian racial physiology can set underwater breathing independently of other swimming statistics. Spells can modify breathing, speed, current resistance and visibility.

**Owner steer (2026-08-26, module 76 §103):** athletics (or its equivalent in
the decided stat design) governs **swim speed** (Morrowind canon) **and breath
capacity for non-Argonians**; Argonians breathe underwater outright. Phase 9
should wire swim speed and breath through the capability profile so the stat
system can drive them at 10c without rework.

## 44. Underwater is a complete exploration layer

Underwater content should have its own graph:

- surface access nodes;
- air pockets;
- submerged entrances;
- currents;
- vertical shafts;
- hazards;
- creatures;
- loot and containers;
- interior portals;
- return routes;
- visibility and light fields.

POI families include:

- submerged Xanmeer waterworks;
- flooded cave systems;
- riverbed smuggler hatches;
- sunken Imperial villas and customs posts;
- shipwrecks and wreck fields;
- wells and cisterns connected to larger interiors;
- root tunnels;
- drowned Lilmothiit or Kothringi remains;
- ritual pools;
- predator nests;
- air-filled caves behind siphons;
- collapsed prison drains;
- undercut banks and hidden caches.

Access metadata can distinguish:

- immediately Argonian-accessible;
- accessible to other races with breath skill or preparation;
- spell- or equipment-gated;
- high-current or deep-water expert routes;
- quest-state or Hist-state routes.

## 45. Boats as primary world vehicles

Black Marsh supports boats as the main player vehicle family. Horses can appear in selected firm-ground fringe zones where culture, routes and assets support them.

Boat classes:

| Class | Use |
|---|---|
| Dugout/canoe | narrow channels, low draft, easy portage, local travel |
| Skiff/rowboat | fishing, ferrying, cargo and exploration |
| Raft/platform | village links, cargo, improvised transport |
| River trader | storage, passengers, longer routes |
| Sailboat | estuary and coast travel |
| Ritual/Hist craft | culturally specific transport and quests |

**Boats are sourced assets like everything else — we never design our own**
(owner 2026-08-25): a boat type enters the roster only when **both its model
(candidate pool: module 90 §77) and its required player/NPC clips (module 90
§74.3 — no vanilla rowing clips exist) are sourced**. Selection favours craft
needing only seated poses plus procedural oar/tiller drive.

Gameplay components, **tiered** (owner, 2026-08-29, decision 0034 — the flat
wishlist here was being read as scope):

*Core (Phase 9 — the player's own craft):*

- multi-point Rapier buoyancy;
- water-current sampling;
- rotational and linear drag;
- shallow grounding;
- hull collision;
- boarding and disembarking;
- docking and mooring;
- wake and foam events;
- rain and flooding interaction.

*Travel services (world content, Phase 11+ — never vessel simulation):*

- **ferries and boat fast travel are Morrowind-style**: speak to the
  ferryman/boat owner, pay, arrive — instant travel over a defined,
  geographically sensible service graph (Phase 4 lanes + placed docks);
  NPC passengers are set dressing (parented props at most).

*Deferred until a quest brief or playtest demands them (none currently does):*

- cargo/inventory integration on the player's boat;
- passenger carrying on the player's boat;
- hull damage, repair and ownership;
- free-roaming AI boats;
- boat combat hooks.

Boat navigation uses depth, channel width, bend radius, current, tide, bridge clearance, submerged obstacles, docking space and vessel capability.

The Phase 4 macro graphs (roads, boat lanes, rootways) connect only the anchor
cities and are deliberately sparse. As settlements populate (Phases 11/15) the
transport network **densifies**: minor roads, jungle paths, boardwalks, levee
tracks, ferry hops, canoe channels and additional fast-travel services grow
around every placed settlement, always as least-cost responses to the same
terrain fields (owner direction, 2026-08-23). Where a macro boat lane crosses
land (portage hops, drawn amber in the studio), watershed refinement must
resolve the hop explicitly: carve a navigable channel, or make it a real
portage/boardwalk feature. (Mechanism exists since Phase 6 pass 2:
compile_society persists lane paths in `waterways.json`;
`refine_watershed.resolve_portages` applies decision 0012 and records
outcomes in the basin's `portages.json` for Phase 11 feature placement.)

## 46. Climbing and world generation

Large logical surfaces should be climbable by default. The asset registry and generated terrain need climb semantics:

```ts
interface ClimbSurfaceProfile {
  material: PhysicalMaterialId;
  climbable: boolean;
  grip: number;
  wetGripMultiplier: number;
  requiredAbility?: AbilityId;
  exclusionReason?: string;
}
```

The world compiler should generate and validate:

- continuous climb corridors;
- ledges and rest points;
- transitions between water, ground and climb;
- tree branch routes;
- building roof access;
- cliff top-out clearance;
- camera clearance;
- stamina-appropriate route lengths;
- intentional blockers with explicit metadata;
- alternate routes for low-capability characters.

Rain, wetness, equipment load, skill and spells can modify grip and stamina.

---


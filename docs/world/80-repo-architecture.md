# Part IX — Repository, package and deployment architecture (§58–65)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.

## 58. Make the new world repository the canonical real game

The lowest-risk structure is a new canonical `elder-souls-argonia` monorepo that is the real game from its first commit. The world is its first major subsystem. The combat sandbox remains available as a dedicated application inside the same repository.

This gives one dependency graph, one contract test suite, one package lock, one source of gameplay types and one deployment pipeline. The world studio, combat sandbox and integrated game can evolve independently at application level while sharing packages directly.

The existing `ecctrl-souls-combat` repository can remain as an archived reference or temporary mirror after migration. New portable development should occur in the canonical packages.

### Concrete repository and VM working layout

The canonical repository already exists as **`jtattersall09403/elder-souls-argonia`** and currently contains only a brief README.[^R0] The expected development arrangement is:

```text
elder-souls-dev/
├─ elder-souls-argonia/          # canonical real-game repo; launch Claude here
├─ <combat-sandbox-checkout>/    # existing ecctrl-souls-combat working checkout
└─ <asset-pipeline-checkout>/    # existing local-Git asset-pipeline checkout
```

The exact sibling directory names must be **discovered from the VM**, not assumed from documentation. The combat checkout may have a local folder name that differs from its GitHub repository name (`jtattersall09403/ecctrl-souls-combat`), so identify it by its Git remote rather than by folder spelling. Before any migration, the first agent should inspect `..`, run `git status`, `git remote -v`, `git branch --show-current` and `git rev-parse HEAD` in each source checkout, and identify any local-only or uncommitted work. The local checkout is authoritative for migration if it is ahead of the remote. No source checkout should be rewritten, cleaned or reset as part of discovery.

The sibling repositories are migration inputs and temporary comparison/test targets. After migration:

- `elder-souls-argonia` is the source of truth for production code and world data;
- `apps/combat-sandbox` remains an independently runnable proving ground **inside** the canonical repo;
- `tooling/asset-pipeline` contains the imported pipeline code/history;
- proprietary Skyrim/mod source data remains external in the local asset vault;
- CI, GitHub Pages and clean clones operate without sibling repositories;
- no package in the canonical repo may import from a `../<sibling-repo>` path.

The existing GitHub README calls the project a "fan-made standalone Skyrim mod".[^R0] That framing is broadly correct for the project's identity: **a standalone total-conversion-style Skyrim fan project/mod set in Argonia**, implemented with Three.js/React Three Fiber/Rapier and using Skyrim- and mod-derived assets. The README may be expanded to explain the browser/runtime architecture, but it should not reframe the project as a conversion into an unrelated new game.

## 59. Proposed repository layout

The monorepo uses plain **npm workspaces** — no additional monorepo tooling
(pnpm, turborepo, nx) until a measured need appears. Directories are created
when their phase needs them, not speculatively.

> **Actual `packages/` layout (Phase 7, decision 0013):** the tree below is
> the *direction*, not the current state. Today's packages are coarser, cut
> along the real seams: `contracts`, `game-core` (the framework-free game
> layer: combat/anim/equipment/inventory/actors/input/physics boundary),
> `character` (R3F/Rapier/ecctrl actor layer) and `character-assets` (tracked
> runtime GLBs + a vite plugin). Split further only when a consumer needs a
> slice without the rest.

```text
elder-souls-argonia/
├─ apps/
│  ├─ game/                    # integrated deployed game
│  ├─ combat-sandbox/          # current combat/character proving ground
│  ├─ world-studio/            # map, spawning, exploration and diagnostics
│  ├─ water-lab/               # isolated water rendering/physics experiments
│  ├─ asset-lab/               # asset previews, sockets, collision and provenance
│  └─ benchmark/               # device and streaming benchmarks
│
├─ packages/
│  ├─ contracts/               # cross-system public interfaces and schema versions
│  ├─ core/                    # clocks, IDs, events, deterministic utilities
│  ├─ physics/                 # Rapier integration and material semantics
│  ├─ locomotion/              # ground/swim/climb/boat mode contracts and adapters
│  ├─ combat/                  # fighters, attacks, hit resolution, AI interfaces
│  ├─ character/               # actor, race, stats, equipment visual assembly
│  ├─ animation/               # semantic animation contracts and manifests
│  ├─ input/                   # desktop, touch and gamepad actions
│  ├─ inventory/               # containers, ownership, capacity and UI state
│  ├─ items/                   # item definitions, projectiles, equipment and loot
│  ├─ world-schema/            # authored source and runtime world schemas
│  ├─ world-source/            # source loaders, provenance and era resolution
│  ├─ world-compiler/          # pass graph and build orchestration
│  ├─ world-runtime/           # streaming, chunks, portals and environment queries
│  ├─ hydrology/               # basin/channel/flood/flow generation
│  ├─ water-runtime/           # rendering, buoyancy query and interaction VFX
│  ├─ navigation/              # foot, swim, climb and boat graphs
│  ├─ settlements/             # district, route, parcel and asset-kit compilers
│  ├─ dungeons/                # graph grammars, room programmes and interior compiler
│  ├─ ecology/                 # habitat, vegetation and creature-territory systems
│  ├─ assets/                  # runtime asset registry, kits, sockets and materials
│  ├─ quests/                  # quest/world-state interfaces
│  └─ validation/              # world probes, metrics and reports
│
├─ world/
│  ├─ sources/
│  │  ├─ canon/                # sourced lore facts and era data
│  │  ├─ maps/                 # georeferenced maps and anchor extractions
│  │  ├─ heightmaps/           # licensed macro terrain inputs
│  │  ├─ community/            # fan maps/demographics with confidence metadata
│  │  └─ source-registry/      # citations, source links, credits and hashes
│  ├─ blueprints/
│  │  ├─ province/
│  │  ├─ regions/
│  │  ├─ settlements/
│  │  ├─ locations/
│  │  ├─ interiors/
│  │  └─ dungeons/
│  ├─ rules/
│  │  ├─ cultures/
│  │  ├─ regions/
│  │  ├─ ecology/
│  │  ├─ routes/
│  │  └─ generation/
│  ├─ manifests/               # approved generated-bundle manifests
│  └─ generated/               # build cache; excluded from normal source commits
│
├─ tooling/
│  ├─ asset-pipeline/          # imported history/code from elder-scrolls-asset-pipeline
│  ├─ world-generation/       # offline compiler entry points and orchestration
│  ├─ world-cli/
│  ├─ capture/
│  ├─ probes/
│  ├─ build/
│  └─ migrations/
│
├─ assets/
│  ├─ registry/                # semantic asset catalogue + placement metadata
│  ├─ manifests/               # recipes, source hashes and credit references
│  └─ runtime/                 # game-ready outputs where versioning is useful
│
├─ docs/
│  ├─ architecture/
│  ├─ world-design/
│  ├─ lore/
│  ├─ assets/
│  ├─ validation/
│  └─ decisions/
│
└─ deploy/
   ├─ bundle-manifests/
   └─ pages/
```

## 60. Package rules

- Applications may import packages.
- Applications may not import other applications.
- Repository code may not import from sibling checkouts under `elder-souls-dev`; sibling repositories are migration/reference inputs only.
- World source packages may not import rendering packages.
- Runtime packages may not read raw source archives.
- Combat, inventory and character packages consume public environment contracts.
- World packages expose semantic environment and interaction APIs.
- Ecctrl-specific types remain inside the ecctrl adapter.
- Asset source filenames never appear in gameplay code.
- Generated bundles include schema and package compatibility versions.

These rules can be enforced through TypeScript project references, package export maps and lint dependency constraints.

## 61. Cross-system contracts

The `contracts` package should own small stable interfaces:

```ts
interface WorldRuntimeContract {
  streamAround(position: Vec3, radius: number): Promise<void>;
  queryEnvironment(position: Vec3): EnvironmentContact;
  queryWater(position: Vec3, time: number): WaterSample;
  querySurface(colliderId: ColliderId): PhysicalMaterialProfile;
  findSpawn(target: SpawnRequest): Promise<SpawnResult>;
  enterPortal(portalId: PortalId): Promise<WorldTransition>;
}

interface EnvironmentContact {
  groundMaterial?: PhysicalMaterialId;
  supportNormal?: Vec3;
  water?: WaterSample;
  mudDepth: number;
  climbSurface?: ClimbSurfaceProfile;
  biomeId: BiomeId;
  regionId: RegionId;
  hazardIds: HazardId[];
}
```

Other key contracts:

- `AvatarLocomotion`;
- `CombatActor`;
- `AnimationSemanticCommand`;
- `InventoryItem` and `Container`;
- `WorldInteraction`;
- `EncounterRegistration`;
- `WorldAudioEvent`;
- `QuestWorldState`.

## 62. Asset pipeline, local asset vault and history

The existing local-Git `elder-scrolls-asset-pipeline` should be **integrated into the canonical `elder-souls-argonia` monorepo as tooling**, because its outputs and metadata are part of the contracts used by characters, animation, physics, world generation and deployment. Source archives should remain outside the repo mainly for size, cleanliness and reproducibility.

Recommended split:

```text
elder-souls-argonia/
  tooling/asset-pipeline/      # Python/Blender/conversion code, tests, docs
  assets/registry/             # semantic IDs, dimensions, sockets, materials
  assets/manifests/            # recipes, source hashes and credit references
  assets/runtime/              # selected game-ready GLB/KTX2/audio outputs

LOCAL ASSET VAULT (outside Git)
  Skyrim archives/extractions
  mod archives/extractions
  Blender/intermediate caches
  transient conversion outputs
```

A local environment variable such as:

```bash
ELDER_SOULS_ASSET_ROOT=/path/to/elder-souls-assets
```

should point the pipeline at the vault. CI and clean checkouts must be able to build and test the game without assuming the large source archives are present; runtime assets needed for deployed builds should therefore be versioned where practical or supplied through a content-addressed build/artifact mechanism.

The import should preserve the existing asset-pipeline Git history where practical. A subtree/history-rewrite import is preferable to copying files into a fresh directory, because future agents may need to understand why conversion, skeleton, NIF/HKX/DDS, animation, socket or grounding decisions were made. After verification that the monorepo pipeline reproduces equivalent outputs, the old local repository can be archived as a historical source.

For this personal standalone total-conversion-style project, **all mod sources discussed in this document are treated as available for use**. Do not build a heavyweight permission/evidence system. Keep a simple credits/source list so the final project can credit the relevant mod authors and source projects.

A representative asset record can stay focused on reproducibility and gameplay semantics:

```yaml
id: architecture.argonian.river_hut.small.01
source:
  kind: mod
  package: example-mod
  source_page: https://...
  source_hash: ...
credits:
  - author-or-project-name
processing:
  collision: generated-or-authored
  lods: [0, 1, 2]
  materials: semantic
outputs:
  visual: architecture/argonian/river_hut_small_01.glb
  collision: architecture/argonian/river_hut_small_01.collision.glb
```

The semantic registry should eventually support, where applicable:

- physical dimensions and placement footprint;
- foundation and waterline tolerance;
- snap points and modular-kit connectors;
- door, window, container, NPC and interaction sockets;
- climbability surfaces/anchors;
- Rapier collision proxy and navigation blockers;
- material-region semantics such as wood, soil, stone, metal, flesh or vegetation;
- projectile responses (`embed`, `ricochet`, `penetrate`, `break`) used by arrows and later projectiles;
- weapon/character sockets and animation metadata;
- swimming/buoyancy or floating-object metadata where relevant;
- LOD/instancing/batching information;
- interior portal and exterior-door relationships;
- source archive hash/version and one or more credit/source references.

This matters directly for cross-system behaviour. A hut wall identified as `wood` can let a Rapier arrow collision resolve to `embed`, leave a collectible arrow world item attached at the contact transform, and later return that item to the shared inventory system. A stone Xanmeer surface can resolve to bounce/ricochet. The world generator only places the semantic asset; the physics/projectile/item systems consume its material metadata.

The same principle applies to character evolution. If climbing, swimming or equipment later requires new grip sockets, buoyancy samples, foot-contact data, weapon attachment points or animation metadata, the asset-pipeline code and `packages/character`/`packages/animation` contracts can change in the **same pull request** and be exercised by `apps/combat-sandbox`, `apps/world-studio` and `apps/game`.

The pipeline flow becomes:

```text
Skyrim sources + mod sources
              ↓ local vault
tooling/asset-pipeline
              ↓ recipes + validation + conversion
semantic asset registry + runtime outputs
              ↓
world compiler / character compiler / animation compiler
              ↓
apps/game + apps/world-studio + apps/combat-sandbox
```

This is the preferred long-term boundary: **one canonical code repository, external source-asset vault, reproducible generated runtime content**.

## 63. Compiled world bundles

Each world bundle should contain:

```text
bundle.json
terrain.glb or terrain tiles
collision.bin
water-meshes.glb
water-fields.ktx2/bin
static-batches.glb
vegetation-instances.bin
interactive-objects.json
portals.json
encounters.json
nav-ground.bin
nav-swim.bin
nav-climb.bin
nav-boat.bin
lighting/probe data
LOD variants
semantic metadata
source/generator hashes
```

A bundle manifest includes:

```ts
interface WorldBundleManifest {
  bundleId: string;
  worldSchemaVersion: string;
  contractsVersion: string;
  generatorVersions: Record<string, string>;
  sourceHashes: string[];
  assetManifestHash: string;
  bounds: Bounds3;
  dependencies: string[];
  qualityVariants: QualityVariant[];
  byteSizes: Record<string, number>;
}
```

## 64. Deployment

GitHub Actions should:

1. install and type-check packages;
2. run unit and contract tests;
3. validate asset manifests, source references and credits entries;
4. compile changed world areas or consume approved compiled bundles;
5. run hydrology, navigation, collision, combat-space and performance probes;
6. build `apps/game` and `apps/world-studio` deployment variants;
7. publish only runtime assets and approved bundles;
8. emit a build report with bundle hashes and teleport links.

The production browser never receives raw heightmaps, source archives, lore research files or compiler-only data unless a debug deployment intentionally includes them.

## 65. Compatibility discipline

Every package change that touches public contracts runs against:

- combat sandbox tests;
- world studio physical-character tests;
- integrated game tests;
- a fixed generated reference scene;
- migration tests for existing world bundles.

A compatibility matrix can record:

```yaml
worldBundleSchema: 3
contractsPackage: 2.4
combatPackage: 1.8
locomotionPackage: 1.2
inventoryPackage: 0.7
minimumGameBuild: 0.12
```

Schema migrations are explicit tools, never silent runtime guesses.

---


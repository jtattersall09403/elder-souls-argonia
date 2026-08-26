# Navigation data & ambient AI movement for a three.js open world — research, 2026-08-26

What the **world build** must produce so that enemies, ambient NPCs and creatures
can move credibly: baked navigation data (`nav-ground.bin`, `nav-swim.bin`,
`nav-climb.bin`, `nav-boat.bin` in the world bundle), plus compile-time
validation that encounter spaces are actually navigable. Full game AI
(behaviour trees, combat decision-making) is out of scope; the combat sandbox
already has melee enemies with simple steering. Constraints that shape every
verdict here: browser/GitHub Pages, streamed heightfield chunks, modular kits,
Morrowind-leaning ambient simulation, quest plan **forbids** free-roaming
escort/chase AI (followers are waypoint-leashed or teleport-to-mark).

## 1. The vocabulary (so we name things correctly)

**Recast** is the industry-standard navmesh *builder*: voxelize input triangles
(cell size `cs`, cell height `ch`) → filter by slope/height/climb → erode by
agent radius → partition into regions → trace contours → convex polygon mesh
(+ detail mesh for accurate height). **Detour** is the *runtime*: polygon A* +
string-pulling ("funnel") path smoothing, `findNearestPoly`, raycasts on the
mesh; **DetourCrowd** adds multi-agent local avoidance. Unity, UE4/5,
Godot and most AAA pipelines are Recast-based. Key concepts we will use:

- **Tiled navmesh**: the mesh is built as independent square tiles that stitch
  at borders; tiles can be added/removed from a live `NavMesh` at runtime —
  the canonical fit for streamed chunk worlds (and it kills the classic
  Bethesda "cell border welding" failure mode by construction).
- **Off-mesh connections (links)**: authored point-to-point edges (ladder,
  jump-down, door, boat-boarding) with flags + one-way option; crowd agents
  enter an `offmesh` state so game code can play a traversal animation.
- **Per-poly area types + flags + query filter costs**: how "water", "road,
  prefer me", "door", "climb" are encoded; each query passes a filter of
  allowed flags and per-area cost multipliers.
- **walkableRadius erosion**: baking the agent radius into the mesh means the
  runtime only checks the agent *centre point* against polygons — this is why
  one navmesh serves one agent-size class, and why multiple size classes mean
  multiple bakes ([Recast rcConfig docs](https://recastnav.com/structrcConfig.html),
  [Digesting Duck: Recast settings uncovered](http://digestingduck.blogspot.com/2009/08/recast-settings-uncovered.html)).

Standard humanoid starting parameters (world units = metres): `cs` 0.15–0.3,
`ch` ≈ `cs/2`, radius 0.3–0.4, height 1.8–2.0, climb 0.4–0.6, slope 45°;
voxel conversions `walkableHeight = ceil(h/ch)`, `walkableClimb =
floor(climb/ch)`, `walkableRadius = ceil(r/cs)` (same sources).

## 2. Library survey (JS/WASM), with verdicts

| Option | What it gives | Verdict |
|---|---|---|
| **[recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js)** (isaac-mason) — WASM port of Recast & Detour | Full pipeline: solo + **tiled** navmesh generation, off-mesh links, per-poly areas/flags/filters, `NavMeshQuery` (A* + funnel), **DetourCrowd**, `TileCache` dynamic obstacles, `exportNavMesh`/`importNavMesh` to/from `Uint8Array`, `@recast-navigation/three` helpers (`threeToTiledNavMesh`, `NavMeshHelper`, `CrowdHelper` debug visualisation). MIT. **Runs in Node** ("compatible with Node.js and browser environments") → the same library bakes offline and queries at runtime. Actively maintained: v0.43.1 (npm, Feb 2026), WASM package updated Apr 2026. Wire cost measured from the tarball: `recast-navigation.wasm.wasm` **339 KB raw** (~130 KB gzipped) + JS glue 560 KB raw (glue compresses very well); the 1 MB `wasm-compat` inlined build exists for environments that can't serve .wasm — GitHub Pages can, so we don't need it. ([docs](https://docs.recast-navigation-js.isaacmason.com/), [npm](https://www.npmjs.com/package/recast-navigation)) | **ADOPT** — bake engine *and* runtime query/crowd. It is the only JS option with tiled navmeshes + off-mesh links + crowd, and its export format maps 1:1 onto our `nav-*.bin` reservation. Caveat: the export is Detour's versioned binary — **pin the exact package version in both compiler and client** and record it in the bundle manifest. Not all Recast/Detour features are exposed yet (issue/PR on demand). |
| **[navcat](https://github.com/isaac-mason/navcat)** (same author, 2025) — pure-TypeScript re-implementation of the Recast voxelization approach | No WASM; tree-shakeable; single + multi-tile meshes; off-mesh links **with animation hooks**; crowd via `navcat/blocks`; fully JSON-serializable structures; engine-agnostic. First published Aug 2025, v0.4.1 May 2026 — very active but **pre-1.0, API churn likely**. ([docs](https://navcat.dev/docs/), [npm](https://www.npmjs.com/package/navcat)) | **WATCH / fallback.** Attractive (no WASM plumbing in the Python/Node compiler, debuggable JS, JSON data), but recast-navigation-js wraps the battle-tested C++ recastnavigation itself, is further along, and its binary export is smaller than JSON. Re-evaluate at navcat 1.0; the migration would be contained if we keep a thin `NavService` wrapper. |
| **[three-pathfinding](https://github.com/donmccurdy/three-pathfinding)** (donmccurdy) | Zone-based polygon A* + funnel over a navmesh **you author elsewhere** (Blender/Recast CLI); `clampStep` for kinematic agents. Maintained but minimal (1.4k stars; the README itself says it does not build meshes and points to Recast). | **REJECT.** No generation, no tiles/streaming, no agent-radius handling, no crowd, no off-mesh links. Its niche (small hand-authored levels) is not ours. |
| **[yuka](https://github.com/Mugen87/yuka)** (Mugen87) | Steering behaviours (seek/flee/wander/flocking), goal-driven agents, perception/memory, graph + navmesh A*. Last release 0.7.8 ≈ 2021; issues from 2024–2025 sit unresolved → **dormant**. | **REJECT as a dependency; MINE as a design reference.** Its wander/arrive/leash steering patterns and goal-evaluator structure are exactly the shapes our ambient layer needs, and our sandbox already has its own steering. Do not adopt un-maintained code we'd have to own. |
| Hand-rolled waypoint graphs (Morrowind-style path grids) | Trivial data, trivial runtime | **REJECT as the primary system** — Morrowind's own history (below) is the argument: hand-placement doesn't scale to a province, auto-generated grids gave erratic movement, and grids can't answer "can this 1.2 m-radius creature fit through here". Keep *marks and splines* as authored data **on top of** the navmesh, not instead of it. |

### Bake offline vs at runtime

**Bake offline, in the world compiler.** Reasons: (1) generation from full-res
heightfield + kit collision is seconds-per-chunk CPU work we should never spend
on a player's phone; (2) baking is when validation happens — a runtime-only
navmesh can't gate the build; (3) determinism — same WASM build + same inputs ⇒
byte-identical tiles, which our deterministic compiler wants. The compiler
(Python) shells out to a **Node bake step** running recast-navigation-js
(`generateTiledNavMesh` with our own geometry provider, not the three.js
helper, so the bake needs no GPU/scene). Runtime does **queries only**: the
client `init()`s the same WASM, creates an empty tiled `NavMesh` with
preallocated `maxTiles`, and calls `addTile`/`removeTile` as chunks stream in
and out — this is the documented pattern (the repo demonstrates building tiles
off-thread and transferring the `Uint8Array` of `createNavMeshData`). Runtime
*re*-baking (TileCache obstacles, worker rebuilds) is **not needed for v1**:
kit placements are static at compile time. Revisit only if we ever add
player-built structures.

## 3. How Bethesda did it — and what we copy

### 3.1 Morrowind: path grids + AIWander ([UESP Path Grid](https://en.uesp.net/wiki/Morrowind_Mod:Path_Grid), [UESP AIWander](https://en.uesp.net/wiki/Morrowind_Mod:AIWander), [Tamriel Rebuilt pathgridding tutorial](https://www.tamriel-rebuilt.org/content/tutorial-pathgridding-tutorial), [OpenMW AIWander research](https://forum.openmw.org/viewtopic.php?p=16636))

Hand-placed node graphs per cell. `AIWander range duration time [idle2..idle9]`
is nearly the *entire* ambient system: each tick, roll the idle table — highest
passing idle plays; if none passes, pick a random reachable destination within
`range` of the spawn point and walk there. No timer, no schedule; NPCs never
sleep and **never leave their start cell**; destinations include any point on a
grid edge and every NPC's initial position, with a strong preference for
returning to start. Exterior cells without an authored grid got an
auto-generated blanket grid with holes punched for statics and water — the
direct cause of wilderness NPCs "walking around erratically". Combat AI mostly
walked straight at you. **Lessons**: (a) this near-static model *is* the
Morrowind feel we're targeting, and it is astonishingly cheap — a spawn mark,
a wander radius and an idle-chance table per NPC; (b) the failures (erratic
wilderness movement, stuck-on-furniture) came from the *nav data* being bad,
not the behaviour model being simple — an auto-baked Recast mesh fixes exactly
that layer; (c) "never leaves its cell" is a feature: it's a leash, and it
matches chunk streaming.

### 3.2 Oblivion/Skyrim: navmeshes + packages ([CK wiki Navmesh category](https://ck.uesp.net/wiki/Category:Navmesh), [Navmesh Toolbar](https://ck.uesp.net/wiki/Navmesh_Toolbar), [GECK navmesh workflow](https://geckwiki.com/index.php/Navmesh_Creation_Workflow), [CK Package](https://ck.uesp.net/wiki/Package), [Idle Markers](https://ck.uesp.net/wiki/Idle_Markers), [Patrol procedure](https://ck.uesp.net/wiki/Patrol_(Procedure)))

Auto-generated then hand-edited triangle navmeshes with per-triangle flags:
**Water** (only swim-flagged actors may use; meshed on the *bottom* under deep
water), **Preferred** (lower path cost — painted on roads so NPCs follow them
instead of beelining; note the documented bug where combat pathing also honours
it), **cover edges** (auto "Find Cover Edges" + hand-edited; drives ranged AI
and flee-hide), and **drop-down edges** (paired ledge edges the AI jumps down —
one-way, no fall-damage evaluation, wiped by re-finalize). Cell-border navmesh
welding is manual and a chronic mod-bug source. On top: the **package** system
— per-NPC stacks of (schedule window, location/target, procedure) with a
fallback sandbox package; "Sandbox" = wander radius + use idle markers +
furniture; "Patrol" = walk a chain of linked markers, waiting/idling at each;
eat/sleep/work are just packages targeting furniture and idle markers.
Schedules keep simulating in unloaded cells. **Lessons**: adopt the *flag
vocabulary* (water/preferred/jump-down map 1:1 onto Detour area types +
off-mesh links); skip cover edges (Souls melee combat, no ranged cover AI —
note as future work); get border stitching for free from tiled Recast; and
treat Skyrim's package engine as the ceiling we deliberately stay *below*.

### 3.3 The minimum credible ambient layer (Morrowind-leaning target)

What makes a settlement read as alive, in ascending cost, all of it authored
as **marks on the navmesh**, none of it requiring escort/chase AI:

1. **Idle marks**: position + heading + looped idle/work animation tag (lean,
   sweep, forge, net-mending). An NPC standing at a work mark playing a work
   loop is 80 % of "alive". (= Skyrim idle markers; animations are sourced,
   never made.)
2. **Wander radius**: home mark + radius (2–10 m interior, up to ~25 m
   exterior) + idle-chance table; destination sampling = Detour
   `findRandomPointAroundCircle`-style query. This is literally `AIWander`.
3. **Patrol splines**: ordered mark chains with per-node wait + idle tag,
   loop or ping-pong (guards, dock workers). Pathing between nodes is a navmesh
   query, so kits placed later can't silently break a patrol — the bake
   validation catches it.
4. **Day-band mark switching** (the one Skyrim-ism worth taking): 2–4 clock
   bands (day/evening/night) select which mark set an NPC uses — stall by day,
   home at night. Transition = walk if same chunk and short, else **teleport
   while unobserved** (quest plan already blesses teleport-to-mark). No needs
   simulation, no off-screen package evaluation.
5. **Creature territories**: leash centre + radius + allowed nav flags (ground
   / water / both), wander within, return-to-leash on combat disengage. Fixed
   regional danger = fixed territory data, no roaming spawns.

Demands on nav data: navmesh under every settlement walkable surface including
kit interiors; every mark/spline node **snapped to a navmesh poly at bake time**
(hard error if > 0.5 m off-mesh); water flags for swimmer territories;
preferred-cost flag on roads so patrols and any future travel look right.

## 4. Water, climb, boats — the non-ground files

Ground navmeshes are 2.5D; true volumetric swim/fly navigation is an
SVO/voxel-octree problem (Game AI Pro 3 ch. 21; Mercuna/Havok middleware class)
([Mercuna 3D navigation background](https://mercuna.com/3d-navigation-background/),
[SVO chapter PDF](https://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter21_3D_Flight_Navigation_Using_Sparse_Voxel_Octrees.pdf)).
**Verdict: reject SVO for v1** — memory + complexity we don't need, because
swamp water bodies are mostly open volumes.

- **`nav-swim.bin`**: a second Recast bake per water body at the **water
  surface** (input geometry = water plane clipped by shoreline, minus
  emergent obstacles), for surface-swimming creatures and swimming NPCs; plus
  **swim volumes**: convex/AABB depth volumes derived from the existing
  heightfield-vs-water-level data (min/max depth, region id). Submerged combat
  AI steers directly inside a volume (straight-line + local raycast avoidance —
  valid in open water), surfacing behaviour clamps to the surface mesh.
  Skyrim's own answer (mesh the bottom, flag Water, "Swims"-flagged actors
  only) is the degenerate version of this; ours separates surface and volume.
- **`nav-climb.bin`**: **not a navmesh** — a list of off-mesh links (bottom
  poly ↔ top poly, bidirectional, `climb` flag, surface-normal + height
  metadata) at authored/detected climb points, plus the climbable-surface mask
  the player systems use. AI only traverses a climb link if its agent class
  allows; crowd agents entering the link hand control to an animation hook.
  Jump-downs are the same mechanism one-way with a max-drop check at bake time
  (learning from Skyrim's "AI will not evaluate jump distance" footgun).
- **`nav-boat.bin`**: coarse Recast bake on open water only (large agent
  radius ≈ boat half-beam + margin, generous `maxEdgeLen`), used for (a)
  compile-time validation that every dock/sailable route the quest provisions
  demand is connected, (b) any future NPC boat traffic. Boat *boarding* is an
  off-mesh link dock-poly ↔ deck-poly.

## 5. What the world compiler bakes and validates

**Inputs per chunk**: heightfield triangles (full res, not LOD), kit collision
geometry of all placed instances, water level/polygons, authored marks/splines/
links, region danger + settlement metadata.

**Agent classes** (each ground class = one tiled navmesh bake; keep it to two):

| Class | radius | height | climb | slope | consumers |
|---|---|---|---|---|---|
| `humanoid` | 0.35 | 1.85 | 0.6 | 47° | NPCs, most enemies |
| `large` | 1.1 | 2.6 | 0.9 | 40° | big creatures (wamasu-class) |

`cs` 0.25 / `ch` 0.125 for `humanoid` (fits kit doorways ≥ 0.9 m), `cs` 0.4 for
`large`. Tile size: pick tiles that evenly subdivide the chunk (e.g. 4×4 or
8×8 tiles per chunk edge; Recast guidance is 32–128 voxels per tile edge) so
chunk streaming = a fixed set of `addTile`/`removeTile` calls; bake with border
padding (`borderSize ≈ walkableRadius + 3` voxels) so tiles stitch.

**Outputs**: `nav-ground.bin` = concatenated per-tile Detour data (the
`Uint8Array` from `createNavMeshData`/`exportNavMesh`) + index, per class;
`nav-swim.bin` = surface tiles + swim volumes; `nav-climb.bin` = link records;
`nav-boat.bin` = coarse water tiles. Record the recast-navigation version in
the bundle manifest. **Size envelope**: Detour tile payloads are typically
1–20 KB; a 16-tile chunk of open terrain lands ~10–50 KB raw per class and
navmesh data compresses ~3–4× under gzip/brotli (it's mostly small ints), so
expect **low tens of KB per chunk on the wire** — noise next to heightfield +
textures. Settlement-dense chunks trend to the top of the range. (Ballpark
from Detour data layout + the library's own export examples; measure at first
bake and record actuals.)

**Validation probes** (compile-time, hard gates, using the same Detour queries
the game will run):

1. **Mark snap**: every idle/work/patrol/spawn mark `findNearestPoly` within
   0.5 m, correct class flags.
2. **Patrol/spline connectivity**: `findPath` between consecutive nodes
   succeeds, path length ≤ k × straight-line (catches "walks around the whole
   building" surprises).
3. **Encounter access**: for each encounter space, every enemy spawn point
   reaches every arena probe point (grid-sampled arena positions) for that
   enemy's agent class within a cost budget; flags per-class failures ("this
   arena is humanoid-only — the large creature can't fit through the door").
4. **Wander viability**: navmesh area within each NPC's wander radius ≥
   threshold (else the NPC visibly paces a 1 m² patch — the Morrowind bug).
5. **Island report**: polygon-flood connectivity per chunk neighbourhood;
   intentional islands (crannog reachable only by swim link) must be annotated,
   unannotated islands are errors.
6. **Route provisions**: quest `20-world-provisions.md` routes re-checked as
   nav queries (ground, swim or boat as appropriate) — the world build's
   promise that its stated routes physically path.

## 6. Runtime shape (for the eventual game layer — context, not scope)

One `NavService` wraps recast-navigation-js: owns the `NavMesh` per class,
handles tile add/remove on chunk stream, exposes `findPath`, random-point,
and a single `Crowd` (DetourCrowd: per-agent radius/speed/acceleration,
`collisionQueryRange`, obstacle avoidance) for loaded ambient NPCs — tens of
agents is well inside budget. Combat enemies can keep the sandbox's direct
steering and use `findPath` only when straight-line steering fails a navmesh
raycast (Souls enemies rarely need more). Debug: `NavMeshHelper`/`CrowdHelper`
overlays behind a dev flag, the browser equivalent of Morrowind's `tpg`.

## 7. Library and architecture verdicts (summary)

- **recast-navigation-js — ADOPT** for offline baking (Node step inside the
  world compiler) *and* runtime queries/crowd. MIT, active (0.43.1, 2026),
  tiled navmesh + off-mesh links + DetourCrowd + binary export/import; WASM
  ~130 KB gzipped on the wire. Pin the version compiler ↔ client.
- **navcat — WATCH** (same author, pure TS): fallback/successor candidate at
  1.0; isolate behind `NavService` so a swap stays cheap.
- **three-pathfinding — REJECT** (no generation, no tiles, no crowd).
  **yuka — REJECT as dependency, mine its steering/goal patterns.**
  **Hand-placed waypoint graphs — REJECT** as primary nav; marks/splines live
  *on* the navmesh as authored data.
- **Bake offline, query at runtime**; tiles aligned to chunk grid, streamed
  with chunks; no runtime rebaking (no TileCache) in v1.
- **Two ground agent classes** (humanoid, large), separate bakes; Detour
  area flags for water/preferred-road/climb/jump-down; off-mesh links for
  climb points, jump-downs, boat boarding.
- **Water**: surface navmesh + depth volumes; direct steering inside volumes;
  **no voxel-octree 3D nav** in v1. Coarse boat mesh mainly as a route
  validator.
- **Ambient AI minimum** (Morrowind-leaning): idle/work marks + wander radius
  with idle-chance table + patrol splines + 2–4-band mark switching with
  unobserved teleport + creature leash territories. No needs simulation, no
  off-screen schedule evaluation, no free-roam companions (per quest plan).
- **Biggest risks**: binary-format version coupling between bake and client
  (pin + manifest); kit interiors generating navmesh through walls if kit
  collision is sloppy (validation probe 3 catches symptoms, kit QA fixes
  causes); per-poly flag authoring (water/preferred) needs a deterministic
  tagging pass in the compiler, not hand edits.

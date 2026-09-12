# 0025 — Phase 8b water: implementation shape

> **Chain order superseded** by [0059](0059-terrain-built-once-frozen-base-and-typed-patches.md) (2026-09-11): the stage order now lives in `scripts/terrain-chain.sh` under the Phase 16 ladder.

Date: 2026-08-26 · Status: **CLOSED** (owner closed the phase 2026-08-28
after round 7 — accepted as good-enough, explicitly *not perfect*; a full
water-systems re-review + polish is queued in
[docs/phases/P-polish/backlog.md](../phases/P-polish/backlog.md) for Phase P)
Research: [docs/research/rendering/water-rendering-threejs.md](../research/rendering/water-rendering-threejs.md)
Spec: module [60](../world/60-water-traversal.md) §38–42.

## PHASE CLOSED — this file is the institutional memory

The numbered "Round N" sections below record every defect→fix of the
7-round gate; read them before changing any water code. The rebuild chain
and hard-won rules below remain current for anyone touching worldgen or
water shaders (Phase P polish, Phase 9 boats/swimming).

**Owner playtest checklist for round 7** (historical — the owner closed
the phase on this round without itemised feedback; use these spots as the
starting checklist for the Phase P water re-review) (deployed studio:
`https://jtattersall09403.github.io/elder-souls-argonia/studio/`; URLs take
`?view=character|fly3d&x=<km>&z=<km>&t=HH:MM&d=M-D`):
1. Mountain streams CONNECTED — the gorge (fly x=2.43 z=1.13) and any
   mountain valley: one continuous waterway down the slope into the
   lowland system; no empty beds, no disconnected blobs, no solid white
   crust (foam is streaky and slides).
2. Flow speed READS — glassy pools vs sliding glides vs churning rapids
   should look clearly different along one river's course.
3. Waterfalls — near-vertical drops now carry fast down-rushing streaked
   water (not a static sheet). Mist/base particles are polish-tier.
4. Sea LAPS — stand on an open beach (e.g. Topal Bay coast, character
   x=6.16 z=5.07 area): waves visibly arrive, run a tongue up the sand
   (metres, not cm), retreat with backwash foam; successive waves differ
   (wave sets); wet sand tracks the reach.
5. Barcode foam — gone everywhere? (Root cause fixed; if any survives,
   photo it → polish backlog.)
6. Round-6 leftovers if not yet checked: wetter heartlands (marsh belts +
   Archon jungle), wade/jump/crate interactions, performance.
7. Terrain-feel re-review (6b note) — combine with this closing pass.

**Rebuild chain** (after ANY worldgen change; from `tooling/world-generation/`,
vault path in `compile_chunks.DEFAULT_HEIGHTS`, overridable with
`ES_VAULT_ROOT`): The order below is executable as
`tooling/world-generation/scripts/terrain-chain.sh` (`--from <stage>` to
resume), which is where the chain order now lives — change it there.

*Timing and incrementality (2026-09-08).* A full forced rebuild is about
**5.5 minutes** (was ~13); a re-run with nothing changed is **under 10
seconds**. Every stage runs through `worldgen.chain_stages`, which prints its
own elapsed seconds, closes with a per-stage table, and skips a stage whose
code (its module plus every worldgen module it imports) and whose observed
input and output files are all unchanged since the last run — the book is
`chain-stamps.json` in the vault heightfield directory. `--force` rebuilds
regardless. Speed came from removing work, never from changing results: the
minor-route solver builds its step graph once and hands it to
`scipy.sparse.csgraph` (225 s → 12 s), the per-chunk exporters and the scatter
compiler run across the cores, and the heavy province blurs go through
`worldgen.fastfilter` (the same `scipy.ndimage` call, split into bands across
threads). Every one of those was verified byte-for-byte against the code it
replaced. **The chain is not idempotent**: `sculpt_province` reads
`routes.json`, which `reroute_majors` rewrites five stages later, so two
consecutive forced runs produce different terrain. The stamp check therefore
ignores files whose last writer is a *later* stage — it reproduces the
single-pass behaviour the chain has always had. Closing that feedback loop
(or declaring the roads an input the sculpt must not read) is an open job.
`refine_province <vault>/heightfield-f32.npy <vault>/hydrology-pass1.npz`
→ `reroute_majors` → `compile_minor_routes` → **`grade_routes`** →
`author_route_structures` → `grade_routes` again →
`compile_route_structures` → `compile_chunks` → `export_web_chunks` → `compile_water` → `rebake_landcover`
→ `compile_scatter` for the affected chunks (decision 0036) →
`apply_sitings` (re-measures plot facts; re-runs the minor networks,
`export_places` and `export_routes` itself) → `python3 -m pytest -q`.
The two routing steps come first because gradient is a ROUTING property, not
a grading one (owner requirement 2026-09-05: every way walkable end to end).
Both solvers now cost each step by its own longitudinal gradient and wall off
anything over the class cap (`routes.grade_factor`), so a line switchbacks or
contours instead of climbing a spur head-on; grading then only has the last
few metres to swallow. `reroute_majors` repairs the published major-road
polylines in place rather than re-running `compile_society` (which would
re-derive danger and cultures too).
Authored geometry (added 2026-09-05, Phase 11 stream B) closes the loop the
grading report opens: `author_route_structures` reads the over-cap stretches
`grade_routes` exports to `output/route-grading-stretches.json` and records a
stair, stepped ascent, deck, span or lip step for each in
`world/sources/routes/route-structures.json`; the second `grade_routes` run
then exempts those windows (no cut or fill inside one, landings pinned), which
is what takes the survivor count to zero; `compile_route_structures` lays the
kit pieces (`route-structures-v1`) and writes the studio feed. The author step
is additive and idempotent — re-run author/grade until the survivor table is
empty.

`grade_routes` (added 2026-09-05, owner report: roads running off the edge of
a terrace contour) cuts and fills the heightfield along every road, track and
footpath so each has a walkable longitudinal gradient — road 8 deg, track
12 deg, footpath 17 deg, boardwalks untouched — flat across its width with a
benched shoulder no steeper than 30 deg. It reads its input from the
`refined-height-ungraded-f32.npy` snapshot beside the refined heights, so
running it twice is the same as running it once, and it must run BEFORE
anything derived from heights. Report:
`world/sources/sites/route-grading.md`. It reads the *published* water
surface, so on a first-ever bake run `compile_water` once before it.

**Grading and siting are separated on purpose.** Grading reshapes the ground
*because of* where the plot put places and where the route solvers ran, and
the water bake then follows the graded ground — so scoring siting on that
surface is a feedback loop that silently moves committed records. Before it
grades, `grade_routes` snapshots the natural state
(`refined-height-ungraded-f32.npy` in the vault,
`refined/height-natural-rg.png` and `province/water/natural/` in the studio),
and `site_fields.ProvinceSurvey` — the siting layer behind the macro plot,
the route networks and the blueprints — reads the snapshot. The graded
surface is what the chunks, colliders, water bake, land cover and scatter
carry. The snapshot refreshes itself whenever `refine_province` rewrites the
refined heights (tracked by `refined-height-graded-by.json`, not by mtime:
grading's own output is always newer than its input).

**The road geometry has the same seam** (2026-09-05). A place's siting score
depends on how near a road it is, so re-routing a road would re-plot
committed records. `reroute_majors` snapshots the pre-repair corridors as
`province/routes-natural.json` (marker `routes-repaired-by.json`, same
fingerprint trick) and `ProvinceSurvey` reads that; the repaired line is what
the world carries, and `compile_minor_routes` seeds its tracks off the
published `routes.json` so a track meets the road that is really there.

**Boat lanes have it too** (2026-09-05, Phase 11 stream C). A lane solved
anchor-to-anchor ends at the city's centre of gravity on land, where no boat
can tie up, so `world/sources/routes/lane-terminals.json` declares the berth a
city's lanes really end at (Lilmoth's lighter quay is the first) and
`compile_society` routes to it. That correction is a repair like the road one:
`compile_society` writes BOTH `province/waterways-natural.json` (the
anchor-to-anchor solve, read by `ProvinceSurvey` for siting) and
`province/waterways.json` (ending at the berths, what the world carries and
what `compile_minor_routes` and the 97 C-stitch check measure against). With
no terminal declared the two files are identical. Skipping the snapshot moved
a committed record (`place.mercantile-coast.sunkfoot` went homeless) — the
determinism test caught it.

**Watch the two `hydrology-pass1.npz` files.** The one `refine_province` must
be given is the one *beside* `heightfield-f32.npy`; the stale copy in
`province-refined/` produces a visibly different province (mean 1.4 m, up to
409 m in the mountains).
Texture-set changes: `build_ground_materials` first — **and check
`BMV_OVERRIDES`, which silently overrides the base table for the default
set** (Round 6 §1). App: `npm run build` in `apps/world-studio`; browser
probes from `apps/combat-sandbox`:
`WATER_SCENARIO=bay-noon-fly,river-walk,marsh-morning-walk,underwater-bay-fly
node ../world-studio/scripts/probe-water.mjs` (full 9-scenario suite takes
~20 min — the CLAUDE.md 15-minute rule says prefer the subset).
Deploy: push to main; if no Actions run appears in ~2 min,
`gh workflow run deploy-pages.yml --ref main`; verify with a curl of a
changed asset. **Shared worktree**: other agents run concurrently —
pathspec-only commits, PROGRESS.md via the staged-blob technique (see
memory `concurrent-agents-shared-worktree`), never broad `pkill`.

**Hard-won rules** (details in the round logs): no data in PNG alpha
channels, ever (canvas premultiply destroys it); never scale an oscillating
velocity by absolute time in shaders; GPU resources from `useMemo` must not
be disposed by effects with unstable deps; one physics for all water levels
(priority-flood) — no per-feature level heuristics; texture identity is
verified by contact sheet, not by slot name.

**Open items at close** — all tracked in
[docs/phases/P-polish/backlog.md](../phases/P-polish/backlog.md) (Phase P) except: per-body
`WaterBody` records → Phase 11; physics mass-unit scale → Phase 9 boats.

## Decisions

1. **One continuous water surface, not per-body meshes.** The compiler bakes a
   province-wide water-surface-height field `W(x,z)` (2017², RG16 PNG like the
   terrain chunks): real surface height over water (sea 0, lakes at their fill
   level, rivers at a monotone-downstream surface), and **`ground − headroom`
   everywhere dry** so the surface is continuous and simply hides under the
   terrain via depth-testing — no seams, no discards, no per-body geometry.
   The renderer draws one camera-centred multi-ring clipmap grid displaced by
   `W` + waves; sea, lakes and rivers all come out of the same draw.
2. **Per-pixel water character, class LUT.** `water-flow.png` (1345² RGBA:
   flow dir, speed, shore SDF) and `water-class.png` (class index
   coast/estuary/river/lake/marsh, turbidity, salinity, season response) drive
   per-class visual profiles (module 60 §40's table) from one material.
   Full per-body `WaterBody` records are deferred to Phase 11 (POIs will need
   them; the class layer is sufficient for rendering and gameplay now).
3. **Material = `MeshStandardMaterial` + `onBeforeCompile`** (decision 0020
   precedent), CSM-patched first, aerial-perspective chained after, cache key
   `es-water`. This buys, for free and exposure-correct: CSM sun/moon GGX
   glints with shadows, **PMREM sky reflections including moons and stars at
   night**, ACES + eye adaptation, aerial haze. Injections: vertex `W` +
   Gerstner displacement; normal override (wave + flow-advected detail
   ripples); foam as diffuse albedo; transmitted-scene term (Beer–Lambert
   through scene colour+depth); tiered SSR.
4. **Reflections: PMREM env + tiered SSR; planar reflections nowhere** (the
   research is unanimous). Sharp analytic-sky sampling deferred — the PMREM
   bake throttle from 8a is tight enough near the horizon.
5. **One scene render per frame.** Opaques (+ sky) render once into a
   half-float RT with a depth texture (tone mapping temporarily off), a
   tone-mapped fullscreen blit puts it on screen, then the water renders on
   top sampling that RT for refraction, thickness, SSR and manual
   depth-occlusion (no hardware depth copy needed). Underwater: the water
   underside (a no-scene-texture variant with Snell's window) renders *into*
   the scene RT and a post pass applies per-channel extinction fog + god rays.
6. **CPU/GPU lockstep** (8a's `skyScreenModel` pattern): one TS module owns
   the wave-parameter table and generates both shader uniforms and the CPU
   Gerstner sampler (fixed-point XZ-displacement inversion, after
   WaterThreeJS/Crest); the same module implements `WorldWaterQuery.sample`
   (contracts §38) from the baked rasters + tide/season offsets, replacing the
   flat-sea stub in `chunkWorld.ts`. Vitest envelope tests guard parity.
7. **Tide/season are world state**: spring/neap tide from the two moons' phase
   (module 55 §95) modulates `W` where class = coast/estuary via
   `flood-states.json.tidalAmplitudeM`; the wet-season `?wet=1` toggle raises
   season-responsive pixels by `seasonalAmplitudeM`. Renderer uniform and CPU
   query share the same functions.
8. **Vendored code**: Gerstner/foam/underwater GLSL and the CPU sampler
   adapted from **WaterThreeJS** (MIT); flow-map advection after three.js
   `Water2`/Valve; flow-map data contract after **SeedOcean** (MIT), data
   generated by our own `compile_water.py`. Credits in root README +
   THIRD_PARTY_NOTICES in the same change. abyssal-ocean (FFT coast) and
   jeantimex/threejs-water (hero-pool sim) held as future upgrades.
9. **Quality tiers** (one declarative table): T0 mobile — env-only
   reflections, no SSR/god rays, reduced-res scene RT, fewer wave bands;
   T1 desktop default — + SSR, god rays, full foam. Auto by device, URL
   override `?wq=`.

## Round log

Owner playtest rounds 1–7 (2026-08-26 → 2026-08-28) are in [docs/research/archive/water-8b-rounds/0025-round-log.md](../research/archive/water-8b-rounds/0025-round-log.md).

# 0036 — Phase 10 placement decisions

> ## RUN-BOOK — start here if you are continuing Phase 10
>
> Read this box, then [00-core](../world/00-core.md), then come back. The rest
> of this record is *why*; this is *where things are*.
>
> ### You are here
>
> The vegetation pipeline works end to end and is **deployed**: mining →
> asset registry → kit builder (NIF→GLB) → scatter compiler → instanced
> renderer in the studio. The owner has seen it and is giving feedback on how
> it *looks*. Five areas have plants; the rest of the province is bare on
> purpose (exemplar-first, module 95 §85.4).
>
> ### The loop you will be running
>
> ```bash
> # 1. change palettes/densities/species: edit worldgen/build_palettes.py
> #    (the GENERATOR — palettes.json is its output since round 2; the
> #    archetypes encode the evidence once), then regenerate:
> python3 -m worldgen.build_palettes
> # 1b. T3 groundcover densities are separate: world/sources/flora/groundcover.json
> #     (runtime ring — no recompile needed, just rebuild/deploy the studio)
> # 2. recompile the five areas' bundles      (from tooling/world-generation)
> CH=""; for c in 5,12 7,9 11,7 3,3 4,10 7,14; do cx=${c%,*}; cz=${c#*,}
>   for dx in -1 0 1; do for dz in -1 0 1; do
>     CH="$CH --chunk $((cx+dx)),$((cz+dz))"; done; done; done
> python3 -m worldgen.compile_scatter $CH --report \
>   --out ../../apps/world-studio/public/province/vegetation
>
> # 3. only if the SPECIES LIST changed — rebuild + copy the kit GLB
> #    (from tooling/asset-pipeline; ~70 s, needs the vault)
> python3 -m pipeline.build_kit --kit flora-province-v1
> cp output/kits/flora-province-v1.{glb,kit.json} \
>    ../../apps/world-studio/public/kits/
>
> # 4. check it renders            (from apps/combat-sandbox, ~6 min)
> cd apps/world-studio && npm run build && cd ../combat-sandbox
> node ../world-studio/scripts/probe-vegetation.mjs
>
> # 5. gates, commit, PUSH — the owner playtests the DEPLOYED build
> npm test && npm run typecheck && git push origin main
> ```
>
> **Push, every time.** The first round of owner feedback was "I can't see any
> plants" and the cause was nine committed-but-unpushed commits. Committing is
> not delivering here.
>
> ### Where the owner's feedback lands
>
> Look-feedback usually IS system-feedback here (owner, round 2) — route it
> to the archetype or field that produces the look, not to per-spot tweaks.
> All palette edits go in `worldgen/build_palettes.py`, then regenerate.
>
> | If they say… | Change |
> |---|---|
> | too thin / too thick overall | `densityScale` (generator output), or the archetype densities per region table |
> | one region wrong, others fine | that region's table in `build_palettes.py`; check delivered vs authored in `compile_scatter --report` (per-class + per-species lines) |
> | ground/floor too bare or too busy | `groundcover.json` densities (the T3 ring carries most of the "dense" read — mined rule M5) |
> | too samey / too patchy | archetype `patchiness`/`glade_response`; wavelengths `GLADE_WAVELENGTH_M` (90 m) / `STAND_WAVELENGTH_M` (190 m); treefall-gap band in the canopy archetype |
> | water margins wrong (reeds/lilypads/banks) | the water-posture archetypes (M1) + `shore_m` bands; pool theming is the `guild` mechanism (M3, ~220 m tiles) |
> | rivers too bare / too walled | `RIPARIAN_WET`/`RIPARIAN_DRY` gains (M2) and the `gallery()` ribbons |
> | trees too big / small | archetype `scale_range`; giants are the `role: landmark-giant` layers |
> | wrong plants somewhere | swap species ids — query the registry first, then rebuild the kit (step 3) |
> | can't navigate / can't see landmarks | giant density and `clearance_radius_m`; the design case is in [vegetation-density-design.md](../research/vegetation-density-design.md) §(a) |
> | plants pop/vanish at distance | `maxDrawDistance`/`lodDistances` in `floraKit.ts`; billboard tier is the kit's `_lod_flat` levels |
>
> ### Probing and screenshots (round 2)
>
> The studio takes `?yaw=` (compass deg) / `?pitch=` (deg, negative looks
> down) / `?hud=0` (hide all panels) / `?w=clear` (force weather) /
> `?smsize=256&wq=low` (software-GL relief) — aim the camera at whatever
> needs capturing. SwiftShader CANNOT render a ground-level dense-area frame
> in useful time (~2 min per 640×400 frame at 14 M tris): the probe asserts
> dense areas from 420 m (which exercises the T4 cull/billboard path) and
> ground-level judgement belongs to the owner on the deployed build.
>
> ### FIVE traps, all already sprung once
>
> 1. **Never look a kit asset up by its glTF node name.** three.js sanitises
>    node names and strips the slashes out of
>    `bmv__landscape/trees/cypress1`; every lookup misses and the kit renders
>    **empty, with no error anywhere**. Ids travel in glTF `extras`
>    (`export_extras=True` in the kit builder).
> 2. **One instanced mesh per chunk is a draw call per chunk** — 449 for 13
>    chunks. Bucket by (species, LOD) across chunks: 96.
> 3. **`vite preview` runs with `command === "serve"`**, so the build-time
>    base is not applied; probes must pass
>    `--base /elder-souls-argonia/studio/` or every asset 404s and the page
>    just looks blank.
> 4. **`ground-control.png` is FULL resolution (4033²) but `refined/meta.json`
>    describes the half-res height raster (3.66 m/px).** Sampling it with
>    `meta.metresPerPixel` reads the wrong quadrant of the map — mountain
>    rock "under" the jungle, zero groundcover, no error anywhere. Derive
>    the texel scale from the image's own size against the province extent
>    (Groundcover.tsx and compile_scatter both do this now).
> 5. **A killed `refine_province` (OOM, exit 137) leaves half-written
>    outputs** — a fresh `height-rg.png` decoding against a stale
>    `meta.json`. The VM container has a 12 GiB memory cap shared by every
>    open Claude terminal tab; restore half-written rasters from HEAD and
>    re-run when the box is quiet.
>
> ### Round 10 (2026-09-02) — colliders moulded to the wood geometry; card audit; the FPS drop
>
> Owner, after round 9 (with screenshots at 4.12 km E · 4.51 km S): still
> inside large trunks and buttress roots; palms not solid at all; FPS down in
> tree-heavy areas even on Low; palms showing a conifer silhouette at
> distance; some big trees never switching to a far tier at all.
>
> **Colliders — the v2 tracked chain is GONE, replaced by geometry fitting.**
> Ground truth (sampling every tree's bark/wood mesh surfaces in the shipped
> GLB against its chain) showed the round-9 `trunk_chain` was wrong wherever
> a tree wasn't a single near-vertical stem: fanpalm6's whole sweeping trunk
> sat 8–16 m outside its one surviving capsule, the willows are multi-stemmed
> (one chain cannot cover them), and the anvil composites' wandering columns
> were missed above ~10 m. Fix: `pipeline/trunk_solids.py`, a kit POST-PASS
> (pure Python + numpy over the built GLB — no Blender) that samples the WOOD
> primitives (texture-name classifier; the big cutout cards — `palmmiddle`,
> `grandoak`, `gkbbranch3dark` — are vetoed or they solidify air), slices
> into height bands, grid-clusters each band in plan, ring-tests each cluster
> (wall samples bunch near the radius; sprays don't), 2-means-splits forks,
> and emits ORIENTED capsules (`{radiusM, aM, bM}` endpoints) under
> **`collisionFrame: pivot-yup-v3`**. Runs automatically at the end of
> `pipeline.build_kit`. Verified: worst species low-trunk p95 residual fell
> from +7…+16 m to ≤ +0.4 m (willow whip-curtains stay walk-through on
> purpose — matches the source games). Runtime: `floraSolids.ts` reads v3
> (quaternion per capsule, older frames get NOTHING), and
> `VegetationColliders` is now IMPERATIVE — it diffs fixed Rapier bodies
> between rebuilds instead of re-rendering up to 1,400 `<RigidBody>` React
> components per rebuild, which was the second half of the FPS drop.
>
> **Far tiers — every tree now has a correct card.** Root causes: (1) all
> BM&V tree cards UV one shared atlas path, but BM&V ships TWO atlases —
> palms/mangroves are only drawn in `tamrieltreelodtropical.dds`, and the
> build was binding the plain one (palms therefore sampled vanilla's pines:
> the owner's "conifer silhouette"). Kit config now has `textureAliases`
> binding the tropical atlas kit-wide (temperate rects are identical in
> both). (2) The three treewillows' own cards UV a crown chunk in every
> atlas (BM&V bug) — kit config `lodFlatFrom` lets a species borrow another's
> authored card, rescaled to its height in Blender: willows borrow the
> `gkbjungletreenew2xv2weeping` weeping-willow cards, cypress1/3 borrow
> `gkbcyrodilcypress1/2` (with per-species `lodFlatTexture` back to the plain
> atlas — their rects are empty in the tropical one), fanpalm6 borrows
> fanpalm4, mangrove gkb9 borrows gkb3's gnarled card, and the two anvil
> composites (5.2k/8.5k tris, NO far tier — 2.7 M of the 4.4 M triangles at
> the owner's coordinates, the main FPS regression) borrow the datepalm
> cards. Audit method: crop every card's UV rect out of the candidate
> atlases (`tmp/probe/*.png` collages, reproducible scripts). (3)
> `lodDistances` now returns THREE rings — full mesh capped at 150 m, then
> light decimation, then the previously-DEAD deep-decimation level, then the
> card; composites also decimate harder (`lodRatios [0.2, 0.06]`). Simulated
> triangle load at the owner's spot: 4.42 M → ~1.5 M.
>
> Probe scripts: `tmp/probe/trunk_coverage.py` (coverage numbers) and the
> collage generators in this session's history; `probe-cards*.json` kit
> configs audition donor cards.
>
> ### Round 9 (2026-09-01) — trunk volumes, and the collider budget bug
>
> Owner, after round 8: still walking through the new trunks and the
> buttress roots. "Mould the collision capsule to the actual volume of the
> whole of their trunks (same for all trees). This will be very important
> for climbing later."
>
> **The dominant cause was not the shape at all — it was the budget.** The
> collider ring built the nearest **96 instances** within **45 m**. Measured
> against the densest jungle chunk, a point in the jungle has ~116 solids
> within 45 m and up to **1,411** in a thicket, so the budget ran out
> roughly 12 m from the player — while the rebuild only triggered after
> they had walked 12 m. The player therefore spent much of their time
> standing outside the set that had colliders at all, walking through
> everything. Three changes:
>
> - The budget is now counted in **colliders, not instances** (a chain of
>   sixteen capsules and a pebble are not the same cost): `RING_M` 45 -> 20,
>   `COLLIDER_BUDGET` 2,500, with a 1,400-body backstop that essentially
>   never binds.
> - `selectNearestSolids` returns `coveredRadiusM` — how far the cover
>   HONESTLY reaches, shrunk whenever either the budget or the backstop
>   binds — and the ring rebuilds once the player has crossed 55% of it
>   rather than a fixed 12 m. Cover is proportional to density, so the
>   trigger has to be too. Measured worst case: 8.3 m of cover, rebuilt
>   after 4.6 m, leaving ~3.7 m of margin — metres beyond arm's reach.
>   Typical case is the full 20 m ring for ~35 bodies.
> - A lower body cap was tried and REJECTED: a smaller set shrinks the
>   covered radius, which buys *more* frequent rebuilds, not fewer.
>
> **The shape, for every tree.** `trunk_chain` replaces the single
> chest-height capsule everywhere (round 8 only did composites). A tree mesh
> is mostly leaves, so slicing it in bands measures the crown; this TRACKS
> instead — seeded on `trunk_capsule`'s already-signed-off chest-height fit,
> then climbing in bands, each time keeping only vertices near the axis so
> far and letting that axis drift slowly. Foliage sits off-axis and is
> rejected; a leaning trunk drifts and is followed. Tuning that mattered:
>
> - Radius is a **high percentile of radial distance** (p90), which survives
>   both the Anvil column's dense centre cap (a low percentile called a 56 m
>   tree 17 cm thick) and stray leaf vertices inside the gate.
> - Radius may **shrink freely but barely grow** (x1.05/band, hard-capped at
>   1.3x the seed). Without it the gate widened with the radius and the two
>   ran away into the crown together — cedartree3's top capsule reached
>   7.7 m on a 0.34 m trunk.
> - Band height scales with the tree (`height/14`, 1-3 m), because the
>   runtime budget is in colliders: no species costs more than 16.
> - Result: base radii within a few cm of the fifty capsules the owner
>   already signed off, and 79-100% of trunk height covered on most species
>   (palms with very sparse trunk geometry reach 50-86%).
>
> **The buttress roots had no collider at all.** A composite measured
> collision from part 0 only. Parts may now be marked `"solid": true`; the
> giant's root flare is, so it is something you walk into rather than
> through. Crowns never are.
>
> Runtime: `collidersFor` returns the chain; one rigid body per instance
> carries every shape, each shape's offset a plain LOCAL position so a
> curved chain still follows the trunk once the instance is yawed.
>
> ### Round 8 (2026-09-01) — the round-7 playtest fixes
>
> Owner: "new canopy is fantastic". Two defects, both in what round 7 added.
>
> - **S1 — you can walk through parts of the new trees' trunks.** The
>   collision model assumed a trunk is a POLE. `trunk_capsule` fits one
>   upright capsule at a chest-height slice, which is right for the fifty
>   species already signed off and wrong for the Anvil canopy tree, whose
>   trunk wanders ~14 m sideways over its 34 m — the cylinder at its base
>   covered the bottom and missed the rest.
>
>   Trunks can now be a CHAIN. `trunk_segments` walks the trunk in ~2 m
>   bands and emits a capsule per band following its axis
>   (`collisionSegments`, additive to the v2 frame; the single capsule stays
>   as the fallback). It runs **only where the trunk is its own mesh** —
>   i.e. composites. For an ordinary tree the upper bands are full of
>   canopy, so a band would measure the crown, which is precisely why the
>   single-slice fit exists. Verified: every pre-existing capsule is
>   byte-identical.
>
>   Two estimator traps, both from the source meshes being low-poly:
>   1. A vertex percentile reads *lateral drift within a band* as girth —
>      4 m bands gave the canopy tree a 3.2 m base radius against a true
>      ~1.5 m. Radius is now half the band's **smaller** horizontal extent:
>      purely geometric (so vertex density cannot fool it, which also
>      retires the reason for the `collisionRadiusM` override) and taking
>      the smaller axis keeps directional lean out of the girth.
>   2. `anvilgianttrunk` is 784 triangles over 56 m, so its vertex rings are
>      metres apart and a 2.35 m band catches *half a ring* — radii
>      alternated 5.3, 1.5, 4.0, 0.6 up a smooth column. Fixed with an
>      overlapping ±1-band window plus a median-of-three along the chain, in
>      both radius and axis. A trunk tapers; it does not jump.
>
>   Runtime: `collidersFor()` replaces `colliderFor()` as the entry point and
>   returns an array. One rigid body per instance now carries every shape,
>   with each shape's offset as a plain LOCAL position — which is what keeps
>   a curved chain following the trunk once the instance is yawed.
>
> - **S2 — thin trees (palms) sway too much, worst in light wind.** Round 7
>   let `windStiffness` scale thin trunks UP to ×2.2, and palms measure
>   0.25-0.27 m, so they landed near the ceiling and nearly doubled their
>   sway. The ceiling is now **1.0**: the term only ever stiffens relative to
>   the calibrated baseline. Fat trunks were the defect; slender ones were
>   never the problem and keep the amplitude that was already signed off.
>
> ### Round 7 (2026-09-01) — the round-6 playtest fixes
>
> Owner: everything except the jungle roof, the wind and the hanging roots
> "looks good". Four items, each root-caused.
>
> - **R1 — "these look like oak trees; do we have specifically TROPICAL
>   tall jungle trees with wide canopies?"** They were oaks. A 102-mesh
>   probe of both pools, measured AND rendered, settled it: round 6's
>   wide-crowned picks are `gkbwrtempletree03` (a textbook English oak),
>   `cedartree5` (a cedar of Lebanon), `gkbtreeofwolene` (a bare gnarled
>   winter oak), `treeofwolene2`, and `giantredwood2` (a conifer). All
>   retired.
>
>   The harder finding, and the one to carry forward: **neither BM&V nor
>   Tropical Skyrim ships a 30-40 m broad-crowned rainforest tree.** They
>   have wide crowns at ~20 m (all temperate-looking) and tall narrow things
>   at 30-58 m (redwoods, palms, bare columns). The one genuinely tropical
>   giant is Tropical Skyrim's **Anvil tree**, and it ships as PARTS — a
>   34 m curved trunk, a 56 m column, 27 m fern-palm crowns and a buttress
>   root flare. Vurt places the trunks as whole trees (they replace vanilla
>   pines in `Tropical Skyrim.esp`); the crowns are unused.
>
>   So the kit builder learned to **compose**: a kit entry may carry
>   `compose.parts`, each a registry asset with `offsetM` (kit source space,
>   z-up), `yawDeg` and `scale`. Two composites now carry the roof —
>   `composite:jungle/anvil-canopy-tree` (42.4 m x 33.8 m crown, 5,252 tris)
>   and `composite:jungle/anvil-emergent-giant` (66.7 m x 36.7 m, 8,518
>   tris, with the buttress flare at its foot). This is sourcing, not
>   modelling: every triangle is Soolie's, only the arrangement is ours, and
>   the credit line says so.
>
>   Four traps found building it, all silent:
>   1. Importing the same NIF twice can hand back objects **sharing a mesh
>      datablock** — `data.transform()` then moves both. Single-user copy
>      first.
>   2. `mesh.transform()` leaves `object.bound_box` **cached**. Every part
>      but the last gets flushed by the next part's import, so the LAST part
>      of every composite measured at its untransformed position — one crown
>      read as if it sat at the tree's feet. `view_layer.update()` after the
>      loop; `trunk_capsule` now derives its own bounds from vertices rather
>      than trusting the cache.
>   3. A composite must measure its **trunk capsule off its first part
>      only**. Sampling the whole assembly takes the giant's 12 m buttress
>      flare for trunk width.
>   4. `trunk_capsule`'s vertex percentile assumes the trunk is where the
>      vertices are. The Anvil column is a smooth low-poly cylinder with a
>      dense cap of small triangles at its centre, so it returned a 17 cm
>      trunk. Fixed with an explicit `collisionRadiusM` on that one asset —
>      safer than retuning a heuristic that is right for the other fifty.
>
> - **R2 — the roof was at 18-28 m; the owner wants 30-40 m with 40-60 m
>   giants.** The composites are placed at ×0.75-0.95 (32-40 m) and
>   ×0.68-0.88 (45-59 m) — DOWNSCALES of their own meshes, which only ever
>   sharpens texel density. The two broadleaves that do read tropical
>   (`treeofwolene4`, `gkbjungletreenew30v3`) are upscaled ×1.5-2.4 into the
>   same band; scaling is uniform, so proportions are exact and only texel
>   density drops — invisible at 30 m overhead.
>
> - **R3 — "not enough 30 m+ trees, way too many shorter ones."** The
>   sub-canopy went from 145/ha of 10-17 m broadleaves to ~40/ha, and only
>   the ones that read tropical (the bushy fern-trees, the palms); the
>   generic broadleaves `jungle_mid`, `jungle_tree_hero` and
>   `jungle_tall_b` left region 13 entirely. The roof itself went to 18/ha
>   of the 33.8 m-crown composite plus 22/ha of the other tall species.
>   **Wide crowns are cheaper**: chunk 6,9 fell 13.8k -> 11.9k instances
>   while closure rose. Region 11 (firm-lowland) got the same roof at 60%,
>   so crossing between the two does not step out from under a 35 m canopy
>   into a 12 m one.
>
> - **R4 — hanging root decorations, gone entirely.** `root_cluster` and
>   both tramaroot species are out of the palette generator and out of the
>   kit. The mined rules in `composition-rules.json` are kept as a record of
>   what the sources do; nothing places them.
>
> - **R5 — wind: fat trunks swayed as much as thin ones.** True, and the
>   physics agrees: cantilever tip deflection goes as `q·H^4/(E·I)` with
>   `I ∝ r^4`, and wind load `q` grows with crown area (`∝ r^2` in tree
>   allometry), leaving deflection `∝ r^-2`. `windStiffness()` uses exactly
>   that exponent against a 0.36 m reference trunk, clamped to [0.18, 2.2],
>   read from the kit's own collision capsule radius AT INSTANCE SCALE.
>
> - **R6 — trunks appeared to sway at their base, "moving in the ground".**
>   The height weight was measured from the instance PIVOT, but terrain
>   species are deliberately sunk below the streamed ground, so the pivot is
>   underground and the trunk was already displaced where it met the soil.
>   Height is now measured from the ground line (`esRawHeight - esSink`).
>
>   Both R5 and R6 needed a per-instance channel. It is one `vec2` instanced
>   attribute, `esWindTune` = `(stiffness - 1, sink)` — **offsets from
>   neutral on purpose**, so a draw whose geometry lacks the attribute reads
>   WebGL's generic default `(0, 0)` and degrades to the old look rather
>   than silently switching wind off. The attribute is cached on the kit
>   geometry and grown in place; allocating a fresh one per rebuild strands
>   its GPU buffer, which at ~12k instances a rebuild adds up over a
>   session.
>
> - **New tool, kept:** `python3 -m pipeline.render_sheet --kit <id> --out
>   <dir>` renders one framed still per kit asset with a 1.8 m human bar for
>   scale, plus a `sheet.md` of the measurements. Choosing between fifty
>   candidate meshes is the real work in a never-make-art project, and the
>   manifest's numbers cannot tell you whether a tree reads as tropical or
>   as an oak. (Cycles on CPU — headless Wine has no GL and EEVEE segfaults;
>   `transparent_max_bounces` must be high or every crown renders BLACK.)
>
> ### Round 6 (2026-09-01) — the round-5 playtest fixes
>
> Round-5 items 1 (cutouts), 2 (rocks), 3 (tramaroot), 5 (card brightness)
> and 9 (performance, all three settings) PASSED. The five defects, each
> root-caused before touching anything:
>
> - **C1, wind invisible even in a forced thunderstorm.** TWO independent
>   causes. (a) `CSM.setupMaterial` (WorldSky's ≤1 s `patchScene` pass)
>   OVERWRITES `onBeforeCompile` — the very trap the aerial patch already
>   re-applies around, but wind had no re-application, so every flora
>   material lost its sway hook ~1 s after load, permanently (the
>   idempotency guard blocked repair). Fix: `windSway.ts` now stores its
>   state on `material.userData`, exports `reapplyWindSway` (no-op unless
>   the live hook is not ours; chains whatever clobbered it), and WorldSky
>   calls it right after `setupMaterial` + the aerial re-apply. It also now
>   sets a chained `customProgramCacheKey` ("|es-wind") — without one, a
>   patched material silently shares an unpatched twin's compiled program
>   (the aerial patch keys everything to one constant string, so the
>   collision is real). (b) The amplitude weight `pow(h/10, 1.5)` gave every
>   sub-2 m plant millimetres of motion; exponent now 0.8 and the
>   oscillating share raised to half, so understory visibly moves in a
>   storm while trunks stay pinned. Plus: Vegetation and Groundcover each
>   ran their OWN uniform block over shared kit materials — now one shared
>   block (`vegetation/windUniforms.ts`) and `updateWindSway` takes absolute
>   elapsed time so double per-frame calls are harmless. All of this is
>   under test (`windSway.test.ts`) — round 5 shipped with zero coverage.
> - **C2, colliders not shaped to trunks/rocks.** The kit emitted capsule
>   offsets relative to the BBOX CENTRE in Blender z-up; the runtime read
>   them as pivot-relative y-up and assumed the pivot sat at the bbox
>   bottom (willow: 7 m lateral + 4 m vertical error), never yaw-rotated
>   the offset, dropped rock tilt, and measured the "trunk" radius on the
>   bottom 10 % of the whole tree (skirt cards → 1.3–5.3 m bollards).
>   Fix is a versioned contract: the kit builder now emits
>   `collisionFrame: "pivot-yup-v2"` with pivot-relative glTF-Y-up offsets
>   (capsule `baseOffsetM`, box `centreOffsetM`), trunk radius measured on
>   a 0.3–2 m slice about the MEDIAN centre at a low percentile;
>   `floraSolids.colliderFor` REFUSES untagged kits (misplaced colliders
>   are worse than none), and `VegetationColliders` rotates the offset by
>   the instance's full YXZ euler and tilts rock boxes with the mesh.
> - **C3, jungle canopy "short, not tropical, no wide crowns".** Round 5
>   fixed HEIGHT but picked narrow-crowned species. The tall-canopy probe
>   kit measured every plausible tree in the vault by height AND crown
>   width; the roof is rebuilt on wide-crowned picks (crown:height 0.9–1.7):
>   `gkbjungletreenew3` (34 m crown / 20 m, 924 tris) as the closure
>   workhorse, `gkbwrtempletree03`, `cedartree5`, `treeofwolene2`;
>   `gkbtreeofwolene` (33.7 m, 31 m crown) as the kapok-form emergent,
>   `giantredwood2` at ×0.55–0.68 as rare buttressed giants, `fanpalm3`
>   punching through. Round-5's 11–14 m species drop to the sub-canopy
>   tier they are actually the height of. Watch: chunk 6,9 is now 13.8 k
>   instances (was 12.0 k) — the owner's FPS read is the gate.
> - **C4, scree invisible.** The pipeline was CLEAN (raster deployed, 25–53 %
>   scree at every advertised viewpoint) — the TEXTURE was wrong:
>   volcanictundragravel01 is dark gravel under yellow-green lichen mottle,
>   luma-normalised within 4 of mountain_rock, i.e. indistinguishable from
>   more mossy rock, and the far field renders only per-material average
>   colours. Lesson recorded in `build_ground_materials.py`: the anisotropy
>   screen is necessary, not sufficient — LOOK at the candidate. Replaced
>   with ambientCG `Gravel015` (bare neutral grey, chroma 6, aniso 1.06),
>   12 m tile, luma 72 vs the rock's 62 so aprons read at distance.
> - **C5, hangers on leaves/air.** `spawn_attachments` used a ±0.5 m square
>   about the model PIVOT (willow trunk: 7 m away) and let shrubby
>   "/trees/" pseudo-trees host 2–6 m vines. Attachments now sit ON the
>   measured trunk: `composition.py` loads the kit's v2 capsules
>   (`load_trunk_capsules`), hosts require ≥6 m of measured trunk (which
>   also ADMITS the new canopy species the rules file never met), the vine
>   lands at a random angle 0.9×radius from the yaw-rotated trunk axis,
>   facing outward, clamped below 0.8× trunk height.
>
> Recompiled: six rings, 51 chunks, 186.1 k instances (attachments
> 17.7 k → 15.8 k). Kit: 55 assets, 21.7 MB GLB, every asset on the v2
> collision frame, all seven new trees with billboards.
>
> ### Round 5 (2026-08-31) — the round-4 feedback fixes + the rest of Phase 10
>
> Delivered against the "Round 5+" plan below, in one batch. Defect → root
> cause → fix:
>
> - **A1, flat leaf cutouts right beside the player** (uplands 1.59 E /
>   1.63 S). Reproduced by decoding the chunk-3,3 bundle at that coordinate:
>   the near field is `gkbfallforestshrub02`, a **273-triangle** shrub. TWO
>   independent causes, both fixed:
>   - `lodRatios` are PROPORTIONS. 0.12 of 273 tris is ~33 — a collapsed
>     cross-plane, so "upgrading" the LOD changed nothing visible. The kit
>     builder now applies an absolute floor (`MIN_LOD_TRIANGLES = 300`);
>     meshes at or below it keep full geometry at every level.
>   - `lodDistances` was `max(12, h×6)`: a 2.15 m shrub got 12.9 m of full
>     mesh and became a flat card at 33 m. Floor raised to 24 m
>     (`MIN_MESH_LOD_REACH_M`).
> - **A2, rocky volumes: open backs, nesting, no slope alignment.** Four
>   confirmed causes, all in the placement rules, none needing a per-spot
>   patch:
>   - the mesh is `moss_rockcliff01`, a 9.9 m **open-backed cliff-face
>     dressing shell** (doubleSided, collision `none`) used as a freestanding
>     boulder. Freestanding scatter now runs on **five closed vanilla
>     boulders** — `rockl04/rockl02/rockm03/rockm02/rocks03`, chosen by
>     building a throwaway probe kit and measuring them (convex collision,
>     single-sided, 1.47–5.96 m). The shell survives only as
>     `cliff_dressing()`: steep ground (new `Layer.slope_deg_min`, 28°),
>     laid into the hill.
>   - **no terrain alignment existed at all** — rocks took random yaw and a
>     ±4° tilt. New `Layer.align_to_slope` + `terrain_aim()` (finite
>     differences on `fields.height`, so every caller already supplies it):
>     yaw from the downhill azimuth, tilt toward the terrain normal.
>     **Trees must never get this** — they grow vertical, rocks lie with the
>     ground.
>   - rock layers stamped **no clearance**, hence the rock-inside-rock. The
>     new size ladder stamps big-to-small.
>   - rocks classed as *plants* in `composition.py`, so a 9.9 m shell got a
>     0.05 m sink. New `rock` size class + per-species depths (~12 % of mesh
>     height, measured).
> - **A3, the hovering spiky root.** Owner ruling overrides the mined
>   convention: tramaroot01/06 retagged **standalone, ground-anchored**,
>   removed from the attachment lists. Their pivot is at the arch CENTRE, so
>   the sink is deliberately small (0.10/0.15 m) — the class default would
>   swallow the arch whole. Also fixed the bug this exposed: `_hosts_for`
>   resolved the **`cliff-face` token to the TREE host list**, so anything
>   the sources hung on rock was silently hung on trees.
> - **A4, jungle reads open, not jungly.** Measured before tuning, as the
>   plan asked. The tall layers were not being filtered — **they did not
>   exist**: the region's tallest species was `gkbjungletreenew12v3` at
>   **7.91 m**, canopy-scaled to 4–9 m. There was no roof to be under.
>   Fixed by adding three genuinely tall species picked on measured heights
>   (probe kit again, not by name): `gkbjungletreenew17v2tropical` 14.41 m,
>   `19v3` 13.88 m, `21v3` 11.41 m — all with base pivots and billboards.
>   (`30v3` is taller at 15.95 m but its pivot sits 4.75 m above its base —
>   the "tiptoe tree" shape — so it was rejected.) The sub-canopy was trimmed
>   to hold the tier at the ecology target (~216/ha authored, was ~211), so
>   the roof is bought with HEIGHT, not with more instances. Delivered:
>   **11.1 k tall trees across the exemplar rings**, 22 % of all jungle
>   instances.
> - **A5, dark distant cards.** The documented lever pulled:
>   `BILLBOARD_BRIGHTNESS = 1.25` on the card material at kit load. One named
>   constant — the next tune is a one-line change. Owner judges the value.
> - **B1, wind.** `packages/game-core/src/fx/windSway.ts` (a package, not the
>   app — 0038 addendum), fed from the weather system's published
>   `windDirXZ`/`windSpeedMS`, so plants gust with the same air the sky, rain
>   and waves read. Height-weighted bend, per-instance phase, length-preserving
>   correction, distance fade, **no sway on the billboard tier**. The
>   shadow-sync trap is handled by `applyWindSwayWithShadow`, which patches the
>   colour material and its `customDepthMaterial` twin from ONE call site with
>   ONE shared uniform block — patch only the first and every shadow stands
>   still while its tree moves. Detail (per-leaf) bending is deliberately not
>   implemented: our meshes carry no authored vertex colours to drive it.
> - **B2, GPU micro-lab: CUT** per the owner. Module 65 rewritten: the M2 Air
>   playtest IS the budget measurement, and **every hand-off must now ask for
>   an FPS read** or the budget silently stops being measured.
> - **B3, solidity.** The kit had shipped `collisionCapsule` on all 17 trees
>   since round 1 with **nothing consuming it**. Rocks had no shape recorded
>   at all — the kit builder now emits a `collisionBox` proxy for
>   convex-collision assets. What is solid follows the source games and lives
>   in `packages/game-core/src/physics/floraSolids.ts` as pure functions over
>   the kit manifest (so a species added to a palette next month gets the
>   right answer without a hand-kept list): trunks, boulders and root arches
>   solid; reeds, ferns, grasses, mushrooms, lily pads, groundcover and the
>   open-backed shell walk-through. `VegetationColliders` spawns a moving
>   45 m / 96-body ring of fixed Rapier bodies — whole-chunk colliders would
>   be thousands of bodies for a forest crossed in a minute. Count is on the
>   HUD (`solid N`).
> - **B4, scree/gravel** (subagent): `volcanictundragravel01`, screened
>   NUMERICALLY against the owner's round-6 "stripy rock" warning (row/column
>   mean-std ratio 1.06, against 2.78 for the in-use slab and 4.85 for the
>   banned texture; threshold <1.5 recorded in the research doc). Driven off
>   Phase 6b's EXISTING talus signal rather than a new slope threshold —
>   `sculpt.py`'s repose constants are now named (`TALUS_TAN`,
>   `TALUS_FULL_TAN`) and imported by `landcover.py`; scree paints the
>   accumulation side (`prom < 0`) inside the repose window in regions 1–2.
>   Dominant on 3.3 % of the province, secondary on 6.3 %.
> - **B5, settlement/interior mining** (subagent) — see its research doc; the
>   Phase 11/12 prep tables live under `world/sources/placement/`.
> - **B6, `Skyrim.esm` cross-check** (subagent). The esm is in the vault and
>   the **vanilla pool is now registered** (0 → 8,620 rows with editor ids and
>   dimensions); credited in the root README. **Headline: vanilla REGN ships
>   EMPTY** — 317 regions, 69 with an object-generator block, every RDOT table
>   zero bytes, no region grass. Bethesda hand-places statics and runs grass
>   off painted textures only, which settles rule R11 and confirms module 65's
>   two-tier split. Deltas are RECORDED, NOT APPLIED (the plan's instruction),
>   and are the obvious next round's work; full list and confidences in
>   `docs/research/vanilla-skyrim-esm-placement-crosscheck.md`. The three
>   worth acting on first: **(D1)** our zero-tilt/uniform-yaw habits are the
>   *mod's*, not Bethesda's (vanilla tilt median 5.8°, p95 28.7°) — this
>   round's rock alignment moves the right way and the same should reach
>   plants; **(D2)** the T3 grass ladder was measured off Tropical Skyrim's
>   retune, and the true vanilla spread is ~2.5×, not 12×; **(D3)** Bethesda
>   ships an **underwater groundcover tier** and we have none — a bigger gap
>   for a swimming-heavy province than it was for Skyrim.
>
> Recompiled: six rings, 51 chunks, **184.6 k instances** (round 4: 198 k —
> the drop is the tramaroots leaving the attachment pass, 29.2 k → 17.7 k
> attachments). Budget hot spot to watch: **chunk 6,9 at 12,017 instances**,
> and it is *pre-existing* dense understory (esloebush/braken/tropicalplant
> clump companions), not the new canopy.
>
> ### Round 4 worldgen (2026-08-31) — rebalance applied; mangrove forest; coastal gradient; guild knob
>
> - **Region rebalance APPLIED to the deployed rasters** (8c closed, so the
>   Q4 gate lifted): `compile_hydrology` re-run against the RAW vault
>   `heightfield-f32.npy` (0032 warning — never `province-refined/`).
>   Verified with `report_regions` (its STEP was fixed 4→3 to match the
>   bake): **wetland 37.0 % of land, dry 55.2 %** (was 20.6/72.0). Scatter
>   recalibration on the exemplar rings: per-chunk totals within ±10 % of
>   the deployed round-3 build (179.2k→178.1k over the common 42 chunks) —
>   no generator retune needed. Jungle chunks still peak ~8.2k instances
>   (pre-existing; the module-65 budget probe remains the open risk).
> - **Mangrove forest = region class 14** (owner-approved; real-world rules
>   in [mangrove-coastal-ecology.md](../research/mangrove-coastal-ecology.md),
>   canon wall near Lilmoth in lore/regions/murkmire.md): the flat
>   (<8°), strongly saline (≥0.30), SHELTERED (open-sea exposure < 0.55,
>   the 0032 storm construction), non-rock tidal fringe within 700 m of the
>   sea — and it extends ~60 m over the adjoining <2 m shallows, so the wall
>   stands IN the intertidal. 3.6 % of land incl. shallows (~0.9 % dry-land).
>   Palette 14 (`build_palettes.py`): waterline mangrove wall, closed
>   low-diversity interior over prop-root clusters, near-bare floor,
>   landward palm transition, brackish aquatics, **no lilypads** (saline).
>   Danger base 2.1 (society.py). **The wall lands on the Lilmoth approach:
>   best exemplar chunk 7,14 (29.6 % mangrove; centre ≈ 3.51 km E,
>   6.78 km S — 600 m from the Lilmoth anchor); densest overall is the
>   eastern estuary 11,7–11,9 (43–51 %, ≈ 5.38 km E, 3.5–4.5 km S).**
> - **Coastal influence is now a graded FACTOR** (research doc §4): new
>   compiler field `coast_m` (signed distance to the OCEAN, from the region
>   raster) + per-layer `coast_m` gate and `coast_boost_gain`/
>   `coast_half_width_m` response; `apply_coastal_gradient` in
>   `build_palettes.py` maps species → salt behaviour (strand/kelp/mangrove
>   mix in near any coast, freshwater forest fades over ~0.5–2 km, lilypads
>   nearly obligate-fresh). Beaches stay bare via ground-cover (R10), not
>   this gradient.
> - **Guild exclusivity softened — schema knob `guild_off_share`**
>   (round-3 owner steer landed: edges must never be bare). A losing guild
>   layer keeps that fraction as baseline instead of vanishing; reed layers
>   set 0.45, lilypad/kelp/drowned-thicket stay 0 (exclusive extras).
>   Owner's bare bank (~2.72 km E / 5.25 km S): chunk 5,12 reeds 8→209,
>   5,11 336→531.
> - **Composition passes (rules C1–C5) + bundle v2** (mining doc
>   [vegetation-composition-rules.md](../research/vegetation-composition-rules.md),
>   machine form `world/sources/placement/composition-rules.json`; new module
>   `worldgen/composition.py`, wired into `compile_scatter`):
>   - **Pivot anchoring + sink (C1/C2)** — bbox-min anchoring is dead. Per
>     instance the compiler bakes a sink (per-species mined p50 flat depth,
>     class slope term over 10°, ±50 % jitter, class cap) and the bundle is
>     now **v2**: 28-byte species header (`index,count,scaleLo,scaleHi,
>     sinkLo,sinkHi,anchorMode`, `<IIffffB3x`), 17-byte instances (`<3f5B`,
>     fifth byte = quantised sink). Anchor modes: 0 pivot-to-terrain
>     (renderer: `ground(x,z) − sink`, NO bbox lift), 1 water-surface
>     (`y` is the absolute water-surface elevation — do not re-ground,
>     lilypads), 2 attached (`y` absolute up a host — vines/moss/tramaroots).
>     **The studio renderer must be updated to v2 before recompiling into
>     `public/` — a v1 reader hard-fails on the version field.**
>   - **Attachments (C3) are ACCENTS** — hangingvines/moss/tramaroot layers
>     never free-scatter; they spawn on placed hosts (JSON host lists;
>     generic "tree-canopy" resolves to every real tree species) at mined
>     attach heights. The spawn is a per-host PROBABILITY, not the layer's
>     authored density: rates live in `composition-rules.json`
>     `attachmentSpawn.perHostProbability` (tramaroot01-on-tropicalplant01
>     0.4 = its mined co-occurrence; the zero-precedent vines/moss 8–12 %
>     defaults) × `regionHumidityMultiplier` (rootland/swamp 1.2–1.4, dry
>     uplands 0.15–0.25). No species dropped: all five zero-precedent
>     meshes have plausible host mappings (moss_rockcliff01 and manfern
>     stay standalone per the JSON).
>   - **Cluster-parts (C4)** — the seven mid-storey bush species spawn as
>     clump templates: anchor + 1–4 companions from the mined companion
>     sets within 2 m, sunk 0.5–1.6 m; layer densities pre-divided by the
>     mean 3.5 pieces so totals stay authored.
>   - Exemplar-ring compile (TEMP dir): **186.3k instances over 45 chunks
>     (+4.0 % on the 179.2k round-3 deployed)** — 45.7k clump companion
>     pieces, 29.2k attachments (vines1 6.2k, moss03 6.2k, moss02 5.0k,
>     tramaroot01 4.1k, tramaroot06 3.4k, vines2 2.2k). A density-driven
>     first cut over-delivered 96k attachments (+41 % total) and was
>     replaced by the per-host rates above; tune those, not code, if the
>     budget probe or the owner objects.
> - **Round 4 renderer/kit (same day)** — the round-3 leftover defects,
>   root-caused:
>   - **Solid grey slab billboards**: the `_lod_flat` cards all UV a tiny
>     rect of ONE shared `tamrieltreelod.dds` atlas — and the kit was baking
>     **vanilla Skyrim's 1024² atlas instead of BM&V's 4096²** (exact-path
>     texture resolution preferred vanilla's archive), then
>     `textureMaxSize: 256` shrank it to ~6–25 texels per species.
>     `build_kit.py` now tries each source pool fully before the next, and a
>     new `billboardTextureMaxSize` (1024) exempts billboard atlases.
>   - **Uplands slab that never resolved**: `vurt_shroom_big1`'s stem names
>     `vurt_shroomstem.dds`, which NO archive ships — untextured at every
>     LOD. New same-stem texture fallback binds the moss variant; the
>     rebuilt GLB has zero untextured primitives, and `vet_kit.py` now flags
>     texture-less primitives and non-MASK flat cards.
>   - **LOD downgrade**: confirmed working (the 48 m rebuild recomputes all
>     buckets from current distances) — no fix needed.
>   - **Stark dark distant trees**: dominated by the mushed atlas above;
>     plus cards no longer `receiveShadow` (a CSM cascade blacked whole
>     up-normal quads) and `floraKit.ts` drops any card whose material lost
>     its texture (falls back to the last decimated mesh). If cards still
>     read dark, the next lever is a brightness factor at kit load — owner
>     judges first.
>   - **Squared wet-ground edges** (`groundWetness.ts`): nearest-texel water
>     level vs vertex-interpolated height flipped whole far-LOD triangles;
>     now per-pixel bilinear decode + two-octave noise on the band.
>   - **Bundle v2 wired in the renderer** (`vegetationBundle.ts`,
>     `Vegetation.tsx`): per-species anchor mode — pivot-to-terrain species
>     place at `ground − sink` (bbox `anchorYM` lift removed from
>     `floraKit.ts`), water-surface and attached species keep their baked
>     absolute Y (never re-grounded).
> - Central recompile DONE (this round): six rings incl. mangrove **7,14**,
>   51 chunks dressed, 198k instances, mangrove forest 176/ha led by real
>   mangrove trees; gates green.
>
> ### Round 3 (2026-08-30) — owner round-2 playtest feedback, all root-caused
>
> Density/haze/shadows/marsh-read all PASSED. The defect set and fixes:
>
> - **"Cardboard cutout" plants up close** (jungle 7,8; hills 3,4): THREE
>   stacked causes in `Vegetation.tsx`/`floraKit.ts` — (1) LOD was chosen per
>   468 m CHUNK from its centre, so whole chunks (including plants beside the
>   camera) ran on their `_lod_flat` cards → now per INSTANCE; (2) LOD froze
>   at chunk-arrival focus, so walking never upgraded it → rebuild every 48 m
>   of movement; (3) cards rendered black because a flat card's geometric
>   normal faces away from the sun half the time (research §4.1 cause 3) →
>   billboard normals bent straight up at kit load.
> - **Floating roots/plants** (tramaroots 5,11; manfern): the kit records
>   `originOffsetM = -bboxMin` (pivot height above base) and NOTHING consumed
>   it; plus baked Y comes from the compile raster which can sit ~1 m off the
>   rendered mesh on banks. Fix: renderer re-grounds each instance from the
>   streamed terrain (`terrainHeight.ts`, shared with Groundcover) and
>   bottom-anchors by `anchorYM` from the manifest. Species with garbage
>   bounds (algrass03b, geometry ~83 m from pivot) are skipped as `suspect` —
>   replacing them is a sourcing job. **New vetting tool**:
>   `pipeline/vet_kit.py` flags bad pivots/degenerate/stray bounds from a kit
>   manifest BEFORE a species is chosen for a palette — run it when
>   shortlisting.
> - **Reed mini-clusters / bare banks**: `aquatic_reeds()` shore band
>   −30..+6 m (was −25..+3), clumps 18 @ 9.5 m (was 10 @ 5 m), reed rates
>   ~1.6×; `RIPARIAN_WET` gain 1.1→1.35; `bank_wall()` ~1.4×; T3
>   `vurt_reeds` +30 %. Exemplars recompiled (reeds 2.1×, bank shrubs 3.1×
>   in 5,12+4,10). Guild exclusivity left hard (softening it needs a schema
>   knob — owner steer if edges still gappy in guild regions).
> - **Walk-mode lag**: first quality slice — `packages/game-core/src/core/
>   quality.ts` presets (low/med/high: veg draw scale + chunk ring, T3
>   radius/budget, dpr cap), injected as props (no globals); character view
>   defaults MEDIUM, HUD dropdown + `?q=`. Fly modes untouched.
> - **Minimap in walk mode**: `packages/game-core/src/hud/minimap.ts` (math)
>   + `character/Minimap.tsx` (blits the province map canvas); click toggles
>   local/province view.
> - Weather items fixed alongside (not vegetation): cap-cloud slab
>   (`WorldSky` read the ungated `whiteoutBase`), wider airmass wander +
>   stronger burn-off, moonless-night starlight floor (`lightRig.ts`).
>
> ### Round 2 (2026-08-30) — what changed and what's still open
>
> Owner round-1 feedback (sparse jungle, plants missing on foot, no shadows,
> black distance blobs, no haze) was root-caused as SYSTEM defects; the fix
> set: character-mode mount, aerial-haze/CSM patch chain + instancing-aware
> fog, leaf-shaped shadow depth materials, texture RGB dilation + shader
> mip-alpha boost, **T3 groundcover ring** (`Groundcover.tsx` +
> groundcover-province-v1 kit), **T4 `_lod_flat` billboards + per-species
> draw-distance cull**, the **meso scene layer** in the compiler
> (shore-distance field, altitude/shore/glade bands, signed riparian boost,
> per-tile water guilds), a **double-rolled soft response** fixed in the
> sampler (density under-delivered ~2x), trunk-scale (not crown-scale)
> canopy clearance, and **evidence-based palettes v2 generated by
> `build_palettes.py`** from the three research docs.
>
> Calibration note: the mined CoV target (2.3–3.1) was reinterpreted — it
> came from a 100/ha placed-statics world with a bare-by-omission understory;
> at v2 densities the character comes from STRUCTURED variation (treefall
> gaps, green walls, guild patches, riparian bands), not raw noise. Judge
> variation by eye against those features, not by chasing CoV 3.
>
> Still open, in the order I would take it:
>
> 1. **Wind** — one uniform block owned by the weather system (module 55
>    §98); 8c is closed, so this no longer collides. Remember the shadow
>    depth materials must mirror the vertex bend (research doc §c).
> 2. **Budget measurement** — the dense-vegetation micro-lab (§85.3): v2
>    density × a real GPU / mid device has still never been measured.
> 3. **Tree colliders in character mode** — the kit ships collision capsules;
>    the player currently walks through trunks (10b-adjacent).
> 4. **Scree/gravel ground material** deferred from 6b; settlement/interior
>    mining for Phases 11–12 (same readers, `Plugin.interior_cells`).
>
> Also outstanding: the **scree/gravel ground material** deferred from 6b, and
> the settlement/interior mining for Phases 11–12 (same readers,
> `Plugin.interior_cells`).
>
> ### Blocked, not forgotten
>
> - ~~The region rebalance is not applied to the deployed rasters~~ —
>   **APPLIED, round 4 worldgen (2026-08-31), see that section above.**
> - ~~`Skyrim.esm` is still not in the vault~~ — **owner downloaded it
>   2026-08-31** (to `elder-scrolls-asset-pipeline/skyrim-source/`); the
>   cross-check is item B6 of the Round 5+ delivery plan below.

## Round 5+ — DELIVERY PLAN for the rest of Phase 10 (authored 2026-08-31)

Written by the planning agent for the delivering agent. If you were told to
"deliver the rest of Phase 10", this section is your work order. Read the
RUN-BOOK box above first (the loop, the feedback table, the five traps), then
work through Part A, then Part B. The root causes below were established by
code reading on 2026-08-31; verify each briefly before building on it, but do
not re-derive from scratch.

**Delivery shape (owner ruling 2026-08-31): deliver EVERYTHING in one pass,
then hand the owner ONE batched playtest checklist** in plain English (what
to look at, where, how to feed back) — no intermediate playtest rounds.
Small commits, gates green each commit, push when delivered; run `pytest`
from `tooling/world-generation` and `tooling/asset-pipeline` whenever you
touch the Python side.

**Fan out subagents where it helps (owner-approved).** Spawn subagents at
**low effort** for parallelisable or self-contained items — B5 (interior
mining) is pure offline data work and should run in parallel with the
rendering work from the start; B6 likewise; diagnosis reproductions (A1)
and registry queries are also good candidates. Keep the tightly coupled
renderer/kit work (A1/A5/B1 all touch `floraKit.ts`) in one pair of hands
to avoid conflicts, and remember concurrent agents share this worktree —
pathspec-only commits.

### Part A — round-4 feedback fixes

**A1 — plant cutouts that never upgrade near the player** (owner screenshot:
flat dark leaf-shaped cutouts lying against the ground right beside the
player at 1.59 km E · 1.63 km S, uplands — the owner was standing
**directly next to them**, so a too-short LOD ring distance alone cannot
explain it: at ~0 m the instance should select level 0). Diagnose first:
reproduce at that coordinate (probe URL params in the run-book) and identify
the species and level actually drawn. Candidate causes, in likely order:
- **Level 0 itself is degenerate for that species** — kit-build side. The
  decimation config (`lodRatios: [0.35, 0.12]` in
  `tooling/asset-pipeline/pipeline/config/kits/flora-province-v1.json`) has
  no minimum-triangle guard, and several plant sources are tiny (6–128
  tris); check what the kit actually holds for the culprit species at every
  level — if all levels collapsed to cross-planes, "upgrading" changes
  nothing visible.
- **It's the one non-tree billboard, `gkbfallforestshrub02`**, drawing its
  flat card even up close (an eligibility/selection bug in
  `Vegetation.tsx:237-283`), or its card reading as an unlit dark shape via
  the bent-to-up normals on a bright slope.
- **The LOD rebuild isn't firing** — rebuild triggers on ~48 m focus
  movement (`Vegetation.tsx:127-131`); check the instance's assigned level
  actually updates as the player approaches.
Fix whatever the reproduction shows at the root (kit builder guard,
selection logic, or rebuild trigger — not a per-spot patch), and take the
cheap hardening anyway: minimum-triangle floor in the kit builder (small
meshes just keep their full mesh at all levels) and a higher
`lodDistances` floor for short species (`floraKit.ts:207`,
`reach = max(12, h*6)` is only 12 m for a 1 m plant). Rebuild kit + bundles
per the run-book. Success test: at the screenshot coordinate every plant is
a real mesh well before you reach it, and degrades again as you leave.

**A2 — rocky volumes in uplands: open backs, nesting, no slope alignment**
(owner screenshot: looking *into* the hollow open side of a large rocky
volume with a second one placed inside it). Root causes, all confirmed:
- The mesh is `bmv:landscape/rocks/moss_rockcliff01` — a 22.7 m-tall
  **open-backed cliff-face dressing shell** (doubleSided, collision "none"),
  authored to be embedded in a cliff, being placed as a freestanding boulder.
- Rocks get random yaw + ±4° random tilt only — `scatter.py:570-581` has
  **no terrain-normal alignment at all**.
- The rock layer sets no `clearance_radius_m`, so rocks freely
  interpenetrate (the nested pair).
- Rocks fall into the *plant* size class in `composition.py:_size_class`,
  so a 22.7 m shell gets a 0.05 m sink.
Fix as a placement-rules job: (1) query the asset registry for genuinely
closed rock/boulder meshes in the vault (BM&V and vanilla ship many); use
those for freestanding scatter, and restrict `moss_rockcliff01` to
steep-slope placements where its open back faces INTO the hill — which needs
(2) a slope-aware orientation option on `Layer` in `scatter.py` (yaw from
the downhill azimuth + tilt toward the terrain normal), a mechanism trees
must NOT get (trees grow vertical; rocks lie with the ground). (3) Give the
rock layers a clearance radius so they stop nesting, (4) add a `rock` size
class in `composition.py` with a sink proportional to mesh height (bury the
base properly, more on slopes). Success test: the screenshot
spot — no visible open backs, no rock-inside-rock, bases buried, long axes
roughly following the slope.

**A3 — the "big curved spiky root" (tramaroot) hovering in the air.** Owner
is right about the cause: `tramaroot01`/`tramaroot06` are tagged
`class: "attachment"` in `world/sources/placement/composition-rules.json`
with `attachHeightM` up to ~10 m, so they get hung on host trees at height.
Owner ruling (round-4 feedback): **the trunk base must always be
ground-anchored** — it should read as growing out of the ground. Retag both
as `standalone` with pivot-terrain anchoring and a modest mined sink; remove
them from the attachment lists. While in there, fix the adjacent confirmed
bug: `composition.py:_hosts_for` resolves the `cliff-face` host token to
`self.tree_hosts` (trees!) — either implement real cliff-face hosting or
drop the token from the data so nothing silently hangs on the wrong host.
Recompile and eyeball via probe; success = every tramaroot base at terrain
height.

**A4 — tropical jungle reads open, not jungly.** The undergrowth and
micro-variation are approved — do not touch them. What's missing is the
**tall closed canopy overhead**: the region reads as clumps of small bushy
trees + occasional palms, and the owner reports (2026-08-31) that exploring
on foot they find **no tall trees or tall canopy anywhere in the region at
all** — so before tuning densities, check whether the tall layers are even
*delivering*: compare authored vs delivered per-species counts in
`compile_scatter --report` for the jungle chunks (the emergent/canopy layers
may be silently filtered — slope/clearance/water masks, species missing from
the kit, or a species list that simply tops out short). Then work only in
`REGIONS[13]` in
`build_palettes.py:312-346`: strengthen the `emergent`/`canopy` archetype
layers with genuinely tall species (query the registry for the tallest
suitable jungle/tropical trees in the kit — add species and rebuild the kit
if the current list tops out short), raise canopy density and scale toward
closure, and check the strata targets in
[tropical-vegetation-ecology-targets.md](../research/tropical-vegetation-ecology-targets.md)
— the aim is undergrowth beneath a mostly-closed roof of tall trees, with
the existing treefall-gap band providing the light wells. Watch the budget:
jungle chunks already peak ~8.2k instances; prefer taller/larger canopy
trees over more trees. Verify closure from the overhead jungle probe
scenario (canopy coverage should visibly dominate) and report the per-chunk
instance delta from `compile_scatter --report` in the hand-off.

**A5 — distant cards still a touch dark in clear air: pull the lever.** The
documented next lever (round 4, below): a brightness factor at kit load.
Implement it in the `isBillboard(mesh)` branch of `buildFloraKit`
(`floraKit.ts:122-138`): clone the material, scale `color` up by a named
constant (start ~1.25; it multiplies the card's texture, which bakes in
shadowed foliage — that's why cards read dark in bright air). Keep it one
obvious constant with a comment naming the owner feedback that sets it, so
the next tune is a one-line change. Owner judges the value on the deployed
build.

### Part B — the "left for Phase 10" items

**B1 — wind sway.** Owner: yes. The weather system
already publishes `windDirXZ` + `windSpeedMS`
(`packages/world-weather/src/express.ts:112-113`). Recipe is already
researched: [vegetation-scatter-instancing-threejs.md](../research/vegetation-scatter-instancing-threejs.md)
§wind (two sines + shared scrolling noise, amplitude by height above base so
trunks stay planted, distance fade). Implement as a vertex-shader injection
via `onBeforeCompile` — and **the shadow-sync trap is the whole game**:
flora casts shadows through a separate `customDepthMaterial`
(`floraKit.ts:156-168`), so the identical displacement, uniforms and clock
must be injected into BOTH materials or shadows detach from their trees.
Note `Vegetation.tsx`/`floraKit.ts` living app-side is recorded debt under
the packages rule: if this work substantially rewrites them, extract to a
package rather than growing them in place; if it's a light touch, a package
module consumed by the app is enough. Billboards should not bend (they're
distant; at most a
subtle uniform sway — try none first). Groundcover (`Groundcover.tsx`) gets
the same treatment but casts no shadows, so it's the easy half. Gate: no
visual probe can judge motion — hand to the owner with "watch a tree in
wind, then check its shadow moves with it; find a storm via the weather
debug controls".

**B2 — GPU micro-lab probe: CUT (owner decision, 2026-08-31).** The owner
has been measuring the real thing — the deployed studio on an M2 MacBook
Air (their feedback that the 'low' preset performs best IS the budget
measurement, on real target hardware; a SwiftShader probe on this GPU-less
VM predicts nothing). Do not build the probe. Instead: remove the micro-lab
from module 65's open-risk note, record the M2-Air-playtest calibration as
the budget evidence, and keep asking for an FPS-feel read in each playtest
hand-off so the budget stays measured.

**B3 — solidity: tree, rock and large-plant colliders.** The kit
already ships `collisionCapsule` on all 17 tree assets; **nothing consumes
them** (the only references are the writer in `build_kit.py:364` and the
type in `floraKit.ts`). Build a per-instance collider spawner next to
`ChunkColliders.tsx` using the same focus-ring pattern: nearest instances
from the loaded bundles get fixed Rapier colliders (capsules for trunks),
created/dropped as the ring moves — colliders for the few dozen nearby
instances, never for whole chunks. What is solid follows the source games
(reason from Skyrim/Morrowind, per the owner): tree trunks, rocks and
boulders solid; shrubs, ferns, grasses, reeds, mushrooms, groundcover,
lilypads walk-through; the tramaroot arches solid (they already carry
`collision: "convex"` — a capsule approximation per arch is fine). Rocks
need shapes added in the kit manifest first (the builder's dropped-shapes
path is the place). Success:
you can't walk through a trunk or a boulder, you CAN wade through reeds,
and walking a dense exemplar stays smooth (report collider counts in the
hand-off).

**B4 — scree/gravel ground material.** Genuinely new — nothing
parked, no TODO exists. Add a scree/gravel material in
`build_ground_materials.py` (source a suitable texture from the vault —
BM&V or vanilla; heed the owner's round-6 warning at `:122-123` about
anisotropic "stripy" rock textures) and apply it where the terrain already
says talus/steep-debris in the uplands/mountain belts. Modest scope: one
material, sensibly mapped; it's a ground-truth read ("mountainsides stop
being bare height-tint"), not a new system.

**B5 — settlement/interior mining (prep for Phases 11–12; run in parallel
via a subagent from the start).** Pure data work with the existing readers:
`esp_index.interior_cells(with_refs=True)` plus the REFR machinery, over
BM&V (and any settlement-relevant source mods in the vault). Mine what
Phases 11/12 will actually ask for: per-interior kit-piece assembly stats
(which STAT/furniture pieces co-occur, snap offsets/rotations between kit
pieces, room dimensions, clutter density per room type) and
settlement-level stats (building counts/spacing, orientation to roads and
water). Deliverables: machine tables under `world/sources/placement/` (or a
sibling), a `docs/research/` doc recording method + headline numbers, and
pointers added where Phase 11 will look (module 70 / docs README router).
No renderer work, no placement changes.

**B6 — `Skyrim.esm` cross-check.** The owner ran the Steam download on
2026-08-31, so the esm should now be at
`~/workspace/elder-souls-dev/elder-scrolls-asset-pipeline/skyrim-source/`
(verify; move/register it per the vault conventions). Mine REGN object
tables + GRAS density params with `esp_index` as a cross-check against our
mined rules, and record deltas worth acting on in the round record. Good
subagent candidate, parallel with B5.

### Wrap-up

Record what shipped as a round section here (defect → root cause → fix,
same style as rounds 1–4), keep PROGRESS.md's row and *Waiting on user*
current per its protocol, update the docs the work touched (module 65
budget note, docs README router if files were added), and leave ONE batched
playtest checklist for the owner in PROGRESS covering everything above
(including an FPS-feel ask, per B2). What remains of Phase 10 after this
plan is owner sign-off; the phase closes on their say-so, with leftovers
routed to [polish-backlog.md](../polish-backlog.md).

---

**Date:** 2026-08-30 · **Status:** **accepted** — owner answered Q1–Q4 the
same day; Q5 and Q6 stand on the recommendation. Each question below records
the answer and what was built from it.

Context: the owner asked for the catalogue and the data-file mining first,
then to be involved in "finalising key decisions about actual placement".
The machinery was built and the numbers taken; these were the calls it waited
on.

Evidence behind every number: [the mined placement rules](../research/shipped-world-placement-rules.md),
[the density research](../research/vegetation-density-design.md),
`world/sources/placement/`, `world/sources/assets/`, `world/sources/flora/`.

## Answers at a glance

| | Decision | Built |
|---|---|---|
| Q1 density | **Match the reference — but graded by local geography and varied within each area** | density derives from our own climate fields (13× spread); shared openness field + per-species patchiness at the measured wavelengths |
| Q2 tree scale | **Mostly near-native, plus a few landmark giants** | canopy at 0.5–1.25×; one ×1.8–2.6 giant per 8–16 ha with wide clearance |
| Q3 contrast set | **The proposal *plus* deep rootland marsh** — five areas | recorded below; drives the Phase 10/11 exemplar work |
| Q4 region mix | **Rebalance the map — make more of it marsh** | marsh now follows saturation: wetland 20.6 % → 35.9 % of land. *Code only — not yet applied to the deployed rasters* |
| Q5 groundcover | no answer needed; recommendation stands | bare ground stays bare |
| Q6 `Skyrim.esm` | no answer yet | still an open ask in PROGRESS, still not blocking |

---

## Q1 — How dense should Argonia feel?

The menu as it was put, measured on five representative chunks (a chunk is
468 m square, 21.9 ha). `densityScale` in
`world/sources/flora/palettes.json` is still the single global knob, but the
answer moved the question past it:

| Setting | Instances per chunk (median) | Reads as | Against the references |
|---|---|---|---|
| **×1** (as built at the time) | 806 | sparse — you see between the trees everywhere | below Black Marsh & Valenwood's dressed marsh (~2,190) and below module 65's T2 band |
| **×3** | 2,546 | comparable to the art-directed Black Marsh mod | matches BM&V's dressed median; mid-band for module 65 (1,000–5,000) |
| **×6** | 4,206 | thick — a jungle you push through | top of module 65's band; needs the groundcover ring to be doing real work |
| **×10** | 6,756 | BM&V's *densest* cells everywhere | over the band; the browser-performance question becomes the deciding one |

**ANSWER: match the reference — but it must be local-geography dependent.**
Owner: "Dense jungle areas should of course be much denser than open grass.
Mountain forest should be more dense than a non-forested area. etc. and even
within an area (e.g. within a jungle) there should be sensible variation so
it's not all just samey."

That reframed the question from one multiplier to two properties, and both
are now grounded in the three things the owner named — open-world design
practice, what the reference mod does, and what is realistic for our climate
and hydrology. The full working is
[vegetation-density-design.md](../research/vegetation-density-design.md);
the short version:

- **Graded by geography, from our own fields.** A region's density is
  `850 × humidity² × (0.25 + 0.75 × canopy)` out of `regions.CLIMATE`, so the
  ladder falls out of climate rather than being asserted: rootland deep marsh
  818/ha, jungle 767, interior swamp 627, fringe marsh 327, firm lowland 214,
  upland hills 134, bare mountain 61. A 13× spread, in the owner's order.
- **Varied within a region.** The reference's density varies with a standard
  deviation 2.3–3.1× its mean between neighbouring cells, decorrelating by
  ~60 m and gone by ~200 m. A shared openness field (90 m glades) plus
  per-species patchiness (190 m stands) reproduces that.
- **Calibrated against the source**, on the statistics measured identically
  on both sides: open-space radius p75 21.3 m (mined 21.1), p95 32.3 (31.5).

Honest caveat, unchanged: nothing has been rendered yet. Density is the
biggest unretired performance risk in the project (module 65 §109), and the
sequence is *choose a target → build the renderer → measure → adjust*. Per
chunk we now sit at p95 3,946 and max 5,623 instances, inside module 65's
1,000–5,000 T2 band, which is the first evidence that the target is
affordable.

## Q2 — How big should the trees be?

The source pools are deliberately oversized: BM&V's cypress mesh is 32 m tall
at scale 1, and BM&V themselves placed it at ×2 — a 64 m tree. Trama roots go
in at ×8, giving 13 m root arches. Supersizing is how that mod manufactures a
giant-jungle read, and under the no-new-art rule scale is one of the few free
levers we have.

| Option | What the player sees |
|---|---|
| **A — near native (0.6–0.95 on the big trees)** | 19–30 m cypress. Big real trees; the canopy is high but readable, and a person feels human-sized |
| **B — BM&V's supersizing (×1.5–2.5)** | 48–80 m cypress. Alien, monumental, more "Black Marsh is not Skyrim"; the player is small |
| **C — mixed: native for most, a few hero giants** | ordinary swamp forest with occasional 60 m landmark trees you navigate by |

**ANSWER: C — mostly normal, a few landmark giants.**

Built: the ordinary canopy sits at 0.5–1.25× native (19–30 m cypress), and
each forested region carries a `role: landmark-giant` layer at ×1.8–2.6
(58–83 m on a 32 m cypress), roughly one per 8–16 ha, with a 14 m clearance
stamp so nothing crowds the silhouette and no clearance test of its own so
nothing stops it appearing. The design research is emphatic that a world
without quest markers navigates on distant distinctive silhouettes — Lynch's
landmarks — which is exactly what these are for.

## Q3 — The exemplar and its contrast set

Module 95 §85.4 requires each placement phase to propose its exemplar plus 2–3
contrasting instances **for owner sign-off at phase start**. Proposed:

| Role | Where | Why it is the contrast that matters |
|---|---|---|
| **Exemplar** | the Blackrose basin's interior swamp (retained reference watershed, decision 0008) | the province's core case: cypress canopy, standing water, the waterline density peak |
| **Contrast 1** | tropical jungle (region class 13) | the densest class — where the performance budget is actually decided |
| **Contrast 2** | coastal lagoon / salt marsh (class 4) | the mangrove wall canon puts near Lilmoth; salt tolerance and an aquatic tier the swamp does not have |
| **Contrast 3** | upland hills or border mountains (class 1/2) | the sparse, dry end — proves the system does not only know how to make swamp |
| **Contrast 4** (owner addition) | rootland deep marsh (class 6) | the darkest, most Argonian place in the province — permanent dusk under a root canopy, and now the densest class in the ladder at 818/ha |

**ANSWER: the proposal plus deep rootland marsh — five areas.** The owner
took the contrast rather than the trade: uplands stay in as the dry proof,
and rootland joins as the identity case.

## Q4 — What the region map says the province is

The scatter compiler needed region areas and produced this, which is worth a
decision in its own right. Of the province's **non-ocean** area:

| | Share of land |
|---|---|
| firm lowland | 31.6 % |
| border mountains | 26.8 % |
| upland hills | 13.6 % |
| **all marsh/wetland classes together** (tidal delta, salt marsh, deep river, rootland, interior swamp, fringe marsh, floodplain, lake) | **20.3 %** |
| tropical jungle | 7.4 % |

So by the region classing, **Black Marsh is 72 % dry ground and mountain and
20 % marsh**. Canon has the province as an enormous swamp with temperate
grassland only in the north-east.

Three ways to read it, and the owner's call which:

1. **It is fine** — "firm lowland" is the drier ground *between* waterways and
   still plays as swamp-forest once it is dressed. The flora palettes already
   give it bamboo, bracken and jungle trees, so the *look* can be marsh even
   where the class is not. Cheapest option; nothing to redo.
2. **Rebalance the classifier** — retune the Phase 3 region thresholds so more
   of the lowland classes as fringe marsh / interior swamp. Touches an
   owner-approved gate and re-runs downstream compiles, but it is data, not
   geometry: the terrain does not change.
3. **Leave it and decide per region packet** in Phase 15, when each area is
   authored anyway.

**ANSWER: 2 — rebalance the map.**

Built, in `regions.py`: a marsh is low, flat, slow-draining ground that
saturates, not only ground the solve put standing water on. Below 30 m, under
6°, and either within 6 m of the water table or above the topographic wetness
index's pooling threshold. Uplands additionally need drainage (a flat terrace
over a marsh is not a hill) and mountains start at 150 m rather than 40 m.

Result: **wetland classes 20.6 % → 35.9 % of land, dry 72.0 % → 56.0 %**, and
the classes are physically coherent — marsh at 2–4 m elevation and 1.2°, firm
lowland at 20 m and 7.8°, hills at 121 m, mountains at 303 m. The authored
central-jungle polygon had to gain the marsh classes in its
`appliesToClasses`, or the rebalance would have halved the owner's jungle.

What it deliberately does **not** do is flatten the province on paper: 43 %
of the land really is above 30 m and 24 % above 150 m, so a third of it is
genuinely hill and mountain and stays that way. Tests pin both directions.

**Not yet applied to the deployed rasters.** Re-running `compile_hydrology`
also regenerates the climate rasters the 8c playtest is running against, so
the re-run waits until 8c closes — `worldgen.report_regions` measures the
change without writing anything. Once applied, the scatter compile should be
re-run and re-calibrated (`compile_scatter --report`).

## Q5 — Groundcover: sparse-and-legible or wall-to-wall?

Bethesda binds grass to painted ground and never allows more than three species
per ground type; 20 of the 47 mined ground textures allow **no grass at all**
(mined rule R10). `world/sources/flora/groundcover.json` follows that: mud,
silt, rock, roads and seabed are bare, and only 13 of our 37 ground materials
carry grass.

The choice is what "dense" means in the ring: our provisional densities give
6,000–9,000 grass instances per hectare in jungle and marsh grass, against
Bethesda's own ladder (marsh grass 2× forest grass, 12× tundra grass).

Recommendation: **keep bare ground bare**. A reed bed only reads as a reed bed
if the mud beside it is mud. This one is cheap to change later — it is a
runtime ring, not baked data.

## Q6 — Vanilla `Skyrim.esm`

Not a design decision, a five-minute unblock. 41 % of the mined references
point into `Skyrim.esm`, which is not in the vault (only the three BSAs are).
Supplying it names those references, gives the 14,974 vanilla registry rows
their dimensions and editor ids, and settles whether Bethesda's region object
tables are used at all. The command is in PROGRESS; it needs the owner's Steam
login and nothing else. **Not blocking** — the phase proceeded without it.

---

## What is already built and not in question

- the plugin readers, the mining, the 27,929-row asset registry, the kit
  builder (NIF → runtime GLB with LODs, collision proxies and alpha modes),
  the scatter compiler and its probes — all tested and committed;
- the canon flora list is fully sourced: cypress, mangrove, bamboo, sleeping
  palms, palm, bog willow, flint vine, somnalius fern, blue moss canopies and
  the rest all have assets in the permitted pools, and all 40 species in the
  provisional palettes convert cleanly with textures;
- the Xanmeer kit's grid is measured (256 units = 3.64 m, 4.32 m corridors).

## What is deliberately not built yet, and why

The **renderer tiers** (T1 batched heroes, T2 instanced mid detail, T3
groundcover ring, T4 impostors) and the **dense-vegetation micro-lab budget
probe**. Both need to be looked at to be judged, and both consume the answers
above — building them first would mean building them twice.

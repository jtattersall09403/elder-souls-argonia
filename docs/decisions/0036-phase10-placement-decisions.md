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
> - **`Skyrim.esm` is still not in the vault.** Would name ~40 % of the mined
>   references and dimension the 14,974 vanilla registry rows. Owner action,
>   not blocking.

## Round 5+ — DELIVERY PLAN for the rest of Phase 10 (authored 2026-08-31)

Written by the planning agent for the delivering agent. If you were told to
"deliver the rest of Phase 10", this section is your work order. Read the
RUN-BOOK box above first (the loop, the feedback table, the five traps), then
work through Part A, then Part B. All golden rules in CLAUDE.md apply in
full — nothing here overrides them. The root causes below were established by
code reading on 2026-08-31; verify each briefly before building on it, but do
not re-derive from scratch.

**Delivery shape:** two pushed rounds, each ending in an owner playtest
hand-off written in plain English (what to look at, where, how to feed back).
Round 5 = Part A + wind (everything the owner can *see*). Round 6 = colliders
+ scree (things the owner *feels* while walking). B5 (interior mining) is
offline data work — do it whenever a build/probe is running, it needs no
playtest. Small commits, gates green each commit, **push every round** — and
run `pytest` from `tooling/world-generation` and `tooling/asset-pipeline`
whenever you touch the Python side.

### Part A — round-4 feedback fixes

**A1 — plant cutouts that never upgrade near the player** (owner screenshot:
flat dark leaf-shaped cutouts lying against the ground right beside the
player at 1.59 km E · 1.63 km S, uplands). Diagnosis first: reproduce at that
coordinate (probe URL params in the run-book) and identify the species and
LOD level being drawn. Two established facts to test against:
- Non-tree plants mostly have **no billboard card at all** (only 13/40 kit
  assets carry `billboard: true`, all but `gkbfallforestshrub02` are trees).
  At ring 2 they sit forever on the 0.12-ratio decimated mesh
  (`lodRatios: [0.35, 0.12]` in
  `tooling/asset-pipeline/pipeline/config/kits/flora-province-v1.json`, no
  minimum-triangle guard) — a 62-tri bush decimated to 12 % *is* a flat
  cutout, and it never "upgrades" because it is already the mesh.
- The LOD ring floor is tiny for short species: `lodDistances` in
  `apps/world-studio/src/vegetation/floraKit.ts:207` gives
  `reach = max(12, h*6)` — a 1 m plant drops to its worst level 12 m away.
Fix at the root, kit-side and threshold-side, not per-spot: add a
minimum-triangle floor to decimation in the kit builder (never decimate below
a count that holds silhouette — smaller meshes simply keep their full mesh at
all levels; they're cheap), and raise the `lodDistances` floor for short
species so level 0 holds to a sensible walking distance. Also confirm
`gkbfallforestshrub02`'s card behaves (it is the one non-tree billboard; the
flat-against-ground look in the screenshot may be its card with the
bent-to-up normals reading as unlit ground on a bright slope). Rebuild kit +
bundles per the run-book. Success test: walk up to the screenshot coordinate
— every plant resolves to a real mesh well before you reach it, and degrades
again as you leave.

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
base properly, more on slopes). If a new source mod is tapped for rocks,
credits go in root README in the same change. Success test: the screenshot
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
trees + occasional palms. Work only in `REGIONS[13]` in
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

**B1 — wind sway (deliver with Round 5).** Owner: yes. The weather system
already publishes `windDirXZ` + `windSpeedMS`
(`packages/world-weather/src/express.ts:112-113`). Recipe is already
researched: [vegetation-scatter-instancing-threejs.md](../research/vegetation-scatter-instancing-threejs.md)
§wind (two sines + shared scrolling noise, amplitude by height above base so
trunks stay planted, distance fade). Implement as a vertex-shader injection
via `onBeforeCompile` — and **the shadow-sync trap is the whole game**:
flora casts shadows through a separate `customDepthMaterial`
(`floraKit.ts:156-168`), so the identical displacement, uniforms and clock
must be injected into BOTH materials or shadows detach from their trees.
Per the packages golden rule this is game machinery: put the sway
material-patching in a package (e.g. alongside the flora-kit loading code —
and note `Vegetation.tsx`/`floraKit.ts` living app-side is recorded debt; if
this work substantially rewrites them, extract to a package rather than
growing them in place; if it's a light touch, a package module consumed by
the app is enough). Billboards should not bend (they're distant; at most a
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

**B3 — solidity: tree, rock and large-plant colliders (Round 6).** The kit
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
path is the place). Package rule applies to the spawning logic. Success:
you can't walk through a trunk or a boulder, you CAN wade through reeds,
and walking a dense exemplar stays smooth (report collider counts in the
hand-off).

**B4 — scree/gravel ground material (Round 6).** Genuinely new — nothing
parked, no TODO exists. Add a scree/gravel material in
`build_ground_materials.py` (source a suitable texture from the vault —
BM&V or vanilla; heed the owner's round-6 warning at `:122-123` about
anisotropic "stripy" rock textures) and apply it where the terrain already
says talus/steep-debris in the uplands/mountain belts. Modest scope: one
material, sensibly mapped; it's a ground-truth read ("mountainsides stop
being bare height-tint"), not a new system.

**B5 — settlement/interior mining (prep for Phases 11–12; run in the
gaps).** Pure data work with the existing readers:
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

**B6 — `Skyrim.esm` cross-check (only if the owner has run the Steam
command in PROGRESS by then).** If the esm appears in the vault: mine REGN
object tables + GRAS density params with `esp_index` as a cross-check
against our mined rules, and record deltas worth acting on in the round
record. If it isn't there, skip silently — it is not blocking and never
was.

### Wrap-up (same session as Round 6)

Record what shipped as round sections here (defect → root cause → fix, same
style as rounds 1–4), keep PROGRESS.md's row and *Waiting on user* current
per its protocol, update the docs the work touched (module 65 budget note,
docs README router if files were added), and leave the playtest checklist
for the owner in PROGRESS. What remains of Phase 10 after this plan is
owner sign-off; the phase closes on their say-so, with leftovers routed to
[polish-backlog.md](../polish-backlog.md).

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

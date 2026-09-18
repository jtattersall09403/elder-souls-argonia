# 0073 — One copy per pixel; a card is baked from its own mesh; the writer is not the rule

**Date:** 2026-09-18 · **Phase:** 16f round 4 · **Status:** accepted

The owner's fourth walk of 16f (feedback of 2026-09-18, round 4) found trees
fading away and back as they were approached, ground cover and rocks doing
the same, billboards of the wrong shape, rocks hollow and rotated and sunk
wrong, a character clipping into a rock when jumping onto it, a bare sea bed
away from the shore, a slow load; a console full of GL errors under
water. The evidence and the numbers are in the
[16f ledger §17](../research/phase16/16f-ledger.md); this records the calls.

1. **A crossfade draws exactly one copy per pixel, and the two copies test
   complementary halves of the same dither.** Round 3's fade gave both
   copies of a crossing instance the same test (`vEsLod < bayer`), so the
   kept sets NESTED rather than complemented: coverage was `max(s, 1−s)`,
   which bottoms out at **0.5 at the ring midpoint**. Half of every tree,
   plant, rock and sea-bed piece was simply not drawn as the owner walked
   through a ring — read on screen as "it fades to almost invisible, then
   fades back in". The vertex stage now carries both raw smoothsteps
   (`vEsLod = vec2(fadeIn, fadeOutRaw)`, no `1 −`, so the outgoing copy holds
   the bit-identical number the incoming one holds) and the fragment test is
   `bayer >= vEsLod.x || bayer < vEsLod.y`: incoming keeps `{bayer < s}`,
   outgoing keeps `{bayer >= s}` — exact complements, so every pixel carries
   one copy at every distance, in the depth and shadow twins too. The owner offered to
   drop smooth fading entirely for instantaneous swaps; that offer is
   **not taken**, because the exact-complement rule is three lines and keeps
   the dissolve. The rule this enshrines: **a crossfade is a partition, not
   a blend — if the two copies do not provably sum to one copy per pixel, it
   is a hole.** The gate walks every 0.25 m of every ladder against all 16
   Bayer thresholds and was shown failing on round 3's rule.
2. **A tree changes quality; it never fades to nothing inside the loaded
   ring** (owner, round 4). The height-derived draw distance
   (`min(900, max(60, h × 35)) × drawScale`: a 10 m tree gone at 350 m) is
   replaced for land trees by the far corner of the outermost loaded chunk
   (`(ring + 1) × 467.93 × √2` ≈ 1,985 m at ring 2), so the vanish band sits
   beyond anything that exists to draw and a tree is drawn wherever it is
   loaded and unoccluded — as its baked card at range. Terrain occlusion is
   untouched and still culls. The cost is paid entirely in the card tier
   (two quads per instance), never in mesh instances. A related defect went
   with it: at the low preset a 20–28 m tree's level-1 band was squeezed to
   5–6 m, narrower than the 10 m crossfade, so that level never reached full opacity; `lodRings` is now the one source of the ladder and pushes every
   outer ring to at least 10 m past the previous.
3. **A far card is baked from its own mesh; an authored card is never
   trusted because its filename matches.** 34 of 159 flora species wore a
   mod-authored `_lod_flat` quad whose UVs pick a rect of a shared atlas by
   the vanilla tree slot — bound to the mesh by NAME, with nothing able to
   prove the picture was that tree. Measured against each asset's own
   `sizeM`: `hodalder01gkb` wore a different species' card, `scottish-pine22`
   a vanilla pine's, a shrub wore an aspen's; the tree the owner named at
   1.11 E / 5.21 S (`gkbjungletreenew30v3`, 9.1 m) wore a single **27.4 m**
   plane. Under `bakeCards` every asset outside the skip categories now bakes
   from its own mesh and the authored NIF is never extracted; `bakeCard:
   false` is the only opt-out. The gate reads the SHIPPED GLB and requires
   every billboard node to carry this asset's node hash. This supersedes
   round 2's finding that "no card is mapped by a wrong filename": round 2
   removed 11 explicit borrows and accepted the authored cards; the authored
   cards were the defect. **Cost recorded:** the flora kit grew 62.5 → 80.5 MB
   (34 new 512 px tiles); see §5.
4. **A rule that runs correctly in memory is worth nothing if the writer
   destroys it.** 30 % of rocks floated, 25 % exceeded their mined tilt and
   54 % of ALL rocks stood at a yaw of zero with 3,926 open-backed cliff
   shells facing their hollow side outward — while the unit test on the
   open-back rule was **green**, because the rule was right and
   `scatter.encode()` clamped its result. The open-back solve yields
   `downhill + π − back`, usually negative; the quantiser clamped anything
   below zero to byte 0. Three further root causes rode with it: the mined
   `tiltDeg` is the TOTAL off-vertical angle of the placed reference and was
   being applied on top of full slope-following (double-counted, giving 30 m
   shells at 43–70° where the mine allows 23°); the burial rule measured the
   ground plane through the PIVOT rather than the base (over-demanding ~5 m
   on every shell) under a cap below the shells' own mined median sink; and
   `burial()` returned its demand already clamped, so the refusal branch
   could never fire. Now: yaw wraps; `align_to_slope = tiltDeg.p50 /
   slopeDeg.p50` per species from the mine; the base plane is measured at the
   base; and **a rock that cannot be seated is refused, never shipped
   floating** (~9 % of candidates, 20,249 → 18,530 rocks). Floats 30 % →
   0.07 %, over-tilt 25 % → 0, open backs outward 3,926 → 0. The rule this
   enshrines, third instance this phase: **prove the gate on the SHIPPED
   artefact, not on the rule in memory** — `rock_census.py` reads the
   published bundles and was red on five of eight before the fix.
5. **A landing follows the surface the controller is standing on, not the
   terrain under the body.** Jumping onto a boulder drew the character 1.2 m
   INSIDE the stone for the 0.42 s land clip and then popped them out. The
   physics was never wrong (measured: a Rapier capsule dropped onto the rock
   trimesh at 3/6/10.5 m/s sinks ≤ 0.16 m transiently and rests on the top);
   the landing clips are whole-clip `floor-contact`; the studio was feeding that mode the TERRAIN height under the body. `PlayerMovementController`
   gains `supportHeight()`, implemented in `EcctrlAdapter` from the grounding
   shape-cast's own witness point; the visual support falls back terrain
   → body feet. This also settles a stale note: rocks already collide as
   their own triangles, so the 16f brief's deferral of rock convex hulls to
   9c/16h is struck, not scheduled.
6. **The sea bed is dressed for a swimmer's sight line, and the ramp is a
   kilometre, not a few hundred metres.** The owner's "not even particularly
   far out" was 33 m from the beach in 6.6 m of water; the density fell off a
   425 m ramp through depth bells. The ramp is 900 m, the bands ~3× denser,
   two low-seagrass species already in the kit are placed at sea for the first time; sea-bed rocks go 14 → 70 /ha small. Pieces per 100 m² at
   200–300 m from shore: 0.15 → 2.58; at 400–600 m: 0.02 → 1.79. No asset
   sourced, so no credit changes.
7. **The Pages artefact carries only what the shipped ladder can display.**
   GitHub Pages publishes at most 1 GB; on 2026-09-18 the raw compose
   measured 999 MB (1,041 MB before two orphan probe kits were removed),
   ~430 MB of it architecture and interior kits that `SettlementLayer.tsx`
   alone loads and that mount only when `province/ladder.json` shows the
   `settlements` layer, hidden until 16h. So the next deploy would have
   failed for a reason unrelated to the owner's own list. The
   compose step (`tooling/pages-site/compose.mjs`, `npm run site:compose`)
   derives its exclusion at build time rather than from a list: a record that
   exists only to feed a hidden layer is dark; a kit ships if the built
   code or a record of a shown layer names it; kits named only by a dark
   record or by nothing at all (`wrecks-v1`, built for 16g/16h to plot) stay
   on disk and off the site; `height-natural-rg.png`, read only by the
   chain, goes with them. The build fails on an unknown ladder layer, a named
   kit missing from the build, a surviving reference to an excluded file, a
   chain-only raster something now reads, or a site over 900 MB (a warning
   over 750 MB). When 16h un-hides `settlements` the record stops being dark
   and every kit it names ships again with nothing to edit. Composed size:
   999 MB → 564 MB. **This is a reprieve, not a fix** — those kits return at
   16h and the site would stand at ~965 MB on today's sizes, which is why the
   owner pulled item 7b forward.
7b. **Kit compression and the duplicated character assets come forward out of
   Phase 14** (owner, 2026-09-18, asked and answered in session). 70–91 % of
   each kit's bytes are PNG and 112 MB of character assets ship twice, once
   per app. Compression is the only lever that answers both the size ceiling
   and the owner's "very slow to load"; every phase from here adds kits
   rather than removing them, so it is done now rather than after 16h forces
   it. Phase 14 keeps the streaming budgets and the chunk format; it no
   longer owns this.
7c. **Every kit ships GPU-compressed; the raw build is not what ships.**
   The raw Blender build stays under `output/kits/` as the measurement
   product (`trunk_solids`, `vet_kit`, `measure_footprints` and the interiors
   index parse plain accessors and would choke on meshopt); what reaches
   `public/kits/` is that file run through gltfpack by
   `pipeline/kit_compress.py`. **UASTC/KTX2 for every texture role.** ETC1S
   was measured and rejected: 22–33 dB against UASTC's 39–45 dB, two to three
   times the alpha-cutoff flips, plus a 2/5 visual verdict on foliage cards
   (blocky canopy interiors, softened cut-outs, colour bleeding into
   transparent cells) against UASTC's 5/5 — our foliage is alpha-tested
   cards, so the cheaper format costs exactly the thing the owner inspects. It stays available per kit with its price recorded. Geometry is meshopt
   with **float positions and UVs**: quantised positions hang every mesh under
   an extra dequantisation node, which moves the mesh away from the node whose extras the runtime reads; every LOD would have collapsed to level 0 — found before it shipped; float costs 4 KB. The compression is recorded
   in each manifest, decoded through `game-core/assets/kitLoader.ts` with the
   transcoder served at `<base>/basis/`, gated by `test_kit_compress.py`,
   shown failing first on all 21 uncompressed kits. Kits 556 → 222 MB; the
   site with every kit in 999 → 561 MB (so 16h un-hiding settlements no
   longer breaches the limit); the cold studio start 231 → 162 MB; flora's
   resident VRAM ~150 → ~40 MB. The character files ship once: the studio's
   production build resolves them against the sandbox's copy. Measured, not
   assumed: `docs/research/rendering/gpu-texture-and-mesh-compression.md`.
7d. **The payload has a budget and the budget is a gate** (owner question,
   2026-09-18: whether to write a rule that prevents the payload bloating
   again). Prose does not stop bloat; a build that fails does. Standard 16 in
   `docs/standards/engineering.md` states the rule and names the gates that
   enforce it.
8. **The dev server validates rather than re-sends** (0072 item 1 amended in
   place): round 3's fresh-file middleware streamed every byte on every load,
   so each reload re-downloaded ~250 MB. It now answers `Cache-Control:
   no-cache` with a weak size+mtime ETag and a 304 on a match — the browser
   must still ask about every file, so nothing stale can ever be shown; a reload costs 9.4 MB instead of 251.6 MB. This is the owner's own
   suggestion ("reinstate caching but make it update when it needs to"),
   implemented as validation rather than expiry.
9. **The shadow type is PCFShadowMap, said once.** `<Canvas shadows="soft">`
   made react-three-fiber write `PCFSoftShadowMap` on every Canvas render;
   three rewrites it to PCF inside the shadow pass (the per-frame deprecation
   warning the owner pasted) and, because the type "changed", r3f forced a
   full shadow pass on every re-render, defeating the water pipeline's
   every-other-frame policy. Worse, a material compiled on a "PCFSoft" frame
   took `SHADOWMAP_TYPE_BASIC` — a plain `sampler2D` uniform bound to the
   CSM cascades' comparison-mode depth textures, which is exactly the
   owner's `GL_INVALID_OPERATION: Mismatch between texture format and sampler type` naming a shadow sampler, permanent because the program key never changes. We
   declare PCF, which is what three was silently using anyway.
10. **A render target's depth image is resized with its colour image.**
    three's `setSize` resizes only the colour texture and fixes the depth texture when the target itself becomes a render destination; under water the water
    pipeline SAMPLES the other target's depth before anything renders to it, so after any canvas resize the stale-size depth texture was uploaded
    immutably and attached to a framebuffer of the new size — the owner's
    hundreds of `Framebuffer is incomplete: Attachments are not all the same
    size`. `resizeTarget` now moves both together. Found alongside: the
    surface, crown and fall passes read the scene depth at the CANVAS
    resolution while drawing into the 0.9-scale scene target under water, so
    every refraction and soft-depth read was mis-registered by 1/0.9 when
    submerged.
11. **A startup fetch is gated on whether the view can use it.** The
    underwater kit (27 MB) was in the same eager `useLoader` array as the
    land kit and the ground-cover ring fetched `settlements.json` (9.7 MB)
    although the settlement layer is hidden on this ladder. The underwater
    kit now loads when a bed species stands within 400 m of the focus; the
    settlements fetch is gated on the ladder. Honest limit: 210 of 256 chunks
    hold bed dressing (rivers and lakes carry it too), so the 27 MB is saved
    only at genuinely inland starts.
12. **`ready` means the thing exists.** `EcctrlAdapter.ready` tested that the
    ecctrl handle was attached; ecctrl attaches in React's layout phase while
    rapier creates the rigid body in a passive effect, so for the first
    frames `ready` was true with `handle.body` null and the water-contact
    path threw `Cannot read properties of null (reading 'linvel')` on every
    character start. Pre-existing, found by a headless probe this round.
    `ready` now means the body exists and every body accessor is null-safe.

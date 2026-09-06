# Water completion audit

Owner completion goal, 2026-09-06. This supersedes the earlier candidate
handoff, not the requested scope. `open` includes implemented features whose
coverage or visual evidence is insufficient. Do not close a row merely because
a related unit test passes. Baseline implementation: `1af32a3`.

| Requirement and source | Current evidence / missing work | Status |
| --- | --- | --- |
| Continuous source-to-sea rivers, slopes, confluences; owner/backlog | Native monotone solve and ribbons tested; flood margins and terrain-LOD agreement need further work | open |
| Flat lakes/pools, no domes or floating edges; owner | Native flat-pool gates pass; continuous body-aware shore domains unfinished | open |
| Preserve tides and wet/dry ranges; owner | Existing constants retained; recheck extremes with new boundaries | open |
| Streams/creeks/major rivers, gradients and regional chemistry; owner | Shared semantic shading exists; systematic contrasting-scene evidence missing | open |
| Oxbows, eddy pools, bogs, black/greenwater, mangroves; owner/module60 | Chemistry/shelter fields exist; local current/eddy response and body records incomplete | open |
| High-quality open-sea swell / FFT tier; backlog/module60 §39.4 | Three deterministic spectral cascades implemented locally; weather transitions, marine shader/physics parity and performance/visual gates remain | open |
| Beach breakers, runup and backwash; backlog | Shared analytical surf exists; wave/foam motion and extreme-weather verification incomplete | open |
| Hero-pool full interactive simulation; backlog/module60 §39.3 | Persistent owner-selected128² finite-volume patch, displaced object volumes and incremental admission implemented locally; visual and deployed evidence missing | open |
| Ripples must not cross between disconnected pools; backlog follow-up | Existing masks/body identity require final nearby-unconnected-pool interaction regression, including seasonal separation | open |
| Waterfalls, mist, plunge splash and foam; backlog | Cascade geometry and bounded emitters exist; silhouettes and connected plunge behaviour need review | open |
| Underwater entrained particles; module60 §42 / interaction audit | Bounded impact/entry bubbles deployed in b7948d6 with current/rise/owner barriers and fog-correct isolated HDR pass; actual GPU pixels/lifecycle pass, experiential evidence remains | open |
| No barcode/static/specular aliasing or mixed shaders; backlog/owner | Specific regressions fixed; final moving-scene sweep missing | open |
| Object/player impacts, wakes, displacement and ripples; owner | Contact crossings, independent readers, priority, crowns, mist and immersed-volume proxies implemented/tested locally; quiet body replay and stable admission prevent artificial startup waves; in-scene evidence remains | open |
| Float/sink, drag, angular response, mass units; owner/backlog | Reusable fixed-step driver and explicit mass-unit contract implemented/tested; final fixture experiential validation remains | open |
| Caustics on submerged receivers; backlog/owner | Shared terrain/prop receiver includes interaction-field refraction Jacobian; crate fixtures opt in; numerical tests cover chemistry, crest/trough focus, real disturbance and dry-edge rejection; in-scene evidence remains | open |
| Reflections, sun/moon glints, god rays, upward underwater view; owner | Previous targeted probes pass; preserve through remaining changes | open |
| Weather response appropriate to each feature; owner | Existing wind/rain coupling; spectral/weather transitions and local effects budgets unproven | open |
| WaterBody records, rendering profiles, future consumer contracts; module60/buildout register | Compiler-derived physical records and portable lookup/validation implemented locally; flat vs channel authority preserved, unknown authored ecology/navigation/discharge not fabricated; final export validation remains | open |
| Region/map tooltip matches actual water; backlog | Tooltip now queries shared current wet boundary instead of separate legacy raster; geographical region data retained; deployed interaction check remains | open |
| Walk-mode SSR/DPR/capture costs; backlog | Shared capture exists; per-pixel SSR cost and measured pass budgets need improvement | open |
| High framerate in walk/fly/future game; owner | Whole-province detail residency and uncullable ribbon draw found; bounded streaming/LOD in progress | open |
| Reversibility; owner | Original assets + legacy switch + separate water commit; maintain through completion | open |
| Deployed studio with all changes; owner | Runtime completion checkpoints through b7948d6 deployed and bundle verified; final hydraulic/native/adaptive/gradient data not deployed | open |
| Hard straight/square edges where water meets land; owner follow-up | Widespread, including close range; test continuous terrain intersections, ownership boundaries and seasonal extremes, not only distant LOD | open |
| Wet-season waterways underfill painted beds; owner follow-up | Widespread asymmetric-width and boundary-extent defects; verify both banks throughout the full network | open |
| Dry walkable hollow below apparent river surface; owner follow-up | Repro near 1.96km E / 0.22km S; rendered surface, native terrain and physical wet query must agree | open |
| Square/triangle patches within a waterway; owner follow-up | New deployed screenshot near 2.06km E / 0.26km S; eliminate competing surface ownership/height/shading, not just foam aliasing | open |
| Fly mode terrain absent while walk terrain renders; owner follow-up | Independent loading boundaries/fallback deployed in699c355; high/low live terrain eventually compiled, permanent disappearance not reproduced; mode-switch/loading checks remain | open |
| Visible particles grey/black; owner follow-up | HDR brightness was capped1.4 before daylight exposure~1e-5; radiance fix deployed55d2ebc with real noon/moonlit-rig tests, visual acceptance remains | open |
| Water-only positional sound, splashes and underwater filtering; module57 | Asked owner whether to include this separately scheduled audio work; do not silently expand to the whole soundscape | scope confirmation pending |

Related world content (underwater quests, settlements, creature rosters) is
not evidence for water rendering/interaction quality. Keep existing geography
and lore authority; do not invent POIs or ecology to populate optional links.
Track any substantive scope ambiguity explicitly rather than silently treating
it as delivered.

## Performance proof

Record camera mode, viewport/DPR, visible water coverage, render-pass count,
SSR samples, simulation dimensions/update rate, resident geometry bytes and
triangles, build/upload budget, and warm frame-time distribution. Test camera
travel/teleport and resource disposal, not just stationary startup. Software
WebGL can prove bounded work and shader correctness, not hardware frame rates.
No whole-province high-resolution fluid simulation or unbounded near-detail
cache is permitted. Keep rendering and physics in reusable packages.

[Local fluid and GPU budget notes](water-local-fluid-and-gpu-budgets.md)
record the displacement/caustic model and minimum16-sampler compatibility
check. Optical and bounded-work tests do not close the visual rows above.

Diagnostic broad fly views (1920×1080, FOV60°, bearing0°, altitude416/1000m)
now select half-pixel-bounded bank LOD variants: submitted terrain falls from
11.40/12.03 million to5.480/5.981 million triangles. Native nearby terrain is
unchanged. Combined terrain/water geometry plus the native water atlas is
approximately211/214MiB GPU, excluding other textures/effects. Low-tier water
has no rejected visible patches in these measured views. These measurements
use a coherent diagnostic bundle, not the final hydraulic export, and are not
hardware FPS evidence. The first resumable-construction sweep retains the exact
draw/triangle/byte totals while reducing combined water-update maxima from
91–101ms to11.8–15.5ms (p95≈4ms). Remaining atomic work and completed-geometry
equivalence checks are still being resolved before release.

## Release coordination

Combat is concurrently active in the same worktree. Commit explicit water
paths only; preserve unrelated edits. Inspect current branch, remote and
Actions before pushing. Never bypass asset verification to deploy water.

First-overhaul deployment verified 11:26 UTC: release head `6576849`,
Actions run `34030145090` succeeded (tests, types, credits, build and Pages).
Live metadata SHA-256 `669f5f70348d248803ce76fc2da77e5af1ecab5482e7919809e6902e52fdc2ba`
matches `1af32a3`. This does not close the completion-pass deployment row.

Runtime checkpoint `4809880` deployed15:47UTC: Actions `34043295645` passed
build/tests/types/Pages. Live studio loads the matching `index-CBqmJVeS.js`;
v2 metadata still has the exact hash above. This delivers the checked runtime
changes through that commit, not the unfinished hydraulic data.
Subsequent `b7948d6` deployed successfully through Actions `34044417460`;
live bundle `index-ALToYCdb.js` matches. It includes underwater bubbles and
wet-candidate confluence selection, with the same unchanged water-data hash.
Completion/deployment acceptance remains open.

## Additional evidence from the owner repro

Camera: 2.37km E, 0.19km S, altitude416m, fly SW213°, 10:00 Last Seed17.
The supplied image showed the pre-overhaul deployment, but current-code
audits found independent remaining defects:

- Terrain LOD2/4 smoothing erases channels: in a separate tarn sample,
  112/213 and176/213 native ribbon points are below the coarse ground,
  versus0/213 forLOD1.
- Symmetric width clips BOTH banks to the nearer bank:453 points near the
  repro have median rendered width1.87m versus4.24m of independently sampled
  wet cross-section;213 use less than half of the available width.
- Refinement uses a fixed0.20m depth instead of interpolating the authored
  stream/river depth targets.
- Primary advection is physically3m/s where capped, but stationary secondary
  foam masks pin visible bubbles; fall textures have unrelated11.8/13.75m/s
  vertical scroll rates. Full3D current is lost at the renderer boundary.

Fixes must address all of these, not treat distant LOD as the sole cause.

Further native-topology evidence: bilinear terrain queries disagree with the
actual triangle surface even at LOD1. Some inherited diagonal carve blocks
connect two low bed vertices only through the high bank diagonal. Investigating
audited sparse diagonal flips shared by rendering, collision and CPU queries;
never a visual-only hole or silently deeper excavation. Adaptive terrain LOD
must preserve these native cells and their banks at every render tier.

Further completion-pass findings, not closed by the first candidate:

- A bank cap below its own routed bed was replaced with bed+3cm, then
  propagated across roughly100m of the repro. Sixteen narrow stations had
  1.49–1.64m local bank clearance and an authored30cm depth target, but
  inherited that artificial film cap. The corrected solve must respect real
  bank caps and semantic flowing-depth targets, not merely avoid a dry pixel.
- The flat-pool compiler retained depression seeds but omitted connected
  inundated margins at the same plane. A1.871m pool therefore treated a
  connected0.760m shoulder as a river bank, causing false constraints and
  repeated unnecessary lowering. Spill-connected pool-domain closure is
  being corrected without changing the plane or stage amplitudes; dry crests
  and incompatible neighbouring planes must remain barriers.
- Broad plunge-pool cross-sections lofted triangular fans up to a narrow
  waterfall lip. Descending ribbons now constrain lateral expansion;
  horizontal pool width belongs to the flat pool, not an elevated sheet.
- Interpolated strip ground missed native terrain creases even when its
  vertices were correct. Exact native-ground checks remove the repro's
  buried wet triangles, but full geometric refinement costs tens of millions
  of faces. Use exact shared terrain sampling, not a visual correctness vs
  framerate trade disguised by dropping over-budget water patches.
- Particle foam still contained a regular bubble grid. Jittered neighbours
  and pixel-integrated rings replace it. Tall-fall spray admission now tests
  the whole lip-to-plunge source, not just distance to the far-below pool;
  nearby-source priority no longer depends on province file ordering.
- Character contacts used raw render time despite bounded fixed-step physics,
  diluting impact speeds and dropping contacts on slow frames. Effects also
  mistook low FPS for tab suspension. Contacts now follow actual substeps;
  explicit visibility lifecycle clears suspended state. A real studio J-jump
  at2344.2048m E /264.1229m S generated entry/exit, three wakes, spray/mist and
  one crown, with live exposed daylight RGB≈(0.396,0.295,0.238). After correcting
  newborn ageing, a repeated real J-jump reaches in-frustum peaks of17 spray,
  11 mist,10 foam and one crown across207 observations. Newborns retain the
  same full lifetime after0ms and400ms preceding frames. This proves event
  delivery, lighting inputs and visible candidates, not final appearance.
- Degree-two river joins used independently oriented cross-sections, leaving
  wedges even at identical station centres and heads. Shared graph-derived
  sections are in progress; confluences require their own coverage check.
- Fly-view ribbon residency rejected visible patches at the old memory
  ceiling. Indexed geometry and incremental admission are in progress;
  silently omitting visible water is not an acceptable budget strategy.
- Hero-pool cell-centre simulation and cell-edge geometry disagreed by17cm
  in an immersed-sphere case. Shared triangle interpolation and explicit
  half-cell borders now pass complete wet-triangle parity tests locally.
- Waterfall shading classified slope through camera-dependent screen-space
  derivative ratios, also multiplied by studio exaggeration. It now uses
  the native still-surface grade carried by the mesh, so looking around does
  not reclassify the same chute. This is separate from downstream advection.
- The older contact-ripple solver had no current transport: rings could stay
  fixed in a flowing river even though foam moved downstream. Bounded
  owner-isolated current transport is implemented locally. A browser readback
  of the actual half-float field moves its centroid3.750896m in1s under a
  3.75m/s current (expected3.75m), with no nonfinite values or shader/GL errors.
  CPU regressions cover bank corners, foreign owners, zero current and
  stage-history clearing; final in-scene evidence remains open.
- Terrain arrival handling could replace an admitted adaptive bank mesh with
  a cached regular mesh on a later render. Shared display selection now
  retains the authoritative mesh until its requested replacement arrives;
  tests cover cache fallback and returning to native near terrain.
  The request gate also now distinguishes adaptive authority from a temporary
  regular mesh with the same LOD label; that fallback cannot suppress loading
  the corrected banks. Resolution/manifest changes are covered by integration
  tests, including unchanged native collider rings.
- Confluence sampling selected the highest base ribbon before applying its
  access/stage gate. A blocked upper face could therefore hide a rendered,
  wet lower face from physics. Candidate ordering now uses actual stage and
  the same explicit/fallback access and native bed gates; exported-mesh oracle
  tests cover order reversal and seasonal changes without mixing owners.
  Standing water beneath a dry native envelope remains a separate final-data
  gate: static inland subtraction cannot be repaired by inventing CPU-only
  wetness under a missing rendered face.

Browser GPU upload check on the diagnostic native-ground atlas: one initial
2048×958 upload (31,391,744 bytes), then exactly eight2048×1 rows
(262,144 bytes) for a hero update. Explicit invalidation correctly restores
the full atlas; WebGL error0. This proves the upload path, not final geometry
or target-device framerate.

Underwater bubble GPU check:32 particles after a0.8s preceding frame render
185 positive-radiance/alpha pixels into a128² RGBA16F target (131,072bytes),
with no nonfinite values or GL errors. Returning above water releases the
target immediately. Full-app shader check retains16 active fragment samplers
for water/terrain and8 for the updated blit; all programs link. This is
numerical rendering evidence, not an ingested appearance review.

Particle framebuffer check (256², no image ingestion): an actual splash with
12 droplets, one mist particle, six foam patches and one crown, lit with the
live noon radiance/exposure, produced2,693 pixels brighter than the neutral
background and zero darker pixels; WebGL error0. This directly tests shader
exposure/blending, not just the CPU lighting helper. It does not establish
all-weather scene visibility or waterfall silhouette acceptance.

Loading hotfix699c355 deployed through successful Actions34031749733 on top
of combat7fab395. This deploy contains the loading fix and this checklist,
NOT the uncommitted completion-pass geometry, spectral or particle changes.

Particle radiance hotfix55d2ebc subsequently deployed through successful
Actions34032475192. It removes the pre-exposure brightness cap and uses the
actual sky/direct light feeds, with noon/moonlight tests. It does not include
the new crowns, priority, mist, geometry or spectral changes. Particle visual
acceptance remains open despite the radiometric regression passing.

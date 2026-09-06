# Water quality contract and review guide

Decision [0045](../../decisions/0045-reversible-water-overhaul.md), September 2026. Covers the water items in [the polish backlog](../../polish-backlog.md), plus the owner's broader request. Keep backlog items open until visual acceptance; automated tests do not certify that water looks natural.

## What “first class” means here

Black Marsh needs readable, geographically distinct water at walking height, not just a convincing ocean screenshot. Standing water finds a flat level; channels remain connected and descend along actual beds; neighboring features join without domes, uphill flow, floating edges or shader changes. Physical sampling and rendering agree. Water retains useful contrast at night and under changing weather without erasing the province's regional character.

| Feature | Intended response |
| --- | --- |
| Mountain streams and steep creeks | Narrow bed-following surfaces, stronger downstream motion, localized aeration and cascade spray |
| Lowland streams and major rivers | Continuous downstream advection; breadth, slope and depth govern activity rather than a texture changing direction |
| Ponds, lakes and oxbows | Flat base level; shelter and depth attenuate wind waves, with local contact/rain disturbance |
| Bogs, blackwater and greenwater swamps | Wetland support and season response, tannin/turbidity absorption, sheltered motion; no ocean surf inland |
| Mangroves and estuaries | Sheltered tidal motion and mixed water chemistry; coast-connected surf only where exposure permits |
| Coast, beach and open sea | Depth-limited swell, shore-directed breakers/runup, open-water reflections and horizon |
| Contacts and obstacles | Radius/velocity-scaled ripples, wakes, droplets and foam; current advection, land isolation and bounded emission |
| Underwater | Continuous immersion, depth/chemistry-dependent visibility, retained surface optics and light shafts, sunlit-bed caustics |

These are a review matrix, not a claim of full fluid simulation. Geometry and semantic rasters select responses through one material. No separate hand-authored blackwater shader, global fluid solver or simulated breaking-wave volume is introduced. Local obstacle response uses actual terrain boundaries; above-bed dynamic objects emit contacts. Persistent vortices behind arbitrary future geometry require that geometry's flow/obstacle integration. Waterfall sheets use steep channel geometry with aeration, plume and plunge effects; judge their silhouette as well as their particles.

## Engineering acceptance

- Original flood-state data remains authoritative: unchanged tide amplitude and wet/dry season responses. Never compensate for bad topology by reducing these ranges.
- Compiled standing surfaces are flat. Exported channel stations are nonascending, supported and wet against their recorded native bed. Native ground samples accompany ribbons; coarse exported depth must not decide narrow-channel geometry.
- The sparse terrain overlay records original and corrected heights and never raises terrain. It affects the shared cache before any renderer, collider or query receives heights. Original files remain unchanged. Audit maximum lowering and any rejected/unresolved drainage links in compiler metadata.
- Grid origins are explicit. Support and body IDs are discrete; physical flow and optical fields interpolate consistently. Inland triangles cannot bridge different body IDs. CPU ribbon queries resolve the same topmost triangles as rendering.
- Wave steepness remains bounded under storms; amplitude is depth-limited. Wet/dry clipping uses final wave height, including coastal runup.
- Ripple boundaries block land and unrelated bodies; recentering cannot teleport old disturbances. Contact emission depends on travel/time, not frame count. Particles and interaction queues have fixed budgets.
- Buoyancy balances displaced volume, density and gravity; drag uses relative current and local angular velocity. Float, deep-float and sinking fixtures exercise the same reusable implementation.
- Refraction/SSR and underwater rendering share captures. Terrain caustics respect direct illumination, depth, turbidity/tannin and the receiving surface; they must not glow in shadow or double on immersion.

Regression entry points: `waterCompiled.test.ts`, `waterQuality.test.ts`, `waterIntegration.test.ts`, `channelRibbons.test.ts`, `buoyancy.test.ts`, `contactEmitter.test.ts`, `render/*.test.ts`, `terrain/chunkStore.test.ts`, and Python `test_water_geometry.py`. Routine gates remain `npm test` and `npm run typecheck`. The browser probe is a small targeted shader/scene check, not a GPU performance benchmark: SwiftShader frame rates are not representative hardware measurements.

## Owner playtest

Earlier candidate checkpoint (`1af32a3`, not completion): the shipped solve has zero unresolved reaches or
ascending channel segments, 2,577 flat pools, 4,017 supplemental ribbons and
256 cascade sites. All ribbon points retain at least 14.998mm of native-bed
clearance. The reversible overlay affects 5,017 of 16,265,089 native vertices;
16 exceed the routine 3m bound under the four declared exceptions (5m maximum).
Inland geometry uses at most 64 frustum-culled batches, with bounded incremental
uploads and native-detail shoreline/height checks.

The limited browser checks covered sunlit bay, mountain water and underwater
immersion without shader errors. Image review caught coarse water plates,
flow-coordinate foam striping and missing raster triangles beside ribbons;
these received implementation fixes and regression coverage. The final
ribbon/raster boundary fix and film-clearance export were not image-reviewed
again. Do not read this checkpoint as visual acceptance. In particular, check
mountain margins, confluences and distant terrain/water LOD transitions in
motion. Conservative support still excludes unrelated lower slopes instead of
allowing an extrapolated high river plane to flood them.

Receiving-terrain caustics are integrated with direct light and shadows.
The local completion pass adds the same opt-in receiver hook to the crate
fixtures; future rocks/hulls use that shared hook. It is not automatically
applied to every material. Dynamic-object contacts do not constitute a general obstacle
flow solver, and swimming/boat controls remain the separate traversal work.

Use the studio's normal fly and character modes. Check a mountain creek downhill into its pool, a broad lowland river, blackwater and greenwater wetlands, the mangrove/coast transition and an exposed beach. At each, move across the shoreline and look along the surface at low angles. Check daylight, moonlight and underwater looking upward. Try calm/rain/storm and wet/dry seasons without moving the camera. Drop all three crate types and move through shallow water at different speeds.

Report the saved studio URL, what you expected, and what looked wrong. Particularly watch continuity through bends/confluences, far/near geometry transitions, waterfall silhouettes, foam scale and whether motion reads downstream. One short clip of a moving defect is more useful than many stills. Automated probes deliberately cover only a few load-bearing views; the whole matrix still needs this owner gate.

For an immediate comparison, add `water=legacy` to the studio URL and reload; remove it and reload for the new version. It preserves original terrain and assets and uses the retained renderer. Shared CPU correctness fixes remain in both paths. For exact rollback, revert the water implementation commit(s), not unrelated changes; `0b67e12` is the pre-water reference. The tracking-only commit `8f52f86` does not change runtime behavior.

## Research and implementation choices

Earlier repository surveys remain useful: [Three.js water research](water-rendering-threejs.md). GPU Gems explains [analytic-wave steepness and normal construction](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models); its folding constraint informed the shared CPU/GLSL storm bound. Its [water-caustics chapter](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics) motivates refractive focusing on submerged receivers. The completion pass adds bounded spectral-ocean cascades and local interaction-field focusing; neither is a province-wide fluid or photon simulation. See [local fluid and GPU limits](water-local-fluid-and-gpu-budgets.md) for the shared displacement/optics model and compatibility checks.

## Water compiler runbook

**Historical candidate recipe:** the commands and numeric exceptions below
describe `1af32a3`, not the active completion compiler. For exact reproduction,
use that revision in a separate worktree. Do not apply this recipe to publish
new completion assets: the current solve adds strict physical bank caps,
semantic depth targets, shared native topology, packed cross-sections and a
matching sparse ground atlas. Its final release recipe is pending the
continuity and budget gates in [the acceptance ledger](water-completion-audit.md).

Run from `tooling/world-generation`. The immutable native terrain input is `DEFAULT_HEIGHTS` in `worldgen/compile_chunks.py`: the sibling `elder-scrolls-asset-pipeline/skyrim-source/mod-sources/tamriel-worldspaces-118678/extracted/Argonia Worldspace/argonia-heightfield/province-refined/refined-height-f32.npy`. Hydrology and semantics come from `hydrology-pass1.npz` in that same `argonia-heightfield` directory. The compiler reads both; it never overwrites either. Native spacing is 1.82784m, grid origin is zero, and coarse semantic cell centres are native `(3r+1,3c+1)`.

Reproduce the shipped physical terrain/water solution from its versioned, validated overlay:

```sh
python3 -m worldgen.compile_water --web-step 2 --out-dir /tmp/water-rebuild-2017 --bed-overlay ../../apps/world-studio/public/province/water/v2/water-bed-overlay.json --max-bed-lowering 3 --bed-exception-cell 124,348 --bed-exception-cell 125,349 --bed-exception-cell 126,350 --bed-exception-cell 128,1092
```

Use `--web-step 1 --out-dir /tmp/water-rebuild-native` for the optional 4033 texture tier. Both tiers solve the same native geometry; 2017 is the normal memory-conscious export. Original water assets remain outside `water/v2` for rollback.

To investigate a newly changed source heightfield, omit `--bed-overlay`, add an explicit temporary `--cache /tmp/water-candidate.npz`, and keep the same bounds. This computes a new repair candidate, not an automatic replacement for the approved overlay. To resume an interrupted candidate, use `--bed-overlay /tmp/water-candidate.bed-progress.json --continue-repairs`; it continues until no allowed repair changes any native sample. Review the output before copying any generated files into `water/v2`.

The overlay stores sorted `[nativeFlatIndex, correctedHeight, originalHeight]` triples. Missing samples have zero correction; the runtime applies bilinear deltas to every terrain LOD. Routine lowering is capped at 3m. Only the four explicitly audited channel-sill cells `(124,348)`, `(125,349)`, `(126,350)` and `(128,1092)` permit a 5m exception; every actual deeper correction must appear in `exceptionIndices`, with the declared cells and routine/exception limits. This is not permission to lower arbitrary banks or terrain. Import validates original heights, bounds and ordering; a changed source heightfield must be reviewed rather than silently accepting an old overlay.

Check `water-meta.json` statistics and `terrainMismatches`: a rejected reach is not proof of continuous water. `channelStationsWetFraction` and `nativeChannelSamplesWetFraction` measure raster depth above 5cm before explicit ribbon override; they are not fractions of visibly connected channel. Physical clearance is measured against recorded native `groundM`; flowing graph-interior nodes retain approximately 1cm or more of visible film, while true terminal spring/shore tapers may approach zero. A retired headland link is acceptable only when its endpoints already share a connected native sea body. `python3 -m worldgen.audit_water_profiles /tmp/water-candidate.bed-progress.json` reports exact residual paths, lengths, controlling pool heads and required cuts. Run `python3 -m pytest worldgen/test_water_geometry.py worldgen/test_water.py -q`; after staging the complete matching asset set, run `npx vitest run src/water/waterCompiled.test.ts` from `packages/game-core`, then the browser/owner matrix above. Never publish a surface without its matching bed overlay and metadata.

The backlog's Dan Greenheck reference was checked against his [Water Pro V3 announcement](https://www.linkedin.com/posts/danielgreenheck_ive-spent-the-last-6-months-and-200-hours-activity-7468044659509014528-vPvB): persistent crest foam, spray emitters, wakes and rain are useful comparison targets. His [public documentation endpoint](https://docs.threejswaterpro.com) returned HTTP 403 during this review; no claim is made to have inspected its implementation or purchased/downloaded its code. The official [Three.js GPU water example](https://threejs.org/examples/webgl_gpgpu_water.html) is a bounded interactive-surface reference, not evidence that a pool-only surface solves province drainage. Existing repository research plus these primary references informed the approach; no third-party bitmap or mesh assets were introduced.

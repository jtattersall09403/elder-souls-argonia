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

- The compiled W field and depth proxy are the single authority for the CPU
  query and the renderer; tide and season offsets are added identically in
  both (`waves.ts` GLSL twins). Data never rides a PNG alpha channel.
- Compiled invariants are tested against the real outputs
  (`worldgen/test_water_invariants.py`): no wet cell below its bed, no
  enclosed dry hole inside a body, monotone station chains, strips only on
  steep reaches and joined to the field at both ends, cascade lip above
  plunge. Rendering discards where the surface is buried or behind the
  scene; strips and falls own their cells through `water-owner.png`.
- Ripple boundaries block land and unrelated bodies. Contact emission depends
  on travel and time, not frame count. Particles and interaction queues have
  fixed budgets. Buoyancy balances displaced volume, density and gravity.
- Terrain caustics respect direct illumination, depth and turbidity; they
  must not glow in shadow or double on immersion.

Routine gates are `npm test` and `npm run typecheck`. The browser probes
(`apps/world-studio/scripts/probe-water.mjs`, `shot-deployed.mjs`) are
targeted shader/scene checks under SwiftShader, not hardware benchmarks.

## Owner playtest

Use the studio's normal fly and character modes. Check a mountain creek
downhill into its pool, a broad lowland river, blackwater and greenwater
wetlands, the mangrove/coast transition and an exposed beach. At each, move
across the shoreline and look along the surface at low angles. Check
daylight, moonlight and underwater looking upward. Try calm/rain/storm and
wet/dry seasons without moving the camera. Drop the crates and move through
shallow water at different speeds. Report the saved studio URL, what you
expected, and what looked wrong; one short clip of a moving defect beats many
stills. The current key sites are listed in [water-handoff.md](water-handoff.md).

## Research and implementation choices

[Three.js water research](water-rendering-threejs.md),
[shore waves/edges/wet sand/ripples](water-edges-and-shore-waves.md),
[waterfalls](waterfalls-realtime.md). GPU Gems explains
[analytic-wave steepness](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models)
and [water caustics](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics).
Dan Greenheck's Water Pro V3 (persistent crest foam, spray emitters, wakes,
rain) is a comparison target only; its code was never inspected.

## Water compiler runbook

Run `python3 -m worldgen.compile_water` from `tooling/world-generation`
(~16 s, deterministic: a rerun on unchanged inputs reproduces the shipped
PNGs byte for byte). Inputs are `DEFAULT_HEIGHTS` in `worldgen/compile_chunks.py`
and `hydrology-pass1.npz` beside it in the vault; it never writes either.
Outputs go to `apps/world-studio/public/province/water/`. Then run
`python3 -m pytest worldgen/test_water.py worldgen/test_water_invariants.py -q`.

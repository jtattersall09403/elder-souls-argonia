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
| High-quality open-sea swell / FFT tier; backlog/module60 §39.4 | Analytic ten-band field only; spectral tier not delivered | open |
| Beach breakers, runup and backwash; backlog | Shared analytical surf exists; wave/foam motion and extreme-weather verification incomplete | open |
| Hero-pool full interactive simulation; backlog/module60 §39.3 | One camera-following ripple patch is not a persistent selected-pool simulation | open |
| Waterfalls, mist, plunge splash and foam; backlog | Cascade geometry and bounded emitters exist; silhouettes and connected plunge behaviour need review | open |
| No barcode/static/specular aliasing or mixed shaders; backlog/owner | Specific regressions fixed; final moving-scene sweep missing | open |
| Object/player impacts, wakes, displacement and ripples; owner | Contact crossing gaps found; reusable object adapter and fan-out incomplete | open |
| Float/sink, drag, angular response, mass units; owner/backlog | Force tests pass; explicit shared mass-unit contract and fixture integration unfinished | open |
| Caustics on submerged receivers; backlog/owner | Terrain-only receiver patch; props and interaction-linked focusing incomplete | open |
| Reflections, sun/moon glints, god rays, upward underwater view; owner | Previous targeted probes pass; preserve through remaining changes | open |
| Weather response appropriate to each feature; owner | Existing wind/rain coupling; spectral/weather transitions and local effects budgets unproven | open |
| WaterBody records, rendering profiles, future consumer contracts; module60/buildout register | Stable component IDs exist; physical records and optional authored links unfinished | open |
| Region/map tooltip matches actual water; backlog | Coarse region plus separate old water label; inspect and align current water truth | open |
| Walk-mode SSR/DPR/capture costs; backlog | Shared capture exists; per-pixel SSR cost and measured pass budgets need improvement | open |
| High framerate in walk/fly/future game; owner | Whole-province detail residency and uncullable ribbon draw found; bounded streaming/LOD in progress | open |
| Reversibility; owner | Original assets + legacy switch + separate water commit; maintain through completion | open |
| Deployed studio with all changes; owner | New completion pass not deployed; require successful Actions deployment and live version/asset checks | open |
| Hard straight/square edges where water meets land; owner follow-up | Widespread, including close range; test continuous terrain intersections, ownership boundaries and seasonal extremes, not only distant LOD | open |
| Wet-season waterways underfill painted beds; owner follow-up | Widespread asymmetric-width and boundary-extent defects; verify both banks throughout the full network | open |
| Dry walkable hollow below apparent river surface; owner follow-up | Repro near 1.96km E / 0.22km S; rendered surface, native terrain and physical wet query must agree | open |
| Square/triangle patches within a waterway; owner follow-up | New deployed screenshot near 2.06km E / 0.26km S; eliminate competing surface ownership/height/shading, not just foam aliasing | open |
| Fly mode terrain absent while walk terrain renders; owner follow-up | Urgent deployed regression investigation; check loading, suspended scene groups and render passes | open |
| Visible particles grey/black; owner follow-up | Diagnose particle lighting, colour space, transparency and depth under day/night conditions; droplets, spray and mist must not read as soot | open |

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

## Release coordination

Combat is concurrently active in the same worktree. Commit explicit water
paths only; preserve unrelated edits. Inspect current branch, remote and
Actions before pushing. Never bypass asset verification to deploy water.

First-overhaul deployment verified 11:26 UTC: release head `6576849`,
Actions run `34030145090` succeeded (tests, types, credits, build and Pages).
Live metadata SHA-256 `669f5f70348d248803ce76fc2da77e5af1ecab5482e7919809e6902e52fdc2ba`
matches `1af32a3`. This does not close the completion-pass deployment row.

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

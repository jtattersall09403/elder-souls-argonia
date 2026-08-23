# World Studio

Province map + 3D flyover for inspecting generated world data. Deployed at
`/studio/` on the Pages site; dev server shares tunnel port 8081 with the
combat sandbox (run one at a time).

- **Map view**: terrain with toggleable generated layers (rivers, wetlands,
  routes, waterways, rootways, danger, cultures, regions, mist, flood, soil,
  watersheds, salinity), anchor markers, sea-level and relief controls, and a
  hover tooltip reporting region / danger / culture / climate per pixel.
- **3D flyover**: double-click the map (or "Fly the province") — terrain mesh
  from the conditioned heightfield with the current map canvas draped as
  texture. Fly (pointer-lock WASD, E/Q, Shift) or orbit; exaggeration slider.
- **Reproducible URLs**: `?view=fly3d&cam=fly|orbit&x=<km>&z=<km>&ex=<n>&mats=<set>`.
- **Ground-material sets**: terrain texture palettes are versioned under
  `public/textures/ground/<set>/` (registry: `index.json`; built by
  `worldgen.build_ground_materials`). The fly HUD shows a selector when more
  than one set exists — for A/B comparison and instant revert of palette
  experiments. Material ids/names must stay aligned across sets.

Data comes from `public/province/` (built by `tooling/world-generation` — see
its README for the compile pipeline) and `world/sources/anchors/`. No world
data is computed in the browser beyond display conditioning.

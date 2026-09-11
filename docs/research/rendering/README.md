# Research — rendering

Prior art and technique studies behind the browser renderer: ground, sky, weather, water, vegetation and sound.

| File | What it answers | Status |
| --- | --- | --- |
| [webgl-terrain-many-material-splatting.md](webgl-terrain-many-material-splatting.md) | How to render 20–60+ ground materials on a province terrain without exploding shader cost: baked ID+blend control map into KTX2 arrays. Grounds decision 0011. | live design input |
| [skyrim-morrowind-landscape-texture-granularity.md](skyrim-morrowind-landscape-texture-granularity.md) | How Bethesda gets granular ground texturing from a small global texture budget, and what that means for our splat design. Read by `worldgen/landcover.py`. | live design input |
| [black-marsh-ground-texture-sources.md](black-marsh-ground-texture-sources.md) | Which tileable ground diffuses/normals to build the palette from, with verified licences and IDs. Read by `worldgen/build_ground_materials.py`. | live design input |
| [natural-light-sky-atmosphere-threejs.md](natural-light-sky-atmosphere-threejs.md) | The sun/moon/star/sky/haze stack for three.js: vocabulary, library verdicts, performance envelope. Read by `apps/world-studio/src/sky/lightRig.ts`. | live design input |
| [weather-clouds-rain-threejs.md](weather-clouds-rain-threejs.md) | Prior art for the weather state machine, cloud layers, rain and squalls, wet surfaces, god rays and the three mist regimes. | live design input |
| [vegetation-scatter-instancing-threejs.md](vegetation-scatter-instancing-threejs.md) | How to place and render dense vegetation across a 7.4 km streamed world at 60 fps: the two-tier system, wind, bundle format. Read by `packages/game-core/src/fx/windSway.ts`. | live design input |
| [building-placement-rendering-treatments.md](building-placement-rendering-treatments.md) | What a placed building needs to sit in the ground: contact shadow, edge foliage, a band of local ground texture. Read by `worldgen/settlement_clearance.py` and `game-core/vegetation/settlementClearance.ts`. | live design input |
| [water-edges-and-shore-waves.md](water-edges-and-shore-waves.md) | Shore waves, wet sand and interactive ripples without a fluid sim, with the formulas. Read by `game-core/src/water/render/RippleSim.ts`, `waterMaterial.ts`. | live design input |
| [waterfalls-realtime.md](waterfalls-realtime.md) | How real-time games build falls and steep whitewater, and our decided recipe after two failed attempts. Read by `game-core/src/water/render/WaterfallSheets.ts`, `ChannelStrips.ts`. | live design input |
| [waterfall-assets-vault-audit.md](waterfall-assets-vault-audit.md) | What waterfall/rapids/mist assets the vault actually holds — meshes, shader settings and blend modes read from the NIFs. Read by `worldgen/export_waterfall_fx_textures.py`. | evidence |
| [water-pro-greenheck-study.md](water-pro-greenheck-study.md) | How Dan Greenheck's Water Pro is built, why it looks good, and a ranked gap list against our water material. | research reference |
| [water-rendering-threejs.md](water-rendering-threejs.md) | The four reference water repos verified against their code, and the "why" behind decision 0025. | research reference |
| [ambient-audio-soundscape-threejs.md](ambient-audio-soundscape-threejs.md) | How to build a region-distinct, time- and weather-aware ambient soundscape on Web Audio for GitHub Pages. | research reference |
| [reference/README.md](reference/README.md) | Reference imagery (waterfall target shots) used to judge the water and falls work. | evidence |

# Should Elder Souls: Argonia move to Godot 4?

Assessment for the owner, 2026-10-01. Read-only research lane; repo facts in
`tooling/.reports/research/godot/repo-grounding.md`.

## 1. The answer

**Stay on the current browser stack and finish the WebGPU port. Do not move to
Godot. Confidence: high (about 85%).**

Godot is a good engine, but its browser version is the weak part of it, and
the browser is where this game lives. When Godot exports to the web it can use
only its reduced "Compatibility" renderer: the older WebGL 2 graphics
interface (the 2017-era way a web page talks to the graphics chip). It cannot
use WebGPU (the newer, faster interface) and it cannot run compute shaders
(small programs that run on the graphics chip for effects such as volumetric
fog), as of Godot 4.7 in June 2026. The project already has a working WebGPU
branch with froxel fog (fog stored in a 3D grid in front of the camera) built
on exactly those compute shaders (decisions 0111, 0112). Moving to Godot would
mean giving up that renderer, rebuilding about 117,000 lines of TypeScript and
then having you re-accept every visual system by eye, to arrive at a browser
build that is technically weaker than the one you have. Godot's real strength
is native apps (a Mac app, an Android app). That only becomes a serious option
if you drop "played in the browser".

## 2. Side by side

| What you care about | Stay (three.js, browser) | Switch (Godot 4) |
|---|---|---|
| Speed of development with agents | Fast now: 241 test files, type checking, everything is code | Months of porting first; agents write GDScript (Godot's own language) less reliably than TypeScript |
| How error-prone | Type checker and the data-integrity gate (decision 0104) catch broken references before you play | GDScript types are optional; scene files link by node path, which breaks silently when renamed |
| Back-and-forth per new feature | Unchanged | Higher for a year: every system re-tuned and re-walked |
| Skyrim and mod assets | Working pipeline: NIF to glTF with PyNifly, KTX2 textures, meshopt | glTF imports fine; the texture step and the animation import need rebuilding |
| Performance on the M2 | WebGPU branch; 57 fps in the jungle after round 12 | Web build: WebGL 2 only, single-threaded on GitHub Pages. Native Mac app: better |
| Performance on the phone | WebGPU on Chrome for Android, WebGL 2 fallback | Web build: reported crashes on mobile browsers. Android app: clearly better |
| Many large interlocking systems | Data records with ids, checked by tests and gates | Possible, but Godot's editor-and-scene habits pull away from that |
| Data-driven, code-first | Native fit | Workable, against the grain of the tool |
| How combat will feel | Tuned feel kept | Physics engine changes (Jolt); every timing re-felt |
| Visual checks with no GPU here | Headless Chrome with a software renderer; `npm run look` | Same kind of software rendering (Xvfb and llvmpipe); no better |

## 3. What would actually happen

- **If we switch, the fog, canopy light shafts and lantern halos are lost on the
  web build**, because Godot's browser renderer has no volumetric fog and no
  compute shaders.
- **If we switch, the 13 rounds of vegetation performance work are thrown
  away**, because that work tuned three.js's own instancing on the M2; Godot's
  MultiMesh (its tool for drawing many copies of one plant) has to be tuned
  again from zero.
- **If we switch and stay in the browser, walking across the world will
  stutter more**, because a single-threaded web build loads new areas on the
  same thread that draws the frame, and GitHub Pages cannot send the headers
  that the threaded build needs.
- **If we switch, the phone becomes the riskiest device**: there are published
  reports of Godot 4 web builds crashing on mobile browsers after a few
  minutes of play.
- **If we stay, a broken quest is more likely to be caught by a test than found
  10 hours into a playthrough**, because quest gates are typed records that the
  integrity gate checks on every change; Godot gives no equivalent by default.
- **If we stay, climbing, swimming and boats (Phase 9) start next on the
  existing character code**; in Godot they would wait until combat and movement
  had been rebuilt and re-felt.
- **If we stay, our agents keep working in a language they know well**;
  three.js's new shader language (TSL) is young, so agents sometimes misuse
  it, which is the main cost on our side.
- **If we switch to a native Android app instead of the browser, the phone
  would run noticeably better**, because native code and Vulkan beat
  WebAssembly (code compiled to run inside a web page) and WebGL on the same
  chip.

## 4. What a migration would involve

Kept: the Python world pipeline (about 208,000 lines: terrain, water, places,
the placement workbench), the world data records, the lore and quest design,
the sourced assets and the 115 decision records.

Rebuilt: terrain streaming, water, sky, weather, vegetation, fire, interiors,
the character, combat, input and animation (`packages/game-core`, about 70,000
lines; `packages/character`, about 9,000), the simulation packages (TypeScript
cannot run in Godot, and C# cannot be exported to the web), and the
world-studio review app (about 26,000 lines).

Rough size: 40 to 70 agent sessions, plus 15 to 30 walks by you to re-accept
each system, during which no new world or game content moves forward. Published
ports of much smaller games took 3 to 6 months of a person's time, and the
graphics layer was always the slow part (Road to Vostok, Sigil of Kings). The
usual failure of a mid-project engine change is a long stretch of rebuilding
what already worked, at the end of which the game is where it was.

## 5. The options

1. **Stay and finish the WebGPU port (recommended).** It keeps all past work,
   and WebGPU is now in every major browser.
2. **Hybrid: a Godot game client fed by the Python world pipeline.** This keeps
   the world data but still rebuilds every runtime system. It is only worth it
   for native apps.
3. **Full switch.** As in section 4.

What would change this: you deciding the game ships as Mac and Android apps
rather than in the browser (then option 2 deserves a proper trial); Godot
shipping an official WebGPU web renderer with compute shaders; or the WebGPU
branch failing on the Honor phone in a way the WebGL 2 fallback cannot cover.
A cheap check before any of that: open the `/webgpu/` studio on the Honor phone
and note the frame rate.

## 6. Sources

- Godot docs, Exporting for the Web (4.7, read 2026-10-01): WebGL 2 only, no WebGPU, no C# on web, threads need special headers. https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html
- Godot docs, Overview of renderers: Compatibility lacks volumetric fog, compute shaders, SSR, decals; 8 lights per mesh. https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html
- Godot 4.7 release coverage (2026-06-19): wasm64, no WebGPU. https://app.cinevva.com/news/2026-06-19-godot-4-7-released
- Godot, Web export in 4.3 (2024): single-threaded builds; 40 MB wasm, 5 MB with Brotli. https://godotengine.org/article/progress-report-web-export-in-4-3/
- Godot 4.6 release (2026-01): Jolt the default 3D physics, new IK. https://godotengine.org/releases/4.6/
- Godot, What's missing for AAA: no built-in streaming. https://godotengine.org/article/whats-missing-in-godot-for-aaa/ ; proposal #1197 https://github.com/godotengine/godot-proposals/issues/1197
- Terrain3D platforms (1.1 docs): web export "very experimental". https://terrain3d.readthedocs.io/en/latest/docs/platforms.html ; Mac and Chrome rendering fault (2026). https://devnt90.itch.io/rexs-relics/devlog/1533649/the-terrain3d-fragment-shader-bug-a-web-export-horror-story
- Mobile browser crashes, Godot 4.4.1 forum (2025). https://forum.godotengine.org/t/godot-4-4-1-html-exports-resets-crashes-when-playing-on-mobile-browsers/114247
- Babylon.js forum on Godot web performance (2025, anecdotal). https://forum.babylonjs.com/t/performance-compared-to-godot-and-other-engines/59731
- Agents and GDScript: Hacker News thread (2026). https://news.ycombinator.com/item?id=47400868 ; DEV post. https://dev.to/mistyhx/why-ai-writes-better-game-code-in-godot-than-in-unity-10hf
- Godot with no GPU: off-screen rendering proposal #5790. https://github.com/godotengine/godot-proposals/issues/5790
- PyNifly (NIF import into Blender). https://github.com/BadDogSkyrim/PyNifly
- Engine ports: Road to Vostok, 615 hours. https://www.pcgamer.com/hardcore-survival-shooter-road-to-vostok-is-looking-really-good-after-switching-engines-from-unity-to-godot/ ; Sigil of Kings, 6 months. https://byte-arcane.itch.io/sigil-of-kings/devlog/701930/unity-to-godot-port-complete
- Chrome WebGPU on Android 12+ with Qualcomm GPUs. https://developer.chrome.com/docs/web-platform/webgpu/overview
- Honor Magic V5: Snapdragon 8 Elite, Adreno 830, 12 to 16 GB. https://www.gsmarena.com/honor_magic_v5-13982.php
- Repo: decisions 0084, 0089, 0104, 0111 and 0112 (the latter two on the `webgpu` branch), `docs/phases/lanes/vegetation-renderer-lane.md`, line counts from `tooling/.reports/research/godot/repo-grounding.md`.

Thin spots: no controlled benchmark of Godot web against three.js exists; no
published frame rates for either on the Honor phone; the session estimate in
section 4 is a judgement from this repo's phase history, not a measurement.

# Should Elder Souls: Argonia move to Godot 4?

Assessment for the owner, 2026-10-01. The research notes are in
`tooling/.reports/research/godot/`: 01 web on phone and Mac, 02 WebGPU
roadmap, 03 agents and testing, 04 open-world streaming, 05 native apps,
06 engine-switch case studies, plus the repo facts.

## 1. The answer

**Stay on the current browser stack and finish the WebGPU port. Do not move to
Godot. Confidence: high.** The evidence on the browser build is primary
(Godot's own documentation and issue tracker). The cost estimate is my
judgement.

Godot is a good engine, but its browser version is its weakest part, and the
browser is where this game lives. In the browser Godot 4.7 can only use its
reduced "Compatibility" renderer. That renderer runs on WebGL 2 (the older way
a web page talks to the graphics chip) and has no compute shaders (small
programs on the graphics chip that effects like volumetric fog need). Godot's
own proposal to add WebGPU (the newer interface) has been open since April 2023,
marked "implementer wanted", with no linked work. Our `webgpu` branch already
runs froxel fog (fog held in a 3D grid in front of the camera) on compute
shaders (decisions 0111 and 0112). A switch would rebuild about 117,000 lines of
TypeScript and ask you to re-accept every visual system by eye. The browser
game at the end would be weaker than the one you have. Godot's real strength is
native apps for Mac and Android. That only becomes a serious option if you give
up "played in the browser".

## 2. Side by side

| What you care about | Stay (three.js, browser) | Switch (Godot 4) |
|---|---|---|
| Speed of development with agents | Fast now: 241 TypeScript and 269 Python test files, type checking, everything is code | Months of porting first. GDScript (Godot's language) has less training data, and agents mix up Godot 3 and Godot 4 calls |
| How error-prone | The type checker and the data-integrity gate (decision 0104) catch broken references before you play | GDScript types are optional. Scenes link by node path, which breaks silently on a rename |
| Back-and-forth per new feature | Unchanged | Higher for a year: every system re-tuned and walked again |
| Skyrim and mod assets | Working: NIF to glTF through PyNifly, KTX2 textures, meshopt | glTF imports. The texture step and the animation import need rebuilding |
| M2 Mac | WebGPU branch. 57 fps in the jungle after vegetation round 12 | Browser: WebGL 2 only, with known Chrome-on-Mac faults. Mac app: Metal, clearly faster |
| Honor phone | WebGPU in Chrome for Android, WebGL 2 fallback | Browser: reports of crashes after minutes of play. Android app: clearly faster |
| Many interlocking systems | Records with ids, checked by gates and tests | Possible, but Godot's editor-and-scene habits pull away from that |
| Data-driven, code-first | A natural fit | Workable, against the grain of the tool |
| Combat feel | The tuned feel is kept | New physics engine (Jolt). Every timing re-felt |
| Visual checks without a GPU here | Headless Chrome with a software renderer; `npm run look` | The same method (Xvfb, a virtual screen, with a software renderer). No better |

## 3. What would actually happen

- **If we switch, the fog, canopy light shafts and lantern halos disappear from
  the browser game.** Godot's browser renderer has neither volumetric fog nor
  compute shaders.
- **If we switch, the 13 rounds of vegetation performance work are lost.** That
  work tuned three.js on your M2. Godot's tools for drawing many copies of a
  plant would have to be tuned again from zero, and its scatter addons get poor
  reviews on Godot 4.6.
- **If we switch and stay in the browser, walking into new areas stutters.** On
  GitHub Pages Godot runs on one thread, so loading happens on the thread that
  draws the picture. The threaded build needs a workaround that is known to
  break in Safari and Firefox.
- **If we switch, the phone becomes the riskiest device.** Godot 4 browser
  builds have published reports of crashes on mobile browsers (2025) and of
  memory creeping up in an empty project (2026).
- **If we switch, agents will write more code that runs but looks wrong.** In
  GameDevBench, a 2026 benchmark of agents doing Godot tasks, the best agents
  solved 38% of 3D graphics tasks.
- **If we stay, a broken quest is more likely to be caught by a test than found
  10 hours into a playthrough.** Quest conditions are typed records, and the
  integrity gate checks them on every change.
- **If we stay, climbing, swimming and boats (Phase 9) start next on the
  existing character code.** In Godot they would wait until movement and combat
  had been rebuilt and re-felt.
- **If we stay, the main cost is TSL**, three.js's young shader language.
  Agents sometimes misuse it.

## 4. What a migration would involve

Kept: the Python world pipeline (about 208,000 lines), the world records, lore,
quest design, sourced assets and the decision records.

Rebuilt: everything the player sees and touches. That is terrain streaming,
water, sky, weather, vegetation, fire and interiors. It is also the character,
combat and animation (`packages/game-core` is about 70,000 lines and
`packages/character` about 9,000). The simulation packages go too, because
Godot cannot run TypeScript and cannot put C# in a browser build. So does the
review studio (about 26,000 lines).

Rough size: 40 to 70 agent sessions and 15 to 30 walks by you, during which the
world and the game make no progress. The switches that went well were mid-sized
games that kept their code language. Slay the Spire 2 took about seven months
and Road to Vostok 615 hours. Sigil of Kings took six months, most of it on
rendering. Duke Nukem Forever's 1998 switch was estimated at six weeks; the game
shipped in 2011.

## 5. The options

1. **Stay and finish WebGPU (recommended).** All past work stays useful, and
   every major browser now has WebGPU.
2. **Native apps without changing engine.** Wrapping the same game as a Mac
   app (Electron) or an Android app (Capacitor) gives an installable game, but
   not native speed. Kept in reserve.
3. **A Godot client fed by the Python pipeline.** Worth a trial only if the
   game becomes a Mac and Android app. A Mac app then costs $99 a year for
   Apple signing. Android now requires developer verification even outside the
   Play Store. Each walk would mean a new download instead of a link.
4. **Full switch.** As in section 4.

**What would reverse this.** You choose native apps over the browser. Godot
ships an official WebGPU browser renderer; the community forks (one in beta
since May 2026) do not count yet. Or the `webgpu` branch fails on the Honor in
a way the WebGL 2 fallback cannot cover. The cheapest test: open the `/webgpu/`
studio on the Honor and note the frame rate.

## 6. Sources

- Godot docs, Exporting for the Web, 4.7 (read 2026-10-01). https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html
- Godot docs, Overview of renderers (read 2026-10-01). https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html
- Godot 4.7 release coverage (2026-06-19). https://app.cinevva.com/news/2026-06-19-godot-4-7-released
- Godot, Web export in 4.3 (2024-05). https://godotengine.org/article/progress-report-web-export-in-4-3/
- Single-threaded background loading, Godot forum (2024-08). https://forum.godotengine.org/t/can-we-do-single-thread-background-loading-in-godot-4-3/76473
- GitHub Pages headers discussion #13309 (2022 to 2025-08). https://github.com/orgs/community/discussions/13309
- Chrome on Mac, Godot issue #95832 (2024-08). https://github.com/godotengine/godot/issues/95832
- Web against native frame rate, issue #86913 (2024-01). https://github.com/godotengine/godot/issues/86913
- Mobile browser crashes, Godot forum (2025-06). https://forum.godotengine.org/t/godot-4-4-1-html-exports-resets-crashes-when-playing-on-mobile-browsers/114247
- Memory growth in web export, Godot forum (2026). https://forum.godotengine.org/t/memory-leak-on-web-export/141309
- WebGPU proposal #6646 (opened 2023-04-06, read 2026-10-01). https://github.com/godotengine/godot-proposals/issues/6646
- Godot priorities page (read 2026-10-01). https://godotengine.org/priorities/
- Community WebGPU fork, beta 2026-05-10. https://github.com/dwalter/godotwebgpu
- Godot 4.4 release, Metal on Apple Silicon (2025-03). https://godotengine.org/releases/4.4/
- Godot 4.6 release, Jolt default (2026-01). https://godotengine.org/releases/4.6/
- What's missing for AAA, no streaming (2023). https://godotengine.org/article/whats-missing-in-godot-for-aaa/
- Open-world management, Godot forum (2026-04). https://forum.godotengine.org/t/how-are-massive-open-world-games-actually-managed/136773
- Scatter tools on 4.6, Godot forum (2026-04). https://forum.godotengine.org/t/mesh-scatter-paint-tools-for-godot-4-6/135963
- Terrain3D platforms, 1.1 docs (read 2026-10-01). https://terrain3d.readthedocs.io/en/latest/docs/platforms.html
- GameDevBench (2026-06-30). https://www.alphaxiv.org/abs/2602.11103
- Godot 4 calls agents get wrong, DEV (2026). https://dev.to/ziva/7-godot-4-api-calls-your-ai-assistant-still-gets-wrong-3ep6
- gdUnit4 command-line tool (read 2026-10-01). https://godot-gdunit-labs.github.io/gdUnit4/latest/advanced_testing/cmd/
- Off-screen rendering proposal #5790 (2022, open). https://github.com/godotengine/godot-proposals/issues/5790
- Native wrappers for web games (read 2026-10-01). https://abratabia.com/native-wrappers/
- Apple distribution outside the App Store (read 2026-10-01). https://developer.apple.com/macos/distribution/
- Android developer verification (2026-03). https://android-developers.googleblog.com/2026/03/android-developer-verification-rolling-out-to-all-developers.html
- Chrome WebGPU on Android (2024-01). https://developer.chrome.com/docs/web-platform/webgpu/overview
- Honor Magic V5 specification (2025-07). https://www.gsmarena.com/honor_magic_v5-13982.php
- Casey Yano, On Evaluating Godot (2023-10). https://caseyyano.com/on-evaluating-godot-b35ea86e8cf4
- Slay the Spire 2 switch, PC Gamer (2024-04). https://www.pcgamer.com/games/card-games/slay-the-spire-2-ditched-unity-for-open-source-engine-godot-after-2-years-of-development/
- Road to Vostok port, 615 hours (2024-07). https://www.patreon.com/posts/godot-engine-to-107308034
- Sigil of Kings port (2024-03). https://byte-arcane.itch.io/sigil-of-kings/devlog/701930/unity-to-godot-port-complete
- Development of Duke Nukem Forever (read 2026-10-01). https://en.wikipedia.org/wiki/Development_of_Duke_Nukem_Forever
- Repo: decisions 0084, 0089, 0104, and 0111 and 0112 on the `webgpu` branch; `docs/phases/lanes/vegetation-renderer-lane.md`.

What is thin: no controlled benchmark compares Godot's browser build with
three.js. No frame rates are published for either on the Honor. No shipped
Godot 4 open world has published how it streams. The session estimate in
section 4 is a judgement from this repo's phase history.

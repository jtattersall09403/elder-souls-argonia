# Should Elder Souls: Argonia move to Godot 4?

Assessment for the owner, 2026-10-01. The comparison is (A) three.js as now,
in the browser or wrapped as an app, against (B) Godot 4 built as native apps
for the M2 Mac and the Honor Magic V5. The browser is not a requirement. The
research notes are in `tooling/.reports/research/godot/`; the native findings
are in `07-native-frame.md`.

## 1. The answer

**Stay on three.js and finish the WebGPU port. This is now a closer call.
Confidence: medium.** The answer could change on one measurement: how the
WebGPU build runs on the Honor.

Native Godot runs the game's own work (streaming, physics, culling, animation)
as compiled code on several processor cores. That is much faster than
JavaScript in a browser tab, so most of the performance work this project has
done would have been cheaper. The graphics chip itself does about the same work
either way. On the phone, Godot's native renderer has weaknesses of its own.
Its phone renderer ("Mobile") has no volumetric fog, no real-time global
illumination (light bouncing off surfaces) and no screen-space reflections.
Its desktop renderer ("Forward+") is documented as "poorly optimized" on
phones. In 2026, two projects on Snapdragon phones moved to Godot's basic
renderer after display faults and crashes: one on the 8 Gen 3, and one on
the 8 Elite, which is the Honor's chip. On the Mac, Forward+ with Metal (Apple's
graphics interface) gives the full feature set. Against those gains stands
the same porting bill as before: about 117,000 lines rebuilt and every system
re-accepted by eye.

## 2. Side by side

| What you care about | A: three.js (browser or wrapped) | B: Godot native apps |
|---|---|---|
| Speed of development with agents | Fast now: 241 TypeScript and 269 Python test files, type checking | Months of porting first; agents mix up Godot 3 and 4 calls |
| How error-prone | Type checker and the integrity gate (decision 0104) | GDScript types optional; scenes link by node path |
| Back-and-forth per feature | Unchanged | Higher for a year; each code change is a new install |
| Skyrim and mod assets | Working pipeline: NIF to glTF, KTX2, meshopt | glTF imports; textures and animations need a new import step |
| M2 Mac | 57 fps in the jungle after vegetation round 12 | Faster on processor-heavy scenes; Metal had frame-rate regressions in 4.4 |
| Honor phone | WebGPU in Chrome, not yet measured | Faster processor work; Mobile renderer lacks fog and reflections; Adreno 830 crash reports |
| Many interlocking systems | Typed records with ids, gated | Possible, against Godot's scene habits |
| Data-driven, code-first | A natural fit | Workable |
| Combat feel | Kept | Rebuilt on Jolt physics; every timing re-felt |
| Visual checks with no GPU here | Headless Chrome renders the same WebGPU path you see | Software rendering on this VM uses Godot's basic renderer, not the one you run |

## 3. What would actually happen

- **If we switch, the phone game has no volumetric fog or light shafts unless
  we write them ourselves.** Godot's phone renderer leaves them out, and its
  desktop renderer is not built for phones.
- **If we switch, the Mac version gains fog, global illumination and smoother
  streaming without our code.** Forward+ includes them, and native threads load
  areas off the drawing thread.
- **If we switch, each walk starts with an install.** A Mac build must be
  approved once under Privacy & Security, an Android build sideloaded. From
  2027 Google requires developer verification for sideloaded apps.
- **If we switch, walk-packet links stop opening the right spot.** The app needs
  a custom link scheme built for it. Place data could still download without
  a reinstall.
- **If we switch, agents check pictures on a different renderer from yours.**
  This VM has no GPU, so Godot can only render here with its basic renderer.
- **If we switch, the 13 vegetation performance rounds are discarded**, along
  with the water, sky and fire work, and you walk each one again.
- **If we stay, a broken quest is more likely to fail a test than surface 10
  hours into a playthrough.** Quest conditions are typed records checked on
  every change.
- **If we stay and wrap the game as an app, nothing gets faster.** Electron on
  the Mac and Capacitor on Android run the same Chrome engine. They add an
  install icon, offline play and higher memory limits.

## 4. What leaving the browser changes

You lose: free hosting on GitHub Pages, instant updates on every push, play with
no install, and walk links that open a spot on any device. You gain: faster
processor-heavy work, full engine features on the Mac, and no tab memory
limits. Costs: an Apple Developer account ($99 a year) to remove the Mac
warning, and Android developer verification ($25) from 2027.

## 5. What a migration would involve

Kept: the Python world pipeline (about 208,000 lines), world records, lore,
quest design, sourced assets and decisions. The web studio could stay as the
map and review tool.

Rebuilt: terrain streaming, water, sky, weather, vegetation, fire, interiors,
character, combat and animation (`packages/game-core` about 70,000 lines,
`packages/character` about 9,000), the simulation packages (Godot cannot run
TypeScript), and new build, signing and walk-link tooling.

Rough size: 45 to 75 agent sessions and 15 to 30 walks by you, with the world
standing still meanwhile. Slay the Spire 2 took about seven months to switch,
Road to Vostok 615 hours and Sigil of Kings six months, mostly on rendering.
All three kept their code language; we could not.

## 6. The options

1. **Stay and finish WebGPU (recommended).**
2. **Wrap three.js as apps.** Cheap, adds an installable game, no speed.
3. **Godot native client fed by the Python pipeline.** The real alternative.
4. **Full switch, studio included.** No advantage over option 3.

**What would flip this to option 3.** The WebGPU build cannot hold a playable
frame rate on the Honor in a dense place after the planned performance work, and
the cause is processor time rather than the graphics chip. The next step would
be a trial of three to five sessions: one terrain tile and one place in native
Godot on the Honor, measured against the WebGPU build. Also an Apple or Google
change that blocks WebGPU, or you choosing an app store release.

## 7. Sources

- Godot docs, Overview of renderers (read 2026-10-01). https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html
- Godot docs, Volumetric fog (read 2026-10-01). https://docs.godotengine.org/en/stable/tutorials/3d/volumetric_fog.html
- Forward+ on Android, Godot forum (2024-09). https://forum.godotengine.org/t/forward-does-not-work-on-android-in-spite-of-full-vulkan-support/83491
- Godot 4.4, Metal backend (2025-03). https://godotengine.org/releases/4.4/
- Metal frame-rate regression on M1, issue #103723 (2025-03). https://github.com/godotengine/godot/issues/103723
- SDFGI on Metal, M2 Pro, issue #96077 (2024-08). https://github.com/godotengine/godot/issues/96077
- Godot 4.5.2, Android Vulkan crash fixes (2026-03-19). https://godotengine.org/article/maintenance-release-godot-4-5-2/
- Adreno 750 tearing, fallback to Compatibility (2026-09). https://github.com/OpenGameStack-Games/LetterLogic/issues/170
- Snapdragon 8 Elite (Galaxy S25 Ultra) Vulkan crash, fallback to Compatibility (2026-09). https://github.com/MrLogic85/Node-Runner/issues/104
- Vulkan Mobile crash, Godot 4.7.2, issue #123376 (2026-09). https://github.com/godotengine/godot/issues/123376
- Snapdragon 8 Elite throttling (2024-11). https://gadgets.beebom.com/guides/snapdragon-8-elite-benchmark-specs
- Honor Magic V5 specification (2025-07). https://www.gsmarena.com/honor_magic_v5-13982.php
- WebGPU dispatch overhead against native (2026-04). https://arxiv.org/html/2604.02344v1
- Exporting for macOS, Godot docs source (read 2026-10-01). https://github.com/godotengine/godot-docs/blob/master/tutorials/export/exporting_for_macos.rst
- macOS Sequoia Gatekeeper change (2024-08-07). https://www.idownloadblog.com/2024/08/07/apple-macos-sequoia-gatekeeper-change-install-unsigned-apps-mac/
- Apple distribution outside the App Store (read 2026-10-01). https://developer.apple.com/macos/distribution/
- Android developer verification (2026-03). https://android-developers.googleblog.com/2026/03/android-developer-verification-rolling-out-to-all-developers.html
- godot-export GitHub action (read 2026-10-01). https://github.com/firebelley/godot-export
- Off-screen rendering proposal #5790 (open, read 2026-10-01). https://github.com/godotengine/godot-proposals/issues/5790
- Native wrappers for web games (read 2026-10-01). https://abratabia.com/native-wrappers/
- Chromium, WebGPU on Android WebView (2025). https://groups.google.com/a/chromium.org/g/blink-dev/c/8Fy8vnSyNic
- Godot 4.6, Jolt default (2026-01). https://godotengine.org/releases/4.6/
- No built-in streaming, What's missing for AAA (2023). https://godotengine.org/article/whats-missing-in-godot-for-aaa/
- GameDevBench (2026-06-30). https://www.alphaxiv.org/abs/2602.11103
- Godot 4 calls agents get wrong (2026). https://dev.to/ziva/7-godot-4-api-calls-your-ai-assistant-still-gets-wrong-3ep6
- Casey Yano, On Evaluating Godot (2023-10). https://caseyyano.com/on-evaluating-godot-b35ea86e8cf4
- Road to Vostok port (2024-07). https://www.patreon.com/posts/godot-engine-to-107308034
- Sigil of Kings port (2024-03). https://byte-arcane.itch.io/sigil-of-kings/devlog/701930/unity-to-godot-port-complete
- Repo: decisions 0084, 0089, 0104, and 0111 and 0112 on the `webgpu` branch; `docs/phases/lanes/vegetation-renderer-lane.md`.

**Footnote, Godot in the browser.** Godot 4.7's browser build uses only its
basic WebGL 2 renderer, with no WebGPU or compute (docs, read 2026-10-01). Its
WebGPU proposal has been open since 2023-04 with no linked work. It is weaker
than the current WebGPU branch and is not an option (notes 01 and 02).

What is thin: no published frame rates for a Godot open world on an M2 or a
Snapdragon 8 Elite, and none yet for the WebGPU branch on the Honor. The session
estimate is a judgement from this repo's history.

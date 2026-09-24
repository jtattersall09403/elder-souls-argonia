# @elder-souls/audio

The game's audio layer (world module 57). The files and pipeline are
decision [0094](../../docs/decisions/0094-audio-ships-as-opus-webm-sets-read-from-the-plugin-loops-crossfade-at-runtime.md);
the runtime is decision [0095](../../docs/decisions/0095-audio-runtime-is-an-injected-manager-over-an-engine-interface-fed-by-typed-sound-events.md).

## What is here

| Path | What |
|---|---|
| `files/` | Shipped Opus/WebM audio and `audio-manifest.json`. Built by `tooling/audio-pipeline`; never edited by hand. |
| `plugin.mjs` (`@elder-souls/audio/plugin`) | Vite plugin. It serves `files/` at `<base>audio/` in dev and copies the tree into the build. `{ sharedBase }` means an app that deploys beside another copies nothing. |
| `src/manifest.ts` | Manifest types (`AudioManifest`, `SoundSet`, `AudioAsset`), `parseManifest` and `setBytes`. |
| `src/events.ts` | The sound-event vocabulary (`SoundEvent`), `candidateSets` (event → set ids, with fallbacks) and `SoundEventBus`. |
| `src/surfaces.ts` | The footstep contract: `footstepSurface({ physical?, groundMaterialId?, waterDepthM? })`. |
| `src/ambience.ts` | The ambient-bed contract: `AmbienceInputs`, `AmbienceTable` and the pure `selectAmbience`. |
| `src/manager.ts` | `AudioManager`: buses, unlock, event playback, voice cap, bed crossfade loop, positional emitters, details, acoustic states and streaming. |
| `src/cache.ts` | `AssetCache`: fetch and decode on demand, retain while playing, unload when idle or over the decoded ceiling. |
| `src/backend.ts`, `src/threeBackend.ts` (`@elder-souls/audio/three`) | The engine boundary and its three.js implementation. The listener sits on the app's camera. |
| `src/fakeBackend.ts` | A deterministic backend for tests. |

## How an app uses it

```ts
import { AudioManager, SoundEventBus, parseAmbienceTable, parseManifest, selectAmbience } from "@elder-souls/audio";
import { createThreeAudio } from "@elder-souls/audio/three";

const base = `${import.meta.env.BASE_URL}audio/`;
const manifest = parseManifest(await (await fetch(`${base}audio-manifest.json`)).json());
const { backend } = createThreeAudio(camera);          // the listener rides the app's camera
const audio = new AudioManager({ backend, manifest, baseUrl: base, listenerPosition: () => camera.position });
const sounds = new SoundEventBus();                    // one per session; hand it to every emitter
audio.attach(sounds);
// every gesture, not once: a keyboard or gamepad player unlocks too, and iOS
// suspends the context on interruptions (a call, the app backgrounded); resume
// is a no-op while it runs. Before unlock, one-shots are dropped.
for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, () => audio.unlock());
// per frame:
audio.update();
// the region table (world data, Phase 12b), validated against the manifest once:
const table = parseAmbienceTable(tableJson, manifest);
// when the clock, weather, region or acoustic state changes (not every frame):
audio.setAmbience(selectAmbience(table, inputs));
audio.setAcousticState(inputs.acoustic);
// events (one-shots):
sounds.emit({ type: "combat.hit", weapon: "blade", target: "flesh", at: hitPoint, source: attackerId });
// continuous sources (a carried torch, a river's nearest point) are emitters, not events:
audio.addEmitter("player-torch", "object.torch.burn", torchPosition);
audio.moveEmitter("player-torch", torchPosition);   // as it moves
audio.removeEmitter("player-torch");
```

Add the plugin in `vite.config.ts`: `plugins: [audioFiles()]` (from
`@elder-souls/audio/plugin`).

## Rules

- **No singletons.** The app owns the manager and the event bus, and
  injects them. Tests use `FakeAudioBackend` and a seeded `random`.
- **Beds never loop on one node.** The manager starts each cycle at
  `loopStart` and crossfades it into the next inside the pad (0094 §4).
- **Only what a scene needs streams.** Sets load on first use, or through
  `prefetch(sets)` when a scene is entered: prefetched sets stay pinned
  until `unpin(sets)` on exit, so an action sound never waits on a fetch.
  Unpinned idle clips unload after `idleUnloadS` (default 60 s), and the
  idle clips kept for reuse stay under `maxIdleDecodedBytes` (default
  16 MB). Playing and pinned clips are the working set: prefetch a scene's
  subset, never every set.
- **Nothing plays before the first gesture.** One-shots fired while the
  context is suspended are dropped, not queued.
- **Ground truth for footsteps is the physical material.** Pass the
  collider's `PhysicalMaterialId` or the terrain's ground-material id, never
  the rendered texture.

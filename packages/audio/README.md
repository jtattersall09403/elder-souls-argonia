# @elder-souls/audio

The game's audio layer (world module 57; decision
[0094](../../docs/decisions/0094-audio-ships-as-opus-webm-sets-read-from-the-plugin-loops-crossfade-at-runtime.md)).

- `files/`: shipped Opus/WebM audio and `audio-manifest.json`, built by
  `tooling/audio-pipeline`, never edited by hand.
- `plugin.mjs` (`@elder-souls/audio/plugin`): Vite plugin serving `files/` at
  `<base>audio/` in dev and copying it into the build.
- `src/manifest.ts`: manifest types, `parseManifest`, `setBytes`.

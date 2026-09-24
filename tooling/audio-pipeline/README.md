# Audio pipeline

Vanilla Skyrim sounds → the files the game ships (decision
[0094](../../docs/decisions/0094-audio-ships-as-opus-webm-sets-read-from-the-plugin-loops-crossfade-at-runtime.md)).
Sources come from the asset vault (`$ELDER_SOULS_ASSET_ROOT`, default
`../elder-scrolls-asset-pipeline`): `skyrim-source/Data/Skyrim - Sounds.bsa`
and `Skyrim.esm`. The BSA and plugin readers are reused from
`tooling/asset-pipeline/pipeline`.

| File | Role |
|---|---|
| `selection.json` | what ships: explicit sets (SNDR editor ids), the footstep generator (FSTS footwear × gait × MATT surface) and the region generator (REGN tables); encoder settings |
| `audio_pipeline/esm_sounds.py` | Skyrim.esm SNDR/MATT/IPCT/IPDS/FSTP/FSTS/REGN/WTHR reader (cached in the vault) |
| `audio_pipeline/codec.py` | ffmpeg decode (wav, xWMA) and Opus-in-WebM encode, bit-exact |
| `audio_pipeline/loops.py` | loop-safe beds: periodic resample, crossfade repair, wrapped pads, the seam and runtime-join scores |
| `audio_pipeline/build.py` | selection → `packages/audio/files/<assetId>.webm` + `audio-manifest.json`; evidence → `provenance.json`; `--check` |
| `audio_pipeline/inventory.py` | the BSA folder summary → `inventory.json`; `--extract <folder>` unpacks to the vault for auditioning |
| `provenance.json` | per asset: source path and hash, codec, bitrate, peak, loop-seam evidence (not shipped) |

Run from this folder: `python3 -m audio_pipeline.build` (about 70 s for the
round-1 selection), then `python3 -m audio_pipeline.build --check`. Tests:
`python3 -m pytest -q` (ffmpeg tests skip without ffmpeg; the manifest test
needs no vault). `npm test -w @elder-souls/audio` runs them with the package.

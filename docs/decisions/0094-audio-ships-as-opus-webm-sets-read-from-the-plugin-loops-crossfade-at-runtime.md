# 0094 — Audio ships as Opus in WebM; sound sets are read from Skyrim.esm; beds loop by a runtime crossfade inside a wrapped pad; one package owns the runtime and the files

**Date:** 2026-09-24. **Status:** accepted (sound-prep lane, round 1, under
0087's delegation). Implements the first sourcing job of Phase 12b (module 57
§107) ahead of the phase; the soundscape stays polish tier (0023).

## Decisions

1. **Sources.** `Skyrim - Sounds.bsa` (Steam depot 72851, manifest
   430694959351693705) sits in the vault. It holds 4,917 files, 953 MB: 4,681
   wav (16-bit PCM, 8–44.1 kHz) and 236 xWMA, all of them music; no fuz
   (voices live in the voice archives). The folder inventory is
   `tooling/audio-pipeline/inventory.json`. The BSA and plugin readers are
   reused from `tooling/asset-pipeline` (`bsa.py`, `npc_records.py`).
2. **A sound set is a vanilla record, never a filename guess.** A set names
   one or more SNDR records; its variants are their ANAM tracks, and its loop
   flag, dB variance, pitch variance and static attenuation come from LNAM and
   BNAM. A set that merges records with different attenuation (a left and a
   right foot: 13 of 90 generated sets, up to 2.6 dB apart) keeps each
   record's gain per variant. Footstep sets are generated from the plugin's own chain (FSTS
   footwear → FSTP gait → IPDS → MATT → IPCT → SNDR); ambient region sets from
   REGN RDSA rows, keeping the vanilla chance and weather flags. Stable ids:
   an asset is `skyrim/<archive path>`; a set is `<category>.<family>.<…>`
   (`combat.impact.blade.flesh`, `footstep.light.walk.mud`,
   `ambient.marsh.crickets-marsh-night01-lpsd`).
3. **Opus in WebM.** Opus is the smallest codec that is transparent for this
   material. WebM is the one container every target browser decodes through
   `decodeAudioData`: Chrome, Firefox, and Safari from 15 (macOS 12, iOS 15).
   Ogg Opus only decodes from Safari 18.4. The encoder settings are mono 48
   kbps and stereo 64 kbps, scaled by source rate / 32 kHz with a 24 kbps
   floor. They use constrained VBR, 60 ms frames and bit-exact muxing. The
   evidence behind each setting:
   - Plain VBR overshot its target by up to 40 % on dense material.
   - An 8 kHz bird call cost 36 KB at the unscaled rate.
   - Two encodes of the same input produce the same bytes.
   The 391 first-consumer files take 57.8 MB as source wav and ship as
   4.5 MB, 12.3× smaller.
4. **Loops: resample as a period, pad with the loop itself, and crossfade at
   run time.** The measurements are in the round-1 report and in
   `provenance.json`:
   - Vanilla beds are seamless at their own rate: 37 of the 43 first-consumer
     beds have a seam score of 0.41–1.00, and arbitrary cuts inside five
     sampled beds score 0.5–0.9.
   - ffmpeg's resampler breaks the seam (five beds went from 0.6–0.9 to
     1.6–64), so loops are FFT-resampled as one period.
   - A source whose own seam fails is crossfaded tail-into-head: 6 of 43
     (seams 1.06–1.89, and one bed with silence at its join).
   - Opus does not keep the waveform, so a hard loop (`loopStart`/`loopEnd`
     on one node) clicks: all 43 beds score 1.07–123.
   - Each bed ships as `[last 0.1 s][loop][first 0.1 s]`. The runtime starts
     the next cycle at `loopStart` while the current one plays on into the
     pad, crossfading over `fadeS` = 0.05 s. The two voices play two codings
     of the same audio. The rendered join scores 0.40–1.12 on every bed
     (pass ≤ 1.5), whether the decoder trims Opus's 312-sample priming,
     keeps it or over-trims it. The same render with a one-sample fade, which
     is a hard loop, has a median score of 4.45.
   Two scores do the measuring, each against the loop's own texture:
   - The seam score is a linear-prediction click score plus a dropout score
     (≤ 1 passes). Unit tests make it fail on a broken period, a splice and
     priming left in.
   - The runtime-join score compares the rendered boundary with blocks of
     the loop body of the same length (the click term against their 95th
     percentile, a level-dip term against the quietest block). It fails on
     a pad that steps away from the loop and on a lost pad. One crackle in
     the body leaves it unchanged.
5. **One package, `packages/audio` (`@elder-souls/audio`).** It holds the
   runtime (manifest types, event vocabulary, contracts, AudioManager behind
   an engine interface; round 2) and the shipped files (`files/`, the manifest
   at `files/audio-manifest.json`). A Vite plugin (`@elder-souls/audio/plugin`)
   serves the files at `<base>audio/`, following the `character-assets`
   pattern. The shipped manifest carries only what the runtime and the budget
   need. Provenance (source hash, bitrate, peak, seam evidence) is
   `tooling/audio-pipeline/provenance.json`, which stays in the repo and is
   never downloaded.
6. **Only what a scene needs streams.** Nothing but the manifest loads at
   startup; sets load on first use or on a scene's prefetch. Round-1 costs:
   - the whole first-consumer set: 4.5 MB;
   - a marsh exterior with rain and thunder: 1.5 MB;
   - every combat set: 1.1 MB;
   - light-armour footsteps on every surface: 0.4 MB.

## Consequences

- `python3 -m audio_pipeline.build` (from `tooling/audio-pipeline`) rebuilds
  `packages/audio/files` from `selection.json`; `--check` verifies every file
  against the manifest and every loop's join. The package's `npm test` runs
  the vitest suite and the pipeline's pytest suite.
- Vanilla has no mud footstep: Skyrim.esm maps `MaterialMud` to the dirt
  sounds, so `footstep.*.mud` plays dirt until a sourced mud set replaces it
  (the sourcing row is in the lane doc).
- The AudioManager's bed player must implement item 4's crossfade. A plain
  `loop = true` on one source node is the defect this record measured.

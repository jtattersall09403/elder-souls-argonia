# Sound-prep lane (Opus lead, decision 0087)

Prepares the audio layer ahead of Phase 12b (the soundscape stays polish tier,
[0023](../../decisions/0023-soundscape-polish-tier-and-credits.md)). The lane
builds the pipeline from vanilla sources to shipped files, the runtime
package the apps inject, and the budget gate. It does not wire any app:
the combat lane and 16h (or later) consume it through the handoffs below.
Design: [module 57](../../world/57-audio-soundscape.md) §105–108 and the
[research](../../research/rendering/ambient-audio-soundscape-threejs.md);
decision [0094](../../decisions/0094-audio-ships-as-opus-webm-sets-read-from-the-plugin-loops-crossfade-at-runtime.md).

## Folders

- **Owns:** `tooling/audio-pipeline/**`; `packages/audio/**`; this doc and
  its row in [README.md](README.md); new decision records; its PROGRESS
  side-lanes row; root README § Credits only when a mod pack is sourced.
- **Never touches:** 16h's folders (`tooling/world-generation`,
  `tooling/asset-pipeline`, `packages/game-core/src/settlement`, `world/`,
  `apps/world-studio`, `docs/phases/16-*`, root `README.md` outside the
  credits section, root `package.json`); the combat-sandbox lane's folders
  (`apps/combat-sandbox`, `packages/game-core/src/{combat,equipment,anim,locomotion,inventory,core,actors,ai,perception,fx}`,
  `packages/character`, `packages/text-catalogue`).

## Rounds

| Round | What | Status |
|---|---|---|
| 1 | Pipeline: BSA inventory, plugin-read sets, Opus/WebM converter with loop-safe beds, manifest + provenance; sample-first (25 + fresh 27 + fresh 27), then the first consumers (combat, movement, marsh/water/wind, rain/thunder) | delivered 2026-09-24 |
| 2 | `packages/audio`: AudioManager behind an engine interface, buses, event vocabulary, footstep and ambience contracts, streaming, tests with a fake backend; handoffs to the combat lane and the studio | — |
| 3 | Phases README § 12b "what exists", the audio manifest in the site budget (standard 16), backlog row for the studio wiring | — |

## Commands

From `tooling/audio-pipeline`:

- `python3 -m audio_pipeline.inventory`: the BSA folder summary (`inventory.json`).
- `python3 -m audio_pipeline.esm_sounds --prefix AMBr`: browse Skyrim.esm's SNDR records.
- `python3 -m audio_pipeline.build`: `selection.json` → `packages/audio/files` + `provenance.json` (~70 s).
- `python3 -m audio_pipeline.build --check`: every file and every loop join against the manifest.

## Sourcing register

| Gap | State | Evidence and candidates |
|---|---|---|
| Mud footsteps (booted and barefoot), knee-deep wading | OPEN, blocked on a planner call | Skyrim.esm maps `MaterialMud` to the dirt sounds; `footstep.*.mud` plays dirt. No Skyrim mod ships booted mud steps. Barefoot Footstep Extended (Nexus SE 40308, file 555823, epsadin; reuse allowed, source of its sounds unstated) has a barefoot `Mud` folder, but its plugin link to `MaterialMud` is unverified. Booted steps exist only as CC0 or CC-BY field recordings (Freesound 376809 CC0; BigSoundBank s0495 CC0; omnisounddesign pack 18925 CC-BY 4.0). The open call: whether cutting single steps out of a sourced recording is sourcing or making (the no-art rule). |

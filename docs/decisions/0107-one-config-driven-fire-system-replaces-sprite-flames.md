# 0107 — One config-driven fire system replaces sprite flames

Owner ruling, 2026-09-29 (16k walk-5, fire lane). Superseds the ad-hoc
per-piece flame billboard code in `lighting.ts`'s `fallbackFlame()`.

## Decision

All flames in Elder Souls — candle, hanging/standing lantern, ground and
future handheld torch, brazier, campfire, hearth — are drawn by one shared,
versioned, renderer-agnostic config in
`packages/game-core/src/fx/fire/fireTypes.ts` (`FireConfig`, `schemaVersion
1`), consumed by a WebGL `InstancedMesh` implementation
(`flameMaterial.ts`, `FlameSystem.ts`) for shape/taper/turbulence/colour
ramp/flicker/wind/embers. The config schema carries no three.js or shader
types, so a later TSL/WebGPU port (tracked separately on the `webgpu`
branch) is a mechanical swap of the consuming renderer, not the schema.

Root cause of "flames invisible by day, blobby glow at night": exposure
units, not the sprite technique. Scene exposure ranges ~3.9e-5 (day) to 22
(night) (`apps/world-studio/src/sky/lightRig.ts`); flame material must set
`toneMapped: false`, read a shared exposure uniform, and use premultiplied
`ONE, ONE_MINUS_SRC_ALPHA` blending so the flame core (alpha ≈1) reads as an
opaque emissive shape by day and the fringe (alpha →0) still glows at night.

Flame anchors are read from the already-mined `flames[]` records in
published kit JSON (`tooling/asset-pipeline/output/kits/*.kit.json`) and
transformed by each piece's FINAL world matrix (after any `--hang` mount).
No new field was needed in kit JSON, so **no republish of Claywater Station
or Greenspring was required** — only the runtime draw path changed.

Every flame's resolved world position must lie inside its host piece's
flame-bearing volume; this is a fast, mechanical gate
(`packages/game-core/src/fx/fire/fire.test.ts`, mirrored into
`place_gates.py`), never a "should have been obvious" review comment.

Interior fires (hearths, braziers) are wired through the same
`FlameSystem` via `interior/interiorLoader.ts`; the exterior brazier switch
is a follow-up (SettlementLayer.tsx/lighting.ts had another lane's
uncommitted work at the time — see the lane report).

The place-render pipeline (`render.py`/`render_scene.py`) now draws a
fire/light pass — an emissive marker at each resolved flame anchor, day and
night — so a Sonnet reviewer can judge flame placement and visibility from
a rendered image even though ruling R61 bars live agent studio walks.

## Why

The owner asked, twice (inbox comment and walk feedback, `tmp/16k-user-
instruction.md`), why flame defects (two flames on a candle lantern, a
lantern's flame sitting at the rope top, invisible daytime flames, "static
glowing sphere" flames at night) were never obvious to a building agent.
The candle-lantern's two flames are correct (two real `AddOnNode49` nodes,
~7 cm apart, in the source NIF — both candles are real). The rope-top
lantern flame was a fallback-anchor bug (a lit piece with no mined flame
got its flame placed on top of its bounding box instead of at the lantern
body) — not a hang-mount transform bug as first suspected; confirmed by
tracing `fallbackFlame()` before assuming the fix location. The other two
defects were invisible because nothing rendered fire at all in the
Blender/agent-visible render path, and the runtime shader used screen-
scale radiance in a physically-lit scene.

## What now makes fire quality visible to an agent

1. A fast standalone (non-studio, no GPU-studio dependency) headless
   preview tool renders a day/night contact sheet per preset in ~1 s
   (`tools/fire-sheet.mjs` → `tooling/.reports/16k/walk5/fire/sheets/`).
2. The place render pipeline now draws every resolved flame anchor as a
   visible marker, day and night, in the renders an agent already reads.
3. The anchor-in-volume check fails loudly with the offending piece uid,
   in both the JS test suite and the Python place gate, so a wrong anchor
   is a red, not a vibe.
4. `.claude/skills/place-build/references/fire.md` tells the next agent
   which preset to pick, how to tweak it, and how to verify with the sheet
   + anchor check + close-ups before calling a fire placement done.

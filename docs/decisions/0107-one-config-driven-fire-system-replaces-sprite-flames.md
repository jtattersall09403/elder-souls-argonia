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

Interior fires (candles, lanterns, hearths, braziers) are wired through the
same `FlameSystem` via `interior/interiorLoader.ts`. Every `FlameSystem`
draws on the display-referred post-water layer (`FIRE_LAYER`, equal to
`PRECIP_LAYER`) by default: its materials are `toneMapped: false`, so on
layer 0 they land in the HDR scene target and the blit scales them by the
sky's exposure (~1e-4 by day), which drew every interior flame black
(walk 6). Only a standalone harness with no pipeline passes layer 0.

**Flame size.** A preset's card is the whole flame from its root at the
emitter, and a mined emitter sits at the NIF particle system's origin, which
is inside the fuel (a campfire's `FlamesSmall03` is 0.11 m up a 0.86 m log
bundle; a torch's fireball core is inside its head). The fuel's geometry
occludes the lower part, so each preset's card height is (emitter to fuel
top) + the flame seen above the fuel, from real fires, since the mined
records carry no particle size or speed: a candle ~6 cm seen (card 10 cm),
a lantern's candle filling about half its glass (15 cm), a hanging lantern
with no mined candle a flame filling a clear part of its body (22 cm), a torch head 0.3-0.45
m seen (58 cm), a brazier or hearth bed ~0.6 m seen (1.0-1.05 m), a campfire
at least 0.8x its log bundle's diameter above the logs (1.7 m, bed spread
0.3 m). A new preset or a new fuel is sized the same way and checked on the
real piece with `npm run look -- fixtures`.

**Flicker.** Every fire's brightness (flame card, fixture-field slot,
carried light) reads `fireFlicker(t, seed, rateHz, amount)`: three octaves
of seeded 1-D value noise plus rare gusts (a ~1.9 s slot holds a 0.1-0.4 s,
10-25 % dip with p = 0.3, shallower for a calmer flame), a pure function of
time and the fixture's seed with no period; the shader carries the same
function. The carried light's wander uses the same noise per axis. The unit
test holds the autocorrelation at lags 1-20 s below 0.15.

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

1. Two fast standalone headless tools (no studio, no GPU): a day/night
   contact sheet per preset in ~1 s (`npm run look -- preset`), and the flame
   burning on the real kit piece at the loader's anchors, front, above and
   close-up, day and night, in ~0.4 s per fixture (`npm run look -- fixtures`,
   tooling/visual-look).
2. The place render pipeline now draws every resolved flame anchor as a
   visible marker, day and night, in the renders an agent already reads.
3. The anchor-in-volume check fails loudly with the offending piece uid,
   in both the JS test suite and the Python place gate, so a wrong anchor
   is a red, not a vibe.
4. `.claude/skills/place-build/references/fire.md` tells the next agent
   which preset to pick, how to tweak it, and how to verify with the sheet
   + anchor check + close-ups before calling a fire placement done.

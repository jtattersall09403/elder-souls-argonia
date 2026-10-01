# 16k: path paint through the studio's material chain, and what the studio puts on the GPU

Walk 7 evidence for the places' path paint (`packages/game-core/src/settlement/groundPaint*.ts`,
`GroundPaintLayer.tsx`) and for the owner's question about GPU memory in the normal (WebGL) studio.

## Why the path paint looked blocky, dark and unfaded

The paint's look lives in a shader patch on its material (`onBeforeCompile`: blend the place's
textures by per-vertex weight, alpha = the largest weight). WorldSky runs `CSM.setupMaterial` on every
lit material in the scene, and that call REPLACES `onBeforeCompile`. The paint had no reapply in
WorldSky.patchMaterial, so from walk 4 to walk 7 it drew as its first texture at full opacity over
every 0.5 m grid quad the paint touched, sampled at 1 m UV repeat (the dark cobble), and with no
`esAerial` tag it took no aerial haze, so it never faded into the mist the terrain fades into.

At source:
- `groundPaintMaterial.ts`: `reapplyGroundPaint` restores the blend after CSM (chain-marked,
  idempotent), and the material is tagged `esAerial`, so it takes the one aerial haze the terrain
  draws with; its own 120-180 m distance fade is gone.
- `apps/world-studio/src/sky/csmHookChain.test.ts`: a gate (under 1 s, source text only). Every module
  that assigns `onBeforeCompile` either exports a `reapply*` that WorldSky.patchMaterial calls after
  CSM, or is listed with the reason CSM never wipes it. It fails on the walk-7 defect (proved by
  removing the call). The class has shipped before: trees never swayed (round 5), doubled vegetation
  at every ring (lodFade), the paint (walks 4 to 7).
- The paint's edge against the province road (`export_settlement_bundle.road_cut`): the road texels
  are closed by 3 m and grown by 0.5 m before the cut, so a way fades out along a smooth line beside
  the road and never along the texels' 1.8 m stair steps. Every way kind paints worn earth
  (`track_mud`, `world/sources/vocab/ground-paint.json`); the shader frays the edge with a
  two-octave world noise (0.9 m, 2.7 m).

Measured with `node apps/world-studio/src/settlement/paintHarness/run.mjs <placeId> [--wiped]`
(the published paint through CSM, aerial and the reapply, headless SwiftShader; `--wiped` skips
the reapply). Paint contrast against the bare ground, mean absolute luminance, Claywater:

| range | before (wiped) | after | opaque track strip (control) |
| --- | --- | --- | --- |
| 8 m, eye height | 38.5 | 12.4 | 14.8 |
| 150 m | 5.3 | 1.9 | 3.0 |
| 300 m | 1.4 | 0.5 | 0.9 |

The look-list rows `ground-paint` (`tooling/visual-look/look-lists.md`) hold the bars.

## What the studio puts on the GPU (owner: "never above about 150 MB")

Measured from the published files (every kit GLB's images read from their KTX2 headers, UASTC
transcoded to ASTC or BC7 at 1 byte a pixel with every mip; PNG ground textures at 4 bytes a pixel
plus mips):

- A walk at one place loads the kits in range, not the catalogue. Claywater's bundle names four
  kits: works-v1 22.8 MiB of textures, settlement-mud-v1 20.5, settlement-imperial-v1 14.8,
  docks-v1 3.0 (61.1 MiB). The flora kit adds about 50 MiB (its impostor atlas another 48 MiB when
  far trees draw), groundcover 10 MiB; the terrain's ground textures (`bmv-v1`, 52 PNGs) 69 MiB.
- A texture is uploaded the first time something drawn uses it, so a view that has not yet
  looked at every kit holds less than the sum.
- Render targets at the medium preset: the canvas is capped at 1 device pixel per CSS pixel
  (`dprMax 1`), so a 1440 x 900 window is about 1.3 M pixels; with 4x MSAA, depth and the water
  pipeline's targets that is a few tens of MiB, plus the three shadow cascades.

So 150 MB is the expected order for one place. The textures are GPU-compressed (a quarter of the
memory of plain RGBA), which is the point of the KTX2 pipeline (standard 16), not a sign the GPU is
idle; Chrome's GPU memory column counts the memory a tab has allocated on the GPU, not how hard the
GPU is working (that is GPU time, which the studio HUD's frame numbers show).

The one lever that is a choice, not a fact: on a Retina screen (the owner's M2, 2 device pixels per
CSS pixel) the medium preset renders a quarter of the screen's pixels and scales up. `?q=high`
lifts the cap to 1.25 and `?dpr=2` renders at full Retina resolution for a test; the default
stays where the walk-6 frame budget put it (decision 0084).

## Places out of range: no polling for their ground (walk 7)

The paint layer built every place in the loaded bundle and retried every second, logging
"ground still undecoded after N s", for places whose ground tiles were never going to load (the
yards and the other villages, kilometres away); each retry ran the whole surface build first,
about 80 MB a second of garbage for as long as the studio was open. Now the layer listens to the
terrain chunk store's arrivals (`groundArrivalsOf(store)`, passed by Fly3D and CharacterMode): a
place builds when an arrival touches its extent and its ground answers at the extent's corners
and middle (`groundReady`, checked before any surface work), and rebuilds only when the ground
under a built surface moved (`groundMoved`). Out of range is the normal state, not a warning.

## The two console warnings on desktop (walk 7)

Both come from dependencies at their latest stable release, not from our calls:

- "THREE.Clock: This module has been deprecated": `@react-three/fiber`'s store creates
  `new THREE.Clock()` for every canvas (9.7.0 installed; 9.8.1, the latest stable, still does).
  Nothing in our code creates a Clock. It goes when fiber moves to `THREE.Timer` (v10).
- "using deprecated parameters for the initialization function": `@dimforge/rapier3d-compat`'s
  own `init()` hands its embedded wasm to the wasm-bindgen loader as a bare argument (0.19.2,
  pinned exactly by `@react-three/rapier` 2.2.0; 0.19.3 does the same). No form of our call
  reaches that loader. It goes when react-three-rapier moves to a fixed rapier.

Both are harmless; neither is silenced, so a new warning is never hidden behind a filter.

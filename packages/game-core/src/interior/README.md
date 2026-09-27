# Interior runtime (0103 decision 4)

The TES door: a door with a tier A claim opens onto a separate cell, drawn
from one bundle per cell; leaving puts the player back outside the door.
Everything that decides lives here behind injected hosts; the studio only
mounts it (`apps/world-studio/src/character/InteriorDoors.tsx`).

| File | What it owns |
| --- | --- |
| `bundle.ts` | The bundle contract (`public/province/interiors/<cellId>.json`, schemaVersion 1) and its validator. |
| `doors.ts` | Which doors open (`doorAccess`: `interiorClaim.tier === "A"` with a `cellId`, not `reserved`), reach 1.5 m, prefetch 40 m, the interior-space lift, the prompt text ids. |
| `interiorLoader.ts` | `InteriorLoader`: fetch, validate, load kits (injected; the studio passes the settlement layer's shared `KitCache` with `createKitLoader`, then `buildArchitectureKit`), instantiate, cache per cellId. Light intensity = `(fade ?? 1) × INTERIOR_LIGHT_INTENSITY_PER_FADE`, the one number the owner tunes on a walk (0102 decision 3b). |
| `doorTransition.ts` | `DoorTransition`: prompt and arbiter `candidate`, 0.4 s fade out, swap, hold at black until the cell's colliders exist, 0.4 s fade in. Entering by door D arrives at the bundle's `doors[]` marker for D (else the claim's `arrivalMarker`, else the bundle's); leaving by a load door returns to the exterior door that load door pairs with (`doors[]`, else a claim's `interiorLoadDoorRef`, else the door entered by), + 1 m outward. |
| `interiorEnvironment.ts` | While inside: no IBL, exposure 1, the cell's fog and background, every light outside the cell hidden; restored on leave. |

## Contract the exporter writes

The shared fixture `__fixtures__/interior.fixture.json` IS the contract:
the exporter's Python test and `interior.test.ts` both read it.
`schemaVersion 1`, `cellId`, `plugin`, `frame`, `shellAssetId` (string or
null), `refCount` (= placements + drops), `kits {id: {id, glb, manifest}}`,
`arrivalMarker {positionM, yawDeg}`, `exitDoor {id, refId, positionM, yawDeg}`,
`doors[] {exteriorDoorId, interiorLoadDoorRef, arrivalMarker}` (may be empty),
`placements[] {id, assetId, kit, positionM, rotationDeg, scale, category}`,
`lights[] {refId, positionM, radiusM, colorRGB, fade (LIGH FNAM, unitless, or
null), base, raw {xrdsUnits|null, baseRadiusUnits}}`, `ambient {colorRGB,
intensity}`, `fog {colorRGB, nearM, farM}`, `sockets[]`, `drops[]`. Positions are metres in the
cell's frame, y up. `rotationDeg` is `[pitch, yaw, roll]`, yaw a compass
turn, applied as Euler(pitch, −yaw, roll, "YXZ") (the settlement rotation
authority plus roll). Colours are the plugin's sRGB bytes 0–255. Every
placement names its `kit`; the bundle carries no gaps (the exporter lists
them and fails). Fixture: `__fixtures__/interior.fixture.json`.

## Where a cell stands

A cell is drawn at `(door x, INTERIOR_SPACE_LIFT_M = 4000 m, door z)` in the
one physics world. The exterior stays loaded but hidden, and the player's
x/z (so every streaming ring) stays at the door, so leaving is instant. The
cost is the exterior's residency while inside (the same as standing at the
door) plus the cell's kits (published interior kits today are 3.3–11.6 MB
GLB each, loaded once per kit and shared by every cell using them).

## Camera (16h item 24)

The cell's pieces collide as LOD0 trimeshes in `CAMERA_BLOCKING_GROUPS`, so
the landed follow-camera pull-in, gradual return and player fade work inside
unchanged. The near-plane fade of occluders is still open in 16h item 24.

## Studio

`?view=character&x=<km>&z=<km>&interior=<cellId>` opens the cell at its
arrival marker (black until loaded); `activate` (E, the pad's bottom face
button, a tap on the prompt) at a door enters or leaves, through the
interaction arbiter (`../interaction/`).

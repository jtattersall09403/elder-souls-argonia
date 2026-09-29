# Interior runtime (0103 decision 4)

The TES door: a door with a tier A claim opens onto a separate cell, drawn
from one bundle per cell; leaving puts the player back outside the door.
Everything that decides lives here behind injected hosts; the studio only
mounts it (`apps/world-studio/src/character/InteriorDoors.tsx`).

| File | What it owns |
| --- | --- |
| `bundle.ts` | The bundle contract (`public/province/interiors/<cellId>.json`, schemaVersion 2: every `doors[]` entry typed `load` or `swing`) and its validator; a schema-1 bundle is refused with its version named. |
| `swingDoors.ts` | Swing doors (built in 16k walk 4, owner 2026-09-28): the one record kind for an interior bundle's `swing` entry and a place's compiled door with `doorType: "swing"` and a `swing` pose; `buildSwingDoor` (the leaf under a hinge group at `hinge.pivotM`, frame parts outside `hinge.leafBoundsM` left standing), `SwingDoorController` (Open/Close prompt candidates, toggle on `activate`, eased turn over `hinge.openS` to `hinge.openAngleDeg`, collider off while moving and rebuilt at rest, a body in the swept arc keeps it put, `door.open`/`door.close` on the typed sound bus), `loadDoorsOf` (what `DoorTransition` keeps). |
| `doors.ts` | Which doors open (`doorAccess`: `interiorClaim.tier === "A"` with a `cellId`, not `reserved`), reach 1.5 m, prefetch 40 m, the interior-space lift, the prompt text ids. |
| `interiorLoader.ts` | `InteriorLoader`: fetch, validate, fetch only the parts the cell draws (each kit's `parts/index.json` once, then one part GLB per (kit, assetId), in parallel, cached per pair; injected `loadPart`, the studio passes `createKitLoader` then `buildArchitectureKit` through the scene's `KitCache`), instantiate, cache per cellId. A drawn asset with no published part fails the cell with a line naming kit and asset, which the overlay shows as its red line. Light intensity = `(fade ?? 1) × INTERIOR_LIGHT_INTENSITY_PER_FADE`, the one number the owner tunes on a walk (0102 decision 3b). |
| `kitParts.ts` | The parts contract: `kits/<kit>/parts/index.json` (schemaVersion 1, the source GLB's sha256, one row per asset: file, bytes, vertices, triangles, texture hashes), `kitPartsDir` (from the bundle's `glb` path), the validator. Written by `tooling/asset-pipeline/pipeline/kit_parts.mjs`. |
| `doorTransition.ts` | `DoorTransition`: prompt and arbiter `candidate`, 0.4 s fade out, swap, hold at black until the cell's colliders exist, 0.4 s fade in. Entering by door D arrives at the bundle's `doors[]` marker for D (else the claim's `arrivalMarker`, else the bundle's); leaving returns to the door entered by (the transition keeps that door record, id and place), + 1 m outward; only a `doors[]` pairing naming another door of the SAME place redirects it (owner ruling B). Door claims are never read for the return: places share cells (Claywater Station and Greenspring both claim KeebaHouseFisher), and the old claim lookup put the player at the other place (walk 4 b). While the screen is black waiting for a cell, `loadingTextId` names the one line the overlay shows: `text.door.loading-named` ("Loading {name}…", `loadingName` = the entered door's `displayName` from the compiled place record) or `text.door.loading` when the door has none; the game reuses the same overlay. Swing doors are left out (`setDoors` keeps `loadDoorsOf`). |
| `interiorEnvironment.ts` | While inside: no IBL, exposure 1, the cell's fog, its fog colour as the renderer's clear colour with `scene.background` null, every light outside the cell hidden; restored on leave. Never a Color `scene.background`: three clears on every `render()` call when it is one, and the water pipeline's three on-screen passes after its blit then wiped the cell to flat fog-grey (walk 4 a). |

## Contract the exporter writes

The shared fixture `__fixtures__/interior.fixture.json` IS the contract:
the exporter's Python test and `interior.test.ts` both read it.
`schemaVersion 2`, `cellId`, `plugin`, `frame`, `shellAssetId` (string or
null), `refCount` (= placements + drops + substitutions + swing doors), `kits {id: {id, glb, manifest}}`,
`arrivalMarker {positionM, yawDeg}`, `exitDoor {id, refId, positionM, yawDeg}`,
`doors[]` (may be empty): `{doorType: "load", exteriorDoorId, interiorLoadDoorRef,
arrivalMarker, loadDoor}`, `{doorType: "load", interiorLoadDoorRef, loadDoor,
closed: true}`, then one `{doorType: "swing", id, refId, assetId, kit,
positionM, rotationDeg, scale, hinge {pivotM, axis, openAngleDeg, openS,
source, leafBoundsM?}, initiallyOpen}` per DOOR reference with no XTEL
teleport (not a placement; the hinge is the door NIF's animated node and its
`Open` sequence, `initiallyOpen` the reference's ONAM),
`placements[] {id, assetId, kit, positionM, rotationDeg, scale, category}`,
`lights[] {refId, positionM, radiusM, colorRGB, fade (LIGH FNAM, unitless, or
null), base, raw {xrdsUnits|null, baseRadiusUnits}}`, `ambient {colorRGB,
intensity}`, `fog {colorRGB, nearM, farM}`, `sockets[]`, `drops[]`, and
optionally `substitutions[] {id, refId, class, standInAsset, kit,
standInCategory, positionM, rotationDeg, scale, …}` (walk 2 lane I: a piece
the vault does not hold, drawn as a placement of its same-class stand-in
from `kit`; absent reads as none). Positions are metres in the
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
door) plus the parts the cell draws (see Load cost), each loaded once and
shared by every cell that draws it.

## Camera (16h item 24)

The cell's pieces collide as LOD0 trimeshes in `CAMERA_BLOCKING_GROUPS`, so
the landed follow-camera pull-in, gradual return and player fade work inside
unchanged. The near-plane fade of occluders is still open in 16h item 24.

## Studio

`?view=character&x=<km>&z=<km>&interior=<cellId>` opens the cell at its
arrival marker (black until loaded); `activate` (E, the pad's bottom face
button, a tap on the prompt) at a door enters or leaves, through the
interaction arbiter (`../interaction/`).

## Return height

Leaving by the door entered by stands the player at the body height
recorded on entry (a deck or stilt threshold stands over the terrain), never
below the ground there; leaving by another door of the same place stands on
that door's ground (the recorded height belongs to a different threshold).
Both add `RETURN_LIFT_M = 0.2`.

## Load cost (kit parts, walk 4)

A cell no longer loads whole kits. Every published kit carries a parts
folder beside its GLB, `kits/<kit>/parts/`: one GLB per asset with only its
LOD0 meshes (geometry re-encoded with meshopt, lossless) and its materials,
textures by URI into `parts/tex/<sha16>.ktx2` (one file per texture per kit,
however many assets use it), and `index.json`. `kit_parts.mjs` writes it
from the published GLB (no Blender run); a re-run changes no byte, and
`--check` exits 1 on a stale folder. Before parts, KeebaHouseFisher loaded 7
whole kits (108.9 MB) to draw 53 assets. The settlement layer still loads
whole kits. The studio parses parts with `SharedKtx2Textures`
(`sharedTextures.ts`): a texture several parts name is transcoded and
uploaded once (KeebaHouseFisher: 118 references, 66 files).
`kitParts.test.ts` loads every works-v1 part on its own and matches it to the
whole kit's LOD0 geometry. Measured on KeebaHouseFisher (local studio,
SwiftShader, shared machine): 55.7 MB fetched after the press with whole
kits, 8.9 MB with parts; `LoadedInterior.loadS` (request to built cell) is in
the probe's `interior()` readout.

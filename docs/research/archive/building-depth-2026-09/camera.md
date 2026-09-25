# Check-in 2 items 3 (camera clips into buildings) — camera collision research

Headline: the follow camera has NO collision query today. It only clamps its height to the CPU
terrain sampler at its own XZ, so a wall, roof or any settlement collider never stops it.

## (a) Code today
- packages/game-core/src/camera/followCamera.ts:61-77 update(): orbit + exponential lerp, no world input.
  :84-102 computeDesired(): fixed 5.8 m arm (:16), minPosPitch 0.06 (:26) keeps the body above shoulder height.
- apps/world-studio/src/character/CharacterMode.tsx:1475-1480: the only "avoidance":
  `world.groundHeight(camera.x, camera.z)`; if camera.y < ground + 0.6, set y = ground + 0.6.
  groundHeight = CPU heightfield sampler (apps/world-studio/src/character/chunkWorld.ts:102), not Rapier.
  It is a vertical clamp at the camera point only: terrain between player and camera (a ridge) is not handled either.
- Sandbox copy: packages/character/src/combat/CombatRuntime.tsx:3062-3091 duplicates the maths
  (comment :3064 "Identical maths to game-core FollowCamera.computeDesired"); no clamp at all there.
  docs/research/combat-and-systems/game-buildout-systems-audit.md:61 already records the two duplicate camera implementations as 10b's.
- Near plane 0.3 m, fov 48 (CharacterMode.tsx:422; characterPhysics.ts:70). Near-plane half-diagonal at 16:9 ~0.27 m.

## Collision set available
- Settlement colliders are real Rapier fixed bodies in the SAME world as the player:
  apps/world-studio/src/character/SettlementColliders.tsx:81-86 (box or trimesh per part, types.ts:96-97),
  fed from SettlementLayer onSolids (packages/game-core/src/settlement/SettlementLayer.tsx:635).
- Terrain heightfields: ChunkColliders (3x3 chunk ring), same world. Vegetation: VegetationColliders.tsx:141-169
  (trimesh/capsule/cuboid). Player capsule: packages/character/src/PlayerBody.tsx. Hurtboxes/hitboxes are sensors.
- No collision groups exist anywhere (grep of CollisionGroups/interactionGroups: 0 hits outside tests).
- Rapier compat already has the query: `world.castShape(pos, rot, vel, shape, targetDistance, maxToi,
  stopAtPenetration, filterFlags, filterGroups, excludeCollider, excludeRigidBody, predicate)`
  (node_modules/@dimforge/rapier3d-compat/pipeline/world.d.ts:418). castRay is used already
  (CombatRuntime.tsx:558,569; Arrows.tsx:108).

## What is needed (one injected query)
1. game-core type: `CameraObstruction = (from: Vec3, to: Vec3, radius: number) => number | null`
   (fraction/distance to first hit). FollowCamera.update takes it as an optional parameter or constructor
   injection; no Rapier import in game-core/camera (controller-independence, package rule).
2. FollowCamera: after computeDesired, cast from the pivot (player + heightOffset, NOT the look point) to
   desiredPosition; clamp arm length to hit − radius. Pull-in is immediate (no lerp on shortening);
   lengthening eases back (TotK behaviour, below). Keep the terrain clamp as the fallback outside the collider ring.
3. The app implements the query with useRapier: ball radius ~0.3 m (>= near-plane half-diagonal),
   filter EXCLUDE_SENSORS + excludeRigidBody(player body), and a camera-blocking membership group
   set on settlement + terrain colliders (settlementColliderDesc in SettlementColliders.tsx:20 and
   ChunkColliders), so vegetation trunks do not pump the arm.
4. Sandbox (CombatRuntime.tsx:3082) gets the same query when it migrates onto FollowCamera (10b), or the
   same injected function now.
5. When arm < ~0.9 m: hide or dither the player body (new HideReason "cameraClose" in
   packages/game-core/src/actors/meshVisibility.ts:25 — binary hide exists; a dither needs a shader hook).

## (b) How the reference games do it
- Tears of the Kingdom: pull-in when a wall obstructs; the camera does NOT snap back when clear, it returns
  gradually and only in response to player input (Asher Zhu, reported by 80.lv, 2025-09-19).
  BotW lock-on: collision zooms in on the player keeping the same rotation (UE forum observation, not official).
- Skyrim: camera is a collider layer L_CAMERA (COLL:00088788) that collides with L_STATIC, L_ANIMSTATIC,
  L_TREES; hitting walls zooms the camera in; the player "blends out" when the camera is too close
  (Nexus "Some Collision Camera" SSE 57864, "No Camera Collision" SSE 19310; UESP "Skyrim Mod:Mod File Format/COLL").
  Removing wall collision lets you see through walls (Nexus SSE 57692).
- Elden Ring / Souls: sphere camera collides with geometry and pulls in; players report it snagging in tight
  corners and bouncing (Steam threads); gamedeveloper.com names DS3's "sphere collider" as the bounce source.
  No developer source found for a near-camera fade in FromSoftware games.
- Alternatives: geometry dithering of near-camera occluders (Witcher 3), silhouette through walls
  (Mario Sunshine), cut-out view (For Honor) — gamedeveloper.com "Third Person Camera View in Games".
  Dither = clip()/discard with Bayer pattern, cheaper than alpha blend (mirzabeig.com Camera Dither Fade).
  Plain ray is not enough: near plane has size, use a sphere (ndotl.wordpress.com 2014; Godot SpringArm3D docs).

## Recommendation for three.js
Sphere-cast spring arm against settlement+terrain group, instant pull-in, input-gated slow return (TotK),
player body hidden/dithered under ~0.9 m (Skyrim blend-out). No cutaway, no occluder fade on buildings.
Cost: one Rapier ball cast per frame over the broadphase (tens of microseconds; trimesh narrowphase only on
the few candidate walls); zero render cost. Occluder dither on buildings would need a per-instance fade
attribute on the InstancedMesh settlement renderer plus an onBeforeCompile discard (memory: CSM clobbers
onBeforeCompile) and every material variant — defer. First-person switch exists only for bow aim
(firstPersonBowManifest) — fallback option if the stilt hut interior is under ~1.5 m clear radius.

Sources: https://80.lv/articles/third-person-camera-movement-trick-in-the-legend-of-zelda-tears-of-the-kingdom
https://forums.unrealengine.com/t/3d-camera-help-zelda-breath-of-the-wild-2/922169
https://www.nexusmods.com/skyrimspecialedition/mods/57864 https://www.nexusmods.com/skyrimspecialedition/mods/57692
https://www.nexusmods.com/skyrimspecialedition/mods/19310 https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/COLL
https://steamcommunity.com/app/1245620/discussions/0/3183488724674902773/
https://www.gamedeveloper.com/design/third-person-camera-view-in-games-a-record-of-the-most-common-problems-in-modern-games-solutions-taken-from-new-and-retro-games
http://www.mirzabeig.com/tutorials/camera-dither-fade/ https://ndotl.wordpress.com/2014/10/18/third-person-camera/
https://docs.godotengine.org/en/stable/tutorials/3d/spring_arm.html

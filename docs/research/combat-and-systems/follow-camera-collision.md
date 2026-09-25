# Follow camera collision: how the reference games keep walls out of shot

Evidence for 16h check-in 2 item 3 ("the camera clips into buildings") and
for part 2 item 24 (the interior camera). Read by
`packages/game-core/src/camera/followCamera.ts` and
`apps/world-studio/src/character/cameraObstruction.ts`.

## What the reference games do

- **Tears of the Kingdom.** An obstruction pulls the camera in. When the way
  clears it does not snap back: it returns gradually and only in response to
  player input (Asher Zhu, reported by
  [80.lv, 2025-09-19](https://80.lv/articles/third-person-camera-movement-trick-in-the-legend-of-zelda-tears-of-the-kingdom)).
- **Skyrim.** The camera is its own collision layer (`L_CAMERA`,
  COLL:00088788) that collides with statics, animated statics and trees; a wall
  zooms the camera in, and the player model blends out when the camera is too
  close ([UESP Skyrim Mod:Mod File Format/COLL](https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/COLL);
  Nexus SSE mods [57864](https://www.nexusmods.com/skyrimspecialedition/mods/57864),
  [19310](https://www.nexusmods.com/skyrimspecialedition/mods/19310)).
  Without wall collision the player sees through walls
  ([Nexus SSE 57692](https://www.nexusmods.com/skyrimspecialedition/mods/57692)).
- **Dark Souls / Elden Ring.** A sphere collider pulls the camera in; players
  report it snagging and bouncing in tight corners
  ([gamedeveloper.com, third-person camera problems](https://www.gamedeveloper.com/design/third-person-camera-view-in-games-a-record-of-the-most-common-problems-in-modern-games-solutions-taken-from-new-and-retro-games)).
- **A ray is not enough.** The near plane has size; sweep a sphere at least
  the near plane's half-diagonal
  ([ndotl, 2014](https://ndotl.wordpress.com/2014/10/18/third-person-camera/);
  [Godot SpringArm3D](https://docs.godotengine.org/en/stable/tutorials/3d/spring_arm.html)).
- **Alternatives for interiors.** Dithering the occluders nearest the camera
  (The Witcher 3), a silhouette through walls (Mario Sunshine) or a cut-out
  view (For Honor), same gamedeveloper.com source. A screen-door dither is a
  `discard` on a Bayer pattern, cheaper than alpha blending
  ([mirzabeig.com, camera dither fade](http://www.mirzabeig.com/tutorials/camera-dither-fade/)).

## What we built (2026-09-24, ledger row "Check-in 2 fixes: runtime")

- `FollowCamera` takes an injected `(from, to, radius) => distance | null`
  query and imports no physics engine. The arm is swept from the pivot
  (player + 1.15 m) to the smoothed orbit position with a 0.3 m ball: it
  pulls in at once, and grows back at 2.5 m/s only while the camera stick
  moves or the player walks.
- The studio answers the query with a Rapier ball cast against the
  camera-blocking group (`packages/game-core/src/camera/cameraCollision.ts`):
  settlement and terrain colliders block, vegetation opts out, sensors and
  moving bodies are excluded by the query flags.
- The player model fades from a 1.2 m arm to nothing at 0.5 m.
- The CPU terrain clamp stays as the fallback outside the collider ring.
- The view aims along a direction, not at a point (2026-09-25, check-in 3):
  the aim is taken from the unobstructed geometry (look target minus the
  full-arm orbit position), smoothed at `lookSmoothing` and renormalised, and
  the pulled-in camera looks along it, so the view pitch no longer changes
  with arm length (it nodded 25 to 71 deg as a wall shortened the arm).

## Open

- Interior shells (the stilt hut): near-plane fade of occluders inside a
  shell, 16h part 2 item 24. The settlement renderer draws buildings as
  `InstancedMesh` buckets, so a fade needs a per-instance attribute and a
  `discard` in the settlement material patch (which CSM re-hooks), on every
  material variant.

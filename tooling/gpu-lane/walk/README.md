# Agent walk harness

Agents do the owner's walk packet for one built place in the real studio, in character view, on a
RunPod GPU. One tab and one `walk_run.mjs` invocation per place: every time of day, every door,
every fire and sign close-up. Three tools run in order: route, run, judge. Pod creation, setup, site
sync and tunnels are in [../README.md](../README.md) § The loop; this folder adds nothing to them.

## The three tools

**`walk_route.py <placeId> [--out route.json] [--public DIR] [--only door5,fire2]`** reads the
published data the studio loads (`public/province/settlements/<placeId>.json`, the kits' parts
indexes, the interior cell files) and writes route JSON, deterministic (no clock, sorted inputs).
`--public` defaults to `apps/world-studio/public`; `--only` keeps the named waypoints (a smoke route).
Route fields: `schemaVersion` 2, `placeId`, `bearing` and `pitch` (convention notes), `boundaryM`,
`centreM`, `fixtures` (burning placement ids), `doors` (ids with a claimed interior cell), `only`,
`freeWalk`, `waypoints`. A waypoint has `id`, `xM`, `zM`, `yawRad` (compass), `arrive`, optional
`detourM` and `actions`: `shot` (name, yaw, pitch, subjects), `fire` (fixtureIds, `centreM` [x,y,z],
yaw, pitch, n frames, dtS), `door` (doorId, cellId, `thresholdM`, approach, faceYaw, exitDoorLocalM,
`interiorStep`, `interiorShots`, `outShot` {standM, yaw, pitch}). Waypoints cover 4 overviews, a base
shot and an action per door, a fire cluster per 6 m group, a sign close-up per 3 m group.

Route rules (the walk-10 causes they fix are in `tooling/.reports/16k/walk10/walk10-diag1.md`):
- Every stand point (overview, door base, out shot, fire, sign) clears every collider footprint in the
  bundle (`collision.kind` other than `none`) by 0.5 m: pushed outward along target-to-stand, else the
  next bearing in 30° steps, always inside the boundary.
- `arrive` is `walk` only when the previous leave point (the out-shot stand after a door) is under 40 m
  away and the straight line crosses no footprint, or a one-corner `detourM` around the blocking
  footprints is clear; otherwise `teleport`, which the runner never walks.
- The door approach is 0.6 m out from the threshold along the door's facing (reach is 1.5 m planar,
  `packages/game-core/src/interior/doors.ts:4`). Interior shots face into the room at the exit door's
  yaw +180°, +135° and −135°, pitched down, after walking `interiorStep` (1.5 m) forward; the out shot
  stands 3 m out from the door.
- Overviews stand on the painted-way point nearest each boundary corner, and the free walk follows the
  longest painted way (`groundPaint` centreline) one compass leg per segment at 3.5 m/s, at most 20 s.
  Painted ways are land; the published water level is not read.
- Pitch is the follow camera's: positive looks down (`followCamera.ts` minPitch/maxPitch). Aimed
  pitches put the target on the view ray through the look target 1.45 m over the feet:
  `atan2(ground + 1.45 − targetY, planar distance)`, ground from the nearest walk-route sample. Fires
  door bases at 1.2 m over the threshold. Fire and sign close-ups (`close_up`) aim at the fixture's actual
  world y (flame +0.3 m; sign = the cluster's highest placement), measure the pitch from 1.6 m eye height over
  the stand ground, and stand 3-10 m off: far enough that the subject fills a third of a 60 deg frame and the
  look-up stays under 0.35 rad (a steeper one puts the camera arm under the hill). The first overview (the
  yaw-check start) is chosen so 4 m north and 4 m east are clear of every collider.

**`walk_run.mjs --route <route.json> --out <dir>`** flags: `--cdp host:port` (127.0.0.1:9242),
`--t 12,22` (game hours, one pass each), `--w clear` (weather id per pass: `--w clear,rain` pairs by index with `--t`; one value applies to every pass), `--rate 0.5` (the studio clock rate in the URL, the game's normal clock; the studio pauses the clock without it), `--origin` (http://127.0.0.1:8099),
`--base` (/elder-souls-argonia/studio/), `--width 1280`, `--height 720`, `--settle 10` (s),
`--speed 3.5` (m/s, sets the walking time budget), `--readyTimeout 150` (s). Per pass it
loads the studio, waits for the ready gate, records a settle window and a 20 s free walk, then
visits each waypoint. A failure is recorded as a finding and the run goes on. Output in `<dir>`
(use `tooling/.reports/gpu-lane/walk/<place>/`): `summary.json`, `route.json` (copy), and jpgs named
`t<hour>-<waypoint-or-action>[-fN].jpg` (`-int<i>` interior shots, `-out` after leaving, `-base` door
base shot, `-freewalk-end`). `summary.json` fields: `schemaVersion` 2, `placeId`, `gitSha`, `dirty`,
`measuredAt`, `gpuAdapter`, `origin`, `base`, `weather`, `orphansClosed`, `passes` (per pass: ready,
readyS, settle and freeWalk frame stats, per-waypoint action records with door `entered`, `exited`,
`focusBefore`, `exitFocus`, wallMin), `coverage`, `consoleErrors`, `http404s`, `findings` (`pass`,
`where`, `finding`), `wallMin`. It reuses the ready gate, sampler, frame stats and orphan-tab close
exported by `../measure.mjs`. Pure helpers (camera yaw, leg bearing, time budget, flag parsing) are
in `walk-lib.mjs`.

**`walk_judge.py <dir>`** reads `<dir>/summary.json` and the rows of
`.claude/skills/place-build/references/reader-checklist.md` (by id, at run time) and writes
`<dir>/judge/<group>-<k>.md`, at most 12 images per brief. Groups: `exterior-day`,
`exterior-night` (overviews, freewalk end, door-base and sign close-ups by time of day), `interiors`
(adds the run's door record), `fires` (each fire's frames tiled into one labelled contact sheet,
`<dir>/judge/sheets/t<T>-fire<k>-series.jpg`; the brief lists sheets, not frames). Each brief names its
reader's output `<dir>/judge/<group>-<k>.reader.md`. Launching the `image-reader` agents is the
caller's job; they read only the images and the brief.

## The in-page hook

`apps/world-studio/src/character/walkHarnessHooks.ts` adds methods to the existing
`window.__STUDIO_CHARACTER_DEBUG__` object (no new global):

- `teleport(xM, zM, yawRad?)` places the body on the ground and moves the focus point.
- `state()` returns `{schemaVersion 1, pos, yaw, cameraYaw, insideInterior, cellId, transitioning,
  focus}`; `focus` is what one activate press would go to.
- `doors()` returns `{offered, candidate, fade}`: every candidate the interaction arbiter weighed at its
  last resolve (id, kind, xz, reachM) and the door transition's own candidate and fade.
- `aimCamera(yaw, pitch)` (existing) points the follow camera.

Movement and activation are real keys: the runner clicks the canvas, then sends W and E through CDP
`Input.dispatchKeyEvent`, so the input layer is exercised. A walk that exceeds 1.5x its expected
time falls back to a teleport; a waypoint with `arrive: "teleport"` is never walked, and one with
`detourM` ([[x, z], ...]) is walked through each detour point in turn.

What `summary.json` (schemaVersion 2) records beyond coverage and findings:
- every walk (`waypoints[].walks[]`, door `approachWalk`): `targetM`, `startM`, `trail` ([s, x, y, z] every
  0.5 s), `endM`, `distEndM`, `closestM`, `walkS`, `fallback`, at arrival and fallback alike;
- every door: `focusReads[]` (step 0 at the approach, then up to three 0.2 m steps while focus is null):
  `posM`, `thresholdDistM` (route `thresholdM`, else the offered door's xz), `transitioning`,
  `doorCandidate`, `fade`, `offered` doors with distance and reach, `focus`;
- inside: `interiorStep` (walks the route's `interiorStep` metres, default 1.5, off the arrival marker
  before the shots) and `exposure` (`settled`, `waitS`, `luma`: mean screen luma polled until it moves
  under 2 % over 1 s, at most 6 s).

Yaw convention: route bearings are compass radians (0 = north = -z, pi/2 = east = +x). The follow
camera yaw is the negative of the compass bearing it looks along (`camYaw(b) = -b`), so after
`aimCamera(camYaw(b), pitch)`, `state().yaw` equals `b`.

## Running it on a pod

1. Pod, setup, site sync and a tunnel as in [../README.md](../README.md) § The loop steps 1-5
   (`pod-setup.sh`, `pod-sync.sh <site>/studio dev`, `tunnels.mjs open --local <port>`). Pick a local
   port nothing holds on IPv4 (`ss -ltn | grep :<port>`): in walk 10 a local SwiftShader Chrome held
   127.0.0.1:9242 while the tunnel bound only [::1]:9242, and the runner drove the local Chrome
   (`gpuAdapter` null, ERR_CONNECTION_REFUSED). Check `curl 127.0.0.1:<port>/json/version` names Chrome 154.
2. Route: `python3 tooling/gpu-lane/walk/walk_route.py <placeId> --out /tmp/<lane>/route.json`
3. Every run goes through `tooling/repo-standards/job_guard.sh <lane> -- node tooling/gpu-lane/walk/walk_run.mjs …`
   (no orphan when the parent dies; lane_watch sees it). A 1-view smoke run precedes every full walk run:
   the same route with `--smoke --t 12` (the start, the first door and the first fire action, by teleport, no freeWalk;
   about 2 min; `summary.json` `passes[].yawCheck` must show `stateYaw` = `movedBearing` = `bearing`), then the full
   run: `--route /tmp/<lane>/route.json --cdp 127.0.0.1:<port> --t 12,22 --out tooling/.reports/gpu-lane/walk/<place>`.
   The full run passes 10 min, so start it with `setsid nohup … &` and wait with
   `python3 tooling/repo-standards/lane_wait.py --files <out>/summary.json`.
4. Judge: `python3 tooling/gpu-lane/walk/walk_judge.py tooling/.reports/gpu-lane/walk/<place>`, then one
   `image-reader` agent per brief (each brief lists its images once, relative to the repo root); read the `summary.json` findings beside the reader outputs.

Tests: `node --test tooling/gpu-lane/walk/*.test.mjs` and `python3 -m pytest -q tooling/gpu-lane/walk`.

## Cost per place

Measured on Claywater (RTX 3070 community, $0.13/h, 2026-10-02): pod up to ssh ready 1.5 min, setup + sync
3 min, smoke 1.8 min, day pass 7.3 min (one forced reconnect included), night pass 4.8 min, judges on the VM
after the pod is deleted. About 12 min of walk per place; a whole pod session for one place 18 min, $0.04.

## Tunnel drops

`tunnels.mjs` opens ssh with keepalives (15 s x 4) and `keep`/`ensureTunnel` re-open a dropped tunnel on the
same local port. Pass `--pod "<ssh>"` to `walk_run.mjs`: on a lost CDP link (`cdpLost` in `walk-lib.mjs`) it
re-establishes the tunnel, reconnects, reopens the tab and re-runs the pass from its last completed waypoint
(no repeat of settle, yaw check or free walk), at most twice per pass; `summary.json` `reconnects[]` and
`passes[].reconnects` record each one.

## Exit rule the judge briefs carry

Each reader returns a ranked defect list, worst first, with evidence per shot (file name, where in
the frame, which checklist row). "Nothing" is a valid answer. Generic improvements are out of scope.

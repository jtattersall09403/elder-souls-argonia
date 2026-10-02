# Agent walk harness

Agents do the owner's walk packet for one built place in the real studio, in character view, on a
RunPod GPU. One tab and one `walk_run.mjs` invocation per place: every time of day, every door,
every fire and sign close-up. Three tools run in order: route, run, judge. Pod creation, setup, site
sync and tunnels are in [../README.md](../README.md) § The loop; this folder adds nothing to them.

## The three tools

**`walk_route.py <placeId> [--out route.json] [--public DIR]`** reads the published data the studio
loads (`public/province/settlements/<placeId>.json`, the kits' parts indexes, the interior cell files)
and writes route JSON, deterministic (no clock, sorted inputs). `--public` defaults to
`apps/world-studio/public`. Route fields: `schemaVersion` 1, `placeId`, `bearing` (convention note),
`boundaryM`, `centreM`, `fixtures` (burning placement ids), `doors` (ids with a claimed interior
cell), `freeWalk` (the main path for the 20 s turning walk), `waypoints`. A waypoint has `id`, `xM`,
`zM`, `yawRad` (compass), `arrive` (`walk` when under 40 m from the previous one, else teleport) and
`actions`: `shot` (name, yaw, pitch, subjects), `fire` (fixtureIds, n frames, dtS), `door` (doorId,
cellId, approach, faceYaw, `interiorShots`). Waypoints cover 4 overviews, a base shot and an action
per door, a fire cluster per 6 m group, a sign close-up per 3 m group.

**`walk_run.mjs --route <route.json> --out <dir>`** flags: `--cdp host:port` (127.0.0.1:9242),
`--t 12,22` (game hours, one pass each), `--w clear` (weather), `--origin` (http://127.0.0.1:8099),
`--base` (/elder-souls-argonia/studio/), `--width 1280`, `--height 720`, `--settle 10` (s),
`--speed 3.5` (m/s, sets the walking time budget), `--readyTimeout 150` (s). Per pass it
loads the studio, waits for the ready gate, records a settle window and a 20 s free walk, then
visits each waypoint. A failure is recorded as a finding and the run goes on. Output in `<dir>`
(use `tooling/.reports/gpu-lane/walk/<place>/`): `summary.json`, `route.json` (copy), and jpgs named
`t<hour>-<waypoint-or-action>[-fN].jpg` (`-int<i>` interior shots, `-out` after leaving, `-base` door
base shot, `-freewalk-end`). `summary.json` fields: `schemaVersion` 1, `placeId`, `gitSha`, `dirty`,
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
- `aimCamera(yaw, pitch)` (existing) points the follow camera.

Movement and activation are real keys: the runner clicks the canvas, then sends W and E through CDP
`Input.dispatchKeyEvent`, so the input layer is exercised. A walk that exceeds 1.5x its expected
time falls back to a teleport.

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
   (no orphan when the parent dies; lane_watch sees it). First a one-door, one-fire smoke route at `--t 12`
   (about 2 min; `summary.json` `passes[].yawCheck` must show `stateYaw` = `movedBearing` = `bearing`), then the full
   run: `--route /tmp/<lane>/route.json --cdp 127.0.0.1:<port> --t 12,22 --out tooling/.reports/gpu-lane/walk/<place>`.
   The full run passes 10 min, so start it with `setsid nohup … &` and wait with
   `python3 tooling/repo-standards/lane_wait.py --files <out>/summary.json`.
4. Judge: `python3 tooling/gpu-lane/walk/walk_judge.py tooling/.reports/gpu-lane/walk/<place>`, then one
   `image-reader` agent per brief; read the `summary.json` findings beside the reader outputs.

Tests: `node --test tooling/gpu-lane/walk/*.test.mjs` and `python3 -m pytest -q tooling/gpu-lane/walk`.

## Cost per place

Measured on Claywater: see tooling/.reports/16k/walk10/deliver-runner.md

## Exit rule the judge briefs carry

Each reader returns a ranked defect list, worst first, with evidence per shot (file name, where in
the frame, which checklist row). "Nothing" is a valid answer. Generic improvements are out of scope.

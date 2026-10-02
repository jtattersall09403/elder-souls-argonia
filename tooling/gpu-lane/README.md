# gpu-lane: measuring the built studio on a RunPod GPU

Real frame rates for the deployed WebGL (or WebGPU) studio, measured on a rented NVIDIA GPU, because
SwiftShader on the VM cannot give a frame rate. Policy: [decision 0119](../../docs/decisions/0119-runpod-is-the-gpu-lane.md).
The walk-9 proof of the pod loop is `git show webgpu:docs/research/infrastructure/runpod-gpu-loop.md`.

This is the only pod harness, for WebGL and WebGPU alike; the site is always served from the pod (below). A lane never writes its own capture scripts.

**Which driver.** `measure.mjs` for frame rate and cost (settled fps, 1 % lows, HUD, census, profile; the perf lane). `pod-capture.mjs` for correctness on the WebGPU branch (errors, black share, luma, contexts per canvas, `--compare` dev against branch). `webgpu-boot-check.mjs` is the local and CI boot gate.

| Lane | Local tunnel port | Key path | Pod id |
|---|---|---|---|
| perf | 9232 | `/tmp/perf10/rp_key` | `2nektax0vb41u2` (walk 10) |
| webgpu | 9222 | `/tmp/webgpu10/rp_key` (also `~/.ssh/runpod_webgpu10`) | from `webgpu-lead.md` |

Key paths follow `/tmp/<lane><round>/rp_key`.

| File | What it does |
|---|---|
| `pod-setup.sh [webgl\|webgpu]` | Runs on the pod: installs Chrome, Xvfb, node, rsync; registers the NVIDIA Vulkan ICD; starts headed Chrome (ANGLE on Vulkan, WebGPU flags only for `webgpu`, background-throttling off so a background tab keeps rendering) on Xvfb :99 1280x720 with DevTools on the pod's 127.0.0.1:9222. Idempotent. |
| `pod-sync.sh <dist> <name>` | `POD_SSH="ssh -i <key> -p <port> root@<ip>"`: rsyncs a built studio to the pod's `/root/site/dists/<name>` (later runs only the diff) plus the server scripts, then (re)starts `serve.mjs` on the pod at 127.0.0.1:8099 over EVERY synced dist, detached (log `/root/serve.log`). One dist per base: any other pod dist built for the same base is deleted first. Exits non-zero unless the new server is alive and every served base answers. Sync a dev build and a branch build to serve both. |
| `serve.mjs <dist> [<dist>...] [--port 8099]` | Serves built studios as Pages does, each at the base it was built for (read from its `index.html`; `serve-lib.mjs`): a dev build at `/studio/`, a branch build at `/webgpu/`, studio data behind them (`$ES_DATA_PUBLIC`). Two dists built for one base fail at start. For a composed site pass `<site>/studio`. |
| `measure.mjs` | Drives Chrome over DevTools; per URL: first complete frame, then rAF frame times for `--settle` s, an optional held-W `--walk`, the HUD perf lines, console errors, 404s, memory, GPU adapter, screenshots. Writes one `measure.json` per run. |
| `checks.mjs` | The pure checks behind `--smoke`, `--census` and `--diag` (smoke verdict, black-frame luminance, foreign pages, hitch list, heap growth, census.txt). |
| `probes/` | Scripts `measure.mjs` injects before the page's scripts (no app code change); see Probes. |
| `hud-parse.mjs` | Parses the studio's perf HUD text (`PerfHudSection` in `apps/world-studio/src/character/CharacterMode.tsx`) into numbers. Change it with the HUD. |
| `pod-capture.mjs --url <url> --out <dir>` | WebGPU correctness capture over raw per-tab CDP: frames on a schedule, deduped console/GPU errors, screen-middle luma and black share, HUD lines, heap, `contexts` (one renderer per canvas reads 1 and 1), `__DIAG`, optional profile; `--compare <url>` writes per-read `lumaRatio`; compare luma on `reads.settled` / `lumaRatio.settled` (read `--settled-frames` N renderer frames, default 300, after the queue sat at 0 pending for 5 s and no earlier than 20 s), never on the fixed-second reads, which drift with streaming. `--steps <json>` runs a list of `{at, label, js, waitMs?}` (js evaluated at `at` s, then a full read into `result.steps`); every read carries `low1`, the 1 %-low fps from the last ~300 rAF frame durations. Flags in its header. Never playwright `connectOverCDP` on the pod Chrome (it hangs). |
| `hud-capture.mjs <dist> "<query>" <out>.txt <settleS>` | Reads the HUD perf lines four times over `<settleS>` with a screenshot. |
| `webgpu-boot-check.mjs` | Boots the BUILT `/webgpu/` studio to its first complete frame; fails on a freeze, GPU validation error, device loss or black view. `CHROME_CDP` points it at the pod's Chrome. Cached on its inputs. |
| `measure.test.mjs`, `pod-capture-lib.test.mjs`, `serve-lib.test.mjs` | `node --test tooling/gpu-lane/*.test.mjs` (< 1 s). |

**Toggle-then-read.** To prove a cause, one `pod-capture.mjs --steps` file toggles one thing at a time (unhook a queue, null `scene.environment`) and reads the screen-middle luma after each, all in one capture.

## The loop

The site is served ON the pod (rsync once, then diffs), not tunnelled back from the VM with `ssh -R`:
the frame rate and the load and streaming behaviour must not depend on the tunnel's bandwidth, and
repeated runs must read the same bytes. DevTools comes back to the VM with `ssh -L 9222`, so
`measure.mjs` runs on the VM and its output lands in the repo's `tooling/.reports/`.

1. Build exactly as the deploy does (`.github/workflows/deploy-pages.yml`: `npm run build`, then
   `npm run site:compose`; studio base `/elder-souls-argonia/studio/`), into a site dir:
   `tooling/repo-standards/job_guard.sh <lane> -- bash -c "npm run build && npm run site:compose -- --out /tmp/<lane>/site"`
   (walk 10: 29 s wall, peak 0.79 GiB, 642 MB site).
2. Key and pod. `ssh-keygen -t ed25519 -N "" -f /tmp/<lane>/rp_key`; create the pod (RunPod MCP
   `create-pod`): image `runpod/base:1.0.2-ubuntu2404`, cloud COMMUNITY, disk 20 GB, ports
   `["22/tcp"]`, env `NVIDIA_DRIVER_CAPABILITIES=all` and `PUBLIC_KEY=<contents of rp_key.pub>`.
   Use the direct address from `get-pod` (`ssh.direct`), not the `ssh.runpod.io` proxy.
   Price: RTX 3070 community ~$0.13/h. Keep ONE pod across iterations of a round; delete it (never
   stop it) when nothing is queued. Log minutes and dollars in the lane report.
3. Set up: `ssh -i /tmp/<lane>/rp_key -p <port> root@<ip> 'bash -s' < tooling/gpu-lane/pod-setup.sh`
   (~40 s; `'bash -s webgpu'` for the WebGPU studio).
4. Sync: `POD_SSH="ssh -i /tmp/<lane>/rp_key -p <port> root@<ip>" bash tooling/gpu-lane/pod-sync.sh /tmp/<lane>/site/studio dev` (and `pod-sync.sh <branch dist> webgpu` to serve the branch beside it).
5. Tunnel (run_in_background, timeout above the whole loop):
   `ssh -i /tmp/<lane>/rp_key -p <port> -o ServerAliveInterval=30 -N -L 9222:127.0.0.1:9222 root@<ip>`.
6. Measure:
   `node tooling/gpu-lane/measure.mjs --run <name> --url "?view=character&x=4.7789&z=1.9&t=22&w=rain" --url "<query 2>" --shots`
   (`--walk 10` adds a held-W walk; `--renderer webgpu` measures `/elder-souls-argonia/webgpu/`).
   **Run `--smoke` before any full baseline** (`node tooling/gpu-lane/measure.mjs --smoke --cdp 127.0.0.1:<port>`;
   spot a, about 40 s, exits 1 and names the reason): it fails on the vsync cap (uncapped fps within 1.5 of the
   58.5 blank-page cap), a ready gate over 40 s, a black frame (settled screenshot mean luminance under 8; the
   r3-ab night shots measure 29 and 36), a GPU/WebGL console error or lost context, or a page in the browser
   this run did not open.
   **A lane diagnoses with `--census` + `--profile` + walk hitches BEFORE its first fix batch.** `--census`
   (WebGL) adds, after the ready gate, `census.json` and `census.txt` beside measure.json: draws per frame by
   owner and layer mask (`| L1`), empty draws (`instanceCount` 0 or `count` 0), distinct materials counted by
   material uuid across owners (not by owner name), program count, objects with `matrixAutoUpdate` on and how
   many did not move over 2 s, JS heap at 0 s and 30 s (MB/s slope) and every frame over 20 ms in a 30 s window
   with the top self-time functions of the CDP CPU profile samples inside it (a hitch with no functions is the
   profiler starting, not the app). `--diag relink,heap` adds the probes below.
   For a local SwiftShader smoke test, point `--cdp` at a local Chrome started with
   `--remote-debugging-port` and serve the site with `node tooling/gpu-lane/serve.mjs <site>/studio`.

## Probes

`measure.mjs --diag relink,heap` (or `diag=relink,heap` in the `--url` query) injects `probes/<name>.js` with
`addInitScript`; each url entry in measure.json gets a `diag` object. Never hand-patch a probe script in
`/tmp` again: change the file here, with a test if it has logic.

| Probe | Reports |
|---|---|
| `relink` | `gl.linkProgram` calls: total, ms on the main thread, distinct programs, how many linked more than once, links after 30 s, the last 40 link times. A rising `linksAfter30s` is a program relink storm. |
| `heap` | `performance.memory` once a second (last 120 samples). With `--census` it also adds `heap.sampledGrowth` to census.json: a CDP HeapProfiler sampling profile read at the start and end of the 30 s window, functions whose retained MB grew. It wraps no typed-array constructor (that broke GLTFLoader). |
| `census` | Injected by `--census` itself: the `renderBufferDirect` hook behind the draw census and the matrixAutoUpdate census. |

## Gotchas

- **The frame is capped at ~60 and fps cannot show headroom.** `pod-setup.sh` passes
  `--disable-gpu-vsync --disable-frame-rate-limit`, but on Chrome 154 under Xvfb a trivial page still
  runs rAF at 58.5 fps (walk 10, six launch variants: ANGLE GL, ANGLE Vulkan, `--headless=new`,
  `--ozone-platform=headless`, the background-throttling flags). A view at 58-60 fps is "at least
  60"; read headroom from the HUD's `gpuMs` / `gpuByPass` and `cpuMs`. Below the cap fps is real
  (walk 10: Riverwalk 52, Greenspring 39).
- **A dead site server looks like a capped frame.** `serve.mjs` started by a plain `nohup` died with
  the ssh session, and the walk-10 base run measured an `ERR_CONNECTION_REFUSED` page at 58 fps on
  every URL. `pod-sync.sh` starts it with `setsid` (log `/root/serve.log`), and `measure.mjs`
  stops when the page fails to load.
- **The network never goes quiet.** Terrain and vegetation stream continuously, so "no requests for
  3 s" never happens (walk-10 base run: every URL hit the timeout). The studio has no "loaded" flag;
  `isReady` in `measure.mjs` requires ALL of: 20 s since navigation; HUD tris within 2 % for 5 s;
  no "Loading" line; HUD CPU 'pre' and 'gc' stages (line 5) both under 2 ms for 5 consecutive
  seconds. An earlier tris-only gate fired at 9-12 s on scenes still streaming (pre 11-16 ms, gc
  8 ms, 200-650 ms hitches) and measured loading scenes at 7-36 fps. Capped by `--ready-timeout`
  (150 s); a scene that never settles records `ready: false`.
- **Orphan tabs contaminate every number.** In walk 10 the pod Chrome held four studio tabs left by
  earlier runs, rendering beside every probe (a Greenspring trace measured 90.8 ms frames with them
  open, 12.2 ms without). `measure.mjs` now closes every page already open in the attached Chrome
  before it opens its own, logs how many it closed and records `orphansClosed` in measure.json. It opens a
  blank keeper page first, because closing the last page exits headed Chrome and the DevTools port with it.
- **Profiling needs sourcemaps.** `vite.config.ts` sets `build.sourcemap: false`; build the profiled
  dist with `cd apps/world-studio && npx vite build --sourcemap` (the CLI flag overrides the
  config) so `.cpuprofile` function names resolve. Not for shipped builds.

## Reading measure.json

Top level: `gitSha`, `dirty`, `builtAt` (served index.html mtime), `renderer`, `window`, `dpr`,
`browser`, `orphansClosed` (pages closed at start). Per entry of `urls[]`:

- `ready` / `readyS`: whether, and after how long, the world stopped arriving (see Gotchas: fps
  published, no loading line, HUD tris stable 5 s). `ready: false` means the numbers after it
  were taken on a loading scene.
- `settledFps` and `p1LowFps` come from the SAME window: the `--settle` seconds (default 10)
  sampled right after the ready gate passes. `settledFps` (mean over the window, from in-page rAF timestamps), `minFps` (slowest frame),
  `p1LowFps` (mean of the slowest 1 % of frames), `frameTimes` (mean/p50/p95/p99/max ms).
- `hud`: `tris`/`trisBudget`, `trisByGroup` (main and shadow per source), `gpuByPass` and
  `cpuByStage` (`{avg, max?}` ms per label), `gpuMs`/`cpuMs`, `drawCalls`, `raw` (the lines read).
  `gpuWall: true` means the GPU timer reports wall time, not work.
- Cap-free (the frame cap above hides headroom): `workMs` {mean, p50, p99, max} is the main-thread
  time per frame (first rAF callback start to the later of the last callback's end and a
  MessageChannel task posted from the first), `gpuFrameMs` the HUD GPU total seen that frame (a
  60-frame mean), `costMs` = max(work, gpu); `uncappedFps` = 1000 / mean cost, `p1LowUncapped` =
  1000 / p99 cost. `wrapperMsPerFrame` is what the in-page wrapper itself costs. `hitches`: every
  frame over 33 ms with its time, work and GPU ms (attribute with `--profile`).
- `profile` (`--profile <s>`; during the walk when `--walk` is set): `file` (.cpuprofile, open in
  Chrome DevTools), `topSelf` (top 40 functions by self ms, `name file:line:col`), `byFile`. The
  build ships no sourcemaps, so three.js and app code share the bundle chunks; read the names.
- `walk`: the same frame stats and HUD over the held-W window.
- `consoleErrors`, `http404s`, `memory` (`performance.memory`), `gpuAdapter` (WebGL
  UNMASKED_RENDERER or the WebGPU adapter info: check it names the NVIDIA card, not SwiftShader),
  `screenshots`.

## Converting to the owner's M2

`r` = pod Riverwalk-night-rain settled fps / 37 (the M2's figure at the same view); the measured
value of `r` is in [docs/phases/lanes/performance-lane.md](../../docs/phases/lanes/performance-lane.md).
Converted fps = pod fps / r. Target: converted settled ≥ 60 and converted 1 % low ≥ 50.

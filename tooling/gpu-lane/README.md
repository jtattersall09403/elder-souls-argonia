# gpu-lane: measuring the built studio on a RunPod GPU

Real frame rates for the deployed WebGL (or WebGPU) studio, measured on a rented NVIDIA GPU, because
SwiftShader on the VM cannot give a frame rate. Policy: [decision 0119](../../docs/decisions/0119-runpod-is-the-gpu-lane.md).
The walk-9 proof of the pod loop is `git show webgpu:docs/research/infrastructure/runpod-gpu-loop.md`.

This is the only pod harness, for WebGL and WebGPU alike; the site is always served from the pod (below). A lane never writes its own capture scripts.

**Which driver.** `measure.mjs --spots <file>` is the perf round: every spot of a list in ONE invocation and ONE tab, one `summary.md`, with `--smoke`, `--census`, `--diag`, `--trace`, `--profile`, `--leak` for the diagnosis flags. `pod-capture.mjs --views` is the WebGPU/visual round: every view x both dists in one tab (luma, errors, fps, cap-free cost, stages, hitches, heap, probes). `webgpu-boot-check.mjs` is the local and CI boot gate.

**The loop is one measure invocation per round, one diagnosis report per round listing every cause, then one parallel fix wave; fix agents never measure.**

| Lane | Local tunnel port | Key path | Pod id |
|---|---|---|---|
| perf | 9232 | `/tmp/perf10/rp_key` | `2nektax0vb41u2` (walk 10) |
| webgpu | 9222 | `/tmp/webgpu10/rp_key` (also `~/.ssh/runpod_webgpu10`) | from `webgpu-lead.md` |

Key paths follow `/tmp/<lane><round>/rp_key`.

| File | What it does |
|---|---|
| `pod-setup.sh [webgl\|webgpu]` | Runs on the pod: installs Chrome, Xvfb, node, rsync; registers the NVIDIA Vulkan ICD; starts headed Chrome (ANGLE on Vulkan, WebGPU flags only for `webgpu`, background-throttling off so a background tab keeps rendering) on Xvfb :99 1280x720 with DevTools on the pod's 127.0.0.1:9222. Idempotent. |
| `pod-sync.sh <dist> <name>` | `POD_SSH="ssh -i <key> -p <port> root@<ip>"`: rsyncs a built studio (a composed site's `studio/`) to the pod's `/root/site/dists/<name>` (later runs only the diff) plus the server scripts and the character files, then restarts `serve.mjs` on the pod at 127.0.0.1:8099 over EVERY synced dist, detached (log `/root/serve.log`). Idempotent: kills the old server (pid file and port owner) before the new start, and a no-change re-run takes seconds. One dist per base: any other pod dist built for the same base is deleted first. Exits non-zero unless the new server is alive and every served base answers. |
| `serve.mjs <dist> [<dist>...] [--port 8099]` | Serves built studios as Pages does, each at the base it was built for (read from its `index.html`; `serve-lib.mjs`): a dev build at `/studio/`, a branch build at `/webgpu/`, studio data behind them (`$ES_DATA_PUBLIC`; `apps/world-studio/scripts/lib/webgpu-static.mjs`). Two dists built for one base fail at start. For a composed site pass `<site>/studio`. |
| `measure.mjs` | Drives Chrome over DevTools (playwright over CDP, a keeper page first); per URL or spot: first complete frame, then rAF frame times for `--settle` s, an optional held-W `--walk`, the HUD perf lines, console errors, 404s, memory, GPU adapter, screenshots. Writes `measure.json`, and with `--spots` `summary.md` / `summary.json`. `--pod "<ssh>"` samples the pod's steal and major faults per spot (`host-sampler.mjs`; a `--spots` run with any headline row is refused unless `--pod` or an explicit `--no-pod` is given; `summary.md` heads `host sampler: on/off`); `--maps <dir>` maps minified frames to source (`source-maps.mjs`). |
| `spots.mjs`, `spots/perf10.txt`, `spots/perf10-c4.txt` | Spot-file parser (`<name> <?query> [--aim yaw,pitch] [walk=<s> \| steps=<seq>] [x<N>] [diag=<probes>] [trace] [trace-v8] [trace-gpu] [memory-infra] [heapsample] [profile] [profile-walk]`; a probe token makes the spot a diagnosis row, see Probe rules), the summary table and the leak slope. `steps=` is a motion sequence of comma-separated segments: `w:<s>` holds W for s seconds, `yaw:<+\|-rad>` turns the follow camera by rad while W stays held (the character turns with it; `aimCamera` is absolute, so a sequence with a turn first sets the yaw to the spot's `--aim` yaw, else 0); e.g. `steps=w:7,yaw:+1.2,w:6,yaw:-2.0,w:7`. `walk=<s>` is `steps=w:<s>`. The walk window (stats, trace, profile, `walk` screenshot) spans the whole sequence, after the static settle. `spots/perf10.txt` holds the perf10 spots a-h (h = the aimed ESE night-rain view; e = d with a 20 s W-held walk, `x3` = three times: e, e2, e3). |
| `spots/gen-matrix.mjs` → `spots/matrix.txt` | `node tooling/gpu-lane/spots/gen-matrix.mjs` writes the one-off owner acceptance set (performance-lane.md § Owner acceptance run) from `apps/world-studio/public/province/places.json`: 3 places × t 12/22 × clear/rain with a 20 s turning walk, plus the ESE marsh walk. Generated; never hand-edit. |
| `checks.mjs` | The pure checks behind `--smoke`, `--census` and `--diag` (smoke verdict, black-frame luminance, foreign pages, hitch list, heap growth, census.txt). |
| `probes/` | Scripts `measure.mjs` injects before the page's scripts (no app code change); see Probes. |
| `hud-parse.mjs` | Parses the studio's perf HUD text (`PerfHudSection` in `apps/world-studio/src/character/CharacterMode.tsx`) into numbers. Change it with the HUD. |
| `pod-capture.mjs --views <json> --out <dir> [--pod "<ssh>"]` | A round's measurement in ONE invocation (decision 0106 d22): every view `{name, url, steps?, shots?, seconds?}` captured in turn in ONE tab (orphan pages closed first). Per view `<out>/<name>/result.json` and a row of `<out>/summary.md`: luma settled/final and blackShare, fps, low1, GPU and CPU ms, cap-free `costMs` / `uncappedFps` (`--window` of 10 s after the settled read), draw calls and triangles, post-GC heap MB/min, main-thread self ms per frame by stage and hitches over 33 ms with their top stage (`trace-frames.mjs`), GPU/console/page errors, 404s, `probe`. Settled read: `--settled-frames` N (300) renderer frames after the queue sat at 0 pending for 5 s and no earlier than `--settle-floor` (60 s). `--url <a> [--compare <b>]` is the two-view case. `--pod` opens and closes its own CDP tunnel. Example: `views/webgpu10-iter6.json`. Never playwright `connectOverCDP` on the pod Chrome in this tool (it hangs); `measure.mjs` works around it with its keeper page. |
| `tunnels.mjs open\|list\|close` | Every ssh tunnel the harness opens is recorded (PID, purpose, ports) in `/tmp/gpu-lane/tunnels.json`; `close [--purpose p]` kills only recorded PIDs whose command line is still ssh. `pod-capture --pod` uses it; `tunnels.mjs open --pod "<ssh>" --local 9232` replaces a hand-run `ssh -L` for `measure.mjs`. Never `pkill`. |
| `trace-frames.mjs` | Trace categories, the streaming event filter, the long-frame classifier (`node tooling/gpu-lane/trace-frames.mjs <x.trace.json> [--profile <x.cpuprofile>] [--over 20]`; each window's last interval, the harness's own end-of-window message of 29-47 ms, is dropped from the list and counts; every long frame has `pageMs`, the page `performance.now()` at its start, from the `gpulane-anchor:` console.timeStamp `measure.mjs` fires just after the trace starts, null without it; `measure.mjs` adds `links`, the relink-probe events within 300 ms of the frame) frames grouped by their enclosing `ProxyMain::BeginMainFrame` / `PageAnimator::serviceScriptedAnimations` (`groupFrames`), never by a time gap; each long frame's `byCause` is main-thread SELF ms per cause (nested events counted once, so it sums to at most the frame) and `offMain` the other threads' self ms; and main-thread self ms by stage (gc, shader, upload, gpu, timer, js, compositor, other); shared by `measure.mjs --trace` and `pod-capture`. |
| `hud-capture.mjs <dist> "<query>" <out>.txt <settleS>` | Reads the HUD perf lines four times over `<settleS>` with a screenshot. |
| `webgpu-boot-check.mjs` | Boots the BUILT `/webgpu/` studio to its first complete frame; fails on a freeze, GPU validation error, device loss or black view. `CHROME_CDP` points it at the pod's Chrome. Cached on its inputs. |
| `walk/` | The agent walk harness: `walk_route.py` (route from a place's published data), `walk_run.mjs` (one tab, every pass, shots and `summary.json`), `walk_judge.py` (reader briefs); see `walk/README.md`. |
| `*.test.mjs` | `node --test tooling/gpu-lane/*.test.mjs` (< 1 s). |

## The loop

The site is served ON the pod (rsync once, then diffs), not tunnelled back from the VM with `ssh -R`:
the frame rate and the load and streaming behaviour must not depend on the tunnel's bandwidth, and
repeated runs must read the same bytes. DevTools comes back to the VM with `ssh -L`, so
`measure.mjs` runs on the VM and its output lands in the repo's `tooling/.reports/`.

1. Build exactly as the deploy does (`.github/workflows/deploy-pages.yml`: `npm run build`, then
   `npm run site:compose`; studio base `/elder-souls-argonia/studio/`), into a site dir:
   `tooling/repo-standards/job_guard.sh <lane> -- bash -c "ES_GPU_LANE_SOURCEMAP=1 npm run build && npm run site:compose -- --out /tmp/<lane>/site"`
   (`ES_GPU_LANE_SOURCEMAP=1` adds hidden source maps for `measure.mjs --maps /tmp/<lane>/site`; same bytes otherwise)
   (walk 10: 29 s wall, peak 0.79 GiB, 642 MB site).
2. Key and pod. `ssh-keygen -t ed25519 -N "" -f /tmp/<lane>/rp_key`; create the pod (RunPod MCP
   `create-pod`): image `runpod/base:1.0.2-ubuntu2404`, cloud COMMUNITY, disk 20 GB, ports
   `["22/tcp"]`, env `NVIDIA_DRIVER_CAPABILITIES=all` and `PUBLIC_KEY=<contents of rp_key.pub>`.
   Use the direct address from `get-pod` (`ssh.direct`), not the `ssh.runpod.io` proxy.
   Price: RTX 3070 community ~$0.13/h. Keep ONE pod across iterations of a round; delete it (never
   stop it) when nothing is queued. Log minutes and dollars in the lane report.
3. Set up: `ssh -i /tmp/<lane>/rp_key -p <port> root@<ip> 'bash -s' < tooling/gpu-lane/pod-setup.sh`
   (~40 s; `'bash -s webgpu'` for the WebGPU studio).
4. Sync: `POD_SSH="ssh -i /tmp/<lane>/rp_key -p <port> root@<ip>" bash tooling/gpu-lane/pod-sync.sh /tmp/<lane>/site/studio dev`
   (and `pod-sync.sh <branch dist> webgpu` to serve the branch beside it).
5. Tunnel: `node tooling/gpu-lane/tunnels.mjs open --pod "<same ssh>" --local <port>`; `tunnels.mjs close` after.
6. Measure, ONE invocation for the round:
   `node tooling/gpu-lane/measure.mjs --run <round> --cdp 127.0.0.1:<port> --spots tooling/gpu-lane/spots/perf10-c4.txt [--bar 83,69]` (no global probe flag: the headline spots stay probe-off, the diagnosis spots carry their own tokens)
   It moves between spots in one tab (ready gate per spot), takes a clean (HUD-free) settled screenshot (captures run with the clock running, `rate=0.5`, and the HUD hidden)
   of each (`<run dir>/<name>-settled.jpg`) and writes `summary.md` / `summary.json`: settled fps, p1Low,
   uncapped, p1LowUncapped, max ms, over20, over33, pass against `--bar fps,p1low`; a walk spot has two rows, its
   static settle and its walk window, each judged. `--leak <s> [--leak-every 15]` is ONE long capture at the first spot (run right after that spot's measurement; every
   remaining spot of the file, walks and repeats included, then measures normally): post-GC heap every
   15 s, the slope in MB/min and the top growing allocation sites (`leak.json`, `leak.txt`).
   One `--url "?view=character&x=..&z=..&t=22&w=rain"` (repeatable; `--walk 10`, `--shots`) replaces `--spots` for a
   single look; `--renderer webgpu` measures `/elder-souls-argonia/webgpu/`.
7. Diagnose: ONE report per round lists every cause found; then ONE parallel fix wave. Fix agents never measure.

**Run `--smoke` before any full baseline** (clock running via `rate=0.5`, HUD hidden in its screenshot; `node tooling/gpu-lane/measure.mjs --smoke --cdp 127.0.0.1:<port>`;
spot a, about 40 s, exits 1 and names the reason): it fails on the vsync cap (uncapped fps within 1.5 of the
58.5 blank-page cap), a ready gate over 40 s, a black frame (settled screenshot mean luminance under 8), a
GPU/WebGL console error or lost context, or a page in the browser this run did not open.

**A lane diagnoses with `--census` + `--profile` + walk hitches BEFORE its first fix batch.** `--census`
(WebGL) adds, after the ready gate, `census.json` and `census.txt` beside measure.json: draws per frame by
owner and layer mask (`| L1`), empty draws, distinct materials counted by material uuid across owners,
program count, objects with `matrixAutoUpdate` on and how many did not move over 2 s, JS heap at 0 s and 30 s
(MB/s slope) and every frame over 20 ms in a 30 s window with the top self-time functions of the CDP CPU
profile samples inside it. The hitch window opens 2 s (`CENSUS_LEAD_MS`) after `Profiler.start`, because
starting the profiler costs one ~400 ms frame of its own. `--diag relink,heap` adds the probes below.
**A hitch the CPU profile cannot explain** needs `--trace`: a Chrome trace of the settle window and of the walk,
written as `url<i>-settled.trace.json` / `url<i>-walk.trace.json`; the entry's `trace` holds the long-frame
classes from `trace-frames.mjs`. the `trace-v8` spot token (implies `trace`) adds `disabled-by-default-v8.compile`, `disabled-by-default-v8.runtime` and `v8.execute` and gives each long frame, and the whole window (`v8`), `{n, ms, byName}` of V8 Deopt/Optimiz/Compile/Maglev/Turbofan/Sparkplug events overlapping it. `--trace-gpu` (implies `--trace`) adds the GPU categories (`disabled-by-default-gpu.service`, `disabled-by-default-gpu.device`, `gpu.angle`, `disabled-by-default-angle`; ones Chrome does not know are ignored), keeps GPU-process events of any duration only inside long frames (file stays small) and gives each long frame `gpuTop`, its five longest GPU-process events (`name`, `cat`, `ms`, `args`), and `spanUs`. Long frames are measured start to start (the rAF callbacks of one frame grouped), like the harness intervals; `durMs` is the frame's main-thread rAF work. **Per-spot probe tokens** in a `--spots` file (`diag=<probes>`, `trace`, `trace-gpu`, `memory-infra`, `heapsample`, `profile`, `profile-walk`) turn a probe on for that spot only: `memory-infra` adds `disabled-by-default-memory-infra` with Chrome's own light memory dump every 2 s (`MEMORY_DUMP_CONFIG`, set in `Tracing.start` before the window) and the trace entry's `memoryDumps` (per dump and process: `pageMs`, `discardableMB`, MB of discardable, malloc, partition_alloc, skia, cc, gpu, v8, blink_gc, `top` 5); `heapsample` (walk spots) runs a HeapProfiler sampling profile (32768 B, objects collected by major and minor GC included) over the walk window, writes `<spot>-walk.heapsample.json` and puts `heapsample.topAllocated` (25 functions, `name url:line`, allocated MB) in the entry; `profile` starts a CDP CPU profile (200 us sampling) before the settled stats window and stops it after (no CDP inside the window), writes `<spot>-settled.cpuprofile` and puts `profile.topSelfPerFrame` (25 functions, `name`, `at` url:line, `msPerFrame` self time) in the entry; `profile-walk` (walk spots) does the same around the walk window (started just before, stopped just after, no CDP inside it), writes `<spot>-walk.cpuprofile` and puts `profileWalk.topSelfPerFrame` plus `profileWalk.spikes` in the entry: for every walk frame with rAF work >= 12 ms, its top 8 self-time functions (`name`, `at`, `ms`) sampled inside that frame's span; `diag=` appends itself to the spot's query, and an in-page probe not given by `--diag` runs only on a page whose `diag=` names it. `--aim "yaw,pitch"` (radians) aims the follow camera before the settle;
`--clean 1` hides the HUD for the screenshots only. **No CDP call or `page.evaluate` runs inside a stats window**
(a DevTools message is a 45-52 ms main-thread task that lands in the rAF intervals): the in-page sampler records the
whole window into a page buffer and closes it with its own timer, the harness waits on the Node side and reads the
buffer once after the window; only the walk's own input (W key events, `steps=` yaw turns) runs inside it. In the
trace, a frame holding a `blink.mojom.DevTools` mojo message is classed `harness` (counted in `harness`, never listed,
not in the stats), and long frames starting after the window's last rAF (the `Tracing.end` flush) are dropped. For a local SwiftShader smoke test, point `--cdp` at a local
Chrome started with `--remote-debugging-port` and serve with `node tooling/gpu-lane/serve.mjs <site>/studio`.

**Toggle-then-read.** To prove a cause, one `pod-capture.mjs --views` file with `steps` toggles one thing at a time
(unhook a queue, null `scene.environment`) and reads the screen-middle luma after each, all in one capture.

## URL switches

| Switch | Where it acts | Effect |
|---|---|---|
| `rate=<n>` | studio (`src/sky/timeState.ts` `applyTimeParams` -> `worldClock.rate`) | World-clock rate in world MINUTES per real second; absent, the clock is paused. Captures pass `rate=0.5` (`CAPTURE_RATE` in `spots.mjs`): the game runs at `GAME_TIME_SCALE` = 30 world seconds per real second (`packages/world-time/src/clock.ts:109`), = 0.5 world minutes per real second (`GAME_RATE_MIN_PER_S`). A 2-3 min spot therefore drifts 60-90 game minutes; `rate=30` ran 60x the game speed. Every capture URL carries `rate=0.5`; a row captured without a running clock (paused, or an invalid rate) is not a performance measurement and never a bar row. |
| `diag=1` | studio (`src/diagOverlay.ts`) | Diag overlay and `window.__DIAG`: fps, worst ms, per-second pipelines, shaders, builds, skipped draws, `builds pending`, `pipelines compiling`. |
| `water=0` | studio (`CharacterMode.tsx`) | No water surface. |
| `aa=0` | studio (`CharacterMode.tsx`) | Anti-aliasing off. |
| `renderer=webgl` | studio, branch build | The WebGPU build on its WebGL backend. |
| `buildq=0` | studio (game-core shader build queue) | Build queue off. |

## Probes

**Probe rules** (perf-diag6 C1: a probe wrap on `properties.get` cost 30-40 % of settled fps for two rounds):
1. A probe never wraps a function three calls per draw at steady state (`renderer.properties.get`, `renderBufferDirect`'s callees, `setProgram` and the like). A hook that must sit on a per-draw path exists only while the event it records is happening, and is gone in a settled frame.
2. Every headline fps row is taken with probes off: no `--diag`, `--trace`, `--profile`, `--census` or heap sampling on that spot.
3. A probe or trace run is diagnosis only and never produces a bar row: `measure.mjs` prints its rows with pass `diag` and leaves them out of "N of M spots pass", so one `--spots` file holds the probe-off headline spots and the diagnosis spots after them (`spots/perf10-c4.txt`).

`measure.mjs --diag relink,heap` (every spot), `diag=relink,heap` in a `--url` query or a `diag=` spot token (that spot only) injects `probes/<name>.js` with
`addInitScript`; each url entry in measure.json gets a `diag` object. Never hand-patch a probe script in
`/tmp` again: change the file here, with a test if it has logic.

| Probe | Reports |
|---|---|
| `relink` | `gl.linkProgram` calls: total, ms on the main thread, distinct programs, how many linked more than once, links after 30 s, the last 400 links, each `[t, ms, shaderName, {type, name, owner, parents (<=3), depth (shadow/override material), transparent, defines, key (<=80 chars), t, warm (inside the synchronous part of `renderer.compile`/`compileAsync`), first (a draw link of a material no compile was handed before it), matUuid, progKey (three's full program cacheKey from `renderer.info.programs`, <=400 chars), progKeyHash}]`; owner comes from a `renderBufferDirect` hook (links happen inside it) that is armed only while links happen (at renderer construction and by any link, removed after 5 s with none, so settled frames call three's own function; `__DIAG__.relinkHookArmed()`); links outside it, or while it is disarmed, read `(outside draw)`; a warm link's matUuid is the material the compile was handed (its scene/object arguments traversed, material arrays and `overrideMaterial` included), or the one whose name matches the program's `SHADER_NAME`; an owner with no object name also carries `detail {objName, objType, userData (first 8 keys), parents (<=8 names), matName, matUuid (8 chars)}`. `materials` holds per material uuid EVERY warm key hash and every draw key hash (`warmHashes`, `drawHashes`) and, for each draw key not among the warm keys, `mismatches[]`: `{drawHash, nearestWarmHash (fewest differing fields), diffs[{index, warm, draw}]}` listing every differing `,`-separated field; `same` is true when there is none. `compile` / `compileAsync` stay wrapped (called only to warm, never per draw). A rising `linksAfter30s` is a program relink storm. |
| `uniforms` | `uniform3f`/`uniform3fv` calls per (program `SHADER_NAME`, uniform name from `getUniformLocation`, current program from `useProgram`) since page load, with rAF `frames` and `ms`: `top` 30 `{shaderName, uniformName, calls, callsPerFrame}`, `distinct`, and `perFrame`/`totals` of uniform3 vs uniform4f/4fv vs uniformMatrix4fv for scale. It wraps per-draw GL calls, so it runs only on `diag=uniforms` spots (`spots/perf10-c6-diag.txt`), never a headline row. A high `callsPerFrame` names the vec3 three re-sends with a changed value (setValueV3f cache miss). |
| `draws` | Per rAF frame (a `requestAnimationFrame` hook cuts frames; ring of the last 4000): `frames` `[{t (page ms), draws, inst (instances; 1 per non-instanced draw), top: [[shaderName, draws] x6]}]` and `shaderNames`, from wrapped `drawElements`/`drawArrays`/`*Instanced` and `useProgram`. It wraps per-draw GL calls, so it runs only on `diag=draws` spots (`spots/perf10-c6-diag3.txt`), never a headline row. Names which shader owns the draw count of a spike frame. |
| `heap` | No in-page script (no `performance.memory` series: it counts garbage, 1.9 GB where the post-GC heap is ~200 MB). `diag.heap.postGcMB` is one `HeapProfiler.collectGarbage` + `Runtime.getHeapUsage` reading taken by `measure.mjs` after every stats window has closed. With `--census` it also adds `heap.sampledGrowth` to census.json: a CDP HeapProfiler sampling profile read at the start and end of the 30 s window, functions whose retained MB grew. It wraps no typed-array constructor (that broke GLTFLoader). |
| `census` | Injected by `--census` itself: the `renderBufferDirect` hook behind the draw census and the matrixAutoUpdate census. |

## Gotchas

- **Judge water facets on two wave phases.** Use the settled and walk screenshots of the same spot,
  or two spots, never one screenshot: a favourable phase hid the shore facets in c5m2 and c6s2 (diag14 V3).
- **Check the frame cap before trusting fps.** `pod-setup.sh` starts Chrome with `--disable-gpu-vsync
  --disable-frame-rate-limit`; walk 10 still read rAF at 58.5 fps on a trivial page (Chrome 154 under Xvfb).
  `pod-capture` reads a blank page's rAF rate first and records `cap.capDetected`: when true, a view at
  58-60 fps means "at least 60" and headroom is read from `costMs` / `uncappedFps` and GPU ms. `measure.mjs`
  reports the same headroom as `uncappedFps` / `p1LowUncapped`.
- **A dead site server looks like a capped frame.** `serve.mjs` started by a plain `nohup` died with
  the ssh session, and the walk-10 base run measured an `ERR_CONNECTION_REFUSED` page at 58 fps on
  every URL. `pod-sync.sh` starts it with `setsid` (log `/root/serve.log`), and `measure.mjs`
  stops when the page fails to load.
- **The network never goes quiet.** Terrain and vegetation stream continuously, so "no requests for
  3 s" never happens. The studio has no "loaded" flag; `isReady` in `measure.mjs` requires ALL of: 20 s since
  navigation; HUD tris within 2 % for 5 s; no "Loading" line; HUD CPU 'pre' and 'gc' stages both under 2 ms
  for 5 consecutive seconds. Capped by `--ready-timeout` (150 s); a scene that never settles records `ready: false`.
- **Orphan tabs contaminate every number.** In walk 10 the pod Chrome held four studio tabs left by
  earlier runs (a Greenspring trace measured 90.8 ms frames with them open, 12.2 ms without). Both drivers
  close every other page first; `measure.mjs` opens a blank keeper page before, because closing the last page
  exits headed Chrome and the DevTools port with it, and records `orphansClosed`.
- **Profiling needs sourcemaps.** `vite.config.ts` sets `build.sourcemap: false`; build the profiled
  dist with `cd apps/world-studio && npx vite build --sourcemap` so `.cpuprofile` function names resolve.

## Reading measure.json

Top level: `gitSha`, `dirty`, `builtAt` (served index.html mtime), `renderer`, `window`, `dpr`,
`browser`, `orphansClosed`. Per entry of `urls[]`:

- `ready` / `readyS`: whether, and after how long, the world stopped arriving. `ready: false` means the
  numbers after it were taken on a loading scene.
- `settledFps` and `p1LowFps` come from the SAME window: the `--settle` seconds (default 10) sampled right
  after the ready gate passes. `settledFps` (mean from in-page rAF timestamps), `minFps`, `p1LowFps` (mean of the
  slowest 1 % of frames), `frameTimes` (mean/p50/p95/p99/max ms), `over20` / `over33` (frames over 20 / 33 ms).
- `hud`: `tris`/`trisBudget`, `trisByGroup`, `gpuByPass` and `cpuByStage` (`{avg, max?}` ms per label),
  `gpuMs`/`cpuMs`, `drawCalls`, `raw`. `gpuWall: true` means the GPU timer reports wall time, not work.
- Cap-free: `workMs` {mean, p50, p99, max} is the main-thread time per frame, `gpuFrameMs` the HUD GPU total
  seen that frame, `costMs` = max(work, gpu); `uncappedFps` = 1000 / mean cost, `p1LowUncapped` = 1000 / p99
  cost. `wrapperMsPerFrame` is what the in-page wrapper itself costs. `hitches`: every frame over 33 ms.
- `series` (settled; `walk.series` for the walk): the per-frame window as column arrays `{t, dt, work, gpu}` (page
  ms). The studio exposes no per-frame stage times; the HUD `cpuByStage` holds their window means.
- `workerGaps` (and `walk.workerGaps`): `[pageMs, ms]` gaps over 20 ms seen by a heartbeat Worker (5 ms tick, its
  own thread) started at the window's open and read once after it; null where Worker is unavailable.
- `harnessLog`: every harness action of the spot (goto, evaluate, screenshot, trace/profiler/heapsample start and
  stop, collectGarbage, key input) as `{action, t (page ms), ms}`.
- `hostSamples` (`--pod "<ssh>"`, null without it): the pod's own counters every 100 ms over the whole spot
  (`host-sampler.mjs`, one ssh running a shell loop with one extra awk pass per sample, started after the goto and
  killed at the spot's end), as column arrays per interval (`t` page ms, interval end): `stealMs` (summed /proc/stat
  cpu steal), `majFaults` (pgmajfault), `load1`/`runnable` (/proc/loadavg), `busyPct` (all CPUs), `mhzMin`/`mhzMax`
  (/proc/cpuinfo), `top` (3 processes by CPU since the previous sample, `{proc: pid/comm, ms}`); for the renderer
  main thread (the `CrRendererMain` thread whose CPU time grew most, re-picked each sample, so the studio tab and
  not the keeper page): `core` (stat field 39), `coreMhz` (that core's cpuinfo MHz, scaling_cur_freq fallback),
  `runMs`/`waitMs` (schedstat: on CPU / waiting on the run queue), `migr` (nr_migrations), `nvcsw`
  (nonvoluntary switches), null where the picked thread changed or a file is unreadable; for `CrGpuMain`:
  `gpuCore`, `gpuCoreMhz`, `gpuWaitMs`; container-wide `throttledMs` (cgroup cpu.stat); plus one-time `nproc`,
  `cpuset`, `governor`, `maxMhzDistinct`. `summary.md` heads the run with nproc, max load and max busy %.
  `hostSpikes`: the `[start, end]` page-ms intervals at or over `HOST_SPIKE` (steal 20 ms or 5 major faults).
- `coreCorrelation` (spot and `walk.coreCorrelation`, with `--pod`): frames with `work` >= 12 ms ("long") vs the
  rest, each matched to the host sample covering its `t`: `{long, normal}` each `{n, coreMhz, migrPct, waitMs,
  throttledMs}` (means; share of frames whose sample shows a migration) and `longFrames` `[t, work, core, coreMhz,
  waitMs, migr, throttledMs]` (max 60). `summary.md` prints one `core: long n=.. mhz a vs b, migr x% vs y%, wait ..,
  throttled ..` line per window.
- `hitchContext.{settled,walk}`: per hitch over 33 ms, the nearest `harnessLog` action within 500 ms of its gap,
  whether the worker saw an overlapping gap (`workerGap`), whether a host spike overlaps it (`hostSpike`) and
  `cause`: `host` (worker gap + host spike), `process` (worker gap, no spike: the renderer process stopped), `main`
  (the worker ran: main-thread work); summary.md lists them. An action beside it = the harness.
- `profile` (`--profile <s>`; during the walk when `--walk` is set): `file` (.cpuprofile), `topSelf` (top 40
  functions by self ms), `byFile`.
- Source positions (`--maps <dir>`): build with `ES_GPU_LANE_SOURCEMAP=1` (world-studio writes hidden
  `<chunk>.js.map` files, no sourceMappingURL; the Pages build never sets it) and pass the built site or
  `apps/world-studio/dist`; `heapsample.topAllocated`, `profile.topSelf` and `profile.topSelfPerFrame` then name a
  minified frame `name <source>:<line> (<chunk>:<line>:<col>)` (`source-maps.mjs`). The maps stay on the VM.
- `walk`: the same frame stats and HUD over the held-W window.
- `consoleErrors` (a `pageerror` keeps up to 12 stack frames), `http404s`, `memory`, `gpuAdapter` (check it names
  the NVIDIA card, not SwiftShader), `screenshots`.

## Converting to the owner's M2

`r` = pod Riverwalk-night-rain settled fps / 37 (the M2's figure at the same view); the measured
value of `r` is in [docs/phases/lanes/performance-lane.md](../../docs/phases/lanes/performance-lane.md).
Converted fps = pod fps / r. Target: converted settled ≥ 60 and converted 1 % low ≥ 50.

# gpu-lane: measuring the built studio on a RunPod GPU

Real frame rates for the deployed WebGL (or WebGPU) studio, measured on a rented NVIDIA GPU, because
SwiftShader on the VM cannot give a frame rate. Policy: [decision 0119](../../docs/decisions/0119-runpod-is-the-gpu-lane.md).
The walk-9 proof of the pod loop is `git show webgpu:docs/research/infrastructure/runpod-gpu-loop.md`.

| File | What it does |
|---|---|
| `pod-setup.sh [webgl\|webgpu]` | Runs on the pod: installs Chrome, Xvfb, node, rsync; registers the NVIDIA Vulkan ICD; starts headed Chrome (ANGLE on Vulkan, WebGPU flags only for `webgpu`) on Xvfb :99 1280x720 with DevTools on the pod's 127.0.0.1:9222. Idempotent. |
| `sync-dist.sh <target> <port> <key> [site]` | rsyncs the composed site to the pod's `/root/site` (first run ~650 MB, later runs only the diff) plus `serve.mjs`/`pod-setup.sh`, then (re)starts `serve.mjs` on the pod at 127.0.0.1:8099. |
| `serve.mjs <site> [--port 8099]` | Serves a composed site as GitHub Pages does: `<site>` at `/elder-souls-argonia/` (sandbox and character files at the root, studio at `studio/`). |
| `measure.mjs` | Drives Chrome over DevTools; per URL: first complete frame, then rAF frame times for `--settle` s, an optional held-W `--walk`, the HUD perf lines, console errors, 404s, memory, GPU adapter, screenshots. Writes one `measure.json` per run. |
| `hud-parse.mjs` | Parses the studio's perf HUD text (`PerfHudSection` in `apps/world-studio/src/character/CharacterMode.tsx`) into numbers. Change it with the HUD. |
| `measure.test.mjs` | `node --test tooling/gpu-lane/measure.test.mjs` (parser and frame stats, < 1 s). |

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
4. Sync: `bash tooling/gpu-lane/sync-dist.sh root@<ip> <port> /tmp/<lane>/rp_key /tmp/<lane>/site`.
5. Tunnel (run_in_background, timeout above the whole loop):
   `ssh -i /tmp/<lane>/rp_key -p <port> -o ServerAliveInterval=30 -N -L 9222:127.0.0.1:9222 root@<ip>`.
6. Measure:
   `node tooling/gpu-lane/measure.mjs --run <name> --url "?view=character&x=4.7789&z=1.9&t=22&w=rain" --url "<query 2>" --shots`
   (`--walk 10` adds a held-W walk; `--renderer webgpu` measures `/elder-souls-argonia/webgpu/`).
   For a local SwiftShader smoke test, point `--cdp` at a local Chrome started with
   `--remote-debugging-port` and serve the site with `node tooling/gpu-lane/serve.mjs <site>`.

## Gotchas

- **The frame is capped at ~60 and fps cannot show headroom.** `pod-setup.sh` passes
  `--disable-gpu-vsync --disable-frame-rate-limit`, but on Chrome 154 under Xvfb a trivial page still
  runs rAF at 58.5 fps (walk 10, six launch variants: ANGLE GL, ANGLE Vulkan, `--headless=new`,
  `--ozone-platform=headless`, the background-throttling flags). A view at 58-60 fps is "at least
  60"; read headroom from the HUD's `gpuMs` / `gpuByPass` and `cpuMs`. Below the cap fps is real
  (walk 10: Riverwalk 52, Greenspring 39).
- **A dead site server looks like a capped frame.** `serve.mjs` started by a plain `nohup` died with
  the ssh session, and the walk-10 base run measured an `ERR_CONNECTION_REFUSED` page at 58 fps on
  every URL. `sync-dist.sh` now starts it with `setsid` (log `/root/serve.log`), and `measure.mjs`
  stops when the page fails to load.
- **The network never goes quiet.** Terrain and vegetation stream continuously, so "no requests for
  3 s" never happens (walk-10 base run: every URL hit the timeout). The studio has no "loaded" flag;
  `isReady` in `measure.mjs` requires ALL of: 20 s since navigation; HUD tris within 2 % for 5 s;
  no "Loading" line; HUD CPU 'pre' and 'gc' stages (line 5) both under 2 ms for 5 consecutive
  seconds. An earlier tris-only gate fired at 9-12 s on scenes still streaming (pre 11-16 ms, gc
  8 ms, 200-650 ms hitches) and measured loading scenes at 7-36 fps. Capped by `--ready-timeout`
  (150 s); a scene that never settles records `ready: false`.
- **Profiling needs sourcemaps.** `vite.config.ts` sets `build.sourcemap: false`; build the profiled
  dist with `cd apps/world-studio && npx vite build --sourcemap` (the CLI flag overrides the
  config) so `.cpuprofile` function names resolve. Not for shipped builds.

## Reading measure.json

Top level: `gitSha`, `dirty`, `builtAt` (served index.html mtime), `renderer`, `window`, `dpr`,
`browser`. Per entry of `urls[]`:

- `ready` / `readyS`: whether, and after how long, the world stopped arriving (see Gotchas: fps
  published, no loading line, HUD tris stable 5 s). `ready: false` means the numbers after it
  were taken on a loading scene.
- `settledFps` (mean over the window, from in-page rAF timestamps), `minFps` (slowest frame),
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

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

## Reading measure.json

Top level: `gitSha`, `dirty`, `builtAt` (served index.html mtime), `renderer`, `window`, `dpr`,
`browser`. Per entry of `urls[]`:

- `ready` / `readyS`: whether, and after how long, the first complete frame arrived (studio fps
  published, HUD tris line present, network quiet 3 s). `ready: false` means the numbers after it
  were taken on a loading scene.
- `settledFps` (mean over the window, from in-page rAF timestamps), `minFps` (slowest frame),
  `p1LowFps` (mean of the slowest 1 % of frames), `frameTimes` (mean/p50/p95/p99/max ms).
- `hud`: `tris`/`trisBudget`, `trisByGroup` (main and shadow per source), `gpuByPass` and
  `cpuByStage` (`{avg, max?}` ms per label), `gpuMs`/`cpuMs`, `drawCalls`, `raw` (the lines read).
  `gpuWall: true` means the GPU timer reports wall time, not work.
- `walk`: the same frame stats and HUD over the held-W window.
- `consoleErrors`, `http404s`, `memory` (`performance.memory`), `gpuAdapter` (WebGL
  UNMASKED_RENDERER or the WebGPU adapter info: check it names the NVIDIA card, not SwiftShader),
  `screenshots`.

## Converting to the owner's M2

`r` = pod Riverwalk-night-rain settled fps / 37 (the M2's figure at the same view); the measured
value of `r` is in [docs/phases/lanes/performance-lane.md](../../docs/phases/lanes/performance-lane.md).
Converted fps = pod fps / r. Target: converted settled ≥ 60 and converted 1 % low ≥ 50.

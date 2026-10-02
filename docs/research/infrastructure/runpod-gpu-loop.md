# The RunPod real-GPU loop

How an agent loads the studio on a real NVIDIA GPU in minutes, for the cases SwiftShader on the VM
cannot answer: real frame rate, GPU-process stalls (pipeline compiles), presentation, and a
screenshot timeline. Proved by the walk-9 WebGPU lane, 2026-10-01.

## Budget and when to use it

- The project has **$15 of RunPod credit a month** (owner, 2026-10-01). A lane spends at most what
  its brief allows (walk 9: $4 cap, one pod at a time).
- Use a pod only when the question needs a real GPU and the loop beats SwiftShader end to end.
  Measured: pod running in ~25 s, setup 40-44 s, one boot-check run 2-4 min; the same run under
  SwiftShader takes 2-3 min and cannot report fps, presentation or real pipeline stalls.
- Delete the pod (never stop it) the moment the loop ends or goes idle for 10 minutes.
- Measured cost, walk 9: two RTX 3070 pods, 43 min in all at $0.13/h, about **$0.09**; one full
  run (create, set up, boot check with screenshots, delete) is about $0.01.

## The loop

0. **Hold a job_guard slot first.** Boot checks run under `job_guard.sh`, which waits for a free
   machine slot; a pod created before the slot is held bills while it waits (walk 9: runs queued
   behind three integration jobs). Check the slots are free (`flock -n /tmp/es-jobs/slot-<i>.lock
   true`) or run the whole loop's commands inside one job_guard invocation, then create the pod.
1. **Pick the GPU live** (`get-capacity`, MCP): the cheapest NVIDIA card in stock. Walk 9 used an
   RTX 3070, community cloud, $0.13/h (A4000 $0.17, A4500 $0.19, 3090 $0.22 at the same read).
   State the hourly price before creating.
2. **Create the pod** (`create-pod`, MCP): image `runpod/base:1.0.2-ubuntu2404`, cloud
   `COMMUNITY`, disk 20 GB, ports `["22/tcp"]`, and env
   - `NVIDIA_DRIVER_CAPABILITIES=all` (mounts the driver's Vulkan library; without it no Vulkan),
   - `PUBLIC_KEY=<an ephemeral ed25519 public key>` (`ssh-keygen -t ed25519 -N "" -f /tmp/<lane>/rp_key`).
   The account-wide SSH key list is not touched: the pod's own sshd reads `PUBLIC_KEY`. The
   `ssh.runpod.io` proxy authenticates against account keys only, so use the DIRECT address
   (`get-pod` → `ssh.direct`, populated once `runtime` is non-null, ~10-25 s).
3. **Set it up**: `ssh -i rp_key -p <port> root@<ip> 'bash -s webgpu' < tooling/gpu-lane/pod-setup.sh`
   (40 s: Chrome stable, Vulkan tools, Xvfb; prints the Vulkan device, starts headed Chrome on
   display :99 with WebGPU on Vulkan and DevTools on the pod's 127.0.0.1:9222). Headed on Xvfb,
   not headless: headless Chrome loses the WebGPU device whenever a page presents (four
   "destroyed" losses in 10 s on the first walk-9 run).
4. **Tunnel** (one command, `run_in_background` with a `timeout` above the whole loop, e.g.
   3600000 ms: the Bash default of 30 min cuts the tunnel mid-run):
   `ssh -i rp_key -o ServerAliveInterval=30 -N -L 9222:127.0.0.1:9222 -R 8099:127.0.0.1:8099 -p <port> root@<ip>`.
   `-L` gives this machine the pod's DevTools; `-R` gives the pod's Chrome this machine's static
   server, so nothing is copied to the pod (the build and the data are served from the VM).
5. **Run the boot check against it** (repo root, webgpu branch):
   ```
   CHROME_CDP=http://127.0.0.1:9222 WEBGPU_BOOT_PORT=8099 node tooling/gpu-lane/webgpu-boot-check.mjs \
     --force --light --present --size 960x540 --place place.dunmer-north.riverwalk \
     --shots /tmp/<lane>/shots --walk 40 --hold 30 --no-build --dist <built dist> \
     --query "view=character&x=7.1971&z=0.584&t=22&q=medium&dpr=1"
   ```
   - `--present`: real swap chain (screenshots show the frame).
   - `--light`: drops the per-call timing and stack wrappers, which cost a real GPU most of its
     frame rate (performance.now was a quarter of the main thread); counters and the per-second
     `series` stay.
   - `--shots`: a JPEG every 500 ms for 60 s, then every 2 s (screenshots stall while the page is
     busy, so expect gaps).
   - `--walk <s>`: W+sprint for half, S for the rest; `--hold <s>`: two camera turns in place.
   - `hud` in the summary: the studio's own perf lines (fps, GPU per pass from timestamp queries,
     CPU per stage) at complete, after each walk leg and at the end. **Read fps there**, not
     from `frames` (frames counts canvas textures, several per frame).
   - `--eval <file>` runs an experiment in the page after the first complete frame;
     `--profile <s> --profile-from <s>` takes a CPU profile window (without `--light` the
     profile is dominated by the check's own wrappers).
   For the WebGL studio (dev): build it (`npx vite build --outDir <dist>` in apps/world-studio)
   and run `tooling/gpu-lane/hud-capture.mjs <dist> "<query>" <out>.txt <settleS>` with the same
   `CHROME_CDP`; it serves on 8099 itself.
6. **Read the timeline**: make a contact sheet (PIL, 8-12 frames labelled with their time) and
   have a Sonnet agent judge it with a "what appears, vanishes, reappears, when" list; a lead
   reads at most ~10 images itself.
7. **Delete the pod** (`delete-pod`), note the minutes and dollars in the report.

## Gotchas met

- A canvas `drawImage` luma read returns 0 on WebGPU (the swap-chain texture is gone by the time
  the 2D canvas reads it). Read pixels from a render target instead: redirect the pass into a
  `RenderTarget` and use `renderer.readRenderTargetPixelsAsync` (half floats; decode in the eval),
  or judge the `--shots` screenshots.

- The pod's GPU `util` reads 100 % in `get-pod` right after start; `nvidia-smi` on the pod says 0 %.
- Chrome on the pod prints dbus errors; harmless.
- The night scene at Riverwalk renders black on WebGPU but dim and visible on WebGL (walk 9,
  same spot and time): judge visual timelines in daylight (`t=10:00`) until that is resolved.

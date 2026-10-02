# gpu-lane: the built studio on a RunPod GPU

Policy: [decision 0119](../../docs/decisions/0119-runpod-is-the-gpu-lane.md). Dev's frame-rate
kit (`pod-setup.sh`, `sync-dist.sh`, `serve.mjs`, `measure.mjs`, `hud-parse.mjs`) lives here on
dev and arrives on this branch with each dev merge; when the two READMEs meet, keep both sections.

## The WebGPU fix loop

Four scripts for booting and probing the `/webgpu/` studio on a real GPU, run from the repo root:

| File | What it does |
|---|---|
| `runpod-setup.sh` | Runs on the pod: installs Chrome and Xvfb, registers the NVIDIA Vulkan ICD and starts Chrome with WebGPU on Vulkan, DevTools on the pod's 127.0.0.1:9222. |
| `webgpu-boot-check.mjs` | Boots the BUILT `/webgpu/` studio (one place, or `--place all`) to its first complete frame and fails on a freeze, a GPU validation error or a device loss. `CHROME_CDP` points it at the pod's Chrome. Cached on its inputs. |
| `webgpu-serve.mjs <dist> [--port 8193]` | Serves a built WebGPU studio as Pages does (`/webgpu/` from `<dist>`, `/studio/` data from the main tree). |
| `hud-capture.mjs <dist> "<query>" <out>.txt <settleS>` | Reads the studio's HUD perf lines from the pod's Chrome four times over `<settleS>` and writes them with a screenshot beside them. |

Method: the build stays on the VM and the pod reaches it through one tunnel,
`ssh -i ~/.ssh/runpod_<lane> -p <port> -o ServerAliveInterval=30 -N -L 9222:127.0.0.1:9222 -R 8199:127.0.0.1:8199 root@<ip>`.
`-L` gives the VM the pod's DevTools; `-R` gives the pod's Chrome the VM's static server (set
`WEBGPU_BOOT_PORT` to the forwarded port). Each lane keeps its own key at `~/.ssh/runpod_<lane>`.
Set the pod up with `ssh -i ~/.ssh/runpod_<lane> -p <port> root@<ip> 'bash -s' < tooling/gpu-lane/runpod-setup.sh`.
The full walk-through is [runpod-gpu-loop.md](../../docs/research/infrastructure/runpod-gpu-loop.md).

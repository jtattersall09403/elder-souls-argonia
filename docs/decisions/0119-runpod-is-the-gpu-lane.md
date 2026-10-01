# 0119 — RunPod is the GPU lane: fifteen dollars a month, the WebGPU loop, nothing slower than SwiftShader

Status: accepted (owner 2026-10-01, 16k walk 9). Extends the GPU options in
[gpu-dev-machine-cost-analysis.md](../research/infrastructure/gpu-dev-machine-cost-analysis.md)
(option F).

## Context

The VM has no GPU. Headless Chrome falls back to SwiftShader, which renders
the full studio so slowly that an agent cannot loop on the WebGPU defects
(walk 9: draws appear and vanish, under 10 fps, GPU memory never above
100 MB). The owner installed the RunPod plugin at user scope and signed it
in with OAuth; no API key is stored anywhere in the repo or on the VM.

## Decisions

1. **Budget: $15 of RunPod credit per month, in total.** It is spent only
   when absolutely necessary; the named case is the WebGPU fix loop (load,
   screenshot frames, inspect, fix, repeat).
2. **Only when faster end to end than SwiftShader on this box.** Boot,
   setup and sync time count: a pod that needs a long setup every time is
   not worth it. The setup is one script,
   `tooling/webgpu/runpod-setup.sh` (the WebGPU lane writes it),
   so a pod is ready in one step.
3. **Price first.** The agent states the hourly price before creating
   anything billable.
4. **One pod at a time, deleted (not stopped) when the loop ends**: a
   stopped pod still bills its disk.
5. **Every pod minute and dollar is logged in the lane report** (pod id,
   GPU type, $/h, start, end, minutes, dollars), so the month's spend is
   summable from the reports.
6. **Blender work does not use RunPod.** Headless Blender on this box
   renders a place in minutes on CPU (`wb.py bpy`), and the budget is for
   the GPU loop.

## Where each lives

- Setup: `tooling/webgpu/runpod-setup.sh` (the WebGPU lane).
- The rule line: CLAUDE.md golden rules; the cost row in
  [gpu-dev-machine-cost-analysis.md](../research/infrastructure/gpu-dev-machine-cost-analysis.md).

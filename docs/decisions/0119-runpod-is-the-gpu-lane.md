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
   when absolutely necessary; the named cases are the GPU measure-diagnose-fix
   loops: the WebGPU loop (load, screenshot frames, inspect, fix, repeat)
   and the main-studio performance loop (owner 2026-10-02).
2. **Only when faster end to end than SwiftShader on this box.** Boot,
   setup and sync time count: a pod that needs a long setup every time is
   not worth it. The setup is one script,
   `tooling/gpu-lane/pod-setup.sh`, so a pod is ready in one step.
3. **Price first.** The agent states the hourly price before creating
   anything billable.
4. **One pod per lane, lanes in parallel, deleted (not stopped) when the
   lane's loop ends** (owner 2026-10-02: the WebGPU lane and the performance
   lane each run their own pod at the same time; a fan-out job such as the
   agent walks audit runs one pod per parallel worker when that is faster
   end to end, each deleted the moment its worker ends, owner 2026-10-02):
   a stopped pod still bills its disk. Within a lane, a pod stays up across fix-measure iterations
   when that saves wall time (sync the build to it rather than booting a
   new pod) and is deleted the moment the lane has no next measurement
   queued.
5. **Every pod minute and dollar is logged in the lane report** (pod id,
   GPU type, $/h, start, end, minutes, dollars), so the month's spend is
   summable from the reports.
6. **A render probe over 5 min on SwiftShader runs on the pod** (owner
   2026-10-02, method review r7 P6: walk 9 ran 15 `probe-bloom-sky` runs
   at 380-753 s each on SwiftShader, about 75 min on the packet's critical
   path).
7. **A pod is deleted or handed over by id.** A lane report or walk packet
   that leaves a pod up names its id, who owns it next and when it is
   deleted (method review r7 P4: pod x3lo34wf7lpiai ran 8.7 idle hours).
8. **Blender work does not use RunPod.** Headless Blender on this box
   renders a place in minutes on CPU (`wb.py bpy`), and the budget is for
   the GPU loop.

## Where each lives

- Setup and the measure harness: `tooling/gpu-lane/` (shared by both loops).
- The rule line: CLAUDE.md golden rules; the cost row in
  [gpu-dev-machine-cost-analysis.md](../research/infrastructure/gpu-dev-machine-cost-analysis.md).

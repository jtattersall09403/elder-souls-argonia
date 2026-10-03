# 0121 — WebGPU stays a second build until its native and fallback paths reach the bars

Status: accepted by the planner 2026-10-03 (16k walk 10); the owner's end-state call is pending.
Extends [0119](0119-runpod-is-the-gpu-lane.md). The WebGPU port and the volumetrics
records (0111, 0112) live on the `webgpu` branch.

## Context

The `webgpu` branch renders day and night on a real GPU and carries a WebGL2
fallback (`?renderer=webgl`). Measured on an RTX 3070 pod at the same poses
(`tooling/.reports/16k/walk10/webgpu-lead.md`, chunk 11):

| pose | native WebGPU fps / GPU ms | branch fallback fps / GPU ms | dev classic WebGL fps / GPU ms |
|---|---|---|---|
| riverside, day and night | 79-93 / 5.6-9.7 | 86-105 / 7.4-9.5 | 203-233 / 1.2-1.6 |
| canopy | 43 / 23.0 | 58 / 15.9 | 152 / 1.7 |

- Volumetric fog is about 5.3 of the 9.7 ms native (shaft march plus froxel inject); the frame is 4.4 ms with it off.
- The TSL materials and the canvas output path make up the rest; the attribution views were never captured.
- The branch finishes building 30-35 s after kits arrive, because its signature precompile is discarded.

## Decision

1. The deploy keeps two builds: `/studio/` from `main` (classic WebGL) and `/webgpu/` from the `webgpu` branch (WebGPU by default, `?renderer=webgl` forces the fallback).
2. They stay two builds until the branch's native and fallback paths are within the performance bars of the main studio (settled fps and 1 % low per the performance lane; complete scene under 10 s, 0120).
3. `merge_forward` keeps the branch current with `dev` every round.
4. The owner chooses the end state: one build with WebGPU as the default, or classic WebGL as the default with WebGPU opt-in. The call waits for the next attribution capture.
5. That capture is the next GPU round's first job: G1 (froxel cost), G2 (output path and TSL material cost), L1 (precompile thrown away). It is listed in the open-defects section of `tooling/gpu-lane/README.md`.

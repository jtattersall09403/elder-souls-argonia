# volumetrics

One GPU froxel medium (WebGPU, TSL compute) for fog, mist, canopy shafts, light halos and interior mist; `fogField.ts` says where and when, `froxelGrid.ts` injects, lights and integrates, `volumetricNodes.ts` applies it in `scene.fogNode` and holds `sceneRadiance`.
Contract: [decision 0112](../../../../../docs/decisions/0112-gpu-volumetrics-froxel-fog-canopy-shafts-light-halos.md).
Harness shots: `cd apps/world-studio && node scripts/harness-run.mjs --backend webgpu --sys $(ls src/harness/scenes | grep '^volumetrics-' | sed 's/\.ts$//' | paste -sd,) --out <dir>`.

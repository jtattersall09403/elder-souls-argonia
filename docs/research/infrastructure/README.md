# infrastructure/

The development machine and how to rebuild it.

| File | What it is |
| --- | --- |
| [codespaces-migration-plan.md](codespaces-migration-plan.md) | The move from the Analytical Platform VM to GitHub Codespaces: what exists only on the VM, the R2 vault snapshot, the tiered restore, costs, owner setup done, and what remains. |
| [runpod-gpu-loop.md](runpod-gpu-loop.md) | Loading the studio on a RunPod NVIDIA GPU from this VM (setup script, tunnel, boot check over CDP, screenshots, HUD capture), the $15/month budget and the measured cost per run. |

The operating instructions (lifecycle scripts, snapshot manifest, pulling a
mod folder) live in [tooling/bootstrap/README.md](../../../tooling/bootstrap/README.md).

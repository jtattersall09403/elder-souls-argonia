# infrastructure/

The development machine and how to rebuild it.

| File | What it is |
| --- | --- |
| [codespaces-migration-plan.md](codespaces-migration-plan.md) | The move from the Analytical Platform VM to GitHub Codespaces: what exists only on the VM, the R2 vault snapshot, the tiered restore, costs, owner setup done, and what remains. |
| [gpu-dev-machine-cost-analysis.md](gpu-dev-machine-cost-analysis.md) | Cost-only comparison (2026-10-01) of giving agents a GPU machine to test the studio before an owner walk; changes nothing in the setup. |

The operating instructions (lifecycle scripts, snapshot manifest, pulling a
mod folder) live in [tooling/bootstrap/README.md](../../../tooling/bootstrap/README.md).

"""The asset vault (the `elder-scrolls-asset-pipeline` checkout, decision 0001).

One resolver for every asset-pipeline tool that reads the vault, in this order:

1. ``ELDER_SOULS_ASSET_ROOT`` (this pipeline's name for the vault; an explicit
   override only: the dev container deliberately leaves it unset, because
   models.py reads the same name as its own working root, and post-create.sh
   refuses to run if it is set);
2. the repo's sibling ``../elder-scrolls-asset-pipeline`` (the dev root layout),
   if it exists;
3. ``~/workspace/elder-souls-dev/elder-scrolls-asset-pipeline`` (a worktree
   outside the dev root).

It never reads ``ES_ASSET_PIPELINE_ROOT``: that name means the vault in
worldgen/vault.py but the repo base holding tooling/asset-pipeline/output/kits
in blueprint_footprints.py and blueprint_interiors.py (preflight --runner
sets it to an empty dir). The variable wins even if its path does not exist,
so a wrong override fails loudly instead of silently reading another vault.
"""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
_NAME = "elder-scrolls-asset-pipeline"


def vault_root() -> Path:
    value = os.environ.get("ELDER_SOULS_ASSET_ROOT")
    if value:
        return Path(value).expanduser()
    sibling = REPO_ROOT.parent / _NAME
    if sibling.is_dir():
        return sibling
    return Path.home() / "workspace" / "elder-souls-dev" / _NAME


if __name__ == "__main__":
    print(vault_root())

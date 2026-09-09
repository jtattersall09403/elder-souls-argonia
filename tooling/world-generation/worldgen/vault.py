"""Where the asset vault is — the ONE place that answers it.

Every worldgen tool that reads the asset vault used to resolve it for itself,
almost always as `REPO_ROOT.parent / "elder-scrolls-asset-pipeline"`. That is
correct only for the primary checkout: from a `git worktree`, `REPO_ROOT.parent`
is wherever the worktree happens to live, so vault-dependent tools fail with a
missing-file error that looks like a broken vault rather than a wrong path.
That is what stopped two sessions ever running in parallel worktrees.

Two environment overrides, honoured everywhere because everything goes through
this module:

* ``ES_VAULT_ROOT`` — a copy of the vault's ``argonia-heightfield`` directory
  (a scratch copy for benchmarking, a second worktree building at the same
  time). The terrain chain writes all its derived province data under it.
* ``ES_ASSET_PIPELINE_ROOT`` — the whole ``elder-scrolls-asset-pipeline``
  checkout, for the tools that read meshes, textures and plugins rather than
  the heightfield.

Unset, both resolve as they always did: the sibling checkout, and if this
checkout is a worktree whose sibling does not exist, the canonical location
under the dev root. This module is a LEAF — it imports nothing from worldgen,
so it can be used from any stage without widening that stage's fingerprint
closure.
"""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

HEIGHTFIELD_REL = ("skyrim-source/mod-sources/tamriel-worldspaces-118678/extracted/"
                   "Argonia Worldspace/argonia-heightfield")

_PIPELINE_NAME = "elder-scrolls-asset-pipeline"


def _candidates():
    env = os.environ.get("ES_ASSET_PIPELINE_ROOT")
    if env:
        yield Path(env).expanduser()
    yield REPO_ROOT.parent / _PIPELINE_NAME
    # A worktree lives outside the dev root; fall back to the canonical place.
    yield Path.home() / "workspace" / "elder-souls-dev" / _PIPELINE_NAME


def asset_pipeline_root() -> Path:
    """The `elder-scrolls-asset-pipeline` checkout: first candidate that exists,
    else the sibling path, so the error names the expected location."""
    for candidate in _candidates():
        if candidate.is_dir():
            return candidate.resolve()
    return (REPO_ROOT.parent / _PIPELINE_NAME).resolve()


def heightfield_dir() -> Path:
    """The province heightfield directory the chain reads and writes."""
    env = os.environ.get("ES_VAULT_ROOT")
    if env:
        return Path(env).expanduser().resolve()
    return asset_pipeline_root() / HEIGHTFIELD_REL


VAULT_ROOT = asset_pipeline_root()
HEIGHTFIELD_DIR = heightfield_dir()

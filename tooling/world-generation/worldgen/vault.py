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

Unset, both resolve to the sibling checkout, and if this checkout is a
worktree whose sibling does not exist, to the sibling of the checkout that owns
the worktree (read from the worktree's ``.git`` file). This module is a LEAF — it imports nothing from worldgen,
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


def main_checkout(repo_root: Path = REPO_ROOT) -> Path:
    """The primary checkout this tree belongs to: ``repo_root`` itself, or, for
    a ``git worktree`` (whose ``.git`` is a file ``gitdir: <main>/.git/worktrees/<name>``),
    the checkout that owns it. Read from the file, not from git, so this module
    stays a leaf."""
    dot_git = repo_root / ".git"
    if dot_git.is_file():
        line = dot_git.read_text(encoding="utf-8").strip()
        if line.startswith("gitdir:"):
            gitdir = Path(line[len("gitdir:"):].strip())
            if not gitdir.is_absolute():
                gitdir = repo_root / gitdir
            gitdir = gitdir.resolve()
            if gitdir.parent.name == "worktrees" and gitdir.parent.parent.name == ".git":
                return gitdir.parent.parent.parent
    return repo_root


def _candidates(repo_root: Path = REPO_ROOT):
    env = os.environ.get("ES_ASSET_PIPELINE_ROOT")
    if env:
        yield Path(env).expanduser()
    yield repo_root.parent / _PIPELINE_NAME
    # A worktree lives wherever it was added; the vault is the sibling of the
    # checkout that owns it.
    yield main_checkout(repo_root).parent / _PIPELINE_NAME


def asset_pipeline_root(repo_root: Path = REPO_ROOT) -> Path:
    """The `elder-scrolls-asset-pipeline` checkout: first candidate that exists,
    else the owning checkout's sibling path, so the error names the expected
    location (for a plain clone with no vault, such as the CI runner, that is
    the sibling)."""
    for candidate in _candidates(repo_root):
        if candidate.is_dir():
            return candidate.resolve()
    return (main_checkout(repo_root).parent / _PIPELINE_NAME).resolve()


def heightfield_dir() -> Path:
    """The province heightfield directory the chain reads and writes."""
    env = os.environ.get("ES_VAULT_ROOT")
    if env:
        return Path(env).expanduser().resolve()
    return asset_pipeline_root() / HEIGHTFIELD_REL


VAULT_ROOT = asset_pipeline_root()
HEIGHTFIELD_DIR = heightfield_dir()

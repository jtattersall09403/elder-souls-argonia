"""The vault is resolved in ONE place, and the overrides work everywhere.

Before `worldgen.vault`, each tool resolved the asset vault for itself, almost
always as `REPO_ROOT.parent / "elder-scrolls-asset-pipeline"`. From a git
worktree that is a path that does not exist, so vault-dependent tools failed
confusingly and `test_water_invariants.py` ERRORED at collection instead of
skipping — which is what stopped two sessions running in parallel worktrees.
"""

from __future__ import annotations

import importlib
from pathlib import Path

from . import vault


def _reload_with(monkeypatch, **env):
    for key in ("ES_VAULT_ROOT", "ES_ASSET_PIPELINE_ROOT"):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return importlib.reload(vault)


def test_es_vault_root_moves_the_heightfield_directory(monkeypatch, tmp_path):
    v = _reload_with(monkeypatch, ES_VAULT_ROOT=str(tmp_path))
    assert v.heightfield_dir() == tmp_path.resolve()
    # and the whole chain follows it, because everything imports it from here
    chunks = importlib.reload(importlib.import_module("worldgen.compile_chunks"))
    assert chunks.DEFAULT_HEIGHTS.parent.parent == tmp_path.resolve()
    stages = importlib.reload(importlib.import_module("worldgen.chain_stages"))
    assert stages.STAMPS.parent == tmp_path.resolve()


def test_es_asset_pipeline_root_moves_the_vault(monkeypatch, tmp_path):
    v = _reload_with(monkeypatch, ES_ASSET_PIPELINE_ROOT=str(tmp_path))
    assert v.asset_pipeline_root() == tmp_path.resolve()
    assert v.heightfield_dir() == (tmp_path / v.HEIGHTFIELD_REL).resolve()


def test_unset_it_resolves_to_a_real_checkout_even_from_a_worktree(monkeypatch, tmp_path):
    """The fallback that fixes worktrees: the sibling first, then the sibling of
    the checkout that owns the worktree.

    A worktree's `REPO_ROOT.parent` holds no asset pipeline, so resolving it
    blindly is the bug. Built on a scratch layout, so it runs the same on the
    CI runner (a plain clone, no vault) as on a dev machine.
    """
    v = _reload_with(monkeypatch)
    main = tmp_path / "dev" / "elder-souls-argonia"
    (main / ".git" / "worktrees" / "lane").mkdir(parents=True)
    vault_dir = tmp_path / "dev" / "elder-scrolls-asset-pipeline"
    vault_dir.mkdir()
    worktree = tmp_path / "scratch" / "lane"
    worktree.mkdir(parents=True)
    (worktree / ".git").write_text(f"gitdir: {main / '.git' / 'worktrees' / 'lane'}\n")
    assert v.main_checkout(worktree) == main.resolve()
    root = v.asset_pipeline_root(worktree)
    assert root == vault_dir.resolve()
    assert root != (worktree.parent / "elder-scrolls-asset-pipeline").resolve(), \
        "a worktree must not resolve to its own parent"
    # a plain clone with no vault anywhere names its own sibling (the CI runner)
    clone = tmp_path / "runner" / "elder-souls-argonia"
    (clone / ".git").mkdir(parents=True)
    assert v.main_checkout(clone) == clone
    assert v.asset_pipeline_root(clone) == (clone.parent / "elder-scrolls-asset-pipeline").resolve()


def teardown_module(_module):
    importlib.reload(vault)
    for name in ("worldgen.compile_chunks", "worldgen.chain_stages"):
        importlib.reload(importlib.import_module(name))

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


def test_unset_it_resolves_to_a_real_checkout_even_from_a_worktree(monkeypatch):
    """The fallback that fixes worktrees: the sibling first, then the dev root.

    A worktree's `REPO_ROOT.parent` holds no asset pipeline, so resolving it
    blindly is the bug. Either the sibling exists and wins, or the canonical
    location under the dev root does.
    """
    v = _reload_with(monkeypatch)
    root = v.asset_pipeline_root()
    assert root.name == "elder-scrolls-asset-pipeline"
    sibling = v.REPO_ROOT.parent / "elder-scrolls-asset-pipeline"
    if not sibling.is_dir():
        assert root != sibling, "a worktree must not resolve to its own parent"


def teardown_module(_module):
    importlib.reload(vault)
    for name in ("worldgen.compile_chunks", "worldgen.chain_stages"):
        importlib.reload(importlib.import_module(name))

"""Repo locations and the one import bridge to the world-generation and
asset-pipeline packages the workbench reuses (never re-implements)."""
from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
WORKBENCH = REPO_ROOT / "tooling" / "placement-workbench"
OUTPUT = WORKBENCH / "output"                  # gitignored (root .gitignore `output/`)
DESCRIPTOR_CACHE = OUTPUT / "descriptors"
MESH_CACHE = OUTPUT / "meshes"
WORLDGEN = REPO_ROOT / "tooling" / "world-generation"
ASSET_PIPELINE = REPO_ROOT / "tooling" / "asset-pipeline"
RAW_KITS = ASSET_PIPELINE / "output" / "kits"
PUBLIC = REPO_ROOT / "apps" / "world-studio" / "public"
PUBLISHED_KITS = PUBLIC / "kits"
PROVINCE = PUBLIC / "province"
CHUNKS = PROVINCE / "chunks"
PLACEMENT_RECORDS = REPO_ROOT / "world" / "sources" / "placement"
BLUEPRINTS = REPO_ROOT / "world" / "sources" / "blueprints"
BLENDER_SCRIPT = WORKBENCH / "blender" / "render_scene.py"
LINUX_BLENDER = Path("~/tools/blender-3.2.2-linux-x64/blender").expanduser()


def bridge() -> None:
    """Put `worldgen` and `pipeline` on the import path (idempotent)."""
    for path in (WORLDGEN, ASSET_PIPELINE):
        if str(path) not in sys.path:
            sys.path.insert(0, str(path))

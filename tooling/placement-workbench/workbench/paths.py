"""Repo locations and the one import bridge to the world-generation and
asset-pipeline packages the workbench reuses (never re-implements)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
WORKBENCH = REPO_ROOT / "tooling" / "placement-workbench"
SHARED_OUTPUT = WORKBENCH / "output"           # gitignored (root .gitignore `output/`)
# `WB_OUTPUT` moves the per-run state (scenes, apply summaries, rounds,
# renders, ground windows) so a read-only audit or a parallel lane never
# shares output/apply and output/scenes; the content-keyed mesh and
# descriptor caches stay shared
OUTPUT = Path(os.environ["WB_OUTPUT"]) if os.environ.get("WB_OUTPUT") else SHARED_OUTPUT
DESCRIPTOR_CACHE = SHARED_OUTPUT / "descriptors"
MESH_CACHE = SHARED_OUTPUT / "meshes"
WORLDGEN = REPO_ROOT / "tooling" / "world-generation"
ASSET_PIPELINE = REPO_ROOT / "tooling" / "asset-pipeline"
RAW_KITS = ASSET_PIPELINE / "output" / "kits"
PUBLIC = REPO_ROOT / "apps" / "world-studio" / "public"
PUBLISHED_KITS = PUBLIC / "kits"
PROVINCE = PUBLIC / "province"
CHUNKS = PROVINCE / "chunks"
PLACEMENT_RECORDS = REPO_ROOT / "world" / "sources" / "placement"
# `WB_BLUEPRINTS`: a directory holding a trial blueprint (a WIP edit applied
# to a copy) that apply, check and compile read in place of the tracked one
BLUEPRINTS = (Path(os.environ["WB_BLUEPRINTS"]) if os.environ.get("WB_BLUEPRINTS")
              else REPO_ROOT / "world" / "sources" / "blueprints")
BLENDER_SCRIPT = WORKBENCH / "blender" / "render_scene.py"
LINUX_BLENDER = Path("~/tools/blender-3.2.2-linux-x64/blender").expanduser()
JOB_GUARD = REPO_ROOT / "tooling" / "repo-standards" / "job_guard.sh"


def guarded(cmd: list[str], lane: str = "blender") -> list[str]:
    """A heavy command (every Blender the workbench starts) under job_guard:
    it takes a slot and is exempt from the CPU watchdog, which otherwise
    SIGSTOPs Cycles as the machine's heaviest process (KeebaHouseElder
    2026-09-29: 546 s of a 579 s run stopped). Inside a guarded job
    (ES_JOB_GUARD set) the command runs as is."""
    if os.environ.get("ES_JOB_GUARD") or not JOB_GUARD.exists():
        return cmd
    return ["bash", str(JOB_GUARD), lane, "--", *cmd]


def bridge() -> None:
    """Put `worldgen` and `pipeline` on the import path (idempotent)."""
    for path in (WORLDGEN, ASSET_PIPELINE):
        if str(path) not in sys.path:
            sys.path.insert(0, str(path))

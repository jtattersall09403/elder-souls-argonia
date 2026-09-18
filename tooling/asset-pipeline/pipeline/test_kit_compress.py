"""Gates on kit compression (owner 2026-09-18, pulled forward from Phase 14).

1. Every kit under apps/world-studio/public/kits/ ships KTX2 textures and
   meshopt geometry with a `compression` record in its manifest — an
   uncompressed kit cannot ship silently. First shown failing on all 21
   pre-compression kits (PNG images, no record) on 2026-09-18.
2. The three kits every studio start downloads (flora, underwater,
   groundcover) stay under a byte budget, so the cold-start payload cannot
   creep back: 118.9 MB before compression, 45.6 MB after.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from .kit_compress import (DEFAULT_POLICY, PUBLIC_KITS, check, gltfpack_args,
                           policy_for)

STARTUP_KITS = ("flora-province-v1", "underwater-v1", "groundcover-province-v1")
STARTUP_BUDGET_BYTES = 52_000_000  # measured 45.6 MB compressed; ~14 % headroom


def _published() -> list[Path]:
    return sorted(PUBLIC_KITS.glob("*.glb"))


def test_every_published_kit_is_compressed_and_recorded():
    problems = [p for glb in _published() for p in check(glb.stem)]
    assert not problems, "\n".join(problems)


def test_startup_payload_within_budget():
    sizes = {k: (PUBLIC_KITS / f"{k}.glb").stat().st_size for k in STARTUP_KITS}
    total = sum(sizes.values())
    assert total <= STARTUP_BUDGET_BYTES, (
        f"startup kits total {total / 1e6:.1f} MB > {STARTUP_BUDGET_BYTES / 1e6:.0f} MB: "
        + ", ".join(f"{k} {v / 1e6:.1f} MB" for k, v in sizes.items()))


def test_compression_record_matches_shipped_bytes():
    for glb in _published():
        manifest = json.loads(glb.with_suffix(".kit.json").read_text())
        record = manifest.get("compression") or {}
        if record.get("enabled", True) and "bytesAfter" in record:
            assert record["bytesAfter"] == glb.stat().st_size, glb.name


def test_gltfpack_args_keep_what_the_runtime_reads():
    args = gltfpack_args(DEFAULT_POLICY)
    for flag in ("-kn", "-km", "-ke", "-vpf", "-vtf", "-cc", "-tc"):
        assert flag in args
    assert args[args.index("-tu") + 1] == "color,normal,attrib"


def test_policy_validation():
    assert policy_for({"id": "x"})["color"] == "uastc"
    assert policy_for({"id": "x", "compression": {"color": "etc1s"}})["color"] == "etc1s"
    assert policy_for({"id": "x", "compression": False}) == {"enabled": False}
    with pytest.raises(ValueError):
        policy_for({"id": "x", "compression": {"normal": "png"}})

"""Every stage the terrain chain runs must at least IMPORT, with every name
its entry point pulls in resolved at module level: a missing symbol crashed
the chain at its second stage on 2026-09-12 after a refactor, three minutes
into a ten-minute run. This is the cheap gate that catches it first."""

import importlib
import re
from pathlib import Path

import pytest

CHAIN = Path(__file__).resolve().parents[1] / "scripts" / "terrain-chain.sh"


def _stages() -> list[str]:
    text = CHAIN.read_text(encoding="utf-8")
    block = text[text.index("STAGES=("):]
    block = block[: block.index("\n)")]
    return sorted(set(re.findall(r'^\s*"([a-z_]+)"', block, re.M)))


@pytest.mark.parametrize("stage", _stages())
def test_stage_module_imports(stage):
    importlib.import_module(f"worldgen.{stage}")

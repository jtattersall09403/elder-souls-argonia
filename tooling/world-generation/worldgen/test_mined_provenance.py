"""Every mined placement record says which register pools it walked, and none
predates a pool that now declares a plugin (owner 2026-09-26: King of the
Murkmire joined the pool on 2026-09-25; nothing may be cut on a stale record).

The block is written by each miner on every run
(`mine_assemblies.provenance`). A record without one fails too, naming the
pools the record itself shows it walked where it lists its plugins.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from . import asset_registry
from .mine_assemblies import declared_plugin_pools, plugin_pools

PLACEMENT = Path(__file__).resolve().parents[3] / "world" / "sources" / "placement"

#: record -> the miner that writes it
RECORDS = {
    "kit-mounts-mined.json": "worldgen.mine_mounts",
    "kit-assemblies-mined.json": "worldgen.mine_assemblies",
    "exterior-interior-links.json": "worldgen.mine_door_links",
    "kit-designed-sink.json": "worldgen.mine_designed_sink",
}


def named_pools(record: dict) -> set[str]:
    """The pools a record without a provenance block shows it walked, from
    the plugin lists it carries (empty when it lists none)."""
    pools: set[str] = set()
    for row in record.get("plugins") or []:  # exterior-interior-links
        if isinstance(row, dict) and row.get("pool"):
            pools |= {row["pool"]} | plugin_pools(row.get("file") or "")
    source = record.get("source")
    if isinstance(source, dict):  # kit-assemblies-mined
        for spec in (source.get("sets") or {}).values():
            for name in spec.get("plugins") or []:
                pools |= plugin_pools(name)
    return pools


NO_PLUGIN_EVIDENCE = "no plugin evidence"


def expected_absent() -> set[str]:
    """Register pools whose row says no plugin stands as their evidence
    (``Pool.plugin_evidence``, e.g. impships): never counted missing."""
    return {pool.id for pool in asset_registry.POOLS
            if (pool.plugin_evidence or "").startswith(NO_PLUGIN_EVIDENCE)}


def missing_pools(record: dict) -> tuple[bool, list[str]]:
    """``(has provenance, pools that declare a plugin now and were not mined)``."""
    block = record.get("provenance")
    mined = set(block["poolsMined"]) if block else named_pools(record)
    return bool(block), sorted(set(declared_plugin_pools()) - mined - expected_absent())


def test_expected_absent_pools_declare_no_plugin() -> None:
    """A pool marked "no plugin evidence" (impships) must not also declare a
    plugin a miner would walk; the mark is on its register row."""
    absent = expected_absent()
    assert "impships" in absent
    assert not absent & set(declared_plugin_pools()), sorted(absent & set(declared_plugin_pools()))


@pytest.mark.parametrize("name", sorted(RECORDS))
def test_record_mined_every_pool_that_declares_a_plugin(name: str) -> None:
    record = json.loads((PLACEMENT / name).read_text())
    has_block, missing = missing_pools(record)
    problems = []
    if not has_block:
        problems.append(f"no provenance block (re-run {RECORDS[name]})")
    elif record["provenance"]["miner"] != RECORDS[name]:
        problems.append(f"provenance names {record['provenance']['miner']}")
    if missing:
        problems.append("pools never mined: " + ", ".join(missing))
    assert not problems, f"{name}: " + "; ".join(problems)


@pytest.mark.parametrize("path", sorted((PLACEMENT / "kit-interiors").glob("*.interiors.json")),
                         ids=lambda p: p.name)
def test_kit_interiors_record_carries_provenance(path: Path) -> None:
    """Derived from the door links and the assemblies record by
    `pipeline/interiors_index.py`: it must say which mined records it read."""
    assert "provenance" in json.loads(path.read_text()), (
        f"{path.name}: no provenance block (writer pipeline/interiors_index.py)")


def test_missing_pools_names_a_pool_the_record_never_saw() -> None:
    """The rule can fail: a record that walked every declared pool but one."""
    declared = sorted(declared_plugin_pools())
    record = {"provenance": {"poolsMined": [p for p in declared if p != "kotm"]}}
    assert missing_pools(record) == (True, ["kotm"])
    assert missing_pools({"provenance": {"poolsMined": declared}}) == (True, [])

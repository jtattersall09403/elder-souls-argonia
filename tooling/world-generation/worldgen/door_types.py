"""A door's type, mined from the door-links record (decision 0104 decision 4).

`load` is a cell transition; `swing` opens in place by animation and has no
cell. The rule reads the plugin data, never the piece's name: the door-links
record (`world/sources/placement/exterior-interior-links.json`, mined by
`worldgen.mine_door_links`) holds exactly the exterior doors that carry an
XTEL (a teleport to an interior door), keyed by the shell they open. So a
door is `load` when its claim carries the XTEL target (`interiorClaim.
interiorLoadDoorRef`, copied from that record by `blueprint_interiors
--claim`) or its shell has a row in the record; otherwise `swing`.

    python3 -m worldgen.door_types --blueprint <place-id>     # prints each door's type
"""
from __future__ import annotations

import argparse
import json
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
LINKS = REPO_ROOT / "world" / "sources" / "placement" / "exterior-interior-links.json"
BLUEPRINT_DIR = REPO_ROOT / "world" / "sources" / "blueprints"
DOOR_TYPES = ("load", "swing")


@lru_cache(maxsize=2)
def linked_shells(path: Path = LINKS) -> frozenset[str]:
    """Every shell asset the door-links record holds an XTEL for."""
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    return frozenset(k for k, rows in (doc.get("shells") or {}).items()
                     if any(r.get("interiorCell") for r in rows or []))


def door_type(door: dict, shell_asset: str | None, shells: frozenset[str] | None = None) -> str:
    """`load` when the door-links record gives the door an XTEL, else `swing`."""
    if (door.get("interiorClaim") or {}).get("interiorLoadDoorRef"):
        return "load"
    shells = linked_shells() if shells is None else shells
    return "load" if shell_asset and shell_asset in shells else "swing"


def blueprint_door_types(bp: dict, shells: frozenset[str] | None = None) -> dict[str, str]:
    """door id -> its type, for every door of a blueprint (the shell is the
    door's parcel `assetRef`)."""
    parcels = {p["id"]: p for p in bp.get("parcels") or []}
    return {d["id"]: door_type(d, (parcels.get(d.get("parcelId")) or {}).get("assetRef"), shells)
            for d in sorted(bp.get("doors") or [], key=lambda d: d["id"])}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--blueprint", required=True, help="place id of a blueprint")
    a = ap.parse_args()
    bp = json.loads((BLUEPRINT_DIR / f"{a.blueprint}.json").read_text())["blueprint"]
    for door_id, kind in blueprint_door_types(bp).items():
        print(f"{door_id}: {kind}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

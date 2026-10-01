"""A door's type (decision 0104 decision 4; planner ruling 2026-09-27, walk 2
T2 rec 4): the claim first, then the plugin data, never the piece's name.

1. A door whose `interiorClaim` is tier A, or `reserved` to a load pool (a
   Phase 12 interior will be cut for it), is `load`: a cell transition.
2. A building with no interior and an open front has NO door record:
   `door_type` returns None and `blueprint_interiors --claim` drops the door.
   Two cases: a claim reserved to a `NO_INTERIOR_SERVICES` pool (the open
   stable), and a shell no plugin links whose way in is an opening with no
   door (`OPEN_ENTRANCE_KINDS` in its interiors record: the BM&V swamp
   house, which its plugin places 47 times furnished on its own floor). Such
   a building is OPEN, walked into in the world (no closed buildings, 0114
   rule 3: open, or linked).
3. With no claim, the door-links record decides
   (`world/sources/placement/exterior-interior-links.json`, mined by
   `worldgen.mine_door_links`, holds exactly the exterior doors that carry an
   XTEL, keyed by the shell they open): a shell with a row is `load`; a shell
   whose plugin door reference has no XTEL is `swing` (opens in place by
   animation, no cell).

4. A claimed door (tier `none` or `reserved`) on a shell no plugin gives a
   load door (decision 0114; a composite is its base shell) is `hollow`: a
   closed building. That type exists only so the tools can name it: no
   closed buildings (0114 rule 3), so `--claim` exits 3 and gate
   `interiors.closed` fails on it (`blueprint_interiors.closed_shell_failures`);
   the runtime drops it from the load path (`loadDoorsOf`) as a safety net.
   A reserved door on a linked shell is `load` and shows the closed line.

`blueprint_interiors --claim` stamps the result as the door's `doorType`.

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
DOOR_TYPES = ("load", "swing", "hollow")
#: interiors-record entrance kinds that are an opening walked through with no
#: door: a stable's or dock's open front, the swamp house's approach. Every
#: other kind (`esp-door`, `leaf`, `composite-leaf`, `assembly`, and an
#: `opening` that takes the plugin's door piece, L78) is a door
OPEN_ENTRANCE_KINDS = ("approach", "open-front")


@lru_cache(maxsize=2)
def linked_shells(path: Path = LINKS) -> frozenset[str]:
    """Every shell asset the door-links record holds an XTEL for."""
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    return frozenset(k for k, rows in (doc.get("shells") or {}).items()
                     if any(r.get("interiorCell") for r in rows or []))


def door_type(door: dict, shell_asset: str | None,
              shells: frozenset[str] | None = None) -> str | None:
    """`load`, `swing`, or None (no door record: no interior, open front);
    the rule order is the module docstring's."""
    claim = door.get("interiorClaim") or {}
    if claim.get("tier") == "A" or claim.get("interiorLoadDoorRef"):
        return "load"
    from .blueprint_interiors import NO_INTERIOR_SERVICES, composite_base
    if claim.get("tier") == "reserved" and claim.get("pool") in NO_INTERIOR_SERVICES:
        return None
    shells = linked_shells() if shells is None else shells
    base = (composite_base(shell_asset) or shell_asset
            if isinstance(shell_asset, str) and shell_asset.startswith("composite:") else shell_asset)
    if base not in shells and _open_entrance(shell_asset, base):
        return None
    if claim.get("tier") in ("none", "reserved"):
        # decision 0114: a shell no plugin gives a load door is hollow, a
        # closed building the gates refuse; a linked one waits closed
        return "load" if base in shells else "hollow"
    return "load" if base and base in shells else "swing"


def _open_entrance(shell_asset: str | None, base: str | None) -> bool:
    """Rule 2's second case: the shell's interiors record names an opening
    with no door leaf as its way in."""
    from .blueprint_interiors import entrance, library
    lib = library()
    rec = lib.get(shell_asset or "") or lib.get(base or "")
    return (entrance(rec) or {}).get("kind") in OPEN_ENTRANCE_KINDS


def blueprint_door_types(bp: dict, shells: frozenset[str] | None = None) -> dict[str, str | None]:
    """door id -> its type (None: the door should not exist), for every door
    of a blueprint (the shell is the door's parcel `assetRef`)."""
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

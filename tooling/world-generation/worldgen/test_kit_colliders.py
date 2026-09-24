"""Every solid piece a published kit ships can be stood on or walked into.

16h K6 (owner check-in 1, 2026-09-23): the ferry raft and the sign post were
published with ``collision: none``, so the player walked through them. The
gate: every asset in a published kit manifest that is a structure (the
categories ``build_kit._COLLISION_BY_CATEGORY`` gives a mesh collider), a
hull (raft, boat, ship, canoe, wreck) or a sign post carries a collider,
unless a row in ``EXEMPT`` names it with the reason. Plants and small clutter
stay ``none`` and are not in scope.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
PUBLISHED_KITS = REPO_ROOT / "apps" / "world-studio" / "public" / "kits"

SOLID_CATEGORIES = {"architecture", "ruin", "dungeon-kit", "bridge", "dock", "boat"}
HULL_OR_SIGN = re.compile(r"/signage/|raft|boat|ship|hull|canoe|wreck")

QUEUED = ("queued (16h K6): the kit is outside the K6 lane; set collision mesh in "
          "its kit config and rebuild (brief § Part 1 state, open list)")

EXEMPT: dict[str, str] = {
    "vanilla:clutter/signage/whiterun/signwrdrunkenhuntsman01":
        "a hanging board, mounted above head height on its post (mount pair)",
    "vanilla:clutter/signage/whiterun/signwrstables01":
        "a hanging board, mounted above head height on its post",
    "vanilla:clutter/shipwreck/shipwreckboards01": "a loose board 0.06 m thick, scatter",
    "vanilla:clutter/shipwreck/shipwreckboards02": "a loose board 0.06 m thick, scatter",
    "vanilla:clutter/shipwreck/shipwreckboards03": "a loose board 0.06 m thick, scatter",
    "depths:dos/boats/rowboatbrokenback": QUEUED,
    "depths:dos/boats/rowboatbrokenfront": QUEUED,
    "depths:dos/ships/shipatmoranlongshipwreck01": QUEUED,
    "depths:dos/ships/shipatmoranlongshipwreck02": QUEUED,
    "depths:dos/ships/shipatmoranrowboatwreck01": QUEUED,
    "depths:dos/ships/shipatmoranrowboatwreck02": QUEUED,
    "depths:dos/ships/shipatmoranwarshipwreck01": QUEUED,
    "depths:dos/ships/shipatmoranwarshipwreck02": QUEUED,
    "depths:dos/ships/shipbreticcarrack_halfwreck01": QUEUED,
    "depths:dos/ships/shipbreticcarrack_halfwreck02": QUEUED,
}


def needs_collider(asset: dict) -> bool:
    return (asset.get("category") in SOLID_CATEGORIES
            or bool(HULL_OR_SIGN.search(str(asset.get("id", "")).lower())))


def uncollidable(kits_dir: Path = PUBLISHED_KITS,
                 exempt: dict[str, str] = EXEMPT) -> list[str]:
    """``kit: asset (category)`` for every solid asset shipped with no collider."""
    out = []
    for path in sorted(kits_dir.glob("*.kit.json")):
        for asset in json.loads(path.read_text()).get("assets", []):
            if (needs_collider(asset) and asset.get("collision", "none") == "none"
                    and asset.get("id") not in exempt):
                out.append(f"{path.name}: {asset.get('id')} ({asset.get('category')})")
    return out


def test_every_solid_published_asset_has_a_collider():
    missing = uncollidable()
    assert not missing, "\n".join(missing)


def test_the_gate_fails_on_a_solid_asset_with_no_collider(tmp_path):
    (tmp_path / "x.kit.json").write_text(json.dumps({"assets": [
        {"id": "ferryraft:snt/ferry/ferryraft01", "category": "misc", "collision": "none"},
        {"id": "vanilla:clutter/signage/whiterun/signwrpost01", "category": "clutter"},
        {"id": "a:walls/wall01", "category": "architecture", "collision": "none"},
        {"id": "a:plants/fern01", "category": "plant", "collision": "none"},
        {"id": "a:walls/wall02", "category": "architecture", "collision": "mesh"},
    ]}))
    assert len(uncollidable(tmp_path, {})) == 3


def test_every_exemption_names_a_shipped_asset():
    shipped = {asset.get("id") for path in PUBLISHED_KITS.glob("*.kit.json")
               for asset in json.loads(path.read_text()).get("assets", [])}
    assert not set(EXEMPT) - shipped, sorted(set(EXEMPT) - shipped)


def test_the_mud_hut_shells_are_solid_and_collide():
    """16h M19 ruling 1: `mudhut01` shipped `misc` with collision none; its
    registry row is `architecture` now (asset_taxonomy folder-stem rule), so
    the gate sees it, and the rebuilt kits give it a mesh collider."""
    shells = {"mudmother:gv_meshes/argoniannest/mudhut01",
              "mudmother:gv_meshes/argoniannest/mudhut01intnew"}
    seen = {}
    for path in sorted(PUBLISHED_KITS.glob("*.kit.json")):
        for asset in json.loads(path.read_text()).get("assets", []):
            if asset.get("id") in shells:
                seen[(path.name, asset["id"])] = (needs_collider(asset),
                                                  asset.get("collision"))
    assert {asset for _kit, asset in seen} == shells, seen
    assert all(value == (True, "mesh") for value in seen.values()), seen
    stale = {"id": "mudmother:gv_meshes/argoniannest/mudhut01",
             "category": "architecture", "collision": "none"}
    assert needs_collider(stale)

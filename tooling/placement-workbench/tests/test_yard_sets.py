"""Yard sets are a tracked record (decision 0101): `group place` reads
world/sources/placement/yard-sets/ first, so a set is rebuildable from the
repo; every member is a piece of a published kit."""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import assembly, paths  # noqa: E402

KITS = paths.REPO_ROOT / "apps" / "world-studio" / "public" / "kits"


def _published() -> set[str]:
    ids = set()
    for f in KITS.glob("*.kit.json"):
        d = json.loads(f.read_text())
        ids |= {p["id"] for p in d.get("pieces", d.get("assets", [])) if isinstance(p, dict)}
    return ids


def test_every_yard_set_member_is_a_published_piece_and_the_anchor_is_a_member():
    sets = assembly.yard_sets()
    assert {"imperial-station-yard", "imperial-stable-yard", "argonian-landing",
            "argonian-hut-yard"} <= set(sets)
    published = _published()
    for sid, st in sets.items():
        uids = [m["uid"] for m in st["members"]]
        assert st["anchor"] in uids and len(uids) == len(set(uids)), sid
        missing = [m["piece"] for m in st["members"] if m["piece"] not in published]
        assert not missing, (sid, missing)
        for m in st["members"]:
            if "mount" in m:
                assert m["mount"]["on"] in uids and m["mount"]["upM"] > 0, (sid, m)


def test_group_place_reads_the_tracked_set_in_the_prefab_shape():
    g = assembly.load_group("imperial-station-yard")
    assert g["anchor"]["uid"] == "isy-barrel1"
    lamp = next(m for m in g["members"] if m["uid"] == "isy-lamp")
    trough = next(m for m in g["members"] if m["uid"] == "isy-trough")
    assert lamp["upM"] is None and lamp["role"] == {"on": "ground"}    # no mined lantern-on-barrel pair
    assert trough["upM"] is None and trough["role"] == {"on": "ground"}
    assert "imperial-station-yard" in assembly.group_names()


def test_a_mounted_member_stands_on_the_member_it_names(monkeypatch):
    """`mount.on` is honoured: a lamp on a crate stands upM above the crate,
    not above the anchor."""
    from workbench.scene import Piece

    st = {"id": "t", "anchor": "a", "members": [
        {"uid": "a", "piece": "x", "offsetM": [0, 0], "yaw": 0},
        {"uid": "c", "piece": "x", "offsetM": [2, 0], "yaw": 0},
        {"uid": "l", "piece": "x", "offsetM": [2, 0], "yaw": 0, "mount": {"on": "c", "upM": 0.5}}]}
    monkeypatch.setattr(assembly, "yard_sets", lambda: {"t": st})

    class _Scene:
        pieces = {"p-a": Piece("p-a", "x", 0, 0, 0, y=10.0), "p-c": Piece("p-c", "x", 2, 0, 0, y=11.0),
                  "p-l": Piece("p-l", "x", 2, 0, 0)}

        def piece(self, uid):
            return self.pieces[uid]
    assembly.lift_group(_Scene(), "t", "p-")
    assert _Scene.pieces["p-l"].y == 11.5 and _Scene.pieces["p-c"].y == 11.0


def test_a_yard_set_mount_must_resolve_to_a_mined_pair():
    """Planner ruling 5 (2026-09-26): a lantern set upM above a barrel is a
    height shortcut unless the mounts record holds that pair."""
    pairs = assembly.mined_mount_pairs()
    lamp, barrel = "vanilla:clutter/common/candlelanternwithcandle01", "vanilla:clutter/barrel02"
    assert (lamp, barrel) not in pairs
    st = {"id": "t", "anchor": "b", "members": [
        {"uid": "b", "piece": barrel, "offsetM": [0, 0], "yaw": 0},
        {"uid": "l", "piece": lamp, "offsetM": [0, 0], "yaw": 0, "mount": {"on": "b", "upM": 1.14}}]}
    assert assembly.unmined_mounts(st, pairs) == ["l"]
    sconce, wall = "vanilla:clutter/imperial/impwallsconcecandle01", "vanilla:dungeons/imperial/clutterkits/impfreewall01"
    st["members"] = [{"uid": "b", "piece": wall, "offsetM": [0, 0], "yaw": 0},
                     {"uid": "l", "piece": sconce, "offsetM": [0, 0], "yaw": 0, "mount": {"on": "b", "upM": 1.0}}]
    assert assembly.unmined_mounts(st, pairs) == []
    for st in assembly.yard_sets().values():
        assert assembly.unmined_mounts(st, pairs) == [], st["id"]


def test_an_unmounted_member_stands_on_its_own():
    """A member without a mount is settled on the ground, so every published
    manifest row of its piece must stand on its own (ground or deck); a wall
    or hanging piece on the ground is refused by the runtime resolver (the
    bone chime at Claywater, 2026-09-26)."""
    anchor = {}
    for f in KITS.glob("*.kit.json"):
        for row in json.loads(f.read_text()).get("assets", []):
            anchor.setdefault(row["id"], set()).add(row.get("anchorClass") or "ground")
    for sid, st in assembly.yard_sets().items():
        for m in st["members"]:
            if "mount" not in m:
                assert anchor.get(m["piece"], {"ground"}) <= {"ground", "deck"}, (sid, m["uid"])


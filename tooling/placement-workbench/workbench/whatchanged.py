"""`wb.py whatchanged LAYOUT [--base REV]`: the walk packet's "What changed
since the last walk" lines, generated from the layout diff (0105 R35, method
review r5 finding G: three owner items traced to packet prose written from
memory). One plain line per op added, removed, moved, turned or swapped
between the layout at `--base` (default HEAD, the version the owner walked)
and the working file; each piece is named by its kit manifest row's
`displayName`. A row without one is named by its asset id and counted in
`unnamed`, so the packet never carries a name nobody checked."""
from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

MOVE_MIN_M = 0.1
TURN_MIN_DEG = 1.0
#: layout-only keys (wb.LAYOUT_META_KEYS): never part of a piece's state
META_KEYS = ("ownerOk", "cause")
#: ops that change no piece the owner sees
UNSEEN_OPS = ("bind", "note", "settle", "socket", "window")


def manifest_names(kits_dir: Path) -> dict[str, str]:
    """{asset id: displayName} over every published kit manifest."""
    out = {}
    for path in sorted(Path(kits_dir).glob("*.kit.json")):
        for row in json.loads(path.read_text()).get("assets") or []:
            if row.get("displayName"):
                out.setdefault(row["id"], row["displayName"])
    return out


def _compass(dx: float, dz: float) -> str:
    """The studio's frame: +x east, +z south."""
    ang = math.degrees(math.atan2(dx, -dz)) % 360.0
    return ("north", "north-east", "east", "south-east", "south", "south-west", "west",
            "north-west")[int((ang + 22.5) // 45) % 8]


def _plain(op: dict) -> dict:
    return {k: v for k, v in op.items() if k not in META_KEYS}


def piece_states(ops: list) -> dict[str, dict]:
    """{uid: state} after folding the layout's ops in order, the pose each
    piece ends at, not the op records that produced it (review 2026-09-28:
    a `move` or `swap` changes a piece its `place` op still describes).
    A state is {kind, asset, at, yaw, pad, ops}: `place` sets the pose;
    `move` shifts it (`dx`/`dz`, `forward`/`right` in the piece's frame,
    `yaw`, `turn`, as `wb.cmd_move`); `swap` sets the asset; `remove` drops
    the piece; a piece whose pose comes from its parent (`snap`, `mount`,
    `attach`, a placed yard set, a path) has `at` None and is compared by
    the ops that made it (`ops`)."""
    out: dict[str, dict] = {}
    for raw in ops:
        if not isinstance(raw, dict) or raw.get("op") in UNSEEN_OPS:
            continue
        op = _plain(raw)
        kind = op.get("op")
        if kind == "group" and op.get("action", "place") != "place":
            continue
        uid = str(op.get("uid") or op.get("child") or op.get("id") or op.get("name") or "")
        if kind == "place":
            out[uid] = {"kind": kind, "asset": op.get("asset"), "at": list(op.get("at") or []) or None,
                        "yaw": float(op.get("yaw", 0.0)) % 360.0, "pad": op.get("pad"), "ops": [op]}
        elif kind in ("snap", "mount", "attach", "group", "path"):
            out[uid] = {"kind": kind, "asset": op.get("asset") or op.get("group") or op.get("name"),
                        "at": None, "yaw": None, "pad": op.get("pad"), "ops": [op]}
        elif uid in out and kind == "remove":
            del out[uid]
        elif uid in out:
            st = out[uid]
            st["ops"].append(op)
            if kind == "swap" and op.get("asset"):
                st["asset"] = op["asset"]
            elif kind == "move" and st["at"] is not None:
                from .scene import yaw_matrix
                # wb.cmd_move, term for term: d = R(yaw) @ [right, forward, 0]
                d0, d1, _ = yaw_matrix(st["yaw"]) @ [float(op.get("right", 0.0)),
                                                     float(op.get("forward", 0.0)), 0.0]
                st["at"] = [st["at"][0] + float(op.get("dx", 0.0)) + float(d0),
                            st["at"][1] + float(op.get("dz", 0.0)) - float(d1)]
                if op.get("yaw") is not None:
                    st["yaw"] = float(op["yaw"]) % 360.0
                st["yaw"] = (st["yaw"] + float(op.get("turn", 0.0))) % 360.0
    return out


def changes(head_ops: list, ops: list, names: dict[str, str]) -> dict:
    """{lines, unnamed}: one line per piece whose end state differs between
    the two versions (`piece_states`), in the new file's order, removals
    last."""
    unnamed: set[str] = set()

    def name(st: dict) -> str:
        asset = st.get("asset") or ""
        if asset in names:
            return names[asset]
        if asset:
            unnamed.add(asset)
        return asset or st["kind"]
    old, new = piece_states(head_ops), piece_states(ops)
    lines = []
    for uid, st in new.items():
        prev = old.get(uid)
        if prev is None:
            where = f" at [{st['at'][0]:.1f}, {st['at'][1]:.1f}]" if st.get("at") else ""
            lines.append(f"Added {name(st)} ({uid}){where}.")
            continue
        bits = []
        if prev.get("asset") != st.get("asset"):
            bits.append(f"replaced {name(prev)} with {name(st)}")
        if prev.get("at") and st.get("at"):
            dx, dz = st["at"][0] - prev["at"][0], st["at"][1] - prev["at"][1]
            if math.hypot(dx, dz) >= MOVE_MIN_M:
                bits.append(f"moved {math.hypot(dx, dz):.1f} m {_compass(dx, dz)}")
        if prev.get("yaw") is not None and st.get("yaw") is not None:
            turn = (st["yaw"] - prev["yaw"] + 180.0) % 360.0 - 180.0
            if abs(turn) >= TURN_MIN_DEG:
                bits.append(f"turned {abs(turn):.0f} degrees {'clockwise' if turn > 0 else 'anticlockwise'}")
        if not bits and (prev["ops"] != st["ops"] or prev.get("pad") != st.get("pad")):
            bits.append("placed differently (its layout ops changed)")
        if bits:
            subject = name(prev) if prev.get("asset") != st.get("asset") else name(st)
            lines.append(f"{subject} ({uid}): {'; '.join(bits)}.")
    for uid, st in old.items():
        if uid not in new:
            lines.append(f"Removed {name(st)} ({uid}).")
    return {"lines": lines, "unnamed": sorted(unnamed)}


def head_ops(layout_path: Path, repo_root: Path, rev: str = "HEAD") -> list:
    rel = Path(layout_path).resolve().relative_to(repo_root).as_posix()
    got = subprocess.run(["git", "show", f"{rev}:{rel}"], cwd=repo_root, capture_output=True, text=True)
    if got.returncode != 0:
        return []
    return json.loads(got.stdout).get("ops") or []

"""Effect and road-sign sockets mined from vanilla placements (16k r7 rule 5, K2).

`mine_mounts.mine_effect_sockets` measures where vanilla stands a smoke over
a chimney or a fire (offset only). This module is its successor for the
record's `effectSockets` block: the same kinds (read from
`mine_mounts.EFFECT_SOCKETS`, never copied) plus

- ``yawDeg`` per row: the circular median of the child's yaw relative to
  the parent (a smoke column has no facing; a road board does);
- the ``roadsign`` kind: vanilla's lettered boards
  (``clutter/signage/roadsigns/roadsign*.nif``) on ``roadsignpost``, one row
  per board model (a left and a right board sit on opposite faces of the
  post), within ROADSIGN_RADIUS_M of the post's pivot.

Hana's blank boards (`bmv:roadsign{small,medium,large}01{l,r}`, placed by no
plugin in the pool, fix2-kits-r3 §2) are matched to the vanilla board whose
mesh bounds, seen from the pivot, agree within BOARD_PIVOT_TOL_M on every
axis (the blank board is that board's geometry frame with the lettering
removed); a matched blank board inherits the vanilla board's measured
offset and yaw on the post as a mount pair (`pairs`, kind points, evidence
``plugin``, ``twinOf`` the vanilla board). A board with no match inside the
tolerance gets no pair and is listed in ``boards`` with its best miss.

Frames: offsets are in the parent's UNIT frame, plugin axes (x right,
y forward, z up), metres (`mine_assemblies.unit_offset`), the frame of a
mount pair's ``offsetM``.

    python3 -m worldgen.mine_effect_sockets            # print
    python3 -m worldgen.mine_effect_sockets --merge    # write effectSockets + board pairs
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter
from pathlib import Path

import numpy as np

from . import mine_mounts as mm

ROADSIGN_DIR = "clutter/signage/roadsigns/"
ROADSIGN_POST_MODEL = ROADSIGN_DIR + "roadsignpost.nif"
ROADSIGN_POST = "vanilla:clutter/signage/roadsigns/roadsignpost"
ROADSIGN_RADIUS_M = 1.5
"""A board's pivot sits on its post's axis (vanilla boards: bounds start
0.12 m off the pivot, the post's half-width): 1.5 m keeps a neighbouring
post's boards out."""
BOARD_PIVOT_TOL_M = 0.02
BLANK_BOARD_PREFIX = "bmv:roadsign"
BLANK_BOARD_KIT = "works-v1"


def _is_board(model: str) -> bool:
    return model.startswith(ROADSIGN_DIR + "roadsign") and model != ROADSIGN_POST_MODEL


def circular_median_deg(values: list[float]) -> float:
    """The sample angle minimising the summed arc distance to the rest."""
    if not values:
        return 0.0
    vals = [v % 360.0 for v in values]

    def arc(a: float, b: float) -> float:
        d = abs(a - b) % 360.0
        return min(d, 360.0 - d)
    return round(min(vals, key=lambda c: (sum(arc(c, v) for v in vals), c)), 1)


def _summary(got: list[tuple]) -> dict:
    arr = np.array([g[:3] for g in got], dtype=float)
    return {"offsetM": [round(float(v), 3) for v in np.median(arr, axis=0)],
            "p25M": [round(float(v), 3) for v in np.percentile(arr, 25, axis=0)],
            "p75M": [round(float(v), 3) for v in np.percentile(arr, 75, axis=0)],
            "yawDeg": circular_median_deg([g[3] for g in got]),
            "n": len(got)}


def socket_rows(refs: list, kinds: dict, radii: dict) -> dict:
    """``{kind: {parent asset: row}}`` (`_summary` plus child model counts)
    for every (child models, {parent asset: parent model}) kind; a roadsign
    parent row also carries ``boards`` {child model: row}."""
    from . import mine_assemblies as ma
    out: dict[str, dict] = {}
    for kind, (is_child, parents) in kinds.items():
        by_model = {model: asset for asset, model in parents.items()}
        parent_refs = [r for r in refs if r.model_key in by_model]
        rows: dict[str, list] = {asset: [] for asset in parents}
        radius = radii.get(kind, mm.EFFECT_SOCKET_RADIUS_M)
        for child in (r for r in refs if is_child(r.model_key)):
            near = [(math.hypot(child.x - p.x, child.y - p.y), p) for p in parent_refs
                    if p.world == child.world]
            near = [t for t in near if t[0] <= radius]
            if not near:
                continue
            parent = min(near, key=lambda t: (t[0], t[1].x, t[1].y))[1]
            lx, ly, lz, yaw = ma.unit_offset(parent, child)
            rows[by_model[parent.model_key]].append((lx, ly, lz, yaw, child.model_key))
        kind_out = {}
        for asset, got in sorted(rows.items()):
            if not got:
                kind_out[asset] = {"n": 0}
                continue
            row = {**_summary(got), "children": dict(sorted(Counter(g[4] for g in got).items()))}
            if kind == "roadsign":
                row["boards"] = {model: _summary([g for g in got if g[4] == model])
                                 for model in sorted({g[4] for g in got})}
            kind_out[asset] = row
        out[kind] = kind_out
    return out


def socket_kinds() -> tuple[dict, dict]:
    """(kinds, radii): mine_mounts' effect kinds plus the roadsign kind."""
    kinds = {kind: ((lambda m, c=children: m in c), parents)
             for kind, (children, parents) in mm.EFFECT_SOCKETS.items()}
    kinds["roadsign"] = (_is_board, {ROADSIGN_POST: ROADSIGN_POST_MODEL})
    return kinds, {**mm.EFFECT_SOCKET_RADII_M, "roadsign": ROADSIGN_RADIUS_M}


def vanilla_refs(vault: Path, kinds: dict) -> list:
    from . import mine_assemblies as ma
    index, bundles = ma.pool_index(vault)
    bundle = next(b for b in bundles if b["id"] == "vanilla")
    parents = {m for _c, ps in kinds.values() for m in ps.values()}

    def wanted(key: str) -> bool:
        return key in parents or any(is_child(key) for is_child, _p in kinds.values())
    refs = ma.collect(index, ma.kit_joins(), bundle["rows"], bundle["id"], bundle["label"],
                      accept=lambda key, _vol, _pool: wanted(key)).refs
    return [r for r in refs if wanted(r.model_key)]


def board_bounds(cache: Path = mm.MESH_CACHE) -> dict[str, tuple]:
    """Vanilla board model -> (min xyz, max xyz) of its cached LOD0 mesh."""
    index = json.loads((cache / "index.json").read_text())
    out = {}
    for key, row in index.items():
        model = key.split(":", 1)[-1]
        if _is_board(model):
            v = np.load(cache / row["npz"])["vertices"].reshape(-1, 3)
            out[model] = (v.min(axis=0), v.max(axis=0))
    return out


def blank_boards(kits_dir: Path) -> dict[str, tuple]:
    """Blank board id -> (min, max) from its published manifest row
    (``originOffsetM`` is minus the bounds' min corner; max = min + size)."""
    kit = json.loads((kits_dir / f"{BLANK_BOARD_KIT}.kit.json").read_text())
    out = {}
    for a in kit["assets"]:
        if a["id"].startswith(BLANK_BOARD_PREFIX):
            lo = -np.array(a["originOffsetM"], dtype=float)
            out[a["id"]] = (lo, lo + np.array(a["sizeM"], dtype=float))
    return out


def match_boards(blanks: dict, vanilla: dict, measured: set[str]) -> dict:
    """Blank board -> its best vanilla twin among the MEASURED boards: the
    largest per-axis difference of the two bounds boxes (both corners),
    ``withinTol`` when it is at most BOARD_PIVOT_TOL_M."""
    out = {}
    for blank, (blo, bhi) in sorted(blanks.items()):
        best = None
        for model, (vlo, vhi) in sorted(vanilla.items()):
            if model not in measured:
                continue
            diff = float(max(np.abs(blo - vlo).max(), np.abs(bhi - vhi).max()))
            if best is None or diff < best[0]:
                best = (diff, model)
        if best is None:
            out[blank] = {"twinOf": None, "maxDiffM": None, "withinTol": False}
        else:
            out[blank] = {"twinOf": best[1], "maxDiffM": round(best[0], 4),
                          "withinTol": best[0] <= BOARD_PIVOT_TOL_M}
    return out


def board_pairs(matches: dict, roadsign_row: dict) -> list[dict]:
    """A mount pair (kind points, one point) per blank board matched within
    tolerance, at its twin's median offset and yaw on the post."""
    boards = roadsign_row.get("boards") or {}
    pairs = []
    for blank, m in sorted(matches.items()):
        if not m["withinTol"] or m["twinOf"] not in boards:
            continue
        twin = boards[m["twinOf"]]
        pairs.append({"kind": "points", "child": blank, "parent": ROADSIGN_POST,
                      "parentScale": 1.0, "n": twin["n"], "evidence": "plugin",
                      "evidenceNote": BOARD_EVIDENCE_NOTE, "yawBy": "designer",
                      # a board is fixed to the post's side, whatever class
                      # its own (unplaced) anchor row carries (r8: the shape gate)
                      "mountClass": "wall",
                      "twinOf": "vanilla:" + m["twinOf"].removesuffix(".nif"),
                      "twinMaxDiffM": m["maxDiffM"],
                      "points": [{"offsetM": twin["offsetM"], "n": twin["n"],
                                  "yawDeg": twin["yawDeg"]}],
                      "offsetM": twin["offsetM"], "yawDeg": twin["yawDeg"]})
    return pairs


BOARD_EVIDENCE_NOTE = ("height and face from the twin's vanilla placements; the yaw on "
                       "the post is the road's bearing, set by the designer "
                       "(`wb.py mount --yaw`), never read from the twin")
"""16k r8 rule 1: the twins' relative yaws spread 40-350 degrees (r7 rec 2),
a road bearing and not a property of the socket."""


PUBLISHED_KITS = Path(__file__).resolve().parents[3] / "apps" / "world-studio" / "public" / "kits"


def mine(vault: Path, kits_dir: Path = PUBLISHED_KITS) -> dict:
    kinds, radii = socket_kinds()
    sockets = socket_rows(vanilla_refs(vault, kinds), kinds, radii)
    post = sockets["roadsign"].get(ROADSIGN_POST) or {}
    matches = match_boards(blank_boards(kits_dir), board_bounds(), set(post.get("boards") or {}))
    return {"frame": "parent unit frame, plugin axes (x right, y forward, z up), metres; "
                     "yawDeg the child's yaw relative to the parent",
            "radiusM": mm.EFFECT_SOCKET_RADIUS_M, "radiusByKindM": radii,
            "source": "vanilla Skyrim.esm, every exterior worldspace",
            "method": "worldgen.mine_effect_sockets (16k r7 rule 5)",
            "sockets": sockets,
            "blankBoards": {"toleranceM": BOARD_PIVOT_TOL_M, "matches": matches},
            "_pairs": board_pairs(matches, post)}


def merge(record: dict, got: dict) -> dict:
    """``effectSockets`` replaced; the blank-board pairs replace any pair of
    the same (child, parent); the pair contract is re-checked."""
    pairs = got.pop("_pairs")
    record["effectSockets"] = got
    keys = {(p["child"], p["parent"]) for p in pairs}
    record["pairs"] = sorted([p for p in record["pairs"] if (p["child"], p["parent"]) not in keys]
                             + pairs, key=lambda p: (p["child"], p["parent"]))
    findings = (mm.validate_pairs(record["pairs"])
                + mm.validate_mount_shapes(pairs, record.get("anchors", {})))
    if findings:
        raise ValueError("board pairs break the mounts contract: " + "; ".join(findings[:10]))
    record["pairKindCounts"] = dict(sorted(Counter(p["kind"] for p in record["pairs"]).items()))
    return record


def main(argv=None) -> int:
    """The CLI, holding the kit-list lock SHARED (16k r8 rule 4): no kit
    build rewrites the manifests this run reads."""
    from . import mine_designed_sink  # noqa: F401  (puts pipeline/ on the path)
    from pipeline.kit_lock import kit_list_lock
    with kit_list_lock("shared", "mine_effect_sockets"):
        return _main(argv)


def _main(argv=None) -> int:
    from . import asset_registry
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--vault", type=Path, default=asset_registry.DEFAULT_VAULT)
    ap.add_argument("--out", type=Path, default=mm.DEFAULT_OUT)
    ap.add_argument("--merge", action="store_true",
                    help="write effectSockets and the blank-board pairs into --out")
    args = ap.parse_args(argv)
    got = mine(args.vault)
    print(json.dumps({"roadsign": got["sockets"]["roadsign"], "fire": got["sockets"].get("fire"),
                      "blankBoards": got["blankBoards"], "pairs": got["_pairs"]}, indent=1))
    if args.merge:
        record = merge(json.loads(args.out.read_text()), got)
        args.out.write_text(json.dumps(record, indent=1) + "\n", encoding="utf-8")
        print(f"-> {args.out} (effectSockets, {len(got['sockets'])} kinds)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

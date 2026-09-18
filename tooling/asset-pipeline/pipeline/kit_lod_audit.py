"""Audit the LOD chain every species in a shipped kit actually carries.

Reads the RAW kit GLB (``output/kits/<kit>.glb``, plain accessors) and its
manifest and reports, per asset: the mesh levels present, whether each is
genuinely smaller than the one before (an identical level is not a level —
the runtime drops it, ``floraKit.ts``), whether the far card is present with
a texture, and whether every level carries the same material parts (a part
missing at one level draws a trunk without its crown). Run::

    python -m pipeline.kit_lod_audit flora-province-v1 underwater-v1

Exit code 1 when any asset outside the no-card categories lacks a textured
card, or any level lacks a part its base level has. Identical levels are
reported per category as a count (the runtime drops them; the builder no
longer exports them) and do not fail the audit.

The underwater kit carries no cards by design: its species draw to 120 m
(`SUBMERGED_MAX_DRAW_M`) under water that hides anything past a few dozen
metres, so a far card would never be seen. Kits named in ``NO_CARD_KITS``
are exempt from the card check.
"""
from __future__ import annotations

import json
import struct
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KITS = ROOT / "output" / "kits"
# Categories the kit builder deliberately gives no card and no decimation
# (decision 0071: decimation opened the cliff shells).
NO_CARD_CATEGORIES = {"rock"}
NO_CARD_KITS = {"underwater-v1"}


def read_glb_json(path: Path) -> dict:
    with path.open("rb") as f:
        f.seek(12)
        length, _ = struct.unpack("<II", f.read(8))
        return json.loads(f.read(length))


def audit(kit: str) -> tuple[list[dict], list[str]]:
    js = read_glb_json(KITS / f"{kit}.glb")
    manifest = json.loads((KITS / f"{kit}.kit.json").read_text())
    assets = {a["id"]: a for a in manifest["assets"]}
    nodes, meshes, mats, acc = js["nodes"], js["meshes"], js["materials"], js["accessors"]
    textures = js.get("textures", [])

    def walk(n: int, out: list) -> None:
        nd = nodes[n]
        if "mesh" in nd:
            out.append(nd)
        for c in nd.get("children", []):
            walk(c, out)

    rows, problems = [], []
    for r in js["scenes"][0]["nodes"]:
        root = nodes[r]
        aid = root.get("extras", {}).get("assetId", root.get("name"))
        asset = assets.get(aid)
        if asset is None:
            continue
        mesh_nodes: list = []
        walk(r, mesh_nodes)
        tris_by_level: dict = defaultdict(int)
        parts_by_level: dict = defaultdict(set)
        card_textured = None
        for nd in mesh_nodes:
            ex = nd.get("extras", {})
            level = "card" if ex.get("billboard") else ex.get("lod", 0)
            for pr in meshes[nd["mesh"]]["primitives"]:
                n = acc[pr["indices"]]["count"] if "indices" in pr else acc[pr["attributes"]["POSITION"]]["count"]
                tris_by_level[level] += n // 3
                mat = mats[pr["material"]]
                if level == "card":
                    tex = mat.get("pbrMetallicRoughness", {}).get("baseColorTexture")
                    card_textured = bool(tex is not None and tex["index"] < len(textures))
                else:
                    parts_by_level[level].add(mat["name"])
        mesh_levels = sorted(k for k in tris_by_level if k != "card")
        distinct = []
        for lv in mesh_levels:
            if not distinct or tris_by_level[lv] < tris_by_level[distinct[-1]]:
                distinct.append(lv)
        category = asset.get("category", "?")
        row = {
            "id": aid, "category": category, "heightM": round(asset["sizeM"][2], 1),
            "meshLevels": len(mesh_levels), "distinctLevels": len(distinct),
            "triangles": [tris_by_level[lv] for lv in mesh_levels],
            "card": card_textured,
        }
        rows.append(row)
        base_parts = parts_by_level.get(0, set())
        for lv in mesh_levels[1:]:
            missing = base_parts - parts_by_level[lv]
            if missing:
                problems.append(f"{kit}:{aid} level {lv} lacks parts {sorted(missing)}")
        if kit not in NO_CARD_KITS and category not in NO_CARD_CATEGORIES and not card_textured:
            problems.append(f"{kit}:{aid} ({category}) has no textured far card")
        if category in NO_CARD_CATEGORIES and card_textured:
            problems.append(f"{kit}:{aid} ({category}) carries a card its category forbids")
    return rows, problems


def main(argv: list[str]) -> int:
    kits = argv or ["flora-province-v1", "underwater-v1"]
    exit_code = 0
    for kit in kits:
        rows, problems = audit(kit)
        by_cat: dict = defaultdict(lambda: {"n": 0, "identicalChains": 0, "card": 0, "levels": defaultdict(int)})
        for row in rows:
            c = by_cat[row["category"]]
            c["n"] += 1
            c["levels"][row["distinctLevels"]] += 1
            if row["meshLevels"] > row["distinctLevels"]:
                c["identicalChains"] += 1
            if row["card"]:
                c["card"] += 1
        print(f"== {kit}: {len(rows)} assets")
        print(f"{'category':16}{'assets':>7}{'w/ card':>8}{'identical-lvls':>15}  distinct mesh levels")
        for cat, c in sorted(by_cat.items()):
            levels = ", ".join(f"{k}:{v}" for k, v in sorted(c["levels"].items()))
            print(f"{cat:16}{c['n']:>7}{c['card']:>8}{c['identicalChains']:>15}  {levels}")
        for p in problems:
            print("  PROBLEM", p)
        if problems:
            exit_code = 1
    return exit_code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

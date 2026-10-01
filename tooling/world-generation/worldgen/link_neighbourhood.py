"""What a plugin placed around one of its exterior load doors.

A linked shell is rarely the whole entrance the modder built: a cave mouth
in King of the Murkmire is a Hist root mass, the rocks banked against it and
the invisible AutoLoadDoor01 between them. Before a place copies an entrance
(the type-5 sheet, 16k walk 9), read every exterior reference the plugin set
within a radius of the door that loads into the cell, in the DOOR's frame:
x right of the way in, y into the entrance, z up, yaw relative to the door.

    python3 -m worldgen.link_neighbourhood --plugin "King of the Murkmire.esp" \
        --cell MugsumpHollowInt01 [--radius 20] [--out FILE]

Prints one JSON document: per exterior door into the cell, its world pose
and the refs around it (asset id where the registry knows the model, the
model path, the base type, door-frame offset, yaw and scale), nearest first.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from .asset_registry import DEFAULT_VAULT
from .esp_index import UNITS_PER_METRE
from .mine_door_links import Vault, asset_id_for, discover_plugins, registry_index, world_refs


def door_frame(door, pos) -> tuple[float, float, float]:
    """`pos` (game units) in the door's frame, metres: rot.z is the door's
    clockwise heading; y points the way the door faces."""
    dx = (pos[0] - door.pos[0]) / UNITS_PER_METRE
    dy = (pos[1] - door.pos[1]) / UNITS_PER_METRE
    dz = (pos[2] - door.pos[2]) / UNITS_PER_METRE
    h = door.rot[2]
    c, s = math.cos(h), math.sin(h)
    return (round(dx * c - dy * s, 2), round(dx * s + dy * c, 2), round(dz, 2))


def neighbourhood(plugin_name: str, cell: str, radius_m: float, vault_root: Path = DEFAULT_VAULT) -> dict:
    wanted = [(pool, path) for pool, path in discover_plugins(vault_root)
              if path.name == plugin_name or path.name.lower() == "skyrim.esm"]
    vault = Vault(wanted)
    vault.index()
    index = registry_index()
    host = next(p for _pool, path, p in vault.entries if path.name == plugin_name)
    pool = vault.pool_of(plugin_name)
    refs = list(world_refs(host))
    out = []
    for door in refs:
        if not door.teleport:
            continue
        target = vault.interior_of_ref.get(vault.key(host, door.teleport[0]))
        if target is None or target[1] != cell:
            continue
        near = []
        for ref in refs:
            d = math.dist(ref.pos[:2], door.pos[:2]) / UNITS_PER_METRE
            if ref is door or d > radius_m:
                continue
            base = vault.base_of(host, ref.base)
            model = getattr(base, "model_key", None) if base is not None else None
            near.append({
                "distanceM": round(d, 2),
                "assetId": asset_id_for(model, index, pool) if model else None,
                "model": model,
                "baseType": getattr(base, "type", None),
                "doorFrameM": door_frame(door, ref.pos),
                "yawRelDeg": round(math.degrees(ref.rot[2] - door.rot[2]) % 360.0, 1),
                "scale": round(float(ref.scale or 1.0), 3),
            })
        near.sort(key=lambda r: r["distanceM"])
        out.append({"doorRef": f"{door.form_id:08X}",
                    "doorPosM": [round(v / UNITS_PER_METRE, 2) for v in door.pos],
                    "doorYawDeg": round(math.degrees(door.rot[2]) % 360.0, 1),
                    "refs": near})
    return {"plugin": plugin_name, "cell": cell, "radiusM": radius_m, "doors": out}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--plugin", required=True)
    ap.add_argument("--cell", required=True)
    ap.add_argument("--radius", type=float, default=20.0)
    ap.add_argument("--out")
    args = ap.parse_args()
    doc = neighbourhood(args.plugin, args.cell, args.radius)
    text = json.dumps(doc, indent=1)
    if args.out:
        Path(args.out).write_text(text + "\n")
    print(text)


if __name__ == "__main__":
    main()

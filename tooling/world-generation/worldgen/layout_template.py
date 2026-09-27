"""Per-type layout templates: a site packet and a type's yard sets in, a
whole-place layout out (16k S10; method review r3 finding J).

A place's layout (`world/sources/blueprints/<stem>.layout.json`, the file
`wb.py apply` runs) is authored by hand for a type's first place. At that
place's close the agent writes the type's generator here, from the type
sheet's "Layout template" section (`.claude/skills/place-build/references/
types/<type>.md`), so the type's later places start from a generated layout
instead of re-earning the first place's walks.

    python3 -m worldgen.layout_template --type 01-road-station \\
        --packet tooling/.reports/16k/<place>/site-packet.json --out <layout.json>

Inputs:
  * the site packet (`worldgen.site_packet` writes it). Only `placeId` is
    read here; a generator reads what else it needs and says so.
  * the type's yard sets, `world/sources/placement/yard-sets/<type>.json`
    (decision 0101).
Output: `{"schemaVersion": 1, "placeId", "window": {"centreKm": [x, z],
"halfM"}, "ops": [...]}`, written atomically in the layout files' own format
(one-space indent, keys in authored order).

A type is registered in `REGISTRY` by its sheet id. A type whose generator is
not written yet raises `NotImplementedError` naming when it will be.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from types import MappingProxyType
from typing import Mapping

from .atomic_write import atomic_write_bytes

REPO = Path(__file__).resolve().parents[3]
YARD_SETS_DIR = REPO / "world/sources/placement/yard-sets"
LAYOUT_SCHEMA_VERSION = 1


class LayoutTemplate:
    """One place type's generator. Subclasses set `type_id` and write `ops`."""

    type_id: str = ""

    def __init__(self, packet: Mapping, yard_sets: Mapping):
        self.packet = packet
        self.yard_sets = yard_sets

    @property
    def place_id(self) -> str:
        return self.packet["placeId"]

    def window(self) -> dict:
        """The layout's plan window: `{"centreKm": [x, z], "halfM"}`."""
        raise NotImplementedError(f"{self.type_id}: window() is written with the type's generator")

    def ops(self) -> list[dict]:
        """The layout's ops, in the order `wb.py apply` runs them."""
        raise NotImplementedError(f"{self.type_id}: ops() is written with the type's generator")

    def generate(self) -> dict:
        layout = {"schemaVersion": LAYOUT_SCHEMA_VERSION, "placeId": self.place_id,
                  "window": self.window(), "ops": self.ops()}
        problems = validate_layout(layout)
        if problems:
            raise ValueError(f"{self.type_id} generated an invalid layout: {problems[0]}")
        return layout


class RoadStation(LayoutTemplate):
    """Type 1, road station or hamlet (sheet `01-road-station.md`)."""

    type_id = "01-road-station"

    def generate(self) -> dict:
        raise NotImplementedError("written at Claywater's close (S10)")


REGISTRY: Mapping[str, type[LayoutTemplate]] = MappingProxyType({
    cls.type_id: cls for cls in (RoadStation,)
})
"""Type sheet id -> its generator class (read-only)."""


def load_packet(path: Path) -> dict:
    packet = json.loads(Path(path).read_text())
    if not isinstance(packet, dict) or not isinstance(packet.get("placeId"), str) or not packet["placeId"]:
        raise ValueError(f"{path}: a site packet needs a non-empty string placeId")
    return packet


def load_yard_sets(type_id: str, directory: Path = YARD_SETS_DIR) -> dict:
    path = Path(directory) / f"{type_id}.json"
    if not path.is_file():
        raise FileNotFoundError(f"{path}: type {type_id} has no yard-set file (decision 0101)")
    sets = json.loads(path.read_text())
    if sets.get("type") != type_id:
        raise ValueError(f"{path}: its type is {sets.get('type')!r}, not {type_id!r}")
    return sets


def validate_layout(layout: object) -> list[str]:
    """The shape every `*.layout.json` has; [] when it holds."""
    if not isinstance(layout, dict):
        return ["a layout is a JSON object"]
    out = []
    if layout.get("schemaVersion") != LAYOUT_SCHEMA_VERSION:
        out.append(f"schemaVersion must be {LAYOUT_SCHEMA_VERSION}")
    if not isinstance(layout.get("placeId"), str) or not layout["placeId"]:
        out.append("placeId must be a non-empty string")
    window = layout.get("window")
    if not (isinstance(window, dict) and isinstance(window.get("centreKm"), list)
            and len(window["centreKm"]) == 2 and isinstance(window.get("halfM"), (int, float))):
        out.append("window must be {centreKm: [x, z], halfM}")
    ops = layout.get("ops")
    if not isinstance(ops, list):
        out.append("ops must be a list")
    else:
        out += [f"ops[{i}] has no op name" for i, op in enumerate(ops)
                if not (isinstance(op, dict) and isinstance(op.get("op"), str))]
    return out


def generator_for(type_id: str, packet: Mapping, yard_sets: Mapping) -> LayoutTemplate:
    cls = REGISTRY.get(type_id)
    if cls is None:
        raise KeyError(f"no layout template for type {type_id!r} (registered: {', '.join(sorted(REGISTRY))})")
    return cls(packet, yard_sets)


def write_layout(layout: dict, out: Path) -> None:
    atomic_write_bytes(Path(out), (json.dumps(layout, indent=1) + "\n").encode("utf-8"))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--type", required=True, help="type sheet id, e.g. 01-road-station")
    ap.add_argument("--packet", required=True, type=Path, help="the place's site-packet.json")
    ap.add_argument("--out", required=True, type=Path, help="the layout.json to write")
    args = ap.parse_args(argv)
    gen = generator_for(args.type, load_packet(args.packet), load_yard_sets(args.type))
    try:
        layout = gen.generate()
    except NotImplementedError as exc:
        print(f"layout_template: {args.type}: {exc}", file=sys.stderr)
        return 2
    write_layout(layout, args.out)
    print(f"layout_template: {args.type} -> {args.out} ({len(layout['ops'])} ops)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

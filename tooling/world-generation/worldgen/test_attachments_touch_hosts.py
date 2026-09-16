"""Every hanging piece in the SHIPPED bundles actually touches its host.

The unit tests in `test_composition.py` prove the pass against synthetic
hosts; this one measures the compiled province. The defect it guards is the
one that got past the unit tests: `load_trunk_capsules` accepted only the
`pivot-yup-v2` collision frame, the shipped kit ships `pivot-yup-v3`, so the
trunk table was empty and `spawn_attachments` fell back to a +/-0.5 m square
around the host pivot at a 2-6 m hang height — 55 % of the hanging pieces in
five test windows sat above their host's trunk top.

Skips cleanly when the bundles or the kit manifest are not in the checkout.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from .composition import (
    KIT_MANIFEST_PATH,
    Composition,
    load_strand_tops,
    load_trunk_capsules,
)
from .scatter import ANCHOR_ATTACHED, ANCHOR_TERRAIN, decode

BUNDLES = (Path(__file__).resolve().parents[3] / "apps" / "world-studio"
           / "public" / "province" / "vegetation")

#: A strand bites a hair into the bark; more than this is hanging in air.
MAX_SURFACE_GAP_M = 0.35
#: What the bundle's byte quantisation of scale and yaw can move a strand's top.
QUANTISATION_M = 0.02
#: The strand's top must clear the soil by this much (it hangs DOWN).
MIN_TOP_ABOVE_GROUND_M = 0.3


def _species_order() -> list[str]:
    index = json.loads((BUNDLES / "vegetation-index.json").read_text())
    return list(index["speciesOrder"])


def test_every_attachment_touches_its_host_trunk():
    if not BUNDLES.exists() or not KIT_MANIFEST_PATH.exists():
        pytest.skip("compiled vegetation bundles not in this checkout")
    bundles = sorted(BUNDLES.glob("chunk_*_vegetation.bin"))
    if not bundles:
        pytest.skip("no compiled vegetation bundles")

    order = _species_order()
    # The hosts the composition can hang on (a measured trunk of at least
    # MIN_HOST_TRUNK_M): a shrub with a silhouette capsule (tropicalplant01,
    # bambooplant) is never a host, and judging a piece against the nearer
    # shrub instead of its real host read as "off the trunk" (16f).
    from .composition import Composition
    eligible = set(Composition.load().tree_hosts)
    trunks = {k: v for k, v in load_trunk_capsules().items() if k in eligible}
    tops = load_strand_tops()
    comp = Composition.load()

    checked = 0
    far = 0
    high = 0
    low = 0
    orphan = 0
    worst_gap = 0.0
    for path in bundles:
        groups = decode(path.read_bytes())
        hosts: list[tuple[float, float, float, float, float, str]] = []
        pieces: list[tuple[dict, str]] = []
        for group in groups:
            species = order[group["index"]]
            if group["anchor"] == ANCHOR_TERRAIN and species in trunks:
                trunk = trunks[species]
                for item in group["instances"]:
                    s = item["scale"]
                    cy, sy = math.cos(item["yaw"]), math.sin(item["yaw"])
                    hosts.append((
                        item["x"] + (trunk.x * cy + trunk.z * sy) * s,
                        item["z"] + (-trunk.x * sy + trunk.z * cy) * s,
                        item["y"],                       # host ground
                        trunk.radius * s,
                        (trunk.base_y + trunk.height * 0.8) * s,
                        species,
                    ))
            elif group["anchor"] == ANCHOR_ATTACHED:
                pieces.extend((item, species) for item in group["instances"])
        if not pieces:
            continue
        if not hosts:
            orphan += len(pieces)
            continue
        for item, species in pieces:
            checked += 1
            # The bundle does not name a piece's host, and trees clump, so
            # a piece is judged against EVERY eligible trunk within reach:
            # it passes if some trunk both touches it and carries it inside
            # the usable height. Judging against the nearest axis alone
            # read pieces on a big tree as "off" the small tree beside it.
            top = item["y"] + tops.get(species, 0.0) * item["scale"]
            best_gap = math.inf
            touching = False
            carried = False
            for ax, az, ground, radius, ceiling, _ in hosts:
                gap = math.hypot(item["x"] - ax, item["z"] - az) - radius
                if gap > 3.0:
                    continue
                best_gap = min(best_gap, gap)
                if gap <= MAX_SURFACE_GAP_M:
                    touching = True
                    rel = top - ground
                    # the bundle quantises a piece's scale and yaw to a byte:
                    # measured excess over the ceiling is at most 8 mm
                    if MIN_TOP_ABOVE_GROUND_M - 1e-3 <= rel <= ceiling + QUANTISATION_M:
                        carried = True
                        break
            if best_gap is math.inf:
                orphan += 1
                continue
            worst_gap = max(worst_gap, best_gap)
            if not touching:
                far += 1
            elif not carried:
                high += 1

    assert checked, "no attachment instances in the compiled bundles"
    report = (f"{checked} hanging pieces over {len(bundles)} bundles: "
              f"{far} off the trunk surface (>{MAX_SURFACE_GAP_M} m, worst "
              f"{worst_gap:.2f} m), {high} above the usable trunk, "
              f"{low} with their top in the soil, {orphan} in a chunk with "
              f"no hosting trunk at all")
    print(report)
    assert far == 0 and high == 0 and low == 0 and orphan == 0, report
    assert comp.trunks, "shipped kit manifest yielded no trunk capsules"

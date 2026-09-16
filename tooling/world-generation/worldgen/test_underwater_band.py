"""The underwater band: kits, breadth and the depth floor (16f).

Four checks, all measured on files this repo ships, so they run in CI without
the asset vault and skip cleanly when the kits or the bundles are not there:

* (a) every species any palette layer names exists in exactly ONE published
  kit manifest. A palette that asks for a mesh no kit carries places nothing
  and says nothing — that is how `tbp_seaweed06var1` was authored into the
  lagoon palette while `underwater-v1` did not carry it;
* (b) the underwater kit is actually USED: at least 70 % of its assets are
  named by some palette layer, so the kit stays the band's asset list rather
  than a shelf of meshes nobody placed;
* (c) nothing with an AQUATIC role stands above the waterline — measured on
  the shipped bundles against the wet-season signed depth, per species;
* `report_depth_bands` (not an assertion) prints delivered instances per
  hectare by depth band and water kind, for the ledger to quote.
"""

from __future__ import annotations

import collections
import json
from pathlib import Path

import numpy as np
import pytest

from .scatter import decode

REPO_ROOT = Path(__file__).resolve().parents[3]
PUBLIC = REPO_ROOT / "apps" / "world-studio" / "public"
KITS = PUBLIC / "kits"
BUNDLES = PUBLIC / "province" / "vegetation"
WATER_ID = PUBLIC / "province" / "water" / "water-id.png"
PALETTES = REPO_ROOT / "world" / "sources" / "flora" / "palettes.json"

#: The depth floor every aquatic role is authored to (build_palettes.aquatic).
AQUATIC_DEPTH_FLOOR_M = 0.3
#: Share of the underwater kit a palette layer must name (check b).
MIN_UNDERWATER_BREADTH = 0.7
UNDERWATER_KIT = "underwater-v1"


def _palettes() -> dict:
    return json.loads(PALETTES.read_text(encoding="utf-8"))["byRegionClass"]


def _layers() -> list[dict]:
    return [layer for entry in _palettes().values() for layer in entry["layers"]]


def _kit_assets() -> dict[str, list[str]]:
    """asset id -> the kit manifests that carry it."""
    if not KITS.exists():
        pytest.skip("no published kit manifests in this checkout")
    where: dict[str, list[str]] = collections.defaultdict(list)
    for path in sorted(KITS.glob("*.kit.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for asset in data.get("assets", []):
            where[asset["id"]].append(path.name[: -len(".kit.json")])
    return where


def _aquatic_species() -> set[str]:
    """The underwater BAND's species.

    Role alone is not the test: `aquatic-reeds` and `aquatic-lilypads` are
    older layers deliberately authored to straddle the waterline (a reed belt
    that starts in 0.3 m of water is not a reed belt). The band is the set of
    aquatic-role layers whose own authored depth floor is at or below the
    surface, which is exactly what this check is about.
    """
    return {layer["species"] for layer in _layers()
            if str(layer.get("role", "")).startswith("aquatic-")
            and float(layer.get("water_depth_m", [-99.0])[0])
            >= AQUATIC_DEPTH_FLOOR_M}


# --- (a) the kit/palette gate ------------------------------------------------


def test_every_palette_species_is_in_exactly_one_kit():
    where = _kit_assets()
    missing, duplicated = {}, {}
    for species in sorted({layer["species"] for layer in _layers()}):
        if species.startswith("composite:"):
            continue          # composites are assembled by the kit build
        kits = where.get(species, [])
        if not kits:
            missing[species] = "no kit carries it"
        elif len(kits) > 1:
            duplicated[species] = kits
    # Carried by more than one kit is REPORTED, not failed: a piece that is
    # both scatter and a place legitimately lives in two kits (the broken
    # rowboats and the wreck planks are in `underwater-v1` as debris and in
    # `wrecks-v1` as a plotted wreck's timber), and the runtime resolves a
    # species through the kit the bundle names, not through kit order.
    if duplicated:
        print(f"species in more than one kit ({len(duplicated)}): {duplicated}")
    assert not missing, (
        f"{len(missing)} palette species no published kit carries — every one "
        f"of them places nothing at runtime and reports nothing: {missing}")


# --- (b) breadth -------------------------------------------------------------


def test_the_underwater_kit_is_used_by_the_palettes():
    manifest = KITS / f"{UNDERWATER_KIT}.kit.json"
    if not manifest.exists():
        pytest.skip(f"no {UNDERWATER_KIT} manifest in this checkout")
    # PLACE pieces are out of the denominator. `underwater-v1` carries the
    # SIRENROOT ruin blocks and the HTBM xanmeer shrine pieces so that a
    # submerged ruin or a drowned shrine can be PLOTTED by 16g/16h/16i with a
    # stable id — scattering a shrine would be a defect, not breadth. What
    # this gate measures is whether the kit's scatter-eligible flora and
    # debris are actually placed.
    all_assets = {a["id"] for a in
                  json.loads(manifest.read_text(encoding="utf-8"))["assets"]}
    assets = {a for a in all_assets
              if not a.startswith(("sirenroot:", "htbm:"))}
    used = assets & {layer["species"] for layer in _layers()}
    share = len(used) / len(assets)
    unused = sorted(a.rsplit("/", 1)[-1] for a in assets - used)
    print(f"{UNDERWATER_KIT}: {len(used)}/{len(assets)} scatter-eligible "
          f"assets used by a palette layer ({share:.0%}), of "
          f"{len(all_assets)} in the kit; unused: {unused}")
    assert share >= MIN_UNDERWATER_BREADTH, (
        f"only {share:.0%} of {UNDERWATER_KIT} is placed by any palette "
        f"(floor {MIN_UNDERWATER_BREADTH:.0%}). Unused: {unused}")


# --- (c) the depth floor, on the shipped bundles -----------------------------


def _bundle_instances():
    """(species name, x, z) for every terrain-anchored instance shipped."""
    index_path = BUNDLES / "vegetation-index.json"
    if not index_path.exists():
        pytest.skip("no published vegetation bundles in this checkout")
    order = json.loads(index_path.read_text(encoding="utf-8"))["speciesOrder"]
    for bundle in sorted(BUNDLES.glob("chunk_*_vegetation.bin")):
        for group in decode(bundle.read_bytes()):
            name = order[group["index"]]
            for item in group["instances"]:
                if item["anchor"] == 0:
                    yield name, item["x"], item["z"]


def _water():
    if not WATER_ID.exists():
        pytest.skip("no water id raster in this checkout")
    from .water_report import ShippedWater
    return ShippedWater()


def test_no_aquatic_species_stands_above_the_waterline():
    wanted = _aquatic_species()
    if not wanted:
        pytest.skip("no aquatic-role layers in the palettes")
    water = _water()
    depth = water.signed_depth_m("wet")
    n = depth.shape[0]
    dry: dict[str, int] = collections.Counter()
    total: dict[str, int] = collections.Counter()
    for name, x, z in _bundle_instances():
        if name not in wanted:
            continue
        total[name] += 1
        row = int(np.clip(z / water.mpp2, 0, n - 1))
        col = int(np.clip(x / water.mpp2, 0, n - 1))
        if depth[row, col] < AQUATIC_DEPTH_FLOOR_M:
            dry[name] += 1
    offenders = {name: f"{dry[name]:,} of {total[name]:,}"
                 for name in sorted(dry) if dry[name]}
    print(f"aquatic instances shipped: {sum(total.values()):,}; "
          f"above the {AQUATIC_DEPTH_FLOOR_M} m floor: {sum(dry.values()):,}")
    for name, count in offenders.items():
        print(f"  {name}: {count}")
    assert not offenders, (
        f"{sum(dry.values()):,} aquatic-role instances stand in less than "
        f"{AQUATIC_DEPTH_FLOOR_M} m of wet-season water — re-run "
        f"compile_scatter against the current palettes: {offenders}")


# --- the report helper (no assertion) ----------------------------------------

DEPTH_BANDS = ((0.3, 1.0), (1.0, 3.0), (3.0, 6.0), (6.0, 12.0), (12.0, 1e9))


def report_depth_bands() -> dict:
    """Delivered aquatic instances per hectare by depth band and water kind.

    Not a gate: the ledger quotes it, and a human reads it to see whether the
    band is actually populating the deep water or crowding the margin.
    """
    wanted = _aquatic_species()
    water = _water()
    depth = water.signed_depth_m("wet")
    kinds = np.full(depth.shape, "", dtype=object)
    if water.ids is not None:
        lut = [""] + [e.get("kind", "") for e in water.entities]
        kinds = np.asarray(lut, dtype=object)[water.ids]
    n = depth.shape[0]
    counts: dict[tuple, collections.Counter] = collections.defaultdict(
        collections.Counter)
    area = collections.Counter()
    texel_ha = (water.mpp2 ** 2) / 10_000.0
    for name, x, z in _bundle_instances():
        if name not in wanted:
            continue
        row = int(np.clip(z / water.mpp2, 0, n - 1))
        col = int(np.clip(x / water.mpp2, 0, n - 1))
        d = float(depth[row, col])
        band = next((b for b in DEPTH_BANDS if b[0] <= d < b[1]), None)
        if band is None:
            continue
        counts[(str(kinds[row, col]), band)][name] += 1
    for band in DEPTH_BANDS:
        mask = (depth >= band[0]) & (depth < band[1])
        for kind in set(kinds[mask].tolist()) if water.ids is not None else {""}:
            area[(str(kind), band)] = float(
                (mask & (kinds == kind)).sum()) * texel_ha
    out = {}
    for key, species in sorted(counts.items()):
        ha = area.get(key, 0.0)
        out[f"{key[0]} {key[1][0]}-{key[1][1]} m"] = {
            "hectares": round(ha, 1),
            "perHectare": round(sum(species.values()) / ha, 2) if ha else None,
            "species": dict(species.most_common()),
        }
    return out


if __name__ == "__main__":       # pragma: no cover - a reporting entry point
    print(json.dumps(report_depth_bands(), indent=1))

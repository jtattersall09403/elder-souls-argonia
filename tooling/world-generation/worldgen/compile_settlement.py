"""Settlement compiler — walking skeleton (Phase 11 Part 0 item 4, decision 0041).

Deterministic blueprint → compiled-settlement pass. This is deliberately the
SKELETON: it must compile ONE settlement well before it grows options. What it
owns already (because retrofitting them is the expensive version):

  * ground fitting per the slope ladder (0041 "Slopes and uneven ground"):
    measure Δ (terrain height delta across the parcel footprint) and check the
    declared groundFit is legal — direct Δ<0.15 m · plinth 0.15–0.6 · pad
    0.6–2.0 (with falloff ring) · Δ≥2.0 NEVER graded → stilt/dug-in or the
    compile fails. Pad height from the MAX under the footprint; base buried
    0.25 m.
  * kit placement around the asset's own pivot at the parcel's authored
    `centreUV` and `yawDeg` — never the flora bottom-anchor path (kit-vet
    finding, 0041 Part 0 notes). Positions are NOT snapped to the 3.64 m
    module: since 2026-09-05 the parcel centre and orientation are authored
    with a stated reason, and snapping would silently overrule it.
  * graded vegetation clearing masks (hardClear / thinned polygons + affected
    chunk list) for the scatter compiler.
  * terrain grade patches as data (footprint, target height, falloff ring,
    residual tilt 0.7° against shadow acne) — applied by the chunk rebuild,
    never by editing rasters here.
  * door reachability, every compile: threshold on land, walkable slope,
    inside/adjacent to cleared ground.
  * GenerationProvenance on every emitted object (module 40 §31).
  * the static budget report checked against the blueprint's declared budget
    (instances, unique assets/materials, texture MB, collider estimate).
  * the module 97 promise ledger (`blueprint_promises`): every service, NPC
    role, travel destination, quest provision, socket and reward kind the
    catalogue record promises the player, against the blueprint objects that
    realise it. Unmet is a compile ERROR from magnitude M3 up, a warning below;
    the table is written to output/settlements/<id>.ledger.md.
  * the module 97 layer-integration checks (`blueprint_integration`), which
    FAIL the compile: ways vs buildings, gates across ways, doors onto ways,
    the 8 m spacing floor (97 C5) and the 1.3 m passage (97 C3).
  * WARN-grade module 97 reports, in `warnings` — they never fail a compile:
    the density band (97 C6), the `use` histogram (97 C7), the way width
    classes (97 C3), the flood-section audit (97 B4/G8), and the first-seen
    line of sight (97 B6/D2): each
    approach's `firstSeen` piece must be visible over BARE TERRAIN from the
    approach's first via point, and its height is reported against the region
    palette's canopy height, since canopy is not in the survey.

Output: output/settlements/<place-id>.settlement.json (derived, gitignored),
deterministic and byte-stable for a given blueprint + seed.

Run (from tooling/world-generation/):
  python3 -m worldgen.compile_settlement --blueprint <path> [--skip-catalogue]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from pathlib import Path

from . import blueprint as bp_mod
from . import parcel_kinds as pk_mod
from .site_fields import ProvinceSurvey
from .blueprint_integration import check_integration
from .blueprint_promises import check_promises, load_record, write_ledger
from . import place_obligations
from . import terrain_requests

SCHEMA_VERSION = 1
GENERATOR_ID = "compile_settlement"
GENERATOR_VERSION = "0.1.0"
BURY_M = 0.25
PAD_FALLOFF_RATIO = 2.5
PAD_RESIDUAL_TILT_DEG = 0.7
DOOR_MAX_SLOPE_DEG = 30.0
DOOR_SLOPE_SAMPLE_M = 2.0     # half-width of the threshold gradient sample
DOOR_BOARDWALK_REACH_M = 4.0  # same threshold apron accepted by integration
EYE_HEIGHT_M = 1.83           # the character (97 D8)
# Below this the player is already inside the clearing and the canopy between
# them and the beacon is the settlement's own cleared ring, so the canopy
# comparison is meaningless (the blocked-sightline test still runs at any range).
CANOPY_COMPARE_MIN_M = 100.0
REPO_ROOT = Path(__file__).resolve().parents[3]
KITS_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"
KIT_CONFIG_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "pipeline" / "config" / "kits"
PALETTES = REPO_ROOT / "world" / "sources" / "flora" / "palettes.json"
OUT_DIR = Path(__file__).resolve().parents[1] / "output" / "settlements"

# District cultureKit → kit configs, in preference order. The two-culture rule
# is enforced by the blueprint validator; here it just picks the shelf.
# Kit sets are the blueprint schema's vocabulary (one source of truth).
CULTURE_KITS = {k: v["kits"] for k, v in bp_mod.KIT_SETS.items()}

# Legal ground fits per measured Δ band (the ladder; a declared fit may be
# STRONGER than needed — stilts on flat ground are fine and lore-correct —
# but never weaker).
FIT_MIN = {"direct": 0.0, "plinth": 0.15, "pad": 0.6, "stilt": 0.0, "dug-in": 0.0}
FIT_MAX = {"direct": 0.15, "plinth": 0.6, "pad": 2.0, "stilt": float("inf"), "dug-in": float("inf")}
DRESSING_COUNTS = {"dwelling": (3, 6)}
WORK_USES = {"work", "works", "workshop", "yard", "industry", "quay", "market",
             "kiln", "haulage", "quarry", "hoist"}
FLOOD_SECTION_WORK_USES = {
    "work", "works", "workshop", "yard", "industry", "quay", "kiln",
    "haulage", "quarry", "hoist",
}
DRY_SECTION_USES = {"civic", "sacred", "shrine", "ritual"}
DWELLING_SECTION_USES = {"dwelling", "lodging"}


def _seed_int(*parts: str) -> int:
    return int.from_bytes(hashlib.sha256("|".join(parts).encode()).digest()[:8], "big")


def blueprint_sha256(bp: dict) -> str:
    """Content identity of the authored blueprint object.

    Canonical JSON ignores whitespace/key ordering but not any authored value;
    this makes the compile/export contract stable across checkout and formatter
    runs while rejecting a genuinely stale successful compile.
    """
    canonical = json.dumps(bp, sort_keys=True, separators=(",", ":"),
                           ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _canonical_sha256(value: object) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"),
                         ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def phase11_obligation_receipt(bp: dict, record: dict) -> tuple[dict, list[str]]:
    """Bind this compile to every Phase-11-owned macro obligation.

    Most rows point at the exact blueprint objects already checked by the
    blueprint and integration validators. Terrain requests instead point at
    their concrete, policy-validated terrain operation: a boardwalk near a
    promised cut is design evidence, but it is not the compiled cut.
    """
    obligations, errors = place_obligations.build_obligations(record, bp)
    owned = [row for row in obligations if row.deliveryOwner == "phase-11-compiled"]
    source_registry, registry_errors = place_obligations.blueprint_object_registry(bp)
    errors += registry_errors

    terrain_plan, terrain_errors = terrain_requests.build_plan([record])
    errors += terrain_errors
    terrain_operations: dict[str, list[dict]] = {}
    if not terrain_errors:
        for operation in terrain_plan.get("operations", []):
            request = next((row for row in terrain_plan.get("requests", [])
                            if row["id"] == operation["requestId"]), None)
            if request is not None:
                terrain_operations.setdefault(request["kind"], []).append(operation)

    registry: dict[str, dict] = {}
    deliveries = []
    for obligation in owned:
        refs = list(obligation.phase11Evidence)
        if obligation.sourcePath.startswith("terrainRequests["):
            kind = obligation.sourcePath.split("[", 1)[1].split("]", 1)[0]
            operations = terrain_operations.get(kind, [])
            refs = [operation["id"] for operation in operations]
            for operation in operations:
                registry.setdefault(operation["id"], {
                    "kind": "terrain-operation", "placeId": record["id"],
                    "sourceObjectSha256": _canonical_sha256(operation),
                    "deliversObligationIds": [],
                })
        for ref in refs:
            if ref not in registry:
                source = source_registry.get(ref)
                if source is None:
                    errors.append(f"{record['id']}: phase-11 obligation {obligation.id} "
                                  f"uses unknown compiled source object {ref!r}")
                    continue
                registry[ref] = {
                    **source,
                    "sourceObjectSha256": _canonical_sha256(source),
                    "deliversObligationIds": [],
                }
            registry[ref]["deliversObligationIds"].append(obligation.id)
        deliveries.append({"obligationId": obligation.id, "objectRefs": refs})

    for entry in registry.values():
        entry["deliversObligationIds"] = sorted(set(entry["deliversObligationIds"]))
    manifest = {
        "schemaVersion": place_obligations.MANIFEST_SCHEMA_VERSION,
        "kind": "place-obligation-deliveries",
        "owner": "phase-11-compiled",
        "obligationsSha256": place_obligations.owner_obligations_sha256(
            obligations, "phase-11-compiled"),
        "objectRegistrySha256": place_obligations.compiled_object_registry_sha256(registry),
        "deliveries": sorted(deliveries, key=lambda row: row["obligationId"]),
    }
    errors += place_obligations.verify_delivery_manifest(
        obligations, manifest, "phase-11-compiled", object_registry=registry)
    payload = {"placeId": record["id"], "objectRegistry": registry, "manifest": manifest}
    return {**payload, "receiptSha256": _canonical_sha256(payload)}, list(dict.fromkeys(errors))


def dressing_count(seed: str, parcel: dict) -> int:
    """97 decision 4: 3–6 objects at a dwelling, 6–12 at a works parcel."""
    use = str(parcel.get("use") or "").lower()
    bounds = DRESSING_COUNTS.get(use) or ((6, 12) if use in WORK_USES else None)
    if bounds is None:
        return 0
    lo, hi = bounds
    return lo + _seed_int(seed, parcel.get("id", ""), "dressing-count") % (hi - lo + 1)


def _point_segment_distance(px: float, pz: float, ax: float, az: float,
                            bx: float, bz: float) -> float:
    dx, dz = bx - ax, bz - az
    denom = dx * dx + dz * dz
    if denom <= 1e-12:
        return math.hypot(px - ax, pz - az)
    t = max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / denom))
    return math.hypot(px - (ax + t * dx), pz - (az + t * dz))


def _door_has_boardwalk_access(door: dict, bp: dict, survey: ProvinceSurvey) -> bool:
    """A stilt threshold may open onto its explicitly authored wet access.

    The integration contract already permits a four-metre threshold apron to
    a route/boardwalk. The terrain reachability pass used to ignore that
    geometry and therefore declared every over-water stilt door unreachable,
    even when the blueprint supplied the boardwalk. Keep the exception narrow:
    only a `stilt` parcel and only a named boardwalk within the same apron.
    """
    parcel = next((p for p in bp.get("parcels", [])
                   if p.get("id") == door.get("parcelId")), None)
    if not parcel or parcel.get("groundFit") != "stilt":
        return False
    px, pz = survey.uv_to_m(*door["thresholdUV"])
    for way in bp.get("boardwalks", []) or []:
        points = [survey.uv_to_m(*uv) for uv in way.get("points", [])]
        for (ax, az), (bx, bz) in zip(points, points[1:]):
            if _point_segment_distance(px, pz, ax, az, bx, bz) <= DOOR_BOARDWALK_REACH_M:
                return True
    return False


class KitShelf:
    """Loads the built kit manifests and picks assets for building families."""

    def __init__(self, kits_dir: Path = KITS_DIR, config_dir: Path = KIT_CONFIG_DIR):
        self.assets_by_kit: dict[str, list[dict]] = {}
        self.textures_mb: dict[str, float] = {}
        # every measured asset by id, across all kits — the flora kit included,
        # because the canopy the first-seen object has to clear lives there
        self.by_asset: dict[str, dict] = {}
        self.dressing_by_kit: dict[str, list[str]] = {}
        for name, path in sorted((p.stem.removesuffix(".kit"), p) for p in kits_dir.glob("*.kit.json")):
            data = json.loads(path.read_text())
            self.assets_by_kit[name] = data["assets"]
            for asset in data["assets"]:
                self.by_asset.setdefault(asset["id"], asset)
        for path in sorted(config_dir.glob("*.json")):
            data = json.loads(path.read_text())
            vocab = data.get("dressing") or []
            if vocab:
                self.dressing_by_kit[data["id"]] = [str(v) for v in vocab]

    def dressing(self, culture: str) -> list[str]:
        """The first kit-owned vocabulary in a district's preference order.

        `works-v1` is a fallback for cultures without their own clutter, not
        an invitation to blend every culture kit and the neutral works shelf
        around each house.
        """
        for kit in bp_mod.kits_for_district(culture, "prop"):
            out = [asset_id for asset_id in self.dressing_by_kit.get(kit, [])
                   if asset_id in self.by_asset]
            if out:
                return list(dict.fromkeys(out))
        return []

    def find(self, culture: str, asset_ref: str, kind: str = "building") -> dict | None:
        """An exact kit asset id inside the district's kit set (the Part 6
        geometry-judged pick). None if the set does not contain it.

        `kind` carries the 97 C1a dressing rule: a `prop` may also come from
        the dressing pool, because a notice board in an Argonian quay is
        clutter, not a second architecture. Without it the resolver refused
        the works board that the C1 warning had already been taught to admit
        (review 2026-09-07).
        """
        for kit in bp_mod.kits_for_district(culture, kind):
            for asset in self.assets_by_kit.get(kit, []):
                if asset["id"] == asset_ref:
                    return {"kit": kit, **asset}
        return None

    def pick(self, culture: str, family: str, key: str, asset_ref: str | None = None,
             kind: str = "building") -> dict | None:
        """Deterministically pick an asset matching `family` from the culture's
        kits: an explicit `asset_ref` wins outright; else exact-token match on
        the asset id first, else any asset tall enough to read as a building.
        `key` seeds the choice."""
        if asset_ref:
            return self.find(culture, asset_ref, kind)
        candidates: list[tuple[str, dict]] = []
        fallback: list[tuple[str, dict]] = []
        for kit in bp_mod.kits_for_district(culture, kind):
            for asset in self.assets_by_kit.get(kit, []):
                if family.lower() in asset["id"].lower():
                    candidates.append((kit, asset))
                elif (asset.get("sizeM") or [0, 0, 0])[2] >= 2.0:
                    fallback.append((kit, asset))
        pool = candidates or fallback
        if not pool:
            return None
        kit, asset = pool[_seed_int(key, family) % len(pool)]
        return {"kit": kit, **asset}


def _canopy_height_m(survey, x: float, z: float, shelf: "KitShelf") -> tuple[float | None, str]:
    """Canopy height of the region class under (x, z), from the flora palette's
    canopy-role species measured in the flora kit. The survey has no canopy
    raster, so the line-of-sight test below runs over BARE terrain and this
    number is reported beside it (97 §G G10)."""
    try:
        row, col = survey.grid_px(x, z)
        klass = str(int(survey.region_grid[row, col]))
        entry = json.loads(PALETTES.read_text())["byRegionClass"].get(klass)
    except Exception:
        return None, "unknown region class"
    if not entry:
        return None, "no palette for this region class"
    sizes = []
    for layer in entry.get("layers", []):
        if layer.get("role") != "canopy":
            continue
        asset = shelf.by_asset.get(layer.get("species"))
        if asset and asset.get("sizeM"):
            lo, hi = (layer.get("scale_range") or [1.0, 1.0])[:2]
            sizes.append(asset["sizeM"][2] * (float(lo) + float(hi)) / 2.0)
    if not sizes:
        return None, f"{entry.get('id')}: no measured canopy species"
    return max(sizes), entry.get("id", klass)

# --- 97 D2, canopy ON THE RAY (audit §6.4) --------------------------------- #
# The check used to take the tallest canopy species of the region under the
# TARGET and hold the beacon against it, wherever the trees actually stood. The
# ray is what hides a beacon, so the canopy is sampled ALONG it, over the
# stretch where trees can grow: open water carries none, and neither does the
# place's own hard-cleared ground (97 C13 — the ring is cleared by design, so
# comparing a shelf-top piece against a forest felled for it is a figure about
# nothing). A downward view is skipped for the same reason: when the walker's
# eye is already above the top of the piece, no canopy stands between them.
CANOPY_RAY_SAMPLES = 24
CANOPY_RAY_SKIP_END_FRAC = 0.08   # the last stretch is the clearing itself


def _point_in_polygon_uv(u: float, v: float, poly) -> bool:
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i][0], poly[i][1]
        x2, y2 = poly[(i + 1) % n][0], poly[(i + 1) % n][1]
        if (y1 > v) != (y2 > v):
            xx = x1 + (v - y1) * (x2 - x1) / ((y2 - y1) or 1e-12)
            if u < xx:
                inside = not inside
    return inside


def _parcel_sample_uvs(parcel: dict) -> list[tuple[float, float]]:
    """Deterministic authored control points, augmented per raster below."""
    footprint = parcel.get("footprint") or []
    raw = [parcel.get("centreUV")]
    raw.extend(footprint)
    if len(footprint) >= 2:
        raw.extend([
            [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0]
            for a, b in zip(footprint, footprint[1:] + footprint[:1])
        ])
    out: list[tuple[float, float]] = []
    seen: set[tuple[float, float]] = set()
    for uv in raw:
        if not isinstance(uv, (list, tuple)) or len(uv) != 2:
            continue
        point = (float(uv[0]), float(uv[1]))
        if point not in seen:
            seen.add(point)
            out.append(point)
    return out


def _parcel_flood_evidence(parcel: dict, survey: ProvinceSurvey) -> dict:
    open_count = flood_count = wet_count = 0
    max_flood = 0
    samples = _parcel_sample_uvs(parcel)
    footprint = parcel.get("footprint") or []
    if len(footprint) >= 3:
        # Cover the whole polygon at the finest published flood/water grid.
        # Centre/vertex/midpoint sampling can miss a wet tongue through a large
        # or concave footprint. Cell centres are the actual raster evidence;
        # authored controls remain as a conservative fallback for tiny huts.
        wet_n = int(survey.wet_season.shape[0])
        step_m = min(float(survey.grid_px_m), float(survey.extent_m) / wet_n)
        poly_m = [survey.uv_to_m(float(p[0]), float(p[1])) for p in footprint]
        min_x, max_x = min(p[0] for p in poly_m), max(p[0] for p in poly_m)
        min_z, max_z = min(p[1] for p in poly_m), max(p[1] for p in poly_m)
        c0, c1 = math.floor(min_x / step_m), math.floor(max_x / step_m)
        r0, r1 = math.floor(min_z / step_m), math.floor(max_z / step_m)
        existing = set(samples)
        for row in range(max(0, r0), min(wet_n - 1, r1) + 1):
            for col in range(max(0, c0), min(wet_n - 1, c1) + 1):
                x, z = (col + 0.5) * step_m, (row + 0.5) * step_m
                if _point_in_polygon_uv(x, z, poly_m):
                    uv = (x / survey.extent_m, z / survey.extent_m)
                    if uv not in existing:
                        samples.append(uv)
                        existing.add(uv)
    centre_open = False
    centre_flood = 0
    centre_wet = False
    wet_n = int(survey.wet_season.shape[0])
    wet_px_m = survey.extent_m / wet_n
    for index, (u, v) in enumerate(samples):
        x, z = survey.uv_to_m(u, v)
        row, col = survey.grid_px(x, z)
        is_open = bool(survey.open_water[row, col])
        band = int(survey.flood[row, col])
        wr = min(max(int(z / wet_px_m), 0), wet_n - 1)
        wc = min(max(int(x / wet_px_m), 0), wet_n - 1)
        is_wet = bool(survey.wet_season[wr, wc])
        open_count += int(is_open)
        flood_count += int(band > 0)
        wet_count += int(is_wet)
        max_flood = max(max_flood, band)
        if index == 0:  # centre is deliberately the first sample
            centre_open, centre_flood, centre_wet = is_open, band, is_wet
    count = len(samples)
    dry = count > 0 and open_count == 0 and flood_count == 0 and wet_count == 0
    return {
        "parcelId": parcel.get("id"),
        "districtId": parcel.get("districtId"),
        "use": parcel.get("use"),
        "sampleCount": count,
        "openWaterSamples": open_count,
        "floodBandSamples": flood_count,
        "wetSeasonInundatedSamples": wet_count,
        "maxFloodBand": max_flood,
        "centre": {
            "openWater": centre_open,
            "floodBand": centre_flood,
            "wetSeasonInundated": centre_wet,
        },
        "overOpenWater": open_count > 0,
        "touchesFloodSection": open_count > 0 or flood_count > 0 or wet_count > 0,
        "entireFootprintDryInSurvey": dry,
    }


def flood_band_report(bp: dict, survey: ProvinceSurvey,
                      kinds: dict[str, str] | None = None) -> tuple[dict, list[str]]:
    """97 B4 / G8 survey report. All mismatches are deliberately WARN-grade.

    This establishes horizontal section placement only. The available fields
    do not measure finished-floor height against highest seasonal water, and
    dry samples alone cannot distinguish a levee from another dry bench; the
    report states those limits rather than certifying either claim.
    """
    kinds = kinds if kinds is not None else pk_mod.kinds_of(bp)
    evidence = [
        _parcel_flood_evidence(p, survey) | {"kind": kinds.get(p.get("id"))}
        for p in sorted(bp.get("parcels", []), key=lambda p: p.get("id", ""))
    ]
    by_id = {e["parcelId"]: e for e in evidence}
    warnings: list[str] = []
    districts: list[dict] = []
    bp_id = bp.get("id", "<unknown blueprint>")
    culture_by_district = {d.get("id"): d.get("cultureKit")
                           for d in bp.get("districts", [])}

    for district in sorted(bp.get("districts", []), key=lambda d: d.get("id", "")):
        did = district.get("id")
        building_ids = [
            p.get("id") for p in bp.get("parcels", [])
            if p.get("districtId") == did and kinds.get(p.get("id")) == "building"
            and not p.get("stacksOn")
        ]
        over_ids = [pid for pid in building_ids if by_id[pid]["overOpenWater"]]
        share = (len(over_ids) / len(building_ids)) if building_ids else None
        kit = district.get("cultureKit")
        rule = None
        conforms = None
        if kit == "argonian-stilt" and share is not None:
            rule = {"id": "argonian-stilt-open-water-share", "min": 0.15, "max": 0.30}
            conforms = 0.15 <= share <= 0.30
            if not conforms:
                warnings.append(
                    f"{bp_id}: 97 B4/G8 — district {did} has {len(over_ids)}/{len(building_ids)} "
                    f"buildings over open water ({share * 100:.1f}%); argonian-stilt requires 15–30%"
                )
        elif kit == "argonian-root":
            rule = {"id": "argonian-root-no-open-water", "max": 0.0}
            conforms = not over_ids
            if not conforms:
                warnings.append(
                    f"{bp_id}: 97 B4/G8 — district {did} is argonian-root but buildings "
                    f"{', '.join(over_ids)} touch open water"
                )
        districts.append({
            "districtId": did,
            "cultureKit": kit,
            "buildingCount": len(building_ids),
            "buildingIds": building_ids,
            "overOpenWaterBuildingCount": len(over_ids),
            "overOpenWaterBuildingShare": round(share, 4) if share is not None else None,
            "overOpenWaterBuildingIds": over_ids,
            "cultureRule": rule,
            "conforms": conforms,
        })

    section_rules: list[dict] = []
    for parcel in sorted(bp.get("parcels", []), key=lambda p: p.get("id", "")):
        pid = parcel.get("id")
        use = str(parcel.get("use") or "").lower()
        actual = by_id[pid]
        if use in DRY_SECTION_USES:
            rule_id = "civic-sacred-dry"
            conforms = actual["entireFootprintDryInSurvey"]
            expected = "entire footprint dry in published water, flood-band and wet-season fields"
        elif (use in DWELLING_SECTION_USES
              and culture_by_district.get(parcel.get("districtId")) == "argonian-stilt"
              and parcel.get("groundFit") == "stilt"):
            # B4's culture rule deliberately puts 15--30% of these buildings
            # over water. The district share decides how many; an individual
            # authored stilt home may therefore occupy either side of the line.
            rule_id = "argonian-stilt-dwelling-water-section"
            conforms = True
            expected = "authored stilt dwelling; district 15–30% open-water share controls"
        elif use in DWELLING_SECTION_USES:
            rule_id = "dwelling-dry-levee-or-bench"
            conforms = actual["entireFootprintDryInSurvey"]
            expected = "dry footprint; survey cannot distinguish levee from another dry bench"
        elif use in FLOOD_SECTION_WORK_USES:
            rule_id = "works-quays-flood-section"
            conforms = actual["touchesFloodSection"]
            expected = "footprint touches open water, mapped flood band, or wet-season inundation"
        else:
            continue
        section_rules.append({
            "parcelId": pid,
            "districtId": parcel.get("districtId"),
            "use": use,
            "rule": rule_id,
            "expected": expected,
            "conforms": conforms,
        })
        if not conforms:
            warnings.append(
                f"{bp_id}: 97 B4/G8 — parcel {pid} ({use}) fails {rule_id}; "
                f"open-water samples {actual['openWaterSamples']}/{actual['sampleCount']}, "
                f"flood-band samples {actual['floodBandSamples']}/{actual['sampleCount']}, "
                f"wet-season samples {actual['wetSeasonInundatedSamples']}/{actual['sampleCount']}"
            )

    report = {
        "sampling": {
            "points": "all finest-grid cell centres inside footprint + centre/vertices/edge midpoints",
            "openWater": "ProvinceSurvey.open_water",
            "floodBand": "ProvinceSurvey.flood; any non-zero band is exposed",
            "wetSeason": "ProvinceSurvey.wet_season",
        },
        "limits": {
            "floorHeightAboveHighestWaterMeasured": False,
            "leveeVersusOtherDryBenchDistinguished": False,
        },
        "districts": districts,
        "parcels": evidence,
        "sectionRules": section_rules,
        "warningCount": len(warnings),
    }
    return report, warnings


def _cleared_at(bp: dict, survey, x: float, z: float) -> bool:
    """Is this point inside the blueprint's own hard-cleared ground?"""
    u, v = survey.m_to_uv(x, z)
    for poly in (bp.get("clearance") or {}).get("hardClear", []) or []:
        if len(poly) >= 3 and _point_in_polygon_uv(u, v, poly):
            return True
    return False


def _canopy_on_ray_m(bp: dict, survey, shelf: "KitShelf",
                     ax: float, az: float, bx: float, bz: float) -> tuple[float | None, str]:
    """The tallest canopy standing ON the sightline: the maximum over samples
    where the survey allows trees (dry ground outside the place's own ring)."""
    best: float | None = None
    where = "no vegetated ground on the sightline"
    stop = 1.0 - CANOPY_RAY_SKIP_END_FRAC
    for i in range(CANOPY_RAY_SAMPLES + 1):
        t = stop * i / CANOPY_RAY_SAMPLES
        x, z = ax + (bx - ax) * t, az + (bz - az) * t
        try:
            row, col = survey.grid_px(x, z)
            if bool(survey.open_water[row, col]):
                continue
        except Exception:      # noqa: BLE001 — an unreadable sample is not a tree
            continue
        if _cleared_at(bp, survey, x, z):
            continue
        h, region = _canopy_height_m(survey, x, z, shelf)
        if h is not None and (best is None or h > best):
            best, where = h, region
    return best, where


def _first_seen_warnings(bp: dict, survey, shelf: "KitShelf") -> list[str]:
    """97 B6 / D2 — the first-seen object must actually read from where the
    player first sees it. Bare-terrain line of sight from the approach's first
    via point to the top of the named piece, with the piece's height reported
    against the region's canopy."""
    out: list[str] = []
    bid = bp["id"]
    ways = {w["id"]: w for key in ("routes", "boardwalks", "canals")
            for w in bp.get(key, []) or []}
    targets: dict[str, tuple[list[float], float]] = {}
    for p in bp.get("parcels", []) or []:
        asset = shelf.by_asset.get(p.get("assetRef"))
        h = (asset["sizeM"][2] * float(p.get("scale", 1.0))) if asset and asset.get("sizeM") else None
        targets[p["id"]] = (p["centreUV"], h)
    for lm in bp.get("landmarks", []) or []:
        asset = shelf.by_asset.get(lm.get("assetRef"))
        h = (asset["sizeM"][2] * float(lm.get("scale", 1.0))) if asset and asset.get("sizeM") else None
        targets[lm["id"]] = (lm.get("position"), h)
    for dk in bp.get("docks", []) or []:
        targets[dk["id"]] = (dk.get("position"), None)

    for ap in sorted(bp.get("approaches", []) or [], key=lambda a: a.get("id", "")):
        seen = ap.get("firstSeen")
        if seen not in targets:
            out.append(f"{bid}: 97 D1 — approach {ap.get('id')} names firstSeen {seen!r}, which is not a "
                       f"parcel, landmark or dock in this blueprint")
            continue
        # The approach's own arrow first (97 C-stitch: `fromRouteId` names a
        # PROVINCE route, so the walked line is `viaUV`); the blueprint way it
        # used to name is the fallback for anything not yet migrated.
        way = ways.get(ap.get("fromRouteId"))
        via = ap.get("viaUV") or (way or {}).get("via") or (way or {}).get("points")
        if not via:
            out.append(f"{bid}: 97 B6 — approach {ap.get('id')} has no fromRouteId with waypoints, so the "
                       f"line of sight to {seen} cannot be measured; it rests on the checklist alone")
            continue
        uv, height = targets[seen]
        if uv is None:
            continue
        ax, az = survey.uv_to_m(float(via[0][0]), float(via[0][1]))
        bx, bz = survey.uv_to_m(float(uv[0]), float(uv[1]))
        dist = math.hypot(bx - ax, bz - az)
        visible = survey.line_of_sight(ax, az, bx, bz, eye_a=EYE_HEIGHT_M,
                                       eye_b=(height if height else EYE_HEIGHT_M))
        canopy, region = _canopy_on_ray_m(bp, survey, shelf, ax, az, bx, bz)
        # 97 D2 is about trees standing BETWEEN the walker and the beacon. A
        # walker whose eye is already above the top of the piece is looking DOWN
        # onto it (Mazzatun's shoulder approach onto a cleared shelf), and the
        # canopy figure says nothing about that view (audit §6.4).
        eye_h = survey.view_height_at(ax, az) + EYE_HEIGHT_M
        top_h = survey.view_height_at(bx, bz) + (height if height else EYE_HEIGHT_M)
        downward = eye_h > top_h
        shown = f"{height:.1f} m" if height else "of unmeasured height (no assetRef in the built kits)"
        canopy_note = (f"the piece is {shown} and the tallest canopy on the sightline is {canopy:.1f} m "
                       f"({region})" if canopy is not None else
                       f"the piece is {shown} (no canopy on the sightline: {region})")
        if not visible:
            out.append(f"{bid}: 97 B6/D2 — approach {ap.get('id')}: {seen} is NOT visible over bare terrain "
                       f"from the first waypoint of {ap.get('fromRouteId')}, {dist:.0f} m out; {canopy_note}")
        elif (canopy is not None and height is not None and height < canopy
              and dist >= CANOPY_COMPARE_MIN_M and not downward):
            out.append(f"{bid}: 97 D2 — approach {ap.get('id')}: {seen} clears the ground but not the trees — "
                       f"{canopy_note}, so it does not read from {dist:.0f} m out under a closed canopy")
    return out


def _provenance(bp_id: str, seed: str, rule: str, asset_id: str, hashes: list[str]) -> dict:
    return {
        "sourceBlueprintId": bp_id,
        "generatorId": GENERATOR_ID,
        "generatorVersion": GENERATOR_VERSION,
        "seed": seed,
        "ruleId": rule,
        "assetId": asset_id,
        "sourceDataHashes": hashes,
    }


def compile_blueprint(bp: dict, survey: ProvinceSurvey, shelf: KitShelf,
                      warnings: list[str] | None = None) -> dict:
    bp_id = bp["id"]
    seed = str(bp["seed"])
    errors: list[str] = []
    warns: list[str] = list(warnings or [])
    placements: list[dict] = []
    grades: list[dict] = []
    dressing_report: dict[str, int] = {}

    culture_of = {d["id"]: d["cultureKit"] for d in bp["districts"]}
    kind_of = pk_mod.kinds_of(bp)

    for parcel in sorted(bp["parcels"], key=lambda p: p["id"]):
        pid = parcel["id"]
        culture = culture_of[parcel["districtId"]]
        # The parcel is authored as centre + yaw + assetRef; `footprint` is the
        # asset's measured outline derived from those (worldgen.blueprint_
        # footprints), so ground Δ is measured over the REAL outline's vertices
        # and the piece is placed at the authored centre — not snapped to the
        # module grid, which would fight the authored orientation reason.
        foot_m = [list(survey.uv_to_m(u, v)) for u, v in parcel["footprint"]]
        heights = [survey.height_at(x, z) for x, z in foot_m]
        cx, cz = survey.uv_to_m(*parcel["centreUV"])
        heights.append(survey.height_at(cx, cz))
        delta = max(heights) - min(heights)

        fit = parcel["groundFit"]
        if delta > FIT_MAX[fit]:
            errors.append(
                f"{pid}: measured Δ={delta:.2f} m exceeds groundFit '{fit}' "
                f"(max {FIT_MAX[fit]:.2f} m) — never grade Δ>=2 m: use stilt/dug-in or re-site"
            )
            continue

        asset = shelf.pick(culture, parcel["buildingFamily"], f"{seed}:{pid}", parcel.get("assetRef"),
                           kind_of.get(pid, "building"))
        if asset is None:
            errors.append(f"{pid}: no kit asset for family '{parcel['buildingFamily']}'"
                          + (f" / assetRef '{parcel['assetRef']}'" if parcel.get("assetRef") else "")
                          + f" in kit set '{culture}'")
            continue

        base_y = max(heights) - BURY_M
        if parcel.get("stacksOn"):
            base = next((q for q in bp["parcels"] if q["id"] == parcel["stacksOn"]), None)
            base_asset = shelf.pick(culture, base["buildingFamily"], f"{seed}:{base['id']}",
                                    base.get("assetRef"),
                                    kind_of.get(base["id"], "building")) if base else None
            if base is not None and base_asset is not None:
                bx, bz = survey.uv_to_m(*base["centreUV"])
                base_y = survey.height_at(bx, bz) - BURY_M + base_asset["sizeM"][2] * float(base.get("scale", 1.0))
        if fit == "pad":
            grades.append({
                "parcelId": pid,
                "footprint": parcel["footprint"],
                "targetHeightM": max(heights),
                "falloffRatio": PAD_FALLOFF_RATIO,
                "residualTiltDeg": PAD_RESIDUAL_TILT_DEG,
            })
        # orientation is authored, with a reason (orientationWhy) — the
        # compiler never invents a turn (owner ruling 2026-09-05)
        yaw = float(parcel["yawDeg"])
        scale = float(parcel.get("scale", 1.0))   # uniform; a natural piece (a trunk) may be scaled, a kit piece rarely
        placements.append({
            "id": f"{bp_id}.{pid}.building",
            "parcelId": pid,
            "assetId": asset["id"],
            "kit": asset["kit"],
            # grid transform, centred pivot — never flora bottom-anchoring
            "positionM": [round(cx, 3), round(base_y + (asset["sizeM"][2] * scale / 2 if fit != "dug-in" else 0.0), 3), round(cz, 3)],
            "yawDeg": yaw,
            "scale": scale,
            "groundFit": fit,
            "provenance": _provenance(bp_id, seed, f"parcel-building/{fit}", asset["id"], []),
        })

        # 97 decision 4 / G18: an occupied shell or works mass is not a
        # finished place until its use leaves visible objects around it.  The
        # vocabulary belongs to the district's kit, while count/position are
        # deterministic functions of the blueprint seed and parcel id.
        count = dressing_count(seed, parcel)
        if count:
            vocabulary = shelf.dressing(culture)
            if not vocabulary:
                errors.append(f"{pid}: use {parcel.get('use')!r} requires {count} dressing objects, "
                              f"but kit set {culture!r} has no dressing[] vocabulary")
            radius = max((math.hypot(x - cx, z - cz) for x, z in foot_m), default=1.5) + 1.2
            phase = (_seed_int(seed, pid, "dressing-angle") % 3600) / 10.0
            for i in range(count if vocabulary else 0):
                # Repeat a tight local vocabulary.  Dressing density should
                # not explode the material budget merely because the source
                # kit offers dozens of plausible baskets and racks.
                local_vocab = vocabulary[:1]
                aid = local_vocab[_seed_int(seed, pid, str(i), "dressing-asset") % len(local_vocab)]
                prop = shelf.by_asset[aid]
                angle = math.radians(phase + i * (137.507764 + (i % 3) * 7.0))
                ring = radius + (i % 3) * 0.65
                px, pz = cx + math.sin(angle) * ring, cz + math.cos(angle) * ring
                py = survey.height_at(px, pz)
                placements.append({
                    "id": f"{bp_id}.{pid}.dressing.{i + 1}",
                    "parcelId": pid,
                    "dressingFor": parcel.get("use"),
                    "assetId": aid,
                    "kit": next((k for k, rows in shelf.assets_by_kit.items()
                                 if any(a["id"] == aid for a in rows)), None),
                    "positionM": [round(px, 3), round(py, 3), round(pz, 3)],
                    "yawDeg": round((phase + i * 71.0) % 360.0, 1),
                    "scale": 1.0,
                    "groundFit": "direct",
                    "provenance": _provenance(bp_id, seed,
                                               f"parcel-dressing/{parcel.get('use')}", aid, []),
                })
            dressing_report[pid] = count

    for dock in sorted(bp.get("docks", []), key=lambda d: d["id"]):
        x, z = survey.uv_to_m(*dock["position"])
        placements.append({
            "id": f"{bp_id}.{dock['id']}",
            "assetId": "dock-placeholder",
            "kit": None,
            "positionM": [round(x, 2), round(survey.height_at(x, z), 3), round(z, 2)],
            "yawDeg": 0.0,
            "piledToBed": True,
            "provenance": _provenance(bp_id, seed, "dock/skeleton", "dock-placeholder", []),
        })

    # --- door reachability, every compile -------------------------------
    doors_out: list[dict] = []
    for door in sorted(bp["doors"], key=lambda d: d["id"]):
        x, z = survey.uv_to_m(*door["thresholdUV"])
        # grid_px returns (row, col) = (z index, x index), and every other caller
        # in worldgen unpacks it in that order. Indexing [col, row] here sampled a
        # transposed pixel, so door reachability was measured at the wrong place.
        row, col = survey.grid_px(x, z)
        on_land = bool(survey.land[row, col])
        # local gradient from height samples 2 m either side of the threshold:
        # the 5.5 m slope raster reads a terrace lip as 40° where the walkable
        # fall is ~11° (Mazzatun, 2026-09-04)
        d = DOOR_SLOPE_SAMPLE_M
        gx = (survey.height_at(x + d, z) - survey.height_at(x - d, z)) / (2 * d)
        gz = (survey.height_at(x, z + d) - survey.height_at(x, z - d)) / (2 * d)
        slope = math.degrees(math.atan(math.hypot(gx, gz)))
        graded = any(g["parcelId"] == door["parcelId"] for g in grades)
        ok_slope = graded or slope <= DOOR_MAX_SLOPE_DEG
        cleared = _point_in_any(door["thresholdUV"], bp["clearance"].get("hardClear", []))
        boardwalk_access = _door_has_boardwalk_access(door, bp, survey)
        reachable = cleared and ((on_land and ok_slope) or boardwalk_access)
        if not reachable:
            errors.append(
                f"{door['id']}: unreachable (land={on_land}, slopeOk={ok_slope} "
                f"[{slope:.0f}°], boardwalkAccess={boardwalk_access}, inHardClear={cleared})"
            )
        doors_out.append({**door, "reachable": reachable,
                          "access": "boardwalk" if boardwalk_access else "land"})

    # --- layer integration (owner 2026-09-05): ways vs buildings, gates across
    # roads, doors onto ways, ways in the right medium ------------------------
    errors += check_integration(bp, survey)

    # --- the promise ledger (97 E9): everything the catalogue record promised
    # the player, against the objects that realise it. HARD from M3 up.
    promise_errors, promise_warnings, ledger = check_promises(bp)
    errors += promise_errors
    warns += promise_warnings

    macro_record = load_record(bp_id)
    obligation_receipt = None
    if macro_record is not None:
        obligation_receipt, obligation_errors = phase11_obligation_receipt(bp, macro_record)
        errors += obligation_errors

    # --- 97 B6/D2: does the first-seen object actually read from the approach?
    warns += _first_seen_warnings(bp, survey, shelf)

    # --- 97 B4/G8: horizontal relationship to the final water/flood section.
    # WARN only: this is design evidence, not a reason to suppress a compile.
    flood_report, flood_warnings = flood_band_report(bp, survey, kind_of)
    warns += flood_warnings

    # --- clearance masks for the scatter compiler -----------------------
    chunk_m = 462.0  # 16x16 chunks over the 7392 m province (see chunks meta)
    affected: set[tuple[int, int]] = set()
    for poly in bp["clearance"].get("hardClear", []) + bp["clearance"].get("thinned", []):
        for u, v in poly:
            x, z = survey.uv_to_m(u, v)
            affected.add((int(x // chunk_m), int(z // chunk_m)))

    # --- static budget report (0041 perf contract) ----------------------
    unique_assets = sorted({p["assetId"] for p in placements})
    materials: set[str] = set()
    tris = 0
    for p in placements:
        for kit_assets in ([shelf.assets_by_kit.get(p["kit"], [])] if p["kit"] else []):
            for a in kit_assets:
                if a["id"] == p["assetId"]:
                    materials.update(a.get("materials", []))
                    tris += a.get("triangles", 0)
    budget = bp["budget"]
    report = {
        "instances": len(placements),
        "uniqueAssets": len(unique_assets),
        "uniqueMaterials": len(materials),
        "triangles": tris,
        "colliderEstimate": len(placements),  # skeleton: one collider per placement
        "declared": budget,
        "withinBudget": (
            len(placements) <= budget["maxInstances"]
            and len(materials) <= budget["maxUniqueMaterials"]
            and len(placements) <= budget["maxColliders"]
        ),
    }
    if not report["withinBudget"]:
        errors.append(f"budget exceeded: {report}")

    return {
        "schemaVersion": SCHEMA_VERSION,
        "id": bp_id,
        "sourceBlueprintSha256": blueprint_sha256(bp),
        "seed": seed,
        "generator": {"id": GENERATOR_ID, "version": GENERATOR_VERSION},
        "placements": placements,
        "doors": doors_out,
        "grades": grades,
        "clearance": {
            "hardClear": bp["clearance"].get("hardClear", []),
            "thinned": bp["clearance"].get("thinned", []),
            "kept": bp["clearance"].get("kept", []),
            "affectedChunks": sorted(affected),
        },
        "budgetReport": report,
        "dressingReport": {
            "byParcel": dict(sorted(dressing_report.items())),
            "objects": sum(dressing_report.values()),
        },
        "floodBandReport": flood_report,
        "promiseLedger": [vars(pr) | {"met": pr.met} for pr in ledger],
        "phase11ObligationReceipt": obligation_receipt,
        "errors": errors,
        # WARN grade (module 97 §G): reported, never failing
        "warnings": warns,
    }


def _point_in_any(pt: list[float], polys: list[list[list[float]]]) -> bool:
    for poly in polys:
        n = len(poly)
        inside = False
        j = n - 1
        for i in range(n):
            xi, yi = poly[i]
            xj, yj = poly[j]
            if (yi > pt[1]) != (yj > pt[1]) and pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
        if inside:
            return True
    return False


def resolve_out(arg: str | None, bp_id: str) -> tuple[Path, Path]:
    """`(settlement file, directory the ledger goes in)` for a `--out` value.

    `--out` takes a DIRECTORY (write `<id>.settlement.json` into it) or a file
    path. Review 2026-09-07: a directory used to raise IsADirectoryError, and
    the promise ledger went to `output/settlements/` whatever `--out` said, so
    a throwaway run wrote into the tree. The ledger now follows the output.
    """
    if not arg:
        return OUT_DIR / f"{bp_id}.settlement.json", OUT_DIR
    target = Path(arg)
    if target.is_dir() or arg.endswith(("/", os.sep)) or not target.suffix:
        return target / f"{bp_id}.settlement.json", target
    return target, target.parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--blueprint", required=True)
    ap.add_argument("--skip-catalogue", action="store_true",
                    help="skip the blueprint-id-in-catalogue check (fixtures)")
    ap.add_argument("--out", default=None,
                    help="a file path, or a DIRECTORY to write <id>.settlement.json into; the promise "
                         "ledger is written beside it, so --out /tmp/x touches nothing in the tree")
    args = ap.parse_args()

    data = json.loads(Path(args.blueprint).read_text())
    bp = data["blueprint"]
    known = None if args.skip_catalogue else bp_mod.catalogue_ids()
    survey = ProvinceSurvey()
    schema_errors, schema_warnings = bp_mod.validate_blueprint_full(bp, known, survey)
    for w in schema_warnings:
        print(f"compile_settlement: WARN: {w}", file=sys.stderr)
    if schema_errors:
        for e in schema_errors:
            print(f"compile_settlement: schema: {e}", file=sys.stderr)
        return 1

    result = compile_blueprint(bp, survey, KitShelf(), schema_warnings)
    out, out_dir = resolve_out(args.out, bp["id"])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=1, sort_keys=True) + "\n")
    from .blueprint_promises import Promise, load_record
    rec = load_record(bp["id"])
    if rec is not None:
        ledger = [Promise(**{k: v for k, v in pr.items() if k != "met"})
                  for pr in result["promiseLedger"]]
        print(f"compile_settlement: promise ledger -> {write_ledger(bp['id'], rec, ledger, out_dir)}")
    for w in result["warnings"][len(schema_warnings):]:
        print(f"compile_settlement: WARN: {w}", file=sys.stderr)
    for e in result["errors"]:
        print(f"compile_settlement: {e}", file=sys.stderr)
    print(f"compile_settlement: {out} — {result['budgetReport']['instances']} placements, "
          f"{len(result['errors'])} errors, {len(result['warnings'])} warnings, budget {'OK' if result['budgetReport']['withinBudget'] else 'EXCEEDED'}")
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())

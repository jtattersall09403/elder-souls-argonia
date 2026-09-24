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
import re
import sys
from pathlib import Path

from . import blueprint as bp_mod
from . import blueprint_footprints as fp_mod
from . import parcel_kinds as pk_mod
from .site_fields import ProvinceSurvey, shared_survey
from .blueprint_integration import check_integration
from .blueprint_promises import check_promises, load_record, write_ledger
from . import place_obligations
from . import player_purpose as pp_mod
from . import terrain_requests
from . import vegetation_patches as sc_mod

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
# The kit manifest's placement policy -> the parcel ground fit it means
# (decision 0085: the record decides). One map for the compile, the pad
# grader and the exporter's authored-fit check.
POLICY_GROUND_FIT = {
    "direct": "direct", "plinth": "plinth", "pad": "pad",
    "stilt": "stilt", "dug-in": "dug-in",
    "interior-zero": "direct", "water-zero": "direct",
    "route-structure": "direct",
    # a piece resting on its host (the Telvanni connector on its tree): the
    # host supplies the datum, as for interior-zero (placement-policies.json)
    "deck": "direct",
}
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


def phase11_obligation_receipt(bp: dict, record: dict,
                               compiled_objects: list[dict]) -> tuple[dict, list[str]]:
    """Bind this compile to every Phase-11-owned macro obligation.

    Most rows point at the exact blueprint objects already checked by the
    blueprint and integration validators. Terrain requests instead point at
    their concrete, policy-validated terrain operation: a boardwalk near a
    promised cut is design evidence, but it is not the compiled cut.
    """
    obligations, errors = place_obligations.build_obligations(record, bp)
    owned = [row for row in obligations if row.deliveryOwner == "phase-11-compiled"]
    compiled_by_id: dict[str, dict] = {}
    for obj in compiled_objects:
        ref = obj.get("id") if isinstance(obj, dict) else None
        if not isinstance(ref, str) or not ref:
            errors.append(f"{record['id']}: compiled object has no stable id")
        elif ref in compiled_by_id:
            errors.append(f"{record['id']}: duplicate compiled object id {ref!r}")
        else:
            compiled_by_id[ref] = obj

    terrain_operations: dict[str, list[dict]] = {}
    for obj in compiled_objects:
        if obj.get("kind") == "terrain-operation":
            terrain_operations.setdefault(obj.get("terrainRequestKind"), []).append(obj)

    registry: dict[str, dict] = {}
    deliveries = []
    for obligation in owned:
        refs = list(obligation.phase11Evidence)
        if obligation.sourcePath.startswith("terrainRequests["):
            kind = obligation.sourcePath.split("[", 1)[1].split("]", 1)[0]
            operations = terrain_operations.get(kind, [])
            refs = [operation["id"] for operation in operations]
        for ref in refs:
            if ref not in registry:
                compiled = compiled_by_id.get(ref)
                if compiled is None:
                    errors.append(f"{record['id']}: phase-11 obligation {obligation.id} "
                                  f"uses object {ref!r} that the compiler did not emit")
                    continue
                registry[ref] = {
                    "kind": compiled.get("kind"),
                    "placeId": compiled.get("placeId"),
                    "compiledObjectSha256": _canonical_sha256(compiled),
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


def compiled_terrain_objects(record: dict, *, plan: dict | None = None,
                             fulfillment: dict | None = None,
                             postconditions: dict | None = None,
                             notes: list[str] | None = None) -> tuple[list[dict], list[str]]:
    """Compile catalogue terrain requests into the same final-object stream.

    Terrain operations are produced by a separate terrain pass, but the
    settlement receipt must bind the exact operation specification rather than
    treating an authored route near it as delivery.  Keeping these records in
    ``compiledObjects`` also lets the exporter verify the receipt without
    trusting the receipt's own private copy.

    A terrain request whose FINAL postcondition fails only because the shipped
    water solve does not yet deliver its depth/current/water relation is not a
    settlement defect and is not this compiler's to fix.  Those requests are
    already registered, by id and failing field, in
    ``world/sources/terrain/terrain-request-known-red.json`` and reported by
    name by ``terrain_request_postconditions``.  This compiler now consults the
    same register so one debt has one owner: a REGISTERED failure is appended
    to ``notes`` as ``KNOWN-RED``, never suppressed and never silent, while an
    UNREGISTERED failure stays a hard error exactly as before.  Digest
    staleness stays hard for both: that is identity, not water.
    """
    if not (record.get("terrainRequests") or []):
        return [], []
    supplied = any(value is not None for value in (plan, fulfillment, postconditions))
    if supplied and not all(value is not None for value in (plan, fulfillment, postconditions)):
        return [], [f"{record['id']}: terrain delivery needs plan, fulfillment and final postconditions"]
    if not supplied:
        from .compile_chunks import DEFAULT_HEIGHTS
        from .terrain_request_postconditions import PUBLISHED_DIR
        # The published copy under apps/world-studio/public/province/refined is
        # the artefact every consumer reads and the only one the postcondition
        # runner writes; the vault copy beside the heightfield is build scratch
        # that goes stale the moment the register or the water solve moves.
        # Read published-first (falling back to the vault only when a stage has
        # not published that artefact yet) so this compiler judges the same
        # evidence terrain_request_postconditions reported on.
        vault_dir = DEFAULT_HEIGHTS.parent

        def _evidence(name: str) -> Path:
            candidate = PUBLISHED_DIR / name
            return candidate if candidate.exists() else vault_dir / name

        paths = {
            "plan": _evidence("terrain-request-plan.json"),
            "fulfillment": _evidence("terrain-request-fulfillments.json"),
            "postconditions": _evidence("terrain-request-postconditions.json"),
        }
        missing = [str(path) for path in paths.values() if not path.exists()]
        if missing:
            return [], [f"{record['id']}: missing applied terrain evidence {', '.join(missing)}"]
        try:
            plan = json.loads(paths["plan"].read_text())
            fulfillment = json.loads(paths["fulfillment"].read_text())
            postconditions = json.loads(paths["postconditions"].read_text())
        except (OSError, json.JSONDecodeError) as exc:
            return [], [f"{record['id']}: cannot read applied terrain evidence: {exc}"]

    assert plan is not None and fulfillment is not None and postconditions is not None
    errors: list[str] = []
    if plan.get("kind") != "terrain-request-plan":
        errors.append(f"{record['id']}: terrain evidence has no compiled plan")
    errors += [f"{record['id']}: {error}"
               for error in terrain_requests.verify_fulfillment_manifest(plan, fulfillment)]
    report_payload = {key: value for key, value in postconditions.items()
                      if key not in {"schemaVersion", "kind", "status", "reportDigest"}}
    if (postconditions.get("kind") != "terrain-request-postconditions"
            or postconditions.get("reportDigest") != _canonical_sha256(report_payload)):
        errors.append(f"{record['id']}: final terrain postcondition report is stale or corrupt")
    if (postconditions.get("planDigest") != plan.get("planDigest")
            or postconditions.get("sourceDigest") != plan.get("sourceDigest")):
        errors.append(f"{record['id']}: final terrain postconditions do not match the applied plan")
    from .terrain_request_postconditions import KNOWN_RED_DOC, load_known_red
    known_red = load_known_red()
    _notes = notes if notes is not None else []
    # Which of THIS place's requests actually failed in the shipped report, and
    # are they all registered? Only then is the report-wide status explained.
    _failed_here = {row.get("requestId") for row in postconditions.get("requests", [])
                    if isinstance(row, dict) and row.get("status") != "pass"
                    and any(req.get("id") == row.get("requestId")
                            and req.get("placeId") == record["id"]
                            for req in plan.get("requests", []))}
    _unregistered = _failed_here - set(known_red)
    if postconditions.get("status") != "pass" and (_unregistered or not _failed_here):
        errors.append(f"{record['id']}: final terrain postconditions have not passed")

    local_plan, local_errors = terrain_requests.build_plan([record])
    errors += local_errors
    local_requests = {row["id"]: row for row in local_plan.get("requests", [])}
    requests = {row["id"]: row for row in plan.get("requests", [])
                if row.get("placeId") == record["id"]}
    if requests != local_requests:
        errors.append(f"{record['id']}: applied terrain plan does not match the exact current requests")
    operations = {row["requestId"]: row for row in plan.get("operations", [])
                  if row.get("placeId") == record["id"]}
    fulfillments = {row.get("requestId"): row for row in fulfillment.get("fulfillments", [])
                    if isinstance(row, dict) and row.get("requestId") in requests}
    results = {row.get("requestId"): row for row in postconditions.get("requests", [])
               if isinstance(row, dict) and row.get("requestId") in requests}
    for request_id, request in requests.items():
        if request_id not in operations:
            errors.append(f"{record['id']}: terrain request {request_id} has no compiled operation")
        if request_id not in fulfillments:
            errors.append(f"{record['id']}: terrain request {request_id} has no applied fulfillment")
        row = results.get(request_id)
        if not isinstance(row, dict) or row.get("status") != "pass":
            registered = known_red.get(request_id)
            if isinstance(row, dict) and registered:
                fields = ", ".join(registered.get("failingFields") or []) or "unstated fields"
                _notes.append(
                    f"{record['id']}: KNOWN-RED (water-owned, see {KNOWN_RED_DOC}) terrain request "
                    f"{request_id} still fails on {fields}")
            else:
                errors.append(
                    f"{record['id']}: terrain request {request_id} has no passing final postcondition")
        if row and row.get("deliverySha256") != terrain_requests.delivery_digest(request["delivery"]):
            errors.append(f"{record['id']}: terrain request {request_id} final delivery digest is stale")
    if errors:
        return [], list(dict.fromkeys(errors))

    out = []
    for request_id, request in sorted(requests.items()):
        operation = operations[request_id]
        applied = fulfillments[request_id]
        final = results[request_id]
        out.append({
            "id": operation["id"],
            "kind": "terrain-operation",
            "placeId": record["id"],
            "terrainRequestKind": request.get("kind"),
            "operation": operation,
            "appliedFulfillment": applied,
            "finalPostcondition": final,
            "evidenceDigests": {
                "plan": plan["planDigest"],
                "fulfillment": _canonical_sha256(fulfillment),
                "postconditions": postconditions["reportDigest"],
            },
            "provenance": _provenance(record["id"], "catalogue", "terrain-request",
                                        operation["id"], []),
        })
    return sorted(out, key=lambda row: row["id"]), []


def dressing_count(seed: str, parcel: dict) -> int:
    """97 decision 4: 3–6 objects at a dwelling, 6–12 at a works parcel."""
    use = str(parcel.get("use") or "").lower()
    bounds = DRESSING_COUNTS.get(use) or ((6, 12) if use in WORK_USES else None)
    if bounds is None:
        return 0
    lo, hi = bounds
    return lo + _seed_int(seed, parcel.get("id", ""), "dressing-count") % (hi - lo + 1)


def dressing_host_at(survey, x: float, z: float) -> bool:
    """Is there dry ground for a ring dressing prop to stand on here? The ring
    places ground props on the terrain (97 decision 4); a point the survey
    marks wet has no host, so the prop is dropped and counted (16h K6)."""
    row, col = survey.grid_px(x, z)
    return not bool(survey.wet_grid[row, col])


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
            # Only assets that can satisfy the runtime's three-tier LOD contract
            # are placeable. Throwaway sourcing probes are built with a single
            # lodRatio, so their assets have a two-tier chain and make
            # SettlementLayer's validateLodTriangles throw the moment the player
            # is close enough to draw one. `locate` scans kits alphabetically,
            # so `probe-enclosure`/`probe-gapfill` were beating `settlement-*`
            # and `underwater-v1` to assets those shipping kits also hold —
            # which blanked the studio at Mazzatun (2026-09-09, decision 0052).
            self.assets_by_kit[name] = [asset for asset in data["assets"]
                                        if len(asset.get("lodRatios") or []) >= 2]
            # by_asset stays complete: it is measurement (canopy heights, sizes),
            # not selection, and a probe kit is a legitimate measurement source.
            for asset in data["assets"]:
                self.by_asset.setdefault(asset["id"], asset)
        for path in sorted(config_dir.glob("*.json")):
            data = json.loads(path.read_text())
            vocab = data.get("dressing") or []
            if vocab:
                self.dressing_by_kit[data["id"]] = [str(v) for v in vocab]

    def kit_index(self) -> tuple[dict[str, str], dict[tuple[str, str], list[dict]]]:
        """(asset id -> the first kit holding it, in kit-name order;
        (kit, asset id) -> that kit's rows for the id), built from the shelf
        as it stands, once per compile rather than scanned per placement."""
        first: dict[str, str] = {}
        rows: dict[tuple[str, str], list[dict]] = {}
        for kit, assets in self.assets_by_kit.items():
            for a in assets:
                first.setdefault(a["id"], kit)
                rows.setdefault((kit, a["id"]), []).append(a)
        return first, rows

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

    def locate(self, asset_ref: str, preferred_kits: tuple[str, ...] = ()) -> dict | None:
        """Find an exact measured asset for a freestanding authored object.

        Landmarks and routed fences are not parcels, so they do not always
        belong to one district shelf.  Prefer any explicitly relevant kit,
        then use the first deterministic built-kit occurrence.  The asset id
        remains the identity; choosing a manifest only tells the runtime which
        packaged GLB to load.
        """
        order = list(dict.fromkeys([*preferred_kits, *sorted(self.assets_by_kit)]))
        for kit in order:
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


def record_ground_fit(asset: dict | None) -> str | None:
    """The ground fit a kit asset's reviewed placement policy names (None if
    the manifest carries no policy the map knows)."""
    policy = (((asset or {}).get("placement") or {}).get("evidence") or {}).get("policyId")
    return POLICY_GROUND_FIT.get(policy)


def with_record_ground_fits(bp: dict, shelf: "KitShelf") -> tuple[dict, list[str]]:
    """A copy of `bp` whose every parcel carries a groundFit.

    The kit record decides (decision 0085): a parcel that authors no
    `groundFit` takes the one its asset's manifest policy names; a modular run
    takes its pieces' fit, which must agree. An authored value is an override
    and is kept as written (the exporter checks it against the policy and its
    reviewed exception shelf). Unresolvable parcels come back as errors.
    """
    culture_of = {d["id"]: d["cultureKit"] for d in bp.get("districts", [])}
    kind_of = pk_mod.kinds_of(bp)
    errors: list[str] = []
    parcels: list[dict] = []
    for parcel in bp.get("parcels", []):
        if "groundFit" in parcel:
            parcels.append(parcel)
            continue
        pid = parcel.get("id")
        culture = culture_of.get(parcel.get("districtId"))
        if parcel.get("pieces") and "assetRef" not in parcel:
            fits = {record_ground_fit(shelf.find(culture, row["asset"],
                                                 kind_of.get(pid, "structure")))
                    for row in parcel["pieces"]}
        else:
            fits = {record_ground_fit(shelf.pick(culture, parcel.get("buildingFamily", ""),
                                                 f"{bp.get('seed')}:{pid}", parcel.get("assetRef"),
                                                 kind_of.get(pid, "building")))}
        if len(fits) != 1 or None in fits:
            errors.append(f"{pid}: no groundFit authored and its kit record gives "
                          f"{sorted(f or 'none' for f in fits)}; author one with its reason")
            parcels.append(parcel)
            continue
        parcels.append({**parcel, "groundFit": fits.pop()})
    return {**bp, "parcels": parcels}, errors


# --- kit geometry records: mounts, doorways, connectors, fronts -----------
# Every one of these is a READ of a mined record, never a guess from a name
# (owner 2026-09-04: what goes with what is read from the mod's own plugin
# data). The compile joins them onto the objects it emits so the exporter can
# ship them and the runtime can hang a child off its parent, bind a door to
# the doorway of the mesh it opens, and snap a piece to its neighbour.
MOUNTS_RECORD = REPO_ROOT / "world" / "sources" / "placement" / "kit-mounts-mined.json"
ASSEMBLIES_RECORD = REPO_ROOT / "world" / "sources" / "placement" / "kit-assemblies-mined.json"
# how far a door threshold may stand from the nearest doorway of the piece it
# opens before the door is bound to nothing: half a metre is the width of the
# leaf itself, so beyond it the door is not in the doorway.
DOOR_DOORWAY_MAX_M = 0.5
MOUNTED_CLASSES = ("wall", "hanging", "deck")


def mined_mounts(path: Path | None = None) -> dict[str, list[dict]]:
    """Mined parent/child mount pairs, keyed by CHILD asset id.

    Schema: the 16h shared contract (schemaVersion 2) — `{schemaVersion,
    pairs:[{kind, child, parent, offsetM (parent-local z-up), yawDeg,
    parentScale, n, evidence, ...}]}` where kind "band" adds alongAxis, outM,
    upM, alongMinM, alongMaxM and kind "points" adds points:[{offsetM, n,
    yawDeg}]; written by worldgen/mine_mounts.py (its docstring defines both). Missing file is an empty table: the compile then
    fails every mounted child by name rather than inventing a parent.
    """
    path = MOUNTS_RECORD if path is None else Path(path)
    if not path.exists():
        return {}
    data = json.loads(path.read_text())
    out: dict[str, list[dict]] = {}
    for pair in data.get("pairs") or []:
        child = pair.get("child")
        if isinstance(child, str):
            out.setdefault(child, []).append(pair)
    return out


def _kit_sidecar(kind: str, kits_dir: Path | None = None) -> dict[str, dict]:
    """`{asset id: record}` merged over every kit's `<kit>.<kind>.json`."""
    kits_dir = KITS_DIR if kits_dir is None else Path(kits_dir)
    out: dict[str, dict] = {}
    if not kits_dir.exists():
        return out
    for path in sorted(kits_dir.glob(f"*.{kind}.json")):
        data = json.loads(path.read_text())
        for asset_id, record in (data.get("assets") or {}).items():
            out.setdefault(asset_id, record)
    return out


def kit_interiors(kits_dir: Path | None = None) -> dict[str, dict]:
    """The interiors index by asset id — through `blueprint_interiors`, which
    already merges the tracked record with a local kit build and honours the
    runner's empty-pipeline override. Re-used rather than re-globbed here."""
    from .blueprint_interiors import InteriorLibrary
    return InteriorLibrary(kits_dir).by_asset


def kit_connectors(kits_dir: Path | None = None) -> dict[str, list]:
    return {k: v for k, v in _kit_sidecar("connectors", kits_dir).items()}


def piece_doorways(asset_id: str, interiors: dict[str, dict],
                   assemblies: dict[str, dict] | None = None) -> list[dict]:
    """Every measured doorway of a piece, in the piece's own plan frame.

    Two records hold them and they agree on the frame the connectors use
    (`positionInPiece`: x east, z south, on the pivot): the interiors index
    (`<kit>.interiors.json`: `entrance.offsetM` first, then
    `provenance[].offsetM` and the probe centre) and
    the assemblies mining (`kit-assemblies-mined.json`
    `doorwaysFromAssemblies[].doorways[].offsetLocalM`, whose first two
    components are the same plan offset). Deduplicated to a centimetre.
    """
    out: list[dict] = []
    seen: set[tuple[int, int]] = set()

    def add(offset, side, source, door_asset=None):
        if offset is None or len(offset) < 2:
            return
        x, z = float(offset[0]), float(offset[1])
        key = (round(x * 100), round(z * 100))
        if key in seen:
            return
        seen.add(key)
        out.append({"offsetInPieceM": [round(x, 3), round(z, 3)],
                    "sideDeg": (round(float(side), 1) if side is not None else None),
                    "source": source,
                    **({"doorAsset": door_asset} if door_asset else {})})

    record = interiors.get(asset_id) or {}
    # the canonical entrance first: it is the point `threshold_uv` sites the
    # threshold on, so the door binds to the same measured opening (K5)
    for row in [record.get("entrance") or {}] + list(record.get("provenance") or []):
        add(row.get("offsetM"), row.get("sideDeg"), f"interiors/{row.get('kind')}",
            row.get("doorAsset"))
    add(record.get("doorwayProbeCentreM"), None, "interiors/probe-centre")
    for row in ((assemblies or {}).get(asset_id) or {}).get("doorways") or []:
        add(row.get("offsetLocalM"), row.get("sideDeg"), "assembly", row.get("doorAsset"))
    return out


#: A neighbour whose pivot sits within this of a mined abuts pair's plan
#: offset (and yaw) meets that end (16h K7).
ABUTS_MATCH_M = 0.5
ABUTS_MATCH_DEG = 10.0
STRUCTURAL_CATEGORIES = ("architecture", "ruin", "dungeon-kit")


def mined_abuts(path: Path | None = None) -> dict:
    """The `abuts` section of `kit-assemblies-mined.json` (`worldgen.mine_abuts`):
    side-contact pairs, per-asset modular end faces and per-asset placed
    reference counts. Empty when the section has not been mined."""
    path = ASSEMBLIES_RECORD if path is None else Path(path)
    if not path.exists():
        return {}
    return json.loads(path.read_text()).get("abuts") or {}


def _offset_in(parent: dict, child: dict) -> tuple[float, float, float]:
    """The child placement in the parent's z-up UNIT frame (x, y north) and
    the relative yaw: the frame `mine_abuts` records its pairs in."""
    from .blueprint_integration import RUNTIME_YAW_SIGN
    dx = float(child["positionM"][0]) - float(parent["positionM"][0])
    dz = float(child["positionM"][2]) - float(parent["positionM"][2])
    theta = math.radians(RUNTIME_YAW_SIGN * float(parent["yawDeg"]))
    # inverse of blueprint_integration.runtime_world_xz
    lx = dx * math.cos(theta) - dz * math.sin(theta)
    lz = dx * math.sin(theta) + dz * math.cos(theta)
    scale = float(parent.get("scale") or 1.0)
    return lx / scale, -lz / scale, (float(child["yawDeg"]) - float(parent["yawDeg"])) % 360.0


def open_modular_ends(placements: list[dict], shelf: "KitShelf",
                      abuts: dict) -> list[dict]:
    """16h K7/K9: every modular end of a placed piece that faces nothing.

    A piece's modular ends are the faces the plugins butt against another
    piece (`abuts.endFaces`, piece and family evidence); an end is met when
    another parcel piece of the place stands where a mined pair puts it (a
    piece pair, or a family pair of the two pieces' families, relative scale
    matching; plan offset within ABUTS_MATCH_M, yaw within ABUTS_MATCH_DEG,
    either piece as the parent). K9 B: the first or last piece of a `pieces`
    run leaves its outward end open without a flag when the mine shows runs
    ending on that piece (or its family) with that face bare
    (`abuts.terminates` / `familyTerminates`). A structural kit piece that no
    plugin places at all (`abuts.placedAssets`) has no evidence of where its
    ends are: each of its measured connector faces is reported with
    `no-abuts-evidence`; one placed but in no pair (`abuts.placedNoPairs`) is
    reported the same way with `placed-no-pairs`. K10 ruling A: only RUN
    joints are ends (`endFaces` holds run faces only; a wall set back to back
    is a double joint) and only run pairs meet them. K10 ruling B: a piece in
    `abuts.singleUse` (placed, in no run pair, its family in no run joint
    anywhere) is never an open end: `single_use_pieces` reports it. Counted,
    never fatal here: the caller decides."""
    from .mine_abuts import family_of, joint_kind

    def is_run(q: dict) -> bool:
        return (q.get("joint") or joint_kind(q["parentFace"], q["childFace"],
                                             q["offsetM"])) == "run"
    pairs = [dict(q, _fam=False) for q in abuts.get("pairs") or [] if is_run(q)] + \
        [dict(q, _fam=True) for q in abuts.get("familyPairs") or [] if is_run(q)]
    single = set(abuts.get("singleUse") or [])
    ends = abuts.get("endFaces") or {}
    placed = abuts.get("placedAssets") or {}
    no_pairs = set(abuts.get("placedNoPairs") or [])
    terminates = abuts.get("terminates") or {}
    fam_terminates = abuts.get("familyTerminates") or {}
    connectors = kit_connectors()
    pieces = [p for p in placements if p.get("objectKind") == "parcel"]
    out = []

    def keyed(q: dict, a: dict, b: dict) -> tuple[str, str]:
        return ((family_of(a["assetId"]), family_of(b["assetId"])) if q["_fam"]
                else (a["assetId"], b["assetId"]))

    for p in pieces:
        aid = p["assetId"]
        if aid.startswith("composite:"):
            continue
        if aid in ends:
            run = p.get("run") or {}
            terminal = bool(run) and run.get("index") in (0, run.get("length", 0) - 1)
            for face in ends[aid]:
                met = False
                for q in pieces:
                    if q is p:
                        continue
                    for pair in pairs:
                        rel = float(pair.get("relScale", 1.0))
                        if keyed(pair, p, q) == (pair["parent"], pair["child"]) \
                                and pair["parentFace"] == face:
                            ox, oy, yaw = _offset_in(p, q)
                            scale = float(q.get("scale") or 1.0) / float(p.get("scale") or 1.0)
                        elif keyed(pair, q, p) == (pair["parent"], pair["child"]) \
                                and pair["childFace"] == face:
                            ox, oy, yaw = _offset_in(q, p)
                            scale = float(p.get("scale") or 1.0) / float(q.get("scale") or 1.0)
                        else:
                            continue
                        if abs(scale - rel) > 0.05 + 1e-9:
                            continue
                        d = math.hypot(ox - pair["offsetM"][0], oy - pair["offsetM"][1])
                        dyaw = abs((yaw - pair["yawDeg"] + 180.0) % 360.0 - 180.0)
                        if d <= ABUTS_MATCH_M and dyaw <= ABUTS_MATCH_DEG:
                            met = True
                            break
                    if met:
                        break
                if met:
                    continue
                if terminal and ((terminates.get(aid) or {}).get(face)
                                 or (fam_terminates.get(family_of(aid)) or {}).get(face)):
                    continue
                out.append({"placementId": p["id"], "assetId": aid, "face": face,
                            "reason": "faces-nothing"})
            continue
        row = shelf.by_asset.get(aid) or {}
        if aid in single:
            continue
        if row.get("category") in STRUCTURAL_CATEGORIES and (aid not in placed or aid in no_pairs):
            reason = "placed-no-pairs" if aid in placed else "no-abuts-evidence"
            for c in connectors.get(aid) or []:
                out.append({"placementId": p["id"], "assetId": aid,
                            "face": c.get("face"), "reason": reason})
    return sorted(out, key=lambda r: (r["placementId"], str(r["face"])))


def single_use_pieces(placements: list[dict], abuts: dict) -> list[dict]:
    """16h K10 ruling B: parcel pieces the plugins only ever stand alone
    (`abuts.singleUse`): information for the reader, never an open end."""
    single = set(abuts.get("singleUse") or [])
    return sorted(({"placementId": p["id"], "assetId": p["assetId"]}
                   for p in placements
                   if p.get("objectKind") == "parcel" and p["assetId"] in single),
                  key=lambda r: r["placementId"])


def assembly_doorways(path: Path | None = None) -> dict[str, dict]:
    path = ASSEMBLIES_RECORD if path is None else Path(path)
    if not path.exists():
        return {}
    return json.loads(path.read_text()).get("doorwaysFromAssemblies") or {}


def _plan_footprint_m(asset: dict, position, yaw_deg: float, scale: float):
    """The asset's measured LOD0 bounds as a world plan polygon (x, z metres).

    Same construction as the exporter's `_bounds_footprint`: the pivot sits at
    `originOffsetM` inside the bounds, and the piece is turned by its yaw in
    the repo's placement convention (local y maps to world z).
    """
    size = asset.get("sizeM") or [0.0, 0.0, 0.0]
    origin = asset.get("originOffsetM") or [0.0, 0.0, 0.0]
    x0, z0 = -origin[0] * scale, -origin[1] * scale
    x1, z1 = (size[0] - origin[0]) * scale, (size[1] - origin[1]) * scale
    angle = math.radians(float(yaw_deg))
    c, s_ = math.cos(angle), math.sin(angle)
    return [[position[0] + x * c - z * s_, position[2] + x * s_ + z * c]
            for x, z in ((x0, z0), (x1, z0), (x1, z1), (x0, z1))]


def _designed_sink_m(asset: dict) -> float:
    """The p50 of the asset's measured designed sink; 0 if it has none (the
    export refuses such an asset by name, so the compile does not invent one)."""
    sink = asset.get("designedSinkM")
    if isinstance(sink, dict) and isinstance(sink.get("p50"), (int, float)):
        return float(sink["p50"])
    return 0.0


def assembly_placements(bp_id: str, seed: str, parcel: dict, building: dict,
                        shelf: "KitShelf", survey, errors: list[str]) -> list[dict]:
    """A parcel's authored `assembly` (blueprint.assembly_failures), realised
    exactly as recorded: each member at its pose in the parcel's frame.
    `on: parent` members are mounted children of the shell's placement:
    `mountOffsetM` is (x, up, z) in the shell's own frame and `yawDeg` /
    `pitchDeg` are RELATIVE to the shell, which is what the runtime composes
    (anchoring.ts `mountedTransform`: parent matrix x offset x own turn).
    `on: ground` members are seated on the terrain by their own designed
    sink over their own bounds outline, like any ground piece."""
    out = []
    cx, _cy, cz = building["positionM"]
    yaw = float(building["yawDeg"])
    scale = float(building.get("scale", 1.0))
    for n, member in enumerate(parcel.get("assembly") or []):
        asset = shelf.locate(member["asset"])
        if asset is None:
            errors.append(f"{parcel['id']}: assembly[{n}] {member['asset']} is in no built kit")
            continue
        lx, lz = (float(v) for v in member["atM"])
        (dx, dz), = fp_mod.rotate_m([(lx, lz)], yaw)
        wx, wz = cx + dx, cz + dz
        # a hung piece is drawn at its shell's scale (no child scale at runtime)
        m_scale = scale if member["on"] == "parent" else float(member.get("scale", 1.0))
        row = {"id": f"{bp_id}.{parcel['id']}.assembly.{member['id']}", "parcelId": parcel["id"],
               "objectKind": "assembly", "assetId": asset["id"], "kit": asset["kit"],
               "scale": m_scale, "groundFit": asset_fit(asset) or "direct",
               "layer": member["layer"], "evidence": member["evidence"],
               "provenance": _provenance(bp_id, seed, f"parcel-assembly/{member['layer']}",
                                         asset["id"], [])}
        if member["on"] == "parent":
            up = float(member["upM"])
            row.update({"positionM": [round(wx, 3), round(building["positionM"][1] + up, 3),
                                      round(wz, 3)],
                        "yawDeg": round(float(member.get("yaw", 0.0)) % 360.0, 3),
                        "parentPlacementId": building["id"],
                        "mountOffsetM": [round(lx / scale, 4), round(up / scale, 4),
                                         round(lz / scale, 4)],
                        "footprintM": []})
        else:
            m_yaw = (yaw + float(member.get("yaw", 0.0))) % 360.0
            ground = survey.height_at(wx, wz) - _designed_sink_m(asset) * m_scale
            row.update({"positionM": [round(wx, 3), round(ground, 3), round(wz, 3)],
                        "yawDeg": round(m_yaw, 3),
                        "footprintM": [[round(x, 3), round(z, 3)] for x, z in _plan_footprint_m(
                            asset, [wx, 0.0, wz], m_yaw, m_scale)]})
        if "pitch" in member:
            row["pitchDeg"] = float(member["pitch"])
        out.append(row)
    return out


def _parent_local_offset(parent: dict, parent_asset: dict, child: dict,
                         child_asset: dict) -> list[float]:
    """Seat a deck child on the parent's TOP FACE, in the parent's local frame.

    The runtime (anchoring.mountedTransform) applies this offset in the
    parent's final world frame, y up, after the parent's own rotation — so the
    world delta is turned back through the parent's yaw here, and the vertical
    component is the parent's top face minus the child's own designed sink.
    """
    yaw = math.radians(float(parent.get("yawDeg", 0.0)))
    dx = float(child["positionM"][0]) - float(parent["positionM"][0])
    dz = float(child["positionM"][2]) - float(parent["positionM"][2])
    c, s_ = math.cos(yaw), math.sin(yaw)
    lx = dx * c + dz * s_
    lz = -dx * s_ + dz * c
    p_scale = float(parent.get("scale", 1.0))
    c_scale = float(child.get("scale", 1.0))
    p_size = parent_asset.get("sizeM") or [0.0, 0.0, 0.0]
    p_origin = parent_asset.get("originOffsetM") or [0.0, 0.0, 0.0]
    top_above_pivot = (float(p_size[2]) - float(p_origin[2])) * p_scale
    ly = top_above_pivot - _designed_sink_m(child_asset) * c_scale
    return [round(lx, 3), round(ly, 3), round(lz, 3)]


def mount_children(bp_id: str, placements: list[dict], shelf: "KitShelf",
                   mounts: dict[str, list[dict]]) -> list[str]:
    """Seat every wall/hanging/deck child on what it actually meets (16h item 2).

    `wall` and `hanging` REQUIRE a mined parent/child pair
    (`kit-mounts-mined.json`) and a parent placed here: a lantern or a rafter
    hangs off a piece its makers hung it off, or it is a named compile error —
    never a quiet drop onto the terrain.

    `deck` is different: a deck piece stands on a raised surface. If a placed
    parent's plan footprint contains the child's pivot, the child is seated on
    that parent's TOP FACE at the child's own designed sink; if nothing is
    under it, it is grounded on the terrain exactly like an anchorClass
    `ground` piece (`parentPlacementId` null, no mount offset).

    A mined offset is measured in the parent's local Z-UP frame (x east,
    y north, z up, `mine_assemblies.local_offset`), while the runtime applies
    it in the placement frame (x, UP, z). The axes are swapped here, at the
    one point where the mined record enters the runtime contract.
    """
    errors: list[str] = []
    by_asset = shelf.by_asset
    placed_assets = sorted({row.get("assetId") for row in placements if row.get("assetId")})
    with_asset = [row for row in placements if row.get("assetId")]
    for placement in sorted(placements, key=lambda row: row["id"]):
        if placement.get("objectKind") == "assembly":
            continue      # authored in the workbench: its pose IS the record
        asset = by_asset.get(placement.get("assetId") or "")
        anchor_class = (asset or {}).get("anchorClass")
        if anchor_class not in MOUNTED_CLASSES:
            continue
        placement["anchorClass"] = anchor_class
        others = [row for row in with_asset if row is not placement]
        if anchor_class == "deck":
            px, _py, pz = placement["positionM"]
            carriers = []
            for row in others:
                row_asset = by_asset.get(row["assetId"])
                if not row_asset or not row_asset.get("sizeM"):
                    continue
                if by_asset.get(row["assetId"], {}).get("anchorClass") in ("wall", "hanging"):
                    continue
                poly = _plan_footprint_m(row_asset, row["positionM"],
                                         row.get("yawDeg", 0.0), float(row.get("scale", 1.0)))
                if _point_in_polygon_uv(px, pz, poly):
                    size = row_asset["sizeM"]
                    carriers.append((size[0] * size[1], row["id"], row, row_asset))
            if not carriers:
                # Nothing under it: the terrain is its ground line.
                placement["parentPlacementId"] = None
                continue
            _area, _id, parent, parent_asset = min(carriers, key=lambda c: (c[0], c[1]))
            placement["parentPlacementId"] = parent["id"]
            placement["mountOffsetM"] = _parent_local_offset(
                parent, parent_asset, placement, asset)
            placement["mountEvidence"] = "footprint-containment"
            continue
        pairs = mounts.get(placement["assetId"]) or []
        parents_by_asset: dict[str, list[dict]] = {}
        for row in others:
            parents_by_asset.setdefault(row["assetId"], []).append(row)
        candidates = [(pair, parent) for pair in pairs
                      for parent in parents_by_asset.get(pair.get("parent") or "", [])]
        if not candidates:
            errors.append(
                f"{placement['id']}: {placement['assetId']} is anchorClass "
                f"{anchor_class!r} and must hang off a parent, but no mined mount pair "
                f"({MOUNTS_RECORD.name}) joins it to any piece placed here "
                f"(placed assets: {', '.join(placed_assets)})")
            continue
        px, _py, pz = placement["positionM"]
        pair, parent = min(candidates, key=lambda cp: (
            math.hypot(cp[1]["positionM"][0] - px, cp[1]["positionM"][2] - pz), cp[1]["id"]))
        offset = [float(v) for v in (pair.get("offsetM") or [0.0, 0.0, 0.0])]
        placement["parentPlacementId"] = parent["id"]
        # mined (east, north, up) -> runtime (x, up, z)
        placement["mountOffsetM"] = [round(offset[0], 3), round(offset[2], 3),
                                     round(offset[1], 3)]
        placement["mountEvidence"] = pair.get("evidence", "plugin")
        placement["yawDeg"] = round((float(parent.get("yawDeg", 0.0))
                                     + float(pair.get("yawDeg", 0.0))) % 360.0, 1)
    return errors


def bind_doors_to_doorways(bp: dict, doors_out: list[dict], placements: list[dict],
                           survey, interiors: dict[str, dict],
                           assemblies: dict[str, dict]) -> list[str]:
    """A door is the doorway of the MESH it opens, not a point on the polygon.

    The authored `thresholdUV` sites the door; the compiled `thresholdM` and
    `facingDeg` come from the nearest measured doorway of the piece placed on
    that parcel, put into the world through the parcel's centre and yaw. A
    threshold further than DOOR_DOORWAY_MAX_M from any doorway of its own
    piece is a hard error: the door opens a wall.
    """
    from .blueprint_integration import runtime_world_xz

    errors: list[str] = []
    by_parcel = {row["parcelId"]: row for row in placements
                 if row.get("objectKind") == "parcel" and row.get("parcelId")}
    for door in doors_out:
        parcel_id = door.get("parcelId")
        placement = by_parcel.get(parcel_id)
        if placement is None:
            continue           # a door on a parcel that failed to place is already an error
        doorways = piece_doorways(placement["assetId"], interiors, assemblies)
        if not doorways:
            door["doorwaySource"] = "none-measured"
            continue
        cx, _cy, cz = placement["positionM"]
        yaw = float(placement.get("yawDeg", 0.0))
        tx, tz = survey.uv_to_m(*door["thresholdUV"])
        best = None
        for doorway in doorways:
            wx, wz = runtime_world_xz((cx, cz), yaw, doorway["offsetInPieceM"])
            gap = math.hypot(wx - tx, wz - tz)
            if best is None or gap < best[0]:
                best = (gap, wx, wz, doorway)
        gap, wx, wz, doorway = best
        if gap > DOOR_DOORWAY_MAX_M:
            errors.append(
                f"{door['id']}: threshold stands {gap:.2f} m from the nearest measured "
                f"doorway of {placement['assetId']} (limit {DOOR_DOORWAY_MAX_M:.2f} m); a door "
                f"is the doorway of the piece it opens, not a point on the parcel polygon")
            continue
        door["thresholdM"] = [round(wx, 3), round(wz, 3)]
        # 16h K6: the exporter re-derives thresholdM from thresholdUV, so the
        # UV is re-derived from the bound doorway: the published door is the
        # doorway of the placed piece, never the authored point beside it
        door["thresholdUV"] = [round(wx / survey.extent_m, 9), round(wz / survey.extent_m, 9)]
        door["doorwayGapM"] = round(gap, 3)
        door["doorwaySource"] = doorway["source"]
        if doorway.get("sideDeg") is not None:
            door["facingDeg"] = round((yaw + float(doorway["sideDeg"])) % 360.0, 1)
    return errors


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
    # 0066: every water fact this report states is a READ of the water record.
    # The flood band is the graph `band` of the reach under the cell
    # (`ProvinceSurvey.reach_band_grid`), never the purged `survey.flood`
    # raster; and every wet sample names the entity it is wet because of, so
    # a finding can be argued against the body or reach by id.
    entities: dict[str, dict] = {}

    def _note_entity(rec: dict | None, why: str) -> None:
        if rec is None:
            return
        row = entities.setdefault(rec["entityId"], {
            "entityId": rec["entityId"], "kind": rec.get("kind"),
            "levelM": rec.get("levelM"), "samples": 0, "why": set()})
        row["samples"] += 1
        row["why"].add(why)

    def _band_of(rec: dict | None) -> int:
        """The RECORD's flood band: a reach's graph `band`, 0 off a reach.

        Read from `hydrology-graph.json` by id, never from the resampled
        `reach_band_grid` — the band raster is nearest-resampled onto the
        analysis grid, so a coarse cell could report a band that the id raster
        does not put any reach under, and the fact would then have no record
        to name (0066).
        """
        if rec is None:
            return 0
        reach = survey.reach(rec["entityId"])
        return int((reach or {}).get("band") or 0)

    for index, (u, v) in enumerate(samples):
        x, z = survey.uv_to_m(u, v)
        row, col = survey.grid_px(x, z)
        rec = survey.water_entity_at(x, z)
        is_open = bool(survey.open_water[row, col])
        band = _band_of(rec)
        wr = min(max(int(z / wet_px_m), 0), wet_n - 1)
        wc = min(max(int(x / wet_px_m), 0), wet_n - 1)
        is_wet = bool(survey.wet_season[wr, wc])
        open_count += int(is_open)
        flood_count += int(band > 0)
        wet_count += int(is_wet)
        max_flood = max(max_flood, band)
        # A recorded body or reach UNDER the footprint is itself the water
        # fact the 16g scope rule asks about ("touches a recorded body, reach
        # or flood band by id"), whether or not this particular sample is over
        # the dry-season line. The reasons say which of the three it is.
        if rec is not None:
            why = ("open-water" if is_open else
                   "flood-band" if band > 0 else
                   "wet-season" if is_wet else "recorded-extent")
            _note_entity(rec, why)
        if index == 0:  # centre is deliberately the first sample
            centre_open, centre_flood, centre_wet = is_open, band, is_wet
    count = len(samples)
    water_entities = [dict(row, why=sorted(row["why"]))
                      for row in sorted(entities.values(), key=lambda r: r["entityId"])]
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
        # the record behind every wet sample above (0066), so a parcel's water
        # fact can be joined to the body or reach that causes it
        "waterEntities": water_entities,
        "waterEntityIds": [row["entityId"] for row in water_entities],
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
        # SCOPE: the stilt share rule is about a district built OVER water, so
        # it applies only where the district reaches the water at all. Lilmoth's
        # council-crown and hist-court are `argonian-stilt` by culture kit but
        # stand on the 11-13 m bench and the 19-23 m crest, and every building
        # in them measures 0 open-water, 0 flood-band and 0 wet-season samples.
        # Requiring 15-30 % of a hilltop district to be over open water is a
        # rule applied by LABEL where it should be applied by measured ground —
        # the same defect this province has now found in half a dozen places.
        # A district out of the water is reported as `applicable: false`, by
        # name, never silently: if a stilt district turns out to stand nowhere
        # near water, that is worth someone looking at, just not as a flood
        # finding.
        # SCOPE BY ID (16g ruling, binding): "touches water" means a parcel of
        # this district stands on a RECORDED body, reach or flood band, named
        # by its graph id. A measured wet texel with no entity behind it is not
        # a water fact the record will defend (0066), so it cannot pull a
        # district into the rule.
        district_water = sorted({eid for pid in building_ids
                                 for eid in by_id[pid]["waterEntityIds"]})
        touches_water = bool(district_water)
        if kit == "argonian-stilt" and share is not None and touches_water:
            rule = {"id": "argonian-stilt-open-water-share", "min": 0.15, "max": 0.30,
                    "waterEntityIds": district_water}
            conforms = 0.15 <= share <= 0.30
            if not conforms:
                warnings.append(
                    f"{bp_id}: 97 B4/G8 — district {did} has {len(over_ids)}/{len(building_ids)} "
                    f"buildings over open water ({share * 100:.1f}%); argonian-stilt requires 15–30% "
                    f"(district stands on {', '.join(district_water)})"
                )
        elif kit == "argonian-stilt" and share is not None:
            rule = {"id": "argonian-stilt-open-water-share", "min": 0.15, "max": 0.30,
                    "applicable": False,
                    "waterEntityIds": [],
                    "why": "no building in this district stands on a recorded body, "
                           "reach or flood band (0066: no water entity id under any "
                           "footprint), so it is not built over water and the share "
                           "rule has nothing to measure"}
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
            # SCOPE BY ID (16g ruling, binding): the quay rule is written for a
            # works parcel ON the water. A works parcel whose footprint stands
            # on no recorded body, reach or flood band is a works parcel inland
            # (a sap-tapping stage on a jungle terrace), and a quay rule has
            # nothing to say about it. Reported by name, never silently.
            if not actual["waterEntityIds"]:
                section_rules.append({
                    "parcelId": pid, "districtId": parcel.get("districtId"),
                    "use": use, "rule": rule_id,
                    "expected": "footprint stands on a recorded body, reach or flood band",
                    "applicable": False, "waterEntityIds": [],
                    "why": "no water entity id under this footprint, so this works "
                           "parcel is inland and the quay rule is out of scope",
                    "conforms": None,
                })
                continue
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
            "waterEntityIds": actual["waterEntityIds"],
            "conforms": conforms,
        })
        if not conforms:
            warnings.append(
                f"{bp_id}: 97 B4/G8 — parcel {pid} ({use}) fails {rule_id}; "
                f"open-water samples {actual['openWaterSamples']}/{actual['sampleCount']}, "
                f"flood-band samples {actual['floodBandSamples']}/{actual['sampleCount']}, "
                f"wet-season samples {actual['wetSeasonInundatedSamples']}/{actual['sampleCount']}"
                + (f"; water entities {', '.join(actual['waterEntityIds'])}"
                   if actual["waterEntityIds"] else "; no water entity under the footprint")
            )

    report = {
        "sampling": {
            "points": "all finest-grid cell centres inside footprint + centre/vertices/edge midpoints",
            "openWater": "ProvinceSurvey.open_water",
            "floodBand": "the graph `band` of the reach under the cell, read from "
                         "hydrology-graph.json by id; any non-zero band is exposed",
            "wetSeason": "ProvinceSurvey.wet_season",
            "entityIds": "ProvinceSurvey.water_entity_at: the graph body/reach "
                         "under every wet sample, by id and kind (0066)",
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


# Graph kinds a settlement water fact may name. A fact that names an entity
# the graph does not hold as a reach or a body, or whose kind has moved under
# us, is a JOIN FAILURE, not a placement finding: the compile stops rather
# than reporting a water fact nobody can argue with (0066).
def water_fact_errors(flood_report: dict, doors_out: list[dict],
                      survey: ProvinceSurvey) -> list[str]:
    """Every water fact this compile states must join to the graph by id.

    HARD. A parcel measured wet with no entity under it, or a fact naming an
    entity that is neither a reach nor a body in `hydrology-graph.json`, or
    whose kind disagrees with the record's, fails the compile.
    """
    out: list[str] = []

    def _check(owner: str, entity_id: str | None, kind, why: str) -> None:
        if not entity_id:
            out.append(f"{owner}: 0066 — {why}, but no water entity id joins to it; a water "
                       f"fact the record cannot name is not a fact")
            return
        record = survey.reach(entity_id) or survey.body(entity_id)
        if record is None:
            out.append(f"{owner}: 0066 — names water entity {entity_id}, which is neither a "
                       f"reach nor a body in the hydrology graph")
            return
        recorded = record.get("kind")
        if kind is not None and recorded is not None and str(kind) != str(recorded):
            out.append(f"{owner}: 0066 — names water entity {entity_id} as {kind!r}, but the "
                       f"graph records it as {recorded!r}")

    for parcel in flood_report.get("parcels", []):
        pid = parcel.get("parcelId")
        if parcel.get("touchesFloodSection") and not parcel.get("waterEntityIds"):
            _check(str(pid), None, None,
                   f"{parcel.get('openWaterSamples')} open-water, "
                   f"{parcel.get('floodBandSamples')} flood-band and "
                   f"{parcel.get('wetSeasonInundatedSamples')} wet-season samples")
        for row in parcel.get("waterEntities", []):
            _check(str(pid), row.get("entityId"), row.get("kind"), "")
    for door in doors_out:
        if door.get("waterEntityId"):
            _check(str(door.get("id")), door["waterEntityId"], door.get("waterEntityKind"), "")
    return out


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


def _polyline_point(points: list[tuple[float, float]], distance_m: float) \
        -> tuple[float, float, float]:
    """Return x, z and clockwise-from-north bearing at a chainage."""
    remaining = max(0.0, distance_m)
    for (ax, az), (bx, bz) in zip(points, points[1:]):
        length = math.hypot(bx - ax, bz - az)
        if length <= 1e-9:
            continue
        if remaining <= length:
            t = remaining / length
            return (ax + (bx - ax) * t, az + (bz - az) * t,
                    math.degrees(math.atan2(bx - ax, bz - az)) % 360.0)
        remaining -= length
    ax, az = points[-2]
    bx, bz = points[-1]
    return bx, bz, math.degrees(math.atan2(bx - ax, bz - az)) % 360.0


def _place_fence(bp_id: str, seed: str, fence: dict, survey: ProvinceSurvey,
                 shelf: KitShelf) -> tuple[list[dict], list[str]]:
    """Tile the measured fence piece along the compiler-approved routed line."""
    asset = shelf.locate(fence.get("assetRef", ""))
    if asset is None:
        return [], [f"{fence.get('id')}: assetRef {fence.get('assetRef')!r} is not in a built kit"]
    points = [survey.uv_to_m(float(u), float(v)) for u, v in fence.get("points", [])]
    if len(points) < 2:
        return [], [f"{fence.get('id')}: routed points were not compiled"]
    total = sum(math.hypot(bx - ax, bz - az)
                for (ax, az), (bx, bz) in zip(points, points[1:]))
    module = float(fence.get("moduleM") or max(asset.get("sizeM") or [1.0, 1.0, 1.0])[:2])
    count = max(1, int(math.ceil(total / module)))
    placements = []
    for index in range(count):
        chainage = min((index + 0.5) * module, max(total - module * 0.5, total * 0.5))
        x, z, yaw = _polyline_point(points, chainage)
        placements.append({
            "id": f"{bp_id}.{fence['id']}.piece.{index + 1}",
            "fenceId": fence["id"],
            "objectKind": "fence",
            "assetId": asset["id"], "kit": asset["kit"],
            "positionM": [round(x, 3), round(survey.height_at(x, z), 3), round(z, 3)],
            "yawDeg": round(yaw, 3), "scale": 1.0, "groundFit": "direct",
            "provenance": _provenance(bp_id, seed, "fence/routed-piece", asset["id"], []),
        })
    return placements, []


def _metres_value(value, survey: ProvinceSurvey):
    if not isinstance(value, list):
        return value
    if len(value) == 2 and all(isinstance(part, (int, float)) for part in value):
        return [round(part, 3) for part in survey.uv_to_m(float(value[0]), float(value[1]))]
    return [_metres_value(child, survey) for child in value]


def _kit_geometry(linked: list[dict], interiors: dict[str, dict],
                  connectors: dict[str, list], assemblies: dict[str, dict]) -> dict:
    """Connectors, front and doorways of the FIRST placement of an object.

    World positions come through `runtime_world_xz`, the mirror of the
    runtime's own transform, so what the exporter ships is where the runtime
    will draw it — not a second convention that has to be kept in step.
    """
    from .blueprint_integration import runtime_world_xz

    if not linked:
        return {}
    placement = linked[0]
    asset_id = placement.get("assetId") or ""
    cx, _cy, cz = placement.get("positionM") or (0.0, 0.0, 0.0)
    yaw = float(placement.get("yawDeg", 0.0))
    out: dict = {}
    faces = connectors.get(asset_id) or []
    if faces:
        out["connectors"] = [
            {"face": face.get("face"), "evidence": face.get("evidence"),
             "positionM": [round(v, 3) for v in
                           runtime_world_xz((cx, cz), yaw, face["positionInPiece"])],
             "normalDeg": round((yaw + float(face.get("normalDeg", 0.0))) % 360.0, 1),
             "widthM": face.get("widthM"), "heightM": face.get("heightM")}
            for face in faces]
    from .blueprint_interiors import front as _front
    front = _front(interiors.get(asset_id))
    # the index's front block states the side in the piece's own frame as
    # `deg` (an `evidence`/`why` pair says how it was measured)
    if isinstance(front, dict) and front.get("deg") is not None:
        out["frontDeg"] = round((yaw + float(front["deg"])) % 360.0, 1)
        out["frontWhy"] = front.get("why") or front.get("evidence")
    doorways = piece_doorways(asset_id, interiors, assemblies)
    if doorways:
        out["doorways"] = [
            {**doorway,
             "positionM": [round(v, 3) for v in
                           runtime_world_xz((cx, cz), yaw, doorway["offsetInPieceM"])],
             "facingDeg": (round((yaw + float(doorway["sideDeg"])) % 360.0, 1)
                           if doorway.get("sideDeg") is not None else None)}
            for doorway in doorways]
    return out


def compiled_blueprint_objects(bp: dict, placements: list[dict], doors_out: list[dict],
                               survey: ProvinceSurvey, *,
                               interiors: dict[str, dict] | None = None,
                               connectors: dict[str, list] | None = None,
                               assemblies: dict[str, dict] | None = None
                               ) -> tuple[list[dict], list[str]]:
    """Emit the exact addressable objects that survived settlement compilation.

    This is deliberately not the authoring registry.  Spatial values are
    converted to runtime metres, door reachability is the compiler's measured
    result, and every object carrying an ``assetRef`` is absent (and an error)
    unless a matching physical placement was emitted.
    """
    # A parcel that authors no groundFit carries the one its placement
    # realised from the kit record (decision 0085), so the compile and the
    # exporter's re-derivation from the authored blueprint emit one record.
    fit_of = {raw["parcelId"]: raw["groundFit"] for raw in placements
              if isinstance(raw.get("parcelId"), str) and "groundFit" in raw}
    bp = {**bp, "parcels": [
        {**parcel, "groundFit": fit_of[parcel["id"]]}
        if "groundFit" not in parcel and parcel.get("id") in fit_of else parcel
        for parcel in bp.get("parcels", [])]}
    place_id = bp["id"]
    errors: list[str] = []
    placement_fields = {
        "parcels": "parcelId", "landmarks": "landmarkId",
        "fences": "fenceId", "docks": "dockId",
    }
    placements_by_ref: dict[str, list[dict]] = {}
    for raw in placements:
        for field in placement_fields.values():
            if isinstance(raw.get(field), str):
                placements_by_ref.setdefault(raw[field], []).append(raw)

    records: list[dict] = []

    def emit(source: dict, kind: str, *, measured: dict | None = None,
             physical: bool = False) -> None:
        ref = source.get("id") or source.get("slotId")
        if not isinstance(ref, str) or not ref:
            return
        # A skeleton marker (the current asset-less dock specification) is
        # useful to the compiler's spatial checks but is deliberately absent
        # from runtime geometry. Do not misreport it as a physical placement.
        linked = sorted((row for row in placements_by_ref.get(ref, []) if row.get("kit")),
                        key=lambda row: row["id"])
        if physical:
            asset_ref = source.get("assetRef")
            matches = [row for row in linked if row.get("assetId") == asset_ref and row.get("kit")]
            if not matches:
                errors.append(f"{ref}: asset-bearing compiled object has no matching physical placement")
                return
            linked = matches
        spec = {}
        for key, value in source.items():
            if key in {"id", "slotId", "why", "notes", "position", "centreUV",
                       "thresholdUV", "boundary", "via", "viaUV", "points", "footprint"}:
                continue
            spec[key] = value
        for source_key, target_key in (
                ("position", "positionM"), ("centreUV", "centreM"),
                ("thresholdUV", "thresholdM"), ("boundary", "boundaryM"),
                ("via", "viaM"), ("viaUV", "viaM"), ("points", "pointsM"),
                ("footprint", "footprintM")):
            if source_key in source:
                spec[target_key] = _metres_value(source[source_key], survey)
        if measured:
            spec.update(measured)
        # The kit geometry the exporter has to ship with the object: the
        # faces it was made to join on, the side the makers treated as its
        # front, and its doorways IN WORLD METRES under the placement that
        # realises it. Read from the measured records (connectors sidecar,
        # interiors index, assemblies mining), never inferred.
        geometry = _kit_geometry(linked, interiors or {}, connectors or {},
                                 assemblies or {})
        record = {
            "id": ref, "kind": kind, "placeId": place_id,
            "sourceObjectSha256": _canonical_sha256(source),
            "spec": spec,
            **geometry,
            "placementIds": [row["id"] for row in linked],
            "provenance": _provenance(place_id, str(bp.get("seed", "")),
                                        f"compiled-object/{kind}", ref, []),
        }
        records.append(record)

    collection_kinds = {
        "districts": "district", "parcels": "parcel", "routes": "route",
        "canals": "canal", "boardwalks": "boardwalk", "fences": "fence",
        "landmarks": "landmark", "docks": "dock", "combatSpaces": "combat",
        "questSockets": "socket", "variants": "variant",
        "travelServices": "travel", "approaches": "approach",
        "networkTerminals": "terminal",
    }
    for key, kind in collection_kinds.items():
        for source in sorted(bp.get(key, []) or [], key=lambda row: row.get("id", "")):
            emit(source, kind, physical=bool(source.get("assetRef")))

    measured_doors = {row.get("id"): row for row in doors_out}
    for source in sorted(bp.get("doors", []) or [], key=lambda row: row.get("id", "")):
        measured = measured_doors.get(source.get("id"))
        if measured is None:
            errors.append(f"{source.get('id')}: door was not emitted by the reachability compiler")
            continue
        emit(source, "door", measured={
            "reachable": bool(measured.get("reachable")),
            "access": measured.get("access"),
        })
    for source in sorted(bp.get("occupants", []) or [], key=lambda row: row.get("slotId", "")):
        emit(source, "occupant")
    for source in sorted((bp.get("clearance") or {}).get("kept", []) or [],
                         key=lambda row: row.get("id", "")):
        emit(source, str(source.get("id", "kept")).split(".", 1)[0])
    if bp.get("scaleGrounding"):
        emit({"id": f"field:{place_id}:scaleGrounding", "value": bp["scaleGrounding"]},
             "blueprint-field")
    for key, value in sorted((bp.get("causalModel") or {}).items()):
        if value:
            emit({"id": f"field:{place_id}:causalModel.{key}", "value": value},
                 "blueprint-field")

    ids = [row["id"] for row in records]
    duplicates = sorted({ref for ref in ids if ids.count(ref) > 1})
    if duplicates:
        errors.append(f"{place_id}: duplicate compiled object ids {duplicates}")
    return sorted(records, key=lambda row: row["id"]), errors


# --- 97 B3, the footing slope by fit (16h round 5, moved into the compile in K5)
#: The steepest analysis-grid cell a piece's derived footprint touches, by the
#: fit its published manifest records (`placement.evidence.policyId`). A direct
#: or pad footing is a floor laid on the ground; a stilt piece stands on legs
#: by design and takes a degree more. Any other fit (dug-in, plinth,
#: route-structure) carries no footing slope rule here.
FIT_SLOPE_LIMIT_DEG = {"direct": 2.0, "pad": 2.0, "stilt": 3.0}
#: quay and landing kits: their pieces stand on piles driven into the bank and
#: the water, so the building footing rule does not apply (16h round 6). Read
#: from the manifest that holds the placed asset, never from the asset's name.
SLOPE_EXEMPT_KITS = frozenset({"docks-v1"})

QUAY_RUN_PREFIX = "composite:docks/quay-run-"
QUAY_SHORE_SEARCH_M = 30.0
QUAY_SHORE_STEP_M = 0.05


def is_quay_run(asset: dict) -> bool:
    """A docks-v1 quay run: the shore-entry piece with its deck bays."""
    return str(asset.get("id", "")).startswith(QUAY_RUN_PREFIX)


def quay_run_ends_local(asset: dict, scale: float = 1.0) -> tuple[float, float]:
    """``(landward, seaward)`` plan-z of the run's two tips in the piece frame
    (x east, z south, on the pivot). The entry piece is the pivot and the
    bays run along its local -y (``compose.parts`` offsets), so the landward
    tip is the bounds' +y face and the seaward tip the -y face."""
    size_y = float(asset["sizeM"][1])
    offset_y = float(asset["originOffsetM"][1])
    return -(size_y - offset_y) * scale, offset_y * scale


def anchor_quay_run(asset: dict, centre_m: tuple[float, float], yaw_deg: float,
                    scale: float, survey) -> tuple[float, float, float] | None:
    """Slide a quay run along its own axis so its landward tip stands on the
    ground/water line (16h K6, owner check-in 1: the landing stage's landward
    end did not reach the land): ``(x, z, shift m)``, or None when the axis
    crosses no line within QUAY_SHORE_SEARCH_M of the tip. The line is the
    survey's wet grid edge, dry on the landward side; the nearest crossing to
    the authored tip wins. The run then extends over the water."""
    from .blueprint_integration import runtime_world_xz

    wet = survey.wet_grid
    landward, _seaward = quay_run_ends_local(asset, scale)

    def is_wet(t: float) -> bool:
        x, z = runtime_world_xz(centre_m, yaw_deg, (0.0, t))
        row, col = survey.grid_px(x, z)
        return bool(wet[row, col])

    steps = int(QUAY_SHORE_SEARCH_M / QUAY_SHORE_STEP_M)
    best = None
    for k in range(-steps, steps):
        t0 = landward + k * QUAY_SHORE_STEP_M
        if not is_wet(t0) and is_wet(t0 + QUAY_SHORE_STEP_M):
            line = t0 + QUAY_SHORE_STEP_M / 2
            if best is None or abs(line - landward) < abs(best - landward):
                best = line
    if best is None:
        return None
    shift = best - landward
    x, z = runtime_world_xz(centre_m, yaw_deg, (0.0, shift))
    return x, z, round(shift, 3)


def asset_fit(asset: dict) -> str | None:
    """The fit policy the published manifest records for this asset row."""
    return (((asset.get("placement") or {}).get("evidence") or {}).get("policyId"))


def fit_slope_failure(asset: dict, slope_deg: float,
                      limits: dict[str, float] = FIT_SLOPE_LIMIT_DEG) -> str | None:
    """Why this manifest row (carrying the `kit` that holds it) may not stand
    on `slope_deg`, or None."""
    if asset.get("kit") in SLOPE_EXEMPT_KITS:
        return None
    fit = asset_fit(asset)
    if fit not in limits:
        return None
    if slope_deg >= limits[fit]:
        return (f"{fit} fit stands on a {slope_deg:.2f}° footprint cell "
                f"(limit < {limits[fit]}°); re-site it or give it a fit made for the slope")
    return None


def footprint_max_slope_deg(footprint_m, survey) -> float:
    """The steepest `slope_grid` cell the footprint polygon (metres) touches."""
    from shapely.geometry import Polygon, box

    poly = Polygon(footprint_m)
    px = survey.grid_px_m
    x0, z0, x1, z1 = poly.bounds
    return max(float(survey.slope_grid[r, c])
               for r in range(int(z0 // px), int(z1 // px) + 1)
               for c in range(int(x0 // px), int(x1 // px) + 1)
               if box(c * px, r * px, (c + 1) * px, (r + 1) * px).intersects(poly))


def compile_blueprint(bp: dict, survey: ProvinceSurvey, shelf: KitShelf,
                      warnings: list[str] | None = None) -> dict:
    source_bp = bp                      # hashed as authored, never as resolved
    bp, errors = with_record_ground_fits(bp, shelf)
    bp_id = bp["id"]
    seed = str(bp["seed"])
    warns: list[str] = list(warnings or [])
    placements: list[dict] = []
    grades: list[dict] = []
    dressing_report: dict[str, int] = {}
    dropped_no_host: dict[str, int] = {}
    kit_of_asset, kit_rows = shelf.kit_index()

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

        fit = parcel.get("groundFit")
        if fit is None:
            continue                    # named by with_record_ground_fits
        if delta > FIT_MAX[fit]:
            errors.append(
                f"{pid}: measured Δ={delta:.2f} m exceeds groundFit '{fit}' "
                f"(max {FIT_MAX[fit]:.2f} m) — never grade Δ>=2 m: use stilt/dug-in or re-site"
            )
            continue

        if parcel.get("pieces") and "assetRef" not in parcel:
            # 16h K9 B: a modular run, laid piece by piece on the mined abuts
            # pairs (blueprint_footprints.lay_pieces); one pad under the run.
            laid, run_errors = fp_mod.lay_pieces(parcel)
            if run_errors:
                errors.extend(run_errors)
                continue
            base_y = max(heights) - BURY_M
            if fit == "pad":
                grades.append({
                    "parcelId": pid, "footprint": parcel["footprint"],
                    "targetHeightM": max(heights), "falloffRatio": PAD_FALLOFF_RATIO,
                    "residualTiltDeg": PAD_RESIDUAL_TILT_DEG,
                    "tiltBearingDeg": float(parcel["yawDeg"]),
                })
            # each piece is judged on its own measured outline, not the run's
            piece_polys = fp_mod.laid_polygons_m(parcel, laid) or [foot_m] * len(laid)
            for i, row in enumerate(laid):
                slope = footprint_max_slope_deg(piece_polys[i], survey)
                asset = shelf.find(culture, row["asset"], kind_of.get(pid, "structure"))
                if asset is None:
                    errors.append(f"{pid}: pieces[{i}] {row['asset']} is not in kit set {culture!r}")
                    continue
                slope_why = fit_slope_failure(asset, slope)
                if slope_why:
                    errors.append(f"{pid}: 97 B3 — {asset['id']}: {slope_why}")
                placements.append({
                    "id": f"{bp_id}.{pid}.piece.{i + 1}",
                    "parcelId": pid,
                    "objectKind": "parcel",
                    "assetId": asset["id"],
                    "kit": asset["kit"],
                    "positionM": [round(cx + row["xM"], 3),
                                  round(base_y + row["riseM"] + asset["sizeM"][2] / 2, 3),
                                  round(cz + row["zM"], 3)],
                    "yawDeg": row["yawDeg"],
                    "scale": 1.0,
                    "groundFit": fit,
                    "run": {"index": i, "length": len(laid), "pair": row["pair"]},
                    # the piece's OWN laid outline: the runtime seats each run
                    # piece on its own ground (anchoring.ts samples footprintM),
                    # never on the mean of the whole run's union footprint
                    "footprintM": [[round(x, 3), round(z, 3)] for x, z in piece_polys[i]],
                    "provenance": _provenance(bp_id, seed, f"parcel-run/{fit}", asset["id"], []),
                })
            continue

        asset = shelf.pick(culture, parcel["buildingFamily"], f"{seed}:{pid}", parcel.get("assetRef"),
                           kind_of.get(pid, "building"))
        if asset is None:
            ref = parcel.get("assetRef") or ""
            if ref.startswith("composite:"):
                # A composite is a kit rule: the anchor piece and its parts at
                # the offsets their authors used every time, mined into
                # kit-assemblies-mined.json and baked as one asset by
                # `pipeline.build_kit` (`compose.parts`). A blueprint that
                # names a composite the kits do not build is naming an
                # assembly nobody authored (owner 2026-09-04) — named here
                # rather than lost inside "no kit asset for family".
                errors.append(
                    f"{pid}: composite ref {ref!r} names no composite built into kit set "
                    f"{culture!r}; a composite exists only where "
                    f"{ASSEMBLIES_RECORD.name} holds the template its kit config composes "
                    f"(add it there and rebuild the kit, or place the pieces separately)")
            else:
                errors.append(f"{pid}: no kit asset for family '{parcel['buildingFamily']}'"
                              + (f" / assetRef '{ref}'" if ref else "")
                              + f" in kit set '{culture}'")
            continue

        slope_why = fit_slope_failure(asset, footprint_max_slope_deg(foot_m, survey))
        if slope_why:
            # recorded, not skipped: a replayed fixture waives it and keeps the piece
            errors.append(f"{pid}: 97 B3 — {asset['id']}: {slope_why}")

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
                # The grading consumer needs an authored axis, otherwise the
                # requested residual tilt has a magnitude but no direction.
                "tiltBearingDeg": float(parcel["yawDeg"]),
            })
        # orientation is authored, with a reason (orientationWhy) — the
        # compiler never invents a turn (owner ruling 2026-09-05)
        yaw = float(parcel["yawDeg"])
        scale = float(parcel.get("scale", 1.0))   # uniform; a natural piece (a trunk) may be scaled, a kit piece rarely
        quay_shift = None
        if is_quay_run(asset):
            anchored = anchor_quay_run(asset, (cx, cz), yaw, scale, survey)
            if anchored is None:
                errors.append(f"{pid}: quay run {asset['id']} finds no ground/water line "
                              f"within {QUAY_SHORE_SEARCH_M:.0f} m of its landward end "
                              f"along its axis; a quay starts at the shore")
            else:
                cx, cz, quay_shift = anchored
        placements.append({
            "id": f"{bp_id}.{pid}.building",
            "parcelId": pid,
            "objectKind": "parcel",
            "assetId": asset["id"],
            "kit": asset["kit"],
            # grid transform, centred pivot — never flora bottom-anchoring
            "positionM": [round(cx, 3), round(base_y + (asset["sizeM"][2] * scale / 2 if fit != "dug-in" else 0.0), 3), round(cz, 3)],
            "yawDeg": yaw,
            "scale": scale,
            "groundFit": fit,
            "provenance": _provenance(bp_id, seed, f"parcel-building/{fit}", asset["id"], []),
            **({"shoreAnchorShiftM": quay_shift} if quay_shift is not None else {}),
        })
        placements.extend(assembly_placements(bp_id, seed, parcel, placements[-1], shelf, survey,
                                              errors))

        # 97 decision 4 / G18: an occupied shell or works mass is not a
        # finished place until its use leaves visible objects around it.  The
        # vocabulary belongs to the district's kit, while count/position are
        # deterministic functions of the blueprint seed and parcel id.
        # 16h K7 (planner ruling C): a fixture proves one mechanism per
        # piece and carries no ring dressing; its only dressing is the mount
        # exemplars its blueprint places. Province places keep the ring.
        count = 0 if bp_mod.is_fixture(bp) else dressing_count(seed, parcel)
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
                if not dressing_host_at(survey, px, pz):
                    # 16h K6: a prop needs a host to stand on; the ring offers
                    # only the ground, so over water it has none (the chairs
                    # the owner saw round the hull and the landing stage)
                    dropped_no_host[pid] = dropped_no_host.get(pid, 0) + 1
                    continue
                py = survey.height_at(px, pz)
                placements.append({
                    "id": f"{bp_id}.{pid}.dressing.{i + 1}",
                    "parcelId": pid,
                    "objectKind": "dressing",
                    "dressingFor": parcel.get("use"),
                    "assetId": aid,
                    "kit": kit_of_asset.get(aid),
                    "positionM": [round(px, 3), round(py, 3), round(pz, 3)],
                    "yawDeg": round((phase + i * 71.0) % 360.0, 1),
                    "scale": 1.0,
                    "groundFit": "direct",
                    "provenance": _provenance(bp_id, seed,
                                               f"parcel-dressing/{parcel.get('use')}", aid, []),
                })
            placed = count - dropped_no_host.get(pid, 0)
            if placed:
                dressing_report[pid] = placed

    for landmark in sorted(bp.get("landmarks", []), key=lambda row: row["id"]):
        asset = shelf.locate(landmark.get("assetRef", ""))
        if asset is None:
            errors.append(f"{landmark['id']}: assetRef {landmark.get('assetRef')!r} is not in a built kit")
            continue
        x, z = survey.uv_to_m(*landmark["position"])
        scale = float(landmark.get("scale", 1.0))
        placements.append({
            "id": f"{bp_id}.{landmark['id']}",
            "landmarkId": landmark["id"], "objectKind": "landmark",
            "assetId": asset["id"], "kit": asset["kit"],
            "positionM": [round(x, 3),
                          round(survey.height_at(x, z) + asset["sizeM"][2] * scale / 2, 3),
                          round(z, 3)],
            "yawDeg": float(landmark.get("yawDeg", 0.0)), "scale": scale,
            "groundFit": landmark.get("groundFit", "direct"),
            "provenance": _provenance(bp_id, seed, "landmark/authored", asset["id"], []),
        })

    for fence in sorted(bp.get("fences", []), key=lambda row: row["id"]):
        fence_placements, fence_errors = _place_fence(bp_id, seed, fence, survey, shelf)
        placements.extend(fence_placements)
        errors.extend(fence_errors)

    for dock in sorted(bp.get("docks", []), key=lambda d: d["id"]):
        x, z = survey.uv_to_m(*dock["position"])
        asset = shelf.locate(dock["assetRef"]) if dock.get("assetRef") else None
        if asset is None:
            errors.append(f"{dock['id']}: physical dock assetRef {dock.get('assetRef')!r} "
                          f"is missing or is not in a built kit")
            continue
        # A berth stands ON recorded water: the hull that lies at it floats at
        # the RECORD's level (0066/0065), never at a terrain sample. The graph
        # entity under the berth is that record; `waterBodyId` on the dock is
        # the place record's own name for the water and does not join to the
        # graph by id (see the 16h gap note).
        berth_water = survey.water_entity_at(x, z)
        if berth_water is None:
            errors.append(
                f"{dock['id']}: berth stands on no recorded body or reach "
                f"(0066), so the hull that lies at it has no water level to "
                f"float at; site the berth on recorded water or drop it")
            continue
        placements.append({
            "id": f"{bp_id}.{dock['id']}",
            "dockId": dock["id"], "objectKind": "dock",
            "anchorClass": "water",
            "waterEntityId": berth_water["entityId"],
            "waterEntityKind": berth_water.get("kind"),
            "waterLevelM": berth_water.get("levelM"),
            "assetId": asset["id"],
            "kit": asset["kit"],
            "positionM": [round(x, 2), round(survey.height_at(x, z), 3), round(z, 2)],
            "yawDeg": float(dock.get("yawDeg", 0.0)),
            "scale": float(dock.get("scale", 1.0)),
            "groundFit": dock.get("groundFit", "stilt"),
            "piledToBed": True,
            "provenance": _provenance(bp_id, seed, "dock/authored", asset["id"], []),
        })

    # --- door reachability, every compile -------------------------------
    doors_out: list[dict] = []
    for door in sorted(bp["doors"], key=lambda d: d["id"]):
        x, z = survey.uv_to_m(*door["thresholdUV"])
        # grid_px returns (row, col) = (z index, x index), and every other caller
        # in worldgen unpacks it in that order. Indexing [col, row] here sampled a
        # transposed pixel, so door reachability was measured at the wrong place.
        row, col = survey.grid_px(x, z)
        # 0066: the threshold is off land when a RECORDED body or reach stands
        # under it. The id is carried on the door record so a door-on-water
        # verdict can be argued against the water it names, and so the bundle
        # can hand the runtime the level of that water.
        water_here = survey.water_entity_at(x, z)
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
                f"[{slope:.0f}°], boardwalkAccess={boardwalk_access}, inHardClear={cleared}"
                + (f", stands on {water_here['entityId']} "
                   f"({water_here.get('kind')})" if water_here else "") + ")"
            )
        doors_out.append({**door, "reachable": reachable,
                          "access": "boardwalk" if boardwalk_access else "land",
                          "waterEntityId": (water_here or {}).get("entityId"),
                          "waterEntityKind": (water_here or {}).get("kind"),
                          "waterLevelM": (water_here or {}).get("levelM")})

    # --- layer integration (owner 2026-09-05): ways vs buildings, gates across
    # roads, doors onto ways, ways in the right medium ------------------------
    errors += check_integration(bp, survey)

    # --- the promise ledger (97 E9): everything the catalogue record promised
    # the player, against the objects that realise it. HARD from M3 up.
    promise_errors, promise_warnings, ledger = check_promises(bp)
    errors += promise_errors
    warns += promise_warnings

    # Every placement that stands on recorded water carries the record it
    # stands on: the runtime seats a hull or a stilt foot against the recorded
    # LEVEL, never against a terrain sample (0066, 16h runtime contract).
    for placement in placements:
        px, _py, pz = placement["positionM"]
        water = survey.water_entity_at(float(px), float(pz))
        if water is not None:
            placement["waterEntityId"] = water["entityId"]
            placement["waterEntityKind"] = water.get("kind")
            placement["waterLevelM"] = water.get("levelM")

    # Mounted children (wall/hanging/deck) hang off their mined parent, and
    # every door binds to the doorway of the mesh it opens (16h item 7).
    errors += mount_children(bp_id, placements, shelf, mined_mounts())
    interiors_index = kit_interiors()
    doorways = assembly_doorways()
    errors += bind_doors_to_doorways(bp, doors_out, placements, survey,
                                     interiors_index, doorways)

    compiled_objects, compiled_object_errors = compiled_blueprint_objects(
        bp, placements, doors_out, survey,
        interiors=interiors_index, connectors=kit_connectors(),
        assemblies=doorways)
    errors += compiled_object_errors

    macro_record = load_record(bp_id)
    obligation_receipt = None
    if macro_record is not None:
        terrain_notes: list[str] = []
        terrain_objects, terrain_object_errors = compiled_terrain_objects(
            macro_record, notes=terrain_notes)
        errors += terrain_object_errors
        for note in terrain_notes:
            print(f"compile_settlement: {note}", file=sys.stderr)
        compiled_objects.extend(terrain_objects)
        compiled_objects.sort(key=lambda row: row["id"])
        obligation_receipt, obligation_errors = phase11_obligation_receipt(
            bp, macro_record, compiled_objects)
        errors += obligation_errors

    # --- 97 B6/D2: does the first-seen object actually read from the approach?
    warns += _first_seen_warnings(bp, survey, shelf)

    # --- 97 B4/G8: horizontal relationship to the final water/flood section.
    # WARN only: this is design evidence, not a reason to suppress a compile.
    flood_report, flood_warnings = flood_band_report(bp, survey, kind_of)
    warns += flood_warnings
    # 0066: the water facts above are only reportable because they join to the
    # graph. A fact that does not is a HARD error, never a quiet warning.
    errors += water_fact_errors(flood_report, doors_out, survey)

    # --- clearance masks for the scatter compiler -----------------------
    # In the vegetation compiler's own chunk size (compile_scatter.CHUNK_M =
    # 256 samples x RAW_M = 467.93 m). The old local 462.0 m constant put a
    # settlement in the wrong chunk once past ~x=39 km/462 of drift — i.e. it
    # named chunks the scatter compiler does not have.
    metre_clearance = {
        "hardClear": [[list(survey.uv_to_m(u, v)) for u, v in poly]
                      for poly in bp["clearance"].get("hardClear", [])],
        "thinned": [[list(survey.uv_to_m(u, v)) for u, v in poly]
                    for poly in bp["clearance"].get("thinned", [])],
    }
    affected = set(sc_mod.affected_chunks(metre_clearance))

    # --- static budget report (0041 perf contract) ----------------------
    unique_assets = sorted({p["assetId"] for p in placements})
    materials: set[str] = set()
    tris = 0
    for p in placements:
        for a in (kit_rows.get((p["kit"], p["assetId"]), []) if p["kit"] else []):
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

    # 16h K7: a modular end that faces nothing is a hollow end. Counted for a
    # fixture (the yard shows the Imperial set's gap honestly); a WARN for a
    # province place until the abuts record is mined in full.
    abuts = mined_abuts()
    open_ends = open_modular_ends(placements, shelf, abuts)
    single_use = single_use_pieces(placements, abuts)
    if open_ends and not bp_mod.is_fixture(bp):
        warns.append(f"16h K7 open modular ends: {len(open_ends)} "
                     f"({', '.join(sorted({r['placementId'] for r in open_ends})[:6])})")

    return {
        "schemaVersion": SCHEMA_VERSION,
        "id": bp_id,
        "sourceBlueprintSha256": blueprint_sha256(source_bp),
        "seed": seed,
        "generator": {"id": GENERATOR_ID, "version": GENERATOR_VERSION},
        "placements": placements,
        "compiledObjects": compiled_objects,
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
            "droppedNoHost": dict(sorted(dropped_no_host.items())),
        },
        "openModularEnds": open_ends,
        "singleUsePieces": single_use,
        "floodBandReport": flood_report,
        "purposeSummary": pp_mod.purpose_summary(bp),
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


_RULE_97 = re.compile(r"\b97 ([A-Z][A-Za-z0-9-]*(?:/[A-Z][A-Za-z0-9-]*)*)")


def waived_rule_id(message: str) -> str:
    """The rule a HARD error names: its module-97 id (`97 C10`, `97 B5/G9`,
    `97 C-stitch`) when it cites one, else its check prefix
    (`integration`, `network-stitch`), else `compile`."""
    hit = _RULE_97.search(message)
    if hit:
        return f"97 {hit.group(1)}"
    head = message.split(":", 1)[0].strip()
    if head in ("integration", "network-stitch", "phase-11-compiled"):
        return head
    return "compile"


def fixture_waivers(errors: list[str], warnings: list[str] = ()) -> list[dict]:
    """`--fixture-replay` (16h part 1 round 3): every rule a replayed fixture
    blueprint breaks is recorded, one row per finding with its grade, never
    dropped. Re-authoring those layouts is 16i's; the replay only keeps the
    numeric sample, so nobody judges the layout and no finding blocks it."""
    return ([{"ruleId": waived_rule_id(str(e)), "grade": "hard", "message": str(e)}
             for e in errors]
            + [{"ruleId": waived_rule_id(str(w)), "grade": "warn", "message": str(w)}
               for w in warnings])



def waive_fixture_warnings(result: dict, bp: dict) -> dict:
    """A fixture blueprint (`fixture: true`, the proving ground) is a test yard
    nobody plays, so its WARN-grade findings (density, why-duplicate, no
    catalogue, flood rows) judge nothing (16h part 1 round 4). They move into
    `fixtureWaived` with grade "warn", automatically; errors stay fatal and
    the doc is NOT a replay (the exporter accepts it like a replay receipt)."""
    if bp.get("fixture") is True:
        result["fixtureWaived"] = fixture_waivers([], result["warnings"])
        result["warnings"] = []
    return result

BLUEPRINT_DIR = REPO_ROOT / "world" / "sources" / "blueprints"
DEFAULT_OUT_DIR = REPO_ROOT / "tooling" / "world-generation" / "output" / "settlements"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--blueprint", default=None)
    ap.add_argument("--all", action="store_true",
                    help="compile every authored blueprint into the default output "
                         "directory. This is what the terrain chain runs: "
                         "export_settlement_bundle refuses a compile whose source "
                         "blueprint has moved under it, and until this existed "
                         "nothing in the chain PRODUCED what the exporter consumes, "
                         "so a blueprint edit silently left the world unbuildable.")
    ap.add_argument("--skip-catalogue", action="store_true",
                    help="skip the blueprint-id-in-catalogue check (fixtures)")
    ap.add_argument("--fixture-replay", action="store_true",
                    help="compile a FIXTURE blueprint whose layout breaks HARD design "
                         "rules (16h part 1 round 3): each fired rule is recorded under "
                         "fixtureWaived in the output, the site carries fixtureReplay: "
                         "true, and the shipped build refuses it like fixture: true")
    ap.add_argument("--out", default=None,
                    help="a file path, or a DIRECTORY to write <id>.settlement.json into; the promise "
                         "ledger is written beside it, so --out /tmp/x touches nothing in the tree")
    args = ap.parse_args(argv)
    if args.all == bool(args.blueprint):
        ap.error("give exactly one of --blueprint or --all")

    if args.all:
        args.out = args.out or str(DEFAULT_OUT_DIR)
        shelf = KitShelf()          # one shelf for the whole run
        worst = 0
        for path in sorted(BLUEPRINT_DIR.glob("place.*.json")):
            args.blueprint = str(path)
            worst = max(worst, _compile_one(args, shelf))
        return worst
    return _compile_one(args, KitShelf())


def _compile_one(args: argparse.Namespace, shelf: KitShelf) -> int:
    """Compile `args.blueprint` against `shelf` and write it (see `main`)."""
    data = json.loads(Path(args.blueprint).read_text())
    bp = data["blueprint"]
    known = None if args.skip_catalogue else bp_mod.catalogue_ids()
    survey = shared_survey()
    schema_errors, schema_warnings = bp_mod.validate_blueprint_full(bp, known, survey)
    for w in schema_warnings:
        print(f"compile_settlement: WARN: {w}", file=sys.stderr)
    if schema_errors and not args.fixture_replay:
        for e in schema_errors:
            print(f"compile_settlement: schema: {e}", file=sys.stderr)
        return 1

    result = compile_blueprint(bp, survey, shelf, schema_warnings)
    if args.fixture_replay:
        result["fixtureReplay"] = True
        result["fixtureWaived"] = fixture_waivers(list(schema_errors) + result["errors"],
                                                  result["warnings"])
        result["errors"] = []
        result["warnings"] = []
    else:
        waive_fixture_warnings(result, bp)
    for row in result.get("fixtureWaived", []):
        print(f"compile_settlement: FIXTURE-WAIVED {row['grade']} [{row['ruleId']}] "
              f"{row['message']}",
              file=sys.stderr)
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

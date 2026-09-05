"""Settlement blueprint schema + validator (Phase 11 Part 0 item 3, decision 0041).

Realises module 40 §30's `SettlementBlueprint` / `GenerationProvenance` and
quests 20 §13's `QuestWorldProvision` as a concrete JSON authoring format the
deterministic compiler consumes. Semantic authoring throughout: actors are
S-ladder refs (module 76 §128), loot is tier+provenance, never numbers.

Data layout (authoring data, next to the catalogue it details):

    world/sources/blueprints/<place-id>.json      # one blueprint per place
        { "schemaVersion": 1, "blueprint": { ... } }

Blueprint fields (module 40 §30 + the 0041 forward-compat contracts):

  id                place.<region>.<slug> — MUST exist in the catalogue
  (every placed object's id is <kind>.<slug>.<name> — district / parcel /
  route / canal / boardwalk / landmark / dock / combat / socket / variant /
  travel / kept / candidate — so quests and code can address it; standard 2.
  A questSocket may instead carry the catalogue socket id it realises, and
  a variant carries `stateRef` for the catalogue state it realises.)
  seed              compile seed (standard 6)
  causalModel       {founding, siteAdvantages, occupantsMotive, pressures,
                    wouldChangeIf} — long form of the catalogue's `why`
  boundary          polygon [[u,v], ...] in province UV
  districts[]       {id, kind, boundary, cultureKit (a KIT SET id — see
                    KIT_SETS below; one set per district, never blended;
                    the set's culture carries the two-culture rule),
                    wealth, notes}
  routes[]/canals[]/boardwalks[]   {id, kind, points [[u,v],...], widthM}
  parcels[]         {id, districtId, use, centreUV, yawDeg, orientationWhy,
                    assetRef, footprint (DERIVED), buildingFamily, groundFit}

                    Authoring rule (owner ruling 2026-09-05): a parcel is
                    authored as WHERE (`centreUV` [u,v]), WHICH PIECE
                    (`assetRef` — an exact kit asset id, picked on measured
                    geometry, never on its name), WHICH WAY (`yawDeg`, degrees
                    clockwise from north — REQUIRED) and WHY THAT WAY
                    (`orientationWhy`, one plain sentence: "aligned to the
                    contour behind it", "door to the quay" — REQUIRED).
                    `footprint` is then DERIVED from the asset's measured
                    ground hull by `worldgen.blueprint_footprints --apply`
                    and must never be hand-edited; the validator recomputes it
                    and fails on any drift. Optional `outline` picks
                    "footprintM" (ground contact, default) or "planOutlineM"
                    (the full silhouette — stilt pieces whose ground band is
                    only piles).
                    groundFit is "direct"|"plinth"|"pad"|"stilt"|"dug-in" —
                    the slope ladder; the compiler may only relax DOWN this
                    list, never grade Δ≥2 m. buildingFamily stays as the
                    asset-inventory family the pick belongs to.
  siting            optional (Part 6): {dossier, candidates[{id, positionM,
                    why, chosen?, rejectedBecause?}]} — >=2 candidates, one
                    chosen; the deliberation the macro plot could not do
  landmarks[]       {id, kind, position, assetRef, notes}
                    (optional yawDeg + scale; scale is a UNIFORM factor 0.2–5
                    for natural pieces only — the sourced anvilgianttrunk at
                    ~0.45 is the Nine-Trunks case; kit architecture stays 1.
                    Parcels may carry `scale` under the same rule; the derived
                    footprint and the compiler honour it)
  docks[]           {id, position, waterBodyId, piledToBed: true}
  combatSpaces[]    {id, boundary, clearanceClass}
  questSockets[]    {id, kind ("scene"|"evidence"|"container"|"npc"|
                    "encounter"|"boss"|"station"|"mark"), position?,
                    parcelId?, ownerQuestTier?}
  doors[]           {id (door.<region>.<slug>.<n>), parcelId, facingDeg,
                    thresholdUV, interiorClaim {sizeClass, culture, owner?}}
                    — Phase 12's fill points AND the interior streaming
                    boundary; reachability validated every compile.
                    `facingDeg` is checked against geometry: the validator
                    finds the footprint edge nearest the threshold and requires
                    facingDeg within DOOR_FACING_TOLERANCE_DEG (±100°) of that
                    edge's OUTWARD normal, so a door cannot claim a side the
                    building does not have. The tolerance is deliberately loose
                    — a hull edge is a chord of a curved wall and a threshold
                    may sit at a corner — so this catches doors placed on the
                    wrong face, not fine aiming.
  clearance         {hardClear: [polygon...], thinned: [polygon...],
                    kept: [{id, kind ("hist-tree"|"shade"|"reed-bed"|...),
                    position}]} — graded vegetation clearing; masks feed
                    the scatter compiler
  variants[]        LocalStateVariant slots from v1 (quests 20 §14):
                    {id, changedRefs [], serviceOverrides {}, ambience?}
                    — at most 3 per blueprint; exemplars ship ≥1
  travelServices[]  {id, kind ("ferry"|"boat"|"root"|"water-taxi"),
                    toPlaceId, timetable?}
  occupants[]       {slotId, ladderRef (semantic, e.g. "strong-d3"),
                    cultureRole, ownerFaction?}
  assetConstraints[] free-form strings, checked against the asset inventory
  ownership         optional per-interactable {refId: {owner?, ownerFaction?,
                    valueTier?}} (buildout register: never retrofitted)
  provision         QuestWorldProvision (quests 20 §13) — filled as the
                    packet's co-design loop runs
  budget            declared static budget {maxInstances, maxUniqueMaterials,
                    maxTextureMB, maxColliders} — the compiler's report is
                    checked against it (0041 perf contract)

GenerationProvenance is attached by the COMPILER to every emitted object,
not authored here: {sourceBlueprintId, generatorId, generatorVersion, seed,
ruleId, assetId, sourceDataHashes}.

Run: python -m worldgen.blueprint --check   (from tooling/world-generation/)
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

from . import blueprint_footprints as fp
from .catalogue import CATALOGUE_DIR, load_region_files

SCHEMA_VERSION = 1
REPO_ROOT = Path(__file__).resolve().parents[3]
BLUEPRINT_DIR = REPO_ROOT / "world" / "sources" / "blueprints"

# Kit SETS a district may be built from (Phase 11 Part 6, owner ruling
# 2026-09-04 "kits only combine pieces designed to combine"): a district names
# ONE set; every piece in a set was packaged to fit the others in it. `culture`
# is the two-culture rule's axis — a place may hold argonian and imperial
# districts side by side, never a blended one. The legacy "argonian"/"imperial"
# ids stay valid for the Part 0 skeleton fixture.
KIT_SETS = {
    "argonian":           {"culture": "argonian", "kits": ["settlement-mud-v1", "settlement-stilt-v1"]},
    "argonian-stilt":     {"culture": "argonian", "kits": ["settlement-stilt-v1", "docks-v1", "watercraft-v1"]},
    "argonian-mud":       {"culture": "argonian", "kits": ["settlement-mud-v1"]},
    "argonian-root":      {"culture": "argonian", "kits": ["settlement-root-v1", "dungeon-root-v1"]},
    "argonian-stone":     {"culture": "argonian", "kits": ["ruin-monumental-v1", "xanmeer-interior-v1"]},
    "imperial":           {"culture": "imperial", "kits": ["settlement-imperial-v1", "imperial-keep"]},
    "dunmer-hlaalu":      {"culture": "dunmer",   "kits": ["hlaalu-domestic"]},
    "neutral-works":      {"culture": "neutral",  "kits": ["works-v1"]},
    "neutral-underwater": {"culture": "neutral",  "kits": ["underwater-v1"]},
}
CULTURE_KITS = set(KIT_SETS)
INTERIOR_CULTURES = {"argonian", "imperial", "dunmer"}
GROUND_FIT = {"direct", "plinth", "pad", "stilt", "dug-in"}
SOCKET_KINDS = {"scene", "evidence", "container", "npc", "encounter", "boss", "station", "mark"}
TRAVEL_KINDS = {"ferry", "boat", "root", "water-taxi"}
MAX_VARIANTS = 3
DOOR_FACING_TOLERANCE_DEG = 100.0

REQUIRED = [
    "id", "seed", "causalModel", "boundary", "districts", "parcels",
    "doors", "clearance", "variants", "occupants", "budget",
]
BUDGET_KEYS = {"maxInstances", "maxUniqueMaterials", "maxTextureMB", "maxColliders"}
CAUSAL_KEYS = {"founding", "siteAdvantages", "occupantsMotive", "pressures", "wouldChangeIf"}


# Stable IDs (engineering standard 2): every object a blueprint places is
# addressable by quests and code, so its id is <kind>.<place-slug>.<name>.
ID_KINDS = {
    "districts": "district", "parcels": "parcel", "routes": "route", "canals": "canal",
    "boardwalks": "boardwalk", "landmarks": "landmark", "docks": "dock",
    "combatSpaces": "combat", "questSockets": "socket", "variants": "variant",
    "travelServices": "travel",
}
CATALOGUE_SOCKET_RE = re.compile(r"^(?:scene|evidence|station|marks)\.[a-z0-9-]+\.[a-z0-9-]+$")
ID_NAME_RE = r"[a-z0-9]+(?:-[a-z0-9]+)*"


def _id_ok(value, kind: str, slug: str) -> bool:
    return isinstance(value, str) and re.fullmatch(rf"{kind}\.{re.escape(slug)}\.{ID_NAME_RE}", value) is not None


def _polygon_ok(poly) -> bool:
    return (
        isinstance(poly, list) and len(poly) >= 3
        and all(isinstance(p, list) and len(p) == 2 for p in poly)
    )


def _angle_delta(a: float, b: float) -> float:
    """Smallest absolute difference between two compass bearings, degrees."""
    return abs((a - b + 180.0) % 360.0 - 180.0)


def _door_edge_bearing(parcel: dict, threshold_uv) -> float | None:
    """Compass bearing of the OUTWARD normal of the footprint edge nearest the
    threshold. UV is used directly: the province square is square, so bearings
    are the same in UV and in metres. Returns None when the geometry is not
    usable (no footprint, no threshold), because this check is pragmatic."""
    poly = parcel.get("footprint")
    if not _polygon_ok(poly) or not (isinstance(threshold_uv, list) and len(threshold_uv) == 2):
        return None
    tx, tz = float(threshold_uv[0]), float(threshold_uv[1])
    cx = sum(p[0] for p in poly) / len(poly)
    cz = sum(p[1] for p in poly) / len(poly)
    best = None
    for i in range(len(poly)):
        ax, az = poly[i]
        bx, bz = poly[(i + 1) % len(poly)]
        ex, ez = bx - ax, bz - az
        length_sq = ex * ex + ez * ez
        if length_sq == 0:
            continue
        t = max(0.0, min(1.0, ((tx - ax) * ex + (tz - az) * ez) / length_sq))
        px, pz = ax + t * ex, az + t * ez
        dist_sq = (tx - px) ** 2 + (tz - pz) ** 2
        # edge normal, flipped to point away from the centroid
        nx, nz = ez, -ex
        mx, mz = (ax + bx) / 2.0, (az + bz) / 2.0
        if nx * (mx - cx) + nz * (mz - cz) < 0:
            nx, nz = -nx, -nz
        if best is None or dist_sq < best[0]:
            best = (dist_sq, nx, nz)
    if best is None:
        return None
    _, nx, nz = best
    # world axes: x east, z south, so north is -z (same convention as yawDeg)
    return math.degrees(math.atan2(nx, -nz)) % 360.0


def catalogue_ids() -> set[str]:
    return {p["id"] for rf in load_region_files(CATALOGUE_DIR) for p in rf.places if "id" in p}


def validate_blueprint(bp: dict, known_place_ids: set[str] | None = None) -> list[str]:
    errors: list[str] = []
    bid = bp.get("id", "<missing id>")

    def fail(msg: str) -> None:
        errors.append(f"{bid}: {msg}")

    for key in REQUIRED:
        if key not in bp or bp[key] is None:
            fail(f"missing required field '{key}'")
    if known_place_ids is not None and bid not in known_place_ids:
        fail("id not present in the place catalogue — blueprints detail catalogue records")
    if not set(bp.get("causalModel", {})) >= CAUSAL_KEYS:
        fail(f"causalModel must carry {sorted(CAUSAL_KEYS)}")
    if "boundary" in bp and not _polygon_ok(bp["boundary"]):
        fail("boundary must be a polygon of >=3 [u,v] points")

    slug = bid.rsplit(".", 1)[-1]
    for key, kind in ID_KINDS.items():
        for item in bp.get(key, []) or []:
            iid = item.get("id") if isinstance(item, dict) else None
            if key == "questSockets" and isinstance(iid, str) and CATALOGUE_SOCKET_RE.match(iid):
                continue     # a catalogue socket id realised here
            if not _id_ok(iid, kind, slug):
                fail(f"{key} id {iid!r} must be {kind}.{slug}.<kebab-name> (standard 2)")
    for item in (bp.get("clearance") or {}).get("kept", []) or []:
        if isinstance(item, dict) and not _id_ok(item.get("id"), "kept", slug):
            fail(f"clearance.kept id {item.get('id')!r} must be kept.{slug}.<kebab-name>")
    for item in (bp.get("siting") or {}).get("candidates", []) or []:
        if isinstance(item, dict) and not _id_ok(item.get("id"), "candidate", slug):
            fail(f"siting candidate id {item.get('id')!r} must be candidate.{slug}.<kebab-name>")

    district_ids = set()
    for d in bp.get("districts", []):
        district_ids.add(d.get("id"))
        if d.get("cultureKit") not in CULTURE_KITS:
            fail(f"district {d.get('id')}: cultureKit must be one of {sorted(CULTURE_KITS)} (two-culture rule: one kit set per district, never blended)")
        if not _polygon_ok(d.get("boundary")):
            fail(f"district {d.get('id')}: boundary must be a polygon of >=3 [u,v] points")

    library = fp.library()
    for p in bp.get("parcels", []):
        pid = p.get("id")
        if p.get("districtId") not in district_ids:
            fail(f"parcel {pid}: unknown districtId {p.get('districtId')}")
        if p.get("groundFit") not in GROUND_FIT:
            fail(f"parcel {pid}: groundFit must be one of {sorted(GROUND_FIT)}")
        if not p.get("buildingFamily"):
            fail(f"parcel {pid}: needs buildingFamily (asset-inventory ref)")
        if not _polygon_ok(p.get("footprint")):
            fail(f"parcel {pid}: footprint must be a UV polygon of >=3 [u,v] points")
        if not (isinstance(p.get("centreUV"), list) and len(p.get("centreUV", [])) == 2):
            fail(f"parcel {pid}: centreUV must be [u,v] (the parcel is authored by centre + yaw, not by polygon)")
        if not isinstance(p.get("yawDeg"), (int, float)) or isinstance(p.get("yawDeg"), bool):
            fail(f"parcel {pid}: yawDeg is required and must be a number (degrees clockwise from north)")
        if "scale" in p and not (isinstance(p["scale"], (int, float)) and 0.2 <= p["scale"] <= 5.0):
            fail(f"parcel {pid}: scale must be a uniform factor in 0.2–5 (natural pieces only; kit pieces stay 1)")
        why = p.get("orientationWhy")
        if not isinstance(why, str) or len(why.strip()) < 12:
            fail(f"parcel {pid}: orientationWhy is required — one plain sentence saying why the building faces this way (owner ruling 2026-09-05)")
        if not (isinstance(p.get("assetRef"), str) and p.get("assetRef")):
            fail(f"parcel {pid}: assetRef is required — an exact kit asset id chosen on measured geometry (0041 Part 6)")
        elif library and library.get(p["assetRef"]) is None:
            fail(f"parcel {pid}: assetRef {p['assetRef']!r} has no measured footprint — run pipeline.measure_footprints, or pick a piece that exists")
        elif library:
            derived = fp.parcel_footprint(p, library)
            if derived is None:
                fail(f"parcel {pid}: footprint cannot be derived from assetRef + centreUV + yawDeg")
            elif not fp.polygons_match(p.get("footprint"), derived):
                fail(f"parcel {pid}: footprint is not the derived polygon — it is DERIVED, never hand-edited; run 'python3 -m worldgen.blueprint_footprints --apply <file>'")

    siting = bp.get("siting")
    if siting is not None:
        if not isinstance(siting.get("dossier"), str):
            fail("siting.dossier must point at the site dossier this siting cites (module 40 §28)")
        cands = siting.get("candidates")
        if not isinstance(cands, list) or len(cands) < 2:
            fail("siting.candidates must list >=2 candidate sitings (Part 6: 2–3 exact candidates)")
        else:
            for c in cands:
                if not (isinstance(c.get("positionM"), list) and len(c["positionM"]) == 2 and c.get("why")):
                    fail(f"siting candidate {c.get('id')}: needs positionM [x,z] and why")
            if sum(1 for c in cands if c.get("chosen")) != 1:
                fail("siting.candidates must mark exactly one candidate chosen")

    for key in ("routes", "canals", "boardwalks"):
        for w in bp.get(key, []):
            pts = w.get("points")
            if not isinstance(pts, list) or len(pts) < 2 or not all(isinstance(p, list) and len(p) == 2 for p in pts):
                fail(f"{key} {w.get('id')}: points must be >=2 [u,v] pairs")

    for key in ("landmarks", "docks"):
        for item in bp.get(key, []):
            pos = item.get("position")
            if not (isinstance(pos, list) and len(pos) == 2):
                fail(f"{key} {item.get('id')}: position must be [u,v]")
            if "scale" in item and not (isinstance(item["scale"], (int, float)) and 0.2 <= item["scale"] <= 5.0):
                fail(f"{key} {item.get('id')}: scale must be a uniform factor in 0.2–5")
            if key == "landmarks" and "yawDeg" in item and not isinstance(item["yawDeg"], (int, float)):
                fail(f"landmark {item.get('id')}: yawDeg must be a number")

    for s in bp.get("questSockets", []):
        if s.get("kind") not in SOCKET_KINDS:
            fail(f"socket {s.get('id')}: kind must be one of {sorted(SOCKET_KINDS)}")

    door_prefix = "door." + bid.removeprefix("place.") + "."
    parcels_by_id = {p.get("id"): p for p in bp.get("parcels", [])}
    parcel_ids = set(parcels_by_id)
    for d in bp.get("doors", []):
        if not str(d.get("id", "")).startswith(door_prefix):
            fail(f"door {d.get('id')}: id must start {door_prefix}")
        if d.get("parcelId") not in parcel_ids:
            fail(f"door {d.get('id')}: unknown parcelId")
        claim = d.get("interiorClaim", {})
        if not claim.get("sizeClass") or claim.get("culture") not in INTERIOR_CULTURES:
            fail(f"door {d.get('id')}: interiorClaim needs sizeClass + culture")
        parcel = parcels_by_id.get(d.get("parcelId"))
        bearing = _door_edge_bearing(parcel, d.get("thresholdUV")) if parcel else None
        if bearing is not None and isinstance(d.get("facingDeg"), (int, float)):
            off = _angle_delta(float(d["facingDeg"]), bearing)
            if off > DOOR_FACING_TOLERANCE_DEG:
                fail(f"door {d.get('id')}: facingDeg {d['facingDeg']:.0f}° faces away from the wall it sits on "
                     f"(nearest footprint edge points {bearing:.0f}°, {off:.0f}° off) — put the door on the side it claims")

    cl = bp.get("clearance", {})
    if cl and not {"hardClear", "thinned", "kept"} <= set(cl):
        fail("clearance must carry hardClear, thinned, kept (graded clearing, 0041)")

    variants = bp.get("variants", [])
    if len(variants) > MAX_VARIANTS:
        fail(f"at most {MAX_VARIANTS} variants (quests 20 §14)")
    for v in variants:
        if "id" not in v or "changedRefs" not in v:
            fail("each variant needs id + changedRefs")

    for t in bp.get("travelServices", []):
        if t.get("kind") not in TRAVEL_KINDS:
            fail(f"travelService {t.get('id')}: kind must be one of {sorted(TRAVEL_KINDS)}")
        if known_place_ids is not None and t.get("toPlaceId") not in known_place_ids:
            fail(f"travelService {t.get('id')}: toPlaceId not in catalogue")

    for o in bp.get("occupants", []):
        ref = o.get("ladderRef")
        if not isinstance(ref, str) or not ref:
            fail(f"occupant {o.get('slotId')}: ladderRef must be a semantic S-ladder string")
        elif ref.strip().replace(".", "").isdigit():
            fail(f"occupant {o.get('slotId')}: ladderRef is a bare number — semantic refs only (76 §128)")

    budget = bp.get("budget", {})
    if budget and set(budget) != BUDGET_KEYS:
        fail(f"budget must carry exactly {sorted(BUDGET_KEYS)}")
    return errors


def validate_all(blueprint_dir: Path = BLUEPRINT_DIR, known_place_ids: set[str] | None = None) -> list[str]:
    errors: list[str] = []
    if not blueprint_dir.exists():
        return errors
    for path in sorted(blueprint_dir.glob("*.json")):
        data = json.loads(path.read_text())
        if data.get("schemaVersion") != SCHEMA_VERSION:
            errors.append(f"{path.name}: schemaVersion must be {SCHEMA_VERSION}")
            continue
        bp = data.get("blueprint", {})
        if path.stem != bp.get("id"):
            errors.append(f"{path.name}: filename must equal blueprint id ({bp.get('id')})")
        errors += validate_blueprint(bp, known_place_ids)
    return errors


def main() -> int:
    ids = catalogue_ids()
    errors = validate_all(known_place_ids=ids)
    for e in errors:
        print(f"blueprint: {e}", file=sys.stderr)
    print(f"blueprint: {'FAIL' if errors else 'OK'}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

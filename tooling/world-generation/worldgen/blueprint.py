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
  parcels[]         {id, districtId, use, footprint (UV polygon, required —
                    as are district boundaries, waterway points and
                    landmark/dock positions: no geometry-free blueprints),
                    optional yawDeg (authored orientation, degrees clockwise
                    from north; without it the compiler seeds a quarter turn
                    — wall courses on risers need it, Mazzatun 2026-09-04),
                    buildingFamily (asset-
                    inventory family ref), groundFit ("direct"|"plinth"|
                    "pad"|"stilt"|"dug-in" — the slope ladder; compiler may
                    only relax DOWN this list, never grade Δ≥2 m)}
                    optional assetRef: an exact kit asset id, chosen on
                    measured geometry (Part 6 rule); the compiler uses it
                    instead of the family pick when present
  siting            optional (Part 6): {dossier, candidates[{id, positionM,
                    why, chosen?, rejectedBecause?}]} — >=2 candidates, one
                    chosen; the deliberation the macro plot could not do
  landmarks[]       {id, kind, position, assetRef, notes}
  docks[]           {id, position, waterBodyId, piledToBed: true}
  combatSpaces[]    {id, boundary, clearanceClass}
  questSockets[]    {id, kind ("scene"|"evidence"|"container"|"npc"|
                    "encounter"|"boss"|"station"|"mark"), position?,
                    parcelId?, ownerQuestTier?}
  doors[]           {id (door.<region>.<slug>.<n>), parcelId, facingDeg,
                    thresholdUV, interiorClaim {sizeClass, culture, owner?}}
                    — Phase 12's fill points AND the interior streaming
                    boundary; reachability validated every compile
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
import re
import sys
from pathlib import Path

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

    for p in bp.get("parcels", []):
        if p.get("districtId") not in district_ids:
            fail(f"parcel {p.get('id')}: unknown districtId {p.get('districtId')}")
        if p.get("groundFit") not in GROUND_FIT:
            fail(f"parcel {p.get('id')}: groundFit must be one of {sorted(GROUND_FIT)}")
        if not p.get("buildingFamily"):
            fail(f"parcel {p.get('id')}: needs buildingFamily (asset-inventory ref)")
        if not _polygon_ok(p.get("footprint")):
            fail(f"parcel {p.get('id')}: footprint must be a UV polygon of >=3 [u,v] points")
        if "yawDeg" in p and not isinstance(p["yawDeg"], (int, float)):
            fail(f"parcel {p.get('id')}: yawDeg must be a number (degrees, clockwise from north)")
        if "assetRef" in p and not (isinstance(p["assetRef"], str) and p["assetRef"]):
            fail(f"parcel {p.get('id')}: assetRef must be a kit asset id string (geometry-judged pick, 0041 Part 6)")

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

    for s in bp.get("questSockets", []):
        if s.get("kind") not in SOCKET_KINDS:
            fail(f"socket {s.get('id')}: kind must be one of {sorted(SOCKET_KINDS)}")

    door_prefix = "door." + bid.removeprefix("place.") + "."
    parcel_ids = {p.get("id") for p in bp.get("parcels", [])}
    for d in bp.get("doors", []):
        if not str(d.get("id", "")).startswith(door_prefix):
            fail(f"door {d.get('id')}: id must start {door_prefix}")
        if d.get("parcelId") not in parcel_ids:
            fail(f"door {d.get('id')}: unknown parcelId")
        claim = d.get("interiorClaim", {})
        if not claim.get("sizeClass") or claim.get("culture") not in INTERIOR_CULTURES:
            fail(f"door {d.get('id')}: interiorClaim needs sizeClass + culture")

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

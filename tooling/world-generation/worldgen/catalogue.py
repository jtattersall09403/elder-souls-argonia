"""The place catalogue: schema, validator and loader (Phase 11, decision 0041 Part 2).

The catalogue is the province's PERMANENT place registry. This module is the
schema's source of truth; world/sources/catalogue/README.md carries the rules
prose. Data layout:

    world/sources/catalogue/taxonomy.json
        { "schemaVersion": 1,
          "classes": { "<class>": { "<family>": { "<type>": ["<variant>", ...] } } } }
        Variants list may be empty (type has no variants yet).

    world/sources/catalogue/places-<region>.json
        { "schemaVersion": 1, "region": "<region>", "seed": "<seed>",
          "places": [ <record>, ... ] }   # sorted by id

Record fields (0041 Part 2, field-for-field; * = required from birth, the
rest become required as `workflow` advances):

  identity        *id (place.<region>.<slug>), *name or namingRule, aliases
  classification  *taxonomy {class, family, type, variant?}, *magnitude
                  (M1–M5 or null for non-settlements), *status
                  (active|ruined|abandoned|seasonal|drowned|contested|cut)
  provenance      *provenance (canon-named|lore-implied|quest-required|
                  geography-derived|density-fill), *sources [..], *confidence
  why             *why {founding, siteAdvantages, occupantsMotive, pressures,
                  wouldChangeIf} — short form at derivation
  siting          *sitingPrefs {regionClasses, hardConstraints, preferences};
                  plotted+: position {u,v}, candidatesConsidered,
                  whySiteWon, scourSiteId?
  relations       relations {dependsOn, supplies, rivals, patrols, tolls,
                  visibleFrom, reachedVia, travelServiceEdges}
  people & power  culture, ownerFaction?, occupants (S-ladder semantic refs),
                  notableNpcSlots
  danger/access   *dangerTier, traversalModes, traversalFallback,
                  effortToReach (1–5)
  reward          rewardProfile {kinds, valueTier} (module 20 §12.3b)
  visual/vibe     vibe {silhouette, palette, materials, signatureFeature,
                  condition, mood, approach, senses}
  asset plan      assetPlan [inventory family refs] — feasible by construction
  discovery       *discovery (sightline|road|rumour|document|none)
  quest hooks     questHooks {provisions, tierOwnership}
  build-out keys  rumourPoolKey?, deedCounterKeys [], sockets
                  {scene:[], evidence:[], station:[], marks:[]}  — present
                  from v1 even when empty (buildout register)
  budget          *complexityBudget (trivial|simple|standard|complex —
                  "complex" needs justification; nothing beyond
                  Morrowind-level placement/scripting)
  importance      *importanceTier (0 = canon major … 4 = density fill)
  workflow        *workflow (derived|plotted|authored|frozen)

Determinism: files sorted by id; the loader rejects unsorted or duplicate
IDs. Permanence: `--check` compares against git HEAD and fails if any
previously committed id is missing (cut places must remain with
status "cut").

Run: python -m worldgen.catalogue --check   (from tooling/world-generation/)
"""

from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

SCHEMA_VERSION = 1

REPO_ROOT = Path(__file__).resolve().parents[3]
CATALOGUE_DIR = REPO_ROOT / "world" / "sources" / "catalogue"

STATUSES = {"active", "ruined", "abandoned", "seasonal", "drowned", "contested", "cut"}
PROVENANCES = {"canon-named", "lore-implied", "quest-required", "geography-derived", "density-fill"}
DISCOVERY = {"sightline", "road", "rumour", "document", "none"}
COMPLEXITY = {"trivial", "simple", "standard", "complex"}
WORKFLOW = ("derived", "plotted", "authored", "frozen")
MAGNITUDES = {None, "M1", "M2", "M3", "M4", "M5"}
SOCKET_KINDS = ("scene", "evidence", "station", "marks")

# Fields required at each workflow rung (cumulative).
REQUIRED_AT = {
    "derived": [
        "id", "classification", "provenance", "sources", "confidence", "why",
        "sitingPrefs", "dangerTier", "discovery", "complexityBudget",
        "importanceTier", "workflow", "status", "sockets", "deedCounterKeys",
    ],
    "plotted": ["position", "whySiteWon", "candidatesConsidered"],
    "authored": ["vibe", "assetPlan", "occupants", "rewardProfile", "relations"],
    "frozen": [],  # freeze is gated by 10b/10c checklists, not extra fields
}
WHY_KEYS = {"founding", "siteAdvantages", "occupantsMotive", "pressures", "wouldChangeIf"}


@dataclass
class RegionFile:
    path: Path
    region: str
    seed: str
    places: list[dict] = field(default_factory=list)


def _fail(errors: list[str], rec_id: str, msg: str) -> None:
    errors.append(f"{rec_id}: {msg}")


def load_taxonomy(catalogue_dir: Path = CATALOGUE_DIR) -> dict:
    path = catalogue_dir / "taxonomy.json"
    data = json.loads(path.read_text())
    if data.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"{path}: schemaVersion must be {SCHEMA_VERSION}")
    return data["classes"]


def taxonomy_resolves(classes: dict, c: dict) -> bool:
    fam = classes.get(c.get("class"), {})
    typ = fam.get(c.get("family"), {}) if isinstance(fam, dict) else {}
    if c.get("type") not in typ:
        return False
    variant = c.get("variant")
    return variant is None or variant in typ[c["type"]]


def load_region_files(catalogue_dir: Path = CATALOGUE_DIR) -> list[RegionFile]:
    out = []
    for path in sorted(catalogue_dir.glob("places-*.json")):
        data = json.loads(path.read_text())
        if data.get("schemaVersion") != SCHEMA_VERSION:
            raise ValueError(f"{path}: schemaVersion must be {SCHEMA_VERSION}")
        region = path.stem.removeprefix("places-")
        if data.get("region") != region:
            raise ValueError(f"{path}: region field must be '{region}'")
        out.append(RegionFile(path, region, data.get("seed", ""), data["places"]))
    return out


def validate_record(rec: dict, region: str, classes: dict, errors: list[str]) -> None:
    rid = rec.get("id", "<missing id>")
    wf = rec.get("workflow")
    if wf not in WORKFLOW:
        _fail(errors, rid, f"workflow must be one of {WORKFLOW}")
        return
    required: list[str] = []
    for rung in WORKFLOW[: WORKFLOW.index(wf) + 1]:
        required += REQUIRED_AT[rung]
    for key in required:
        if key not in rec or rec[key] is None:
            _fail(errors, rid, f"missing required field '{key}' at workflow '{wf}'")
    if not isinstance(rid, str) or not rid.startswith(f"place.{region}."):
        _fail(errors, rid, f"id must match place.{region}.<slug>")
    if "name" not in rec and "namingRule" not in rec:
        _fail(errors, rid, "needs name or namingRule")
    c = rec.get("classification", {})
    if c and not taxonomy_resolves(classes, c):
        _fail(errors, rid, f"classification {c} not in taxonomy.json")
    if c.get("magnitude", None) not in MAGNITUDES:
        _fail(errors, rid, "magnitude must be M1–M5 or null")
    if rec.get("status") not in STATUSES:
        _fail(errors, rid, f"status must be one of {sorted(STATUSES)}")
    if rec.get("provenance") not in PROVENANCES:
        _fail(errors, rid, f"provenance must be one of {sorted(PROVENANCES)}")
    if rec.get("discovery") not in DISCOVERY:
        _fail(errors, rid, f"discovery must be one of {sorted(DISCOVERY)}")
    if rec.get("complexityBudget") not in COMPLEXITY:
        _fail(errors, rid, f"complexityBudget must be one of {sorted(COMPLEXITY)}")
    if rec.get("complexityBudget") == "complex" and not rec.get("complexityJustification"):
        _fail(errors, rid, "complexityBudget 'complex' needs complexityJustification")
    if not isinstance(rec.get("importanceTier"), int) or not 0 <= rec["importanceTier"] <= 4:
        _fail(errors, rid, "importanceTier must be int 0–4")
    why = rec.get("why", {})
    if why and set(why) < WHY_KEYS:
        _fail(errors, rid, f"why must carry {sorted(WHY_KEYS)}")
    sockets = rec.get("sockets")
    if sockets is not None and (
        set(sockets) != set(SOCKET_KINDS) or not all(isinstance(sockets[k], list) for k in SOCKET_KINDS)
    ):
        _fail(errors, rid, f"sockets must carry exactly the {SOCKET_KINDS} lists (empty is fine)")
    if not isinstance(rec.get("deedCounterKeys", []), list):
        _fail(errors, rid, "deedCounterKeys must be a list")


def committed_ids(catalogue_dir: Path = CATALOGUE_DIR) -> set[str]:
    """IDs already committed at git HEAD — these may never disappear."""
    ids: set[str] = set()
    rel = catalogue_dir.relative_to(REPO_ROOT)
    ls = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", "HEAD", str(rel)],
        cwd=REPO_ROOT, capture_output=True, text=True,
    )
    for name in ls.stdout.split():
        if not Path(name).name.startswith("places-"):
            continue
        show = subprocess.run(
            ["git", "show", f"HEAD:{name}"], cwd=REPO_ROOT, capture_output=True, text=True
        )
        if show.returncode == 0:
            ids |= {p["id"] for p in json.loads(show.stdout).get("places", []) if "id" in p}
    return ids


def validate_catalogue(catalogue_dir: Path = CATALOGUE_DIR, check_permanence: bool = True) -> list[str]:
    errors: list[str] = []
    classes = load_taxonomy(catalogue_dir)
    seen: set[str] = set()
    for rf in load_region_files(catalogue_dir):
        ids = [p.get("id", "") for p in rf.places]
        if ids != sorted(ids):
            errors.append(f"{rf.path.name}: places must be sorted by id (determinism)")
        if not rf.seed:
            errors.append(f"{rf.path.name}: missing seed")
        for rec in rf.places:
            rid = rec.get("id", "")
            if rid in seen:
                errors.append(f"{rid}: duplicate id (province-wide uniqueness)")
            seen.add(rid)
            validate_record(rec, rf.region, classes, errors)
    if check_permanence:
        missing = committed_ids(catalogue_dir) - seen
        for rid in sorted(missing):
            errors.append(f"{rid}: committed id has DISAPPEARED — cut places keep their record with status 'cut'")
    return errors


def main() -> int:
    errors = validate_catalogue()
    for e in errors:
        print(f"catalogue: {e}", file=sys.stderr)
    n = sum(len(rf.places) for rf in load_region_files())
    print(f"catalogue: {n} places, {'FAIL' if errors else 'OK'}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

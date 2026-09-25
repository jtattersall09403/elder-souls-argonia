"""The acceptance freeze (decision 0100 decision 6).

`world/sources/placement/accepted-places.json` is the receipt for every place
the owner has walked and called right: its id, the owner's date, the hash of
its compiled settlement record and of its own patches, and the ground and kit
provenance the export recorded. Two rules read it:

1. **Frozen.** An accepted place whose compiled record or own patches would
   change fails the build (`check_frozen`), unless its entry carries
   `reopened: {on, reason}` (the owner's date and reason). A reopened place is
   under work again: every gate applies to it in full, and the next acceptance
   writes fresh hashes and drops `reopened`.
2. **Report mode for later gates.** A place gate added after a place's
   acceptance still runs on it, but lists instead of failing
   (`report_only`); the exporter writes those rows to
   `tooling/world-generation/output/accepted-report.json`, and they queue to
   the polish backlog, never into the accepted place.

Hashes are SHA-256 of canonical JSON (sorted keys, no whitespace), so a
reformatted file hashes the same and any changed value does not.

    python3 -m worldgen.accepted_places              # check every accepted place
    python3 -m worldgen.accepted_places --hash ID    # print the two hashes to record
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[3]
ACCEPTED_PATH = REPO_ROOT / "world" / "sources" / "placement" / "accepted-places.json"
SETTLEMENTS_DIR = Path(__file__).resolve().parents[1] / "output" / "settlements"
REPORT_PATH = Path(__file__).resolve().parents[1] / "output" / "accepted-report.json"
# The patch records a place can own (routes' grade patches are the route's).
PATCH_FILES = (
    REPO_ROOT / "world" / "sources" / "flora" / "vegetation-patches.json",
    REPO_ROOT / "world" / "sources" / "terrain" / "terrain-patches.json",
)
SCHEMA_VERSION = 1
REQUIRED_FIELDS = ("placeId", "acceptedOn", "compiledHash", "patchesHash", "authoredOn")


def canonical_sha256(value: object) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"),
                         ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def load(path: Path | None = None) -> dict[str, dict]:
    """Accepted entries by place id; a malformed receipt raises ValueError."""
    path = path or ACCEPTED_PATH
    if not path.exists():
        return {}
    doc = json.loads(path.read_text())
    if doc.get("schemaVersion") != SCHEMA_VERSION or not isinstance(doc.get("places"), list):
        raise ValueError(f"{path}: expected schemaVersion {SCHEMA_VERSION} and a places list")
    entries: dict[str, dict] = {}
    for row in doc["places"]:
        missing = [f for f in REQUIRED_FIELDS if not isinstance(row.get(f), str) or not row.get(f)]
        if missing:
            raise ValueError(f"{path}: entry {row.get('placeId')!r} lacks {missing}")
        reopened = row.get("reopened")
        if reopened is not None and not (isinstance(reopened, dict)
                                         and reopened.get("on") and reopened.get("reason")):
            raise ValueError(f"{path}: {row['placeId']} reopened needs {{on, reason}}")
        if row["placeId"] in entries:
            raise ValueError(f"{path}: {row['placeId']} is accepted twice")
        entries[row["placeId"]] = row
    return entries


def frozen(entries: dict[str, dict]) -> dict[str, dict]:
    """The accepted entries that are frozen now (not reopened)."""
    return {pid: row for pid, row in entries.items() if not row.get("reopened")}


def _owns(patch: dict, place_id: str) -> bool:
    owner = patch.get("owner")
    source = patch.get("source")
    pid = patch.get("id", "")
    return ((isinstance(owner, dict) and owner.get("record") == place_id)
            or (isinstance(source, dict) and place_id in (source.get("place"), source.get("placeId")))
            or f".{place_id}." in pid or pid.endswith(f".{place_id}"))


def load_patches(patch_files: Iterable[Path] = PATCH_FILES) -> list[tuple[str, list[dict]]]:
    """(file name, patches) for each patch file that exists: read once per check."""
    return [(path.name, json.loads(path.read_text()).get("patches", []))
            for path in patch_files if path.exists()]


def own_patches(place_id: str, patch_files: Iterable[Path] = PATCH_FILES,
                loaded: list[tuple[str, list[dict]]] | None = None) -> list[dict]:
    """Every patch record the place owns, sorted by (file name, id)."""
    loaded = load_patches(patch_files) if loaded is None else loaded
    rows = [{"file": name, "patch": patch}
            for name, patches in loaded for patch in patches if _owns(patch, place_id)]
    return sorted(rows, key=lambda r: (r["file"], r["patch"].get("id", "")))


def compiled_hash(compiled_doc: dict) -> str:
    return canonical_sha256(compiled_doc)


def patches_hash(place_id: str, patch_files: Iterable[Path] = PATCH_FILES,
                 loaded: list[tuple[str, list[dict]]] | None = None) -> str:
    return canonical_sha256(own_patches(place_id, patch_files, loaded))


def check_frozen(place_ids: Iterable[str] | None = None, *,
                 entries: dict[str, dict] | None = None,
                 compiled_docs: dict[str, dict] | None = None,
                 settlements_dir: Path = SETTLEMENTS_DIR,
                 patch_files: Iterable[Path] = PATCH_FILES) -> list[str]:
    """Violations: an accepted, not reopened place whose compiled record or own
    patches differ from the receipt. `place_ids` limits the check (a --places
    publish); None checks every accepted place. `compiled_docs` supplies the
    compile the caller is about to publish; otherwise it is read from
    `settlements_dir`. A missing compile of a frozen place is a violation: the
    place cannot be shown unchanged."""
    entries = load() if entries is None else entries
    scope = frozen(entries)
    if place_ids is not None:
        place_ids = set(place_ids)
        scope = {pid: row for pid, row in scope.items() if pid in place_ids}
    violations = []
    loaded = load_patches(patch_files) if scope else []
    for pid, row in sorted(scope.items()):
        doc = (compiled_docs or {}).get(pid)
        if doc is None:
            path = settlements_dir / f"{pid}.settlement.json"
            if not path.exists():
                violations.append(f"{pid}: accepted {row['acceptedOn']} but no compiled "
                                  f"record at {path}; recompile it (it must hash to the receipt)")
                continue
            doc = json.loads(path.read_text())
        now = compiled_hash(doc)
        if now != row["compiledHash"]:
            violations.append(
                f"{pid}: accepted {row['acceptedOn']} and frozen, but its compiled record "
                f"changed (hash {now[:12]} != receipt {row['compiledHash'][:12]}). "
                f"Undo the change, or have the owner reopen it (reopened: {{on, reason}} "
                f"in accepted-places.json, 0100 decision 6)")
        if patches_hash(pid, loaded=loaded) != row["patchesHash"]:
            violations.append(
                f"{pid}: accepted {row['acceptedOn']} and frozen, but its own patches "
                f"changed. Undo the change, or have the owner reopen it (0100 decision 6)")
    return violations


def report_only(place_id: str, gate_added_on: str, entries: dict[str, dict]) -> bool:
    """True when a gate added on `gate_added_on` runs on this place in report
    mode: the place is frozen and was accepted before the gate existed. ISO
    dates compare as strings."""
    row = frozen(entries).get(place_id)
    return row is not None and row["acceptedOn"] < gate_added_on


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--hash", metavar="PLACE_ID",
                    help="print the compiledHash and patchesHash to record for a place")
    args = ap.parse_args(argv)
    if args.hash:
        doc = json.loads((SETTLEMENTS_DIR / f"{args.hash}.settlement.json").read_text())
        print(json.dumps({"placeId": args.hash, "compiledHash": compiled_hash(doc),
                          "patchesHash": patches_hash(args.hash)}, indent=2))
        return 0
    violations = check_frozen()
    for v in violations:
        print(f"accepted_places: {v}", file=sys.stderr)
    print(f"accepted_places: {len(frozen(load()))} frozen place(s), "
          f"{len(violations)} violation(s)")
    return 1 if violations else 0


if __name__ == "__main__":
    raise SystemExit(main())

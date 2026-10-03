"""Region classes per architecture row of the asset registry.

Reads world/sources/assets/architecture-regions.json (rules grounded in the
source plugin's cells and the lore dossiers) and writes `regionClasses` and
`regionClassesSource` on every `category == "architecture"` row of
world/sources/assets/registry-*.jsonl. A row no rule grounds gets `[]` and the
id of the unsourced group that names it (each group is a row in the sourcing
register). `errors()` is the integrity check (standard 18).

    python3 -m worldgen.architecture_regions          # apply in place, print counts
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from worldgen.regions import REGION_CLASSES

REPO_ROOT = Path(__file__).resolve().parents[3]
ASSETS = REPO_ROOT / "world" / "sources" / "assets"
RULES_PATH = ASSETS / "architecture-regions.json"
VOCAB = {name for name, _ in REGION_CLASSES.values()}


def _matches(match: dict, row: dict) -> bool:
    if "pool" in match and row["pool"] != match["pool"]:
        return False
    if "culture" in match:
        want, have = match["culture"], row.get("cultures") or []
        if want == []:
            return not have
        want = [want] if isinstance(want, str) else want
        return bool(set(want) & set(have))
    return True


def tag(row: dict, rules: dict) -> dict:
    """Set regionClasses/regionClassesSource on one architecture row."""
    for rule in rules["rules"]:
        if _matches(rule["match"], row):
            row["regionClasses"] = list(rule["regionClasses"])
            row["regionClassesSource"] = rule["source"]
            return row
    for group in rules["unsourced"]:
        if _matches(group["match"], row):
            row["regionClasses"] = []
            row["regionClassesSource"] = f"unsourced:{group['id']}"
            return row
    row["regionClasses"] = []
    row["regionClassesSource"] = ""
    return row


def load_rules(path: Path = RULES_PATH) -> dict:
    return json.loads(path.read_text())


def apply(assets: Path = ASSETS, rules: dict | None = None) -> Counter:
    rules = rules or load_rules()
    counts: Counter = Counter()
    for path in sorted(assets.glob("registry-*.jsonl")):
        rows = [json.loads(line) for line in path.read_text().splitlines() if line]
        for row in rows:
            if row["category"] == "architecture":
                tag(row, rules)
                counts["tagged" if row["regionClasses"] else "empty"] += 1
        path.write_text("".join(json.dumps(r, separators=(",", ":")) + "\n" for r in rows))
    return counts


def errors(assets: Path = ASSETS, rules: dict | None = None) -> list[str]:
    """Every architecture row carries regionClasses from the vocabulary and a
    source; an empty list names an unsourced group that exists."""
    rules = rules or load_rules(assets / "architecture-regions.json")
    groups = {g["id"] for g in rules["unsourced"]}
    for rule in rules["rules"]:
        bad = set(rule["regionClasses"]) - VOCAB
        if bad:
            return [f"rule {rule['id']}: {sorted(bad)} are not region classes"]
    out: list[str] = []
    for path in sorted(assets.glob("registry-*.jsonl")):
        for line in path.read_text().splitlines():
            row = json.loads(line)
            if row["category"] != "architecture":
                continue
            rc, src = row.get("regionClasses"), row.get("regionClassesSource")
            if rc is None or not src:
                out.append(f"{row['id']}: architecture row without regionClasses and its source")
            elif set(rc) - VOCAB:
                out.append(f"{row['id']}: {sorted(set(rc) - VOCAB)} are not region classes")
            elif not rc and src.removeprefix("unsourced:") not in groups:
                out.append(f"{row['id']}: empty regionClasses with no unsourced group (register row)")
    return out


if __name__ == "__main__":
    print(dict(apply()))

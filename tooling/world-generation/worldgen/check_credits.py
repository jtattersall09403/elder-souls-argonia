"""Every asset pool we ship from must be credited in the root README.

The golden rule (CLAUDE.md, module 90 §73) is that a source's credit line goes
into the root README *in the same change that ships the asset* — a
provenance note in a pipeline doc is necessary but not sufficient, because the
README is the single list a credits review reads. Credits reviews have already
had to re-find gaps twice (decision 0024); this makes the gap a failing check
instead of a future archaeology exercise.

Checks, cheaply and without network:

1. every pool in the asset registry names a credit, and a recognisable piece
   of that credit appears in the README's credits section;
2. every kit config only names assets that exist in the registry, so a kit
   cannot ship an asset the registry (and therefore the credits) never saw.

Usage: python3 -m worldgen.check_credits
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
README = REPO_ROOT / "README.md"
REGISTRY_DIR = REPO_ROOT / "world" / "sources" / "assets"
KITS = REPO_ROOT / "tooling" / "asset-pipeline" / "pipeline" / "config" / "kits"

#: The distinctive phrase to look for per pool. Matching a whole credit line
#: would fail on punctuation; matching the project's name is what a reader
#: would check for.
POOL_CREDIT_MARKERS = {
    "bmv": "Black Marsh & Valenwood",
    "vanilla": "Skyrim vanilla assets",
    "tropical": "Tropical Skyrim",
    "xanmeer": "Argonian Xanmeer Tileset",
}


def credits_section(text: str) -> str:
    match = re.search(r"^## Credits and third-party sources$(.*)", text,
                      re.MULTILINE | re.DOTALL)
    return match.group(1) if match else ""


def check() -> list[str]:
    problems: list[str] = []
    if not README.exists():
        return [f"{README} is missing"]
    credits = credits_section(README.read_text())
    if not credits.strip():
        return ["README has no '## Credits and third-party sources' section"]

    summary_path = REGISTRY_DIR / "registry-summary.json"
    if not summary_path.exists():
        return [f"{summary_path} missing — run `worldgen.asset_registry build`"]
    pools = json.loads(summary_path.read_text())["pools"]

    known_ids: set[str] = set()
    for pool, entry in sorted(pools.items()):
        if not entry.get("credit"):
            problems.append(f"pool '{pool}' has no credit recorded in the registry")
        marker = POOL_CREDIT_MARKERS.get(pool)
        if marker is None:
            problems.append(
                f"pool '{pool}' has no credit marker — add one to "
                "POOL_CREDIT_MARKERS so the README can be checked for it"
            )
        elif marker not in credits:
            problems.append(
                f"pool '{pool}' ({entry['label']}) is registered with "
                f"{entry['registered']} assets but '{marker}' does not appear "
                "in the README's credits section"
            )
        path = REGISTRY_DIR / f"registry-{pool}.jsonl"
        if path.exists():
            with path.open() as fh:
                known_ids.update(json.loads(line)["id"] for line in fh)

    for config in sorted(KITS.glob("*.json")):
        kit = json.loads(config.read_text())
        for asset in kit.get("assets", []):
            # A COMPOSITE asset (round 7: the Anvil jungle trees) has no
            # registry row of its own — its id is ours. Credit follows the
            # geometry, so it is its PARTS that must be traceable, and an
            # empty parts list must not pass by vacuous truth.
            compose = asset.get("compose")
            sources = ([part["asset"] for part in compose["parts"]] if compose
                       else [asset["asset"]])
            if not sources:
                problems.append(
                    f"kit '{kit['id']}' ships {asset['asset']} with no source "
                    "parts — nothing to credit"
                )
            for source in sources:
                if source not in known_ids:
                    problems.append(
                        f"kit '{kit['id']}' ships {source}"
                        + (f" (in {asset['asset']})" if compose else "")
                        + ", which is not in the asset registry — it would be "
                        "uncredited"
                    )
    return problems


def main() -> None:
    problems = check()
    if problems:
        print("credits check FAILED:")
        for problem in problems:
            print(f"  - {problem}")
        sys.exit(1)
    print("credits check OK: every asset pool is credited in the root README")


if __name__ == "__main__":
    main()

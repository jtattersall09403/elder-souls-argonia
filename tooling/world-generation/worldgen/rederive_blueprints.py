"""Re-derive every blueprint's derived geometry against the terrain as it is.

    python3 -m worldgen.rederive_blueprints

A blueprint declares its ways as waypoints plus `routing: "terrain"`, and its
parcel footprints, district polygons, combat boundaries and door positions as
DERIVED from the placed pieces. The tools that derive them read the shipped
height and water rasters. So every time the chain re-carves the ground those
derivations go stale, `blueprint --check` rejects them as drift, and
`compile_settlement` refuses with "points are not the derived route".

Nothing in the chain re-derived them, so the fix was a person remembering to
run two commands per blueprint after every rebuild — and forgetting, three
times in one session. Re-deriving is not an authoring decision: the authored
thing is the waypoint list and the piece placement, and these tools only
recompute what the ground says follows from them. The validator still rejects a
hand-edited derived polygon exactly as before.

It belongs immediately before `compile_settlement`, which is the first consumer
that reads them.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from .catalogue import REPO_ROOT

BLUEPRINT_DIR = REPO_ROOT / "world" / "sources" / "blueprints"
#: `--orient` deliberately absent: turning a building to its door is a design
#: move that changes the massing, not a re-derivation of it.
PASSES = (("street_router", ["--apply"]),
          ("blueprint_footprints", ["--areas", "--doors"]))


def main(argv: list[str] | None = None) -> int:
    paths = sorted(BLUEPRINT_DIR.glob("place.*.json"))
    if not paths:
        print("rederive_blueprints: no blueprints found", file=sys.stderr)
        return 1
    worst = 0
    for path in paths:
        for module, flags in PASSES:
            proc = subprocess.run(
                [sys.executable, "-m", f"worldgen.{module}", *flags, str(path)],
                cwd=REPO_ROOT / "tooling" / "world-generation",
                capture_output=True, text=True)
            tail = (proc.stdout or proc.stderr).strip().splitlines()
            print(f"rederive_blueprints: {module} {path.name}: "
                  f"{tail[-1] if tail else 'no output'}")
            worst = max(worst, proc.returncode)
    return worst


if __name__ == "__main__":
    raise SystemExit(main())

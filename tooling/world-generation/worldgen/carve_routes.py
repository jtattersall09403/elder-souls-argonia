"""The road geometry the TERRAIN is carved for — a frozen snapshot, on purpose.

    python3 -m worldgen.carve_routes            # report drift
    python3 -m worldgen.carve_routes --promote  # recarve for today's networks

THE BUG THIS FIXES. The chain used to carve the ground along the PUBLISHED
route files and then, later in the same run, rewrite those files from that
ground: `reroute_majors` repairs every stretch of `routes.json` too steep to
walk, and `compile_minor_routes` re-solves `routes-minor.json` over the new
height grid. That is a cycle, not a pipeline. Two `--force` runs of the chain
on identical sources moved 147 of the 1,809 files it publishes, because run 2
carved the terrain for run 1's rewritten roads. Nothing could ever be declared
unchanged, so `chain_stages` could never skip a stage, the frozen sculpt kept
looking stale, and no byte-identical acceptance test on the province was
possible.

THE SHAPE OF THE FIX. Name which network is the *input*. The carve reads
frozen copies under `province/carve-inputs/`, which no chain stage rewrites;
the published files stay downstream of the carve, where they belong:

    society solves roads over the raw cost surface -> routes-natural.json
    carve-inputs/*.json  (frozen)                  -> the ground is carved
    the ground is graded, roads repaired, minor
    network re-solved on it                        -> routes.json, routes-minor.json

Majors are seeded from `routes-natural.json` (the pre-repair solver output)
rather than `routes.json` (the post-repair publication), because carving for
the repair means carving for a road that was only bent to avoid the uncarved
ground. `site_fields` already reads that same snapshot, for the same reason.

The snapshots are COMMITTED: a deterministic terrain build (engineering
standard 4) needs its inputs in the tree, not regenerated per machine.

PROMOTING. When you deliberately want the terrain recarved for the networks as
they now stand — a new road solved, a new minor network — run `--promote` and
then the chain. That re-runs `shape_province` and everything below it, which
is the honest cost of moving a road, and it is a decision someone takes rather
than a thing the chain does to itself every run. A plain chain run PRINTS the
drift and carries on with the frozen ground.

CLOSED 2026-09-11 (Phase 16b): `sculpt.corridor_and_anchor_mask` reads
`carve-inputs/sculpt-corridors.json`, a FROZEN_ONCE input that `--promote`
never touches, in the same change that re-froze the sculpt (decision 0059).
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
SNAP_DIR = "carve-inputs"

# frozen name -> the published file it is promoted FROM.
SOURCES = {
    "routes.json": ("routes-natural.json", "routes.json"),
    "routes-minor.json": ("routes-minor.json",),
    # the boat lanes `shape_province.resolve_portages` carves canoe channels
    # for; the published `waterways.json` is rewritten in place by
    # `reroute_lanes` from the water the carve makes (Phase 16b)
    "waterways.json": ("waterways-natural.json", "waterways.json"),
}
# Frozen ONCE: seeded on first use and never re-promoted by `--promote`.
# `sculpt.corridor_and_anchor_mask` reads its road corridors here; promoting
# it would re-stale the sculpt after every society re-solve, which is the
# cycle the freeze exists to end (Phase 16b, decision 0059). To re-seed it,
# delete the file and re-sculpt on purpose.
FROZEN_ONCE = {
    "sculpt-corridors.json": ("routes.json", "routes-natural.json"),
}


def _published(province: Path, name: str) -> Path | None:
    for candidate in {**SOURCES, **FROZEN_ONCE}[name]:
        path = province / candidate
        if path.exists():
            return path
    return None


def carve_source(name: str = "routes.json", province: Path = PROVINCE) -> Path | None:
    """The frozen file the carve may read, seeding it on first use.

    Seeding happens inside the carve stage, so the snapshot counts as that
    stage's own output and never as a file a later stage rewrote.
    """
    snap = province / SNAP_DIR / name
    if snap.exists():
        return snap
    src = _published(province, name)
    if src is None:
        return None
    snap.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, snap)
    return snap


def carve_polylines(province: Path = PROVINCE) -> list[list]:
    """The `px` polylines of the frozen MAJOR network, macro grid [x, y]."""
    snap = carve_source("routes.json", province)
    if snap is None:
        return []
    return [r.get("px", []) for r in json.loads(snap.read_text()).get("routes", [])]


def drift(province: Path = PROVINCE) -> list[str]:
    """Frozen names whose published counterpart has moved since promotion."""
    out = []
    for name in SOURCES:
        snap = province / SNAP_DIR / name
        src = _published(province, name)
        if snap.exists() and src is not None and snap.read_bytes() != src.read_bytes():
            out.append(name)
    return out


def warn_on_drift(province: Path = PROVINCE) -> None:
    moved = drift(province)
    if moved:
        print(f"carve-inputs: {', '.join(moved)} have moved since the terrain was "
              f"carved for them; the carve is using the frozen copies. Run "
              f"`python3 -m worldgen.carve_routes --promote` to recarve.")


def promote(province: Path = PROVINCE) -> list[str]:
    done = []
    for name in SOURCES:
        src = _published(province, name)
        if src is None:
            continue
        snap = province / SNAP_DIR / name
        snap.parent.mkdir(parents=True, exist_ok=True)
        if not snap.exists() or snap.read_bytes() != src.read_bytes():
            shutil.copyfile(src, snap)
            done.append(f"{name} <- {src.name}")
    return done


def main(argv: list[str] | None = None) -> None:
    args = list(argv if argv is not None else sys.argv[1:])
    if "--promote" in args:
        done = promote()
        print("carve-inputs: already current" if not done
              else "carve-inputs promoted:\n  " + "\n  ".join(done)
                   + "\n  Run the chain: shape_province and everything below it rebuilds.")
        return
    moved = drift()
    print("carve-inputs: current — the terrain is carved for the published networks"
          if not moved else "carve-inputs: STALE for " + ", ".join(moved))


if __name__ == "__main__":
    main()

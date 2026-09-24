"""Print the pytest file list for a worldgen suite, by DIRECTORY, not by hand.

Why this exists (16h item 6, 2026-09-22). `test:placement` used to name its
forty modules one by one in package.json. Of the 129 `test_*.py` files under
`worldgen/`, the two hand lists between them named 50: seventy-nine test files
were collected by no gate at all, and a test file added by a new agent joined
them silently unless someone remembered to edit a shell string in package.json.
A gate that does not see a test is not a gate.

So the placement suite is now "every test module under `worldgen/`, except the
water suite", and the water suite is the one list left — it is a list because
it is a genuinely separate gate: preflight runs the two in different waves
(memory, `tooling/repo-standards/preflight.mjs`), and running the heavy water
modules twice would cost both the time and the RAM the wave split exists to
save. Everything not named here is placement, so a NEW test file is collected
without touching package.json.

Usage: python3 scripts/select_tests.py placement|water   (from tooling/world-generation)
"""
from __future__ import annotations

import sys
from pathlib import Path

WORLDGEN = Path(__file__).resolve().parents[1] / "worldgen"

# The water gate's own modules (npm run test:water). Add a module here only if
# it belongs to the water suite; anything else is collected by placement.
WATER_SUITE = (
    "test_water.py",
    "test_water_invariants.py",
    "test_reroute_lanes.py",
    "test_hydrology_graph.py",
    "test_terrain_preconditions.py",
    "test_terrain_patches.py",
    "test_freeze.py",
    "test_chain_settles.py",
    "test_shape_province.py",
    "test_sculpt.py",
)


def select(suite: str) -> list[str]:
    modules = sorted(p.name for p in WORLDGEN.glob("test_*.py"))
    if suite == "water":
        chosen = [m for m in modules if m in WATER_SUITE]
        unknown = sorted(set(WATER_SUITE) - set(modules))
        if unknown:
            raise SystemExit(
                f"select_tests: WATER_SUITE names {unknown}, which no longer exist "
                f"under {WORLDGEN}; delete the row or restore the module")
        return chosen
    if suite == "placement":
        return [m for m in modules if m not in WATER_SUITE]
    raise SystemExit(f"select_tests: unknown suite {suite!r} (placement|water)")


def main() -> None:
    suite = sys.argv[1] if len(sys.argv) > 1 else "placement"
    print(" ".join(f"worldgen/{name}" for name in select(suite)))


if __name__ == "__main__":
    main()

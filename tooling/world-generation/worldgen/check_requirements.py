"""Every module ``requirements-test.txt`` declares imports, or this fails loudly.

16h round 16 (planner ruling 6, 2026-09-24): ``rtree`` was missing from the
user site while declared, and ``mine_mounts`` only failed deep inside a trimesh
query. Preflight runs this as its ``python-deps`` gate and the deploy workflow
runs it right after installing the file, so a missing module is one named red
line, never a skipped or crashing suite.

Usage:
  python3 -m worldgen.check_requirements
"""

from __future__ import annotations

import importlib
import re
import sys
from pathlib import Path

REQUIREMENTS = Path(__file__).resolve().parents[1] / "requirements-test.txt"
IMPORT_NAMES = {"pillow": "PIL", "scikit-image": "skimage", "pytest-xdist": "xdist"}
"""Distribution name -> import name where they differ."""


def declared(path: Path = REQUIREMENTS) -> list[str]:
    """The distribution names the file declares (comments and pins stripped)."""
    names = []
    for line in path.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            names.append(re.split(r"[<>=!~\[; ]", line, maxsplit=1)[0].casefold())
    return names


def missing(path: Path = REQUIREMENTS) -> list[tuple[str, str]]:
    """``(distribution, error)`` for each declared module that does not import."""
    failed = []
    for name in declared(path):
        try:
            importlib.import_module(IMPORT_NAMES.get(name, name.replace("-", "_")))
        except Exception as error:  # noqa: BLE001 - any import failure is the finding
            failed.append((name, f"{type(error).__name__}: {error}"))
    return failed


def main() -> int:
    failed = missing()
    for name, error in failed:
        print(f"FAIL python dependency {name}: {error} "
              f"(pip install -r tooling/world-generation/requirements-test.txt)")
    if not failed:
        print(f"python dependencies: all {len(declared())} in requirements-test.txt import")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

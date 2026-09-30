"""`wb.py coplanar`: the z-fighting measure. The core lives in
tooling/world-generation/worldgen/coplanar.py (the interior exporter's
`separate` pass reads the same code); this module re-exports it."""
import sys

from workbench import paths

if str(paths.WORLDGEN) not in sys.path:
    sys.path.insert(0, str(paths.WORLDGEN))

from worldgen.coplanar import *  # noqa: E402,F401,F403

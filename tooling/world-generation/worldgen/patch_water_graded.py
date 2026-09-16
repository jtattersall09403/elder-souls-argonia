"""The water gate over the route-grade patches (16e): `patch_water --graded`
as its own chain stage, because the chain keys a stage's arguments by name
and `patch_water` already runs once, over the place patches, above this."""
from __future__ import annotations

import sys

from .patch_water import main as _main

if __name__ == "__main__":
    sys.exit(_main(["--graded", *sys.argv[1:]]))

"""Phase 6b entry point: sculpt the province base terrain (see sculpt.py).

Writes `heightfield-sculpted-f32.npy` (+ sculpt-meta.json) next to the raw
heightfield in the vault. compile_hydrology / refine_province then consume it
automatically via condition.base_terrain. Rerun the downstream chain after
this: compile_hydrology -> compile_society -> refine_province ->
compile_chunks -> export_web_chunks.

Usage:
  python3 -m worldgen.sculpt_province <heightfield-f32.npy>
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

from .condition import condition
from .sculpt import SEED, sculpt


def main() -> None:
    height_path = Path(sys.argv[1])
    t0 = time.time()
    full = condition(np.flipud(np.load(height_path)))
    rng = np.random.default_rng(SEED)
    z, report = sculpt(full, rng)
    out = height_path.parent / "heightfield-sculpted-f32.npy"
    np.save(out, z)
    report["elapsedS"] = round(time.time() - t0, 1)
    report["source"] = height_path.name
    (height_path.parent / "sculpt-meta.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    print(f"-> {out}")


if __name__ == "__main__":
    main()

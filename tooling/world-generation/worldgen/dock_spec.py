"""What a dock promises the water — the constants the CARVE needs, kept apart
from the blueprint validator that also uses them.

`authored_waterways` and `dock_dredge` are terrain stages: they cut channels
into the province. They needed exactly three things from `blueprint` — the
hull-depth table, the depth sample distance and the blueprint directory — and
importing `blueprint` for them dragged the whole settlement stack into their
code fingerprint (`blueprint -> street_router -> site_fields -> compile_water`,
42 modules). The effect was that editing the WATER COMPILER dirtied
`refine_province`, and a compile-only change rebuilt the entire province: 451 s
to move no ground at all.

So the constants live here, in a leaf module that imports nothing from
worldgen. `blueprint` re-exports them, so every existing reader is unchanged.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
BLUEPRINT_DIR = REPO_ROOT / "world" / "sources" / "blueprints"

# 97 B5 / G9 — the depth a berth must carry for the deepest hull it serves,
# sampled DOCK_DEPTH_SAMPLE_M off the dock along the route that serves it.
HULL_CLASS_DEPTH_M = {"canoe": 0.6, "small-draft": 1.2, "keeled": 3.0}
DOCK_DEPTH_SAMPLE_M = 100.0

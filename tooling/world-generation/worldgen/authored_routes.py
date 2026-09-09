"""Hand-authored road and track centrelines the route publishers honour exactly.

This is the ROAD counterpart of `authored-minor-waterways.json` /
`worldgen.authored_waterways`, and it deliberately copies that contract rather
than inventing a second convention:

* the line lives in `world/sources/routes/authored-routes.json` as an ABSOLUTE
  metre-space polyline, independent of any published raster, so nothing that
  reads it is validating a solve against its own output;
* a named way's authored geometry is PUBLISHED EXACTLY — it is not a hint, a
  seed or a waypoint list. `reroute_majors` will not re-solve an authored
  road's steep stretches and `compile_minor_routes` will not re-trace an
  authored track: the line the author drew is the line the world gets;
* every entry carries a `why` — a world record, written against the place
  catalogue and reviewed under the `text-review` skill before commit
  (engineering standard 12: the sentence describes the record, it does not
  excuse the solver).

WHEN TO AUTHOR A LINE, AND WHEN NOT TO
--------------------------------------
An override is for a corridor whose RIGHT line is a design fact the cost
surface cannot hold: a road that must call at a shrine, a causeway that must
follow a built embankment, an approach the lore fixes. It is NOT the remedy
for a way whose over-cap windows are sub-metre surface roughness — measured
2026-09-09, that is what the "badly routed" Blackrose roads turned out to be
(see `docs/polish-backlog.md`), and hand-drawing the same corridor changes
nothing, because the router and the author both read the 5.48 m grid while the
grader measures the full-resolution ground. Check which you have before
authoring: if the line is right on the router's own height field, the fault is
downstream of routing and an override only hides it.

The file ships EMPTY on purpose. An empty override list is the honest state of
a province whose corridors are all solver-chosen; the mechanism exists so the
next genuinely awkward corridor is a data edit rather than a code change.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .scale import PROVINCE_EXTENT_M

REPO_ROOT = Path(__file__).resolve().parents[3]
AUTHORED_ROUTES_PATH = REPO_ROOT / "world" / "sources" / "routes" / "authored-routes.json"
SCHEMA_VERSION = 1
MIN_WHY_CHARS = 40


def _digest(payload: dict) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()[:16]


def _point(value, label: str, errors: list[str]) -> list[float] | None:
    if (not isinstance(value, (list, tuple)) or len(value) != 2
            or any(not isinstance(v, (int, float)) or isinstance(v, bool) for v in value)):
        errors.append(f"{label} must be [x, z] in metres")
        return None
    return [float(value[0]), float(value[1])]


def load_authored_routes(path: Path = AUTHORED_ROUTES_PATH,
                         extent_m: float = PROVINCE_EXTENT_M) -> tuple[list[dict], list[str]]:
    """Load the authored centrelines. Returns (rows sorted by id, errors).

    A missing file is not an error: the province simply has no overrides.
    """
    if not path.exists():
        return [], []
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [], [f"cannot load authored routes: {exc}"]
    errors: list[str] = []
    out: list[dict] = []
    seen: set[str] = set()
    for index, row in enumerate(document.get("routes") or []):
        route_id = row.get("id")
        if not isinstance(route_id, str) or not route_id or route_id in seen:
            errors.append(f"routes[{index}].id must be unique and non-empty")
            continue
        seen.add(route_id)
        points: list[list[float]] = []
        for point_index, value in enumerate(row.get("pointsM") or []):
            point = _point(value, f"{route_id}.pointsM[{point_index}]", errors)
            if point is None:
                continue
            if not 0 <= point[0] <= extent_m or not 0 <= point[1] <= extent_m:
                errors.append(f"{route_id}.pointsM[{point_index}] lies outside the province")
            points.append(point)
        if len(points) < 2:
            errors.append(f"{route_id} needs at least two authored points")
            continue
        why = row.get("why")
        if not isinstance(why, str) or len(why.strip()) < MIN_WHY_CHARS:
            errors.append(f"{route_id}.why must record why this line is drawn by hand")
            continue
        payload = {"id": route_id, "pointsM": points, "why": why.strip(),
                   "source": row.get("source")}
        out.append({**payload, "contentDigest": _digest(payload)})
    return sorted(out, key=lambda row: row["id"]), errors


def load_by_id(path: Path = AUTHORED_ROUTES_PATH) -> dict[str, dict]:
    """{way id: authored row}. Raises on an invalid file — a line that cannot be
    parsed must stop the publisher, not be silently skipped."""
    rows, errors = load_authored_routes(path)
    if errors:
        raise ValueError("invalid authored routes: " + "; ".join(errors))
    return {row["id"]: row for row in rows}


def to_px(row: dict, px_m: float, grid_n: int) -> list[list[int]]:
    """The authored metre polyline as a dense, 8-connected grid-px chain.

    The publishers store px on the hydrology grid, so the authored line is
    rasterised the same way a solved one is: one cell per step, duplicates
    dropped, ends kept. The METRES stay in the source file — this is a
    projection of the authored line, never a replacement for it.
    """
    pts = [(p[0] / px_m, p[1] / px_m) for p in row["pointsM"]]
    out: list[list[int]] = []
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        steps = max(int(round(max(abs(bx - ax), abs(by - ay)))), 1)
        for i in range(steps + 1):
            t = i / steps
            c = min(max(int(round(ax + (bx - ax) * t)), 0), grid_n - 1)
            r = min(max(int(round(ay + (by - ay) * t)), 0), grid_n - 1)
            if not out or out[-1] != [c, r]:
                out.append([c, r])
    return out

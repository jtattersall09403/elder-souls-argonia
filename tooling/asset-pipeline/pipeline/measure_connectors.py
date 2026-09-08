"""Measure each kit piece's CONNECTOR FACES — where it was made to join.

Owner observation 2026-09-08 (97 G19): Lilmoth's north gate read as "a gate
arch, a tower and two wall stubs placed next to each other". A kit's snap
grammar was prose in the kit config, so nothing could say where a piece's
joining face is, and `abuts` meant only "these two are allowed to be close".
This module is the measurement half of the fix: per kit it writes
``<kit>.connectors.json`` beside ``<kit>.footprints.json``, and
``worldgen.blueprint_integration``'s ``abuts-snap`` check holds every declared
`abuts` pair to a face-to-face coincidence of two of these connectors.

A connector is::

  {"face": "<name>", "positionInPiece": [x, z], "normalDeg": <bearing>,
   "widthM": w, "heightM": h, "evidence": "co-placement" | "bounds"}

Frame — the SAME frame the footprints use, so a consumer needs no conversion:
the piece's local ground plane ``(x, z)`` in metres, centred on the pivot
``compile_settlement`` places, x = east, z = south. ``normalDeg`` is the
OUTWARD bearing of the face, degrees clockwise from north (north = −z), so a
parcel's world-space connector is ``centre + R(yawDeg)·positionInPiece`` with
normal ``yawDeg + normalDeg``.

Two kinds of evidence, in this order of preference:

  co-placement — the authors' own answer. ``kit-assemblies-mined.json`` holds,
    per pair of pieces the source plugins placed together at a repeated
    relative offset and yaw, the modal offset and that yaw. Where the two
    pivots sit d metres apart the join is at the midpoint: a connector goes on
    the anchor at ``offset/2``, facing along the offset, and the matching one
    on the part at the same world point expressed in the part's frame. This is
    exact by construction — a chain laid on these connectors reproduces the
    spacing the author used — and it is why the check's tolerance can be
    tight.

  bounds — for pieces no plugin in the mined sets places (whole mods, e.g. the
    Morrowind Imperial keep set, have no mined plugin), the faces come from the
    measured plan outline's local bounding box. A piece whose plan is at least
    ``ELONGATION`` times as long as it is wide is a RUN module — a wall, rail,
    quay or curtain — and takes two connectors, one on each end face of the
    long axis. Anything squarer is a tower, corner or gate block and takes four,
    one per bounding face; that is also what gives a gate its two road faces.
    ``widthM`` is the face's own extent, ``heightM`` the piece height.

  Where both exist for the same face the co-placement one wins and the bounds
  one is dropped (same position within ``MERGE_POS_M``, same normal within
  ``MERGE_DEG``).

Deterministic: assets sorted by id, connectors sorted by (normalDeg, x, z),
numbers rounded to 2 dp / 1 dp.

Run (from the repo root):
  python3 -m pipeline.measure_connectors                 # every measured kit
  python3 -m pipeline.measure_connectors --kit imperial-keep
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
KITS_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"
ASSEMBLIES = REPO_ROOT / "world" / "sources" / "placement" / "kit-assemblies-mined.json"
SCHEMA_VERSION = 1

# A pair whose pivots sit closer than this is dressing sitting on/in its host,
# not two pieces meeting on a face.
MIN_SPAN_M = 1.0
# A co-placement whose rise dominates is a stack (a deck on its piles), not a
# ground-plane join; `stacksOn` covers those.
MAX_RISE_M = 3.0
# a template the miner saw fewer times than this is not a grammar
MIN_COUNT = 3
ELONGATION = 2.0
MERGE_POS_M = 0.30
MERGE_DEG = 5.0
# co-placements on the same bearing to within this are the same face
BEARING_BUCKET_DEG = 10.0


def _bearing(dx: float, dz: float) -> float:
    """Compass bearing (clockwise from north, north = -z) of a local vector."""
    return math.degrees(math.atan2(dx, -dz)) % 360.0


def _rotate(x: float, z: float, deg: float) -> tuple[float, float]:
    """Rotate a local (x, z) point CLOCKWISE on the map by `deg`."""
    r = math.radians(deg)
    c, s = math.cos(r), math.sin(r)
    return x * c - z * s, x * s + z * c


def _bbox(poly) -> tuple[float, float, float, float]:
    xs = [p[0] for p in poly]
    zs = [p[1] for p in poly]
    return min(xs), min(zs), max(xs), max(zs)


def _extent_across(poly, normal_deg: float) -> float:
    """Extent of the outline PERPENDICULAR to a face normal (the face width)."""
    r = math.radians(normal_deg)
    # unit vector along the face = normal turned 90 deg
    ax, az = math.cos(r), math.sin(r)   # (dx, dz) of normal+90 in (x, -z) terms
    vals = [p[0] * ax + p[1] * az for p in poly]
    return max(vals) - min(vals) if vals else 0.0


def _connector(face: str, x: float, z: float, normal: float,
               width: float, height: float, evidence: str,
               extra: dict | None = None) -> dict:
    rec = {
        "face": face,
        "positionInPiece": [round(x, 2), round(z, 2)],
        "normalDeg": round(normal % 360.0, 1),
        "widthM": round(max(width, 0.0), 2),
        "heightM": round(max(height, 0.0), 2),
        "evidence": evidence,
    }
    if extra:
        rec.update(extra)
    return rec


def _same_face(a: dict, b: dict) -> bool:
    ax, az = a["positionInPiece"]
    bx, bz = b["positionInPiece"]
    if math.hypot(ax - bx, az - bz) > MERGE_POS_M:
        return False
    d = abs(a["normalDeg"] - b["normalDeg"]) % 360.0
    return min(d, 360.0 - d) <= MERGE_DEG


# --------------------------------------------------------------------------- #
# evidence: the authors' own co-placements
# --------------------------------------------------------------------------- #
def load_templates(path: Path = ASSEMBLIES) -> list[dict]:
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    out = []
    for set_name in sorted(data.get("sets", {})):
        for t in data["sets"][set_name].get("templates", []) or []:
            out.append(t)
    return sorted(out, key=lambda t: t["id"])


def coplacement_connectors(kit_asset_ids: set[str], templates: list[dict],
                           footprints: dict) -> dict[str, list[dict]]:
    """Connector faces implied by the pairs the source authors placed touching."""
    # One template per (anchor, part, bearing): the SHORTEST span on a bearing
    # is the face join. The authors also place the same pair two and three
    # modules apart on that same bearing, and a multiple of the pitch is a
    # chain of joins, not a face — halving it would put a connector inside the
    # neighbouring module.
    shortest: dict[tuple, dict] = {}
    for t in templates:
        anchor, part = t.get("anchor"), t.get("part")
        if anchor not in kit_asset_ids or part not in kit_asset_ids:
            continue
        if t.get("isDoor") or int(t.get("count", 0)) < MIN_COUNT:
            continue
        ox, oy, _oz = (list(t.get("offsetM") or [0, 0, 0]) + [0, 0, 0])[:3]
        rise = float(t.get("riseM") or 0.0)
        span = math.hypot(float(ox), float(oy))
        if span < MIN_SPAN_M or abs(rise) > MAX_RISE_M:
            continue
        key = (anchor, part, round(_bearing(float(ox), -float(oy)) / BEARING_BUCKET_DEG))
        prev = shortest.get(key)
        if prev is None or span < prev[0]:
            shortest[key] = (span, t)

    out: dict[str, list[dict]] = {}
    for _key, (_span, t) in sorted(shortest.items(), key=lambda kv: kv[1][1]["id"]):
        anchor, part = t["anchor"], t["part"]
        ox, oy = float(t["offsetM"][0]), float(t["offsetM"][1])
        # mined frame is the plugin's: x east, y north. The footprint frame is
        # x east, z SOUTH, so y flips sign.
        lx, lz = float(ox), -float(oy)
        cx, cz = lx / 2.0, lz / 2.0
        normal = _bearing(lx, lz)
        fa = footprints.get(anchor) or {}
        fb = footprints.get(part) or {}
        pa = fa.get("planOutlineM") or []
        pb = fb.get("planOutlineM") or []
        width = min([w for w in (_extent_across(pa, normal), _extent_across(pb, normal)) if w > 0]
                    or [0.0])
        height = min([h for h in (float(fa.get("heightM") or 0.0),
                                  float(fb.get("heightM") or 0.0)) if h > 0] or [0.0])
        extra = {"pairedWith": part, "template": t["id"], "count": int(t.get("count", 0))}
        out.setdefault(anchor, []).append(
            _connector(f"toward {normal:.0f}", cx, cz, normal, width, height,
                       "co-placement", extra))
        # the same world point, in the PART's frame: it sits at -offset/2 from
        # the part's pivot, rotated back out of the part's own yaw.
        yaw = float(t.get("yawDeg") or 0.0)
        px, pz = _rotate(-cx, -cz, -yaw)
        pnormal = (normal + 180.0 - yaw) % 360.0
        extra_b = {"pairedWith": anchor, "template": t["id"], "count": int(t.get("count", 0))}
        out.setdefault(part, []).append(
            _connector(f"toward {pnormal:.0f}", px, pz, pnormal, width, height,
                       "co-placement", extra_b))
    return out


# --------------------------------------------------------------------------- #
# evidence: the mesh bounds
# --------------------------------------------------------------------------- #
def bounds_connectors(record: dict) -> list[dict]:
    poly = record.get("planOutlineM") or record.get("footprintM") or []
    if len(poly) < 3:
        return []
    x0, z0, x1, z1 = _bbox(poly)
    w = x1 - x0
    d = z1 - z0
    height = float(record.get("heightM") or 0.0)
    if min(w, d) <= 0.01:
        return []
    faces = [
        ("east", x1, (z0 + z1) / 2.0, 90.0, d),
        ("west", x0, (z0 + z1) / 2.0, 270.0, d),
        ("north", (x0 + x1) / 2.0, z0, 0.0, w),
        ("south", (x0 + x1) / 2.0, z1, 180.0, w),
    ]
    if max(w, d) / min(w, d) >= ELONGATION:
        # a run module: only the two END faces of the long axis join.
        keep = {"east", "west"} if w > d else {"north", "south"}
        faces = [f for f in faces if f[0] in keep]
    return [_connector(name, fx, fz, normal, width, height, "bounds")
            for name, fx, fz, normal, width in faces]


# --------------------------------------------------------------------------- #
def measure_kit(kit_name: str, kits_dir: Path = KITS_DIR,
                templates: list[dict] | None = None) -> dict:
    fp_path = kits_dir / f"{kit_name}.footprints.json"
    footprints = json.loads(fp_path.read_text()).get("assets", {})
    templates = load_templates() if templates is None else templates
    co = coplacement_connectors(set(footprints), templates, footprints)

    assets: dict[str, list[dict]] = {}
    counts = {"co-placement": 0, "bounds": 0}
    for asset_id in sorted(footprints):
        record = footprints[asset_id]
        conns: list[dict] = []
        for c in sorted(co.get(asset_id, []),
                        key=lambda c: (-c.get("count", 0), c["template"], c["normalDeg"])):
            if not any(_same_face(c, k) for k in conns):
                conns.append(c)
        for c in bounds_connectors(record):
            if not any(_same_face(c, k) for k in conns):
                conns.append(c)
        conns.sort(key=lambda c: (c["normalDeg"], c["positionInPiece"][0], c["positionInPiece"][1]))
        for c in conns:
            counts[c["evidence"]] += 1
        assets[asset_id] = conns

    return {
        "schemaVersion": SCHEMA_VERSION,
        "kit": kit_name,
        "elongationRatio": ELONGATION,
        "counts": {"assets": len(assets), **counts},
        "assets": assets,
    }


def kit_names(kits_dir: Path = KITS_DIR) -> list[str]:
    return sorted(p.name.removesuffix(".footprints.json")
                  for p in kits_dir.glob("*.footprints.json"))


def write_kit(kit_name: str, kits_dir: Path = KITS_DIR,
              templates: list[dict] | None = None) -> Path:
    data = measure_kit(kit_name, kits_dir, templates)
    out = kits_dir / f"{kit_name}.connectors.json"
    out.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--kit", action="append", default=None)
    ap.add_argument("--kits-dir", default=str(KITS_DIR))
    args = ap.parse_args()

    kits_dir = Path(args.kits_dir)
    templates = load_templates()
    for name in args.kit or kit_names(kits_dir):
        out = write_kit(name, kits_dir, templates)
        c = json.loads(out.read_text())["counts"]
        print(f"measure_connectors: {out.name} — {c['assets']} assets, "
              f"{c['co-placement']} co-placement, {c['bounds']} bounds")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

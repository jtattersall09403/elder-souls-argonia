"""Site packet: everything step 0 of a place build reads, in one file (16k S13).

    python3 -m worldgen.site_packet --id <place-id> [--stdout]

Writes ``tooling/.reports/16k/<place-id>/site-packet.json`` and prints a
short digest. The packet holds (place-build SKILL step 0, method review F3):
the catalogue record; its promise ledger rows and the quest rows that name
it; the lore dossier files its sources cite, with their key lines; the route
seams (published roads and tracks within 500 m, their terminals, the ford and
water crossings, travel stations and berths); the neighbours within 500 m
(seams) and 2 km (decision 0098); the type sheet; the lessons rows for the
type. Anything a builder must know and cannot find here is a packet gap.
Read-only over the sources; deterministic apart from ``writtenAt``.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from .atomic_write import atomic_write_bytes

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_VERSION = 1
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
SOURCES = REPO_ROOT / "world" / "sources"
SKILL = REPO_ROOT / ".claude" / "skills" / "place-build" / "references"
REPORTS = REPO_ROOT / "tooling" / ".reports" / "16k"
SEAM_M = 500.0            # the place's seams (SKILL step 0)
NEIGHBOUR_M = 2000.0      # 0098: never one assembly twice within 2 km
LORE_KEY_LINES = 8


def _rel(p: Path) -> str:
    return str(Path(p).relative_to(REPO_ROOT))


def _xz(pos) -> tuple[float, float] | None:
    if isinstance(pos, (list, tuple)) and len(pos) >= 2:
        return float(pos[0]), float(pos[-1])
    return None


def _bearing(dx: float, dz: float) -> float:
    return round(math.degrees(math.atan2(dx, -dz)) % 360.0, 0)   # north = -z


def catalogue_records() -> tuple[dict[str, dict], dict[str, str]]:
    from . import catalogue
    recs, files = {}, {}
    for region in catalogue.load_region_files():
        for rec in region.places:
            recs[rec["id"]] = rec
            files[rec["id"]] = _rel(region.path)
    return recs, files


def promises(place_id: str) -> dict:
    path = SOURCES / "placement" / "promises" / f"{place_id}.json"
    if not path.exists():
        return {"file": None, "rows": [], "gap": "no promise ledger (blueprint_promises --id --write)"}
    doc = json.loads(path.read_text(encoding="utf-8"))
    rows = [{k: r.get(k) for k in ("id", "kind", "text", "unfilled")} for r in doc.get("promises", [])]
    return {"file": _rel(path), "rows": rows}


def quest_rows(place_id: str) -> list[dict]:
    out = []
    for path in sorted((SOURCES / "quests").glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        for q in doc.get("quests", []) if isinstance(doc, dict) else []:
            if place_id in json.dumps(q):
                out.append({"file": _rel(path), "id": q.get("id"), "code": q.get("code"),
                            "title": q.get("title"), "status": q.get("status"),
                            "premise": q.get("premise")})
    return out


def lore(rec: dict) -> list[dict]:
    """The lore dossiers (world/sources/lore/**.md) that name a page the record
    cites (``uesp:Lore:X`` → ``Lore:X``) or the place's name, with the lines
    that do (at most LORE_KEY_LINES each)."""
    pages = sorted({s.split(":", 1)[1].split(" (")[0] for s in rec.get("sources") or []
                    if isinstance(s, str) and s.startswith("uesp:")})
    name = rec.get("name") or ""
    out = []
    for path in sorted((SOURCES / "lore").rglob("*.md")):
        text = path.read_text(encoding="utf-8")
        cited = [p for p in pages if p in text]
        if not cited and not (name and name in text):
            continue
        keys = [f"{i}: {ln.strip()[:240]}" for i, ln in enumerate(text.splitlines(), 1)
                if (name and name in ln) or any(p in ln for p in cited)][:LORE_KEY_LINES]
        out.append({"file": _rel(path), "cites": cited, "namesPlace": bool(name and name in text),
                    "keyLines": keys})
    # a dossier that names the place outranks one that only shares a cited page
    out.sort(key=lambda d: (not d["namesPlace"], -len(d["cites"]), d["file"]))
    return out


def _polyline_near(pts_m: list[tuple[float, float]], x: float, z: float) -> tuple[float, list]:
    best, at = math.inf, None
    for i in range(len(pts_m) - 1):
        (ax, az), (bx, bz) = pts_m[i], pts_m[i + 1]
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / L2))
        px, pz = ax + t * dx, az + t * dz
        d = math.hypot(px - x, pz - z)
        if d < best:
            best, at = d, [round(px, 1), round(pz, 1)]
    if len(pts_m) == 1:
        best, at = math.hypot(pts_m[0][0] - x, pts_m[0][1] - z), list(pts_m[0])
    return best, at


def route_seams(place_id: str, x: float, z: float) -> dict:
    from .province_network import _px_to_m      # cell centres, (c + 0.5) * px_m
    meta = json.loads((PROVINCE / "meta.json").read_text(encoding="utf-8"))
    mpp = float(meta["metresPerPixel"])
    ways = []
    major = json.loads((PROVINCE / "routes.json").read_text(encoding="utf-8"))
    minor = json.loads((PROVINCE / "routes-minor.json").read_text(encoding="utf-8"))
    for kind, rows in (("major", major.get("routes", [])), ("minor", minor.get("tracks", []))):
        for r in rows:
            px = r.get("px") or []
            if not px:
                continue
            pts = list(_px_to_m(px, mpp))
            d, at = _polyline_near(pts, x, z)
            if d > SEAM_M:
                continue
            ends = [pts[0], pts[-1]]
            ways.append({"id": r["id"], "network": kind, "class": r.get("class") or r.get("kind"),
                         "name": r.get("name"), "from": r.get("from"), "to": r.get("to"),
                         "nearestM": round(d, 1), "nearestAt": at,
                         "terminalHere": any(math.hypot(ex - x, ez - z) <= SEAM_M for ex, ez in ends)
                         or place_id in (r.get("from"), r.get("to"))})
    ways.sort(key=lambda w: (w["nearestM"], w["id"]))
    crossings = []
    doc = json.loads((PROVINCE / "crossings.json").read_text(encoding="utf-8"))
    for c in doc.get("crossings", []):
        p = _xz(c.get("positionM"))
        if p and math.hypot(p[0] - x, p[1] - z) <= SEAM_M:
            crossings.append({k: c.get(k) for k in ("id", "wayName", "band", "water", "entityId",
                                                   "positionM", "spanM", "maxDepthM", "servesRoutes")})
    ts = json.loads((SOURCES / "routes" / "travel-services.json").read_text(encoding="utf-8"))
    stations = []
    for s in ts.get("stations", []):
        p = _xz(s.get("positionM"))
        near = p is not None and math.hypot(p[0] - x, p[1] - z) <= SEAM_M
        if near or place_id in json.dumps(s):
            stations.append({"id": s.get("id"), "kind": s.get("kind"), "positionM": s.get("positionM"),
                             "piece": s.get("piece"), "berth": s.get("berth")})
    services = [{"id": s.get("id"), "form": s.get("form"), "landings": s.get("landings"),
                 "operator": s.get("operator")}
                for s in ts.get("services", []) if place_id in json.dumps(s)]
    return {"ways": ways, "crossings": crossings, "stations": stations, "services": services,
            "sources": ["apps/world-studio/public/province/routes.json",
                        "apps/world-studio/public/province/routes-minor.json",
                        "apps/world-studio/public/province/crossings.json",
                        "world/sources/routes/travel-services.json"]}


def neighbours(place_id: str, x: float, z: float, recs: dict[str, dict]) -> list[dict]:
    out = []
    for rid, r in recs.items():
        p = _xz(r.get("positionM"))
        if rid == place_id or p is None:
            continue
        d = math.hypot(p[0] - x, p[1] - z)
        if d <= NEIGHBOUR_M:
            c = r.get("classification") or {}
            out.append({"id": rid, "name": r.get("name"), "type": c.get("type"),
                        "family": c.get("family"), "magnitude": c.get("magnitude"),
                        "culture": r.get("culture"), "status": r.get("status"),
                        "distanceM": round(d, 0), "bearingDeg": _bearing(p[0] - x, p[1] - z),
                        "seam": d <= SEAM_M})
    return sorted(out, key=lambda n: (n["distanceM"], n["id"]))


def type_sheet(rec_type: str | None) -> dict:
    """The type sheet whose table names the record's catalogue type in backticks."""
    for path in sorted((SKILL / "types").glob("[0-9][0-9]-*.md")):
        if rec_type and f"`{rec_type}`" in path.read_text(encoding="utf-8"):
            return {"file": _rel(path), "number": int(path.name[:2])}
    return {"file": None, "number": None,
            "gap": f"no type sheet names `{rec_type}` (references/types/)"}


def lessons(number: int | None, rec_type: str | None) -> dict:
    """Rows of the lessons store (references/lessons/<section>.md, split by
    section under decision 0106) tagged for the type (they name `type N`,
    the type sheet's number, or the record's catalogue type); the rows that
    name no type apply to every place and are listed by id."""
    path = SKILL / "lessons.md"
    tagged, general = [], []
    type_ref = re.compile(r"\btypes? (\d)(?: or (\d))?\b")
    lines = [ln for f in [path, *sorted((SKILL / "lessons").glob("*.md"))]
             for ln in f.read_text(encoding="utf-8").splitlines()]
    for ln in lines:
        m = re.match(r"\| (L\d+) \|", ln)
        if not m:
            continue
        named = {int(n) for hit in type_ref.findall(ln) for n in hit if n}
        if (number is not None and number in named) or (rec_type and rec_type in ln):
            tagged.append(ln)
        elif not named:
            general.append(m.group(1))
    return {"file": _rel(path), "tagged": tagged, "generalIds": general}


def build(place_id: str) -> dict:
    recs, files = catalogue_records()
    rec = recs.get(place_id)
    if rec is None:
        raise SystemExit(f"site_packet: no catalogue record {place_id}")
    x, z = _xz(rec.get("positionM")) or (math.nan, math.nan)
    cls = rec.get("classification") or {}
    sheet = type_sheet(cls.get("type"))
    stem = place_id.rsplit(".", 1)[-1]
    own = {k: _rel(p) for k, p in (
        ("siteDossier", SOURCES / "sites" / "dossiers" / f"{stem}.md"),
        ("designBrief", SOURCES / "blueprints" / f"{stem}.design.md"),
        ("layout", SOURCES / "blueprints" / f"{stem}.layout.json"),
        ("blueprint", SOURCES / "blueprints" / f"{place_id}.json"),
        ("registerDigest", SOURCES / "placement" / "register-digest.md")) if p.exists()}
    return {
        "schemaVersion": SCHEMA_VERSION,
        "placeId": place_id,
        "writtenAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "writtenBy": "worldgen.site_packet",
        "record": {"file": files[place_id], "value": rec},
        "promises": promises(place_id),
        "questRows": quest_rows(place_id),
        "questProvisions": (rec.get("questHooks") or {}).get("provisions") or [],
        "lore": lore(rec),
        "routeSeams": route_seams(place_id, x, z),
        "neighbours": neighbours(place_id, x, z, recs),
        "typeSheet": sheet,
        "lessons": lessons(sheet.get("number"), cls.get("type")),
        "ownFiles": own,
    }


def digest(p: dict) -> list[str]:
    n = p["neighbours"]
    rs = p["routeSeams"]
    rec = p["record"]["value"]
    return [
        f"site packet {p['placeId']} ({rec.get('name')}, {(rec.get('classification') or {}).get('type')}, "
        f"{(rec.get('classification') or {}).get('magnitude')})",
        f"  promises {len(p['promises']['rows'])}, quest rows {len(p['questRows'])}, "
        f"lore dossiers {len(p['lore'])} ({', '.join(d['file'].rsplit('/', 1)[-1] for d in p['lore'][:4])})",
        f"  ways within {SEAM_M:.0f} m {len(rs['ways'])} "
        f"({', '.join(w['id'] for w in rs['ways'][:4])}), crossings {len(rs['crossings'])}, "
        f"stations {len(rs['stations'])}, services {len(rs['services'])}",
        f"  neighbours: {sum(1 for x in n if x['seam'])} within {SEAM_M:.0f} m, {len(n)} within "
        f"{NEIGHBOUR_M / 1000:.0f} km",
        f"  type sheet {p['typeSheet'].get('file') or p['typeSheet'].get('gap')}; lessons tagged "
        f"{len(p['lessons']['tagged'])}, general {len(p['lessons']['generalIds'])}",
    ]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python3 -m worldgen.site_packet")
    ap.add_argument("--id", required=True)
    ap.add_argument("--stdout", action="store_true", help="print the whole packet instead")
    a = ap.parse_args(argv)
    t0 = time.perf_counter()
    packet = build(a.id)
    out = REPORTS / a.id / "site-packet.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(out, (json.dumps(packet, indent=1, sort_keys=True) + "\n").encode("utf-8"),
                       0o644)
    if a.stdout:
        print(json.dumps(packet, indent=1, sort_keys=True))
    else:
        print("\n".join(digest(packet)))
        print(f"  -> {_rel(out)} ({time.perf_counter() - t0:.2f} s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

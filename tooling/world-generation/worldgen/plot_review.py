"""Write the "Plot review" numbers section of the 16g ledger.

Numbers only: this tool measures what the macro plot did to the catalogue
(moves, cuts, re-types, merges, re-references, city layouts, density) against
a git ref for the "before" positions, and writes ONE markdown section into a
ledger file, replacing that section if it is already there. The reasoning
under each table is written by hand afterwards — the tool leaves a
"Reasoning:" placeholder so the section is never silently unexplained.

    python3 -m worldgen.plot_review [--before HEAD] [--report PATH]
        [--out docs/research/phase16/16g-ledger.md] [--section "## 2. Plot review"]
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
from pathlib import Path

from worldgen.catalogue import CATALOGUE_DIR, REPO_ROOT, load_region_files

LIVE_STATUSES = {"active", "ruined", "abandoned", "seasonal", "drowned",
                 "contested", "under-construction"}
DENSITY_LAYERS = ("fine-tempo", "landmark", "destination")
LOW_TIERS = {"D0", "D1", "D2", "D3"}
HIGH_TIERS = {"D4", "D5"}
DEFAULT_REPORT = REPO_ROOT / "world" / "sources" / "sites" / "macro-plot.json"
DEFAULT_OUT = REPO_ROOT / "docs" / "research" / "phase16" / "16g-ledger.md"
DEFAULT_SECTION = "## 2. Plot review"
PLACEHOLDER = "Reasoning: _(to be written by hand)_"


# ---------------------------------------------------------------- helpers
def _r1(v) -> str:
    return "—" if v is None else f"{float(v):.1f}"


def _pos(rec) -> tuple | None:
    p = rec.get("positionM")
    if isinstance(p, (list, tuple)) and len(p) == 2:
        return (float(p[0]), float(p[1]))
    return None


def _fmt_pos(p) -> str:
    return "—" if p is None else f"{p[0]:.1f}, {p[1]:.1f}"


def _dist(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _quantile(sorted_vals: list[float], q: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    pos = q * (len(sorted_vals) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (pos - lo)


def _first_clause(text: str) -> str:
    t = (text or "").strip()
    for sep in (". ", "; "):
        if sep in t:
            t = t.split(sep, 1)[0]
    return t.rstrip(".").replace("|", "/")[:160]


def _refs(rec) -> tuple:
    rel = rec.get("relations") or {}
    return (tuple(rel.get("reachedVia") or ()), tuple(rel.get("travelServiceEdges") or ()))


def _polygon_area_m2(poly) -> float | None:
    if not isinstance(poly, list) or len(poly) < 3:
        return None
    a = 0.0
    for i, p in enumerate(poly):
        q = poly[(i + 1) % len(poly)]
        a += p[0] * q[1] - q[0] * p[1]
    return abs(a) / 2.0


def load_before(ref: str, regions: list[str]) -> dict[str, dict]:
    """{id: record} for every region file as it stands at `ref`."""
    out: dict[str, dict] = {}
    for region in regions:
        rel = f"world/sources/catalogue/places-{region}.json"
        try:
            blob = subprocess.run(["git", "show", f"{ref}:{rel}"], cwd=REPO_ROOT,
                                  capture_output=True, text=True, check=True).stdout
        except subprocess.CalledProcessError:
            continue                      # a region file that did not exist at `ref`
        for rec in json.loads(blob).get("places", []):
            out[rec["id"]] = rec
    return out


def _table(header: list[str], rows: list[list[str]], empty: str) -> list[str]:
    if not rows:
        return [empty, ""]
    out = ["| " + " | ".join(header) + " |",
           "|" + "|".join("---" for _ in header) + "|"]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    out.append("")
    return out


# ---------------------------------------------------------------- section
def build_section(after_files, before: dict[str, dict], report: dict,
                  zone_area_km2: dict[str, float] | None,
                  heading: str = DEFAULT_SECTION) -> str:
    after = {rec["id"]: rec for f in after_files for rec in f.places}
    region_of = {rec["id"]: f.region for f in after_files for rec in f.places}
    live = [r for r in after.values() if r.get("status") in LIVE_STATUSES]
    demand = report.get("demand") or {}
    seeding = report.get("seeding") or {}
    resited = {e.get("id"): e.get("reason") or e.get("why") or ""
               for e in (seeding.get("reSited") or []) if isinstance(e, dict)}
    tsv = report.get("typedSitingViolations")
    tsv_n = len(tsv) if isinstance(tsv, list) else (tsv if isinstance(tsv, int) else "see report")

    L: list[str] = [heading, ""]
    L.append(
        f"Live records {len(live)}; plotted {demand.get('plotted', '—')}; "
        f"homeless {demand.get('homelessUnresolved', report.get('homeless', '—'))}; "
        f"typed-siting violations {tsv_n} (closing pass needs the solve result — see report); "
        f"dead route fraction {report.get('routeVisibility', {}).get('deadFraction', '—')}; "
        f"seeding mode `{seeding.get('mode', '—')}`.")
    L.append("")

    # 2. moves
    L += ["### Moves by region", ""]
    moves: list[tuple] = []          # (metres, id, region, from, to, why)
    per_region: dict[str, list[float]] = {}
    for rid, rec in after.items():
        b = before.get(rid)
        if not b:
            continue
        pa, pb = _pos(rec), _pos(b)
        if pa is None or pb is None:
            if pa is None and pb is None:
                continue
            d = float("nan")
        else:
            d = _dist(pa, pb)
            if d < 1e-6:
                continue
        why = resited.get(rid) or _first_clause(rec.get("whySiteWon") or "")
        moves.append((d, rid, region_of[rid], _fmt_pos(pb), _fmt_pos(pa), why))
        per_region.setdefault(region_of[rid], []).append(0.0 if d != d else d)
    rows = []
    for region in sorted(per_region):
        ds = sorted(per_region[region])
        rows.append([region, len(ds), _r1(_quantile(ds, 0.5)), _r1(_quantile(ds, 0.9)), _r1(ds[-1])])
    L += _table(["region", "moved", "median m", "p90 m", "max m"], rows, "No record moved.")
    L += ["Fifteen largest moves:", ""]
    top = sorted(moves, key=lambda m: (-(m[0] if m[0] == m[0] else 0.0), m[1]))[:15]
    L += _table(["id", "type", "from", "to", "m", "why"],
                [[f"`{m[1]}`", after[m[1]].get("classification", {}).get("type", "—"),
                  m[3], m[4], _r1(m[0]), m[5]] for m in top], "No record moved.")
    L += [PLACEHOLDER, ""]

    # 3. status changes
    L += ["### Status changes", ""]
    rows = [[f"`{rid}`", region_of[rid], before[rid].get("status"), rec.get("status")]
            for rid, rec in sorted(after.items())
            if rid in before and before[rid].get("status") != rec.get("status")]
    L += _table(["id", "region", "before", "after"], rows, "No status changed.")
    L += [PLACEHOLDER, ""]

    # 4. re-types
    L += ["### Re-types", ""]
    rows = [[f"`{rid}`", region_of[rid], before[rid].get("classification", {}).get("type"),
             rec.get("classification", {}).get("type")]
            for rid, rec in sorted(after.items())
            if rid in before and before[rid].get("classification", {}).get("type")
            != rec.get("classification", {}).get("type")]
    L += _table(["id", "region", "before", "after"], rows, "No record changed type.")
    L += [PLACEHOLDER, ""]

    # 5. merges
    L += ["### Merges (design groups)", ""]
    groups: dict[str, list[str]] = {}
    for rid, rec in sorted(after.items()):
        g = rec.get("designGroup")
        if g:
            groups.setdefault(g if isinstance(g, str) else json.dumps(g, sort_keys=True), []).append(rid)
    L += _table(["designGroup", "members", "ids"],
                [[f"`{g}`", len(ids), ", ".join(f"`{i}`" for i in ids)]
                 for g, ids in groups.items()], "No record carries a designGroup.")
    L += [PLACEHOLDER, ""]

    # 6. re-references
    L += ["### Re-references (reachedVia / travelServiceEdges)", ""]
    rows = []
    for rid, rec in sorted(after.items()):
        if rid not in before:
            continue
        ba, aa = _refs(before[rid]), _refs(rec)
        if ba != aa:
            rows.append([f"`{rid}`", region_of[rid],
                         ", ".join(ba[0]) or "—", ", ".join(aa[0]) or "—",
                         ", ".join(str(x) for x in ba[1]) or "—",
                         ", ".join(str(x) for x in aa[1]) or "—"])
    L += _table(["id", "region", "reachedVia before", "reachedVia after",
                 "travelServiceEdges before", "travelServiceEdges after"],
                rows, "No route reference changed.")
    L += [PLACEHOLDER, ""]

    # 7. city layouts
    L += ["### The city layouts", ""]
    rows = []
    for rid, rec in sorted(after.items()):
        cl = rec.get("cityLayout")
        if not cl:
            continue
        gate, centre, way = cl.get("gate"), cl.get("centre"), cl.get("way") or []
        gc = _dist(gate, centre) if gate and centre else None
        wl = sum(_dist(way[i], way[i + 1]) for i in range(len(way) - 1)) if len(way) > 1 else 0.0
        area = _polygon_area_m2(rec.get("footprintPolygon"))
        pos = _pos(rec)
        at_centre = "yes" if (pos and centre and _dist(pos, centre) <= 1.0) else "no"
        rows.append([f"`{rid}`", _fmt_pos(gate), _fmt_pos(centre), _r1(gc), _r1(wl),
                     "—" if area is None else f"{area / 10000.0:.1f}",
                     _r1(rec.get("footprintRadiusM")), at_centre])
    L += _table(["id", "gate", "centre", "gate→centre m", "way m", "polygon ha",
                 "footprintRadiusM", "positionM == centre"],
                rows, "No record carries a cityLayout.")
    L += [PLACEHOLDER, ""]

    # 8. density per zone
    L += ["### Density per zone", ""]
    rows = []
    prov_named = 0
    for region in sorted({f.region for f in after_files}):
        named = [r for r in live if region_of[r["id"]] == region
                 and r.get("densityLayer") in DENSITY_LAYERS]
        prov_named += len(named)
        km2 = (zone_area_km2 or {}).get(region)
        lo = sum(1 for r in named if r.get("dangerTier") in LOW_TIERS)
        hi = sum(1 for r in named if r.get("dangerTier") in HIGH_TIERS)
        per = (lambda n: "—" if not km2 else f"{n / km2:.1f}")
        rows.append([region, len(named),
                     *[sum(1 for r in named if r.get("densityLayer") == la) for la in DENSITY_LAYERS],
                     "—" if km2 is None else f"{km2:.1f}", per(len(named)),
                     f"{lo} / {per(lo)}", f"{hi} / {per(hi)}",
                     ("—" if not km2 else
                      ("ok" if 18 <= lo / km2 <= 22 and 8 <= hi / km2 <= 12 else "out"))])
    L += _table(["zone", "named", *DENSITY_LAYERS, "land km²", "per km²",
                 "D0–D3 n / per km² (18–22)", "D4–D5 n / per km² (8–12)", "gate"],
                rows, "No live named record.")
    L.append(f"Province total named live records of the three layers: {prov_named} "
             f"(gate 550–750: {'ok' if 550 <= prov_named <= 750 else 'out'}).")
    L += ["", PLACEHOLDER, ""]

    # 9. Clark-Evans
    ce = report.get("clarkEvans") or {}
    L += ["### Clark–Evans", "", f"Median R = {ce.get('median', '—')}; "
          f"zones evener than random: {', '.join(ce.get('zonesEvenerThanRandom') or []) or 'none'}.", ""]
    L += _table(["zone", "n", "area km²", "mean NN m", "expected m", "R"],
                [[z, v.get("n"), v.get("areaKm2"), _r1(v.get("meanNearestM")),
                  _r1(v.get("expectedM")), v.get("R")]
                 for z, v in sorted((ce.get("byZone") or {}).items())],
                "The report carries no clarkEvans block.")
    L += [PLACEHOLDER, ""]
    return "\n".join(L).rstrip() + "\n"


def write_section(out_path: Path, section: str, heading: str) -> None:
    """Replace the block headed `heading` (up to the next '## '), else append."""
    text = out_path.read_text() if out_path.exists() else ""
    lines = text.splitlines()
    start = next((i for i, ln in enumerate(lines) if ln.strip() == heading), None)
    if start is None:
        body = (text.rstrip() + "\n\n" if text.strip() else "") + section
    else:
        end = next((j for j in range(start + 1, len(lines))
                    if lines[j].startswith("## ")), len(lines))
        body = "\n".join(lines[:start]).rstrip()
        body = (body + "\n\n" if body else "") + section
        tail = "\n".join(lines[end:]).strip()
        if tail:
            body += "\n" + tail + "\n"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(body)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--before", default="HEAD")
    ap.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--section", default=DEFAULT_SECTION)
    ap.add_argument("--catalogue-dir", type=Path, default=CATALOGUE_DIR)
    args = ap.parse_args(argv)

    files = load_region_files(args.catalogue_dir)
    report = json.loads(args.report.read_text())
    before = load_before(args.before, [f.region for f in files])
    try:
        from worldgen.plot_stats import zone_land_area_m2
        from worldgen.site_fields import shared_survey
        areas = {k: v / 1e6 for k, v in zone_land_area_m2(shared_survey()).items()}
    except Exception as exc:                       # rasters not published here
        print(f"zone land areas unavailable ({exc}); density per km² left blank")
        areas = None
    section = build_section(files, before, report, areas, args.section)
    write_section(args.out, section, args.section)
    print(f"wrote {args.section!r} to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

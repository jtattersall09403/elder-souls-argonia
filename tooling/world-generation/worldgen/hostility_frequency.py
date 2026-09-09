"""How often does the player meet a fight? — hostility FREQUENCY by danger band.

    cd tooling/world-generation
    python3 -m worldgen.hostility_frequency

WHY (owner, 2026-09-04)
-----------------------
The share of hostile/clearable places (56 %) says nothing about how often a
player actually runs into one. The owner's model: *frequency* of hostility is
at least Morrowind's everywhere (fewer fights near cities, more on the road
and in the wilds), and the danger BAND sets the *difficulty* of what you meet,
not whether you meet it. So the measure is per band, two ways:

  * area:   hostile-or-clearable places per km² of land in that band
            (Morrowind: ≈ 300 hostile places on ~20 km² ≈ 15 / km²; research
            doc morrowind-content-density §1–2, place-purpose-hostility §8b)
  * travel: walking or boating every route, how far between fights — the
            mean spacing (m) between DISTINCT hostile places within
            ENCOUNTER_M of the route, per band of the ground under the route
            (a place met on two routes counts once per route: two journeys,
            two encounters).
            Morrowind's felt figure is "something named every 200–300 m of
            road" with ~3 in 4 of those hostile ⇒ a fight every ~300–400 m.

Places only. Roaming creatures and encounter sockets (Phase 13) will add to
every band; this report is what the PLACED world gives before them.

The 15/km² figure is a PREFERENCE, not a gate (owner, 2026-09-09): it is held
in balance against the rest, and a band may fall short where holding it would
make the world worse. Nothing here fails a build, and a shortfall is closed
with encounters, not by adding placed records to move a statistic. Where a
band is too small for density to be a stable measure, the report says so and
tests the spacing instead — see DENSITY_MIN_AREA_KM2.

OUTPUT
------
  world/sources/sites/hostility-frequency.md   (report)
  tooling/world-generation/output/hostility-frequency.json (gitignored sidecar)
Deterministic: pure function of committed data.
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np

from . import catalogue
from .site_fields import PROVINCE, ProvinceSurvey

REPORT = catalogue.REPO_ROOT / "world" / "sources" / "sites" / "hostility-frequency.md"
SIDECAR = Path(__file__).resolve().parents[1] / "output" / "hostility-frequency.json"

ENCOUNTER_M = 300.0        # a hostile place this close to the route is "on the way"
SPARSE_M = 350.0           # land further than this from any fight is a gap (450 → 350, round 4: the province is dense)
EDGE_M = 350.0             # province border apron ignored for gaps
CROWD_M = 250.0            # a route-side fight with ≥ CROWD_N others inside this is "crowded"
CROWD_N = 2
OFF_ROUTE_M = 320.0        # further than this from every route counts as off-route
STEP_M = 50.0              # route sampling step
MORROWIND_PER_KM2 = 15.0   # ≈ 300 hostile places / 20 km²
MORROWIND_SPACING_M = 350.0

# Density is a poor estimator on a small band, so it is not the binding test
# there — spacing is, and spacing is also what the player actually feels.
#
# The threshold is derived, not picked. One hostile record moves a band's
# density by 1/landKm2 per km². We call the density unreliable once a single
# record swings it by more than DENSITY_SWING_TOL_PER_KM2 — an eighth of the
# 15/km² preference — which puts the boundary at 1/2.0 = 0.5 km². On the
# shipped bake only D1 (0.24 km², 3 hostile) falls below it: one record there
# is worth ±4.2/km², against ±0.3/km² in D2 and ±0.06/km² in D3. The Poisson
# relative standard error tells the same story: 1/sqrt(3) = 58% for D1 against
# 13% for D2.
DENSITY_SWING_TOL_PER_KM2 = 2.0
DENSITY_MIN_AREA_KM2 = 1.0 / DENSITY_SWING_TOL_PER_KM2   # 0.5 km²
DUNGEON_KINDS = {"delve", "dungeon", "complex", "warren"}


def is_hostile(rec: dict) -> bool:
    h = rec.get("hostility") or {}
    it = rec.get("interior") or {}
    return h.get("baseline") == "hostile" or bool(h.get("clearable")) or it.get("kind") in DUNGEON_KINDS


def is_combat_flip(rec: dict) -> bool:
    """Not hostile on arrival, but has a typed flip TO hostile (trespass, theft…)."""
    h = rec.get("hostility") or {}
    return any(f.get("to") == "hostile" for f in h.get("flips") or [] if isinstance(f, dict))


def load_routes() -> list[tuple[str, str, list[tuple[int, int]]]]:
    """(kind, id, px) for every route geometry the studio draws."""
    out = []
    for fname, key, kind in (("routes.json", "routes", "road"), ("waterways.json", "lanes", "boat"),
                             ("routes-minor.json", "tracks", "track"), ("waterways-minor.json", "channels", "channel")):
        p = PROVINCE / fname
        if not p.exists():
            continue
        d = json.loads(p.read_text(encoding="utf-8"))
        for g in d.get(key) or []:
            px = [(int(c), int(r)) for c, r in g.get("px") or []]
            if len(px) >= 2:
                out.append((kind, g.get("id") or f"{kind}:{g.get('from')}-{g.get('to')}", px, g.get("kind") or kind))
    return out


def resample(px: list[tuple[int, int]], m_per_px: float, step_m: float) -> list[tuple[float, float]]:
    pts = [(c * m_per_px, r * m_per_px) for c, r in px]
    out = [pts[0]]
    acc = 0.0
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        seg = math.hypot(x1 - x0, z1 - z0)
        if seg == 0:
            continue
        while acc + seg >= step_m:
            t = (step_m - acc) / seg
            x0, z0 = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
            out.append((x0, z0))
            seg = math.hypot(x1 - x0, z1 - z0)
            acc = 0.0
        acc += seg
    return out


def build_report() -> dict:
    s = ProvinceSurvey()
    m_per_px = s.grid_px_m
    cell_km2 = (m_per_px / 1000.0) ** 2
    # The denominator of every /km2 figure the owner reads, so it is MEASURED,
    # not classified (decision 0049). `water_class` is a TYPE label over a
    # superset of the wet area, so reading land off it drops dry ground from
    # the denominator and inflates every band's rate. The size of that error is
    # measured below rather than quoted, because the water compiler keeps
    # tuning the class dilation (`CLASS_EXT_PX`, `CLASS_EXT_RISE_M`) and a
    # hardcoded figure here would quietly go stale after every bake.
    land = s.dry_grid                              # signed depth <= 0
    class_land = np.isin(s.water_class, (0, 5))
    class_error = {
        "measuredLandKm2": round(float(land.sum()) * cell_km2, 2),
        "classLandKm2": round(float(class_land.sum()) * cell_km2, 2),
        "dryGroundTheClassRasterDropsKm2": round(float((land & ~class_land).sum()) * cell_km2, 2),
        "standingWaterTheClassRasterCallsLandKm2":
            round(float((class_land & ~land).sum()) * cell_km2, 2),
    }
    bands = {}
    for b in range(1, 6):
        bands[b] = {"landKm2": float(((s.danger == b) & land).sum() * cell_km2), "places": 0,
                    "hostile": 0, "flipsToHostile": 0, "settlements": 0}

    live = []
    for rf in catalogue.load_region_files():
        for rec in rf.places:
            if rec.get("status") in {"cut", "deferred"} or not rec.get("positionM"):
                continue
            live.append((rf.region, rec))
    hostile_pts = []
    for region, rec in live:
        x, z = rec["positionM"]
        col, row = min(int(x / m_per_px), s.grid_n - 1), min(int(z / m_per_px), s.grid_n - 1)
        b = int(s.danger[row, col])
        if b not in bands:
            continue
        bands[b]["places"] += 1
        if rec["classification"]["class"] == "settlement":
            bands[b]["settlements"] += 1
        if is_hostile(rec):
            bands[b]["hostile"] += 1
            hostile_pts.append((x, z, rec["id"], b, region))
        elif is_combat_flip(rec):
            bands[b]["flipsToHostile"] += 1
    hx = np.array([p[0] for p in hostile_pts]) if hostile_pts else np.zeros(0)
    hz = np.array([p[1] for p in hostile_pts]) if hostile_pts else np.zeros(0)

    # travel measure: per band, route km and distinct hostile places met
    travel = {b: {"routeKm": 0.0, "fightsMet": 0, "byKind": defaultdict(float)} for b in bands}
    per_route = []
    for kind, rid, px, sub in load_routes():
        # the travel measure walks the NETWORK a player follows — roads, boat
        # lanes and cart tracks; the footpath spur to a place is the place
        if not (kind in ("road", "boat") or sub in ("track", "causeway")):
            continue
        pts = resample(px, m_per_px, STEP_M)
        met: set[str] = set()
        km_by_band = defaultdict(float)
        for x, z in pts:
            col, row = min(int(x / m_per_px), s.grid_n - 1), min(int(z / m_per_px), s.grid_n - 1)
            b = int(s.danger[row, col])
            if b in travel:
                travel[b]["routeKm"] += STEP_M / 1000.0
                travel[b]["byKind"][kind] += STEP_M / 1000.0
                km_by_band[b] += STEP_M / 1000.0
            if len(hx):
                d = np.hypot(hx - x, hz - z)
                for i in np.nonzero(d <= ENCOUNTER_M)[0]:
                    pid = hostile_pts[i][2]
                    if pid not in met:
                        met.add(pid)
                        if b in travel:
                            travel[b]["fightsMet"] += 1
        km = len(pts) * STEP_M / 1000.0
        per_route.append({"id": rid, "kind": kind, "km": round(km, 2), "fights": len(met),
                          "spacingM": round(km * 1000.0 / len(met)) if met else None,
                          "bands": {str(b): round(v, 2) for b, v in sorted(km_by_band.items())}})

    rows = []
    for b in range(1, 6):
        a = bands[b]
        t = travel[b]
        per_km2 = a["hostile"] / a["landKm2"] if a["landKm2"] else 0.0
        spacing = (t["routeKm"] * 1000.0 / t["fightsMet"]) if t["fightsMet"] else None
        rows.append({
            "band": b, "landKm2": round(a["landKm2"], 2), "places": a["places"], "settlements": a["settlements"],
            "hostile": a["hostile"], "flipsToHostile": a["flipsToHostile"],
            "hostilePerKm2": round(per_km2, 1), "placesPerKm2": round(a["places"] / a["landKm2"], 1) if a["landKm2"] else 0.0,
            "routeKm": round(t["routeKm"], 1), "fightsMet": t["fightsMet"],
            "spacingM": round(spacing) if spacing else None,
            "routeKmByKind": {k: round(v, 1) for k, v in sorted(t["byKind"].items())},
            "shortfallToMorrowindArea": max(0, math.ceil(MORROWIND_PER_KM2 * a["landKm2"] - a["hostile"])),
        })
        row = rows[-1]
        # Which of the two measures binds, and why. Both are always published:
        # a reader must never compare a stable number with a noisy one without
        # being told which is which.
        swing = (1.0 / a["landKm2"]) if a["landKm2"] else float("inf")
        reliable = a["landKm2"] >= DENSITY_MIN_AREA_KM2
        row["oneRecordSwingPerKm2"] = round(swing, 1)
        row["densityReliable"] = reliable
        row["bindingMeasure"] = "density" if reliable else "spacing"
        row["meetsDensityPreference"] = per_km2 >= MORROWIND_PER_KM2
        row["meetsSpacingPreference"] = bool(spacing and spacing <= MORROWIND_SPACING_M)
        row["meetsPreference"] = (row["meetsDensityPreference"] if reliable
                                  else row["meetsSpacingPreference"])
    # sparse cells: land cells in D3–D5 further than SPARSE_M from any hostile
    # place, and the gap points (greedy, ≥ 2·SPARSE_M apart) a new hostile
    # record could be bound to with `sitingPrefs.nearPoint`.
    sparse = []
    gaps = []
    if len(hx):
        for b in (3, 4, 5):
            mask = (s.danger == b) & land
            edge = int(EDGE_M / m_per_px)          # the closed playable edge is not a gap
            mask[:edge, :] = mask[-edge:, :] = mask[:, :edge] = mask[:, -edge:] = False
            rr, cc = np.nonzero(mask)
            if not len(rr):
                continue
            stride = 4
            rr, cc = rr[::stride], cc[::stride]
            xs, zs = cc * m_per_px, rr * m_per_px
            far_pts = []
            for x, z in zip(xs, zs):
                dmin = float(np.min(np.hypot(hx - x, hz - z)))
                if dmin > SPARSE_M:
                    far_pts.append((dmin, x, z))
            sparse.append({"band": b, "sampledCells": int(len(rr)), "farFromAnyFight": len(far_pts),
                           "shareFar": round(len(far_pts) / len(rr), 2)})
            chosen: list[tuple[float, float]] = []
            for dmin, x, z in sorted(far_pts, reverse=True):
                if all(math.hypot(x - cx, z - cz) >= 2 * SPARSE_M for cx, cz in chosen):
                    chosen.append((x, z))
                    col, row = min(int(x / m_per_px), s.grid_n - 1), min(int(z / m_per_px), s.grid_n - 1)
                    gaps.append({"band": b, "x": round(x), "z": round(z), "nearestFightM": round(dmin)})
                if len(chosen) >= 12:
                    break
    # Owner 2026-09-04: rebalance — slightly fewer fights ON routes, more OFF
    # them, so the travel and area numbers meet. Two lists for the region agents:
    #  * crowded: hostile places within ENCOUNTER_M of a route with ≥ CROWD_N
    #    other hostile places inside CROWD_M — candidates to move off-route
    #    (typed `nearPoint` on an off-route gap) or to swap for a friendly place.
    #  * offRouteGaps: land ≥ OFF_ROUTE_M from every route AND ≥ SPARSE_M from
    #    every fight, by band — where those moved (or promoted) records go.
    crowded = []
    route_pts = []
    for kind, rid, px, sub in load_routes():
        # "off-route" is measured against roads, lanes and cart tracks only:
        # footpaths, boardwalks and canoe channels exist BECAUSE of the places
        # they reach, so every place is trivially "on" one (round-4 agents)
        if kind in ("road", "boat") or sub in ("track", "causeway"):
            route_pts += resample(px, m_per_px, STEP_M)
    rx = np.array([p[0] for p in route_pts]); rz = np.array([p[1] for p in route_pts])
    for i, (x, z, pid, b, region) in enumerate(hostile_pts):
        droute = float(np.min(np.hypot(rx - x, rz - z))) if len(rx) else 1e9
        if droute > ENCOUNTER_M:
            continue
        near = int(np.sum(np.hypot(hx - x, hz - z) <= CROWD_M)) - 1
        if near >= CROWD_N:
            crowded.append({"id": pid, "band": b, "region": region, "routeM": round(droute), "hostileWithinCrowdM": near})
    crowded.sort(key=lambda c: (-c["hostileWithinCrowdM"], c["id"]))
    off_gaps = []
    if len(hx) and len(rx):
        for b in (3, 4, 5):
            mask = (s.danger == b) & land
            edge = int(EDGE_M / m_per_px)
            mask[:edge, :] = mask[-edge:, :] = mask[:, :edge] = mask[:, -edge:] = False
            rr, cc = np.nonzero(mask)
            rr, cc = rr[::5], cc[::5]
            chosen: list[tuple[float, float]] = []
            far_pts = []
            for r_, c_ in zip(rr, cc):
                x, z = c_ * m_per_px, r_ * m_per_px
                if float(np.min(np.hypot(rx - x, rz - z))) < OFF_ROUTE_M:
                    continue
                dmin = float(np.min(np.hypot(hx - x, hz - z)))
                if dmin > SPARSE_M:
                    far_pts.append((dmin, x, z))
            for dmin, x, z in sorted(far_pts, reverse=True):
                if all(math.hypot(x - cx, z - cz) >= 2 * SPARSE_M for cx, cz in chosen):
                    chosen.append((x, z))
                    off_gaps.append({"band": b, "x": round(x), "z": round(z), "nearestFightM": round(dmin)})
                if len(chosen) >= 14:
                    break
    return {"morrowind": {"hostilePerKm2": MORROWIND_PER_KM2, "spacingM": MORROWIND_SPACING_M},
            # measured, never quoted: the class dilation is still being tuned
            "classVersusDepth": class_error,
            "crowded": crowded, "offRouteGaps": off_gaps,
            "encounterM": ENCOUNTER_M, "sparseM": SPARSE_M, "bands": rows, "sparse": sparse, "gaps": gaps,
            "routes": sorted(per_route, key=lambda r: (r["kind"], r["id"]))}


def render(rep: dict) -> str:
    ce = rep["classVersusDepth"]
    L = ["# Hostility frequency by danger band", "",
         "<!-- GENERATED by `python3 -m worldgen.hostility_frequency`. Do not hand-edit. -->", "",
         f"Places only (roaming creatures and encounter sockets are Phase 13 and add to every band). "
         f"A hostile place counts when it is hostile on arrival, clearable or a dungeon-like interior; "
         f"\"met\" = within {rep['encounterM']:.0f} m of the route. Morrowind yardstick: "
         f"≈ {rep['morrowind']['hostilePerKm2']:.0f} hostile places / km² of land and a fight every "
         f"≈ {rep['morrowind']['spacingM']:.0f} m of road (docs/research/placement-settlements/morrowind-content-density.md §1–2).", "",
         f"Land is MEASURED dry ground — where the published signed depth in "
         f"`water/water-surface.png` is at or below zero, which comes to "
         f"{ce['measuredLandKm2']} km². It used to be read off `water-class.png`, a type label "
         f"drawn over a wider area than the water itself, which gives "
         f"{ce['classLandKm2']} km². That dropped "
         f"{ce['dryGroundTheClassRasterDropsKm2']} km² of walkable ground from the denominator "
         f"and raised every band's rate to match (decision 0049).", "",
         f"**The two measures and which one binds.** Density is a poor estimator on a small band. One "
         f"hostile record moves it by 1/(land km²), so below {DENSITY_MIN_AREA_KM2:.1f} km² a single "
         f"record swings the figure by more than {DENSITY_SWING_TOL_PER_KM2:.0f}/km². For those bands "
         f"the binding measure is **metres between fights**, which is also what a journey through the band feels. "
         f"Both are published for every band; the `binding` column says which one is being tested.", "",
         "| band | land km² | places | /km² | hostile | hostile /km² | flips→hostile | settlements | route km (road/boat/track/channel) | fights met | m between fights | short of Morrowind (area) | binding | meets |",
         "|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---|---|"]
    for r in rep["bands"]:
        kinds = "/".join(str(r["routeKmByKind"].get(k, 0)) for k in ("road", "boat", "track", "channel"))
        L.append(f"| D{r['band']} | {r['landKm2']} | {r['places']} | {r['placesPerKm2']} | {r['hostile']} | "
                 f"**{r['hostilePerKm2']}** | {r['flipsToHostile']} | {r['settlements']} | {kinds} | {r['fightsMet']} | "
                 f"{r['spacingM'] if r['spacingM'] else '—'} | {r['shortfallToMorrowindArea']} | "
                 f"{r['bindingMeasure']} | {'yes' if r['meetsPreference'] else 'NO'} |")
    short = [r for r in rep["bands"] if not r["meetsDensityPreference"]]
    if short:
        all_spaced = all(r["meetsSpacingPreference"] for r in short)
        L += ["", "## Where the density preference is not met", "",
              f"The {rep['morrowind']['hostilePerKm2']:.0f}/km² yardstick is a strong preference rather "
              f"than a rule. It is weighed against the other measures rather than satisfied on its own."
              + (f" {'Every' if all_spaced else 'Not every'} band below meets the other half of "
                 f"the yardstick, a fight more often than Morrowind's "
                 f"{rep['morrowind']['spacingM']:.0f} m of road, because the danger sits where "
                 f"people walk. What is thin is the empty ground between the routes. Roaming "
                 f"creatures suit that ground better than more built places."), ""]
        for r in short:
            note = (f"- **D{r['band']}** — {r['hostile']} hostile on {r['landKm2']} km² = "
                    f"{r['hostilePerKm2']}/km², short {r['shortfallToMorrowindArea']}.")
            if not r["densityReliable"]:
                note += (f" On {r['landKm2']} km² one record is worth "
                         f"±{r['oneRecordSwingPerKm2']}/km², so density is not the test here. "
                         f"A fight every {r['spacingM']} m is the tightest spacing in the province. "
                         f"A further {r['flipsToHostile']} places can turn hostile.")
            elif r["meetsSpacingPreference"]:
                note += f" A fight every {r['spacingM']} m of route."
            L.append(note)
        L += ["",
              "Roaming creatures and encounter sockets arrive in Phase 13 and add to every band. "
              "They are how a shortfall here should be made up. Placed hostile records must not be "
              "added simply to move a statistic."]
    L += ["", "## Sparse ground (D3–D5)", "",
          f"Share of sampled land cells with no hostile place within {rep['sparseM']:.0f} m. Below them are "
          "the gap points to which a new hostile record can be bound, using "
          "`sitingPrefs.nearPoint {x, z, maxM}` (metres; the plot does the siting).", ""]
    for sp in rep["sparse"]:
        L.append(f"- D{sp['band']}: {sp['shareFar']:.0%} of {sp['sampledCells']} sampled cells")
    L += ["", "| band | x m | z m | nearest fight m |", "|---|---:|---:|---:|"]
    for g in rep["gaps"]:
        L.append(f"| D{g['band']} | {g['x']} | {g['z']} | {g['nearestFightM']} |")
    L += ["", "## Rebalance lists (owner 2026-09-04: fewer fights on routes, more off them)", "",
          f"**Crowded route-side fights** — hostile places within {rep['encounterM']:.0f} m of a route with at least {CROWD_N} other hostile places inside {CROWD_M:.0f} m. Candidates to move off-route (`sitingPrefs.nearPoint` on an off-route gap below) or to swap for a friendly/neutral place from the reserve. Never add to these neighbourhoods.", "",
          "| record | band | region | route m | other fights within 250 m |", "|---|---|---|---:|---:|"]
    for c in rep["crowded"][:60]:
        L.append(f"| `{c['id']}` | D{c['band']} | {c['region']} | {c['routeM']} | {c['hostileWithinCrowdM']} |")
    L += ["", f"**Off-route gaps** — land at least {OFF_ROUTE_M:.0f} m from every route and {rep['sparseM']:.0f} m from every fight. New or moved hostile records may go here and nowhere else.", "",
          "| band | x m | z m | nearest fight m |", "|---|---:|---:|---:|"]
    for g in rep["offRouteGaps"]:
        L.append(f"| D{g['band']} | {g['x']} | {g['z']} | {g['nearestFightM']} |")
    L += ["", "## Routes with the longest gaps", "", "| route | kind | km | fights met | m between fights |", "|---|---|---:|---:|---:|"]
    worst = sorted([r for r in rep["routes"] if r["km"] >= 1.0], key=lambda r: -(r["spacingM"] or 1e9))[:25]
    for r in worst:
        L.append(f"| `{r['id']}` | {r['kind']} | {r['km']} | {r['fights']} | {r['spacingM'] if r['spacingM'] else '— (none)'} |")
    return "\n".join(L) + "\n"


def main() -> None:
    rep = build_report()
    REPORT.write_text(render(rep), encoding="utf-8")
    SIDECAR.parent.mkdir(parents=True, exist_ok=True)
    SIDECAR.write_text(json.dumps(rep, indent=1), encoding="utf-8")
    for r in rep["bands"]:
        print(f"D{r['band']}: {r['hostile']} hostile on {r['landKm2']} km² = {r['hostilePerKm2']}/km²; "
              f"{r['routeKm']} route km, a fight every {r['spacingM'] or '—'} m; short {r['shortfallToMorrowindArea']}")
    print(f"report: {REPORT.relative_to(catalogue.REPO_ROOT)}")


if __name__ == "__main__":
    main()

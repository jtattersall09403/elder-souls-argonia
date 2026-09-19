"""`coSitedWith` — measure the promise, never restate it (16g).

`worldgen.catalogue` checks the SHAPE of a co-siting row: a known relation, a
live target, the right measurement keys, and reciprocity on the relations that
are true of the pair. This module checks the CLAIM, on the shipped ground:

    sightline         the two dots see each other over the province survey
                      (eyes 1.7 m and 8.0 m, the pair `macro_plot` sights with)
    same-water        both records' `plotFacts.water.entityId` IS the named
                      entity — a record with no water fact FAILS, because
                      "no measurement" is not "same water"
    satellite         the plan distance between the dots is within maxM
    ferry-pair        the named service exists in travel-services.json and its
                      two stations stand at exactly these two places
    approach-through  the `via` record is live

Run: python3 -m worldgen.co_siting --check   (from tooling/world-generation/)
Exit 1 on any failure. No rows are authored yet, so today it measures nothing
and passes; the gate exists so the first authored row is measured the day it
lands, not the day something looks wrong in the studio.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

from . import catalogue

TRAVEL_SERVICES_PATH = catalogue.REPO_ROOT / "world" / "sources" / "routes" / "travel-services.json"
EYE_A_M = 1.7
EYE_B_M = 8.0


def load_records(catalogue_dir: Path = catalogue.CATALOGUE_DIR) -> dict[str, dict]:
    return {r["id"]: r for rf in catalogue.load_region_files(catalogue_dir) for r in rf.places}


def load_services(path: Path = TRAVEL_SERVICES_PATH) -> tuple[dict[str, dict], dict[str, str]]:
    """(services by id, station id → placeId). Empty when the file is absent."""
    if not path.exists():
        return {}, {}
    data = json.loads(path.read_text(encoding="utf-8"))
    stations = {st["id"]: st.get("placeId") for st in data.get("stations", []) if "id" in st}
    return {sv["id"]: sv for sv in data.get("services", []) if "id" in sv}, stations


def service_place_ids(service: dict, stations: dict[str, str]) -> set[str]:
    """The places a service actually calls at: its declared stations, or the
    ends of its hops when it declares none."""
    ids = list(service.get("stations") or [])
    if not ids:
        for hop in service.get("hops") or []:
            ids += [hop.get("from"), hop.get("to")]
    return {stations.get(s) for s in ids if s} - {None}


def _survey():
    from .site_fields import shared_survey
    return shared_survey()


def measure(records: dict[str, dict] | None = None, survey=None,
            services: tuple[dict, dict] | None = None) -> list[str]:
    """Every co-siting row in the catalogue, measured. Returns the failures."""
    recs = load_records() if records is None else records
    svc, stations = load_services() if services is None else services
    failures: list[str] = []
    needs_survey = any(row.get("relation") == "sightline"
                       for r in recs.values() for row in (r.get("coSitedWith") or []))
    if needs_survey and survey is None:
        survey = _survey()
    for rid in sorted(recs):
        rec = recs[rid]
        for i, row in enumerate(rec.get("coSitedWith") or []):
            msg = _measure_row(rid, i, rec, row, recs, survey, svc, stations)
            if msg:
                failures.append(msg)
    return failures


def _measure_row(rid: str, i: int, rec: dict, row: dict, recs: dict[str, dict],
                 survey, svc: dict, stations: dict[str, str]) -> str | None:
    where = f"{rid}: coSitedWith[{i}]"
    rel = row.get("relation")
    other_id = row.get("place")
    other = recs.get(other_id)
    m = row.get("measurement") or {}
    if other is None:
        return f"{where} → {other_id} is not a record at all"
    if rel == "approach-through":
        via = recs.get(m.get("via"))
        if via is None:
            return f"{where} approach-through via {m.get('via')} is not a record"
        if via.get("status") in ("cut", "deferred"):
            return f"{where} approach-through via {m.get('via')} is not live ({via.get('status')})"
        return None
    if rel == "same-water":
        want = m.get("entityId")
        for who in (rec, other):
            got = ((who.get("plotFacts") or {}).get("water") or {}).get("entityId")
            if got is None:
                return (f"{where} same-water {want}: {who['id']} has no water fact "
                        f"(plotFacts.water.entityId) — no measurement is not a pass")
            if got != want:
                return f"{where} same-water {want}: {who['id']} stands in {got}"
        return None
    a, b = rec.get("positionM"), other.get("positionM")
    if not (catalogue._is_xz(a) and catalogue._is_xz(b)):
        return f"{where} '{rel}' cannot be measured: one of the two records has no positionM"
    if rel == "satellite":
        dist = math.dist(a, b)
        if dist > float(m["maxM"]):
            return (f"{where} satellite of {other_id}: {dist:.1f} m apart, "
                    f"past maxM {m['maxM']}")
        return None
    if rel == "sightline":
        if survey is None:
            return f"{where} sightline to {other_id}: no province survey to measure it on"
        los = survey.sightline_clearance(a[0], a[1], b[0], b[1], eye_a=EYE_A_M, eye_b=EYE_B_M)
        if not los["clear"]:
            return (f"{where} sightline to {other_id} is blocked: worst clearance "
                    f"{los['clearanceM']} m at t={los['atT']}")
        return None
    if rel == "ferry-pair":
        sid = m.get("serviceId")
        service = svc.get(sid)
        if service is None:
            return f"{where} ferry-pair names service {sid!r}, which is not in travel-services.json"
        called = service_place_ids(service, stations)
        if called != {rid, other_id}:
            return (f"{where} ferry-pair {sid} calls at {sorted(called)}, "
                    f"not at {sorted({rid, other_id})}")
        return None
    return f"{where} unknown relation {rel!r}"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="measure every coSitedWith row")
    ap.parse_args(argv)
    failures = measure()
    for f in failures:
        print(f"co-siting: {f}", file=sys.stderr)
    rows = sum(len(r.get("coSitedWith") or []) for r in load_records().values())
    print(f"co-siting: {rows} rows measured, {'FAIL' if failures else 'OK'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

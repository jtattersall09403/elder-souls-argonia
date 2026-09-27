"""signature-claims.json: the 0098 province cap under concurrent builders."""
from __future__ import annotations

import json
import multiprocessing as mp
import time

import pytest

from . import claim_signature as cl

SIG = "farmhouse02 | clutter:barrel02, light:candlelanternwithcandle01"


def _claimer(path, place, barrier, out, locked):
    barrier.wait()
    if not locked:                      # the check-then-act the lock closes
        import contextlib
        cl.claims_lock = lambda path=None: contextlib.nullcontext()
    real = cl.province_errors

    def slow(*a, **k):                  # widen the read-to-write window
        got = real(*a, **k)
        time.sleep(0.05)
        return got
    cl.province_errors = slow
    out.put((place, cl.claim(place, [SIG], path, cap=3, repeat_m=2000.0, now="t")))


def run_claimers(path, n, locked=True):
    ctx = mp.get_context("fork")
    barrier, out = ctx.Barrier(n), ctx.Queue()
    procs = [ctx.Process(target=_claimer, args=(path, f"place.t.p{i}", barrier, out, locked))
             for i in range(n)]
    for p in procs:
        p.start()
    got = [out.get(timeout=60) for _ in procs]
    for p in procs:
        p.join(timeout=60)
    return got


def test_concurrent_claims_stop_at_the_cap(tmp_path):
    path = tmp_path / "signature-claims.json"
    got = run_claimers(path, 8)
    granted = [p for p, errs in got if not errs]
    assert len(granted) == 3
    doc = json.loads(path.read_text())
    assert sorted(c["placeId"] for c in doc["claims"]) == sorted(granted)
    assert all("0098 province cap" in errs[0] for p, errs in got if errs)


def test_reclaim_is_idempotent_and_distance_refuses(tmp_path):
    path = tmp_path / "c.json"
    pos = {"a": (0.0, 0.0), "b": (1500.0, 0.0), "c": (5000.0, 0.0)}
    assert cl.claim("a", [SIG], path, cap=3, repeat_m=2000.0, positions=pos, now="t") == []
    assert cl.claim("a", [SIG], path, cap=3, repeat_m=2000.0, positions=pos, now="t") == []
    assert len(cl.load(path)["claims"]) == 1
    errs = cl.claim("b", [SIG], path, cap=3, repeat_m=2000.0, positions=pos, now="t")
    assert errs and "1500 m away" in errs[0]
    assert cl.claim("c", [SIG], path, cap=3, repeat_m=2000.0, positions=pos, now="t") == []


def test_replace_releases_a_changed_layouts_claims(tmp_path):
    path = tmp_path / "c.json"
    cl.claim("a", [SIG, "old"], path, cap=3, repeat_m=0.0, now="t")
    cl.claim("a", [SIG, "new"], path, cap=3, repeat_m=0.0, now="t", replace=True)
    assert sorted(c["signature"] for c in cl.load(path)["claims"]) == sorted([SIG, "new"])


def test_gate_counts_other_places_claims():
    claims = [{"signature": SIG, "placeId": p, "claimedAt": "t"} for p in ("x", "y", "z")]
    assert cl.province_errors("x", [SIG], claims, 3, 2000.0) == []
    assert "would appear 4 times" in cl.province_errors("w", [SIG], claims, 3, 2000.0)[0]


def test_cap_counts_copies_not_places(tmp_path):
    """0098 § 1: "appears at most 3 times in the province" - two copies in one
    place and one in another leave no room for a fourth."""
    path = tmp_path / "c.json"
    assert cl.claim("a", [SIG, SIG], path, cap=3, repeat_m=0.0, now="t") == []
    assert len(cl.load(path)["claims"]) == 2
    assert cl.claim("b", [SIG], path, cap=3, repeat_m=0.0, now="t") == []
    errs = cl.claim("c", [SIG], path, cap=3, repeat_m=0.0, now="t")
    assert errs and "would appear 4 times" in errs[0] and "a x2" in errs[0]
    assert cl.claim("a", [SIG], path, cap=3, repeat_m=0.0, now="t", replace=True) == []
    assert cl.claim("c", [SIG], path, cap=3, repeat_m=0.0, now="t") == []


def test_seed_record_is_valid():
    doc = cl.load()
    assert doc["schemaVersion"] == 1 and doc["claims"]
    cap, _ = cl.province_bars()
    per = {}
    for c in doc["claims"]:
        assert set(c) == {"signature", "placeId", "claimedAt"}
        per.setdefault(c["signature"], set()).add(c["placeId"])
    assert max(len(v) for v in per.values()) <= cap

"""Province signature claims: decision 0098's province bar, reserved at the brief.

    python3 -m worldgen.claim_signature --place <place-id> --signature "<sig>" [--signature ...]
    python3 -m worldgen.claim_signature --check --place <place-id> --signature "<sig>" ...

Decision 0098: one exact assembly (a building's full signature) appears at
most ``assemblyMaxPerProvince`` times in the province and never twice within
``assemblyRepeatMinM`` (breadth-bars.json ``distance``). Two builders that
each read a count of 2 and both pass leave the province at 4 (method review
r3 finding F), so a builder RESERVES its signatures at the brief step: an
append to ``world/sources/placement/signature-claims.json`` under
``fcntl.flock`` on the sibling ``.lock`` file, refused when the cap would be
exceeded. The cap counts COPIES (0098 § 1: "appears at most 3 times in the
province"): one row per copy, so a place holding a signature on two
buildings holds two rows; a place's claim states its whole count for each
signature it names (re-claiming the same count is a no-op). The 2 km rule is
between places; repeats inside one place are the per-settlement table's. ``province_errors`` is the
0098 province gate; ``place_gates`` runs it on the place's built signatures,
so a claim by another place counts toward the cap.

The signature string is the workbench's (``wb.py SCENE signature``: the shell
then its sorted ``layer:asset`` members), for buildings whose parcel ``use``
is dwelling, work, civic or storage (0098 § 1).
"""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import json
import math
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from .atomic_write import atomic_write_bytes

REPO_ROOT = Path(__file__).resolve().parents[3]
CLAIMS_PATH = REPO_ROOT / "world" / "sources" / "placement" / "signature-claims.json"
SCHEMA_VERSION = 1
COUNTED_USES = ("dwelling", "work", "civic", "storage")     # 0098 § 1


def _lock_path(path: Path) -> Path:
    return path.with_name(path.name + ".lock")


@contextlib.contextmanager
def claims_lock(path: Path = CLAIMS_PATH):
    """Exclusive flock on ``<claims>.lock`` for a read-modify-write."""
    fd = os.open(_lock_path(Path(path)), os.O_RDWR | os.O_CREAT, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)


def load(path: Path = CLAIMS_PATH) -> dict:
    path = Path(path)
    if not path.exists():
        return {"schemaVersion": SCHEMA_VERSION, "claims": []}
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"{path}: schemaVersion {doc.get('schemaVersion')!r}, expected {SCHEMA_VERSION}")
    return doc


def _write(path: Path, doc: dict) -> None:
    doc = {**doc, "claims": sorted(doc["claims"], key=lambda c: (c["signature"], c["placeId"]))}
    atomic_write_bytes(Path(path), (json.dumps(doc, indent=1, sort_keys=True) + "\n").encode("utf-8"),
                       0o644)


def province_bars() -> tuple[int, float]:
    """(cap, repeat distance m) from breadth-bars.json ``distance``."""
    from . import breadth_bars as bb
    d = bb.load()["distance"]
    return int(d["assemblyMaxPerProvince"]["value"]), float(d["assemblyRepeatMinM"]["value"])


def place_positions() -> dict[str, tuple[float, float]]:
    """Every catalogue place's ``positionM`` (x, z)."""
    from . import catalogue
    out = {}
    for region in catalogue.load_region_files():
        for rec in region.places:
            pos = rec.get("positionM")
            if isinstance(pos, (list, tuple)) and len(pos) >= 2:
                out[rec["id"]] = (float(pos[0]), float(pos[-1]))
            elif isinstance(pos, dict) and "x" in pos:
                out[rec["id"]] = (float(pos["x"]), float(pos.get("z", pos.get("y", 0.0))))
    return out


def province_errors(place_id: str, signatures, claims: list[dict], cap: int, repeat_m: float,
                    positions: dict[str, tuple[float, float]] | None = None) -> list[str]:
    """The 0098 province gate for ``place_id`` holding ``signatures``: every
    other place claiming a signature counts toward the cap, and none of them
    may stand within ``repeat_m``."""
    errors = []
    mine = Counter(signatures)
    for sig in sorted(mine):
        held = Counter(c["placeId"] for c in claims
                       if c["signature"] == sig and c["placeId"] != place_id)
        others = sorted(held)
        copies = sum(held.values()) + mine[sig]
        if copies > cap:
            errors.append(f"0098 province cap: signature {sig!r} would appear {copies} times "
                          f"(cap {cap}); {mine[sig]} here, the rest claimed by "
                          f"{', '.join(f'{o} x{held[o]}' for o in others) or '-'}")
        if positions and place_id in positions:
            px, pz = positions[place_id]
            for other in others:
                if other in positions:
                    d = math.hypot(positions[other][0] - px, positions[other][1] - pz)
                    if d < repeat_m:
                        errors.append(f"0098 repeat distance: signature {sig!r} is also claimed by "
                                      f"{other} {d:.0f} m away (minimum {repeat_m:.0f} m)")
    return errors


def claim(place_id: str, signatures, path: Path = CLAIMS_PATH, cap: int | None = None,
          repeat_m: float | None = None, positions=None, now: str | None = None,
          replace: bool = False) -> list[str]:
    """Append the place's claims under the lock; [] when all were granted
    (or already held), else the refusals and nothing is written. ``replace``:
    the signatures are the place's whole set, so its other claims (a layout
    that has changed since) are released in the same write."""
    if cap is None or repeat_m is None:
        bars = province_bars()
        cap = bars[0] if cap is None else cap
        repeat_m = bars[1] if repeat_m is None else repeat_m
    now = now or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with claims_lock(path):
        doc = load(path)
        errors = province_errors(place_id, signatures, doc["claims"], cap, repeat_m, positions)
        if errors:
            return errors
        want = Counter(signatures)
        mine = [c for c in doc["claims"] if c["placeId"] == place_id]
        have = Counter(c["signature"] for c in mine)
        if replace:
            changed = have != want
        else:
            changed = any(have[s] != n for s, n in want.items())
        if changed:
            keep = [c for c in mine if c["signature"] not in want and not replace]
            kept_old = {s: [c for c in mine if c["signature"] == s] for s in want}
            rows = [c for c in doc["claims"] if c["placeId"] != place_id] + keep
            for s, n in sorted(want.items()):
                old = kept_old[s][:n]          # a held copy keeps its claimedAt
                rows += old + [{"signature": s, "placeId": place_id, "claimedAt": now}
                               for _ in range(n - len(old))]
            doc["claims"] = rows
            _write(path, doc)
    return []


WB = REPO_ROOT / "tooling" / "placement-workbench" / "wb.py"
SCENES = REPO_ROOT / "tooling" / "placement-workbench" / "output" / "scenes"
BLUEPRINTS = REPO_ROOT / "world" / "sources" / "blueprints"


def scene_for(place_id: str) -> Path:
    """The place's apply scene (wb layout.default_scene_name)."""
    return SCENES / (place_id.removeprefix("place.").replace(".", "-") + "-layout.json")


def place_signatures(place_id: str, scene: Path | None = None, env: dict | None = None,
                     blueprint: dict | None = None) -> dict[str, list[str]]:
    """{signature: [parcel ids]} for the place's counted buildings (0098 § 1
    uses), from ``wb.py SCENE signature`` on its apply scene and the uses in
    its blueprint. Raises FileNotFoundError without a scene."""
    import subprocess
    scene = Path(scene or scene_for(place_id))
    if not scene.exists():
        raise FileNotFoundError(f"no workbench scene {scene} (run wb.py apply on the layout)")
    got = subprocess.run([sys.executable, str(WB), str(scene), "signature"], capture_output=True,
                         text=True, cwd=WB.parent, check=True, env=env)
    sigs = json.loads(got.stdout)["signatures"]
    roles = {p["uid"]: (p.get("role") or {}).get("id")
             for p in json.loads(scene.read_text())["pieces"]}
    bp = blueprint or json.loads((BLUEPRINTS / f"{place_id}.json").read_text())["blueprint"]
    use = {p["id"]: p.get("use") for p in bp.get("parcels", [])}
    out: dict[str, list[str]] = {}
    for sig, uids in sigs.items():
        parcels = sorted(roles.get(u) for u in uids
                         if use.get(roles.get(u)) in COUNTED_USES)
        if parcels:
            out[sig] = parcels
    return dict(sorted(out.items()))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python3 -m worldgen.claim_signature")
    ap.add_argument("--place", required=True)
    ap.add_argument("--signature", action="append", default=[])
    ap.add_argument("--from-scene", action="store_true",
                    help="claim every counted signature of the place's apply scene")
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    ap.add_argument("--claims", type=Path, default=CLAIMS_PATH)
    ap.add_argument("--no-distance", action="store_true",
                    help="skip the 2 km rule (no catalogue read; the cap alone)")
    a = ap.parse_args(argv)
    if a.from_scene:
        a.signature += [s for s, parcels in place_signatures(a.place).items() for _ in parcels]
    if not a.signature:
        ap.error("give --signature or --from-scene")
    positions = None if a.no_distance else place_positions()
    if a.check:
        cap, repeat_m = province_bars()
        errors = province_errors(a.place, a.signature, load(a.claims)["claims"], cap, repeat_m,
                                 positions)
    else:
        errors = claim(a.place, a.signature, a.claims, positions=positions,
                       replace=a.from_scene)
    for e in errors:
        print(f"claim_signature: REFUSED {e}", file=sys.stderr)
    if not errors:
        print(f"claim_signature: {a.place}: {len(a.signature)} copies of {len(set(a.signature))} signature(s) "
              f"{'clear' if a.check else 'held'}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

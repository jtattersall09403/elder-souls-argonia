"""Score the contact miner on the golden set, held-out batches and a fresh batch
in ONE contact run (16h rounds 15-16; the protocol: sample first, fresh batch,
scale once). Per-asset sample seeds make a combined run equal to separate runs.

  python3 -m worldgen.run_mount_batches --fresh /tmp/m16/batch7_expected.json \\
      --held 20260931 20260933 --extra <asset id> ... --out /tmp/m16/batch_out.json

``--fresh``: ``{"seed": n, "ids": [[asset id, expected class, why], ...]}``
written BEFORE the run. ``--held``: seeds of the fixture's held-out batches to
re-score (expectations from ``fixtures/mount-golden.json``). ``--extra``: ids
reported, not scored. Writes the per-asset rows to ``--out``; prints the
score and every miss.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from . import asset_registry
from .mine_mounts import build_document, kit_assets

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "mount-golden.json"
REPORTED = ("restsOnOnly", "votedClass", "buriedGround", "abuts", "hangingFrom", "share", "n",
            "waterline")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--fresh", type=Path)
    parser.add_argument("--held", nargs="*", type=int, default=[])
    parser.add_argument("--no-golden", action="store_true")
    parser.add_argument("--extra", nargs="*", default=[])
    parser.add_argument("--extra-file", type=Path, help="a JSON list of ids to report")
    parser.add_argument("--sample-max", type=int, default=40, help="0: every reference")
    parser.add_argument("--sample-seed", type=int, default=20260923)
    parser.add_argument("--jobs", type=int, default=5)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    fixture = json.loads(FIXTURE.read_text())
    sets: dict[str, list] = {}
    if not args.no_golden:
        sets["golden"] = [(i["id"], i["expected"], i.get("parent")) for i in fixture["golden"]["ids"]]
    for batch in fixture["heldOut"]:
        if batch.get("seed") in args.held:
            sets[f"held-{batch['seed']}"] = [(i["id"], i["expected"], i.get("parent"))
                                             for i in batch["ids"]]
    if args.fresh:
        fresh = json.loads(args.fresh.read_text())
        sets[f"fresh-{fresh.get('seed')}"] = [(i, e, None) for i, e, *_ in fresh["ids"]]
    if args.extra_file:
        args.extra += json.loads(args.extra_file.read_text())
    kits = kit_assets()
    only = {i for rows in sets.values() for i, _, _ in rows} | set(args.extra)
    started = time.time()
    doc = build_document(kits, asset_registry.DEFAULT_VAULT, only=only,
                         sample_max=args.sample_max or None, sample_seed=args.sample_seed,
                         jobs=args.jobs)
    pairs = {(p["child"], p["parent"]) for p in doc["pairs"]}
    out = {"secs": round(time.time() - started), "meshesMissing": doc["meshesMissing"],
           "distinctPoses": doc["distinctPoses"], "meshesMissingIds": doc["meshesMissingIds"], "sets": {}, "extra": {}}
    for name, rows in sets.items():
        results = []
        for asset_id, expected, parent in rows:
            anchor = doc["anchors"].get(asset_id, {})
            ok = anchor.get("anchorClass") == expected and (not parent or (asset_id, parent) in pairs)
            results.append({"id": asset_id, "expected": expected, "got": anchor.get("anchorClass"),
                            "refClasses": anchor.get("refClasses"),
                            "evidence": anchor.get("evidence"), "pass": ok,
                            **{k: anchor[k] for k in REPORTED if k in anchor}})
        out["sets"][name] = {"pass": sum(r["pass"] for r in results), "of": len(results),
                             "results": results}
    out["extra"] = {i: doc["anchors"].get(i) for i in args.extra}
    out["pairs"] = [p for p in doc["pairs"] if p["child"] in only]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=1))
    print(out["secs"], "s", {k: (v["pass"], v["of"]) for k, v in out["sets"].items()})
    for name, block in out["sets"].items():
        for r in block["results"]:
            if not r["pass"]:
                print(name, "MISS", r["id"], r["expected"], r["got"], r["refClasses"], r.get("evidence"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

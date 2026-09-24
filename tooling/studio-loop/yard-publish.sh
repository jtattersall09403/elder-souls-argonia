#!/usr/bin/env bash
# Fast walk loop for the proving-ground yard (owner ruling 2026-09-24).
#
#   1. compile ONLY place.fixture.proving-ground into tooling/world-generation/output/settlements
#   2. export the settlement bundle with --fixtures-ok to a staging file (no --copy-assets:
#      the kits are already published; the exporter still CHECKS them, it copies nothing)
#   3. copy that one file over apps/world-studio/public/province/settlements.json, the only
#      file the yard publish changes (K14 touched nothing else under public/province)
#   4. print the walk table: every yard placement, the three door thresholds, a studio URL each
#
# No tests, no site compose, no province:publish. `npm run studio` serves public/ from disk
# (decision 0072, vite.config.ts es-fresh-public-files), so a browser reload shows the new
# bundle without restarting the dev server.
#
# Scope today: the exporter has no per-place flag (16j item 7b adds `--places`); it exports
# every authored blueprint plus the route pieces. Since the five old blueprints were retired
# the only authored blueprint is the fixture, so the bundle IS the yard. When 16i authors a
# place, step 2 exports it too until `--places` exists.
#
# Usage (from anywhere):  bash tooling/studio-loop/yard-publish.sh
# Env: ES_TUNNEL_URL (studio base URL; a placeholder is printed when unset)
#      YARD_TABLE_OUT (optional path to also write the walk table to)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WG="$REPO/tooling/world-generation"
BLUEPRINT="$REPO/world/sources/blueprints/place.fixture.proving-ground.json"
COMPILED="$WG/output/settlements"
PUBLIC="$REPO/apps/world-studio/public/province/settlements.json"
STAGE="$(mktemp -d /tmp/yard-publish.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT

now() { date +%s%N; }
secs() { awk -v a="$1" -v b="$2" 'BEGIN { printf "%.1f", (b - a) / 1e9 }'; }
T0=$(now)

echo "[1/4] compile place.fixture.proving-ground"
if ! (cd "$WG" && python3 -m worldgen.compile_settlement --blueprint "$BLUEPRINT" \
        --out "$COMPILED" >"$STAGE/compile.log" 2>&1); then
  grep -v "FIXTURE-WAIVED" "$STAGE/compile.log" | tail -20; echo "yard-publish: compile FAILED"; exit 1
fi
grep "placements," "$STAGE/compile.log" | sed 's/^/      /'
T1=$(now)

echo "[2/4] export bundle (--fixtures-ok, no asset copy)"
if ! (cd "$WG" && python3 -m worldgen.export_settlement_bundle --fixtures-ok \
        --out "$STAGE/settlements.json" >"$STAGE/export.log" 2>&1); then
  tail -20 "$STAGE/export.log"; echo "yard-publish: export FAILED"; exit 1
fi
grep -E "PENDING PAD|KNOWN-RED|settlement \+" "$STAGE/export.log" | sed 's/^/      /'
T2=$(now)

echo "[3/4] publish settlements.json"
if cmp -s "$STAGE/settlements.json" "$PUBLIC"; then
  echo "      unchanged: $PUBLIC"
else
  cp "$STAGE/settlements.json" "$PUBLIC.yard-publish.tmp"
  mv -f "$PUBLIC.yard-publish.tmp" "$PUBLIC"     # atomic on the same filesystem
  echo "      written: $PUBLIC"
fi
T3=$(now)

echo "[4/4] walk table"
python3 - "$PUBLIC" "${ES_TUNNEL_URL:-<ES_TUNNEL_URL>}" "${YARD_TABLE_OUT:-}" <<'PY'
import json, sys
bundle_path, base, table_out = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(bundle_path))
site = next(s for s in d["settlements"] if s["id"] == "place.fixture.proving-ground")
ids = set(site["placementIds"])
url = lambda e, s: f"{base}?view=character&x={e:.3f}&z={s:.3f}&t=12"
xs = [p[0] for p in site["boundaryM"]]; zs = [p[1] for p in site["boundaryM"]]
cx, cz = (min(xs) + max(xs)) / 2000, (min(zs) + max(zs)) / 2000
rows = [("yard centre (boundary box)", cx, cz, "anchor", "-", "-")]
for p in sorted((p for p in d["placements"] if p["id"] in ids), key=lambda p: p["id"]):
    rows.append((p["id"].removeprefix(site["id"] + "."), p["positionM"][0] / 1000,
                 p["positionM"][2] / 1000, p["kind"], p["assetId"].rsplit("/", 1)[-1],
                 (p.get("anchor") or {}).get("groundFit", "-")))
for door in sorted((x for x in d["doors"] if x["settlementId"] == site["id"]), key=lambda x: x["id"]):
    rows.append((door["id"] + " threshold", door["thresholdM"][0] / 1000,
                 door["thresholdM"][1] / 1000, "door", door["parcelId"].rsplit(".", 1)[-1],
                 f"facing {door['facingDeg']:.1f}"))
lines = [f"Yard walk table, from {bundle_path} ({len(ids)} placements, "
         f"{len(rows) - 1 - len(ids)} doors)",
         "item | E km | S km | kind | piece | fit | studio URL"]
lines += [f"{r[0]} | {r[1]:.3f} | {r[2]:.3f} | {r[3]} | {r[4]} | {r[5]} | {url(r[1], r[2])}" for r in rows]
text = "\n".join(lines)
print(text)
if table_out:
    open(table_out, "w").write(text + "\n")
PY
T4=$(now)
echo "yard-publish: compile $(secs $T0 $T1) s, export $(secs $T1 $T2) s, publish $(secs $T2 $T3) s," \
     "table $(secs $T3 $T4) s; total $(secs $T0 $T4) s"

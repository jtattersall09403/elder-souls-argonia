#!/usr/bin/env bash
# Copy a built studio to the pod as /root/site/dists/<name> and restart serve.mjs on the pod's
# port 8099 over EVERY synced dist, each at the base it was built for: a dev build (/studio/) and branch
# builds (/webgpu/, or their own ES_STUDIO_BASE) are served side by side for pod-capture --compare.
#   POD_SSH="ssh -i ~/.ssh/runpod_<lane> -p <port> root@<ip>" tooling/gpu-lane/pod-sync.sh <dist> <name>
# One dist per base: a later sync of the same <name> replaces it, and any other dist on the pod built for the
# same base is deleted first. Exits non-zero unless, after the restart, the new serve.mjs is alive on 8099 and
# every served base answers and 2 sentinel data files (ground-control.png, a kit file) return the local size (walk 10: a crashed server left an old one answering and the sync returned 0).
set -euo pipefail
d=${1:?dist dir}; n=${2:?name}; : "${POD_SSH:?POD_SSH=\"ssh -i <key> -p <port> root@<ip>\"}"
t=${POD_SSH##* }; S="${POD_SSH% *} -o StrictHostKeyChecking=no"
cd "$(git rev-parse --show-toplevel)"
base=$(node -e 'import("./tooling/gpu-lane/serve-lib.mjs").then((m) => console.log(m.distBase(process.argv[1])))' "$d")
$S "$t" "mkdir -p /root/site/dists; cd /root/site/dists; for o in *; do [ \"\$o\" != '$n' ] && [ -f \"\$o/index.html\" ] && grep -q 'src=\"$base'assets/ \"\$o/index.html\" && { echo \"pod-sync: removing \$o (also built for $base)\"; rm -rf \"\$o\"; }; done; true"
rsync -a --delete -e "$S" "$d/" "$t:/root/site/dists/$n/"
rsync -aR -e "$S" tooling/gpu-lane/serve.mjs tooling/gpu-lane/serve-lib.mjs tooling/gpu-lane/pod-setup.sh \
  apps/world-studio/scripts/lib/webgpu-static.mjs packages/character-assets/files "$t:/root/site/"
# The data public/ serve.mjs reads (ES_DATA_PUBLIC): committed plus gitignored generated files, a HEAD stamp, then a size check.
sha=$(git rev-parse HEAD)
(cd apps/world-studio/public && { git ls-files -c -o --exclude-standard .; git ls-files -o -i --exclude-standard .; } | rsync -a --files-from=- -e "$S" ./ "$t:/root/site/public/")
$S "$t" "echo $sha >/root/site/public/.sync-sha"
$S "$t" 'cd /root/site; [ -f /root/serve.pid ] && kill $(cat /root/serve.pid) 2>/dev/null
for p in $(lsof -t -iTCP:8099 -sTCP:LISTEN 2>/dev/null); do kill $p; done
ES_DATA_PUBLIC=/root/site/public setsid nohup node tooling/gpu-lane/serve.mjs dists/* --port 8099 >/root/serve.log 2>&1 </dev/null & echo $! >/root/serve.pid
for d in dists/*; do b=$(grep -o "src=\"/[^\"]*/assets/" $d/index.html | head -1 | sed "s/^src=\"//; s/assets\/$//")
  curl -sf --retry 10 --retry-all-errors --retry-delay 1 -o /dev/null "http://127.0.0.1:8099${b}index.html" || { cat /root/serve.log; echo "pod-sync: $b ($d) not served" >&2; exit 1; }
  echo "pod-sync: $b ok"; done
kill -0 $(cat /root/serve.pid) 2>/dev/null || { cat /root/serve.log; echo "pod-sync: serve.mjs is not running" >&2; exit 1; }
cat /root/serve.log'
# Sentinels: the pod must answer 200 with the local file's size (the SPA fallback html is 200 with another size).
for f in province/refined/ground-control.png kits/bmv-treehouse-int/parts/index.json; do
  want=$(stat -c %s "apps/world-studio/public/$f")
  got=$($S "$t" "curl -s -o /dev/null -w '%{http_code} %{size_download}' http://127.0.0.1:8099/elder-souls-argonia/studio/$f")
  [ "$got" = "200 $want" ] || { echo "pod-sync: data mismatch for $f: pod '$got', local '200 $want'" >&2; exit 1; }
done
echo "pod-sync: data public ok ($sha)"

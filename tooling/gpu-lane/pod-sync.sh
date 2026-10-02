#!/usr/bin/env bash
# Put a built studio on the pod and (re)start serve.mjs on the pod's port 8099 over EVERY synced dist, each at the
# base it was built for (dev at /studio/, webgpu at /webgpu/), with the studio data from /root/site/public.
#   POD_SSH="ssh -i <key> -p <port> root@<ip>" bash tooling/gpu-lane/pod-sync.sh --data <lane>   (once per pod)
#   POD_SSH="..." bash tooling/gpu-lane/pod-sync.sh <dist> <dev|webgpu> <lane>                   (per iteration)
# --data: the main tree's apps/world-studio/public (kits, province, textures: ~600 MB) to /root/site/public, skipped when
#   its listing hash (path, size, mtime) equals the pod's /root/site/public/.hash.
# <dist>: the fixed folder build-dist.sh writes (never a per-iteration copy). Its content hash (studio data dirs
#   excluded) is compared with /root/site/dists/<name>/.hash; equal and the server alive -> skip; else
#   `rsync -a --checksum --delete` (data dirs excluded) and restart. Any other pod dist built for the same base is
#   deleted first. Exits non-zero unless, after a restart, the new serve.mjs is alive and every served base answers.
# Each step appends {step, seconds, at, skipped?} to /tmp/<lane>/prep-times.jsonl (pod-capture --prep).
set -euo pipefail
: "${POD_SSH:?POD_SSH=\"ssh -i <key> -p <port> root@<ip>\"}"
t=${POD_SSH##* }; S="${POD_SSH% *} -o StrictHostKeyChecking=no"
cd "$(git rev-parse --show-toplevel)"
note() { mkdir -p "/tmp/$lane"; echo "{\"step\":\"$1\",\"seconds\":$2,\"at\":$(date +%s)${3:+,\"skipped\":true}}" >> "/tmp/$lane/prep-times.jsonl"; }
DATA_EXCL=(--exclude /kits/ --exclude /province/ --exclude /textures/)

if [ "${1:-}" = --data ]; then
  lane=${2:?lane}; t0=$(date +%s)
  pub=$(node -e 'import("./apps/world-studio/scripts/lib/webgpu-static.mjs").then((m) => console.log(m.dataPublicDir()))')
  h=$(cd "$pub" && find . -type f -printf '%P %s %T@\n' | sort | sha1sum | cut -c1-40)
  if [ "$($S "$t" "cat /root/site/public/.hash 2>/dev/null" || true)" = "$h" ]; then
    echo "pod-sync: data unchanged ($h), skipped"; note sync:data 0 1; exit 0; fi
  $S "$t" "mkdir -p /root/site/public"
  rsync -a --delete --exclude /.hash -e "$S" "$pub/" "$t:/root/site/public/"
  $S "$t" "echo $h > /root/site/public/.hash"
  s=$(( $(date +%s) - t0 )); echo "pod-sync: data synced in $s s"; note sync:data "$s"; exit 0
fi

d=${1:?dist dir}; n=${2:?name}; lane=${3:?lane}; t0=$(date +%s)
base=$(node -e 'import("./tooling/gpu-lane/serve-lib.mjs").then((m) => console.log(m.distBase(process.argv[1])))' "$d")
h=$(cd "$d" && find . -type f ! -name .srchash ! -path './kits/*' ! -path './province/*' ! -path './textures/*' -print0 | sort -z | xargs -0 sha1sum | sha1sum | cut -c1-40)
if [ "$($S "$t" "cat /root/site/dists/$n/.hash 2>/dev/null; kill -0 \$(cat /root/serve.pid 2>/dev/null) 2>/dev/null && echo alive" || true)" = "$h"$'\n'alive ]; then
  echo "pod-sync: $n unchanged ($h), server alive, skipped"; note "sync:$n" 0 1; exit 0; fi
$S "$t" "mkdir -p /root/site/dists; cd /root/site/dists; for o in *; do [ \"\$o\" != '$n' ] && [ -f \"\$o/index.html\" ] && grep -q 'src=\"$base'assets/ \"\$o/index.html\" && { echo \"pod-sync: removing \$o (also built for $base)\"; rm -rf \"\$o\"; }; done; true"
rsync -a --checksum --delete "${DATA_EXCL[@]}" --exclude /.hash --exclude /.srchash -e "$S" "$d/" "$t:/root/site/dists/$n/"
rsync -aR -e "$S" tooling/gpu-lane/serve.mjs tooling/gpu-lane/serve-lib.mjs tooling/gpu-lane/pod-setup.sh \
  apps/world-studio/scripts/lib/webgpu-static.mjs "$t:/root/site/"
$S "$t" "echo $h > /root/site/dists/$n/.hash"
s=$(( $(date +%s) - t0 )); note "sync:$n" "$s"; t0=$(date +%s)
$S "$t" 'cd /root/site; [ -f /root/serve.pid ] && kill $(cat /root/serve.pid) 2>/dev/null
for p in $(lsof -t -iTCP:8099 -sTCP:LISTEN 2>/dev/null); do kill $p; done
ES_DATA_PUBLIC=/root/site/public setsid nohup node tooling/gpu-lane/serve.mjs dists/* --port 8099 >/root/serve.log 2>&1 </dev/null & echo $! >/root/serve.pid
for d in dists/*; do b=$(grep -o "src=\"/[^\"]*/assets/" $d/index.html | head -1 | sed "s/^src=\"//; s/assets\/$//")
  curl -sf --retry 10 --retry-all-errors --retry-delay 1 -o /dev/null "http://127.0.0.1:8099${b}index.html" || { cat /root/serve.log; echo "pod-sync: $b ($d) not served" >&2; exit 1; }
  echo "pod-sync: $b ok"; done
[ -d /root/site/public ] || { echo "pod-sync: no /root/site/public; run pod-sync.sh --data first" >&2; exit 1; }
kill -0 $(cat /root/serve.pid) 2>/dev/null || { cat /root/serve.log; echo "pod-sync: serve.mjs is not running" >&2; exit 1; }
cat /root/serve.log'
note serve $(( $(date +%s) - t0 ))

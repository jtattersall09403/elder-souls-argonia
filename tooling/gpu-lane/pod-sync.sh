#!/usr/bin/env bash
# Copy a built studio to the pod as /root/site/dists/<name> and restart serve.mjs on the pod's
# port 8099 over EVERY synced dist, each at the base it was built for: a dev build (/studio/) and branch
# builds (/webgpu/, or their own ES_STUDIO_BASE) are served side by side for pod-capture --compare.
#   POD_SSH="ssh -i ~/.ssh/runpod_<lane> -p <port> root@<ip>" tooling/gpu-lane/pod-sync.sh <dist> <name>
# A later sync of the same <name> replaces it; two dists built for one base fail at serve start.
set -euo pipefail
d=${1:?dist dir}; n=${2:?name}; : "${POD_SSH:?POD_SSH=\"ssh -i <key> -p <port> root@<ip>\"}"
t=${POD_SSH##* }; S="${POD_SSH% *} -o StrictHostKeyChecking=no"
cd "$(git rev-parse --show-toplevel)"
$S "$t" mkdir -p /root/site/dists
rsync -a --delete -e "$S" "$d/" "$t:/root/site/dists/$n/"
rsync -aR -e "$S" tooling/gpu-lane/serve.mjs tooling/gpu-lane/serve-lib.mjs tooling/gpu-lane/pod-setup.sh \
  apps/world-studio/scripts/lib/webgpu-static.mjs "$t:/root/site/"
$S "$t" 'cd /root/site; [ -f /root/serve.pid ] && kill $(cat /root/serve.pid) 2>/dev/null || true
ES_DATA_PUBLIC=/root/site/public setsid nohup node tooling/gpu-lane/serve.mjs dists/* --port 8099 >/root/serve.log 2>&1 </dev/null & echo $! >/root/serve.pid
curl -sf --retry 10 --retry-all-errors --retry-delay 1 -o /dev/null http://127.0.0.1:8099/elder-souls-argonia/studio/ && cat /root/serve.log'

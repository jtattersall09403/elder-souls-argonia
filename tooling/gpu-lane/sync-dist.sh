#!/usr/bin/env bash
# Copy the composed site and these scripts to the pod incrementally (rsync: the first run carries
# the whole ~650 MB site, later runs only what changed), then (re)start the site server on the pod
# at 127.0.0.1:8099 (detached; log /tmp/serve.log on the pod).
#   bash tooling/gpu-lane/sync-dist.sh <ssh target e.g. root@1.2.3.4> <ssh port> <key file> [site dir, default /tmp/perf10/site]
set -euo pipefail
target=$1; port=$2; key=$3; site=${4:-/tmp/perf10/site}
here=$(cd "$(dirname "$0")" && pwd)
[ -f "$site/studio/index.html" ] || { echo "no composed site at $site (npm run build && npm run site:compose -- --out $site)"; exit 2; }
ssh_cmd="ssh -p $port -i $key -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
$ssh_cmd "$target" 'command -v rsync >/dev/null || (apt-get update -qq && apt-get install -y -qq rsync >/dev/null); mkdir -p /root/site /root/gpu-lane'
rsync -az --delete --info=stats1 -e "$ssh_cmd" "$site/" "$target:/root/site/"
rsync -az -e "$ssh_cmd" "$here/serve.mjs" "$here/pod-setup.sh" "$target:/root/gpu-lane/"
$ssh_cmd "$target" 'pkill -f "^node /root/gpu-lane/serve.mjs" || true  # anchored: the remote shell'"'"'s own command line also holds the path
  setsid -f nohup node /root/gpu-lane/serve.mjs /root/site --port 8099 >/root/serve.log 2>&1 </dev/null
  curl -sf --retry 10 --retry-all-errors --retry-delay 1 -o /dev/null http://127.0.0.1:8099/elder-souls-argonia/studio/ && cat /root/serve.log'

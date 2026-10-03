#!/usr/bin/env bash
# Put a built studio on the pod and (re)start serve.mjs on the pod's port 8099 over EVERY synced dist, each at the
# base it was built for (dev at /studio/, webgpu at /webgpu/), with the studio data from /root/site/public.
#   POD_SSH="ssh -i <key> -p <port> root@<ip>" bash tooling/gpu-lane/pod-sync.sh --data <lane>   (once per pod)
#   POD_SSH="..." bash tooling/gpu-lane/pod-sync.sh <dist> <dev|webgpu> <lane>                   (per iteration)
#   POD_SSH="..." bash tooling/gpu-lane/pod-sync.sh --check <lane> [webgl|webgpu]               (before build/sync)
# --check: the pod's Chrome must answer 127.0.0.1:9222/json/version; when it does not, pod-setup.sh is re-run on the pod
#   (default webgpu flags) and the check repeated; exits non-zero if Chrome is still down (iter7 lost 10 min to this).
# --data: apps/world-studio/public (~600 MB) to /root/site/public: git-tracked files (kits/ and the tracked json) from
#   THIS worktree (run it from the tree the dist was built from), untracked generated data (province rasters) from the
#   main worktree; refuses, listing the paths, while this tree has uncommitted changes under kits/ (diag22 C1). Skipped
#   when the listing hash (path, size, mtime) equals the pod's /root/site/public/.hash.
# Each dist also carries the server's own files (serve-lib.mjs serveFiles), so serve.mjs starts on the pod's node.
# <dist>: the fixed folder build-dist.sh writes (never a per-iteration copy). Its key (build-dist's source key in
#   .srchash plus the serve*.mjs it starts, no hash over the built files) is compared with /root/site/dists/<name>/.hash; equal and the server alive -> skip; else
#   `rsync -a --checksum --delete` (data dirs excluded) and restart. Any other pod dist built for the same base is
#   deleted first. Exits non-zero unless, after a restart, the new serve.mjs is alive and every served base answers.
# Each step appends {step, seconds, at, skipped?, bytes?} (bytes: rsync "sent" for sync:data and sync:<dist>) to /tmp/<lane>/prep-times.jsonl (a lane log; pod-capture times its own prep).
set -euo pipefail
: "${POD_SSH:?POD_SSH=\"ssh -i <key> -p <port> root@<ip>\"}"
t=${POD_SSH##* }; S="${POD_SSH% *} -o StrictHostKeyChecking=no"
cd "$(git rev-parse --show-toplevel)"
note() { mkdir -p "/tmp/$lane"; echo "{\"step\":\"$1\",\"seconds\":$2,\"at\":$(date +%s)${3:+,\"skipped\":true}${4:+,\"bytes\":$4}}" >> "/tmp/$lane/prep-times.jsonl"; }
# bytes sent by an rsync run with --stats (its "Total bytes sent: 1,234" line)
sent() { tee /dev/stderr | sed -n 's/^Total bytes sent: //p' | tr -d ',' | tail -1; }
chrome_up() { $S -o ConnectTimeout=5 "$t" "curl -s -m 3 127.0.0.1:9222/json/version" 2>/dev/null | grep -q webSocketDebuggerUrl; }

if [ "${1:-}" = --check ]; then
  lane=${2:?lane}; t0=$(date +%s)
  if chrome_up; then echo "pod-sync: pod Chrome up"; note check 0 1; exit 0; fi
  echo "pod-sync: pod Chrome down, re-running pod-setup.sh ${3:-webgpu}"
  $S "$t" "bash -s ${3:-webgpu}" < tooling/gpu-lane/pod-setup.sh
  chrome_up || { echo "pod-sync: pod Chrome still down after pod-setup.sh" >&2; exit 1; }
  s=$(( $(date +%s) - t0 )); echo "pod-sync: pod Chrome restarted in $s s"; note check "$s"; exit 0
fi
DATA_EXCL=(--exclude /kits/ --exclude /province/ --exclude /textures/)

if [ "${1:-}" = --data ]; then
  # Data source (diag22 C1): git-TRACKED public files (kits/, tracked province/textures json) from THIS worktree, the
  # tree the dist is built from; only untracked generated data (province rasters, vegetation) from the main worktree
  # (git common dir), which another lane may leave mid-republish. Refuses while this tree's tracked public data is dirty.
  lane=${2:?lane}; t0=$(date +%s); P=apps/world-studio/public
  dirty=$(git status --porcelain -- "$P/kits" | cut -c4-)
  [ -z "$dirty" ] || { echo "pod-sync: refusing --data: uncommitted kit data in $(pwd)/$P/kits (commit it or build from a clean tree):" >&2; echo "$dirty" | head -40 >&2; exit 1; }
  main=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
  lst=$(mktemp); trap 'rm -f "$lst"' EXIT
  { git ls-files -- "$P"; git -C "$main" ls-files -- "$P"; } | sed "s#^$P/##" | sort -u > "$lst"
  h=$({ git ls-files -z -- "$P" | xargs -0 -r stat -c '%n %s %Y'
        (cd "$main/$P" && find . -type f -printf '%P %s %T@\n') | awk 'NR==FNR { t[$0] = 1; next } !($1 in t)' "$lst" -; } | sort | sha1sum | cut -c1-40)
  if [ "$($S "$t" "cat /root/site/public/.hash 2>/dev/null" || true)" = "$h" ]; then
    echo "pod-sync: data unchanged ($h), skipped"; note sync:data 0 1; exit 0; fi
  $S "$t" "mkdir -p /root/site/public"
  # untracked data from the main tree (tracked paths excluded, so --delete leaves them to the second pass)
  b1=$(rsync -a --stats --delete --exclude /.hash --exclude-from=<(sed 's#^#/#' "$lst") -e "$S" "$main/$P/" "$t:/root/site/public/" | sent)
  # tracked data from this tree
  b2=$(git ls-files -- "$P" | sed "s#^$P/##" | rsync -a --stats --ignore-missing-args --files-from=- -e "$S" "$P/" "$t:/root/site/public/" | sent)
  $S "$t" "echo $h > /root/site/public/.hash"
  s=$(( $(date +%s) - t0 )); echo "pod-sync: data synced in $s s ($b1 + $b2 bytes sent; tracked from $(pwd), untracked from $main)"; note sync:data "$s" "" "$((b1 + b2))"; exit 0
fi

d=${1:?dist dir}; n=${2:?name}; lane=${3:?lane}; t0=$(date +%s)
base=$(node -e 'import("./tooling/gpu-lane/serve-lib.mjs").then((m) => console.log(m.distBase(process.argv[1])))' "$d")
[ -f "$d/.srchash" ] || { echo "pod-sync: $d has no .srchash; build it with build-dist.sh" >&2; exit 1; }
h=$({ cat "$d/.srchash"; sha1sum tooling/gpu-lane/serve.mjs tooling/gpu-lane/serve-lib.mjs; } | sha1sum | cut -c1-40)
if [ "$($S "$t" "cat /root/site/dists/$n/.hash 2>/dev/null; kill -0 \$(cat /root/serve.pid 2>/dev/null) 2>/dev/null && echo alive" || true)" = "$h"$'\n'alive ]; then
  echo "pod-sync: $n unchanged ($h), server alive, skipped"; note "sync:$n" 0 1; exit 0; fi
$S "$t" "mkdir -p /root/site/dists; cd /root/site/dists; for o in *; do [ \"\$o\" != '$n' ] && [ -f \"\$o/index.html\" ] && grep -q 'src=\"$base'assets/ \"\$o/index.html\" && { echo \"pod-sync: removing \$o (also built for $base)\"; rm -rf \"\$o\"; }; done; true"
b=$(rsync -a --stats --checksum --delete "${DATA_EXCL[@]}" --exclude /.hash --exclude /.srchash -e "$S" "$d/" "$t:/root/site/dists/$n/" | sent)
# Exactly what serve.mjs and the studio it serves read (serve-lib serveFiles: modules, three's package.json and basis
# dir, the character files); it fails naming any missing path, and this script stops on it.
mapfile -t serve_files < <(node -e 'import("./tooling/gpu-lane/serve-lib.mjs").then((m) => console.log(m.serveFiles().join("\n")))')
[ ${#serve_files[@]} -gt 0 ] || { echo "pod-sync: serveFiles listed nothing" >&2; exit 1; }
rsync -aR -e "$S" "${serve_files[@]}" "$t:/root/site/"
$S "$t" "echo $h > /root/site/dists/$n/.hash"
s=$(( $(date +%s) - t0 )); echo "pod-sync: $n synced in $s s, $b bytes sent"; note "sync:$n" "$s" "" "$b"; t0=$(date +%s)
$S "$t" 'cd /root/site; [ -f /root/serve.pid ] && kill $(cat /root/serve.pid) 2>/dev/null
for p in $(lsof -t -iTCP:8099 -sTCP:LISTEN 2>/dev/null); do kill $p; done
ES_DATA_PUBLIC=/root/site/public setsid nohup node tooling/gpu-lane/serve.mjs dists/* --port 8099 >/root/serve.log 2>&1 </dev/null & echo $! >/root/serve.pid
for d in dists/*; do b=$(grep -o "src=\"/[^\"]*/assets/" $d/index.html | head -1 | sed "s/^src=\"//; s/assets\/$//")
  curl -sf --retry 10 --retry-all-errors --retry-delay 1 -o /dev/null "http://127.0.0.1:8099${b}index.html" || { cat /root/serve.log; echo "pod-sync: $b ($d) not served" >&2; exit 1; }
  echo "pod-sync: $b ok"; done
[ -d /root/site/public ] || { echo "pod-sync: no /root/site/public; run pod-sync.sh --data first" >&2; exit 1; }
kill -0 $(cat /root/serve.pid) 2>/dev/null || { cat /root/serve.log; echo "pod-sync: serve.mjs is not running" >&2; exit 1; }
cat /root/serve.log'
# Sentinels: the pod must answer 200 with the local file's size at the data prefix (serve-lib DATA_PREFIX; the SPA
# fallback html is 200 with another size). Walk 10: a crashed server left an old one answering and the sync returned 0.
for f in province/refined/ground-control.png kits/bmv-treehouse-int/parts/index.json; do
  want=$(stat -L -c %s "apps/world-studio/public/$f")
  got=$($S "$t" "curl -s -o /dev/null -w '%{http_code} %{size_download}' http://127.0.0.1:8099/elder-souls-argonia/studio/$f")
  [ "$got" = "200 $want" ] || { echo "pod-sync: data mismatch for $f: pod '$got', local '200 $want'" >&2; exit 1; }
done
note serve $(( $(date +%s) - t0 ))

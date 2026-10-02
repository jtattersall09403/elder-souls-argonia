#!/usr/bin/env bash
# Build one studio dist into a FIXED local folder, skipping the build when the worktree's source is unchanged.
#   bash tooling/gpu-lane/build-dist.sh <worktree> <dev|webgpu|harness> <lane>
# -> /tmp/<lane>/dist-<name> (dev at /elder-souls-argonia/studio/, webgpu at /elder-souls-argonia/webgpu/ reading data
# from /studio/, harness: harness.html (fire/settlement/air scenes) at /elder-souls-argonia/harness/ reading data from
# /studio/, built with the committed vite.harness.mjs). Key = HEAD^{tree} + sha1 of `git diff HEAD` + untracked file list; equal to dist-<name>/.srchash -> skip.
# Built to /tmp/<lane>/build-<name> under job_guard, then `rsync -a --checksum --delete` into the fixed folder, so
# unchanged files keep their mtimes and pod-sync.sh sends only what changed. The studio data vite copies from public/
# (kits/ province/ textures/) is left out: the pod serves it once from /root/site/public (pod-sync.sh --data).
# Never per-iteration dist folders, never cp -R. Appends {step:"build:<name>", seconds, at, skipped?} to
# /tmp/<lane>/prep-times.jsonl.
set -euo pipefail
wt=${1:?worktree}; n=${2:?dev|webgpu}; lane=${3:?lane}
case "$n" in
  dev) envs=(ES_STUDIO_BASE=/elder-souls-argonia/studio/) ;;
  webgpu) envs=(ES_STUDIO_BASE=/elder-souls-argonia/webgpu/ VITE_ES_DATA_BASE=/elder-souls-argonia/studio/) ;;
  harness) envs=(ES_STUDIO_BASE=/elder-souls-argonia/harness/ VITE_ES_DATA_BASE=/elder-souls-argonia/studio/) ;;
  *) echo "build-dist: name must be dev, webgpu or harness" >&2; exit 2 ;;
esac
here=$(cd "$(dirname "$0")" && pwd)
cfg=(); [ "$n" = harness ] && cfg=(--config "$here/vite.harness.mjs")
mkdir -p "/tmp/$lane"; dist=/tmp/$lane/dist-$n; stage=/tmp/$lane/build-$n; log=/tmp/$lane/prep-times.jsonl
key=$(cd "$wt" && { git rev-parse 'HEAD^{tree}'; git diff HEAD | sha1sum; git ls-files --others --exclude-standard | sha1sum; } | sha1sum | cut -c1-40)
t0=$(date +%s)
if [ -f "$dist/.srchash" ] && [ "$(cat "$dist/.srchash")" = "$key" ]; then
  echo "build-dist: $n unchanged ($key), skipped"
  echo "{\"step\":\"build:$n\",\"seconds\":0,\"at\":$(date +%s),\"skipped\":true}" >> "$log"; exit 0
fi
(cd "$wt/apps/world-studio" && env "${envs[@]}" bash "$here/../repo-standards/job_guard.sh" "$lane" --mem 8 -- npx vite build "${cfg[@]}" --outDir "$stage" --emptyOutDir >"/tmp/$lane/build-$n.log" 2>&1) || { tail -20 "/tmp/$lane/build-$n.log"; exit 1; }
# the harness page is served as the dist's index.html (serve.mjs reads the base from it; the view URLs end in /harness/?..)
[ "$n" = harness ] && cp "$stage/harness.html" "$stage/index.html"
mkdir -p "$dist"
rsync -a --checksum --delete --exclude /kits/ --exclude /province/ --exclude /textures/ --exclude /.srchash "$stage/" "$dist/"
echo "$key" > "$dist/.srchash"
s=$(( $(date +%s) - t0 )); echo "build-dist: $n built in $s s -> $dist"
echo "{\"step\":\"build:$n\",\"seconds\":$s,\"at\":$(date +%s)}" >> "$log"

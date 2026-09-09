#!/usr/bin/env bash
# Hash everything the terrain chain PUBLISHES, into $1.
#
#   ./scripts/chain-manifest.sh /tmp/after.txt
#   diff /tmp/before.txt /tmp/after.txt
#
# This is the chain's acceptance test: a fast-path run and a full run on the
# same sources must produce the same manifest, byte for byte. It follows
# `ES_VAULT_ROOT`, so it measures whichever vault the run you are checking
# actually wrote (a scratch copy for benchmarking, or the real one).
#
# Excluded, on purpose: the chain's own bookkeeping is not the province. The
# stamp book, the fast path's footprint and carve snapshots, the changed-tile
# list and the scatter's input snapshots all record HOW a run happened, not
# what it published, and they legitimately differ between the two paths.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VAULT="${ES_VAULT_ROOT:-$HOME/workspace/elder-souls-dev/elder-scrolls-asset-pipeline/skyrim-source/mod-sources/tamriel-worldspaces-118678/extracted/Argonia Worldspace/argonia-heightfield}"
out="${1:?usage: chain-manifest.sh <output file>}"
: > "$out"
( cd "$REPO_ROOT/apps/world-studio/public/province" \
  && find . -type f | sort | xargs sha256sum ) | sed 's#\./#studio/#' >> "$out"
( cd "$VAULT/province-refined" && find . -type f \
    ! -name 'compiled-height-f32.npy' ! -name 'chunks-changed.json' \
    ! -name 'chain-footprint.json' ! -name 'local-carve-*' \
    ! -name 'refined-height-prelocal-f32.npy' ! -name 'refined-height-graded-by.json' \
    ! -path './scatter-input-snapshots/*' | sort | xargs sha256sum ) | sed 's#\./#vault/#' >> "$out"
wc -l < "$out"

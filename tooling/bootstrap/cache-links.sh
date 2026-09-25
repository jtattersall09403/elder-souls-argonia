#!/usr/bin/env bash
# cache-links.sh: keep the mod pool, the mesh cache and the builds on the big
# /tmp volume, linked from where every tool reads them. Run by on-start.sh on
# every start; idempotent; safe by hand (`bash tooling/bootstrap/cache-links.sh`).
#
# Why: on a codespace /workspaces is a 32 GB volume, too small for the mod
# pool (bmv 9.65 GB, drjacopo 9.2, here-there-be-monsters 4.9, kotm 3.4, ...),
# while /tmp is a separate ~118 GB volume that can be emptied (GitHub's docs:
# at every stop; the owner's 2026-09-25 brief: at a rebuild; this script
# handles either, on every start). So:
#   <every manifest root whose parts are all tier mod>  -> $CACHE/mod-sources/<folder name>
#       (the vault's skyrim-source/mod-sources/<folder> and the repo's
#       tooling/asset-pipeline/black-marsh-mod-source)
#   tooling/world-generation/output/mesh-cache            -> $CACHE/mesh-cache/world-generation
#   tooling/asset-pipeline/build                          -> $CACHE/builds/asset-pipeline
# Each path becomes a symlink; vault_path.py, the miners and vault-pull.sh
# read through it unchanged. A mod folder is linked only while it holds files
# (a tool or test that asks "is this mod here?" must keep getting "no" for an
# unpulled one); the two caches are always linked (their tools create them).
# Per path:
#   - a real directory with files: they move to the target (copy, then
#     delete), then the link replaces it; a non-empty target already there is
#     a conflict: reported, nothing moved;
#   - a link whose target is missing or empty (/tmp was emptied): the
#     vault-pull markers of its parts are dropped, so `vault-pull.sh <id>`
#     pulls it again; a mod link is removed, a cache target re-created;
#   - nothing there: a cache link is made (its parent created inside the
#     repo); a mod folder is left absent until vault-pull links it.
#   cache-links.sh --root <root>   (vault-pull.sh, before it extracts a part)
#     links that one root now, empty, if the plan names it; else does nothing.
# Links inside the repo that .gitignore does not cover (a "dir/" rule never
# matches a link) are added to .git/info/exclude.
# Does nothing when $CACHE is on the dev root's own volume (the old VM) or
# ES_CACHE_LINKS=0. ES_CACHE_ROOT overrides /tmp/es-cache.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib.sh"
es_paths
CACHE="${ES_CACHE_ROOT:-/tmp/es-cache}"
REPO_NAME="$(basename "$REPO")"
say() { echo "[cache-links] $*"; }

[[ "${ES_CACHE_LINKS:-1}" == 0 ]] && { say "ES_CACHE_LINKS=0; nothing linked"; exit 0; }
mkdir -p "$CACHE"/{mod-sources,mesh-cache,builds,.staging}
if [[ "$(stat -c %d "$CACHE")" == "$(stat -c %d "$DEVROOT")" ]]; then
  say "$CACHE is on the dev root's volume; nothing to gain, nothing linked"
  exit 0
fi

# "<root relative to the dev root><TAB><target><TAB><mod|cache>", one per line.
plan() {
  python3 - "$MANIFEST" "$CACHE" <<'PY'
import json, os, sys
manifest, cache = sys.argv[1:3]
tiers = {}
for p in json.load(open(manifest))["parts"]:
    tiers.setdefault(p["root"], set()).add(p["tier"])
for root in sorted(r for r, t in tiers.items() if t == {"mod"}):
    print(f"{root}\t{cache}/mod-sources/{os.path.basename(root)}\tmod")
PY
  printf '%s\t%s\tcache\n' "$REPO_NAME/tooling/world-generation/output/mesh-cache" "$CACHE/mesh-cache/world-generation"
  printf '%s\t%s\tcache\n' "$REPO_NAME/tooling/asset-pipeline/build" "$CACHE/builds/asset-pipeline"
}

empty() { [[ -z "$(find "$1" -mindepth 1 -print -quit 2>/dev/null)" ]]; }

drop_markers() {  # drop_markers <root>
  local id mk n=0
  while IFS= read -r id; do
    [[ -z "$id" ]] && continue
    mk="$(marker "$id")"
    # .inprogress too: a pull cut off mid-swap has nothing left to roll forward.
    if [[ -f "$mk" || -f "$mk.inprogress" ]]; then rm -f -- "$mk" "$mk.files" "$mk.inprogress"; n=$((n + 1)); fi
  done < <(mf same-root "$1")
  (( n )) && say "$1: its files are gone (/tmp was emptied); dropped $n vault-pull marker(s), pull again on demand"
  return 0
}

exclude_in_git() {  # exclude_in_git <root>: a link in the repo that .gitignore misses
  [[ "$1" == "$REPO_NAME/"* ]] || return 0
  local rel="${1#"$REPO_NAME"/}" ex
  git -C "$REPO" check-ignore -q -- "$rel" 2>/dev/null && return 0
  ex="$(git -C "$REPO" rev-parse --git-path info/exclude)"; [[ "$ex" = /* ]] || ex="$REPO/$ex"
  mkdir -p "$(dirname "$ex")"
  grep -qxF "/$rel" "$ex" 2>/dev/null || { echo "/$rel" >> "$ex"; say "added /$rel to .git/info/exclude"; }
}

make_link() {  # make_link <root> <target>
  mkdir -p "$2"
  ln -s -- "$2" "$DEVROOT/$1"
  exclude_in_git "$1"
}

only="${1:-}"
[[ "$only" == --root ]] && only="${2:?--root needs a root}"
linked=0 moved=0 conflicts=0
while IFS=$'\t' read -r root target kind; do
  path="$DEVROOT/$root"
  if [[ -n "$only" ]]; then   # vault-pull: link this root now, empty, if it is ours
    [[ "$root" == "$only" ]] || continue
    if [[ -L "$path" ]]; then mkdir -p "$target"
    elif [[ -d "$path" ]] && ! empty "$path"; then :   # a real folder with files: moved at the next start
    else
      [[ -d "$path" ]] && rmdir -- "$path"
      mkdir -p "$(dirname "$path")"; make_link "$root" "$target"
    fi
    exit 0
  fi
  if [[ -L "$path" ]]; then
    if [[ "$(readlink "$path")" != "$target" ]]; then
      say "CONFLICT: $root links to $(readlink "$path"), not $target; left alone"; conflicts=$((conflicts + 1)); continue
    fi
    if empty "$target"; then
      drop_markers "$root"
      if [[ "$kind" == mod ]]; then rm -f -- "$path"; rmdir -- "$target" 2>/dev/null || true; continue; fi
      mkdir -p "$target"
    fi
  elif [[ -d "$path" ]]; then
    if empty "$path"; then
      [[ "$kind" == mod ]] && continue
      rmdir -- "$path"; make_link "$root" "$target"
    else
      if ! empty "$target"; then
        say "CONFLICT: $root is a real folder and $target is not empty; nothing moved"; conflicts=$((conflicts + 1)); continue
      fi
      say "moving $root ($(du -sh "$path" | cut -f1)) to $target"
      rm -rf -- "$target.partial"; mkdir -p "$target.partial"
      cp -a -- "$path/." "$target.partial/"
      rm -rf -- "$target"; mv -- "$target.partial" "$target"
      rm -rf -- "$path"
      moved=$((moved + 1))
      make_link "$root" "$target"
    fi
  elif [[ -e "$path" ]]; then
    say "CONFLICT: $root is a file; left alone"; conflicts=$((conflicts + 1)); continue
  else
    [[ "$kind" == mod ]] && continue   # absent until vault-pull links it
    mkdir -p "$(dirname "$path")"; make_link "$root" "$target"
  fi
  linked=$((linked + 1))
done < <(plan)
[[ -n "$only" ]] && exit 0
say "$linked link(s) in place ($moved folder(s) moved, $conflicts conflict(s)); $CACHE: $(df -h --output=avail "$CACHE" | tail -1 | tr -d ' ') free"

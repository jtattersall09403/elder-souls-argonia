#!/usr/bin/env bash
# vault-pull.sh: restore snapshot parts from the R2 bucket into the dev root.
#
#   vault-pull.sh <id>...            pull these parts
#   vault-pull.sh --tier <tier>...   pull every part of a tier (repeatable)
#   vault-pull.sh --with-archives <id>...   also pull each part's archivesPart
#   vault-pull.sh --list             every part: tier, size, pulled or not
#   vault-pull.sh --free             free space and the pulled parts, oldest use first
#   vault-pull.sh --evict <id>       remove a pulled "mod" or "cache" part (with its root)
#   vault-pull.sh --force ...        extract over local changes
#
# Reads tooling/bootstrap/snapshot-manifest.json (schemaVersion 1). Each part is
# one uncompressed tar of paths relative to the dev root, streamed
# `rclone cat | tee | tar -x` with its sha256 checked on the same stream. A part
# whose object ends in .bundle (the vault git bundle) is fetched to a file,
# $DEVROOT/.vault-pull/<id>.bundle, not extracted, and only while its root is
# not a git checkout yet (it seeds the clone; it never touches a checkout). A marker in
# $DEVROOT/.vault-pull/ records each pulled part: line 1 its sha256, line 2
# the lib.sh fingerprint of the files the part's tar held, taken right after
# extraction (or after snapshot-vault.sh uploads the part from here); the
# sidecar <marker>.files lists those files; the marker's mtime is the last
# use. A pull into an existing root is staged in .vault-pull/staging/<id> and
# moved in only after its sha256 matches (the old version's stale files are
# deleted then). Eviction runs the same guard over the whole root and keeps a
# root with local changes. Parts sharing a root are one eviction
# unit: a root is evicted (when a pull needs room, least recently used first)
# only if every part with that root is tier "mod" or "cache". Before extracting, the pull
# refuses (unless --force) if the part's files changed since the marker, or, with
# no marker, if any of the part's files (read from its sidecar object
# filesObject) already exists here and is not a git-tracked file equal to HEAD.
#
# A root may be a link into the /tmp cache volume (cache-links.sh, run by
# on-start.sh on a codespace): the pull links it first (cache-links.sh
# --root), always stages into that volume ($ES_CACHE_ROOT/.staging; tar
# will not extract through a link leading outside -C) and moves the files in,
# counts free space and evicts there, and an eviction removes the target and
# the link (the folder reads as absent again).
# Environment: ES_DEVROOT (default: the repo's parent), ES_SNAPSHOT_MANIFEST,
# ES_CACHE_ROOT (default /tmp/es-cache),
# ES_RCLONE_REMOTE (default r2), ES_VAULT_PULL_RESERVE (bytes kept free,
# default 2 GiB), ES_PULL_FREE_LIMIT_BYTES (test only: treat the dev root as a
# disk of this size, so free = min(real free, limit - bytes under the root)),
# ES_PULL_TEST_MOVE_LIMIT (test only: a staged swap dies after moving this
# many entries, to exercise the roll-forward).
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib.sh"
es_paths
REMOTE="${ES_RCLONE_REMOTE:-r2}"
RESERVE="${ES_VAULT_PULL_RESERVE:-2147483648}"
FORCE=0

die() { echo "[vault-pull] ERROR: $*" >&2; exit 1; }
say() { echo "[vault-pull] $*"; }

[[ -f "$MANIFEST" ]] || die "manifest not found: $MANIFEST"
command -v rclone >/dev/null || die "rclone is not installed"
# $MARKS is created only by a pull about to write (--list/--free/--evict never).

part() {  # part <id>: sets P_OBJECT P_BYTES P_SHA P_ROOT P_TIER P_ARCH P_NEEDS
  local line
  line="$(mf get "$1")" || die "unknown part: $1 (see --list)"
  IFS=$'\x1f' read -r P_OBJECT P_BYTES P_SHA P_ROOT P_TIER P_ARCH P_NEEDS <<<"$line"
}

LIMIT="${ES_PULL_FREE_LIMIT_BYTES:-}"
# A part's root may be a link into another volume (cache-links.sh: on a
# codespace the mod pool and the caches live on /tmp). Space, staging and
# eviction are all per volume: the volume a path lands on, found from its
# nearest existing ancestor with links followed.
landing() {  # landing <path>: its nearest existing ancestor, links resolved
  local p="$1"
  while [[ ! -e "$p" && "$p" != / ]]; do p="$(dirname "$p")"; done
  readlink -f "$p"
}
vol_of() { stat -c %d "$(landing "$1")"; }
free_bytes() {  # free_bytes [<path>]: free bytes on the volume <path> lands on (default the dev root)
  local real; real="$(df -B1 --output=avail "$(landing "${1:-$DEVROOT}")" | tail -1 | tr -d ' ')"
  if [[ -n "$LIMIT" ]]; then
    local sim=$(( LIMIT - $(du -sb "$DEVROOT" | cut -f1) ))
    (( sim < real )) && real=$sim
  fi
  echo "$real"
}

is_bundle() { [[ "$P_OBJECT" == *.bundle ]]; }

target_of() {  # the path a part populates (a directory, or the bundle file)
  if is_bundle; then echo "$MARKS/${1//\//__}.bundle"; else echo "$DEVROOT/$P_ROOT"; fi
}

safe_remove() {  # remove a part's root (a leaf only) and the markers of every part sharing it
  local path="$1" other
  [[ -n "$P_ROOT" && "$P_ROOT" != "." && "$P_ROOT" != /* && "$P_ROOT" != *..* ]] \
    || die "refusing to remove root '$P_ROOT'"
  [[ -e "$path/.git" ]] && die "refusing to remove $path: it holds a git checkout"
  # A root that other parts live under (skyrim-source holds Data and every
  # mod folder) is never removed: that would take the other parts with it.
  [[ -z "$(mf nested-rel "$P_ROOT")" ]] \
    || die "refusing to remove $path: other parts live under it"
  if [[ -L "$path" ]]; then   # a link into the cache volume: its target and the link go
    local real cache; real="$(readlink -f "$path")"; cache="$(readlink -f "${ES_CACHE_ROOT:-/tmp/es-cache}")"
    [[ "$real" == "$cache"/?* ]] || die "refusing to remove $path: it links to $real, outside $cache"
    rm -rf -- "$real"; rm -f -- "$path"
  else
    rm -rf -- "$path"
  fi
  while IFS= read -r other; do drop_marker "$other"; done < <(mf same-root "$P_ROOT")
}

# Tiers whose parts may be evicted (their files removed to make room). Tier
# chain (the terrain heightfield) and base/vault/claude/toolchain never are.
evictable_tier() { [[ "$1" == mod || "$1" == cache ]]; }

# The parts sharing a root are one unit: evictable only if every one is of an
# evictable tier.
root_evictable() {  # root_evictable <root>
  local other
  while IFS= read -r other; do
    [[ -z "$other" ]] && continue
    evictable_tier "$(mf field "$other" tier)" || return 1
  done < <(mf same-root "$1")
}

drop_marker() { rm -f -- "$(marker "$1")" "$(marker "$1").files"; }

# A part's staging dir, on the volume its root lands on (the move into place
# is a rename): under $MARKS, or, for a root linked into the cache volume,
# under $ES_CACHE_ROOT/.staging (both outside every repo). P_* loaded.
stage_of() {
  local t; t="$(target_of "$1")"
  if [[ "$(vol_of "$t")" == "$(vol_of "$DEVROOT")" ]]; then echo "$MARKS/staging/${1//\//__}"
  else echo "${ES_CACHE_ROOT:-/tmp/es-cache}/.staging/${1//\//__}"; fi
}

# set_inprogress <id> <key=value...>: (re)write <marker>.inprogress atomically.
set_inprogress() {
  local mk; mk="$(marker "$1")"; shift
  mkdir -p "$MARKS"
  printf '%s\n' "$@" > "$mk.inprogress.tmp"
  mv -f -- "$mk.inprogress.tmp" "$mk.inprogress"
}

# recover <id>: a pull of this part was interrupted (<marker>.inprogress is
# there). phase=swap (a staged pull whose sha256 had verified; the swap into
# the live root had begun): ROLL FORWARD. drop_stale again (idempotent), move
# whatever the staging dir still holds into place, write the new marker (the
# sha recorded in .inprogress). phase=stream, staged: the live root was never
# touched, so only the staging dir goes; files and old marker stay at the
# previous version. phase=stream, in place (a first pull): every file under
# the root that the part's sidecar or its old marker lists (never any other
# file) is deleted, empty dirs pruned, the marker dropped. The pull then goes
# on, with no --force.
recover() {
  local mk st; mk="$(marker "$1")"; st="$(stage_of "$1")"
  say "$1: an earlier pull was interrupted ($(tr '\n' ' ' < "$mk.inprogress")); recovering"
  if grep -qx 'phase=swap' "$mk.inprogress"; then
    [[ -f "$st.new" && -f "$mk.files" ]] && drop_stale "$mk.files" "$st.new"
    local nlist="$st.names"
    if [[ -f "$nlist" ]]; then
      move_staged "$st" "$nlist"
    else
      # No .names: every staged file was already moved; the marker's list is
      # the part's sidecar (the same tar entry names).
      nlist="$(mktemp)"
      fetch_filelist "$1" "$nlist" || { rm -f -- "$nlist"; exit 1; }
    fi
    write_marker "$1" "$(sed -n 's/^sha=//p' "$mk.inprogress")" "$nlist"
    [[ "$nlist" == "$st.names" ]] || rm -f -- "$nlist"
    rm -rf -- "$st" "$st.names" "$st.new"
    rm -f -- "$mk.inprogress"
    say "$1: rolled forward to the verified version"
    return 0
  fi
  rm -rf -- "$st" "$st.names" "$st.new"
  if grep -qx 'staged=1' "$mk.inprogress"; then
    rm -f -- "$mk.inprogress"
    return 0
  fi
  if is_bundle; then
    rm -f -- "$(target_of "$1").partial"
  else
    local tmp; tmp="$(mktemp -d)"
    fetch_filelist "$1" "$tmp/new" || { rm -rf -- "$tmp"; exit 1; }
    [[ -f "$mk.files" ]] && cat "$mk.files" >> "$tmp/new"
    : > "$tmp/none"
    drop_stale "$tmp/new" "$tmp/none"
    rm -rf -- "$tmp"
  fi
  drop_marker "$1"
  rm -f -- "$mk.inprogress"
}


# Every file of the part's kind under its root (archives, or all but archives):
# a superset of the part's files, so "empty" proves none of them is here.
subset_fp() {  # subset_fp <id> (P_* loaded)
  local nested=()
  mapfile -t nested < <(mf nested-rel "$P_ROOT")
  part_fingerprint "$DEVROOT/$P_ROOT" "$(part_mode "$1" "$P_ARCH")" "${nested[@]}"
}

# Prints the files the part's tar holds that exist under the dev root and are
# NOT held by git (a tracked file equal to HEAD, as a fresh clone leaves it, is
# git's, so it is no conflict). The list comes from the part's sidecar object
# (filesObject: sorted tar entry names, one per line, a few KB), never from the
# tar itself. Fails if the sidecar cannot be fetched: the guard is strict.
fetch_filelist() {  # fetch_filelist <id> <out>: the part's sidecar list, or an error
  local fo rc=0
  fo="$(mf field "$1" filesObject)"
  [[ -n "$fo" ]] || { echo "[vault-pull] ERROR: $1 has no filesObject in the manifest (snapshot-vault.sh --backfill-filelists); pass --force to extract anyway" >&2; return 1; }
  rclone cat "$REMOTE:$(mf bucket)/$fo" > "$2" 2>/dev/null || rc=$?
  # rclone cat of a missing object prints nothing and exits 0, so an empty
  # list counts only if the object exists (an empty part: a clean vault's
  # vault-worktree).
  if (( rc == 0 )) && [[ ! -s "$2" ]]; then
    rclone lsjson "$REMOTE:$(mf bucket)/$fo" 2>/dev/null \
      | python3 -c 'import json,sys; sys.exit(0 if len(json.load(sys.stdin)) == 1 else 1)' 2>/dev/null || rc=1
  fi
  if (( rc != 0 )); then
    echo "[vault-pull] ERROR: $1: cannot fetch its file list $REMOTE:$(mf bucket)/$fo; pass --force to extract anyway" >&2; return 1
  fi
}

# Python shared by local_conflicts and drop_stale: git_sets(dev, paths)
# returns (tracked, changed), the dev-root-relative paths among <paths> that
# git tracks, and that differ from HEAD, in the work tree holding each. One
# ls-files and one diff per work tree (grouped by first path component); a
# path in no work tree is in neither set.
GITPY='
import os, subprocess
def git_sets(dev, paths):
    groups, tracked, changed = {}, set(), set()
    for p in paths:
        groups.setdefault(p.split("/", 1)[0], []).append(p)
    for first in groups:
        try:
            top = subprocess.run(["git", "-C", os.path.join(dev, first), "rev-parse", "--show-toplevel"],
                                 capture_output=True, text=True, check=True).stdout.strip()
        except (subprocess.CalledProcessError, FileNotFoundError, NotADirectoryError):
            continue
        rel = os.path.relpath(top, dev)
        pre = "" if rel == "." else rel + "/"
        def z(*a):
            r = subprocess.run(["git", "-C", top, *a], capture_output=True, check=True).stdout
            return {pre + q.decode("utf-8", "surrogateescape") for q in r.split(b"\0") if q}
        tracked |= z("ls-files", "-z")
        changed |= z("diff", "--name-only", "--no-renames", "-z", "HEAD")
    return tracked, changed
'

local_conflicts() {  # local_conflicts <id> (P_* loaded)
  local tmp rc=0
  tmp="$(mktemp)"
  fetch_filelist "$1" "$tmp" || { rm -f -- "$tmp"; return 1; }
  python3 -c "$GITPY$(cat <<'PY'

import sys
root = sys.argv[1]
present = [l for l in open(sys.argv[2], encoding="utf-8", errors="surrogateescape").read().splitlines()
           if l and not l.endswith("/") and os.path.lexists(os.path.join(root, l))]
tracked, changed = git_sets(root, present)
held = tracked - changed   # git holds it unchanged: a fresh clone's file
out = [p for p in present if p not in held]
sys.stdout.buffer.write("".join(p + "\n" for p in out).encode("utf-8", "surrogateescape"))
PY
)" "$DEVROOT" "$tmp" || rc=$?
  rm -f -- "$tmp"
  return "$rc"
}

# drop_stale <old list> <new list>: delete the files the old list names and
# the new does not (only under the part's root, never one git tracks in the
# work tree holding it), then the directories that deletion left empty, up to
# the root.
drop_stale() {
  python3 -c "$GITPY$(cat <<'PY'

import sys
dev, root, old, new = sys.argv[1:5]
rd = lambda p: {l for l in open(p, encoding="utf-8", errors="surrogateescape").read().splitlines() if l and not l.endswith("/")}
top = os.path.join(dev, root)
gone = sorted(p for p in rd(old) - rd(new) if p.startswith(root.rstrip("/") + "/"))
tracked, _ = git_sets(dev, gone)
gone = [p for p in gone if p not in tracked]   # a file git tracks is never deleted
n = 0
for p in gone:
    f = os.path.join(dev, p)
    if os.path.islink(f) or os.path.isfile(f):
        os.remove(f); n += 1
        d = os.path.dirname(f)
        while d != top and d.startswith(top + "/"):
            try:
                os.rmdir(d)
            except OSError:
                break
            d = os.path.dirname(d)
if n:
    print(f"[vault-pull] removed {n} file(s): an old or interrupted version of the part held them, the new one does not")
PY
)" "$DEVROOT" "$P_ROOT" "$1" "$2"
}

# root_clean <root>: the pull guard over a whole root. Every part on it with a
# marker still matches that marker's fingerprint, and every file under the
# root (outside nested part roots) is one some marker's .files lists or one
# git tracks (a file added since, such as a new archive, is a local change).
root_clean() {
  local other mk lists=()
  while IFS= read -r other; do
    mk="$(marker "$other")"
    [[ -f "$mk" && -f "$mk.files" ]] || continue
    [[ "$(marker_files_fp "$mk.files")" == "$(sed -n 2p "$mk")" ]] || return 1
    lists+=("$mk.files")
  done < <(mf same-root "$1")
  # Roots of other parts nested under this one are theirs: not walked.
  local nested; nested="$(mf nested-rel "$1" | tr '\n' '\t')"
  python3 -c "$GITPY$(cat <<'PY'

import sys
dev, root, nested, lists = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
top = os.path.join(dev, root)
skip = {os.path.join(top, n) for n in nested.split("\t") if n}
known = set()
for l in lists:
    known.update(x for x in open(l, encoding="utf-8", errors="surrogateescape").read().splitlines() if x)
unknown = []
for d, ds, fs in os.walk(top):
    ds[:] = [x for x in ds if os.path.join(d, x) not in skip]
    for f in fs:
        p = os.path.relpath(os.path.join(d, f), dev)
        if p not in known:
            unknown.append(p)
# A file git tracks is git's, not a local change: eviction never deletes it.
tracked, _ = git_sets(dev, unknown)
sys.exit(1 if any(p not in tracked for p in unknown) else 0)
PY
)" "$DEVROOT" "$1" "$nested" "${lists[@]}"
}

# move_staged <stage> <names>: move every staged entry the tar listed to the
# same path under the dev root (a rename: same filesystem).
# apply_deletions: the vault-worktree part's .vault-worktree-deletions (paths
# deleted on the snapshot machine, relative to the vault root): delete each
# listed file that exists, prune the dirs that left empty, remove the list.
apply_deletions() {
  local list="$DEVROOT/$P_ROOT/.vault-worktree-deletions"
  [[ -f "$list" ]] || return 0
  python3 - "$DEVROOT/$P_ROOT" "$list" <<'PY'
import os, sys
top, lst = sys.argv[1:3]
n = 0
for p in open(lst, encoding="utf-8", errors="surrogateescape").read().splitlines():
    f = os.path.join(top, p)
    if p and (os.path.islink(f) or os.path.isfile(f)):
        os.remove(f); n += 1
        d = os.path.dirname(f)
        while d != top and d.startswith(top + "/"):
            try:
                os.rmdir(d)
            except OSError:
                break
            d = os.path.dirname(d)
if n:
    print(f"[vault-pull] deleted {n} file(s) the snapshot machine had deleted")
PY
  rm -f -- "$list"
}

move_staged() {
  python3 - "$DEVROOT" "$1" "$2" <<'PY'
import os, sys
dev, stage, names = sys.argv[1:4]
for n in sorted(open(names, encoding="utf-8", errors="surrogateescape").read().splitlines()):
    if not n:
        continue
    src, dst = os.path.join(stage, n.rstrip("/")), os.path.join(dev, n.rstrip("/"))
    if n.endswith("/"):
        os.makedirs(dst, exist_ok=True)
    elif os.path.lexists(src):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        os.replace(src, dst)
        moved = globals().get("moved", 0) + 1; globals()["moved"] = moved
        if os.environ.get("ES_PULL_TEST_MOVE_LIMIT") and moved >= int(os.environ["ES_PULL_TEST_MOVE_LIMIT"]):
            os._exit(9)
PY
}

evict() {  # evict <id>: the part's whole root, and every marker on it
  part "$1"
  evictable_tier "$P_TIER" || die "$1 is tier '$P_TIER'; only mod and cache parts are evicted"
  local path; path="$(target_of "$1")"
  if is_bundle; then
    say "evict $1 ($P_BYTES bytes): $path"; rm -f -- "$path"
  else
    root_evictable "$P_ROOT" || die "$1 shares root $P_ROOT with a part that is not tier mod or cache; not evicted"
    root_clean "$P_ROOT" || die "kept $P_ROOT: local changes (snapshot-vault.sh --only $1 first)"
    say "evict root $P_ROOT (parts: $(mf same-root "$P_ROOT" | tr '\n' ' '))"
    evict_root "$path"
  fi
  drop_marker "$1"
}

# evict_root <path> (P_* loaded): delete the files the markers of every part
# on the root list (drop_stale: never a file git tracks, e.g. the vault's
# tracked output/ files under vault-output), then the directories left empty
# (the root too, once empty), and drop those markers. root_clean has already
# proved no other file lives there, outside the roots of parts nested under
# it (e.g. repo-asset-kits-meta under repo-asset-output), whose files are not
# in these lists and so stay.
evict_root() {
  local other mk tmp; tmp="$(mktemp -d)"; : > "$tmp/all"; : > "$tmp/none"
  while IFS= read -r other; do
    mk="$(marker "$other")"
    [[ -f "$mk.files" ]] && cat "$mk.files" >> "$tmp/all"
  done < <(mf same-root "$P_ROOT")
  drop_stale "$tmp/all" "$tmp/none"
  find -H "$1" -depth -type d -empty -delete 2>/dev/null || true
  # A root linked into the cache volume, now empty: the link goes too, so the
  # folder reads as absent again (cache-links.sh links it at the next pull).
  if [[ -L "$1" ]] && [[ -z "$(find -H "$1" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
    rmdir -- "$(readlink -f "$1")" 2>/dev/null || true; rm -f -- "$1"
  fi
  rm -rf -- "$tmp"
  while IFS= read -r other; do drop_marker "$other"; done < <(mf same-root "$P_ROOT")
}

# ensure_room <bytes> <target> <ids being pulled...>: evict LRU mod roots on
# the target's volume until it fits.
ensure_room() {
  local need=$(( $1 + RESERVE )) where="$2"; shift 2
  local keep=" $* " vol; vol="$(vol_of "$where")"
  local free; free="$(free_bytes "$where")"
  (( free >= need )) && return 0
  local m id other busy
  while IFS= read -r m; do
    (( free >= need )) && break
    [[ -f "$m" ]] || continue          # its root went with an earlier eviction
    id="$(basename "$m" .done)"; id="${id//__//}"
    mf get "$id" >/dev/null 2>&1 || continue
    part "$id"
    evictable_tier "$P_TIER" || continue
    [[ "$(vol_of "$(target_of "$id")")" == "$vol" ]] || continue   # frees nothing where it is needed
    if ! is_bundle; then
      root_evictable "$P_ROOT" || continue
      busy=""
      while IFS= read -r other; do [[ "$keep" == *" $other "* ]] && busy=1; done < <(mf same-root "$P_ROOT")
      [[ -n "$busy" ]] && continue
      if ! root_clean "$P_ROOT"; then say "kept $P_ROOT: local changes"; continue; fi
    elif [[ "$keep" == *" $id "* ]]; then
      continue
    fi
    evict "$id"
    free="$(free_bytes "$where")"
  done < <(ls -1tr "$MARKS"/*.done 2>/dev/null)
  (( free >= need )) || die "not enough space on $(landing "$where"): need $need bytes (part + reserve), $free free after evicting every unused mod root"
}

pull() {  # pull <id> <ids in this request...>
  local id="$1"; shift
  part "$id"
  local mk; mk="$(marker "$id")"
  local target; target="$(target_of "$id")"
  [[ -f "$mk.inprogress" ]] && recover "$id"
  # The bundle only seeds a clone (post-create.sh): with a checkout here it is
  # never fetched again, so a pull can never touch the vault's git.
  if is_bundle && [[ -e "$DEVROOT/$P_ROOT/.git" ]]; then
    say "$id: $P_ROOT is already a git checkout; bundle not fetched"
    return 0
  fi
  # The vault tier is create-only: vault-worktree is extracted once, into a
  # checkout post-create.sh cloned (its vault-clone.done marker), never over
  # a checkout that lives on. The vault is edited on one machine at a time;
  # hand-over is snapshot-vault.sh on the old machine, then a new codespace.
  if [[ "$P_TIER" == vault ]] && ! is_bundle; then
    if [[ -f "$mk" || ! -f "$MARKS/vault-clone.done" ]]; then
      say "$id: vault tier is restored once at create; the vault is edited on one machine at a time (hand over with snapshot-vault.sh)"
      return 0
    fi
  fi
  if [[ -f "$mk" && "$(sed -n 1p "$mk")" == "$P_SHA" && -e "$target" ]]; then
    touch "$mk"
    say "$id: present"
    return 0
  fi
  # Local-change guard, scoped to the files the part's tar holds: with a
  # marker, those files must still match its fingerprint; without one, none of
  # them may exist here unless git holds it unchanged (checked against the
  # part's sidecar file list, only when files of the part's kind exist under
  # the root). --force skips the guard.
  if ! is_bundle && (( ! FORCE )) && [[ -d "$target" ]]; then
    if [[ -f "$mk" && -f "$mk.files" ]]; then
      [[ "$(marker_files_fp "$mk.files")" == "$(sed -n 2p "$mk")" ]] \
        || die "local changes in $P_ROOT: snapshot them first (snapshot-vault.sh --only $id) or pass --force"
    elif [[ "$(subset_fp "$id")" != "$ES_EMPTY_FP" ]]; then
      local hits; hits="$(local_conflicts "$id")" || exit 1
      [[ -z "$hits" ]] \
        || die "local changes in $P_ROOT ($(grep -c . <<<"$hits") file(s) the part holds exist here and git does not hold them, e.g. $(head -1 <<<"$hits")): snapshot them first (snapshot-vault.sh --only $id) or pass --force"
    fi
  fi
  # A root the cache plan names (mod folders, caches) is linked into the
  # /tmp cache volume before anything lands in it (cache-links.sh).
  if ! is_bundle; then
    bash "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/cache-links.sh" --root "$P_ROOT" \
      || die "$id: cache-links.sh --root $P_ROOT failed"
  fi
  # "existed" = holds something to protect: a bundle file, or a root with files
  # (an empty root, such as a cache link cache-links.sh just made, is a first pull).
  local existed=0
  if is_bundle; then [[ -e "$target" ]] && existed=1
  elif [[ -n "$(find -H "$target" -mindepth 1 -print -quit 2>/dev/null)" ]]; then existed=1; fi
  mkdir -p "$DEVROOT"   # a pull about to write; df in ensure_room needs it
  ensure_room "$P_BYTES" "$target" "$id" "$@"
  part "$id"   # ensure_room may have loaded other parts into P_*
  local bucket; bucket="$(mf bucket)"
  local tmp; tmp="$(mktemp -d)"
  # A pull into a root that already exists is staged: streamed and extracted
  # into its staging dir (stage_of), and only once the sha256
  # matches are the old version's stale files removed (not with --force: no
  # guard ran) and the staged files moved into place. A failed stream leaves
  # the live root and its marker untouched. A first pull extracts in place.
  # A root that is a link into the cache volume is always staged: GNU tar
  # 1.35 refuses to extract through a link that leads outside -C (EXDEV),
  # while the staged move (os.replace, same volume) follows it.
  local dest="$DEVROOT" stage=""
  if ! is_bundle && { (( existed )) || [[ -L "$target" ]]; } && [[ "$P_TIER" != vault ]]; then
    stage="$(stage_of "$id")"
    rm -rf -- "$stage"; mkdir -p "$stage"; dest="$stage"
    [[ "$(vol_of "$stage")" == "$(vol_of "$target")" ]] || die "$stage is not on the filesystem $target lands on"
  fi
  # Until the marker is written, a record that this part is mid-pull: the
  # next pull of it cleans up first (recover).
  mkdir -p "$MARKS"
  local staged=0; [[ -n "$stage" ]] && staged=1
  set_inprogress "$id" "id=$id" "root=$P_ROOT" "existed=$existed" "staged=$staged" "sha=$P_SHA" phase=stream
  # The object, then (if its sha256 is not the manifest's: the bucket moved on
  # past this manifest) the one previous version snapshot-vault.sh keeps under
  # <prefix>_prev/. Whichever matches the manifest is used; else the pull fails.
  local prefix; prefix="$(mf prefix)"
  local obj rc got="" try=0
  for obj in "$P_OBJECT" "${prefix}_prev/${P_OBJECT#"$prefix"}"; do
    try=$((try + 1))
    if (( try == 2 )); then   # reset what the first attempt wrote
      if [[ -n "$stage" ]]; then rm -rf -- "$stage"; mkdir -p "$stage"
      elif is_bundle; then rm -f -- "$target.partial"
      elif (( ! existed )); then ( safe_remove "$target" ) || true
      fi
    fi
    rm -f -- "$tmp/fifo" "$tmp/sum"; mkfifo "$tmp/fifo"
    sha256sum < "$tmp/fifo" > "$tmp/sum" &
    local sumpid=$!
    say "$id: pulling $P_BYTES bytes from $REMOTE:$bucket/$obj"
    rc=0
    if is_bundle; then
      rclone cat "$REMOTE:$bucket/$obj" | tee "$tmp/fifo" > "$target.partial" || rc=$?
    else
      mkdir -p "$DEVROOT"
      rclone cat "$REMOTE:$bucket/$obj" | tee "$tmp/fifo" \
        | tar -C "$dest" --quoting-style=literal -xvf - > "$tmp/names" 2>/dev/null || rc=$?
    fi
    wait "$sumpid" || rc=$?
    got="$(cut -d' ' -f1 < "$tmp/sum")"
    if (( rc == 0 )) && [[ "$got" == "$P_SHA" ]]; then
      (( try == 2 )) && say "restored previous version of $id (the bucket holds a newer one than this manifest)"
      break
    fi
    (( try == 1 )) && say "$id: $obj does not match the manifest (exit $rc, sha ${got:-none}); trying the previous version"
  done
  if (( rc != 0 )) || [[ "$got" != "$P_SHA" ]]; then
    if [[ -n "$stage" ]]; then
      rm -rf -- "$stage" "$tmp"; rm -f -- "$mk.inprogress"
      die "$id: stream failed (exit $rc) or hash mismatch (want $P_SHA, got ${got:-none}); $target and its marker left as they were"
    fi
    if is_bundle; then
      rm -f -- "$target.partial"; rm -f -- "$mk.inprogress"
    elif (( ! existed )) || root_evictable "$P_ROOT"; then
      ( safe_remove "$target" ) && rm -f -- "$mk.inprogress"
    else
      say "$id: kept $target (its root is shared with a part that is not tier mod or cache)"
    fi
    drop_marker "$id"; rm -rf -- "$tmp"
    die "$id: stream failed (exit $rc) or hash mismatch (want $P_SHA, got ${got:-none}); $target removed unless kept or refused above"
  fi
  if is_bundle; then
    mv -f -- "$target.partial" "$target"
    write_marker "$id" "$P_SHA"
  else
    if [[ -n "$stage" ]]; then
      # Verified: from here an interruption rolls forward (recover).
      # The new file list is what was just extracted (the version that
      # matched: the object or its previous version).
      cp -- "$tmp/names" "$stage.names"
      (( ! FORCE )) && cp -- "$tmp/names" "$stage.new"
      set_inprogress "$id" "id=$id" "root=$P_ROOT" "existed=$existed" "staged=$staged" "sha=$P_SHA" phase=swap
      (( ! FORCE )) && [[ -f "$mk.files" ]] && drop_stale "$mk.files" "$tmp/names"
      move_staged "$stage" "$tmp/names"
    fi
    [[ "$id" == vault-worktree ]] && apply_deletions
    write_marker "$id" "$P_SHA" "$tmp/names"
    [[ -n "$stage" ]] && rm -rf -- "$stage" "$stage.names" "$stage.new"
  fi
  rm -f -- "$mk.inprogress"
  rm -rf -- "$tmp"
  say "$id: ok ($got)"
}

list() {
  local id mk state
  printf '%-10s %14s  %-8s %s\n' tier bytes state id
  while IFS= read -r id; do
    part "$id"
    mk="$(marker "$id")"
    state="-"
    [[ -f "$mk" ]] && state="pulled"
    printf '%-10s %14s  %-8s %s\n' "$P_TIER" "$P_BYTES" "$state" "$id"
  done < <(mf ids)
}

show_free() {
  say "free on $DEVROOT: $(free_bytes) bytes (reserve $RESERVE)"
  local cache="${ES_CACHE_ROOT:-/tmp/es-cache}"
  [[ -d "$cache" && "$(vol_of "$cache")" != "$(vol_of "$DEVROOT")" ]] \
    && say "free on $cache (the linked mod pool and caches, cache-links.sh): $(free_bytes "$cache") bytes"
  local m id
  while IFS= read -r m; do
    id="$(basename "$m" .done)"; id="${id//__//}"
    if mf get "$id" >/dev/null 2>&1; then part "$id"; else P_TIER="?"; P_BYTES="?"; fi
    printf '%s  %-10s %14s  %s\n' "$(date -u -r "$m" +%FT%TZ)" "$P_TIER" "$P_BYTES" "$id"
  done < <(ls -1tr "$MARKS"/*.done 2>/dev/null)
}

[[ $# -gt 0 ]] || { sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2; }

ids=()
with_archives=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) list; exit 0 ;;
    --free) show_free; exit 0 ;;
    --evict) [[ $# -ge 2 ]] || die "--evict needs an id"; evict "$2"; exit 0 ;;
    --tier)
      [[ $# -ge 2 ]] || die "--tier needs a tier name"
      mapfile -t t < <(mf tier-ids "$2")
      [[ ${#t[@]} -gt 0 ]] || die "unknown tier: $2 (see --list)"
      ids+=("${t[@]}"); shift ;;
    --with-archives) with_archives=1 ;;
    --force) FORCE=1 ;;
    -*) die "unknown option $1" ;;
    *) ids+=("$1") ;;
  esac
  shift
done

# Expand archives: needsArchives always, archivesPart when --with-archives.
all=()
for id in "${ids[@]}"; do
  part "$id"
  all+=("$id")
  if [[ -n "$P_ARCH" ]] && { (( with_archives )) || [[ "$P_NEEDS" == "1" ]]; }; then
    all+=("$P_ARCH")
  elif [[ "$P_NEEDS" == "1" ]]; then
    die "$id needs its archives but names no archivesPart"
  fi
done

declare -A seen=()
for id in "${all[@]}"; do
  [[ -n "${seen[$id]:-}" ]] && continue
  seen[$id]=1
  pull "$id" "${all[@]}"
done

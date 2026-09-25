#!/usr/bin/env bash
# snapshot-vault.sh: upload the VM-only working set (vault, BM&V, Claude
# memory) to the private R2 bucket as one object per part, and record every
# part in tooling/bootstrap/snapshot-manifest.json (the contract read by
# vault-pull.sh). Plan: docs/research/infrastructure/
# codespaces-migration-plan.md Part 3 (a), (b), (g).
#
# Every tar holds paths relative to the dev root (the repo's parent), so a
# restore is always:
#   rclone cat r2:<bucket>/<object> | tar -C <devroot> -xf -
# with the manifest sha256 checked on the same stream. Tars are uncompressed
# (the payload is already compressed) and are streamed straight into
# `rclone rcat`: nothing is staged on disk except file lists and the small
# vault git bundle.
#
# Usage:
#   snapshot-vault.sh                 upload every part whose files changed
#   snapshot-vault.sh --only ID...    only these part ids, re-uploaded even if unchanged
#   snapshot-vault.sh --force         re-upload parts even when unchanged (no guard lifted)
#   snapshot-vault.sh --allow-partial lift the tiered-machine guard below
#   snapshot-vault.sh --allow-shrink  lift the 50% shrink guard below
#   snapshot-vault.sh --dry-run       say what would be uploaded or skipped, upload nothing
#   snapshot-vault.sh --list [--files]   part ids and source bytes on disk (--files:
#                                     every tar entry name, from the real tar command)
#   snapshot-vault.sh --backfill-fingerprints   write sourceFingerprint for every
#                                     manifest part from the files here; no upload
#   snapshot-vault.sh --backfill-filelists   upload only the file-list sidecar of
#                                     every manifest tar part whose files here match
#                                     its sourceFingerprint; no tar upload. Checks
#                                     the 3 smallest sidecars against `tar -t`
# Every tar part also gets a sidecar object <prefix><id>.files ("filesObject"
# in the manifest): the tar's entry names, sorted (C order), one per line,
# directories with a trailing "/", built from the same list the tar is. The
# vault-pull no-marker guard reads it instead of listing the tar.
# A part is skipped when the manifest's sourceFingerprint (lib.sh fingerprint of
# exactly the files the part tars; for the vault-git bundle, of its refs) matches
# the files on disk. sourceBytes is kept as information. Guards: on a
# tiered-restore machine ($DEVROOT/.vault-pull or /workspaces/.vault-pull
# exists) a part already in the manifest is uploaded only if it has a
# vault-pull marker there (a part new to the manifest uploads; off with
# --allow-partial); and a part whose sourceBytes fell below 50% of the
# manifest's is refused (off with --allow-shrink; vault-worktree and
# claude-home and claude-transcripts are exempt).
# The manifest is rewritten atomically after each part, so a crash resumes.
# Env: RCLONE (default ~/.local/bin/rclone or rclone on PATH), SNAPSHOT_JOBS (3),
# SNAPSHOT_WARNINGS (tar warning log, default /tmp/snapshot-vault-warnings.log),
# CLAUDE_CONFIG_DIR (Claude source, default ~/.claude), ES_REPO_ROOT (the path
# the Claude project key is derived from; default the repo root), ES_DEVROOT,
# ES_SNAPSHOT_MANIFEST, ES_SNAPSHOT_TEST_CRASH_BETWEEN_MOVES (test only: stop a
# swap between its two moves, to exercise the roll-forward).
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib.sh"
es_paths
VAULT_NAME="elder-scrolls-asset-pipeline"
VAULT="$DEVROOT/$VAULT_NAME"
MODS_REL="$VAULT_NAME/skyrim-source/mod-sources"
REPO_NAME="$(basename "$REPO")"
BMV_REL="$REPO_NAME/tooling/asset-pipeline/black-marsh-mod-source"
CLAUDE_SRC="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
# Claude Code's project key: the repo path with "/" (and ".") as "-". The tar
# stores the codespace key; it is rewritten only when this machine's differs.
SRC_KEY="$(realpath -m "${ES_REPO_ROOT:-$REPO}" | tr '/.' '--')"
TARGET_KEY="-workspaces-elder-souls-argonia"
# Tiered-restore machine: vault-pull markers present (codespace).
MARKDIR=""
if [[ -d "$MARKS" ]]; then MARKDIR="$MARKS"
elif [[ -z "${ES_DEVROOT:-}" && -d /workspaces/.vault-pull ]]; then MARKDIR=/workspaces/.vault-pull; fi
BUCKET="elder-souls-vault"
PREFIX="snapshot/v1/"
JOBS="${SNAPSHOT_JOBS:-3}"
WARNLOG="${SNAPSHOT_WARNINGS:-${TMPDIR:-/tmp}/snapshot-vault-warnings.log}"
if [[ -z "${RCLONE:-}" ]]; then
  if [[ -x "$HOME/.local/bin/rclone" ]]; then RCLONE="$HOME/.local/bin/rclone"; else RCLONE="rclone"; fi
fi
# 64 MiB chunks: an unknown-size stream is capped at 10000 chunks, and the
# largest part (~10.6 GiB) would overflow the 5 MiB default.
RCLONE_FLAGS=(--s3-chunk-size 64M --s3-upload-concurrency 4 --retries 5 --low-level-retries 20)
ARCHIVE_FIND=( \( -iname "${ES_ARCHIVE_GLOBS[0]}" -o -iname "${ES_ARCHIVE_GLOBS[1]}" -o -iname "${ES_ARCHIVE_GLOBS[2]}" \) )
WORK="$(mktemp -d "${TMPDIR:-/tmp}/snapshot-vault.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
LOG() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }

# ---- part catalogue ---------------------------------------------------------
# One TSV line per part: id, tier, root (relative to dev root), kind (tar|bundle),
# archivesPart id or "-".
catalogue() {
  local d id tier arch
  shopt -s nullglob
  for d in "$DEVROOT/$MODS_REL"/*/; do
    d="$(basename "$d")"; id="mod-sources/$d"
    [[ "$d" == *.incoming-* ]] && continue   # a vault-pull staging dir
    # tamriel-worldspaces holds the base heightfield the terrain chain reads:
    # tier chain (pulled on demand, never evicted).
    tier="mod"; [[ "$d" == "tamriel-worldspaces-118678" ]] && tier="chain"
    # find -H throughout: on a codespace a mod folder may be a link into the
    # /tmp cache volume (cache-links.sh); its files are what the part holds.
    if [[ -n "$(find -H "$DEVROOT/$MODS_REL/$d" -type f "${ARCHIVE_FIND[@]}" -print -quit)" ]]; then
      printf '%s\t%s\t%s\ttar\t%s\n' "$id" "$tier" "$MODS_REL/$d" "$id.archives"
      # The .archives part (original zips/7z/rar) is never needed to run, so
      # it is always tier "mod" even when its main part is not.
      printf '%s\t%s\t%s\ttar\t-\n' "$id.archives" "mod" "$MODS_REL/$d"
    else
      # No archives on this disk (a codespace pulls them only on request): the
      # manifest's archivesPart, a fact the disk cannot see here, is kept.
      arch="$(manifest_get "$id" archivesPart)"
      printf '%s\t%s\t%s\ttar\t%s\n' "$id" "$tier" "$MODS_REL/$d" "${arch:--}"
    fi
  done
  # Fixed parts, each only when its source exists on this machine (a
  # codespace holds only the tiers it pulled).
  fixed() { [[ -d "$4" ]] && printf '%s\t%s\t%s\t%s\t-\n' "$1" "$2" "$3" "$5"; return 0; }
  fixed vanilla            toolchain "$VAULT_NAME/skyrim-source/Data" "$DEVROOT/$VAULT_NAME/skyrim-source/Data" tar
  fixed skyrim-source-misc base      "$VAULT_NAME/skyrim-source" "$DEVROOT/$VAULT_NAME/skyrim-source" tar
  fixed vault-output       cache     "$VAULT_NAME/output" "$DEVROOT/$VAULT_NAME/output" tar
  fixed vault-git          vault     "$VAULT_NAME" "$VAULT/.git" bundle
  fixed vault-worktree     vault     "$VAULT_NAME" "$VAULT/.git" tar
  # The vault's git-ignored files outside every other part's root, but build/
  # (rebuildable): the KotM text corpus (derived/text/...), shots/ ...
  fixed vault-extra        base      "$VAULT_NAME" "$VAULT/.git" tar
  fixed bmv                mod       "$BMV_REL" "$DEVROOT/$BMV_REL" tar
  # The repo's git-ignored data a fresh clone lacks (never a tracked file).
  # Base (restored at create): the studio's public data and the world-gen
  # chain/report products (about 1 MB). Cache (pulled on request, evictable
  # like mod): the kit mesh cache, the asset-pipeline build and output, the
  # water dependency recovery tree. Not carried: world-generation
  # survey-cache (rebuilt in ~13 s) and mesh-cache-work (scratch).
  local WG="$REPO_NAME/tooling/world-generation/output" AP="$REPO_NAME/tooling/asset-pipeline"
  fixed repo-studio-public  base  "$REPO_NAME/apps/world-studio/public" "$REPO/apps/world-studio/public" tar
  fixed repo-wg-products    base  "$WG" "$DEVROOT/$WG" tar
  fixed repo-wg-mesh-cache  cache "$WG/mesh-cache" "$DEVROOT/$WG/mesh-cache" tar
  fixed repo-asset-build    cache "$AP/build" "$DEVROOT/$AP/build" tar
  fixed repo-asset-kits-meta base  "$AP/output/kits" "$DEVROOT/$AP/output/kits" tar
  fixed repo-asset-output   cache "$AP/output" "$DEVROOT/$AP/output" tar
  fixed repo-water-recovery cache "$REPO_NAME/.water-dependency-recovery" "$REPO/.water-dependency-recovery" tar
  fixed claude-home        claude    .claude-home "$CLAUDE_SRC" tar
  # This project's Claude session transcripts, subagent/workflow dirs and
  # tool results: everything in its project dir but memory/ (claude-home
  # has that). Backed up to the private bucket only, never to git.
  fixed claude-transcripts claude    .claude-home "$CLAUDE_SRC/projects/$SRC_KEY" tar
}

# Base directory tar runs in (-C) for a part.
part_base() { if [[ "$1" == claude-home || "$1" == claude-transcripts ]]; then echo "$CLAUDE_SRC"; else echo "$DEVROOT"; fi; }

# NUL-separated, sorted entry list (relative to part_base) for a tar part.
# Directories are listed too (tar runs with --no-recursion) so empty dirs survive.
emit_list() {
  local id="$1"
  case "$id" in
    mod-sources/*.archives)
      local f="${id#mod-sources/}"; f="${f%.archives}"
      (cd "$DEVROOT" && find -H "$MODS_REL/$f" -type f "${ARCHIVE_FIND[@]}" -print0) ;;
    mod-sources/*)
      (cd "$DEVROOT" && find -H "$MODS_REL/${id#mod-sources/}" -not \( -type f "${ARCHIVE_FIND[@]}" \) -print0) ;;
    vanilla)
      (cd "$DEVROOT" && find "$VAULT_NAME/skyrim-source/Data" -print0) ;;
    skyrim-source-misc)
      # Everything under skyrim-source except Data/ and the mod folders; the
      # loose files directly in mod-sources/ (SOURCES.json) ride here too.
      (cd "$DEVROOT" && find "$VAULT_NAME/skyrim-source" -mindepth 1 \
          \( -path "$VAULT_NAME/skyrim-source/Data" -o -path "$MODS_REL/*" \( -type d -o -type l \) \) -prune \
          -o -print0) ;;
    vault-output)
      (cd "$DEVROOT" && find "$VAULT_NAME/output" -print0) ;;
    vault-extra)
      local roots; mapfile -t roots < <(awk -F'\t' -v v="$VAULT_NAME/" 'index($3, v) == 1 {print $3}' "$WORK/catalogue.tsv" | sort -u)
      git -C "$VAULT" ls-files -o -i --exclude-standard -z | python3 -c '
import sys
name = sys.argv[1].encode()
roots = [r.encode() + b"/" for r in sys.argv[2:]]
for p in sys.stdin.buffer.read().split(b"\0"):
    if not p or p.startswith(b"build/"): continue
    q = name + b"/" + p
    if any(q.startswith(r) for r in roots) or q + b"/" in roots: continue   # (a root linked to the cache volume)
    sys.stdout.buffer.write(q + b"\0")' "$VAULT_NAME" "${roots[@]}" ;;
    vault-worktree)
      # Changed and untracked files of the vault checkout, minus any path under
      # another part's root (output/, skyrim-source/...): each file lives in
      # exactly one part.
      local roots; mapfile -t roots < <(awk -F'\t' -v v="$VAULT_NAME/" 'index($3, v) == 1 {print $3}' "$WORK/catalogue.tsv" | sort -u)
      git -C "$VAULT" status --porcelain -z --untracked-files=all | python3 -c '
import sys
f = sys.stdin.buffer.read().split(b"\0"); i = 0; out = []
while i < len(f):
    e = f[i]; i += 1
    if len(e) < 4: continue
    st, p = e[:2], e[3:]
    if st[:1] in (b"R", b"C"): i += 1          # rename/copy carries the old path next
    if b"D" in st: continue                    # deleted: nothing to archive
    q = sys.argv[1].encode() + b"/" + p
    if any(q.startswith(r.encode() + b"/") for r in sys.argv[2:]): continue
    out.append(q)
sys.stdout.buffer.write(b"".join(x + b"\0" for x in out))' "$VAULT_NAME" "${roots[@]}" ;;
    bmv)
      (cd "$DEVROOT" && find -H "$BMV_REL" -print0) ;;
    repo-*)
      # Only files git ignores under the part's own root (never a tracked
      # file), and no node_modules/ folder, except in repo-water-recovery,
      # whose whole content is a kept node_modules/ tree. repo-wg-products
      # takes only the chain/report products under its root (not the
      # mesh-cache part nested there, not survey-cache or mesh-cache-work);
      # repo-asset-kits-meta takes the non-GLB files of output/kits (the
      # sidecars the compile and footprints read); repo-asset-output takes
      # the rest of output/ but sheets/ (renders): each file in one part.
      local rel nm=1 only="" skip=""
      rel="$(awk -F'\t' -v i="$id" '$1 == i {print $3}' "$WORK/catalogue.tsv")"; rel="${rel#"$REPO_NAME"/}"
      [[ "$id" == repo-water-recovery ]] && nm=0
      [[ "$id" == repo-wg-products ]] && only="chain/receipts/ blueprint-maps/ route-structures/ settlements/ route-grading-stretches.json major-routes-report.json semantic-audit.json asset-deliverability.json hostility-frequency.json"
      [[ "$id" == repo-asset-output ]] && skip="sheets/ kits/!glb"
      [[ "$id" == repo-asset-kits-meta ]] && skip="*.glb"
      # A root linked into the /tmp cache volume (cache-links.sh) is ours
      # whole: git neither descends a link nor ignores it by a "dir/" rule.
      { if [[ -L "$REPO/$rel" ]]; then (cd "$REPO" && find -H "$rel" -type f -print0)
        else git -C "$REPO" ls-files -o -i --exclude-standard -z -- "$rel"; fi; } | python3 -c '
import sys
name, nm, rel = sys.argv[1].encode(), sys.argv[2] == "1", sys.argv[3].encode() + b"/"
only = [x.encode() for x in sys.argv[4].split()]
skip = [x.encode() for x in sys.argv[5].split()]
def m1(sub, x):
    if x.endswith(b"/!glb"):   # under that dir, and not a .glb
        return sub.startswith(x[:-4]) and not sub.endswith(b".glb")
    if x.startswith(b"*"):     # a name suffix
        return sub.endswith(x[1:])
    return sub == x or (x.endswith(b"/") and sub.startswith(x))
match = lambda sub, pats: any(m1(sub, x) for x in pats)
for p in sys.stdin.buffer.read().split(b"\0"):
    if not p: continue
    sub = p[len(rel):]
    if nm and b"node_modules" in p.split(b"/"): continue
    if only and not match(sub, only): continue
    if skip and match(sub, skip): continue
    sys.stdout.buffer.write(name + b"/" + p + b"\0")' "$REPO_NAME" "$nm" "$rel" "$only" "$skip" ;;
    claude-transcripts)
      (cd "$CLAUDE_SRC" && find "projects/$SRC_KEY" -mindepth 1 \
          -path "projects/$SRC_KEY/memory" -prune -o -print0) ;;
    claude-home)
      # settings.json is NOT listed: upload_part appends a filtered copy
      # (env.ES_TUNNEL_URL and ES_STUDIO_PORT removed) from the work dir.
      (cd "$CLAUDE_SRC" && printf '%s\0' CLAUDE.md RTK.md \
         && find "projects/$SRC_KEY/memory" -print0) ;;
    *) echo "unknown part $id" >&2; return 2 ;;
  esac | { grep -zv -E '(^|/)[^/]*\.incoming-[^/]*(/|$)' || [[ $? -eq 1 ]]; } | sort -z   # grep 1 = no entries: an empty part is legitimate
}

# The vault's deleted-but-uncommitted paths (relative to the vault root, one
# per line; a rename's old path counts), wherever they are in the vault: the
# vault-worktree part carries them as .vault-worktree-deletions, which
# vault-pull applies to the fresh clone and then removes.
worktree_deletions() {  # worktree_deletions <out>
  git -C "$VAULT" status --porcelain -z --untracked-files=all | python3 -c '
import sys
f = sys.stdin.buffer.read().split(b"\0"); i = 0; out = []
while i < len(f):
    e = f[i]; i += 1
    if len(e) < 4: continue
    st, p = e[:2], e[3:]
    if st[:1] in (b"R", b"C"):
        if st[:1] == b"R": out.append(f[i])
        i += 1
    if b"D" in st: out.append(p)
for p in out:
    if b"\n" in p: sys.exit(f"deletions: a path holds a newline: {p!r}")
sys.stdout.buffer.write(b"".join(x + b"\n" for x in sorted(set(out))))' > "$1"
}

# Sum of regular-file sizes in a NUL list file (relative to base dir).
list_bytes() {
  (cd "$1" && xargs -0 -r stat -c '%s %F' -- < "$2") | awk '$2=="regular"{s+=$1} END{printf "%d\n", s+0}'
}

# The sidecar <workdir>/files: the tar entry names of <workdir>/list (the
# claude-home transforms applied), C-sorted, one per line, dirs ending "/".
write_filelist() {  # write_filelist <id> <workdir>
  # claude: 1 = claude-home, 2 = claude-transcripts (the project-key and
  # .claude-home/ transforms). extra: tar names added from the work dir
  # (claude-home's filtered settings files, vault-worktree's deletions list).
  local claude=0; [[ "$1" == "claude-home" ]] && claude=1; [[ "$1" == "claude-transcripts" ]] && claude=2
  local extra=""
  [[ "$1" == "vault-worktree" ]] && extra="$VAULT_NAME/.vault-worktree-deletions"
  if [[ "$1" == "claude-home" ]]; then extra="$(sed 's,^,.claude-home/,' "$2/cfg.names" | tr '\n' ' ')"; fi
  python3 - "$(part_base "$1")" "$2/list" "$2/files" "$claude" "$SRC_KEY" "$TARGET_KEY" "$extra" <<'PY'
import os, sys
base, lst, out, claude, src, tgt, extra = sys.argv[1:8]
names = []
for p in open(lst, "rb").read().split(b"\0"):
    if not p:
        continue
    full = os.path.join(base.encode(), p)
    d = os.path.isdir(full) and not os.path.islink(full)
    if claude in ("1", "2"):
        pre = b"projects/" + src.encode() + b"/"
        if p.startswith(pre):
            p = b"projects/" + tgt.encode() + b"/" + p[len(pre):]
        p = b".claude-home/" + p
    if b"\n" in p:
        sys.exit(f"file-list: a path holds a newline: {p!r}")
    names.append(p + (b"/" if d else b""))
names += [x.encode() for x in extra.split()]
with open(out, "wb") as f:
    f.write(b"".join(n + b"\n" for n in sorted(names)))
PY
}

upload_filelist() {  # upload_filelist <id> <workdir>: prints the object name
  local object="${PREFIX}$1.files" remote
  "$RCLONE" copyto "${RCLONE_FLAGS[@]}" "$2/files" "r2:$BUCKET/$object" >&2
  remote="$("$RCLONE" lsjson "r2:$BUCKET/$object" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["Size"])')"
  [[ "$remote" == "$(stat -c %s "$2/files")" ]] || { LOG "FAIL $1: sidecar remote size $remote"; return 1; }
  echo "$object"
}

# ---- manifest ---------------------------------------------------------------
manifest_get() { mf field "$1" "$2"; }  # id field -> value or empty

manifest_put() {  # JSON object of one part on stdin; merged over the existing entry
                  # (a null or absent field keeps the manifest's value), under a lock, atomic replace
  local json; json="$(cat)"
  python3 - "$MANIFEST" "$BUCKET" "$PREFIX" "$json" "$WORK/manifest.lock" <<'PY'
import json, sys, os, fcntl, tempfile
m, bucket, prefix, part = sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4])
with open(sys.argv[5], "w") as lk:
    fcntl.flock(lk, fcntl.LOCK_EX)
    doc = json.load(open(m)) if os.path.exists(m) else {"schemaVersion": 1, "bucket": bucket, "prefix": prefix, "parts": []}
    old = next((p for p in doc["parts"] if p["id"] == part["id"]), {})
    part = {**old, **{k: v for k, v in part.items() if v is not None}}
    parts = [p for p in doc["parts"] if p["id"] != part["id"]] + [part]
    doc["parts"] = sorted(parts, key=lambda p: p["id"])
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(m), prefix=".snapshot-manifest.")
    with os.fdopen(fd, "w") as f:
        json.dump(doc, f, indent=2); f.write("\n")
    os.replace(tmp, m)
PY
}

# Hash and count a stream read from a FIFO: prints "<sha256hex> <bytes>".
HASHPY='
import hashlib, sys
h = hashlib.sha256(); n = 0
with open(sys.argv[1], "rb") as f:
    while True:
        b = f.read(1 << 20)
        if not b: break
        h.update(b); n += len(b)
print(h.hexdigest(), n)'

# Filtered copy of settings.json (env.ES_TUNNEL_URL and env.ES_STUDIO_PORT
# removed: they are per-machine and live in the repo's settings.local.json).
# The real settings.json is only read.
filtered_settings() {  # filtered_settings <src> <out>
  python3 - "$1" "$2" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
for k in ("ES_TUNNEL_URL", "ES_STUDIO_PORT"):
    d.get("env", {}).pop(k, None)
with open(sys.argv[2], "w") as f:
    json.dump(d, f, indent=2); f.write("\n")
PY
}

manifest_set() {  # id field json-value: set one field of an existing part, nothing else
  python3 - "$MANIFEST" "$1" "$2" "$3" "$WORK/manifest.lock" <<'PY'
import json, sys, os, fcntl, tempfile
m, pid, field, value = sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4])
with open(sys.argv[5], "w") as lk:
    fcntl.flock(lk, fcntl.LOCK_EX)
    doc = json.load(open(m))
    for p in doc["parts"]:
        if p["id"] == pid:
            p[field] = value
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(m), prefix=".snapshot-manifest.")
    with os.fdopen(fd, "w") as f:
        json.dump(doc, f, indent=2); f.write("\n")
    os.replace(tmp, m)
PY
}

# ---- one part ---------------------------------------------------------------
# prepare_part <id> <kind> <workdir>: writes the entry list (and the filtered
# settings / the bundle), sets SRC_BYTES and SRC_FP. --list, the skip rule,
# the guards and the upload all read the same values.
prepare_part() {
  local id="$1" kind="$2" w="$3" base
  if [[ "$kind" == "bundle" ]]; then
    git -C "$VAULT" bundle create "$w/vault.bundle" HEAD --branches --tags 2>"$w/err" || { cat "$w/err" >&2; return 1; }
    SRC_BYTES="$(stat -c %s "$w/vault.bundle")"
    SRC_FP="$({ git -C "$VAULT" rev-parse HEAD; git -C "$VAULT" for-each-ref --format='%(refname)%09%(objectname)' refs/heads refs/tags; } | fp_hash)"
    return 0
  fi
  base="$(part_base "$id")"
  emit_list "$id" > "$w/list"
  SRC_BYTES="$(list_bytes "$base" "$w/list")"
  if [[ "$id" == "claude-home" ]]; then
    # Filtered copies (the per-machine ES_TUNNEL_URL / ES_STUDIO_PORT
    # removed) of Claude's settings.json and of the repo's gitignored
    # .claude/settings.local.json (stored as repo-settings.local.json;
    # post-create.sh puts it back only where the repo has none).
    mkdir -p "$w/cfg"; : > "$w/cfg.names"
    filtered_settings "$CLAUDE_SRC/settings.json" "$w/cfg/settings.json"; echo settings.json >> "$w/cfg.names"
    if [[ -f "$REPO/.claude/settings.local.json" ]]; then
      filtered_settings "$REPO/.claude/settings.local.json" "$w/cfg/repo-settings.local.json"
      echo repo-settings.local.json >> "$w/cfg.names"
    fi
    local cn cfp=""
    while IFS= read -r cn; do
      SRC_BYTES=$(( SRC_BYTES + $(stat -c %s "$w/cfg/$cn") ))
      cfp+="$(printf '%s\t%s\t%s' "$cn" "$(stat -c %s "$w/cfg/$cn")" "$(sha256sum < "$w/cfg/$cn" | cut -d' ' -f1)")"$'\n'
    done < "$w/cfg.names"
    SRC_FP="$({ fp_lines_list "$base" "$w/list"; printf '%s' "$cfp"; } | fp_hash)"
    if [[ "$SRC_KEY" == "$TARGET_KEY" ]]; then LOG "claude-home: source key $SRC_KEY, no transform"
    else LOG "claude-home: source key $SRC_KEY, transformed to $TARGET_KEY"; fi
  elif [[ "$id" == "vault-worktree" ]]; then
    mkdir -p "$w/extra"
    worktree_deletions "$w/extra/.vault-worktree-deletions"
    local db; db="$(stat -c %s "$w/extra/.vault-worktree-deletions")"
    SRC_BYTES=$(( SRC_BYTES + db ))
    SRC_FP="$({ fp_lines_list "$base" "$w/list"
                printf '.vault-worktree-deletions\t%s\t%s\n' "$db" "$(sha256sum < "$w/extra/.vault-worktree-deletions" | cut -d' ' -f1)"; } | fp_hash)"
  else
    SRC_FP="$(fingerprint_list "$base" "$w/list")"
  fi
}

tar_args() {  # tar_args <id> <workdir>: sets TARGS, the tar create arguments
  TARGS=(-C "$(part_base "$1")" -cf - --no-recursion --null -T "$2/list")
  # A root that is a link into the /tmp cache volume (cache-links.sh) is
  # archived as the directory it points at, never as a link.
  local root; root="$(awk -F'\t' -v i="$1" '$1 == i {print $3}' "$WORK/catalogue.tsv" 2>/dev/null)"
  [[ -n "$root" && -L "$DEVROOT/$root" ]] && TARGS+=(-h)
  if [[ "$1" == claude-home || "$1" == claude-transcripts ]]; then
    [[ "$SRC_KEY" != "$TARGET_KEY" ]] && TARGS+=(--transform "s,^projects/$SRC_KEY/,projects/$TARGET_KEY/,")
    TARGS+=(--transform 's,^,.claude-home/,')
    if [[ "$1" == claude-home ]]; then
      local cfgn; mapfile -t cfgn < "$2/cfg.names"
      TARGS+=(-C "$2/cfg" "${cfgn[@]}")
    fi
  elif [[ "$1" == "vault-worktree" ]]; then
    # Always in the tar (empty when nothing was deleted), at the vault root.
    TARGS+=(--transform "s,^\\.vault-worktree-deletions\$,$VAULT_NAME/.vault-worktree-deletions," -C "$2/extra" .vault-worktree-deletions)
  fi
}

object_of() {  # object_of <id> <kind>: the part's object name in the bucket
  if [[ "$2" == "bundle" ]]; then echo "${PREFIX}$1.bundle"; else echo "${PREFIX}$1.tar"; fi
}

robj_exists() {  # robj_exists <object>
  "$RCLONE" lsjson "r2:$BUCKET/$1" 2>/dev/null | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin) else 1)' 2>/dev/null
}

# swap_in <object> <sha> <bytes> <old sha>: replace <object> by the verified
# upload in <prefix>_incoming/, keeping the current one as the single previous
# version. First <incoming>.pending records "sha bytes old-sha"; then two
# server-side moves: current -> <prefix>_prev/ (overwriting the older _prev),
# _incoming -> current; then .pending goes. A crash between the moves leaves
# _incoming present, the object missing and .pending present: roll_forward
# (next run) finishes the second move and sets the manifest from .pending.
swap_in() {
  local object="$1" rel="${1#"$PREFIX"}"
  local incoming="${PREFIX}_incoming/$rel" prev="${PREFIX}_prev/$rel"
  printf '%s %s %s\n' "$2" "$3" "${4:--}" | "$RCLONE" rcat "r2:$BUCKET/$incoming.pending"
  if robj_exists "$object"; then
    "$RCLONE" moveto "${RCLONE_FLAGS[@]}" "r2:$BUCKET/$object" "r2:$BUCKET/$prev"
  fi
  [[ -n "${ES_SNAPSHOT_TEST_CRASH_BETWEEN_MOVES:-}" ]] && { LOG "test: crash between the moves"; exit 9; }
  "$RCLONE" moveto "${RCLONE_FLAGS[@]}" "r2:$BUCKET/$incoming" "r2:$BUCKET/$object"
  "$RCLONE" deletefile "r2:$BUCKET/$incoming.pending"
}

# roll_forward <id> <kind>: finish a swap_in a crash cut between its moves.
roll_forward() {
  local object; object="$(object_of "$1" "$2")"
  local incoming="${PREFIX}_incoming/${object#"$PREFIX"}" p sha bytes old
  robj_exists "$incoming.pending" && robj_exists "$incoming" && ! robj_exists "$object" || return 0
  p="$("$RCLONE" cat "r2:$BUCKET/$incoming.pending")"; read -r sha bytes old <<<"$p"
  "$RCLONE" moveto "${RCLONE_FLAGS[@]}" "r2:$BUCKET/$incoming" "r2:$BUCKET/$object"
  manifest_set "$1" object "\"$object\""
  manifest_set "$1" sha256 "\"$sha\""
  manifest_set "$1" bytes "$bytes"
  [[ "$old" != "-" ]] && manifest_set "$1" prevSha256 "\"$old\""
  "$RCLONE" deletefile "r2:$BUCKET/$incoming.pending"
  LOG "rolled forward $1: an interrupted upload's second move finished (sha ${sha:0:16})"
}

upload_part() {
  local id="$1" tier="$2" root="$3" kind="$4" arch="$5"
  local w="$WORK/${id//\//__}"; mkdir -p "$w"
  [[ -n "$DRY" ]] || roll_forward "$id" "$kind"
  local object sha bytes warnings=0 man_fp man_bytes files_object=""
  [[ "$arch" == "-" ]] && arch=""
  prepare_part "$id" "$kind" "$w"

  # A tiered machine holds a part in full only if it pulled it (main and
  # .archives parts tar disjoint files, so the part's own marker decides).
  if ! mf get "$id" >/dev/null 2>&1; then
    LOG "new part $id"
  elif [[ -z "$ALLOW_PARTIAL" && -n "$MARKDIR" && ! -f "$MARKDIR/${id//\//__}.done" ]]; then
    LOG "skip $id: not fully restored here (--allow-partial uploads it anyway)"; return 0
  fi
  man_fp="$(manifest_get "$id" sourceFingerprint)"
  man_bytes="$(manifest_get "$id" sourceBytes)"
  if [[ -z "$FORCE$ONLY_FORCE" && "$man_fp" == "$SRC_FP" ]]; then
    LOG "skip $id (manifest has sourceFingerprint ${SRC_FP:0:16})"; return 0
  fi
  # vault-worktree, claude-home and claude-transcripts shrink honestly
  # (changes committed, memory or transcripts pruned): no shrink guard.
  if [[ -z "$ALLOW_SHRINK" && -n "$man_bytes" && "$id" != vault-worktree && "$id" != claude-home && "$id" != claude-transcripts ]] && (( SRC_BYTES * 2 < man_bytes )); then
    LOG "refuse $id: sourceBytes $SRC_BYTES here is below 50% of the manifest's $man_bytes (partial restore?); pass --allow-shrink to upload anyway"
    return 1
  fi
  if [[ -n "$DRY" ]]; then
    LOG "would upload $id ($SRC_BYTES source bytes; sourceFingerprint ${SRC_FP:0:16}, manifest ${man_fp:0:16})"; return 0
  fi
  LOG "start $id ($SRC_BYTES source bytes)"
  local t0=$SECONDS
  # The upload lands in <prefix>_incoming/<object>; only a changed one then
  # replaces the object (see swap_in), so the bucket always holds a whole
  # current version and one previous version.
  object="$(object_of "$id" "$kind")"
  local incoming="${PREFIX}_incoming/${object#"$PREFIX"}"
  if [[ "$kind" == "bundle" ]]; then
    read -r sha bytes < <(python3 -c "$HASHPY" "$w/vault.bundle")
    "$RCLONE" copyto "${RCLONE_FLAGS[@]}" "$w/vault.bundle" "r2:$BUCKET/$incoming"
  else
    tar_args "$id" "$w"
    mkfifo "$w/fifo"
    python3 -c "$HASHPY" "$w/fifo" > "$w/hash" &
    local hpid=$!
    set +e
    nice -n 10 ionice -c3 tar "${TARGS[@]}" 2>"$w/tarerr" \
      | tee "$w/fifo" | "$RCLONE" rcat "${RCLONE_FLAGS[@]}" "r2:$BUCKET/$incoming"
    local st=("${PIPESTATUS[@]}")
    set -e
    wait "$hpid" || { LOG "FAIL $id: hasher exited non-zero"; return 1; }
    # GNU tar exit 1 = "some files differ" (changed/vanished while read): a warning.
    if (( st[0] > 1 || st[1] != 0 || st[2] != 0 )); then
      LOG "FAIL $id: tar=${st[0]} tee=${st[1]} rclone=${st[2]}"; cat "$w/tarerr" >&2; return 1
    fi
    if [[ -s "$w/tarerr" ]]; then
      warnings="$(grep -c . "$w/tarerr" || true)"
      sed "s|^|[$id] |" "$w/tarerr" >> "$WARNLOG"
      LOG "warn $id: $warnings tar warning line(s)"
    fi
    read -r sha bytes < "$w/hash"
    write_filelist "$id" "$w"
    files_object="$(upload_filelist "$id" "$w")"
  fi

  local remote
  remote="$("$RCLONE" lsjson "r2:$BUCKET/$incoming" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["Size"])')"
  if [[ "$remote" != "$bytes" ]]; then LOG "FAIL $id: remote size $remote != streamed $bytes"; return 1; fi
  local old_sha prev_sha=""; old_sha="$(manifest_get "$id" sha256)"
  if [[ "$sha" == "$old_sha" ]] && robj_exists "$object"; then
    "$RCLONE" deletefile "r2:$BUCKET/$incoming"
    LOG "unchanged content $id: the bucket object and its previous version are left as they are"
  else
    swap_in "$object" "$sha" "$bytes" "$old_sha"
    robj_exists "${PREFIX}_prev/${object#"$PREFIX"}" && [[ -n "$old_sha" ]] && prev_sha="$old_sha"
  fi

  local needs=false
  [[ -n "$arch" && "$bytes" -lt 1048576 ]] && needs=true
  python3 -c '
import json, sys, datetime
a = sys.argv
print(json.dumps({"id": a[1], "object": a[2], "bytes": int(a[3]), "sha256": a[4], "root": a[5],
  "tier": a[6], "archivesPart": a[7] or None, "needsArchives": a[8] == "true",
  "sourceBytes": int(a[9]), "sourceFingerprint": a[10], "tarWarnings": int(a[11]),
  "filesObject": a[12] or None, "prevSha256": a[13] or None,
  "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")}))' \
    "$id" "$object" "$bytes" "$sha" "$root" "$tier" "$arch" "$needs" "$SRC_BYTES" "$SRC_FP" "$warnings" "$files_object" "$prev_sha" | manifest_put
  # On a tiered machine the files here are now bucket version $sha: record it
  # in the part's marker, as vault-pull does after a pull.
  if [[ -n "$MARKDIR" ]]; then
    if [[ "$kind" == "bundle" ]]; then MARKS="$MARKDIR" write_marker "$id" "$sha"
    else MARKS="$MARKDIR" write_marker "$id" "$sha" "$w/files"; fi
  fi
  LOG "done $id: $bytes bytes in $((SECONDS - t0)) s"
  rm -rf "$w"
}

# Write sourceFingerprint for parts already in the manifest, from the files
# here, without uploading. Only where sourceBytes here equals the manifest's
# (the files are the ones uploaded, as far as sizes tell); otherwise the field
# stays absent and the next normal run uploads the part.
backfill() {
  local id tier root kind arch w man_bytes n=0 miss=0
  while IFS=$'\t' read -r id tier root kind arch; do
    man_bytes="$(manifest_get "$id" sourceBytes)"
    [[ -n "$man_bytes" ]] || { LOG "backfill: $id is not in the manifest"; continue; }
    w="$WORK/bf"; rm -rf "$w"; mkdir -p "$w"
    prepare_part "$id" "$kind" "$w"
    if [[ "$SRC_BYTES" != "$man_bytes" ]]; then
      LOG "backfill: $id left without a fingerprint: sourceBytes here $SRC_BYTES, manifest $man_bytes"
      miss=$((miss + 1)); continue
    fi
    manifest_set "$id" sourceFingerprint "\"$SRC_FP\""
    n=$((n + 1))
  done < "$WORK/sel.tsv"
  while IFS= read -r id; do
    grep -q "^${id}	" "$WORK/catalogue.tsv" || LOG "backfill: manifest part $id has no files here"
  done < <(mf ids)
  LOG "backfill: $n part(s) fingerprinted, $miss left without"
}

# Upload the file-list sidecar of every selected tar part already in the
# manifest, from the files here, only where they match its sourceFingerprint
# (so the list is the uploaded tar's); then check the 3 smallest sidecars
# written against `tar -t` of the uploaded objects.
backfill_filelists() {
  local id tier root kind arch w man_fp obj n=0 miss=0
  : > "$WORK/written"
  while IFS=$'\t' read -r id tier root kind arch; do
    [[ "$kind" == "tar" ]] || continue
    man_fp="$(manifest_get "$id" sourceFingerprint)"
    [[ -n "$man_fp" ]] || { LOG "filelists: $id has no sourceFingerprint in the manifest; skipped"; miss=$((miss + 1)); continue; }
    w="$WORK/fl"; rm -rf "$w"; mkdir -p "$w"
    prepare_part "$id" "$kind" "$w"
    if [[ "$SRC_FP" != "$man_fp" ]]; then
      LOG "filelists: $id skipped: files here differ from the uploaded tar (sourceFingerprint)"; miss=$((miss + 1)); continue
    fi
    write_filelist "$id" "$w"
    obj="$(upload_filelist "$id" "$w")"
    manifest_set "$id" filesObject "\"$obj\""
    printf '%s\t%s\t%s\n' "$(manifest_get "$id" bytes)" "$id" "$(grep -c '' "$w/files")" >> "$WORK/written"
    n=$((n + 1))
  done < "$WORK/sel.tsv"
  LOG "filelists: $n sidecar(s) uploaded, $miss skipped"
  local bytes lines got bad=0
  while IFS=$'\t' read -r bytes id lines; do
    got="$("$RCLONE" cat "r2:$BUCKET/$(manifest_get "$id" object)" | tar -t --quoting-style=literal -f - | grep -c '')"
    if [[ "$got" == "$lines" ]]; then LOG "filelists: spot check $id ($bytes bytes): $lines lines = tar -t"
    else LOG "FAIL filelists: spot check $id: sidecar $lines lines, tar -t $got"; bad=1; fi
  done < <(sort -n "$WORK/written" | head -3)
  return "$bad"
}

# ---- main -------------------------------------------------------------------
FORCE=""; ALLOW_PARTIAL=""; ALLOW_SHRINK=""; LIST=""; FILES=""; DRY=""; BACKFILL=""; BACKFILL_FILES=""; ONLY=(); ONLY_FORCE=""
while (($#)); do
  case "$1" in
    --force) FORCE=1 ;;
    --allow-partial) ALLOW_PARTIAL=1 ;;
    --allow-shrink) ALLOW_SHRINK=1 ;;
    --list) LIST=1 ;;
    --files) FILES=1 ;;
    --dry-run) DRY=1 ;;
    --backfill-fingerprints) BACKFILL=1 ;;
    --backfill-filelists) BACKFILL_FILES=1 ;;
    --only) shift
      (($#)) && [[ "$1" != --* ]] || { echo "--only needs at least one part id" >&2; exit 1; }
      while (($#)) && [[ "$1" != --* ]]; do ONLY+=("$1"); shift; done; continue ;;
    -h|--help) sed -n '2,50p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

catalogue > "$WORK/catalogue.tsv"
if ((${#ONLY[@]})); then
  ONLY_FORCE=1   # naming a part re-uploads it even when its fingerprint is unchanged
  for o in "${ONLY[@]}"; do
    grep -q "^${o}	" "$WORK/catalogue.tsv" || { echo "unknown part id: $o" >&2; exit 2; }
  done
  awk -F'\t' 'NR==FNR{want[$1]=1; next} ($1 in want)' <(printf '%s\n' "${ONLY[@]}") "$WORK/catalogue.tsv" > "$WORK/sel.tsv"
else
  cp "$WORK/catalogue.tsv" "$WORK/sel.tsv"
fi

if [[ -n "$LIST" ]]; then
  while IFS=$'\t' read -r id tier root kind arch; do
    if [[ "$kind" == "bundle" ]]; then
      printf '%-60s %14s  %s\n' "$id" "(bundle)" "$tier"
    else
      rm -rf "$WORK/l"; mkdir -p "$WORK/l"
      prepare_part "$id" "$kind" "$WORK/l"
      printf '%-60s %14s  %s\n' "$id" "$SRC_BYTES" "$tier"
      if [[ -n "$FILES" ]]; then
        tar_args "$id" "$WORK/l"
        { tar "${TARGS[@]}" || [[ $? -eq 1 ]]; } | tar -tf - | sed 's/^/    /'   # tar 1 = a file changed while read
      fi
    fi
  done < "$WORK/sel.tsv"
  exit 0
fi

# An interrupted vault-pull leaves <marker>.inprogress: its part is half
# written here, so nothing is snapshotted until a pull of it completes.
if [[ -n "$MARKDIR" ]] && compgen -G "$MARKDIR/*.inprogress" >/dev/null; then
  LOG "refuse: interrupted vault-pull of: $(sed -n 's/^id=//p' "$MARKDIR"/*.inprogress | tr '\n' ' ')(re-run vault-pull.sh for them first)"
  exit 1
fi
if [[ -n "$BACKFILL" ]]; then backfill; exit 0; fi
if [[ -n "$BACKFILL_FILES" ]]; then backfill_filelists; exit $?; fi

[[ -n "$DRY" ]] || "$RCLONE" lsf "r2:$BUCKET" --max-depth 1 >/dev/null || { echo "cannot reach r2:$BUCKET" >&2; exit 1; }
[[ -n "$MARKDIR" ]] && LOG "tiered-restore machine ($MARKDIR): parts not fully restored here are skipped"
FAILS="$WORK/fails"; : > "$FAILS"
T0=$SECONDS
while IFS=$'\t' read -r id tier root kind arch; do
  while (( $(jobs -rp | wc -l) >= JOBS )); do wait -n || true; done
  # Not "upload_part || ...": that context would switch errexit off inside it.
  # shellcheck disable=SC2154  # rc is assigned inside the trap string
  ( trap 'rc=$?; ((rc)) && echo "$id" >> "$FAILS"; exit $rc' EXIT
    upload_part "$id" "$tier" "$root" "$kind" "$arch" ) &
done < "$WORK/sel.tsv"
wait || true
LOG "finished in $((SECONDS - T0)) s"
if [[ -s "$FAILS" ]]; then LOG "FAILED parts: $(tr '\n' ' ' < "$FAILS")"; exit 1; fi

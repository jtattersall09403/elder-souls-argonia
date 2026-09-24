# shellcheck shell=bash
# lib.sh: helpers shared by vault-pull.sh and snapshot-vault.sh (source it).
#
#   es_paths                 sets REPO, DEVROOT (ES_DEVROOT), MANIFEST
#                            (ES_SNAPSHOT_MANIFEST) and MARKS ($DEVROOT/.vault-pull)
#   mf <query> [arg...]      answers from the manifest, one value per line
#   marker <id>              the vault-pull marker file of a part
#   fingerprint [--only] <dir> [glob...]
#                            sha256 of the sorted "path<TAB>size<TAB>mtime-seconds"
#                            lines of every regular file under <dir> (paths
#                            relative to <dir>). A glob ending in "/" prunes that
#                            directory (a path relative to <dir>); any other glob
#                            is a case-insensitive file name that is excluded, or,
#                            with --only, the only names kept.
#   fingerprint_list <base> <nul-list>   the same over the files a list names
#   write_marker <id> <sha> [<list>]   record "the files here are bucket
#                            version <sha> of part <id>" (vault-pull after a
#                            pull, snapshot-vault after an upload)
#   part_fingerprint <dir> <mode> [nested-rel...]
#                            a part's share of its root: mode all | no-archives |
#                            archives-only; nested part roots and .git are pruned

ES_ARCHIVE_GLOBS=('*.zip' '*.7z' '*.rar')
# sha256 of no lines at all: a part with no files of its own under its root.
# shellcheck disable=SC2034  # read by the scripts that source this file
ES_EMPTY_FP="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

es_paths() {
  local here; here="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
  REPO="$(cd "$here/../.." && pwd)"
  DEVROOT="${ES_DEVROOT:-$(dirname "$REPO")}"
  MANIFEST="${ES_SNAPSHOT_MANIFEST:-$REPO/tooling/bootstrap/snapshot-manifest.json}"
  MARKS="$DEVROOT/.vault-pull"
}

marker() { echo "$MARKS/${1//\//__}.done"; }

# Fingerprint of the files a marker's .files sidecar lists (one per line,
# relative to the dev root).
marker_files_fp() { fingerprint_list "$DEVROOT" <(tr '\n' '\0' < "$1"); }

# The marker of a part: line 1 the part's sha256, line 2 the fingerprint of
# the files <list> names (the tar entry names, relative to the dev root;
# directories, ending "/", are dropped), which are copied to <marker>.files.
# Without a list (a bundle) line 2 is "-". Its mtime is the part's last use.
write_marker() {  # write_marker <id> <sha> [<list>]
  local mk fp="-"; mk="$(marker "$1")"
  mkdir -p "$MARKS"
  if [[ -n "${3:-}" ]]; then
    grep -v '/$' "$3" > "$mk.files.tmp" || true
    mv -f -- "$mk.files.tmp" "$mk.files"
    fp="$(marker_files_fp "$mk.files")"
  fi
  printf '%s\n%s\n' "$2" "$fp" > "$mk"
}

# Queries: bucket | ids | tier-ids <tier> | same-root <root> | nested-rel <root>
# (roots strictly under <root>, relative to it) | field <id> <name> (empty when
# absent, also when the manifest does not exist yet) | get <id> (object, bytes,
# sha256, root, tier, archivesPart, needsArchives split by \x1f; exit 3 if unknown).
mf() {
  python3 - "$MANIFEST" "$@" <<'PY'
import json, os, sys
path, q, args = sys.argv[1], sys.argv[2], sys.argv[3:]
if not os.path.exists(path):
    sys.exit(0 if q == "field" else f"manifest not found: {path}")
m = json.load(open(path))
if m.get("schemaVersion") != 1:
    sys.exit(f"unsupported manifest schemaVersion {m.get('schemaVersion')}")
parts = {p["id"]: p for p in m["parts"]}
def lines(xs):  # one per line; nothing at all (not an empty line) for no values
    for x in xs:
        print(x)
if q == "bucket":
    print(m["bucket"])
elif q == "prefix":
    print(m.get("prefix", ""))
elif q == "ids":
    lines(parts)
elif q == "tier-ids":
    lines(i for i, p in parts.items() if p["tier"] == args[0])
elif q == "same-root":
    lines(i for i, p in parts.items() if p["root"] == args[0])
elif q == "nested-rel":
    pre = args[0].rstrip("/") + "/"
    lines(sorted({p["root"][len(pre):] for p in parts.values() if p["root"].startswith(pre)}))
elif q == "field":
    v = parts.get(args[0], {}).get(args[1])
    if v is not None:
        print(v)
elif q == "get":
    p = parts.get(args[0])
    if p is None:
        sys.exit(3)
    print("\x1f".join(str(v) for v in (
        p["object"], p["bytes"], p["sha256"], p["root"], p["tier"],
        p.get("archivesPart") or "", "1" if p.get("needsArchives") else "0")))
else:
    sys.exit(f"unknown manifest query {q}")
PY
}

fp_hash() { LC_ALL=C sort | sha256sum | cut -d' ' -f1; }

fingerprint() {
  local only=""; if [[ "${1:-}" == --only ]]; then only=1; shift; fi
  local dir="$1"; shift
  [[ -d "$dir" ]] || { echo "fingerprint: no directory $dir" >&2; return 1; }
  local prune=() names=() expr=() g
  for g in "$@"; do
    if [[ "$g" == */ ]]; then prune+=(-o -path "./${g%/}"); else names+=(-o -iname "$g"); fi
  done
  ((${#prune[@]})) && expr+=( \( "${prune[@]:1}" \) -prune -o )
  expr+=(-type f)
  if ((${#names[@]})); then
    if [[ -n "$only" ]]; then expr+=( \( "${names[@]:1}" \) ); else expr+=( -not \( "${names[@]:1}" \) ); fi
  elif [[ -n "$only" ]]; then
    echo "fingerprint --only needs a name glob" >&2; return 2
  fi
  (cd "$dir" && find . "${expr[@]}" -printf '%P\t%s\t%T@\n') | sed -E 's/\.[0-9]+$//' | fp_hash
}

# Lines for the regular files a NUL list names (relative to <base>); a listed
# path that vanished is left out.
fp_lines_list() {
  (cd "$1" && xargs -0 -r sh -c 'find "$@" -maxdepth 0 -type f -printf "%p\t%s\t%T@\n" 2>/dev/null; exit 0' sh < "$2") \
    | sed -E 's/\.[0-9]+$//'
}
fingerprint_list() { fp_lines_list "$1" "$2" | fp_hash; }

part_mode() {  # part_mode <id> <archivesPart or empty>
  if [[ "$1" == *.archives ]]; then echo archives-only
  elif [[ -n "$2" ]]; then echo no-archives
  else echo all; fi
}

part_fingerprint() {
  local dir="$1" mode="$2"; shift 2
  local ex=(.git/) n
  for n in "$@"; do [[ -n "$n" ]] && ex+=("$(printf '%s' "$n" | sed 's/[][*?\\]/\\&/g')/"); done
  case "$mode" in
    all) fingerprint "$dir" "${ex[@]}" ;;
    no-archives) fingerprint "$dir" "${ex[@]}" "${ES_ARCHIVE_GLOBS[@]}" ;;
    archives-only) fingerprint --only "$dir" "${ex[@]}" "${ES_ARCHIVE_GLOBS[@]}" ;;
    *) echo "part_fingerprint: unknown mode $mode" >&2; return 2 ;;
  esac
}

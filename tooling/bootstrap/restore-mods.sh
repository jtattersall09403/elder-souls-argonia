#!/usr/bin/env bash
# Re-download lost mod archives from Nexus, by register id, and verify them.
#
#   tooling/bootstrap/restore-mods.sh <id...>
#
# Reads tooling/asset-pipeline/mod-register.json. For every archive of each
# named entry that carries a Nexus fileId, asks the Nexus API for a download
# link (a premium key gets direct links), downloads to the archive's recorded
# path under the dev root, and checks the recorded sha256. A mismatch deletes
# the download and exits non-zero. An archive already present with the right
# hash is skipped. Rows without a fileId (ModDB, CC0 packs, UESP) fail loudly
# with the register's reason: they come back only from the vault snapshot.
#
# Fallback only: the normal restore is the R2 snapshot (vault-pull.sh).
#
# Environment:
#   ES_DEVROOT      dev root (default: the parent of this repo checkout)
#   NEXUS_API_KEY   Nexus API key (default: ~/.config/nexus/api_key)
#   ES_MOD_REGISTER register path (default: the tracked one; for tests)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
register="${ES_MOD_REGISTER:-$repo/tooling/asset-pipeline/mod-register.json}"
devroot="${ES_DEVROOT:-$(dirname "$repo")}"

[ "$#" -gt 0 ] || { echo "usage: $0 <register id...>" >&2; exit 2; }
# shellcheck disable=SC2015  # the || branch is meant to run when any check fails
command -v python3 >/dev/null && command -v curl >/dev/null && command -v sha256sum >/dev/null \
  || { echo "restore-mods: needs python3, curl and sha256sum" >&2; exit 2; }

key="${NEXUS_API_KEY:-}"
if [ -z "$key" ] && [ -r "$HOME/.config/nexus/api_key" ]; then
  key="$(tr -d '[:space:]' < "$HOME/.config/nexus/api_key")"
fi
[ -n "$key" ] || { echo "restore-mods: no Nexus key (set NEXUS_API_KEY or ~/.config/nexus/api_key)" >&2; exit 2; }

# The key goes to curl on stdin as a header, never on a command line or in a log.
nexus_get() { printf 'apikey: %s\n' "$key" | curl -fsS --retry 3 -H @- -A 'elder-souls-argonia-restore-mods/1' "$1"; }

# One tab-separated line per archive to fetch; an ERROR line for rows that cannot be fetched.
plan="$(python3 - "$register" "$@" <<'PY'
import json, sys
reg = json.load(open(sys.argv[1]))
assert reg.get("schemaVersion") == 1, "mod-register schemaVersion is not 1"
rows = {e["id"]: e for e in reg["entries"]}
for want in sys.argv[2:]:
    e = rows.get(want)
    if e is None:
        print(f"ERROR\t{want}\tnot in the register"); continue
    todo = [a for a in e["archives"] if a.get("fileId")]
    if e["source"] != "nexus" or not todo:
        print(f"ERROR\t{want}\tno Nexus fileId: {e.get('fileIdUnknown', 'no archives recorded')}"); continue
    for a in todo:
        print("\t".join(["GET", want, e["game"], str(e["modId"]), str(a["fileId"]), a["sha256"], str(a["bytes"]), a["path"]]))
PY
)"

status=0
while IFS=$'\t' read -r kind id game mod file sha bytes path; do
  if [ "$kind" = ERROR ]; then
    echo "restore-mods: FAIL $id: $game" >&2; status=1; continue
  fi
  dest="$devroot/$path"
  if [ -f "$dest" ] && [ "$(sha256sum "$dest" | cut -d' ' -f1)" = "$sha" ]; then
    echo "restore-mods: ok (present) $id: $path"; continue
  fi
  mkdir -p "$devroot"
  avail=$(df -PB1 "$devroot" | awk 'NR==2{print $4}')
  if [ "$avail" -lt $((bytes + 1073741824)) ]; then
    echo "restore-mods: FAIL $id: $bytes bytes needed plus 1 GiB headroom, $avail free" >&2; status=1; continue
  fi
  url="$(nexus_get "https://api.nexusmods.com/v1/games/$game/mods/$mod/files/$file/download_link.json" \
        | python3 -c 'import json,sys,urllib.parse as u; d=json.load(sys.stdin); print(u.quote(d[0]["URI"], safe=":/?&=%#+~,;@!$*()") if d else "")')" || url=""
  [ -n "$url" ] || { echo "restore-mods: FAIL $id: Nexus returned no download link for file $file" >&2; status=1; continue; }
  mkdir -p "$(dirname "$dest")"
  part="$dest.part"
  if ! curl -fsSL --retry 3 -o "$part" "$url"; then
    rm -f "$part"; echo "restore-mods: FAIL $id: download of $path failed" >&2; status=1; continue
  fi
  got="$(sha256sum "$part" | cut -d' ' -f1)"
  if [ "$got" != "$sha" ]; then
    rm -f "$part"
    echo "restore-mods: FAIL $id: sha256 mismatch for $path (expected $sha, got $got)" >&2; status=1; continue
  fi
  mv "$part" "$dest"
  echo "restore-mods: ok (downloaded, sha256 verified) $id: $path"
done <<< "$plan"
exit "$status"
